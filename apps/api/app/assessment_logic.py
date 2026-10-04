import math
from collections import Counter

from .openai_service import OpenAIServiceError


def canonical_mcq(answer, options):
    value = str(answer).strip()
    exact = [o for o in options if o.strip().casefold() == value.casefold()]
    if len(exact) == 1:
        return exact[0]
    label = value.rstrip(").:").strip().upper()
    if len(label) == 1 and "A" <= label < chr(65 + len(options)):
        return options[ord(label) - 65]
    raise OpenAIServiceError("MCQ answer key does not match a unique option")


def validate_questions(questions, count, sections):
    if len(questions) != count:
        raise OpenAIServiceError("Generated test has the wrong number of questions")
    expected = Counter((s.name, s.question_type, s.marks) for s in sections for _ in range(s.count))
    actual = Counter()
    for q in questions:
        if not q["prompt"].strip() or not q["answer_key"].strip():
            raise OpenAIServiceError("Question or answer key is empty")
        if q["question_type"] == "mcq":
            if len(q["options"]) != 4 or len({o.strip().casefold() for o in q["options"]}) != 4:
                raise OpenAIServiceError("MCQ must contain four distinct choices")
            q["answer_key"] = canonical_mcq(q["answer_key"], q["options"])
        elif q["options"]:
            raise OpenAIServiceError("Written questions cannot have MCQ choices")
        actual[(q["section_name"], q["question_type"], q["marks"])] += 1
    if sections and actual != expected:
        raise OpenAIServiceError("Generated test does not match the requested marks blueprint")


def validate_grades(results, questions):
    expected = {q["question_id"]: q["max_marks"] for q in questions}
    if len(results) != len(expected) or {r["question_id"] for r in results} != set(expected):
        raise OpenAIServiceError("Grading was incomplete. No result has been saved; please retry.")
    for r in results:
        score = float(r["awarded_marks"])
        if not math.isfinite(score) or not 0 <= score <= expected[r["question_id"]]:
            raise OpenAIServiceError("Grading returned an invalid score")
    return {
        r["question_id"]: {"awarded_marks": float(r["awarded_marks"]), "feedback": r["feedback"]}
        for r in results
    }
