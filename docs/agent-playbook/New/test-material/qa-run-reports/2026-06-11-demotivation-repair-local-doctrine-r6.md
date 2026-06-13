# QA Run Report — Demotivation Repair Local Doctrine R6

## 1. Contexte Du Test

- Date: 2026-06-11
- Run: `demotivation-repair-local-doctrine-r6`
- Persona: `qa-skill`
- Connexion: `demotivation_repair_local_doctrine_r6` (temporary local QA user)
- Objectif: verifier que les dernieres modifications demotivation_repair respectent la doctrine locale, notamment entree active, continuation, sortie du flow et absence de legacy `exit_to_global_dispatcher`.
- Trajectoire: demotivation sur une petite action du soir -> exploration du sens -> micro-action -> demande explicite d'arret du flow -> verification du tour suivant.
- Surfaces visees: global routing, active flow arbitration, local demotivation_repair dispatcher, note_information d'exit, visible response pipeline, DB/temp state.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, pas de renderer deterministe, pas de fallback direct.
- Validite QA: valide. Les messages user ont ete choisis tour par tour apres lecture des reponses et traces courtes. Incident mineur de snapshot durable sur une mauvaise cle service au debut, corrige sur le tour 5; raw trace et conversation sont complets.

Artifacts:

- Raw: `tests/real-personas/qa-skill/runs/operations/2026-06-11-demotivation-repair-local-doctrine-r6.raw.json`
- Summary: `tests/real-personas/qa-skill/runs/operations/2026-06-11-demotivation-repair-local-doctrine-r6.summary.json`
- Durable snapshot: `tests/real-personas/qa-skill/runs/operations/2026-06-11-demotivation-repair-local-doctrine-r6.durable.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je bloque sur mon rangement du soir. Je sais que c'est petit, mais là ça me paraît complètement inutile et j'ai juste envie de laisser tomber.

**Sophia**
> C'est normal de vouloir tout lâcher quand on a l'impression de brasser du vent.
>
> Au-delà de la corvée, qu'est-ce que ce petit rangement est censé t'apporter de précieux pour ton esprit ou pour ta matinée de demain ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `skill_entry_signal`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: no durable memory effect observed
- executed_tools: none
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Je crois que ça devrait surtout m'éviter de commencer demain avec le cerveau déjà saturé. Mais ce soir je n'arrive plus à sentir ce lien, ça ressemble juste à une tâche en plus.

**Sophia**
> C'est normal que ce soir, l'utilité de demain te paraisse abstraite face à la fatigue de l'instant. Quand on sature, l'action ressemble à un obstacle plutôt qu'à un soulagement.
>
> Au-delà du côté pratique, quel sentiment aimerais-tu vraiment ressentir demain en commençant ta journée ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_conversation_skill_continue`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: no durable memory effect observed
- executed_tools: none
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> J'aimerais me lever avec un peu de calme, pas avec cette sensation d'avoir déjà perdu le contrôle. Si je garde seulement deux minutes pour dégager la table, ça me paraît peut-être moins absurde.

**Sophia**
> Deux minutes pour dégager la table, c'est le geste idéal pour protéger ton calme de demain matin. C'est un petit cadeau pour ton futur toi, pour que tu ne subisses plus ton réveil.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_conversation_skill_continue`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: no durable memory effect observed
- executed_tools: none
- durable_effect: none

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-AGENDA-02` — interruption explicite mal restauree

**User**
> Oui, je garde cette phrase et le geste de deux minutes. Pas besoin de carte ni d'outil, je veux arrêter ce flow ici pour aujourd'hui.

**Sophia**
> Ok, deux minutes, point final ce soir 🙂✅
>
> Tu veux faire la version la plus simple maintenant : table seulement (sans “ranger derrière”) ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_skill_exit_requested`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: no durable memory effect observed
- executed_tools: none
- durable_effect: active flow state cleared for next turn
- local dispatcher output: `status=exit`, `response_intent=exit_to_global_dispatcher`, `diagnosis.flow_action=exit_to_global_dispatcher`
- note_information: present in raw trace, `target_dispatcher=global`, `target_flow=global`, `risk_score=0`

**Analyse si yellow/red**
- Symptome: le dispatcher local comprend l'arret et produit bien `exit_to_global_dispatcher` avec `note_information`, mais le message visible du meme tour relance une question d'action locale.
- Source amont probable: pipeline de reponse / TurnAgenda apres sortie locale. L'exit local est calcule, mais la reponse visible ne suit pas le handoff global attendu sur ce meme tour.
- Owner runtime: conversation response pipeline / active flow exit handoff, pas le prompt visible demotivation seul.
- Meilleure correction selon les guidelines: quand un skill conversationnel retourne `response_intent=exit_to_global_dispatcher` ou `diagnosis.flow_action=exit_to_global_dispatcher`, la pipeline doit consommer la `note_information`, clear l'etat actif, puis passer le message au dispatcher global pour la reponse visible du meme tour. Elle ne doit pas reutiliser une continuite locale.
- Pourquoi ce n'est pas un patch local: ajouter une phrase de stop dans demotivation_repair masquerait le probleme. La doctrine demande un changement de dispatcher avec note_information; la trace montre que la decision locale existe deja.

### Tour 5

**Verdict du tour:** green

**User**
> Non justement, je veux vraiment m'arrêter là pour ce flow. Bonne soirée.

**Sophia**
> Ok. Tu t’arrêtes là, flow clôturé pour ce soir 😊✅ Bonne nuit, et demain tu reprends juste la table si tu en as envie.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- active_flow_arbitration: `decision=none`, `reason_code=no_active_flow`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: no durable memory effect observed
- executed_tools: none
- durable_effect: chat_messages=10, memory_items=0, reminders=0, checkins=0

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia prend le temps de discuter la demotivation avant de proposer un artefact produit.
- Les tours 1-3 reconnectent l'action a une intention concrete sans carte, potion, reminder ou effet durable.
- La reponse reste dans le bon domaine: fatigue, sens, micro-action.

**Problemes**
- Tour 4: Sophia dit "point final" puis pose une nouvelle question d'action alors que le user demande explicitement d'arreter le flow. Famille: `BF-AGENDA-02`. Impact: le user doit se corriger au tour suivant pour obtenir l'arret. Severite: red pour le tour, yellow pour la fluidite globale car le tour 5 recupere correctement.

**Fix propose**
- Source amont: pipeline de sortie active flow vers dispatcher global.
- Correction recommandee: traiter l'exit local comme une interruption/handoff prioritaire de la reponse visible du meme tour; ne pas laisser le conversation_handler local produire une continuation quand `response_intent=exit_to_global_dispatcher`.
- Tests d'invariant attendus: demande explicite d'arret du flow -> raw trace contient note_information -> etat actif clear -> reponse visible du meme tour ne relance pas le flow local.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tour 1: entree correcte via `skill_entry_signal`.
- Tours 2-3: continuation active correcte via `active_conversation_skill_continue`.
- Tour 4: arbitration active route encore vers `conversation_handler/demotivation_repair` avec `active_skill_exit_requested`, ce qui permet au dispatcher local de produire l'exit. C'est conforme a la doctrine pour analyser le tour depuis le dispatcher local.
- Tour 5: `normal_reply_default` avec `active_flow_arbitration.reason_code=no_active_flow`, ce qui prouve que l'etat actif a bien ete cleared apres le tour 4.

**Skills / Operations / Tools**
- Aucun outil, aucune carte, aucune potion, aucun rappel, aucun checkin.
- Le raw trace du tour 4 contient `skill_run.output.status=exit`, `response_intent=exit_to_global_dispatcher`, `diagnosis.flow_action=exit_to_global_dispatcher`.
- La `note_information` existe et cible le global dispatcher.

**State / Durable**
- Durable snapshot final: `chat_messages=10`, `memory_items=0`, `user_recurring_reminders=0`, `scheduled_checkins=0`.
- L'etat actif demotivation_repair est absent au tour 5.

**Probleme systeme**
- Le contrat local est mieux respecte qu'au run precedent: le dispatcher local produit bien l'exit et la note.
- La faille restante est le handoff visible meme-tour: la sortie locale ne declenche pas la reponse globale attendue sur le tour 4, et une continuation locale est visible.

**Fix concret attendu**
- Source amont: active flow response pipeline / TurnAgenda.
- Corriger le chemin qui traite `skill_run.output.response_intent=exit_to_global_dispatcher`:
  - clear state actif;
  - transmettre `note_information` au dispatcher global;
  - produire la reponse visible via le dispatcher global sur le meme tour;
  - interdire toute generation visible locale apres ce signal.
- Ajouter un test integration autour du cas exact sans matcher la phrase:
  - active demotivation_repair;
  - user demande l'arret;
  - sortie locale `exit_to_global_dispatcher`;
  - final same-turn owner ou trace de handoff global prouvee;
  - visible response ne pose pas de nouvelle question de continuation locale.

## Verdict Global

**red**

Le run n'est pas vert. Les regressions principales precedentes sont partiellement corrigees: plus de `normal_reply` direct au tour d'exit sans preuve locale, et la `note_information` d'exit existe bien. Mais la reponse visible du meme tour ne suit pas encore le handoff global; elle continue le flow local malgre la demande explicite d'arret.
