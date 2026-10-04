"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiJson } from "@/lib/api";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import PlanReview from "./PlanReview";
import DocumentIndexStatus from "./DocumentIndexStatus";
import { buildDocumentIndex } from "@/lib/document-index";
import { postJson } from "@/lib/planning";
import type { Plan } from "@/lib/planning";
import type { Material, Subject } from "@/lib/types";

type Props = {
  subjects: Subject[];
  onSubjectChange: (id: string) => void;
  familyId: string;
  studentId: string;
  academicYearId?: string;
  subjectId?: string;
  chapterId?: string;
  materials: Material[];
  onReload: () => Promise<void>;
};

function prettyBytes(bytes: number) {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export default function MaterialsPanel({
  subjects,
  onSubjectChange,
  familyId,
  studentId,
  academicYearId,
  subjectId,
  chapterId,
  materials,
  onReload,
}: Props) {
  const indexController = useRef<AbortController | null>(null);
  useEffect(() => () => indexController.current?.abort(), []);
  const [bookPlan, setBookPlan] = useState<Plan | null>(null);
  const [planYear, setPlanYear] = useState<string | null>(null);
  const [textbook, setTextbook] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const readyCount = useMemo(
    () => materials.filter((item) => item.status === "ready").length,
    [materials],
  );

  const selectedSubject = subjects.find((subject) => subject.id === subjectId);
  const detectedSubjects = bookPlan
    ? [...new Set(bookPlan.books.map((book) => book.subject))]
    : [];
  const differentSubject = detectedSubjects.some((name) => name !== selectedSubject?.name);
  const saveLabel = differentSubject
    ? `Confirm and save under ${detectedSubjects.join(", ")}`
    : "Save plan";

  async function deleteMaterial(item: Material) {
    if (deletingId || uploading || importing) return;
    if (!window.confirm(`Delete “${item.title}”? This permanently removes the uploaded file, extracted pages, index, and chapters/topics linked to this extraction. Saved tests, results and lessons are kept.`)) return;
    setDeletingId(item.id);
    setStatus("Deleting material and its extraction…");
    try {
      await apiJson(`/v1/materials/${item.id}`, { method: "DELETE" });
      setBookPlan(null);
      await onReload();
      setStatus("Material and its extraction deleted.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not delete material. Please retry.");
    } finally {
      setDeletingId(null);
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploading) return;

    if (file.size > 100_000_000) {
      setStatus("For the MVP, keep each document below 100 MB.");
      return;
    }

    const materialId = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${familyId}/${studentId}/${materialId}/${safeName}`;

    setUploading(true);
    setStatus("Uploading securely…");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.storage
        .from("learning-materials")
        .upload(storagePath, file, {
          contentType: file.type || undefined,
          upsert: false,
        });

      if (error) throw new Error(error.message);

      setStatus("Indexing for AI tutor…");
      const material = await apiJson<Material>("/v1/materials/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: materialId,
          family_id: familyId,
          student_id: studentId,
          academic_year_id: academicYearId || null,
          subject_id: subjectId || null,
          chapter_id: textbook ? null : chapterId || null,
          title: file.name.replace(/\.[^.]+$/, ""),
          file_name: file.name,
          storage_path: storagePath,
          mime_type: file.type || null,
          size_bytes: file.size,
        }),
      });

      if (file.name.toLowerCase().endsWith('.pdf')) {
        indexController.current = new AbortController();
        await buildDocumentIndex(material.id, job => setStatus(`Indexing source pages: ${job.completed_pages}/${job.page_count || '?'} · ${job.status}`), indexController.current.signal);
      }
      setStatus(
        material.status === "ready" || file.name.toLowerCase().endsWith(".pdf")
          ? "Document added. It is ready for the tutor."
          : "Uploaded. Indexing is still in progress.",
      );
      if (textbook)
        await extractBook(material.id);
      await onReload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function extractBook(id: string) {
    setImporting(true);
    setBookPlan(null);
    setStatus("Reading the opening pages and table of contents…");
    try {
      indexController.current = new AbortController();
      await buildDocumentIndex(id, job => setStatus(`Indexing source pages: ${job.completed_pages}/${job.page_count || '?'} · ${job.status}`), indexController.current.signal);
      setStatus('Reading the indexed book structure and topics…');
      const extracted = await postJson<{
        plan: Plan;
        academic_year_id: string | null;
      }>("/v1/planning/interpret", {
        purpose: "book_preview",
        family_id: familyId,
        student_id: studentId,
        academic_year_id: academicYearId || null,
        subject_id: subjectId || null,
        message:
          "Prepare a textbook import for review before saving. Extract the complete table of contents as chapters and its topics. Identify the subject from the textbook. If it clearly belongs to a different existing subject in the selected academic year, propose the book under that subject and explain the difference in your answer; I will confirm using the save button. Do not stop for clarification solely because the selected subject differs. If the subject does not exist, ask me to add it in Setup. Link the book to the attached material.",
        material_ids: [id],
      });
      setBookPlan(extracted.plan);
      setPlanYear(extracted.academic_year_id);
      setStatus("");
      await onReload();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Book extraction failed");
    } finally {
      setImporting(false);
    }
  }
  async function saveBook() {
    if (!bookPlan) return;
    setImporting(true);
    try {
      await postJson("/v1/planning/apply", {
        family_id: familyId,
        student_id: studentId,
        academic_year_id: planYear,
        plan: bookPlan,
      });
      const importedSubject = detectedSubjects.length === 1
        ? subjects.find((subject) => subject.name === detectedSubjects[0])
        : null;
      setBookPlan(null);
      setStatus("Book, chapters and topics saved in the learning tree.");
      if (importedSubject) onSubjectChange(importedSubject.id);
      await onReload();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not save book");
    } finally {
      setImporting(false);
    }
  }
  return (
    <section className="workspace-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Learning library</span>
          <h2>Upload school material</h2>
          <p>
            PDFs, notes and worksheets become searchable context for chat and
            tests.
          </p>
        </div>
        <div className="metric-pill">
          <strong>{readyCount}</strong>
          <span>AI-ready</span>
        </div>
      </div>

      <label className="textbook-option">
        <input
          type="checkbox"
          checked={textbook}
          disabled={uploading || importing || !subjectId}
          onChange={(e) => setTextbook(e.target.checked)}
        />{" "}
        This is a textbook — preview chapters after upload
      </label>
      {!subjectId && (
        <p>Select a subject in Current study context above before importing a textbook.</p>
      )}
      <label className={`upload-dropzone ${uploading ? "is-busy" : ""}`}>
        <input
          type="file"
          accept=".pdf,.txt,.md,.doc,.docx,.ppt,.pptx"
          onChange={upload}
          disabled={uploading || !!deletingId}
        />
        <div className="upload-icon">↑</div>
        <div>
          <strong>
            {uploading
              ? "Working on your document…"
              : "Drop a file here or browse"}
          </strong>
          <p>PDF, Word, PowerPoint or text · up to 100 MB</p>
        </div>
        <span className="secondary-button">
          {uploading ? "Please wait" : "Choose file"}
        </span>
      </label>

      {status && (
        <div
          className={`alert ${status.toLowerCase().includes("fail") ? "error" : ""}`}
        >
          {status}
        </div>
      )}

      {differentSubject && (
        <div className="alert" role="status">
          Selected subject: {selectedSubject?.name || "None"}. The textbook belongs to {detectedSubjects.join(", ")}. Confirm below to save the book, chapters and topics under the detected subject and update the PDF link.
        </div>
      )}
      {bookPlan && (
        <PlanReview
          saveLabel={saveLabel}
          plan={bookPlan}
          busy={importing}
          onSave={() => void saveBook()}
          onCancel={() => setBookPlan(null)}
        />
      )}
      <div className="library-list">
        {materials.length === 0 ? (
          <div className="empty-card">
            <span className="empty-icon">▤</span>
            <div>
              <strong>No material yet</strong>
              <p>
                Upload a chapter PDF first. Tutor and test generation will use
                it automatically.
              </p>
            </div>
          </div>
        ) : (
          materials.map((item) => (
            <article key={item.id} className="material-row">
              <div className="file-tile">PDF</div>
              <div className="material-copy">
                <strong>{item.title}</strong>
                <span>
                  {item.file_name} · {prettyBytes(item.size_bytes)}
                </span>
                {item.error_message && <small>{item.error_message}</small>}
                {deletingId !== item.id && item.file_name.toLowerCase().endsWith('.pdf') && <DocumentIndexStatus materialId={item.id} materialStatus={item.status} onReady={onReload} />}
              </div>
              <button
                className="text-button"
                disabled={importing || uploading || !!deletingId || !subjectId}
                onClick={() => void extractBook(item.id)}
              >
                Extract chapters
              </button>
              <button
                className="text-button"
                aria-label={`Delete ${item.title}`}
                disabled={uploading || importing || !!deletingId}
                onClick={() => void deleteMaterial(item)}
              >
                {deletingId === item.id ? "Deleting…" : "Delete"}
              </button>
              <span className={`status-badge ${item.status}`}>
                {item.status === "ready"
                  ? "Ready"
                  : item.status === "processing"
                    ? "Indexing"
                    : "Failed"}
              </span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
