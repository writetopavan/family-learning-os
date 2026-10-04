-- Persistent, tenant-scoped document indexes. Jobs are advanced in leased requests.
alter table public.learning_materials add column index_backend text not null default 'openai' check(index_backend in ('openai','pageindex'));
create table public.document_indexes (
 material_id uuid primary key references public.learning_materials(id) on delete cascade,
 status text not null default 'queued' check(status in ('queued','running','ready','failed')),
 stage text not null default 'parse' check(stage in ('parse','ocr','complete')),
 version integer not null default 1 check(version>0),
 engine text not null default 'pageindex-flash-0.2.10',
 content_hash text,
 tree jsonb not null default '[]'::jsonb check(jsonb_typeof(tree)='array'),
 contents_verified boolean not null default false,
 page_count integer not null default 0 check(page_count between 0 and 1000),
 completed_pages integer not null default 0 check(completed_pages between 0 and page_count),
 error_message text,
 lease_id uuid,
 lease_until timestamptz,
 updated_at timestamptz not null default now()
);
create table public.document_pages (
 material_id uuid not null references public.document_indexes(material_id) on delete cascade,
 page_number integer not null check(page_number between 1 and 1000),
 text text not null default '' check(length(text)<=40000),
 origin text not null check(origin in ('text','ocr','pending','blank')),
 primary key(material_id,page_number)
);
alter table public.document_indexes enable row level security;
alter table public.document_pages enable row level security;
revoke all on public.document_indexes, public.document_pages from anon, authenticated;
grant select,insert,update,delete on public.document_indexes,public.document_pages to authenticated;
create policy index_read on public.document_indexes for select to authenticated using(exists(select 1 from learning_materials m where m.id=material_id and is_family_member(m.family_id)));
create policy index_insert on public.document_indexes for insert to authenticated with check(exists(select 1 from learning_materials m where m.id=material_id and is_family_member(m.family_id)));
create policy index_update on public.document_indexes for update to authenticated using(exists(select 1 from learning_materials m where m.id=material_id and is_family_member(m.family_id))) with check(exists(select 1 from learning_materials m where m.id=material_id and is_family_member(m.family_id)));
create policy index_delete on public.document_indexes for delete to authenticated using(exists(select 1 from learning_materials m where m.id=material_id and is_family_parent(m.family_id)));
create policy page_read on public.document_pages for select to authenticated using(exists(select 1 from learning_materials m where m.id=material_id and is_family_member(m.family_id)));
create policy page_insert on public.document_pages for insert to authenticated with check(exists(select 1 from learning_materials m where m.id=material_id and is_family_member(m.family_id)));
create policy page_update on public.document_pages for update to authenticated using(exists(select 1 from learning_materials m where m.id=material_id and is_family_member(m.family_id))) with check(exists(select 1 from learning_materials m where m.id=material_id and is_family_member(m.family_id)));
create policy page_delete on public.document_pages for delete to authenticated using(exists(select 1 from learning_materials m where m.id=material_id and is_family_member(m.family_id)));

create function queue_document_index(target_material uuid, force_rebuild boolean default false) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare j document_indexes;
begin
 perform 1 from learning_materials where id=target_material for update;
 if not found then raise exception 'Material not found' using errcode='42501'; end if;
 select * into j from document_indexes where material_id=target_material for update;
 if found then
  if j.lease_until>now() then return to_jsonb(j); end if;
  if not force_rebuild and j.status<>'failed' then return to_jsonb(j); end if;
  if not force_rebuild and j.status='failed' then
   update document_indexes set status='queued',error_message=null,lease_id=null,lease_until=null,updated_at=now()
    where material_id=target_material returning * into j;
   update learning_materials set status='processing',index_backend='pageindex',error_message=null where id=target_material;
   return to_jsonb(j);
  end if;
  delete from document_pages where material_id=target_material;
  update document_indexes set status='queued',stage='parse',version=version+1,tree='[]',contents_verified=false,
   page_count=0,completed_pages=0,content_hash=null,error_message=null,lease_id=null,lease_until=null,updated_at=now()
   where material_id=target_material returning * into j;
 else
  insert into document_indexes(material_id) values(target_material) returning * into j;
 end if;
 update learning_materials set status='processing',index_backend='pageindex',error_message=null where id=target_material;
 return to_jsonb(j);
end $$;
create function claim_document_index(target_material uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare j document_indexes;
begin
 update document_indexes set status='running',lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now()
 where material_id=target_material and status in ('queued','running') and (lease_until is null or lease_until<now()) returning * into j;
 if not found then return null; end if;
 return to_jsonb(j);
end $$;
create function checkpoint_document_index(target_material uuid, lease uuid, payload jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare j document_indexes; p jsonb;
begin
 select * into strict j from document_indexes where material_id=target_material and lease_id=lease and lease_until>now() for update;
 if payload ? 'page_count' then
  update document_indexes set page_count=(payload->>'page_count')::int,tree=payload->'tree',
   contents_verified=coalesce((payload->>'contents_verified')::boolean,false),content_hash=payload->>'content_hash',stage='ocr'
   where material_id=target_material;
 end if;
 select * into strict j from document_indexes where material_id=target_material;
 for p in select * from jsonb_array_elements(coalesce(payload->'pages','[]')) loop
  if (p->>'page_number')::int>j.page_count then raise exception 'Page outside document'; end if;
  insert into document_pages(material_id,page_number,text,origin) values(target_material,(p->>'page_number')::int,p->>'text',p->>'origin')
   on conflict(material_id,page_number) do update set text=excluded.text,origin=excluded.origin;
 end loop;
 update document_indexes set completed_pages=(select count(*) from document_pages where material_id=target_material and origin<>'pending'),
  error_message=payload->>'error_message',lease_id=null,lease_until=null,updated_at=now()
  where material_id=target_material returning * into j;
 update document_indexes set status=case when payload ? 'error_message' then 'failed' when j.page_count>0 and j.completed_pages=j.page_count then 'ready' else 'queued' end,
  stage=case when j.page_count>0 and j.completed_pages=j.page_count then 'complete' else stage end
  where material_id=target_material returning * into j;
 update learning_materials set status=case when j.status='ready' then 'ready' when j.status='failed' then 'failed' else 'processing' end,
  index_backend='pageindex',error_message=j.error_message where id=target_material;
 return to_jsonb(j);
end $$;
revoke all on function queue_document_index(uuid,boolean),claim_document_index(uuid),checkpoint_document_index(uuid,uuid,jsonb) from public,anon;
grant execute on function queue_document_index(uuid,boolean),claim_document_index(uuid),checkpoint_document_index(uuid,uuid,jsonb) to authenticated;

-- Source links remain valid only for the corresponding index version.
alter table public.chapters add column source_material_id uuid references learning_materials(id) on delete set null,
 add column source_node_id text, add column source_index_version integer;
create index chapters_source_material on public.chapters(source_material_id);
create function document_node(target_material uuid, target_node text) returns jsonb language sql stable security invoker set search_path=public as $$
 with recursive nodes(n) as (
  select value from document_indexes i cross join lateral jsonb_array_elements(i.tree) where i.material_id=target_material
  union all
  select child.value from nodes cross join lateral jsonb_array_elements(coalesce(nodes.n->'nodes','[]')) child
 ) select n from nodes where n->>'node_id'=target_node limit 1;
$$;
revoke all on function document_node(uuid,text) from public,anon;
grant execute on function document_node(uuid,text) to authenticated;
alter function public.save_student_plan(uuid,uuid,jsonb) rename to save_student_plan_base;
create function public.save_student_plan(target_student uuid,target_year uuid,plan jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare result jsonb; bk jsonb; ch jsonb; mid uuid; idx document_indexes; bid uuid;
begin
 result:=save_student_plan_base(target_student,target_year,plan);
 for bk in select * from jsonb_array_elements(plan->'books') loop
  if bk->>'index_version' is not null then
   mid:=(bk->>'material_id')::uuid;
   select * into strict idx from document_indexes where material_id=mid and status='ready' and version=(bk->>'index_version')::int;
   select book_id into strict bid from learning_materials where id=mid and student_id=target_student;
   for ch in select * from jsonb_array_elements(bk->'chapters') loop
    if ch->>'source_node_id' is null or document_node(mid,ch->>'source_node_id') is null then raise exception 'Invalid chapter source node'; end if;
    update chapters set source_material_id=mid,source_node_id=ch->>'source_node_id',source_index_version=idx.version
     where book_id=bid and lower(title)=lower(ch->>'title');
   end loop;
  end if;
 end loop;
 return result;
end $$;
revoke all on function save_student_plan(uuid,uuid,jsonb) from public,anon;
grant execute on function save_student_plan(uuid,uuid,jsonb) to authenticated;

-- Keep page evidence with generated answers and tests, independent of provider response IDs.
alter table public.chat_messages add column source_references jsonb not null default '[]';
alter table public.assessments add column source_references jsonb not null default '[]';
alter function public.save_generated_assessment(jsonb,jsonb,uuid[]) rename to save_generated_assessment_base;
create function public.save_generated_assessment(meta jsonb, questions jsonb, chapter_ids uuid[]) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
 result:=save_generated_assessment_base(meta,questions,chapter_ids);
 update assessments set source_references=coalesce(meta->'source_references','[]') where id=(result->>'id')::uuid;
 return result || jsonb_build_object('source_references',coalesce(meta->'source_references','[]')); 
end $$;
revoke all on function save_generated_assessment(jsonb,jsonb,uuid[]) from public,anon;
grant execute on function save_generated_assessment(jsonb,jsonb,uuid[]) to authenticated;
