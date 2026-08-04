# QA Run — Multi-Intent Reminder Smoke Runs

## 1. Contexte Du Test

- Date: 2026-06-03
- Runs:
  - `clarification-multi-intent-smoke-20260603-r1-exact`
  - `clarification-multi-intent-smoke-20260603-r2-paraphrase`
  - `clarification-multi-intent-smoke-20260603-r3-antifp`
- Persona: trois utilisateurs temporaires QA dédiés, créés via Auth local puis nettoyés
- Objectif: vérifier en conditions réelles que Sophia ne perd pas une deuxième intention après un rappel ponctuel, et que le rappel seul ne déclenche pas de faux follow-up
- Trajectoire: un tour réel par run via `/functions/v1/test-send-message`, `force_full_ai=true`, `client_now_iso=2026-06-03T15:18:00.000+02:00`
- Surfaces visees: dispatcher, TurnFrame, one-shot reminder, TurnAgenda, rendu post-opération, effets durables
- Cadre IA reel: Supabase local, Edge Function locale redémarrée avant les runs, pas de renderer déterministe, pas de fallback direct, aucune correction pendant les runs
- Validite QA: valide

## 2. Tours De Conversation

### Tour 1 — R1 Exact

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-AGENDA-01 — Multi-intention incomplete

**User**
> J'aimerais que tous me rappelle dans 10 minutes de prendr mes médicaments, et là tout de suite j'aimerais qu'on crée une carte d'attaque

**Sophia**
> C'est programmé pour mercredi 03 juin à 15:28.
>
> Je garde aussi la suite : « et là tout de suite j'aimerais qu'on crée une carte d'attaque ». Tu veux qu'on la traite maintenant ? 🙂

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
- durable_effect: `scheduled_for=2026-06-03T13:28:00+00:00`, `event_context=one_shot_reminder:prendr_mes_medicaments`

**Analyse si yellow/red**
- Symptome: la suite n'est plus perdue côté transcript, mais `tool_skill_intents=[]`; l'agenda ne porte pas encore `prepare_attack_card`.
- Source amont probable: dispatcher composite coverage / TurnAgenda.
- Owner runtime: dispatcher + agenda.
- Meilleure correction selon les guidelines: produire une intention structurée non-mutante pour la deuxième demande quand le LLM l'identifie, puis laisser l'agenda poser la question métier dédiée.
- Pourquoi ce n'est pas un patch local: le rendu protège l'expérience mais ne crée pas le contrat runtime structuré attendu.

### Tour 2 — R2 Paraphrase

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-02 — Extraction trop large ou polluee ; BF-AGENDA-01 — Multi-intention incomplete

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
- durable_effect: `scheduled_for=2026-06-03T13:28:00+00:00`, `event_context=one_shot_reminder:attaque_pour_mon_action`

**Analyse si yellow/red**
- Symptome: le transcript garde la suite, mais le rappel durable est pollué par la deuxième intention au lieu de rester sur `boire mon traitement`.
- Source amont probable: one-shot reminder instruction extraction ne borne pas encore les connecteurs `puis juste après`.
- Owner runtime: one-shot reminder intake / direct effect payload compiler.
- Meilleure correction selon les guidelines: étendre le bornage du payload rappel sur les connecteurs de suite génériques sans router la deuxième intention par regex.
- Pourquoi ce n'est pas un patch local: le défaut touche l'effet durable produit par l'intake, pas seulement la phrase visible.

### Tour 3 — R3 Anti-Faux-Positif

**Verdict du tour:** green

**User**
> Rappelle-moi dans 10 minutes d'attaquer la pile de papiers administratifs.

**Sophia**
> C'est programmé pour mercredi 03 juin à 15:28. 🙂

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
- durable_effect: `scheduled_for=2026-06-03T13:28:00+00:00`, `event_context=one_shot_reminder:attaquer_la_pile_de_papiers_administratifs`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia ne perd plus silencieusement la suite dans les deux cas multi-intent.
- Sophia tutoie.
- Le rappel seul avec le mot “attaquer” ne déclenche pas de question parasite.

**Problemes**
- Tour 2: la phrase visible est acceptable, mais le contenu durable du rappel est faux. Famille: BF-INTAKE-02. Impact: rappel incorrect. Severite: red.
- Tours 1 et 2: la reprise reste générique, pas une vraie question structurée de carte d'attaque. Famille: BF-AGENDA-01. Impact: friction conversationnelle. Severite: yellow.

**Fix propose**
- Source amont: one-shot reminder intake puis dispatcher/agenda.
- Correction recommandee: borner le payload sur `puis juste après` et stabiliser la deuxième intention comme handoff agenda quand elle est structurée.
- Tests d'invariant attendus: exact original, paraphrase `puis juste après`, rappel seul avec “attaquer”, rappel + autre second sujet non-tool.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Les trois runs routent vers `create_one_shot_reminder`.
- Aucun run ne produit `tool_skill_intents`.
- Le fallback post-opération fonctionne côté transcript sur R1/R2.

**Skills / Operations / Tools**
- `create_one_shot_reminder` est exécuté avec succès sur les trois runs.
- Aucun tool skill complexe n'est lancé, ce qui respecte la contrainte de non-exécution.
- `prepare_attack_card` n'est pas encore représenté comme handoff structuré.

**Memory / Effets durables**
- R1 durable effect correct: `one_shot_reminder:prendr_mes_medicaments`.
- R2 durable effect incorrect: `one_shot_reminder:attaque_pour_mon_action`.
- R3 durable effect correct: `one_shot_reminder:attaquer_la_pile_de_papiers_administratifs`.
- Les trois runs ont été nettoyés après inspection. `user_memories` retourne 404 car table absente localement.

**Problemes**
- Tour 2: effet durable pollué. Famille: BF-INTAKE-02. Severite: red.
- Tours 1 et 2: deuxième intention non structurée. Famille: BF-AGENDA-01. Severite: yellow.

**Fix propose**
- Source amont: `tools/always_on/one_shot_reminder/instruction_parser.ts` pour BF-INTAKE-02 ; dispatcher composite coverage / TurnAgenda pour BF-AGENDA-01.
- Correction recommandee: fixer d'abord le payload durable R2, puis continuer le chantier agenda structuré.
- Tests d'invariant attendus: runs réels R1/R2/R3 après correction.

## Verdict Global

- Verdict: red
- Raison principale: R2 montre encore un rappel durable pollué sur une paraphrase naturelle.
- Follow-up prioritaire: corriger l'extraction one-shot sur `puis juste après`, puis relancer les trois runs.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-03-clarification-multi-intent-smoke-runs-bugs.md`
