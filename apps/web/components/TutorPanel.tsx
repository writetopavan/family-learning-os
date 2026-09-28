"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { apiJson } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";

type Props = {
  familyId: string;
  studentId: string;
  studentName: string;
};

export default function TutorPanel({ familyId, studentId, studentName }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function loadHistory() {
    if (!studentId) return;
    try {
      const data = await apiJson<ChatMessage[]>(`/v1/students/${studentId}/chat`);
      setMessages(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load chat.");
    }
  }

  useEffect(() => {
    void loadHistory();
  }, [studentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || busy) return;

    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages((current) => [...current, optimistic]);
    setMessage("");
    setBusy(true);
    setError("");

    try {
      const reply = await apiJson<ChatMessage>("/v1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          family_id: familyId,
          student_id: studentId,
          message: text,
        }),
      });
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimistic.id),
        optimistic,
        reply,
      ]);
    } catch (err) {
      setMessages((current) => current.filter((item) => item.id !== optimistic.id));
      setMessage(text);
      setError(err instanceof Error ? err.message : "Tutor request failed.");
    } finally {
      setBusy(false);
    }
  }

  const suggestions = [
    "Explain the hardest idea in my uploaded chapter.",
    "Quiz me with 5 quick questions.",
    "Give me an example and then let me try one.",
  ];

  return (
    <section className="workspace-panel tutor-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">AI tutor</span>
          <h2>Study with {studentName}</h2>
          <p>Answers use uploaded school material first, then general knowledge when needed.</p>
        </div>
        <div className="ai-badge"><span className="pulse-dot" /> Document-aware</div>
      </div>

      <div className="chat-window">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="assistant-orb">✦</div>
            <h3>What should we learn today?</h3>
            <p>Upload a chapter or worksheet, then ask questions in natural language.</p>
            <div className="suggestion-grid">
              {suggestions.map((item) => (
                <button key={item} className="suggestion-card" onClick={() => setMessage(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((item) => (
          <div key={item.id} className={`message-row ${item.role}`}>
            <div className="message-avatar">{item.role === "assistant" ? "✦" : "You"}</div>
            <div className="message-bubble">
              <div className="message-label">{item.role === "assistant" ? "Tutor" : "You"}</div>
              <div className="message-text">{item.content}</div>
            </div>
          </div>
        ))}

        {busy && (
          <div className="message-row assistant">
            <div className="message-avatar">✦</div>
            <div className="message-bubble thinking">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <div className="alert error">{error}</div>}

      <form onSubmit={send} className="chat-composer">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Ask about a concept, homework problem, or uploaded chapter…"
          rows={2}
        />
        <button className="primary-button send-button" type="submit" disabled={busy || !message.trim()}>
          {busy ? "Thinking…" : "Ask tutor"}
        </button>
      </form>
    </section>
  );
}
