import asyncio
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

os.environ.setdefault("SUPABASE_URL", "https://example.test")
os.environ.setdefault("SUPABASE_ANON_KEY", "test")
from app.auth import CurrentUser, get_current_user
from app.main import app
from app.openai_service import OpenAIServiceError
from app.routes import families

ID = "11111111-1111-4111-8111-111111111111"
FAMILY = "22222222-2222-4222-8222-222222222222"


@pytest.fixture
def api_request():
    async def user():
        return CurrentUser(ID, "parent@example.test")

    app.dependency_overrides[get_current_user] = user

    def call(method, path, body):
        async def run():
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test"
            ) as client:
                return await client.request(
                    method, path, headers={"Authorization": "Bearer test"}, json=body
                )

        return asyncio.run(run())

    yield call
    app.dependency_overrides.clear()


def test_name_only_and_invalid_subjects(api_request, monkeypatch):
    rpc = AsyncMock(return_value={"id": ID})
    monkeypatch.setattr(families, "rpc", rpc)
    assert (
        api_request(
            "POST", "/v1/students", {"family_id": FAMILY, "display_name": "Advik"}
        ).status_code
        == 201
    )
    assert rpc.await_args.args[0] == "onboard_student"
    assert (
        api_request(
            "POST",
            "/v1/students",
            {"family_id": FAMILY, "display_name": "Advik", "subjects": [{"name": "English"}]},
        ).status_code
        == 422
    )
    assert rpc.await_count == 1


def cleanup_mocks(monkeypatch):
    monkeypatch.setattr(
        families,
        "row",
        AsyncMock(return_value={"id": ID, "family_id": FAMILY, "display_name": "Advik"}),
    )
    parent = AsyncMock()
    monkeypatch.setattr(families, "require_parent", parent)
    events = []

    async def rest(method, table, token, **kw):
        if table == "learning_materials":
            return [{"openai_file_id": "file-a"}]
        if table in {"ai_usage_events", "chat_messages"}:
            return [{"openai_response_id": "resp-a"}]
        return [{"openai_vector_store_id": "vs-a"}]

    async def delete(resource, resource_id):
        events.append((resource, resource_id))

    async def storage(prefix, token):
        events.append(("storage", prefix))

    async def rpc(*args):
        events.append(("db", args[0]))
        return {"deleted": ID}

    monkeypatch.setattr(families, "rest_request", rest)
    service = SimpleNamespace(delete_resource=AsyncMock(side_effect=delete))
    monkeypatch.setattr(families, "OpenAIService", lambda: service)
    monkeypatch.setattr(families, "storage_remove_student", AsyncMock(side_effect=storage))
    monkeypatch.setattr(families, "rpc", AsyncMock(side_effect=rpc))
    return parent, service, events


def test_delete_authorization_confirmation_and_cleanup_order(api_request, monkeypatch):
    parent, _service, events = cleanup_mocks(monkeypatch)
    assert api_request("DELETE", f"/v1/students/{ID}", {"confirm_name": "wrong"}).status_code == 422
    assert events == []
    response = api_request("DELETE", f"/v1/students/{ID}", {"confirm_name": "Advik"})
    assert response.status_code == 200
    assert events == [
        ("responses", "resp-a"),
        ("vector_stores", "vs-a"),
        ("files", "file-a"),
        ("storage", f"{FAMILY}/{ID}"),
        ("db", "delete_student_data"),
    ]
    assert parent.await_count == 2


def test_cleanup_failure_retains_database_for_retry(api_request, monkeypatch):
    _, service, events = cleanup_mocks(monkeypatch)
    service.delete_resource.side_effect = OpenAIServiceError("provider unavailable")
    response = api_request("DELETE", f"/v1/students/{ID}", {"confirm_name": "Advik"})
    assert response.status_code == 503
    assert events == []
    families.rpc.assert_not_awaited()


def test_child_cannot_delete(api_request, monkeypatch):
    parent, _, events = cleanup_mocks(monkeypatch)
    from fastapi import HTTPException

    parent.side_effect = HTTPException(403, "Only a parent")
    assert api_request("DELETE", f"/v1/students/{ID}", {"confirm_name": "Advik"}).status_code == 403
    assert events == []
