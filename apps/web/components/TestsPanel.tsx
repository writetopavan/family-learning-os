"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/api";
import type {
  Assessment,
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
};

export default function TestsPanel({
  familyId,
  studentId,
  academicYearId,
  subjectId,
  chapterId,
  studentName,
}: Props) {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [active, setActive] = useState<AssessmentDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<GradeResult | null>(null);
  const [count, setCount] = useState("10");
  const [difficulty, setDifficulty] = useState<Assessment["difficulty"]>("mixed");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

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
          chapter_id: chapterId || null,
          title: topic.trim() || null,
          question_count: Number(count),
          difficulty,
        }),
      });
      await loadAssessments();
      await openAssessment(assessment.id);
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not generate test.");
    } finally {
      setBusy(false);
    }
  }

  async function openAssessment(id: string) {
    setBusy(true);
    setResult(null);
    setAnswers({});
    try {
      setActive(await apiJson<AssessmentDetail>(`/v1/assessments/${id}`));
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
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not grade test.");
    } finally {
      setBusy(false);
    }
  }

  const answered = useMemo(
    () =>
      active?.questions.filter((question) => (answers[question.id] || "").trim()).length || 0,
    [active, answers],
  );

  if (active) {
    return (
      <section className="workspace-panel test-player">
        <div className="panel-heading">
          <div>
            <button className="text-button" onClick={() => { setActive(null); setResult(null); }}>
              ← Back to tests
            </button>
            <span className="eyebrow">Assessment</span>
            <h2>{active.assessment.title}</h2>
            <p>
              {active.questions.length} questions · {active.assessment.total_marks} marks ·{" "}
              {active.assessment.difficulty}
            </p>
          </div>
          <div className="progress-ring">
            <strong>{answered}</strong>
            <span>/{active.questions.length}</span>
          </div>
        </div>

        {result && (
          <div className="score-hero">
            <div>
              <span className="eyebrow">Result</span>
              <div className="score-number">{result.percentage}%</div>
              <p>{result.score} / {result.max_score} marks</p>
            </div>
            <div className="score-feedback">
              <strong>Teacher feedback</strong>
              <p>{result.overall_feedback}</p>
            </div>
          </div>
        )}

        <div className="question-list">
          {active.questions.map((question) => {
            const graded = result?.answers.find((item) => item.question_id === question.id);
            return (
              <article key={question.id} className="question-card">
                <div className="question-meta">
                  <span>Question {question.sequence}</span>
                  <span>{question.marks} mark{question.marks === 1 ? "" : "s"}</span>
                  {question.concept && <span>{question.concept}</span>}
                </div>
                <h3>{question.prompt}</h3>

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
                            setAnswers((current) => ({ ...current, [question.id]: option }))
                          }
                        />
                        <span className="option-letter">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span>{option}</span>
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

                {graded && (
                  <div className="question-feedback">
                    <strong>
                      {graded.awarded_marks} / {question.marks} marks
                    </strong>
                    <span>{graded.feedback}</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {!result && (
          <div className="sticky-submit">
            <span>{answered} of {active.questions.length} answered</span>
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
          <p>Generate tests from uploaded material, submit answers, and receive marks with feedback.</p>
        </div>
        <div className="metric-pill">
          <strong>{assessments.length}</strong>
          <span>tests</span>
        </div>
      </div>

      <form onSubmit={generate} className="test-builder">
        <div className="builder-copy">
          <div className="spark-icon">✦</div>
          <div>
            <strong>Create an AI test</strong>
            <p>Questions are grounded in the learning library for this student.</p>
          </div>
        </div>
        <input
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="Optional topic, e.g. Force and Pressure"
        />
        <select value={count} onChange={(event) => setCount(event.target.value)}>
          {[5, 10, 15, 20].map((value) => (
            <option key={value} value={value}>{value} questions</option>
          ))}
        </select>
        <select
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value as Assessment["difficulty"])}
        >
          <option value="mixed">Mixed difficulty</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <button className="primary-button" disabled={busy} type="submit">
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
              <p>Upload material, then generate a test. Completed submissions become mastery evidence.</p>
            </div>
          </div>
        ) : (
          assessments.map((assessment) => (
            <button
              key={assessment.id}
              className="assessment-card"
              onClick={() => void openAssessment(assessment.id)}
            >
              <div className="assessment-icon">✓</div>
              <div>
                <strong>{assessment.title}</strong>
                <p>{assessment.question_count} questions · {assessment.total_marks} marks</p>
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
