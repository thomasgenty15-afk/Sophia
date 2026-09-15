# QA Run — Clarification Rerun Validation

## 1. Contexte Du Test

- Date: 2026-06-03
- Runs:
  - `clarification-rerun-20260603-r1-reminder-paraphrase`
  - `clarification-rerun-20260603-r2-attack-defense`
  - `clarification-rerun-20260603-r3-product-help-antifp`
- Persona: trois utilisateurs temporaires QA dédiés, créés via Auth local puis nettoyés
- Objectif: relancer les tests réels après correction one-shot et clarification attack/defense
- Trajectoire: un tour réel par run via `/functions/v1/test-send-message`, `force_full_ai=true`, `client_now_iso=2026-06-03T15:18:00.000+02:00`
- Surfaces visees: dispatcher, clarification_tool, one-shot reminder, product_help, effets durables
- Cadre IA reel: Supabase local, Edge Function locale redémarrée avant les runs, pas de fallback déterministe, aucune correction pendant les runs
- Validite QA: valide

## 2. Tours De Conversation

### Tour 1 — Reminder Paraphrase

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-AGENDA-01 — Multi-intention incomplete

**User**
> Mets-moi un rappel dans 10 minutes pour boire mon traitement, puis juste après je veux préparer une carte d'attaque pour mon action.

**Sophia**
> C'est programmé pour mercredi 03 juin à 15:28.
>
> Je garde aussi la suite : « puis juste après je veux préparer une carte d'attaque pour mon action. ». Tu veux qu'on la traite maintenant ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- safety: `low`
- direct_effects: `["create_one_shot_reminder"]`
- operation: `create_one_shot_reminder`
- pending_confirmation: none
- memory_plan: no clarification state
- executed_tools: `["create_one_shot_reminder"]`
- durable_effect: `scheduled_for=2026-06-03T13:28:00+00:00`, `event_context=one_shot_reminder:boire_mon_traitement`

**Analyse si yellow/red**
- Symptome: le rappel durable est correct, mais la seconde intention reste reprise par fallback générique et non par handoff agenda structuré.
- Source amont probable: dispatcher composite coverage / TurnAgenda.
- Owner runtime: dispatcher + agenda.
- Meilleure correction selon les guidelines: produire une tâche agenda non-mutante quand le second intent est détecté par le LLM.
- Pourquoi ce n'est pas un patch local: le fallback protège le transcript, mais ne remplace pas le contrat agenda.

### Tour 2 — Attack + Defense

**Verdict du tour:** green

**User**
> J'aimerais créer une carte de défense et une carte d'attaque.

**Sophia**
> Par laquelle veux-tu commencer : la carte de défense ou la carte d'attaque ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- memory_plan: `__clarification_state_v1` présent, candidats `prepare_defense_card` + `prepare_attack_card`, `no_chat_mutation=true`
- executed_tools: `[]`
- durable_effect: none

### Tour 3 — Product Help Anti-FP

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-RENDER-01 — Réponse incomplète ou surface mal rendue

**User**
> Explique-moi la différence entre une carte d'attaque et une carte de défense.

**Sophia**
> Carte de defense: Une carte de defense sert quand quelque chose risque de faire derailler l'action: impulsion, piege, pression, evitement ou reaction automatique.
>
> Comment l'utiliser: Une carte de defense peut etre generee librement depuis Ressources, ou etre liee au plan depuis une mission ou une habitude. Elle se retrouve ensuite dans Ressources, ou elle peut etre consultee et utilisee. Processus: identifier un moment concret, reperer le piege observable, definir mon geste faisable en moins de 30 secondes, puis prevoir un plan B simple.
>
> Ce que ca apporte:
> - Donne une reponse simple pour les moments de risque.
> - Anticipe les pieges concrets.
>
> Important: une carte de defense peut etre ajustee depuis la plateforme/Ressources quand l'option est disponible. Depuis le chat, je ne modifie pas une carte existante; si elle ne convient plus, on peut en preparer une nouvelle version apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- memory_plan: no clarification state
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le routing est correct et non-mutant, mais la réponse compare mal attaque vs défense.
- Source amont probable: product_help knowledge/renderer.
- Owner runtime: product_help.
- Meilleure correction selon les guidelines: ajouter une ressource comparative product_help.
- Pourquoi ce n'est pas un patch local: c'est une lacune de contenu produit, pas une erreur de routing.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- R1 ne pollue plus le rappel.
- R2 pose une clarification naturelle, tutoie, et n'exécute rien.
- R3 ne lance aucun tool skill.

**Problemes**
- R1: suite reprise génériquement. Famille: BF-AGENDA-01. Impact: friction légère. Severite: yellow.
- R3: explication incomplète. Famille: BF-RENDER-01. Impact: comparaison demandée non satisfaite. Severite: yellow.

**Fix propose**
- Source amont: TurnAgenda composite + product_help knowledge.
- Correction recommandee: tâche agenda structurée pour le segment non couvert ; fiche comparative attack/defense.
- Tests d'invariant attendus: rerun R1/R2/R3.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- R1: `create_one_shot_reminder`, effet durable correct.
- R2: `orientation_clarification`, aucun effet durable, état temporaire présent.
- R3: `product_help`, aucun tool exécuté.

**Skills / Operations / Tools**
- R1 exécute uniquement le rappel ponctuel.
- R2 ne lance aucun tool skill complexe.
- R3 ne lance aucun tool skill.

**Memory / Effets durables**
- R1: `scheduled_checkins.event_context=one_shot_reminder:boire_mon_traitement`.
- R2: `__clarification_state_v1.no_chat_mutation=true`.
- R3: aucun effet durable.
- Les trois runs ont été nettoyés après inspection. `user_memories` retourne 404 car table absente localement.

**Problemes**
- R1: second intent non structuré dans l'agenda. Famille: BF-AGENDA-01. Severite: yellow.
- R3: réponse product_help incomplète. Famille: BF-RENDER-01. Severite: yellow.

**Fix propose**
- Source amont: dispatcher/agenda et product_help.
- Correction recommandee: continuer agenda composite ; enrichir product_help comparaison attack/defense.
- Tests d'invariant attendus: même matrice après correction product_help.

## Verdict Global

- Verdict: yellow
- Raison principale: les corrections critiques sont stables, mais il reste deux jaunes non-mutants.
- Follow-up prioritaire: product_help comparaison attack/defense.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-03-clarification-corrections-validation-bugs.md`
