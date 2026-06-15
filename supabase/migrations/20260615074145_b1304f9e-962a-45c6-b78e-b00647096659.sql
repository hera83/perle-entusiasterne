
-- 1. Profiles: restrict sensitive columns via column-level grants
DROP POLICY IF EXISTS "Anyone can view profile display names" ON public.profiles;
CREATE POLICY "Anyone can view profile display info"
  ON public.profiles FOR SELECT
  USING (true);

REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, user_id, display_name, theme_preference, created_at, updated_at)
  ON public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- 2. RPC for current user to read own account status (is_banned, is_deleted, email)
CREATE OR REPLACE FUNCTION public.get_my_account_status()
RETURNS TABLE(is_banned boolean, is_deleted boolean, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.is_banned, p.is_deleted, p.email
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_account_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_account_status() TO authenticated;

-- 3. RPC for admins to list full profile rows
CREATE OR REPLACE FUNCTION public.admin_list_profiles()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT * FROM public.profiles;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles() TO authenticated;

-- 4. Categories: only admins can insert
DROP POLICY IF EXISTS "Authenticated users can insert categories" ON public.categories;
CREATE POLICY "Admins can insert categories"
  ON public.categories FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- 5. pdf_downloads: prevent spoofing user_id
DROP POLICY IF EXISTS "Anyone can log downloads" ON public.pdf_downloads;
CREATE POLICY "Log downloads only as self or anonymous"
  ON public.pdf_downloads FOR INSERT
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- 6. Revoke EXECUTE on internal SECURITY DEFINER helpers from public roles.
-- Triggers and RLS policies invoke these with elevated privileges regardless of EXECUTE grants.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.owns_pattern(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_pattern_owner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_empty_categories() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- has_any_users is called from the login page before sign-in; keep it open.
GRANT EXECUTE ON FUNCTION public.has_any_users() TO anon, authenticated;
-- get_admin_stats already checks admin internally; keep callable by authenticated.
GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;
