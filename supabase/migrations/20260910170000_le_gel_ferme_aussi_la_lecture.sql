-- ============================================================================
-- FF-064 · LE GEL FERME AUSSI LA LECTURE — le renversement, écrit là où
--          l'ancienne règle est écrite
-- ============================================================================
--
-- Amont: 20260811050000 (`keel_household_is_covered`, la définition unique).
--
-- ── CETTE MIGRATION NE CHANGE AUCUNE RÈGLE ────────────────────────────────
-- Elle ne touche ni la fonction, ni ses branches, ni ses droits. Elle réécrit
-- UN COMMENTAIRE, et c'est tout son objet: le commentaire disait quelque chose
-- qui n'est plus vrai, et un commentaire faux sur une fonction de facturation
-- est plus dangereux qu'un commentaire absent — c'est lui qu'on cite pour
-- défaire un chantier qu'on n'a pas lu.
--
-- ── CE QUI EST RENVERSÉ, ET PAR QUI ───────────────────────────────────────
-- Le 2026-09-09, décision du propriétaire: au 8ᵉ jour, TOUT `/app/*` passe
-- derrière l'écran de paiement. Le commentaire de 20260811050000 promettait
-- l'inverse en toutes lettres — « le gel ne ferme que la PRODUCTION: aucune
-- lecture n'en dépend ».
--
-- ⚠️ CE QUI N'A PAS BOUGÉ, ET QU'IL FAUT LIRE AVANT DE « SIMPLIFIER »:
--   · La RÈGLE de couverture est identique. Ce qui a changé, c'est le NOMBRE
--     D'ÉCRANS qui la lisent — un garde de plus (`KeelPaywallGate`), pas une
--     branche de plus ici.
--   · Le mur est de la NAVIGATION. RLS reste la frontière, et les deux refus
--     `402 household_frozen` (`generate-meal-v1`,
--     `generate-household-meal-v1`) restent en place. Les retirer au motif que
--     le front bloque déjà rouvrirait l'API à qui sait faire un `curl` —
--     c'est exactement le défaut que `generate-meal-v1` a dû réparer le
--     2026-08-11, quand le 402 du foyer se contournait par la porte voisine.
--   · `households.free_until` n'est jamais réécrit par un paiement. Le
--     `subscription_data[trial_end]` posé par `stripe-create-checkout-session`
--     est une horloge de FACTURATION, calée sur `free_until + 1 jour`; la
--     branche (c) ci-dessous (`status in ('active','trialing')`) absorbe la
--     bascule sans qu'il existe une seconde horloge d'accès.
--
-- Autorité: docs/fonctionnalites/abonnement-et-facturation/
--           FF-064-le-mur-de-paiement-du-foyer.md

comment on function public.keel_household_is_covered(uuid) is
  'LA DÉFINITION UNIQUE du dépôt: ce foyer a-t-il le droit de PRODUIRE ? '
  'Couvert = aucun essai posé (héritage, branche désarmable) OU l''essai '
  'couvre encore (dernier jour inclus) OU l''abonnement du MAÎTRE est vivant '
  '(active OU trialing — un paiement anticipé naît trialing chez Stripe). '
  'Ne lit PAS subscriptions.tier — même motif que keel_coach_is_solvent: une '
  'erreur de mapping de prix ne doit jamais couper un client qui paie. Un '
  'foyer inconnu rend false. '
  '⟳ RENVERSÉ LE 2026-09-09 (FF-064, décision du propriétaire): ce commentaire '
  'disait « le gel ne ferme que la PRODUCTION: aucune lecture n''en dépend », '
  'et ce n''est plus vrai. KeelPaywallGate referme aussi la LECTURE de tout '
  '/app/*, sauf /app/billing (la sortie), /account (droits RGPD) et /legal. '
  'La règle ICI n''a pas bougé: ce qui a bougé est le nombre d''écrans qui la '
  'lisent. ⚠️ Le mur est de la NAVIGATION — RLS et les deux refus 402 '
  'household_frozen restent la frontière, et les retirer au motif que le front '
  'bloque rouvrirait l''API.';
