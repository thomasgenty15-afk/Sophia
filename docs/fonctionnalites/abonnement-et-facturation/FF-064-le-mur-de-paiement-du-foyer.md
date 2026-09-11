# FF-064 · Le mur de paiement du foyer

| | |
|---|---|
| **Identifiant** | `FF-064-le-mur-de-paiement-du-foyer` |
| **Statut** | 🟠 **En cours** — le code est écrit, testé et vérifié à l'écran. Il reste **trois gestes humains** (§8), dont un qui bloque toute vente : les deux prix Stripe du foyer n'existent pas dans le compte de test. |
| **Date** | 2026-09-09 |
| **Autorité produit** | [le-foyer/README.md](../le-foyer/README.md) · [FF-049](../le-foyer/FF-049-le-prix-du-foyer.md) · [PIVOT-FOYER.md](../../keel/PIVOT-FOYER.md) |
| **Dépend de** | [FF-049](../le-foyer/FF-049-le-prix-du-foyer.md) — le prix et le gel · [FF-048](../le-foyer/FF-048-reclamer-son-profil.md) — le profil réclamé est l'unité facturée |
| **Effort** | 3 jours, hors gestes humains |

---

## 1. Le problème

Tout le socle Stripe du foyer existait, était testé, et **ne vendait rien**.

Mesuré le 2026-09-09, en se promenant dans le produit connecté :

- **Payer pendant l'essai était refusé.** `stripe-create-checkout-session`
  rendait `409 household_in_trial` tant que `free_until` couvrait. Comme l'app
  ne fonctionne plus une fois l'essai fini, il n'existait **aucune fenêtre**
  où quelqu'un pouvait donner sa carte de son plein gré.
- **Rien n'avertissait avant la coupure.** `free_until` traversait jusqu'au
  navigateur (`loadMyHouseholdCoverage`) et **n'avait aucun lecteur**.
- **L'app ne se bloquait jamais.** `/app/*` n'était enveloppé par aucun garde
  d'abonnement — `App.tsx` l'écrivait explicitement. Le seul mur du dépôt
  (`ExpiredAccessPanel`) ne couvrait que `/upgrade` et `/account`.
- **Le seul point de vente in-app était enfoui** dans une carte de
  `/app/household` qui n'apparaissait qu'**une fois déjà coupé** ; et
  `/upgrade` vendait `system` / `alliance` / `architecte`, trois paliers
  supprimés.

**Ce que ça coûte de ne rien faire.** Sept jours d'essai, puis un produit qui
s'arrête sans avoir jamais demandé d'argent — et personne ne peut le débloquer
sans écrire au support.

## 2. Job stories

> **Quand** j'ai testé le produit trois jours et que ça me plaît, **je veux**
> pouvoir m'abonner tout de suite, **pour ne pas** avoir à y repenser au moment
> où j'en aurai besoin.

> **Quand** ma semaine offerte se termine demain, **je veux** l'apprendre avant
> la coupure, **pour que** ma semaine de repas ne s'arrête pas un mardi soir.

> **Quand** mon foyer est en pause, **je veux** voir tout de suite comment le
> relancer, **pour ne pas** croire que le produit est en panne.

## 3. Périmètre

### Dans le périmètre
- Une page d'abonnement, `/app/billing`, dans le menu sous « Compte ».
- Le paiement anticipé, avec la semaine offerte **tenue** : `trial_end` chez
  Stripe.
- Le mur : au 8ᵉ jour, tout `/app/*` passe derrière l'écran de paiement.
- L'avertissement in-app à J-2 et J-1.
- **L'accès personnel supplémentaire**, vendu depuis la page d'abonnement :
  on choisit la personne, on l'invite, et le montant s'ajoute quand elle réclame.

### Hors périmètre — engageant
- ❌ **Aucun annuel foyer.** Les deux prix sont mensuels, et
  `stripe-create-checkout-session` refuse `yearly` par schéma.
- ❌ **Aucun palier.** Un seul produit, un seul prix, plus un accès
  supplémentaire.
- ❌ **Le membre réclamé ne paie jamais.** Le 403 `not_household_owner` reste,
  et l'écran le **dit** au lieu de le laisser découvrir.
- ❌ **Aucune prolongation d'essai en libre-service.**
- ❌ **Le mur ne ferme pas `/account`.** Export, suppression et restauration
  sont des droits RGPD : ils restent atteignables d'un foyer impayé.
- ❌ **Aucun e-mail.** Il est couvert par le chantier de cycle de vie
  (`keel-lifecycle-email-v1`, FF-063), écrit en parallèle. Deux fonctions
  d'e-mail sur la même colonne, ce sont deux crons et un risque de double envoi.

## 4. Le circuit

```
J0 ─── J4        rien à l'écran
J5 (J-2)         bandeau, avec une croix — le rejet vaut pour la journée
J6 (J-1)         bandeau, SANS croix — la coupure est demain
J7               dernier jour COUVERT (free_until inclus)
J8               le mur: /app/* → PaywallPanel; seule /app/billing ouvre

à tout moment    /app/billing → « M'abonner »
                 → Stripe (trial_end = free_until + 1 j, 00:00 UTC)
                 → webhook: subscriptions.status='trialing', tier='household'
                 → keel_household_is_covered branche (c) ⇒ couvert, sans trou
```

## 5. Les sept règles

- **R1 — Une seule horloge d'accès.** `keel_household_is_covered`, en SQL.
  `trial_end` est une horloge de **facturation**, calée sur elle par
  construction. Les deux ne peuvent pas diverger parce que la seconde est
  dérivée de la première.
- **R2 — `free_until` n'est jamais réécrit par un paiement.** Un foyer garde ce
  qui lui a été promis (D4bis).
- **R3 — Le mur est de la navigation.** RLS et les deux refus `402
  household_frozen` restent la frontière. ⛔ Ne pas les retirer au motif que le
  front bloque : c'est le défaut que `generate-meal-v1` a dû réparer le
  2026-08-11.
- **R4 — Fail-open sur trois cas nommés** : lecture en cours, lecture ratée,
  hors foyer. Se tromper de sens coupe quelqu'un qui paie, et aucun nouvel
  essai ne répare ça.
- **R5 — Un seul appel front pour le tunnel ET le portail.** La fonction edge
  décide (`{mode:'portal'}` si un abonnement est vivant). Décider côté
  navigateur ferait diverger l'écran de la facture pendant les secondes qui
  suivent un paiement.
- **R6 — `trial_end` ne peut que dépasser la promesse.** Repli à 49 h quand il
  reste moins de 48 h. Jamais une minute de moins que la semaine annoncée sur
  la vitrine.
- **R8 — L'accès supplémentaire se facture à la RÉCLAMATION, pas à la
  sélection.** `keel_household_billable_profiles` compte les lignes membres qui
  portent un compte, le maître exclu — « ni une bouche sans compte, ni une
  invitation non réclamée ». Choisir quelqu'un envoie une invitation ; le
  1,99 € arrive le jour où elle est réclamée, et l'écran le **dit**
  (`household.extra.when`). Facturer à la sélection ferait apparaître une ligne
  que la réconciliation mensuelle retirerait au tour suivant.
- **R7 — Le décompte a une frontière.** Avant le gel il s'affiche (la source
  est `households.free_until`, notre colonne) ; une fois gelé, ni date ni
  montant ni décompte (la source de la reprise est Stripe). Deux états, une
  source chacun.

## 6. Le code

| Rôle | Fichier |
|---|---|
| La couverture, lue une fois par session | `frontend/src/context/HouseholdAccessProvider.tsx` |
| Le type et la lecture, isolés | `frontend/src/keel/api/householdCoverage.ts` |
| Le mur | `frontend/src/keel/components/KeelPaywallGate.tsx` + `paywallDecision.ts` |
| Le panneau | `frontend/src/keel/components/PaywallPanel.tsx` |
| Le bandeau | `frontend/src/keel/components/TrialEndingBanner.tsx` + `trialBannerDecision.ts` |
| La page | `frontend/src/keel/pages/HouseholdBillingPage.tsx` + `householdBilling.ts` |
| Le calcul de la bascule | `supabase/functions/_shared/billing-tier.ts` → `householdStripeTrialEnd` |
| Le tunnel | `supabase/functions/stripe-create-checkout-session/index.ts` |
| L'accès supplémentaire, un composant, deux écrans | `frontend/src/keel/components/ExtraAccessCard.tsx` |
| La doctrine renversée | `supabase/migrations/20260910170000_le_gel_ferme_aussi_la_lecture.sql` |

## 7. Modes de défaillance

| Situation | Comportement |
|---|---|
| La RPC de couverture est muette | **On passe.** Trois cas de fail-open, testés un par un (`paywallGate.int.test.ts`). |
| Les prix Stripe n'existent pas | **Refus bruyant**, motif tel quel à l'écran. ⚠️ **C'est l'état actuel en local** : `No such price: 'price_1UBgU5PljiMVCeeKoeICe5Xf'`. La clé est bien `sk_test` et les deux variables sont injectées — c'est le prix qui n'existe pas dans ce compte. |
| Le webhook est en retard après paiement | `/app/billing?billing=success` synchronise **une seule fois** (garde `sessionStorage`) puis recharge. Sans la garde: boucle de rechargement infinie. |
| Un profil réclamé arrive sur le mur | Panneau **sans bouton**, avec la phrase « la personne qui a créé ce foyer peut le relancer ». Le tunnel lui rendrait 403. |
| Quelqu'un s'abonne à J-1 | `trial_end` est repoussé à 49 h : il gagne un jour, il n'en perd aucun. |
| L'essai finit pendant que Stripe est en `trialing` | La branche (c) de `keel_household_is_covered` couvre (`trialing` est accepté). Aucun trou entre les deux horloges. |
| ⚠️ Le foyer est gelé et le tap du soir tourne | **TROU CONNU, hérité de FF-049 §7 n°7.** `keel-daily-pulse-v1` et `keel-weekly-flow-v1` ne portent aucune occurrence de `household`. Non refermé ici. |

## 8. Les gestes humains — aucun n'est faisable par un agent

1. **Créer les deux prix Stripe** dans le compte de **test** visé par
   `STRIPE_SECRET_KEY`, et corriger les deux ids de `supabase/.env`. Sans ça,
   le tunnel rend 500 et rien ne se vend. **C'est le seul blocage réel.**
2. `supabase db push` (la migration de commentaire) puis
   `supabase functions deploy stripe-create-checkout-session stripe-webhook`.
3. Vérifier en production : `supabase secrets list` porte-t-il
   `STRIPE_PRICE_ID_HOUSEHOLD_MONTHLY` et
   `STRIPE_PRICE_ID_HOUSEHOLD_PROFILE_MONTHLY` ?

### Vérifié à l'écran le 2026-09-09

Sur `qa-9pts-cinq@keeltest.dev` (foyer de cinq, quatre bouches sans compte) :
la section propose Marc, Lea, Tom, Zoe ; l'invitation part et rend son lien
(« Envoie ce lien pour réclamer le profil de Marc… ») ; et
`keel_household_billable_profiles` rend **toujours 0** juste après. La phrase à
l'écran est donc vraie, mesurée et pas supposée.

## 9. Rabbit holes

- **La fenêtre de 400 caractères** de `routeGuards.int.test.ts` : insérer une
  route juste après `/app/today` la ferait rougir pour une mauvaise raison.
- **Le mode `fill` de la coquille** (`/app/chat`) : le bandeau doit porter
  `shrink-0`, sinon il pousse le composeur hors de l'écran. **Mesuré** :
  `scrollHeight === innerHeight`, bouton « Envoyer » à 868 px sur 900.
- **Un `import type` traîne un namespace.** `pageSeams` a rougi parce qu'un
  type importé depuis `api/household.ts` faisait « atteindre » tout
  `household.*` à quatre écrans qui n'en affichent rien. Le remède habituel
  (« déclarer plutôt qu'éviter ») aurait été un mensonge : l'arête a été
  coupée (`api/householdCoverage.ts`).
- **`Promise<void>` dans un `.tsx`** est lu comme du texte JSX par
  `i18n-lint`. Un module sans JSX doit être un `.ts`.

## 10. Ce qu'on mesure — et la contre-mesure

Le taux de conversion à J+8. **Et son contraire** : la part des foyers qui
atteignent J+8 sans payer et **ne reviennent jamais**. Si le mur augmente ce
second chiffre plus que le premier, il coûte plus qu'il ne rapporte, et
l'arbitrage « seule la composition se bloque » redevient ouvert.
