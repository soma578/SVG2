import math
import os
import subprocess
import sys
import time

import numpy as np
import requests
from osgeo import gdal, ogr, osr

RASTER_ZOOM = int(os.environ.get("SLOPE_RASTER_ZOOM", os.environ.get("GSI_DEM_ZOOM", "15")))
VECTOR_ZOOM = int(os.environ.get("SLOPE_VECTOR_ZOOM", str(RASTER_ZOOM)))
TILE_SLEEP_SEC = float(os.environ.get("GSI_DEM_SLEEP", "0"))
VECTOR_ENABLED = os.environ.get("SLOPE_VECTOR", "1").lower() not in {"0", "false", "no"}

LON_MIN = 133.5686
LON_MAX = 133.9869
LAT_MIN = 34.3500
LAT_MAX = 34.8606
TILE_URL_TEMPLATE = "https://cyberjapandata.gsi.go.jp/xyz/{tileset}/{z}/{x}/{y}.png"
RASTER_TILESET = os.environ.get(
    "SLOPE_RASTER_TILESET",
    "dem5a_png" if RASTER_ZOOM >= 15 else "dem_png",
)
VECTOR_TILESET = os.environ.get("SLOPE_VECTOR_TILESET", "dem_png")
REUSE_DEM = os.environ.get("SLOPE_REUSE_DEM", "1").lower() not in {"0", "false", "no"}
NODATA = -9999.0

COLOR_STOPS = [
    (0, 0, 0, 0, 0),
    (3, 0, 255, 0, 70),
    (6, 255, 255, 0, 90),
    (10, 255, 165, 0, 120),
    (15, 255, 0, 0, 160),
    (25, 128, 0, 128, 200),
]

SLOPE_CLASSES = [
    {"id": 1, "min": 0.0, "max": 3.0, "color": (0, 255, 0, 70), "label": "0-3"},
    {"id": 2, "min": 3.0, "max": 6.0, "color": (255, 255, 0, 90), "label": "3-6"},
    {"id": 3, "min": 6.0, "max": 10.0, "color": (255, 165, 0, 120), "label": "6-10"},
    {"id": 4, "min": 10.0, "max": 15.0, "color": (255, 0, 0, 160), "label": "10-15"},
    {"id": 5, "min": 15.0, "max": 25.0, "color": (128, 0, 128, 200), "label": "15-25"},
    {"id": 6, "min": 25.0, "max": None, "color": (128, 0, 128, 200), "label": "25+"},
]

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BUILD_DIR = os.path.join(ROOT_DIR, "layers", "_build", "slope")
OUTPUT_DIR = os.path.join(ROOT_DIR, "layers")
SLOPE_PNG_3857 = os.path.join(OUTPUT_DIR, "slope_okayama_3857.png")
SLOPE_PNG = os.path.join(OUTPUT_DIR, "slope_okayama.png")
COLOR_TABLE = os.path.join(BUILD_DIR, "slope_colors.txt")


def build_paths(tag: str, zoom: int) -> dict[str, str]:
    return {
        "dem_tif": os.path.join(BUILD_DIR, f"okayama_dem_{tag}_z{zoom}.tif"),
        "dem_3857_tif": os.path.join(BUILD_DIR, f"okayama_dem_{tag}_3857.tif"),
        "slope_3857_tif": os.path.join(BUILD_DIR, f"okayama_slope_deg_{tag}_3857.tif"),
        "slope_rgba_3857_tif": os.path.join(BUILD_DIR, f"okayama_slope_rgba_{tag}_3857.tif"),
        "slope_rgba_4326_tif": os.path.join(BUILD_DIR, f"okayama_slope_rgba_{tag}_4326.tif"),
        "slope_class_tif": os.path.join(BUILD_DIR, f"okayama_slope_class_{tag}_3857.tif"),
        "vector_gpkg": os.path.join(BUILD_DIR, f"okayama_slope_vector_{tag}_3857.gpkg"),
    }


def lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[int, int]:
    n = 2**z
    xtile = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    ytile = int(
        (1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi)
        / 2.0
        * n
    )
    return xtile, ytile


def tile_to_lonlat_bounds(x: int, y: int, z: int) -> tuple[float, float, float, float]:
    n = 2**z
    lon_left = x / n * 360.0 - 180.0
    lon_right = (x + 1) / n * 360.0 - 180.0

    def lat_from_y(yy: int) -> float:
        lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * yy / n)))
        return math.degrees(lat_rad)

    lat_top = lat_from_y(y)
    lat_bottom = lat_from_y(y + 1)
    return lon_left, lat_top, lon_right, lat_bottom


def decode_elevation(rgb: np.ndarray) -> np.ndarray:
    r = rgb[..., 0].astype(np.uint32)
    g = rgb[..., 1].astype(np.uint32)
    b = rgb[..., 2].astype(np.uint32)
    x = (r << 16) + (g << 8) + b
    invalid = (x == (1 << 23)) | ((r == 128) & (g == 0) & (b == 0))

    h = np.empty(x.shape, dtype=np.float32)
    lt = x < (1 << 23)
    h[lt] = x[lt].astype(np.float32) * 0.01
    h[~lt] = (x[~lt].astype(np.float32) - (1 << 24)) * 0.01
    h[invalid] = NODATA
    return h


def read_tile_rgb(tile_bytes: bytes, name: str) -> np.ndarray:
    mem_path = f"/vsimem/{name}.png"
    gdal.FileFromMemBuffer(mem_path, tile_bytes)
    try:
        ds = gdal.Open(mem_path)
        if ds is None:
            raise RuntimeError("Failed to open tile with GDAL.")
        r = ds.GetRasterBand(1).ReadAsArray()
        g = ds.GetRasterBand(2).ReadAsArray()
        b = ds.GetRasterBand(3).ReadAsArray()
        rgb = np.stack([r, g, b], axis=-1)
    finally:
        gdal.Unlink(mem_path)
    return rgb


def fetch_tile(
    session: requests.Session,
    tileset: str,
    z: int,
    x: int,
    y: int,
) -> np.ndarray | None:
    url = TILE_URL_TEMPLATE.format(tileset=tileset, z=z, x=x, y=y)
    try:
        res = session.get(url, timeout=30)
        if res.status_code == 404:
            print(f"[warn] missing tile {z}/{x}/{y} (404)")
            return None
        res.raise_for_status()
        return read_tile_rgb(res.content, f"tile_{z}_{x}_{y}")
    except requests.RequestException as exc:
        print(f"[warn] failed tile {z}/{x}/{y}: {exc}")
        return None


def build_dem(zoom: int, output_tif: str, tileset: str) -> tuple[int, int, float, float, float, float]:
    if REUSE_DEM and os.path.exists(output_tif):
        ds = gdal.Open(output_tif)
        if ds is None:
            raise RuntimeError(f"Failed to open cached DEM: {output_tif}")
        gt = ds.GetGeoTransform()
        width = ds.RasterXSize
        height = ds.RasterYSize
        lon_left = gt[0]
        lat_top = gt[3]
        pixel_width = gt[1]
        pixel_height = gt[5]
        lon_right = lon_left + pixel_width * width
        lat_bottom = lat_top + pixel_height * height
        ds = None
        print(f"[info] reuse DEM {output_tif}")
        return width, height, lon_left, lat_bottom, lon_right, lat_top
    x0, y_top = lonlat_to_tile(LON_MIN, LAT_MAX, zoom)
    x1, y_bottom = lonlat_to_tile(LON_MAX, LAT_MIN, zoom)
    x_min, x_max = min(x0, x1), max(x0, x1)
    y_min, y_max = min(y_top, y_bottom), max(y_top, y_bottom)

    tiles_x = x_max - x_min + 1
    tiles_y = y_max - y_min + 1
    width = tiles_x * 256
    height = tiles_y * 256

    print(
        f"[info] zoom={zoom} tileset={tileset} tiles x={x_min}..{x_max} ({tiles_x}), y={y_min}..{y_max} ({tiles_y})"
    )
    dem = np.full((height, width), NODATA, dtype=np.float32)
    session = requests.Session()

    for ty in range(y_min, y_max + 1):
        for tx in range(x_min, x_max + 1):
            print(f"[info] download {zoom}/{tx}/{ty}")
            rgb = fetch_tile(session, tileset, zoom, tx, ty)
            if rgb is None:
                if TILE_SLEEP_SEC > 0:
                    time.sleep(TILE_SLEEP_SEC)
                continue
            h = decode_elevation(rgb)
            row = (ty - y_min) * 256
            col = (tx - x_min) * 256
            dem[row:row + 256, col:col + 256] = h
            if TILE_SLEEP_SEC > 0:
                time.sleep(TILE_SLEEP_SEC)

    lon_left, lat_top, _, _ = tile_to_lonlat_bounds(x_min, y_min, zoom)
    _, _, lon_right, _ = tile_to_lonlat_bounds(x_max, y_min, zoom)
    _, _, _, lat_bottom = tile_to_lonlat_bounds(x_min, y_max, zoom)

    driver = gdal.GetDriverByName("GTiff")
    ds = driver.Create(
        output_tif,
        width,
        height,
        1,
        gdal.GDT_Float32,
        options=["TILED=YES", "COMPRESS=DEFLATE"],
    )
    pixel_width = (lon_right - lon_left) / width
    pixel_height = (lat_top - lat_bottom) / height
    ds.SetGeoTransform((lon_left, pixel_width, 0.0, lat_top, 0.0, -pixel_height))
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(4326)
    ds.SetProjection(srs.ExportToWkt())
    band = ds.GetRasterBand(1)
    band.SetNoDataValue(NODATA)
    band.WriteArray(dem)
    band.FlushCache()
    ds = None

    return width, height, lon_left, lat_bottom, lon_right, lat_top


def run_command(args: list[str]) -> None:
    print("[info] run:", " ".join(args))
    subprocess.run(args, check=True)


def write_color_table() -> None:
    os.makedirs(BUILD_DIR, exist_ok=True)
    with open(COLOR_TABLE, "w", encoding="ascii") as fh:
        fh.write(
            "\n".join(
                [f"{stop}   {r}   {g}   {b}   {a}" for stop, r, g, b, a in COLOR_STOPS]
            )
            + "\n"
        )


def build_slope_base(zoom: int, tag: str, tileset: str) -> str:
    paths = build_paths(tag, zoom)
    build_dem(zoom, paths["dem_tif"], tileset)

    run_command(
        [
            "gdalwarp",
            "-overwrite",
            "-t_srs",
            "EPSG:3857",
            "-r",
            "bilinear",
            "-te_srs",
            "EPSG:4326",
            "-te",
            str(LON_MIN),
            str(LAT_MIN),
            str(LON_MAX),
            str(LAT_MAX),
            "-dstnodata",
            str(NODATA),
            paths["dem_tif"],
            paths["dem_3857_tif"],
        ]
    )

    run_command(["gdaldem", "slope", paths["dem_3857_tif"], paths["slope_3857_tif"]])
    return paths["slope_3857_tif"]


def build_slope_raster_images(slope_3857_tif: str, tag: str, zoom: int) -> None:
    paths = build_paths(tag, zoom)
    run_command(
        [
            "gdaldem",
            "color-relief",
            "-alpha",
            slope_3857_tif,
            COLOR_TABLE,
            paths["slope_rgba_3857_tif"],
        ]
    )

    run_command(["gdal_translate", "-of", "PNG", paths["slope_rgba_3857_tif"], SLOPE_PNG_3857])

    run_command(
        [
            "gdalwarp",
            "-overwrite",
            "-t_srs",
            "EPSG:4326",
            "-r",
            "bilinear",
            "-te_srs",
            "EPSG:4326",
            "-te",
            str(LON_MIN),
            str(LAT_MIN),
            str(LON_MAX),
            str(LAT_MAX),
            "-dstalpha",
            paths["slope_rgba_3857_tif"],
            paths["slope_rgba_4326_tif"],
        ]
    )

    run_command(["gdal_translate", "-of", "PNG", paths["slope_rgba_4326_tif"], SLOPE_PNG])


def classify_slope_raster(slope_3857_tif: str, class_tif: str) -> None:
    ds = gdal.Open(slope_3857_tif)
    if ds is None:
        raise RuntimeError(f"Failed to open slope raster: {slope_3857_tif}")
    band = ds.GetRasterBand(1)
    nodata = band.GetNoDataValue()

    driver = gdal.GetDriverByName("GTiff")
    out = driver.Create(
        class_tif,
        ds.RasterXSize,
        ds.RasterYSize,
        1,
        gdal.GDT_Byte,
        options=["TILED=YES", "COMPRESS=DEFLATE"],
    )
    out.SetGeoTransform(ds.GetGeoTransform())
    out.SetProjection(ds.GetProjection())
    out_band = out.GetRasterBand(1)
    out_band.SetNoDataValue(0)

    block_x, block_y = band.GetBlockSize()
    if block_x <= 0 or block_y <= 0:
        block_x, block_y = 256, 256

    for y in range(0, ds.RasterYSize, block_y):
        rows = min(block_y, ds.RasterYSize - y)
        for x in range(0, ds.RasterXSize, block_x):
            cols = min(block_x, ds.RasterXSize - x)
            data = band.ReadAsArray(x, y, cols, rows)
            class_data = np.zeros(data.shape, dtype=np.uint8)
            if data is None:
                continue

            valid = np.isfinite(data)
            if nodata is not None:
                valid &= data != nodata
            valid &= data >= 0.0

            for slope_class in SLOPE_CLASSES:
                lower = slope_class["min"]
                upper = slope_class["max"]
                if upper is None:
                    mask = valid & (data >= lower)
                else:
                    mask = valid & (data >= lower) & (data < upper)
                class_data[mask] = slope_class["id"]

            out_band.WriteArray(class_data, x, y)

    out_band.FlushCache()
    out = None
    ds = None


def polygonize_classes(class_tif: str, vector_gpkg: str) -> None:
    src = gdal.Open(class_tif)
    if src is None:
        raise RuntimeError(f"Failed to open class raster: {class_tif}")
    band = src.GetRasterBand(1)

    driver = ogr.GetDriverByName("GPKG")
    if os.path.exists(vector_gpkg):
        driver.DeleteDataSource(vector_gpkg)
    dst = driver.CreateDataSource(vector_gpkg)
    srs = osr.SpatialReference()
    srs.ImportFromWkt(src.GetProjection())
    layer = dst.CreateLayer("slope", srs=srs, geom_type=ogr.wkbPolygon)
    field_def = ogr.FieldDefn("class", ogr.OFTInteger)
    layer.CreateField(field_def)

    gdal.Polygonize(band, None, layer, 0, [])

    dst = None
    src = None


def main() -> int:
    os.makedirs(BUILD_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    write_color_table()

    raster_slope_3857 = build_slope_base(RASTER_ZOOM, "raster", RASTER_TILESET)
    build_slope_raster_images(raster_slope_3857, "raster", RASTER_ZOOM)
    print("[info] wrote:", SLOPE_PNG_3857)
    print("[info] wrote:", SLOPE_PNG)

    if VECTOR_ENABLED:
        if VECTOR_ZOOM == RASTER_ZOOM:
            vector_slope_3857 = raster_slope_3857
            vector_paths = build_paths("raster", RASTER_ZOOM)
        else:
            vector_slope_3857 = build_slope_base(VECTOR_ZOOM, "vector", VECTOR_TILESET)
            vector_paths = build_paths("vector", VECTOR_ZOOM)

        classify_slope_raster(vector_slope_3857, vector_paths["slope_class_tif"])
        polygonize_classes(vector_paths["slope_class_tif"], vector_paths["vector_gpkg"])
        print("[info] wrote:", vector_paths["slope_class_tif"])
        print("[info] wrote:", vector_paths["vector_gpkg"])
        print(
            "[info] next : bash /home/ubuntu/SVG2/map/tools/build_slope_svgmap_tiles.sh "
            f"{vector_paths['vector_gpkg']}"
        )

    return 0


if __name__ == "__main__":
    gdal.UseExceptions()
    ogr.UseExceptions()
    sys.exit(main())
