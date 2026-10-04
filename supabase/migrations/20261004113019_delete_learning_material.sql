-- External files are removed by the API before this transactional database cleanup.
create function public.delete_learning_material(target_material uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare
 material learning_materials;
 chapter_ids uuid[];
begin
 select * into strict material from learning_materials where id=target_material for update;
 if not is_family_parent(material.family_id) then
  raise exception 'Only a family parent can delete materials' using errcode='42501';
 end if;
 -- Only remove chapters whose extraction provenance points to this material.
 -- Independently created chapters and chapters imported from other files remain.
 select coalesce(array_agg(id),'{}'::uuid[]) into chapter_ids
 from chapters where source_material_id=target_material;
 update learning_contents set chapter_id=null where chapter_id=any(chapter_ids);
 delete from assessment_chapters where chapter_id=any(chapter_ids);
 delete from chapters where id=any(chapter_ids);
 -- Topics, syllabus links and completion records cascade with their chapter.
 -- Material deletion cascades the leased job, page text and document tree.
 delete from learning_materials where id=target_material;
 if material.book_id is not null
    and not exists(select 1 from chapters where book_id=material.book_id)
    and not exists(select 1 from learning_materials where book_id=material.book_id) then
  delete from books where id=material.book_id;
 end if;
 return jsonb_build_object('deleted',target_material,'deleted_chapters',cardinality(chapter_ids));
end $$;
revoke all on function public.delete_learning_material(uuid) from public,anon;
grant execute on function public.delete_learning_material(uuid) to authenticated;
