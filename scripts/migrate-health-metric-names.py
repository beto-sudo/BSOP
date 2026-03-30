#!/usr/bin/env python3
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict

SUPABASE_URL = "https://ybklderteyhuugzfmxbi.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "***REDACTED_SERVICE_ROLE_KEY***"
TABLE = "health_metrics"
PAGE_SIZE = 1000

METRIC_NAME_MAP = {
    "resting_heart_rate": "Resting Heart Rate",
    "heart_rate_variability": "Heart Rate Variability",
    "blood_oxygen_saturation": "Oxygen Saturation",
    "step_count": "Step Count",
    "apple_exercise_time": "Apple Exercise Time",
    "weight_body_mass": "Body Mass",
    "heart_rate": "Heart Rate",
    "active_energy": "Active Energy",
    "basal_energy_burned": "Basal Energy Burned",
    "walking_heart_rate_average": "Walking Heart Rate Average",
    "respiratory_rate": "Respiratory Rate",
    "vo2_max": "VO2 Max",
    "body_fat_percentage": "Body Fat Percentage",
    "body_mass_index": "Body Mass Index",
    "flights_climbed": "Flights Climbed",
    "walking_running_distance": "Walking Running Distance",
    "walking_speed": "Walking Speed",
    "walking_step_length": "Walking Step Length",
    "walking_asymmetry_percentage": "Walking Asymmetry Percentage",
    "walking_double_support_percentage": "Walking Double Support Percentage",
    "stair_speed_up": "Stair Speed Up",
    "stair_speed_down": "Stair Speed Down",
    "cycling_distance": "Cycling Distance",
    "environmental_audio_exposure": "Environmental Audio Exposure",
    "headphone_audio_exposure": "Headphone Audio Exposure",
    "apple_stand_hour": "Apple Stand Hour",
    "apple_stand_time": "Apple Stand Time",
    "apple_sleeping_wrist_temperature": "Apple Sleeping Wrist Temperature",
    "time_in_daylight": "Time In Daylight",
    "physical_effort": "Physical Effort",
    "dietary_water": "Dietary Water",
    "mindful_minutes": "Mindful Minutes",
    "six_minute_walking_test_distance": "Six Minute Walking Test Distance",
    "breathing_disturbances": "Breathing Disturbances",
    "height": "Height",
    "test": "test",
}


def request(method: str, path: str, *, params=None, body=None, headers=None):
    url = f"{SUPABASE_URL}{path}"
    if params:
        url = f"{url}?{urllib.parse.urlencode(params, doseq=True)}"
    req = urllib.request.Request(url, method=method)
    req.add_header("apikey", SUPABASE_SERVICE_ROLE_KEY)
    req.add_header("Authorization", f"Bearer {SUPABASE_SERVICE_ROLE_KEY}")
    if headers:
        for key, value in headers.items():
            req.add_header(key, value)

    payload = None
    if body is not None:
        payload = json.dumps(body).encode("utf-8")
        req.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(req, data=payload) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, raw, dict(resp.headers)
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {err.code} for {method} {url}: {raw}") from err


def fetch_rows(metric_name: str):
    rows = []
    offset = 0
    while True:
        status, raw, _headers = request(
            "GET",
            f"/rest/v1/{TABLE}",
            params={
                "select": "id,date,source,metric_name",
                "metric_name": f"eq.{metric_name}",
                "order": "id.asc",
                "limit": str(PAGE_SIZE),
                "offset": str(offset),
            },
            headers={"Accept": "application/json"},
        )
        if status != 200:
            raise RuntimeError(f"Unexpected status {status} while fetching {metric_name}")
        batch = json.loads(raw)
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def delete_ids(ids):
    if not ids:
        return 0
    count = 0
    for start in range(0, len(ids), PAGE_SIZE):
        chunk = ids[start:start + PAGE_SIZE]
        status, raw, _headers = request(
            "DELETE",
            f"/rest/v1/{TABLE}",
            params={"id": f"in.({','.join(str(i) for i in chunk)})"},
            headers={"Prefer": "return=representation"},
        )
        if status not in (200, 204):
            raise RuntimeError(f"Unexpected delete status {status}: {raw}")
        count += len(chunk)
    return count


def patch_metric_name(old_name: str, new_name: str):
    status, raw, _headers = request(
        "PATCH",
        f"/rest/v1/{TABLE}",
        params={"metric_name": f"eq.{old_name}"},
        body={"metric_name": new_name},
        headers={"Prefer": "return=representation"},
    )
    if status not in (200, 204):
        raise RuntimeError(f"Unexpected patch status {status}: {raw}")
    return len(json.loads(raw)) if raw else 0


def main():
    print(f"Migrating metric names in {TABLE} ...")
    summary = []

    for old_name, new_name in METRIC_NAME_MAP.items():
        snake_rows = fetch_rows(old_name)
        title_rows = fetch_rows(new_name)
        title_keys = {(row["date"], row.get("source")) for row in title_rows}
        duplicate_ids = [row["id"] for row in snake_rows if (row["date"], row.get("source")) in title_keys]

        deleted = delete_ids(duplicate_ids)
        remaining_snake = len(snake_rows) - deleted
        updated = 0

        if remaining_snake:
            updated = patch_metric_name(old_name, new_name)

        summary.append({
            "from": old_name,
            "to": new_name,
            "snake_rows": len(snake_rows),
            "title_rows": len(title_rows),
            "deleted_duplicates": deleted,
            "updated": updated,
        })
        print(f"{old_name} -> {new_name}: snake={len(snake_rows)} title={len(title_rows)} deleted={deleted} updated={updated}")

    remaining_snake_counts = defaultdict(int)
    for old_name in METRIC_NAME_MAP:
        remaining_snake_counts[old_name] = len(fetch_rows(old_name))

    leftovers = {name: count for name, count in remaining_snake_counts.items() if count}
    print("\nMigration summary:")
    print(json.dumps(summary, indent=2))
    if leftovers:
        print("\nLeftover snake_case rows detected:")
        print(json.dumps(leftovers, indent=2))
        sys.exit(1)

    print("\nDone. No snake_case rows remain for mapped metrics.")


if __name__ == "__main__":
    main()
