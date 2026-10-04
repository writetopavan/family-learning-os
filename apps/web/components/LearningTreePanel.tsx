"use client";
import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api";
import type { LearningTree, Lesson } from "@/lib/types";
import TutorPanel from "./TutorPanel";
import TestsPanel from "./TestsPanel";
import Markdown from "./Markdown";
export default function LearningTreePanel({
  familyId,
  studentId,
  studentName,
}: {
  familyId: string;
  studentId: string;
  studentName: string;
}) {
  const [tree, setTree] = useState<LearningTree | null>(null),
    [error, setError] = useState("");
  const [scope, setScope] = useState<{
    year?: string;
    subject?: string;
    chapter?: string;
    label: string;
  }>({ label: "All learning" });
  const [view, setView] = useState("browse"),
    [lesson, setLesson] = useState<Lesson | null>(null),
    [testId, setTestId] = useState("");
  async function reload() {
    try {
      setTree(await apiJson<LearningTree>(`/v1/students/${studentId}/tree`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load tree");
    }
  }
  useEffect(() => {
    void reload();
  }, [studentId]);
  function select(
    year: string,
    subject?: string,
    chapter?: string,
    label = "All learning",
  ) {
    setScope({ year, subject, chapter, label });
    setLesson(null);
    setTestId("");
    setView("browse");
  }
  const [attemptId, setAttemptId] = useState("");
  function openTest(id: string, attempt = "") {
    setAttemptId(attempt);
    setTestId(id);
    setView("tests");
  }
  const lessons =
    tree?.lessons.filter(
      (l) =>
        (!scope.year || l.academic_year_id === scope.year) &&
        (!scope.subject || l.subject_id === scope.subject) &&
        (!scope.chapter || l.chapter_id === scope.chapter),
    ) || [];
  const tests =
    tree?.assessments.filter(
      (t) =>
        (!scope.year || t.academic_year_id === scope.year) &&
        (!scope.subject || t.subject_id === scope.subject) &&
        (!scope.chapter || t.chapter_ids.includes(scope.chapter)),
    ) || [];
  return (
    <div className="learning-tree-layout">
      <aside className="tree-nav">
        <h2>Learning tree</h2>
        <button
          className="text-button"
          onClick={() => {
            setScope({ label: "All learning" });
            setView("browse");
          }}
        >
          All saved learning
        </button>
        {tree?.years.map((y) => (
          <details key={y.id} open>
            <summary
              onClick={() =>
                select(
                  y.id,
                  undefined,
                  undefined,
                  `${y.label} · Grade ${y.grade_level}`,
                )
              }
            >
              {y.label} · Grade {y.grade_level}
            </summary>
            {tree.subjects
              .filter((s) => s.academic_year_id === y.id)
              .map((s) => (
                <details key={s.id} open>
                  <summary
                    onClick={() => select(y.id, s.id, undefined, s.name)}
                  >
                    {s.name}
                  </summary>
                  {tree.books
                    .filter((b) => b.subject_id === s.id)
                    .map((b) => (
                      <details key={b.id} open>
                        <summary>{b.title}</summary>
                        {tree.chapters
                          .filter((c) => c.book_id === b.id)
                          .sort((a, b) => a.sequence - b.sequence)
                          .map((c) => (
                            <button
                              className={
                                scope.chapter === c.id
                                  ? "tree-item active"
                                  : "tree-item"
                              }
                              key={c.id}
                              onClick={() =>
                                select(
                                  y.id,
                                  s.id,
                                  c.id,
                                  `${s.name} / ${c.title}`,
                                )
                              }
                            >
                              {c.sequence}. {c.title}
                              <small>
                                {
                                  tree.lessons.filter(
                                    (l) => l.chapter_id === c.id,
                                  ).length
                                }{" "}
                                lessons ·{" "}
                                {
                                  tree.assessments.filter((t) =>
                                    t.chapter_ids.includes(c.id),
                                  ).length
                                }{" "}
                                tests
                              </small>
                            </button>
                          ))}
                      </details>
                    ))}
                </details>
              ))}
          </details>
        ))}
        {tree && !tree.years.length && (
          <p>Add an academic year and subjects in Setup.</p>
        )}
      </aside>
      <div className="tree-main">
        <div className="workspace-panel">
          <span className="eyebrow">{scope.label}</span>
          <div className="tree-tabs">
            <button
              className="secondary-button"
              onClick={() => setView("browse")}
            >
              Saved content
            </button>
            <button
              className="secondary-button"
              onClick={() => setView("chat")}
            >
              Chat & generate
            </button>
            <button
              className="secondary-button"
              disabled={!scope.subject}
              onClick={() => {
                setTestId("");
                setView("tests");
              }}
            >
              Build a test
            </button>
          </div>
        </div>
        {error && <div className="alert error">{error}</div>}
        {view === "browse" && (
          <section className="workspace-panel">
            <h2>Lessons, tests & results</h2>
            {!lessons.length && !tests.length && (
              <p>
                No saved content here yet. Select a subject or chapter, then use
                Chat & generate.
              </p>
            )}
            <div className="saved-content-grid">
              {lessons.map((l) => (
                <button
                  className="assessment-card"
                  key={l.id}
                  onClick={() => {
                    setLesson(l);
                    setView("lesson");
                  }}
                >
                  <span>▤</span>
                  <strong>{l.title}</strong>
                  <small>Lesson / topic</small>
                </button>
              ))}
              {tests.map((t) => (
                <article className="saved-test" key={t.id}>
                  <button
                    className="assessment-card"
                    onClick={() => openTest(t.id)}
                  >
                    <span>✓</span>
                    <strong>{t.title}</strong>
                    <small>{t.total_marks} marks</small>
                  </button>
                  {tree?.attempts
                    .filter((a) => a.assessment_id === t.id)
                    .map((a) => (
                      <button
                        className="text-button"
                        key={a.id}
                        onClick={() => openTest(t.id, a.id)}
                      >
                        Result: {Number(a.score)} / {Number(a.max_score)} ·{" "}
                        {new Date(a.submitted_at).toLocaleDateString()}
                      </button>
                    ))}
                </article>
              ))}
            </div>
          </section>
        )}
        {view === "lesson" && lesson && (
          <article className="workspace-panel">
            <h2>{lesson.title}</h2>
            <Markdown>{lesson.content}</Markdown>
          </article>
        )}
        {view === "chat" && (
          <TutorPanel
            familyId={familyId}
            studentId={studentId}
            studentName={studentName}
            academicYearId={scope.year}
            subjectId={scope.subject}
            chapterId={scope.chapter}
            onSaved={() => void reload()}
            onOpenTest={openTest}
          />
        )}
        {view === "tests" && (
          <TestsPanel
            key={`${scope.subject}:${scope.chapter}:${testId}:${attemptId}`}
            familyId={familyId}
            studentId={studentId}
            studentName={studentName}
            academicYearId={scope.year}
            subjectId={scope.subject}
            chapterId={scope.chapter}
            initialAssessmentId={testId}
            initialAttemptId={attemptId}
            onSaved={() => void reload()}
          />
        )}
      </div>
    </div>
  );
}
