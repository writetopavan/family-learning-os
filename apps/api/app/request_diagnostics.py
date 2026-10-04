"""Return readable failures inside CORS and emit safe, correlated request logs."""

import json
import logging
import traceback
from pathlib import Path
from time import monotonic
from uuid import uuid4

import httpx
from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("uvicorn.error")


def install_request_diagnostics(app):
    # Register BEFORE CORS so even unexpected failures carry allowed-origin headers.
    @app.middleware("http")
    async def diagnose_request(request: Request, call_next):
        request_id = uuid4().hex
        started = monotonic()
        fields = {"request_id": request_id, "method": request.method, "path": request.url.path}
        logger.info(json.dumps({"event": "request_started", **fields}))
        try:
            response = await call_next(request)
        except Exception as exc:
            if isinstance(exc, httpx.TimeoutException):
                status, detail = (
                    504,
                    "A required service timed out. Check saved results before retrying.",
                )
            elif isinstance(exc, httpx.RequestError):
                status, detail = 503, "Could not connect to a required service. Please try again."
            elif isinstance(exc, httpx.HTTPStatusError):
                upstream_status = exc.response.status_code
                if upstream_status in (401, 403):
                    status, detail = (
                        upstream_status,
                        "Your session or access permission was rejected. Please sign in again.",
                    )
                else:
                    status, detail = (
                        502,
                        "A required service rejected the request. Please try again.",
                    )
            else:
                status, detail = 500, "Could not complete this request."
            # Do not log exception messages, request bodies, URLs with query strings,
            # headers, tokens or provider response bodies. Frame locations suffice
            # to locate the failing code without copying a child's source/answers.
            logger.error(
                json.dumps(
                    {
                        "event": "request_failed",
                        **fields,
                        "status": status,
                        "error_type": type(exc).__name__,
                        **(
                            {
                                "upstream_status": exc.response.status_code,
                                "upstream_host": exc.request.url.host,
                            }
                            if isinstance(exc, httpx.HTTPStatusError)
                            else {}
                        ),
                        "frames": [
                            {
                                "file": Path(frame.filename).name,
                                "line": frame.lineno,
                                "function": frame.name,
                            }
                            for frame in traceback.extract_tb(exc.__traceback__)
                        ],
                    }
                )
            )
            response = JSONResponse(
                status_code=status,
                content={
                    "detail": f"{detail} Reference: {request_id}",
                    "request_id": request_id,
                },
            )
        response.headers["X-Request-ID"] = request_id
        logger.info(
            json.dumps(
                {
                    "event": "request_finished",
                    **fields,
                    "status": response.status_code,
                    "duration_ms": round((monotonic() - started) * 1000),
                }
            )
        )
        return response
