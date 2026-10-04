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

const material = (await one(`insert into learning_materials(id,family_id,student_id,academic_year_id,subject_id,title,file_name,storage_path,size_bytes,created_by,index_backend) values(gen_random_uuid(),$1,$2,$3,$4,'Science','science.pdf','private/science.pdf',10,auth.uid(),'pageindex') returning id`,[f,student,y,s])).id;
const queue = async (force = false) => (await one('select queue_document_index($1,$2) j',[material,force])).j;
const claim = async () => (await one('select claim_document_index($1) j',[material])).j;
const checkpoint = async (job, payload) => (await one('select checkpoint_document_index($1,$2,$3::jsonb) j',[material,job.lease_id,JSON.stringify(payload)])).j;
let job = await queue();
assert.equal(job.status,'queued');
job = await claim();
assert.equal(job.status,'running');
assert.equal(await claim(),null,'Concurrent requests cannot claim the same active job');
await assert.rejects(()=>one('select checkpoint_document_index($1,gen_random_uuid(),$2::jsonb)',[material,'{}']));
const tree=[{node_id:'chapter-1',title:'Plants',start_index:1,end_index:2,nodes:[{node_id:'topic-1',title:'Leaves',start_index:1,end_index:1}]}];
job = await checkpoint(job,{page_count:2,tree,contents_verified:true,content_hash:'sha256',pages:[{page_number:1,text:'Plants',origin:'text'},{page_number:2,text:'',origin:'pending'}]});
assert.equal(job.status,'queued');assert.equal(job.completed_pages,1);
job=await claim();
job=await checkpoint(job,{error_message:'Transient OCR failure'});
assert.equal(job.status,'failed');
job=await queue();
assert.equal(job.completed_pages,1,'Retry preserves completed pages');assert.equal(job.version,1);
job=await claim();
job=await checkpoint(job,{pages:[{page_number:2,text:'Leaves',origin:'ocr'}]});
assert.equal(job.status,'ready');assert.equal(job.completed_pages,2);
assert.equal((await one('select status from learning_materials where id=$1',[material])).status,'ready','Material status and checkpoint commit atomically');
assert.equal((await queue()).version,1,'Repeated queue is idempotent');
const plan={answer:'',books:[{subject:'Science',title:'Science',material_id:material,index_version:1,chapters:[{title:'Plants',topics:['Leaves'],source_node_id:'chapter-1'}]}],events:[],exams:[],progress:[]};
await one('select save_student_plan($1,$2,$3::jsonb)',[student,y,JSON.stringify(plan)]);
const linked=await one('select source_material_id,source_node_id,source_index_version from chapters where title=$1',['Plants']);
assert.equal(linked.source_material_id,material);assert.equal(linked.source_node_id,'chapter-1');assert.equal(linked.source_index_version,1);
assert.equal((await one('select document_node($1,$2) n',[material,'topic-1'])).n.title,'Leaves');
job=await queue(true);assert.equal(job.version,2);assert.equal(job.completed_pages,0);
await assert.rejects(()=>one('select save_student_plan($1,$2,$3::jsonb)',[student,y,JSON.stringify({...plan,books:[{...plan.books[0],title:'Stale book'}]})]));
assert.equal((await one("select count(*)::int n from books where title='Stale book'")).n,0,'Invalid source import rolls back all writes');
await db.exec("set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'");
assert.equal((await one('select count(*)::int n from document_indexes')).n,0,'Other families cannot read indexes');
assert.equal((await one('select count(*)::int n from document_pages')).n,0,'Other families cannot read source text');
await assert.rejects(()=>queue());
assert.equal(await claim(),null);
await db.exec("set role anon");
await assert.rejects(()=>one('select * from document_indexes'));
await assert.rejects(()=>one('select * from document_pages'));
await assert.rejects(()=>queue());
await db.exec("set role authenticated;set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'");
await one("select delete_student_data($1,'Learner')",[student]);
assert.equal((await one('select count(*)::int n from document_indexes')).n,0,'Student deletion removes index artifacts');
assert.equal((await one('select count(*)::int n from document_pages')).n,0);
console.log('PASS: indexing leases, partial checkpoints, resume, version binding, atomic import rollback, cross-family RLS, anon denial, deletion');
await db.close();
