from __future__ import annotations

import os
import sys
import threading
from concurrent import futures
from pathlib import Path

import grpc
import uvicorn
from fastapi import FastAPI

sys.path.insert(0, str(Path(__file__).resolve().parent / "pb"))

import measure_pb2  # noqa: E402
import measure_pb2_grpc  # noqa: E402
import ocr_pb2  # noqa: E402
import ocr_pb2_grpc  # noqa: E402
from app.providers.manual import ManualProvider  # noqa: E402
from app.providers.ocr_stub import OcrStub  # noqa: E402


class MeasureServicer(measure_pb2_grpc.MeasureServiceServicer):
    def __init__(self, provider: ManualProvider):
        self.provider = provider

    def GetProviderHealth(self, request, context):
        h = self.provider.health()
        return measure_pb2.ProviderHealth(
            code=self.provider.code, healthy=h.ok, message=h.message
        )

    def Measure(self, request, context):
        context.set_code(grpc.StatusCode.FAILED_PRECONDITION)
        context.set_details("ManualProvider: 请走手填围度，不要提交照片")
        return measure_pb2.MeasureResponse(provider_code=self.provider.code)


class OcrServicer(ocr_pb2_grpc.OcrServiceServicer):
    def __init__(self, stub: OcrStub):
        self.stub = stub

    def ParseSizeChart(self, request, context):
        result = self.stub.parse(request.oss_key)
        return ocr_pb2.TableResult(
            measure_mode=result["measure_mode"],
            confidence=result["confidence"],
            message=result["message"],
        )


http_app = FastAPI(title="fitme-algo")


@http_app.get("/healthz")
def http_health():
    return {"status": "ok", "provider": "manual"}


def serve_http(addr: str) -> None:
    host, port = addr.rsplit(":", 1)
    uvicorn.run(http_app, host=host if host else "0.0.0.0", port=int(port), log_level="info")


def main() -> None:
    grpc_addr = os.getenv("FITME_GRPC_ADDR", "0.0.0.0:19090")
    http_addr = os.getenv("FITME_HTTP_ADDR", "0.0.0.0:8090")
    provider = ManualProvider()
    ocr = OcrStub()

    threading.Thread(target=serve_http, args=(http_addr,), daemon=True).start()

    server = grpc.server(futures.ThreadPoolExecutor(max_workers=8))
    measure_pb2_grpc.add_MeasureServiceServicer_to_server(MeasureServicer(provider), server)
    ocr_pb2_grpc.add_OcrServiceServicer_to_server(OcrServicer(ocr), server)
    server.add_insecure_port(grpc_addr)
    print(f"algo grpc={grpc_addr} http={http_addr}", flush=True)
    server.start()
    server.wait_for_termination()


if __name__ == "__main__":
    main()
