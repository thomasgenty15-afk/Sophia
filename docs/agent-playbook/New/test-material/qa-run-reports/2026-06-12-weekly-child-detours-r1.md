# QA Run Report - Weekly Child Detours R1

## 1. Contexte Du Test

- Date: 2026-06-12, Europe/Paris.
- Run: `weekly-child-detours-r1`.
- Persona: Rose, connexion locale existante.
- Objectif: verifier en conditions reelles que le weekly actif reste sous dispatcher local, resiste a une mention hypothetique de carte, lance un detour local Plan quand le user le demande explicitement, puis revient au weekly pour cloture.
- Trajectoire: weekly actif -> continuation weekly avec progression ressentie -> handoff local `adjust_plan_item` -> reprise parent weekly -> cloture.
- Surfaces visees: `weekly_adaptive_review_v1`, `adjust_plan_item`, note_information, suspension/reprise parent weekly, global dispatcher skip, no-chat-mutation.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, runner `tmp/weekly_local_real_qa.mjs`, aucun renderer deterministe, aucun fallback direct `processMessage`, aucun deploy/staging.
- Validite QA: valide. Le premier prepare sur Alex a echoue avant conversation car la DB locale n'avait pas assez d'items de plan; le run exploitable a ete relance sur Rose.
- Limite: ce run commence avec un `__active_skill_state` weekly installe par le runner. Il ne couvre pas l'ouverture proactive scheduler du weekly; l'ouverture a ete verifiee par prompt/code et tests unitaires, pas par ce run conversationnel.
- Nettoyage: cleanup cible effectue; le scope `qa-rose-2026-06-12-weekly-local-dispatcher-weekly-child-detours-r1` a ete supprime et `remaining_scope_messages=0`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Oui, la fatigue c'est bien le sujet. J'ai quand meme l'impression d'avoir avance vers l'objectif: j'ai moins fume certains soirs, mais je me sens encore fragile. Peut-etre qu'une carte d'attaque aiderait plus tard, mais pour l'instant j'aimerais surtout comprendre quoi alleger.

**Sophia**
> Tu as réussi à maintenir le cap sur le rangement du matériel et à entamer un travail sur les réflexes, malgré une fatigue bien présente en fin de semaine. C'est encourageant, même si cette fragilité demande de la prudence. Pour alléger la suite, on pourrait simplifier tes objectifs pour te laisser plus d'espace de récupération. Est-ce que c'est le 'sas de décompression' qui te semble le plus difficile à tenir en ce moment ?

**Trace courte**
- http_status: 200, `ok=true`
- response_owner: `tool_skill`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- global dispatcher: bloque par `active_weekly_review_uses_local_dispatcher`
- operation: `weekly_review_local_confirm_weekly_reading`
- flow_action: `confirm_weekly_reading`
- visible_task: `weekly_reading`
- direct_effects: aucun
- executed_tools: aucun
- durable_effect: aucun

### Tour 2

**Verdict du tour:** green

**User**
> Oui, c'est le sas de decompression qui craque. Ajuste cette action pour la semaine prochaine: je veux la rendre plus petite, juste 5 minutes sans fumer avant de decider quoi faire, pas un gros sas complet.

**Sophia**
> Comme ton sas de décompression actuel est devenu trop difficile à tenir avec la fatigue, on va réduire sa durée. L'idée est de passer à 5 minutes sans fumer pour la semaine prochaine, afin que ce soit plus gérable pour toi. Pour effectuer ce changement, rends-toi dans ton Plan : sous le niveau actif, tu trouveras l'option 'Ajuster mon plan' où tu pourras simplement saisir '5 minutes'.

**Trace courte**
- http_status: 200, `ok=true`
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `weekly_adaptive_review_v1_handoff_to_adjust_plan_item`
- global dispatcher: bloque par `weekly_adaptive_review_v1_handoff_to_adjust_plan_item_skips_global_dispatcher`
- note_information: presente dans `turn_frame`, `source_flow_id=weekly_adaptive_review_v1`, `target_dispatcher=adjust_plan_item`, `handoff_reason=bridge`, `return_to_weekly=true`
- operation: `adjust_plan_item_local_plan_handoff_ready`
- flow_action: `prepare_plan_handoff`
- platform_handoff: `status=delivered`, `no_chat_mutation=true`, `executable_from_chat=false`
- direct_effects: aucun
- executed_tools: aucun
- durable_effect: aucun patch Plan applique depuis le chat

### Tour 3

**Verdict du tour:** green

**User**
> Ok, on revient au weekly. Vu comme ca, cette version plus petite me rassure et je pense que ca suffit pour conclure le bilan de la semaine.

**Sophia**
> C'est entendu pour le sas de 5 minutes, c'est une approche plus douce pour tes moments de fatigue. On termine ce bilan ici. Rien n'est changé depuis notre discussion, mais tu as désormais une piste claire pour la suite. Prêt à démarrer ta nouvelle semaine ?

**Trace courte**
- http_status: 200, `ok=true`
- response_owner: `tool_skill`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- global dispatcher: bloque par `active_weekly_review_uses_local_dispatcher`
- operation: `weekly_review_local_complete_weekly_no_change`
- flow_action: `complete_weekly_no_change`
- visible_task: `complete_no_change`
- durable state avant cleanup: weekly `status=completed`, `validation_unlock_status=available`, `child_flow.status=completed`, `child_flow.flow_id=adjust_plan_item`, `felt_progress=encouraged`
- direct_effects: aucun
- executed_tools: aucun
- durable_effect: aucun patch Plan applique depuis le chat

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- T1 repond au vrai signal humain: progression ressentie, fatigue, fragilite et objectif global sont repris sans basculer vers une carte.
- T2 transforme une demande concrete de reduction du sas en proposition Plan claire, avec destination produit explicite.
- T3 revient naturellement au weekly et cloture sans pretendre qu'un changement DB a ete applique.

**Problemes**
- Aucun probleme bloquant observe.
- Petite friction UX: au T2, "on va reduire sa duree" peut sonner un peu trop affirmatif avant le rappel que le changement doit etre fait dans le Plan. Le message reste acceptable car il indique ensuite la destination Plan et aucun effet durable n'est applique.

**Fix propose**
- Aucun fix requis pour ce run.
- Follow-up utile: tester l'ouverture proactive scheduler pour valider le prompt initial du weekly hors `test-send-message`.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1 et T3: le dispatcher global normal est saute pendant le weekly actif.
- T1: la mention hypothetique de carte d'attaque ne provoque pas de handoff; le weekly reste owner.
- T2: la demande explicite de modification Plan passe par `handoff_to_local_flow` vers `adjust_plan_item`, avec `note_information` canonique.
- T3: apres `platform_handoff` du child flow, le parent weekly est restaure et reprend la cloture.

**Skills / Operations / Tools**
- Weekly local dispatcher stabilise `objective_delta`, `felt_state`, `felt_progress` et le target action.
- `adjust_plan_item` recoit le contexte via note_information et produit un handoff plateforme, sans mutation chat.
- Le child flow est marque complet dans l'etat weekly parent avant cloture.

**Memory / Effets durables**
- Aucun `direct_effect` et aucun `executed_tool`.
- Aucun patch Plan applique depuis le chat.
- Cleanup cible OK: scope QA supprime, messages restants dans le scope = 0.

## Verdict Global

- Verdict: green.
- Raison principale: le weekly reste bien un flow parent local, resiste au drift carte, lance un detour Plan seulement sur demande explicite, puis revient au weekly pour cloturer sans mutation durable non autorisee.
- Limite restante: run complementaire a prevoir pour l'ouverture proactive weekly scheduler.
