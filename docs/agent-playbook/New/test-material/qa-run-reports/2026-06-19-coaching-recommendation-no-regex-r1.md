## 1. Contexte Du Test

- Date: 2026-06-19
- Run: `coachingrec-no-regex-20260619-r1`
- Persona: user QA local temporaire `qa-normal-coachingrec-no-regex-20260619-r1-1781873920456@example.com`
- Objectif: verifier le flow `coaching_recommendation` apres suppression des routes/recommandations par regex.
- Trajectoire: action du plan -> guidance produit liee au flow actif -> changement vers action hors plan -> confirmation hors plan -> changement emotionnel.
- Surfaces visees: dispatcher global, active flow ownership, dispatcher local `coaching_recommendation`, visible agents `action_plan_coaching`, `no_plan_coaching`, `change_confirm_coaching_type`, direct effects.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun fallback deterministe.
- Validite QA: valide. Fixture plan locale creee puis supprimee; user QA et donnees de run nettoyes.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Dans mon plan, j'ai l'action Préparer le dossier mutuelle. Je l'ouvre depuis deux jours puis je referme parce que je ne sais pas par quel justificatif commencer. Tu me conseillerais plutôt de préparer une carte ou de changer l'action ?

**Sophia**
> Je te conseille une carte d’attaque. Ton action est bonne, mais le démarrage bloque: il faut clarifier le tout premier justificatif à prendre et le premier geste à faire.
>
> Les cartes se préparent depuis l’action concernée dans le plan, pas depuis Ressources.
>
> Si tu veux, je peux t’indiquer quoi mettre dans cette carte.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: coaching_recommendation_signal
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Ok, et si je veux la préparer moi-même, je vais où exactement dans Sophia ? Ne crée rien depuis le chat.

**Sophia**
> Va dans le **Plan**, ouvre l’action **« Préparer le dossier mutuelle »**, puis lance la **carte d’attaque** depuis cette action. Les cartes se préparent depuis l’action concernée, pas depuis Ressources. Si tu veux juste en **consulter** une déjà existante, là tu passes par **Ressources**.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Autre cas : j'ai aussi un mail à Camille qui n'est pas dans mon plan. Je bloque pareil au moment d'ouvrir le brouillon. Là tu peux m'aider comment ?

**Sophia**
> Tu veux qu’on parte sur une action de ton plan, une action hors plan, ou plutôt sur ton état émotionnel ?

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none
- signal global: `coaching_type=no_plan_action`, `confidence=0.87`, `needs_type_confirmation=false`
- state local apres tour: `coaching_type=plan_action`, `last_visible_task_kind=change_confirm_coaching_type`, `pending_type_change.candidate_coaching_type=unclear`

**Analyse si yellow/red**
- Symptome: Sophia redemande le type alors que le user dit explicitement que le mail n'est pas dans le plan.
- Source amont probable: reducer/contrat de transition du dispatcher local quand un active flow recoit un nouveau `dispatcher_signal_context` clair.
- Owner runtime: `skills/coaching_recommendation/local_flow.ts`.
- Meilleure correction selon les guidelines: quand le signal entrant est high confidence et `needs_type_confirmation=false`, le local flow doit soit accepter le changement de type, soit demander une confirmation ciblee avec `candidate_coaching_type=no_plan_action`; il ne doit pas retomber sur un choix ternaire.
- Pourquoi ce n'est pas un patch local: la source est la transition d'etat active flow -> nouveau type de coaching, pas une phrase precise ni une regex.

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Hors plan justement : ce mail à Camille n'est rattaché à aucune mission ni habitude.

**Sophia**
> Pour ce mail hors plan, va dans Ressources > Cartes d’attaque. Choisis une aide libre qui te facilite juste l’ouverture du brouillon, par exemple Mot de bascule ou Préparer le terrain.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none
- signal global: `coaching_type=no_plan_action`, `confidence=0.88`, `needs_type_confirmation=false`
- state local apres tour: `coaching_type=no_plan_action`, mais `difficulty.action_title=Préparer le dossier mutuelle` alors que le sujet courant est le mail a Camille

**Analyse si yellow/red**
- Symptome: la reponse visible est globalement correcte, mais l'etat local conserve un titre d'action stale issu du plan precedent.
- Source amont probable: merge de `difficulty` / `dispatcher_signal_context` lors du changement plan_action -> no_plan_action.
- Owner runtime: `skills/coaching_recommendation/local_flow.ts`.
- Meilleure correction selon les guidelines: sur changement de `coaching_type`, invalider explicitement les champs de contexte incompatibles du type precedent, puis reconstruire `difficulty` depuis le signal courant.
- Pourquoi ce n'est pas un patch local: il faut corriger le contrat de state merge pour tous les changements de type, pas seulement le mot "Camille".

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> En fait là le plus dur n'est même pas le mail : je suis tendu et j'ai la boule au ventre avant de m'y mettre. Dans Sophia, tu me conseillerais quoi ?

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
- memory_plan: none
- executed_tools: []
- durable_effect: none
- signal global: `coaching_type=emotional`, `confidence=0.92`, `needs_type_confirmation=false`, `emotional_state_context.state_hint=tendu / boule au ventre`
- state local apres tour: `coaching_type=no_plan_action`, `last_visible_task_kind=change_confirm_coaching_type`, `pending_type_change.candidate_coaching_type=unclear`

**Analyse si yellow/red**
- Symptome: Sophia redemande le type au lieu de passer a `emotion_coaching` et recommander une potion.
- Source amont probable: meme bug de transition locale que tour 3; le signal global clair n'est pas consomme comme changement de type resolu.
- Owner runtime: `skills/coaching_recommendation/local_flow.ts`.
- Meilleure correction selon les guidelines: transmettre et appliquer `candidate_coaching_type=emotional` depuis le signal global quand la confiance est forte et que `needs_type_confirmation=false`; sinon poser une question ciblee, pas ternaire.
- Pourquoi ce n'est pas un patch local: le probleme est la semantique de transition d'active flow, pas la detection de "boule au ventre".

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tour 1: la recommandation carte d'attaque est pertinente pour un blocage de demarrage sur une action du plan.
- Tour 2: Sophia garde l'ownership coaching et donne la destination correcte: carte preparee depuis l'action du Plan, Ressources seulement pour consulter.
- Tour 4: apres confirmation, Sophia ne propose pas `adjust_plan` pour une action hors plan.

**Problemes**
- Tour 3: clarification inutile alors que le user a deja donne "n'est pas dans mon plan". Famille: BF-STATE-01. Impact: friction conversationnelle.
- Tour 5: clarification inutile alors que le besoin emotionnel est explicite. Famille: BF-STATE-01. Impact: Sophia retarde la recommandation potion.
- Tour 4: l'etat interne garde l'ancien titre d'action, risque de pollution au tour suivant. Famille: BF-STATE-01. Impact: risque de mauvaise personnalisation.

**Fix propose**
- Source amont: reducer local `coaching_recommendation`, transition de type et merge de contexte.
- Correction recommandee: remplacer la confirmation ternaire automatique par une transition structuree: si le signal entrant est clair, mettre a jour `coaching_type`, `dispatcher_signal_context`, `difficulty` et visible agent cible; si confirmation requise, renseigner le candidat exact.
- Tests d'invariant attendus: plan_action -> no_plan_action high confidence; no_plan_action -> emotional high confidence; signal ambiguous -> question ternaire; changement de type efface les champs incompatibles stale.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- L'ownership global est bon sur tous les tours: `response_owner=coaching_recommendation`.
- `readActiveFlowState`/active ownership fonctionnent: pas de saut vers `product_help`, safety ou normal reply.
- Les signaux globaux sont bons aux tours 1, 3, 4 et 5.

**Skills / Operations / Tools**
- `selected_skill_id=coaching_recommendation` sur les 5 tours.
- Aucun tool ni direct effect execute, conforme au besoin.
- Le probleme est aval: le local flow conserve le type actif precedent ou cree une confirmation generique mal renseignee.

**Effets durables**
- Aucun effet durable attendu.
- Aucun `scheduled_checkins` cree.
- Fixture plan et user QA nettoyes apres run.

**Correction recommandee**
- Dans le reducer local, consommer le nouveau `dispatcher_signal_context` quand il porte un `coaching_type` high confidence avec `needs_type_confirmation=false`.
- Quand une confirmation est necessaire, remplir `candidate_coaching_type` avec le type entrant, pas `unclear`.
- Sur changement de type, reconstruire `difficulty`, `action_context`, `recommendation_decision` et `dispatcher_signal_context` depuis le nouveau signal; ne pas conserver les champs du type precedent.

## Verdict Global

Verdict global: yellow. Le retrait du routing regex n'a pas casse l'ownership ni les garde-fous produit, mais il expose maintenant un vrai bug de transition structuree dans le flow actif.
