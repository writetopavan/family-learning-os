import asyncio
import base64
import os
import re
from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException
from pypdf import PdfReader, PdfWriter
from test_planning import ID, OTHER, USER

from app.book_preview import book_preview
from app.routes import planning


def test_scanned_preview_is_capped():
    writer = PdfWriter()
    for _ in range(500):
        writer.add_blank_page(width=200, height=200)
    output = BytesIO()
    writer.write(output)
    result = book_preview(output.getvalue())
    pdf = base64.b64decode(result["file_data"].split(",", 1)[1])
    assert len(PdfReader(BytesIO(pdf)).pages) == 20


def test_invalid_pdf_has_actionable_error():
    with pytest.raises(ValueError, match="Could not read"):
        book_preview(b"not a PDF")


def test_uploaded_science_book():
    path = os.getenv("SCIENCE_TEST_PDF")
    if not path:
        pytest.skip("Set SCIENCE_TEST_PDF to run the supplied textbook regression")
    result = book_preview(Path(path).read_bytes())
    assert result["type"] == "input_text"
    assert len(result["text"]) < 80000
    assert "[PDF page 21]" not in result["text"]
    contents = result["text"].split("[PDF page 11]")[1].split("[PDF page 13]")[0]
    assert [int(n) for n in re.findall(r"Chapter\s+(\d+)", contents)] == list(range(1, 19))
    assert "POLLUTION OF AIR AND WATER" in contents


def test_preview_does_not_wait_for_indexing(monkeypatch):
    monkeypatch.setattr(planning, "context", AsyncMock(return_value={}))
    keys = [
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
    monkeypatch.setattr(planning, "planning_data", AsyncMock(return_value={k: [] for k in keys}))
    monkeypatch.setattr(
        planning,
        "row",
        AsyncMock(
            return_value={
                "id": OTHER,
                "student_id": ID,
                "family_id": ID,
                "status": "processing",
                "file_name": "science.pdf",
                "title": "Science",
                "storage_path": "authorized/book.pdf",
            }
        ),
    )
    download = AsyncMock(return_value=b"pdf bytes")
    monkeypatch.setattr(planning, "storage_download", download)
    monkeypatch.setattr(
        planning, "book_preview", lambda _: {"type": "input_text", "text": "Contents"}
    )
    vector = AsyncMock(side_effect=AssertionError("Indexing must not be queried"))
    monkeypatch.setattr(planning.openai_service, "get_vector_file", vector)
    ai = AsyncMock(return_value={})
    monkeypatch.setattr(planning.openai_service, "respond", ai)
    monkeypatch.setattr(planning.openai_service, "output_json", lambda _: {"answer": "Preview"})
    from app.routes import learning

    monkeypatch.setattr(learning, "_record_usage", AsyncMock())
    req = planning.PlanningRequest(
        family_id=ID,
        student_id=ID,
        material_ids=[OTHER],
        message="Extract chapters",
        purpose="book_preview",
    )
    asyncio.run(planning.interpret(req, "test", USER))
    vector.assert_not_called()
    download.assert_awaited_once_with("learning-materials", "authorized/book.pdf", "test")
    assert ai.call_args.kwargs["vector_store_id"] is None
    assert ai.call_args.kwargs["input_items"][0]["content"][-1]["text"] == "Contents"


def test_timeout_returns_actionable_error(monkeypatch):
    monkeypatch.setattr(planning, "interpret", AsyncMock(side_effect=httpx.ReadTimeout("timeout")))
    req = planning.PlanningRequest(family_id=ID, student_id=ID, message="Extract")
    with pytest.raises(HTTPException) as error:
        asyncio.run(planning.extract_plan(req, "Bearer test", USER))
    assert error.value.status_code == 504
    assert "contents pages" in error.value.detail
