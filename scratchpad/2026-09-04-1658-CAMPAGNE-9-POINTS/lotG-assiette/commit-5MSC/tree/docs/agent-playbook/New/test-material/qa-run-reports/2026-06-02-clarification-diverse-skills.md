# QA Run — Clarification Diverse Skills

## 1. Contexte Du Test

- Date: 2026-06-02
- Run: `clarification-diverse-20260602-r1-reminder` à `clarification-diverse-20260602-r5-weekly`
- Persona: utilisateurs temporaires QA dédiés, créés via Auth local puis nettoyés
- Objectif: diversifier les ambiguïtés de clarification hors `emotional_repair`, en couvrant dispatcher, `product_help`, `execution_breakdown`, `demotivation_repair`, `weekly_adaptive_review_v1`
- Trajectoire: un tour réel par scénario, avec `force_full_ai=true`, via `/functions/v1/test-send-message`
- Surfaces visées: dispatcher arbitration, active conversation skills, `clarification_tool`, `orientation_clarification`, tool blocking, DB temp state
- Cadre IA reel: Supabase local, Edge Function locale, pas de renderer déterministe, pas de fallback direct, pas de staging
- Validite QA: valide. Incident initial: plusieurs init parallèles ont pendu pendant un blocage local Docker/Supabase ; ils n'ont créé aucun artefact. Reprise séquentielle après healthcheck local `auth/v1/health` OK.

## 2. Tours De Conversation

### Tour 1 — Dispatcher Reminder

**Verdict du tour:** green

**User**
> Sophia, j'aimerais que tu me relances demain au réveil, ou peut-être chaque matin, je ne sais pas encore quelle forme choisir.

**Sophia**
> Est-ce que tu préfères que je te relance uniquement demain matin ou bien tous les matins ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- memory_plan: `__clarification_state_v1` présent, owner `dispatcher`, ambiguity_kind `timing`
- executed_tools: `[]`
- durable_effect: aucun `scheduled_checkins`, cleanup ciblé OK

### Tour 2 — Product Help Actif / Carte D'Attaque

**Verdict du tour:** green

**User**
> Je suis dans l'explication des cartes d'attaque, mais là j'hésite : je veux peut-être juste comprendre leur rôle, ou en préparer une pour mon action de demain matin.

**Sophia**
> Est-ce que tu veux comprendre le rôle des cartes d'attaque ou en préparer une pour ton action ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- memory_plan: `__clarification_state_v1` présent, owner `product_help`, candidates `product_help` + `prepare_attack_card`
- executed_tools: `[]`
- durable_effect: aucun `scheduled_checkins`, cleanup ciblé OK

### Tour 3 — Execution Breakdown Actif / Adjust Plan

**Verdict du tour:** green

**User**
> Sur l'action qu'on découpait, je ne sais plus si je veux juste la rendre plus petite maintenant ou plutôt changer sa place dans mon plan.

**Sophia**
> Est-ce que tu veux diviser cette action en plus petites étapes ou la déplacer dans ton plan ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- memory_plan: `__clarification_state_v1` présent, owner `execution_breakdown`, candidates `execution_breakdown` + `adjust_plan_item`
- executed_tools: `[]`
- durable_effect: aucun `scheduled_checkins`, cleanup ciblé OK

### Tour 4 — Demotivation Repair Actif

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-01 — Mauvais owner selectionne

**User**
> Là je ne sais pas si je bloque parce que ça n'a plus trop de sens, parce que je suis vidé, parce que l'action est trop grosse, ou parce que mon plan est mal réglé.

**Sophia**
> C'est souvent un mélange de tout ça. Si tu devais pointer ce qui pèse le plus lourd là, tout de suite, ce serait quoi ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_conversation_skill_continue`
- safety: `low`
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- memory_plan: pas de `__clarification_state_v1`, `__active_skill_state.skill_id=demotivation_repair`
- executed_tools: `[]`
- durable_effect: aucun `scheduled_checkins`, cleanup ciblé OK

**Analyse si yellow/red**
- Symptome: le skill pose une question pertinente, mais sans passer par `clarification_tool` ni stocker `ClarificationState`.
- Source amont probable: active skill clarification policy/candidate builder ne produit pas de candidats discriminants pour les sous-causes de démotivation.
- Owner runtime: `demotivation_repair` + active skill clarification arbitration.
- Meilleure correction selon les guidelines: ajouter une clarification interne structurée pour les familles perte de sens / fatigue / action trop grosse / plan mal calibré, en passant par `runSkillClarification`.
- Pourquoi ce n'est pas un patch local: le défaut est un owner/runtime contract manquant, pas une mauvaise phrase.

### Tour 5 — Weekly Adaptive Review Actif

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-01 — Mauvais owner selectionne

**User**
> Pour le point de la semaine, je ne sais pas si je veux juste un récap clair ou commencer à ajuster mon plan pour la suite.

**Sophia**
> Bonne question 😄 Là, on peut faire simple et utile.
>
> Option A: récap clair. Tu récupères la photo de la semaine, sans te perdre dans “et maintenant ?”
> Option B: ajuster le plan. Tu prends 1-2 décisions concrètes pour la suite (ce qu’on garde, ce qu’on change).
>
> Je te conseille de choisir en fonction de ton énergie du moment: si tu veux te poser et y voir clair, A. Si tu sens que ça coince ou que ça n’accroche pas, B.
>
> A ou B ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_conversation_skill_continue`
- safety: `low`
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- memory_plan: pas de `__clarification_state_v1`, `__active_skill_state.skill_id=weekly_adaptive_review_v1`
- executed_tools: `[]`
- durable_effect: aucun `scheduled_checkins`, cleanup ciblé OK

**Analyse si yellow/red**
- Symptome: le skill répond en mode conseil + options A/B au lieu d'une question de clarification courte produite par `clarification_tool`.
- Source amont probable: weekly active flow continue court-circuite l'adapter de clarification interne.
- Owner runtime: `weekly_adaptive_review_v1` + active skill clarification arbitration.
- Meilleure correction selon les guidelines: construire les candidats `weekly_recap` / `adjust_plan_item` depuis l'état weekly et déléguer à `runSkillClarification`, sans patch de plan ni exécution.
- Pourquoi ce n'est pas un patch local: le problème est le routage/ownership de clarification, pas le wording weekly.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les trois premiers tours donnent une seule question claire, en tutoiement, sans termes internes.
- Le cas carte d'attaque reste ancré sur `ton action`, pas sur `demain`.
- Aucun tour ne promet une création ou une modification durable.

**Problemes**
- Tour 4: la réponse est humainement acceptable mais ne respecte pas le mécanisme de clarification attendu. Famille: BF-ROUTE-01. Impact: trace et reprise d'état moins fiables. Severite: yellow.
- Tour 5: réponse trop longue pour une clarification et introduit une recommandation avant le choix utilisateur. Famille: BF-ROUTE-01. Impact: friction UX et risque de biais vers une option. Severite: yellow.

**Fix propose**
- Source amont: active skill clarification arbitration + adapters des skills `demotivation_repair` et `weekly_adaptive_review_v1`.
- Correction recommandee: ajouter des candidats structurés par skill et faire passer ces ambiguïtés par `runSkillClarification`.
- Tests d'invariant attendus: active demotivation ambiguity -> `orientation_clarification`; active weekly recap vs adjust -> `orientation_clarification`; pas d'executor; `__clarification_state_v1.no_chat_mutation=true`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Dispatcher reminder: conforme, `orientation_clarification`, owner stocké `dispatcher`.
- Product help actif: conforme, `orientation_clarification`, owner stocké `product_help`.
- Execution breakdown actif: conforme, `orientation_clarification`, owner stocké `execution_breakdown`.
- Demotivation actif: non conforme au contrat de clarification interne, `conversation_handler` garde `demotivation_repair`.
- Weekly actif: non conforme au contrat de clarification interne, `conversation_handler` garde `weekly_adaptive_review_v1`.

**Skills / Operations / Tools**
- Aucun tool skill complexe lancé.
- Aucun executor appelé.
- Aucun effet direct à exécuter.
- Les cas verts stockent `ClarificationState` avec `no_chat_mutation=true`.

**Memory / Effets durables**
- `scheduled_checkins` reste vide sur les cinq runs.
- Cleanup ciblé: `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, `auth.users` nettoyés. `user_memories` retourne 404 car table absente dans l'environnement local.

**Problemes**
- Tour 4: absence de `ClarificationState` pour ambiguïté interne demotivation. Famille: BF-ROUTE-01. Impact systeme: pas de reprise standardisée de clarification. Severite: yellow.
- Tour 5: weekly ne délègue pas au `clarification_tool`. Famille: BF-ROUTE-01. Impact systeme: réponse verbose et pas d'état de clarification. Severite: yellow.

**Fix propose**
- Source amont: active skill clarification candidate builder/adapters.
- Correction recommandee: brancher les ressources candidates internes de `demotivation_repair` et `weekly_adaptive_review_v1` dans `maybeStartActiveSkillClarification`, puis déléguer à `runSkillClarification`.
- Tests d'invariant attendus: unitaires candidate builder + runs IA réels pour demotivation et weekly.

## Verdict Global

- Verdict: yellow
- Raison principale: 3/5 scénarios sont verts, mais `demotivation_repair` et `weekly_adaptive_review_v1` clarifient encore dans leur propre runtime au lieu d'utiliser `clarification_tool`.
- Follow-up prioritaire: corriger les candidates/adapters de clarification interne pour demotivation et weekly.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-02-clarification-diverse-skills-bugs.md`
