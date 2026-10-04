import { apiJson } from "./api";
import { createSupabaseBrowserClient } from "./supabase-browser";
import type { Material, LearningTree } from "./types";
export type Topic = {
  id: string;
  chapter_id: string;
  title: string;
  sequence: number;
  completed_at: string | null;
};
export type Schedule = {
  id: string;
  title: string;
  kind: string;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  recurrence: string;
  weekdays: number[];
  timezone: string;
  paper_id: string | null;
};
export type Exam = { id: string; title: string; academic_year_id: string };
export type Paper = {
  id: string;
  exam_id: string;
  subject_id: string;
  exam_date: string | null;
  start_time: string | null;
};
export type Syllabus = {
  id: string;
  paper_id: string;
  chapter_id: string;
  topic_id: string | null;
};
export type PlanningData = LearningTree & {
  topics: Topic[];
  student_exams: Exam[];
  exam_papers: Paper[];
  exam_syllabus: Syllabus[];
  student_schedules: Schedule[];
};
export type Plan = {
  answer: string;
  events: Array<Omit<Schedule, "id" | "paper_id">>;
  exams: Array<{
    title: string;
    papers: Array<{
      subject: string;
      exam_date: string | null;
      start_time: string | null;
      chapters: Array<{ title: string; topics: string[] }>;
    }>;
  }>;
  books: Array<{
    title: string;
    subject: string;
    material_id: string | null;
    index_version?: number | null;
    chapters: Array<{ title: string; topics: string[]; source_node_id?: string | null }>;
  }>;
  progress: Array<{
    chapter_id: string | null;
    topic_id: string | null;
    completed: boolean;
  }>;
};
export const emptyPlan = (): Plan => ({
  answer: "",
  events: [],
  exams: [],
  books: [],
  progress: [],
});
export const postJson = <T>(path: string, body: unknown) =>
  apiJson<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export async function uploadStudentFile(
  file: File,
  context: {
    familyId: string;
    studentId: string;
    academicYearId?: string;
    subjectId?: string;
    chapterId?: string;
  },
) {
  if (file.size > 100_000_000) throw Error("Keep documents below 100 MB.");
  const id = crypto.randomUUID();
  const storagePath = `${context.familyId}/${context.studentId}/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage
    .from("learning-materials")
    .upload(storagePath, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
  if (error) throw Error(error.message);
  return postJson<Material>("/v1/materials/register", {
    id,
    family_id: context.familyId,
    student_id: context.studentId,
    academic_year_id: context.academicYearId || null,
    subject_id: context.subjectId || null,
    chapter_id: context.chapterId || null,
    title: file.name.replace(/\.[^.]+$/, ""),
    file_name: file.name,
    storage_path: storagePath,
    mime_type: file.type || null,
    size_bytes: file.size,
  });
}
