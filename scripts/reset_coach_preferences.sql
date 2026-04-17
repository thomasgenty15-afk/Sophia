-- Run manually in Supabase SQL editor.
-- Purpose:
-- 1) Update signup defaults to the canonical coach preference schema.
-- 2) Reset all existing users to these default values.

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
    (p_user_id, 'global', 'coach.tone', jsonb_build_object('value', 'warm_direct', 'label', 'Bienveillant ferme'), 'active', 1.0, 'system_default', 'Default coach preferences (v4 canonical)', now()),
    (p_user_id, 'global', 'coach.challenge_level', jsonb_build_object('value', 'balanced', 'label', 'Équilibré'), 'active', 1.0, 'system_default', 'Default coach preferences (v4 canonical)', now()),
    (p_user_id, 'global', 'coach.feedback_style', jsonb_build_object('value', 'positive_then_fix', 'label', 'Positif puis amélioration'), 'active', 1.0, 'system_default', 'Default coach preferences (v4 canonical)', now()),
    (p_user_id, 'global', 'coach.talk_propensity', jsonb_build_object('value', 'balanced', 'label', 'Équilibrée'), 'active', 1.0, 'system_default', 'Default coach preferences (v4 canonical)', now()),
    (p_user_id, 'global', 'coach.message_length', jsonb_build_object('value', 'short', 'label', 'Courte'), 'active', 1.0, 'system_default', 'Default coach preferences (v4 canonical)', now()),
    (p_user_id, 'global', 'coach.message_format', jsonb_build_object('value', 'adaptive', 'label', 'Mix adaptatif'), 'active', 1.0, 'system_default', 'Default coach preferences (v4 canonical)', now()),
    (p_user_id, 'global', 'coach.primary_focus', jsonb_build_object('value', 'discipline', 'label', 'Discipline / action'), 'active', 1.0, 'system_default', 'Default coach preferences (v4 canonical)', now()),
    (p_user_id, 'global', 'coach.emotional_personalization', jsonb_build_object('value', 'warm', 'label', 'Chaleureux'), 'active', 1.0, 'system_default', 'Default coach preferences (v4 canonical)', now()),
    (p_user_id, 'global', 'coach.question_tendency', jsonb_build_object('value', 'normal', 'label', 'Normale'), 'active', 1.0, 'system_default', 'Default coach preferences (v4 canonical)', now())
  on conflict (user_id, scope, key)
  do update set
    value = excluded.value,
    status = 'active',
    confidence = 1.0,
    source_type = 'system_default',
    reason = excluded.reason,
    updated_at = now();
end;
$$;

-- Remove old and canonical coach preference rows before reseeding defaults.
delete from public.user_profile_facts
where key in (
  'coach.tone',
  'coach.challenge_level',
  'coach.feedback_style',
  'coach.talk_propensity',
  'coach.message_length',
  'coach.message_format',
  'coach.primary_focus',
  'coach.inactivity_response',
  'coach.emotional_personalization',
  'coach.coaching_style',
  'coach.chatty_level',
  'coach.question_tendency'
);

do $$
declare
  r record;
begin
  for r in select id from public.profiles
  loop
    perform public.seed_default_coach_preferences(r.id);
  end loop;
end;
$$;
