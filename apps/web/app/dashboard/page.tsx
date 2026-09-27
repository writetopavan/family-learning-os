"use client";

import { FormEvent, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

type Membership = {
  family_id: string;
  role: "parent" | "child";
  families: { id: string; name: string } | null;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

export default function DashboardPage() {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [familyName, setFamilyName] = useState("");
  const [status, setStatus] = useState("Loading...");

  async function getAccessToken() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function apiFetch(path: string, init?: RequestInit) {
    if (!apiBaseUrl) {
      throw new Error("NEXT_PUBLIC_API_BASE_URL is missing");
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    try {
      return await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function loadFamilies() {
    try {
      const token = await getAccessToken();
      if (!token) {
        setStatus("Please sign in first.");
        return;
      }

      const response = await apiFetch("/v1/families", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const detail = await response.text();
        setStatus(`Could not load families (HTTP ${response.status}). ${detail}`);
        return;
      }

      setMemberships(await response.json());
      setStatus("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown network error";
      setStatus(`API connection failed: ${message}`);
    }
  }

  async function createFamily(event: FormEvent) {
    event.preventDefault();

    try {
      const token = await getAccessToken();
      if (!token) {
        setStatus("Please sign in first.");
        return;
      }
      if (!familyName.trim()) return;

      setStatus("Creating family...");

      const response = await apiFetch("/v1/families", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: familyName.trim() }),
      });

      if (!response.ok) {
        const detail = await response.text();
        setStatus(`Could not create family (HTTP ${response.status}). ${detail}`);
        return;
      }

      setFamilyName("");
      await loadFamilies();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown network error";
      setStatus(`API connection failed: ${message}`);
    }
  }

  useEffect(() => {
    void loadFamilies();
  }, []);

  return (
    <main className="stack">
      <header>
        <h1>Family Learning OS</h1>
        <p className="muted">Phase 1 · family setup</p>
      </header>

      <section className="card stack">
        <h2>Your families</h2>
        {status && <p>{status}</p>}
        {memberships.map((membership) => (
          <div key={membership.family_id}>
            <strong>{membership.families?.name ?? membership.family_id}</strong>
            <span className="muted"> · {membership.role}</span>
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2>Create family</h2>
        <form onSubmit={createFamily} className="stack">
          <input
            value={familyName}
            onChange={(event) => setFamilyName(event.target.value)}
            placeholder="Singh Family"
            aria-label="Family name"
          />
          <button type="submit">Create family</button>
        </form>
      </section>
    </main>
  );
}
