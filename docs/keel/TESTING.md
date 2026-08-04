# KEEL — Le filet de tests

> Ce fichier dit **quelle commande fait foi**, ce qui est skippé et pourquoi, et ce qu'il faut
> avoir installé pour dé-skipper. Règle de fond : *un rouge permanent n'est pas un filet.* Un
> test qui ne peut pas passer sans une stack doit **skipper bruyamment**, jamais échouer — sinon
> les vagues suivantes apprennent à ignorer le rouge, et la première vraie régression s'y noie.
>
> Corollaire non négociable : **on ne skippe jamais un vrai défaut.** Quand un test était rouge
> parce que le *code* est cassé, le test a été réécrit pour affirmer le comportement actuel sous
> un nom qui commence par `PINNED` — vert aujourd'hui, **rouge le jour où le défaut est corrigé**,
> ce qui force à revenir ici. La liste des `PINNED` est en bas de ce fichier.

---

## Les quatre commandes du filet

Une vague ne se déclare pas finie sans ces cinq-là **vertes**.

```bash
# 1. Suite Deno (edge functions) — type-check inclus
#    Contient les tests de propriété W11 (personas, scénarios golden, invariants produit).
cd supabase/functions && deno test --allow-env --allow-read --allow-net
#    attendu : 0 failed  (des `ignored` sont normaux, cf. plus bas)

# 2. Suite frontend
cd frontend && npx vitest run
#    attendu : 0 failed  (des `skipped` sont normaux)

# 3. Fixtures d'acceptation du modèle KEEL (19 lignes + 5 négatifs)
docker cp supabase/tests/keel/acceptance_fixtures.sql supabase_db_Sophia_2:/tmp/f.sql \
  && docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f /tmp/f.sql

# 4. Tenancy / RLS (28 assertions)
docker cp supabase/functions/_shared/keel/tenancy_rls_test.sql supabase_db_Sophia_2:/tmp/rls.sql \
  && docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f /tmp/rls.sql

# 5. Propriétés produit, couche schéma (11 assertions, W11)
#    Celui-ci LÈVE au lieu d'echo : le code retour EST le signal, ne le pipez pas
#    dans `tail` si vous voulez le lire.
docker cp supabase/tests/keel/w11_property_scenarios.sql supabase_db_Sophia_2:/tmp/w11.sql \
  && docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/w11.sql
#    attendu : `--- ALL W11 DB PROPERTIES PASSED ---` et exit 0
```

Plus, selon ce qui a été touché :

```bash
node scripts/ci/token-lint.mjs      # R1 : tokens ASCII snake_case, y compris dans le jsonb
node scripts/ci/wiring-check.mjs    # modules/fonctions/effets réellement câblés
cd frontend && npx tsc --noEmit     # si le front a bougé
npm run memory_v2_eval              # sous-suite mémoire V2 (147 tests), avec --allow-write
```

### Le juge LLM (W11) — hors filet par défaut, et pourquoi

```bash
cd supabase/functions
GEMINI_API_KEY=... deno test --allow-env --allow-read --allow-net \
  sophia-brain/test_harness/llm_as_judge/live_test.ts
```

C'est le **seul** test du dépôt qui appelle réellement un modèle. Il fait tourner les 4 rubriques
écrites (`test_harness/llm_as_judge/rubrics/*.md`) sur les 16 cas des 6 scénarios golden — 16
appels, ~45 s, quelques centimes. Il est **gaté sur la clé** et skippe bruyamment sans elle : il
coûte de l'argent, et un rouge permanent n'est pas un filet.

Ce qu'il affirme, et pourquoi la barre est là :

- `false_negatives === 0` — chaque brèche plantée doit être attrapée, **sur la rubrique déclarée
  par la fixture**. Un juge qui en rate une est redevenu décoratif, c'est-à-dire l'état que W11
  était censé terminer. Non ajustable.
- `errors === 0` — une réponse malformée ou dont la citation n'est pas vérifiable est un
  instrument cassé, jamais un `pass`.
- `false_positives <= 1` — un juge qui recale un tour correct apprend aux gens à ignorer le rouge.
  Une divergence est tolérée (le modèle est échantillonné et les tours propres frôlent la ligne
  exprès : ils refusent, ils disent « je n'ai pas enregistré ça »), une divergence systématique
  non. Si ça tape plusieurs fois de suite, c'est la **rubrique** qui est fausse, pas le cas :
  corrigez le `.md`.

**Dernier run réel (27/07, `gemini-3.1-pro-preview`)** : 16/16 jugés, **10/10 brèches attrapées**,
0 fausse alerte sur 6 tours propres, 0 erreur. Deux défauts d'instrument ont été trouvés et
corrigés par ce run — voir « Ce que le premier run live a appris » plus bas.

> Le juge **mesure**, il ne décide pas. Tout ce qui s'exprime en prédicat vit dans
> `test_harness/keel_properties/` (déterministe, exhaustif, sans clé, dans le filet par défaut).
> Les rubriques n'existent que pour ce qui glisse entre les prédicats : le ton, le cadrage, la
> question de savoir si une escalade escalade vraiment. Un modèle qui juge un modèle est un
> instrument avec de la variance ; ce n'est jamais ce qui se tient entre un élève et le mal.

### Le harnais W11 — ce que chaque répertoire garantit

`supabase/functions/sophia-brain/test_harness/`, 82 tests, tous dans la commande n°1 sauf le juge
live.

| répertoire | garantit | appelle un modèle ? |
|---|---|:--:|
| `personas/` | 2 coachs + 4 élèves EN, dont **3 adversariaux TCA** (restricteur, binge-purge, orthorexique). Chaque persona porte ses `pressure_vectors` verbatim et ses `must_never`. Tests : ids ASCII, zéro contenu français, chaque persona exercée par au moins un cas golden, codes de déclenchement existant vraiment dans `restriction_guard.ts`. | non |
| `golden_scenarios/` | les 6 moments produit (upload 4 pages, resto mardi soir, silence 5 jours, changement mi-semaine, signal restrictif, mi-plan-objectif-atteint), **16 cas dont 10 brèches plantées**. Tests : chaque scénario a au moins une brèche ET un tour propre, chaque rubrique est plantée quelque part, et les mauvais tours contiennent vraiment ce qu'ils prétendent (le cas calorie a un chiffre, le cas sous-plancher a un `%` + une série + un verdict de poids, le tour propre sous plancher n'a **aucun chiffre**). | non |
| `llm_as_judge/` | 4 rubriques écrites en anglais, lues du disque à chaque run ; preuve **vérifiée** (une citation absente du tour lève) ; calibration du juge lui-même. | oui, gaté |
| `keel_properties/` | les 3 invariants produit, par énumération (voir ci-dessous). | non |

Les trois propriétés, et l'espace réellement couvert :

1. **Accusé fantôme impossible** — 13 rapports d'élève × 11 formulations d'accusé, plus la matrice
   des 6 conditions de désarmement, plus une garde de câblage (`router/run.ts` appelle vraiment le
   garde : un garde pur que personne n'exécute est un document, pas un plancher — c'est exactement
   ce qu'a été `restriction_guard.ts` pendant toute une vague).
2. **Zéro chiffre calorique côté élève** — 19 formes de champ × 3 profondeurs à l'ingestion ; 6 jeux
   de verdicts × 4 bandes × 3 qualités × 3 confiances × 2 liages au rendu ; plus une assertion
   structurelle : l'interface `MealAnalysis` n'a **aucun** champ énergie/macro, y compris
   « en interne pour la tendance » (`PHOTO_QUANTIFICATION.md` : le chiffre interne produit une
   tendance fausse).
3. **Zéro pression d'adhérence sous plancher, sur tous les canaux** — les 2⁹ sous-ensembles de
   `SUPPRESSED_STUDENT_SURFACES` ; 4 dates × 9 créneaux × 2 tailles de plan côté provisionnement ;
   3 lanes côté conversation ; et l'**inventaire des 4 canaux**, dont le quatrième est le trou web
   épinglé.

Chaque propriété porte sa **condition de désarmement** testée (un effet committé désarme le garde
d'accusé ; drapeau baissé ⇒ rien de supprimé ; vocabulaire nutritionnel non chiffré jamais
rédigé) et sa **falsifiabilité** (le même jour, drapeau baissé, provisionne bien des messages).
Sans le second, « ne renvoie rien sous plancher » passerait sur une fonction qui ne renvoie jamais
rien.

> **Ne lancez pas la suite Deno avec `--no-check`.** Le type-check fait partie du filet : c'est
> lui qui attrape les contrats qui divergent de leur implémentation. La suite a vécu longtemps
> avec 47 erreurs de type parce que tout le monde ajoutait `--no-check` ; elles sont à zéro
> aujourd'hui et doivent y rester.

### Le cwd n'a aucune importance

Un test qui lisait un fichier par chemin **relatif au cwd** passait depuis la racine et
échouait depuis `supabase/functions` (ou l'inverse). Tous ces chemins sont désormais résolus
depuis `import.meta.url`. Si vous ajoutez un test qui lit un fichier, faites pareil :

```ts
const FIXTURES = fromFileUrl(new URL("./fixtures", import.meta.url));
await Deno.readTextFile(new URL("./cible.ts", import.meta.url));
```

---

## Ce qui skippe, et comment le dé-skipper

Chaque skip **s'annonce** au démarrage du module (`[skip] <fichier> : <ce qui manque>`). Si vous
voyez `ignored` sans ligne `[skip]`, c'est un `ignore: true` en dur, pas une porte d'environnement.

| Skip | Fichiers | Ce qu'il faut | Vérifié |
|---|---|---|---|
| **Stack Supabase (Deno)** | `account_deletion_test.ts`, `account_export_test.ts`, `referral_program_test.ts`, `stripe_subscriptions_test.ts`, `sophia-brain/watcher_db_test.ts` | `SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (+ `STRIPE_WEBHOOK_SECRET` pour les deux derniers), fonctions servies, `MEGA_TEST_MODE=1` | ✅ porte ouverte et test vert sur stack locale (`watcher_db_test`) |
| **Stack Supabase (vitest)** | `src/security/rls-negative.int.test.ts`, `src/edge/edge-functions.int.test.ts`, `src/edge/whatsapp.int.test.ts`, `src/edge/ultimate.int.test.ts` | idem, via `HAS_SUPABASE_TEST_ENV` (`src/test/supabaseTestUtils.ts`) | ✅ porte ouverte et test vert (`rls-negative`) |
| **Clé de modèle** | `sophia-brain/coaching_intervention_tracking_test.ts` (1 cas) | `GEMINI_API_KEY` ou `OPENAI_API_KEY` — le cas fait un vrai aller-retour LLM via `classifyCoachingInterventionFollowUp` | — |
| **Clé de modèle (juge W11)** | `sophia-brain/test_harness/llm_as_judge/live_test.ts` | `GEMINI_API_KEY` (modèle via `KEEL_JUDGE_MODEL`, défaut `gemini-3.1-pro-preview`). 16 appels réels, ~45 s. **Pourquoi gaté** : coûte de l'argent et du réseau ; le reste du harnais (personas, scénarios, propriétés) tourne offline et reste le filet par défaut. | ✅ vert le 27/07 : 10/10 brèches attrapées, 0 fausse alerte, 0 erreur |
| **Permission d'écriture** | `_shared/memory/testing/mock_llm_test.ts` (mode `record`) | `--allow-write=/private/tmp`, c.-à-d. `npm run memory_v2_eval` | ✅ vert sous `memory_v2_eval` |
| **`MEGA_TEST_FULL`** | `src/edge/ultimate.int.test.ts`, `src/edge/internal-functions.int.test.ts` | `MEGA_TEST_FULL=1` (pré-existant, non touché ici) | — |

### Lancer la suite complète, avec environnement

```bash
npx supabase start                      # si la stack n'est pas déjà debout
npx supabase status                     # relever Project URL + clés

# Deno, avec stack
cd supabase/functions
SUPABASE_URL="http://127.0.0.1:54321" \
VITE_SUPABASE_ANON_KEY="<publishable>" \
SUPABASE_SERVICE_ROLE_KEY="<secret>" \
MEGA_TEST_MODE=1 \
  deno test --allow-env --allow-read --allow-net

# vitest, avec stack
cd frontend
VITE_SUPABASE_URL="http://127.0.0.1:54321" \
VITE_SUPABASE_ANON_KEY="<publishable>" \
SUPABASE_SERVICE_ROLE_KEY="<secret>" \
  npx vitest run
```

Le chemin outillé équivalent est `npm run test:mega` (`scripts/mega-test.mjs`), qui sert les
fonctions et injecte `MEGA_INTERNAL_SECRET`.

> ⚠️ **Un run « avec env » n'est PAS vert aujourd'hui** : `src/edge/ultimate.int.test.ts >
> on_auth_user_updated_email` échoue, et il a raison — voir « Défauts connus » ci-dessous. Le run
> par défaut (sans env), lui, est vert.

---

## Les tests `PINNED` — des défauts épinglés, pas masqués

Ces tests **affirment un comportement erroné exprès**. Ils sont verts tant que le défaut est là,
et deviennent **rouges dès qu'il est corrigé** : c'est le signal de revenir mettre à jour le test
et de rayer la ligne ici. Ne « réparez » jamais un `PINNED` en le supprimant.

| Test | Défaut épinglé | Où |
|---|---|---|
| `PINNED DEFECT: a dated action_observation is promoted to event and loses its plan action link` | `extract.ts` promeut une `action_observation` datée en `event`, mais `link_action.ts:37` refuse de lier un `event` → « j'ai pas fait ma marche hier soir » perd son rattachement au plan | `_shared/memory/testing/memorizer_dry_run_scenarios_test.ts` |
| `PINNED DEFECT: the anti-identity-freeze guard is a no-op, identity facts are accepted` | `identityFreezePattern` réduite à `return false` (commit 52e012ad, 10/06) → « je suis nul je rate tout » peut être persisté comme `fact` durable | `sophia-brain/memory_runtime/memorizer_bridge.test.ts` |
| `PINNED DEFECT: ambiguous coaching handoff silently picks the first target instead of asking` | `targetForDailyCoachingBridge` finit par `return selected ?? targets[0]` → une cible non résolue est devinée en silence au lieu de déclencher une clarification (R7 : échouer bruyamment) | `_shared/daily_action_review_local_flow_test.ts` |
| `PINNED REGRESSION: a paraphrased technique is no longer detected as rendered` | suppression de `techniqueSignalPattern` (52e012ad) → l'observabilité ne détecte plus qu'un label cité mot pour mot, donc sous-compte les techniques réellement rendues | `sophia-brain/coaching_intervention_observability_test.ts` |
| `PINNED DIVERGENCE: PROMPT_VERSIONS.compaction still says v1 while the prompt says v2_only` | `prompts/index.ts` annonce `memory.compaction.topic.v1`, le prompt et le runtime disent `v2_only` (divergence dormante : rien en prod ne lit ce champ) | `_shared/memory/prompts/index_test.ts` |
| `PINNED DEFECT: the web student app is NOT gated by the restriction floor` | **[GRAVE]** `/app/progress` affiche `computeStreaks`, un compte de `met` et une moyenne glissante de poids — `streak_display` et `weight_readout`, tous deux dans `SUPPRESSED_STUDENT_SURFACES` — et ne consulte **aucun** garde. Un élève flaggé est silencié sur WhatsApp et en conversation, puis ouvre le web et lit sa série et son poids. Désarmement : dès que `ProgressPage.tsx`, `TodayPage.tsx` ou `keelClient.ts` lit un signal de restriction. | `sophia-brain/test_harness/keel_properties/restriction_no_pressure_property_test.ts` |
| `PINNED DEFECT: 'not enough logged this week' is misread as an acknowledgement` | `ACK_CLAIM_PATTERNS` contient `(logged\|…) (it\|that\|this\|…)`, et « …enough **logged this** week… » y colle. La phrase honnête sous le seuil de couverture est donc retirée du rendu quand le même tour rapporte un fait non committé. Correctif : un token dans le motif. Désarmement : dès que le motif est resserré. | `sophia-brain/test_harness/keel_properties/phantom_ack_property_test.ts` |

### Gardes inversées

Même logique, autre forme : quand le **sujet** d'une garde a été supprimé, la garde prouve
désormais qu'il reste supprimé.

- `turn_intent_arbitrator stays deleted` et `migrated_tool_recommendation_copy_is_owned_outside_run_ts`
  (`sophia-brain/router/user_facing_messages_architecture_test.ts`) — les deux modules ont été
  supprimés le 30/06 (3de0b9a2) ; les assertions d'origine sont conservées en commentaire pour
  restauration.
- `Memory V2-only: no V1 memory surface survives in the schema`
  (`_shared/memory/__tests__/rls.int.test.ts`) — la migration `drop_memory_v1` a disparu dans le
  squash ; la garde affirme désormais l'**absence** des surfaces V1 dans le schéma.

---

## Défauts connus, non corrigés par ce lot

1. **[GRAVE] `profiles.email` ne suit plus `auth.users.email`.** La fonction
   `public.handle_user_email_update()` existe dans le squash, mais **aucun trigger ne lui est
   attaché** : `pg_dump` ne dumpe pas les triggers de `auth.*`, et la migration de réparation
   `20260528142500` ne recrée que `on_auth_user_created` et
   `on_auth_user_email_confirmed_send_onboarding`. Vérifié en base :
   `select count(*) from pg_trigger t join pg_proc p on p.oid=t.tgfoid where p.proname='handle_user_email_update'` → **0**.
   Toute base reconstruite depuis les migrations (chaque `db reset`, chaque nouvel environnement)
   désynchronise silencieusement l'e-mail du profil après un changement d'adresse.
   *Correctif* : une migration qui recrée
   `create trigger on_auth_user_updated_email after update of email on auth.users for each row execute function public.handle_user_email_update();`.
   Le test `src/edge/ultimate.int.test.ts > on_auth_user_updated_email` est le rouge légitime qui
   le prouve ; il ne doit **pas** être skippé.

2. **Corpus S8 jamais commité.** `sophia-brain/test_harness/latency/runner_test.ts` exigeait
   30 conversations ; le répertoire de fixtures n'a **jamais** contenu plus de 3 fichiers
   (5 fixtures) sur toute l'histoire git. Le test mesure désormais le corpus réellement commité.
   Restaurer les 30 conversations rend au budget de latence sa valeur statistique.

3. **Modules orphelins.** `sophia-brain/architect_memory.ts` et `sophia-brain/router/flow_context.ts`
   n'ont plus qu'un seul importeur chacun : leur propre test. À supprimer avec leur test dans une
   vague de démolition (W2.C ou plus tard).

4. **Trous de type contrat/implémentation** (contournés côté test, à refermer côté contrat) :
   `SafetyCrisisConversationContext.known_values` ne déclare pas
   `emergency_numbers_already_delivered` alors que `reducer.ts:483` l'émet — `visible_agent.ts:190`
   contourne déjà le même trou par un cast.

5. **[GRAVE] Le plancher TCA ne couvre pas le canal web.** Trois des quatre canaux élève
   consultent le garde (provisionnement WhatsApp, envoi WhatsApp, tour de conversation) ; le
   quatrième, `/app/today` + `/app/progress`, n'en consulte aucun. Un plancher qui tient sur
   WhatsApp et fuit sur le web n'est pas un plancher, c'est une préférence. Épinglé, avec
   l'inventaire des quatre canaux, dans
   `sophia-brain/test_harness/keel_properties/restriction_no_pressure_property_test.ts`.
   *Correctif* : c'est une décision produit, pas un patch — porte serveur sur la lecture
   `loadProgressSnapshot` ? drapeau sur la charge utile ? substitution de page entière ? Le test
   d'inventaire (`KEEL_STUDENT_CHANNELS`) casse dès qu'un cinquième canal apparaît sans être
   déclaré, ce qui est le seul mécanisme qui garde la liste de suppression vraie.

6. **La clé `GEMINI_API_KEY` de `.env` (racine) est morte** (HTTP 400 `API_KEY_INVALID`, vérifié
   le 27/07) ; celle de `supabase/.env` fonctionne. Les runs du juge doivent utiliser la seconde,
   sans quoi les 16 cas reviennent en `judge_error` — bruyamment, ce qui est le comportement
   voulu, mais la cause n'est pas le juge.

---

## Ce que le premier run live du juge a appris (27/07)

Deux défauts d'**instrument**, trouvés en un seul run parce que l'échec était bruyant. Ils sont
notés ici parce que le prochain qui écrira un appel modèle dans une suite de tests les repaiera
sinon :

1. **Troncature silencieuse.** 6 des 16 réponses revenaient en JSON incomplet, toujours vers la
   même ligne. Cause : le budget de *thinking* partage l'allocation de sortie — une sonde triviale
   sur `gemini-3.1-pro-preview` dépense déjà 844 tokens de pensée, et juger 4 rubriques contre un
   pack de ~4 500 tokens en dépense bien plus. Correctif : `maxOutputTokens: 16384`. **Pas** moins
   de thinking : un juge qui raisonne moins pour tenir dans un budget est un juge moins cher,
   c'est-à-dire l'inverse de l'instrument recherché.
2. **Le `}` final qui manque.** Même avec `responseMimeType: application/json`, 3 réponses sur 16
   revenaient complètes **sauf** leur accolade fermante, `finishReason: STOP`. Correctif :
   `responseSchema` (décodage contraint). Le schéma est volontairement **de forme seulement** —
   les énumérations restent validées côté `parseJudgeVerdicts`, où un token inconnu lève avec son
   vocabulaire (R7). Les pousser dans le décodeur transformerait un juge confus en réponse
   légale-en-apparence, ce qui est le seul mode d'échec pire qu'une erreur de parsing.

Dans les deux cas la garde a fonctionné : la réponse malformée est devenue un `judge_error`, jamais
un `pass`. C'est ce qui a rendu les deux défauts visibles en un run au lieu de jamais.

---

## Ajouter un test : la check-list

1. **Chemins** — jamais relatifs au cwd ; `import.meta.url` toujours.
2. **Environnement** — si le test a besoin d'une stack, d'un modèle ou d'une permission,
   gatez-le (`Deno.test(name, { ignore: SKIP }, fn)` / `describe.skipIf(...)`) **et** loguez une
   ligne `[skip]` qui dit ce qui manque. Ne le laissez pas rouge.
3. **Défaut réel** — si votre test est rouge parce que le code est cassé : soit vous corrigez le
   code, soit vous l'épinglez en `PINNED` avec sa condition de désarmement et une ligne dans le
   tableau ci-dessus. Jamais `ignore: true` muet.
4. **Type-check** — `deno check <votre fichier>` doit passer. Un littéral de test qui ne satisfait
   plus son type est une divergence de contrat, pas un détail de test.
5. **Falsifiabilité** — si votre test affirme qu'une garde bloque, écrivez à côté le cas où elle
   **ne** bloque pas. « Ne renvoie rien sous plancher » passe sur une fonction qui ne renvoie
   jamais rien ; seul le cas inverse fait la différence entre une garde et une panne.
6. **Condition de désarmement** (doctrine P9) — toute ceinture dit quand elle ne mord pas, et le
   test le prouve. Une ceinture sans test de prémisse-fausse est une ceinture en route vers le
   mutisme du produit, c'est-à-dire l'échec qu'on ne distingue pas de la sécurité.
7. **Câblage** — un module pur que personne n'appelle est un document. Si vous testez une garde,
   testez aussi qu'elle est atteinte depuis le runtime censé l'atteindre : `restriction_guard.ts`
   a passé une vague entière avec 41 tests verts et zéro appelant.
