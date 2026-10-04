from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CreateFamilyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class FamilyResponse(BaseModel):
    id: UUID
    name: str


class OnboardingSubject(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    language_level: int | None = Field(None, ge=1, le=3)


class OnboardingYear(BaseModel):
    model_config = ConfigDict(extra="forbid")
    family_id: UUID
    label: str = Field(min_length=1, max_length=40)
    start_date: date
    end_date: date
    grade_level: int = Field(ge=4, le=10)

    @model_validator(mode="after")
    def dates_valid(self):
        if self.end_date < self.start_date:
            raise ValueError("End date must follow start date")
        return self


class CreateStudentRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    family_id: UUID
    display_name: str = Field(min_length=1, max_length=120)
    date_of_birth: date | None = None
    board: str | None = Field(None, max_length=120)
    school_name: str | None = Field(None, max_length=240)
    school_location: str | None = Field(None, max_length=240)
    academic_year: "OnboardingYear | None" = None
    subjects: list[OnboardingSubject] = Field(default_factory=list, max_length=40)

    @model_validator(mode="after")
    def validate_setup(self):
        if self.subjects and not self.academic_year:
            raise ValueError("Select a class to save subjects")
        if self.academic_year and self.academic_year.family_id != self.family_id:
            raise ValueError("Academic year must belong to the student's family")
        names = [s.name.casefold() for s in self.subjects]
        if len(names) != len(set(names)):
            raise ValueError("Subject names must be unique")
        levels = [s.language_level for s in self.subjects if s.language_level]
        if len(levels) != len(set(levels)):
            raise ValueError("Choose only one language for each language level")
        return self


class CreateAcademicYearRequest(BaseModel):
    family_id: UUID
    student_id: UUID
    label: str = Field(min_length=1, max_length=40)
    start_date: date
    end_date: date
    grade_level: int = Field(ge=4, le=10)


class CreateSubjectRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    family_id: UUID
    academic_year_id: UUID
    name: str = Field(min_length=1, max_length=120)
    language_level: int | None = Field(None, ge=1, le=3)


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
