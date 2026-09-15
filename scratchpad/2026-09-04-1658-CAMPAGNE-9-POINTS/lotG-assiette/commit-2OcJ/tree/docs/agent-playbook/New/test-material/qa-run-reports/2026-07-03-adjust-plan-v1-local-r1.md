# QA Run — Validation directe de `adjust-plan-v1` (local, r2 — remplace r1)

> Note de version : le r1 initial avait enrobé ce test dans un run conversationnel.
> C'était une erreur de cadrage : `adjust-plan-v1` est une edge function de
> dashboard appelée avec un payload structuré (clic « Voir le plan ajusté »),
> jamais atteinte par le chemin conversationnel. Ce r2 est la validation
> correcte : invocation HTTP directe reproduisant exactement les payloads du
> front, assertions DB, reset. Les observations de routage conversationnel du
> r1 (dispatcher/flow actif) sont hors scope de ce chantier et notées en fin de
> rapport pour mémoire.

## 1. Contexte Du Test

- Date: 2026-07-03
- Run: runner d'invocation directe `adjust_runner.py` — passes `qadr-level-84fd98` (bloquée env), `qadr-level-*` finale et `qadr-plan-*` finale
- Persona: Nina (`nina@gmail.com`, user `e5630c78`), choisie car numérotation de plans propre (max version=1, aucun stub résiduel) ; login password local, token vérifié, jamais affiché
- Plan de base: `c3e1fad8` v1 actif — « Sortir du grignotage émotionnel », niveau 2 « Intégrer des jours complets sans consommation », 3 semaines, blueprint niveaux 3-4
- Objectif: valider `adjust-plan-v1` (commit `0917d659`) en scope `level` (preview + confirm + effets durables) et scope `plan` (preview), invariants compris
- Trajectoire: exactement le flux du dashboard — `review-plan-v1` (classification) → `adjust-plan-v1 mode=preview` → vérifs DB → (`mode=confirm` → vérifs DB) → reset
- Surfaces visées: edge functions `review-plan-v1` / `adjust-plan-v1`, invariants d'ajustement, `user_plans_v2`, `user_plan_items`, `user_habit_week_plans`, `user_plan_review_requests`
- Cadre IA réel: Supabase local ; IA réelle (`review-plan-v1` LLM réel ; `adjust-plan-v1` sur `gemini-3.1-pro-preview`) ; payloads identiques à `DashboardV2.tsx` (auth supabase-js : JWT user dans `Authorization`) ; aucun renderer déterministe, aucun mock, assertions sur l'état DB réel ; état snapshoté avant, restauré et vérifié après chaque passe
- Note de cadre: `force_full_ai=true` est propre à `test-send-message` (chemin conversationnel) et sans objet ici — les fonctions dashboard appellent toujours l'IA réelle
- Validité QA: **valide** (2 incidents d'environnement documentés, aucun code modifié pendant les runs)

## 2. Passes De Test

### Passe A — scope `level`, preview + confirm

**Verdict de la passe:** green (18/18 checks)

**Entrée (dashboard, champ « Ajuster le plan »)**
> Cette semaine je suis en plein rush au boulot et je n'ai pas réussi à tenir mes jours sans grignotage. Le niveau en cours ne colle plus à ma réalité. Je veux juste recaler CE niveau sur où j'en suis, sans toucher au reste du plan.

**Étape 1 — `review-plan-v1`** (4.6 s)
- `conversation_mode=level_adjustment`, `adjustment_scope=current_level_only`, `decision=minor_adjustment` — classification exacte ✓
- « Ce qui change » rendu : « Tu ne demandes pas un changement de cap, mais un recalage du niveau en cours à ta réalité de la semaine. On garde l'objectif général et les étapes suivantes… »

**Étape 2 — `adjust-plan-v1 mode=preview` scope=level** (37.4 s, 1 tentative LLM)
- HTTP 200, draft `31fb7f28` persisté
- Niveau ajusté proposé : « Sécuriser les jours off malgré le rush », 3 semaines

**Checks invariants sur le draft persisté (tous ✓)**

| Invariant | Résultat |
|---|---|
| `global_objective` strictement identique au plan de base | ✓ |
| `plan_blueprint` figé **octet pour octet** | ✓ |
| Phase passée (phase-1) figée **octet pour octet** | ✓ |
| `duration_weeks` ≤ 4 | ✓ (3) |
| Niveau contient habitude + mission + clarification | ✓ |
| Items ≤ 2 × semaines | ✓ (4/6) |
| `metadata.plan_adjustment_revision.scope = level`, `previous_plan_id` = plan de base | ✓ |
| `metadata.last_level_adjustment` présent | ✓ |

**Étape 3 — `adjust-plan-v1 mode=confirm`** (0.3 s — activation du draft, pas de régénération)
- HTTP 200 ; draft → `active` ✓ ; ancien plan → `archived` ✓ ; **9 items distribués** ✓ ; **6 `user_habit_week_plans` matérialisés** ✓

**Étape 4 — reset** : draft supprimé, plan de base réactivé (timestamps restaurés), review supprimée ; vérification finale « seul le plan de base subsiste actif » ✓

### Passe B — scope `plan`, preview

**Verdict de la passe:** green (10/10 checks)

**Entrée (dashboard)**
> Je viens de changer de poste avec des déplacements toutes les semaines, je ne mange quasiment plus chez moi. Ce n'est pas juste le niveau actuel : toute la suite du plan repose sur des repas à la maison que je n'ai plus. Il faut repenser la progression entière.

**Étape 1 — `review-plan-v1`** (4.8 s)
- `conversation_mode=plan_adjustment`, `adjustment_scope=full_plan`, `decision=full_replan` — classification exacte ✓

**Étape 2 — `adjust-plan-v1 mode=preview` scope=plan** (86.4 s, 1 tentative LLM, pas de retry sur cette passe)
- HTTP 200, draft `4240b583` ; plan recomposé autour des déplacements (niveau courant « Créer un repère en déplacement », 3 semaines)

**Checks invariants (tous ✓)** : `global_objective` immuable (réécrit en code) ; niveau courant ≤ 4 semaines ; habitude+mission+clarification ; items ≤ 2×semaines ; `plan_adjustment_revision.scope=plan` + `previous_plan_id` ; `plan_blueprint.global_objective` = base.

**Étape 3 — reset** : draft + review supprimés ; état de base vérifié ✓

### Incidents d'environnement (documentés, hors produit)

1. **Edge runtime instable** : un `supabase functions serve --env-file` (lancé par une session parallèle) watch `supabase/functions/` et **recrée le conteneur edge à chaque modification de fichier** ; pendant que des sessions éditaient du code, le conteneur cyclait kill→create toutes les ~3-12 s → deux passes tuées en vol (502 « invalid response from upstream » à 6.8-9.7 s, aucun event LLM émis, aucune erreur applicative). Conformément aux guidelines, aucun restart effectué par l'agent QA ; les passes ont été rejouées une fois le watcher au repos. À retenir : ne pas éditer `supabase/functions/**` pendant un run si `functions serve` tourne en watch.
2. **Résidu de données (1re campagne, persona Rose)** : un stub `user_plans_v2` injecté à la main le 2026-06-12 (`version=101`, `generation_attempts=0`, contenu vide, archivé) a fait échouer la persistance des drafts de Rose — voir bug BF-EFFECT-04 en feuille de suivi. C'est ce qui a motivé le passage à Nina (numérotation propre). Le stub a été laissé en l'état (restauré à l'identique).

## 3. Analyse De Fluidite Humaine

**Verdict: green**

(Portée limitée ici : la surface testée est le flux dashboard, pas une conversation.)

- Les textes « Ce qui change » de `review-plan-v1` sont précis et différencient très bien les deux intentions : « on garde l'objectif général et les étapes suivantes » (level) vs « la base du plan change, on recompose » (plan). C'est exactement le contrat UX voulu.
- Les niveaux ajustés proposés sont crédibles et respectent l'esprit « ambition préservée » : recalage sur la réalité sans réduire la cible du niveau.
- Latences perçues : 37 s (level) est confortable avec le loader bouton ; 86 s (plan) reste long mais couvert par le loader + le filet anti-timeout du front. Pas de friction bloquante.

## 4. Analyse Systeme

**Verdict: green**

**Routage (fonctions)**
- `review-plan-v1` classifie correctement les deux scopes à partir du même plan et de deux commentaires réalistes différents (level → `current_level_only`, plan → `full_plan`).
- `adjust-plan-v1` branche correctement : scope `level` → génération mono-niveau (source LLM `adjust-plan-v1.level`, 1 tentative, 37 s) ; scope `plan` → régénération complète dans le cadre ajustement (86 s).

**Skills / Operations / Tools**
- Invariants scope level prouvés au niveau le plus fort possible (comparaison octet-pour-octet du blueprint et du passé) : le gel est fait **par construction en code**, pas par bonne volonté du prompt.
- Invariant transverse `global_objective` prouvé sur les deux scopes.
- Confirm : chaîne d'activation complète correcte (statuts, distribution, matérialisation des semaines), en 0.3 s.

**Memory / Effets durables**
- Effet durable strictement conforme à l'intention dans les deux passes ; aucun effet parasite ; reset vérifié table par table après chaque passe (plans, items, week plans, review requests, timestamps transformation).

**Problèmes**
- Aucun sur la surface testée. Deux points restent ouverts en feuille de suivi (préexistants/latents, pas des régressions de ce chantier) : le couplage `version`/`generation_attempts` face au CHECK ≤ 50 (BF-EFFECT-04, découvert sur Rose) et la consigne temp_id lors d'une renumérotation de phases en scope plan (retry observé sur une passe de la 1re campagne, pas reproduit ici).

## Verdict Global

- Verdict: **green**
- Raison principale: `adjust-plan-v1` validée bout en bout par invocation directe sur persona propre — 28/28 checks verts sur les deux scopes, invariants prouvés octet-pour-octet, effets durables exacts, latence scope level conforme à l'objectif (~37 s vs ~86 s plan complet).
- Follow-up prioritaire: trancher le fix `version`/`generation_attempts` (feuille de suivi) avant d'accumuler des régénérations en réel ; nettoyer le stub v101 de Rose en local.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-03-adjust-plan-v1-local-r1-bugs.md`

## Annexe — Observations hors scope (issues du r1 conversationnel, pour mémoire)

Le r1 avait fait précéder le test d'une conversation avec Rose. Deux observations de routage conversationnel en sont sorties ; elles concernent le dispatcher/les flows actifs, pas ce chantier :
- un message de dérive de niveau classé `coaching_recommendation` sans signal `plan_realignment` (BF-ROUTE-01) ;
- le flow coaching actif conservant la main sur un pivot explicite vers le réalignement (BF-ROUTE-02), avec toutefois une orientation produit finale correcte (dashboard → « Ajuster le plan »).

Elles restent tracées dans la bug sheet comme hors-scope-chantier.
