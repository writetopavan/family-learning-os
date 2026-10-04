"use client";
import { FormEvent, useState } from "react";
import { apiJson } from "@/lib/api";
type Field = {
  key: string;
  label: string;
  type?: string;
  optional?: boolean;
  min?: number;
  max?: number;
};
const fields: Record<string, Field[]> = {
  "academic-years": [
    { key: "label", label: "Academic year" },
    { key: "grade_level", label: "Grade", type: "number", min: 4, max: 10 },
    { key: "start_date", label: "Start date", type: "date" },
    { key: "end_date", label: "End date", type: "date" },
  ],
  subjects: [
    { key: "name", label: "Subject name" },
    {
      key: "language_level",
      label: "Language level (1, 2 or 3; leave blank for other subjects)",
      type: "number",
      min: 1,
      max: 3,
      optional: true,
    },
  ],
  books: [
    { key: "title", label: "Book title" },
    { key: "publisher", label: "Publisher", optional: true },
    { key: "edition", label: "Edition", optional: true },
  ],
  chapters: [
    { key: "title", label: "Chapter title" },
    { key: "sequence", label: "Chapter number", type: "number", min: 1 },
  ],
};
export default function CurriculumEditor({
  resource,
  items,
  onReload,
}: {
  resource: string;
  items: object[];
  onReload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState<Record<string, unknown> | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      const values = Object.fromEntries(
        fields[resource].map((f) => [
          f.key,
          f.type === "number"
            ? f.optional && !editing[f.key]
              ? null
              : Number(editing[f.key])
            : f.optional
              ? String(editing[f.key] || "").trim() || null
              : String(editing[f.key] || "").trim(),
        ]),
      );
      await apiJson(`/v1/curriculum/${resource}/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      setEditing(null);
      await onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      await apiJson(`/v1/curriculum/${resource}/${deleting.id}`, {
        method: "DELETE",
      });
      setDeleting(null);
      await onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="curriculum-editor">
      {items.map((value) => {
        const item = value as Record<string, unknown>;
        return (
          <div className="edit-row" key={String(item.id)}>
            <span>
              {String(item.label || item.name || item.title)}
              {resource === "subjects" && item.language_level
                ? ` · ${["", "First", "Second", "Third"][Number(item.language_level)]} language`
                : ""}
            </span>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setEditing({ ...item });
                setError("");
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setDeleting(item);
                setError("");
              }}
            >
              Delete
            </button>
          </div>
        );
      })}
      {editing && (
        <form className="mini-form editor-form" onSubmit={save}>
          <strong>Edit {resource.replaceAll("-", " ")}</strong>
          {fields[resource].map((f) => (
            <label key={f.key}>
              {f.label}
              <input
                type={f.type || "text"}
                min={f.min}
                max={f.max}
                required={!f.optional}
                value={String(editing[f.key] ?? "")}
                onChange={(e) =>
                  setEditing({ ...editing, [f.key]: e.target.value })
                }
              />
            </label>
          ))}
          <div>
            <button className="primary-button" disabled={busy}>
              Save changes
            </button>{" "}
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {deleting && (
        <div className="alert" role="alert">
          <p>
            Delete{" "}
            <strong>
              {String(deleting.label || deleting.name || deleting.title)}
            </strong>
            ? Only empty items can be deleted. Saved lessons, tests and results
            are protected.
          </p>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => void remove()}
          >
            Confirm delete
          </button>{" "}
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => setDeleting(null)}
          >
            Cancel
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
    </div>
  );
}
