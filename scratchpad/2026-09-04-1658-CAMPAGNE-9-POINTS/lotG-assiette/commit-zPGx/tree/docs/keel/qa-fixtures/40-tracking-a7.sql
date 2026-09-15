-- ===========================================================================
-- KEEL QA — A7, LA PAGE DE SUIVI (chantier du 2026-09-03, lane SUIVI)
-- ===========================================================================
-- Idempotent. Ne touche QUE les comptes `qa0903s.%@keeltest.dev`.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     < docs/keel/qa-fixtures/40-tracking-a7.sql
--
-- ⚠️ CE FICHIER N'A PAS ÉTÉ JOUÉ. Il est écrit pour l'être — mot de passe
--    `1234567`, colonnes de jeton `''`, patron de `00-base.sql` — mais la lane
--    A7 n'a pas eu de fenêtre de run réel. Le premier qui le lance doit lire le
--    rapport de sortie de chaque `insert` avant d'en conclure quoi que ce soit.
--
-- Ce que ce fichier fabrique — TROIS personnes, trois questions :
--
--   ① `qa0903s.goal`   objectif `fat_loss`, un plan de 3 jours, DEUX faits
--                      photo portant `recognized.energy_estimate` (une base
--                      `photo_estimate`, une base `declared_quantities`), un
--                      créneau déclaré et loupé.
--                      ⇒ le jour doit rendre TROIS bases distinctes et un total
--                        « estimé », dont la base est la PLUS FAIBLE des trois.
--
--   ② `qa0903s.floor`  série de poids à −1,5 %/semaine sur 14 jours.
--                      ⇒ `evaluateRestrictionForStudent` doit lever le plancher,
--                        et la réponse ne doit porter NI kcal NI série de poids.
--                        La page le dit sans nommer le drapeau.
--
--   ③ `qa0903s.curve`  60 pesées réparties sur 12 mois.
--                      ⇒ la courbe doit tenir sur les six fenêtres, et la
--                        fenêtre « 1 sem » ne doit montrer que ce qu'elle couvre.
--
-- ⚠️ L'ENVOI DE MAIL EST NEUTRALISÉ LE TEMPS DE LA TRANSACTION — même raison
--    que `00-base.sql` : `EMAIL_DELIVERY_ENABLED=1` en local avec une vraie clé
--    Resend, et le trigger de confirmation poste vers `send-welcome-email`.
--    On emprunte la sortie que le trigger se donne : anon_key vide.
--
-- ⚠️ PLAFOND DE SIÈGES D'ESSAI = 3. Ces trois comptes n'ont AUCUN coach : ils
--    ne consomment donc aucun siège, et n'entrent en conflit avec aucune autre
--    lane. Si la porte de doctrine (③ des cinq) refuse un élève sans coach, ce
--    fichier ne peut pas ouvrir le chiffre — c'est la PREMIÈRE chose à mesurer
--    avant de conclure que la page est en défaut.
-- ===========================================================================

\set ON_ERROR_STOP on

begin;

create temporary table _qa0903s_anon_key on commit drop as
select value from public.app_config where key = 'edge_functions_anon_key' for update;

update public.app_config set value = '' where key = 'edge_functions_anon_key';

-- ---------------------------------------------------------------- nettoyage
delete from auth.users where email like 'qa0903s.%@keeltest.dev';

-- ---------------------------------------------------------------- comptes
-- ⚠️ LES COLONNES DE JETON DOIVENT ÊTRE '' ET JAMAIS NULL : GoTrue les scanne
--    dans des `string` Go non-nullables, et un NULL rend un compte qui existe,
--    s'affiche normalement, et ne peut PAS se connecter.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, reauthentication_token
)
select
  u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  u.email, extensions.crypt('1234567', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.name),
  now(), now(),
  '', '', '', '', '', '', '', ''
from (values
  ('09035000-0000-4000-8000-000000000001'::uuid, 'qa0903s.goal@keeltest.dev',  'Nora Goal'),
  ('09035000-0000-4000-8000-000000000002'::uuid, 'qa0903s.floor@keeltest.dev', 'Iris Floor'),
  ('09035000-0000-4000-8000-000000000003'::uuid, 'qa0903s.curve@keeltest.dev', 'Ana Curve')
) as u(id, email, name);

-- ---------------------------------------------------------------- profils
-- ⚠️ `birth_date` EST OBLIGATOIRE POUR LE CHIFFRE. La porte ② ferme sur
--    `minor` ET sur `age_unknown` — et `age_unknown` couvre 91 % de la base.
--    Un profil sans date de naissance ne prouve donc RIEN sur cette page.
-- ⚠️ `timezone` décide de « aujourd'hui » : les bornes de la fenêtre et les
--    dates des faits sont dans CETTE horloge, pas dans celle du serveur.
update public.profiles p set
  full_name = v.name,
  timezone = 'Europe/Paris',
  locale = 'fr-FR',
  country = 'FR',
  birth_date = v.birth_date,
  gender = v.gender,
  height_cm = v.height_cm,
  activity_level = v.activity_level,
  -- ③ et ④ des cinq portes : l'interrupteur de la personne, tri-état.
  -- `true` explicite, jamais NULL — NULL veut dire « personne n'a répondu ».
  energy_display_enabled = true,
  energy_target_enabled = true
from (values
  ('09035000-0000-4000-8000-000000000001'::uuid, 'Nora Goal',  date '1991-04-12', 'female', 168, 'trains_some'),
  ('09035000-0000-4000-8000-000000000002'::uuid, 'Iris Floor', date '1994-09-30', 'female', 172, 'on_feet'),
  ('09035000-0000-4000-8000-000000000003'::uuid, 'Ana Curve',  date '1988-01-05', 'female', 165, 'sedentary')
) as v(id, name, birth_date, gender, height_cm, activity_level)
where p.id = v.id;

-- ---------------------------------------------------------------- objectifs
-- `eating_rhythm` porte les SIX occasions possibles ; on en déclare TROIS.
-- ⚠️ C'est ce tableau, et pas les cinq moments horaires, qui décide de ce qui
--    compte comme « créneau loupé » (D7.6).
insert into public.student_goals (user_id, goal, target_pace_kg_per_week, content_locale, practical_constraints)
values
  ('09035000-0000-4000-8000-000000000001', 'fat_loss', 0.4, 'fr-FR', jsonb_build_object(
     'activity_level', 'trains_some',
     'eating_rhythm', jsonb_build_array(
       jsonb_build_object('slot', 'breakfast', 'size', null),
       jsonb_build_object('slot', 'lunch', 'size', null),
       jsonb_build_object('slot', 'dinner', 'size', null)
     ))),
  ('09035000-0000-4000-8000-000000000002', 'fat_loss', 0.5, 'fr-FR', jsonb_build_object(
     'activity_level', 'on_feet',
     'eating_rhythm', jsonb_build_array(
       jsonb_build_object('slot', 'lunch', 'size', null),
       jsonb_build_object('slot', 'dinner', 'size', null)
     ))),
  -- ③ est en MAINTIEN : la courbe doit exister quand même (D7.11).
  ('09035000-0000-4000-8000-000000000003', 'maintain', null, 'fr-FR', jsonb_build_object(
     'activity_level', 'sedentary',
     'eating_rhythm', jsonb_build_array(
       jsonb_build_object('slot', 'breakfast', 'size', null),
       jsonb_build_object('slot', 'lunch', 'size', null),
       jsonb_build_object('slot', 'dinner', 'size', null)
     )))
on conflict do nothing;

-- ---------------------------------------------------------------- ① le plan
-- Trois jours à partir d'hier, six plats, avec des quantités STRUCTURÉES :
-- sans `amount`/`unit`/`state`, `plan_energy` s'abstient et la journée entière
-- s'abstient avec elle — ce qui ferait ressembler un défaut de fixture à un
-- défaut de la page.
insert into public.student_generated_meals (
  user_id, scope, mode, servings, meal_slot, dishes, preparations, cooking_sessions,
  shopping_list, generated_from, content_locale, starts_on, duration_days, plan_kind
)
select
  '09035000-0000-4000-8000-000000000001'::uuid, 'several_days', 'to_shop', 1, null,
  jsonb_build_array(
    jsonb_build_object(
      'title', 'Porridge et fruits rouges', 'day', to_char(current_date - 1, 'dy'), 'slot', 'breakfast',
      'method', 'Cuire les flocons dans le lait.', 'uses', jsonb_build_array(),
      'ingredients', jsonb_build_array(
        jsonb_build_object('term', 'rolled oats', 'amount', 60, 'unit', 'g', 'state', 'raw'),
        jsonb_build_object('term', 'whole milk', 'amount', 200, 'unit', 'ml', 'state', 'raw'))),
    jsonb_build_object(
      'title', 'Poulet, riz et brocolis', 'day', to_char(current_date - 1, 'dy'), 'slot', 'dinner',
      'method', 'Poeler le poulet, cuire le riz.', 'uses', jsonb_build_array(),
      'ingredients', jsonb_build_array(
        jsonb_build_object('term', 'chicken breast', 'amount', 150, 'unit', 'g', 'state', 'raw'),
        jsonb_build_object('term', 'white rice', 'amount', 80, 'unit', 'g', 'state', 'raw'),
        jsonb_build_object('term', 'broccoli', 'amount', 150, 'unit', 'g', 'state', 'raw'),
        jsonb_build_object('term', 'olive oil', 'amount', 10, 'unit', 'g', 'state', 'raw'))),
    jsonb_build_object(
      'title', 'Omelette et salade', 'day', to_char(current_date, 'dy'), 'slot', 'breakfast',
      'method', 'Battre les oeufs.', 'uses', jsonb_build_array(),
      'ingredients', jsonb_build_array(
        jsonb_build_object('term', 'egg', 'amount', 120, 'unit', 'g', 'state', 'raw'),
        jsonb_build_object('term', 'olive oil', 'amount', 8, 'unit', 'g', 'state', 'raw'))),
    jsonb_build_object(
      'title', 'Saumon et pommes de terre', 'day', to_char(current_date, 'dy'), 'slot', 'dinner',
      'method', 'Cuire au four.', 'uses', jsonb_build_array(),
      'ingredients', jsonb_build_array(
        jsonb_build_object('term', 'salmon', 'amount', 140, 'unit', 'g', 'state', 'raw'),
        jsonb_build_object('term', 'potato', 'amount', 250, 'unit', 'g', 'state', 'raw')))
  ),
  '[]'::jsonb,
  jsonb_build_array(jsonb_build_object('day', to_char(current_date - 1, 'dy'), 'total_minutes', 45)),
  '[]'::jsonb,
  jsonb_build_object('qa', 'qa0903s'),
  'fr-FR', current_date - 1, 3, 'personal';

-- ---------------------------------------------------------------- ① les faits
-- ⚠️ LA CLÉ PORTE LE PRÉFIXE, et c'est elle que l'agrégat lit
--    (`source_message_id`, index unique partiel `(user_id, source_message_id)`).
with plan as (
  select id from public.student_generated_meals
  where user_id = '09035000-0000-4000-8000-000000000001' order by created_at desc limit 1
)
insert into public.protocol_events (
  user_id, occurred_at, local_date, slot_key, source, evidence_weight,
  plan_relation, content_locale, source_message_id, media_path, recognized
)
select * from (
  -- une COCHE sur le dîner d'hier : base `plan_quantities`, exacte.
  select '09035000-0000-4000-8000-000000000001'::uuid,
         (current_date - 1 + time '20:10')::timestamptz, current_date - 1, 'dinner'::text,
         'quick_tap'::text, 0.4::numeric, 'as_planned'::text, 'fr-FR'::text,
         'meal_tick:' || (select id from plan) || ':1', null::text, null::jsonb
  union all
  -- une PHOTO au déjeuner d'hier : base `photo_estimate` (biais −26,6 %).
  select '09035000-0000-4000-8000-000000000001'::uuid,
         (current_date - 1 + time '12:40')::timestamptz, current_date - 1, 'lunch',
         'photo', 0.6, 'off_plan', 'fr-FR',
         'qa0903s-photo-1', 'qa/qa0903s/lunch.jpg',
         jsonb_build_object(
           'energy_estimate', jsonb_build_object(
             'kcal', 620, 'basis', 'photo_estimate', 'confidence_band', 'moderate'))
  union all
  -- une PHOTO CORRIGÉE aujourd'hui : base `declared_quantities` (MAPE 2,3 %).
  select '09035000-0000-4000-8000-000000000001'::uuid,
         (current_date + time '12:35')::timestamptz, current_date, 'lunch',
         'photo', 0.6, 'off_plan', 'fr-FR',
         'qa0903s-photo-2', 'qa/qa0903s/lunch2.jpg',
         jsonb_build_object(
           'energy_estimate', jsonb_build_object(
             'kcal', 705, 'basis', 'declared_quantities', 'confidence_band', 'high'))
) as f
on conflict do nothing;
-- ⇒ AUJOURD'HUI : petit-déjeuner et dîner du plan (silencieux ⇒ base `assumed`),
--   déjeuner photographié (`declared_quantities`). AUCUN créneau loupé.
-- ⇒ HIER : dîner coché (`plan_quantities`), déjeuner photographié
--   (`photo_estimate`), PETIT-DÉJEUNER du plan silencieux (`assumed`).
--   Le total d'hier doit donc porter `assumed`, la plus faible des trois.
-- ⚠️ POUR OBTENIR UN CRÉNEAU LOUPÉ AVEC SON REPÈRE `slot_estimate`, décocher le
--   petit-déjeuner d'hier :
--     update public.protocol_events set disqualified_reason = 'no_time'
--      where source_message_id = 'meal_tick:<plan>:0';
--   ...ou retirer ce plat du plan. Le créneau redevient loupé, le bouton
--   « Décrire » apparaît, et le total prend la base `slot_estimate`.

-- ---------------------------------------------------------------- ② le plancher
-- −1,5 %/semaine sur 14 jours. `restriction_guard` lit `student_body_measures`
-- depuis FF-031 ; le seuil et la forme du `RestrictionSnapshot` n'ont PAS été
-- touchés par ce lot, et ce fichier ne les redéfinit pas — il fabrique la série.
insert into public.student_body_measures (user_id, measured_at, local_date, kind, value_si, source)
select
  '09035000-0000-4000-8000-000000000002'::uuid,
  (current_date - d + time '07:30')::timestamptz,
  current_date - d,
  'weight',
  -- 62,0 kg il y a 14 jours, −1,5 % par semaine.
  round((62.0 * power(0.985, (14 - d) / 7.0))::numeric, 1),
  'plan_card'
from generate_series(14, 0, -1) as d
on conflict do nothing;

-- ---------------------------------------------------------------- ③ la courbe
-- 60 pesées sur 12 mois : environ une tous les six jours, avec du bruit — la
-- variation d'eau est justement ce que la courbe doit rendre lisible.
insert into public.student_body_measures (user_id, measured_at, local_date, kind, value_si, source)
select
  '09035000-0000-4000-8000-000000000003'::uuid,
  (current_date - (n * 6) + time '07:10')::timestamptz,
  current_date - (n * 6),
  'weight',
  round((66.0 + (n * 0.05) + (case when n % 3 = 0 then 0.6 when n % 3 = 1 then -0.4 else 0.1 end))::numeric, 1),
  'plan_card'
from generate_series(0, 59) as n
on conflict do nothing;

-- ---------------------------------------------------------------- restauration
update public.app_config
   set value = (select value from _qa0903s_anon_key)
 where key = 'edge_functions_anon_key';

commit;

-- ===========================================================================
-- CE QU'ON MESURE APRÈS, ET DANS QUEL ORDRE
-- ===========================================================================
-- 1. La porte, AVANT tout. Sur `qa0903s.goal`, `keel-tracking-v1` doit rendre
--    `energy.open = true`. Si elle rend `doctrine_no_counting`, c'est la porte
--    ③ qui ferme sur un élève SANS coach : ce n'est pas un défaut de la page,
--    c'est la condition de doctrine, et il faut publier une doctrine avant de
--    conclure quoi que ce soit sur les chiffres.
-- 2. `qa0903s.goal`, jour d'HIER : trois bases distinctes présentes, total à la
--    plus faible, mention « estimé ». Puis décocher le petit-déjeuner (voir la
--    note plus haut) et vérifier l'apparition du repère `slot_estimate` et du
--    bouton « Décrire ».
-- 3. `qa0903s.floor` : la réponse ne porte NI kcal NI `weight`. Le grep qui le
--    prouve, sur la réponse JSON brute : `"kcal"` absent, `"weight":null`.
-- 4. `qa0903s.curve` : les six fenêtres, à 320 px et à 1280 px, dans les DEUX
--    langues. La fenêtre « 1 sem » ne doit montrer que les pesées de la semaine.
-- 5. Le membre réclamé de `qa0903m` (lane MEMBRE) : ses stats, pas celles du
--    maître. Le plan qu'il voit est le plan `household` de SON foyer.
