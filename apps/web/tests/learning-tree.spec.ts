import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const families = [
  {
    family_id: "family-a",
    role: "parent",
    families: { id: "family-a", name: "Singh Family" },
  },
  {
    family_id: "family-b",
    role: "parent",
    families: { id: "family-b", name: "Other Family" },
  },
];
const students = [
  {
    id: "advik",
    family_id: "family-a",
    display_name: "Advik",
    date_of_birth: null,
  },
  {
    id: "shanvi",
    family_id: "family-a",
    display_name: "Shanvi",
    date_of_birth: null,
  },
];
function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ sub: "parent", exp, role: "authenticated" })).toString("base64url")}.test`;
  return {
    access_token: token,
    refresh_token: "test-refresh",
    expires_at: exp,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: "parent",
      email: "parent@example.test",
      aud: "authenticated",
      app_metadata: {},
      user_metadata: {},
    },
  };
}
async function authenticate(context: BrowserContext) {
  await context.addCookies([
    {
      name: "sb-auth-auth-token",
      value: `base64-${Buffer.from(JSON.stringify(session())).toString("base64url")}`,
      domain: "localhost",
      path: "/",
    },
  ]);
}
const year = {
  id: "year",
  family_id: "family-a",
  student_id: "advik",
  label: "2026–27",
  grade_level: 8,
  start_date: "2026-04-01",
  end_date: "2027-03-31",
};
const subject = {
  id: "science",
  family_id: "family-a",
  academic_year_id: "year",
  name: "Science",
};
const book = {
  id: "book",
  family_id: "family-a",
  subject_id: "science",
  title: "Science book",
};
const chapter = {
  id: "plants",
  family_id: "family-a",
  book_id: "book",
  title: "Plants",
  sequence: 1,
};
const lesson = {
  id: "lesson",
  academic_year_id: "year",
  subject_id: "science",
  chapter_id: "plants",
  title: "How plants grow",
  content:
    "## Photosynthesis\n\n**Sunlight** helps plants.\n\n| Input | Output |\n| --- | --- |\n| Light | Food |\n\n$x^2$",
};
const assessment = {
  id: "test",
  academic_year_id: "year",
  subject_id: "science",
  chapter_id: "plants",
  chapter_ids: ["plants"],
  title: "Plants test",
  question_count: 3,
  total_marks: 3,
  difficulty: "easy",
};
const attempt = {
  id: "attempt",
  assessment_id: "test",
  score: 2,
  max_score: 3,
  submitted_at: "2026-10-03T10:00:00Z",
};
async function setup(page: Page, context: BrowserContext) {
  await authenticate(context);
  await page.route("http://127.0.0.1:4100/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const map: Record<string, unknown> = {
      "/v1/families": families,
      "/v1/families/family-a/students": students,
      "/v1/students/advik/academic-years": [year],
      "/v1/academic-years/year/subjects": [subject],
      "/v1/subjects/science/books": [book],
      "/v1/books/book/chapters": [chapter],
      "/v1/students/advik/tree": {
        years: [year],
        subjects: [subject],
        books: [book],
        chapters: [chapter],
        lessons: [lesson],
        assessments: [assessment],
        attempts: [attempt],
      },
      "/v1/students/advik/assessments": [assessment],
      "/v1/assessments/test": {
        assessment,
        questions: [1, 2, 3].map((n) => ({
          id: `q${n}`,
          sequence: n,
          question_type: "mcq",
          prompt: `Question ${n}`,
          options: ["A", "B", "C", "D"],
          marks: 1,
          section_name: "MCQs",
        })),
      },
      "/v1/assessments/test/attempts": [attempt],
      "/v1/attempts/attempt": {
        attempt,
        answers: [
          {
            question_id: "q1",
            answer: "A",
            awarded_marks: 1,
            feedback: "Correct",
          },
        ],
        score: 2,
        max_score: 3,
        percentage: 66.7,
        overall_feedback: "Good work",
      },
      "/v1/assessments/test/answer-key": [
        { question_id: "q1", answer_key: "A", explanation: "Because" },
      ],
      "/v1/students/advik/threads": [
        { id: "thread", title: "Plant discussion" },
      ],
      "/v1/students/advik/chat": [
        {
          id: "msg",
          role: "assistant",
          content: "## A remembered explanation",
        },
      ],
    };
    await route.fulfill({ json: map[path] ?? [] });
  });
  await page.goto("/dashboard");
  await page
    .getByRole("button", { name: "Advik Open learning workspace" })
    .click();
}
test("tree reopens Markdown lessons and the selected saved result", async ({
  page,
  context,
}) => {
  await setup(page, context);
  await page
    .getByRole("button", { name: "Learning tree", exact: false })
    .first()
    .click();
  await page.getByRole("button", { name: /1. Plants/ }).click();
  await page.getByRole("button", { name: /How plants grow/ }).click();
  await expect(
    page.getByRole("heading", { name: "Photosynthesis" }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.locator(".katex")).toBeVisible();
  await page.getByRole("button", { name: "Saved content" }).click();
  await page.getByRole("button", { name: /Result: 2/ }).click();
  await expect(page.getByText("66.7%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show answer key (parent)" }).click();
  await expect(page.getByText("Model answer", { exact: true })).toBeVisible();
});
test("blueprint uses selected chapters and exact marks", async ({
  page,
  context,
}) => {
  await setup(page, context);
  await page
    .getByRole("button", { name: "Tests", exact: false })
    .first()
    .click();
  await page.getByLabel("Set sections and exact marks").check();
  await expect(
    page.getByText("10 questions · 21 marks", { exact: true }),
  ).toBeVisible();
  const request = page.waitForRequest((r) =>
    r.url().endsWith("/v1/assessments/generate"),
  );
  await page.route("**/v1/assessments/generate", (route) =>
    route.fulfill({ json: assessment }),
  );
  await page
    .getByRole("button", { name: "Generate test", exact: true })
    .click();
  const body = (await request).postDataJSON();
  expect(body.chapter_ids).toEqual(["plants"]);
  expect(body.sections).toHaveLength(3);
  expect(body.subject_id).toBe("science");
});
test("edit subject saves and blocked delete shows explanation", async ({
  page,
  context,
}) => {
  await setup(page, context);
  await page
    .getByRole("button", { name: "Setup", exact: false })
    .first()
    .click();
  const card = page
    .locator("article")
    .filter({ has: page.getByText("Subjects", { exact: true }) });
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Subject name", { exact: true })
    .fill("Natural Science");
  await page.route("**/v1/curriculum/subjects/science", async (route) => {
    if (route.request().method() === "PATCH") {
      expect(route.request().postDataJSON()).toEqual({
        name: "Natural Science",
        language_level: null,
      });
      return route.fulfill({ json: { ...subject, name: "Natural Science" } });
    }
    return route.fulfill({
      status: 409,
      json: {
        detail: "This item contains saved learning. History is preserved.",
      },
    });
  });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(
    0,
  );
  await card.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(
    page.getByText("This item contains saved learning. History is preserved."),
  ).toBeVisible();
});
test("chat threads reload and generated lessons retain selected curriculum", async ({
  page,
  context,
}) => {
  await setup(page, context);
  await page
    .getByRole("button", { name: "Learning tree", exact: false })
    .first()
    .click();
  await page.getByRole("button", { name: /1. Plants/ }).click();
  await page.getByRole("button", { name: "Chat & generate" }).click();
  await expect(
    page.getByRole("heading", { name: "A remembered explanation" }),
  ).toBeVisible();
  await page.getByLabel("Content type").selectOption("lesson");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Explain plant growth");
  let body: Record<string, unknown> = {};
  await page.route("**/v1/lessons/generate", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ json: lesson });
  });
  await page
    .getByRole("button", { name: "Generate lesson", exact: true })
    .click();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
  expect(body).toMatchObject({
    subject_id: "science",
    chapter_id: "plants",
    thread_id: "thread",
    academic_year_id: "year",
  });
  await page.getByRole("button", { name: "Saved content" }).click();
  await expect(
    page.getByRole("button", { name: /How plants grow/ }),
  ).toBeVisible();
});

test("onboarding suggests editable subjects and permits a name-only profile", async ({
  page,
  context,
}) => {
  await setup(page, context);
  await page
    .getByRole("button", { name: "Setup", exact: false })
    .first()
    .click();
  await page.getByLabel("Child name", { exact: true }).fill("New child");
  await page.getByLabel("Board", { exact: true }).selectOption("CBSE");
  await page.getByLabel("Class", { exact: true }).selectOption("4");
  await expect(page.getByLabel("Subject 2", { exact: true })).toHaveValue(
    "Mathematics",
  );
  await page
    .getByRole("button", { name: "Add subject or language", exact: true })
    .click();
  await page.getByLabel("Subject 5", { exact: true }).fill("Hindi");
  await page.getByLabel("Language level 5", { exact: true }).selectOption("2");
  let body: Record<string, any> = {};
  await page.route("**/v1/students", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ json: { id: "new" } });
  });
  await page.getByRole("button", { name: "Add child", exact: true }).click();
  await expect(page.getByLabel("Child name", { exact: true })).toHaveValue("");
  expect(body.board).toBe("CBSE");
  expect(body.academic_year.grade_level).toBe(4);
  expect(body.subjects).toContainEqual({ name: "Hindi", language_level: 2 });
  await page.getByLabel("Child name", { exact: true }).fill("Name only");
  await page.getByRole("button", { name: "Add child", exact: true }).click();
  await expect(page.getByLabel("Child name", { exact: true })).toHaveValue("");
  expect(body.academic_year).toBeNull();
  expect(body.subjects).toEqual([]);
});

test("student deletion requires name confirmation and reloads child selection", async ({
  page,
  context,
}) => {
  await setup(page, context);
  await page
    .getByRole("button", { name: "Setup", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Delete student and data", exact: true })
    .first()
    .click();
  const form = page.getByRole("form", { name: "Confirm student deletion" });
  const button = form.getByRole("button", {
    name: "Permanently delete student",
  });
  await expect(button).toBeDisabled();
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(form).toHaveCount(0);
  await page
    .getByRole("button", { name: "Delete student and data", exact: true })
    .first()
    .click();
  await form.getByRole("textbox").fill("Advik");
  await page.route("**/v1/students/advik", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    expect(route.request().postDataJSON()).toEqual({ confirm_name: "Advik" });
    await route.fulfill({ json: { deleted: "advik" } });
  });
  await page.route("**/v1/families/family-a/students", (route) =>
    route.fulfill({ json: [students[1]] }),
  );
  await button.click();
  await expect(
    page.getByRole("button", { name: "Shanvi Open learning workspace" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Advik Open learning workspace" }),
  ).toHaveCount(0);
});

test("schedule preview saves a daily routine and shows its selected day", async ({
  page,
  context,
}) => {
  await setup(page, context);
  const planning = {
    years: [year],
    subjects: [subject],
    books: [book],
    chapters: [chapter],
    topics: [],
    lessons: [],
    assessments: [],
    attempts: [],
    student_exams: [],
    exam_papers: [],
    exam_syllabus: [],
    student_schedules: [] as unknown[],
  };
  await page.route("**/v1/students/advik/planning", (route) =>
    route.fulfill({ json: planning }),
  );
  await page
    .getByRole("button", { name: "Schedule", exact: false })
    .first()
    .click();
  await page.getByLabel("Schedule date").fill("2026-10-10");
  await page.getByLabel("Activity", { exact: true }).fill("Evening study");
  await page.getByRole("button", { name: "Preview event" }).click();
  await expect(
    page.getByRole("region", { name: "Plan preview" }),
  ).toBeVisible();
  const request = page.waitForRequest((r) =>
    r.url().endsWith("/v1/planning/apply"),
  );
  await page.route("**/v1/planning/apply", (route) => {
    const body = route.request().postDataJSON();
    planning.student_schedules = [
      { ...body.plan.events[0], id: "event", paper_id: null },
    ];
    return route.fulfill({ json: { saved: 1 } });
  });
  await page.getByRole("button", { name: "Save plan" }).click();
  const body = (await request).postDataJSON();
  expect(body.student_id).toBe("advik");
  expect(body.plan.events[0].recurrence).toBe("daily");
  expect(body.plan.events[0].start_date).toBe("2026-10-10");
  await expect(page.getByText("Plan saved.", { exact: true })).toBeVisible();
  await expect(page.locator(".schedule-row").first()).toContainText(
    "Evening study",
  );
});

test("exam prep marks a topic and generates practice linked to the exam", async ({
  page,
  context,
}) => {
  await setup(page, context);
  const planning = {
    years: [year],
    subjects: [subject],
    books: [book],
    chapters: [chapter],
    topics: [
      {
        id: "photosynthesis",
        chapter_id: "plants",
        title: "Photosynthesis",
        sequence: 1,
        completed_at: null as string | null,
      },
    ],
    lessons: [],
    assessments: [],
    attempts: [],
    student_exams: [
      { id: "midterm", title: "Midterm", academic_year_id: "year" },
    ],
    exam_papers: [
      {
        id: "science-paper",
        exam_id: "midterm",
        subject_id: "science",
        exam_date: "2026-10-20",
        start_time: "09:00",
      },
    ],
    exam_syllabus: [
      {
        id: "syllabus",
        paper_id: "science-paper",
        chapter_id: "plants",
        topic_id: "photosynthesis",
      },
    ],
    student_schedules: [],
  };
  await page.route("**/v1/students/advik/planning", (route) =>
    route.fulfill({ json: planning }),
  );
  await page.route("**/v1/planning/apply", (route) => {
    planning.topics[0].completed_at = "2026-10-04T12:00:00Z";
    return route.fulfill({ json: { saved: 1 } });
  });
  await page
    .getByRole("button", { name: "Exam prep", exact: false })
    .first()
    .click();
  await expect(
    page.getByText("Plants / Photosynthesis", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mark completed", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "✓ Completed — reopen" }),
  ).toBeVisible();
  await page.getByLabel("Plants / Photosynthesis").check();
  const req = page.waitForRequest((r) =>
    r.url().endsWith("/v1/assessments/generate"),
  );
  await page.route("**/v1/assessments/generate", (route) =>
    route.fulfill({ json: assessment }),
  );
  await page.getByRole("button", { name: "Practice selected" }).click();
  const body = (await req).postDataJSON();
  expect(body.exam_paper_id).toBe("science-paper");
  expect(body.topic_ids).toEqual(["photosynthesis"]);
  expect(body.chapter_ids).toEqual([]);
  expect(body.subject_id).toBe("science");
  await expect(
    page.getByText("Practice test saved and linked to this exam."),
  ).toBeVisible();
});

test("library shows context and confirms a detected subject before saving", async ({ page, context }) => {
  await setup(page, context);
  const art = { ...subject, id: "art", name: "Art" };
  await page.route("**/v1/academic-years/year/subjects", (route) => route.fulfill({ json: [art, subject] }));
  await page.route("**/v1/subjects/art/books", (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/students/advik/materials", (route) => route.fulfill({ json: [{
    id: "science-pdf", title: "Class 8 Science", file_name: "science-class-8.pdf",
    size_bytes: 33598539, status: "ready", error_message: null,
  }] }));
  await page.reload();
  await page.getByRole("button", { name: "Advik Open learning workspace" }).click();
  await expect(page.getByLabel("Study subject", { exact: true })).toHaveValue("art");
  await page.getByRole("button", { name: "Library", exact: false }).first().click();
  const contextPanel = page.getByRole("region", { name: "Current study context" });
  await expect(contextPanel).toBeVisible();
  await expect(contextPanel).toContainText("Grade 8 · Art");
  let applied = false;
  await page.route("**/v1/planning/interpret", (route) => {
    expect(route.request().postDataJSON().subject_id).toBe("art");
    return route.fulfill({ json: { academic_year_id: "year", plan: {
      answer: "This is Science. Confirm to save under Science.",
      books: [{ title: "Science Textbook Class VIII", subject: "Science", material_id: "science-pdf",
        chapters: [{ title: "Crop Production and Management", topics: ["Agricultural Practices"] }] }],
      exams: [], events: [], progress: [],
    } } });
  });
  await page.route("**/v1/planning/apply", (route) => {
    const body = route.request().postDataJSON();
    expect(body.student_id).toBe("advik");
    expect(body.plan.books[0].subject).toBe("Science");
    expect(body.plan.books[0].material_id).toBe("science-pdf");
    applied = true;
    return route.fulfill({ json: { saved: 1 } });
  });
  await page.getByRole("button", { name: "Extract chapters" }).click();
  await expect(page.getByRole("button", { name: "Confirm and save under Science" })).toBeVisible();
  expect(applied).toBe(false);
  await page.getByRole("button", { name: "Confirm and save under Science" }).click();
  await expect(page.getByLabel("Study subject", { exact: true })).toHaveValue("science");
  expect(applied).toBe(true);
});
