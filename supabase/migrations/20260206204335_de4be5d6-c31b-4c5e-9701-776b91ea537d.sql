
-- Ny tabel til download-statistik
CREATE TABLE public.pdf_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id uuid NOT NULL REFERENCES bead_patterns(id) ON DELETE CASCADE,
  user_id uuid,
  downloaded_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.pdf_downloads ENABLE ROW LEVEL SECURITY;

-- Alle kan inserte (logget ind eller ej)
CREATE POLICY "Anyone can log downloads"
  ON public.pdf_downloads FOR INSERT
  WITH CHECK (true);

-- Kun admins kan læse
CREATE POLICY "Admins can read downloads"
  ON public.pdf_downloads FOR SELECT
  USING (is_admin(auth.uid()));

-- Opdater admin stats funktionen
CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT json_build_object(
    'total_patterns', (SELECT count(*) FROM bead_patterns),
    'public_patterns', (SELECT count(*) FROM bead_patterns WHERE is_public = true),
    'private_patterns', (SELECT count(*) FROM bead_patterns WHERE is_public = false),
    'total_categories', (SELECT count(*) FROM categories),
    'total_users', (SELECT count(*) FROM profiles),
    'started_patterns', (SELECT count(*) FROM user_progress),
    'total_downloads', (SELECT count(*) FROM pdf_downloads)
  ) INTO result;

  RETURN result;
END;
$$;
