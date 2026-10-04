import asyncio
import json
import logging
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from unittest.mock import patch

from app.request_diagnostics import install_request_diagnostics
from app.openai_service import OpenAIService, OpenAIServiceError

ORIGIN = "https://family-learning-os-mocha.vercel.app"


def request(app):
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://test",
        ) as client:
            return await client.get(
                "/test",
                headers={"Origin": ORIGIN, "Authorization": "Bearer PRIVATE_TOKEN"},
                params={"secret": "PRIVATE_QUERY"},
            )

    return asyncio.run(run())


def test_uncaught_error_previously_lost_cors_headers():
    app = FastAPI()
    app.add_middleware(CORSMiddleware, allow_origins=[ORIGIN])

    @app.get("/test")
    async def fail():
        raise RuntimeError("Private body")

    response = request(app)
    assert response.status_code == 500
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.parametrize(
    "error,status",
    [
        (RuntimeError("PRIVATE_EXCEPTION"), 500),
        (httpx.ReadTimeout("PRIVATE_EXCEPTION"), 504),
        (httpx.ConnectError("PRIVATE_EXCEPTION"), 503),
        (
            httpx.HTTPStatusError(
                "PRIVATE_EXCEPTION",
                request=httpx.Request("GET", "https://upstream.test?secret=PRIVATE_QUERY"),
                response=httpx.Response(400),
            ),
            502,
        ),
    ],
)
def test_failures_remain_readable_and_correlated_inside_cors(caplog, error, status):
    app = FastAPI()
    install_request_diagnostics(app)
    app.add_middleware(CORSMiddleware, allow_origins=[ORIGIN], expose_headers=["X-Request-ID"])

    @app.get("/test")
    async def fail():
        raise error

    with caplog.at_level(logging.INFO, logger="uvicorn.error"):
        response = request(app)
    assert response.status_code == status
    assert response.headers["access-control-allow-origin"] == ORIGIN
    reference = response.headers["x-request-id"]
    assert reference in response.json()["detail"]
    assert response.json()["request_id"] == reference
    logs = [json.loads(record.message) for record in caplog.records]
    assert [record["event"] for record in logs] == [
        "request_started",
        "request_failed",
        "request_finished",
    ]
    assert all(record["request_id"] == reference for record in logs)
    assert "PRIVATE" not in caplog.text


@pytest.mark.parametrize(
    "error,message",
    [(httpx.ReadTimeout("private"), "timed out"), (httpx.ConnectError("private"), "connect")],
)
def test_ai_transport_errors_become_handled_service_errors(monkeypatch, error, message):
    service = OpenAIService()
    service.settings = service.settings.model_copy(update={"openai_api_key": "PRIVATE_TOKEN"})
    client = AsyncMock()
    client.request.side_effect = error
    client.__aenter__.return_value = client
    with patch("app.openai_service.httpx.AsyncClient", return_value=client):
        with pytest.raises(OpenAIServiceError, match=message) as caught:
            asyncio.run(service._json("POST", "responses", json_body={"input": "PRIVATE_BODY"}))
    assert "private" not in str(caught.value).lower()


def test_database_denial_does_not_prompt_relogin():
    app = FastAPI()
    install_request_diagnostics(app)
    app.add_middleware(CORSMiddleware, allow_origins=[ORIGIN])

    @app.get("/test")
    async def fail():
        raise httpx.HTTPStatusError(
            "denied",
            request=httpx.Request(
                "POST", "https://db.example.test/rest/v1/rpc/save_generated_assessment"
            ),
            response=httpx.Response(403),
        )

    response = request(app)
    assert response.status_code == 403
    assert "database access rule" in response.json()["detail"]
    assert "Please sign in again" not in response.json()["detail"]
    assert response.headers["access-control-allow-origin"] == ORIGIN
