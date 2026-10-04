"use client";

import { FormEvent, useState } from "react";
import CurriculumEditor from "./CurriculumEditor";
import { apiJson } from "@/lib/api";
import type { AcademicYear, Book, Chapter, Student, Subject } from "@/lib/types";

type Props = {
  familyId: string;
  studentId: string;
  students: Student[];
  academicYears: AcademicYear[];
  selectedAcademicYearId: string;
  onAcademicYearChange: (id: string) => void;
  subjects: Subject[];
  selectedSubjectId: string;
  onSubjectChange: (id: string) => void;
  books: Book[];
  selectedBookId: string;
  onBookChange: (id: string) => void;
  chapters: Chapter[];
  onStudentsChanged: () => Promise<void>;
  onAcademicYearsChanged: () => Promise<void>;
  onSubjectsChanged: () => Promise<void>;
  onBooksChanged: () => Promise<void>;
  onChaptersChanged: () => Promise<void>;
};

export default function SetupPanel({
  familyId,
  studentId,
  students,
  academicYears,
  selectedAcademicYearId,
  onAcademicYearChange,
  subjects,
  selectedSubjectId,
  onSubjectChange,
  books,
  selectedBookId,
  onBookChange,
  chapters,
  onStudentsChanged,
  onAcademicYearsChanged,
  onSubjectsChanged,
  onBooksChanged,
  onChaptersChanged,
}: Props) {
  const [studentName, setStudentName] = useState("");
  const [studentDob, setStudentDob] = useState("");
  const [yearLabel, setYearLabel] = useState("2026-27");
  const [gradeLevel, setGradeLevel] = useState("4");
  const [startDate, setStartDate] = useState("2026-04-01");
  const [endDate, setEndDate] = useState("2027-03-31");
  const [subjectName, setSubjectName] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [publisher, setPublisher] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterSequence, setChapterSequence] = useState("1");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setStatus("");
    try {
      await action();
      setStatus(success);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function addStudent(event: FormEvent) {
    event.preventDefault();
    if (!studentName.trim()) return;
    await run(async () => {
      await apiJson("/v1/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          family_id: familyId,
          display_name: studentName.trim(),
          date_of_birth: studentDob || null,
        }),
      });
      setStudentName("");
      setStudentDob("");
      await onStudentsChanged();
    }, "Child profile added.");
  }

  async function addYear(event: FormEvent) {
    event.preventDefault();
    if (!studentId) return;
    await run(async () => {
      await apiJson("/v1/academic-years", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          family_id: familyId,
          student_id: studentId,
          label: yearLabel.trim(),
          start_date: startDate,
          end_date: endDate,
          grade_level: Number(gradeLevel),
        }),
      });
      await onAcademicYearsChanged();
    }, "Academic year added.");
  }

  async function addSubject(event: FormEvent) {
    event.preventDefault();
    if (!selectedAcademicYearId || !subjectName.trim()) return;
    await run(async () => {
      await apiJson("/v1/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          family_id: familyId,
          academic_year_id: selectedAcademicYearId,
          name: subjectName.trim(),
        }),
      });
      setSubjectName("");
      await onSubjectsChanged();
    }, "Subject added.");
  }

  async function addBook(event: FormEvent) {
    event.preventDefault();
    if (!selectedSubjectId || !bookTitle.trim()) return;
    await run(async () => {
      await apiJson("/v1/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          family_id: familyId,
          subject_id: selectedSubjectId,
          title: bookTitle.trim(),
          publisher: publisher.trim() || null,
          edition: null,
        }),
      });
      setBookTitle("");
      setPublisher("");
      await onBooksChanged();
    }, "Book added.");
  }

  async function addChapter(event: FormEvent) {
    event.preventDefault();
    if (!selectedBookId || !chapterTitle.trim()) return;
    await run(async () => {
      await apiJson("/v1/chapters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          family_id: familyId,
          book_id: selectedBookId,
          title: chapterTitle.trim(),
          sequence: Number(chapterSequence),
        }),
      });
      setChapterTitle("");
      setChapterSequence(String(Number(chapterSequence) + 1));
      await onChaptersChanged();
    }, "Chapter added.");
  }

  return (
    <section className="workspace-panel setup-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Curriculum setup</span>
          <h2>Build the learning structure</h2>
          <p>Student → academic year → subject → book → chapter. This becomes the spine for tracking mastery.</p>
        </div>
      </div>

      {status && <div className="alert">{status}</div>}

      <div className="setup-grid">
        <article className="setup-card">
          <div className="setup-step"><span>1</span><div><strong>Children</strong><p>{students.length} profiles</p></div></div>
          <form className="mini-form" onSubmit={addStudent}>
            <input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Child name" required />
            <input type="date" value={studentDob} onChange={(e) => setStudentDob(e.target.value)} />
            <button disabled={busy} className="secondary-button" type="submit">Add child</button>
          </form>
        </article>

        <article className="setup-card">
          <div className="setup-step"><span>2</span><div><strong>Academic year</strong><p>{academicYears.length} configured</p></div></div>
          {academicYears.length > 0 && (
            <select value={selectedAcademicYearId} onChange={(e) => onAcademicYearChange(e.target.value)}>
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>{year.label} · Grade {year.grade_level}</option>
              ))}
            </select>
          )}
          <CurriculumEditor resource="academic-years" items={academicYears} onReload={onAcademicYearsChanged} />
          <form className="mini-form two-col" onSubmit={addYear}>
            <input value={yearLabel} onChange={(e) => setYearLabel(e.target.value)} placeholder="2026-27" required />
            <select value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)}>
              {[4,5,6,7,8,9,10].map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}
            </select>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            <button disabled={busy || !studentId} className="secondary-button" type="submit">Add academic year</button>
          </form>
        </article>

        <article className="setup-card">
          <div className="setup-step"><span>3</span><div><strong>Subjects</strong><p>{subjects.length} subjects</p></div></div>
          {subjects.length > 0 && (
            <select value={selectedSubjectId} onChange={(e) => onSubjectChange(e.target.value)}>
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          )}
          <CurriculumEditor resource="subjects" items={subjects} onReload={onSubjectsChanged} />
          <form className="mini-form" onSubmit={addSubject}>
            <input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="e.g. Science" required />
            <button disabled={busy || !selectedAcademicYearId} className="secondary-button" type="submit">Add subject</button>
          </form>
        </article>

        <article className="setup-card">
          <div className="setup-step"><span>4</span><div><strong>Books</strong><p>{books.length} books</p></div></div>
          {books.length > 0 && (
            <select value={selectedBookId} onChange={(e) => onBookChange(e.target.value)}>
              {books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}
            </select>
          )}
          <CurriculumEditor resource="books" items={books} onReload={onBooksChanged} />
          <form className="mini-form" onSubmit={addBook}>
            <input value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} placeholder="Book title" required />
            <input value={publisher} onChange={(e) => setPublisher(e.target.value)} placeholder="Publisher (optional)" />
            <button disabled={busy || !selectedSubjectId} className="secondary-button" type="submit">Add book</button>
          </form>
        </article>

        <article className="setup-card full">
          <div className="setup-step"><span>5</span><div><strong>Chapters</strong><p>{chapters.length} chapters</p></div></div>
          {chapters.length > 0 && (
            <div className="chapter-chips">
              {chapters.map((chapter) => <span key={chapter.id}>{chapter.sequence}. {chapter.title}</span>)}
            </div>
          )}
          <CurriculumEditor resource="chapters" items={chapters} onReload={onChaptersChanged} />
          <form className="mini-form chapter-form" onSubmit={addChapter}>
            <input type="number" min="1" value={chapterSequence} onChange={(e) => setChapterSequence(e.target.value)} />
            <input value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} placeholder="Chapter title" required />
            <button disabled={busy || !selectedBookId} className="secondary-button" type="submit">Add chapter</button>
          </form>
        </article>
      </div>
    </section>
  );
}
