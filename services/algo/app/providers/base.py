from dataclasses import dataclass


@dataclass
class Health:
    ok: bool
    message: str


class MeasureProvider:
    code = "base"

    def health(self) -> Health:
        raise NotImplementedError

    def measure(self, req: dict) -> dict:
        raise NotImplementedError
