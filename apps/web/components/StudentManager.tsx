"use client";
import { FormEvent, useState } from "react";
import { apiJson } from "@/lib/api";
import { BOARDS } from "@/lib/onboarding";
import type { Student } from "@/lib/types";
export default function StudentManager({
  students,
  onReload,
}: {
  students: Student[];
  onReload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setStatus("");
    try {
      await apiJson(`/v1/students/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: editing.display_name.trim(),
          date_of_birth: editing.date_of_birth || null,
          board: editing.board?.trim() || null,
          school_name: editing.school_name?.trim() || null,
          school_location: editing.school_location?.trim() || null,
        }),
      });
      setEditing(null);
      await onReload();
      setStatus("Profile updated.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(e: FormEvent) {
    e.preventDefault();
    if (!deleting || confirmation !== deleting.display_name) return;
    setBusy(true);
    setStatus("");
    try {
      await apiJson(`/v1/students/${deleting.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_name: confirmation }),
      });
      setDeleting(null);
      setConfirmation("");
      await onReload();
      setStatus("Student and their data deleted.");
    } catch (e) {
      setStatus(
        e instanceof Error
          ? e.message
          : "Deletion could not finish. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!students.length) return null;
  return (
    <article className="setup-card full student-manager">
      <h3>Manage children</h3>
      {students.map((s) => (
        <div key={s.id} className="student-row">
          <div>
            <strong>{s.display_name}</strong>
            <small>
              {[s.board, s.school_name, s.school_location]
                .filter(Boolean)
                .join(" · ") || "School details can be added anytime"}
            </small>
          </div>
          <div>
            <button
              type="button"
              disabled={busy}
              className="text-button"
              onClick={() => {
                setEditing({ ...s });
                setDeleting(null);
                setStatus("");
              }}
            >
              Edit profile
            </button>
            <button
              type="button"
              disabled={busy}
              className="text-button"
              onClick={() => {
                setDeleting(s);
                setEditing(null);
                setConfirmation("");
                setStatus("");
              }}
            >
              Delete student and data
            </button>
          </div>
        </div>
      ))}
      {editing && (
        <form className="mini-form" onSubmit={save}>
          <fieldset disabled={busy} className="onboarding-fields">
            <h4>Edit {editing.display_name}</h4>
            <div className="onboarding-grid">
              <label>
                Child name
                <input
                  required
                  maxLength={120}
                  value={editing.display_name}
                  onChange={(e) =>
                    setEditing({ ...editing, display_name: e.target.value })
                  }
                />
              </label>
              <label>
                Date of birth (optional)
                <input
                  type="date"
                  value={editing.date_of_birth || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, date_of_birth: e.target.value })
                  }
                />
              </label>
              <label>
                Board (optional)
                <input
                  list="edit-board-options"
                  maxLength={120}
                  value={editing.board || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, board: e.target.value })
                  }
                />
                <datalist id="edit-board-options">
                  {BOARDS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </label>
              <label>
                School name (optional)
                <input
                  maxLength={240}
                  value={editing.school_name || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, school_name: e.target.value })
                  }
                />
              </label>
              <label>
                School location (optional)
                <input
                  maxLength={240}
                  value={editing.school_location || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, school_location: e.target.value })
                  }
                />
              </label>
            </div>
            <div>
              <button className="primary-button">Save profile</button>
              <button
                type="button"
                className="text-button"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {deleting && (
        <form
          className="delete-student mini-form"
          onSubmit={remove}
          aria-label="Confirm student deletion"
        >
          <h4>Delete {deleting.display_name} and all their data?</h4>
          <p>
            This permanently removes their subjects, books, chapters, uploaded
            files, chats, lessons, tests, answers, results and AI document
            indexes. It cannot be undone. Other children and the family account
            stay available.
          </p>
          <label>
            Type {deleting.display_name} to confirm
            <input
              disabled={busy}
              autoComplete="off"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <div>
            <button
              className="primary-button"
              disabled={busy || confirmation !== deleting.display_name}
            >
              {busy ? "Deleting…" : "Permanently delete student"}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {status && (
        <div role="status" className="alert">
          {status}
        </div>
      )}
    </article>
  );
}
