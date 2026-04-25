#!/usr/bin/env python3
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
IMAGEGEN_DIR = Path("/Users/ranke0802/.codex/generated_images/019dbe64-1a1c-71c0-afce-a96471dc82b5")

SOURCES = {
    "objects": IMAGEGEN_DIR / "ig_0846ce42e926a55f0169ec1f702f1c819181c9b64c5d503d13.png",
    "tiles": IMAGEGEN_DIR / "ig_0846ce42e926a55f0169ec1fc77a288191bf2cbc5edd5645bc.png",
    "overlays": IMAGEGEN_DIR / "ig_0846ce42e926a55f0169ec2073b7b48191a1a177a2178691f1.png",
    "emotes": IMAGEGEN_DIR / "ig_0846ce42e926a55f0169ec2117d49081919a13952fa39377c6.png",
}


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def open_rgba(path: Path) -> Image.Image:
    if not path.exists():
        raise FileNotFoundError(path)
    return Image.open(path).convert("RGBA")


def save_webp(img: Image.Image, path: Path, *, lossless: bool = False, quality: int = 88) -> None:
    ensure_parent(path)
    img.save(path, "WEBP", lossless=lossless, quality=quality, method=6)


def crop_grid(img: Image.Image, cols: int, rows: int, col: int, row: int) -> Image.Image:
    w, h = img.size
    x0 = round(w * col / cols)
    x1 = round(w * (col + 1) / cols)
    y0 = round(h * row / rows)
    y1 = round(h * (row + 1) / rows)
    return img.crop((x0, y0, x1, y1))


def is_key_green(r: int, g: int, b: int, a: int) -> bool:
    if a <= 8:
        return True
    return g >= 172 and r <= 126 and b <= 126 and g > r * 1.28 and g > b * 1.28


def remove_chroma_green(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    pixels = img.load()
    width, height = img.size

    def is_background_candidate(x: int, y: int) -> bool:
        r, g, b, a = pixels[x, y]
        if a <= 8:
            return True
        return g >= 108 and g > r * 1.08 and g > b * 1.08

    stack = []
    seen = set()
    for x in range(width):
        stack.append((x, 0))
        stack.append((x, height - 1))
    for y in range(height):
        stack.append((0, y))
        stack.append((width - 1, y))

    while stack:
        x, y = stack.pop()
        if x < 0 or x >= width or y < 0 or y >= height:
            continue
        key = (x, y)
        if key in seen or not is_background_candidate(x, y):
            continue
        seen.add(key)
        r, g, b, _ = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)
        stack.append((x + 1, y))
        stack.append((x - 1, y))
        stack.append((x, y + 1))
        stack.append((x, y - 1))

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if is_key_green(r, g, b, a):
                pixels[x, y] = (r, g, b, 0)
    return img


def alpha_bbox(img: Image.Image):
    return img.getchannel("A").point(lambda value: 255 if value > 10 else 0).getbbox()


def trim_alpha(img: Image.Image, padding: int = 8) -> Image.Image:
    bbox = alpha_bbox(img)
    if not bbox:
        return img
    left, top, right, bottom = bbox
    return img.crop((
        max(0, left - padding),
        max(0, top - padding),
        min(img.width, right + padding),
        min(img.height, bottom + padding),
    ))


def fit_transparent_sprite(img: Image.Image, target_size: tuple[int, int], *, max_fill: float = 0.96) -> Image.Image:
    sprite = trim_alpha(remove_chroma_green(img), padding=10)
    target_w, target_h = target_size
    out = Image.new("RGBA", target_size, (0, 0, 0, 0))
    if sprite.width <= 0 or sprite.height <= 0:
        return out
    scale = min((target_w * max_fill) / sprite.width, (target_h * max_fill) / sprite.height)
    next_w = max(1, round(sprite.width * scale))
    next_h = max(1, round(sprite.height * scale))
    resized = sprite.resize((next_w, next_h), Image.Resampling.NEAREST)
    out.alpha_composite(resized, (round((target_w - next_w) / 2), round((target_h - next_h) / 2)))
    return out


def make_objects() -> None:
    img = open_rgba(SOURCES["objects"])
    specs = [
        ("building_witch_cottage.webp", 0, 0, (640, 480), 0.98),
        ("building_moonwell_shop.webp", 1, 0, (640, 480), 0.98),
        ("building_rune_gate.webp", 2, 0, (512, 512), 0.96),
        ("lamp_crystal_post.webp", 3, 0, (256, 384), 0.96),
        ("tree_moon_birch.webp", 0, 1, (384, 512), 0.98),
        ("tree_twisted_lantern.webp", 1, 1, (384, 512), 0.98),
        ("shrub_glow_mushroom.webp", 2, 1, (256, 256), 0.96),
        ("rock_moss_cluster.webp", 3, 1, (384, 256), 0.96),
        ("rock_rune_obelisk.webp", 0, 2, (320, 448), 0.96),
        ("sign_moonwell_crossroads.webp", 1, 2, (320, 256), 0.96),
        ("barricade_broken_wood.webp", 2, 2, (384, 256), 0.96),
        ("fountain_moonwell_plaza.webp", 3, 2, (420, 360), 0.96),
    ]
    for filename, col, row, size, max_fill in specs:
        cell = crop_grid(img, 4, 3, col, row)
        save_webp(
            fit_transparent_sprite(cell, size, max_fill=max_fill),
            ROOT / f"assets/generated/objects/{filename}",
            lossless=False,
            quality=88,
        )


def make_tiles() -> None:
    img = open_rgba(SOURCES["tiles"])
    specs = [
        ("tile_windhill_grass.webp", 0, 0),
        ("tile_moonwell_plaza.webp", 1, 0),
        ("tile_dark_forest_floor.webp", 0, 1),
        ("tile_lantern_dungeon_floor.webp", 1, 1),
    ]
    for filename, col, row in specs:
        cell = crop_grid(img, 2, 2, col, row).resize((512, 512), Image.Resampling.NEAREST)
        save_webp(cell.convert("RGB"), ROOT / f"assets/generated/tiles/{filename}", quality=86)


def make_overlays() -> None:
    img = open_rgba(SOURCES["overlays"])
    specs = [
        ("path_windhill_dirt.webp", 0, 0, (640, 360), 0.98),
        ("path_moonwell_stone.webp", 1, 0, (640, 360), 0.98),
        ("path_dark_forest_moss.webp", 2, 0, (640, 360), 0.98),
        ("path_lantern_dungeon_wood.webp", 0, 1, (640, 360), 0.98),
        ("clearing_grass.webp", 1, 1, (520, 360), 0.96),
        ("portal_landing_rune.webp", 2, 1, (420, 360), 0.96),
    ]
    for filename, col, row, size, max_fill in specs:
        cell = crop_grid(img, 3, 2, col, row)
        save_webp(
            fit_transparent_sprite(cell, size, max_fill=max_fill),
            ROOT / f"assets/generated/overlays/{filename}",
            lossless=False,
            quality=88,
        )


def make_emotes() -> None:
    img = open_rgba(SOURCES["emotes"])
    specs = [
        ("smile.webp", 0),
        ("angry.webp", 1),
        ("love.webp", 2),
        ("cry.webp", 3),
    ]
    for filename, col in specs:
        cell = crop_grid(img, 4, 1, col, 0)
        save_webp(
            fit_transparent_sprite(cell, (192, 192), max_fill=0.94),
            ROOT / f"assets/generated/emotes/{filename}",
            lossless=False,
            quality=88,
        )


def main() -> None:
    make_objects()
    make_tiles()
    make_overlays()
    make_emotes()
    print("Imported imagegen world/object/overlay/emote atlases as runtime WebP assets.")


if __name__ == "__main__":
    main()
