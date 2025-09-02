"use client";
import { useEffect, useState } from "react";

export default function BuildStamp() {
  const [v, setV] = useState<any>(null);
  useEffect(() => {
    fetch("/api/version").then(r => r.json()).then(setV).catch(() => {});
  }, []);
  if (!v) return null;
  return (
    <div style={{opacity:.5,fontSize:12,marginTop:16}}>
      build: {v.sha?.slice(0,7)} ({v.branch}) · {new Date(v.buildAt).toLocaleString()}
    </div>
  );
}
