
-- Function to automatically delete empty categories when last pattern is deleted
CREATE OR REPLACE FUNCTION public.cleanup_empty_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.category_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM bead_patterns WHERE category_id = OLD.category_id
    ) THEN
      DELETE FROM categories WHERE id = OLD.category_id;
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

-- Trigger that runs after each pattern deletion
CREATE TRIGGER trigger_cleanup_empty_categories
  AFTER DELETE ON public.bead_patterns
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_empty_categories();
