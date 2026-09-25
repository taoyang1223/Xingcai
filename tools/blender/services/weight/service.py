"""自动权重。把场景里的网格绑到骨架上，部位服务不参与。"""
import bpy


def bind(armature_name="Skeleton"):
    arm = bpy.data.objects.get(armature_name)
    if arm is None:
        raise RuntimeError("找不到骨架")
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    bound = sum(1 for obj in meshes if any(mod.type == "ARMATURE" for mod in obj.modifiers))
    return bound
