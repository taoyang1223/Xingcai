"""正面和侧面素描网格。外轮廓来自本机抠图，正面衣身来自本机衣服分割。

不引用其他部位。照片只在本机处理。头只留外轮廓，不画面部。
"""
import sys
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import service as outline

_MODEL = Path.home() / ".cache" / "fitme-outline" / "segformer_b2_clothes.onnx"
_UPPER = 4
_MEAN = np.array([0.485, 0.456, 0.406], np.float32)
_STD = np.array([0.229, 0.224, 0.225], np.float32)
_KNEE_L = 13
_KNEE_R = 14


def _parse(session, rgb):
    height, width = rgb.shape[:2]
    resized = cv2.resize(rgb, (512, 512), interpolation=cv2.INTER_LINEAR)
    values = resized.astype(np.float32) / 255.0
    values = (values - _MEAN) / _STD
    values = np.transpose(values, (2, 0, 1))[None]
    logits = session.run(None, {"input": values})[0][0]
    logits = np.transpose(logits, (1, 2, 0))
    logits = cv2.resize(logits, (width, height), interpolation=cv2.INTER_LINEAR)
    return logits.argmax(axis=2).astype(np.uint8)


def _shirt_column(shirt):
    """正面衣身：连在一起的袖子按衣身下半段的宽度裁掉。"""
    column = np.zeros(shirt.shape, bool)
    rows = np.flatnonzero(shirt.any(axis=1))
    if rows.size == 0:
        return column
    y0, y1 = int(rows[0]), int(rows[-1])
    span = max(1, y1 - y0)
    centers = []
    widths = []
    for y in range(y1 - span // 3, y1 + 1):
        xs = np.flatnonzero(shirt[y])
        if xs.size:
            centers.append(int(np.median(xs)))
            widths.append(int(xs[-1] - xs[0]))
    center_x = int(np.median(centers)) if centers else shirt.shape[1] // 2
    ref = int(np.median(widths)) if widths else 40
    for y in range(y0, y1 + 1):
        xs = np.flatnonzero(shirt[y])
        if xs.size < 4:
            continue
        if xs[-1] - xs[0] > ref * 1.05:
            half = ref // 2
            lo = max(int(xs[0]), center_x - half)
            hi = min(int(xs[-1]), center_x + half)
            column[y, lo:hi + 1] = True
        else:
            column[y, int(xs[0]):int(xs[-1]) + 1] = True
    return column


def _edges(mask, axis):
    rows = outline._outline(mask, axis)
    kept = [(h, left, right) for h, left, right in rows if 0.0 <= h <= 1.05]
    return outline._smooth(kept)


def _support_leg(points, scores):
    legs = []
    for hip_i, knee_i, ank_i in ((11, 13, 15), (12, 14, 16)):
        hip = outline._xy(points, scores, hip_i, 0.25)
        knee = outline._xy(points, scores, knee_i, 0.25)
        ank = outline._xy(points, scores, ank_i, 0.25)
        if hip and knee and ank:
            legs.append((hip, knee, ank))
    if not legs:
        return None

    def rank(leg):
        hip, knee, ank = leg
        lean = abs(ank[0] - hip[0]) + 0.35 * abs(knee[0] - hip[0])
        return lean - ank[1] * 0.15

    return min(legs, key=rank)


def _keep_support(mask, leg):
    if leg is None:
        return mask
    hip, knee, ank = leg
    radius = mask.shape[0] * 0.033
    hip_y = int(min(hip[1], knee[1], ank[1]))
    out = mask.copy()
    height, width = mask.shape
    yy, xx = np.mgrid[0:height, 0:width]
    dist = np.full(mask.shape, 1e9, np.float32)
    for start, end in ((hip, knee), (knee, ank)):
        for t in np.linspace(0, 1, 40):
            x = start[0] * (1 - t) + end[0] * t
            y = start[1] * (1 - t) + end[1] * t
            dist = np.minimum(dist, (xx - x) ** 2 + (yy - y) ** 2)
    out[(yy > hip_y) & (dist > radius * radius)] = False
    return out


def _fit(rgb, height=900):
    scale = height / rgb.shape[0]
    return cv2.resize(rgb, (int(rgb.shape[1] * scale), height), interpolation=cv2.INTER_AREA)


def _view(path, session, pose, clothes, support=False):
    rgb = _fit(np.array(Image.open(path).convert("RGB")))
    mask = outline._mask(Image.fromarray(rgb), session)
    keypoints, scores = pose(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    points, score = outline._best_person(keypoints, scores)
    if support:
        mask = _keep_support(mask, _support_leg(points, score))
    axis = outline._axis(points, score, mask)
    marks = {}
    if axis["shoulder_y"] is not None:
        marks["shoulder"] = outline._height_of(axis["shoulder_y"], axis)
    if axis["hip_y"] is not None:
        marks["hip"] = outline._height_of(axis["hip_y"], axis)
    knee = outline._mean_xy([
        outline._xy(points, score, _KNEE_L),
        outline._xy(points, score, _KNEE_R),
    ])
    if knee is not None:
        marks["knee"] = outline._height_of(knee[1], axis)
    shirt = None
    if clothes is not None:
        labels = _parse(clothes, rgb)
        shirt = _edges(_shirt_column(labels == _UPPER), axis)
    return {"outer": _edges(mask, axis), "shirt": shirt, "marks": marks}


def _panel(draw, box, view, title, font):
    x0, y0, x1, y1 = box
    draw.rectangle([x0, y0, x1, y1], outline=(190, 190, 190))
    draw.text((x0 + 12, y0 + 8), title, fill=(30, 30, 30), font=font)
    top, bottom = y0 + 28, y1 - 12

    def px(offset):
        return x0 + 28 + (offset + 0.32) / 0.64 * (x1 - x0 - 36)

    def py(height):
        return top + (1.02 - height) / 1.02 * (bottom - top)

    for step in range(11):
        height = step / 10
        yy = py(height)
        draw.line([(x0 + 28, yy), (x1 - 8, yy)], fill=(226, 226, 226))
        draw.text((x0 + 4, yy - 6), f"{height:.1f}", fill=(140, 140, 140), font=font)
    for offset in (-0.2, -0.1, 0.0, 0.1, 0.2):
        draw.line([(px(offset), top), (px(offset), bottom)], fill=(226, 226, 226))
    draw.line([(px(0), top), (px(0), bottom)], fill=(90, 90, 90))

    def stroke(rows, color, width):
        if not rows or len(rows) < 2:
            return
        draw.line([(px(left), py(h)) for h, left, _ in rows], fill=color, width=width)
        draw.line([(px(right), py(h)) for h, _, right in rows], fill=color, width=width)

    stroke(view["outer"], (35, 35, 35), 2)
    stroke(view["shirt"], (30, 90, 170), 2)
    for name, height in view["marks"].items():
        yy = py(height)
        draw.line([(x0 + 28, yy), (x1 - 8, yy)], fill=(180, 80, 40), width=1)
        draw.text((x1 - 70, yy - 11), name, fill=(180, 80, 40), font=font)


def render(front, side, dest):
    session = outline.new_session("isnet-general-use")
    pose = outline._pose_estimator()
    clothes = ort.InferenceSession(str(_MODEL), providers=["CPUExecutionProvider"])
    front_view = _view(front, session, pose, clothes)
    side_view = _view(side, session, pose, None, support=True)
    canvas = Image.new("RGB", (1040, 1280), (250, 248, 244))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    _panel(draw, (24, 36, 500, 1248), front_view, "front", font)
    _panel(draw, (528, 36, 1004, 1248), side_view, "side", font)
    draw.rectangle((24, 8, 44, 24), fill=(35, 35, 35))
    draw.text((50, 8), "outer", fill=(35, 35, 35), font=font)
    draw.rectangle((120, 8, 140, 24), fill=(30, 90, 170))
    draw.text((146, 8), "front shirt body", fill=(30, 90, 170), font=font)
    dest = Path(dest)
    canvas.save(dest)
    return dest


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[4]
    out = render(
        root / "9af22efc0d7eb17afd7303c85e4f35fb.jpg",
        root / "d4945466e6226bab18c9b9badc9ca60f.jpg",
        "/tmp/turnaround_sketch.png",
    )
    print("sketch", out)
