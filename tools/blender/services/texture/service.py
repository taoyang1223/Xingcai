"""程序纹理。噪声进 Principled BSDF，不读取照片。"""
import bpy


def _noisy(name, color, rough, scale):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = 0.0
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 4.0
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs["Factor"].default_value = 0.18
    mix.inputs["A"].default_value = (*color, 1)
    links.new(noise.outputs["Color"], mix.inputs["B"])
    links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    return material


def materials():
    return {
        "skin": _noisy("Skin", (0.62, 0.45, 0.36), 0.7, 6.0),
        "hair": _noisy("Hair", (0.02, 0.02, 0.025), 0.55, 18.0),
        "cloth": _noisy("Cloth", (0.04, 0.04, 0.045), 0.92, 12.0),
        "sock": _noisy("Sock", (0.92, 0.92, 0.90), 0.75, 20.0),
        "shoe": _noisy("Shoe", (0.10, 0.32, 0.82), 0.5, 10.0),
        "sole": _noisy("Sole", (0.90, 0.90, 0.88), 0.6, 8.0),
        "eye": _noisy("Eye", (0.08, 0.08, 0.09), 0.3, 4.0),
    }
