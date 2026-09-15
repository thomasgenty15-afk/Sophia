# Coaching Recommendation Visible Agents Plan

## Objectif

Remplacer le visible agent unique de `coaching_recommendation` par un routeur de
visible agents specialises par step, tout en conservant le principe suivant :

```txt
dispatcher global -> contexte structure initial
dispatcher local -> diagnostic + decision + step visible
visible agent specialise -> formulation uniquement
```

Le visible agent ne choisit jamais la feature, la cause, la destination ou
l'etape. Ces decisions appartiennent au dispatcher local.

## Contrat De Pipeline

Chaque visible agent recoit deux blocs obligatoires.

### `flow_context`

Contexte commun du flow, construit par le dispatcher local puis normalise par le
reducer.

```ts
{
  dispatcher_signal_context,
  difficulty,
  cause_analysis,
  recommendation,
  evidence_used,
  user_words,
  missing_or_weak_values,
  tone_constraints,
  do_not_say
}
```

### `step_context`

Contexte specifique a l'etape visible courante.

```ts
{
  task_kind,
  objective,
  ...
}
```

Le dispatcher local peut relancer le meme step si les donnees restent
insuffisantes ou si le user conteste l'analyse.

## Visible Agents A Creer

### 1. `difficulty_clarifier_visible_agent`

- Objectif : poser une seule question pour comprendre la difficulte.
- Recoit : dispatcher context, user words, action context, missing fields.
- Sortie : question courte, pas de recommandation.
- Interdit : recommander une feature ou comparer des features.

### 2. `cause_explanation_visible_agent`

- Objectif : reformuler la difficulte et expliquer l'hypothese de cause.
- Recoit : `difficulty` + `cause_analysis`.
- Sortie : formulation du type "La, ce qui semble coincer, c'est plutot X que Y."
- Interdit : changer la cause ou choisir une feature.

### 3. `feature_recommendation_visible_agent`

- Objectif : recommander le levier principal choisi par le dispatcher local.
- Recoit : `cause_analysis`, `recommendation`, `priority_features`.
- Sortie : feature principale, pourquoi, secondaire eventuelle.
- Interdit : changer `selected_feature`; citer `recurring_reminder`,
  `coach_preferences` ou `one_shot_reminder`.

### 4. `platform_guidance_visible_agent`

- Objectif : dire ou trouver le levier et quoi faire dans Sophia.
- Recoit : `recommendation.platform_destination` + `next_step`.
- Sortie : guidance produit courte.
- Interdit : promettre une creation, modification ou programmation.

### 5. `close_or_followup_visible_agent`

- Objectif : repondre a un suivi ou clore.
- Recoit : `last_answer_summary` + recommandation courante.
- Sortie : reponse sobre.
- Interdit : changer de feature.

## Fichiers A Modifier / Creer

### Contrat

- `supabase/functions/sophia-brain/skills/coaching_recommendation/contract.ts`

Ajouter :

- `CoachingDifficulty`
- `CoachingCauseAnalysis`
- `CoachingRecommendationDecision`
- `CoachingRecommendationFlowContext`
- `CoachingVisibleStepContext`
- `flow_context` et `step_context` sur `visible_task`
- `flow_context` et `step_context` sur le resultat reducer

### Dispatcher Local / Reducer

- `supabase/functions/sophia-brain/skills/coaching_recommendation/local_flow.ts`

Ajouter :

- normalisation de `difficulty`
- normalisation de `cause_analysis`
- normalisation de `recommendation_decision`
- construction de `flow_context`
- construction de `step_context`
- conservation dans `local_state`
- prompt dispatcher local explicitant :
  - difficulte -> cause -> recommandation -> destination -> visible step ;
  - priorisation par `dispatcher_signal_context.priority_features` ;
  - relance possible de chaque step.

### Skill Runtime

- `supabase/functions/sophia-brain/skills/coaching_recommendation/skill.ts`

Remplacer l'ancien visible agent par :

```ts
import { runCoachingRecommendationVisibleAgent } from "./visible_agents/router.ts";
```

Passer au visible agent :

```ts
{
  flow_context: reduced.flow_context,
  step_context: reduced.step_context
}
```

### Visible Agents

Creer :

```txt
supabase/functions/sophia-brain/skills/coaching_recommendation/visible_agents/shared.ts
supabase/functions/sophia-brain/skills/coaching_recommendation/visible_agents/difficulty_clarifier.ts
supabase/functions/sophia-brain/skills/coaching_recommendation/visible_agents/cause_explanation.ts
supabase/functions/sophia-brain/skills/coaching_recommendation/visible_agents/feature_recommendation.ts
supabase/functions/sophia-brain/skills/coaching_recommendation/visible_agents/platform_guidance.ts
supabase/functions/sophia-brain/skills/coaching_recommendation/visible_agents/close_or_followup.ts
supabase/functions/sophia-brain/skills/coaching_recommendation/visible_agents/router.ts
```

Supprimer l'ancien :

```txt
supabase/functions/sophia-brain/skills/coaching_recommendation/visible_agent.ts
```

## Regles Globales Des Visible Agents

Tous les visibles doivent appliquer :

```txt
- Francais naturel, tutoiement, message court.
- Ne jamais exposer dispatcher, reducer, JSON, DB, note_information, prompt ou outil interne.
- Ne jamais promettre creation, sauvegarde, activation, programmation, modification ou execution.
- Ne jamais citer recurring_reminder, coach_preferences, one_shot_reminder, track_progress, track_progress_plan_item ou platform.
- Ne jamais changer la feature, la cause, la destination ou l'etape decidee dans step_context.
- Rediger uniquement la reponse visible de l'etape.
```

## Tests A Ajouter

### Reducer

- Verifier que le reducer construit `flow_context` et `step_context`.
- Verifier que `dispatcher_signal_context` reste conserve dans `local_state`.
- Verifier que `step_context.task_kind=recommend_feature` transmet
  `selected_feature`.

### Skill Runtime

- Avec visible agent mock, verifier que `runCoachingRecommendationSkill`
  transmet bien :
  - `flow_context.dispatcher_signal_context`
  - `step_context.task_kind`
  - `step_context.selected_feature`

### Regression Existante

- Garder les tests qui filtrent :
  - `recurring_reminder`
  - `coach_preferences`
  - `one_shot_reminder`
  - `platform`
  - `track_progress`

## Validation

Commandes ciblees :

```sh
deno check supabase/functions/sophia-brain/contracts/turn_frame.v1.ts \
  supabase/functions/sophia-brain/dispatcher/dispatcher.v2.ts \
  supabase/functions/sophia-brain/routers/routers.ts \
  supabase/functions/sophia-brain/router/run.ts \
  supabase/functions/sophia-brain/skills/coaching_recommendation/skill.ts \
  supabase/functions/sophia-brain/skills/coaching_recommendation/local_flow.ts \
  supabase/functions/sophia-brain/skills/coaching_recommendation/visible_agents/router.ts \
  supabase/functions/sophia-brain/skills/feature_opportunity/skill.ts \
  supabase/functions/sophia-brain/skills/feature_opportunity/local_flow.ts \
  supabase/functions/sophia-brain/skills/feature_opportunity/visible_agent.ts
```

```sh
deno test supabase/functions/sophia-brain/dispatcher/dispatcher.test.ts \
  supabase/functions/sophia-brain/router/run_test.ts \
  supabase/functions/sophia-brain/skills/coaching_recommendation/local_flow_test.ts \
  supabase/functions/sophia-brain/skills/feature_opportunity/local_flow_test.ts
```

Critere attendu :

```txt
deno check: pass
deno test: all pass
```
