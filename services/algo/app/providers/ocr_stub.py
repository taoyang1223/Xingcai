class OcrStub:
    def parse(self, oss_key: str) -> dict:
        return {
            "rows": [],
            "measure_mode": "unknown",
            "confidence": 0.0,
            "message": "请手填",
        }
