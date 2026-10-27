"""Prepare private, offline artwork. Never commits the supplied art or archive."""
import argparse
import io
import json
import re
import subprocess
import tempfile
from pathlib import Path, PureWindowsPath

from PIL import Image, ImageOps, ImageDraw

Image.MAX_IMAGE_PIXELS = 40_000_000


def safe_name(name):
    parts = name.replace("\\", "/").split("/")
    return (not PureWindowsPath(name).is_absolute() and len(parts) <= 8
            and all(p and p not in (".", "..") and not p.endswith((".", " "))
                    and not re.search(r'[<>:"|?*\x00-\x1f]', p)
                    and p.split(".")[0].upper() not in
                    {"CON", "PRN", "AUX", "NUL", *[f"COM{i}" for i in range(1, 10)],
                     *[f"LPT{i}" for i in range(1, 10)]} for p in parts))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--sevenzip", default="7z")
    parser.add_argument("--inspect-only", action="store_true")
    args = parser.parse_args()
    listing = subprocess.run([args.sevenzip, "l", "-slt", str(args.archive)],
                             check=True, capture_output=True, encoding="utf-8").stdout
    entries = []
    for block in listing.split("----------\n", 1)[1].split("\n\n"):
        item = dict(line.split(" = ", 1) for line in block.splitlines() if " = " in line)
        if "Path" not in item:
            continue
        if (not safe_name(item["Path"]) or any(item.get(k) for k in
                ("Symbolic Link", "Hard Link", "Copy Link"))
                or item.get("Alternate Stream", "-") != "-"
                or item.get("Encrypted", "-") != "-"):
            raise ValueError("Unsafe archive entry")
        if item.get("Folder") == "+":
            continue
        if int(item["Size"]) > 12 * 1024 * 1024:
            raise ValueError("Image size limit")
        if Path(item["Path"]).suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            raise ValueError("Only raster images accepted")
        entries.append(item)
    if not 1 <= len(entries) <= 20 or sum(int(e["Size"]) for e in entries) > 64 * 1024 * 1024:
        raise ValueError("Archive limits")
    names = [PureWindowsPath(e["Path"]).name.lower() for e in entries]
    if len(names) != len(set(names)):
        raise ValueError("Case-insensitive filename collision")
    images = {}
    # Each exact, validated entry is streamed to memory, never given a disk path by 7-Zip.
    with tempfile.TemporaryDirectory(prefix="port-art-") as temporary:
        tiles = []
        for item in entries:
            result = subprocess.run([args.sevenzip, "e", "-so", "-spd", str(args.archive),
                                     item["Path"]], check=True, capture_output=True, timeout=30)
            if len(result.stdout) != int(item["Size"]):
                raise ValueError("Entry size mismatch")
            image = ImageOps.exif_transpose(Image.open(io.BytesIO(result.stdout))).convert("RGB")
            if min(image.size) < 200:
                raise ValueError("Image resolution too small")
            name = PureWindowsPath(item["Path"]).name
            images[name] = image.copy()
            Path(temporary, name).write_bytes(result.stdout)
            print(json.dumps({"name": name, "dimensions": image.size, "bytes": len(result.stdout)}))
            tile = Image.new("RGB", (440, 290), "#191a21")
            thumb = image.copy()
            thumb.thumbnail((440, 255))
            tile.paste(thumb, ((440 - thumb.width) // 2, 0))
            ImageDraw.Draw(tile).text((10, 266), f"{name} {image.width} x {image.height}", fill="white")
            tiles.append(tile)
        sheet = Image.new("RGB", (1320, 290 * ((len(tiles) + 2) // 3)), "#101116")
        for i, tile in enumerate(tiles):
            sheet.paste(tile, ((i % 3) * 440, (i // 3) * 290))
        private = Path(__file__).resolve().parents[1] / ".local"
        private.mkdir(exist_ok=True)
        sheet.save(private / "art-contact.jpg")
        if args.inspect_only:
            return
        output = Path(__file__).resolve().parents[1] / "src/assets/bloodborne-local"
        output.mkdir(parents=True, exist_ok=True)
        slots = {"hero": ("scr3.png", (1920, 920)),
                 "banner": ("scr1.jpg", (1920, 540)),
                 "cover": ("title.jpg", (640, 960))}
        for slot, (source, size) in slots.items():
            image = images[source]
            # Never upscale source pixels; CSS fits smaller covers proportionally.
            scale = min(1, image.width / size[0], image.height / size[1])
            size = tuple(max(1, round(n * scale)) for n in size)
            ImageOps.fit(image, size, method=Image.Resampling.LANCZOS).save(
                output / f"{slot}.webp", "WEBP", quality=88, method=6)
        for i, source in enumerate(("scr1.jpg", "scr2.jpg", "scr3.png", "scr4.jpg"), 1):
            image = images[source].copy()
            image.thumbnail((1920, 1080), Image.Resampling.LANCZOS)
            image.save(output / f"gallery{i}.webp", "WEBP", quality=88, method=6)
        print(f"Private artwork ready in {output}. Redistribution rights are unconfirmed.")


if __name__ == "__main__":
    main()
