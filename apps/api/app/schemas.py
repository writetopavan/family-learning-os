from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field


class CreateFamilyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class FamilyResponse(BaseModel):
    id: UUID
    name: str


class CreateStudentRequest(BaseModel):
    family_id: UUID
    display_name: str = Field(min_length=1, max_length=120)
    date_of_birth: date | None = None


class CreateAcademicYearRequest(BaseModel):
    family_id: UUID
    student_id: UUID
    label: str = Field(min_length=1, max_length=40)
    start_date: date
    end_date: date
    grade_level: int = Field(ge=4, le=10)


class CreateSubjectRequest(BaseModel):
    family_id: UUID
    academic_year_id: UUID
    name: str = Field(min_length=1, max_length=120)


class CreateBookRequest(BaseModel):
    family_id: UUID
    subject_id: UUID
    title: str = Field(min_length=1, max_length=240)
    publisher: str | None = None
    edition: str | None = None


class CreateChapterRequest(BaseModel):
    family_id: UUID
    book_id: UUID
    title: str = Field(min_length=1, max_length=240)
    sequence: int = Field(gt=0)
