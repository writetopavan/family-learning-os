import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;`,
);
const root = new URL("../../supabase/migrations/", import.meta.url);
for (const name of fs
  .readdirSync(root)
  .filter((n) => n.endsWith(".sql") && !n.includes("storage"))
  .sort())
  await db.exec(
    fs
      .readFileSync(new URL(name, root), "utf8")
      .replace("create extension if not exists pgcrypto;", ""),
  );
await db.exec(
  `grant select,insert,update,delete on all tables in schema public to authenticated;insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');set role authenticated;set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';`,
);
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const f = (await one(`select create_family_with_parent('Planning test') id`))
  .id;
const student = (
  await one(
    `insert into students(family_id,display_name) values($1,'Learner') returning id`,
    [f],
  )
).id;
const sibling = (
  await one(
    `insert into students(family_id,display_name) values($1,'Sibling') returning id`,
    [f],
  )
).id;
const y = (
  await one(
    `insert into academic_years(family_id,student_id,label,start_date,end_date,grade_level) values($1,$2,'2026','2026-04-01','2027-03-31',4) returning id`,
    [f, student],
  )
).id;
const s = (
  await one(
    `insert into subjects(family_id,academic_year_id,name) values($1,$2,'Science') returning id`,
    [f, y],
  )
).id;
const base = () => ({
  answer: "",
  books: [],
  exams: [],
  events: [],
  progress: [],
});
const save = async (plan, child = student) =>
  one(`select save_student_plan($1,$2,$3::jsonb) result`, [
    child,
    y,
    JSON.stringify(plan),
  ]);
const plan = base();
plan.books = [
  {
    subject: "Science",
    title: "Science Book",
    material_id: null,
    chapters: [{ title: "Plants", topics: ["Photosynthesis", "Roots"] }],
  },
];
plan.exams = [
  {
    title: "Midterm",
    papers: [
      {
        subject: "Science",
        exam_date: "2026-10-20",
        start_time: "09:00",
        chapters: [{ title: "Plants", topics: ["Photosynthesis"] }],
      },
    ],
  },
];
plan.events = [
  {
    title: "Study",
    kind: "study",
    start_date: "2026-10-04",
    end_date: null,
    start_time: "17:00",
    end_time: "18:00",
    recurrence: "weekly",
    weekdays: [1, 3, 5],
    timezone: "Asia/Kolkata",
  },
];
await save(plan);
await save(plan);
assert.equal(
  Number((await one("select count(*) n from chapters")).n),
  1,
  "shared chapter reused",
);
assert.equal(Number((await one("select count(*) n from topics")).n), 2);
assert.equal(Number((await one("select count(*) n from exam_syllabus")).n), 1);
assert.equal(
  Number((await one("select count(*) n from student_schedules")).n),
  2,
  "retry does not duplicate schedules",
);
const chapter = (await one("select id from chapters")).id;
const topic = (await one(`select id from topics where title='Photosynthesis'`))
  .id;
const progress = base();
progress.progress = [{ chapter_id: chapter, topic_id: null, completed: true }];
await save(progress);
assert.ok((await one("select completed_at from chapters")).completed_at);
assert.equal(
  Number(
    (await one("select count(*) n from topics where completed_at is not null"))
      .n,
  ),
  2,
);
progress.progress = [{ chapter_id: null, topic_id: topic, completed: false }];
await save(progress);
assert.equal(
  (await one("select completed_at from chapters")).completed_at,
  null,
  "topic reopening reopens chapter",
);
const invalid = base();
invalid.books = [
  {
    subject: "Science",
    title: "Rollback book",
    chapters: [{ title: "Rollback chapter", topics: [] }],
  },
];
invalid.exams = [
  {
    title: "Bad exam",
    papers: [
      { subject: "Unknown", exam_date: null, start_time: null, chapters: [] },
    ],
  },
];
await assert.rejects(save(invalid));
assert.equal(
  Number(
    (await one(`select count(*) n from books where title='Rollback book'`)).n,
  ),
  0,
  "all writes rollback",
);
await assert.rejects(save(progress, sibling), "sibling year rejected");
const paper = (await one("select id from exam_papers")).id;
await assert.rejects(
  db.query(
    `insert into student_schedules(family_id,student_id,title,kind,start_date,paper_id) values($1,$2,'Wrong','exam','2026-10-20',$3)`,
    [f, sibling, paper],
  ),
  "direct mismatched links rejected",
);
const amended = base();
amended.exams = [
  {
    ...plan.exams[0],
    papers: [{ ...plan.exams[0].papers[0], exam_date: "2026-10-21" }],
  },
];
await save(amended);
assert.equal(
  (
    await one(
      `select start_date::text as schedule_date from student_schedules where paper_id=$1`,
      [paper],
    )
  ).schedule_date,
  "2026-10-21",
  "exam date synchronizes",
);
// Cross-family access, including direct table reads and RPC writes.
await db.exec(
  `set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';`,
);
for (const table of [
  "student_exams",
  "exam_papers",
  "exam_syllabus",
  "student_schedules",
  "topics",
])
  assert.equal(
    Number((await one(`select count(*) n from ${table}`)).n),
    0,
    table + " RLS",
  );
await assert.rejects(save(plan));
await db.exec(
  `set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';`,
);
// Student deletion also clears planning masters without deleting sibling.
await db.query(`select delete_student_data($1,'Learner')`, [student]);
for (const table of [
  "student_exams",
  "exam_papers",
  "exam_syllabus",
  "student_schedules",
  "topics",
])
  assert.equal(
    Number((await one(`select count(*) n from ${table}`)).n),
    0,
    table + " deletion",
  );
assert.equal(
  (await db.query("select id from students where id=$1", [sibling])).rows
    .length,
  1,
);
await db.close();
console.log(
  "PASS: shared curriculum, repeat-safe planning, completion/reopen, date synchronization, atomic rollback, student scoping, RLS and deletion",
);
