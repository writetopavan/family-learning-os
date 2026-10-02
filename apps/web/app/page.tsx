"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"google" | "email" | null>(null);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const { data } = await createSupabaseBrowserClient().auth.getSession();
        if (active && data.session) router.replace("/dashboard");
      } catch {
        if (active) setMessage("Sign-in is temporarily unavailable. Please try again.");
      }
    }
    void restoreSession();
    return () => { active = false; };
  }, [router]);

  async function signInWithGoogle() {
    setBusy("google");
    setMessage("");
    try {
      // Avoid sending the parent to a provider error page before Google is enabled.
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "" },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Could not check sign-in availability");
      const settings = await response.json();
      if (!settings.external?.google) {
        setMessage("Google sign-in is not available yet. Please use an email link for now.");
        setBusy(null);
        return;
      }
      const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch {
      setMessage("Google sign-in could not start. Please try again or use an email link.");
      setBusy(null);
    }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy("email");
    setMessage("");
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setMessage("Sign-in link sent. Open your email to choose a child and start learning.");
    } catch {
      setMessage("We could not send the sign-in link. Please try again.");
    } finally {
      setBusy(null);
    }
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
          <p>Sign in, then choose a child to open their learning workspace.</p>

          <button className="google-button" disabled={busy !== null} onClick={signInWithGoogle} type="button">
            <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z" />
              <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19Z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
            </svg>
            {busy === "google" ? "Opening Google…" : "Continue with Google"}
          </button>
          <div className="login-divider"><span>or use an email link</span></div>

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
            <button className="primary-button large" disabled={busy !== null} type="submit">
              {busy === "email" ? "Sending link…" : "Send sign-in link"}
            </button>
          </form>

          {message && <div className="login-message" role="status">{message}</div>}

          <div className="privacy-note">
            <span>⌁</span>
            <p>Your family workspace and learning material stay isolated to your account.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
