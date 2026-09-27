"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function signIn(event: FormEvent) {
    event.preventDefault();
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setMessage(error ? error.message : "Check your email for the sign-in link.");
  }

  return (
    <main>
      <div className="card stack">
        <div>
          <h1>Family Learning OS</h1>
          <p className="muted">Grades 4–10 · parent and child learning workspace</p>
        </div>
        <form onSubmit={signIn} className="stack">
          <label>
            Parent email
            <br />
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <button type="submit">Sign in with email</button>
        </form>
        {message && <p>{message}</p>}
      </div>
    </main>
  );
}
