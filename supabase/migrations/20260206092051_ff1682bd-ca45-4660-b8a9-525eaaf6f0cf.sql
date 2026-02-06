-- ========================================
-- PERLE ENTUSIASTERNE - DATABASE SCHEMA
-- ========================================

-- 1. CREATE ENUM FOR USER ROLES
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- 2. CREATE PROFILES TABLE (for user preferences)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT,
  theme_preference TEXT DEFAULT 'system' CHECK (theme_preference IN ('light', 'dark', 'system')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 3. CREATE USER_ROLES TABLE
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (user_id, role)
);

-- 4. CREATE BEAD_COLORS TABLE
CREATE TABLE public.bead_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  hex_color TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 5. CREATE CATEGORIES TABLE
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 6. CREATE BEAD_PATTERNS TABLE
CREATE TABLE public.bead_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  is_public BOOLEAN DEFAULT false NOT NULL,
  plate_width INTEGER NOT NULL DEFAULT 1,
  plate_height INTEGER NOT NULL DEFAULT 1,
  plate_dimension INTEGER NOT NULL DEFAULT 29,
  total_beads INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 7. CREATE BEAD_PLATES TABLE
CREATE TABLE public.bead_plates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID REFERENCES public.bead_patterns(id) ON DELETE CASCADE NOT NULL,
  row_index INTEGER NOT NULL,
  column_index INTEGER NOT NULL,
  beads JSONB DEFAULT '[]'::jsonb NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (pattern_id, row_index, column_index)
);

-- 8. CREATE USER_FAVORITES TABLE
CREATE TABLE public.user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  pattern_id UUID REFERENCES public.bead_patterns(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (user_id, pattern_id)
);

-- 9. CREATE USER_PROGRESS TABLE
CREATE TABLE public.user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_id UUID REFERENCES public.bead_patterns(id) ON DELETE CASCADE NOT NULL,
  completed_plates JSONB DEFAULT '[]'::jsonb NOT NULL,
  current_row INTEGER DEFAULT 1,
  current_plate INTEGER DEFAULT 1,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (user_id, pattern_id)
);

-- 10. CREATE ANNOUNCEMENTS TABLE
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ========================================
-- HELPER FUNCTIONS
-- ========================================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- Function to check if user owns a pattern
CREATE OR REPLACE FUNCTION public.owns_pattern(_user_id UUID, _pattern_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bead_patterns
    WHERE id = _pattern_id
      AND user_id = _user_id
  )
$$;

-- Function to get pattern owner
CREATE OR REPLACE FUNCTION public.get_pattern_owner(_pattern_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id
  FROM public.bead_patterns
  WHERE id = _pattern_id
$$;

-- Update timestamp function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ========================================
-- TRIGGERS FOR UPDATED_AT
-- ========================================

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bead_colors_updated_at
  BEFORE UPDATE ON public.bead_colors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bead_patterns_updated_at
  BEFORE UPDATE ON public.bead_patterns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bead_plates_updated_at
  BEFORE UPDATE ON public.bead_plates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========================================
-- ENABLE ROW LEVEL SECURITY
-- ========================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bead_colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bead_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bead_plates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- ========================================
-- RLS POLICIES FOR PROFILES
-- ========================================

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE
  USING (public.is_admin(auth.uid()));

-- ========================================
-- RLS POLICIES FOR USER_ROLES
-- ========================================

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE
  USING (public.is_admin(auth.uid()));

-- ========================================
-- RLS POLICIES FOR BEAD_COLORS
-- ========================================

CREATE POLICY "Anyone can view bead colors"
  ON public.bead_colors FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert bead colors"
  ON public.bead_colors FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update bead colors"
  ON public.bead_colors FOR UPDATE
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete bead colors"
  ON public.bead_colors FOR DELETE
  USING (public.is_admin(auth.uid()));

-- ========================================
-- RLS POLICIES FOR CATEGORIES
-- ========================================

CREATE POLICY "Anyone can view categories"
  ON public.categories FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert categories"
  ON public.categories FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update categories"
  ON public.categories FOR UPDATE
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete categories"
  ON public.categories FOR DELETE
  USING (public.is_admin(auth.uid()));

-- ========================================
-- RLS POLICIES FOR BEAD_PATTERNS
-- ========================================

CREATE POLICY "Anyone can view public patterns"
  ON public.bead_patterns FOR SELECT
  USING (is_public = true OR auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can insert their own patterns"
  ON public.bead_patterns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own patterns or admins can update all"
  ON public.bead_patterns FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can delete their own patterns or admins can delete all"
  ON public.bead_patterns FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- ========================================
-- RLS POLICIES FOR BEAD_PLATES
-- ========================================

CREATE POLICY "Users can view plates of accessible patterns"
  ON public.bead_plates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bead_patterns
      WHERE id = bead_plates.pattern_id
        AND (is_public = true OR user_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

CREATE POLICY "Users can insert plates for their own patterns"
  ON public.bead_plates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bead_patterns
      WHERE id = pattern_id AND user_id = auth.uid()
    ) OR public.is_admin(auth.uid())
  );

CREATE POLICY "Users can update plates of their own patterns"
  ON public.bead_plates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.bead_patterns
      WHERE id = bead_plates.pattern_id AND user_id = auth.uid()
    ) OR public.is_admin(auth.uid())
  );

CREATE POLICY "Users can delete plates of their own patterns"
  ON public.bead_plates FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.bead_patterns
      WHERE id = bead_plates.pattern_id AND user_id = auth.uid()
    ) OR public.is_admin(auth.uid())
  );

-- ========================================
-- RLS POLICIES FOR USER_FAVORITES
-- ========================================

CREATE POLICY "Users can view their own favorites"
  ON public.user_favorites FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can insert their own favorites"
  ON public.user_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own favorites"
  ON public.user_favorites FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- ========================================
-- RLS POLICIES FOR USER_PROGRESS
-- ========================================

CREATE POLICY "Users can view their own progress"
  ON public.user_progress FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can insert their own progress"
  ON public.user_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own progress"
  ON public.user_progress FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can delete their own progress"
  ON public.user_progress FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- ========================================
-- RLS POLICIES FOR ANNOUNCEMENTS
-- ========================================

CREATE POLICY "Anyone can view active announcements within date range"
  ON public.announcements FOR SELECT
  USING (
    (is_active = true AND now() BETWEEN start_date AND end_date)
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Admins can insert announcements"
  ON public.announcements FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update announcements"
  ON public.announcements FOR UPDATE
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete announcements"
  ON public.announcements FOR DELETE
  USING (public.is_admin(auth.uid()));

-- ========================================
-- TRIGGER TO CREATE PROFILE ON SIGNUP
-- ========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========================================
-- INSERT DEFAULT BEAD COLORS (HAMA COLORS)
-- ========================================

INSERT INTO public.bead_colors (code, name, hex_color, is_active) VALUES
  ('01', 'Hvid', '#FFFFFF', true),
  ('02', 'Creme', '#F5F5DC', true),
  ('03', 'Gul', '#FFFF00', true),
  ('04', 'Orange', '#FFA500', true),
  ('05', 'Rød', '#FF0000', true),
  ('06', 'Pink', '#FFC0CB', true),
  ('07', 'Lilla', '#800080', true),
  ('08', 'Blå', '#0000FF', true),
  ('09', 'Lyseblå', '#ADD8E6', true),
  ('10', 'Grøn', '#008000', true),
  ('11', 'Lysegrøn', '#90EE90', true),
  ('12', 'Brun', '#8B4513', true),
  ('13', 'Grå', '#808080', true),
  ('14', 'Sort', '#000000', true),
  ('15', 'Hudfarve', '#FFDAB9', true),
  ('17', 'Transparent', '#FFFFFF', true),
  ('18', 'Transparent Rød', '#FF6B6B', true),
  ('19', 'Transparent Gul', '#FFFF99', true),
  ('20', 'Transparent Grøn', '#98FB98', true),
  ('21', 'Transparent Blå', '#87CEEB', true)
ON CONFLICT (code) DO NOTHING;