"""Resumable PageIndex jobs and authorized page/tree reads."""

import asyncio
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from ..auth import CurrentUser, get_current_user
from ..curriculum import row
from ..document_index import parse_pdf
from ..openai_service import OpenAIServiceError, openai_service
from ..supabase_client import rest_request, rpc, storage_download, storage_remove
from .curriculum import require_parent

INDEX_SLOT = asyncio.Semaphore(1)

router = APIRouter(prefix="/v1/materials", tags=["documents"])


class IndexRequest(BaseModel):
    rebuild: bool = False


@router.delete("/{material_id}")
async def delete_material(
    material_id: UUID,
    authorization: str = Header(...),
    user: CurrentUser = Depends(get_current_user),
):
    token = authorization.removeprefix("Bearer ").strip()
    material = await row("learning_materials", material_id, token)
    await require_parent(material, token, user)
    # Retain remote IDs until cleanup succeeds so failures can be retried.
    # Deleting the OpenAI file removes its vector-store attachments too;
    # the student's shared vector store must remain available for other files.
    try:
        if material.get("openai_file_id"):
            await openai_service.delete_resource("files", material["openai_file_id"])
        await storage_remove("learning-materials", material["storage_path"], token)
        return await rpc("delete_learning_material", token, {"target_material": str(material_id)})
    except (httpx.HTTPError, OpenAIServiceError) as exc:
        raise HTTPException(
            503, "Material cleanup could not finish. Retry deletion to complete it."
        ) from exc


async def index_row(material_id, token):
    rows = await rest_request(
        "GET",
        "document_indexes",
        token,
        params={"select": "*", "material_id": f"eq.{material_id}", "limit": "1"},
    )
    return rows[0] if rows else None


async def page_rows(material_id, token, *, pending=False, numbers=None):
    params = {
        "select": "*",
        "material_id": f"eq.{material_id}",
        "order": "page_number.asc",
        "limit": "1000",
    }
    if pending:
        params["origin"] = "eq.pending"
        params["limit"] = "1"
    if numbers is not None:
        if not numbers:
            return []
        params["page_number"] = "in.(" + ",".join(str(n) for n in sorted(numbers)) + ")"
    return await rest_request("GET", "document_pages", token, params=params)


async def queue_index(material_id, token, rebuild=False):
    material = await row("learning_materials", material_id, token)
    if not material["file_name"].lower().endswith(".pdf"):
        raise HTTPException(422, "Page indexing currently accepts PDF files.")
    return await rpc(
        "queue_document_index",
        token,
        {"target_material": str(material_id), "force_rebuild": rebuild},
    )


@router.post("/{material_id}/index")
async def start_index(
    material_id: UUID,
    payload: IndexRequest,
    authorization: str = Header(...),
    _: CurrentUser = Depends(get_current_user),
):
    return await queue_index(
        material_id, authorization.removeprefix("Bearer ").strip(), payload.rebuild
    )


@router.get("/{material_id}/index")
async def get_index(
    material_id: UUID, authorization: str = Header(...), _: CurrentUser = Depends(get_current_user)
):
    token = authorization.removeprefix("Bearer ").strip()
    await row("learning_materials", material_id, token)
    return await index_row(material_id, token)


async def advance(material_id, token, user):
    # Admit before downloading: queued documents must not retain source bytes.
    if INDEX_SLOT.locked():
        await row("learning_materials", material_id, token)
        return await index_row(material_id, token)
    async with INDEX_SLOT:
        return await _advance(material_id, token, user)


async def _advance(material_id, token, user):
    material = await row("learning_materials", material_id, token)
    job = await rpc("claim_document_index", token, {"target_material": str(material_id)})
    if not job:
        return await index_row(material_id, token)
    payload = {}
    extracted = []
    try:
        if job["stage"] == "parse":
            pdf = await storage_download("learning-materials", material["storage_path"], token)
            payload = await asyncio.to_thread(parse_pdf, pdf)
        else:
            # Old jobs may already be awaiting OCR. Fail clearly without rendering,
            # downloading the source again, or calling a model.
            pages = await page_rows(material_id, token, pending=True)
            if pages:
                raise ValueError(
                    "Scanned PDF pages are not supported. Upload a PDF with selectable text; OCR is disabled."
                )
            payload = {"pages": []}
    except Exception as exc:
        # Avoid persisting provider bodies or credentials in a client-readable error.
        payload = {
            "pages": extracted,
            "error_message": str(exc)[:400]
            if isinstance(exc, ValueError)
            else "Document processing service failed. Retry to resume indexing.",
        }
    result = await rpc(
        "checkpoint_document_index",
        token,
        {"target_material": str(material_id), "lease": job["lease_id"], "payload": payload},
    )
    return result


@router.post("/{material_id}/index/advance")
async def advance_index(
    material_id: UUID,
    authorization: str = Header(...),
    user: CurrentUser = Depends(get_current_user),
):
    return await advance(material_id, authorization.removeprefix("Bearer ").strip(), user)


@router.get("/{material_id}/pages/{number}")
async def read_page(
    material_id: UUID,
    number: int,
    authorization: str = Header(...),
    _: CurrentUser = Depends(get_current_user),
):
    token = authorization.removeprefix("Bearer ").strip()
    await row("learning_materials", material_id, token)
    pages = await page_rows(material_id, token, numbers={number})
    if not pages:
        raise HTTPException(404, "Page not indexed")
    return pages[0]
