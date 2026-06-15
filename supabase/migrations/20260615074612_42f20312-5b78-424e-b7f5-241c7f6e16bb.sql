
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owns_pattern(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pattern_owner(uuid) TO anon, authenticated;
