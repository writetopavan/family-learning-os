"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import LearningWorkspace from "@/components/LearningWorkspace";
import { apiJson } from "@/lib/api";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { Membership, Student } from "@/lib/types";

type ChildrenState = { familyId: string; students: Student[]; error: string; loading: boolean };

export default function DashboardPage() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [familyId, setFamilyId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [managingFamily, setManagingFamily] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [newFamilyName, setNewFamilyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [children, setChildren] = useState<ChildrenState>({ familyId: "", students: [], error: "", loading: true });
  const childrenRequest = useRef(0);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    async function openFamily() {
      setLoading(true);
      setError("");
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (!active) return;
        if (sessionError || !data.session) {
          router.replace("/");
          return;
        }
        const { data: listener } = supabase.auth.onAuthStateChange((event) => {
          if (event === "SIGNED_OUT") router.replace("/");
        });
        unsubscribe = () => listener.subscription.unsubscribe();
        const families = await apiJson<Membership[]>("/v1/families");
        if (!active) return;
        setMemberships(families);
        setFamilyId((current) => families.some((item) => item.family_id === current)
          ? current : families[0]?.family_id || "");
        setLoading(false);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not open your family workspace.");
          setLoading(false);
        }
      }
    }
    void openFamily();
    return () => { active = false; unsubscribe?.(); };
  }, [router, retry]);

  const loadStudents = useCallback(async (keepWorkspace = false) => {
    if (!familyId) return;
    const request = ++childrenRequest.current;
    setChildren((current) => ({ familyId, students: current.familyId === familyId ? current.students : [], error: "", loading: !keepWorkspace }));
    try {
      const students = await apiJson<Student[]>(`/v1/families/${familyId}/students`);
      if (request !== childrenRequest.current) return;
      setChildren({ familyId, students, error: "", loading: false });
      // Never select a child automatically, even when there is only one.
      setStudentId((current) => students.some((item) => item.id === current) ? current : "");
    } catch (err) {
      if (request !== childrenRequest.current) return;
      setChildren({ familyId, students: [], loading: false,
        error: err instanceof Error ? err.message : "Could not load children." });
    }
  }, [familyId]);

  useEffect(() => {
    void loadStudents();
    return () => { childrenRequest.current += 1; };
  }, [loadStudents]);

  function changeFamily(id: string) {
    childrenRequest.current += 1;
    setStudentId("");
    setManagingFamily(false);
    setError("");
    setFamilyId(id);
  }

  function chooseChild(id: string) {
    if (!children.students.some((student) => student.id === id && student.family_id === familyId)) return;
    setStudentId(id);
    setManagingFamily(false);
  }

  async function signOut() {
    try {
      const { error: signOutError } = await createSupabaseBrowserClient().auth.signOut();
      if (signOutError) throw signOutError;
      router.replace("/");
    } catch {
      setError("Could not sign out. Please try again.");
    }
  }

  async function createFamily(event: FormEvent) {
    event.preventDefault();
    if (!newFamilyName.trim() || creating) return;
    setCreating(true);
    setError("");
    try {
      await apiJson("/v1/families", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFamilyName.trim() }),
      });
      setNewFamilyName("");
      setRetry((current) => current + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create family.");
    } finally {
      setCreating(false);
    }
  }

  if (loading || (!error && familyId && (children.familyId !== familyId || children.loading))) {
    return <main className="onboarding-shell"><section className="onboarding-card">
      <div className="login-orb" aria-hidden="true">✦</div>
      <h1>Getting your family ready…</h1><p role="status">Loading your children and learning workspace.</p>
    </section></main>;
  }

  if (!familyId && memberships.length === 0 && !error) {
    return <main className="onboarding-shell"><section className="onboarding-card">
      <div className="brand-lockup"><span className="brand-mark">✦</span> Family Learning OS</div>
      <span className="eyebrow">Welcome</span><h1>Create your family workspace</h1>
      <p>Create a family, add your children, then choose who is learning.</p>
      <form onSubmit={createFamily} className="stack">
        <label>Family name<input value={newFamilyName} onChange={(event) => setNewFamilyName(event.target.value)} placeholder="e.g. Singh Family" required /></label>
        <button className="primary-button" disabled={creating} type="submit">{creating ? "Creating…" : "Create workspace"}</button>
      </form>
      <button className="text-button chooser-signout" onClick={signOut}>Sign out</button>
    </section></main>;
  }

  const students = children.familyId === familyId ? children.students : [];
  const childError = children.familyId === familyId ? children.error : "";
  if (error || childError) {
    return <main className="onboarding-shell"><section className="onboarding-card">
      <h1>Could not open your workspace</h1><p className="alert error" role="alert">{error || childError}</p>
      <div className="hero-actions">
        <button className="primary-button" onClick={() => error ? setRetry((current) => current + 1) : void loadStudents()}>Try again</button>
        <Link className="ghost-button" href="/">Back to sign in</Link>
      </div>
    </section></main>;
  }

  if (studentId || managingFamily) {
    return <LearningWorkspace key={`${familyId}:${studentId}`} memberships={memberships} familyId={familyId}
      students={students} studentId={studentId} onFamilyChange={changeFamily} onStudentChange={chooseChild}
      onChooseChild={() => { setStudentId(""); setManagingFamily(false); }} onStudentsChanged={() => loadStudents(true)} />;
  }

  return <main className="onboarding-shell"><section className="onboarding-card child-chooser">
    <div className="brand-lockup"><span className="brand-mark">✦</span> Family Learning OS</div>
    <span className="eyebrow">Your family</span><h1>Who is learning today?</h1>
    <p>Choose a child to open their tutor, school material and tests.</p>
    <label>Family<select value={familyId} onChange={(event) => changeFamily(event.target.value)}>
      {memberships.map((item) => <option key={item.family_id} value={item.family_id}>{item.families?.name || "Family"}</option>)}
    </select></label>
    {students.length > 0 ? <div className="child-grid">
      {students.map((student, index) => <button type="button" className="child-card" key={student.id} onClick={() => chooseChild(student.id)}>
        <span className={`child-avatar tone-${index % 3}`} aria-hidden="true">{student.display_name.trim().slice(0, 1).toUpperCase()}</span>
        <strong>{student.display_name}</strong><span>Open learning workspace →</span>
      </button>)}
    </div> : <div className="chooser-empty"><h2>Add your first child</h2><p>Create a child profile to start learning.</p></div>}
    <div className="chooser-actions">
      <button className="secondary-button" onClick={() => setManagingFamily(true)}>{students.length ? "Manage children & setup" : "Add a child"}</button>
      <button className="text-button" onClick={signOut}>Sign out</button>
    </div>
  </section></main>;
}
