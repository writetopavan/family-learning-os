export const BOARDS = [
  "CBSE",
  "ICSE",
  "Cambridge",
  "IB",
  "NIOS",
  "Andhra Pradesh State Board",
  "Telangana State Board",
  "Maharashtra State Board",
  "Karnataka State Board",
  "Tamil Nadu State Board",
  "Kerala State Board",
  "Gujarat State Board",
  "Rajasthan State Board",
  "Uttar Pradesh State Board",
  "West Bengal State Board",
  "Other State Board",
  "Other",
];
export type SubjectDraft = { name: string; language_level: number | null };
export function suggestedSubjects(
  board: string,
  grade: number | null,
): SubjectDraft[] {
  if (!board || !grade) return [];
  let names =
    grade <= 5
      ? ["Mathematics", "Environmental Studies", "Computer Studies"]
      : ["Mathematics", "Science", "Social Science", "Computer Studies"];
  if (board === "ICSE" && grade <= 5)
    names = ["Mathematics", "Science", "Social Studies", "Computer Studies"];
  if (board === "ICSE" && grade >= 6)
    names = [
      "Mathematics",
      "Physics",
      "Chemistry",
      "Biology",
      "History & Civics",
      "Geography",
      "Computer Applications",
    ];
  if (board === "Cambridge")
    names =
      grade >= 9
        ? [
            "Mathematics",
            "Physics",
            "Chemistry",
            "Biology",
            "Global Perspectives",
            "Computer Science",
          ]
        : [
            "Mathematics",
            "Science",
            "Global Perspectives",
            "Computing",
            "Art & Design",
            "Physical Education",
          ];
  if (board === "IB")
    names = [
      "Mathematics",
      "Sciences",
      "Individuals and Societies",
      "Design",
      "Arts",
      "Physical and Health Education",
    ];
  return [
    { name: "English", language_level: 1 },
    ...names.map((name) => ({ name, language_level: null })),
  ];
}
export function currentSchoolYear() {
  const now = new Date();
  const start = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  return {
    label: `${start}-${String(start + 1).slice(-2)}`,
    start_date: `${start}-04-01`,
    end_date: `${start + 1}-03-31`,
  };
}
