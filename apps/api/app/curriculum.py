from fastapi import HTTPException

from .supabase_client import rest_request


async def row(table, id, token):
    rows = await rest_request(
        "GET", table, token, params={"select": "*", "id": f"eq.{id}", "limit": "1"}
    )
    if not rows:
        raise HTTPException(404, "Item not found")
    return rows[0]


async def context(student_id, family_id, token, year_id=None, subject_id=None, chapter_ids=None):
    student = await row("students", student_id, token)
    if student["family_id"] != str(family_id):
        raise HTTPException(400, "Student does not belong to this family")
    chapters = []
    for chapter_id in dict.fromkeys(str(x) for x in (chapter_ids or [])):
        chapter = await row("chapters", chapter_id, token)
        book = await row("books", chapter["book_id"], token)
        if subject_id and str(subject_id) != book["subject_id"]:
            raise HTTPException(400, "Choose chapters from the selected subject")
        subject_id = book["subject_id"]
        chapters.append(chapter)
    subject = await row("subjects", subject_id, token) if subject_id else None
    if subject:
        if year_id and str(year_id) != subject["academic_year_id"]:
            raise HTTPException(400, "Subject does not belong to the selected academic year")
        year_id = subject["academic_year_id"]
    year = await row("academic_years", year_id, token) if year_id else None
    if year and (year["student_id"] != str(student_id) or year["family_id"] != str(family_id)):
        raise HTTPException(400, "Academic year does not belong to this student")
    if any(x["family_id"] != str(family_id) for x in [*chapters, *([subject] if subject else [])]):
        raise HTTPException(400, "Invalid learning context")
    return {
        "academic_year_id": str(year_id) if year_id else None,
        "subject_id": str(subject_id) if subject_id else None,
        "chapter_ids": [x["id"] for x in chapters],
        "label": " / ".join(
            [
                str(year["grade_level"]) if year else "",
                subject["name"] if subject else "",
                ", ".join(x["title"] for x in chapters),
            ]
        ).strip(" /"),
    }
