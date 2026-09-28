import json
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from ..auth import CurrentUser, get_current_user
from ..config import get_settings
from ..openai_service import OpenAIServiceError, openai_service
from ..supabase_client import rest_request, storage_download

router = APIRouter(prefix="/v1", tags=["learning"])


class RegisterMaterialRequest(BaseModel):
    id: UUID
    family_id: UUID
    student_id: UUID
    academic_year_id: UUID | None = None
    subject_id: UUID | None = None
    chapter_id: UUID | None = None
    title: str = Field(min_length=1, max_length=240)
    file_name: str = Field(min_length=1, max_length=255)
    storage_path: str = Field(min_length=1, max_length=1000)
    mime_type: str | None = None
    size_bytes: int = Field(ge=0)


class ChatRequest(BaseModel):
    family_id: UUID
    student_id: UUID
    message: str = Field(min_length=1, max_length=6000)


class GenerateAssessmentRequest(BaseModel):
    family_id: UUID
    student_id: UUID
    academic_year_id: UUID | None = None
    subject_id: UUID | None = None
    chapter_id: UUID | None = None
    title: str | None = Field(default=None, max_length=200)
    question_count: int = Field(default=10, ge=3, le=30)
    difficulty: Literal["easy", "medium", "hard", "mixed"] = "mixed"


class SubmittedAnswer(BaseModel):
    question_id: UUID
    answer: str = Field(default="", max_length=12000)


class SubmitAssessmentRequest(BaseModel):
    answers: list[SubmittedAnswer]


def _bearer_token(authorization: str) -> str:
    return authorization.removeprefix("Bearer ").strip()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _student(
    *,
    family_id: UUID,
    student_id: UUID,
    access_token: str,
) -> dict[str, Any]:
    rows = await rest_request(
        "GET",
        "students",
        access_token,
        params={
            "select": "id,family_id,display_name",
            "id": f"eq.{student_id}",
            "family_id": f"eq.{family_id}",
            "limit": "1",
        },
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Student was not found in this family")
    return rows[0]


async def _latest_academic_year(
    student_id: UUID,
    access_token: str,
) -> dict[str, Any] | None:
    rows = await rest_request(
        "GET",
        "academic_years",
        access_token,
        params={
            "select": "id,label,grade_level",
            "student_id": f"eq.{student_id}",
            "order": "start_date.desc",
            "limit": "1",
        },
    )
    return rows[0] if rows else None


async def _ai_space(
    *,
    family_id: UUID,
    student_id: UUID,
    student_name: str,
    access_token: str,
    create: bool,
) -> dict[str, Any] | None:
    rows = await rest_request(
        "GET",
        "student_ai_spaces",
        access_token,
        params={
            "select": "*",
            "student_id": f"eq.{student_id}",
            "limit": "1",
        },
    )
    if rows:
        return rows[0]
    if not create:
        return None

    try:
        vector_store_id = await openai_service.create_vector_store(
            name=f"Family Learning OS - {student_name}"
        )
    except OpenAIServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    created = await rest_request(
        "POST",
        "student_ai_spaces",
        access_token,
        json={
            "family_id": str(family_id),
            "student_id": str(student_id),
            "openai_vector_store_id": vector_store_id,
        },
    )
    return created[0]


async def _record_usage(
    *,
    family_id: UUID,
    student_id: UUID,
    feature: str,
    user_id: str,
    response: dict[str, Any],
    access_token: str,
) -> None:
    usage = openai_service.usage(response)
    await rest_request(
        "POST",
        "ai_usage_events",
        access_token,
        json={
            "family_id": str(family_id),
            "student_id": str(student_id),
            "feature": feature,
            "model": get_settings().openai_model,
            **usage,
            "openai_response_id": response.get("id"),
            "created_by": user_id,
        },
    )


@router.get("/students/{student_id}/materials")
async def list_materials(
    student_id: UUID,
    authorization: str = Header(...),
    _: CurrentUser = Depends(get_current_user),
):
    token = _bearer_token(authorization)
    return await rest_request(
        "GET",
        "learning_materials",
        token,
        params={
            "select": "*",
            "student_id": f"eq.{student_id}",
            "order": "created_at.desc",
        },
    )


@router.post("/materials/register", status_code=status.HTTP_201_CREATED)
async def register_material(
    payload: RegisterMaterialRequest,
    authorization: str = Header(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    token = _bearer_token(authorization)
    student = await _student(
        family_id=payload.family_id,
        student_id=payload.student_id,
        access_token=token,
    )

    expected_prefix = f"{payload.family_id}/{payload.student_id}/{payload.id}/"
    if not payload.storage_path.startswith(expected_prefix):
        raise HTTPException(status_code=400, detail="Invalid material storage path")

    settings = get_settings()
    if payload.size_bytes > settings.max_material_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {settings.max_material_bytes // 1_000_000} MB MVP limit",
        )

    existing = await rest_request(
        "GET",
        "learning_materials",
        token,
        params={"select": "id", "id": f"eq.{payload.id}", "limit": "1"},
    )
    if existing:
        raise HTTPException(status_code=409, detail="Material is already registered")

    material = await rest_request(
        "POST",
        "learning_materials",
        token,
        json={
            **payload.model_dump(mode="json"),
            "status": "processing",
            "created_by": current_user.id,
        },
    )

    try:
        content = await storage_download(
            "learning-materials",
            payload.storage_path,
            token,
        )

        ai_space = await _ai_space(
            family_id=payload.family_id,
            student_id=payload.student_id,
            student_name=student["display_name"],
            access_token=token,
            create=True,
        )
        vector_store_id = ai_space["openai_vector_store_id"]

        openai_file_id = await openai_service.upload_file(
            filename=payload.file_name,
            content=content,
            mime_type=payload.mime_type,
        )
        await openai_service.attach_file(
            vector_store_id=vector_store_id,
            file_id=openai_file_id,
        )
        vector_status = await openai_service.wait_for_vector_file(
            vector_store_id=vector_store_id,
            file_id=openai_file_id,
        )
        material_status = "ready" if vector_status == "completed" else "processing"
        if vector_status in {"failed", "cancelled"}:
            material_status = "failed"

        updated = await rest_request(
            "PATCH",
            "learning_materials",
            token,
            params={"id": f"eq.{payload.id}"},
            json={
                "openai_file_id": openai_file_id,
                "openai_vector_store_id": vector_store_id,
                "status": material_status,
                "error_message": None,
            },
        )
        return updated[0]
    except (OpenAIServiceError, httpx.HTTPError) as exc:
        await rest_request(
            "PATCH",
            "learning_materials",
            token,
            params={"id": f"eq.{payload.id}"},
            json={
                "status": "failed",
                "error_message": str(exc)[:800],
            },
        )
        raise HTTPException(status_code=502, detail=f"Document indexing failed: {exc}") from exc


@router.get("/students/{student_id}/chat")
async def chat_history(
    student_id: UUID,
    authorization: str = Header(...),
    _: CurrentUser = Depends(get_current_user),
):
    token = _bearer_token(authorization)
    rows = await rest_request(
        "GET",
        "chat_messages",
        token,
        params={
            "select": "id,role,content,created_at",
            "student_id": f"eq.{student_id}",
            "order": "created_at.asc",
            "limit": "100",
        },
    )
    return rows


@router.post("/chat")
async def chat(
    payload: ChatRequest,
    authorization: str = Header(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    token = _bearer_token(authorization)
    student = await _student(
        family_id=payload.family_id,
        student_id=payload.student_id,
        access_token=token,
    )
    academic_year = await _latest_academic_year(payload.student_id, token)
    ai_space = await _ai_space(
        family_id=payload.family_id,
        student_id=payload.student_id,
        student_name=student["display_name"],
        access_token=token,
        create=False,
    )

    history = await rest_request(
        "GET",
        "chat_messages",
        token,
        params={
            "select": "role,content",
            "student_id": f"eq.{payload.student_id}",
            "order": "created_at.desc",
            "limit": "10",
        },
    )
    history = list(reversed(history or []))
    input_items = [
        {"role": item["role"], "content": item["content"]}
        for item in history
    ]
    input_items.append({"role": "user", "content": payload.message})

    grade_context = (
        f"Grade {academic_year['grade_level']}"
        if academic_year
        else "a school student in Grades 4-10"
    )
    instructions = (
        f"You are the Family Learning OS tutor for {student['display_name']}, {grade_context}. "
        "Teach clearly, warmly and accurately. Prefer the student's uploaded school material "
        "when it contains the answer. Use file search when relevant. If the uploaded material "
        "does not support an answer, say that briefly before using general knowledge. "
        "Explain concepts rather than merely giving a final answer, and keep the depth appropriate "
        "for the student's grade. Use short sections, examples and checks for understanding."
    )

    await rest_request(
        "POST",
        "chat_messages",
        token,
        json={
            "family_id": str(payload.family_id),
            "student_id": str(payload.student_id),
            "role": "user",
            "content": payload.message,
            "created_by": current_user.id,
        },
    )

    try:
        response = await openai_service.respond(
            input_items=input_items,
            instructions=instructions,
            vector_store_id=ai_space["openai_vector_store_id"] if ai_space else None,
            max_output_tokens=2500,
        )
        answer = openai_service.output_text(response)
        if not answer:
            raise OpenAIServiceError("The tutor returned an empty answer")
    except OpenAIServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    created = await rest_request(
        "POST",
        "chat_messages",
        token,
        json={
            "family_id": str(payload.family_id),
            "student_id": str(payload.student_id),
            "role": "assistant",
            "content": answer,
            "created_by": current_user.id,
            "model": get_settings().openai_model,
            "openai_response_id": response.get("id"),
        },
    )
    await _record_usage(
        family_id=payload.family_id,
        student_id=payload.student_id,
        feature="tutor_chat",
        user_id=current_user.id,
        response=response,
        access_token=token,
    )
    return created[0]


@router.get("/students/{student_id}/assessments")
async def list_assessments(
    student_id: UUID,
    authorization: str = Header(...),
    _: CurrentUser = Depends(get_current_user),
):
    token = _bearer_token(authorization)
    return await rest_request(
        "GET",
        "assessments",
        token,
        params={
            "select": "*",
            "student_id": f"eq.{student_id}",
            "order": "created_at.desc",
        },
    )


def _assessment_schema(question_count: int) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "questions": {
                "type": "array",
                "minItems": question_count,
                "maxItems": question_count,
                "items": {
                    "type": "object",
                    "properties": {
                        "question_type": {
                            "type": "string",
                            "enum": ["mcq", "short", "long"],
                        },
                        "prompt": {"type": "string"},
                        "options": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "answer_key": {"type": "string"},
                        "explanation": {"type": "string"},
                        "marks": {"type": "integer", "minimum": 1, "maximum": 10},
                        "difficulty": {
                            "type": "string",
                            "enum": ["easy", "medium", "hard"],
                        },
                        "concept": {"type": "string"},
                    },
                    "required": [
                        "question_type",
                        "prompt",
                        "options",
                        "answer_key",
                        "explanation",
                        "marks",
                        "difficulty",
                        "concept",
                    ],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["title", "questions"],
        "additionalProperties": False,
    }


@router.post("/assessments/generate", status_code=status.HTTP_201_CREATED)
async def generate_assessment(
    payload: GenerateAssessmentRequest,
    authorization: str = Header(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    token = _bearer_token(authorization)
    student = await _student(
        family_id=payload.family_id,
        student_id=payload.student_id,
        access_token=token,
    )
    academic_year = await _latest_academic_year(payload.student_id, token)
    ai_space = await _ai_space(
        family_id=payload.family_id,
        student_id=payload.student_id,
        student_name=student["display_name"],
        access_token=token,
        create=False,
    )
    if not ai_space:
        raise HTTPException(
            status_code=400,
            detail="Upload and index at least one learning document before generating a test",
        )

    prompt = (
        f"Create exactly {payload.question_count} questions for {student['display_name']}. "
        f"Difficulty preference: {payload.difficulty}. "
        "Base the test on the uploaded learning material. Mix MCQ, short-answer and longer "
        "reasoning questions where appropriate. MCQs must have exactly four options. "
        "For non-MCQ questions use an empty options array. Use age-appropriate language. "
        "Give each question sensible marks and include an answer key and concise grading explanation."
    )
    if payload.title:
        prompt += f" Requested test title/topic: {payload.title}."
    if academic_year:
        prompt += f" The student is in Grade {academic_year['grade_level']}."

    try:
        response = await openai_service.respond(
            input_items=prompt,
            instructions=(
                "You are an expert school assessment designer. Ground every question in the "
                "student's uploaded material. Do not invent facts that are absent from the material."
            ),
            vector_store_id=ai_space["openai_vector_store_id"],
            schema_name="assessment",
            schema=_assessment_schema(payload.question_count),
            max_output_tokens=7000,
        )
        generated = openai_service.output_json(response)
    except OpenAIServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    questions = generated["questions"]
    total_marks = sum(int(question["marks"]) for question in questions)
    assessment_title = payload.title or str(generated["title"])[:200]

    created = await rest_request(
        "POST",
        "assessments",
        token,
        json={
            "family_id": str(payload.family_id),
            "student_id": str(payload.student_id),
            "academic_year_id": str(payload.academic_year_id) if payload.academic_year_id else None,
            "subject_id": str(payload.subject_id) if payload.subject_id else None,
            "chapter_id": str(payload.chapter_id) if payload.chapter_id else None,
            "title": assessment_title,
            "difficulty": payload.difficulty,
            "question_count": len(questions),
            "total_marks": total_marks,
            "source": "ai",
            "status": "ready",
            "created_by": current_user.id,
        },
    )
    assessment = created[0]

    for sequence, question in enumerate(questions, start=1):
        question_row = await rest_request(
            "POST",
            "assessment_questions",
            token,
            json={
                "assessment_id": assessment["id"],
                "family_id": str(payload.family_id),
                "sequence": sequence,
                "question_type": question["question_type"],
                "prompt": question["prompt"],
                "options": question["options"],
                "marks": int(question["marks"]),
                "difficulty": question["difficulty"],
                "concept": question["concept"],
            },
        )
        await rest_request(
            "POST",
            "assessment_answer_keys",
            token,
            json={
                "question_id": question_row[0]["id"],
                "family_id": str(payload.family_id),
                "answer_key": question["answer_key"],
                "explanation": question["explanation"],
            },
        )

    await _record_usage(
        family_id=payload.family_id,
        student_id=payload.student_id,
        feature="assessment_generation",
        user_id=current_user.id,
        response=response,
        access_token=token,
    )
    return assessment


@router.get("/assessments/{assessment_id}")
async def get_assessment(
    assessment_id: UUID,
    authorization: str = Header(...),
    _: CurrentUser = Depends(get_current_user),
):
    token = _bearer_token(authorization)
    assessments = await rest_request(
        "GET",
        "assessments",
        token,
        params={"select": "*", "id": f"eq.{assessment_id}", "limit": "1"},
    )
    if not assessments:
        raise HTTPException(status_code=404, detail="Assessment not found")
    questions = await rest_request(
        "GET",
        "assessment_questions",
        token,
        params={
            "select": "*",
            "assessment_id": f"eq.{assessment_id}",
            "order": "sequence.asc",
        },
    )
    return {"assessment": assessments[0], "questions": questions}


def _grading_schema(item_count: int) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "overall_feedback": {"type": "string"},
            "results": {
                "type": "array",
                "minItems": item_count,
                "maxItems": item_count,
                "items": {
                    "type": "object",
                    "properties": {
                        "question_id": {"type": "string"},
                        "awarded_marks": {"type": "number"},
                        "feedback": {"type": "string"},
                    },
                    "required": ["question_id", "awarded_marks", "feedback"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["overall_feedback", "results"],
        "additionalProperties": False,
    }


@router.post("/assessments/{assessment_id}/submit")
async def submit_assessment(
    assessment_id: UUID,
    payload: SubmitAssessmentRequest,
    authorization: str = Header(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    token = _bearer_token(authorization)
    assessments = await rest_request(
        "GET",
        "assessments",
        token,
        params={"select": "*", "id": f"eq.{assessment_id}", "limit": "1"},
    )
    if not assessments:
        raise HTTPException(status_code=404, detail="Assessment not found")
    assessment = assessments[0]

    questions = await rest_request(
        "GET",
        "assessment_questions",
        token,
        params={
            "select": "*",
            "assessment_id": f"eq.{assessment_id}",
            "order": "sequence.asc",
        },
    )
    keys = await rest_request(
        "GET",
        "assessment_answer_keys",
        token,
        params={
            "select": "*",
            "family_id": f"eq.{assessment['family_id']}",
        },
    )
    key_by_question = {item["question_id"]: item for item in keys or []}
    submitted = {str(item.question_id): item.answer.strip() for item in payload.answers}

    grading: dict[str, dict[str, Any]] = {}
    open_questions: list[dict[str, Any]] = []

    for question in questions:
        question_id = str(question["id"])
        answer = submitted.get(question_id, "")
        key = key_by_question.get(question_id)
        if not key:
            raise HTTPException(status_code=500, detail="Assessment answer key is incomplete")

        if question["question_type"] == "mcq":
            correct = answer.casefold().strip() == str(key["answer_key"]).casefold().strip()
            grading[question_id] = {
                "awarded_marks": float(question["marks"]) if correct else 0.0,
                "feedback": (
                    "Correct."
                    if correct
                    else f"Not quite. Correct answer: {key['answer_key']}. {key.get('explanation') or ''}".strip()
                ),
            }
        else:
            open_questions.append(
                {
                    "question_id": question_id,
                    "prompt": question["prompt"],
                    "max_marks": int(question["marks"]),
                    "answer_key": key["answer_key"],
                    "grading_note": key.get("explanation") or "",
                    "student_answer": answer,
                }
            )

    overall_feedback = "Assessment graded."
    grading_response: dict[str, Any] | None = None

    if open_questions:
        ai_space_rows = await rest_request(
            "GET",
            "student_ai_spaces",
            token,
            params={
                "select": "openai_vector_store_id",
                "student_id": f"eq.{assessment['student_id']}",
                "limit": "1",
            },
        )
        vector_store_id = (
            ai_space_rows[0]["openai_vector_store_id"] if ai_space_rows else None
        )

        try:
            grading_response = await openai_service.respond(
                input_items=(
                    "Grade the following student answers. Award partial credit where deserved. "
                    "Never award more than max_marks. Empty answers receive zero. Return concise, "
                    "constructive feedback.\n\n"
                    + json.dumps(open_questions, ensure_ascii=False)
                ),
                instructions=(
                    "You are a fair school teacher grading student work against supplied answer keys. "
                    "Focus on correctness, reasoning and required concepts rather than exact wording."
                ),
                vector_store_id=vector_store_id,
                schema_name="grading",
                schema=_grading_schema(len(open_questions)),
                max_output_tokens=4000,
            )
            ai_grade = openai_service.output_json(grading_response)
            overall_feedback = ai_grade["overall_feedback"]
            max_by_id = {
                item["question_id"]: float(item["max_marks"]) for item in open_questions
            }
            for item in ai_grade["results"]:
                question_id = str(item["question_id"])
                if question_id not in max_by_id:
                    continue
                grading[question_id] = {
                    "awarded_marks": max(
                        0.0,
                        min(float(item["awarded_marks"]), max_by_id[question_id]),
                    ),
                    "feedback": item["feedback"],
                }
        except OpenAIServiceError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    max_score = float(sum(int(question["marks"]) for question in questions))
    score = sum(float(grading.get(str(q["id"]), {}).get("awarded_marks", 0)) for q in questions)

    attempt_rows = await rest_request(
        "POST",
        "assessment_attempts",
        token,
        json={
            "family_id": assessment["family_id"],
            "assessment_id": str(assessment_id),
            "student_id": assessment["student_id"],
            "submitted_by": current_user.id,
            "status": "graded",
            "score": score,
            "max_score": max_score,
            "overall_feedback": overall_feedback,
            "submitted_at": _now(),
            "graded_at": _now(),
        },
    )
    attempt = attempt_rows[0]

    answer_rows: list[dict[str, Any]] = []
    for question in questions:
        question_id = str(question["id"])
        result = grading.get(
            question_id,
            {"awarded_marks": 0.0, "feedback": "No answer submitted."},
        )
        created = await rest_request(
            "POST",
            "assessment_answers",
            token,
            json={
                "attempt_id": attempt["id"],
                "family_id": assessment["family_id"],
                "question_id": question_id,
                "answer": submitted.get(question_id, ""),
                "awarded_marks": result["awarded_marks"],
                "feedback": result["feedback"],
            },
        )
        answer_rows.append(created[0])

    if grading_response is not None:
        await _record_usage(
            family_id=UUID(assessment["family_id"]),
            student_id=UUID(assessment["student_id"]),
            feature="assessment_grading",
            user_id=current_user.id,
            response=grading_response,
            access_token=token,
        )

    percentage = round((score / max_score * 100) if max_score else 0, 1)
    return {
        "attempt": attempt,
        "answers": answer_rows,
        "score": round(score, 2),
        "max_score": max_score,
        "percentage": percentage,
        "overall_feedback": overall_feedback,
    }
