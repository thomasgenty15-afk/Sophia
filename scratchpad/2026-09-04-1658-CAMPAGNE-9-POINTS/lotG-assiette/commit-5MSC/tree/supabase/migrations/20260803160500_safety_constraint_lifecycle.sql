-- QA agent 4 (2026-08-03) — LE CYCLE DE VIE D'UNE CONTRAINTE DURE.
--
-- Deux trous mesurés en conditions réelles, et ils sont symétriques:
--
--   1. ÉCRITURE. `student_safety_constraints` avait SIX lecteurs armés en
--      production (run.ts à chaque tour, generate-week-plan-v1, la ceinture de
--      sortie, plan_question, l'export RGPD) et ZÉRO écrivain. Le seul INSERT
--      du dépôt vivait dans `simulated_week_test.ts`. Un élève qui déclarait
--      « I'm allergic to peanuts. Anaphylactic, I carry an EpiPen. » recevait
--      « Noted. That's important, and I'll keep it in mind. » et la base
--      restait vide. La ceinture la plus soignée du produit verrouillait un
--      coffre que rien ne pouvait remplir.
--
--   2. RÉTRACTATION. « Actually I'm NOT allergic to peanuts, that was my
--      sister » ne retirait rien, et ne pouvait rien retirer: la table n'a
--      aucune notion d'état. La ligne survivait à la correction, indéfiniment.
--
-- CETTE MIGRATION NE RÉPARE QUE (2) — l'écrivain est du code
-- (`tools/always_on/declare_safety_constraint/`). Elle donne à la table ce qui
-- lui manque pour qu'une rétractation soit REPRÉSENTABLE.
--
-- ---------------------------------------------------------------------------
-- POURQUOI INVALIDER ET NON SUPPRIMER
--
-- Un DELETE serait plus simple et il est le mauvais choix ici, pour trois
-- raisons qui tiennent toutes à la nature médicale de la donnée:
--
--   * Une allergie déclarée puis retirée est un ÉVÉNEMENT CLINIQUE. Si l'élève
--     se rétracte à tort — ou si quelqu'un d'autre parle à sa place — on doit
--     pouvoir dire quand la contrainte a existé et ce qui l'a levée. Un DELETE
--     rend cette question définitivement sans réponse.
--   * Les messages déjà envoyés SOUS la contrainte restent explicables. C'est
--     le même raisonnement que le rollback de doctrine, qui CRÉE une version
--     plutôt que de déplacer un pointeur: des élèves ont reçu des messages
--     sous v2, une timeline où v2 n'a jamais existé est un mensonge.
--   * `superseded_by` permet la CORRECTION (« ce n'est pas l'arachide, c'est
--     la noix de cajou ») sans perdre le lien entre les deux.
--
-- Le lecteur ne change pas de contrat pour autant: `loadStudentSafetyConstraints`
-- filtre `status='active'`, donc une contrainte rétractée cesse de mordre au
-- tour suivant — ce que la rétractation demandait.
-- ---------------------------------------------------------------------------

alter table public.student_safety_constraints
  add column if not exists status text not null default 'active'
    check (status in ('active', 'retracted')),
  add column if not exists retracted_at timestamptz,
  add column if not exists retracted_reason text,
  add column if not exists superseded_by_constraint_id uuid
    references public.student_safety_constraints(id) on delete set null,
  -- D'où vient la ligne. `source_message_id` rend la contrainte traçable
  -- jusqu'au tour qui l'a créée: « pourquoi tu crois ça ? » doit avoir une
  -- réponse, et pour une donnée médicale c'est un minimum.
  add column if not exists source_message_id text;

-- Anti-incohérence, même patron que `student_facts`: un état 'retracted' EXIGE
-- sa date. Sans ce CHECK, un bug d'écriture produirait une contrainte
-- désarmée dont personne ne peut dire quand elle l'a été.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_safety_constraints'::regclass
      and conname = 'student_safety_constraints_retracted_check'
  ) then
    alter table public.student_safety_constraints
      add constraint student_safety_constraints_retracted_check
      check (status <> 'retracted' or retracted_at is not null);
  end if;
end $$;

-- Le chemin de lecture chaud: chaque tour de chaque élève fait exactement
-- cette requête. L'index existant porte (user_id); on le remplace par un index
-- partiel sur les seules lignes actives, qui est ce que le loader demande.
create index if not exists student_safety_constraints_user_active_idx
  on public.student_safety_constraints (user_id)
  where status = 'active';

-- Idempotence de l'intake conversationnel, au SCHÉMA et pas dans un
-- « est-ce que j'ai déjà vu ce message ? » côté client qui court contre
-- lui-même (leçon `subscription-confirmation-messages`). Deux livraisons du
-- même tour ne créent pas deux fois l'allergie.
create unique index if not exists student_safety_constraints_source_message_idx
  on public.student_safety_constraints (user_id, source_message_id)
  where source_message_id is not null;

comment on column public.student_safety_constraints.status is
  'QA agent 4: une rétractation INVALIDE (audit clinique), elle ne supprime pas. '
  'Les lecteurs filtrent status=''active''.';

-- ---------------------------------------------------------------------------
-- LA RÉTRACTATION PASSE PAR UNE FONCTION, PAS PAR UNE POLICY UPDATE
--
-- La table n'a que trois policies: owner_insert, owner_read, select_coach. Il
-- n'existe AUCUNE policy UPDATE — c'est la doctrine de tenancy KEEL (« l'élève
-- est SELECT-only, les écritures passent par le serveur »), et la première
-- version de cet intake s'y est cassé le nez en run réel: l'UPDATE touchait
-- zéro ligne et remontait « Cannot coerce the result to a single JSON object ».
--
-- La tentation est d'ajouter `for update to authenticated using (auth.uid() =
-- user_id)`. C'est le mauvais correctif, et le dépôt l'a déjà tranché pour
-- `coach_syntheses`: RLS ne restreint pas les COLONNES. Une policy UPDATE
-- laisserait un élève réécrire `severity`, `allergen_ref` ou `kind` sur ses
-- propres lignes via PostgREST — donc dégrader silencieusement une allergie
-- `medical` en `preference` et désarmer la ceinture de sortie, sans que rien
-- ne le distingue d'une rétractation légitime.
--
-- Cette fonction est strictement plus étroite: elle ne peut faire QUE poser
-- status='retracted' sur UNE ligne active de l'appelant. `search_path` est
-- épinglé (SECURITY DEFINER sans ça est une escalade de privilèges), et la
-- clause `user_id = auth.uid()` est DANS la requête — pas dans une policy que
-- le DEFINER contournerait.
-- ---------------------------------------------------------------------------

create or replace function public.retract_student_safety_constraint(
  p_constraint_id uuid,
  p_reason text default null
) returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.student_safety_constraints
     set status = 'retracted',
         retracted_at = now(),
         retracted_reason = left(coalesce(p_reason, ''), 500)
   where id = p_constraint_id
     and user_id = (select auth.uid())
     and status = 'active'
  returning id;
$$;

revoke all on function public.retract_student_safety_constraint(uuid, text) from public;
grant execute on function public.retract_student_safety_constraint(uuid, text)
  to authenticated, service_role;

comment on function public.retract_student_safety_constraint(uuid, text) is
  'QA agent 4: seule voie d''écriture d''une rétractation. Volontairement plus '
  'étroite qu''une policy UPDATE, qui laisserait réécrire severity/allergen_ref '
  '(RLS ne restreint pas les colonnes) — donc désarmer une allergie medical.';
