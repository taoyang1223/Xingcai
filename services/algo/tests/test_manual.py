from app.providers.manual import ManualProvider


def test_manual_health():
    h = ManualProvider().health()
    assert h.ok
    assert h.message
