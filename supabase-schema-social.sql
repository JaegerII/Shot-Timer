-- FORT Timer - Social/Profile/Leaderboard Erweiterung (Migration 2)
-- Im Supabase Dashboard unter "SQL Editor" einfügen und ausführen.
-- Setzt supabase-schema.sql (gear, training_runs) voraus - bitte zuerst
-- sicherstellen, dass das schon ausgeführt wurde.

-- Öffentlich sichtbare Profildaten (Leaderboard-Identität).
-- Bewusst getrennt von echten Namen: hier steht nur, was andere sehen dürfen.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  gender text check (gender in ('male', 'female')),
  avatar_url text,
  active_gear_name text,
  created_at timestamptz not null default now()
);

-- Private Daten, die NIE öffentlich (auch nicht im Leaderboard) sichtbar sind.
create table if not exists public.profile_private (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;

-- Jeder eingeloggte User darf alle Profile lesen (Username/Geschlecht/Bild) -
-- das braucht das Leaderboard. Ändern darf man nur sein eigenes.
create policy "profiles_select_authenticated" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- profile_private bleibt strikt privat - nur der eigene User sieht/ändert es.
create policy "profile_private_select_own" on public.profile_private
  for select using (auth.uid() = user_id);
create policy "profile_private_insert_own" on public.profile_private
  for insert with check (auth.uid() = user_id);
create policy "profile_private_update_own" on public.profile_private
  for update using (auth.uid() = user_id);

-- Equipment-Name direkt am Lauf gespeichert (statt live aus "gear" zu lesen),
-- damit das Leaderboard ihn zeigen kann, ohne die private Gear-Tabelle für
-- alle User lesbar machen zu müssen.
alter table public.training_runs add column if not exists gear_name text;

-- Leaderboard: pro User der schnellste Lauf (kürzeste Zeit von Draw bis
-- 1. Schuss). Läuft mit den Rechten des View-Besitzers, umgeht also bewusst
-- die training_runs-RLS - genau dafür ist die View da. Zeigt absichtlich nur
-- öffentlich unbedenkliche Felder (kein Klarname, keine E-Mail, keine
-- kompletten Lauf-Details).
create or replace view public.leaderboard as
select
  p.id as user_id,
  p.username,
  p.gender,
  p.avatar_url,
  best.draw_ms,
  best.first_shot_ms,
  best.draw_to_shot_ms,
  best.gear_name,
  best.run_at
from public.profiles p
join lateral (
  select tr.draw_ms, tr.first_shot_ms, tr.draw_to_shot_ms, tr.gear_name, tr.run_at
  from public.training_runs tr
  where tr.user_id = p.id and tr.draw_to_shot_ms is not null
  order by tr.draw_to_shot_ms asc
  limit 1
) best on true;

grant select on public.leaderboard to authenticated;

-- Profilbilder: eigener Storage-Bucket, öffentlich lesbar, aber jeder darf
-- nur seine eigene Datei hochladen/ändern/löschen (Pfad muss mit der
-- eigenen User-ID beginnen, z. B. "<user_id>/avatar.jpg").
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatar_public_read" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "avatar_owner_insert" on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar_owner_update" on storage.objects
  for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar_owner_delete" on storage.objects
  for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
