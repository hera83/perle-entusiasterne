
-- Add soft-delete columns to profiles
ALTER TABLE public.profiles ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN email text;
