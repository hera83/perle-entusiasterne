-- ============================================================
-- Perleplade App - Local Database Initialization
-- This creates the full schema for self-hosted/local mode.
-- ============================================================

-- Auth users table (replaces Supabase auth.users)
CREATE TABLE IF NOT EXISTS auth_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  encrypted_password TEXT NOT NULL,
  raw_user_meta_data JSONB DEFAULT '{}',
  last_sign_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Role enum
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'user');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  display_name TEXT,
  email TEXT,
  theme_preference TEXT DEFAULT 'system',
  is_banned BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User roles
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, role)
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bead patterns
CREATE TABLE IF NOT EXISTS bead_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  is_public BOOLEAN NOT NULL DEFAULT false,
  plate_width INTEGER NOT NULL DEFAULT 1,
  plate_height INTEGER NOT NULL DEFAULT 1,
  plate_dimension INTEGER NOT NULL DEFAULT 29,
  total_beads INTEGER DEFAULT 0,
  share_token UUID,
  thumbnail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bead plates
CREATE TABLE IF NOT EXISTS bead_plates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID NOT NULL REFERENCES bead_patterns(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  column_index INTEGER NOT NULL,
  beads JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bead colors
CREATE TABLE IF NOT EXISTS bead_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  hex_color TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User favorites
CREATE TABLE IF NOT EXISTS user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  pattern_id UUID NOT NULL REFERENCES bead_patterns(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, pattern_id)
);

-- User progress
CREATE TABLE IF NOT EXISTS user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  pattern_id UUID NOT NULL REFERENCES bead_patterns(id) ON DELETE CASCADE,
  completed_plates JSONB NOT NULL DEFAULT '[]',
  current_row INTEGER DEFAULT 1,
  current_plate INTEGER DEFAULT 1,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PDF downloads
CREATE TABLE IF NOT EXISTS pdf_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID NOT NULL REFERENCES bead_patterns(id) ON DELETE CASCADE,
  user_id UUID,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Triggers
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tr_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER tr_bead_patterns_updated_at BEFORE UPDATE ON bead_patterns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER tr_bead_plates_updated_at BEFORE UPDATE ON bead_plates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER tr_bead_colors_updated_at BEFORE UPDATE ON bead_colors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER tr_announcements_updated_at BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Cleanup empty categories (on delete or update of pattern)
CREATE OR REPLACE FUNCTION cleanup_empty_categories()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tr_cleanup_categories_delete AFTER DELETE ON bead_patterns FOR EACH ROW EXECUTE FUNCTION cleanup_empty_categories();
CREATE OR REPLACE TRIGGER tr_cleanup_categories_update AFTER UPDATE OF category_id ON bead_patterns FOR EACH ROW EXECUTE FUNCTION cleanup_empty_categories();

-- ============================================================
-- Seed: Hama bead colors
-- ============================================================
INSERT INTO bead_colors (code, name, hex_color) VALUES
  ('01', 'Hvid', '#FFFFFF'),
  ('02', 'Creme', '#FFF4D6'),
  ('03', 'Gul', '#FFE500'),
  ('04', 'Orange', '#FF8C00'),
  ('05', 'Rød', '#E60000'),
  ('06', 'Pink', '#FF69B4'),
  ('07', 'Lilla', '#800080'),
  ('08', 'Blå', '#0066CC'),
  ('09', 'Lyseblå', '#87CEEB'),
  ('10', 'Grøn', '#009933'),
  ('11', 'Lysegrøn', '#90EE90'),
  ('12', 'Brun', '#8B4513'),
  ('17', 'Grå', '#808080'),
  ('18', 'Sort', '#000000'),
  ('20', 'Mørkrød', '#8B0000'),
  ('21', 'Lysbrun', '#D2A679'),
  ('22', 'Mørkblå', '#003366'),
  ('26', 'Hudfarve', '#FFDAB9'),
  ('27', 'Beige', '#F5DEB3'),
  ('28', 'Mørkegrøn', '#006400'),
  ('29', 'Fersken', '#FFCBA4'),
  ('30', 'Bordeaux', '#722F37'),
  ('31', 'Turkis', '#40E0D0'),
  ('43', 'Pastel gul', '#FFFACD'),
  ('44', 'Pastel rød', '#FFB6C1'),
  ('45', 'Pastel lilla', '#DDA0DD'),
  ('46', 'Pastel blå', '#B0E0E6'),
  ('47', 'Pastel grøn', '#98FB98'),
  ('48', 'Pastel pink', '#FFE4E1'),
  ('60', 'Æblegrøn', '#7CFC00'),
  ('70', 'Perlemor hvid', '#F5F5F5'),
  ('71', 'Perlemor gul', '#F0E68C'),
  ('72', 'Perlemor orange', '#FFDAB9'),
  ('73', 'Perlemor rød', '#FFB0B0'),
  ('74', 'Perlemor pink', '#FFD1DC'),
  ('75', 'Perlemor lilla', '#E6D5F0'),
  ('76', 'Perlemor blå', '#D0E8F0'),
  ('77', 'Perlemor grøn', '#C8F0C8')
ON CONFLICT (code) DO NOTHING;
