from app.providers.body_complete import Mesh, _circle, complete_body, loft


def test_loft_spans_the_two_rings():
    mesh = loft([
        _circle((0.0, 1.0, 0.0), 0.05, 0.04),
        _circle((0.0, 0.0, 0.0), 0.08, 0.06),
    ])
    ys = [v[1] for v in mesh.verts]
    assert len(mesh.faces) >= 16
    assert min(ys) == 0.0
    assert max(ys) == 1.0


def test_complete_fills_torso_between_head_and_shoes():
    def cloud(cx, cy, cz, n=40):
        return [(cx, cy + i * 0.002, cz) for i in range(n)]

    parts = [
        cloud(0.0, 0.95, 0.0),   # 头，下缘在 0.95
        cloud(0.0, 0.40, 0.0),   # 衣服，应被跳过
        cloud(-0.18, 0.70, 0.0), # 手臂
        cloud(-0.08, 0.02, 0.05),
        cloud(0.08, 0.02, 0.05),
    ]
    mesh = complete_body(parts, garment={1})
    ys = [v[1] for v in mesh.verts]
    assert min(ys) < 0.1
    assert max(ys) > 0.8
    assert len(mesh.faces) > 32


def test_empty_mesh_add():
    a = Mesh()
    b = loft([_circle((0, 1, 0), 0.02, 0.02, n=4), _circle((0, 0, 0), 0.02, 0.02, n=4)])
    a.add(b)
    assert len(a.faces) == len(b.faces)
