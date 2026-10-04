"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { apiJson } from "@/lib/api";
import type { ChatMessage, Thread, Assessment } from "@/lib/types";
import Markdown from "./Markdown";
import SourceReferences from "./SourceReferences";
import { uploadStudentFile } from "@/lib/planning";
import type { Material } from "@/lib/types";

type Props = {
  familyId: string;
  studentId: string;
  studentName: string;
  academicYearId?: string;
  subjectId?: string;
  chapterId?: string;
  onSaved?: () => void;
  onOpenTest?: (id: string) => void;
};
export default function TutorPanel({
  familyId,
  studentId,
  studentName,
  academicYearId,
  subjectId,
  chapterId,
  onSaved,
  onOpenTest,
}: Props) {
  const [threads, setThreads] = useState<Thread[]>([]),
    [threadId, setThreadId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [message, setMessage] = useState("");
  const [mode, setMode] = useState("chat"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [attachments, setAttachments] = useState<Material[]>([]);
  const [savedTest, setSavedTest] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    apiJson<Thread[]>(`/v1/students/${studentId}/threads`)
      .then((data) => {
        if (active) {
          setThreads(data);
          setThreadId(data[0]?.id || "");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [studentId]);
  useEffect(() => {
    let active = true;
    setMessages([]);
    if (threadId)
      apiJson<ChatMessage[]>(
        `/v1/students/${studentId}/chat?thread_id=${threadId}`,
      )
        .then((data) => {
          if (active) setMessages(data);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [studentId, threadId]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);
  async function newThread(title = "New conversation") {
    const t = await apiJson<Thread>("/v1/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        family_id: familyId,
        student_id: studentId,
        title,
      }),
    });
    setThreads((current) => [t, ...current]);
    setThreadId(t.id);
    setMessages([]);
    setSavedTest("");
    return t.id;
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    setSavedTest("");
    try {
      const id = threadId || (await newThread(text.slice(0, 80)));
      const payload = {
        family_id: familyId,
        student_id: studentId,
        thread_id: id,
        academic_year_id: academicYearId || null,
        subject_id: subjectId || null,
      };
      if (mode === "lesson") {
        await apiJson("/v1/lessons/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            chapter_id: chapterId || null,
            title: text.slice(0, 180),
            message: text,
          }),
        });
        onSaved?.();
      } else if (mode === "test") {
        const test = await apiJson<Assessment>("/v1/assessments/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            chapter_ids: chapterId ? [chapterId] : [],
            title: text.slice(0, 180),
            question_count: 10,
            difficulty: "mixed",
          }),
        });
        setSavedTest(test.id);
        onSaved?.();
      } else {
        await apiJson("/v1/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            chapter_ids: chapterId ? [chapterId] : [],
            message:
              mode === "book"
                ? `Import the attached book, create its chapters and topics in the selected subject. ${text}`
                : text,
            material_ids: attachments.map((m) => m.id),
          }),
        });
        onSaved?.();
      }
      setAttachments([]);
      setMessage("");
      setMessages(
        await apiJson<ChatMessage[]>(
          `/v1/students/${studentId}/chat?thread_id=${id}`,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="workspace-panel tutor-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">AI tutor</span>
          <h2>Study with {studentName}</h2>
          <p>
            Ask questions, save schedules or exam syllabuses, import books, and
            report completed chapters.
          </p>
        </div>
      </div>
      <div className="thread-controls">
        <label>
          Conversation
          <select
            aria-label="Conversation"
            value={threadId}
            disabled={busy}
            onChange={(e) => {
              setThreadId(e.target.value);
              setAttachments([]);
              setSavedTest("");
            }}
          >
            <option value="">New conversation</option>
            {threads.map((t) => (
              <option value={t.id} key={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => {
            setThreadId("");
            setMessages([]);
            setAttachments([]);
            setSavedTest("");
          }}
        >
          New thread
        </button>
      </div>
      <div className="chat-window">
        {!messages.length && (
          <div className="chat-empty">
            <h3>What should we learn today?</h3>
            <p>
              Select a subject or chapter to file generated learning content
              automatically.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div className={`message-row ${m.role}`} key={m.id}>
            <div className="message-bubble">
              <div className="message-label">
                {m.role === "assistant" ? "Tutor" : "You"}
              </div>
              {m.material_ids && m.material_ids.length > 0 && (
                <small>{m.material_ids.length} document attachment(s)</small>
              )}
              <Markdown>{m.content}</Markdown>
              {m.role === "assistant" && <SourceReferences sources={m.source_references} />}
            </div>
          </div>
        ))}
        {busy && (
          <p role="status">
            {mode === "chat" ? "Thinking…" : "Generating and saving…"}
          </p>
        )}
        <div ref={bottom} />
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {savedTest && onOpenTest && (
        <button
          className="primary-button"
          onClick={() => onOpenTest(savedTest)}
        >
          Open saved test
        </button>
      )}
      <form onSubmit={send}>
        <div className="thread-controls">
          <label>
            Attach a document
            <input
              aria-label="Chat attachment"
              type="file"
              accept=".pdf,.txt,.md,.docx,.pptx"
              disabled={
                busy ||
                attachments.length >= 5 ||
                mode === "lesson" ||
                mode === "test"
              }
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setBusy(true);
                setError("");
                uploadStudentFile(file, {
                  familyId,
                  studentId,
                  academicYearId,
                  subjectId,
                  chapterId,
                })
                  .then((material) =>
                    setAttachments((current) => [...current, material]),
                  )
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            />
          </label>
          {attachments.map((a) => (
            <span className="attachment-chip" key={a.id}>
              {a.file_name} · {a.status}
              <button
                type="button"
                aria-label={`Remove ${a.file_name}`}
                disabled={busy}
                onClick={() =>
                  setAttachments((v) => v.filter((m) => m.id !== a.id))
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="thread-controls">
          <label>
            Content type
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                if (e.target.value === "lesson" || e.target.value === "test")
                  setAttachments([]);
              }}
              disabled={busy}
            >
              <option value="chat">General chat</option>
              <option value="lesson">Save a lesson / topic</option>
              <option value="test">Generate a test</option>
              <option value="book">Import a textbook</option>
            </select>
          </label>
          {mode !== "chat" && (
            <span>
              {subjectId
                ? "Will be filed under the selected subject / chapter"
                : "Select a subject first"}
            </span>
          )}
        </div>
        <div className="chat-composer">
          <textarea
            aria-label="Message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              mode === "lesson"
                ? "Explain this topic with examples…"
                : mode === "test"
                  ? "What should this test cover?"
                  : "Ask the tutor…"
            }
            rows={3}
          />
          <button
            className="primary-button"
            disabled={
              busy ||
              !message.trim() ||
              (mode !== "chat" && !subjectId) ||
              (mode === "book" && !attachments.length)
            }
          >
            {mode === "chat" || mode === "book"
              ? "Send"
              : mode === "lesson"
                ? "Generate lesson"
                : "Generate test"}
          </button>
        </div>
      </form>
    </section>
  );
}

