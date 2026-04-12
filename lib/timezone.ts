const PARTS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(timeZone: string) {
  const cached = PARTS_FORMATTER_CACHE.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  PARTS_FORMATTER_CACHE.set(timeZone, formatter);
  return formatter;
}

function getZonedParts(date: Date, timeZone: string) {
  const parts = getPartsFormatter(timeZone).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

export function zonedDateTimeToUtcIso(dateInput: string, timeInput: string, timeZone: string) {
  const [year, month, day] = dateInput.split('-').map(Number);
  const [hour, minute, second] = timeInput.split(':').map(Number);

  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const target = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let i = 0; i < 5; i += 1) {
    const zoned = getZonedParts(new Date(guess), timeZone);
    const observed = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second,
    );

    const delta = target - observed;
    guess += delta;

    if (delta === 0) break;
  }

  return new Date(guess).toISOString();
}

export function getLocalDayBoundsUtc(dateInput: string, timeZone: string) {
  return {
    start: zonedDateTimeToUtcIso(dateInput, '00:00:00', timeZone),
    end: zonedDateTimeToUtcIso(dateInput, '23:59:59', timeZone),
  };
}
