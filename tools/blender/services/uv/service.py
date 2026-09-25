"""圆柱 UV。用高度和绕轴角度写坐标，不依赖视图里的 Unwrap。"""
import math

import bpy


def apply(obj):
    mesh = obj.data
    if mesh.uv_layers.get("UVMap") is None:
        mesh.uv_layers.new(name="UVMap")
    layer = mesh.uv_layers["UVMap"].data
    zs = [vertex.co.z for vertex in mesh.vertices]
    if not zs:
        return 0
    low, high = min(zs), max(zs)
    span = max(high - low, 1e-6)
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            angle = (math.atan2(co.y, co.x) + math.pi) / math.tau
            height = (co.z - low) / span
            layer[loop_index].uv = (angle, height)
    return len(mesh.uv_layers)


def apply_all():
    count = 0
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            apply(obj)
            count += 1
    return count
