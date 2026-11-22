"""Build square skill covers from transparent-mode PNGs exported by the NIKKE viewer."""

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


def square_cover(image, edge):
    source = image.convert("RGBA")
    alpha = source.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError("PNG contains no visible artwork")
    artwork = source.crop(bounds)
    # Center the original frame on a square canvas without scaling either axis
    # independently or discarding painted parts of a portrait or landscape.
    scale = edge / max(artwork.size)
    artwork = artwork.resize(
        tuple(max(1, round(dimension * scale)) for dimension in artwork.size),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (edge, edge))
    canvas.paste(artwork, ((edge - artwork.width) // 2, (edge - artwork.height) // 2))
    return canvas, bounds, alpha.getextrema()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("png_dir", type=Path, help="Directory of exported PNGs named by burst key")
    parser.add_argument("report", type=Path, help="Output JSON containing cover dimensions and hashes")
    parser.add_argument("--site", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--edge", type=int, default=640)
    args = parser.parse_args()
    if args.edge < 1:
        parser.error("--edge must be positive")

    nikke = args.site / "nikki"
    catalog = json.loads((nikke / "nikki_chars.json").read_text(encoding="utf-8"))
    keys = sorted({row["burst"]["key"] for row in catalog["characters"] if row.get("burst")})
    missing = [key for key in keys if not (args.png_dir / f"{key}.png").is_file()]
    if missing:
        parser.error(f"Missing {len(missing)} viewer exports: {', '.join(missing)}")

    covers = nikke / "burst-covers"
    covers.mkdir(exist_ok=True)
    report = {}
    for key in keys:
        src = args.png_dir / f"{key}.png"
        with Image.open(src) as png:
            cover, bounds, source_alpha = square_cover(png, args.edge)
            source_size = png.size
        dest = covers / f"{key}.webp"
        cover.save(dest, "WEBP", quality=88, method=4, exact=True)
        with Image.open(dest) as saved:
            saved.load()
            if saved.size != (args.edge, args.edge):
                raise ValueError(f"Invalid cover dimensions in {dest}")
            if saved.convert("RGBA").getchannel("A").tobytes() != cover.getchannel("A").tobytes():
                raise ValueError(f"WebP changed the alpha channel in {dest}")
        report[key] = {
            "sourceSize": source_size,
            "sourceAlpha": source_alpha,
            "sourceVisibleBounds": bounds,
            "sourceSha256": hashlib.sha256(src.read_bytes()).hexdigest(),
            "size": cover.size,
            "visibleBounds": cover.getchannel("A").getbbox(),
            "bytes": dest.stat().st_size,
            "sha256": hashlib.sha256(dest.read_bytes()).hexdigest(),
        }
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Built and verified {len(report)} square NIKKE covers")


if __name__ == "__main__":
    main()
