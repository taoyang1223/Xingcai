"""皮肤平滑。用 Smooth 修改器对应雕刻里的平滑笔刷，不进入雕刻模式。"""
import bpy


def smooth(obj, factor=0.2, iterations=1):
    mod = obj.modifiers.new("SculptSmooth", "SMOOTH")
    mod.factor = factor
    mod.iterations = iterations
    index = obj.modifiers.find(mod.name)
    if index > 0:
        obj.modifiers.move(index, 0)
    return mod


def smooth_skin():
    count = 0
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and obj.get("slot") == "skin":
            smooth(obj)
            count += 1
    return count
