"use client";
import { FormEvent, useState } from "react";
import { apiJson } from "@/lib/api";
import {
  BOARDS,
  currentSchoolYear,
  suggestedSubjects,
  type SubjectDraft,
} from "@/lib/onboarding";

export default function StudentOnboarding({
  familyId,
  onSaved,
}: {
  familyId: string;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [board, setBoard] = useState("");
  const [otherBoard, setOtherBoard] = useState("");
  const [grade, setGrade] = useState("");
  const [school, setSchool] = useState("");
  const [location, setLocation] = useState("");
  const [year, setYear] = useState(currentSchoolYear);
  const [subjects, setSubjects] = useState<SubjectDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  function suggest(nextBoard = board, nextGrade = grade) {
    setSubjects(
      suggestedSubjects(nextBoard, nextGrade ? Number(nextGrade) : null),
    );
  }
  function update(index: number, value: Partial<SubjectDraft>) {
    setSubjects((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...value } : row)),
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setStatus("");
    if (subjects.some((s) => !s.name.trim())) {
      setStatus("Name each subject or remove its row.");
      return;
    }
    setBusy(true);
    try {
      await apiJson("/v1/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          family_id: familyId,
          display_name: name.trim(),
          date_of_birth: dob || null,
          board:
            board === "Other" || board === "Other State Board"
              ? otherBoard.trim() || board
              : board || null,
          school_name: school.trim() || null,
          school_location: location.trim() || null,
          academic_year: grade
            ? { family_id: familyId, grade_level: Number(grade), ...year }
            : null,
          subjects: grade ? subjects : [],
        }),
      });
      setName("");
      setDob("");
      setBoard("");
      setOtherBoard("");
      setGrade("");
      setSchool("");
      setLocation("");
      setSubjects([]);
      setStatus("Child profile saved. Choose the child to start learning.");
      await onSaved();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not save child.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="setup-card full onboarding-card">
      <div className="setup-step">
        <span>1</span>
        <div>
          <strong>Add a child</strong>
          <p>
            Only the name is required. You can fill in everything else later.
          </p>
        </div>
      </div>
      <form className="mini-form" onSubmit={save}>
        <fieldset disabled={busy} className="onboarding-fields">
          <div className="onboarding-grid">
            <label>
              Child name
              <input
                aria-label="Child name"
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Date of birth (optional)
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </label>
            <label>
              Board (optional)
              <select
                aria-label="Board"
                value={board}
                onChange={(e) => {
                  setBoard(e.target.value);
                  suggest(e.target.value);
                }}
              >
                <option value="">Skip for now</option>
                {BOARDS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
            <label>
              Class (optional)
              <select
                aria-label="Class"
                value={grade}
                onChange={(e) => {
                  setGrade(e.target.value);
                  if (!e.target.value) setSubjects([]);
                  else suggest(board, e.target.value);
                }}
              >
                <option value="">Skip for now</option>
                {[4, 5, 6, 7, 8, 9, 10].map((g) => (
                  <option key={g} value={g}>
                    Class {g}
                  </option>
                ))}
              </select>
            </label>
            {(board === "Other" || board === "Other State Board") && (
              <label>
                Board name (optional)
                <input
                  value={otherBoard}
                  maxLength={120}
                  onChange={(e) => setOtherBoard(e.target.value)}
                />
              </label>
            )}
            <label>
              School name (optional)
              <input
                value={school}
                maxLength={240}
                onChange={(e) => setSchool(e.target.value)}
              />
            </label>
            <label>
              School location (optional)
              <input
                value={location}
                maxLength={240}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City / area"
              />
            </label>
          </div>
          {board && !grade && (
            <div className="subject-drafts">
              <strong>Suggested subjects</strong>
              <p>
                Choose a class above to customize and save these, or skip for
                now.
              </p>
              <div className="chapter-chips">
                {suggestedSubjects(board, 6).map((s) => (
                  <span key={s.name}>{s.name}</span>
                ))}
              </div>
            </div>
          )}
          {grade && (
            <>
              <details>
                <summary>Academic year dates</summary>
                <div className="onboarding-grid">
                  <label>
                    Year label
                    <input
                      required
                      value={year.label}
                      onChange={(e) =>
                        setYear({ ...year, label: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Starts
                    <input
                      required
                      type="date"
                      value={year.start_date}
                      onChange={(e) =>
                        setYear({ ...year, start_date: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Ends
                    <input
                      required
                      type="date"
                      min={year.start_date}
                      value={year.end_date}
                      onChange={(e) =>
                        setYear({ ...year, end_date: e.target.value })
                      }
                    />
                  </label>
                </div>
              </details>
              <div className="subject-drafts">
                <strong>Subjects (optional)</strong>
                <p>
                  Suggestions vary by school. Changing board or class refreshes the list. Rename, add or remove any subject.
                  Add your school’s second and third languages below.
                </p>
                <button
                  className="text-button"
                  type="button"
                  disabled={!board}
                  onClick={() => suggest()}
                >
                  Replace with board suggestions
                </button>
                {subjects.map((s, i) => (
                  <div className="subject-draft" key={i}>
                    <input
                      aria-label={`Subject ${i + 1}`}
                      required
                      maxLength={120}
                      value={s.name}
                      onChange={(e) => update(i, { name: e.target.value })}
                    />
                    <select
                      aria-label={`Language level ${i + 1}`}
                      value={s.language_level ?? ""}
                      onChange={(e) =>
                        update(i, {
                          language_level: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    >
                      <option value="">Not a language / unspecified</option>
                      <option value="1">First language</option>
                      <option value="2">Second language</option>
                      <option value="3">Third language</option>
                    </select>
                    <button
                      className="text-button"
                      type="button"
                      aria-label={`Remove subject ${i + 1}`}
                      onClick={() =>
                        setSubjects((rows) => rows.filter((_, n) => n !== i))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="secondary-button"
                  disabled={subjects.length >= 40}
                  onClick={() =>
                    setSubjects((rows) => [
                      ...rows,
                      { name: "", language_level: null },
                    ])
                  }
                >
                  Add subject or language
                </button>
                {!!subjects.length && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setSubjects([])}
                  >
                    Skip all subjects
                  </button>
                )}
              </div>
            </>
          )}
          <button className="primary-button" type="submit">
            {busy ? "Saving…" : "Add child"}
          </button>
        </fieldset>
        {status && (
          <div role="status" className="alert">
            {status}
          </div>
        )}
      </form>
    </article>
  );
}
