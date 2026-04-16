#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SVGMAPTOOLS_DIR="${SVGMAPTOOLS_DIR:-$ROOT_DIR/tools/svgMapTools}"
TOOLS_BIN_DIR="$SVGMAPTOOLS_DIR/tools"
INPUT_GPKG="${1:-}"
OUTPUT_DIR="${2:-$ROOT_DIR/map/layers/slope_svgmaptiles}"

LEVEL="${SLOPE_TILE_LEVEL:-5}"
LIMIT_KB="${SLOPE_TILE_LIMIT_KB:-120}"
DENSITY="${SLOPE_TILE_DENSITY:-160}"
SUM_UP="${SLOPE_TILE_SUMUP:-16}"
STROKE_FIX="${SLOPE_TILE_STROKE_FIX:-2}"

declare -A CLASS_COLORS=(
  [1]="#00ff00"
  [2]="#ffff00"
  [3]="#ffa500"
  [4]="#ff0000"
  [5]="#800080"
  [6]="#800080"
)

die() {
  echo "ERROR: $*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || die "$1 がありません"
}

find_default_input() {
  find "$ROOT_DIR/map/layers/_build/slope" -maxdepth 1 -type f \
    -name 'okayama_slope_vector_*_3857.gpkg' | sort | tail -n 1
}

check_svgmaptools() {
  [[ -d "$SVGMAPTOOLS_DIR" ]] || die "svgMapTools ディレクトリが見つかりません: $SVGMAPTOOLS_DIR"
  [[ -x "$TOOLS_BIN_DIR/Shape2SVGMap.sh" ]] || die "Shape2SVGMap.sh が見つかりません"
  [[ -x "$TOOLS_BIN_DIR/Shape2ImageSVGMap.sh" ]] || die "Shape2ImageSVGMap.sh が見つかりません"
  [[ -d "$SVGMAPTOOLS_DIR/target" ]] || die "svgMapTools の target ディレクトリがありません。まず tools/svgMapTools をビルドしてください"
  if ! find "$SVGMAPTOOLS_DIR/target" -maxdepth 2 -type f \( -name '*.jar' -o -path '*/dependency/*' \) | grep -q .; then
    die "svgMapTools の jar がありません。まず tools/svgMapTools でビルドしてください"
  fi
}

count_features() {
  local file="$1"
  ogrinfo -ro -al -so "$file" 2>/dev/null | awk -F': ' '/Feature Count/ {print $2; exit}'
}

make_container() {
  local container="$1"
  shift
  local rels=("$@")
  cat >"$container" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="13356.86 -3486.06 41.83 51.06">
  <globalCoordinateSystem srsName="http://purl.org/crs/84" transform="matrix(100,0,0,-100,0,0)" />
EOF
  local idx=1
  for rel in "${rels[@]}"; do
    cat >>"$container" <<EOF
  <animation id="slope-class-${idx}" x="13356.86" y="-3486.06" width="41.83" height="51.06"
             xlink:href="${rel}"
             visibility="visible"
             opacity="1" />
EOF
    idx=$((idx + 1))
  done
  echo "</svg>" >>"$container"
}

build_class_layer() {
  local class_id="$1"
  local color="${CLASS_COLORS[$class_id]}"
  local class_dir="$OUTPUT_DIR/class_${class_id}"
  local source_json="$class_dir/slope_class_${class_id}.json"
  local source_svg="$class_dir/slope_class_${class_id}.svg"

  mkdir -p "$class_dir"
  rm -f "$source_json"
  ogr2ogr -f GeoJSON -t_srs EPSG:4326 -where "class = ${class_id}" "$source_json" "$INPUT_GPKG" slope >/dev/null 2>&1

  local feature_count
  feature_count="$(count_features "$source_json" || true)"
  if [[ -z "$feature_count" || "$feature_count" == "0" ]]; then
    rm -f "$source_json"
    echo "[skip] class=${class_id} feature がありません"
    return 1
  fi

  (
    cd "$TOOLS_BIN_DIR"
    ./Shape2SVGMap.sh \
      -level "$LEVEL" \
      -limit "$LIMIT_KB" \
      -showtile \
      -densityControl "$DENSITY" \
      -lowresimage \
      -color "$color" \
      -strokefix "$STROKE_FIX" \
      "$source_json" \
      "$source_svg"

    ./Shape2ImageSVGMap.sh \
      "$source_svg" \
      -sumUp "$SUM_UP" \
      -antiAlias \
      "$source_json" \
      "$color" \
      "$color" \
      "$STROKE_FIX" \
      2
  )

  echo "[ok] class=${class_id} -> $source_svg"
  return 0
}

main() {
  need java
  need ogr2ogr
  need ogrinfo

  check_svgmaptools

  if [[ -z "$INPUT_GPKG" ]]; then
    INPUT_GPKG="$(find_default_input)"
  fi
  [[ -n "$INPUT_GPKG" ]] || die "入力 GPKG が見つかりません"
  [[ -f "$INPUT_GPKG" ]] || die "入力 GPKG が存在しません: $INPUT_GPKG"

  mkdir -p "$OUTPUT_DIR"

  local built_layers=()
  local class_id
  for class_id in 1 2 3 4 5 6; do
    if build_class_layer "$class_id"; then
      built_layers+=("class_${class_id}/slope_class_${class_id}.svg")
    fi
  done

  [[ ${#built_layers[@]} -gt 0 ]] || die "クラス別レイヤーを1つも生成できませんでした"

  make_container "$OUTPUT_DIR/container.svg" "${built_layers[@]}"

  cat <<EOF
[done] 傾斜タイルを生成しました
  input : $INPUT_GPKG
  output: $OUTPUT_DIR
  open  : /map/layers/slope_svgmaptiles/container.svg
EOF
}

main "$@"
