import asyncio
import os
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import httpx

os.environ.setdefault("SUPABASE_URL", "https://example.test")
os.environ.setdefault("SUPABASE_ANON_KEY", "test")
from app.main import app
from app.auth import CurrentUser, get_current_user
from app.assessment_logic import canonical_mcq, validate_questions, validate_grades
from app.openai_service import OpenAIServiceError
from app.routes import learning, curriculum

ID = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"


@pytest.fixture
def client():
    async def user():
        return CurrentUser(ID, "parent@example.test")

    app.dependency_overrides[get_current_user] = user

    def request(method, url, **kwargs):
        async def run():
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test"
            ) as c:
                return await c.request(method, url, **kwargs)

        return asyncio.run(run())

    yield SimpleNamespace(
        post=lambda url, **kw: request("POST", url, **kw),
        patch=lambda url, **kw: request("PATCH", url, **kw),
        delete=lambda url, **kw: request("DELETE", url, **kw),
    )
    app.dependency_overrides.clear()


def test_mcq_keys_are_canonical_and_invalid_keys_rejected():
    assert canonical_mcq("B", ["1", "2", "3", "4"]) == "2"
    assert canonical_mcq("2", ["1", "2", "3", "4"]) == "2"
    with pytest.raises(OpenAIServiceError):
        canonical_mcq("unknown", ["1", "2", "3", "4"])


def test_blueprint_exact_distribution():
    sections = [SimpleNamespace(name="A", question_type="mcq", count=3, marks=2)]
    q = {
        "section_name": "A",
        "question_type": "mcq",
        "marks": 2,
        "options": ["one", "two", "three", "four"],
        "answer_key": "B",
        "prompt": "Choose two",
    }
    questions = [deepcopy(q) for _ in range(3)]
    validate_questions(questions, 3, sections)
    assert questions[0]["answer_key"] == "two"
    questions[0]["marks"] = 1
    with pytest.raises(OpenAIServiceError):
        validate_questions(questions, 3, sections)


@pytest.mark.parametrize(
    "results",
    [
        [],
        [{"question_id": "q", "awarded_marks": 2, "feedback": "ok"}] * 2,
        [{"question_id": "wrong", "awarded_marks": 2, "feedback": "ok"}],
        [{"question_id": "q", "awarded_marks": float("nan"), "feedback": "ok"}],
        [{"question_id": "q", "awarded_marks": 4, "feedback": "ok"}],
    ],
)
def test_incomplete_or_invalid_grades_rejected(results):
    with pytest.raises(OpenAIServiceError):
        validate_grades(results, [{"question_id": "q", "max_marks": 3}])


def test_empty_and_mcq_answers_do_not_call_llm(client, monkeypatch):
    questions = [
        {"id": ID, "question_type": "mcq", "marks": 2, "options": ["one", "two", "three", "four"]},
        {"id": OTHER, "question_type": "short", "marks": 3, "prompt": "Explain"},
    ]

    async def rest(method, table, *args, **kwargs):
        if table == "assessments":
            return [{"id": ID, "family_id": ID, "student_id": ID}]
        if table == "assessment_questions":
            return questions
        if table == "assessment_answer_keys":
            return [
                {"question_id": ID, "answer_key": "B"},
                {"question_id": OTHER, "answer_key": "explanation"},
            ]
        raise AssertionError(table)

    monkeypatch.setattr(learning, "rest_request", rest)
    rpc = AsyncMock(return_value={"id": ID})
    monkeypatch.setattr(learning, "rpc", rpc)
    ai = AsyncMock(side_effect=AssertionError("LLM must not be called"))
    monkeypatch.setattr(learning.openai_service, "respond", ai)
    response = client.post(
        f"/v1/assessments/{ID}/submit",
        headers={"Authorization": "Bearer test"},
        json={
            "answers": [{"question_id": ID, "answer": "two"}, {"question_id": OTHER, "answer": ""}]
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["score"] == 2
    assert response.json()["answers"][1]["awarded_marks"] == 0
    assert rpc.await_count == 1
    ai.assert_not_called()


def test_duplicate_submission_question_ids_rejected(client, monkeypatch):
    async def rest(method, table, *args, **kwargs):
        return {
            "assessments": [{"id": ID, "family_id": ID, "student_id": ID}],
            "assessment_questions": [{"id": ID}],
            "assessment_answer_keys": [],
        }[table]

    monkeypatch.setattr(learning, "rest_request", rest)
    response = client.post(
        f"/v1/assessments/{ID}/submit",
        headers={"Authorization": "Bearer test"},
        json={"answers": [{"question_id": ID, "answer": "a"}] * 2},
    )
    assert response.status_code == 422


def test_curriculum_edit_rejects_reparenting_and_invalid_grade(client):
    for payload in [{"family_id": OTHER}, {"grade_level": 11}]:
        r = client.patch(
            f"/v1/curriculum/academic-years/{ID}",
            headers={"Authorization": "Bearer test"},
            json=payload,
        )
        assert r.status_code == 422


def test_nonempty_curriculum_delete_is_blocked(client, monkeypatch):
    monkeypatch.setattr(curriculum, "row", AsyncMock(return_value={"family_id": ID}))
    monkeypatch.setattr(curriculum, "require_parent", AsyncMock())
    rest = AsyncMock(return_value=[{"id": OTHER}])
    monkeypatch.setattr(curriculum, "rest_request", rest)
    r = client.delete(f"/v1/curriculum/subjects/{ID}", headers={"Authorization": "Bearer test"})
    assert r.status_code == 409
    assert all(c.args[0] != "DELETE" for c in rest.call_args_list)


def test_scoped_sources_uses_only_selected_chapters(monkeypatch):
    async def request(method, table, *args, **kwargs):
        if table == "chapters":
            return [{"book_id": OTHER}]
        return [{"id": ID, "openai_file_id": "file-test", "openai_vector_store_id": "vs-test"}]
    rest = AsyncMock(side_effect=request)
    monkeypatch.setattr(learning, "rest_request", rest)
    monkeypatch.setattr(learning.openai_service, "_json", AsyncMock(return_value={}))
    filters = asyncio.run(
        learning.scoped_sources(ID, {"subject_id": OTHER, "chapter_ids": [ID]}, "test")
    )
    assert rest.call_args.kwargs["params"]["or"] == f"(chapter_id.in.({ID}),book_id.in.({OTHER}))"
    assert filters == {"type": "in", "key": "material_id", "value": [ID]}


def test_thread_cannot_be_reused_by_other_student(client, monkeypatch):
    monkeypatch.setattr(learning, "_student", AsyncMock(return_value={"display_name": "Child"}))
    monkeypatch.setattr(learning, "context", AsyncMock(return_value={}))
    monkeypatch.setattr(
        learning, "row", AsyncMock(return_value={"family_id": ID, "student_id": OTHER})
    )
    r = client.post(
        "/v1/chat",
        headers={"Authorization": "Bearer test"},
        json={"family_id": ID, "student_id": ID, "thread_id": ID, "message": "Hello"},
    )
    assert r.status_code == 400


@pytest.mark.parametrize("complete", [True, False])
def test_written_answers_use_llm_and_incomplete_grades_are_not_saved(client, monkeypatch, complete):
    async def rest(method, table, *args, **kwargs):
        return {
            "assessments": [{"id": ID, "family_id": ID, "student_id": ID}],
            "assessment_questions": [
                {"id": ID, "question_type": "short", "marks": 3, "prompt": "Explain"}
            ],
            "assessment_answer_keys": [{"question_id": ID, "answer_key": "Explanation"}],
            "student_ai_spaces": [],
        }[table]

    monkeypatch.setattr(learning, "rest_request", rest)
    monkeypatch.setattr(learning, "_record_usage", AsyncMock())
    rpc = AsyncMock(return_value={"id": ID})
    monkeypatch.setattr(learning, "rpc", rpc)
    ai = AsyncMock(return_value={})
    monkeypatch.setattr(learning.openai_service, "respond", ai)
    monkeypatch.setattr(
        learning.openai_service,
        "output_json",
        lambda _: {
            "overall_feedback": "Good",
            "results": [{"question_id": ID, "awarded_marks": 2, "feedback": "Partial credit"}]
            if complete
            else [],
        },
    )
    r = client.post(
        f"/v1/assessments/{ID}/submit",
        headers={"Authorization": "Bearer test"},
        json={"answers": [{"question_id": ID, "answer": "My explanation"}]},
    )
    assert ai.await_count == 1
    assert r.status_code == (200 if complete else 503)
    assert rpc.await_count == (1 if complete else 0)
