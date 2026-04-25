#!/usr/bin/env python3
from pathlib import Path
import math
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMAGEGEN_DIR = Path("/Users/ranke0802/.codex/generated_images/019dbe64-1a1c-71c0-afce-a96471dc82b5")

SOURCES = {
    "yurika": IMAGEGEN_DIR / "ig_04e67614677487290169ec3456c32c8191b2f6772061c28cf7.png",
    "father": IMAGEGEN_DIR / "ig_0b1e8b80cdf920470169ec034e911c81918665e3ffe936f445.png",
    "portraits": IMAGEGEN_DIR / "ig_0b1e8b80cdf920470169ec00cf74448191b34a2834884417be.png",
    "objects": IMAGEGEN_DIR / "ig_0b1e8b80cdf920470169ebffd90ff88191813270d4f41dcd93.png",
    "props": IMAGEGEN_DIR / "ig_0d2d4ac1c0d0106b0169ec8c36a9d481919091a54f58f2f5d7.png",
    "backgrounds": IMAGEGEN_DIR / "ig_0b1e8b80cdf920470169ec001b14ac8191933a36712590cf39.png",
    "guardian_oath": IMAGEGEN_DIR / "ig_031bc587f32943e20169ec8935dfb48191b239fe7769c90a8c.png",
    "monsters": IMAGEGEN_DIR / "ig_0b1e8b80cdf920470169ec02d83dc08191aa659b698ca94384.png",
    "lantern_watcher_boss": IMAGEGEN_DIR / "ig_0d2d4ac1c0d0106b0169ec8cb7542481919f8d0c8c49c40dc6.png",
    "golden_flower_slime": IMAGEGEN_DIR / "ig_0d2d4ac1c0d0106b0169ec909179848191ab953f1cfad9f35e.png",
    "magma_rock_slime": IMAGEGEN_DIR / "ig_0d2d4ac1c0d0106b0169ec90f0ed28819197177ca0a9ecab7f.png",
}


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def open_rgba(path: Path) -> Image.Image:
    if not path.exists():
        raise FileNotFoundError(path)
    return Image.open(path).convert("RGBA")


def remove_white_background(img: Image.Image, threshold: int = 244) -> Image.Image:
    img = img.convert("RGBA")
    pixels = img.load()
    width, height = img.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            is_white = r >= threshold and g >= threshold and b >= threshold and max(r, g, b) - min(r, g, b) <= 18
            is_green = (
                (g >= 150 and r <= 120 and b <= 120 and g > r * 1.2 and g > b * 1.2)
                or (g >= 24 and r < 100 and b < 100 and g >= r + 8 and g >= b + 8)
            )
            if is_white or is_green:
                pixels[x, y] = (r, g, b, 0)
    return img


def is_sheet_background_pixel(r: int, g: int, b: int, a: int, threshold: int = 236) -> bool:
    if a <= 8:
        return True
    high = max(r, g, b)
    low = min(r, g, b)
    spread = high - low
    is_white = r >= threshold and g >= threshold and b >= threshold and max(r, g, b) - min(r, g, b) <= 26
    is_neutral_light = low >= 176 and spread <= 84
    is_green = (
        g >= 92 and g > r * 1.08 and g > b * 1.08
    ) or (
        g >= 24 and r < 100 and b < 100 and g >= r + 8 and g >= b + 8
    )
    return is_white or is_neutral_light or is_green


def remove_sheet_background(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    pixels = img.load()
    width, height = img.size
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
        if key in seen:
            continue
        r, g, b, a = pixels[x, y]
        if not is_sheet_background_pixel(r, g, b, a):
            continue
        seen.add(key)
        pixels[x, y] = (r, g, b, 0)
        stack.append((x + 1, y))
        stack.append((x - 1, y))
        stack.append((x, y + 1))
        stack.append((x, y - 1))

    return remove_white_background(img, threshold=236)


def remove_border_background(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    pixels = img.load()
    width, height = img.size
    if width <= 0 or height <= 0:
        return img

    def is_background_candidate(pixel) -> bool:
        r, g, b, a = pixel
        if a <= 8:
            return True
        high = max(r, g, b)
        low = min(r, g, b)
        spread = high - low
        if r >= 238 and g >= 238 and b >= 238:
            return True
        if high >= 178 and spread <= 92:
            return True
        if high >= 150 and low >= 92 and spread <= 68:
            return True
        return False

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
        if key in seen:
            continue
        if not is_background_candidate(pixels[x, y]):
            continue
        seen.add(key)
        r, g, b, _ = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)
        stack.append((x + 1, y))
        stack.append((x - 1, y))
        stack.append((x, y + 1))
        stack.append((x, y - 1))

    return remove_white_background(img)


def alpha_bbox(img: Image.Image):
    alpha = img.getchannel("A")
    return alpha.point(lambda a: 255 if a > 8 else 0).getbbox()


def trim_alpha(img: Image.Image) -> Image.Image:
    bbox = alpha_bbox(img)
    if not bbox:
        return img
    return img.crop(bbox)


def save_webp(img: Image.Image, path: Path, *, lossless: bool = True, quality: int = 88) -> None:
    ensure_parent(path)
    img.save(path, "WEBP", lossless=lossless, quality=quality, method=6)


def fit_sprite(
    img: Image.Image,
    target_size=(256, 256),
    *,
    target_height=None,
    bottom_margin=14,
    max_fill=0.92,
) -> Image.Image:
    img = trim_alpha(remove_border_background(img))
    target_w, target_h = target_size
    out = Image.new("RGBA", target_size, (0, 0, 0, 0))
    if img.width <= 0 or img.height <= 0:
        return out

    if target_height:
        scale = target_height / img.height
        scale = min(scale, (target_w * max_fill) / img.width)
    else:
        scale = min((target_w * max_fill) / img.width, (target_h * max_fill) / img.height)
    next_w = max(1, round(img.width * scale))
    next_h = max(1, round(img.height * scale))
    resized = img.resize((next_w, next_h), Image.Resampling.NEAREST)
    x = round((target_w - next_w) / 2)
    y = target_h - next_h - bottom_margin
    if y < 0:
        y = round((target_h - next_h) / 2)
    out.alpha_composite(resized, (x, y))
    return out


def content_bbox_on_white(
    img: Image.Image,
    threshold: int = 236,
    keep_largest: bool = False,
    prefer_grounded: bool = False,
):
    img = img.convert("RGBA")
    pixels = img.load()
    width, height = img.size

    def is_foreground(x: int, y: int) -> bool:
        r, g, b, a = pixels[x, y]
        if a <= 8:
            return False
        is_white = r >= threshold and g >= threshold and b >= threshold
        is_green = g >= 150 and r <= 130 and b <= 130 and g > r * 1.18 and g > b * 1.18
        return not (is_white or is_green)

    if keep_largest:
        seen = set()
        best = None
        for sy in range(height):
            for sx in range(width):
                if (sx, sy) in seen or not is_foreground(sx, sy):
                    continue
                stack = [(sx, sy)]
                seen.add((sx, sy))
                count = 0
                min_x, min_y = sx, sy
                max_x, max_y = sx, sy
                while stack:
                    x, y = stack.pop()
                    count += 1
                    min_x = min(min_x, x)
                    min_y = min(min_y, y)
                    max_x = max(max_x, x)
                    max_y = max(max_y, y)
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                        if nx < 0 or nx >= width or ny < 0 or ny >= height:
                            continue
                        key = (nx, ny)
                        if key in seen or not is_foreground(nx, ny):
                            continue
                        seen.add(key)
                        stack.append(key)
                if count < 16:
                    continue
                score = count
                if prefer_grounded:
                    # Spell/action rows often include detached projectiles.
                    # Prefer the component that is visually standing on the cell floor.
                    bottom_ratio = max_y / max(1, height)
                    score = count * (0.35 + bottom_ratio) + max_y * 18 - min_y * 0.4
                if best is None or score > best[0]:
                    best = (score, min_x, min_y, max_x, max_y)
        if best:
            _, min_x, min_y, max_x, max_y = best
            return (min_x, min_y, max_x + 1, max_y + 1)
        return None

    min_x, min_y = width, height
    max_x, max_y = 0, 0
    found = False
    for y in range(height):
        for x in range(width):
            if not is_foreground(x, y):
                continue
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
            found = True
    return (min_x, min_y, max_x + 1, max_y + 1) if found else None


def fit_sprite_on_white(
    img: Image.Image,
    target_size=(256, 256),
    *,
    target_height=None,
    bottom_margin=14,
    max_fill=0.92,
    keep_largest=False,
    prefer_grounded=False,
) -> Image.Image:
    bbox = content_bbox_on_white(img, keep_largest=keep_largest, prefer_grounded=prefer_grounded)
    target_w, target_h = target_size
    out = Image.new("RGBA", target_size, (0, 0, 0, 0))
    if not bbox:
        return out
    sprite = remove_sheet_background(img.convert("RGBA").crop(bbox))
    if target_height:
        scale = target_height / sprite.height
        scale = min(scale, (target_w * max_fill) / sprite.width)
    else:
        scale = min((target_w * max_fill) / sprite.width, (target_h * max_fill) / sprite.height)
    next_w = max(1, round(sprite.width * scale))
    next_h = max(1, round(sprite.height * scale))
    resized = sprite.resize((next_w, next_h), Image.Resampling.NEAREST)
    x = round((target_w - next_w) / 2)
    y = target_h - next_h - bottom_margin
    if y < 0:
        y = round((target_h - next_h) / 2)
    out.alpha_composite(resized, (x, y))
    return out


def crop_grid(img: Image.Image, cols: int, rows: int, col: int, row: int) -> Image.Image:
    w, h = img.size
    x0 = round(w * col / cols)
    x1 = round(w * (col + 1) / cols)
    y0 = round(h * row / rows)
    y1 = round(h * (row + 1) / rows)
    return img.crop((x0, y0, x1, y1))


def get_character_row_target_height(base_height: int, row: int) -> int:
    if base_height >= 210:
        return 212
    return base_height


def make_character_sheet(source: Path, out_path: Path, *, target_height: int) -> None:
    source_img = open_rgba(source)
    out = Image.new("RGBA", (256 * 8, 256 * 5), (0, 0, 0, 0))
    # Imagegen keeps the sheet visually gridded, but the vertical gutters are
    # not perfectly even. Use measured row windows so a frame never includes
    # the next row's head/hat.
    if source_img.width == 1536 and source_img.height == 1024:
        row_ranges = [
            (round(source_img.height * row / 5), round(source_img.height * (row + 1) / 5))
            for row in range(5)
        ]
    else:
        row_ranges = [
            (0, 176),
            (204, 350),
            (360, 548),
            (505, 700),
            (755, source_img.height),
        ]
    for row in range(5):
        y0, y1 = row_ranges[row]
        for col in range(8):
            source_col = [0, 1, 0, 2, 0, 1, 0, 2][col] if row == 4 else col
            x0 = round(source_img.width * source_col / 8)
            x1 = round(source_img.width * (source_col + 1) / 8)
            cell = source_img.crop((x0, y0, x1, y1))
            if row == 4:
                # Use the actor pose from the generated action row, but remove
                # detached spell/projectile art. Runtime skill renderers own VFX.
                actor_cutoff = 0.74 if target_height >= 210 else 0.8
                cell = cell.crop((0, 0, round(cell.width * actor_cutoff), cell.height))
            # Keep the body footprint stable. Detached spell bursts are handled
            # by the runtime skill renderers, so they should not resize the actor.
            sprite = fit_sprite_on_white(
                cell,
                target_height=get_character_row_target_height(target_height, row),
                bottom_margin=16,
                max_fill=0.88,
                keep_largest=True,
                prefer_grounded=row == 4,
            )
            out.alpha_composite(sprite, (col * 256, row * 256))
    save_webp(out, out_path, lossless=False, quality=88)


def make_yurika_portraits(source: Path) -> None:
    source_img = open_rgba(source)
    names = ["smile", "anxious", "frightened"]
    for col, name in enumerate(names):
        cell = crop_grid(source_img, 3, 1, col, 0)
        portrait = fit_sprite(cell, (512, 512), max_fill=0.96, bottom_margin=0)
        save_webp(portrait, ROOT / f"assets/generated/characters/yurika_portrait_{name}.webp")


def cover_crop(img: Image.Image, ratio: float) -> Image.Image:
    w, h = img.size
    current = w / h
    if current > ratio:
        next_w = round(h * ratio)
        x0 = round((w - next_w) / 2)
        return img.crop((x0, 0, x0 + next_w, h))
    next_h = round(w / ratio)
    y0 = round((h - next_h) / 2)
    return img.crop((0, y0, w, y0 + next_h))


def save_background(panel: Image.Image, concept_path: str, loading_path=None) -> None:
    crop = cover_crop(panel.convert("RGBA"), 16 / 9)
    concept = crop.resize((1280, 720), Image.Resampling.NEAREST)
    save_webp(concept, ROOT / concept_path, lossless=False, quality=82)
    if loading_path:
        loading = crop.resize((960, 540), Image.Resampling.NEAREST)
        save_webp(loading, ROOT / loading_path, lossless=False, quality=80)


def save_full_scene_background(source: Path) -> None:
    img = open_rgba(source)
    crop = cover_crop(img, 16 / 9)
    opening = crop.resize((1600, 900), Image.Resampling.NEAREST)
    prologue = crop.resize((1280, 720), Image.Resampling.NEAREST)
    loading = crop.resize((960, 540), Image.Resampling.NEAREST)
    save_webp(opening, ROOT / "assets/generated/backgrounds/opening_guardian_oath.webp", lossless=False, quality=78)
    save_webp(prologue, ROOT / "assets/generated/backgrounds/prologue_guardian_oath.webp", lossless=False, quality=78)
    save_webp(loading, ROOT / "assets/generated/loading/loading_guardian_oath.webp", lossless=False, quality=76)


def make_backgrounds(source: Path) -> None:
    source_img = open_rgba(source)
    panels = [crop_grid(source_img, 2, 2, col, row) for row in range(2) for col in range(2)]
    save_background(
        panels[0],
        "assets/generated/concepts/zone_1_windhill.webp",
        "assets/generated/backgrounds/prologue_lantern_forest_path.webp",
    )
    save_background(
        panels[1],
        "assets/generated/concepts/town_moonwell.webp",
        "assets/generated/loading/loading_moonwell_town_gate.webp",
    )
    save_background(
        panels[2],
        "assets/generated/concepts/field_dark_forest.webp",
        "assets/generated/loading/loading_lantern_woods.webp",
    )
    save_background(
        panels[3],
        "assets/generated/concepts/dungeon_lantern_woods.webp",
        "assets/generated/loading/loading_ash_rune_cavern.webp",
    )
    save_background(
        panels[3],
        "assets/generated/backgrounds/opening_moonwell_ruins.webp",
    )
    save_full_scene_background(SOURCES["guardian_oath"])


def save_object(source_img: Image.Image, box, out_rel: str, size) -> None:
    crop = source_img.crop(box)
    sprite = fit_sprite(crop, size, max_fill=0.94, bottom_margin=4)
    save_webp(sprite, ROOT / out_rel)


def make_objects(source: Path) -> None:
    img = open_rgba(source)
    save_object(img, (35, 20, 405, 340), "assets/generated/objects/building_witch_cottage.webp", (640, 480))
    save_object(img, (430, 20, 835, 350), "assets/generated/objects/building_moonwell_shop.webp", (640, 480))
    save_object(img, (850, 20, 1230, 360), "assets/generated/objects/building_rune_gate.webp", (512, 512))
    save_object(img, (20, 350, 285, 635), "assets/generated/objects/tree_moon_birch.webp", (384, 512))
    save_object(img, (300, 330, 595, 650), "assets/generated/objects/tree_twisted_lantern.webp", (384, 512))
    save_object(img, (610, 375, 835, 600), "assets/generated/objects/rock_moss_cluster.webp", (384, 256))
    save_object(img, (835, 345, 1010, 625), "assets/generated/objects/rock_rune_obelisk.webp", (320, 448))
    save_object(img, (1010, 385, 1160, 610), "assets/generated/objects/sign_moonwell_crossroads.webp", (320, 256))
    save_object(img, (1135, 350, 1248, 650), "assets/generated/objects/lamp_crystal_post.webp", (256, 384))
    save_object(img, (0, 640, 280, 835), "assets/generated/objects/shrub_glow_mushroom.webp", (256, 256))


def component_boxes(img: Image.Image, *, min_pixels: int = 1024):
    alpha = img.getchannel("A")
    width, height = img.size
    pixels = alpha.load()
    seen = set()
    boxes = []

    for sy in range(height):
        for sx in range(width):
            if (sx, sy) in seen or pixels[sx, sy] <= 8:
                continue
            stack = [(sx, sy)]
            seen.add((sx, sy))
            min_x = max_x = sx
            min_y = max_y = sy
            count = 0
            while stack:
                x, y = stack.pop()
                count += 1
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if nx < 0 or nx >= width or ny < 0 or ny >= height:
                        continue
                    key = (nx, ny)
                    if key in seen or pixels[nx, ny] <= 8:
                        continue
                    seen.add(key)
                    stack.append(key)
            if count >= min_pixels:
                boxes.append((min_x, min_y, max_x + 1, max_y + 1, count))

    boxes.sort(key=lambda box: box[4], reverse=True)
    return boxes


def make_generated_props(source: Path) -> None:
    img = remove_white_background(open_rgba(source), threshold=236)
    boxes = component_boxes(img)
    props = sorted(boxes[:3], key=lambda box: box[0])
    if len(props) < 3:
        raise RuntimeError(f"Expected three generated props, found {len(props)}")

    outputs = [
        ("assets/generated/objects/sign_moonwell_crossroads.webp", (320, 256), 0.94),
        ("assets/generated/objects/barricade_broken_wood.webp", (448, 256), 0.94),
        ("assets/generated/objects/rock_rune_marker.webp", (256, 320), 0.92),
    ]
    for box, (out_rel, size, max_fill) in zip(props, outputs):
        x0, y0, x1, y1, _ = box
        pad = 10
        crop = img.crop((
            max(0, x0 - pad),
            max(0, y0 - pad),
            min(img.width, x1 + pad),
            min(img.height, y1 + pad),
        ))
        sprite = fit_sprite(crop, size, max_fill=max_fill, bottom_margin=4)
        save_webp(sprite, ROOT / out_rel, lossless=False, quality=88)


def animate_monster_idle_frame(sprite: Image.Image, frame_index: int, total_frames: int) -> Image.Image:
    bbox = alpha_bbox(sprite)
    if not bbox:
        return sprite

    crop = sprite.crop(bbox)
    phase = math.sin((frame_index / total_frames) * math.tau)
    lift = round(-2 - max(0, phase) * 3)
    scale_x = 1 + (-phase * 0.018)
    scale_y = 1 + (phase * 0.024)
    next_w = max(1, round(crop.width * scale_x))
    next_h = max(1, round(crop.height * scale_y))
    resized = crop.resize((next_w, next_h), Image.Resampling.NEAREST)

    out = Image.new("RGBA", sprite.size, (0, 0, 0, 0))
    base_center = (bbox[0] + bbox[2]) / 2
    base_bottom = bbox[3]
    x = round(base_center - next_w / 2)
    y = round(base_bottom - next_h + lift)
    x = max(0, min(sprite.width - next_w, x))
    y = max(0, min(sprite.height - next_h, y))
    out.alpha_composite(resized, (x, y))
    return out


def make_monster_frames(source: Path) -> None:
    img = open_rgba(source)
    rows = [
        ("golden_flower_slime", 148, 0.88),
        ("magma_rock_slime", 158, 0.9),
        ("tiny_lantern_wisp", 180, 0.86),
        ("lantern_scarecrow_mage", 230, 0.94),
        ("lantern_watcher_boss", 238, 0.96),
    ]
    aliases = {}
    frame_total = 8
    for row, (monster_id, target_h, max_fill) in enumerate(rows):
        frames = []
        for frame_index in range(frame_total):
            # The generated monster columns are stylistically related but not
            # motion-consistent; cycling them causes ugly size popping. Use one
            # strong source pose and create motion with controlled transforms.
            col = 0
            cell = crop_grid(img, 4, 5, col, row)
            sprite = fit_sprite_on_white(cell, target_height=target_h, bottom_margin=10, max_fill=max_fill)
            animated = animate_monster_idle_frame(sprite, frame_index, frame_total)
            frames.append(animated)
            save_webp(animated, ROOT / f"assets/resource/animated_monsters/{monster_id}/idle_{frame_index + 1:02d}.webp", lossless=False, quality=88)
        for alias in aliases.get(monster_id, []):
            for col, frame in enumerate(frames):
                save_webp(frame, ROOT / f"assets/resource/animated_monsters/{alias}/idle_{col + 1:02d}.webp", lossless=False, quality=88)


def make_lantern_watcher_boss_frames(source: Path) -> None:
    img = open_rgba(source)
    frame_total = 8
    for frame_index in range(frame_total):
        cell = crop_grid(img, frame_total, 1, frame_index, 0)
        sprite = fit_sprite_on_white(
            cell,
            target_height=238,
            bottom_margin=8,
            max_fill=0.94,
            keep_largest=True,
        )
        save_webp(
            sprite,
            ROOT / f"assets/resource/animated_monsters/lantern_watcher_boss/idle_{frame_index + 1:02d}.webp",
            lossless=False,
            quality=88,
        )


def make_single_row_monster_frames(
    source: Path,
    out_dir: str,
    *,
    target_height: int,
    max_fill: float = 0.9,
) -> None:
    img = open_rgba(source)
    frame_total = 8
    for frame_index in range(frame_total):
        cell = crop_grid(img, frame_total, 1, frame_index, 0)
        sprite = fit_sprite_on_white(
            cell,
            target_height=target_height,
            bottom_margin=10,
            max_fill=max_fill,
            keep_largest=True,
        )
        save_webp(
            sprite,
            ROOT / f"assets/resource/animated_monsters/{out_dir}/idle_{frame_index + 1:02d}.webp",
            lossless=False,
            quality=88,
        )


def main() -> None:
    make_character_sheet(SOURCES["yurika"], ROOT / "assets/generated/characters/yurika_spritesheet.webp", target_height=184)
    make_character_sheet(SOURCES["father"], ROOT / "assets/generated/characters/father_spritesheet.webp", target_height=218)
    make_yurika_portraits(SOURCES["portraits"])
    make_backgrounds(SOURCES["backgrounds"])
    make_objects(SOURCES["objects"])
    make_generated_props(SOURCES["props"])
    make_monster_frames(SOURCES["monsters"])
    make_single_row_monster_frames(SOURCES["golden_flower_slime"], "golden_flower_slime", target_height=150, max_fill=0.9)
    make_single_row_monster_frames(SOURCES["magma_rock_slime"], "magma_rock_slime", target_height=156, max_fill=0.92)
    make_lantern_watcher_boss_frames(SOURCES["lantern_watcher_boss"])
    print("Imported imagegen pixel assets as WebP runtime assets.")


if __name__ == "__main__":
    main()
