-- ============================================================================
-- FF-039 · LES VERDICTS DE COMPOSITION, EN OBSERVATION
--
-- Fiche: docs/fonctionnalites/composition-des-repas/FF-039-enveloppes-et-verdicts-en-observation.md
-- Design d'origine: scratchpad/DESIGN-UNITES-DE-COMPOSITION.md §2.4
--
-- CE QUE CETTE TABLE EST, ET CE QU'ELLE N'EST PAS
-- -----------------------------------------------
-- C'est un JOURNAL DE MESURE. Rien ne le lit en retour: aucun retry, aucun
-- jeton de correction, aucune consigne changée. La sortie du parseur est
-- identique avec et sans cette écriture, et un test le prouve par égalité
-- profonde.
--
-- Ce qu'elle rend possible: répondre à « le produit compose-t-il bien ? » avec
-- des chiffres plutôt qu'avec une impression, AVANT d'armer la boucle de
-- correction. Ce dépôt a une cicatrice nommée pour l'inverse — une ceinture
-- armée sur un coffre vide.
--
-- ENVELOPE_MODE EST ÉCRIT SANS SA RAISON, ET C'EST LA GARDE
-- ---------------------------------------------------------
-- La colonne dit `per_portion`; elle ne dit JAMAIS pourquoi. Un élève sous
-- plancher TCA et un élève dont on ne connaît pas le corps produisent la même
-- valeur, par la MÊME branche de `envelopeFor` — les deux populations sont
-- mélangées par construction, et c'est ce qui rend la déduction fausse plutôt
-- que simplement interdite.
--
-- Le statut de restriction se DÉRIVE à la lecture (`evaluateRestrictionForStudent`,
-- restriction_runtime.ts), comme partout ailleurs dans le produit. Une colonne
-- `envelope_reason` serait une étiquette permanente sur un élève.
--
-- AUCUN CHIFFRE D'ÉNERGIE NI DE MACRO N'EST STOCKÉ
-- ------------------------------------------------
-- Le `verdict` jsonb porte des MOTS (`within` / `above` / `below` /
-- `not_computable`, `met` / `under`). Le calcul en grammes existe — c'est lui
-- qui distingue « eggs » à 6 g d'une vraie ancre — mais il ne franchit pas
-- cette frontière. Ce qui est stocké est ce qu'on aura le droit d'agréger, et
-- un nombre stocké finit toujours par être agrégé puis montré.
-- ============================================================================

create table if not exists public.meal_composition_verdicts (
  id uuid primary key default gen_random_uuid(),

  -- LA RÉCLAMATION RGPD, ET ELLE EST ICI. Contrairement à
  -- `food_composition_refs` (donnée de référence, aucun user_id, absence
  -- documentée dans sa propre migration), cette table référence les repas d'un
  -- élève. `on delete cascade` la fait donc réclamer par la suppression de
  -- compte, et `account-export-v1` la liste nommément pour l'export.
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid not null references public.student_generated_meals(id) on delete cascade,

  -- La forme `CompositionVerdict` (meal_verdict.ts). Des MOTS, jamais des
  -- chiffres d'énergie ou de macro.
  verdict jsonb not null,

  -- SANS LA RAISON. Voir l'en-tête: c'est la garde de cette table.
  envelope_mode text not null check (envelope_mode in ('per_kg', 'per_portion')),

  -- CE QUE LA MESURE VALAIT CE JOUR-LÀ. Sans elle, un verdict `not_computable`
  -- est indiscernable d'un plat mal composé — alors que c'est le RÉFÉRENTIEL
  -- qui n'a pas su lire, et que le remède est une passe de curation d'alias.
  resolution_coverage numeric not null check (resolution_coverage >= 0 and resolution_coverage <= 1),

  -- LA WORKLIST, PAR REPAS. C'est elle qui pilote la curation, et c'est la
  -- seule raison pour laquelle des termes bruts sont stockés. Ce sont des noms
  -- d'ALIMENTS écrits par le modèle, pas des mots de l'élève.
  unresolved_terms text[] not null default '{}',

  -- LES DEUX VERSIONS QUI RENDENT UNE MESURE COMPARABLE. Un verdict n'a de
  -- sens que rapporté à la consigne qui l'a produit et à la doctrine qui
  -- gouvernait: sans elles, les populations d'avant et d'après un bump se
  -- mélangent dans la même colonne et la mesure devient impossible à faire
  -- après coup.
  prompt_version text,
  doctrine_version integer,

  created_at timestamptz not null default now()
);

comment on table public.meal_composition_verdicts is
  'FF-039: journal de mesure de la composition, ÉCRIT ET JAMAIS ACTIONNÉ. '
  'Service-role uniquement. envelope_mode est stocké SANS sa raison: le statut '
  'de restriction se dérive à la lecture, jamais ne s''écrit. Aucun chiffre '
  'd''énergie ni de macro n''y entre — le verdict est en mots.';

comment on column public.meal_composition_verdicts.envelope_mode is
  'per_kg | per_portion, SANS la raison. Un élève sous plancher TCA et un '
  'élève au corps inconnu produisent la même valeur par la même branche de '
  'envelopeFor: les deux populations sont mélangées par construction.';

comment on column public.meal_composition_verdicts.unresolved_terms is
  'Les termes que le référentiel n''a pas su résoudre, pour ce repas. C''est '
  'la worklist de curation d''alias. Des noms d''ALIMENTS écrits par le '
  'modèle, jamais des mots de l''élève.';

-- La seule lecture qui existe: les verdicts d'un élève, ou ceux d'un repas.
create index if not exists meal_composition_verdicts_user_idx
  on public.meal_composition_verdicts (user_id, created_at desc);
create index if not exists meal_composition_verdicts_meal_idx
  on public.meal_composition_verdicts (meal_id);

-- ---------------------------------------------------------------------------
-- LES GRANTS — service-role, et rien d'autre
--
-- Supabase accorde TOUT à `authenticated` sur toute table neuve, TRUNCATE
-- compris, et TRUNCATE échappe à RLS. `revoke ... from public` ne retire PAS
-- les privilèges d'`anon`, qui les tient de son propre grant. Les deux sont
-- retirés nommément.
--
-- RLS activée SANS POLITIQUE: `service_role` la contourne, tout le reste se
-- heurte à un mur. L'élève n'a rien à lire ici (le verdict ne lui est jamais
-- montré), et le coach non plus — les agrégats qu'il verra un jour porteront
-- le plancher d'anonymat k=5 (arbitrage A4) et seront construits ailleurs.
-- ---------------------------------------------------------------------------
revoke all on table public.meal_composition_verdicts from anon, authenticated;
alter table public.meal_composition_verdicts enable row level security;
