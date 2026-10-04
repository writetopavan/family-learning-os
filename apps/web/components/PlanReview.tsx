"use client";
import type { Plan } from "@/lib/planning";
import Markdown from "./Markdown";
export default function PlanReview({
  plan,
  onSave,
  onCancel,
  busy,
}: {
  plan: Plan;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const changes =
    plan.events.length +
    plan.exams.length +
    plan.books.length +
    plan.progress.length;
  return (
    <section className="plan-review" aria-label="Plan preview">
      <h3>Review the extracted plan</h3>
      <Markdown>{plan.answer}</Markdown>
      {plan.events.map((e, i) => (
        <p key={`e${i}`}>
          <strong>{e.title}</strong> · {e.kind} · {e.start_date}
          {e.end_date && ` to ${e.end_date}`} · {e.start_time || "All day"}
          {e.end_time && `–${e.end_time}`} · {e.recurrence} · {e.timezone}
        </p>
      ))}
      {plan.exams.map((e, i) => (
        <div key={`x${i}`}>
          <h4>{e.title}</h4>
          {e.papers.map((p, j) => (
            <div key={j}>
              <strong>{p.subject}</strong> ·{" "}
              {p.exam_date || "Date not supplied"} {p.start_time}
              <ul>
                {p.chapters.map((c, k) => (
                  <li key={k}>
                    {c.title}
                    {c.topics.length > 0 && `: ${c.topics.join(", ")}`}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
      {plan.books.map((b, i) => (
        <div key={`b${i}`}>
          <h4>
            {b.title} · {b.subject}
          </h4>
          <ol>
            {b.chapters.map((c, j) => (
              <li key={j}>
                {c.title}
                {c.topics.length > 0 && `: ${c.topics.join(", ")}`}
              </li>
            ))}
          </ol>
        </div>
      ))}
      {plan.progress.length > 0 && (
        <p>{plan.progress.length} completion update(s).</p>
      )}
      <div className="hero-actions">
        <button
          className="primary-button"
          disabled={busy || !changes}
          onClick={onSave}
        >
          Save plan
        </button>
        <button className="secondary-button" disabled={busy} onClick={onCancel}>
          Discard / revise
        </button>
      </div>
    </section>
  );
}
