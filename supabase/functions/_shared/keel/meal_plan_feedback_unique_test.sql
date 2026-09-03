-- ============================================================================
-- FF-054 §11 n°2 — « UN SEUL RETOUR DE FIN DE PLAN PAR PLAN », TENU.
--
-- ── LA DETTE QUE CE FICHIER FERME ───────────────────────────────────────────
-- A8.2 a REFERMÉ la question ouverte de FF-054 §11 (« qui répond pour un plan
-- de foyer ? ») en la tranchant par une PROPRIÉTÉ: `meal_plan_feedback` est
-- `unique (meal_id)`, donc le retour est celui de qui a COMPOSÉ, et un membre
-- n'est jamais interrogé. Le journal d'A8.2 nommait la dette dans la même
-- phrase: « la contrainte est une propriété du schéma; AUCUNE garde ne la
-- tient, elle tomberait en silence si on la retirait ».
--
-- ⚠️ ET SON RETRAIT SERAIT SILENCIEUX DEUX FOIS. La contrainte ne se retire pas
-- « par erreur »: elle se retire le jour où quelqu'un veut faire répondre le
-- conjoint aussi, et ce jour-là RIEN dans le produit ne dirait que la décision
-- de FF-054 §11 vient d'être renversée. Le second retour ne planterait pas: il
-- s'écrirait, et `readPlanFeedback` en lirait un des deux — sans que rien ne
-- dise lequel, ni qu'il y en avait deux.
--
-- ── POURQUOI UN PROBE SQL ET PAS UN `grep` DE LA MIGRATION ─────────────────
-- Un test qui lit `unique (meal_id)` sur le disque prouve qu'une CHAÎNE est
-- écrite quelque part, jamais que la base refuse la seconde ligne. Une
-- migration ultérieure qui la retirerait laisserait le grep VERT, puisque la
-- ligne d'origine est toujours dans son fichier. On rejoue donc le geste.
--
-- ⛔ ET LE CAS QUI PASSE EST OBLIGATOIRE. Une garde qu'on ne sait pas faire dire
-- « oui » bloque tout en ressemblant à une garde qui marche.
--
-- USAGE (base locale, table DÉJÀ appliquée):
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -v ON_ERROR_STOP=1 \
--     < supabase/functions/_shared/keel/meal_plan_feedback_unique_test.sql
--
-- ⚠️ TOUT CE FICHIER TOURNE DANS UNE TRANSACTION ANNULÉE, et il n'a PAS de
-- `commit;` — un `commit;` interne fermerait la transaction et le `rollback;`
-- final ne défairait plus rien. C'est le piège mesuré le 2026-09-03: une
-- migration ainsi « validée » s'était réellement appliquée à la base partagée.
-- Vérifier la base APRÈS le run fait partie du protocole, pas de la courtoisie.
-- ============================================================================

\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.assert_eq(label text, got bigint, want bigint)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% : attendu %, obtenu %', label, want, got;
  end if;
  raise notice 'OK  %  (= %)', label, want;
end;
$$;

-- ---------------------------------------------------------------------------
-- LA FIXTURE — deux comptes, UN plan. Deux comptes, parce que la question de
-- FF-054 §11 est « qui répond pour un plan de FOYER »: si la contrainte portait
-- sur `(user_id, meal_id)` au lieu de `meal_id`, le conjoint pourrait répondre
-- à côté du maître et la décision serait renversée sans qu'un seul test tombe.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, instance_id, aud, role)
values
  ('a8330000-0000-4000-8000-000000000001','a833_owner@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('a8330000-0000-4000-8000-000000000002','a833_member@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated');

insert into public.student_generated_meals
  (id, user_id, plan_kind, mode, scope, content_locale, starts_on, duration_days)
values
  ('a8331111-0000-4000-8000-000000000001',
   'a8330000-0000-4000-8000-000000000001',
   'personal','to_shop','several_days','fr-FR', current_date, 3);

-- ---------------------------------------------------------------------------
-- 1. LE CAS QUI PASSE — un retour s'écrit.
-- ---------------------------------------------------------------------------

insert into public.meal_plan_feedback (user_id, meal_id, cooked, content_locale)
values ('a8330000-0000-4000-8000-000000000001',
        'a8331111-0000-4000-8000-000000000001', 'yes', 'fr-FR');
select pg_temp.assert_eq('01 un retour de fin de plan s''écrit',
  (select count(*) from public.meal_plan_feedback
    where meal_id = 'a8331111-0000-4000-8000-000000000001'), 1);

-- ---------------------------------------------------------------------------
-- 2. ⛔ LE MÊME COMPTE NE PEUT PAS EN ÉCRIRE UN SECOND.
-- ---------------------------------------------------------------------------

do $$
begin
  insert into public.meal_plan_feedback (user_id, meal_id, cooked, content_locale)
  values ('a8330000-0000-4000-8000-000000000001',
          'a8331111-0000-4000-8000-000000000001', 'partly', 'fr-FR');
  raise exception '02 FF-054 §11: un SECOND retour a pu s''écrire sur le même plan';
exception
  when unique_violation then
    raise notice 'OK  02 un second retour du même compte est refusé (23505)';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. ⛔ ET UN AUTRE COMPTE NON PLUS — C'EST TOUTE LA DÉCISION DE FF-054 §11.
--
--    C'est CE cas qui distingue `unique (meal_id)` de `unique (user_id,
--    meal_id)`. Le membre du foyer n'est jamais interrogé sur le plan commun:
--    ce retour gouverne la composition SUIVANTE (style, rejets, difficulté),
--    c'est un geste de celui qui COMPOSE, et « une seule personne gouverne le
--    menu ». Ce qui remonte du membre passe par ses FAITS — ses coches, ses
--    photos, le sort de sa boîte —, jamais par un avis: un fait n'a pas besoin
--    d'être arbitré.
-- ---------------------------------------------------------------------------

do $$
begin
  insert into public.meal_plan_feedback (user_id, meal_id, cooked, content_locale)
  values ('a8330000-0000-4000-8000-000000000002',
          'a8331111-0000-4000-8000-000000000001', 'no', 'fr-FR');
  raise exception
    '03 FF-054 §11: un AUTRE compte a pu écrire un retour sur le même plan — '
    'la contrainte porte sur (user_id, meal_id) et non sur meal_id seul, et la '
    'décision « un seul retour par plan » est renversée';
exception
  when unique_violation then
    raise notice 'OK  03 un retour d''un AUTRE compte est refusé (23505)';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Et il reste UNE ligne, celle du premier: rien n'a été écrasé au passage.
--    Un `on conflict do update` posé un jour sur cette table rendrait les deux
--    refus ci-dessus verts tout en laissant le SECOND retour gagner.
-- ---------------------------------------------------------------------------

select pg_temp.assert_eq('04 une seule ligne, et c''est la PREMIÈRE',
  (select count(*) from public.meal_plan_feedback
    where meal_id = 'a8331111-0000-4000-8000-000000000001'
      and cooked = 'yes'
      and user_id = 'a8330000-0000-4000-8000-000000000001'), 1);
select pg_temp.assert_eq('04b et rien d''autre sur ce plan',
  (select count(*) from public.meal_plan_feedback
    where meal_id = 'a8331111-0000-4000-8000-000000000001'), 1);

rollback;
