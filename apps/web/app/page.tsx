"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setMessage(
      error
        ? error.message
        : "Magic link sent. Open your email to enter the learning workspace.",
    );
    setBusy(false);
  }

  return (
    <main className="login-page">
      <section className="login-hero">
        <div className="brand-lockup light">
          <span className="brand-mark">✦</span>
          <div><strong>Family Learning</strong><small>OS</small></div>
        </div>

        <div className="hero-copy">
          <span className="hero-kicker">A learning operating system for your family</span>
          <h1>Turn school material into <em>understanding.</em></h1>
          <p>
            One workspace for textbooks, an AI tutor, adaptive practice, tests,
            marks and progress across Grades 4–10.
          </p>

          <div className="login-feature-grid">
            <div><span>✦</span><strong>Ask the tutor</strong><small>Grounded in your child&apos;s material</small></div>
            <div><span>▤</span><strong>Upload anything</strong><small>PDFs, worksheets, notes and books</small></div>
            <div><span>✓</span><strong>Test & grade</strong><small>Generate tests and get marks instantly</small></div>
            <div><span>↗</span><strong>Build mastery</strong><small>Every answer becomes learning evidence</small></div>
          </div>
        </div>

        <div className="hero-proof">
          <span>Designed for families</span>
          <i />
          <span>Grades 4–10</span>
          <i />
          <span>Private by default</span>
        </div>
      </section>

      <section className="login-side">
        <div className="login-card">
          <div className="login-orb">✦</div>
          <span className="eyebrow">Parent access</span>
          <h2>Welcome back</h2>
          <p>Sign in with a secure magic link. No password to remember.</p>

          <form onSubmit={signIn} className="login-form">
            <label>
              Email address
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <button className="primary-button large" disabled={busy} type="submit">
              {busy ? "Sending link…" : "Continue with email"}
            </button>
          </form>

          {message && <div className="login-message">{message}</div>}

          <div className="privacy-note">
            <span>⌁</span>
            <p>Your family workspace and learning material stay isolated to your account.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
