# Bêta autonome — verdict de passation

**2026-09-14.** Base git `a14c6be1`. Arbre de travail partagé (centaines de fichiers non
committés hors de cette passation). Aucun appel fournisseur payant. Aucune
migration appliquée par l'agent.

**Verdict : code vérifié hors ligne — bêta encore bloquée.**

Ce n'est pas « bêta ouvrable ». La suite complète est verte (7 330 réussis,
0 échec, 2 ignorés), mais B4, B5 et B7 restent non prouvés sur une version figée
+ parcours réel. Deux pilotes réels b10 ont ensuite rendu 409 puis 502 ; le 409
a révélé une migration corrective supplémentaire, non appliquée en local.
`agent-gate: pass` ne clorait pas ce contrat à lui seul.

---

## B1–B7

| ID | État | Version | Preuve | Ce qui bloque encore |
|---|---|---|---|---|
| B1 | Hors ligne, acquis antérieurs conservés | arbre courant / `a14c6be1` | Lots 1A historiques ; variantes N=2 déjà vues au navigateur | Non-régression N=4 + compte neuf sur **cette** version |
| B2 | Harnais maintien corrigé ; UI non rejouée | `campagne-lot-F.ts` profil 7 | `goal=maintenance`, `pace=null`, `lightSlots` via `keel_household_set_member_habits` | Trace formulaire → roster → contrat, navigateur |
| B3 | Garde + publication inchangées dans le câblage | `beta_wiring_test.ts`, `final_plan_gate` | 313 tests Deno ciblés verts | Parcours réel d'activation |
| B4 | Code fermé hors ligne | `portion_scaling.ts`, `final_plan_gate.ts` | Réduction 169/170 g ; casserole déficitaire refusée ; 0 écriture si illisible | Table sna1 / −35 g sur artefacts immuables ; courses du plan navigateur |
| B5 | Code fermé hors ligne | `planDraft.ts`, `household.ts`, migrations `20260914143000`–`170000` | Adoption sans modèle ; bail `lease_token` ; timeout → relecture ; `plan_still_composing` seulement si l'état relu est en vol | Migration `170000` locale ; Composer → reload ; Prévisualiser → Adopter → reload ; 546 / deux onglets |
| B6 | Non rouvert | — | Protections existantes, tests de câblage | Hors chantier sauf régression de campagne |
| B7 | **Échec des deux pilotes b10** | arbre courant, avant application de `170000` | tir 1 : 409 à 127 962 ms ; tir 2 : 502 à 171 858 ms | Appliquer `170000`, parcours réel local, expliquer/retester le 502, accord délai + budget, puis 30 tirs |

---

## 1. Fermé dans cette passation (mesures)

### Lot 1 — quantités et maintien

- `scaleIngredients` réduit même au-dessus du plafond de croissance (169 g sur 170, contre 7).
- Après le bornage final des portions, la masse prête est recalculée ; une casserole servie déficitaire ou illisible refuse la publication (0 écriture).
- Le harnais de campagne n'écrit plus `size: light` dans le rythme. Le profil maintien pose `goal=maintenance`, allure nulle, repas léger dans `household_member_habits.slots`.

### Lot 2 — demande, adoption, reprise

- Adoption : `draft_id` + `adopting_draft` → `adoptDraft` / RPC `keel_adopt_meal_draft`. Pas de recomposition. Copy : revalide puis écrit.
- Bail : `lease_token` exigé dans la même transaction que l'écriture. Même `request_id` → `in_flight`, pas un second exécuteur. Worker trop tard → `generation_lease_lost`.
- Client : HTTP 145 s (sous Kong 150 s), puis poll jusqu'à 235 s (`PLAN_RECOVERY_WAIT_MS`). « Ça continue » seulement après lecture `student_meal_drafts` / plan `request_id` / RPC `keel_household_request_status`. Composer a la même borne (il n'en avait pas).
- Rechargement `/app/plan` : `recoverLatestDraft` + `waitForDraft` (attente 235 s).

### Lot 2.1 — les deux 422 N=1 lundi soir (cause, puis correctif)

Artefacts immuables :

- `campagne-tir1-s3-…` (perte, 422, 193,8 s) — 8/9 plats bruts, `empty_slots: mon/dinner`. Deux patches créent U3 ; rejet `new_preparation_unscheduled` (`cook_on: sun`, sessions lun/mar) puis `safety_regression`.
- `campagne-tir2-s2-…` (gain, 422, 87,5 s) — même case absente dès le brut. 0 appel de réparation : `plan_repair_context_truncated:2` (42 blocs, plafond 40).

Correctifs (aucun rattrapage ajouté) :

1. `plan_repair_patch.ts` : casserole neuve accrochée à une **session déjà là** (jour `cook_on`, sinon jour du plat). On n'invente pas de session.
2. `plan_defect_pass.ts` : `contextIncomplete` si une **bouche** disparaît, si un interdit / repas manquant sort, ou si le plafond caractères invalide tout. Un grammage de trop de la même bouche n'arrête plus l'appel.

Tests finaux : suite Deno complète, 7 330 réussis, 0 échec, 2 ignorés ;
27 Vitest ciblés réussis ; `npx tsc --noEmit` et `deno check` du handler,
de `draft_adopt` et des modules touchés réussis.

### Pilotes b10 postérieurs — échec de publication

- Tir 1 perte : HTTP 409 après 127 962 ms. Le modèle avait réussi, mais la
  publication a rendu `plan_not_written` : la RPC passait
  `p_duration_days integer` à l'écrivain qui exige `smallint`.
- Tir 2 gain : HTTP 502 après 171 858 ms, sans ligne écrite ni détail applicatif
  exploitable dans l'artefact.
- Correctif du 409 : migration
  `20260914170000_le_bail_caste_la_duree.sql`, test statique vert. La liste des
  migrations locales confirme qu'elle n'est pas encore appliquée ; le chemin
  réel corrigé n'a donc pas été rejoué.

Artefacts immuables :

- `scratchpad/2026-09-14-DIX-TIRS/sorties/campagne-tir1-b10-2026-09-14T16-14-02-583Z.json`
- `scratchpad/2026-09-14-DIX-TIRS/sorties/campagne-tir2-b10-2026-09-14T16-16-13-456Z.json`

---

## 2. Encore bloquant, rattaché au critère

| Blocage | Critère |
|---|---|
| Pile locale appliquée jusqu'à `160000`, mais sans `170000` → publication encore cassée sur `duration_days` | B5/B7 |
| Aucun parcours navigateur Composer → résultat → reload ni Prévisualiser → Adopter → actif → reload sur **ce** code | B5 |
| Table sna1 / −35 g non rejouée sur artefacts figés après le dernier correctif de masse | B4 |
| Préférence « dîner léger » non tracée UI → RPC `keel_household_roster_for` → prompt | B2 |
| Contrat délai p95 ≤ 100 s / issue 120 s **non tenu** par la campagne ; pas d'amendement accepté | B7 |
| Pilotes b10 : 409 de publication puis 502 amont ; aucune preuve réelle verte | B7 |
| Campagne 30 tirs interdite sans nouvelle enveloppe | B7 |
| Premier jet N=1 qui omet encore `mon/dinner` : le correctif aide la réparation, il ne force pas le modèle à écrire la 9ᵉ case | B7 (taux sans rattrapage) |

Consigné hors périmètre : ~90 préfixes `[keel/…]` hors composition ; `DRAFT_ADOPTION_MODEL_TIMEOUT_MS` mort après l'early return d'adoption.

---

## 3. Campagne précédente — ne pas la mélanger à ce code

Source : `BETA-CAMPAGNE-2026-09-14.md`. Comptage relu sur `livrable_avec_ecarts` (pas le type TS `deliverable_with_gaps`).

```
25 tirs · 200 : 22 · 422 : 2 · 546 : 1
durée min 88,7 s · médiane 119,5 s · p95 248,4 s · max 261,5 s
sans réparation 13/25 · après parcours 22/25
maintien 0/5 (harnais, pas le moteur)
dépense ≈ 36 appels modèle + 11 avant la campagne
```

Ces 25 demandes **ne valident pas** le code ci-dessus.

---

## Proposition de délai — une fois, avant toute nouvelle campagne

Le contrat initial (p95 ≤ 100 s, issue synchrone ≤ 120 s) n'est pas tenable tant que ~1 demande sur 2 appelle une réparation (~+90 s) et que Kong coupe à 150 s.

Architecture **actuelle** (exécutable, pas une file mémoire) :

| Étape | Délai | Ce que voit la personne |
|---|---|---|
| Acceptation HTTP | attente jusqu'à 145 s, puis lecture durable | bouton occupé |
| Poll si en vol | +235 s, sous vie worker 400 s / budget serveur 380 s | phrase `plan_still_composing` **seulement** si l'état relu est `pending`/`running` |
| Disponibilité du plan | = fin d'écriture, pas la réponse HTTP | aperçu ou plan au reload, sans second paiement automatique |
| Perte du bail / 546 | verrou expire ; reprise atomique ; worker tardif ne publie pas | état failed/expired lisible |

Chiffres demandés pour un amendement (à accepter **avant** les 30 tirs, pas après) :

| | Proposition |
|---|---|
| Acceptation | ≤ 145 s ou lecture d'état, jamais une HTTP 200 vide présentée comme « plan prêt » |
| p95 de **disponibilité** | 180 s (0 ou 1 réparation). 100 s reste l'objectif de premier jet, pas la promesse de service tant que le taux sans rattrapage n'est pas là |
| Échéance totale | 380 s ; au-delà : failed/expired observable, pas un spinner infini |
| Coût | polling gratuit ; modèle = 1 à 3 appels par demande (plafond 2 réparations global, y compris reprise) |
| Reprise | même `request_id`, quota non redépensé si le résultat est déjà écrit |

Sans accord écrit sur cette ligne, B7 reste jugé sur 100 / 120 s → **bêta bloquée** après campagne.

Les lots 1–2 et les tests de reprise ne sont pas bloqués par cette décision.

---

## 4. Opérations humaines restantes

### A. Appliquer les migrations **en local** (pas `--linked`)

L'agent ne les lance pas (`AGENTS.md`).

```bash
# Vérifier que la pile locale tourne, puis :
supabase migration up

# Si 401 Invalid JWT ensuite : NE PAS toucher verify_jwt ni signing_keys.
./scripts/check-local-jwt-alg.sh
# Lire docs/keel/JWT-HS256.md — réparation légitime : supabase stop && supabase start
# puis se déconnecter/reconnecter dans l'app.

# Les functions cachent _shared : les relancer
./scripts/local_serve_functions.sh
```

Fichiers, dans l'ordre (les cinq premiers sont déjà appliqués dans la pile
locale observée ; le sixième reste à appliquer) :

1. `20260914100000_une_seule_generation_a_la_fois_par_foyer.sql`
2. `20260914110000_un_frein_pour_la_beta_sans_couper_la_lecture.sql`
3. `20260914143000_adoption_de_brouillon_atomique.sql`
4. `20260914150000_generation_lease_fence.sql`
5. `20260914160000_generation_request_status.sql`
6. `20260914170000_le_bail_caste_la_duree.sql`

### B. Preuves navigateur (compte de **test**, pas un compte réel)

Composer → résultat → reload. Prévisualiser → Adopter → plan actif → reload.
Puis : budget invalide, panne fournisseur, timeout avant/après écriture, 546,
deux onglets, même `request_id`, verrou expiré, nouvelle contrainte, autre foyer.
Zéro double publication / double quota.

### C. Campagne 30 tirs — **après** A+B et accord délai + budget

Six profils × 5, maintien opérationnel. Deux pilotes N=2 / N=4 d'abord.
Arrêt sur défaut essentiel ou dépassement inexpliqué.
Ne pas déduire une réserve du plafond historique. Autoriser une **nouvelle**
enveloppe avant le premier appel. Ordre de grandeur : campagne précédente ≈ 36
appels pour 25 tirs ; 30 tirs + réparations ≈ 45–55 appels.

Harnais : `scratchpad/2026-09-11-FIABILITE-RECETTES/campagne-lot-F.ts`.
Compter `livrable_avec_ecarts` persisté, pas `deliverable_with_gaps`.

### D. Gel

Pas de commit global sur cet arbre partagé. Empreintes SHA-256 (fichiers de
cette passation) :

```
c120a0be08b80dbc204eb78bbb534c93e85a7de8234c4dcc1efa3245706bdc7d  frontend/src/keel/api/planDraft.ts
198f0df90fae002bf4673a55c343c82cc1cbd898f858ba1141ec9df202fcf804  frontend/src/keel/api/household.ts
0e8305e4e2d398b06853f65a35b71e968a1203755d71366b92b0a0b3f2f60941  frontend/src/keel/api/mealGeneration.ts
261395a3072e668ca448deb599e34b288ceca6ea32a0208ed0335b65c36266ff  frontend/src/keel/pages/StudentWeekPlanPage.tsx
8eb3620df437cd9754d981978e9a63c6e6667c6c61248eb7bf695d47253c00af  supabase/functions/_shared/keel/portion_scaling.ts
8c26a020632f532498ac7529afa6a2ab0b06ca7b3f21a3a12094219fbf9b6021  supabase/functions/_shared/keel/final_plan_gate.ts
a2894a652aee47618048026acd2902c218a0bfd5824f6b57474ba291bc0675e7  supabase/functions/_shared/keel/draft_adopt.ts
3b64d9d76ab65d9ccea559eb0954cea32645bad302361785f9922a8052b407b4  supabase/functions/_shared/keel/plan_defect_pass.ts
0e832c33874543bc29fb3e9fa3a705042fc0bb5dfed856229adabfebb9d6b3ed  supabase/functions/_shared/keel/plan_repair_patch.ts
fd7f5562821a68872d2388928d2502f36ceeda8cb64898fc8a7d7de89f9dc92d  supabase/migrations/20260914100000_une_seule_generation_a_la_fois_par_foyer.sql
43509416e1cb816ebabc845620f954a885f64140b6d0f4d2a23c0564d985ad37  supabase/migrations/20260914143000_adoption_de_brouillon_atomique.sql
8cfcd2696e572499046cc6693fb415f67b6bbfd45c03ac6afa510733b3b135a3  supabase/migrations/20260914150000_generation_lease_fence.sql
9181280ac27cc0d9dcf4bf499867e966ffc617f16b4f9ff4155efee947b08434  supabase/migrations/20260914160000_generation_request_status.sql
10f6289aac4eb0990957d24174f704b13196e845d8d00914b2249991a770186a  supabase/migrations/20260914170000_le_bail_caste_la_duree.sql
4535c1dc788fe8ead91a97039e674597c2d1f4bff5cddf38f3873cbd71b256bb  supabase/functions/_shared/keel/publish_duration_cast_wiring_test.ts
```

`scripts/agent-gate.sh` n'a pas été lancé sur le diff cumulé du poste (il
mélangerait le travail des autres agents). Après un commit **restreint** à ces
fichiers : `./scripts/agent-gate.sh` sans élargir la liste rouge.
