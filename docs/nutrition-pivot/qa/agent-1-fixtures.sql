-- AGENT 1 — seed: one coach with a COMPLETE published doctrine, three students.
-- UUIDs prefixed a1a1 so cleanup never touches anyone else's rows.
BEGIN;

-- ---------------------------------------------------------------- cleanup (ours only)
DELETE FROM public.coach_doctrines WHERE coach_id = 'a1a10000-0000-4000-8000-0000000000aa';
DELETE FROM public.coach_clients   WHERE coach_id = 'a1a10000-0000-4000-8000-0000000000aa';
DELETE FROM public.plan_commitments WHERE user_id IN (
  'a1a10000-0000-4000-8000-000000000011',
  'a1a10000-0000-4000-8000-000000000012',
  'a1a10000-0000-4000-8000-000000000013');
DELETE FROM public.plan_versions   WHERE student_id IN (
  'a1a10000-0000-4000-8000-000000000011',
  'a1a10000-0000-4000-8000-000000000012',
  'a1a10000-0000-4000-8000-000000000013');
DELETE FROM public.student_week_plans WHERE user_id IN (
  'a1a10000-0000-4000-8000-000000000011',
  'a1a10000-0000-4000-8000-000000000012',
  'a1a10000-0000-4000-8000-000000000013');
DELETE FROM public.student_safety_constraints WHERE user_id IN (
  'a1a10000-0000-4000-8000-000000000011',
  'a1a10000-0000-4000-8000-000000000012',
  'a1a10000-0000-4000-8000-000000000013');
DELETE FROM public.chat_messages WHERE user_id IN (
  'a1a10000-0000-4000-8000-000000000011',
  'a1a10000-0000-4000-8000-000000000012',
  'a1a10000-0000-4000-8000-000000000013');
DELETE FROM public.coaches WHERE id = 'a1a10000-0000-4000-8000-0000000000aa';

-- ---------------------------------------------------------------- auth users
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES
  ('a1a10000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a1.coach@keeltest.dev','x',now(),now(),now(),'{}','{}'),
  ('a1a10000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a1.amara@keeltest.dev','x',now(),now(),now(),'{}','{}'),
  ('a1a10000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a1.nina@keeltest.dev','x',now(),now(),now(),'{}','{}'),
  ('a1a10000-0000-4000-8000-000000000013','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a1.tom@keeltest.dev','x',now(),now(),now(),'{}','{}')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------- profiles
UPDATE public.profiles SET full_name='Marc Vasseur', keel_role='coach', locale='en-GB',
  timezone='Europe/London', country='GB', onboarding_completed=true
WHERE id='a1a10000-0000-4000-8000-000000000001';

UPDATE public.profiles SET full_name='Amara', keel_role='student', locale='en-GB',
  timezone='Europe/London', country='GB', phone_number='+447700900011',
  phone_verified_at=now(), whatsapp_opted_in=true, whatsapp_opted_out_at=null,
  onboarding_completed=true, whatsapp_state=null, account_status='active'
WHERE id='a1a10000-0000-4000-8000-000000000011';

UPDATE public.profiles SET full_name='Nina', keel_role='student', locale='en-GB',
  timezone='Europe/London', country='GB', phone_number='+447700900012',
  phone_verified_at=now(), whatsapp_opted_in=true, whatsapp_opted_out_at=null,
  onboarding_completed=true, whatsapp_state=null, account_status='active'
WHERE id='a1a10000-0000-4000-8000-000000000012';

UPDATE public.profiles SET full_name='Tom', keel_role='student', locale='en-GB',
  timezone='Europe/London', country='GB', phone_number='+447700900013',
  phone_verified_at=now(), whatsapp_opted_in=true, whatsapp_opted_out_at=null,
  onboarding_completed=true, whatsapp_state=null, account_status='active'
WHERE id='a1a10000-0000-4000-8000-000000000013';

-- ---------------------------------------------------------------- coach + roster
INSERT INTO public.coaches (id, user_id, display_name, status)
VALUES ('a1a10000-0000-4000-8000-0000000000aa','a1a10000-0000-4000-8000-000000000001','Marc Vasseur','active');

INSERT INTO public.coach_clients (coach_id, student_user_id, invited_email, status, consent_granted_at, started_at)
VALUES
  ('a1a10000-0000-4000-8000-0000000000aa','a1a10000-0000-4000-8000-000000000011','a1.amara@keeltest.dev','active',now(),now()),
  ('a1a10000-0000-4000-8000-0000000000aa','a1a10000-0000-4000-8000-000000000012','a1.nina@keeltest.dev','active',now(),now()),
  ('a1a10000-0000-4000-8000-0000000000aa','a1a10000-0000-4000-8000-000000000013','a1.tom@keeltest.dev','active',now(),now());

-- ---------------------------------------------------------------- the doctrine (PUBLISHED)
INSERT INTO public.coach_doctrines
  (coach_id, version, content_locale, beliefs, forbidden, vocabulary, arbitrations, voice, published_at, published_by)
VALUES (
  'a1a10000-0000-4000-8000-0000000000aa', 1, 'en-GB',
  $json$[
    {"key":"three_real_meals_anchor_the_day",
     "claim":"Three real meals anchor the day. We build the plate before we take anything off it.",
     "rationale":"what predicts is regularity, not perfection"},
    {"key":"protein_and_something_that_grew_first",
     "claim":"Every plate starts with protein and something that grew. The rest follows.",
     "rationale":"fullness is built, not resisted"},
    {"key":"hunger_is_information",
     "claim":"Hunger is information, not a test of character. If the plan leaves you hungry, the plan is wrong, not you.",
     "rationale":null},
    {"key":"one_change_held_a_fortnight",
     "claim":"One change, held for a fortnight, beats five changes held for four days.",
     "rationale":null},
    {"key":"eating_out_is_in_the_plan",
     "claim":"Eating out is part of the plan, not a breach of it.",
     "rationale":null}
  ]$json$::jsonb,
  $json$[
    {"token":"intermittent_fasting",
     "surface_forms":["intermittent fasting","16:8","fasting window","eating window","time-restricted eating","skip breakfast","skipping breakfast"],
     "reason":"it moves the problem to the evening and teaches you to override hunger instead of feeding it",
     "instead":"Marc keeps the three meals and builds breakfast first. If your mornings are rushed we shrink breakfast rather than drop it - a smaller plate you actually eat beats a clever schedule you fight all afternoon."},
    {"token":"detox_cleanse",
     "surface_forms":["detox","cleanse","juice cleanse","flush out toxins","reset your system"],
     "reason":"there is nothing to flush, and it teaches you to be afraid of ordinary food",
     "instead":"Marc does not do detoxes. What he does instead: two ordinary days of three built plates, and then we look at what actually changed."},
    {"token":"cheat_day",
     "surface_forms":["cheat day","cheat meal","treat day","earn your food","burn it off"],
     "reason":"it splits the week into good and bad, and turns Sunday into a punishment",
     "instead":"Marc does not run cheat days. A meal you enjoyed is a meal, full stop - the next one gets built the same way as always."}
  ]$json$::jsonb,
  $json$[
    {"term":"the anchor plate","meaning":"the plate you build first at every meal: protein, something that grew, then the rest"},
    {"term":"a wobble","meaning":"a meal or a day that went sideways - a data point, never a verdict"},
    {"term":"the fortnight rule","meaning":"one change, held two weeks, before anything else is added"}
  ]$json$::jsonb,
  $json$[
    {"situation":"the student says they lost it in the evening and ate everything in the cupboard",
     "coach_answer":"One evening is a data point, not a verdict. Nine times out of ten the evening was decided at lunch. What did lunch look like?",
     "source":"interview"},
    {"situation":"the student asks how many calories are in their plate",
     "coach_answer":"I am not giving you a number - nobody has measured you, and a number I invented would be worse than no number. What I can tell you is whether the plate is built right: protein, something that grew, then the rest.",
     "source":"interview"},
    {"situation":"the student asks whether they can go out for dinner with friends this week",
     "coach_answer":"Go. Eating out is in the plan, not against it. Build the plate the way you would at home and stop looking for the damage.",
     "source":"interview"},
    {"situation":"the student asks about a method the coach does not use",
     "coach_answer":"I will tell you what it is, because you should not be in the dark about it. I do not use it, and here is what I do instead.",
     "source":"interview"}
  ]$json$::jsonb,
  $json$ {"length":"short","emojis":"light","language":"en-GB"} $json$::jsonb,
  now(), 'a1a10000-0000-4000-8000-000000000001'
);

-- ---------------------------------------------------------------- plan (published version + commitments)
INSERT INTO public.plan_versions (id, coach_id, student_id, version, status, title, content_locale, timezone, published_at, published_by)
VALUES
  ('a1a10000-0000-4000-8000-0000000000b1','a1a10000-0000-4000-8000-0000000000aa','a1a10000-0000-4000-8000-000000000011',1,'published','Masterclass - week 3','en-GB','Europe/London',now(),'a1a10000-0000-4000-8000-000000000001'),
  ('a1a10000-0000-4000-8000-0000000000b2','a1a10000-0000-4000-8000-0000000000aa','a1a10000-0000-4000-8000-000000000012',1,'published','Masterclass - week 3','en-GB','Europe/London',now(),'a1a10000-0000-4000-8000-000000000001'),
  ('a1a10000-0000-4000-8000-0000000000b3','a1a10000-0000-4000-8000-0000000000aa','a1a10000-0000-4000-8000-000000000013',1,'published','Masterclass - week 3','en-GB','Europe/London',now(),'a1a10000-0000-4000-8000-000000000001');

INSERT INTO public.plan_commitments
  (plan_version_id, user_id, coach_id, polarity, activity_class, anchor_kind, slot_key, slot_kind,
   measure, target_op, evidence_kind, evaluation_grain, scheduled_days, title, student_instruction,
   content_locale, priority, autonomy)
SELECT v.id, v.student_id, v.coach_id, 'do', 'nutrition', 'slot', s.slot_key, 'nominal',
       'presence', 'any', 'self_report', 'occasion',
       ARRAY['mon','tue','wed','thu','fri','sat','sun']::text[],
       s.title, s.instruction, 'en-GB', 'core', 'flexible'
FROM public.plan_versions v
CROSS JOIN (VALUES
  ('breakfast','Breakfast, built',            'Protein and something that grew, every morning. Small is fine; skipped is not.'),
  ('lunch',    'Lunch, built the same way',   'Protein first, something that grew next, then whatever else you want on the plate.'),
  ('dinner',   'Dinner, built the same way',  'Same build as lunch. If the day went sideways, this plate is still built the same.')
) AS s(slot_key, title, instruction)
WHERE v.id IN ('a1a10000-0000-4000-8000-0000000000b1','a1a10000-0000-4000-8000-0000000000b2','a1a10000-0000-4000-8000-0000000000b3');

-- the adopted week plan (product-level "plan adopted")
INSERT INTO public.student_week_plans (user_id, week_start, status, adopted_at, content_locale, generated_from, items)
SELECT u, date_trunc('week', now())::date, 'adopted', now(), 'en-GB', '{"source":"agent1_seed"}'::jsonb,
  $json$[
    {"kind":"nutrition","title":"Breakfast, built","source_belief_key":"three_real_meals_anchor_the_day"},
    {"kind":"nutrition","title":"Protein and something that grew at lunch","source_belief_key":"protein_and_something_that_grew_first"},
    {"kind":"action","title":"Eat out once this week without renegotiating it"}
  ]$json$::jsonb
FROM (VALUES
  ('a1a10000-0000-4000-8000-000000000011'::uuid),
  ('a1a10000-0000-4000-8000-000000000012'::uuid),
  ('a1a10000-0000-4000-8000-000000000013'::uuid)) AS t(u);

-- ---------------------------------------------------------------- Nina: a HARD medical constraint
INSERT INTO public.student_safety_constraints (user_id, kind, allergen_ref, severity, declared_by, content_locale)
VALUES ('a1a10000-0000-4000-8000-000000000012','allergy','tree_nut','medical','student','en-GB');

COMMIT;
