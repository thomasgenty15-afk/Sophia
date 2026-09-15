# KEEL — Journal d'exécution

> Suivi vague par vague du [BUILD_PLAN](BUILD_PLAN.md). Une ligne par lot : ce qui a été fait,
> ce qui a été **vérifié réellement** (pas « écrit »), et les défauts trouvés en route.
> Règle : rien n'est marqué ✅ sans une vérification exécutée dont la sortie a été lue.

Légende : ✅ fait+vérifié · 🟡 fait, vérification partielle · ⬜ pas commencé · ❌ échec

---

## Vague 0 — Socle (26-27/07) ✅

| Lot | Livrable | Vérification exécutée |
|---|---|---|
| Contrat | `docs/keel/CONTRACT.md` — R1-R7, branches nommées, non-inputs, refus actés | relecture |
| Schéma | `docs/keel/SCHEMA.md` — 16 tables + 3 fixtures d'acceptation | → voir W1.0 |
| Ceintures | `docs/keel/BELT_AUDIT.md` — **74** ceintures FR inventoriées (attendu ~40) | grep exhaustif |
| Tokens | `_shared/keel/tokens.ts` + `relations.ts` (module séparé, non-input) | `deno test` 14 ✓ |
| Lint | `scripts/ci/token-lint.mjs` + `npm run lint:keel-tokens` | `token-lint OK (14 files)` |
| Vision | `_shared/vision.ts` (module neuf ; `generateWithGemini` intouché, 286 appelants) | `deno test` ✓ |
| i18n | `_shared/keel/locale.ts`, `labels.en.ts`, `frontend/src/keel/i18n/` | `tsc --noEmit` ✓ |
| Render | `_shared/keel/render.ts` (digest dominical, dégradation provenance) | `deno test` ✓ |
| Prompt | `_shared/keel/prompts/plan_import.en.ts` (Classe A, listes fermées interpolées) | live ✓ |
| Import | `supabase/functions/plan-import-v1/` | **curl 200, texte 13 s / PDF 61 s** |
| Écran | `frontend/src/keel/pages/PlanImportPage.tsx`, route `/keel/import` | **navigateur ✓** |

**Défaut trouvé et corrigé en vague 0** : au 1ᵉʳ passage live, le modèle a émis `substance_ref='epa_dha'`
→ R7 a fait son travail (ligne dégradée en `needs_review` avec l'issue exacte, pas de slug faux
silencieux). Correction : listes fermées de slugs interpolées dans le prompt depuis `tokens.ts`.
2ᵉ passage : **14 commitments, 0 à revoir**.

---

## W1 — Fondations DB + bugs latents

### W1.0 — Application de la migration P0 ✅
`npx supabase db reset --local` — appliquée sans erreur.
Vérifié en base : **16 tables**, seeds `slot_vocabulary` 11 / `food_groups` 30 /
`substance_limits` 10 / `substance_interactions` 8, CHECK `plan_commitments_substance_ref_check`
présent, RLS actif.

### W1.0-bis — Test d'acceptation du modèle ✅ **(le test qui compte)**
`supabase/tests/keel/acceptance_fixtures.sql` — artefact permanent.
**19/19 lignes de fixtures encodées sans un seul champ ad hoc** :
- Fixture 1 (10 l.) — protocole épigénétique : `dose` vs `micronutrient` multi-source, `serving`
  + `food_group_ref`, plat composé opaque, `avoid` + `none_implicit`, fenêtre 16:8 trans-minuit,
  gate `provenance` sur la D3 au-dessus de l'UL.
- Fixture 2 (6 l.) — protocole biohacker : `duration`, `clock_time`, `window`, et surtout
  `capture` + `device` + `counts_toward_adherence=false` (le garde-fou du capteur muet).
- Fixture 3 (3 l.) — plan prescriptif cœliaque : `slot`+`window` combinés, `severity=medical`.

**5/5 tests négatifs échouent correctement** : `dose` sans `substance_ref` (R7), polarité
inconnue, jours français dans `scheduled_days`, substance inconnue, groupe alimentaire inconnu.

> **Défaut de schéma trouvé par le test** — asymétrie réelle : `food_group_ref` était protégé par
> une FK et rejetait bien un slug inconnu, mais `substance_ref` était une colonne texte nue —
> `'unobtainium'` était **accepté par la base**. Le vocabulaire n'était contraint qu'en TypeScript,
> donc toute écriture contournant le parseur pouvait persister un slug qui fait ensuite throw
> `labelFor()` au rendu, sur une donnée d'apparence valide. Exactement le mode d'échec que R7
> interdit : échouer à l'écriture, bruyamment, pas trois couches plus loin.
> **Correctif** : migration `20260727110000_keel_substances_table.sql` — table `substances`
> (40 slugs seedés depuis `tokens.ts`) devenue parent de `plan_commitments.substance_ref`,
> `substance_limits` et `substance_interactions`. Re-testé : NEG 4 échoue désormais correctement.
>
> *Deux erreurs de la fixture elle-même, corrigées : `<=` prend `target_max` (une borne haute),
> pas `target_min` ; `between` exige ses deux bornes. Le schéma avait raison, pas la fixture.*

### W1.1 — Migration tenancy ✅
`20260727120000_keel_tenancy.sql` : `coaches`, `coach_clients`, `coach_invitations`,
`coach_access_events`, `profiles.keel_role`/`display_unit_system`, `coached_student_ids()`
(SECURITY DEFINER STABLE, appelée en `= any((select …))` pour forcer l'InitPlan),
8 policies Tier A **toutes en SELECT**, 2 vues Tier B `security_invoker=off`,
RPC `revoke_coach_access()`, index de perf manquants.
**Vérifié : 28/28 tests dans `_shared/keel/tenancy_rls_test.sql`** — dont « coach A ne lit pas
l'élève de coach B », « coach ne peut pas écrire dans `protocol_events` », « les vues n'exposent
aucune colonne verbatim/PII », « anon ne peut pas exécuter `coached_student_ids()` ».

### W1.2 — Storage + RGPD ✅
Buckets privés `plan-documents` / `meal-photos` ; export RGPD étendu (13 tables KEEL,
**0 colonne inexistante** — vérifié colonne par colonne contre la base) ; purge paginée des
buckets ; cas « un coach supprime son compte » → `coach_clients.status='ended'`.

### W1.3 — Les 4 bugs latents ✅
1. `logSafetyBandEvent` inclut désormais `critical` (le cas le plus grave était le seul invisible).
2. `planSchedule.ts` accepte les tokens `mon..sun` et **throw** sur inconnu (R7) au lieu de `[]`.
3. Planificateur : gate par fuseau + cron horaire (`0 * * * *`) → les nudges du matin
   fonctionnent enfin hors d'Europe.
4. Rappels récurrents : mode `reseed_all` + cron hebdomadaire.

### Vérification croisée W1 — 4 défauts trouvés **et corrigés**

> **D3, le plus grave** — `revoke_coach_access()` écrivait `status='paused'`, mais le prédicat de
> l'index unique `one_live_coach_per_student` était `status <> 'ended'` : `paused` comptait donc
> comme un lien vivant. **Révoquer son consentement enfermait l'élève chez le coach qu'il venait
> de congédier** (`unique_violation` à l'inscription du coach suivant). Vérifié par sonde SQL.
> Correctif : prédicat `status in ('invited','active')`. Section 10 du test RLS : ✅ *« student can
> switch coach after revoking »*.

- **D1** — Le reseed hebdo ne semait **jamais** le dimanche à l'est de UTC+6 : le cron dimanche
  18:00 UTC tombe lundi 07:00 à Auckland, l'horizon `untilSunday - 1` donnait Lun..Sam et la passe
  suivante retombait un lundi. Aucun tick UTC hebdomadaire n'est dimanche partout (amplitude
  −11..+14 = 25 h) → le correctif est dans l'horizon, pas dans le cron.
- **D2** — Régression frontend évitée : `mission_days` (jsonb, le champ que R5 cite comme
  inatteignable par un CHECK) alimentait le parseur fail-loud → un `"mercredi soir"` aurait fait
  throw en plein render React et tué le dashboard entier. Quarantaine nommée et bruyante pour la
  source non fiable ; le throw R7 reste sur `scheduled_days` (colonne CHECK-protégée).
- **D4** — Deux troncatures silencieuses de la marche storage : une purge RGPD se déclarait
  « réussie » en laissant des fichiers. Les deux jettent désormais.

**Vérifications finales exécutées après `db reset` :** 19 fixtures + 5 négatifs ✅ ·
28/28 RLS ✅ · 46 tests unitaires Deno ✅ · 24 vitest ✅ · `tsc` ✅ · token-lint ✅

### W1.4 — Reliquats (arbitrés, traités en parallèle de W2) 🟡
R1 `reseed_all` ne tient pas à l'échelle (1 appel LLM/rappel, pas de curseur) · R2 rayon
d'explosion du gate timezone · R4 notification élève manquante quand un coach part ·
R5 trous mineurs de l'export.
**Arbitrage R3 (divergences assumées, acceptées)** : pas de policies `storage.objects` — tous les
accès fichiers passent par des edge functions en service_role (conséquence : W4.5 et W5.4 devront
le faire) ; `protocol_events` sans policy Tier A (une policy ne peut pas masquer `student_note`,
seule une vue le peut) ; `plan_templates`/`plan_documents` en `FOR ALL` coach (ce sont ses tables).

---

## W2 — Démolition contrôlée ✅

**Volumétrie : 169 fichiers, −53 466 lignes.** 73 → **55 edge functions**.

### W2.A — Désactivation ✅ (aucun fichier supprimé, entièrement réversible)
- **Extraction préalable réussie** : `session_style_commitment` déplacé vers
  `skills/_shared/`. Vérifié après coup : il est bien injecté aux 2 points composeurs
  (`injectedContext` pour normal_reply/coaching/safety, + le bloc présence). Le seul site perdu
  est son **producteur** dans `feature_opportunity` — suppression voulue. Si cette extraction
  avait été faite après la suppression, tous les composeurs auraient perdu le mécanisme en silence.
- Migration `20260727150000` : 2 crons désarmés, 8 triggers Architecte droppés — dont
  `on_profile_created_init_modules` qui seedait le parcours identitaire français **à chaque signup**.
- Dispatcher : `feature_opportunity` retiré du prompt, du contrat, des unions de types et des
  deux branches de `routers.ts` (entrée + continuation), sans réordonner le reste.
- Potions : sas local débranché, `state_potion` retiré du **type** `coaching_recommendation`.
- Routes legacy démontées dans `App.tsx` (fichiers conservés pour W2.B).

### W2.B — Suppression du code ✅ (4 lots parallèles)
- **18 edge functions** supprimées (~29 500 l.) + purge des branches potion/level/weekly dans
  `process-checkins` et des purposes dans `whatsapp-send`.
- **Machine de validation hebdo** supprimée. **Prérequis honoré dans la même PR** :
  `activateDueWeekItemsForUser` (dont l'unique appelant était le fichier supprimé) re-logé sur
  `keel-week-rollover-v1` + cron vérifié **actif en base** — sans ça le déblocage des semaines
  mourait en silence.
- **34 fichiers de skills** supprimés (~13 960 l.) après vérification que l'extraction W2.A
  avait bien eu lieu.
- **Frontend −19 405 l.** Chirurgie réussie sur les deux pièges : `AttackCards.tsx` extrait de
  `LabCardsPanel` (2406 l. → 1120 l. sans potions, **copie 100 % EN via `t()`**) et
  `RemindersSection` extraite de `BaseDeVieSection`.
- `coverage-guard.int.test.ts` rafraîchi (liste périmée 27 → **54 fonctions exactes**) : le filet
  des vagues suivantes est de nouveau exact.

### Vérification croisée W2 — 3 défauts trouvés et corrigés
> **Le plus instructif** : `ultimate.int.test.ts` **affirmait l'existence des triggers Architecte**
> que W2.A venait de dropper. Autrement dit, la vérification que le BUILD_PLAN nommait
> (« signup ne seede plus `user_week_states` ») prouvait exactement l'inverse — et ses rouges
> étaient masqués parce que la suite tourne sans env par défaut. Retournée en garde-fous
> **inversés** : elle prouve désormais l'absence d'effet de bord. 7/7 verts.

- `DashboardV2.tsx` appelait deux fonctions supprimées **à chaque montage** (404 silencieux avalés
  par un `.catch(console.error)`). Retirés.
- Un test lisait son fichier cible par chemin relatif au cwd → cassé selon le répertoire de lancement.

**Vérifications finales :** `db reset` ✅ · 19+5 fixtures ✅ · 28/28 RLS ✅ ·
`deno check sophia-brain` ✅ · **0 échec Deno nouveau** (comparé à un worktree HEAD) ·
`tsc` ✅ · vitest sans régression ✅ · token-lint ✅ · **0 intrus** dans `git status`.

### W2.C — Drop des tables ⬜ *(après déploiement de W2.B, décision humaine)*

### Reliquats W2 → traités en W2.D
1. **[GRAVE, arbitré]** `usePhase1.ts` et la modale de clôture de `DashboardV2` appellent encore
   des fonctions supprimées, et sont **atteignables par l'utilisateur** (12 appels).
   **Arbitrage : on les retire.** La branche FR vit sur une autre branche git ; ici `DashboardV2`
   n'est qu'une surface de transition qui doit compiler, pas un produit à préserver. Laisser un
   bouton qui 404 devant un utilisateur est pire que de retirer la carte.
2. **[MOYEN]** Chaîne morte `adjust-plan-v1`/`complete-level-v1` dans `DashboardV2` → 31 erreurs
   ESLint `no-unused-vars`. Se règle avec le point 1.
3. **[IMPORTANT pour la suite]** **La suite Deno n'est pas un filet vert** : 32 rouges
   pré-existants (env manquante, migrations disparues au squash, fichiers inexistants). Tant
   qu'ils sont là, *une régression future s'y noiera*. À assainir avant de s'appuyer dessus.

---

## W2.D — Nettoyage + filet de tests ✅

- **Appels orphelins : 12 → 0.** `usePhase1`, `lib/phase1`, `Phase1FoundationCard`,
  `Phase1KickoffFlow`, la modale de clôture et la chaîne morte `adjust-plan`/`complete-level`
  retirées de `DashboardV2`. ESLint sur `DashboardV2` + `PhaseProgression` : **31+9 → 0 erreur**.
- **Le filet de tests est vert.** `deno test` passe de *abort au type-check* (47 erreurs) puis
  1828/**44 rouges** à **2004 passed / 0 failed** ; vitest de 12 rouges à **35/0**. Les 33 tests
  `ignored` sont des intégrations gatées par env (Stripe, suppression de compte, parrainage),
  proprement skippées et documentées dans `docs/keel/TESTING.md` — plus aucun rouge où une
  régression future pourrait se noyer.

## W3 — Safety d'abord ✅ *(avant toute relance alimentaire)*

### W3.1 — Pregate déterministe ✅
`initialSafetyContext` ne retourne plus `'none'` en dur : il exécute un vrai pregate
(`safety_lexicon.ts`, 29 ceintures EN/FR sur 4 clusters, escalateurs imminence/moyens,
**9 conditions de désarmement nommées** conformément à la doctrine P9).
**Le plancher est prouvé, pas affirmé** : `safety_floor.ts:53` est le point d'étranglement unique
(`applySafetyFloorToTurnFrame`, appelé en un seul endroit couvrant les 3 producteurs de frame), et
le test balaie **la matrice 5×5 complète** — un frame LLM `none` sur « je veux me suicider ce soir »
ressort `critical`, et les 4 prédicats aval bloquent.

### W3.2 — Détection TCA ✅ *(code)* / ⬜ *(runtime — dépend de W4)*
`_shared/keel/restriction_guard.ts` : plancher déterministe, pur, **sans paramètre d'override**
(4 déclencheurs : perte > 1,2 %/sem sur 2 semaines, ≥3 jours d'énergie < cible−25 %, tokens
compensatoires EN/FR, auto-évaluation ≥8 avec couverture <3/7). Skill `disordered_eating_guard`
à sortie **clinique** (ressources TCA, pas la hotline suicide ; aucun chiffre affiché pendant le flow).
41 + 31 tests. Non contournable par le LLM : un `turn_frame` forgé avec le flag est **inerte**.

> **Défaut grave trouvé et corrigé** : `routers.ts` savait router vers `disordered_eating_guard`,
> mais `run.ts` n'avait **aucun handler** pour cet owner — la route traversait tous les blocs et
> atterrissait dans le composeur générique. Un élève en restriction aurait reçu une réponse
> normale, avec exactement la pression d'adhérence que ce flow existe pour suspendre.
> Un plancher qui dégrade en silence vers la lane qu'il devait couper. Refus bruyant ajouté
> + test qui épingle les deux moitiés de l'invariant.

### W3.3 — Ressources par pays + contraintes structurées ✅ *(code)* / 🟡 *(inerte)*
Table `crisis_resources` (23 lignes, US/GB/FR + fallback `ZZ` × 5 types), résolveur à **fallback
bruyant**, `loadStudentSafetyConstraints` hors mémoire LLM + validateur déterministe qui rejette
toute sortie contenant un token `severity='medical'`. **0 numéro de crise en dur émis.**

> **Reste inerte en production** : la résolution s'appuie sur `profiles.locale`
> (NOT NULL DEFAULT `'fr-FR'`) et **il n'existe aucune colonne `country`**. Tout utilisateur
> résout donc sur FR — le bug visé (*un élève américain à qui on donne le 3114*) n'est pas
> résolu de bout en bout. → **colonne `country` ajoutée en W4.**

---

## W4 — Boucle élève ✅ *(surface web + proactive)* / ⬜ *(conversationnel → W4.7)*

**11 migrations KEEL appliquées. `deno test` 2004 → 2235 passed / 0 failed. vitest 60/0. tsc 0.**

### W4.1 — L'évaluateur ✅
Pur (0 I/O, 0 horloge, 0 aléa), 935 l. + 1250 l. de tests. Les **5 tests de propriété existent et
aucun n'est vacue** :
- *l'honnête ne score jamais sous le cachottier* — **300 scénarios** générés (LCG déterministe),
  plus 3 exceptions **nommées et documentées** (borne haute, polarité `avoid`, `opportunistic`).
- *capteur muet* → `unknown` même jour clos, et le score de l'élève observant reste à 1.
- *un aliment loggé ne crée jamais d'évaluation micronutriment* — balayé sur tous les slugs.
- *`commitment_relations` scellée* : test d'import **+** égalité profonde avec/sans lignes de
  relations (fer 07:00 / calcium 08:30 à 90 min au lieu de 120 ⇒ les deux `met`).
- les 3 fixtures de SCHEMA.md s'évaluent, sur deux passes (jour ouvert / clos).

**Le gate d'affichage est structurel des deux côtés** : union discriminée
`{kind:"insufficient_data"} | {kind:"adherence", overallPct}` — la variante de refus **n'a pas de
champ pourcentage à omettre**. On ne peut pas oublier de le lire.

### W4.2-4.6 ✅ provisionnement par fuseau + balayage, effets durables `log_protocol_event` /
`declare_deviation` (write-through strict : refus de commit sur `missing_readback_row` **et**
`readback_mismatch`), flow `plan_question` avec Tier 0 déterministe, app élève `/app/today` +
`/app/progress`, rappels par créneau (fenêtres déjeuner/collation ajoutées), digest dominical,
colonne `profiles.country` (le résolveur de crise ne renvoie plus le 3114 à un Américain).

### Le run réel (ce qui a été vraiment observé)
Élève créé en SQL, 8 commitments issus des fixtures, fonctions appelées en curl :
`provision → 6 lignes semées` · `evaluate → 8 évaluations` · `sweep → 2 missed, 1 device retenu`.

| ligne | statut | ce que ça prouve |
|---|---|---|
| **Omega-3** *(saumon loggé le même jour)* | `missed` | **non-input n°3 vérifié en run réel** — l'aliment n'a pas nourri le nutriment |
| **Daily HRV** *(Whoop muet, jour clos)* | `unknown` | le capteur silencieux ne devient jamais `missed` |
| Fatty fish 3×/sem *(1 sur 3, semaine ouverte)* | `partial` | le grain `week` reste satisfiable |

`/app/today` : 100 % anglais, `1 of 7 days logged`, badge **Insufficient data**, *« Adherence stays
hidden until 4 days of the week are logged. That is the rule, not a punishment. »* — **aucun
pourcentage nulle part**. Clic réel sur « Log it » : le badge **est resté Missed**, avec une mention
factuelle séparée *« Logged 1x today »*, puis `met` + `off_window` après réévaluation.
**Le tap n'a jamais prétendu être une note.**

### Défauts corrigés par la vérification (3)
> **Le plus utile pour la suite** : les deux tests SQL de référence comptaient **sans filtre**
> (`select count(*) from plan_commitments`). L'élève e2e les a fait passer à 27 et 3 → les
> 19 fixtures et les 28 RLS devenaient rouges **pour une raison sans rapport avec ce qu'ils
> testent**. Comptes scopés aux ids du test : les deux suites sont maintenant vertes *avec* un
> élève réel dans la même base — condition plus dure que l'originale.

- `tsc` : 8 erreurs sur le client browser KEEL (typage PostgREST sans générique `Database`).
- Ceinture anti-fail-open manquante sur `plan_question` — la lane jumelle de celle protégée en W3.

### ⚠️ Défaut GRAVE restant — la boucle conversationnelle est inerte
`buildKeelPlanContext` : **zéro appelant**. `runLogProtocolEvent`/`runDeclareDeviation` : **zéro
import** hors de leur dossier. Le prompt dispatcher n'a **aucun vocabulaire** pour ces deux effets.
`keel_student` n'est jamais passé aux routers.
**Conséquence : un élève qui écrit « j'ai pris mon magnésium » dans le chat produit zéro effet
durable**, et le plancher TCA n'ouvre jamais `disordered_eating_guard` sur un tour de chat
(il est armé côté proactif : rappels et digest sont bien coupés, en fail-closed).
→ **W4.7**, ci-dessous. C'est la moitié runtime de W4.3/W4.4 que les README annoncent eux-mêmes
comme non livrée.

---

## W4.7 + W5 + W6 ✅ — le produit fonctionne de bout en bout

**`deno test` 2235 → 2395 passed / 0 failed. vitest 60/0. tsc 0. 12 migrations KEEL.**
Les deux tests SQL de référence rejoués **avec un coach, un élève et un plan publié réels dans la
même base** : 19 fixtures / 5 négatifs / 28 RLS identiques.

### W4.7 — La boucle conversationnelle est vivante ✅
Les 5 maillons manquants sont câblés et **prouvés par run réel**, pas seulement par grep :
`buildKeelPlanContext` appelé en prod, les 2 effets exécutés sur la lane, le prompt dispatcher
les décrit, `keel_student` passé aux 4 sites de routage, et les **2 ceintures anti-fail-open sont
armées ET exécutées** (leurs tests miroirs ont changé de sens : ils affirmaient « rien n'arme »,
ils prouvent maintenant les deux moitiés de l'invariant).

### W5 — Photo ✅ *(code)* / ⬜ *(jamais exercée contre un vrai modèle — voir D6)*
`wa_parse` conserve enfin le media id ; le gate tier est **recopié avant le moindre octet
téléchargé** (sinon une photo = accès gratuit au modèle) ; filtre anti-hallucination sur
`matched_commitment_id` ; et **une photo ne peut structurellement pas produire un fait
micronutriment ou calorique** (filtre en 2 passes, vérifié en run : tous les champs quantitatifs
de la ligne photo sont NULL).

### W6 — Espace coach ✅
Inscription coach sans téléphone, `plan-publish-v1` (clone+diff, supersede, **appelle bien
`reseedOnPublish`** — 3 évaluations re-semées, la classe phantom-commit est fermée), écran de
relecture éditable à deux files, templates, invitation par token (sha256 seul en base).

### Le parcours complet, réellement observé
Coach créé → invitation → preview anon → acceptation → **import LLM : 6 commitments, 0 à revoir**
→ édition → publication (`student_instruction` copiée **verbatim**, 2 lignes d'audit) →
`/app/today` en anglais avec le badge *Insufficient data* → clic « Log it » → ligne écrite.

> **Le test qui prouve W4.7** : « j'ai pris mon magnésium » envoyé dans le chat, LLM réel →
> `handler=log_protocol_event status=logged committed=1` → ligne `protocol_events` avec
> `substance_ref='magnesium_glycinate'`, puis **`met` / `on_time` / `evidence=text_log`** après
> réévaluation. Second tour : « mardi soir je suis à un anniversaire » → `planned_deviations`.
> Côté coach : *Insufficient data*, **zéro pourcentage, zéro verbatim**, accès audité.
> Publication cross-tenant : **403 `not_your_student`, 0 ligne écrite**.

### Défauts corrigés
> **Le mode d'échec s'est reproduit** : `InviteDialog` avait **zéro appelant** — exactement ce
> que W4.7 venait de réparer ailleurs. Un lot livre une fonction edge + un composant, et aucun
> coach ne peut inviter personne. Câblé, plus les liens vers `/coach/templates` et
> `/coach/clients/:id` qui n'étaient atteignables qu'en tapant l'URL.

**D3 (corrigé par moi après la vague)** : `coach-invite-student-v1` était absent de
`config.toml` → Kong rejetait le JWT du coach (401 constaté en navigateur). Les 3 fonctions sœurs
portent toutes `verify_jwt = false` avec la raison documentée (GoTrue local signe en ES256, la
gateway ne sait pas vérifier) et authentifient **en interne**. Entrée ajoutée + `provision-day-v1`
et `evaluate-adherence-v1` rendues explicites. Vérifié : le 401 vient désormais **de la fonction**
(avec son `request_id`), pas de la gateway — l'auth n'est pas affaiblie, elle est là où le repo la met.

### Défauts restants
- **D6 — RÉSOLU, et le diagnostic initial était FAUX.** La review concluait « `GEMINI_API_KEY`
  dans `supabase/.env` est invalide, la voie vision est morte, le verdict photo n'a jamais été
  exercé contre un vrai modèle ». Les trois affirmations sont fausses.
  **Cause réelle** : il existe **deux** fichiers `.env` avec une clé Gemini — `supabase/.env`
  (**valide**, testée contre Google : elle liste 41 modèles) et la racine `.env` (**invalide**).
  L'agent de review a testé la mauvaise. Le README du dépôt met explicitement en garde contre
  cette duplication ; c'est exactement le piège qu'il décrit.
  **Vérifié** : le conteneur `supabase_edge_runtime` porte bien la clé de `supabase/.env`.
  Et le README de `analyze-meal-photo-v1` documentait déjà un coût **mesuré sur 7 appels Gemini
  réels** — preuve que la voie vision fonctionnait au moment où elle a été écrite.
  → **Action restante côté toi** : supprimer `GEMINI_API_KEY` de la racine `.env`, qui ne sert
  qu'à empoisonner les diagnostics.

  **Modèle vision passé au meilleur disponible** : `gemini-3-flash-preview` →
  **`gemini-3.1-pro-preview`**. La vision est le seul endroit de KEEL où une erreur coûte de la
  confiance et non des tokens — un faux « conforme » fait perdre au coach sa foi dans tout le
  tableau de bord. Exercé de bout en bout via notre propre client (`generateWithVision`) : 200 en
  6,4 s, mode JSON, et sur une image sans nourriture il a répondu `foods: []` avec
  `groups_missing: [protein, vegetable]` — **sans rien halluciner**.
  **Coût re-mesuré, pas estimé** (3 appels) : le rapport de prix est trompeur et à notre
  avantage — Pro répond en ~160 tokens de sortie là où Flash en dépensait ~610 en raisonnement,
  soit **~1,6× le coût de Flash et non ~10×** (~$0.011/photo, ~$0.30-0.80/élève/mois contre
  $12 de prix par élève actif). Ma propre première estimation (~$1/mois) était trop pessimiste :
  corrigée dans le code et dans le README.
- **D4 [FAIBLE]** « mardi **soir** » a produit une déviation *jour entier* au lieu du seul dîner
  (biais de clémence, prompt-only).
- **D5 [FAIBLE, planifié W9]** l'app est en anglais, la **conversation répond en français**.
- **D7 [INFO]** `sophia-brain` absente de `config.toml` : le chat n'est pas testable en HTTP
  localement (la preuve W4.7 est passée par `processMessage`, même fonction et même DB).

---

## MEGA REVIEW adversariale ✅ → `docs/keel/MEGA_REVIEW.md`

6 lentilles indépendantes, **80 findings**, puis réfutation adversariale de chacun des 20 plus
sérieux → **11 confirmés**. Les findings réfutés ne figurent pas au rapport (9 l'ont été, dont
plusieurs « GRAVE » annoncés qui étaient des erreurs de lecture).

### Les 3 bloquants — corrigés et vérifiés (migration `20260727210000`)

**B1 — L'évaluateur n'était jamais appelé.** Aucun cron, aucun trigger, aucun client : le
balayage de 23 h 55 notait `missed` **toutes** les lignes que l'élève avait réellement tenues.
> La preuve est élégante : dans la base e2e locale, les lignes `met` portent un `resolved_at` à
> la **milliseconde** (timestamp JS = le curl manuel de vérification) et les `missed` à la
> **microseconde** (`now()` SQL = le balayage). L'évaluateur n'avait jamais tourné autrement
> qu'à la main — et le run « de bout en bout » de W4 l'avait masqué en l'appelant en curl.

Correctif : cron `keel-evaluate-adherence` à `45 * * * *`, **avant** le balayage de `:55`
(l'ordre compte : sinon le sweep verrouille en `missed` ce que l'évaluateur aurait résolu).
La config est résolue **à l'exécution du job**, pas à la migration — `app_config` est seedé
*après* les migrations, ce qui avait fait échouer silencieusement ma première version.
Chaîne vérifiée en base : provision `:00` → **évaluation `:45`** → balayage `:55`.

**B2 — Les vues Tier B étaient écrivables.** La migration de tenancy révoquait bien les droits
sur les tables, mais ne révoquait qu'`anon` sur les deux vues : `authenticated=arwdDxtm`.
Reproduit via Kong avec de vrais JWT — un coach pouvait **réécrire et supprimer** les faits de
son élève, et **n'importe quel compte authentifié pouvait forger un fait sur n'importe quel
utilisateur** (testé en tant qu'élève, dont `coached_student_ids()` est pourtant vide).
Le test `tenancy_rls_test.sql:290` affirmait « coach insert blocked » : vrai sur la table,
**faux à travers la vue livrée par la même migration**. Corrigé : `authenticated=r` (SELECT seul).

**B3 — `invoke_internal_edge_function` exécutable par `anon`.** Fonction `SECURITY DEFINER`
héritée (pré-KEEL) qui injecte le secret interne côté serveur : un POST avec la seule clé
publishable suffisait à contourner `ensureInternalRequest` sur ~28 fonctions
(`{"mode":"sweep","ignore_timezone_gate":true}` forçait la clôture de journée **fleet-wide**).
Circonstance heureuse : les migrations KEEL avaient supprimé ses derniers appelants — c'était
une **primitive morte**. Révoquée pour `public`/`anon`/`authenticated`.

**G1 (bonus, corrigé)** — le bouton « Log it » s'affichait sur une ligne `polarity='avoid'` et
**inversait la note** : « pas d'alcool en semaine » passait de `met` à `missed` avec un tap
portant pourtant `quantity=0` — et comme la ligne est `grain='week'`, un seul tap coulait un
engagement `core` de toute la semaine, sans possibilité de rétractation.
Corrigé côté front (`canLog` exclut `avoid`) **et** côté serveur (policy DELETE limitée aux
faits `quick_tap` de l'élève, < 36 h — l'append-only reste la règle pour chat/photo/coach).

**Vérifié après correctifs :** 19 fixtures + 5 négatifs ✅ · 28/28 RLS ✅ ·
**2395 tests Deno / 0 failed** ✅ · 60 vitest / 0 ✅ · tsc 0 ✅

### Le garde-fou anti-récidive ✅ — `npm run ci:keel`

La review a trouvé **13 occurrences** du même mode d'échec, pas 3 : l'évaluateur, l'écrivain de
`weekly_reviews`, le lecteur de `contract_change_requests`, le résolveur de crise, le validateur
médical, le bloc de langue…

> Son analyse de la cause est la partie la plus utile du rapport : *« un test unitaire est vert
> précisément quand le module est isolé. Les tests prouvent les branches, jamais les frontières. »*
> Et l'arête manquante — l'appelant — appartient toujours au ticket de quelqu'un d'autre, souvent
> d'une vague ultérieure. Donc personne ne la possède, et rien ne tombe quand elle manque.

`scripts/ci/wiring-check.mjs` possède les arêtes : pour chaque module KEEL il exige **au moins un
appelant de production** — commentaires, tests et `import type` exclus, parce que ce sont
exactement les trois choses qui ont rendu les 13 invisibles. Il vérifie aussi que chaque fonction
edge est déclarée dans `config.toml` (le piège `coach-invite-student-v1`) et atteignable par un
cron ou un appelant, et que les 2 effets KEEL apparaissent bien dans `run.ts`.

Écrit, il a immédiatement trouvé **`day_targets.ts`** — le chargeur slot-aware de W4.3 qui devait
corriger « loguer son petit-déj fait disparaître le dîner ». Il n'est branché nulle part :
`process-checkins` importe toujours le loader legacy. **Le défaut est vivant aujourd'hui.**
Inscrit en exemption **datée et visible** (`W7-PENDING`), pas masqué : la ligne se retire quand
le bilan du soir le lira, et le check redevient rouge si W7 livre sans.

*(Mon détecteur a d'abord produit 5 faux positifs — il cherchait `functions/v1/<nom>` alors que
le frontend construit `${FUNCTIONS_BASE}/<nom>`. Corrigé avant de l'inscrire en CI : un garde-fou
qui crie à tort est un garde-fou qu'on désactive.)*

### Bloquants restants — à traiter en W7 (conception, pas câblage)
- **B4** — `contract_change_requests` est en **écriture seule** : aucune surface coach ne le lit.
  Le plus grave n'est pas technique : quand le plancher TCA se lève, le renderer dit à l'élève
  *« It is flagged to your coach right now »* — **c'est faux**, aucun humain ne peut être alerté.
- **B5** — `weekly_reviews` n'a **aucun écrivain** : `computeWeekAdherence` ne tourne que dans ses
  tests, donc « Insufficient data » est affiché à vie et `risk_band` n'est jamais calculé.
- **B6** — l'élève KEEL est éjecté du provisionnement par l'opt-in WhatsApp et l'`access_tier`
  B2C legacy — alors que dans KEEL **c'est le coach qui paie le siège**.

---

## W7 — Fermer la boucle de tracking WhatsApp ✅ *(avec un défaut grave restant)*

**`deno test` 2395 → 2447 / 0 failed.** vitest 60/0, tsc 0, token-lint + wiring-check OK.

Photo et texte créditent, l'évaluateur a ses 3 correctifs (créneau, republication, jours distincts),
la vue semaine est partagée coach/élève et navigable, les familles ont une identité visuelle
(chip teinté + glyphe), et la durée est réglable par le coach au moment de publier.

### Ce que la vérification a trouvé en exerçant la vraie boucle — 4 défauts structurels, corrigés
> **Le plus révélateur** : le contexte plan envoyé au chat contenait **8 lignes pour un plan de 4**,
> chacune dupliquée avec des états contradictoires — les commitments **supersédés** fuyaient.
> L'évaluateur filtrait déjà par version publiée ; ce loader-là, non.

- Les faits étaient **orphelinés par une republication** : une preuve `partial` apportée par
  l'élève passait à `missed` parce que le fait pointait un id de version morte. **L'action du
  coach détruisait la preuve de l'élève.** Remap des bindings de faits par `template_commitment_key`.
- `commitment_id` n'était **jamais rendu** dans le bloc plan, alors que la règle interdit d'émettre
  un id non affiché → les lignes sans slug (mouvement, lumière, sommeil) étaient **inloggables**.
- `allowed_commitment_ids` n'était **jamais passé** par le seul appelant de production → tout
  liage finissait en `needs_clarify`.

### ⚠️ Défaut GRAVE restant : l'accusé fantôme
Mesuré en run réel : « j'ai fait ma marche de 30 minutes » → le dispatcher n'émet **aucun** effet,
aucune ligne n'est écrite, et le composeur répond quand même **« prise en compte ✅ »**.
L'évaluateur note ensuite `missed`.
Le contrat « aucun accusé sans effet committé » ne couvre que le cas où un effet a été **demandé
puis bloqué**. Quand rien n'est émis, il n'y a rien à réconcilier et le composeur écrit librement.
**C'est le trou, et il contredit la thèse du produit.** → traité en W7.5.

---

## Recherche : la quantification par photo → `docs/keel/PHOTO_QUANTIFICATION.md`

**85 appels réels sur notre modèle**, vérité terrain calculée depuis USDA. Position antérieure
prise trop vite, corrigée par la mesure.

- L'intuition « l'erreur se compense par agrégation » est **mathématiquement juste mais
  inapplicable** : notre erreur est **biaisée**, pas aléatoire. Biais **−26,6 %**, même sens sur
  18 appels/20, Bland-Altman −108 kcal [−154, −62]. L'agrégation divise l'erreur par **1,04**.
- Pente **0,788** : le modèle sous-estime **d'autant plus que le repas est gros** — précisément
  là où un coach a besoin de voir.
- La porte de sortie « ne montrons que des tendances » est fermée par la mesure : **le delta est
  2,5× pire que le niveau** (49 % vs 19,6 %). Seule la *direction* survit (5/5).
- Le modèle **ne sait pas qu'il ne sait pas** : intervalle demandé à 90 %, couverture réelle 58 % ;
  `confidence: high` sur les cas où il se trompe de 28 %.
- Dans l'autre sens, honnêtement : sur la même photo l'IA **bat le diététicien diplômé**
  (36 % vs 44-48 %), et mon chiffre « 42-110 % » était du cherry-picking — **avec les grammages,
  notre modèle est à 2,3 %**. Le problème n'est pas sa culture nutritionnelle, c'est l'invisible.

> **Le vrai trou n'est pas les calories, c'est la quantité — et on la calcule déjà puis on la
> jette.** `meal_analysis.ts` produit un `portion_band`, l'écrit dans `content` jsonb… qui est
> **NON-INPUT #2** : l'évaluateur ne le lit jamais. Et **NON-INPUT #4 autorisait déjà
> `portion`/`serving`** mot pour mot. On s'est auto-censurés sur une ligne qui nous autorisait.

⚠️ **Astroturfing** : les 4 agents ont indépendamment buté sur un faux institut, une fausse étude
à DOI Zenodo fabriqué, promouvant une app à 1,1 % d'erreur (~30× mieux que toute étude sérieuse),
relayée par 9 domaines-coquilles. Qui refait cette recherche conclura à tort que c'est résolu.

---

## W7.5 → W12 🔄 *(en cours : accusé fantôme, portion_band, cartes, anglais, billing, QA, runbooks)*

### W7.5 — B1 refermé pour de bon : le cron parlait une langue que la fonction n'avait jamais apprise

Le correctif de `20260727210000` planifiait `keel-evaluate-adherence` à `45 * * * *` avec le
corps `{"mode":"due"}`. `evaluate-adherence-v1` exigeait `body.user_id` et **ne lisait jamais
`body.mode`** : chaque tick rendait `400 {"error":"user_id is required"}` — et pg_net renvoyant
un identifiant de requête et non un statut, `cron.job_run_details` affichait `succeeded`.
**L'échec était silencieux, et B1 n'avait pas été fermé : il avait été déplacé d'un cron absent
vers un cron inerte.** Aucune adhérence n'était calculée en flotte, donc le balayage de `:55`
repassait tout `unknown` en `missed` : un élève parfaitement observant noté en échec chaque jour.

Correctif (périmètre : `evaluate-adherence-v1/*`, migration `20260728090000`, tests) :

- **Mode de flotte** (`evaluate-adherence-v1/fleet.ts`). Sélection de flotte **réutilisée**, pas
  redupliquée : `loadPublishedPlanVersionsPage` / `loadActiveStudentIds` de `provision-day-v1`
  (mêmes ports), `localDateInTimezone`, `parseProvisionPlanVersion`, et la fenêtre de plan
  dérivée par `selectDaySeedRows` avec zéro commitment (fonction pure) plutôt qu'une seconde
  arithmétique qui divergerait. Le chemin per-user est **inchangé** (même corps, même réponse,
  même 400 sans `user_id`) : les deux portes appellent la même `evaluateStudentDay`.
- **Pas de gate de fuseau, et c'est le point de conception.** `provision-day-v1` gate parce que
  ses passes sont des ÉVÉNEMENTS (le jour s'ouvre une fois, se ferme une fois). L'évaluation est
  un TOTAL COURANT : tout élève est évalué à chaque tick, sur **sa** date locale courante. Un
  fait loggé à 9 h est reflété dans l'heure.
- **L'ordre `:45` avant `:55` tient dans chaque fuseau, pas seulement en UTC.** Le balayage ne
  part que si l'heure locale vaut 23 ; l'évaluation du même tick UTC voit donc une heure locale
  entre 22:50 et 23:49 — la même date locale, quel que soit le décalage (y compris `:30`, `:45`
  et les changements d'heure). Assertion exécutée sur **38 fuseaux × 24 ticks × 2 saisons**
  (`fleet_test.ts::ORDERING`), pas une phrase dans un commentaire.
- **Bornes + troncature bruyante** : budget mural et plafond d'élèves, curseur `next_after_student_id`
  rendu ET `console.error` — un balayage partiel qui rend 200 est exactement la forme du défaut
  qu'on répare. Tally de sortie : évalués / ignorés par raison / erreurs / lignes écrites.
- **Migration `20260728090000`** : replanifie le job avec `{"mode":"fleet"}`, helper `app_config`
  + vault **résolu à l'exécution**, et un fail-loud (R7) qui vérifie l'horaire, l'activité, **le
  corps** et le câblage vault — parce que « le job existe » est justement la vérification qui a
  laissé passer le défaut.

Preuve locale (2 élèves, `Europe/Paris` et `America/Los_Angeles`, plans publiés + faits) :
`{"mode":"fleet"}` → **200**, `students_evaluated: 2`, `rows_inserted: 4`, 4 lignes `met` sur la
bonne date locale de chacun ; replay → `rows_inserted: 0, rows_updated: 4`, empreinte d'état
identique, zéro doublon ; même tick à `2026-07-28T04:30Z` → Paris évalué au **28**, Los Angeles
au **27**. Et la commande du cron **exécutée telle quelle** rend désormais `200` avec le tally
(elle rendait `400`). La ligne `keel-evaluate-adherence:mode` a été retirée du bloc
```keel-cron-contract-pending``` de DEPLOY.md — `deploy-manifest-check` redevient rouge si
quelqu'un l'efface sans corriger.

---

## Décision produit 2026-07-28 — le gate provenance est retiré

**Décision du fondateur, mot pour mot** : « le mark as clinician ordered c'est pas bien, si il dit
quelque chose faut pas le remettre en cause donc on arrête les choses avec les validations
cliniques ».

**Ce qui existait.** Une ligne du registre molécule au-dessus d'une UL NIH, ou touchant la
watchlist d'interactions, **sans** `provenance='clinician_ordered'`, était **dégradée au rendu** :
l'élève recevait « go food-first », sans la dose ; le coach voyait un panneau rouge intitulé
« Shown to the student without the dose », le texte que son élève lirait à la place de sa
prescription, et un bouton « Mark as clinician-ordered » pour la récupérer.

**Ce qui existe maintenant.** La prescription part telle que le coach l'a écrite, dose comprise.
Ce qui reste est une **note factuelle visible du coach seul** — « Above the NIH upper limit
(4000 IU/day) », « Interaction watchlist: Levothyroxine — separate intake by at least 4 hours ».
Elle ne bloque rien, ne dégrade rien, n'exige aucune action, et n'a **aucun contrôle** à cliquer.

**Trois propriétés structurelles, pas des choix de formulation** (chacune tenue par un test) :
`renderCoachSafetyNote` n'a **pas de branche élève** et ne rend qu'une `string` — la couche de
rendu ne peut plus fabriquer un substitut de prescription ; `SafetyFinding` n'a plus ni
`degraded` ni `student_text` **ni aucun booléen** sur lequel brancher un refus ; `provenance`
n'est **plus un champ de `SafetyInput`** — il ne peut pas redevenir une condition par accident.

**Colonnes conservées.** `provenance` et `requires_clinician_signoff` restent en base, à leurs
défauts, avec leur CHECK. Une migration destructive sur des colonnes encore sélectionnées et
exportées ailleurs n'achète rien. L'en-tête de `20260727090000_keel_p0_commitments.sql` porte la
note datée ; les colonnes sont annotées sur place.

**Tests retournés, pas supprimés.** `safety_test.ts` prouvait la dégradation ; il prouve
maintenant que la cible du coach revient intacte, que `provenance` ne change **rien** (les deux
valeurs rendent un résultat strictement égal) et qu'aucune note ne porte de slug interne ni de
verbe normatif. `render_test.ts` prouve que la dose traverse `renderSlotReminder` verbatim.
La propriété « aucun chiffre calorique à l'élève » a été retournée en distinguant ce que la
distinction vaut : une **estimation** de KEEL est interdite, une **dose écrite par le coach** est
sa phrase et voyage entière.

**Risque assumé, écrit** : LEGAL.md §5.2 — un coach non-RD peut prescrire un dosage au-dessus
d'une UL et KEEL le transmet verbatim. Trois contreparties restent ⚖️ **à faire** : CGU coach avec
garantie de qualification + indemnisation, champ « statut d'exercice » obligatoire à l'inscription,
et validation juridique du relais verbatim d'une posologie.

---

## Vérification 2026-07-28 — les 3 lots en run réel, + 4 défauts trouvés et corrigés

**Protocole** : `npx supabase db reset --local`, coach + élève créés en SQL, import réel de
`supabase/tests/keel/sample_coach_plan.txt` par `/coach/import` (vrai appel d'extraction),
publication vers l'élève, composition de repas par l'écran coach, lecture élève.
Aucune assertion ci-dessous n'est tirée du code : toutes viennent du DOM rendu ou de la base.

### Lot A — le gate provenance : ✅ vérifié des deux côtés

- **Aucun bouton « Mark as clinician-ordered »** sur l'écran coach. Aucun texte de substitution.
- **La dose arrive intacte à l'élève** : `/app/today` affiche « Vitamin D3 5000 IU with breakfast ·
  5000 IU », « Iron bisglycinate 25 mg on waking · 25 mg », « Magnesium glycinate 400 mg before bed
  · 400 mg ». Le rendu, pas le code.
- **La note est visible du coach et absente de l'élève** — prouvé des deux côtés :
  côté coach, un bloc `FOR YOUR INFORMATION` sous la ligne concernée (« Above the NIH upper limit
  (4000 IU/day) », « Interaction watchlist: Digoxin — … », « Above the NIH upper limit (350 mg/day)
  ») ; côté élève, `NIH`, `upper limit`, `watchlist`, `Levothyroxine`, `Digoxin`, `clinician`,
  `signoff`, `food-first` sont absents **du `innerText` ET de l'`outerHTML`** — la note n'est pas
  masquée en CSS, elle n'est jamais construite (elle n'est stockée nulle part : `plan-template-v1`
  la calcule à la demande pour l'appelant coach).

### Lot B — Food / Actions : ✅ la séparation existe, ❌ le compteur d'en-tête la contredisait

Structure rendue **côté coach** (bloc teinté vert / bloc teinté orange / encadré pointillé gris) :
`FOOD 11` (EVERY DAY 3 · EVERY WEEK 2 · WHAT WE ARE CUTTING 2 · SUPPLEMENTS 4) ·
`ACTIONS 3` (Movement 1 · Exposure 1 · Sleep 1) · `OBSERVATIONS 3` (« Tracked, not scored »).
**Côté élève** (`/app/today`) : `What I eat 12` · `What I do 3` · `WHAT I RECORD 3`. Même partition
(`planPartOf`), deux écrans.

> **RED corrigé.** L'en-tête annonçait **« 19 commitments »** pour un plan dont la taille réelle est
> **quinze** : le 19 comptait aussi les 3 observations *et* une proposition de trou que le coach
> n'avait pas acceptée et qui ne voyage nulle part. Le bloc observations dit pourtant, mot pour mot,
> « never a thing to hold, so never counted as one » — l'en-tête était le seul endroit à le
> démentir. Il lit maintenant **« 15 to hold · + 3 observed »**, et les observations gardent leur
> section et leur compte un écran plus bas.

### Lot C — le plan de repas : ✅ vérifié

3 plats écrits par le coach, posés sur la grille, `Repeat → Every day` pour l'étalement.
Couverture rendue au coach, par jour : « Monday — protein (Any meal) 3 of 3 · vegetables 1 of 2
*plus 2 similar* · water 0 of 1 · oily fish 1 of 3 · legumes 1 of 3 », avec la phrase
« your student never sees it, and it changes nothing about their adherence » et le bloc d'honnêteté
« 1 line this grid cannot speak about — Breakfast within 90 minutes of waking ».
L'élève voit `/app/meals` en lecture seule, ordonné à partir d'aujourd'hui, titré
**« Meal suggestions »** — aucun contrôle, aucun bouton de log (`read_page` : 4 liens de nav, zéro
action sur la page).

### LE MUR — ✅ tenu, mesuré

- **(a) la FK refuse.** `insert into commitment_evaluations(commitment_id → meal_ideas.id)` →
  `commitment_evaluations_commitment_id_fkey`. Idem avec un `meal_plan_entries.id`. Pas une policy :
  de l'intégrité référentielle.
- **(b) aucun fait écrit par le chemin repas.** Les 2 triggers des tables repas ne contiennent ni
  `protocol_events` ni `commitment_evaluations` (lu dans `pg_get_functiondef`) ; zéro FK dans les
  deux sens entre les tables repas et le compteur ; et `grep` sur l'évaluateur, `adherence.ts`,
  `evaluate-adherence-v1/` et `provision-day-v1/` : **aucune occurrence** de `meal_ideas` /
  `meal_plan_entries`.
- **(c) une semaine entière de repas ne bouge pas l'adhérence.** 11 → **21** placements (7 petits
  déjeuners, 7 déjeuners, 7 dîners), puis **ré-exécution réelle de l'évaluateur** en mode flotte :
  `protocol_events` **3 → 3**, empreinte d'adhérence
  `7847c24cfa9eba53f1b92bc854a5f850` **identique avant et après**, 5 `met` / 9 `unknown` inchangés.

### Tokens internes — ✅ 9 écrans balayés, 0 fuite… après correction

Balayage du `innerText` de `/coach`, `/coach/import`, `/coach/templates`, `/coach/clients/:id`,
`/coach/clients/:id/meals`, `/app/today`, `/app/progress`, `/app/meals`, `/app/cards` contre ~50
tokens (slugs, noms de colonnes, noms de contraintes, comparateurs). **0 trouvé.**

> **RED corrigé — la vocabulaire de stockage était encore sur l'écran de l'ÉLÈVE.** Le chip de la
> ligne était bâti par `targetLabel`, qui imprime le triplet de stockage. Mesuré sur le plan publié,
> les mêmes lignes se lisaient de deux façons :
>
> | coach | élève (avant) |
> |---|---|
> | `Weekdays, at 23:00` | `<= 2300 time` |
> | `Weekdays — none` | `0` |
> | `Every day — 2 servings` | `>= 2 serving` |
>
> `time` est le libellé du token d'unité `hhmm` et `2300` une horloge stockée en entier : l'élève
> lisait deux internes collés. `amountPhrase` — la fonction dont la phrase du coach est faite — est
> désormais exportée (`commitmentAmount`) et utilisée par `CommitmentLine` **et** par `WeekView`
> (la vue semaine partagée avait la même fuite). Une seule fonction de rendu, donc les deux écrans
> ne peuvent plus diverger. `WeekLine` étend `CommitmentShape` : les deux chargeurs sélectionnaient
> déjà `COMMITMENT_COLUMNS`, rien de nouveau n'est lu.

### Deux défauts structurels trouvés en passant, corrigés

**1. Le plan de repas n'était atteignable qu'en tapant l'URL.** `/app/meals` n'était dans aucune
nav, et **rien nulle part** ne pointait vers `/coach/clients/:id/meals`. C'est l'échec des « treize
modules non câblés » un cran plus haut : `wiring-check` possède l'arête module → appelant, et une
route React **est** un appelant, donc le check restait vert pendant que l'écran entier était
inaccessible. Ajoutés : l'entrée `Meals` dans la nav élève, et le lien « Plan this student's meals »
sur la fiche élève du coach (offert seulement si un plan est publié — le composeur pend d'une
version publiée).

**2. ⚠️ Le plus grave : un plan publié peut n'ouvrir aucune journée, en silence.**
Sur le run réel, l'extraction a rendu `slot_kind: null` sur **les dix-huit lignes**. La colonne est
nullable, `plan-publish-v1` accepte, puis `selectDaySeedRows` écarte tout ce qui n'est pas
`slot_kind='nominal'` : `provision-day-v1` a répondu **200** avec `rows_seeded: 0` et
`skipped_by_reason: {slot_kind_not_nominal: 18}`. Aucune journée ne s'ouvre, aucune alarme.

Correctif au bon étage — pas la base, pas le provisionnement, mais **la question au coach**.
`import_rules.ts` a déjà une file « To verify » et déjà la question `slot_kind` en catalogue ; il
manquait la règle qui la lève. Une ligne `anchor_kind='slot'` dont le moment n'est pas qualifié est
maintenant `needs_review` (jamais bloquante : la ligne est légale, et refuser l'import sur un champ
que le coach n'a pas écrit lui rendrait un mur au lieu d'une question). **Les deux conditions de
désarmement sont écrites et testées** (doctrine P9) : `anchor_kind != 'slot'` (une ligne libre n'a
pas de moment à qualifier) et `slot_key = 'any_meal'` (où `plan_commitments_nominal_slot_check`
*interdit* `nominal` — demander de l'épingler serait demander une ligne que SQL refuse).

*Non corrigé, à arbitrer* : faut-il que `plan-publish-v1` refuse carrément cette combinaison ? C'est
une décision produit (refuser / défaut / avertir), et défaulter à `nominal` inventerait une
propriété de prescription que le coach n'a pas écrite.

### Un faux rouge de test, corrigé

`supabase/tests/keel/provisioning_rpc_test.sql:172` comptait **toutes** les lignes de
`commitment_evaluations` de la journée, sans portée : sur une base contenant aussi un vrai élève il
rendait « got 13, want 4 ». Un test qui échoue parce que la base n'est pas vide est un faux rouge,
et un faux rouge est un test qu'on apprend à ignorer. Les deux assertions concernées sont désormais
portées sur l'utilisateur et la version de plan de la fixture.

### Vérifications (après correctifs)

`deno test` **2738 / 0 failed** (2708 avant, +4 tests slot_kind) · `tsc` 0 · vitest **150 / 0**
(dont `labels.int.test.ts` 57, +6 sur `commitmentAmount`) · token-lint OK (108 fichiers) ·
wiring-check OK (13 modules, 13 fonctions, 2 effets — `keel-meal-plan-v1` inclus) · pixel-check OK
(184 fichiers, 7 règles) · **6 fichiers de tests SQL, tous verts** (les `ERROR` restants sont les
négatifs attendus, chacun sous son `\echo NEG`). `git status` : les 12 fichiers touchés sont ceux
listés ci-dessus, tous dans les répertoires KEEL non suivis ; aucun intrus.
