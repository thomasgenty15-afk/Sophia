# Vérification du paiement et du gel du foyer — 2026-09-15, 17 h

Demandée par le propriétaire après le verdict bêta (« est-ce que tout est bien au niveau du paiement ? »).
Réponse courte : **la chaîne gel ↔ abonnement tient, rejouée en local ; la vente, elle, ne peut pas
commencer, parce que les deux prix Stripe n'existent pas.** Deux décisions prises le même jour :
le profil réclamé vaut **1,99 €** ; **le gel coupe toute la production**.

## 1. Ce qui a été rejoué, sans un appel modèle ni un appel Stripe

Fixture : le foyer du banc `lotf.gain.n2preuve1@keeltest.dev` (maître + une bouche), essai posé à J+7 à la
création. Le frein de bêta (`keel_generation_pause`) est **armé** pendant tout le rejeu : un foyer admis rend
`503 generation_paused` — l'admission est passée, rien n'est composé — et un foyer gelé rend `402
household_frozen` **avant** le frein. Les événements Stripe sont signés avec le secret local du webhook.
Script : `scratchpad/2026-09-15-BETA-PREUVES/tunnel-paiement.sh` ; sortie : `tunnel-paiement-2026-09-15.txt`.

| étape | état posé | `keel_household_is_covered` | `generate-household-meal-v1` |
|---|---|---:|---|
| ① départ | essai à J+7 | true | 503 `generation_paused` (admis) |
| ② essai expiré | `free_until` = hier | false | **402 `household_frozen`** |
| ③ le maître paie | webhook `customer.subscription.created` (active, +30 j) → 200, ligne `subscriptions` active | true | 503 (réadmis) |
| ④ résiliation | webhook `customer.subscription.deleted` (canceled) → 200, ligne `canceled` | false | **402** |
| ⑤ dernier jour d'essai | `free_until` = aujourd'hui | true | 503 (dernier jour inclus) |
| ⑥ l'écran | `keel_household_my_coverage` vu par le maître | `{covered:true, frozen:false, role:owner, free_until}` | — |
| remise en état | `free_until` J+7 restauré, ligne d'abonnement du rejeu retirée, frein relâché | | |

Tests qui tiennent la même chose hors ligne : `household_freeze_test.ts`, `lifecycle_trial_test.ts`,
`solo_access_test.ts`, `stripe-reconcile-households/reconcile_test.ts` (48 verts) ; à l'écran
`paywallGate`, `trialBanner`, `edgeErrors` (38 verts).

## 2. Ce qui bloque la vente — et ce n'est pas du code

`GET /v1/prices/{id}` avec la clé de test du dépôt rend **« No such price »** pour les deux identifiants
`STRIPE_PRICE_ID_HOUSEHOLD_MONTHLY` et `STRIPE_PRICE_ID_HOUSEHOLD_PROFILE_MONTHLY` de `supabase/.env`. Soit
les prix ont été créés dans un autre compte, soit ils n'ont jamais été créés. Conséquence : le tunnel
(`stripe-create-checkout-session`, plan `keel_household`) ne peut pas ouvrir de session, même en test.
Tant que ce n'est pas fait, un foyer sans date de fin d'essai compte comme couvert et **la bêta est
gratuite de fait** — ce qui peut être voulu, mais doit être dit.

Les gestes humains de FF-049 § 7, inchangés et dans l'ordre : créer les deux prix (**12,99 €** foyer,
**1,99 €** profil réclamé — tranché aujourd'hui, la fiche disait 2,00 €), poser les deux identifiants en
secrets, `db push`, déployer `stripe-create-checkout-session` et `stripe-reconcile-households`, et le jour
du branchement seulement, poser `free_until` sur les foyers existants.

## 3. Ce qui a été fermé aujourd'hui

**Le trou n° 7 de FF-049.** Les deux crons de production vivants — `keel-weekly-flow-v1` (le bilan de la
semaine, rangé) et `keel-reengage-v1` (la relance) — tournaient à l'identique sur un foyer gelé.
`householdProductionGate` (`_shared/keel/household_production_gate.ts`) lit
`keel_household_coverage_for_user` et fait sauter le compte gelé **avant** de produire ; le saut se compte
(`household_frozen`), une couverture illisible passe et se compte (`household_coverage_unreadable`), même
arbitrage que l'admission du générateur : une erreur de lecture ne coupe jamais quelqu'un qui paie. Cinq
tests, dont le câblage des deux crons par lecture de leur source. La **lecture** des plans, courses et
recettes n'est pas touchée (R12).

## 4. Ce qui n'a pas été exercé, et pourquoi

- `stripe-create-checkout-session` et `stripe-create-portal-session` avec le vrai Stripe : impossibles sans
  les prix ; le test d'intégration du dépôt (`stripe_subscriptions_test.ts`) crée des clients Stripe de test
  et n'a pas été lancé pour ça.
- `stripe-reconcile-households` en réel (mise à jour de la quantité de profils réclamés chez Stripe) :
  tenu par ses tests unitaires seulement ; il faut un abonnement réel pour l'exercer.
- Le webhook en prod : la signature est vérifiée par `_shared/stripe.ts` (tests), et
  `MEGA_TEST_MODE` est ignoré hors pile locale (SEC-08) ; non rejoué en prod.
