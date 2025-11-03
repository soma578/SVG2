# 岡山県観光マップを 0 から構築する手順

このガイドでは、空の作業フォルダから **SVGMap** を使った岡山県観光マップを構築し、ローカルサーバで表示できる状態になるまでを説明します。

---

## 1. 必要な環境を確認
- **WSL (Ubuntu など) または Windows 版 GNU wget**
  - PowerShell の `wget` は別実装なので使わない。
- **Git**
- **Python 3**（`python3 -m http.server` を利用）
- 編集用のテキストエディタ

---

## 2. 作業用ディレクトリを準備
以下では WSL 上の例として `/home/nogami/workspace_for_wsl/SVG` を使います。環境に合わせて置き換えてください。

```bash
mkdir -p /home/nogami/workspace_for_wsl/SVG
cd /home/nogami/workspace_for_wsl/SVG
```

---

## 3. 共通レイヤーを取得
岡山マップのベースとなるリポジトリをクローンします。

```bash
git clone https://github.com/svgmap/svgMapAppLayers.git
```

---

## 4. チュートリアル素材をダウンロード
観光スポットのピン画像などをチュートリアルサイトから取得します。WSL で GNU Wget を使う例:

```bash
mkdir -p tutorials
cd tutorials
wget -r -np -nH --cut-dirs=2 \
  https://www.svgmap.org/devinfo/devkddi/tutorials/tutorial1/
cd ..
```

ダウンロード後は `tutorials/tutorial1/` 以下に `img/` や `tutorial1.html` などが保存されます。

> Windows の GNU Wget を利用する場合は `wget.exe` を同じオプションで実行すれば OK です。

---

## 5. 岡山マップ用ディレクトリとファイルを作成
```bash
mkdir -p okayama-map
```

### `okayama-map/index.html`
```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,user-scalable=no,initial-scale=1.0,maximum-scale=1.0">
<title>岡山県観光マップ</title>
<style>
  :root {
    color-scheme: light;
    font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
  }
  html, body { height: 100%; }
  body {
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: #f8fafc;
    color: #0f172a;
  }
  #mapcanvas { position: absolute; inset: 0; }
  #gui { position: absolute; inset: 0; pointer-events: none; }
  #gui img, #gui font, #gui span { pointer-events: auto; }
  #zoomupButton { left: 12px; top: 12px; position: absolute; }
  #zoomdownButton { left: 12px; top: 36px; position: absolute; }
  #gpsButton { left: 12px; top: 60px; position: absolute; }
  #mapTitle { right: 16px; top: 14px; position: absolute; color: #0f172a; font-weight: 600; }
  #mapCredit { right: 16px; bottom: 12px; position: absolute; color: #475569; font-size: 11px; }
  #centerSight { position: absolute; opacity: 0.5; width: 15px; height: 15px; left: calc(50% - 7.5px); top: calc(50% - 7.5px); }
  #posCmt { position: absolute; left: 12px; bottom: 32px; font-size: 12px; color: #1e293b; }
  #centerPos { position: absolute; left: 60px; bottom: 30px; font-size: 12px; color: #1e293b; }

  #controlPanel {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 280px;
    max-height: calc(100vh - 32px);
    background: rgba(255,255,255,0.95);
    border-radius: 12px;
    border: 1px solid #cbd5f5;
    box-shadow: 0 10px 30px rgba(15,23,42,0.18);
    display: flex;
    flex-direction: column;
    backdrop-filter: blur(6px);
  }
  #controlPanel header {
    padding: 16px 18px 12px;
    border-bottom: 1px solid #e2e8f0;
  }
  #controlPanel h1 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
  }
  #controlPanel p {
    margin: 4px 0 0;
    font-size: 12px;
    color: #475569;
  }
  #controlScroll {
    overflow-y: auto;
    padding: 12px 18px 18px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .groupTitle {
    font-size: 12px;
    letter-spacing: 0.04em;
    font-weight: 600;
    color: #1e293b;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .toggle-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .toggle-item {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 6px 8px;
    border-radius: 6px;
    transition: background 0.2s ease;
  }
  .toggle-item:hover {
    background: rgba(148, 163, 184, 0.16);
  }
  .toggle-item input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: #1d4ed8;
  }
  .toggle-item label {
    font-size: 13px;
    flex: 1;
    cursor: pointer;
  }
  #weatherControls {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  #weatherControls input[type="range"] {
    width: 100%;
    accent-color: #0369a1;
  }
  .stat-card {
    background: rgba(241,245,249,0.9);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 12px;
    color: #1e293b;
    display: grid;
    row-gap: 4px;
  }
  .stat-card span {
    display: flex;
    justify-content: space-between;
  }
  #layerSummary {
    font-weight: 600;
    color: #0f172a;
  }
  #networkNotice {
    font-size: 11px;
    color: #64748b;
    line-height: 1.5;
  }
</style>
<script>
  window.svgMapOptions = window.svgMapOptions ?? {};
  window.svgMapOptions.enableEssentialUI = false;
</script>
<script type="module">
  import { svgMap } from 'https://cdn.jsdelivr.net/gh/svgmap/svgmapjs@latest/SVGMapLv0.1_r18module.js';
  window.svgMap = svgMap;

  const layerDefinitions = {
    basemap: { id: "layer-basemap", checkbox: "toggle-basemap", defaultVisible: true },
    coastline: { id: "layer-coastline", checkbox: "toggle-coastline", defaultVisible: false },
    spots: { id: "layer-spots", checkbox: "toggle-spots", defaultVisible: true },
    weather: { id: "layer-weather", checkbox: "toggle-weather", defaultVisible: true },
  };

  const waitForSvgImage = () =>
    new Promise((resolve) => {
      const check = () => {
        if (window.svgMap && window.svgMap.svgImage) {
          resolve(window.svgMap.svgImage);
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });

  const setLayerVisibility = (svgImage, layerId, visible) => {
    const el = svgImage.getElementById(layerId);
    if (!el) return false;
    el.setAttribute("visibility", visible ? "visible" : "hidden");
    return true;
  };

  const setLayerOpacity = (svgImage, layerId, opacity) => {
    const el = svgImage.getElementById(layerId);
    if (!el) return false;
    el.setAttribute("opacity", opacity);
    return true;
  };

  const collectLayerStats = (svgImage) => {
    const result = {};
    for (const [key, def] of Object.entries(layerDefinitions)) {
      const el = svgImage.getElementById(def.id);
      if (!el) continue;
      result[key] = {
        visible: el.getAttribute("visibility") !== "hidden",
        opacity: parseFloat(el.getAttribute("opacity") ?? "1"),
      };
    }
    return result;
  };

  const updateSummary = (stats) => {
    const summaryEl = document.getElementById("layerSummary");
    const layers = [];
    if (stats.basemap?.visible) layers.push("ベース");
    if (stats.spots?.visible) layers.push("スポット");
    if (stats.weather?.visible) layers.push("気象");
    if (stats.coastline?.visible) layers.push("海岸線");
    summaryEl.textContent = layers.length ? layers.join(" / ") : "なし";
  };

  const updateSpotCount = async () => {
    try {
      const response = await fetch("/okayama-map/okayama-spots.svg");
      if (!response.ok) return;
      const text = await response.text();
      const matches = text.match(/xlink:href="#/g);
      document.getElementById("spotCount").textContent = matches ? matches.length : 0;
    } catch {
      document.getElementById("spotCount").textContent = "--";
    }
  };

  (async () => {
    const svgImage = await waitForSvgImage();

    for (const [key, def] of Object.entries(layerDefinitions)) {
      const checkbox = document.getElementById(def.checkbox);
      if (!checkbox) continue;
      checkbox.checked = def.defaultVisible;
      setLayerVisibility(svgImage, def.id, def.defaultVisible);
      checkbox.addEventListener("change", () => {
        setLayerVisibility(svgImage, def.id, checkbox.checked);
        updateSummary(collectLayerStats(svgImage));
      });
    }

    const weatherOpacity = document.getElementById("weatherOpacity");
    const weatherOpacityValue = document.getElementById("weatherOpacityValue");
    weatherOpacity.addEventListener("input", (event) => {
      const value = parseFloat(event.target.value);
      weatherOpacityValue.textContent = `${Math.round(value * 100)}%`;
      setLayerOpacity(svgImage, layerDefinitions.weather.id, value);
    });

    const headerButtons = document.querySelectorAll("#layerListHeader button");
    headerButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.target;
        headerButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("layerListTable").style.display =
          target === "layerListTable" ? "table" : "none";
        document.getElementById("layerCategoryTable").style.display =
          target === "layerCategoryTable" ? "table" : "none";
      });
    });

    const observer = new MutationObserver(() => {
      const area = document.getElementById("layerListArea");
      if (!area) {
        observer.disconnect();
        return;
      }
      const hasRows = area.querySelector("#layerListTable tr, #layerCategoryTable tr");
      area.style.display = hasRows ? "block" : "none";
    });
    observer.observe(document.getElementById("layerListArea"), { childList: true, subtree: true });

    updateSummary(collectLayerStats(svgImage));
    updateSpotCount();
    document.getElementById("layerListArea").style.display = "block";
  })();
</script>
</head>
<body>
  <div id="mapcanvas" data-src="Container.svg"></div>
  <div id="gui">
    <img id="zoomupButton" src="/tutorials/tutorial1/img/zoomup.png" onclick="svgMap.zoomup()" width="20" height="20" alt="Zoom In">
    <img id="zoomdownButton" src="/tutorials/tutorial1/img/zoomdown.png" onclick="svgMap.zoomdown()" width="20" height="20" alt="Zoom Out">
    <img id="gpsButton" src="/tutorials/tutorial1/img/gps.png" onclick="svgMap.gps()" width="20" height="20" alt="GPS">
    <font id="mapTitle">SVGMap.js : 岡山県観光マップ</font>
    <font id="mapCredit" size="-2">by SVGMap tech.</font>
    <img id="centerSight" src="/tutorials/tutorial1/img/Xcursor.png" width="15" height="15" alt="Center">
    <font id="posCmt" size="-2">Lat,Lng:</font>
    <span id="centerPos">lat , lng</span>
  </div>
  <aside id="controlPanel">
    <header>
      <h1>レイヤーと表示設定</h1>
      <p>国土地理院タイルと岡山の観光情報を自由に組み合わせましょう。</p>
    </header>
    <div id="controlScroll">
      <section>
        <div class="groupTitle">ベースマップ</div>
        <div class="toggle-list">
          <div class="toggle-item">
            <input type="checkbox" id="toggle-basemap" data-layer="basemap" checked>
            <label for="toggle-basemap">国土地理院 淡色地図</label>
          </div>
          <div class="toggle-item">
            <input type="checkbox" id="toggle-coastline" data-layer="coastline">
            <label for="toggle-coastline">日本海岸線（ガイド）</label>
          </div>
        </div>
      </section>

      <section>
        <div class="groupTitle">情報レイヤー</div>
        <div class="toggle-list">
          <div class="toggle-item">
            <input type="checkbox" id="toggle-spots" data-layer="spots" checked>
            <label for="toggle-spots">岡山観光スポット</label>
          </div>
          <div class="toggle-item">
            <input type="checkbox" id="toggle-weather" data-layer="weather" checked>
            <label for="toggle-weather">現在の気象</label>
          </div>
        </div>
      </section>

      <section id="weatherControls">
        <div class="groupTitle">気象レイヤーの透明度</div>
        <input type="range" id="weatherOpacity" min="0" max="1" step="0.05" value="1">
        <small>現在の透明度: <span id="weatherOpacityValue">100%</span></small>
      </section>

      <section class="stat-card">
        <span><span>表示中レイヤー</span><span id="layerSummary">---</span></span>
        <span><span>ベースマップ</span><span id="basemapStatus">オンライン</span></span>
        <span><span>スポット数</span><span id="spotCount">--</span></span>
      </section>

      <section id="networkNotice">
        ※ ベースマップは国土地理院のオンラインタイルを利用しています。<br>
        オフラインで動かす場合は、ローカルに用意したベースマップに差し替えてください。
      </section>
    </div>
  </aside>
</body>
</html>
```

### `okayama-map/Container.svg`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="13356.86 -3486.06 41.83 51.06">
  <globalCoordinateSystem srsName="http://purl.org/crs/84" transform="matrix(100,0,0,-100,0,0)" />

  <!-- 背景地図：国土地理院タイル -->
  <animation x="-30000" y="-30000" width="60000" height="60000"
             xlink:href="/svgMapAppLayers/basemaps/dynamicDenshiKokudo2016.svg#map=pale"
             title="国土地理院 淡色地図" class="basemap switch" visibility="visible" opacity="1"/>

  <!-- ベクター海岸線（輪郭ガイド） -->
  <animation x="12000" y="-4600" width="1600" height="1200"
             xlink:href="/tutorials/tutorial1/Coastline.svg"
             title="日本の海岸線" class="vectorEtcData" visibility="hidden" opacity="0.5"/>

  <!-- 観光スポットレイヤー -->
  <animation x="13356.86" y="-3486.06" width="41.83" height="51.06"
             xlink:href="/okayama-map/okayama-spots.svg"
             title="岡山県観光スポット" class="poi clickable" visibility="visible" opacity="1"/>

  <!-- 気象レイヤー -->
  <animation x="13356.86" y="-3486.06" width="41.83" height="51.06"
             xlink:href="/okayama-map/weather.svg"
             title="現在の気象" class="overlay" visibility="visible" opacity="1"/>
</svg>
```

> `generate_spots.py` を実行すると、コンソールに `Container.svg` 用の推奨 `viewBox` が表示されます。スポットや気象地点を追加した後は、ここに記載の数値を更新してください（もしくは `Container.svg` を再生成するスクリプトを用意しても構いません）。

### `okayama-map/tools/generate_spots.py`
```python
#!/usr/bin/env python3
"""Generate okayama-spots.svg from CSV data."""

from __future__ import annotations

import csv
from pathlib import Path
from xml.sax.saxutils import escape


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
    scaled = value * 100
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
        rows = [row for row in reader if row.get("name")]

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
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="13350 -3500 100 100">
  <globalCoordinateSystem srsName="http://purl.org/crs/84" transform="matrix(100,0,0,-100,0,0)" />

  <defs>
{defs_block}
  </defs>

{uses_block}
</svg>
"""

    output_path.write_text(svg_output, encoding="utf-8")
    print(f"Wrote {output_path.relative_to(base_dir)}")


if __name__ == "__main__":
    main()
```

### `okayama-map/tools/add_spot.py`
```python
#!/usr/bin/env python3
"""Append a new sightseeing spot to the CSV source."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path


CSV_HEADER = ["name", "kind", "lon", "lat", "url", "summary"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Add a sightseeing spot to okayama_spots.csv")
    parser.add_argument("--name", required=True, help="スポット名（例: 岡山城）")
    parser.add_argument("--kind", required=True, choices=["castle", "garden", "tourist", "shrine", "bridge"],
                        help="ピンの種類。必要なら generate_spots.py の ICON_DEFS に追加します。")
    parser.add_argument("--lon", required=True, type=float, help="経度（10進数）")
    parser.add_argument("--lat", required=True, type=float, help="緯度（10進数）")
    parser.add_argument("--url", required=True, help="詳細ページの URL")
    parser.add_argument("--summary", default="", help="ピン説明（カンマ区切りで複数可）")
    parser.add_argument("--no-generate", action="store_true",
                        help="generate_spots.py を自動実行しない場合に指定。")
    return parser.parse_args()


def append_row(csv_path: Path, row: dict[str, str]) -> None:
    csv_exists = csv_path.exists()
    if csv_exists:
        with csv_path.open(encoding="utf-8") as existing:
            reader = csv.DictReader(existing)
            for existing_row in reader:
                if existing_row.get("name") == row["name"]:
                    raise ValueError(f"'{row['name']}' は既に登録されています")

    with csv_path.open("a", encoding="utf-8", newline="") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=CSV_HEADER)
        if not csv_exists:
            writer.writeheader()
        writer.writerow(row)


def main() -> None:
    args = parse_args()
    tools_dir = Path(__file__).resolve().parent
    base_dir = tools_dir.parent
    csv_path = base_dir / "data" / "okayama_spots.csv"

    if not csv_path.parent.exists():
        raise FileNotFoundError(f"データディレクトリが見つかりません: {csv_path.parent}")

    row = {
        "name": args.name.strip(),
        "kind": args.kind.strip(),
        "lon": f"{args.lon:.6f}",
        "lat": f"{args.lat:.6f}",
        "url": args.url.strip(),
        "summary": args.summary.strip(),
    }

    append_row(csv_path, row)
    print(f"Added '{row['name']}' to {csv_path.relative_to(base_dir)}")

    if not args.no_generate:
        from generate_spots import main as generate_spots  # type: ignore

        print("Regenerating okayama-spots.svg ...")
        generate_spots()


if __name__ == "__main__":
    main()
```

### `okayama-map/data/okayama_spots.csv`
```csv
name,kind,lon,lat,url,summary
"岡山城","castle",133.9333,34.6650,"https://ja.wikipedia.org/wiki/%E5%B2%A1%E5%B1%B1%E5%9F%8E","日本の城,岡山市北区,別名『烏城』の黒い外観"
"岡山後楽園","garden",133.9369,34.6647,"https://ja.wikipedia.org/wiki/%E5%B2%A1%E5%B1%B1%E5%BE%8C%E6%A5%BD%E5%9C%92","日本三名園,岡山市北区,約13万㎡の大名庭園"
"倉敷美観地区","tourist",133.7722,34.5958,"https://ja.wikipedia.org/wiki/%E5%80%89%E6%95%B7%E7%BE%8E%E8%A6%B3%E5%9C%B0%E5%8C%BA","歴史的町並み,倉敷市,白壁の蔵屋敷と柳並木"
"吉備津神社","shrine",133.8539,34.6730,"https://ja.wikipedia.org/wiki/%E5%90%89%E5%82%99%E6%B4%A5%E7%A5%9E%E7%A4%BE","古社,岡山市北区,桃太郎伝説の吉備津彦命"
"備中松山城","castle",133.6186,34.8106,"https://ja.wikipedia.org/wiki/%E5%82%99%E4%B8%AD%E6%9D%BE%E5%B1%B1%E5%9F%8E","山城,高梁市,標高430mの現存天守"
"瀬戸大橋","bridge",133.8333,34.4000,"https://ja.wikipedia.org/wiki/%E7%80%AC%E6%88%B8%E5%A4%A7%E6%A9%8B","本州四国連絡橋,倉敷市,全長約13kmの橋梁群"
"鷲羽山","tourist",133.8167,34.4833,"https://ja.wikipedia.org/wiki/%E9%B7%B2%E7%BE%BD%E5%B1%B1","絶景スポット,倉敷市,瀬戸大橋を望む景勝地"
"最上稲荷","shrine",133.8847,34.7111,"https://ja.wikipedia.org/wiki/%E6%9C%80%E4%B8%8A%E7%A8%B2%E8%8D%B7","日本三大稲荷,岡山市北区,巨大な鳥居が印象的"
```

### `okayama-map/data/weather_points.csv`
```csv
name,lon,lat
"岡山駅",133.9150,34.6667
"倉敷駅",133.7694,34.5967
"津山駅",134.0033,35.0694
```

### `okayama-map/tools/generate_weather_layer.py`
```python
#!/usr/bin/env python3
"""Fetch current weather and generate weather.svg overlay."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from typing import Dict, Tuple
from urllib.error import URLError
from urllib.request import urlopen
from xml.sax.saxutils import escape


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
    scaled = value * 100
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
    output_path = base_dir / "weather.svg"

    if not data_path.exists():
        raise FileNotFoundError(f"weather_points.csv が見つかりません: {data_path}")

    with data_path.open(encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        rows = [row for row in reader if row.get("name")]

    if not rows:
        raise ValueError("weather_points.csv に地点が登録されていません。")

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
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="13350 -3500 100 100">
  <globalCoordinateSystem srsName="http://purl.org/crs/84" transform="matrix(100,0,0,-100,0,0)" />

  <defs>
{defs_block}
  </defs>

{entries_block}
</svg>
"""

    output_path.write_text(svg_output, encoding="utf-8")
    print(f"Wrote {output_path.relative_to(base_dir)}")


if __name__ == "__main__":
    main()
```

---

## 6. スポット SVG を生成
CSV をもとにスポットレイヤーを生成します。

```bash
cd /home/nogami/workspace_for_wsl/SVG
python3 okayama-map/tools/generate_spots.py
```

成功すると `okayama-map/okayama-spots.svg` が作成（または更新）されます。

---

## 7. 気象レイヤーを生成
Open-Meteo（APIキー不要）から現在の気象データを取得し、`weather.svg` を生成します。ネットワークに接続できない場合は `--°C / 取得エラー` 表示になります。

```bash
cd /home/nogami/workspace_for_wsl/SVG
python3 okayama-map/tools/generate_weather_layer.py
```

---

## 8. ローカルサーバを起動
プロジェクトルート（`SVG/`）で 1 つだけサーバを起動します。すでに別のポートで実行中の場合は 8080 以外でも構いません。

```bash
cd /home/nogami/workspace_for_wsl/SVG
python3 -m http.server 8080
```

- サーバは起動したまま別のターミナル（または同ターミナルの新しいタブ）でブラウザを開いて確認します。
- 停止するときは `Ctrl+C`。

---

## 9. 動作確認
- 岡山マップ: `http://localhost:8080/okayama-map/`
- チュートリアル素材: `http://localhost:8080/tutorials/tutorial1/tutorial1.html`

背景地図とピンが正しく表示され、ピンをクリックすると Wikipedia が開けば成功です。

---

## 10. 実行フロー（コマンド例付き）
セットアップ直後に行う一連の操作例です。

```bash
# 1. 作業ディレクトリへ移動
cd /home/nogami/workspace_for_wsl/SVG

# 2. スポット SVG を生成
python3 okayama-map/tools/generate_spots.py

# 3. 気象レイヤーを生成
python3 okayama-map/tools/generate_weather_layer.py

# 4. サーバ起動（別ターミナルを使ってブラウザを開く）
python3 -m http.server 8080

# 5. ブラウザで実行
#   URL: http://localhost:8080/okayama-map/
#   期待: 岡山県のマップ、ピンをクリックすると新しいタブで Wikipedia
```

ブラウザで地図を確認し終えたら、サーバを実行していたターミナルで `Ctrl+C` で終了します。

---

## 11. 自分で拡張するための練習課題
以下の課題に取り組むと、岡山マップをベースに自分のマップを作成する力が身につきます。

1. **スポットを追加する**  
   - `okayama-map/data/okayama_spots.csv` に行を追加して `generate_spots.py` を再実行、または `add_spot.py` を使って自動追加。
   - 座標は Google Maps や国土地理院サイトなどで取得。
2. **ピンの見た目を変える**  
   - チュートリアル素材の別アイコンを使う、または自作 PNG を `tutorials/tutorial1/img/` に追加し、`ICON_DEFS` に定義を追加。
3. **表示範囲を調整する**  
   - `Container.svg` の `viewBox` を変更して、県北・県南などフォーカスしたい範囲に合わせる。
4. **データ自動生成を発展させる**  
   - CSV の列を増やし、`generate_spots.py` を拡張して Tooltip やスタイルを切り替える。
   - `generate_weather_layer.py` に予報データや降水確率を追加して表示内容を充実させる。
5. **コマンドを自動化する**  
   - `add_spot.py` を GUI や Web フォームから呼び出すスクリプトを作る。
6. **別地域のマップに挑戦**  
   - 岡山向けのファイルをコピーして `hiroshima-map` などのフォルダを作り、座標・リンク・表示範囲を置き換える。

> それぞれの課題はサーバを起動したままブラウザを更新して結果を確認できます。変更が反映されない場合はキャッシュをクリアしましょう。

---

## トラブルシューティング
- **PowerShell の `wget` を使ってエラーになる**  
  WSL の `wget` か `wget.exe` を使用する。
- **画像・ベースマップが表示されない**  
  ルートで 1 つだけサーバを起動し、`/svgMapAppLayers/...` や `/tutorials/...` のように絶対パスで参照。
- **Linux の大文字小文字違い**  
  `svgMapAppLayers` や `Container.svg` などの綴りを確認。
- **表示範囲がズレる**  
  `Container.svg` の `viewBox="133 34 2 2"` を調整。
- **変更が反映されない**  
  プライベートウィンドウで開くか `Ctrl+F5`（Mac は `Cmd+Shift+R`）で強制再読み込み。

---

## 発展アイデア
観光スポット情報を CSV などのデータソースで管理し、スクリプトで `okayama-spots.svg` を生成すると更新作業が大幅に楽になります。

---

## ライセンス
学習目的のプロジェクトです。`svgMapAppLayers` のライセンスは [公式リポジトリ](https://github.com/svgmap/svgMapAppLayers) を参照してください。
