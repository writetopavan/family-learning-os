from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import CurrentUser, get_current_user
from ..schemas import (
    CreateAcademicYearRequest,
    CreateBookRequest,
    CreateChapterRequest,
    CreateFamilyRequest,
    CreateStudentRequest,
    CreateSubjectRequest,
)
from ..supabase_client import create_anon_client

router = APIRouter(prefix="/v1", tags=["family"])


def _client_for_user(token: str):
    client = create_anon_client()
    client.auth.set_session(token, "")
    return client


def _bearer_token(authorization: str) -> str:
    return authorization.removeprefix("Bearer ").strip()


@router.post("/families", status_code=status.HTTP_201_CREATED)
async def create_family(
    payload: CreateFamilyRequest,
    authorization: str,
    _: CurrentUser = Depends(get_current_user),
):
    client = _client_for_user(_bearer_token(authorization))
    result = client.rpc("create_family_with_parent", {"family_name": payload.name}).execute()
    return {"id": result.data, "name": payload.name}


@router.get("/families")
async def list_families(
    authorization: str,
    _: CurrentUser = Depends(get_current_user),
):
    client = _client_for_user(_bearer_token(authorization))
    memberships = (
        client.table("family_memberships")
        .select("family_id, role, families(id,name)")
        .eq("status", "active")
        .execute()
    )
    return memberships.data


@router.post("/students", status_code=status.HTTP_201_CREATED)
async def create_student(
    payload: CreateStudentRequest,
    authorization: str,
    _: CurrentUser = Depends(get_current_user),
):
    client = _client_for_user(_bearer_token(authorization))
    row = payload.model_dump(mode="json")
    result = client.table("students").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Student could not be created")
    return result.data[0]


@router.get("/families/{family_id}/students")
async def list_students(
    family_id: str,
    authorization: str,
    _: CurrentUser = Depends(get_current_user),
):
    client = _client_for_user(_bearer_token(authorization))
    result = (
        client.table("students")
        .select("*")
        .eq("family_id", family_id)
        .eq("active", True)
        .order("display_name")
        .execute()
    )
    return result.data


@router.post("/academic-years", status_code=status.HTTP_201_CREATED)
async def create_academic_year(
    payload: CreateAcademicYearRequest,
    authorization: str,
    _: CurrentUser = Depends(get_current_user),
):
    client = _client_for_user(_bearer_token(authorization))
    result = client.table("academic_years").insert(payload.model_dump(mode="json")).execute()
    return result.data[0]


@router.post("/subjects", status_code=status.HTTP_201_CREATED)
async def create_subject(
    payload: CreateSubjectRequest,
    authorization: str,
    _: CurrentUser = Depends(get_current_user),
):
    client = _client_for_user(_bearer_token(authorization))
    result = client.table("subjects").insert(payload.model_dump(mode="json")).execute()
    return result.data[0]


@router.post("/books", status_code=status.HTTP_201_CREATED)
async def create_book(
    payload: CreateBookRequest,
    authorization: str,
    _: CurrentUser = Depends(get_current_user),
):
    client = _client_for_user(_bearer_token(authorization))
    result = client.table("books").insert(
        payload.model_dump(mode="json", exclude_none=True)
    ).execute()
    return result.data[0]


@router.post("/chapters", status_code=status.HTTP_201_CREATED)
async def create_chapter(
    payload: CreateChapterRequest,
    authorization: str,
    _: CurrentUser = Depends(get_current_user),
):
    client = _client_for_user(_bearer_token(authorization))
    result = client.table("chapters").insert(payload.model_dump(mode="json")).execute()
    return result.data[0]
