# QA Run Report - Coaching Recommendation Simplified Signal R1

## 1. Contexte Du Test

- Date: 2026-06-19
- Run: `coachingrec-simplified-signal-20260619-r1`
- Persona: user QA temporaire `qa-normal-coachingrec-simplified-signal-20260619-r1-1781872673885@example.com`
- Objectif: verifier le nouveau contrat global simplifie pour `coaching_recommendation` et l'ownership du flow local.
- Trajectoire: action du plan -> recommandation coaching -> suivi produit lie a la carte -> bascule emotionnelle.
- Surfaces visees: dispatcher global, `coaching_recommendation`, active flow state, visible agent action-plan/emotion.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback deterministe.
- Validite QA: valide. Cleanup cible execute.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-05 - Semantique composite aplatie

**User**
> Je bloque sur l'action Préparer le dossier mutuelle dans mon plan. Dès que j'ouvre les justificatifs je repousse, et je ne sais pas si je dois préparer une carte d'attaque ou modifier l'action.

**Sophia**
> Je te conseille l’ajustement du plan : ton blocage ressemble surtout à une action trop lourde ou mal cadrée, pas juste à un manque d’élan. On peut la recadrer pour qu’elle soit plus simple à lancer dans le Plan.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: coaching_recommendation_signal
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: n/a
- executed_tools: []
- durable_effect: none

**Signal global observe**
- `coaching_type`: `plan_action`
- `confidence`: `0.86`
- `activation_checks.is_coaching_need`: `true`
- `activation_checks.has_concrete_plan_action`: `true`
- `action_context.source`: `plan`
- `priority_features`: absent du TurnFrame
- `failure_mode`: absent du TurnFrame

**Analyse si yellow/red**
- Symptome: le global signal est maintenant propre, mais le local flow recommande encore `adjust_plan` trop vite pour un blocage de demarrage/evitement.
- Source amont probable: local dispatcher/reducer coaching derive `adjust_plan` depuis "justificatifs/repousse" sans preuve explicite d'action mal calibree.
- Owner runtime: `coaching_recommendation` local flow.
- Meilleure correction selon les guidelines: le local flow doit distinguer blocage de demarrage versus action structurellement infaisable; `adjust_plan` seulement sur signaux explicites de taille/cadrage/rythme.
- Pourquoi ce n'est pas un patch local: le global ne pollue plus; l'erreur est dans la decision locale de feature.

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Ok, si je veux préparer une carte d'attaque plutôt que modifier l'action, je vais où exactement ? Ne crée rien depuis le chat.

**Sophia**
> Pour préparer une carte d’attaque, ça se fait depuis l’action concernée dans le Plan, pas depuis Ressources. Ressources sert ensuite à la consulter si elle existe déjà. Ici, pars de « Préparer le dossier mutuelle » dans ton plan.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: n/a
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-01 - Slot fourni mais redemande

**User**
> Là ce n'est plus l'action, c'est surtout que je suis tendu et agacé. Je devrais choisir quel type de potion ?

**Sophia**
> Tu veux qu’on traite ça comme une action de ton plan, une action hors plan, ou plutôt comme un état émotionnel ?

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: n/a
- executed_tools: []
- durable_effect: none

**Signal global observe**
- `coaching_type`: `emotional`
- `confidence`: `0.92`
- `activation_checks.is_about_emotional_state`: `true`
- `activation_checks.needs_type_confirmation`: `false`
- `emotional_state_context.state_hint`: `tendu et agacé`

**Analyse si yellow/red**
- Symptome: le local flow redemande le type alors que le signal global emotionnel est clair.
- Source amont probable: active flow previous `plan_action` prevaut sur le nouveau signal `emotional`, et `change_confirm` est declenche trop largement.
- Owner runtime: `coaching_recommendation` local reducer.
- Meilleure correction selon les guidelines: si le nouveau signal a `coaching_type=emotional` et `needs_type_confirmation=false`, router directement `emotion_coaching` ou poser une confirmation explicite seulement si conflit faible.
- Pourquoi ce n'est pas un patch local: le visible agent n'a pas a decider la bascule; c'est le reducer local qui doit consommer le signal.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le suivi produit lie a une carte du plan reste dans `coaching_recommendation`.
- La guidance "Plan pour preparer, Ressources pour consulter" est coherent pour une action du plan.

**Problemes**
- Tour 1: recommandation `adjust_plan` trop rapide. Famille: BF-INTAKE-05. Impact: Sophia pousse une solution plus lourde alors qu'une carte d'attaque etait explicitement demandee comme hypothese.
- Tour 3: clarification redemandee malgré un signal emotionnel clair. Famille: BF-INTAKE-01. Impact: friction conversationnelle.

**Fix propose**
- Source amont: `coaching_recommendation` local flow.
- Correction recommandee: renforcer la matrice locale action-plan; default `attack_card` pour demarrage/evitement, `adjust_plan` seulement avec preuve de taille/cadrage/rythme. Consommer `coaching_type=emotional` quand `needs_type_confirmation=false`.
- Tests d'invariant attendus: plan_action + repousse/ouverture support => `attack_card`; active plan_action + nouveau signal emotional high-confidence => `emotion_coaching`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1: `coaching_recommendation` selectionne directement; `skill_run.status=continue`.
- T2: active flow conserve l'ownership; pas de chute vers `product_help`.
- T3: active flow conserve l'ownership, mais ne consomme pas correctement le nouveau signal emotionnel.

**Skills / Operations / Tools**
- Aucun tool execute.
- Aucun direct effect.
- Aucun effet durable.
- Cleanup cible execute; `user_memories` retourne 404 en local.

**Verdict global:** yellow. Le contrat global simplifie est verifie en run reel et l'ownership est corrige. Il reste deux bugs locaux dans `coaching_recommendation`: choix de feature action-plan et bascule emotionnelle.
