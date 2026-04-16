#!/usr/bin/env python3
"""Generate momochari_points.svg from momochari_with_rank.json."""

from __future__ import annotations

import json
import re
from pathlib import Path
from xml.sax.saxutils import escape


SCALE = 100.0


RANK_COLORS = {
    0: "#22c55e",
    1: "#facc15",
    2: "#f97316",
    3: "#ef4444",
}


def read_viewbox(svg_path: Path) -> str:
    text = svg_path.read_text(encoding="utf-8")
    match = re.search(r'viewBox="([^"]+)"', text)
    if not match:
        raise ValueError(f"viewBox not found in {svg_path}")
    return match.group(1)


def clean_text(text: str) -> str:
    cleaned = re.sub(r"<br\s*/?>", " ", text or "", flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def format_coord(value: float, invert: bool = False) -> str:
    scaled = value * SCALE
    if invert:
        scaled *= -1
    return f"{scaled:.2f}"


def build_defs() -> str:
    parts = []
    for rank, color in sorted(RANK_COLORS.items()):
        parts.append(
            "    <g id=\"momochari-r{rank}\">\n"
            "      <circle cx=\"0\" cy=\"0\" r=\"5\" fill=\"{color}\" stroke=\"#0f172a\" stroke-width=\"1\" />\n"
            "    </g>".format(rank=rank, color=color)
        )
    parts.append(
        "    <g id=\"momochari-rx\">\n"
        "      <circle cx=\"0\" cy=\"0\" r=\"5\" fill=\"#94a3b8\" stroke=\"#0f172a\" stroke-width=\"1\" />\n"
        "    </g>"
    )
    return "\n".join(parts)


def build_use(entry: dict[str, object]) -> str:
    name = clean_text(str(entry.get("id", "")))
    address = clean_text(str(entry.get("address", "")))
    rank_raw = entry.get("floodRank", 0)
    try:
        rank = int(rank_raw)
    except (TypeError, ValueError):
        rank = 0
    lon = float(entry["lon"])
    lat = float(entry["lat"])

    lon_ref = format_coord(lon)
    lat_ref = format_coord(lat, invert=True)

    summary_parts = [address] if address else []
    summary_parts.append(f"浸水ランク:{rank}")
    summary = ", ".join(filter(None, summary_parts))
    description = f"浸水ランク:{rank}"

    content_parts = [name] + ([summary] if summary else [])
    content_text = ",".join(part for part in content_parts if part)

    symbol_id = f"momochari-r{rank}" if rank in RANK_COLORS else "momochari-rx"
    feature_payload = {
        "id": f"momochari:{name}",
        "layerId": "momochari",
        "kind": "poi",
        "title": name or "ももちゃりポート",
        "subtitle": "シェアサイクルポート",
        "category": "momochari",
        "summary": summary,
        "description": description,
        "address": address,
        "lat": lat,
        "lon": lon,
        "source": "momochari_with_rank.json",
    }
    data_feature = escape(
        json.dumps(feature_payload, ensure_ascii=False, separators=(",", ":")),
        {'"': "&quot;"},
    )

    title = escape(feature_payload["title"])
    escaped_summary = escape(summary)
    escaped_description = escape(description)
    escaped_address = escape(address)
    escaped_feature_id = escape(feature_payload["id"])

    return (
        "  <a xlink:href=\"#\" data-kind=\"poi\">\n"
        f"    <use transform=\"ref(svg,{lon_ref},{lat_ref})\" x=\"0\" y=\"0\" "
        f"xlink:href=\"#{symbol_id}\" data-kind=\"poi\" data-rank=\"{rank}\" "
        f"content=\"{escape(content_text)}\" xlink:title=\"{title}\" "
        f"data-feature-id=\"{escaped_feature_id}\" "
        "data-layer-id=\"momochari\" "
        f"data-title=\"{title}\" "
        "data-category=\"momochari\" "
        "data-subtitle=\"シェアサイクルポート\" "
        f"data-summary=\"{escaped_summary}\" "
        f"data-description=\"{escaped_description}\" "
        f"data-address=\"{escaped_address}\" "
        f"data-lat=\"{lat:.6f}\" "
        f"data-lon=\"{lon:.6f}\" "
        "data-source=\"momochari_with_rank.json\" "
        f"data-feature=\"{data_feature}\"/>\n"
        "  </a>"
    )


def main() -> None:
    tools_dir = Path(__file__).resolve().parent
    base_dir = tools_dir.parent
    container_path = base_dir / "containers" / "Containers.svg"
    view_box = read_viewbox(container_path)

    data_path = base_dir.parent / "frontend" / "public" / "momochari_with_rank.json"
    if not data_path.exists():
        data_path = base_dir.parent / "frontend" / "public" / "momochari_with_rank_demo.json"
    if not data_path.exists():
        raise FileNotFoundError("momochari data JSON not found.")

    data = json.loads(data_path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("momochari data JSON must be a list.")

    uses_block = "\n".join(build_use(entry) for entry in data)
    defs_block = build_defs()

    svg_output = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="{view_box}">
  <globalCoordinateSystem srsName="http://purl.org/crs/84" transform="matrix({SCALE},0,0,-{SCALE},0,0)" />

  <defs>
{defs_block}
  </defs>

{uses_block}
</svg>
"""

    output_path = base_dir / "layers" / "momochari_points.svg"
    output_path.write_text(svg_output, encoding="utf-8")
    print(f"Wrote {output_path.relative_to(base_dir)}")


if __name__ == "__main__":
    main()
