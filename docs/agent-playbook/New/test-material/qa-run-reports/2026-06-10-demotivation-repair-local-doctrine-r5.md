# QA Run Report — demotivation_repair local doctrine R5

## 1. Contexte Du Test

- Date: 2026-06-10
- Run: `2026-06-10-demotivation-repair-local-doctrine-r5`
- Persona: connexion temporaire locale `demotivationlocal_20260610_r5`, user id `f2ce13db-4b0c-4e47-b19c-25f51c5a9e09`
- Objectif: verifier en conditions reelles le correctif R3-B01 sur `action_card_candidate` trop precoce.
- Trajectoire: demotivation sur rangement du soir -> reconnexion au sens -> absence de carte/outil sans demande explicite -> arret local.
- Surfaces visees: dispatcher global entree skill, active flow arbitration, dispatcher local `demotivation_repair`, visible agent, effets durables.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, messages QA choisis tour par tour apres lecture des reponses et traces.
- Validite QA: valide. Aucun renderer deterministe, aucun fallback direct, aucun run staging/remote. Connexion temporaire nettoyee apres run.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je continue mes actions, mais je sens que je les fais en pilote automatique. Le rangement du soir avance, sauf que je ne vois plus vraiment ce que ca protege pour moi, et ca me donne envie de laisser tomber doucement.

**Sophia**
> C'est le piege du pilote automatique : on finit par oublier pourquoi on se donne cette peine et l'action devient une simple corvee.
>
> Si tu decidais de ne rien ranger ce soir, qu'est-ce qui risquerait de venir polluer ton esprit ou ton energie demain matin ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `skill_entry_signal`
- active_flow_arbitration: `no_active_flow`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Si je ne range rien, je me reveille avec l'impression que la veille deborde encore. Ce que j'aimerais, ce n'est pas avoir un salon parfait, c'est sentir que la journee est posee et que demain ne commence pas deja avec une dette.

**Sophia**
> C'est une vision tres claire : ranger n'est plus une corvee, mais un moyen de proteger ton energie pour demain. En evitant cette « dette » des le reveil, tu t'offres un vrai depart.
>
> Est-ce que tu sens que ce lien avec ta clarte mentale rend l'effort plus leger a envisager ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_conversation_skill_continue`
- active_flow_arbitration: `continue_active`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, ca rend l'effort moins inutile. Si je me dis que je ne range pas pour etre irreprochable mais pour fermer la journee, je peux le faire avec moins de jugement et un peu plus de calme.

**Sophia**
> C'est un beau reflexe pour proteger ton calme. Pour lancer ce rituel de fermeture des maintenant, choisis simplement un seul objet qui traine et remets-le a sa place.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_conversation_skill_continue`
- active_flow_arbitration: `continue_active`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 — Mauvais owner selectionne

**User**
> Oui, je garde juste cette phrase et le micro-geste. Pas besoin de carte ni d'outil, je veux m'arreter la pour aujourd'hui.

**Sophia**
> Parfait. Garde juste la phrase et le micro-geste, puis stop aujourd’hui. ✅🙂
>
> Note-toi juste : quand tu sens le “pilotage auto”, tu te recentres sur “fermer la journée pour demain”. Fais-le maintenant sur 30 secondes, sans ajouter quoi que ce soit, ok ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `active_skill_exit_requested`
- active_flow_arbitration: `abandon_active`
- active_owner: `conversation_skill`
- selected_owner: `normal_reply`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le user demande un arret simple sans nouveau sujet, mais l'arbitrage abandonne le flow actif et route vers `normal_reply`.
- Source amont probable: active flow arbitration / route policy, pas le visible agent local.
- Owner runtime: router active flow / dispatcher global arbitration.
- Meilleure correction selon les guidelines: un stop simple pendant un conversation skill actif doit d'abord rester dans le dispatcher local actif, qui produit `exit_to_global_dispatcher` avec une `note_information` exploitable. Le dispatcher global ne peut reprendre qu'apres cette sortie explicite.
- Pourquoi ce n'est pas un patch local: le dispatcher local n'est pas appele au tour 4; corriger le prompt visible local ne changerait pas l'owner selectionne.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- T1-T3 restent dans `demotivation_repair`.
- La conversation travaille bien la perte de sens et requalifie le rangement comme rituel de fermeture.
- Le warning R3 est corrige en conditions reelles: au moment ou le sens est retrouve, Sophia ne propose ni carte, ni outil, ni potion.

**Problemes**
- Tour 4: le stop simple sort vers `normal_reply`; le message visible ajoute une question finale "ok ?" et des emojis alors que le user demandait de s'arreter. Famille: BF-ROUTE-01. Impact: sortie moins propre et non conforme a la doctrine locale. Severite: red systeme, yellow UX.

**Fix propose**
- Source amont: active flow arbitration / route policy.
- Correction recommandee: distinguer un signal d'arret du flow actif d'un abandon silencieux. Si active flow conversationnel et user demande d'arreter, selectionner le skill actif pour produire `exit_to_global_dispatcher` avec `note_information`; le global ne reprend qu'au second passage a partir de cette note.
- Tests d'invariant attendus: active conversation skill + arret simple -> premier passage `response_owner=conversation_handler`, selected_handler actif, `flow_action=exit_to_global_dispatcher`, `note_information` presente; reprise globale uniquement apres cette sortie locale.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1: entree correcte via `skill_entry_signal`.
- T2-T3: continuation active correcte.
- T4: violation doctrine. `active_flow_arbitration.decision=abandon_active`, `selected_owner=normal_reply`, `reason_code=active_skill_exit_requested` alors que le message est un stop local sans nouveau sujet.

**Skills / Operations / Tools**
- Aucun tool ni operation engageante.
- Aucun bridge potion.
- Aucun bridge carte visible au moment critique T3.

**Memory / Effets durables**
- Snapshot durable: `chat_messages` OK, `turn_summary_logs` OK.
- `memory_items_recent=0`, `scheduled_checkins_recent=0`.
- EffectLedger: zero effet sur tous les tours.

**Problemes**
- Tour 4: mauvais owner selectionne. Famille: BF-ROUTE-01. Impact systeme: le dispatcher local ne peut pas produire `exit_to_global_dispatcher` ni transmettre de `note_information`, donc la reprise globale n'est pas prouvee par le chemin local attendu. Severite: red.

**Fix propose**
- Source amont: active flow arbitration / dispatcher route policy.
- Correction recommandee: remplacer la sortie directe `active_skill_exit_requested -> normal_reply` par une continuation locale quand l'intention est stop/cancel/defer/complete; laisser le dispatcher local produire `exit_to_global_dispatcher` avec `note_information`, puis autoriser la reprise globale.
- Tests d'invariant attendus: stop simple actif; stop avec no_tool/no_card; changement de sujet clair; safety preempt; chaque cas doit prouver l'owner attendu.

## Verdict Global

**red**

Le correctif R3-B01 est verifie: pas de carte/support produit propose au tour 3 lorsque le user retrouve le sens sans demande explicite. Le run echoue toutefois sur un nouveau bug systeme au tour 4: l'arret simple abandonne le flow actif vers `normal_reply` au lieu de passer par le dispatcher local `demotivation_repair`, qui devait emettre `exit_to_global_dispatcher` avec `note_information`.
