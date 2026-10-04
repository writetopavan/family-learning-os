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
  board?: string | null;
  school_name?: string | null;
  school_location?: string | null;
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
  language_level?: number | null;
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
  completed_at?: string | null;
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
  material_ids?: string[];
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
  section_name?: string;
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

export type Thread = { id: string; title: string; created_at: string };
export type Lesson = {id:string; title:string; content:string; academic_year_id:string;subject_id:string;chapter_id:string|null;thread_id:string|null};
export type Attempt = {id:string;assessment_id:string;score:number;max_score:number;submitted_at:string};
export type TreeAssessment = Assessment & {academic_year_id:string|null;subject_id:string|null;chapter_id:string|null;chapter_ids:string[]};
export type LearningTree = {years:AcademicYear[];subjects:Subject[];books:Book[];chapters:Chapter[];lessons:Lesson[];assessments:TreeAssessment[];attempts:Attempt[]};
