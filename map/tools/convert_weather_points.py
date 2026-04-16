#!/usr/bin/env python3
"""Convert map/data/weather_points.csv to frontend/public/data/weather-points.json."""

from __future__ import annotations

import csv
import json
from pathlib import Path


def main() -> int:
  repo_root = Path(__file__).resolve().parents[2]
  source = repo_root / "map" / "data" / "weather_points.csv"
  output = repo_root / "frontend" / "public" / "data" / "weather-points.json"

  if not source.exists():
    raise FileNotFoundError(f"Input CSV not found: {source}")

  rows: list[dict[str, object]] = []
  with source.open("r", encoding="utf-8", newline="") as fp:
    reader = csv.DictReader(fp)
    for row in reader:
      name = (row.get("name") or "").strip()
      lon_raw = (row.get("lon") or "").strip()
      lat_raw = (row.get("lat") or "").strip()
      if not name or not lon_raw or not lat_raw:
        continue
      try:
        lon = float(lon_raw)
        lat = float(lat_raw)
      except ValueError:
        continue
      rows.append({
        "name": name,
        "lon": lon,
        "lat": lat,
      })

  output.parent.mkdir(parents=True, exist_ok=True)
  with output.open("w", encoding="utf-8") as fp:
    json.dump(rows, fp, ensure_ascii=False, indent=2)
    fp.write("\n")

  print(f"Wrote {len(rows)} points to {output}")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
