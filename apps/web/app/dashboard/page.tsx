"use client";

import { FormEvent, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

type Membership = {
  family_id: string;
  role: "parent" | "child";
  families: { id: string; name: string } | null;
};

export default function DashboardPage() {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [familyName, setFamilyName] = useState("");
  const [status, setStatus] = useState("Loading...");

  async function getAccessToken() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function loadFamilies() {
    const token = await getAccessToken();
    if (!token) {
      setStatus("Please sign in first.");
      return;
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/families`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!response.ok) {
      setStatus("Could not load families.");
      return;
    }

    setMemberships(await response.json());
    setStatus("");
  }

  async function createFamily(event: FormEvent) {
    event.preventDefault();
    const token = await getAccessToken();
    if (!token || !familyName.trim()) return;

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/families`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: familyName.trim() }),
      },
    );

    if (!response.ok) {
      setStatus("Could not create family.");
      return;
    }

    setFamilyName("");
    await loadFamilies();
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
