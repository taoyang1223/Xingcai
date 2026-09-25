"""只负责把各服务的网格放进场景。不包含任何部位的公式。"""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.arm.service import generate as arm
from services.common.mesh import put, to_blender
from services.footwear.service import generate as footwear
from services.head.service import generate as head
from services.leg.service import generate as leg
from services.sculpt.service import smooth_skin
from services.shirt.service import generate as shirt
from services.shorts.service import generate as shorts
from services.skeleton.service import generate as skeleton
from services.texture.service import materials
from services.torso.service import generate as torso
from services.uv.service import apply_all as apply_uv
from services.weight.service import bind

HEIGHT_M = 1.75


def build():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    slots = materials()
    for piece in head(HEIGHT_M) + torso(HEIGHT_M) + arm(HEIGHT_M) + leg(HEIGHT_M) + shirt(HEIGHT_M) + shorts(HEIGHT_M) + footwear(HEIGHT_M):
        obj = put(piece["name"], piece["verts"], piece["faces"], slots[piece["slot"]], piece["subdiv"], piece["thickness"])
        obj["slot"] = piece["slot"]
    _place_armature(skeleton(HEIGHT_M, "pockets"))
    print("sculpt skin", smooth_skin(), flush=True)
    print("uv meshes", apply_uv(), flush=True)
    print("weight bound", bind("Skeleton"), flush=True)
    _light_and_camera()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1200
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = "/tmp/parts_front.png"
    bpy.ops.render.render(write_still=True)
    total = sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH")
    print("services verts", total, flush=True)
    bpy.ops.wm.save_as_mainfile(filepath="/tmp/parts_character.blend")


def _place_armature(spec):
    """把骨骼服务的数据放进场景。绑皮由权重服务单独做。"""
    arm_data = bpy.data.armatures.new(spec["name"])
    arm_obj = bpy.data.objects.new(spec["name"], arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    edit = {}
    for bone in spec["bones"]:
        eb = arm_data.edit_bones.new(bone["name"])
        eb.head = to_blender(bone["head"])
        eb.tail = to_blender(bone["tail"])
        edit[bone["name"]] = eb
    for bone in spec["bones"]:
        parent = bone["parent"]
        if parent:
            edit[bone["name"]].parent = edit[parent]
    bpy.ops.object.mode_set(mode="POSE")
    for name, degrees in spec["pose"].items():
        pose_bone = arm_obj.pose.bones[name]
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = tuple(math.radians(v) for v in degrees)
    bpy.ops.object.mode_set(mode="OBJECT")
    arm_obj.show_in_front = True
    arm_data.display_type = "OCTAHEDRAL"
    print("skeleton bones", len(arm_data.bones), "pose", len(spec["pose"]), flush=True)


def _light_and_camera():
    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.82, 0.83, 0.84, 1)
        bg.inputs["Strength"].default_value = 0.55
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 4.0
    sun_obj = bpy.data.objects.new("Sun", sun)
    bpy.context.collection.objects.link(sun_obj)
    sun_obj.rotation_euler = (math.radians(55), 0.1, math.radians(-25))
    area = bpy.data.lights.new("Fill", "AREA")
    area.energy = 400
    area_obj = bpy.data.objects.new("Fill", area)
    bpy.context.collection.objects.link(area_obj)
    area_obj.location = to_blender((0.8, 1.5, 1.6))
    target = bpy.data.objects.new("Target", None)
    bpy.context.collection.objects.link(target)
    target.location = to_blender((0.0, 0.9, 0.0))
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 48
    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = to_blender((0.15, 0.95, 3.3))
    constraint = cam.constraints.new("TRACK_TO")
    constraint.target = target
    constraint.track_axis = "TRACK_NEGATIVE_Z"
    constraint.up_axis = "UP_Y"
    bpy.context.scene.camera = cam


if __name__ == "__main__":
    build()
