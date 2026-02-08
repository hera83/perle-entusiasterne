ALTER TABLE public.bead_patterns ADD COLUMN share_token UUID DEFAULT NULL;
CREATE UNIQUE INDEX idx_bead_patterns_share_token ON bead_patterns(share_token) WHERE share_token IS NOT NULL;