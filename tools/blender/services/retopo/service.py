"""体素重铺。手册说明它不适合作为会变形角色的最终布线，所以只提供函数，总装默认不调用。"""


def remesh(obj, voxel_size=0.02):
    mod = obj.modifiers.new("Retopo", "REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = voxel_size
    return mod
