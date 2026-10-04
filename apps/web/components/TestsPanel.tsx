"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Markdown from "./Markdown";
import { apiJson } from "@/lib/api";
import type {
  Assessment,
  Attempt,
  LearningTree,
  Chapter,
  AssessmentDetail,
  GradeResult,
} from "@/lib/types";

type Props = {
  familyId: string;
  studentId: string;
  academicYearId?: string;
  subjectId?: string;
  chapterId?: string;
  studentName: string;
  initialAssessmentId?: string;
  initialAttemptId?: string;
  onSaved?: () => void;
};

export default function TestsPanel({
  familyId,
  studentId,
  academicYearId,
  subjectId,
  chapterId,
  studentName,
  initialAssessmentId,
  initialAttemptId,
  onSaved,
}: Props) {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [active, setActive] = useState<AssessmentDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<GradeResult | null>(null);
  const [count, setCount] = useState("10");
  const [difficulty, setDifficulty] =
    useState<Assessment["difficulty"]>("mixed");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterIds, setChapterIds] = useState<string[]>(
    chapterId ? [chapterId] : [],
  );
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [keys, setKeys] = useState<
    Array<{ question_id: string; answer_key: string; explanation: string }>
  >([]);
  const [blueprint, setBlueprint] = useState(false);
  const [sections, setSections] = useState([
    { name: "Multiple choice", question_type: "mcq", count: 5, marks: 1 },
    { name: "Short answers", question_type: "short", count: 3, marks: 2 },
    { name: "Long answers", question_type: "long", count: 2, marks: 5 },
  ]);
  const [assessmentContext, setAssessmentContext] = useState<
    Record<string, { subject_id: string | null; chapter_ids: string[] }>
  >({});
  useEffect(() => {
    let alive = true;
    setChapterIds(chapterId ? [chapterId] : []);
    apiJson<LearningTree>(`/v1/students/${studentId}/tree`)
      .then((tree) => {
        if (!alive) return;
        const bookIds = new Set(
          tree.books.filter((b) => b.subject_id === subjectId).map((b) => b.id),
        );
        setChapters(tree.chapters.filter((c) => bookIds.has(c.book_id)));
        setAssessmentContext(
          Object.fromEntries(tree.assessments.map((a) => [a.id, a])),
        );
      })
      .catch((e) => {
        if (alive) setStatus(e.message);
      });
    return () => {
      alive = false;
    };
  }, [studentId, subjectId, chapterId]);
  useEffect(() => {
    if (initialAssessmentId) void openAssessment(initialAssessmentId);
  }, [initialAssessmentId]);

  async function loadAssessments() {
    if (!studentId) return;
    try {
      setAssessments(
        await apiJson<Assessment[]>(`/v1/students/${studentId}/assessments`),
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not load tests.");
    }
  }

  useEffect(() => {
    setActive(null);
    setResult(null);
    setAnswers({});
    void loadAssessments();
  }, [studentId]);

  async function generate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("Designing a test from uploaded material…");

    try {
      const assessment = await apiJson<Assessment>("/v1/assessments/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          family_id: familyId,
          student_id: studentId,
          academic_year_id: academicYearId || null,
          subject_id: subjectId || null,
          chapter_id: chapterIds.length === 1 ? chapterIds[0] : null,
          title: topic.trim() || null,
          question_count: Number(count),
          chapter_ids: chapterIds,
          sections: blueprint ? sections : [],
          difficulty,
        }),
      });
      onSaved?.();
      await loadAssessments();
      await openAssessment(assessment.id);
      setStatus("");
    } catch (err) {
      setStatus(
        err instanceof Error ? err.message : "Could not generate test.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function openAssessment(id: string) {
    setBusy(true);
    setResult(null);
    setKeys([]);
    setAnswers({});
    try {
      const detail = await apiJson<AssessmentDetail>(`/v1/assessments/${id}`);
      setActive(detail);
      const saved = sessionStorage.getItem(`test-draft:${studentId}:${id}`);
      if (saved) {
        try {
          setAnswers(JSON.parse(saved));
        } catch {
          sessionStorage.removeItem(`test-draft:${studentId}:${id}`);
        }
      }
      setAttempts(await apiJson<Attempt[]>(`/v1/assessments/${id}/attempts`));
      if (initialAttemptId) await openAttempt(initialAttemptId);
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not open test.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!active || busy) return;
    setBusy(true);
    setStatus("Grading answers…");

    try {
      const grade = await apiJson<GradeResult>(
        `/v1/assessments/${active.assessment.id}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: active.questions.map((question) => ({
              question_id: question.id,
              answer: answers[question.id] || "",
            })),
          }),
        },
      );
      setResult(grade);
      sessionStorage.removeItem(
        `test-draft:${studentId}:${active.assessment.id}`,
      );
      setAttempts(
        await apiJson<Attempt[]>(
          `/v1/assessments/${active.assessment.id}/attempts`,
        ),
      );
      onSaved?.();
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not grade test.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (active && !result)
      sessionStorage.setItem(
        `test-draft:${studentId}:${active.assessment.id}`,
        JSON.stringify(answers),
      );
  }, [active, answers, result, studentId]);
  async function openAttempt(id: string) {
    setBusy(true);
    try {
      const grade = await apiJson<GradeResult>(`/v1/attempts/${id}`);
      setResult(grade);
      setAnswers(
        Object.fromEntries(grade.answers.map((a) => [a.question_id, a.answer])),
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not open result");
    } finally {
      setBusy(false);
    }
  }
  async function revealKeys() {
    if (!active) return;
    try {
      setKeys(
        await apiJson(`/v1/assessments/${active.assessment.id}/answer-key`),
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not load answer key");
    }
  }

  const answered = useMemo(
    () =>
      active?.questions.filter((question) =>
        (answers[question.id] || "").trim(),
      ).length || 0,
    [active, answers],
  );

  if (active) {
    return (
      <section className="workspace-panel test-player">
        <div className="panel-heading">
          <div>
            <button
              className="text-button"
              onClick={() => {
                setActive(null);
                setResult(null);
              }}
            >
              ← Back to tests
            </button>
            <span className="eyebrow">Assessment</span>
            <h2>{active.assessment.title}</h2>
            <p>
              {active.questions.length} questions ·{" "}
              {active.assessment.total_marks} marks ·{" "}
              {active.assessment.difficulty}
            </p>
          </div>
          <div className="progress-ring">
            <strong>{answered}</strong>
            <span>/{active.questions.length}</span>
          </div>
        </div>

        <div className="attempt-history">
          <strong>Saved results</strong>
          {attempts.length === 0 && <span>No submissions yet</span>}
          {attempts.map((a) => (
            <button
              disabled={busy}
              className="secondary-button"
              key={a.id}
              onClick={() => void openAttempt(a.id)}
            >
              {Number(a.score)} / {Number(a.max_score)} ·{" "}
              {new Date(a.submitted_at).toLocaleDateString()}
            </button>
          ))}
          <button
            className="text-button"
            onClick={() => {
              setResult(null);
              setAnswers({});
              setKeys([]);
            }}
          >
            Start a new attempt
          </button>
          <button className="text-button" onClick={() => void revealKeys()}>
            Show answer key (parent)
          </button>
        </div>
        {result && (
          <div className="score-hero">
            <div>
              <span className="eyebrow">Result</span>
              <div className="score-number">{result.percentage}%</div>
              <p>
                {result.score} / {result.max_score} marks
              </p>
            </div>
            <div className="score-feedback">
              <strong>Teacher feedback</strong>
              <Markdown>{result.overall_feedback}</Markdown>
            </div>
          </div>
        )}

        <div className="question-list">
          {active.questions.map((question) => {
            const graded = result?.answers.find(
              (item) => item.question_id === question.id,
            );
            return (
              <article key={question.id} className="question-card">
                <div className="question-meta">
                  <span>Question {question.sequence}</span>
                  <span>
                    {question.marks} mark{question.marks === 1 ? "" : "s"}
                  </span>
                  {question.concept && <span>{question.concept}</span>}
                </div>
                <span className="eyebrow">{question.section_name}</span>
                <Markdown>{question.prompt}</Markdown>

                {question.question_type === "mcq" ? (
                  <div className="option-list">
                    {question.options.map((option, index) => (
                      <label key={option} className="option-row">
                        <input
                          type="radio"
                          name={question.id}
                          value={option}
                          checked={answers[question.id] === option}
                          disabled={Boolean(result)}
                          onChange={() =>
                            setAnswers((current) => ({
                              ...current,
                              [question.id]: option,
                            }))
                          }
                        />
                        <span className="option-letter">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <Markdown>{option}</Markdown>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    className="answer-box"
                    rows={question.question_type === "long" ? 6 : 3}
                    value={answers[question.id] || ""}
                    disabled={Boolean(result)}
                    placeholder="Write your answer here…"
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: event.target.value,
                      }))
                    }
                  />
                )}

                {keys.find((k) => k.question_id === question.id) && (
                  <div className="answer-key">
                    <strong>Model answer</strong>
                    <Markdown>
                      {
                        keys.find((k) => k.question_id === question.id)!
                          .answer_key
                      }
                    </Markdown>
                    <Markdown>
                      {keys.find((k) => k.question_id === question.id)!
                        .explanation || ""}
                    </Markdown>
                  </div>
                )}
                {graded && (
                  <div className="question-feedback">
                    <strong>
                      {graded.awarded_marks} / {question.marks} marks
                    </strong>
                    <Markdown>{graded.feedback || ""}</Markdown>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {!result && (
          <div className="sticky-submit">
            <span>
              {answered} of {active.questions.length} answered
            </span>
            <button className="primary-button" disabled={busy} onClick={submit}>
              {busy ? "Grading…" : "Submit test"}
            </button>
          </div>
        )}

        {status && <div className="alert">{status}</div>}
      </section>
    );
  }

  return (
    <section className="workspace-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Practice & evidence</span>
          <h2>Tests for {studentName}</h2>
          <p>
            Generate tests from uploaded material, submit answers, and receive
            marks with feedback.
          </p>
        </div>
        <div className="metric-pill">
          <strong>{assessments.length}</strong>
          <span>tests</span>
        </div>
      </div>

      <form onSubmit={generate} className="test-builder">
        <fieldset className="chapter-picker">
          <legend>Chapters in this subject</legend>
          <p>
            Leave unchecked to use all ready material in the selected subject.
          </p>
          {chapters.map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={chapterIds.includes(c.id)}
                onChange={(e) =>
                  setChapterIds((current) =>
                    e.target.checked
                      ? [...current, c.id]
                      : current.filter((id) => id !== c.id),
                  )
                }
              />
              {c.sequence}. {c.title}
            </label>
          ))}
        </fieldset>
        <div className="blueprint-editor">
          <label>
            <input
              type="checkbox"
              checked={blueprint}
              onChange={(e) => setBlueprint(e.target.checked)}
            />{" "}
            Set sections and exact marks
          </label>
          {blueprint && (
            <>
              <div className="blueprint-total">
                {sections.reduce((n, s) => n + s.count, 0)} questions ·{" "}
                {sections.reduce((n, s) => n + s.count * s.marks, 0)} marks
              </div>
              {sections.map((section, index) => (
                <div className="blueprint-row" key={index}>
                  <input
                    aria-label="Section name"
                    value={section.name}
                    required
                    onChange={(e) =>
                      setSections((current) =>
                        current.map((s, i) =>
                          i === index ? { ...s, name: e.target.value } : s,
                        ),
                      )
                    }
                  />
                  <select
                    aria-label="Question type"
                    value={section.question_type}
                    onChange={(e) =>
                      setSections((current) =>
                        current.map((s, i) =>
                          i === index
                            ? { ...s, question_type: e.target.value }
                            : s,
                        ),
                      )
                    }
                  >
                    <option value="mcq">MCQ</option>
                    <option value="short">Short answer</option>
                    <option value="long">Long answer</option>
                  </select>
                  <label>
                    Questions
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={section.count}
                      onChange={(e) =>
                        setSections((current) =>
                          current.map((s, i) =>
                            i === index
                              ? { ...s, count: Number(e.target.value) }
                              : s,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Marks each
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={section.marks}
                      onChange={(e) =>
                        setSections((current) =>
                          current.map((s, i) =>
                            i === index
                              ? { ...s, marks: Number(e.target.value) }
                              : s,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setSections((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setSections((current) => [
                    ...current,
                    {
                      name: `Section ${current.length + 1}`,
                      question_type: "short",
                      count: 1,
                      marks: 2,
                    },
                  ])
                }
              >
                Add section
              </button>
            </>
          )}
        </div>
        <div className="builder-copy">
          <div className="spark-icon">✦</div>
          <div>
            <strong>Create an AI test</strong>
            <p>
              Questions are grounded in the learning library for this student.
            </p>
          </div>
        </div>
        <input
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="Optional topic, e.g. Force and Pressure"
        />
        <select
          disabled={blueprint}
          value={count}
          onChange={(event) => setCount(event.target.value)}
        >
          {[5, 10, 15, 20].map((value) => (
            <option key={value} value={value}>
              {value} questions
            </option>
          ))}
        </select>
        <select
          value={difficulty}
          onChange={(event) =>
            setDifficulty(event.target.value as Assessment["difficulty"])
          }
        >
          <option value="mixed">Mixed difficulty</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <button
          className="primary-button"
          disabled={
            busy ||
            !subjectId ||
            (blueprint &&
              (!sections.length ||
                sections.reduce((n, s) => n + s.count, 0) > 30 ||
                sections.reduce((n, s) => n + s.count, 0) < 3))
          }
          type="submit"
        >
          {busy ? "Creating…" : "Generate test"}
        </button>
      </form>

      {status && <div className="alert">{status}</div>}

      <div className="assessment-grid">
        {assessments.length === 0 ? (
          <div className="empty-card wide">
            <span className="empty-icon">✓</span>
            <div>
              <strong>No tests yet</strong>
              <p>
                Upload material, then generate a test. Completed submissions
                become mastery evidence.
              </p>
            </div>
          </div>
        ) : (
          assessments
            .filter(
              (a) =>
                !subjectId ||
                !assessmentContext[a.id] ||
                assessmentContext[a.id].subject_id === subjectId,
            )
            .filter(
              (a) =>
                !chapterId ||
                !assessmentContext[a.id] ||
                assessmentContext[a.id].chapter_ids.includes(chapterId),
            )
            .map((assessment) => (
              <button
                key={assessment.id}
                className="assessment-card"
                onClick={() => void openAssessment(assessment.id)}
              >
                <div className="assessment-icon">✓</div>
                <div>
                  <strong>{assessment.title}</strong>
                  <p>
                    {assessment.question_count} questions ·{" "}
                    {assessment.total_marks} marks
                  </p>
                </div>
                <span className="difficulty-chip">{assessment.difficulty}</span>
                <span className="chevron">›</span>
              </button>
            ))
        )}
      </div>
    </section>
  );
}
