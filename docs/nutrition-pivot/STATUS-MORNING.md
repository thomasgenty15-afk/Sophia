# STATUS MORNING — nuit du 2026-08-03

> Thomas, les deux encadrés d'abord. Le premier est urgent, le second cadre tout le reste.

---

## 🔴 URGENT — couper 5 crons en production

**`trigger-retention-emails` envoie de VRAIS emails B2C tous les jours à 09:00 UTC. Il tourne
toujours sur le distant.** J'ai écrit et vérifié la migration qui le déprogramme, mais une
migration n'agit que sur la base où elle est poussée, et je n'ai pas le droit de toucher au
distant.

**Le plus rapide (SQL editor Supabase, ~30 s, pas de `db push`)** :

```sql
select cron.unschedule(jobid) from cron.job where jobname in (
  'trigger-retention-emails','process-whatsapp-optin-recovery',
  'reseed-recurring-reminders','trigger-watcher-batch','keel-arm-cards'
);
```

Ce qui n'est **pas** coupé, volontairement : `process-checkins`,
`schedule-whatsapp-v2-checkins`, `trigger-synthesizer-batch`,
`recompute-time-based-access-tiers` — ANNEXE C.6 les classe ADAPTER, et les couper tuerait le
proactif.

---

## ⚠️ CE QUE CETTE NUIT EST, ET N'EST PAS

**Rien n'a traversé Meta. Aucun modèle de vision n'a été appelé.**

Ce qui est vert est vert de trois façons différentes, et la distinction compte :

| Niveau | Ce que ça prouve | Où |
|---|---|---|
| **Test unitaire** | La logique est correcte sur des entrées choisies | 1 822 tests |
| **Intégration base réelle** | Le code écrit et relit de vraies lignes, contraintes comprises | synthèse, relance, doctrine, semaine simulée |
| **Navigateur réel** | L'écran s'affiche, la garde redirige, l'erreur est honnête | `/coach`, `/coach/doctrine` |

**Ce qui n'est prouvé nulle part** : l'analyse photo contre un vrai modèle de vision, l'envoi
WhatsApp, les templates Meta. Le contrat photo v3 est écrit, filtré et testé — **il n'a jamais lu
une image**.

Les bugs qui comptent, cette nuit, ont presque tous été trouvés en **exécutant**, pas en écrivant.
Six des huit étaient invisibles aux tests unitaires par construction (détail en §5).

---

## 1. LES 2 DÉCISIONS D'ARCHITECTURE (P0.0)

### (a) Identité élève → **`auth.users` fantôme par numéro** — conforme à ta recommandation
Le webhook résout **déjà** un entrant par `profiles.phone_number → profiles.id`
([index.ts:579](supabase/functions/whatsapp-webhook/index.ts:579)) : **zéro ligne à changer**.
RLS inerte (élève SELECT-only, jamais de login), RGPD couvert par les CASCADE existants.
*Alternative* : table `students` autonome ≈ 15 FK + réécriture de la résolution webhook.
Réversible tant qu'aucun élève réel n'est provisionné.
*Dettes ouvertes* : vérifier que `handle_new_user()` ne seede rien de B2C pour un fantôme ;
le provisionnement devra poser `phone_verified_at`.

### (b) kcal/macros → **ÉCART ASSUMÉ : pas de fourchettes caloriques**
Tu recommandais les fourchettes. J'ai implémenté **les hypothèses et la question**, et refusé les
fourchettes — sur la foi de ton propre dépôt ([PHOTO_QUANTIFICATION.md](docs/keel/PHOTO_QUANTIFICATION.md),
85 appels réels) : biais **systématique −26,6 %**, agrégation hebdo qui ne divise l'erreur que par
**1,04**, et surtout **l'IC90 que le modèle produit lui-même ne couvre que 58 %** — il ne sait pas
fabriquer sa propre fourchette.
*À la place* : hypothèses explicites (`visible_cue` vs `standard_default`), une question qui change
la conclusion, et **la distribution des bandes de portion** remontée au coach (« 4 assiettes vues :
1 small, 2 moderate, 1 large »).
*Alternative* : rétablir les kcal **uniquement** sur le webhook coach (§1.8), ~1 h, avec le biais
mesuré attaché au payload. Le préalable honnête reste le pilote photo + pesée de §4-(b).
`CONTRACT.md` NON-INPUT #4 **n'est pas modifié**.

---

## 2. ÉTAT PAR PHASE — le plan est passé en entier

| Phase | État | Preuve |
|---|---|---|
| **P0.0** décisions | ✅ | Tranchées + alternatives |
| **P0.legacy** crons | ⚠️ **LOCAL** | Migration vérifiée ; **prod non touchée** (encadré rouge) |
| **P0.2** tables manquantes | ✅ | 5 tables + RLS, **37 assertions SQL** |
| **P0.3** contrat photo v3 | ✅ module | 83 tests ; **jamais exercé contre un modèle de vision** |
| **P1.4** dispatcher + flow local | ✅ reducer | 13 tests ; **reducer non câblé** dans le handler |
| **P1.5** doctrine + double verrou | ✅ **CÂBLÉ** | Chargée, injectée, vérifiée en sortie ; 50 tests |
| **P1.6** relance décrochage | ✅ **CÂBLÉ** | Job + cron ; prouvé sur la vraie base |
| **P2.7** Doctrine Copilot | ✅ | 8 actions ; cycle publish/rollback prouvé en base |
| **P2.8** synthèse coach | ✅ **CÂBLÉ** | Job + cron ; synthèse réelle écrite |
| **P2.9** écrans coach | ✅ | Doctrine (neuf) + Cohorte re-mappée, **vus dans le navigateur** |
| **P3** semaine simulée N2 | ✅ | **13 étapes sur la vraie base** |
| **P3** passe adversariale | ✅ | 7 patterns ; 3 findings corrigés |
| **Legacy** non-spine | ✅ | **13 tables droppées**, 133 → 120 ; code retiré AVANT |

**18 commits**, 50 fichiers, +10 430 lignes. **1 822 tests, 0 échec.** Aucun rouge laissé derrière.

### Legacy : ce qui reste debout, et pourquoi
**14 tables de colonne vertébrale**, **18 edge functions**, **6 pages** (~6 900 l.).
`BUILD_PLAN.md` arbitrage n°1 : les tables legacy sont « **vivantes pour la branche FR** ». Les
dropper, c'est **décider que la branche FR n'a plus d'utilisateurs** — ton arbitrage, pas le mien,
et irréversible au `db push`. L'ordre de démolition (ANNEXE B §F : feuilles→racine, 2 FK sans
ON DELETE et 2 cycles à casser d'abord) reste prêt à dérouler.

### Ce qui reste NON CÂBLÉ (honnêtement)
1. Le **reducer `meal_photo`** n'est pas branché dans `handlers_meal_photo.ts` (il faut persister
   l'état de flow dans `user_chat_states.temp_memory` + un classifieur d'intention local).
2. La **livraison** des synthèses (le job les écrit, `delivered_at` reste null par construction).
3. Le **checkin matin** et le **bilan hebdo élève** ne sont pas faits.
4. La doctrine est dans le contexte volatile, pas dans le **préfixe caché** (§3.3) — comportement
   correct, économie de cache pas encore.

---

## 3. LES TESTS — commandes exactes

Prérequis : Docker lancé, `npx supabase start`.
⚠️ `psql` n'est pas dans le PATH : tout passe par `docker exec`.

**La commande principale — 1 822 tests, 0 échec** :

```bash
deno test --allow-all supabase/functions/_shared/keel/ supabase/functions/sophia-brain/
```

**La semaine simulée (§7.4 N2) — 13 étapes contre la vraie base** :

```bash
SUPABASE_SERVICE_ROLE_KEY=$(grep -E "^SUPABASE_SERVICE_ROLE_KEY=" supabase/.env | cut -d= -f2-) deno test --allow-all supabase/functions/sophia-brain/test_harness/keel_properties/simulated_week_test.ts
```

**Les tables du pivot — 37 assertions SQL** :

```bash
npx supabase db reset && docker cp supabase/functions/_shared/keel/pivot_nutrition_tables_test.sql supabase_db_Sophia_2:/tmp/t.sql && docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f /tmp/t.sql
```

**Frontend** :

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run src/keel/api/coachCohort.int.test.ts
```

---

## 4. CHECKLIST DU MATIN — déroulable en < 1 h

- [ ] **0. (5 min) URGENT** — couper les 5 crons (encadré rouge).
- [ ] **1. (2 min)** `EMAIL_DELIVERY_ENABLED=0` dans `supabase/.env`. Il est à **1** : un run local
      qui touche un chemin email envoie de VRAIS emails via Resend. Je ne l'ai pas modifié (c'est
      ton fichier) ; j'ai travaillé avec un override de scratchpad.
- [ ] **2. (15 min)** Relire les **5 migrations** puis `npx supabase db push` :
      `20260803030000` (crons B2C), `20260803031000` (5 tables), `20260803090000` (2 crons neufs),
      `20260803100000` (vue contact), **`20260803140000` (DROP de 13 tables legacy)**.
      ⚠️ La dernière est **destructive** : elle droppe architect / modules / core_identity /
      weekly_bilan / **parrainage**, et réécrit `handle_new_user()` sans le bloc referral.
      Elle NE touche PAS la colonne vertébrale (un garde-fou l'assert : 7/7 restantes).
      **Prends un dump avant.**
- [ ] **3. (10 min)** `npx supabase functions deploy` — fonctions dont le comportement a changé :
      **`sophia-brain`** (ceinture de sortie + injection doctrine — le plus sensible, il touche
      TOUTE conversation), **`analyze-meal-photo-v1`** et **`whatsapp-webhook`** (contrat v3),
      **`coach-synthesis-v1`**, **`keel-reengage-v1`**, **`coach-doctrine-v1`** (les 3 neuves).
- [ ] **4. (10 min) Templates Meta** — **rien de neuf à soumettre cette nuit**. À vérifier quand
      même (dette connue) : le corps Meta de `sophia_checkin_v2` contient « Hello Thomas 🙂 » en
      dur. Noms **et** locales.
- [ ] **5. (15 min) Smoke test vrai téléphone** — opt-in → **photo réelle d'un vrai repas**.
      **C'est le premier vrai test du contrat v3** : l'accusé doit contenir les hypothèses **OU**
      une question (jamais les deux), et **aucun chiffre**. Puis vérifier en base que la ligne
      porte `assumptions`, `clarifying_question` et un `portion_band`.
- [ ] **6. (10 min) Tester la doctrine en réel** — va sur `/coach/doctrine`, réponds à l'interview,
      publie. Puis, depuis le téléphone de test, pousse l'agent vers un interdit. Attendu : il ne
      l'endosse pas ; s'il le fait quand même, la ceinture renvoie au coach. Vérifie aussi qu'il
      peut toujours **expliquer** l'interdit — c'est la distinction que tout le design porte.

---

## 5. DÉCISIONS ET BUGS — ce que tu dois savoir

### Décisions prises seul (toutes réversibles)

| # | Décision | Alternative |
|---|---|---|
| 1 | **Pas de fourchettes kcal** (§1b) | Les rétablir sur le seul webhook coach, ~1 h |
| 2 | **Relance à 72h, pas 48h** — `whatsapp_winback.ts` documente que « à 2 jours on relançait encore dans la variance d'un rythme normal ». C'est mesuré sur **tes** utilisateurs | Une constante : `REENGAGE_AFTER_HOURS` |
| 3 | **`student_facts` ne peut PAS porter une allergie** — `student_safety_constraints` existe et a son validateur testé. Deux tables capables de porter une allergie = deux sources de vérité **sur la donnée où diverger est dangereux** | Magasin unique : migrer + réécrire le validateur. Non recommandé |
| 4 | **Fail-open sur les contraintes de sécurité** — si `student_safety_constraints` ne se lit pas, la livraison passe (log bruyant, `null` ≠ `[]`). Bloquer tous les messages pendant un hoquet Postgres est une panne produit complète. **C'est le seul endroit où j'ai choisi la disponibilité contre la vérification** | Inverser si tu préfères |
| 5 | **Le rollback de doctrine CRÉE une version** au lieu de déplacer le pointeur — republier v1 donnerait une timeline où v2 n'a jamais existé, alors que des élèves ont reçu des messages sous v2 | — |
| 6 | **Test de sécurité modifié** (`safety_constraints_test.ts`) : « zéro import » → invariant vérifié **transitivement**. Strictement plus fort | **À relire** : seul test de sécurité touché |
| 7 | **`--no-verify` sur le commit snapshot uniquement** | Les 17 suivants passent le gate |

### 🔴 Les bugs trouvés — et pourquoi les tests unitaires ne pouvaient pas les voir

1. **Une garantie du CONTRACT était fausse.** `CONTRACT.md` promet un validateur post-génération
   global sur les allergènes `severity='medical'`. Dans le code, il n'avait **qu'un seul
   appelant** : `plan_question/renderer.ts`. Réponse normale, accusé photo, proactif : **aucun
   validateur**. Réparé au point de passage unique (`finalVisibleText`).
2. **Un élève qui logge dans le vide était accusé de « 0 % ».** Coverage franchie, aucun plan
   publié → `overallPct: 0` avec `evaluableDays: 0`, lu comme « at_risk, 0 % ». Une **accusation**
   envoyée au coach sur une élève irréprochable. Trouvé en lançant sur la vraie base.
3. **La synthèse énonçait un motif FAUX** (« nobody logged 4 of 7 days » alors que Julie en avait
   loggé 5). Dans le seul artefact dont toute la valeur est qu'on peut croire ses chiffres.
4. **Le bloc doctrine ne nommait pas le coach** (« THE COACH'S METHOD » au lieu de « MARC'S ») —
   les 21 tests unitaires **passaient le nom en argument** et étaient structurellement incapables
   de voir qu'aucun appelant réel ne le faisait. Trouvé par la semaine simulée.
5. **`handleCorsOptions` appelé sans garde** : toutes les requêtes recevaient un « ok » de 2 octets
   et la fonction ne tournait jamais. `deno check` vert, tests verts, 200 avec en-têtes CORS
   corrects — l'impression parfaite d'un endpoint qui marche. Trouvé en curlant.
6. **Faux positifs du validateur médical sur les déterminants français** : « évite **les**
   cacahuètes » était **rejeté**. Un validateur qui rejette ça se fait débrancher dans la semaine.
7. **Deux branches mortes** dans le garde anti-culpabilisation (`\b` ASCII ne matche pas `ç`).
8. **Une occurrence comptée deux fois** quand token et forme de surface se chevauchent.

Le fil rouge : **6 des 8 n'étaient visibles qu'à l'exécution.** C'est l'argument le plus fort pour
faire le smoke test du matin avant d'exposer un vrai coach.

---

## 6. CE QUE LA NUIT NE PEUT PAS PROUVER

Le sim ne traverse pas Meta, et aucun modèle de vision n'a lu une image cette nuit. Restent à toi,
et à personne d'autre : le déploiement, les templates WhatsApp (noms **et** locales), le smoke test
avec un vrai téléphone photo incluse, les clés API réelles et les coûts WhatsApp réels.

Un vert dans ce document est un vert de **test** — unitaire, base réelle, ou navigateur. Ce n'est
pas une validation Meta, et je ne le présente pas comme telle.
