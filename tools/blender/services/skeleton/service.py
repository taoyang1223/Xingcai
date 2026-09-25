"""骨骼。只提供关节位置和姿势，不导入其他部位，也不改它们的网格。"""

# 身高比例。x 右，y 上，z 前。左右对称的骨只写左侧，生成时镜像。
_CHAIN = [
    ("spine", None, (0.00, 0.52, 0.00), (0.00, 0.68, 0.01)),
    ("chest", "spine", (0.00, 0.68, 0.01), (0.00, 0.80, 0.01)),
    ("neck", "chest", (0.00, 0.80, 0.01), (0.00, 0.90, 0.00)),
    ("head", "neck", (0.00, 0.90, 0.00), (0.00, 1.02, 0.00)),
    ("clavicle.L", "chest", (0.02, 0.78, 0.01), (0.16, 0.76, 0.02)),
    ("upper_arm.L", "clavicle.L", (0.18, 0.76, 0.02), (0.20, 0.58, 0.03)),
    ("forearm.L", "upper_arm.L", (0.20, 0.58, 0.03), (0.20, 0.43, 0.04)),
    ("hand.L", "forearm.L", (0.20, 0.43, 0.04), (0.20, 0.36, 0.05)),
    ("thigh.L", "spine", (0.09, 0.52, 0.00), (0.10, 0.28, 0.00)),
    ("shin.L", "thigh.L", (0.10, 0.28, 0.00), (0.10, 0.08, 0.00)),
    ("foot.L", "shin.L", (0.10, 0.08, 0.00), (0.10, 0.04, 0.14)),
]

# 局部欧拉角，度。上臂贴身，前臂折向前，手收到髋侧。
_POCKETS = {
    "upper_arm.L": (-12.0, 0.0, 8.0),
    "forearm.L": (-75.0, 0.0, 0.0),
    "hand.L": (-10.0, 0.0, 0.0),
    "upper_arm.R": (-12.0, 0.0, -8.0),
    "forearm.R": (-75.0, 0.0, 0.0),
    "hand.R": (-10.0, 0.0, 0.0),
}


def _mirror_name(name):
    if name.endswith(".L"):
        return name[:-2] + ".R"
    return None


def _mirror_point(point):
    x, y, z = point
    return (-x, y, z)


def _bones(height_m):
    bones = []
    for name, parent, head, tail in _CHAIN:
        bones.append({
            "name": name,
            "parent": parent,
            "head": (head[0], head[1] * height_m, head[2]),
            "tail": (tail[0], tail[1] * height_m, tail[2]),
        })
        right = _mirror_name(name)
        if right:
            bones.append({
                "name": right,
                "parent": _mirror_name(parent) if parent and parent.endswith(".L") else parent,
                "head": _mirror_point((head[0], head[1] * height_m, head[2])),
                "tail": _mirror_point((tail[0], tail[1] * height_m, tail[2])),
            })
    return bones


def generate(height_m=1.75, pose="pockets"):
    """pose 为 pockets 或 stand。stand 只留直立静息骨。"""
    return {
        "name": "Skeleton",
        "bones": _bones(height_m),
        "pose": _POCKETS if pose == "pockets" else {},
    }
