# QA Run Report — demotivation_repair local doctrine R2

## 1. Contexte Du Test

- Date: 2026-06-09
- Run: `demotivation-repair-local-doctrine-r2`
- Persona: `qa-skill`
- Connexion dediee: `demotivationlocal_20260609_r2`, temporaire, nettoyee en fin de run.
- Objectif: verifier en conditions reelles les modifications du dispatcher local `demotivation_repair`, notamment la discussion avant potion, le maintien du flow actif, le stop local et les projections QA durables.
- Trajectoire: perte de sens du plan -> clarification du lien motivationnel -> stabilisation d'une phrase utile -> stop local sans handoff.
- Surfaces visees: global dispatcher initial, `demotivation_repair` local dispatcher/reducer/visible agent, active flow arbitration, EffectLedger, durable snapshot QA.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas de fallback direct.
- Validite QA: valide. 5 tours HTTP 200, aucune reponse vide, aucun abort, transcript issu du chemin IA reel.

Artifacts:

- Raw: `tests/real-personas/qa-skill/runs/operations/2026-06-09-demotivation-repair-local-doctrine-r2.raw.json`
- Summary: `tests/real-personas/qa-skill/runs/operations/2026-06-09-demotivation-repair-local-doctrine-r2.summary.json`
- Durable: `tests/real-personas/qa-skill/runs/operations/2026-06-09-demotivation-repair-local-doctrine-r2.durable.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-03 — Contrainte explicite perdue

**User**
> Je suis en train de lâcher mon plan. Je fais encore deux trois gestes, mais honnêtement je ne sens plus le lien avec ce que je voulais construire, donc j'avance en pilote automatique.

**Sophia**
> C'est épuisant d'avancer quand on a l'impression que les gestes n'ont plus de résonance et que le pilote automatique a pris les commandes. Ce sentiment de déconnexion n'est pas un manque de force, c'est le signe que le lien entre tes efforts quotidiens et ta direction initiale s'est distendu.
>
> À quel moment as-tu eu l'impression que ce que tu fais chaque jour a cessé de nourrir ton projet de départ ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `skill_entry_signal`
- safety: low / no preempt
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: targeted/light, no route memory used
- executed_tools: none
- durable_effect: none
- local: `flow_action=restore_meaning`, `visible_task=restore_meaning`, `potion_bridge_status=candidate`, `selected_potion=null`, `last_potion_bridge_offer=null`
- conversation_context: `selected_candidate.potion=null`, `target_dispatcher=null`, `max_questions=0`

**Analyse si yellow/red**
- Symptome: Sophia pose une question alors que `visible_task.conversation_context.max_questions=0`.
- Source amont probable: contrat visible `demotivation_repair` / prompt stage `restore_meaning` qui autorise une question malgre le contexte.
- Owner runtime: `demotivation_repair.visible_agent` ou regle de remplissage `response_contract.max_questions`.
- Meilleure correction selon les guidelines: faire respecter `conversation_context.max_questions=0` par le prompt visible, ou corriger le dispatcher pour produire `max_questions=1` quand une question est voulue.
- Pourquoi ce n'est pas un patch local: le probleme est un invariant de contrat entre dispatcher/reducer et visible agent, pas une phrase exacte.

### Tour 2

**Verdict du tour:** green

**User**
> Je crois que ça a décroché quand mes actions sont devenues juste une liste à vider. Au départ c'était pour retrouver de la marge et arrêter de subir, mais là je coche des choses sans sentir que ça me rend plus libre.

**Sophia**
> C'est épuisant de vider une liste de tâches sans jamais sentir que cela allège vraiment ton quotidien ou te redonne de l'air. Quand l'action devient purement mécanique, on finit par oublier pourquoi on a commencé tout ça : pour arrêter de subir et retrouver une vraie liberté de mouvement.
>
> Parmi les actions que tu enchaînes en ce moment, laquelle te semble avoir le moins de rapport avec cette sensation de marge que tu voulais initialement créer ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_conversation_skill_continue`
- safety: low / no preempt
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: no route memory used
- executed_tools: none
- durable_effect: none
- local: `flow_action=restore_meaning`, `visible_task=restore_meaning`, `potion_bridge_status=not_applicable`, `selected_potion=null`, `last_potion_bridge_offer=null`
- conversation_context: `selected_candidate.potion=null`, `target_dispatcher=null`, `max_questions=1`

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-03 — Contrainte explicite perdue

**User**
> C'est surtout le bilan du soir. Je le fais parce qu'il est dans le plan, mais il est devenu administratif. Ce dont j'aurais besoin, c'est de retrouver en une phrase pourquoi ce bilan sert ma liberté, sinon je vais finir par le laisser tomber.

**Sophia**
> Quand un rituel devient purement administratif, il cesse de nourrir ton projet et finit par peser. Pour que ce bilan redevienne un levier de ta liberté, qu'est-ce qu'il te permet de mettre à l'abri ou de décider concrètement pour la suite ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_conversation_skill_continue`
- safety: low / no preempt
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: no route memory used
- executed_tools: none
- durable_effect: none
- local: `flow_action=restore_meaning`, `visible_task=restore_meaning`, `potion_bridge_status=candidate`, `selected_potion=null`, `last_potion_bridge_offer=null`
- conversation_context: `selected_candidate.potion=null`, `durable_need_kind=meaning_reconnection`, `target_dispatcher=null`, `max_questions=0`

**Analyse si yellow/red**
- Symptome: Sophia pose une question utile, mais le contrat visible disait `max_questions=0`.
- Source amont probable: meme invariant que T1, question constraint non respectee entre reducer et visible prompt.
- Owner runtime: `demotivation_repair.visible_agent` / `response_contract`.
- Meilleure correction selon les guidelines: aligner le champ `max_questions` et le prompt stage-specific; si `max_questions=0`, le visible doit reformuler sans question.
- Pourquoi ce n'est pas un patch local: le point concerne le respect structurel de `visible_task.conversation_context`, pas le wording de cette question.

### Tour 4

**Verdict du tour:** green

**User**
> Il me permet de voir ce que je peux reprendre en main demain au lieu de laisser la journée m'avaler. Si je le formule comme ça, le bilan n'est plus une corvée, c'est un petit moment pour récupérer du pouvoir de décision.

**Sophia**
> C'est exactement ça : transformer ce moment en un espace de décision pour ne plus laisser la journée vous « avaler », mais bien reprendre la main sur demain.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_conversation_skill_continue`
- safety: low / no preempt
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: no route memory used
- executed_tools: none
- durable_effect: none
- local: `flow_action=answer_repair`, `visible_task=repeat_repair`, `potion_bridge_status=not_applicable`, `selected_potion=null`, `last_potion_bridge_offer=null`
- conversation_context: `selected_candidate.potion=null`, `target_dispatcher=null`, `max_questions=0`

### Tour 5

**Verdict du tour:** green

**User**
> Ok, on s'arrête là pour maintenant. Je veux juste garder cette phrase, pas ouvrir autre chose.

**Sophia**
> C'est entendu. L'essentiel est d'avoir identifié que ce bilan est avant tout l'expression de ton pouvoir de décision. Je te laisse avec cette perspective pour tes prochaines soirées.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_conversation_skill_continue`
- safety: low / no preempt
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: no route memory used
- executed_tools: none
- durable_effect: none
- local: `flow_action=complete_flow`, `visible_task=exit_or_cancel`, `response_intent=stop_local_no_handoff`, `reason_code=demotivation_repair_stop_local_no_handoff`
- conversation_context: `selected_candidate.potion=null`, `target_dispatcher=null`, `max_questions=0`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia ne saute pas sur une potion; elle discute vraiment la perte de sens pendant plusieurs tours.
- Le lien "liste a vider" -> "retrouver de la marge" -> "pouvoir de decision" est fluide et humainement comprehensible.
- Le stop final est respecte sans nouvelle question et sans ouverture d'un autre sujet.

**Problemes**
- T4: micro-friction de ton avec `vous « avaler »` alors que le reste du run tutoie. Impact faible, pas bloquant.
- T1/T3: les questions sont humainement utiles, mais systemiquement incoherentes avec `max_questions=0`. Famille: BF-INTAKE-03. Impact utilisateur faible; impact contractuel yellow.

**Fix propose**
- Source amont: `demotivation_repair.visible_agent` ou sortie dispatcher `response_contract.max_questions`.
- Correction recommandee: le stage prompt visible doit respecter strictement `conversation_context.max_questions`; si une question est attendue, le dispatcher doit mettre `max_questions=1`.
- Tests d'invariant attendus: visible agent with `max_questions=0` produces no question; dispatcher restore_meaning with intended question emits `max_questions=1`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1: entree correcte via `skill_entry_signal` vers `demotivation_repair`.
- T2-T5: active flow preserve, `active_conversation_skill_continue`, global dispatcher normal non proprietaire.
- T5: stop local correct dans le reducer: `complete_flow` -> `response_intent=stop_local_no_handoff`, `visible_task=exit_or_cancel`, `note_information=null`, pas de global sur le meme tour.

**Skills / Operations / Tools**
- Aucun tool execute.
- Aucun handoff potion force.
- Les candidats potion internes restent non visibles: `potion_bridge_status=candidate`, `selected_potion=null`, `last_potion_bridge_offer=null`.
- Aucun `demotivation_repair_potion_handoff`.

**Memory / Effets durables**
- EffectLedger: 0 requested / 0 committed sur tous les tours.
- Durable snapshot: `chat_messages=200 ok count=10`, `memory_items_recent=200 ok count=0`, `scheduled_checkins_recent=200 ok count=0`, `turn_summary_logs=200 ok count=5`.
- La correction BF-TEST-01 precedente est verifiee: plus de 400 sur les projections DB du helper.
- Cleanup: connexion temporaire `demotivationlocal_20260609_r2` supprimee par `scripts/qa-cleanup-run-connection.sh`.

**Problemes**
- T1/T3: `conversation_context.max_questions=0` mais reponse visible avec une question. Famille: BF-INTAKE-03. Impact systeme: le prompt visible ne respecte pas completement le contexte structure produit par dispatcher/reducer. Severite: yellow.

**Fix propose**
- Source amont: contrat `visible_task.conversation_context.max_questions` dans le flow `demotivation_repair`.
- Correction recommandee: rendre le prompt visible stage-specific plus strict sur `max_questions`, ou aligner le dispatcher pour ne jamais produire `0` quand il attend une question.
- Tests d'invariant attendus:
  - `restore_meaning` avec `max_questions=0` ne contient pas de question visible;
  - `restore_meaning` avec `max_questions=1` peut poser une seule question;
  - run reel paraphrase avec demotivation repair conserve le flow actif sans offer potion prematuree.

## Verdict Global

- Verdict: yellow
- Raison principale: les corrections majeures sont validees en conditions reelles, mais un invariant de contrat visible reste incoherent (`max_questions=0` avec question visible aux tours 1 et 3).
- Follow-up prioritaire: corriger le respect de `visible_task.conversation_context.max_questions` dans `demotivation_repair`, puis rerun court ciblant T1/T3.
