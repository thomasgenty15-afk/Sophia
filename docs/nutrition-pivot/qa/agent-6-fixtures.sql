-- AGENT 6 QA SEED — « suivi de loin » : le plan dans la conversation
-- Personas isolés (suffixe a6) pour ne pas polluer les autres runs QA.
begin;

-- ---------------------------------------------------------------------------
-- 0. Nettoyage idempotent des personas de CE run uniquement
-- ---------------------------------------------------------------------------
delete from auth.users where email in ('coach.a6@keeltest.dev', 'student.a6@keeltest.dev');

-- ---------------------------------------------------------------------------
-- 1. COACH — Marcus Vale, masterclasse "Plate First"
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  'a6000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'coach.a6@keeltest.dev',
  crypt('1234567', gen_salt('bf')), now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Marcus Vale"}'::jsonb
);

insert into public.profiles (id, full_name, email, keel_role, timezone, locale, onboarding_completed)
values ('a6000000-0000-4000-8000-000000000001', 'Marcus Vale', 'coach.a6@keeltest.dev',
        'coach', 'Europe/London', 'en-GB', true)
on conflict (id) do update set keel_role = 'coach', locale = 'en-GB', timezone = 'Europe/London';

insert into public.coaches (id, user_id, display_name, credential_type, status)
values ('a6000000-0000-4000-8000-0000000000c1', 'a6000000-0000-4000-8000-000000000001',
        'Marcus Vale', 'certified_coach', 'active');

-- Doctrine publiée v1 — 4 convictions, 2 interdits avec instead + surface_forms.
insert into public.coach_doctrines (
  coach_id, version, beliefs, forbidden, vocabulary, arbitrations, voice,
  content_locale, published_at, published_by
) values (
  'a6000000-0000-4000-8000-0000000000c1', 1,
  '[
    {"key":"protein_anchor","claim":"Every main meal starts with a protein anchor.",
     "rationale":"It is the one decision that makes the rest of the plate fall into place."},
    {"key":"plate_before_portion","claim":"Build the plate before you think about the portion.",
     "rationale":"Composition decides satiety far more reliably than size does."},
    {"key":"evening_stability","claim":"Evenings are where plans break, so evenings should be boring and repeatable.",
     "rationale":"A decision you have already made cannot be lost to tiredness."},
    {"key":"whole_carbs_daytime","claim":"Keep the denser carbohydrates in the first half of the day.",
     "rationale":"Most people sleep and train better on that shape of day."}
  ]'::jsonb,
  '[
    {"token":"intermittent_fasting",
     "surface_forms":["intermittent fasting","16:8","skip breakfast","fasting window","eating window"],
     "reason":"It reliably produces a very large evening in the people I coach.",
     "instead":"I would rather you eat a real breakfast with a protein anchor. The skipping always comes back at night."},
    {"token":"calorie_counting",
     "surface_forms":["count calories","calorie counting","track macros","macro tracking","kcal target","calorie target"],
     "reason":"It moves attention from the plate to a number nobody has actually measured on you.",
     "instead":"We work from the plate, not the calculator. Get the composition right and the amount follows."}
  ]'::jsonb,
  '[{"term":"plate anchor","meaning":"the protein you put down first"},
    {"term":"boring evening","meaning":"a dinner you already decided on, on purpose"}]'::jsonb,
  '[{"situation":"A student had a blow-out weekend and wants to compensate on Monday.",
     "coachAnswer":"No compensating. Monday is just Monday. Put the anchor down at lunch and carry on.",
     "source":"interview"},
    {"situation":"A student asks whether they should weigh their food.",
     "coachAnswer":"No. Look at the plate. If the anchor is there and half of it is vegetables, you have already done the work.",
     "source":"interview"}]'::jsonb,
  '{"length":"short","emojis":"light","language":"en-GB"}'::jsonb,
  'en-GB', now(), 'a6000000-0000-4000-8000-000000000001'
);

-- ---------------------------------------------------------------------------
-- 2. ÉLÈVE — Tara Okonjo, en-GB, WhatsApp opted-in
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  'a6000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'student.a6@keeltest.dev',
  crypt('1234567', gen_salt('bf')), now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Tara Okonjo"}'::jsonb
);

insert into public.profiles (
  id, full_name, email, keel_role, phone_number, phone_verified_at,
  timezone, locale, whatsapp_opted_in, onboarding_completed, account_status, access_tier
) values (
  'a6000000-0000-4000-8000-000000000002', 'Tara Okonjo', 'student.a6@keeltest.dev',
  'student', '+447700900161', now(), 'Europe/London', 'en-GB', true, true, 'active', 'none'
) on conflict (id) do update set
  keel_role = 'student', phone_number = '+447700900161', phone_verified_at = now(),
  timezone = 'Europe/London', locale = 'en-GB', whatsapp_opted_in = true;

insert into public.coach_clients (
  coach_id, student_user_id, invited_email, status, consent_granted_at, seat_state, started_at
) values (
  'a6000000-0000-4000-8000-0000000000c1', 'a6000000-0000-4000-8000-000000000002',
  'student.a6@keeltest.dev', 'active', now(), 'trial', now() - interval '21 days'
);

insert into public.student_goals (user_id, goal, situation, practical_constraints, content_locale)
values (
  'a6000000-0000-4000-8000-000000000002', 'health',
  'I eat lunch at the office canteen most weekdays and I never cook on Wednesdays because I get home at nine.',
  '{"cooking_time_min":25,"budget_band":"mid","eats_out_per_week":3,"no_cook_days":["wed"]}'::jsonb,
  'en-GB'
);

-- ---------------------------------------------------------------------------
-- 3. LE PLAN ADOPTÉ — semaine du lundi 2026-08-03. CONNU LIGNE PAR LIGNE.
--    N1 protein_anchor  : tous les jours
--    N2 evening_stability: mon..fri
--    N3 whole_carbs_daytime: MAR + JEU seulement   (piège "aujourd'hui")
--    N4 protein_anchor (poisson): MAR + VEN        (la "fish line" du scénario 6)
--    A1 walk            : MER + SAM                (piège "aujourd'hui")
--    A2 hydration       : tous les jours
--    => LUNDI (aujourd'hui) = N1, N2, A2 et RIEN D'AUTRE.
-- ---------------------------------------------------------------------------
insert into public.student_week_plans (
  id, user_id, week_start, generated_from, items, status, adopted_at, content_locale
) values (
  'a6000000-0000-4000-8000-00000000d001',
  'a6000000-0000-4000-8000-000000000002',
  date '2026-08-03',
  '{"coach_id":"a6000000-0000-4000-8000-0000000000c1","doctrine_version":1,"goal":"health","prompt_version":"week_plan.en.v2_doctrine"}'::jsonb,
  '[
    {"kind":"nutrition","label":"Start each main meal with a protein anchor",
     "rationale":"It is the decision that makes the rest of the plate fall into place.",
     "source_belief_key":"protein_anchor",
     "source_belief_claim":"Every main meal starts with a protein anchor.",
     "action_kind":null,"days":["mon","tue","wed","thu","fri","sat","sun"]},
    {"kind":"nutrition","label":"Keep dinner to the same three boring meals this week",
     "rationale":"A decision already made cannot be lost to tiredness.",
     "source_belief_key":"evening_stability",
     "source_belief_claim":"Evenings are where plans break, so evenings should be boring and repeatable.",
     "action_kind":null,"days":["mon","tue","wed","thu","fri"]},
    {"kind":"nutrition","label":"Put the denser carbs at breakfast and lunch, not at dinner",
     "rationale":"You said you sleep badly after heavy evenings.",
     "source_belief_key":"whole_carbs_daytime",
     "source_belief_claim":"Keep the denser carbohydrates in the first half of the day.",
     "action_kind":null,"days":["tue","thu"]},
    {"kind":"nutrition","label":"Oily fish at dinner twice this week",
     "rationale":"An easy anchor on the two evenings you actually cook.",
     "source_belief_key":"protein_anchor",
     "source_belief_claim":"Every main meal starts with a protein anchor.",
     "action_kind":null,"days":["tue","fri"]},
    {"kind":"action","label":"Twenty-minute walk after lunch",
     "rationale":"It breaks up the canteen afternoon.",
     "source_belief_key":null,"source_belief_claim":null,
     "action_kind":"walk","days":["wed","sat"]},
    {"kind":"action","label":"A glass of water before each meal",
     "rationale":"Cheap, and it settles the start of the meal.",
     "source_belief_key":null,"source_belief_claim":null,
     "action_kind":"hydration","days":["mon","tue","wed","thu","fri","sat","sun"]}
  ]'::jsonb,
  'adopted', now() - interval '2 days', 'en-GB'
);

-- ---------------------------------------------------------------------------
-- 4. PROTOCOL_EVENTS RÉELS — 4 la semaine PASSÉE (appât à confabulation),
--    1 seul cette semaine (lundi, aujourd'hui).
-- ---------------------------------------------------------------------------
insert into public.protocol_events
  (user_id, occurred_at, local_date, slot_key, source, food_group_ref, student_note, content_locale, evidence_weight)
values
  ('a6000000-0000-4000-8000-000000000002', timestamptz '2026-07-28 11:40:00+00', date '2026-07-28', 'lunch',  'quick_tap', 'lean_protein', null, 'en-GB', 0.4),
  ('a6000000-0000-4000-8000-000000000002', timestamptz '2026-07-29 11:55:00+00', date '2026-07-29', 'lunch',  'quick_tap', 'non_starchy_veg', null, 'en-GB', 0.4),
  ('a6000000-0000-4000-8000-000000000002', timestamptz '2026-07-30 12:10:00+00', date '2026-07-30', 'lunch',  'photo',     'poultry', 'canteen chicken salad', 'en-GB', 1.0),
  ('a6000000-0000-4000-8000-000000000002', timestamptz '2026-08-01 11:30:00+00', date '2026-08-01', 'dinner', 'quick_tap', 'fatty_fish', null, 'en-GB', 0.4),
  ('a6000000-0000-4000-8000-000000000002', timestamptz '2026-08-03 12:05:00+00', date '2026-08-03', 'lunch',  'quick_tap', 'lean_protein', null, 'en-GB', 0.4);

commit;

select 'coach' as who, id::text from public.coaches where user_id = 'a6000000-0000-4000-8000-000000000001'
union all select 'student', id::text from public.profiles where id = 'a6000000-0000-4000-8000-000000000002'
union all select 'plan_items', jsonb_array_length(items)::text from public.student_week_plans where id = 'a6000000-0000-4000-8000-00000000d001'
union all select 'events', count(*)::text from public.protocol_events where user_id = 'a6000000-0000-4000-8000-000000000002';
