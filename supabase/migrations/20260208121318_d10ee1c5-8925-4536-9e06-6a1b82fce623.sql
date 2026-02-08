-- Trigger to cleanup empty categories when pattern category is changed via UPDATE
CREATE TRIGGER trigger_cleanup_empty_categories_on_update
  AFTER UPDATE OF category_id ON public.bead_patterns
  FOR EACH ROW
  WHEN (OLD.category_id IS DISTINCT FROM NEW.category_id)
  EXECUTE FUNCTION public.cleanup_empty_categories();