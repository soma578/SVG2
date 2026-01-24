#!/usr/bin/env python3
"""Fetch current weather and generate hazard_flood_okayama.svg overlay."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from typing import Dict, Tuple
from urllib.error import URLError
from urllib.request import urlopen
from xml.sax.saxutils import escape


SCALE = 100.0


WEATHER_SYMBOLS: Dict[str, str] = {
    "clear": (
        '<g id="weather-clear">'
        '<circle cx="0" cy="-14" r="8" fill="#facc15" stroke="#f59e0b" stroke-width="1"/>'
        '</g>'
    ),
    "partly": (
        '<g id="weather-partly">'
        '<circle cx="-3" cy="-14" r="7" fill="#facc15" stroke="#f59e0b" stroke-width="1"/>'
        '<ellipse cx="4" cy="-11" rx="7" ry="5" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1"/>'
        '</g>'
    ),
    "cloudy": (
        '<g id="weather-cloudy">'
        '<ellipse cx="0" cy="-10" rx="9" ry="6" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1"/>'
        '<ellipse cx="-6" cy="-12" rx="7" ry="5" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1"/>'
        '<ellipse cx="6" cy="-12" rx="7" ry="5" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1"/>'
        '</g>'
    ),
    "rain": (
        '<g id="weather-rain">'
        '<ellipse cx="0" cy="-10" rx="9" ry="6" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1"/>'
        '<ellipse cx="-6" cy="-12" rx="7" ry="5" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1"/>'
        '<ellipse cx="6" cy="-12" rx="7" ry="5" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1"/>'
        '<line x1="-6" y1="-4" x2="-6" y2="2" stroke="#60a5fa" stroke-width="1.2"/>'
        '<line x1="0" y1="-4" x2="0" y2="2" stroke="#60a5fa" stroke-width="1.2"/>'
        '<line x1="6" y1="-4" x2="6" y2="2" stroke="#60a5fa" stroke-width="1.2"/>'
        '</g>'
    ),
    "snow": (
        '<g id="weather-snow">'
        '<ellipse cx="0" cy="-10" rx="9" ry="6" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1"/>'
        '<ellipse cx="-6" cy="-12" rx="7" ry="5" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1"/>'
        '<ellipse cx="6" cy="-12" rx="7" ry="5" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1"/>'
        '<text x="-6" y="-1" font-size="4" text-anchor="middle" fill="#60a5fa">*</text>'
        '<text x="0" y="-1" font-size="4" text-anchor="middle" fill="#60a5fa">*</text>'
        '<text x="6" y="-1" font-size="4" text-anchor="middle" fill="#60a5fa">*</text>'
        '</g>'
    ),
    "storm": (
        '<g id="weather-storm">'
        '<ellipse cx="0" cy="-10" rx="9" ry="6" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1"/>'
        '<ellipse cx="-6" cy="-12" rx="7" ry="5" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1"/>'
        '<ellipse cx="6" cy="-12" rx="7" ry="5" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1"/>'
        '<polygon points="-4,-2 2,-2 -3,4 3,4" fill="#fbbf24" stroke="#f59e0b" stroke-width="1"/>'
        '</g>'
    ),
    "fog": (
        '<g id="weather-fog">'
        '<rect x="-10" y="-14" width="20" height="8" rx="4" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1"/>'
        '<rect x="-10" y="-6" width="20" height="4" rx="2" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1"/>'
        '</g>'
    ),
    "error": (
        '<g id="weather-error">'
        '<circle cx="0" cy="-10" r="8" fill="#fecaca" stroke="#f87171" stroke-width="1"/>'
        '<text x="0" y="-7" font-size="6" text-anchor="middle" fill="#b91c1c">!</text>'
        '</g>'
    ),
}


WEATHER_LABELS: Dict[str, str] = {
    "clear": "快晴",
    "partly": "晴れ時々くもり",
    "cloudy": "くもり",
    "rain": "雨",
    "snow": "雪",
    "storm": "雷雨",
    "fog": "霧",
    "error": "取得エラー",
}


def classify_weather(code: int) -> str:
    if code == 0:
        return "clear"
    if code in (1, 2):
        return "partly"
    if code == 3:
        return "cloudy"
    if code in (45, 48):
        return "fog"
    if code in (51, 53, 55, 61, 63, 65, 80, 81, 82):
        return "rain"
    if code in (56, 57, 66, 67):
        return "rain"
    if code in (71, 73, 75, 77, 85, 86):
        return "snow"
    if code in (95, 96, 99):
        return "storm"
    return "cloudy"


def format_coord(value: float, invert: bool = False) -> str:
    scaled = value * SCALE
    if invert:
        scaled *= -1
    return f"{scaled:.2f}"


def fetch_current_weather(lat: float, lon: float) -> Tuple[float | None, float | None, int | None]:
    url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true"
    try:
        with urlopen(url, timeout=10) as response:
            data = json.load(response)
    except URLError as exc:
        print(f"[warn] 気象データの取得に失敗しました: {exc}", file=sys.stderr)
        return None, None, None

    current = data.get("current_weather")
    if not current:
        return None, None, None

    temperature = current.get("temperature")
    windspeed = current.get("windspeed")
    weathercode = current.get("weathercode")

    return temperature, windspeed, weathercode


def build_entry(row: dict[str, str]) -> Tuple[str, str]:
    name = row["name"].strip()
    lon = float(row["lon"])
    lat = float(row["lat"])

    temp, wind, code = fetch_current_weather(lat, lon)
    if code is None:
        symbol_key = "error"
    else:
        symbol_key = classify_weather(int(code))

    temp_text = "--°C" if temp is None else f"{temp:.1f}°C"
    wind_text = "" if wind is None else f"風 {wind:.1f}m/s"
    label = WEATHER_LABELS[symbol_key]

    lon_ref = format_coord(lon)
    lat_ref = format_coord(lat, invert=True)

    description = label if not wind_text else f"{label} / {wind_text}"

    entry = (
        f'  <g transform="ref(svg,{lon_ref},{lat_ref})">\n'
        f'    <use x="0" y="0" xlink:href="#weather-{symbol_key}"/>\n'
        f'    <rect x="-16" y="-4" width="32" height="16" rx="4" fill="#ffffff" fill-opacity="0.85" stroke="#94a3b8" stroke-width="0.6"/>\n'
        f'    <text x="0" y="2" font-size="4" text-anchor="middle" fill="#0f172a">{escape(temp_text)}</text>\n'
        f'    <text x="0" y="7" font-size="3" text-anchor="middle" fill="#334155">{escape(description)}</text>\n'
        f'    <text x="0" y="12" font-size="3" text-anchor="middle" fill="#64748b">{escape(name)}</text>\n'
        "  </g>"
    )
    return symbol_key, entry


def main() -> None:
    tools_dir = Path(__file__).resolve().parent
    base_dir = tools_dir.parent
    data_path = base_dir / "data" / "weather_points.csv"
    output_path = base_dir / "layers" / "hazard_flood_okayama.svg"

    if not data_path.exists():
        raise FileNotFoundError(f"weather_points.csv が見つかりません: {data_path}")

    with data_path.open(encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        rows: list[dict[str, str]] = []
        lon_values: list[float] = []
        lat_values: list[float] = []
        for row in reader:
            name = row.get("name", "").strip()
            if not name:
                continue
            try:
                lon_val = float(row["lon"])
                lat_val = float(row["lat"])
            except (TypeError, ValueError) as exc:
                raise ValueError(f"Invalid lon/lat in row for '{name or 'unknown'}'") from exc
            rows.append(row)
            lon_values.append(lon_val)
            lat_values.append(lat_val)

    if not rows:
        raise ValueError("weather_points.csv に地点が登録されていません。")

    padding_deg = 0.05
    min_lon_deg = min(lon_values) - padding_deg
    max_lon_deg = max(lon_values) + padding_deg
    min_lat_deg = min(lat_values) - padding_deg
    max_lat_deg = max(lat_values) + padding_deg

    lon_span = max_lon_deg - min_lon_deg
    lat_span = max_lat_deg - min_lat_deg
    if lon_span <= 0 or lat_span <= 0:
        raise ValueError("Invalid bounding box for weather points.")

    view_origin_x = min_lon_deg * SCALE
    view_origin_y = -max_lat_deg * SCALE
    view_width = lon_span * SCALE
    view_height = lat_span * SCALE

    used_symbols: dict[str, str] = {}
    entries: list[str] = []

    for row in rows:
        symbol_key, entry = build_entry(row)
        used_symbols[symbol_key] = WEATHER_SYMBOLS[symbol_key]
        entries.append(entry)

    defs_block = "\n".join(
        f"    {symbol}\n" for symbol in used_symbols.values()
    )
    entries_block = "\n".join(entries)

    svg_output = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="{view_origin_x:.2f} {view_origin_y:.2f} {view_width:.2f} {view_height:.2f}">
  <globalCoordinateSystem srsName="http://purl.org/crs/84" transform="matrix({SCALE},0,0,-{SCALE},0,0)" />

  <defs>
{defs_block}
  </defs>

{entries_block}
</svg>
"""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(svg_output, encoding="utf-8")
    print(f"Wrote {output_path.relative_to(base_dir)}")
    print(
        "[info] Weather layer viewBox:",
        f"{view_origin_x:.2f} {view_origin_y:.2f} {view_width:.2f} {view_height:.2f}",
    )


if __name__ == "__main__":
    main()
