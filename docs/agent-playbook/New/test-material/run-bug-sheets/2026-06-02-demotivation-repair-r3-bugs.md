# Bug Sheet — Demotivation Repair R3

## Run

- Date: 2026-06-02
- Run id: `20260602-r3`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-demotivation-repair-r3.md`
- Persona: `qa-skill`, connexion temporaire locale `demotivation_repair_20260602-r1`
- Verdict: red

## Bugs

### R3-B01

- Bug id: `R3-B01`
- Tours: 1
- Famille: `BF-ROUTE-01`
- Domaine owner: dispatcher / conversation skill admission
- Source amont: premier tour demotivation route en `companion` au lieu de `demotivation_repair`.
- Symptome visible: reponse acceptable, mais Sophia ne marque pas le skill demotivation comme owner.
- Preuve systeme: `target_final=companion`, `selected_handler=null`, `tool_execution=none`.
- Correction attendue: promouvoir `demotivation_repair` des le premier tour quand perte de sens/fatigue/abandon dominent sans demande explicite de plan edit ou outil.
- Statut: `open`
- Fix reference: a definir.
- Tests requis: positif fatigue/perte de sens -> `demotivation_repair`; paraphrase abandon -> `demotivation_repair`; anti-faux-positif demande explicite modification plan -> tool/plan owner.

### R3-B02

- Bug id: `R3-B02`
- Tours: 2, 3
- Famille: `BF-AGENDA-02`
- Domaine owner: active conversation skill runtime / final response pipeline
- Source amont: apres resolution vers `demotivation_repair`, la reponse visible est une reprise exacte du tour 1 au lieu d'une generation depuis le message courant.
- Symptome visible: Sophia redemande le micro-geste alors que l'utilisateur l'a donne, puis repete encore apres correction explicite.
- Preuve systeme: tour 2 `selected_handler=demotivation_repair`, `route_reason=orientation_clarification_resolved_conversation_skill`, reponse identique au tour 1; tour 3 `route_reason=active_conversation_skill_continue`, reponse encore identique.
- Correction attendue: garantir que `conversation_handler/demotivation_repair` consomme le message courant et invalide toute reponse precedente; clarifier le contrat avec `target_final=companion`.
- Statut: `open`
- Fix reference: a definir.
- Tests requis: positif micro-geste fourni -> phrase de lancement; recovery "tu me redemandes" -> acknowledgement + consigne courte; anti-faux-positif micro-geste absent -> question de clarification permise.

## Verifications

- Run IA reel local avec `force_full_ai=true`: fait via `curl` direct vers `/functions/v1/test-send-message`.
- Incident technique: `supabase status` indisponible et premier client timeout a 20s; le tour 1 a complete en DB apres 46s.
- Effets durables: aucun outil execute, aucun scheduled checkin, aucune memoire observee dans la projection du run.
- Amelioration vs R2: `select_state_potion` et `prepare_attack_card` ne capturent plus le flow; `demotivation_repair` est selectionne aux tours 2 et 3.
