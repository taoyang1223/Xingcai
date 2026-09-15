from app.providers.base import Health, MeasureProvider


class ManualProvider(MeasureProvider):
    """第一期唯一实现：拍照量体不在此完成，业务应走手填围度。"""

    code = "manual"

    def health(self) -> Health:
        return Health(ok=True, message="ManualProvider ready")

    def measure(self, req: dict) -> dict:
        raise RuntimeError("ManualProvider: 请走手填围度，不要提交照片")
