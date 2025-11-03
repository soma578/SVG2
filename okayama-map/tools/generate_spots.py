#!/usr/bin/env python3
"""Generate okayama-spots.svg from CSV data."""

from __future__ import annotations

import csv
from pathlib import Path
from xml.sax.saxutils import escape


SCALE = 100.0


ICON_DEFS = {
    "castle": {
        "id": "castle",
        "href": "/tutorials/tutorial1/img/mappin1.png",
        "x": -8,
        "y": -25,
        "width": 19,
        "height": 27,
    },
    "garden": {
        "id": "garden",
        "href": "/tutorials/tutorial1/img/mappin2.png",
        "x": -8,
        "y": -25,
        "width": 19,
        "height": 27,
    },
    "tourist": {
        "id": "tourist",
        "href": "/tutorials/tutorial1/img/mappin3.png",
        "x": -5.6,
        "y": -17.5,
        "width": 13.3,
        "height": 18.9,
    },
    "shrine": {
        "id": "shrine",
        "href": "/tutorials/tutorial1/img/mappin4.png",
        "x": -8,
        "y": -25,
        "width": 19,
        "height": 27,
    },
    "bridge": {
        "id": "bridge",
        "href": "/tutorials/tutorial1/img/mappin5.png",
        "x": -8,
        "y": -25,
        "width": 19,
        "height": 27,
    },
}


def format_coord(value: float, invert: bool = False) -> str:
    scaled = value * SCALE
    if invert:
        scaled *= -1
    return f"{scaled:.2f}"


def build_defs(used_kinds: list[str]) -> str:
    parts = []
    for kind in used_kinds:
        icon = ICON_DEFS[kind]
        parts.append(
            "    <g id=\"{id}\">\n"
            "      <image xlink:href=\"{href}\" preserveAspectRatio=\"none\" x=\"{x}\" y=\"{y}\" width=\"{width}\" height=\"{height}\"/>\n"
            "    </g>".format(**icon)
        )
    return "\n".join(parts)


def build_use(row: dict[str, str]) -> str:
    name = row["name"].strip()
    kind = row["kind"].strip()
    lon = float(row["lon"])
    lat = float(row["lat"])
    url = row["url"].strip()
    summary = row.get("summary", "").strip()

    if kind not in ICON_DEFS:
        raise ValueError(f"Unknown kind '{kind}' in row for {name}")

    lon_ref = format_coord(lon)
    lat_ref = format_coord(lat, invert=True)

    content_parts = [name] + ([summary] if summary else [])
    content_text = ",".join(content_parts)

    return (
        f'  <a xlink:href="{escape(url)}" target="_blank">\n'
        f'    <use transform="ref(svg,{lon_ref},{lat_ref})" x="0" y="0" xlink:href="#{ICON_DEFS[kind]["id"]}" '
        f'content="{escape(content_text)}" xlink:title="{escape(name)}"/>\n'
        "  </a>"
    )


def main() -> None:
    tools_dir = Path(__file__).resolve().parent
    base_dir = tools_dir.parent
    data_path = base_dir / "data" / "okayama_spots.csv"
    output_path = base_dir / "okayama-spots.svg"

    if not data_path.exists():
        raise FileNotFoundError(f"CSV file not found: {data_path}")

    with data_path.open(encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
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
        raise ValueError("No spot rows found in CSV.")

    padding_deg = 0.05
    min_lon_deg = min(lon_values) - padding_deg
    max_lon_deg = max(lon_values) + padding_deg
    min_lat_deg = min(lat_values) - padding_deg
    max_lat_deg = max(lat_values) + padding_deg

    view_width = (max_lon_deg - min_lon_deg) * SCALE
    view_height = (max_lat_deg - min_lat_deg) * SCALE
    if view_width <= 0 or view_height <= 0:
        raise ValueError("Invalid bounding box for spots.")

    view_origin_x = min_lon_deg * SCALE
    view_origin_y = -max_lat_deg * SCALE

    used_kinds: list[str] = []
    for row in rows:
        kind = row["kind"].strip()
        if kind not in ICON_DEFS:
            raise ValueError(f"Unknown kind '{kind}' in CSV")
        if kind not in used_kinds:
            used_kinds.append(kind)

    defs_block = build_defs(used_kinds)
    uses_block = "\n".join(build_use(row) for row in rows)

    svg_output = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="{view_origin_x:.2f} {view_origin_y:.2f} {view_width:.2f} {view_height:.2f}">
  <globalCoordinateSystem srsName="http://purl.org/crs/84" transform="matrix({SCALE},0,0,-{SCALE},0,0)" />

  <defs>
{defs_block}
  </defs>

{uses_block}
</svg>
"""

    output_path.write_text(svg_output, encoding="utf-8")
    print(f"Wrote {output_path.relative_to(base_dir)}")
    print(
        "[info] Suggested Container.svg viewBox:",
        f"{view_origin_x:.2f} {view_origin_y:.2f} {view_width:.2f} {view_height:.2f}",
    )


if __name__ == "__main__":
    main()
