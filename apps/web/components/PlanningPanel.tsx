"use client";
import { FormEvent, useEffect, useState } from "react";
import { apiJson } from "@/lib/api";
import { emptyPlan, postJson, uploadStudentFile } from "@/lib/planning";
import type { Plan, PlanningData, Schedule } from "@/lib/planning";
import type { Assessment, Chapter } from "@/lib/types";
import PlanReview from "./PlanReview";
import TestsPanel from "./TestsPanel";

type Props = {
  familyId: string;
  studentId: string;
  studentName: string;
  view: "schedule" | "prep";
};
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function occurs(e: Schedule, day: string) {
  if (day < e.start_date || (e.end_date && day > e.end_date)) return false;
  if (e.recurrence === "daily") return true;
  if (e.recurrence === "weekly")
    return e.weekdays.includes(new Date(`${day}T12:00:00`).getDay());
  return e.end_date ? day <= e.end_date : day === e.start_date;
}
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export default function PlanningPanel({
  familyId,
  studentId,
  studentName,
  view,
}: Props) {
  const [data, setData] = useState<PlanningData | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [materialId, setMaterialId] = useState("");
  const [yearId, setYearId] = useState(""),
    [plan, setPlan] = useState<Plan | null>(null),
    [planYear, setPlanYear] = useState<string | null>(null);
  const [day, setDay] = useState(today),
    [examId, setExamId] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [savedTest, setSavedTest] = useState("");
  const [title, setTitle] = useState(""),
    [kind, setKind] = useState("study"),
    [startTime, setStartTime] = useState("17:00"),
    [endTime, setEndTime] = useState("18:00"),
    [repeat, setRepeat] = useState("daily"),
    [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  async function load() {
    const d = await apiJson<PlanningData>(`/v1/students/${studentId}/planning`);
    setData(d);
    setYearId(
      (v) =>
        v ||
        [...d.years].sort((a, b) => b.start_date.localeCompare(a.start_date))[0]
          ?.id ||
        "",
    );
    setExamId((v) =>
      d.student_exams.some((e) => e.id === v)
        ? v
        : d.student_exams[0]?.id || "",
    );
  }
  useEffect(() => {
    let active = true;
    apiJson<PlanningData>(`/v1/students/${studentId}/planning`)
      .then((d) => {
        if (active) {
          setData(d);
          setYearId(
            [...d.years].sort((a, b) =>
              b.start_date.localeCompare(a.start_date),
            )[0]?.id || "",
          );
          setExamId(d.student_exams[0]?.id || "");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [studentId]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  const context = {
    family_id: familyId,
    student_id: studentId,
    academic_year_id: yearId || null,
  };
  async function interpret(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const p = await postJson<{ plan: Plan; academic_year_id: string | null }>(
        "/v1/planning/interpret",
        {
          ...context,
          message: message.trim() || (view === "prep"
            ? "Create exam preparation from the attached document. Import the exam timetable and all readable subject syllabuses."
            : "Create schedules from the attached school circular. Import the exam timetable and holidays."),
          material_ids: materialId ? [materialId] : [],
        },
      );
      setPlan(p.plan);
      setPlanYear(p.academic_year_id);
    });
  }
  async function save() {
    if (!plan) return;
    await run(async () => {
      await postJson("/v1/planning/apply", {
        ...context,
        academic_year_id: planYear,
        plan,
      });
      setPlan(null);
      setMaterialId("");
      setMessage("");
      setNotice("Plan saved.");
      await load();
    });
  }
  async function mark(
    chapterId: string | null,
    topicId: string | null,
    completed: boolean,
  ) {
    await run(async () => {
      const p = emptyPlan();
      p.progress = [{ chapter_id: chapterId, topic_id: topicId, completed }];
      await postJson("/v1/planning/apply", { ...context, plan: p });
      await load();
    });
  }
  async function remove(resource: string, id: string) {
    await run(async () => {
      await apiJson(`/v1/planning/${resource}/${id}`, { method: "DELETE" });
      await load();
    });
  }
  async function practice(
    paperId: string,
    subjectId: string,
    chapterIds: string[],
    topicIds: string[],
  ) {
    await run(async () => {
      const a = await postJson<Assessment>("/v1/assessments/generate", {
        ...context,
        academic_year_id: data?.student_exams.find((e) => e.id === examId)
          ?.academic_year_id,
        subject_id: subjectId,
        chapter_ids: chapterIds,
        topic_ids: topicIds,
        exam_paper_id: paperId,
        title: `${data?.student_exams.find((e) => e.id === examId)?.title} practice`,
        question_count: 10,
        difficulty: "mixed",
      });
      setSavedTest(a.id);
      setNotice("Practice test saved and linked to this exam.");
      await load();
    });
  }
  if (!data)
    return (
      <section className="workspace-panel">
        <p role="status">{error || "Loading student plans…"}</p>
      </section>
    );
  const chapter = (id: string) =>
    data.chapters.find((c) => c.id === id) as
      (Chapter & { completed_at?: string | null }) | undefined;
  const papers = data.exam_papers.filter((p) => p.exam_id === examId);
  return (
    <div className="overview-stack">
      <section className="overview-hero">
        <div>
          <span className="eyebrow">
            {view === "schedule"
              ? "A balanced day"
              : "Prepare with a clear plan"}
          </span>
          <h2>
            {view === "schedule"
              ? `${studentName}'s schedule`
              : "Know what to study next"}
          </h2>
          <p>
            {view === "schedule"
              ? "Study, play, school, holidays and exam dates in one place."
              : "Subject syllabuses, chapter and topic progress, and focused practice."}
          </p>
        </div>
      </section>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert" role="status">
          {notice}
        </div>
      )}
      <section className="workspace-panel">
        <h3>
          {view === "schedule"
            ? "Create from a message or school circular"
            : "Import an exam timetable or syllabus"}
        </h3>
        <form onSubmit={interpret} className="form-grid">
          <label>
            Academic year
            <select
              value={yearId}
              onChange={(e) => {
                setYearId(e.target.value);
                setPlan(null);
              }}
            >
              <option value="">No academic year</option>
              {data.years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label} · Grade {y.grade_level}
                </option>
              ))}
            </select>
          </label>
          <label>
            Attach a document
            <input
              type="file"
              accept=".pdf,.txt,.md,.docx,.pptx"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file)
                  void run(async () => {
                    setMaterialId("");
                    setPlan(null);
                    const m = await uploadStudentFile(file, {
                      familyId,
                      studentId,
                      academicYearId: yearId,
                    });
                    setMaterialId(m.id);
                    setNotice(
                      m.status === "ready"
                        ? `${file.name} attached.`
                        : "Uploaded; indexing is still in progress. Try extracting shortly.",
                    );
                  });
              }}
            />
          </label>
          <label className="full-width">
            Instructions
            <textarea
              aria-label="Planning instructions"
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setPlan(null);
              }}
              rows={3}
              placeholder={
                view === "schedule"
                  ? "Study daily 5–6 PM, play 6–7 PM; holidays 12–15 October. Save the attached exam timetable."
                  : "Create Midterm exam prep from this syllabus. Or: I completed the Fractions chapter."
              }
            />
          </label>
          <button className="primary-button" disabled={busy || (!message.trim() && !materialId)}>
            {busy ? "Working…" : "Extract plan"}
          </button>
          {materialId && <span>Document attached</span>}
        </form>
        {plan && (
          <PlanReview
            plan={plan}
            busy={busy}
            onSave={() => void save()}
            onCancel={() => setPlan(null)}
          />
        )}
        <p className="muted">
          You can also create schedules and report completed chapters directly
          in AI Tutor chat.
        </p>
      </section>
      {view === "schedule" ? (
        <>
          <section className="workspace-panel">
            <div className="panel-heading">
              <h3>Day planner</h3>
              <label>
                Date
                <input
                  aria-label="Schedule date"
                  type="date"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                />
              </label>
            </div>
            {data.student_schedules
              .filter((e) => occurs(e, day))
              .sort((a, b) =>
                (a.start_time || "").localeCompare(b.start_time || ""),
              )
              .map((e) => (
                <article className="schedule-row" key={e.id}>
                  <div className="schedule-time">
                    {e.start_time?.slice(0, 5) || "All day"}
                    {e.end_time && `–${e.end_time.slice(0, 5)}`}
                  </div>
                  <div>
                    <strong>{e.title}</strong>
                    <p>
                      {e.kind} · {e.recurrence} · {e.timezone}
                    </p>
                  </div>
                </article>
              ))}
            {!data.student_schedules.some((e) => occurs(e, day)) && (
              <p>No events on this day.</p>
            )}
          </section>
          <section className="workspace-panel">
            <h3>Add a routine or event</h3>
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const p = emptyPlan();
                p.events = [
                  {
                    title,
                    kind,
                    start_date: day,
                    end_date: null,
                    start_time: startTime || null,
                    end_time: endTime || null,
                    recurrence: repeat,
                    weekdays: repeat === "weekly" ? days : [],
                    timezone: "Asia/Kolkata",
                  },
                ];
                setPlan(p);
                setPlanYear(yearId || null);
              }}
            >
              <label>
                Activity
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                Type
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  {["study", "play", "school", "holiday", "other"].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label>
                Start time
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </label>
              <label>
                End time
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </label>
              <label>
                Repeat
                <select
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                >
                  {["none", "daily", "weekly"].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              {repeat === "weekly" && (
                <fieldset>
                  <legend>Weekdays</legend>
                  {weekdays.map((w, i) => (
                    <label key={w}>
                      <input
                        type="checkbox"
                        checked={days.includes(i)}
                        onChange={() =>
                          setDays((v) =>
                            v.includes(i)
                              ? v.filter((x) => x !== i)
                              : [...v, i],
                          )
                        }
                      />
                      {w}
                    </label>
                  ))}
                </fieldset>
              )}
              <button className="secondary-button" disabled={busy}>
                Preview event
              </button>
            </form>
            <p>
              Starts on {day}. For holiday ranges or an end date, use the
              instructions above.
            </p>
          </section>
          <section className="workspace-panel">
            <h3>All saved schedules</h3>
            {data.student_schedules.map((e) => (
              <article className="schedule-row" key={e.id}>
                <div>
                  <strong>{e.title}</strong>
                  <p>
                    {e.start_date}
                    {e.end_date && ` – ${e.end_date}`} · {e.recurrence}
                    {e.recurrence === "weekly" &&
                      ` (${e.weekdays.map((d) => weekdays[d]).join(", ")})`}
                  </p>
                </div>
                {!e.paper_id && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void remove("schedules", e.id)}
                  >
                    Remove
                  </button>
                )}
                {e.paper_id && <span>Linked exam</span>}
              </article>
            ))}
          </section>
        </>
      ) : (
        <>
          <section className="workspace-panel">
            <div className="panel-heading">
              <h3>Exam syllabus & progress</h3>
              <label>
                Exam
                <select
                  aria-label="Exam"
                  value={examId}
                  onChange={(e) => {
                    setExamId(e.target.value);
                    setSelected([]);
                  }}
                >
                  <option value="">Choose exam</option>
                  {data.student_exams.map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!data.student_exams.length && (
              <p>
                Create your first exam from a message or upload its timetable
                and syllabus above.
              </p>
            )}
            {papers.map((p) => {
              const entries = data.exam_syllabus.filter(
                (x) => x.paper_id === p.id,
              );
              const completed = entries.filter(
                (x) =>
                  chapter(x.chapter_id)?.completed_at ||
                  (x.topic_id &&
                    data.topics.find((t) => t.id === x.topic_id)?.completed_at),
              );
              const chosen = entries.filter((x) => selected.includes(x.id));
              return (
                <article className="exam-card" key={p.id}>
                  <div className="panel-heading">
                    <div>
                      <h3>
                        {data.subjects.find((s) => s.id === p.subject_id)?.name}
                      </h3>
                      <p>
                        {p.exam_date || "Date not set"}{" "}
                        {p.start_time?.slice(0, 5)} · {completed.length}/
                        {entries.length} syllabus items completed
                      </p>
                    </div>
                    <button
                      className="primary-button"
                      disabled={busy || !chosen.length}
                      onClick={() =>
                        void practice(
                          p.id,
                          p.subject_id,
                          [
                            ...new Set(
                              chosen
                                .filter((x) => !x.topic_id)
                                .map((x) => x.chapter_id),
                            ),
                          ],
                          chosen
                            .filter((x) => x.topic_id)
                            .map((x) => x.topic_id!),
                        )
                      }
                    >
                      Practice selected
                    </button>
                  </div>
                  <progress
                    max={Math.max(1, entries.length)}
                    value={completed.length}
                    aria-label="Exam completion"
                  />
                  {!entries.length && (
                    <p>
                      Add the subject's chapters and topics using the
                      instructions above.
                    </p>
                  )}
                  {entries.map((x) => {
                    const c = chapter(x.chapter_id);
                    const t = data.topics.find((t) => t.id === x.topic_id);
                    const done = !!(c?.completed_at || t?.completed_at);
                    return (
                      <div className="syllabus-row" key={x.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={selected.includes(x.id)}
                            onChange={() =>
                              setSelected((v) =>
                                v.includes(x.id)
                                  ? v.filter((i) => i !== x.id)
                                  : [...v, x.id],
                              )
                            }
                          />
                          <span>
                            {c?.title}
                            {t && ` / ${t.title}`}
                          </span>
                        </label>
                        <button
                          className={
                            done
                              ? "completion-button done"
                              : "completion-button"
                          }
                          disabled={busy}
                          onClick={() =>
                            void mark(
                              t ? null : x.chapter_id,
                              t?.id || null,
                              !done,
                            )
                          }
                        >
                          {done ? "✓ Completed — reopen" : "Mark completed"}
                        </button>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => void remove("syllabus", x.id)}
                        >
                          Remove from exam
                        </button>
                      </div>
                    );
                  })}
                </article>
              );
            })}
            {examId && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void remove("exams", examId)}
              >
                Remove this exam and its schedule
              </button>
            )}
          </section>
          {savedTest && (
            <TestsPanel
              key={savedTest}
              familyId={familyId}
              studentId={studentId}
              studentName={studentName}
              initialAssessmentId={savedTest}
            />
          )}
        </>
      )}
    </div>
  );
}
