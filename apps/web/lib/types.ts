export type Membership = {
  family_id: string;
  role: "parent" | "child";
  families: { id: string; name: string } | null;
};

export type Student = {
  id: string;
  family_id: string;
  display_name: string;
  date_of_birth: string | null;
};

export type AcademicYear = {
  id: string;
  family_id: string;
  student_id: string;
  label: string;
  start_date: string;
  end_date: string;
  grade_level: number;
};

export type Subject = {
  id: string;
  family_id: string;
  academic_year_id: string;
  name: string;
};

export type Book = {
  id: string;
  family_id: string;
  subject_id: string;
  title: string;
  publisher: string | null;
  edition: string | null;
};

export type Chapter = {
  id: string;
  family_id: string;
  book_id: string;
  title: string;
  sequence: number;
};

export type Material = {
  id: string;
  title: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  status: "processing" | "ready" | "failed";
  error_message: string | null;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type Assessment = {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  question_count: number;
  total_marks: number;
  created_at: string;
};

export type AssessmentQuestion = {
  id: string;
  sequence: number;
  question_type: "mcq" | "short" | "long";
  prompt: string;
  options: string[];
  marks: number;
  difficulty: "easy" | "medium" | "hard";
  concept: string | null;
};

export type AssessmentDetail = {
  assessment: Assessment;
  questions: AssessmentQuestion[];
};

export type GradedAnswer = {
  question_id: string;
  answer: string;
  awarded_marks: number;
  feedback: string | null;
};

export type GradeResult = {
  score: number;
  max_score: number;
  percentage: number;
  overall_feedback: string;
  answers: GradedAnswer[];
};
