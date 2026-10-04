"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
const LearningTreePanel = dynamic(() => import("./LearningTreePanel"));
import MaterialsPanel from "@/components/MaterialsPanel";
import SetupPanel from "@/components/SetupPanel";
const TestsPanel = dynamic(() => import("./TestsPanel"));
const TutorPanel = dynamic(() => import("./TutorPanel"));
import { apiJson } from "@/lib/api";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type {
  AcademicYear,
  Book,
  Chapter,
  Material,
  Membership,
  Student,
  Subject,
} from "@/lib/types";

const PlanningPanel = dynamic(() => import("./PlanningPanel"));

type Tab = "schedule" | "prep" | "tree" | "home" | "tutor" | "materials" | "tests" | "setup";

const NAV: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "home", label: "Overview", icon: "⌂" },
  { id: "tree", label: "Learning tree", icon: "▥" },
  { id: "tutor", label: "AI Tutor", icon: "✦" },
  { id: "materials", label: "Library", icon: "▤" },
  { id: "tests", label: "Tests", icon: "✓" },
  { id: "schedule", label: "Schedule", icon: "◷" },
  { id: "prep", label: "Exam prep", icon: "◎" },
  { id: "setup", label: "Setup", icon: "⚙" },
];

type Props = {
  memberships: Membership[];
  familyId: string;
  students: Student[];
  studentId: string;
  onFamilyChange: (id: string) => void;
  onStudentChange: (id: string) => void;
  onChooseChild: () => void;
  onStudentsChanged: () => Promise<void>;
};

export default function LearningWorkspace({
  memberships, familyId, students, studentId,
  onFamilyChange, onStudentChange, onChooseChild, onStudentsChanged,
}: Props) {
  const [tab, setTab] = useState<Tab>(studentId ? "home" : "setup");
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [bookId, setBookId] = useState("");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterId, setChapterId] = useState("");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [status, setStatus] = useState("");

  const selectedStudent = useMemo(
    () => students.find((item) => item.id === studentId) || null,
    [students, studentId],
  );
  const selectedYear = useMemo(
    () => academicYears.find((item) => item.id === academicYearId) || null,
    [academicYears, academicYearId],
  );
  const selectedSubject = useMemo(
    () => subjects.find((item) => item.id === subjectId) || null,
    [subjects, subjectId],
  );
  const selectedChapter = useMemo(
    () => chapters.find((item) => item.id === chapterId) || null,
    [chapters, chapterId],
  );

  async function loadAcademicYears(targetStudentId = studentId) {
    if (!targetStudentId) {
      setAcademicYears([]);
      setAcademicYearId("");
      return;
    }
    try {
      const data = await apiJson<AcademicYear[]>(
        `/v1/students/${targetStudentId}/academic-years`,
      );
      setAcademicYears(data);
      setAcademicYearId((current) =>
        data.some((item) => item.id === current) ? current : data[0]?.id || "",
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not load academic years.");
    }
  }

  async function loadSubjects(targetYearId = academicYearId) {
    if (!targetYearId) {
      setSubjects([]);
      setSubjectId("");
      return;
    }
    try {
      const data = await apiJson<Subject[]>(
        `/v1/academic-years/${targetYearId}/subjects`,
      );
      setSubjects(data);
      setSubjectId((current) =>
        data.some((item) => item.id === current) ? current : data[0]?.id || "",
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not load subjects.");
    }
  }

  async function loadBooks(targetSubjectId = subjectId) {
    if (!targetSubjectId) {
      setBooks([]);
      setBookId("");
      return;
    }
    try {
      const data = await apiJson<Book[]>(`/v1/subjects/${targetSubjectId}/books`);
      setBooks(data);
      setBookId((current) =>
        data.some((item) => item.id === current) ? current : data[0]?.id || "",
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not load books.");
    }
  }

  async function loadChapters(targetBookId = bookId) {
    if (!targetBookId) {
      setChapters([]);
      setChapterId("");
      return;
    }
    try {
      const data = await apiJson<Chapter[]>(`/v1/books/${targetBookId}/chapters`);
      setChapters(data);
      setChapterId((current) =>
        data.some((item) => item.id === current) ? current : data[0]?.id || "",
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not load chapters.");
    }
  }

  async function loadMaterials(targetStudentId = studentId) {
    if (!targetStudentId) {
      setMaterials([]);
      return;
    }
    try {
      setMaterials(
        await apiJson<Material[]>(`/v1/students/${targetStudentId}/materials`),
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not load materials.");
    }
  }

  useEffect(() => {
    void Promise.all([loadAcademicYears(studentId), loadMaterials(studentId)]);
  }, [studentId]);

  useEffect(() => {
    void loadSubjects(academicYearId);
  }, [academicYearId]);

  useEffect(() => {
    void loadBooks(subjectId);
  }, [subjectId]);

  useEffect(() => {
    void loadChapters(bookId);
  }, [bookId]);

  async function signOut() {
    try {
      const { error } = await createSupabaseBrowserClient().auth.signOut();
      if (error) throw error;
      window.location.href = "/";
    } catch {
      setStatus("Could not sign out. Please try again.");
    }
  }

  const readyMaterials = materials.filter((item) => item.status === "ready").length;
  const contextLabel = [
    selectedYear ? `Grade ${selectedYear.grade_level}` : null,
    selectedSubject?.name,
    selectedChapter?.title,
  ]
    .filter(Boolean)
    .join(" · ");


  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark">✦</span>
          <div><strong>Family Learning</strong><small>OS</small></div>
        </div>

        <nav className="side-nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
            >
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-context">
          <span className="eyebrow">Active learner</span>
          <strong>{selectedStudent?.display_name || "Add a child"}</strong>
          <p>{contextLabel || "Set up grade and subjects"}</p>
        </div>

        <button className="signout-button" onClick={onChooseChild}>← Choose child</button>
        <button className="signout-button" onClick={signOut}>↪ Sign out</button>
      </aside>

      <main className="app-main">
        <header className="topbar">
          <div>
            <span className="eyebrow">Learning workspace</span>
            <h1>
              {tab === "home" && "Good to see you"}
              {tab === "tree" && "Learning tree"}
              {tab === "tutor" && "AI Tutor"}
              {tab === "materials" && "Learning Library"}
              {tab === "tests" && "Tests & Practice"}
              {tab === "setup" && "Academic Setup"}
              {tab === "schedule" && "Student Schedule"}
              {tab === "prep" && "Exam Preparation"}
            </h1>
          </div>

          <div className="context-selectors">
            <select value={familyId} aria-label="Family" onChange={(event) => onFamilyChange(event.target.value)}>
              {memberships.map((item) => (
                <option key={item.family_id} value={item.family_id}>
                  {item.families?.name || "Family"}
                </option>
              ))}
            </select>
            <select value={studentId} aria-label="Child" onChange={(event) => onStudentChange(event.target.value)}>
              {!studentId && <option value="">Choose a child</option>}
              {students.map((student) => (
                <option key={student.id} value={student.id}>{student.display_name}</option>
              ))}
            </select>
          </div>
        </header>

        {selectedStudent && (
            <section className="workspace-panel context-card" aria-label="Current study context">
              <div>
                <span className="eyebrow">Current study context</span>
                <h3>{contextLabel || "Complete academic setup"}</h3>
              </div>
              <div className="context-controls">
                {academicYears.length > 0 && (
                  <select aria-label="Study academic year" value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
                    {academicYears.map((year) => <option key={year.id} value={year.id}>{year.label} · Grade {year.grade_level}</option>)}
                  </select>
                )}
                {subjects.length > 0 && (
                  <select aria-label="Study subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                    {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                  </select>
                )}
                {chapters.length > 0 && (
                  <select aria-label="Study chapter" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
                    {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.sequence}. {chapter.title}</option>)}
                  </select>
                )}
                <button className="text-button" onClick={() => setTab("setup")}>Edit setup →</button>
              </div>
            </section>
        )}

        {status && <div className="alert top-alert">{status}</div>}

        {!selectedStudent && students.length === 0 && (
          <section className="workspace-panel hero-empty">
            <div className="assistant-orb large">✦</div>
            <h2>Add your first child to begin</h2>
            <p>The learning workspace becomes available once a student profile exists.</p>
            <button className="primary-button" onClick={() => setTab("setup")}>Open setup</button>
          </section>
        )}

        {selectedStudent && tab === "home" && (
          <div className="overview-stack">
            <section className="overview-hero">
              <div>
                <span className="eyebrow">Family Learning OS</span>
                <h2>{selectedStudent.display_name}&apos;s learning, in one place.</h2>
                <p>
                  Ask the tutor, upload school material, create practice tests and turn every
                  attempt into evidence of progress.
                </p>
                <div className="hero-actions">
                  <button className="primary-button" onClick={() => setTab("tutor")}>Ask AI Tutor</button>
                  <button className="ghost-button" onClick={() => setTab("materials")}>Upload material</button>
                </div>
              </div>
              <div className="hero-orbit">
                <div className="orbit-core">✦</div>
                <span className="orbit-chip one">Learn</span>
                <span className="orbit-chip two">Practice</span>
                <span className="orbit-chip three">Master</span>
              </div>
            </section>

            <section className="stat-grid">
              <article className="stat-card">
                <span className="stat-icon violet">▤</span>
                <div><strong>{readyMaterials}</strong><span>AI-ready documents</span></div>
              </article>
              <article className="stat-card">
                <span className="stat-icon blue">◎</span>
                <div><strong>{subjects.length}</strong><span>subjects configured</span></div>
              </article>
              <article className="stat-card">
                <span className="stat-icon green">✓</span>
                <div><strong>{chapters.length}</strong><span>chapters in context</span></div>
              </article>
              <article className="stat-card">
                <span className="stat-icon amber">↗</span>
                <div><strong>{selectedYear ? `G${selectedYear.grade_level}` : "—"}</strong><span>current grade</span></div>
              </article>
            </section>

            <section className="quick-grid">
              <button className="quick-card tutor" onClick={() => setTab("tutor")}>
                <span>✦</span>
                <div><strong>Explain anything</strong><p>Chat against textbooks and notes.</p></div>
                <b>›</b>
              </button>
              <button className="quick-card material" onClick={() => setTab("materials")}>
                <span>↑</span>
                <div><strong>Add learning material</strong><p>Upload a PDF, worksheet or notes.</p></div>
                <b>›</b>
              </button>
              <button className="quick-card test" onClick={() => setTab("tests")}>
                <span>✓</span>
                <div><strong>Create a test</strong><p>Generate, submit and get marks.</p></div>
                <b>›</b>
              </button>
            </section>


          </div>
        )}

        {selectedStudent && tab === "tree" && <LearningTreePanel key={studentId} familyId={familyId} studentId={studentId} studentName={selectedStudent.display_name}/>}
        {selectedStudent && tab === "tutor" && (
          <TutorPanel
            key={studentId}
            academicYearId={academicYearId || undefined}
            subjectId={subjectId || undefined}
            chapterId={chapterId || undefined}
            familyId={familyId}
            studentId={studentId}
            studentName={selectedStudent.display_name}
          />
        )}

        {selectedStudent && tab === "materials" && (
          <MaterialsPanel
            key={`${studentId}:${academicYearId}:${subjectId}`}
            subjects={subjects}
            onSubjectChange={setSubjectId}
            familyId={familyId}
            studentId={studentId}
            academicYearId={academicYearId || undefined}
            subjectId={subjectId || undefined}
            chapterId={chapterId || undefined}
            materials={materials}
            onReload={() => loadMaterials(studentId)}
          />
        )}

        {selectedStudent && tab === "tests" && (
          <TestsPanel
            key={studentId}
            familyId={familyId}
            studentId={studentId}
            studentName={selectedStudent.display_name}
            academicYearId={academicYearId || undefined}
            subjectId={subjectId || undefined}
            chapterId={chapterId || undefined}
          />
        )}

        {selectedStudent && (tab === "schedule" || tab === "prep") && <PlanningPanel key={`${studentId}-${tab}`} familyId={familyId} studentId={studentId} studentName={selectedStudent.display_name} view={tab}/>}

        {tab === "setup" && (
          <SetupPanel
            familyId={familyId}
            studentId={studentId}
            students={students}
            academicYears={academicYears}
            selectedAcademicYearId={academicYearId}
            onAcademicYearChange={setAcademicYearId}
            subjects={subjects}
            selectedSubjectId={subjectId}
            onSubjectChange={setSubjectId}
            books={books}
            selectedBookId={bookId}
            onBookChange={setBookId}
            chapters={chapters}
            onStudentsChanged={onStudentsChanged}
            onAcademicYearsChanged={() => loadAcademicYears(studentId)}
            onSubjectsChanged={() => loadSubjects(academicYearId)}
            onBooksChanged={() => loadBooks(subjectId)}
            onChaptersChanged={() => loadChapters(bookId)}
          />
        )}
      </main>
    </div>
  );
}
