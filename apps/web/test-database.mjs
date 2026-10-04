import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../..", import.meta.url));
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
`);
for (const filename of [
  "202609270001_phase1_core.sql",
  "202609270004_fix_rls_helper_execute.sql",
  "202609280001_learning_loop.sql",
  "20261003132330_learning_tree.sql",
  "20261004032602_student_onboarding.sql",
  "20261004035656_schedules_exam_prep.sql",
]) {
  await db.exec(
    fs
      .readFileSync(`${root}/supabase/migrations/${filename}`, "utf8")
      .replace("create extension if not exists pgcrypto;", ""),
  );
  console.log("Migration OK:", filename);
}
await db.exec(`grant select,insert,update,delete on all tables in schema public to authenticated;
insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
set role authenticated; set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';`);
const f = (
  await db.query(`select public.create_family_with_parent('Test family') id`)
).rows[0].id;
const student = (
  await db.query(
    `insert into students(family_id,display_name) values($1,'Test learner') returning id`,
    [f],
  )
).rows[0].id;
const y = (
  await db.query(
    `insert into academic_years(family_id,student_id,label,start_date,end_date,grade_level) values($1,$2,'2026','2026-04-01','2027-03-31',4) returning id`,
    [f, student],
  )
).rows[0].id;
const s = (
  await db.query(
    `insert into subjects(family_id,academic_year_id,name) values($1,$2,'Science') returning id`,
    [f, y],
  )
).rows[0].id;
const b = (
  await db.query(
    `insert into books(family_id,subject_id,title) values($1,$2,'Book') returning id`,
    [f, s],
  )
).rows[0].id;
const c = (
  await db.query(
    `insert into chapters(family_id,book_id,title,sequence) values($1,$2,'Plants',1) returning id`,
    [f, b],
  )
).rows[0].id;
const t = (
  await db.query(
    `insert into chat_threads(family_id,student_id,title,created_by) values($1,$2,'Plant questions',auth.uid()) returning id`,
    [f, student],
  )
).rows[0].id;
await db.query(
  `insert into learning_contents(family_id,student_id,academic_year_id,subject_id,chapter_id,thread_id,title,content,created_by) values($1,$2,$3,$4,$5,$6,'Plants','## Plants',auth.uid())`,
  [f, student, y, s, c, t],
);
const meta = {
  family_id: f,
  student_id: student,
  academic_year_id: y,
  subject_id: s,
  chapter_id: c,
  thread_id: t,
  title: "Plants test",
  difficulty: "easy",
};
const q = {
  question_type: "mcq",
  prompt: "Which?",
  options: ["a", "b", "c", "d"],
  marks: 1,
  difficulty: "easy",
  concept: "Plants",
  section_name: "A",
  answer_key: "a",
  explanation: "Because",
};
const a = (
  await db.query(
    `select save_generated_assessment($1::jsonb,$2::jsonb,$3::uuid[]) a`,
    [JSON.stringify(meta), JSON.stringify([q]), [c]],
  )
).rows[0].a;
const qid = (
  await db.query(`select id from assessment_questions where assessment_id=$1`, [
    a.id,
  ])
).rows[0].id;
const result = (
  await db.query(`select save_graded_attempt($1::jsonb,$2::jsonb) a`, [
    JSON.stringify({
      assessment_id: a.id,
      score: 1,
      max_score: 1,
      overall_feedback: "Correct",
    }),
    JSON.stringify([
      { question_id: qid, answer: "a", awarded_marks: 1, feedback: "Correct" },
    ]),
  ])
).rows[0].a;
if (Number(result.score) !== 1) throw Error("score mismatch");
const before = (await db.query(`select count(*) n from assessments`)).rows[0].n;
try {
  await db.query(
    `select save_generated_assessment($1::jsonb,$2::jsonb,$3::uuid[])`,
    [JSON.stringify(meta), JSON.stringify([q, { ...q, marks: -1 }]), [c]],
  );
  throw Error("invalid marks accepted");
} catch (e) {
  if (e.message === "invalid marks accepted") throw e;
}
if ((await db.query(`select count(*) n from assessments`)).rows[0].n !== before)
  throw Error("partial test persisted");
await db.exec(
  `set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';`,
);
for (const table of [
  "chat_threads",
  "learning_contents",
  "assessment_chapters",
])
  if ((await db.query(`select count(*) n from ${table}`)).rows[0].n !== 0)
    throw Error("Cross-family read: " + table);
await db.exec(`set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';`);
const sibling = (await db.query(`select onboard_student($1::jsonb) child`, [JSON.stringify({family_id:f, display_name:"Sibling"})])).rows[0].child;
const onboarded = (await db.query(`select onboard_student($1::jsonb) child`, [JSON.stringify({family_id:f, display_name:"New child", board:"CBSE", school_name:"School", academic_year:{family_id:f,label:"2026-27",start_date:"2026-04-01",end_date:"2027-03-31",grade_level:4},subjects:[{name:"English",language_level:1},{name:"Hindi",language_level:2},{name:"Telugu",language_level:3},{name:"Mathematics",language_level:null}]})])).rows[0].child;
if (onboarded.board !== "CBSE") throw Error("board not saved");
const languages = (await db.query(`select language_level from subjects join academic_years y on y.id=academic_year_id where y.student_id=$1 and language_level is not null`, [onboarded.id])).rows;
if (languages.length !== 3) throw Error("languages not saved");
const count = (await db.query(`select count(*) n from students`)).rows[0].n;
try {
  await db.query(`select onboard_student($1::jsonb)`, [JSON.stringify({family_id:f,display_name:"Bad profile",academic_year:{family_id:f,label:"2026",start_date:"2026-04-01",end_date:"2027-03-31",grade_level:4},subjects:[{name:"English",language_level:1},{name:"Hindi",language_level:1}]})]);
  throw Error("duplicate level accepted");
} catch(e) { if (e.message === "duplicate level accepted") throw e; }
if ((await db.query(`select count(*) n from students`)).rows[0].n !== count) throw Error("partial student persisted");
await db.exec(`set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';`);
try { await db.query(`select delete_student_data($1,'Test learner')`,[student]); throw Error("cross-family delete accepted"); } catch(e) { if (e.message === "cross-family delete accepted") throw e; }
await db.exec(`set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';`);
try { await db.query(`select delete_student_data($1,'wrong name')`,[student]); throw Error("wrong confirmation accepted"); } catch(e) { if (e.message === "wrong confirmation accepted") throw e; }
await db.query(`insert into ai_usage_events(family_id,student_id,feature,model,created_by) values($1,$2,'test','model',auth.uid())`,[f,student]);
await db.query(`select delete_student_data($1,'Test learner')`,[student]);
for (const table of ["learning_contents","assessment_chapters","assessment_answers","assessment_questions","assessment_attempts","assessments","chat_threads","books","chapters","ai_usage_events"])
  if ((await db.query(`select count(*) n from ${table}`)).rows[0].n !== 0) throw Error("Deletion left data: "+table);
if ((await db.query(`select id from students where id=$1`,[sibling.id])).rows.length !== 1) throw Error("sibling deleted");
await db.close();
console.log(
  "PASS: lesson context, atomic test/result writes, rollback on failure, cross-family RLS",
);
