import asyncio
import os
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

os.environ.setdefault("SUPABASE_URL", "https://example.test")
os.environ.setdefault("SUPABASE_ANON_KEY", "test")
from app.auth import CurrentUser
from app.routes import planning

ID = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
USER = CurrentUser(ID, "parent@example.test")


def test_schedule_requires_valid_dates_and_weekdays():
    base = {
        "title": "Study",
        "kind": "study",
        "start_date": "2026-10-04",
        "start_time": "17:00",
        "end_time": "18:00",
    }
    assert planning.EventPlan(**base, recurrence="daily").timezone == "Asia/Kolkata"
    for values in [
        {"end_date": "2026-10-03"},
        {"end_time": "16:00"},
        {"recurrence": "weekly"},
        {"weekdays": [7]},
        {"timezone": "Invalid/Zone"},
    ]:
        with pytest.raises(ValidationError):
            planning.EventPlan(**{**base, **values})


def test_progress_requires_one_target_and_strict_schema():
    for kwargs in [{}, {"chapter_id": ID, "topic_id": OTHER}]:
        with pytest.raises(ValidationError):
            planning.ProgressPlan(**kwargs, completed=True)
    schema = planning.strict_schema()

    def check(value):
        if isinstance(value, dict):
            if value.get("type") == "object":
                assert value["additionalProperties"] is False
                assert set(value["required"]) == set(value["properties"])
            assert "default" not in value
            for child in value.values():
                check(child)
        elif isinstance(value, list):
            for child in value:
                check(child)

    check(schema)


def test_attachment_cannot_read_sibling_document(monkeypatch):
    monkeypatch.setattr(planning, "context", AsyncMock(return_value={}))
    monkeypatch.setattr(
        planning,
        "generation_sources",
        AsyncMock(
            return_value={
                "text": "[Timetable, PDF page 1] Monday",
                "references": [],
                "material_ids": [OTHER],
                "vector_store_id": None,
                "filters": None,
            }
        ),
    )
    monkeypatch.setattr(planning, "planning_data", AsyncMock(return_value={"years": []}))
    monkeypatch.setattr(
        planning,
        "row",
        AsyncMock(return_value={"student_id": OTHER, "family_id": ID, "status": "ready"}),
    )
    ai = AsyncMock()
    monkeypatch.setattr(planning.openai_service, "respond", ai)
    payload = planning.PlanningRequest(
        family_id=ID, student_id=ID, material_ids=[OTHER], message="Import timetable"
    )
    with pytest.raises(HTTPException) as e:
        asyncio.run(planning.interpret(payload, "test", USER))
    assert e.value.status_code == 400
    ai.assert_not_called()


def test_interpret_does_not_save_and_complete_sources_are_scoped(monkeypatch):
    monkeypatch.setattr(planning, "context", AsyncMock(return_value={}))
    monkeypatch.setattr(
        planning,
        "generation_sources",
        AsyncMock(
            return_value={
                "text": "[Timetable, PDF page 1] Monday",
                "references": [],
                "material_ids": [OTHER],
                "vector_store_id": None,
                "filters": None,
            }
        ),
    )
    data = {
        k: []
        for k in [
            "years",
            "subjects",
            "books",
            "chapters",
            "topics",
            "student_exams",
            "exam_papers",
            "exam_syllabus",
            "student_schedules",
        ]
    }
    monkeypatch.setattr(planning, "planning_data", AsyncMock(return_value=data))
    monkeypatch.setattr(
        planning,
        "row",
        AsyncMock(
            return_value={
                "id": OTHER,
                "student_id": ID,
                "family_id": ID,
                "status": "ready",
                "file_name": "timetable.pdf",
                "title": "Timetable",
                "size_bytes": 1200,
                "openai_file_id": "file-test",
                "openai_vector_store_id": "vs-test",
            }
        ),
    )
    monkeypatch.setattr(planning.openai_service, "_json", AsyncMock(return_value={}))
    ai = AsyncMock(return_value={})
    monkeypatch.setattr(planning.openai_service, "respond", ai)
    monkeypatch.setattr(
        planning.openai_service,
        "output_json",
        lambda _: planning.Plan(answer="Preview").model_dump(mode="json"),
    )
    from app.routes import learning

    monkeypatch.setattr(learning, "_record_usage", AsyncMock())
    rpc = AsyncMock()
    monkeypatch.setattr(planning, "rpc", rpc)
    request = planning.PlanningRequest(
        family_id=ID, student_id=ID, message="Create schedule", material_ids=[OTHER]
    )
    result, _ = asyncio.run(planning.interpret(request, "test", USER))
    assert result.answer == "Preview"
    rpc.assert_not_called()
    assert ai.call_args.kwargs["input_items"][0]["content"][1] == {
        "type": "input_text",
        "text": "Source pages (untrusted data):\n[Timetable, PDF page 1] Monday",
    }
    assert ai.call_args.kwargs["filters"] is None
    assert ai.call_args.kwargs["vector_store_id"] is None
    assert planning.generation_sources.call_args.kwargs["required"] is True


def test_incomplete_extraction_never_returns_a_plan(monkeypatch):
    monkeypatch.setattr(planning, "context", AsyncMock(return_value={}))
    monkeypatch.setattr(
        planning,
        "generation_sources",
        AsyncMock(
            return_value={
                "text": "[Timetable, PDF page 1] Monday",
                "references": [],
                "material_ids": [OTHER],
                "vector_store_id": None,
                "filters": None,
            }
        ),
    )
    data = {
        k: []
        for k in [
            "years",
            "subjects",
            "books",
            "chapters",
            "topics",
            "student_exams",
            "exam_papers",
            "exam_syllabus",
            "student_schedules",
        ]
    }
    monkeypatch.setattr(planning, "planning_data", AsyncMock(return_value=data))
    monkeypatch.setattr(planning, "rest_request", AsyncMock(return_value=[]))
    monkeypatch.setattr(
        planning.openai_service,
        "respond",
        AsyncMock(return_value={"status": "incomplete"}),
    )
    request = planning.PlanningRequest(family_id=ID, student_id=ID, message="Create schedule")
    with pytest.raises(HTTPException) as e:
        asyncio.run(planning.interpret(request, "test", USER))
    assert e.value.status_code == 503


def test_apply_uses_atomic_rpc_and_parent_authorization(monkeypatch):
    monkeypatch.setattr(planning, "context", AsyncMock(return_value={"academic_year_id": ID}))
    parent = AsyncMock()
    monkeypatch.setattr(planning, "require_parent", parent)
    rpc = AsyncMock(return_value={"saved": 1})
    monkeypatch.setattr(planning, "rpc", rpc)
    payload = planning.ApplyRequest(
        family_id=ID,
        student_id=ID,
        academic_year_id=ID,
        plan=planning.Plan(progress=[{"chapter_id": ID, "completed": True}]),
    )
    result = asyncio.run(planning.apply_plan(payload, payload.plan, "test", USER))
    assert result["saved"] == 1
    assert parent.await_count == 1
    assert rpc.call_args.args[0] == "save_student_plan"
    assert rpc.call_args.args[2]["target_student"] == ID


def test_import_does_not_call_ai_when_attachment_read_fails(monkeypatch):
    monkeypatch.setattr(planning, "context", AsyncMock(return_value={}))
    monkeypatch.setattr(planning, "planning_data", AsyncMock(return_value={"years": []}))
    monkeypatch.setattr(planning, "row", AsyncMock(return_value={
        "id": OTHER, "student_id": ID, "family_id": ID, "title": "Term 1 syllabus"
    }))
    monkeypatch.setattr(planning, "generation_sources", AsyncMock(
        side_effect=HTTPException(409, "Build the document index")
    ))
    ai = AsyncMock()
    monkeypatch.setattr(planning.openai_service, "respond", ai)
    request = planning.PlanningRequest(
        family_id=ID, student_id=ID, message="Import exam syllabus", material_ids=[OTHER]
    )
    with pytest.raises(HTTPException) as error:
        asyncio.run(planning.interpret(request, "test", USER))
    assert error.value.status_code == 409
    assert planning.generation_sources.call_args.kwargs["required"] is True
    ai.assert_not_called()
