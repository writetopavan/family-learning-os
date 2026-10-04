from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from ..auth import CurrentUser, get_current_user
from ..curriculum import row
from ..supabase_client import rest_request

router = APIRouter(prefix="/v1/curriculum", tags=["curriculum"])
Resource = Literal["academic-years", "subjects", "books", "chapters"]
TABLES = {
    "academic-years": "academic_years",
    "subjects": "subjects",
    "books": "books",
    "chapters": "chapters",
}
FIELDS = {
    "academic-years": {"label", "grade_level", "start_date", "end_date"},
    "subjects": {"name"},
    "books": {"title", "publisher", "edition"},
    "chapters": {"title", "sequence"},
}


class Edit(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    label: str | None = Field(None, min_length=1, max_length=40)
    name: str | None = Field(None, min_length=1, max_length=120)
    title: str | None = Field(None, min_length=1, max_length=240)
    publisher: str | None = Field(None, max_length=240)
    edition: str | None = Field(None, max_length=120)
    grade_level: int | None = Field(None, ge=4, le=10)
    sequence: int | None = Field(None, gt=0)
    start_date: date | None = None
    end_date: date | None = None


async def require_parent(item, token, user):
    members = await rest_request(
        "GET",
        "family_memberships",
        token,
        params={
            "select": "id",
            "family_id": f"eq.{item['family_id']}",
            "user_id": f"eq.{user.id}",
            "role": "eq.parent",
            "status": "eq.active",
        },
    )
    if not members:
        raise HTTPException(403, "Only a parent can edit academic setup")


@router.patch("/{resource}/{item_id}")
async def edit(
    resource: Resource,
    item_id: UUID,
    payload: Edit,
    authorization: str = Header(...),
    user: CurrentUser = Depends(get_current_user),
):
    token = authorization.removeprefix("Bearer ").strip()
    table = TABLES[resource]
    item = await row(table, item_id, token)
    await require_parent(item, token, user)
    values = payload.model_dump(exclude_unset=True, mode="json")
    if (
        not values
        or set(values) - FIELDS[resource]
        or any(v is None and k not in {"publisher", "edition"} for k, v in values.items())
    ):
        raise HTTPException(422, "Invalid fields for this item")
    merged = {**item, **values}
    if resource == "academic-years" and merged["end_date"] < merged["start_date"]:
        raise HTTPException(422, "End date must follow start date")
    rows = await rest_request("PATCH", table, token, params={"id": f"eq.{item_id}"}, json=values)
    return rows[0]


@router.delete("/{resource}/{item_id}")
async def delete(
    resource: Resource,
    item_id: UUID,
    authorization: str = Header(...),
    user: CurrentUser = Depends(get_current_user),
):
    token = authorization.removeprefix("Bearer ").strip()
    item = await row(TABLES[resource], item_id, token)
    await require_parent(item, token, user)
    # Deletion is deliberately limited to empty nodes: no hidden cascades or lost learning history.
    child = {
        "academic-years": ("subjects", "academic_year_id"),
        "subjects": ("books", "subject_id"),
        "books": ("chapters", "book_id"),
    }.get(resource)
    checks = [child] if child else []
    field = {
        "academic-years": "academic_year_id",
        "subjects": "subject_id",
        "chapters": "chapter_id",
    }.get(resource)
    if field:
        checks += [
            (table, field) for table in ("learning_materials", "assessments", "learning_contents")
        ]
    for table, key in checks:
        rows = await rest_request(
            "GET", table, token, params={"select": "id", key: f"eq.{item_id}", "limit": "1"}
        )
        if rows:
            raise HTTPException(
                409,
                "This item contains curriculum or saved learning. Remove its contents first; learning history is preserved.",
            )
    if resource == "chapters":
        links = await rest_request(
            "GET",
            "assessment_chapters",
            token,
            params={"select": "assessment_id", "chapter_id": f"eq.{item_id}", "limit": "1"},
        )
        if links:
            raise HTTPException(409, "This chapter is referenced by a test")
    await rest_request("DELETE", TABLES[resource], token, params={"id": f"eq.{item_id}"})
    return {"deleted": str(item_id)}
