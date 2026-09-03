-- KEEL — L'ESSAI DU FOYER PASSE DE TRENTE JOURS À SEPT.
--
-- Amont: 20260811050000 (`keel_household_trial_days()`, le DÉFAUT de
-- `households.free_until`, et le gel).
--
-- ── LA DÉCISION, ET QUI L'A PRISE ─────────────────────────────────────────
-- Décidée par le propriétaire le 2026-09-01, en même temps que le tarif
-- (12,99 € + 1,99 € par accès supplémentaire). Elle RENVERSE deux choses
-- écrites, et il faut lire les deux avant de la défaire:
--
--   1. D4bis posait TRENTE jours. Le nombre n'était pas une mesure, c'était
--      une valeur d'attente — aucun foyer n'a jamais atteint J+30.
--   2. `scratchpad/site/AUDIT-SITE.md` §11 D2 disait « le prix s'affiche, la
--      DURÉE d'essai ne s'affiche pas », précisément parce qu'un essai de
--      trente jours sans chemin de dégel était une promesse qu'on ne pouvait
--      pas tenir. Sept jours ANNONCÉS sur les quatre pages de vente est
--      l'autre moitié de la décision: la durée se dit maintenant, donc elle
--      doit être vraie ici.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS, ET C'EST VOLONTAIRE ───────────────
-- ⛔ AUCUN BACKFILL. `free_until` est POSÉ SUR LA LIGNE à la création, jamais
-- dérivé de `created_at` — c'est la règle de D4bis, et sa raison est qu'un
-- foyer garde ce qui LUI a été promis. Réécrire les lignes existantes
-- retirerait vingt-trois jours à des foyers à qui on avait dit trente. Le
-- nouveau nombre ne vaut donc que pour les foyers NÉS APRÈS cette migration.
--
-- ── LA SECONDE MOITIÉ DU CHANGEMENT EST EN DENO ───────────────────────────
-- `HOUSEHOLD_TRIAL_DAYS` de `supabase/functions/_shared/billing-tier.ts` porte
-- le même nombre, et `_shared/keel/household_freeze_test.ts` lit les DEUX
-- fichiers: il extrait le littéral de la DERNIÈRE définition de cette fonction
-- dans `supabase/migrations` et le compare à la constante. Changer l'un sans
-- l'autre fait rougir la suite, pas la production.
--
-- ⚠️ CE QUE CE LOT NE RÈGLE PAS. Le tunnel de paiement du foyer rend 500 faute
-- de prix Stripe, et un foyer gelé n'a aucun chemin de dégel. Avec sept jours
-- au lieu de trente, ce mur arrive VINGT-TROIS JOURS PLUS TÔT. C'est un
-- bloqueur d'acquisition, pas un défaut de cette migration — mais quelqu'un
-- doit le lire ici avant d'ouvrir une campagne.

create or replace function public.keel_household_trial_days()
returns integer
language sql
immutable
as $function$ select 7 $function$;

comment on function public.keel_household_trial_days() is
  'L''essai d''un foyer, en JOURS. SEPT depuis le 2026-09-01 (trente '
  'auparavant, D4bis). Doit valoir HOUSEHOLD_TRIAL_DAYS de '
  'supabase/functions/_shared/billing-tier.ts — une constante dupliquée entre '
  'deux runtimes dérive, et `_shared/keel/household_freeze_test.ts` lit les '
  'DEUX fichiers pour que ça ne se voie pas seulement en production. Cité par '
  'le défaut de households.free_until, jamais recopié: les foyers créés avant '
  'ce changement gardent les trente jours qui leur avaient été promis.';

-- Le DÉFAUT de `households.free_until` cite la fonction et n'est donc pas
-- retouché ici: il vaut toujours `current_date + keel_household_trial_days()`,
-- et il suit tout seul. Le redéclarer serait un second écrivain de la même
-- règle. La garde de `household_freeze_test.ts` vérifie qu'il existe UNE
-- migration qui le pose — 20260811050000 la porte, elle reste vraie.
