-- FORT Timer - Supabase Schema
-- Im Supabase Dashboard unter "SQL Editor" einfügen und ausführen.

-- Equipment / Trainingstagebuch-Einträge
create table if not exists public.gear (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- Einzelne Trainingsläufe. Bewusst nur Draw-Zeit + Zeit des ersten echten
-- Schusses gespeichert - alles danach (Nachspannen, weitere Schüsse) fließt
-- nicht in die Auswertung ein, um die Statistik nicht zu verfälschen.
create table if not exists public.training_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gear_id uuid references public.gear(id) on delete set null,
  run_at timestamptz not null default now(),
  draw_ms numeric,        -- Zeit des Holster-Zugs seit Beep (ms), falls erkannt
  first_shot_ms numeric,  -- Zeit des ersten echten Schusses seit Beep (ms)
  draw_to_shot_ms numeric,-- first_shot_ms - draw_ms, vorab berechnet fürs Dashboard
  shot_count int not null default 0, -- Gesamtzahl erkannter Schüsse im Lauf (Info only)
  notes text,
  raw_shots jsonb,        -- komplette {t, kind}-Liste des Laufs, für spätere Nachanalyse
  created_at timestamptz not null default now()
);

create index if not exists training_runs_user_run_at_idx
  on public.training_runs (user_id, run_at desc);

alter table public.gear enable row level security;
alter table public.training_runs enable row level security;

-- Jeder User sieht/bearbeitet ausschließlich seine eigenen Zeilen.
create policy "gear_select_own" on public.gear
  for select using (auth.uid() = user_id);
create policy "gear_insert_own" on public.gear
  for insert with check (auth.uid() = user_id);
create policy "gear_update_own" on public.gear
  for update using (auth.uid() = user_id);
create policy "gear_delete_own" on public.gear
  for delete using (auth.uid() = user_id);

create policy "training_runs_select_own" on public.training_runs
  for select using (auth.uid() = user_id);
create policy "training_runs_insert_own" on public.training_runs
  for insert with check (auth.uid() = user_id);
create policy "training_runs_update_own" on public.training_runs
  for update using (auth.uid() = user_id);
create policy "training_runs_delete_own" on public.training_runs
  for delete using (auth.uid() = user_id);
