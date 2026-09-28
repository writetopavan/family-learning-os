from fastapi import APIRouter, Depends, Header, HTTPException, status

from ..auth import CurrentUser, get_current_user
from ..schemas import (
    CreateAcademicYearRequest,
    CreateBookRequest,
    CreateChapterRequest,
    CreateFamilyRequest,
    CreateStudentRequest,
    CreateSubjectRequest,
)
from ..supabase_client import rest_request, rpc

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
    data = await rest_request(
        "POST",
        "students",
        _bearer_token(authorization),
        params={"select": "*"},
        json=payload.model_dump(mode="json"),
    )
    if not data:
        raise HTTPException(status_code=400, detail="Student could not be created")
    return data[0]


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
