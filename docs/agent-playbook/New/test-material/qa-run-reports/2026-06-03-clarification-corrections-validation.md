# QA Run — Clarification Corrections Validation

## 1. Contexte Du Test

- Date: 2026-06-03
- Runs:
  - `clarification-corrections-20260603-r1-reminder-paraphrase`
  - `clarification-corrections-20260603-r2-attack-defense`
  - `clarification-corrections-20260603-r3-product-help-antifp`
- Persona: trois utilisateurs temporaires QA dédiés, créés via Auth local puis nettoyés
- Objectif: valider les corrections one-shot payload et multi-intent carte défense + carte attaque
- Trajectoire: un tour réel par run via `/functions/v1/test-send-message`, `force_full_ai=true`, `client_now_iso=2026-06-03T15:18:00.000+02:00`
- Surfaces visees: dispatcher, clarification_tool, TurnFrame, one-shot reminder, product_help, effets durables
- Cadre IA reel: Supabase local, Edge Function locale redémarrée avant les runs, pas de renderer déterministe, pas de fallback direct, aucune correction pendant les runs
- Validite QA: valide

## 2. Tours De Conversation

### Tour 1 — R1 Reminder Paraphrase

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
- Symptome: le payload durable est corrigé, mais la suite reste reprise par fallback générique et pas comme `prepare_attack_card` structuré.
- Source amont probable: dispatcher composite coverage / TurnAgenda.
- Owner runtime: dispatcher + agenda.
- Meilleure correction selon les guidelines: garder le fallback non-mutant, puis produire une tâche agenda structurée quand le LLM détecte le second intent.
- Pourquoi ce n'est pas un patch local: la correction durable appartient à l'intake; la suite structurée appartient au dispatcher/agenda.

### Tour 2 — R2 Attack + Defense

**Verdict du tour:** green

**User**
> J'aimerais créer une carte de défense et une carte d'attaque.

**Sophia**
> Par laquelle de ces deux cartes veux-tu commencer : la carte de défense ou la carte d'attaque ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- memory_plan: `__clarification_state_v1` présent
- executed_tools: `[]`
- durable_effect: none

### Tour 3 — R3 Product Help Anti-FP

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
- Symptome: le routing anti-faux-positif est correct, mais la réponse explique surtout la carte de défense et ne compare pas vraiment attaque vs défense.
- Source amont probable: product_help knowledge/renderer.
- Owner runtime: product_help.
- Meilleure correction selon les guidelines: ajouter une ressource produit comparative attack/defense au skill product_help, sans tool intent.
- Pourquoi ce n'est pas un patch local: le défaut est une lacune de contenu produit, pas une mauvaise route.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le rappel paraphrasé programme le bon contenu durable.
- La demande carte défense + attaque pose une vraie question de priorité, sans mutation.
- La question product_help ne lance aucun tool skill.

**Problemes**
- Tour 1: reprise générique de la seconde intention. Famille: BF-AGENDA-01. Impact: friction légère. Severite: yellow.
- Tour 3: explication incomplète de la différence attaque/défense. Famille: BF-RENDER-01. Impact: le user n'obtient pas exactement la comparaison demandée. Severite: yellow.

**Fix propose**
- Source amont: dispatcher/agenda pour Tour 1 ; product_help knowledge pour Tour 3.
- Correction recommandee: transformer les segments non couverts en tâche agenda structurée quand possible ; ajouter une fiche comparative product_help.
- Tests d'invariant attendus: rappel + second intent, attack+defense create, attack+defense explain.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- R1 route vers `create_one_shot_reminder` et garde la suite en fallback non-mutant.
- R2 route vers `orientation_clarification` avec `ClarificationState`.
- R3 route vers `product_help`, sans tool intent.

**Skills / Operations / Tools**
- R1 exécute uniquement `create_one_shot_reminder`.
- R2 n'exécute aucun tool skill complexe.
- R3 n'exécute aucun tool.

**Memory / Effets durables**
- R1 scheduled checkin correct: `one_shot_reminder:boire_mon_traitement`.
- R2 aucun effet durable, `__clarification_state_v1.no_chat_mutation=true`.
- R3 aucun effet durable.
- Les trois runs ont été nettoyés après inspection. `user_memories` retourne 404 car table absente localement.

**Problemes**
- R1: second intent non structuré. Famille: BF-AGENDA-01. Severite: yellow.
- R3: contenu product_help incomplet. Famille: BF-RENDER-01. Severite: yellow.

**Fix propose**
- Source amont: dispatcher/agenda et product_help content.
- Correction recommandee: continuer le chantier agenda structuré et enrichir la ressource comparative product_help.
- Tests d'invariant attendus: runs réels R1/R2/R3 après la prochaine correction product_help.

## Verdict Global

- Verdict: yellow
- Raison principale: les corrections demandées sont effectives sur l'effet durable R1 et la clarification R2, mais il reste une dette de structuration agenda et un contenu product_help incomplet.
- Follow-up prioritaire: product_help comparaison attack/defense si on veut rendre R3 green.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-03-clarification-corrections-validation-bugs.md`
