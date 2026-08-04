## 1. Contexte Du Test

- Date: 2026-06-19
- Run: `coachingrec-type-switch-rerun-20260619-r1`
- Persona: user QA local temporaire `qa-normal-coachingrec-type-switch-rerun-20260619-r1-1781875300467@example.com`
- Objectif: verifier le correctif de transition `coaching_type` apres le run `coachingrec-no-regex-20260619-r1`.
- Trajectoire: action du plan -> guidance produit liee au flow -> action hors plan -> guidance carte libre -> etat emotionnel.
- Surfaces visees: dispatcher global, active flow ownership, reducer local `coaching_recommendation`, visible agents, direct effects.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun fallback deterministe.
- Validite QA: valide. Fixture plan locale creee puis supprimee; user QA et donnees de run nettoyes.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Dans mon plan, j'ai l'action Préparer le dossier mutuelle. Je l'ouvre depuis deux jours puis je referme parce que je ne sais pas par quel justificatif commencer. Tu me conseillerais plutôt de préparer une carte ou de changer l'action ?

**Sophia**
> Je te conseille une carte d’attaque, pas de changer l’action. Là, le blocage est surtout au démarrage : il faut rendre le premier justificatif plus simple à attraper.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: coaching_recommendation_signal
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Ok, et si je veux la préparer moi-même, je vais où exactement dans Sophia ? Ne crée rien depuis le chat.

**Sophia**
> Pour la préparer toi-même, c’est depuis l’action du plan « Préparer le dossier mutuelle », pas depuis Ressources. Là, tu vas dans la carte de l’action, puis vers la préparation de la carte d’attaque si l’option est dispo.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Autre cas : j'ai aussi un mail à Camille qui n'est pas dans mon plan. Je bloque pareil au moment d'ouvrir le brouillon. Là tu peux m'aider comment ?

**Sophia**
> Oui : prépare une carte d’attaque libre très simple, par exemple un mot de bascule du style : « J’ouvre le brouillon, puis j’écris juste la première phrase. » L’idée, c’est de te donner un départ minuscule, pas de tout faire d’un coup.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: none
- signal global: `coaching_type=no_plan_action`, `confidence=0.87`, `needs_type_confirmation=false`
- state local: `coaching_type=no_plan_action`, `last_visible_task_kind=no_plan_coaching`, `difficulty.action_title=ouvrir le brouillon du mail à Camille`

### Tour 4

**Verdict du tour:** green

**User**
> Ok, et pour ce mail hors plan, je la retrouve où si je veux la préparer sans la rattacher au Plan ?

**Sophia**
> Dans Ressources, va sur les cartes d’attaque libres. Tu peux y préparer un support simple pour t’aider à ouvrir le brouillon, sans le rattacher à quoi que ce soit.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: none

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> En fait là le plus dur n'est même pas le mail : je suis tendu et j'ai la boule au ventre avant de m'y mettre. Dans Sophia, tu me conseillerais quoi ?

**Sophia**
> Je te conseillerais une potion d’état, pas une carte d’attaque. Là, le vrai blocage est dans la tension avant de commencer, donc il faut d’abord faire redescendre la pression 🙂 
>
> Si tu veux, je peux t’aider à formuler ça très simplement.

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- selected_handler: null
- route_reason: coaching_recommendation_exit_to_global
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- selected_skill_id: coaching_recommendation
- skill_run.status: exit
- exit_target: global
- executed_tools: []
- durable_effect: none
- signal global: `coaching_type=emotional`, `confidence=0.92`, `needs_type_confirmation=false`
- exit_note: `current_recommendation=state_potion`, `candidate_features=[state_potion]`

**Analyse si yellow/red**
- Symptome: la reponse visible est bonne sur le fond, mais le local flow sort vers global au lieu de rester owner `emotion_coaching`.
- Source amont probable: dispatcher local / reducer local choisit `exit_to_global_dispatcher` apres avoir identifie `state_potion`, probablement a cause du max-turn/transition ou d'une mauvaise interpretation du changement de sujet emotionnel.
- Owner runtime: `skills/coaching_recommendation/local_flow.ts`.
- Meilleure correction selon les guidelines: un changement clair vers `coaching_type=emotional` avec `state_potion` doit rester dans `coaching_recommendation` et appeler `emotion_coaching`; `exit_to_global_dispatcher` ne doit pas etre utilise quand le sujet reste dans les 4 leviers coaching.
- Pourquoi ce n'est pas un patch local: le probleme est la decision de flow action / ownership local, pas le wording de la reponse.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le tour 3 corrige le bug precedent: plus de question ternaire, switch direct vers action hors plan.
- Le tour 4 conserve la guidance correcte pour carte libre hors plan.
- Le tour 5 donne une recommandation humainement pertinente: potion d'etat plutot que carte d'attaque.

**Problemes**
- Tour 5: Sophia repond bien mais sort du flow; cela rend l'etat runtime fragile pour les tours suivants. Famille: BF-STATE-01. Impact: risque de perte d'ownership et de contexte produit emotionnel.
- Tour 5: presence d'un emoji alors que les regles visibles coaching sont generalement sobres. Impact faible, secondaire par rapport au bug d'ownership.

**Fix propose**
- Source amont: dispatcher/reducer local `coaching_recommendation`.
- Correction recommandee: si le local dispatcher/reducer a `current_recommendation=state_potion` et le signal entrant `coaching_type=emotional`, forcer la continuation `emotion_coaching` sauf off-topic/safety explicite.
- Tests d'invariant attendus: no_plan_action actif -> emotional clair au tour 4+ reste `response_owner=coaching_recommendation`, `skill_run.status=continue`, `visible_task=emotion_coaching`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tours 1-4: ownership correct `coaching_recommendation`.
- Tour 3: correction verifiee; `no_plan_action` clair est consomme sans confirmation inutile.
- Tour 5: active flow arbitration selectionne encore coaching, mais le skill sort avec `coaching_recommendation_exit_to_global`; le final owner devient `normal_reply`.

**Skills / Operations / Tools**
- `selected_skill_id=coaching_recommendation` sur les 5 tours.
- Aucun tool ni direct effect execute, conforme.
- Tour 5: le skill a identifie `state_potion` mais a produit une exit note au lieu d'un visible `emotion_coaching`.

**Effets durables**
- Aucun effet durable attendu ou cree.
- Fixture plan et user QA nettoyes apres run.

**Correction recommandee**
- Bloquer `exit_to_global_dispatcher` dans `coaching_recommendation` quand le signal courant reste dans le domaine coaching (`plan_action`, `no_plan_action`, `emotional`) et qu'une feature autorisee est identifiee.
- Revoir l'interaction `max_turns` / changement de type: un changement de type clair ne doit pas etre traite comme fin de flow.

## Verdict Global

Verdict global: yellow. Le bug du tour 3 est corrige et verifie en run reel. Il reste un bug d'ownership au tour 5: passage emotionnel correctement compris mais sortie abusive vers global.
