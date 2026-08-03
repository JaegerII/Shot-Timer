-- FORT Timer - Profil-Sichtbarkeit (Migration 5)
-- Im Supabase Dashboard unter "SQL Editor" einfügen und ausführen.
-- Setzt supabase-schema-social.sql und supabase-schema-profile-extras.sql voraus.

-- Standardmäßig an (bisheriges Verhalten bleibt für alle bestehenden Profile
-- gleich). Steuert, ob Bio/Instagram/Stats/Abzeichen für andere sichtbar
-- sind - Username/Avatar/Geschlecht/Equipment bleiben für die Rangliste
-- selbst immer sichtbar, das ändert dieser Schalter bewusst nicht.
alter table public.profiles add column if not exists is_public boolean not null default true;

-- Liefert alles, was ein öffentliches Profil braucht (Identität + optional
-- Bio/Instagram/Trainings-Stats), in einem Aufruf. Bio/Instagram/Stats
-- werden serverseitig auf null gesetzt, wenn das Profil auf privat steht und
-- der Aufrufer nicht der Profil-Inhaber selbst ist - so verlassen diese
-- Felder bei privaten Profilen die Datenbank gar nicht erst.
create or replace function public.public_profile(p_user_id uuid)
returns table (
  user_id uuid,
  username text,
  gender text,
  avatar_url text,
  active_gear_name text,
  is_public boolean,
  bio text,
  instagram text,
  run_count bigint,
  avg_draw_ms numeric,
  avg_first_shot_ms numeric,
  avg_draw_to_shot_ms numeric,
  best_draw_to_shot_ms numeric
)
language sql
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    p.username,
    p.gender,
    p.avatar_url,
    p.active_gear_name,
    p.is_public,
    case when p.is_public or p.id = auth.uid() then p.bio else null end as bio,
    case when p.is_public or p.id = auth.uid() then p.instagram else null end as instagram,
    case when p.is_public or p.id = auth.uid() then s.run_count else null end as run_count,
    case when p.is_public or p.id = auth.uid() then s.avg_draw_ms else null end as avg_draw_ms,
    case when p.is_public or p.id = auth.uid() then s.avg_first_shot_ms else null end as avg_first_shot_ms,
    case when p.is_public or p.id = auth.uid() then s.avg_draw_to_shot_ms else null end as avg_draw_to_shot_ms,
    case when p.is_public or p.id = auth.uid() then s.best_draw_to_shot_ms else null end as best_draw_to_shot_ms
  from public.profiles p
  left join lateral (
    select
      count(*) filter (where tr.draw_to_shot_ms is not null) as run_count,
      avg(tr.draw_ms) as avg_draw_ms,
      avg(tr.first_shot_ms) as avg_first_shot_ms,
      avg(tr.draw_to_shot_ms) as avg_draw_to_shot_ms,
      min(tr.draw_to_shot_ms) as best_draw_to_shot_ms
    from public.training_runs tr
    where tr.user_id = p.id and tr.draw_to_shot_ms is not null
  ) s on true
  where p.id = p_user_id;
$$;

grant execute on function public.public_profile(uuid) to authenticated;
