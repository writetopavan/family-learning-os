"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { apiJson } from "@/lib/api";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { Material } from "@/lib/types";

type Props = {
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
  familyId,
  studentId,
  academicYearId,
  subjectId,
  chapterId,
  materials,
  onReload,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const readyCount = useMemo(
    () => materials.filter((item) => item.status === "ready").length,
    [materials],
  );

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
      await apiJson<Material>("/v1/materials/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: materialId,
          family_id: familyId,
          student_id: studentId,
          academic_year_id: academicYearId || null,
          subject_id: subjectId || null,
          chapter_id: chapterId || null,
          title: file.name.replace(/\.[^.]+$/, ""),
          file_name: file.name,
          storage_path: storagePath,
          mime_type: file.type || null,
          size_bytes: file.size,
        }),
      });

      setStatus("Document added. It is ready for the tutor.");
      await onReload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="workspace-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Learning library</span>
          <h2>Upload school material</h2>
          <p>PDFs, notes and worksheets become searchable context for chat and tests.</p>
        </div>
        <div className="metric-pill">
          <strong>{readyCount}</strong>
          <span>AI-ready</span>
        </div>
      </div>

      <label className={`upload-dropzone ${uploading ? "is-busy" : ""}`}>
        <input
          type="file"
          accept=".pdf,.txt,.md,.doc,.docx,.ppt,.pptx"
          onChange={upload}
          disabled={uploading}
        />
        <div className="upload-icon">↑</div>
        <div>
          <strong>{uploading ? "Working on your document…" : "Drop a file here or browse"}</strong>
          <p>PDF, Word, PowerPoint or text · up to 100 MB</p>
        </div>
        <span className="secondary-button">{uploading ? "Please wait" : "Choose file"}</span>
      </label>

      {status && <div className={`alert ${status.toLowerCase().includes("fail") ? "error" : ""}`}>{status}</div>}

      <div className="library-list">
        {materials.length === 0 ? (
          <div className="empty-card">
            <span className="empty-icon">▤</span>
            <div>
              <strong>No material yet</strong>
              <p>Upload a chapter PDF first. Tutor and test generation will use it automatically.</p>
            </div>
          </div>
        ) : (
          materials.map((item) => (
            <article key={item.id} className="material-row">
              <div className="file-tile">PDF</div>
              <div className="material-copy">
                <strong>{item.title}</strong>
                <span>{item.file_name} · {prettyBytes(item.size_bytes)}</span>
                {item.error_message && <small>{item.error_message}</small>}
              </div>
              <span className={`status-badge ${item.status}`}>
                {item.status === "ready" ? "Ready" : item.status === "processing" ? "Indexing" : "Failed"}
              </span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
