-- FORT Timer - Bio + Instagram (Migration 4)
-- Im Supabase Dashboard unter "SQL Editor" einfügen und ausführen.
-- Setzt supabase-schema-social.sql voraus.

alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists instagram text;
