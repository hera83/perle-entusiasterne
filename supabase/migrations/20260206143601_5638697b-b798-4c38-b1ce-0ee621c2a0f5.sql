CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSON;
BEGIN
  -- Only admins may call this
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT json_build_object(
    'total_patterns', (SELECT count(*) FROM bead_patterns),
    'public_patterns', (SELECT count(*) FROM bead_patterns WHERE is_public = true),
    'private_patterns', (SELECT count(*) FROM bead_patterns WHERE is_public = false),
    'total_categories', (SELECT count(*) FROM categories),
    'total_users', (SELECT count(*) FROM profiles),
    'started_patterns', (SELECT count(*) FROM user_progress)
  ) INTO result;

  RETURN result;
END;
$$;