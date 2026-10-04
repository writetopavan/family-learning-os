import asyncio
import os
from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pypdf import PdfWriter
from test_planning import ID, OTHER, USER

from app import rag_service
from app.document_index import (
    parse_pdf,
    reconcile_contents,
    select_nodes,
    source_context,
    validate_tree,
)
from app.routes import documents

TREE = [
    {
        "node_id": "chapter-1",
        "title": "Plants",
        "start_index": 1,
        "end_index": 2,
        "nodes": [
            {"node_id": "topic-1", "title": "Photosynthesis", "start_index": 1, "end_index": 1}
        ],
    }
]


def test_real_science_book_pageindex():
    path = os.getenv("SCIENCE_TEST_PDF")
    if not path:
        pytest.skip("Provide SCIENCE_TEST_PDF for the full uploaded textbook regression")
    result = parse_pdf(Path(path).read_bytes())
    assert result["page_count"] == 265
    assert result["contents_verified"]
    assert len(result["tree"]) == 18
    assert result["tree"][3]["title"] == "MATERIALS : METALS AND NON-METALS"
    assert (result["tree"][3]["start_index"], result["tree"][3]["end_index"]) == (57, 68)
    assert all(p["origin"] != "pending" for p in result["pages"])
    assert result["tree"][12]["title"] == "SOUND"
    assert result["tree"][12]["start_index"] == 170


def test_bad_contents_does_not_override_tree():
    pages = [{"text": "Chapter 1\nA 9\nChapter 2\nB 5\nChapter 3\nC 12"}]
    assert reconcile_contents(TREE, pages) == (TREE, False)


def test_invalid_ranges_and_duplicate_ids_are_rejected():
    for tree in [TREE * 2, [{"node_id": "x", "start_index": 2, "end_index": 1}], []]:
        with pytest.raises(ValueError):
            validate_tree(tree, 2)


def test_read_budget_never_silently_drops_pages():
    with pytest.raises(ValueError, match="budget"):
        source_context({"title": "Science"}, [{"page_number": 1, "text": "x" * 100}], {1}, 50)


def test_retrieval_rejects_sibling_attachment(monkeypatch):
    monkeypatch.setattr(rag_service, "row", AsyncMock(return_value={"student_id": OTHER}))
    with pytest.raises(HTTPException) as error:
        asyncio.run(rag_service.retrieve(ID, {}, "Plants", "token", USER, [OTHER]))
    assert error.value.status_code == 400


def test_full_chapter_retrieval_uses_linked_node_and_no_vector_store(monkeypatch):
    material = {
        "id": OTHER,
        "student_id": ID,
        "family_id": ID,
        "book_id": "book",
        "title": "Science",
    }
    chapter = {
        "id": ID,
        "title": "Plants",
        "book_id": "book",
        "source_material_id": OTHER,
        "source_node_id": "chapter-1",
        "source_index_version": 1,
    }
    monkeypatch.setattr(rag_service, "materials_for_context", AsyncMock(return_value=[material]))
    monkeypatch.setattr(rag_service, "row", AsyncMock(return_value=chapter))
    monkeypatch.setattr(
        rag_service,
        "index_row",
        AsyncMock(return_value={"status": "ready", "version": 1, "tree": TREE}),
    )
    pages = AsyncMock(
        return_value=[
            {"page_number": 1, "text": "Plants use sunlight."},
            {"page_number": 2, "text": "Leaves contain chlorophyll."},
        ]
    )
    monkeypatch.setattr(rag_service, "page_rows", pages)
    ai = AsyncMock(side_effect=AssertionError("Known chapter needs no model to locate it"))
    monkeypatch.setattr(rag_service, "choose_nodes", ai)
    result = asyncio.run(
        rag_service.retrieve(ID, {"chapter_ids": [ID]}, "Test", "token", USER, full_chapters=True)
    )
    assert "chlorophyll" in result["text"]
    assert [r["page"] for r in result["references"]] == [1, 2]
    assert pages.call_args.kwargs["numbers"] == {1, 2}
    ai.assert_not_called()


def test_stale_source_link_is_rejected(monkeypatch):
    material = {"id": OTHER, "book_id": "book"}
    monkeypatch.setattr(rag_service, "materials_for_context", AsyncMock(return_value=[material]))
    monkeypatch.setattr(
        rag_service,
        "row",
        AsyncMock(
            return_value={
                "id": ID,
                "book_id": "book",
                "source_material_id": OTHER,
                "source_index_version": 1,
            }
        ),
    )
    monkeypatch.setattr(
        rag_service, "index_row", AsyncMock(return_value={"status": "ready", "version": 2})
    )
    with pytest.raises(HTTPException) as error:
        asyncio.run(rag_service.retrieve(ID, {"chapter_ids": [ID]}, "Test", "token", USER))
    assert error.value.status_code == 409


def test_legacy_ocr_job_never_calls_model_or_downloads(monkeypatch):
    monkeypatch.setattr(documents, "row", AsyncMock(return_value={}))
    calls = []

    async def rpc(name, token, body):
        calls.append((name, body))
        return (
            {"stage": "ocr", "lease_id": ID}
            if name == "claim_document_index"
            else {"status": "failed"}
        )

    monkeypatch.setattr(documents, "rpc", rpc)
    download = AsyncMock()
    ai = AsyncMock()
    monkeypatch.setattr(documents, "storage_download", download)
    monkeypatch.setattr(rag_service.openai_service, "respond", ai)
    monkeypatch.setattr(documents, "page_rows", AsyncMock(return_value=[{"page_number": 1}]))
    asyncio.run(documents.advance(ID, "token", USER))
    assert "OCR is disabled" in calls[-1][1]["payload"]["error_message"]
    download.assert_not_called()
    ai.assert_not_called()


def digital_pdf(count=1):
    from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject

    pdf = PdfWriter()
    for _ in range(count):
        page = pdf.add_blank_page(width=200, height=200)
        font = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }
        )
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): pdf._add_object(font)})}
        )
        stream = DecodedStreamObject()
        stream.set_data(b"BT /F1 12 Tf 10 100 Td (Selectable textbook text for testing.) Tj ET")
        page[NameObject("/Contents")] = pdf._add_object(stream)
    output = BytesIO()
    pdf.write(output)
    return output.getvalue()


def test_text_pdf_needs_no_model():
    result = parse_pdf(digital_pdf())
    assert result["pages"][0]["origin"] == "text"
    assert "Selectable" in result["pages"][0]["text"]
    validate_tree(result["tree"], 1)


def test_unlinked_chapter_never_falls_back_to_another_chapter():
    with pytest.raises(ValueError, match="not linked"):
        select_nodes(TREE, "Plants", chapter_titles=["Animals"])
    with pytest.raises(ValueError, match="not linked"):
        select_nodes(TREE, "Plants", chapter_titles=["Plants", "Animals"])


def test_model_cannot_select_a_node_outside_the_scoped_tree(monkeypatch):
    monkeypatch.setattr(rag_service.openai_service, "respond", AsyncMock(return_value={}))
    monkeypatch.setattr(
        rag_service.openai_service, "output_json", lambda _: {"node_ids": ["other-chapter"]}
    )
    from app.openai_service import OpenAIServiceError

    with pytest.raises(OpenAIServiceError, match="invalid source"):
        asyncio.run(rag_service.choose_nodes(TREE, "Plants"))


def test_selected_chapter_cannot_read_an_attachment_from_another_book(monkeypatch):
    monkeypatch.setattr(
        rag_service,
        "row",
        AsyncMock(
            side_effect=[
                {"id": OTHER, "student_id": ID, "book_id": "other-book"},
                {"id": ID, "title": "Plants", "book_id": "selected-book"},
            ]
        ),
    )
    monkeypatch.setattr(
        rag_service,
        "index_row",
        AsyncMock(return_value={"status": "ready", "version": 1, "tree": TREE}),
    )
    with pytest.raises(HTTPException) as error:
        asyncio.run(rag_service.retrieve(ID, {"chapter_ids": [ID]}, "Test", "token", USER, [OTHER]))
    assert error.value.status_code == 409


def test_scanned_pdf_is_rejected():
    from PIL import Image

    output = BytesIO()
    Image.new("RGB", (200, 200), "white").save(output, format="PDF")
    with pytest.raises(ValueError, match="requires OCR"):
        parse_pdf(output.getvalue())


def test_empty_pdf_is_rejected():
    pdf = PdfWriter()
    pdf.add_blank_page(width=200, height=200)
    output = BytesIO()
    pdf.write(output)
    with pytest.raises(ValueError, match="no extractable text"):
        parse_pdf(output.getvalue())


def test_large_text_pdf_keeps_all_pages():
    result = parse_pdf(digital_pdf(41))
    assert result["page_count"] == 41
    assert len(result["tree"]) == 41
    assert not result["contents_verified"]


def test_busy_index_does_not_download_or_claim(monkeypatch):
    monkeypatch.setattr(documents, "row", AsyncMock(return_value={}))
    monkeypatch.setattr(documents, "index_row", AsyncMock(return_value={"status": "queued"}))
    claim = AsyncMock()
    download = AsyncMock()
    monkeypatch.setattr(documents, "rpc", claim)
    monkeypatch.setattr(documents, "storage_download", download)

    async def run():
        async with documents.INDEX_SLOT:
            return await documents.advance(ID, "token", USER)

    assert asyncio.run(run()) == {"status": "queued"}
    claim.assert_not_called()
    download.assert_not_called()
