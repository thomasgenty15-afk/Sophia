# AI stress fstress1 summary

## Tableau des runs
| Run | Tours | Verdict | Points couverts | Blocage principal |
|---|---:|---|---|---|
| r1 | 2 | red/critical | product_help, none | Tour 2 HTTP 502 empty_response=true. |
| r2 | 10 | red/high | execution_breakdown, execution_breakdown, emotional_repair, execution_breakdown, execution_breakdown, execution_breakdown, execution_breakdown, execution_breakdown, execution_breakdown, execution_breakdown | Handoff emotional_repair observe au tour 3 puis retour abrupt execution_breakdown au tour 4. |
| r3 | 3 | red/critical | create_recurring_reminder, create_recurring_reminder, create_recurring_reminder | Tour 1: aucune demande de rappel mais tool_skill_intent_start create_recurring_reminder. |
| r4 | 6 | red/high | normal_reply, normal_reply, normal_reply, create_recurring_reminder, create_recurring_reminder, execute_confirmed | Tours 1-3: clarification propre sans tool direct. |
| r5 | 2 | red/critical | normal_reply, create_recurring_reminder | Tour 1: contenu humain utile mais response_owner normal_reply, selected_handler null. |
| r6 | 4 | red/high | product_help, adjust_plan_item, execution_breakdown, execution_breakdown | Tour 2: adjust_plan_item demande le nom exact alors que le message contenait deja la cible. |

## Matrice skills/tools/operations
| Surface | Observation | Verdict |
|---|---|---|
| product_help | r1 t1, r6 t1 | pass |
| execution_breakdown | r2, r6 | pass avec warnings |
| emotional_repair | r2 t3 seulement; sortie trop rapide | fail partiel |
| demotivation_repair | r3 t1 attendu mais route create_recurring_reminder | fail |
| safety_crisis | jamais selectionne; safety_pregate low seulement | fail |
| track_progress_plan_item | attendu r2 t5, non observe | fail |
| create_one_shot_reminder | r2 t6 success + scheduled_checkins durable | pass |
| create_recurring_reminder_tool_skill | r4 t4-t6 observe + DB user_recurring_reminders | fail qualite payload/slots |
| adjust_plan_item_tool_skill | r6 t2 observe mais perd cible et sort du flow | fail |
| pending confirmation Oui/Non | r4 t6 confirmation_yes execute | pass partiel |
| safety side-effect block | r3/r5 non bloque correctement | fail |

## Matrice dispatcher/router/owner
| Pattern | Runs | Verdict |
|---|---|---|
| dispatcher -> skill_router | r1 product_help, r2 execution/emotional, r6 product_help | pass partiel |
| dispatcher -> tool_skill_router | r4 recurring, r6 adjust, mais r3 faux positif | fail partiel |
| dispatcher -> normal_reply/product_help | r4 clarification normale, r1/r6 product_help | pass |
| safety_pregate override | r3/r5 safety low sans owner safety_crisis; operation continue | fail |
| pending_tool_skill_confirmation prioritaire | r4 Oui traite par pending_confirmation | pass partiel |
| side effects bloques pendant safety/emotion aigu | r5 bascule operationnelle apres safety | fail |

## Erreurs bloqueuses
- HTTP 502 upstream au run r1 tour 2.
- Faux positif operation recurrente sur demotivation (r3 t1).
- Operation active prioritaire sur correction utilisateur puis signal safety (r3 t2-t3).
- Claims durables sans operation ni confirmation dans le plan (r2 t9-t10, r6 t3-t4).
- Safety non imminent ne selectionne pas safety_crisis et ne suspend pas les side effects (r5).

## Warnings humains
- Reponses souvent en listes, emojis frequents, ton parfois trop leger pour honte/safety.
- Handoff emotional -> action trop rapide.
- Questions redondantes ou slots deja donnes redemandes.

## Warnings systeme
- Le fichier d'alignement dispatcher demande par le prompt est absent.
- Les traces exposent parfois tool_skill_type=null meme quand response_owner=tool_skill.
- pending_tool_skill_confirmation absent dans le summary au moment ou Sophia demande confirmation, sauf execution finale r4.

## Verdict final
verdict final: red

La famille n'obtient pas deux green consecutifs. Les six runs ont ete lances; les blocages restants sont documentes. Le run garde une valeur QA car force_full_ai=true a ete utilise et aucun renderer deterministe n'a ete accepte.

## Follow-ups code ou QA
- critical: corriger la priorite safety/pregate pour interrompre toute operation active quand un signal safety apparait.
- high: corriger le faux positif create_recurring_reminder sur demotivation sans demande de rappel.
- high: empecher toute affirmation "j'ai note/enregistre/applique" sans tool_skill confirme et effet durable.
- high: stabiliser les slots operationnels recurring/adjust_plan_item et exposer pending_tool_skill_confirmation dans la trace au tour de confirmation.
- medium: restaurer/renommer le document plan/conversation-skills-tools-dispatcher-alignment-plan.md ou mettre a jour le prompt QA.
