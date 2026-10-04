from datetime import date
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from ..auth import CurrentUser, get_current_user
from ..curriculum import row
from ..openai_service import OpenAIService, OpenAIServiceError
from ..schemas import (
    CreateAcademicYearRequest,
    CreateBookRequest,
    CreateChapterRequest,
    CreateFamilyRequest,
    CreateStudentRequest,
    CreateSubjectRequest,
    OnboardingSubject,
)
from ..supabase_client import rest_request, rpc, storage_remove_student
from .curriculum import require_parent

router = APIRouter(prefix="/v1", tags=["family"])


def _bearer_token(authorization: str) -> str:
    return authorization.removeprefix("Bearer ").strip()


@router.post("/families", status_code=status.HTTP_201_CREATED)
async def create_family(
    payload: CreateFamilyRequest,
    authorization: str = Header(...),
    _: CurrentUser = Depends(get_current_user),
):
    family_id = await rpc(
        "create_family_with_parent",
        _bearer_token(authorization),
        {"family_name": payload.name},
    )
    return {"id": family_id, "name": payload.name}


@router.get("/families")
async def list_families(
    authorization: str = Header(...),
    _: CurrentUser = Depends(get_current_user),
):
    data = await rest_request(
        "GET",
        "family_memberships",
        _bearer_token(authorization),
        params={
            "select": "family_id,role,families(id,name)",
            "status": "eq.active",
        },
    )
    return data


@router.post("/students", status_code=status.HTTP_201_CREATED)
async def create_student(
    payload: CreateStudentRequest,
    authorization: str = Header(...),
    _: CurrentUser = Depends(get_current_user),
):
    data = await rpc(
        "onboard_student",
        _bearer_token(authorization),
        {"profile": payload.model_dump(mode="json")},
    )
    return data


@router.get("/families/{family_id}/students")
async def list_students(
    family_id: str,
    authorization: str = Header(...),
    _: CurrentUser = Depends(get_current_user),
):
    return await rest_request(
        "GET",
        "students",
        _bearer_token(authorization),
        params={
            "select": "*",
            "family_id": f"eq.{family_id}",
            "active": "eq.true",
            "order": "display_name.asc",
        },
    )


@router.post("/academic-years", status_code=status.HTTP_201_CREATED)
async def create_academic_year(
    payload: CreateAcademicYearRequest,
    authorization: str = Header(...),
    _: CurrentUser = Depends(get_current_user),
):
    data = await rest_request(
        "POST",
        "academic_years",
        _bearer_token(authorization),
        params={"select": "*"},
        json=payload.model_dump(mode="json"),
    )
    return data[0]


@router.post("/subjects", status_code=status.HTTP_201_CREATED)
async def create_subject(
    payload: CreateSubjectRequest,
    authorization: str = Header(...),
    _: CurrentUser = Depends(get_current_user),
):
    data = await rest_request(
        "POST",
        "subjects",
        _bearer_token(authorization),
        params={"select": "*"},
        json=payload.model_dump(mode="json"),
    )
    return data[0]


@router.post("/books", status_code=status.HTTP_201_CREATED)
async def create_book(
    payload: CreateBookRequest,
    authorization: str = Header(...),
    _: CurrentUser = Depends(get_current_user),
):
    data = await rest_request(
        "POST",
        "books",
        _bearer_token(authorization),
        params={"select": "*"},
        json=payload.model_dump(mode="json", exclude_none=True),
    )
    return data[0]


@router.post("/chapters", status_code=status.HTTP_201_CREATED)
async def create_chapter(
    payload: CreateChapterRequest,
    authorization: str = Header(...),
    _: CurrentUser = Depends(get_current_user),
):
    data = await rest_request(
        "POST",
        "chapters",
        _bearer_token(authorization),
        params={"select": "*"},
        json=payload.model_dump(mode="json"),
    )
    return data[0]


@router.get("/students/{student_id}/academic-years")
async def list_academic_years(
    student_id: str,
    authorization: str = Header(...),
    _: CurrentUser = Depends(get_current_user),
):
    return await rest_request(
        "GET",
        "academic_years",
        _bearer_token(authorization),
        params={
            "select": "*",
            "student_id": f"eq.{student_id}",
            "order": "start_date.desc",
        },
    )


@router.get("/academic-years/{academic_year_id}/subjects")
async def list_subjects(
    academic_year_id: str,
    authorization: str = Header(...),
    _: CurrentUser = Depends(get_current_user),
):
    return await rest_request(
        "GET",
        "subjects",
        _bearer_token(authorization),
        params={
            "select": "*",
            "academic_year_id": f"eq.{academic_year_id}",
            "order": "name.asc",
        },
    )


@router.get("/subjects/{subject_id}/books")
async def list_books(
    subject_id: str,
    authorization: str = Header(...),
    _: CurrentUser = Depends(get_current_user),
):
    return await rest_request(
        "GET",
        "books",
        _bearer_token(authorization),
        params={
            "select": "*",
            "subject_id": f"eq.{subject_id}",
            "order": "title.asc",
        },
    )


@router.get("/books/{book_id}/chapters")
async def list_chapters(
    book_id: str,
    authorization: str = Header(...),
    _: CurrentUser = Depends(get_current_user),
):
    return await rest_request(
        "GET",
        "chapters",
        _bearer_token(authorization),
        params={
            "select": "*",
            "book_id": f"eq.{book_id}",
            "order": "sequence.asc",
        },
    )


class EditStudent(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    display_name: str = Field(min_length=1, max_length=120)
    date_of_birth: date | None = None
    board: str | None = Field(None, max_length=120)
    school_name: str | None = Field(None, max_length=240)
    school_location: str | None = Field(None, max_length=240)


class DeleteStudent(BaseModel):
    confirm_name: str = Field(min_length=1, max_length=120)


@router.patch("/students/{student_id}")
async def edit_student(
    student_id: UUID,
    payload: EditStudent,
    authorization: str = Header(...),
    user: CurrentUser = Depends(get_current_user),
):
    token = _bearer_token(authorization)
    student = await row("students", student_id, token)
    await require_parent(student, token, user)
    data = await rest_request(
        "PATCH",
        "students",
        token,
        params={"id": f"eq.{student_id}"},
        json=payload.model_dump(mode="json"),
    )
    return data[0]


@router.delete("/students/{student_id}")
async def delete_student(
    student_id: UUID,
    payload: DeleteStudent,
    authorization: str = Header(...),
    user: CurrentUser = Depends(get_current_user),
):
    token = _bearer_token(authorization)
    student = await row("students", student_id, token)
    await require_parent(student, token, user)
    if payload.confirm_name != student["display_name"]:
        raise HTTPException(422, "Type the student's name exactly to confirm deletion")

    # Keep the database rows (and remote IDs) until all external cleanup succeeds.
    # Deletes are idempotent, so retrying after a provider failure can finish cleanup.
    async def fetch_ids(table, field):
        rows = []
        offset = 0
        while True:
            batch = await rest_request(
                "GET",
                table,
                token,
                params={
                    "select": field,
                    "student_id": f"eq.{student_id}",
                    "order": "id.asc",
                    "limit": "100",
                    "offset": str(offset),
                },
            )
            rows.extend(batch)
            if len(batch) < 100:
                return {r[field] for r in rows if r.get(field)}
            offset += len(batch)

    file_ids = await fetch_ids("learning_materials", "openai_file_id")
    response_ids = await fetch_ids("ai_usage_events", "openai_response_id")
    response_ids |= await fetch_ids("chat_messages", "openai_response_id")
    spaces = await rest_request(
        "GET",
        "student_ai_spaces",
        token,
        params={
            "select": "openai_vector_store_id",
            "student_id": f"eq.{student_id}",
        },
    )
    try:
        service = OpenAIService()
        for response_id in response_ids:
            await service.delete_resource("responses", response_id)
        for space in spaces:
            if space.get("openai_vector_store_id"):
                await service.delete_resource("vector_stores", space["openai_vector_store_id"])
        for file_id in file_ids:
            await service.delete_resource("files", file_id)
        await storage_remove_student(f"{student['family_id']}/{student_id}", token)
    except (httpx.HTTPError, OpenAIServiceError) as exc:
        raise HTTPException(
            503,
            "Data cleanup could not finish. The profile is retained; retry deletion to complete it.",
        ) from exc
    return await rpc(
        "delete_student_data",
        token,
        {
            "target_student": str(student_id),
            "confirm_name": payload.confirm_name,
        },
    )


class SubjectSuggestions(BaseModel):
    subjects: list[OnboardingSubject] = Field(max_length=40)


@router.post("/academic-years/{year_id}/subjects/suggestions")
async def add_suggestions(
    year_id: UUID,
    payload: SubjectSuggestions,
    authorization: str = Header(...),
    user: CurrentUser = Depends(get_current_user),
):
    token = _bearer_token(authorization)
    year = await row("academic_years", year_id, token)
    await require_parent(year, token, user)
    await rpc(
        "add_onboarding_subjects",
        token,
        {
            "target_year": str(year_id),
            "suggestions": [s.model_dump(mode="json") for s in payload.subjects],
        },
    )
    return {"saved": True}
