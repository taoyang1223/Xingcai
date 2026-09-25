"""从正面和侧面照片抽出衣服外轮廓，对齐到同一条身高轴。

不引用其他部位。照片只在本机处理。输出是轮廓线，不是贴图，也不写围度。
姿态用本机 ONNX 模型。这台机器上的 MediaPipe 会在 Metal 里中断。
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from rembg import new_session, remove
from rtmlib import Body

# COCO 身体点：鼻子、肩、髋、脚踝。
_NOSE = 0
_L_SHOULDER = 5
_R_SHOULDER = 6
_L_HIP = 11
_R_HIP = 12
_L_ANKLE = 15
_R_ANKLE = 16


def _mask(image, session):
    cut = remove(image.convert("RGB"), session=session)
    alpha = np.array(cut.split()[-1])
    binary = (alpha > 128).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    if n <= 1:
        raise RuntimeError("没有抠出人物")
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return labels == largest


def _pose_estimator():
    return Body(mode="balanced", backend="onnxruntime", device="cpu")


def _best_person(keypoints, scores):
    best = None
    for points, score in zip(keypoints, scores):
        ready = points[score >= 0.3]
        if len(ready) < 4:
            continue
        height = float(ready[:, 1].max() - ready[:, 1].min())
        if best is None or height > best[0]:
            best = (height, points, score)
    if best is None:
        raise RuntimeError("没有检测到人体姿态")
    return best[1], best[2]


def _xy(points, scores, index, min_score=0.3):
    if scores[index] < min_score:
        return None
    return float(points[index][0]), float(points[index][1])


def _mean_xy(points):
    ready = [p for p in points if p is not None]
    if not ready:
        return None
    return (
        sum(p[0] for p in ready) / len(ready),
        sum(p[1] for p in ready) / len(ready),
    )


def _axis(points, scores, mask):
    ys, xs = np.nonzero(mask)
    nose = _xy(points, scores, _NOSE)
    shoulder = _mean_xy([
        _xy(points, scores, _L_SHOULDER),
        _xy(points, scores, _R_SHOULDER),
    ])
    hip = _mean_xy([
        _xy(points, scores, _L_HIP),
        _xy(points, scores, _R_HIP),
    ])
    ankles = [
        p for p in (
            _xy(points, scores, _L_ANKLE),
            _xy(points, scores, _R_ANKLE),
        ) if p is not None
    ]
    if nose is not None and shoulder is not None and shoulder[1] > nose[1]:
        head_top = nose[1] - 0.45 * (shoulder[1] - nose[1])
    else:
        head_top = float(ys.min())
    foot = max(p[1] for p in ankles) if ankles else float(ys.max())
    head_top = max(0.0, min(head_top, foot - 1.0))
    center = shoulder or hip
    center_x = center[0] if center else float(np.median(xs))
    return {
        "head_top": head_top,
        "foot": foot,
        "center_x": center_x,
        "shoulder_y": None if shoulder is None else shoulder[1],
        "hip_y": None if hip is None else hip[1],
    }


def _height_of(y, axis):
    return (axis["foot"] - y) / (axis["foot"] - axis["head_top"])


def _outline(mask, axis):
    """每一行的左右外沿，横轴是相对身高的左右偏移。"""
    height, _ = mask.shape
    span = axis["foot"] - axis["head_top"]
    rows = []
    y = int(max(0, axis["head_top"]))
    foot = min(height - 1, int(axis["foot"]))
    while y <= foot:
        xs = np.flatnonzero(mask[y])
        if xs.size:
            left = (float(xs[0]) - axis["center_x"]) / span
            right = (float(xs[-1]) - axis["center_x"]) / span
            rows.append((_height_of(y, axis), left, right))
        y += 2
    return _smooth(rows)


def _smooth(rows):
    if len(rows) < 5:
        return rows
    left = np.convolve([r[1] for r in rows], np.ones(5) / 5, mode="same")
    right = np.convolve([r[2] for r in rows], np.ones(5) / 5, mode="same")
    return [(rows[i][0], float(left[i]), float(right[i])) for i in range(len(rows))]


def read_view(path, session, pose):
    image = Image.open(path).convert("RGB")
    rgb = np.array(image)
    mask = _mask(image, session)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    keypoints, scores = pose(bgr)
    points, score = _best_person(keypoints, scores)
    axis = _axis(points, score, mask)
    marks = {}
    if axis["shoulder_y"] is not None:
        marks["shoulder"] = _height_of(axis["shoulder_y"], axis)
    if axis["hip_y"] is not None:
        marks["hip"] = _height_of(axis["hip_y"], axis)
    return {"outline": _outline(mask, axis), "marks": marks}


def _panel(draw, box, view, title, font):
    x0, y0, x1, y1 = box
    draw.rectangle(box, outline=(180, 180, 180))
    draw.text((x0 + 12, y0 + 10), title, fill=(20, 20, 20), font=font)
    h0, h1 = 0.35, 1.02
    plot_top, plot_bottom = y0 + 36, y1 - 16

    def px(offset):
        return x0 + (offset + 0.28) / 0.56 * (x1 - x0)

    def py(height):
        return plot_top + (h1 - height) / (h1 - h0) * (plot_bottom - plot_top)

    for step in range(8):
        height = 0.40 + step * 0.08
        yy = py(height)
        draw.line([(x0 + 36, yy), (x1 - 8, yy)], fill=(226, 226, 226))
        draw.text((x0 + 6, yy - 6), f"{height:.2f}", fill=(130, 130, 130), font=font)
    for offset in (-0.2, -0.1, 0.0, 0.1, 0.2):
        xx = px(offset)
        draw.line([(xx, plot_top), (xx, plot_bottom)], fill=(226, 226, 226))
    draw.line([(px(0), plot_top), (px(0), plot_bottom)], fill=(80, 80, 80))

    pts = [(h, left, right) for h, left, right in view["outline"] if h0 <= h <= h1]
    if len(pts) > 2:
        draw.line([(px(left), py(h)) for h, left, _ in pts], fill=(180, 40, 40), width=2)
        draw.line([(px(right), py(h)) for h, _, right in pts], fill=(180, 40, 40), width=2)
    for name, height in view["marks"].items():
        if not (h0 <= height <= h1):
            continue
        yy = py(height)
        draw.line([(x0 + 36, yy), (x1 - 8, yy)], fill=(20, 90, 160), width=1)
        draw.text((x1 - 78, yy - 12), name, fill=(20, 90, 160), font=font)


def render(front, side, dest):
    session = new_session("u2net")
    pose = _pose_estimator()
    views = (
        read_view(front, session, pose),
        read_view(side, session, pose),
    )
    canvas = Image.new("RGB", (980, 1180), (245, 245, 242))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    _panel(draw, (30, 30, 470, 1140), views[0], "front  clothing outline", font)
    _panel(draw, (510, 30, 950, 1140), views[1], "side  clothing outline", font)
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dest)
    return dest


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[4]
    out = render(
        root / "9af22efc0d7eb17afd7303c85e4f35fb.jpg",
        root / "d4945466e6226bab18c9b9badc9ca60f.jpg",
        "/tmp/torso_grid.png",
    )
    print("grid", out)
