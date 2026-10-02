"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function finishSignIn() {
      try {
        const url = new URL(window.location.href);
        const hash = new URLSearchParams(url.hash.slice(1));
        if (url.searchParams.has("error") || hash.has("error")) {
          throw new Error("Authorization was not completed");
        }
        // createBrowserClient handles the PKCE code exchange during initialization.
        // getSession waits for it; exchanging the same code again would fail.
        const { data, error } = await createSupabaseBrowserClient().auth.getSession();
        if (error || !data.session) throw new Error("No authenticated session");
        if (active) router.replace("/dashboard");
      } catch {
        if (active) {
          window.history.replaceState(null, "", "/auth/callback");
          setMessage("Sign-in was cancelled or the link has expired. Please try again.");
        }
      }
    }
    void finishSignIn();
    return () => { active = false; };
  }, [router]);

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card">
        <div className="login-orb" aria-hidden="true">✦</div>
        <h1>{message ? "Let’s try signing in again" : "Finishing sign-in…"}</h1>
        <p role="status">{message || "Getting your family workspace ready."}</p>
        {message && <Link className="primary-button" href="/">Back to sign in</Link>}
      </section>
    </main>
  );
}
