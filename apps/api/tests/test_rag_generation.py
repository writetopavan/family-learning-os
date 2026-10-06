import asyncio
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from test_planning import ID, OTHER, USER
from test_document_index import TREE

from app import rag_service
from app.routes import workspace, learning
from app.document_index import SKIPPED_PAGE_TEXT


@pytest.mark.parametrize("status", [None, "processing", "failed"])
def test_unavailable_pdf_index_falls_back_to_general_knowledge(monkeypatch, status):
    material = {
        "id": OTHER,
        "file_name": "old.pdf",
        "openai_file_id": "old",
        "openai_vector_store_id": "vs",
    }
    monkeypatch.setattr(rag_service, "materials_for_context", AsyncMock(return_value=[material]))
    monkeypatch.setattr(
        rag_service, "index_row", AsyncMock(return_value={"status": status} if status else None)
    )
    search = AsyncMock()
    monkeypatch.setattr(rag_service.openai_service, "_json", search)
    result = asyncio.run(rag_service.generation_sources(ID, {}, "Explain", "token", USER))
    assert result["grounded"] is False
    assert result["text"] == ""
    assert result["references"] == []
    assert result["vector_store_id"] is None
    search.assert_not_called()


def test_missing_linked_source_is_explicit(monkeypatch):
    monkeypatch.setattr(rag_service, "materials_for_context", AsyncMock(return_value=[]))
    monkeypatch.setattr(rag_service, "row", AsyncMock(return_value={"source_material_id": OTHER}))
    with pytest.raises(HTTPException) as error:
        asyncio.run(rag_service.retrieve(ID, {"chapter_ids": [ID]}, "Explain", "token", USER))
    assert error.value.status_code == 409


def test_image_only_pages_are_not_cited(monkeypatch):
    material = {"id": OTHER, "file_name": "mixed.pdf", "title": "Science", "student_id": ID}
    monkeypatch.setattr(rag_service, "row", AsyncMock(return_value=material))
    monkeypatch.setattr(
        rag_service,
        "index_row",
        AsyncMock(return_value={"status": "ready", "version": 3, "tree": TREE, "page_count": 2}),
    )
    monkeypatch.setattr(
        rag_service,
        "page_rows",
        AsyncMock(
            return_value=[
                {"page_number": 1, "origin": "blank", "text": SKIPPED_PAGE_TEXT},
                {"page_number": 2, "origin": "text", "text": "Fig. 1"},
            ]
        ),
    )
    result = asyncio.run(rag_service.generation_sources(ID, {}, "Explain", "token", USER, [OTHER]))
    assert result["references"] == [
        {"material_id": OTHER, "title": "Science", "page": 2, "index_version": 3}
    ]
    assert SKIPPED_PAGE_TEXT not in result["text"]
    assert result["vector_store_id"] is None


def test_managed_search_is_filtered_and_coexists_with_pdf_text(monkeypatch):
    monkeypatch.setattr(
        rag_service,
        "retrieve",
        AsyncMock(
            return_value={
                "text": "PDF text",
                "references": [],
                "material_ids": [ID],
                "managed": [
                    {
                        "id": OTHER,
                        "status": "ready",
                        "openai_file_id": "file",
                        "openai_vector_store_id": "vs",
                    }
                ],
            }
        ),
    )
    monkeypatch.setattr(rag_service.openai_service, "_json", AsyncMock())
    result = asyncio.run(rag_service.generation_sources(ID, {}, "Explain", "token", USER))
    assert result["text"] == "PDF text"
    assert result["filters"]["value"] == [OTHER]
    assert result["material_ids"] == [ID, OTHER]


def test_lesson_reads_chapter_pages_and_persists_provenance(monkeypatch):
    ctx = {
        "academic_year_id": ID,
        "subject_id": ID,
        "chapter_ids": [ID],
        "label": "Science / Plants",
    }
    monkeypatch.setattr(workspace, "context", AsyncMock(return_value=ctx))
    monkeypatch.setattr(workspace, "require_parent", AsyncMock())
    monkeypatch.setattr(workspace, "row", AsyncMock(return_value={"student_id": ID}))
    refs = [{"material_id": OTHER, "title": "Science", "page": 12, "index_version": 1}]
    sources = AsyncMock(
        return_value={
            "text": "Chlorophyll absorbs sunlight",
            "references": refs,
            "material_ids": [OTHER],
            "vector_store_id": None,
            "filters": None,
            "grounded": True,
        }
    )
    monkeypatch.setattr(rag_service, "generation_sources", sources)
    ai = AsyncMock(return_value={})
    monkeypatch.setattr(workspace.openai_service, "respond", ai)
    monkeypatch.setattr(
        workspace.openai_service, "output_text", lambda _: "Lesson [Science, PDF page 12]"
    )
    writes = AsyncMock(return_value=[{"id": ID}])
    monkeypatch.setattr(workspace, "rest_request", writes)
    monkeypatch.setattr(learning, "_record_usage", AsyncMock())
    payload = workspace.LessonRequest(
        family_id=ID,
        student_id=ID,
        subject_id=ID,
        chapter_id=ID,
        thread_id=ID,
        title="Plants",
        message="Explain plants",
    )
    asyncio.run(workspace.generate_lesson(payload, "Bearer test", USER))
    assert sources.call_args.kwargs["full_chapters"] is True
    assert "Chlorophyll" in ai.call_args.kwargs["input_items"]
    assert ai.call_args.kwargs["vector_store_id"] is None
    assert writes.call_args_list[0].kwargs["json"]["source_references"] == refs
    assistant = writes.call_args_list[1].kwargs["json"][1]
    assert assistant["source_references"] == refs
    assert assistant["material_ids"] == [OTHER]


def test_lesson_generates_from_general_knowledge_when_no_source_is_available(monkeypatch):
    monkeypatch.setattr(
        workspace,
        "context",
        AsyncMock(return_value={"label": "Science / Plants", "academic_year_id": ID, "subject_id": ID, "chapter_ids": []}),
    )
    monkeypatch.setattr(workspace, "require_parent", AsyncMock())
    monkeypatch.setattr(
        rag_service,
        "generation_sources",
        AsyncMock(
            return_value={
                "text": "",
                "references": [],
                "material_ids": [],
                "vector_store_id": None,
                "filters": None,
                "grounded": False,
            }
        ),
    )
    ai = AsyncMock(return_value={})
    writes = AsyncMock(return_value=[{"id": ID}])
    monkeypatch.setattr(workspace.openai_service, "respond", ai)
    monkeypatch.setattr(workspace.openai_service, "output_text", lambda _: "Plants make food.")
    monkeypatch.setattr(workspace, "rest_request", writes)
    monkeypatch.setattr(learning, "_record_usage", AsyncMock())
    payload = workspace.LessonRequest(
        family_id=ID, student_id=ID, subject_id=ID, title="Plants", message="Explain"
    )
    asyncio.run(workspace.generate_lesson(payload, "Bearer test", USER))
    assert ai.await_count == 1
    saved = writes.call_args_list[0].kwargs["json"]
    assert saved["source_references"] == []
    assert saved["content"].startswith("*General knowledge: no uploaded source was used.*")


def test_assessment_uses_shared_sources_and_saves_citations(monkeypatch):
    monkeypatch.setattr(learning, "_student", AsyncMock(return_value={"display_name": "Learner"}))
    monkeypatch.setattr(learning, "require_parent", AsyncMock())
    monkeypatch.setattr(
        learning,
        "context",
        AsyncMock(
            return_value={
                "subject_id": ID,
                "academic_year_id": ID,
                "chapter_ids": [ID],
                "label": "Plants",
            }
        ),
    )
    monkeypatch.setattr(learning, "_latest_academic_year", AsyncMock(return_value=None))
    refs = [{"material_id": OTHER, "title": "Science", "page": 12}]
    sources = AsyncMock(
        return_value={
                "text": "Plants contain chlorophyll",
                "grounded": True,
            "references": refs,
            "material_ids": [OTHER],
            "vector_store_id": None,
            "filters": None,
        }
    )
    monkeypatch.setattr(rag_service, "generation_sources", sources)
    ai = AsyncMock(return_value={})
    monkeypatch.setattr(learning.openai_service, "respond", ai)
    monkeypatch.setattr(
        learning.openai_service,
        "output_json",
        lambda _: {
            "title": "Plants",
            "questions": [
                {
                    "prompt": f"Explain {i}",
                    "answer_key": "Chlorophyll",
                    "question_type": "short",
                    "marks": 1,
                    "options": [],
                    "section_name": "A",
                    "explanation": "Plants",
                }
                for i in range(3)
            ],
        },
    )
    save = AsyncMock(return_value={"id": ID})
    monkeypatch.setattr(learning, "rpc", save)
    monkeypatch.setattr(learning, "_record_usage", AsyncMock())
    payload = learning.GenerateAssessmentRequest(
        family_id=ID, student_id=ID, subject_id=ID, chapter_ids=[ID], question_count=3
    )
    asyncio.run(learning.generate_assessment(payload, "Bearer test", USER))
    assert sources.call_args.kwargs["required"] is False
    assert sources.call_args.kwargs["full_chapters"] is True
    assert "chlorophyll" in ai.call_args.kwargs["input_items"]
    assert ai.call_args.kwargs["vector_store_id"] is None
    assert save.call_args.args[2]["meta"]["source_references"] == refs


def test_explicit_attachment_cannot_change_subject_scope(monkeypatch):
    monkeypatch.setattr(
        rag_service, "row", AsyncMock(return_value={"student_id": ID, "subject_id": OTHER})
    )
    with pytest.raises(HTTPException) as error:
        asyncio.run(rag_service.retrieve(ID, {"subject_id": ID}, "Explain", "token", USER, [OTHER]))
    assert error.value.status_code == 400


def test_empty_selected_pages_do_not_generate_content(monkeypatch):
    monkeypatch.setattr(
        rag_service,
        "row",
        AsyncMock(return_value={"id": OTHER, "student_id": ID, "file_name": "mixed.pdf"}),
    )
    monkeypatch.setattr(
        rag_service,
        "index_row",
        AsyncMock(
            return_value={
                "status": "ready",
                "version": 1,
                "page_count": 1,
                "tree": [
                    {"node_id": "page-1", "title": "Page 1", "start_index": 1, "end_index": 1}
                ],
            }
        ),
    )
    monkeypatch.setattr(
        rag_service,
        "page_rows",
        AsyncMock(return_value=[{"page_number": 1, "text": SKIPPED_PAGE_TEXT, "origin": "blank"}]),
    )
    with pytest.raises(HTTPException) as error:
        asyncio.run(rag_service.retrieve(ID, {}, "Explain", "token", USER, [OTHER]))
    assert error.value.status_code == 409


def test_assessments_can_generate_without_uploaded_sources(monkeypatch):
    monkeypatch.setattr(rag_service, "materials_for_context", AsyncMock(return_value=[]))
    result = asyncio.run(
        rag_service.generation_sources(ID, {}, "Create test", "token", USER, required=False)
    )
    assert result["grounded"] is False
    assert result["text"] == ""
    assert result["references"] == []


@pytest.mark.parametrize("status", [409, 422])
def test_document_import_preserves_source_failure(monkeypatch, status):
    monkeypatch.setattr(
        rag_service, "retrieve",
        AsyncMock(side_effect=HTTPException(status, "Rebuild document index")),
    )
    with pytest.raises(HTTPException) as error:
        asyncio.run(rag_service.generation_sources(
            ID, {}, "Import syllabus", "token", USER, [OTHER], required=True
        ))
    assert error.value.status_code == status
    assert error.value.detail == "Rebuild document index"


def test_document_import_rejects_empty_sources(monkeypatch):
    monkeypatch.setattr(rag_service, "retrieve", AsyncMock(return_value={
        "text": "", "references": [], "material_ids": [], "managed": []
    }))
    with pytest.raises(HTTPException) as error:
        asyncio.run(rag_service.generation_sources(
            ID, {}, "Import syllabus", "token", USER, [OTHER], required=True
        ))
    assert error.value.status_code == 409
