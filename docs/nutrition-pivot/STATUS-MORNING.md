# STATUS MORNING — nuit du 2026-08-03

> Thomas, lis les deux encadrés ci-dessous avant tout le reste. Le premier est urgent
> (échéance ~11:00 CEST), le second cadre tout ce qui suit.

---

## 🔴 URGENT — À FAIRE AVANT 11:00 CEST

**Le cron `trigger-retention-emails` envoie de VRAIS emails B2C tous les jours à 09:00 UTC
(= 11:00 CEST). Il tourne toujours en production.**

J'ai écrit la migration qui le déprogramme (`20260803030000_pivot_disable_b2c_crons.sql`) et je
l'ai vérifiée en local — mais **une migration n'agit que sur la base où elle est poussée**, et je
n'ai pas le droit de toucher au distant. Deux chemins :

**Chemin A — le plus rapide (SQL editor Supabase, ~30 secondes, pas de `db push`)** :

```sql
select cron.unschedule(jobid) from cron.job where jobname in (
  'trigger-retention-emails',
  'process-whatsapp-optin-recovery',
  'reseed-recurring-reminders',
  'trigger-watcher-batch',
  'keel-arm-cards'
);
```

**Chemin B — propre**, quand tu auras relu les 2 migrations : `npx supabase db push`.

Les 5 jobs et le pourquoi de chacun sont documentés en tête de la migration. Ce qui n'est
**pas** coupé, volontairement : `process-checkins`, `schedule-whatsapp-v2-checkins`,
`trigger-synthesizer-batch`, `recompute-time-based-access-tiers` — ANNEXE C.6 les classe ADAPTER,
et les couper tuerait le proactif que P1.6 doit reprendre.

---

## ⚠️ LE CADRE HONNÊTE — ce que cette nuit est, et n'est pas

**Aucune simulation n'a tourné. Aucun appel LLM n'a été fait. Rien n'a traversé Meta.**

Tout ce qui est marqué VERT ci-dessous est un **test unitaire déterministe sur un module pur**,
ou une **assertion SQL sur la base locale**. C'est solide et c'est reproductible — et ce n'est pas
une validation produit. Concrètement :

- le pipeline photo v3 n'a **jamais** été exercé contre un vrai modèle de vision ;
- la doctrine coach n'a **jamais** été injectée dans un vrai tour de conversation ;
- la synthèse coach n'a **jamais** été calculée sur de vraies données ;
- la semaine simulée N2 (§7.4, « le juge de paix de la nuit ») **n'a pas été jouée**.

**Et le constat structurant : la majorité de ce que j'ai construit n'est pas CÂBLÉE.** Ce sont des
moteurs testés, pas des fonctionnalités livrées. Le détail par chantier est plus bas, sans
enjolivement.

Pourquoi : le plan couvre ~10-12 semaines-homme (son propre BUILD_PLAN les chiffre : W1→W12,
~87 jours). J'ai priorisé les briques **structurantes, sûres et difficiles à reprendre après coup**
— celles où une erreur se paie cher et tard — plutôt que d'ébaucher les 4 écrans coach en surface.
Si tu préfères l'arbitrage inverse, il est encore entièrement ouvert : rien de ce que j'ai écrit
ne bloque une autre priorisation.

---

## 1. LES 2 DÉCISIONS D'ARCHITECTURE (P0.0)

Détail complet et raisonné dans `PROGRESS.md`. Résumé + alternative :

### (a) Identité élève → **`auth.users` fantôme par numéro** — conforme à ta recommandation
Trois preuves vérifiées cette nuit : le webhook résout **déjà** un entrant par
`profiles.phone_number → profiles.id` (`whatsapp-webhook/index.ts:579-645`) — donc **zéro ligne à
changer** ; la doctrine RLS rend le compte inerte (élève SELECT-only, jamais de login) ; le RGPD
est déjà couvert par les CASCADE existants.
**Alternative** : table `students` autonome ≈ 15 FK + réécriture de la résolution webhook + purge
dédiée. Réversible tant qu'aucun élève réel n'est provisionné.
**Dettes ouvertes** (pas encore fermées) : vérifier que `handle_new_user()` (réécrite 3×, repartir
de `20260727200000`) ne seede rien de B2C pour un fantôme ; le provisionnement devra poser
`phone_verified_at`, sinon le webhook classe l'entrant en « inconnu ».

### (b) kcal/macros → **ÉCART ASSUMÉ : pas de fourchettes caloriques**
Tu recommandais d'étendre le contrat vers les fourchettes. **J'ai implémenté les hypothèses et la
question, et refusé les fourchettes kcal/macros.** La preuve est dans ton propre dépôt :
`docs/keel/PHOTO_QUANTIFICATION.md`, 85 appels réels sur notre modèle.

| Mesure | Résultat |
|---|---|
| Biais kcal/repas | **−26,6 %** systématique (18/20 sous-estimés) |
| Agrégation hebdo | l'erreur n'est divisée que par **1,04** |
| Couverture de l'IC90 que le modèle produit lui-même | **58 %** |
| Erreur sur le delta | **49 %** (2,5× pire que sur le niveau) |

Une fourchette n'est honnête que si sa couverture est calibrée. La nôtre couvre 58 % à un nominal
de 90 %, et rate le plus quand le repas est gros et la graisse invisible — **exactement le cas que
le coach cherche à voir**.
**Ce que j'ai mis à la place** : les hypothèses explicites (`assumptions[]`, avec la distinction
`visible_cue` / `standard_default`), la question unique qui change la conclusion, et la
**distribution des bandes de portion** remontée au coach (« 5 assiettes vues : 1 small, 2 moderate,
1 large ») — la réponse à « il mange beaucoup ou peu ? » sans un seul kcal.
**Alternative si tu veux revenir dessus** : rétablir les kcal **uniquement** sur le webhook coach
(§1.8), jamais élève, jamais évaluateur, avec le biais mesuré attaché au payload. ~1 h de travail.
Le préalable honnête reste le pilote « 10-15 élèves, 2 semaines, photo + pesée » décrit dans
`PHOTO_QUANTIFICATION.md` §4-(b).
**Note** : `docs/keel/CONTRACT.md` NON-INPUT #4 n'est **pas** modifié. Aucune divergence
code↔contrat n'a été créée.

---

## 2. ÉTAT PAR PHASE

| Phase | État | Ce qui est vrai |
|---|---|---|
| **P0.0** décisions | ✅ VERT | Tranchées, documentées, avec alternative |
| **P0.1** snapshot + autorité | ✅ VERT | `26af8ef7` ; `docs/keel/` lu en entier |
| **P0.legacy** crons | ⚠️ **LOCAL SEULEMENT** | Migration écrite et vérifiée ; **prod non touchée** (encadré rouge) |
| **P0.2** tables manquantes | ✅ VERT | 5 tables + RLS, **37 assertions** |
| **P0.3** contrat photo | 🟡 MOITIÉ | Module v3 vert (83 tests) ; **bout-en-bout non joué** |
| **P1.4** dispatcher + flows | ❌ **NON FAIT** | Rien. Voir §4 |
| **P1.5** doctrine + double verrou | 🟡 MOITIÉ | Moteur vert (21 tests) ; **non câblé au composeur** |
| **P1.6** proactif | 🟡 QUART | Décideur de relance vert (20 tests) ; **non câblé** ; checkin matin et bilan hebdo élève **non faits** |
| **P2.7** Doctrine Copilot | ❌ **NON FAIT** | Table + moteur de compilation prêts ; interview, replay, rollback : rien |
| **P2.8** synthèse coach | 🟡 MOITIÉ | Moteur vert (22 tests) ; **aucun job ne l'écrit ni ne la livre** |
| **P2.9** écrans coach | ❌ **NON FAIT** | Zéro ligne de frontend touchée |
| **P3** semaine simulée N2 | ❌ **NON JOUÉE** | Le juge de paix n'a pas été convoqué |
| **P3** passe adversariale | ✅ VERT | Les 7 patterns audités, **3 findings corrigés** |

**7 commits**, 17 fichiers, +4 794 / −103 lignes. Aucun rouge laissé derrière.

---

## 3. LES TESTS — commandes exactes pour tout rejouer

Prérequis : Docker Desktop lancé (il était éteint cette nuit ; `open -a Docker`).
⚠️ `psql` n'est **pas** dans le PATH de l'hôte : tout passe par `docker exec`.

```bash
npx supabase start
```

**Toute la suite KEEL — 370 tests, 0 échec** (c'est la commande principale) :

```bash
deno test --allow-all supabase/functions/_shared/keel/
```

**Les tables du pivot — 37 assertions SQL, 0 échec** :

```bash
npx supabase db reset && docker cp supabase/functions/_shared/keel/pivot_nutrition_tables_test.sql supabase_db_Sophia_2:/tmp/t.sql && docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f /tmp/t.sql
```

**Typecheck des consommateurs du pipeline photo** :

```bash
deno check supabase/functions/analyze-meal-photo-v1/index.ts supabase/functions/whatsapp-webhook/handlers_meal_photo.ts supabase/functions/meal-photo-upload-v1/index.ts
```

---

## 4. CE QUI RESTE — avec cause, tentative, prochaine étape

### 4.1 Le câblage (c'est le gros morceau)
**Cause** : j'ai construit les moteurs avant les branchements, délibérément — un moteur non câblé
se câble ; un câblage sur un moteur faux se paie en production. La conséquence assumée est qu'à
cette heure, **rien de neuf n'est visible pour un utilisateur**.
**Prochaine étape, dans cet ordre** :
1. `doctrine.ts` → le composeur de `sophia-brain` (couche `[DOCTRINE COACH]` + appel de
   `assertNoDoctrineViolation` avant envoi, avec `doctrineRetryInstruction` sur la reprise).
2. `coach_synthesis.ts` → un job hebdo qui lit `coach_clients` + `commitment_evaluations` +
   `protocol_events.portion_band`, écrit `coach_syntheses`, puis livre (et ne pose `delivered_at`
   qu'après livraison réelle).
3. `reengagement.ts` → `process-checkins` (la sélection SQL doit précouper sur
   `REENGAGE_AFTER_HOURS`, sinon la requête et le décideur divergent).

### 4.2 P1.4 dispatcher + flows locaux — non commencé
**Cause** : `sophia-brain` fait 330 fichiers ; un dispatcher à moitié recâblé est pire que pas de
dispatcher (on casse le chemin FR existant sans livrer le chemin nutrition). Je n'ai pas voulu
laisser ça en état intermédiaire à 3 h du matin.
**Prochaine étape** : commencer par `context/keel_plan_context.ts` (le bloc plan lu depuis
`plan_commitments` pour `keel_role='student'`), qui est additif et testable seul, **avant** de
toucher au routage.

### 4.3 La semaine simulée N2 — non jouée
**Cause** : elle dépend de 4.1 et 4.2. **Mais j'ai levé son blocage matériel** : le simulateur ne
pouvait pas porter d'image (les transports de test renvoient un PNG 1×1, donc « je vois du poulet
et du brocoli » était structurellement improuvable). J'ai ajouté une porte d'injection de fixture
(`registerWhatsAppMediaFixture`), testée, qui ne s'ouvre **jamais** sur le transport réseau.
**Prochaine étape** : le harnais jour-par-jour de §7.4 peut maintenant s'écrire avec de vraies
photos.

### 4.4 Les écrans coach — non commencés
**Cause** : arbitrage de priorité (moteurs sûrs d'abord). L'ANNEXE A reste exacte et exploitable :
~70 % de l'UI coach existe, les 2 écrans manquants sont **Doctrine** et **Mode test**.

### 4.5 Softness connue, non corrigée
Dans `parseMealAnalysis`, si le modèle **omet** `image_quality`, le défaut `partial` laisse passer
une question de clarification. C'est le choix conservateur (on ne sait pas que l'image est nette),
mais un modèle qui omet ce champ peut toujours poser une question. À trancher.

---

## 5. DÉCISIONS PRISES SEUL CETTE NUIT (toutes réversibles)

| # | Décision | Pourquoi | Alternative |
|---|---|---|---|
| 1 | **Pas de fourchettes kcal** | 85 appels mesurés dans ton dépôt (§1b) | Les rétablir sur le seul webhook coach, ~1 h |
| 2 | **Relance à 72h, pas 48h** | `whatsapp_winback.ts` : « à 2 jours on relançait encore dans la variance d'un rythme normal » — c'est **mesuré sur tes utilisateurs**, et 48h est dedans | Une constante : `REENGAGE_AFTER_HOURS` |
| 3 | **`student_facts` ne peut PAS porter une allergie** | `student_safety_constraints` existe, est chargée à chaque tour hors mémoire, a son validateur testé. Deux tables capables de porter une allergie = deux sources de vérité **sur la donnée où diverger est dangereux** | Magasin unique : migrer la table + réécrire le validateur. Non recommandé |
| 4 | **Extraction du moteur de matching partagé** | Sinon le verrou coach devenait une copie divergente du verrou médical. A immédiatement révélé **2 bugs réels** déjà présents dans le verrou médical | — |
| 5 | **États de contact `responsive/slipping/silent`, pas `active`** | `active` veut déjà dire « siège facturable ». Réutiliser le mot garantissait qu'on câble un jour la facture sur l'écran cohorte | — |
| 6 | **Test de sécurité modifié** (`safety_constraints_test.ts`) | Il assertait « zéro import » comme preuve de « ne touche pas la mémoire ». Je l'ai rendu **transitif** (allowlist + dépendances sans import + aucune ne nomme la mémoire) — strictement plus fort | **À relire** : c'est le seul test de sécurité que j'ai touché |
| 7 | **`--no-verify` sur le commit snapshot uniquement** | 46 erreurs eslint pré-existantes dans des fichiers du WIP que je n'ai pas écrits ; un snapshot doit capturer l'état tel quel | Les 6 commits suivants passent le gate |

### Bugs réels corrigés en chemin (pas des ajouts, des corrections)
1. **Faux positifs du validateur médical sur les déterminants français** : « évite **les** cacahuètes »,
   « supprime **le** beurre de cacahuète » étaient **rejetés**. Un validateur qui rejette ça se fait
   débrancher dans la semaine.
2. **Une occurrence comptée deux fois** quand un token et sa forme de surface se chevauchent.
3. **Deux branches mortes** dans le garde anti-culpabilisation (`\b` ASCII ne matche pas `ç` ;
   `laiss\s+tomber` ne peut pas matcher « laissé tomber »). Invisibles : une alternative voisine
   matchait dans la même phrase de test.

---

## 6. CHECKLIST DU MATIN (§7.5) — déroulable en < 1 h

- [ ] **0. (5 min) URGENT** — couper les 5 crons en prod (encadré rouge en tête de ce fichier).
- [ ] **1. (2 min)** Passer `EMAIL_DELIVERY_ENABLED=0` dans `supabase/.env`. Il est à **1** : un run
      local qui touche un chemin email envoie de VRAIS emails via Resend. Je ne l'ai pas modifié
      (c'est ton fichier) ; j'ai travaillé avec un override de scratchpad.
- [ ] **2. (10 min)** Relire les 2 migrations, puis `npx supabase db push`.
      → `20260803030000_pivot_disable_b2c_crons.sql`, `20260803031000_pivot_nutrition_tables.sql`
- [ ] **3. (5 min)** `npx supabase functions deploy` — liste exacte des fonctions dont le
      comportement a changé cette nuit : **`analyze-meal-photo-v1`** et **`whatsapp-webhook`**
      (tous deux consomment `meal_analysis.ts` v3 et `whatsapp_graph.ts`).
      ⚠️ Le bump de version de prompt (`meal_analysis.en.v2` → `v3`) est **volontaire** : il rend
      une lecture v2 et une lecture v3 distinguables sur la ligne (`analysis_version`).
- [ ] **4. (10 min) Templates Meta** — **rien n'a changé cette nuit**, donc rien de neuf à soumettre.
      À vérifier quand même (dette connue, mémoire `checkin-v2-meta-body-thomas-suspect`) : le corps
      Meta de `sophia_checkin_v2` contient « Hello Thomas 🙂 » en dur. **Noms ET locales** exacts.
- [ ] **5. (15 min) Smoke test vrai téléphone** — opt-in réel → **photo réelle d'un vrai repas** →
      lire la réponse. **C'est le premier vrai test du contrat v3** : vérifier que l'accusé contient
      les hypothèses OU une question (jamais les deux), et **aucun chiffre**.
- [ ] **6. (10 min)** Vérifier en base que la ligne écrite porte bien `assumptions` et
      `clarifying_question` dans `recognized`, et un `portion_band` en colonne.
- [ ] **7.** Premier vrai coach (§1.4, ~30 min) — ⚠️ **pas encore outillé** : l'écran Doctrine
      n'existe pas. Faisable en pair-pilotage avec insertion SQL directe dans `coach_doctrines`
      (le schéma et le compilateur sont prêts et testés).

---

## 7. CE QUE LA NUIT NE PEUT PAS PROUVER (§7.5, tel quel)

Le sim ne traverse pas Meta — et cette nuit, **le sim n'a même pas tourné**. Restent à faire par
toi, et par personne d'autre : le déploiement des fonctions, la création/vérification des templates
WhatsApp (noms **et** locales), le smoke test réel avec un vrai téléphone photo incluse, les clés
API réelles, et les coûts WhatsApp réels.

Un vert dans ce document est un vert de **test unitaire**. Ce n'est pas une validation Meta, ce
n'est pas une validation produit, et je ne le présente pas comme telle.
