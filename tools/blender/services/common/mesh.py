"""坐标、扫掠和材质。逻辑坐标 x 右、y 上、z 前；Blender 为 (x, -z, y)。"""
import math
import bpy


def to_blender(p):
    x, y, z = p
    return (x, -z, y)


def vadd(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def vsub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def vmul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def vdot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def vcross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def vlen(a):
    return math.sqrt(vdot(a, a))


def vnorm(a):
    length = vlen(a) or 1.0
    return vmul(a, 1.0 / length)


def frames(centers):
    """半宽始终尽量朝世界坐标的左右，不跟着扫掠方向翻成肩垫或鞋尖。"""
    tangents = []
    n = len(centers)
    for i in range(n):
        if i == 0:
            t = vsub(centers[1], centers[0])
        elif i == n - 1:
            t = vsub(centers[-1], centers[-2])
        else:
            t = vsub(centers[i + 1], centers[i - 1])
        tangents.append(vnorm(t))
    out = []
    for t in tangents:
        lateral = vsub((1.0, 0.0, 0.0), vmul(t, vdot(t, (1.0, 0.0, 0.0))))
        if vlen(lateral) < 0.25:
            lateral = vsub((0.0, 0.0, 1.0), vmul(t, vdot(t, (0.0, 0.0, 1.0))))
        bitangent = vnorm(lateral)
        normal = vnorm(vcross(bitangent, t))
        out.append((normal, bitangent))
    return out


def _rot(v, axis, c, s):
    return vadd(vadd(vmul(v, c), vmul(vcross(axis, v), s)), vmul(axis, vdot(axis, v) * (1 - c)))


def ellipse(a, b, theta, power):
    c = math.cos(theta)
    s = math.sin(theta)
    x = a * math.copysign(abs(c) ** (2 / power), c)
    y = b * math.copysign(abs(s) ** (2 / power), s)
    return x, y


def sweep(centers, radii, radial=20, power=2.2, cap_start=False, cap_end=False, front=None):
    """centers: 逻辑坐标。radii: (半宽, 半厚)，半宽沿截面 normal。"""
    basis = frames(centers)
    verts = []
    faces = []
    for i, (center, (a, b), (normal, bitangent)) in enumerate(zip(centers, radii, basis)):
        front_k = 1.0 if front is None else front[i]
        for j in range(radial):
            ex, ey = ellipse(a, b, (j / radial) * math.tau, power)
            if ey > 0.0:
                ey *= front_k
            # a 沿左右，b 沿前后。normal 初始朝前，bitangent 初始朝右。
            p = vadd(center, vadd(vmul(bitangent, ex), vmul(normal, ey)))
            verts.append(to_blender(p))
        if i:
            base = (i - 1) * radial
            top = i * radial
            for j in range(radial):
                j2 = (j + 1) % radial
                faces.append((base + j, top + j, top + j2, base + j2))
    if cap_start:
        verts.append(to_blender(centers[0]))
        c = len(verts) - 1
        for j in range(radial):
            faces.append((c, (j + 1) % radial, j))
    if cap_end:
        verts.append(to_blender(centers[-1]))
        c = len(verts) - 1
        top = (len(centers) - 1) * radial
        for j in range(radial):
            faces.append((c, top + j, top + (j + 1) % radial))
    return verts, faces


def put(name, verts, faces, material, subdiv=1, thickness=0.0):
    """手册顺序：网格 → 重算法线朝外 → 光滑着色 → 实体化 → 细分曲面。"""
    import bmesh

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    if thickness > 0:
        # Solidify：给衣服一层向外的厚度，不改基础网格。
        solid = obj.modifiers.new("Solidify", "SOLIDIFY")
        solid.thickness = thickness
        solid.offset = 1.0
        solid.use_even_offset = True
    if subdiv:
        # Subdivision Surface，Catmull-Clark。视口 1 级，渲染再加一级。
        mod = obj.modifiers.new("Subdivision", "SUBSURF")
        mod.subdivision_type = "CATMULL_CLARK"
        mod.levels = subdiv
        mod.render_levels = subdiv + 1
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(60))
    except RuntimeError:
        pass
    obj.select_set(False)
    return obj


def matte(name, color, rough=0.8):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = 0.0
    return material
