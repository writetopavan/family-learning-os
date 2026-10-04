-- Validate the chapter being linked, not the optional single-chapter shortcut.
-- Multi-chapter assessments intentionally leave assessments.chapter_id null.
alter policy assessment_chapters_write on public.assessment_chapters
with check (
  exists (
    select 1
    from public.assessments a
    join public.chapters c on c.id = assessment_chapters.chapter_id
    join public.books b on b.id = c.book_id
    where a.id = assessment_chapters.assessment_id
      and a.subject_id = b.subject_id
      and a.family_id = c.family_id
      and public.is_family_parent(a.family_id)
  )
);
