-- Create function to check if any users exist (bypasses RLS)
CREATE OR REPLACE FUNCTION public.has_any_users()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles);
$$;

-- Drop the admin-only insert policy on categories
DROP POLICY IF EXISTS "Admins can insert categories" ON public.categories;

-- Create new policy allowing all authenticated users to insert categories
CREATE POLICY "Authenticated users can insert categories"
  ON public.categories FOR INSERT
  TO authenticated
  WITH CHECK (true);