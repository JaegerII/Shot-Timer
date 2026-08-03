-- FORT Timer - Zeitraum-Rangliste + Abzeichen (Migration 3)
-- Im Supabase Dashboard unter "SQL Editor" einfügen und ausführen.
-- Setzt supabase-schema.sql und supabase-schema-social.sql voraus.

-- Rangliste für einen beliebigen Zeitraum (Woche/Monat "live", oder ein
-- beliebiger vergangener Zeitraum für die Abzeichen-Berechnung unten).
-- Bewusst als Funktion statt fixer View, damit der Client Wochen-/Monats-
-- grenzen selbst berechnen und übergeben kann.
create or replace function public.leaderboard_period(p_start timestamptz, p_end timestamptz)
returns table (
  user_id uuid,
  username text,
  gender text,
  avatar_url text,
  gear_name text,
  draw_ms numeric,
  first_shot_ms numeric,
  draw_to_shot_ms numeric,
  run_at timestamptz
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
    best.gear_name,
    best.draw_ms,
    best.first_shot_ms,
    best.draw_to_shot_ms,
    best.run_at
  from public.profiles p
  join lateral (
    select tr.gear_name, tr.draw_ms, tr.first_shot_ms, tr.draw_to_shot_ms, tr.run_at
    from public.training_runs tr
    where tr.user_id = p.id
      and tr.draw_to_shot_ms is not null
      and tr.run_at >= p_start
      and tr.run_at < p_end
    order by tr.draw_to_shot_ms asc
    limit 1
  ) best on true
  order by best.draw_to_shot_ms asc;
$$;

grant execute on function public.leaderboard_period(timestamptz, timestamptz) to authenticated;

-- Abzeichen für Platz 1-3 in bereits abgeschlossenen Monaten/Wochen. Läuft
-- komplett dynamisch aus training_runs - kein Cronjob/Snapshot nötig, weil
-- vergangene Zeiträume sich per Definition nicht mehr ändern (außer jemand
-- löscht nachträglich einen Lauf, dann verschwindet das Abzeichen konsequent
-- mit, statt eine Zeit zu zeigen, die es gar nicht mehr gibt).
create or replace function public.my_badges(p_user_id uuid)
returns table (
  period_type text,
  period_start timestamptz,
  rank int
)
language sql
security definer
set search_path = public
as $$
  with monthly as (
    select
      date_trunc('month', tr.run_at) as period_start,
      tr.user_id,
      min(tr.draw_to_shot_ms) as best_time
    from public.training_runs tr
    where tr.draw_to_shot_ms is not null
      and date_trunc('month', tr.run_at) < date_trunc('month', now())
    group by 1, 2
  ),
  monthly_ranked as (
    select period_start, user_id,
      rank() over (partition by period_start order by best_time asc) as rnk
    from monthly
  ),
  weekly as (
    select
      date_trunc('week', tr.run_at) as period_start,
      tr.user_id,
      min(tr.draw_to_shot_ms) as best_time
    from public.training_runs tr
    where tr.draw_to_shot_ms is not null
      and date_trunc('week', tr.run_at) < date_trunc('week', now())
    group by 1, 2
  ),
  weekly_ranked as (
    select period_start, user_id,
      rank() over (partition by period_start order by best_time asc) as rnk
    from weekly
  )
  select 'month'::text as period_type, period_start, rnk::int as rank
  from monthly_ranked
  where user_id = p_user_id and rnk <= 3
  union all
  select 'week'::text as period_type, period_start, rnk::int as rank
  from weekly_ranked
  where user_id = p_user_id and rnk <= 3
  order by period_start desc;
$$;

grant execute on function public.my_badges(uuid) to authenticated;
