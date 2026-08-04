-- ===========================================================================
-- PLAN-INPUTS — la direction du plan, et le corps auquel il s'adresse.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS, ET POURQUOI C'EST LE POINT
-- -------------------------------------------------------------
-- Elle n'ajoute PAS `birth_date`. Le chantier partait de « l'âge n'est nulle
-- part, aucune colonne, vérifié sur toutes les migrations ». C'est faux:
-- `profiles.birth_date date` est déclarée depuis `20260522143735_squashed_
-- schema.sql:4652`, jamais droppée, et déjà servie par le lifecycle RGPD
-- (`account-export-v1` la sélectionne et la rend; la purge l'emporte avec
-- `profiles` en cascade du delete auth).
--
-- Ajouter une colonne qui existe est au mieux un no-op; en pratique c'est la
-- porte d'entrée d'une seconde source de vérité, qu'un jour un lecteur choisit
-- au hasard. Ce qui manquait n'était pas la colonne: c'est que PERSONNE ne
-- demandait la date à un élève KEEL, et que rien ne décidait ce qu'on fait d'un
-- mineur. Ça se répare en TypeScript et en UI, pas en DDL.
--
-- Restent trois transformations, et elles servent toutes le même besoin: que la
-- direction de l'élève soit visible par son coach.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. UN MINEUR EST UNE ESCALADE, PAS UN LOG
-- ---------------------------------------------------------------------------
-- La décision (voir `_shared/keel/student_age.ts`): on BLOQUE la génération de
-- plan et on PRÉVIENT LE COACH, parce qu'un accompagnement nutritionnel de
-- mineur relève de son cadre professionnel et pas du nôtre.
--
-- Le canal est `contract_change_requests`, et c'est une réutilisation, pas une
-- invention: c'est déjà le chemin de `restriction_signal`, il a déjà des
-- écrivains vivants, et la synthèse hebdo du coach le lit déjà
-- (`coach_synthesis_io.ts:117`). Un second canal d'alerte serait un canal que
-- personne ne regarde — ce dépôt a déjà payé « la boucle à moitié construite ».
--
-- `immediate`: la question « ai-je le droit d'accompagner cette personne » ne
-- s'accumule pas jusqu'à dimanche.
alter table public.contract_change_requests
  drop constraint if exists contract_change_requests_reason_code_check;

alter table public.contract_change_requests
  add constraint contract_change_requests_reason_code_check
  check (reason_code = any (array[
    'too_much_food', 'not_enough_food', 'schedule_conflict', 'dislikes_food',
    'travel', 'budget', 'symptom', 'social_event', 'allergen_violation',
    'restriction_signal',
    -- NOUVEAU. Nommé par ce qu'il EST, pas par ce qu'il déclenche: un code
    -- `plan_blocked` ne dirait pas au coach de quoi il s'agit, et c'est lui
    -- qui doit trancher.
    'minor_student',
    'other'
  ]));

-- ---------------------------------------------------------------------------
-- 2. LE COACH LIT LA DIRECTION DE SON ÉLÈVE (P5)
-- ---------------------------------------------------------------------------
-- `student_goals` n'avait qu'une politique: `student_goals_owner_all`. Le coach
-- ne pouvait donc PAS lire l'objectif de son propre élève — la page
-- `/coach/clients/:id` aurait affiché un vide indiscernable d'un élève sans
-- objectif.
--
-- LECTURE SEULE, délibérément. Amendement 2 de PLAN-NUIT: en 1:N le coach écrit
-- UN programme et une doctrine, c'est l'élève qui compose sa semaine. La
-- direction appartient à l'élève; le coach la VOIT (c'est utile pour sa
-- cohorte), il ne l'approuve pas et ne la corrige pas. Une politique `for all`
-- ici rendrait possible, un jour, un coach qui « ajuste » l'objectif de son
-- élève — exactement le modèle 1:1 dont le pivot est sorti.
--
-- Même prédicat que `weekly_reviews_select_coach`: `coached_student_ids()` est
-- STABLE SECURITY DEFINER et ne rend que les liens actifs des deux côtés.
drop policy if exists student_goals_select_coach on public.student_goals;
create policy student_goals_select_coach
  on public.student_goals
  for select
  to authenticated
  using (
    user_id = any ((select public.coached_student_ids())::uuid[])
  );

-- ---------------------------------------------------------------------------
-- 3. L'ÂGE AU COACH — DÉRIVÉ, JAMAIS LA DATE
-- ---------------------------------------------------------------------------
-- `coach_student_directory` est une vue à allowlist de colonnes qui exclut
-- EXPRÈS la date de naissance (« never email, phone, birth date or any billing
-- column »). Le P5 demande « l'âge ».
--
-- On rend donc l'ÂGE, calculé, et jamais `birth_date`. Une date de naissance
-- est une donnée d'identité — elle sert à ouvrir des comptes ailleurs; un âge
-- est ce dont le coach a besoin pour accompagner. Élargir l'allowlist à la date
-- pour servir un besoin d'âge serait céder plus que ce que la question demande,
-- dans la vue précisément écrite pour ne pas le faire.
--
-- `age_years` est null quand la date est absente (le cas de tous les élèves
-- d'avant ce chantier) — la page l'affiche comme « non renseigné », ce qui est
-- vrai, plutôt que comme un âge de zéro.
--
-- Arithmétique de calendrier (`age(...)`), pas une division par 365.25, pour
-- la même raison que le module TypeScript: le seul jour où l'exactitude compte
-- est un anniversaire.
create or replace view public.coach_student_directory
with (security_invoker = off) as
  select
    p.id,
    p.full_name,
    p.avatar_url,
    p.timezone,
    p.locale,
    case
      when p.birth_date is null then null
      -- Une date future ou aberrante ne devient pas un âge négatif affiché au
      -- coach: elle vaut « on ne sait pas », comme côté TypeScript
      -- (`weekPlanAgeGate` -> `unusable_birth_date`).
      when p.birth_date > current_date then null
      when extract(year from age(current_date, p.birth_date)) > 120 then null
      else extract(year from age(current_date, p.birth_date))::int
    end as age_years
  from public.profiles p
  where p.id = any ((select public.coached_student_ids())::uuid[]);

comment on view public.coach_student_directory is
  'Allowlist de colonnes pour la lecture coach. JAMAIS email, telephone, '
  'date de naissance, ni colonne de facturation. `age_years` est DERIVE de '
  'birth_date, qui ne sort pas d''ici.';

-- La vue est SECURITY DEFINER (security_invoker=off) et porte son propre filtre
-- `coached_student_ids()`. `anon` n'a rien à y faire: `revoke ... from public`
-- ne suffirait pas, les default privileges Supabase ayant déjà accordé le
-- SELECT à `anon` et `authenticated` nommément.
revoke all on public.coach_student_directory from anon;
grant select on public.coach_student_directory to authenticated;
