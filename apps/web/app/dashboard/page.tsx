"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

type Membership = {
  family_id: string;
  role: "parent" | "child";
  families: { id: string; name: string } | null;
};

type Student = {
  id: string;
  family_id: string;
  display_name: string;
  date_of_birth: string | null;
};

type AcademicYear = {
  id: string;
  family_id: string;
  student_id: string;
  label: string;
  start_date: string;
  end_date: string;
  grade_level: number;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

export default function DashboardPage() {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);

  const [familyName, setFamilyName] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentDob, setStudentDob] = useState("");
  const [yearLabel, setYearLabel] = useState("2026-27");
  const [gradeLevel, setGradeLevel] = useState("4");
  const [startDate, setStartDate] = useState("2026-04-01");
  const [endDate, setEndDate] = useState("2027-03-31");
  const [status, setStatus] = useState("Loading...");

  const selectedFamily = useMemo(
    () => memberships.find((item) => item.family_id === selectedFamilyId),
    [memberships, selectedFamilyId],
  );

  const selectedStudent = useMemo(
    () => students.find((item) => item.id === selectedStudentId),
    [students, selectedStudentId],
  );

  async function getAccessToken() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function apiFetch(path: string, init?: RequestInit) {
    if (!apiBaseUrl) {
      throw new Error("NEXT_PUBLIC_API_BASE_URL is missing");
    }

    const token = await getAccessToken();
    if (!token) {
      throw new Error("Please sign in first.");
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    try {
      return await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.headers ?? {}),
        },
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function readJson<T>(path: string): Promise<T> {
    const response = await apiFetch(path);
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }
    return response.json();
  }

  async function loadFamilies() {
    try {
      const data = await readJson<Membership[]>("/v1/families");
      setMemberships(data);
      setSelectedFamilyId((current) => current || data[0]?.family_id || "");
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load families.");
    }
  }

  async function loadStudents(familyId: string) {
    if (!familyId) {
      setStudents([]);
      setSelectedStudentId("");
      return;
    }

    try {
      setStatus("Loading students...");
      const data = await readJson<Student[]>(`/v1/families/${familyId}/students`);
      setStudents(data);
      setSelectedStudentId((current) =>
        data.some((student) => student.id === current) ? current : data[0]?.id || "",
      );
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load students.");
    }
  }

  async function loadAcademicYears(studentId: string) {
    if (!studentId) {
      setAcademicYears([]);
      return;
    }

    try {
      setStatus("Loading academic setup...");
      const data = await readJson<AcademicYear[]>(
        `/v1/students/${studentId}/academic-years`,
      );
      setAcademicYears(data);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load academic years.");
    }
  }

  async function createFamily(event: FormEvent) {
    event.preventDefault();
    if (!familyName.trim()) return;

    try {
      setStatus("Creating family...");
      const response = await apiFetch("/v1/families", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: familyName.trim() }),
      });

      if (!response.ok) {
        throw new Error(`Could not create family (HTTP ${response.status}). ${await response.text()}`);
      }

      setFamilyName("");
      await loadFamilies();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create family.");
    }
  }

  async function createStudent(event: FormEvent) {
    event.preventDefault();
    if (!selectedFamilyId || !studentName.trim()) return;

    try {
      setStatus("Adding child...");
      const response = await apiFetch("/v1/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          family_id: selectedFamilyId,
          display_name: studentName.trim(),
          date_of_birth: studentDob || null,
        }),
      });

      if (!response.ok) {
        throw new Error(`Could not add child (HTTP ${response.status}). ${await response.text()}`);
      }

      const created = (await response.json()) as Student;
      setStudentName("");
      setStudentDob("");
      await loadStudents(selectedFamilyId);
      setSelectedStudentId(created.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not add child.");
    }
  }

  async function createAcademicYear(event: FormEvent) {
    event.preventDefault();
    if (!selectedFamilyId || !selectedStudentId) return;

    try {
      setStatus("Saving academic year...");
      const response = await apiFetch("/v1/academic-years", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          family_id: selectedFamilyId,
          student_id: selectedStudentId,
          label: yearLabel.trim(),
          start_date: startDate,
          end_date: endDate,
          grade_level: Number(gradeLevel),
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Could not save academic year (HTTP ${response.status}). ${await response.text()}`,
        );
      }

      await loadAcademicYears(selectedStudentId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save academic year.");
    }
  }

  useEffect(() => {
    void loadFamilies();
  }, []);

  useEffect(() => {
    void loadStudents(selectedFamilyId);
  }, [selectedFamilyId]);

  useEffect(() => {
    void loadAcademicYears(selectedStudentId);
  }, [selectedStudentId]);

  return (
    <main className="stack">
      <header>
        <h1>Family Learning OS</h1>
        <p className="muted">Phase 1 · family and student academic setup</p>
      </header>

      {status && <section className="card">{status}</section>}

      <section className="card stack">
        <h2>Family</h2>
        {memberships.length > 0 && (
          <select
            value={selectedFamilyId}
            onChange={(event) => setSelectedFamilyId(event.target.value)}
          >
            {memberships.map((membership) => (
              <option key={membership.family_id} value={membership.family_id}>
                {membership.families?.name ?? membership.family_id} · {membership.role}
              </option>
            ))}
          </select>
        )}

        <form onSubmit={createFamily} className="inline-form">
          <input
            value={familyName}
            onChange={(event) => setFamilyName(event.target.value)}
            placeholder="New family name"
            aria-label="Family name"
          />
          <button type="submit">Create family</button>
        </form>
      </section>

      {selectedFamily && (
        <section className="card stack">
          <h2>Children</h2>
          {students.length === 0 ? (
            <p className="muted">No children added yet.</p>
          ) : (
            <select
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
            >
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.display_name}
                </option>
              ))}
            </select>
          )}

          <form onSubmit={createStudent} className="form-grid">
            <label>
              Name
              <input
                value={studentName}
                onChange={(event) => setStudentName(event.target.value)}
                placeholder="Child name"
                required
              />
            </label>
            <label>
              Date of birth
              <input
                type="date"
                value={studentDob}
                onChange={(event) => setStudentDob(event.target.value)}
              />
            </label>
            <button type="submit">Add child</button>
          </form>
        </section>
      )}

      {selectedStudent && (
        <section className="card stack">
          <div>
            <h2>{selectedStudent.display_name} · Academic setup</h2>
            <p className="muted">Add the current school year and grade.</p>
          </div>

          {academicYears.length > 0 && (
            <div className="stack">
              {academicYears.map((year) => (
                <div key={year.id} className="row">
                  <strong>{year.label}</strong>
                  <span className="muted">Grade {year.grade_level}</span>
                  <span className="muted">
                    {year.start_date} → {year.end_date}
                  </span>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={createAcademicYear} className="form-grid">
            <label>
              Academic year
              <input
                value={yearLabel}
                onChange={(event) => setYearLabel(event.target.value)}
                placeholder="2026-27"
                required
              />
            </label>
            <label>
              Grade
              <select value={gradeLevel} onChange={(event) => setGradeLevel(event.target.value)}>
                {[4, 5, 6, 7, 8, 9, 10].map((grade) => (
                  <option key={grade} value={grade}>
                    Grade {grade}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
              />
            </label>
            <label>
              End date
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                required
              />
            </label>
            <button type="submit">Add academic year</button>
          </form>
        </section>
      )}
    </main>
  );
}
