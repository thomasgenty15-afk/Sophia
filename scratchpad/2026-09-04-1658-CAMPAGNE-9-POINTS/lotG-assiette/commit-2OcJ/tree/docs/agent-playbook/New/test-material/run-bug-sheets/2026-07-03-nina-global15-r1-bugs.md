# Bug Sheet — global15-nina-r1 — 2026-07-03

Run: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-03-nina-global15-r1.md`
Persona: Nina (`e5630c78-447e-452c-b7d6-e4b475cd22fd`) — plan V2 `c3e1fad8` actif.
Verdict global: **yellow** (aucun effet durable faux; frictions de rendu/observabilité).

## Bugs

### R1-B01 — Rappel commité mais rendu comme préexistant

- Bug id: R1-B01
- Tours: T7
- Famille: BF-LEDGER-02 (commit réel mal rendu)
- Domaine owner: renderer/confirmation `create_one_shot_reminder` + statut tool skill
- Source amont: pipeline de rendu de confirmation qui relit l'état après création et confond le rappel créé au tour avec un préexistant (dédup mal placée); `tool_skill_run=needs_clarify` non aligné sur le commit réel.
- Symptome visible: « Je ne peux pas le créer ici parce qu'un rappel identique est déjà en attente pour demain à 18:00 » alors que le rappel est créé à l'instant (baseline 0).
- Preuve systeme: `scheduled_checkins` `83b73cb1` unique, `scheduled_for 2026-07-04 16:00Z`, `created_at 01:06:14` = ce tour; `direct_effects_to_run=[create_one_shot_reminder]`; recap T13 confirme 1 seul rappel conforme.
- Correction attendue: dériver le message de confirmation de l'EffectLedger du tour (« créé pour demain 18h »); aligner le statut du tool skill sur l'effet commité. Pas de patch de phrase.
- Statut: fix_applied (rerun requis)
- Fix reference: même auto-collision qu'Alex r3 T5 — double exécution de la lane reminder dans le même tour (lane weekly non conditionnée + lane principale, `operation_runtime_pipeline.ts`) combinée à une garde `duplicate_pending` qui matchait sa propre écriture (`one_shot_reminder/executor.ts`). Fix : lane weekly conditionnée à un état weekly actif + exclusion des lignes du tour courant dans la garde (retombée sur le chemin idempotent par `source_message_id`). Voir `2026-07-03-global15-alex-r3-bugs.md` R3-B01 pour le détail et les tests.
- Tests requis: positif (création reminder → message reflète l'effet du tour); anti-faux-positif (« pas de préexistant fictif »); cohérence statut tool skill ↔ commit. → couverts par `operation_runtime_pipeline_test.ts` + `one_shot_reminder_tool_test.ts`.

### R1-B02 — Safety pregate vide sur désespoir explicite non imminent

- Bug id: R1-B02
- Tours: T10 (et transverse: pregate vide sur les 15 tours)
- Famille: BF-SAFETY-01 (granularité/priorité de détection safety)
- Domaine owner: safety pregate / reducer de désescalade
- Source amont: pregate non alimenté dans cette config, ou désescalade totale déclenchée par le disclaimer « je vais rien faire » effaçant toute bande.
- Symptome visible: aucun (réponse humaine appropriée: validation, recadrage, respect contrainte poids). Défaut d'observabilité, pas d'UX.
- Preuve systeme: `safety_pregate = {}` sur les 15 `conversation_turn_traces`, y compris T10 (« cas désespéré », « moral à zéro »); contraste avec Alex R2 T9 (`safety: medium (hopelessness…)`).
- Correction attendue: conserver une bande safety basse (hopelessness non imminent) même avec disclaimer, pour traçabilité + filet proportionné; ne pas confondre « non imminent » et « aucun signal ».
- Statut: open
- Fix reference: —
- Tests requis: hopelessness non imminent → bande safety basse non nulle; disclaimer « rien faire » ne remet pas la bande à zéro; aucun side effect pendant la bande.

### R1-B03 — Coaching: répétition template / non-avancement après acceptation

- Bug id: R1-B03
- Tours: T2 (secondaire T12 wording sous flow)
- Famille: `a classifier` (répétition template renderer / non-avancement de flow; proche BF-STATE-01)
- Domaine owner: `coaching_recommendation` (progression de flow + template)
- Source amont: le skill recommande la technique puis redirige vers l'app sans étape suivante; après « oui » user + détail fourni, il re-génère la même recommandation au lieu de transitionner.
- Symptome visible: T2 re-décrit la carte de défense quasi à l'identique du T1 (« repérer le moment / piège / geste 30s / plan B »); sensation de radoter.
- Preuve systeme: T1 et T2 tous deux `coaching_recommendation`, T2 `active_coaching_recommendation`, contenu structurellement identique; aucun slot concret rempli.
- Correction attendue: après acceptation, avancer le flow (nommer le premier piège / le geste de retour) au lieu de re-recommander; template variabilisé.
- Statut: fix_applied + renforcé (validé en conditions réelles 2026-07-03)
- Fix reference: doctrine de progression à deux niveaux : (1) dispatcher local coaching (`coaching_recommendation/local_flow.ts`) — « Progression après acceptation » + « Distinction contenu vs destination dans un follow-up » : une demande d'avancée/contenu (« aide-moi à la préparer », « vas-y », « quoi mettre ») après une carte déjà recommandée ⇒ `answer_followup` avec `visible_task.instruction` ordonnant d'AVANCER concrètement sans re-nommer la technique ni re-donner la destination ; (2) règles visibles (`visible_agents/shared.ts`) — nomination de la technique **scopée à la PREMIÈRE recommandation** (une fois la technique dans recent_messages, on passe au contenu concret) ; carte d'attaque → propose l'ancre/la phrase concrète pour le cas ; carte de défense → applique les composants au cas SANS jamais remplir les champs (frontière stricte préservée). **Probe réel** : « ok vas-y, aide-moi à la préparer » (le cas exact qui radotait) → avance désormais avec le contenu concret (« pose ton chargeur sur l'oreiller… c'est le signal de quitter l'écran »). Tests : `local_flow_test.ts` (progression + scoping technique + frontière défense).
- Tests requis: acceptation carte → transition de flow (pas re-recommandation); anti-répétition de la même structure sur 2 tours consécutifs.

### R1-B04 — Accusé mémoire cadré « pour cet échange » sur intention durable

- Bug id: R1-B04
- Tours: T12
- Famille: `a classifier` (wording renderer d'accusé mémoire). Sévérité faible.
- Domaine owner: renderer de l'accusé mémoire (sous flow coaching)
- Source amont: template d'accusé qui borne la rétention à la session (« pour la suite de cet échange ») au lieu de signifier une rétention durable.
- Symptome visible: « Je le garde en tête pour la suite de cet échange » alors que Nina demande « retiens vraiment sur moi pour la suite ».
- Preuve systeme: `memory_write_candidates_emitted=0` in-turn, MAIS `trigger-memorizer-daily` en fin de run persiste 5 `memory_items` dont le fait cible (« grignote… vers 20h… jamais le matin ni le week-end ») → persistance correcte; seul le wording est trompeur.
- Correction attendue: accusé sur intention mémoire durable = rétention durable (« je garde ça sur toi »), pas « cet échange ». Ne pas toucher la détection (qui aboutit au batch).
- Statut: open
- Fix reference: —
- Tests requis: intention mémoire durable → accusé durable (pas session-scoped); mémoire persistée au batch (déjà vérifié ce run).

## Notes transverses (non bug bloquant)

- Stickiness `active_coaching_recommendation` (T2, T3, T10, T11, T12): non destructrice ce run (chaque tour servi correctement, mémoire T12 aboutie), mais porte R1-B03/R1-B04. Même racine que la stickiness observée sur d'autres personas — à surveiller.
- Incohérence d'owner sur changement de plan: T11 (réduire/pause) → `coaching_recommendation`, T14 (supprimer) → `plan_realignment`. Les deux refusent la mutation (correct), mais l'owner devrait être stable.
- Point fort confirmé: `track_progress_plan_item` commite **mission (T4) ET habit (T5)** proprement chez Nina — pas de différentiel mission/habit sur ce plan.
