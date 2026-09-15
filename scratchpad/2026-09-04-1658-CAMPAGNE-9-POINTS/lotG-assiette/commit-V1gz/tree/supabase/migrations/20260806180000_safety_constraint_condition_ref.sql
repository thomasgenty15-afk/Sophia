-- LA MALADIE DÉCLARÉE A ENFIN OÙ S'ÉCRIRE.
--
-- ── LE DÉFAUT MESURÉ (campagne QA du 2026-08-05, run réel) ──────────────────
-- Élève : « je suis diabétique de type 2, je mange quoi ? »
-- Base   : `select count(*) from student_safety_constraints` → 0
--
-- La table portait pourtant déjà `kind = 'medical'` dans son CHECK. Ce qui
-- manquait était l'IDENTIFIANT: `student_safety_constraints_ref_check` exige
-- qu'au moins un de `allergen_ref` / `substance_ref` / `medication_class` soit
-- non nul, et un diabète n'est aucun des trois. Le `kind` existait, la ligne
-- était structurellement impossible à insérer. Une déclaration médicale n'était
-- donc ni déférée ni persistée, et rien en aval — génération de plan, doctrine,
-- synthèse coach — ne pouvait savoir.
--
-- ── POURQUOI UNE COLONNE, ET PAS UN DÉTOURNEMENT ───────────────────────────
-- Écrire un diabète dans `substance_ref` aurait marché et menti: `substance_ref`
-- désigne une substance ingérée, il est lu comme tel par
-- `medicalConstraintTokens` et par le compilateur de protocole. Une maladie
-- n'est pas une substance, et le jour où quelqu'un filtre les substances il
-- récolterait des maladies sans le savoir.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS ─────────────────────────────────────
-- Elle n'ouvre AUCUNE policy. La table n'en a toujours aucune en écriture: tout
-- passe par service_role après vérification de propriété, ou par la fonction
-- SECURITY DEFINER de rétractation (migration 20260803160000). Rien de ce qui
-- suit ne change ce contrat.

alter table public.student_safety_constraints
  add column if not exists condition_ref text;

comment on column public.student_safety_constraints.condition_ref is
  'Jeton de MALADIE déclarée (liste fermée de _shared/keel/medical_condition_floor.ts : diabetes, coeliac_disease, hypertension, …). Distinct de substance_ref, qui désigne une substance ingérée. Non nul uniquement quand kind = ''medical''.';

-- LE CHECK D'IDENTIFIANT accueille la quatrième colonne. Sans ça, la ligne
-- reste rejetée et la colonne ne sert à rien — c'est la moitié qui manquait.
alter table public.student_safety_constraints
  drop constraint if exists student_safety_constraints_ref_check;

alter table public.student_safety_constraints
  add constraint student_safety_constraints_ref_check
  check (
    allergen_ref is not null
    or substance_ref is not null
    or medication_class is not null
    or condition_ref is not null
  );

-- L'UNICITÉ DE L'ACTIF suit la même extension. Sans elle, deux déclarations
-- successives du même diabète produiraient deux lignes actives, et le
-- `23505` sur lequel s'appuie l'insert (« déjà déclaré, on relit au lieu de
-- doubler ») ne se déclencherait jamais.
drop index if exists public.student_safety_constraints_active_unique_idx;

create unique index student_safety_constraints_active_unique_idx
  on public.student_safety_constraints (
    user_id,
    kind,
    coalesce(allergen_ref, ''),
    coalesce(substance_ref, ''),
    coalesce(medication_class, ''),
    coalesce(condition_ref, '')
  )
  where status = 'active';
