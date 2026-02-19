-- Seed default coach preferences at signup so Sophia has a baseline profile
-- before the user visits the dashboard.
-- Idempotent via upsert on (user_id, scope, key).

create or replace function public.seed_default_coach_preferences(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  -- Guard for environments where table may not exist yet.
  if to_regclass('public.user_profile_facts') is null then
    return;
  end if;

  insert into public.user_profile_facts (
    user_id,
    scope,
    key,
    value,
    status,
    confidence,
    source_type,
    reason,
    updated_at
  )
  values
    (p_user_id, 'global', 'coach.tone', jsonb_build_object('value', 'warm_direct', 'label', 'Bienveillant ferme'), 'active', 1.0, 'system_default', 'Default coach preferences at signup', now()),
    (p_user_id, 'global', 'coach.challenge_level', jsonb_build_object('value', 'balanced', 'label', 'Équilibré'), 'active', 1.0, 'system_default', 'Default coach preferences at signup', now()),
    (p_user_id, 'global', 'coach.feedback_style', jsonb_build_object('value', 'positive_then_fix', 'label', 'Positif puis amélioration'), 'active', 1.0, 'system_default', 'Default coach preferences at signup', now()),
    (p_user_id, 'global', 'coach.talk_propensity', jsonb_build_object('value', 'balanced', 'label', 'Équilibrée'), 'active', 1.0, 'system_default', 'Default coach preferences at signup', now()),
    (p_user_id, 'global', 'coach.message_length', jsonb_build_object('value', 'short', 'label', 'Court'), 'active', 1.0, 'system_default', 'Default coach preferences at signup', now()),
    (p_user_id, 'global', 'coach.message_format', jsonb_build_object('value', 'adaptive', 'label', 'Mix adaptatif'), 'active', 1.0, 'system_default', 'Default coach preferences at signup', now()),
    (p_user_id, 'global', 'coach.primary_focus', jsonb_build_object('value', 'discipline', 'label', 'Discipline / action'), 'active', 1.0, 'system_default', 'Default coach preferences at signup', now()),
    (p_user_id, 'global', 'coach.inactivity_response', jsonb_build_object('value', 'neutral', 'label', 'Neutre'), 'active', 1.0, 'system_default', 'Default coach preferences at signup', now()),
    (p_user_id, 'global', 'coach.emotional_personalization', jsonb_build_object('value', 'warm', 'label', 'Chaleureux'), 'active', 1.0, 'system_default', 'Default coach preferences at signup', now())
  on conflict (user_id, scope, key)
  do nothing;
end;
$$;

create or replace function public.on_profile_created_seed_default_coach_preferences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_coach_preferences(new.id);
  return new;
end;
$$;

drop trigger if exists on_profile_created_seed_default_coach_preferences_trigger on public.profiles;
create trigger on_profile_created_seed_default_coach_preferences_trigger
  after insert on public.profiles
  for each row
  execute function public.on_profile_created_seed_default_coach_preferences();

-- Backfill existing users once (safe due to upsert do nothing).
do $$
declare
  r record;
begin
  for r in
    select p.id
    from public.profiles p
  loop
    perform public.seed_default_coach_preferences(r.id);
  end loop;
end;
$$;


