"use client";

import { useEffect, useState } from "react";

type VersionInfo = {
  sha: string;
  msg?: string;
  branch?: string;
  buildAt: string;
};

export default function BuildStamp() {
  const [v, setV] = useState<VersionInfo | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/version")
      .then((r) => r.json())
      .then((json) => { if (alive) setV(json); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!v) return null;

  return (
    <div className="mt-6 select-none text-xs text-neutral-500">
      build: <span className="font-mono">{v.sha?.slice(0, 7)}</span>
      {" "}
      ({v.branch || "?"}) · {new Date(v.buildAt).toLocaleString()}
      {" "}
      · {process.env.NODE_ENV}
    </div>
  );
}
