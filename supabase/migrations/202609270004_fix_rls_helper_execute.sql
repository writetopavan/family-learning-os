-- RLS policies call these helper functions as the authenticated role.
-- They remain SECURITY DEFINER so the membership lookup does not recurse through RLS.
grant execute on function public.is_family_member(uuid) to authenticated;
grant execute on function public.is_family_parent(uuid) to authenticated;
