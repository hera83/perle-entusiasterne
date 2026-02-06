-- Tilføj foreign key fra bead_patterns.user_id til profiles.user_id
-- Dette muliggør join mellem bead_patterns og profiles i Supabase queries

ALTER TABLE public.bead_patterns
ADD CONSTRAINT bead_patterns_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id);

-- Opdater RLS policy på profiles så alle kan se display_name (for galleri)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Anyone can view profile display names"
ON public.profiles
FOR SELECT
USING (true);