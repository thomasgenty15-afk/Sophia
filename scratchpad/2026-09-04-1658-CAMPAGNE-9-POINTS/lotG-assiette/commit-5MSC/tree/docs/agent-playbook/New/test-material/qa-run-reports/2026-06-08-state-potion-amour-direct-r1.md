# QA Run - Potion Amour Direct R1

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `state-potion-amour-direct-20260608-r1`
- Persona: user QA temporaire `qa-amour-direct-1780914932184@example.com`, supprime apres cleanup cible
- Objectif: retester le flow Potion d'amour sans demarrer par `select_state_potion`
- Trajectoire: etat actif pre-injecte `active_subskill_id=select_state_potion.amour`, collecte directe des champs, handoff plateforme, apply_attempt non-mutant, repeat/destination, annulation
- Surfaces visees: `select_state_potion.amour`, active handoff state, local dispatcher, reducer, visible agent, EffectLedger, DB no-mutation
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback deterministe, aucun changement de code pendant le run
- Validite QA: valide. Le run ne passe pas par la selection globale de potion; il demarre avec un `temp_memory.__active_tool_skill_intake` deja positionne sur le sous-skill Amour.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> C'est par rapport a mon echec de vendredi : depuis, je me parle tres durement et je voudrais retrouver un regard plus tendre.

**Sophia**
> C'est tout a fait comprehensible de vouloir retrouver de la tendresse apres avoir ete si exigeant avec toi-meme suite a cet echec. Pour t'aider a adoucir ce dialogue interieur et ramener un peu de chaleur, la Potion d'amour est la plus adaptee.
>
> Tu peux aller la configurer dans la section Etat / Potions de la plateforme. Voici les informations a y reporter :
>
> Par rapport a quoi est-ce que tu te sens en manque d'amour en ce moment ? mon echec de vendredi
> Tu te sens surtout comment ? Dur avec moi 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.amour`
- route_reason: `active_amour_local_dispatcher`
- safety: none/low, pas de preemption
- direct_effects: []
- operation: `status=handoff_delivered`, `reason_code=amour_handoff_delivered`, `platform_handoff.draft != null`
- pending_confirmation: null
- executed_tools: []
- durable_effect: no DB write

### Tour 2

**Verdict du tour:** green

**User**
> Ok active-la.

**Sophia**
> Je ne peux malheureusement pas activer la potion directement depuis notre discussion. Pour qu'elle agisse, il faut que tu la lances toi-meme dans la section Etat / Potions de la plateforme.
>
> Voici les informations exactes a y saisir pour ta Potion d'amour :
>
> Par rapport a quoi est-ce que tu te sens en manque d'amour en ce moment ? mon echec de vendredi
> Tu te sens surtout comment ? Dur avec moi 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.amour`
- route_reason: `active_amour_local_dispatcher`
- operation: `status=apply_attempt`, `reason_code=amour_apply_attempt_no_chat_execution`
- pending_confirmation: null
- executed_tools: []
- committed_effects: []
- durable_effect: no DB write

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow

**User**
> Redis-moi juste quoi mettre dans la plateforme.

**Sophia**
> Pas de souci, voici les elements exacts a saisir dans la section Etat / Potions pour ta Potion d'amour :
>
> Par rapport a quoi est-ce que tu te sens en manque d'amour en ce moment ? mon echec de vendredi
> Tu te sens surtout comment ? Dur avec moi 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.amour`
- route_reason: `active_amour_local_dispatcher`
- operation: `status=handoff_delivered`, `reason_code=amour_handoff_delivered_from_destination_followup`, `platform_handoff.draft != null`
- pending_confirmation: null
- executed_tools: []
- committed_effects: []
- durable_effect: no DB write

**Analyse si yellow/red**
- Symptome: visible correct, mais la trace relivre un nouveau `handoff_delivered` au lieu de rester sur une action de type `repeat_handoff`.
- Source amont probable: dispatcher/reducer local Amour classe `redis-moi` comme `platform_destination_followup`, puis le reducer relivre un handoff complet car tous les champs sont lockes.
- Owner runtime: `select_state_potion` sous-skills locaux / reducer commun.
- Meilleure correction selon les guidelines: apres `last_handoff_delivered=true`, `platform_destination_followup` avec champs deja complets devrait rester en `repeat_handoff` ou `destination_short`, sans relivrer un nouveau handoff final.
- Pourquoi ce n'est pas un patch local: le cas concerne tous les sous-skills potion deja complets, pas seulement Amour ni la phrase `redis-moi`.

### Tour 4

**Verdict du tour:** green

**User**
> Non finalement pas de potion.

**Sophia**
> C'est entendu, on met la potion de cote pour le moment. N'hesite pas si tu as besoin d'autre chose ou si tu souhaites simplement continuer a discuter de ce qui te preoccupe. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.amour`
- route_reason: `active_amour_local_dispatcher`
- operation: `status=cancelled`, `reason_code=amour_flow_cancelled`
- pending_confirmation: null
- executed_tools: []
- committed_effects: []
- durable_effect: active state nettoye au cleanup QA

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le flow demarre directement dans `select_state_potion.amour`, sans etape de selection globale.
- Le message naturel du Tour 1 remplit les deux champs en un seul tour: contexte `echec de vendredi` et etat `Dur avec moi`.
- `Ok active-la` est refuse proprement depuis le chat et renvoie vers la plateforme.
- `Redis-moi` donne les champs utiles sans status recap ni sortie de domaine.
- `Pas de potion` annule le flow.

**Problemes**
- Warning wording Tour 2: `Pour qu'elle agisse` reste non-mutant, mais peut sonner comme une promesse produit forte. Severite faible.

**Fix propose**
- Source amont: visible agent Potion / wording apply_attempt.
- Correction recommandee: preferer une phrase plus neutre du type `si tu veux l'utiliser, lance-la depuis la plateforme`.
- Tests d'invariant attendus: apply_attempt non-mutant avec wording sans promesse d'effet.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tous les tours restent chez `select_state_potion.amour`.
- Le run ne passe pas par le handler generique de selection au demarrage; l'etat actif Amour est injecte avant le Tour 1.

**Skills / Operations / Tools**
- Tour 1: `handoff_delivered`, draft present, no mutation.
- Tour 2: `apply_attempt`, no execution.
- Tour 3: warning systeme: `redis-moi` visible OK mais statut `handoff_delivered` au lieu de `repeat_handoff`.
- Tour 4: `cancelled`, no execution.

**Effets durables**
- `user_potion_sessions=[]`.
- `user_recurring_reminders=[]`.
- `scheduled_checkins=[]`.
- Cleanup cible effectue: `chat_messages`, `user_chat_states`, tables d'effets potion/rappel/checkin et user Auth temporaire.

## Verdict Global

Verdict global: green fonctionnel / yellow systeme faible. La correction principale est verifiee en QA reelle directe: le sous-skill Amour capture les champs naturels et produit un handoff avec draft sans passer par la selection globale. Reste a stabiliser le statut de `redis-moi` apres handoff deja livre.
