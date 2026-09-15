# QA Run Report - Clarte Real R2

## 1. Contexte Du Test

- Date: 2026-06-05
- Run: `clarte-real-r2`
- Persona: user QA temporaire local, `qa-clarte-real-1780668380642@example.com`, `user_id=42abcf49-0926-4ac6-a2b1-8f10dea5b90d`.
- Objectif: verifier en IA reelle le nombre de tours necessaires pour stabiliser la Potion de clarté apres demande explicite ou entree via le router `select_state_potion`.
- Trajectoire: trois variantes conversationnelles pilotees tour par tour: demande explicite claire, demande explicite vague puis clarification, demande de potion non precisee avec besoin de sens/pourquoi profond.
- Surfaces visees: global dispatcher, `select_state_potion`, router potion general, sous-flow clarté, visible agent stage-specific, handoff plateforme, no-chat-mutation, EffectLedger.
- Cadre IA reel: Supabase local, endpoint `http://127.0.0.1:54321/functions/v1/test-send-message`, `force_full_ai=true`, pas de staging/remote/deploy, pas de renderer deterministe, pas de fallback `processMessage`.
- Validite QA: valide. Tous les tours conversationnels sont HTTP 200, non vides, non aborted, avec traces courtes et raw JSON. L'init runner a d'abord echoue sous sandbox sur `supabase status`; il a ete relance via l'approbation runner, avant conversation exploitable. Nettoyage cible effectue en fin de run: suppression des `chat_messages`, `user_chat_states` et du user Auth temporaire.
- Artefacts: `tests/real-personas/qa-skill/runs/state_potion/2026-06-05-clarte-real-r2.raw.json`, `tests/real-personas/qa-skill/runs/state_potion/2026-06-05-clarte-real-r2.summary.json`, `tests/real-personas/qa-skill/runs/state_potion/2026-06-05-clarte-real-r2.meta.json`.

## 2. Tours De Conversation

### Scenario N1 - Tour 1

**Verdict du tour:** green

**User**
> Je veux faire une Potion de clarté. En ce moment j'avance dans mon plan, mais tout est devenu mécanique: je ne retrouve plus le lien avec ce que ça devait construire pour moi.

**Sophia**
> Tu dis que tu ne retrouves plus le lien avec ce que ton plan devait construire pour toi. Qu'est-ce qui a pu provoquer cette déconnexion, selon toi ? 🙂

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: `[]`
- operation: `select_state_potion`
- pending_confirmation: `null`
- memory_plan: `present`
- executed_tools: `[]`
- durable_effect: aucun commit, `committed=0`
- tool_execution: `platform_handoff`
- tool_status: `clarifying`
- tool_reason_code: `clarte_field_missing`
- effect_ledger: `proposed=1`, `delivered=1`, `committed=0`
- stable_clarte_handoff: `false`

**Analyse**
- Le message indique bien une perte de lien avec le plan, mais la formulation reste encore assez large: "ce que ça devait construire pour moi" ne dit pas clairement ce qui doit etre repris dans le champ plateforme.
- La question supplementaire est donc acceptable ici. Elle reste dans le sous-flow clarté, ne route pas vers une autre potion et demande une precision utile avant le handoff.

### Scenario N1 - Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-LEDGER-01` - Claim sans commit

**User**
> C'est surtout que je fais les tâches du plan, mais je ne sens plus pourquoi elles comptent ni quelle transformation elles servent.

**Sophia**
> D'accord, je comprends mieux ce qui te pèse. La Potion de clarté est tout indiquée pour t'aider à retrouver le sens de tes actions et le lien avec ce que tu construis. Pour la mettre en place, tu pourras te rendre dans la section État / Potions sur la plateforme. Le détail que tu as partagé, « Je fais les tâches du plan, mais je ne sens plus pourquoi elles comptent ni quelle transformation elles servent. », sera enregistré pour la question « Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ? ». 🙂

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_field_confirmation`
- safety: `low`
- direct_effects: `[]`
- operation: `select_state_potion`
- pending_confirmation: `null`
- memory_plan: `present`
- executed_tools: `[]`
- durable_effect: aucun commit, `committed=0`, `blocked=1`
- tool_execution: `platform_handoff`
- tool_status: `handoff_delivered`
- tool_reason_code: `clarte_handoff_delivered`
- potion_type: `clarte`
- field_value: `Je fais les tâches du plan, mais je ne sens plus pourquoi elles comptent ni quelle transformation elles servent.`
- stable_clarte_handoff: `true`

**Analyse si yellow/red**
- Symptome: la potion est stabilisee en deux tours, mais la phrase "sera enregistré" suggere un enregistrement automatique alors que le chat ne cree ni ne persiste la potion.
- Source amont probable: guard visible no-mutation trop permissif sur les formulations futures passives comme "sera enregistré".
- Owner runtime: visible agent / final response guard no-mutation.
- Meilleure correction selon les guidelines: renforcer le contrat visible pour n'autoriser que "tu peux mettre", "il faudra renseigner", "a recopier" quand `committed=0`.
- Pourquoi ce n'est pas un patch local: il faut aligner le lexique autorise avec l'EffectLedger, pas remplacer une phrase exacte.

### Scenario N2 - Tour 1

**Verdict du tour:** green

**User**
> J'ai besoin d'une Potion de clarté, mais je n'arrive pas à expliquer: tout est confus et je me sens à côté de mon plan.

**Sophia**
> Je comprends que tu te sentes à côté de ton plan en ce moment. Qu'est-ce qui te donne l'impression que ce plan n'a plus de sens pour toi aujourd'hui ? 🙂

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: `[]`
- operation: `select_state_potion`
- pending_confirmation: `null`
- memory_plan: `present`
- executed_tools: `[]`
- durable_effect: aucun commit, `committed=0`
- tool_execution: `platform_handoff`
- tool_status: `clarifying`
- tool_reason_code: `clarte_field_missing`
- effect_ledger: `proposed=1`, `delivered=1`, `committed=0`
- stable_clarte_handoff: `false`

### Scenario N2 - Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - Mauvais owner selectionne

**User**
> Quand je regarde mes actions, j'ai l'impression de cocher des cases pour rester occupé, pas de nourrir ce qui compte vraiment pour moi.

**Sophia**
> Tu veux modifier la recommandation en cours, ou passer à une nouvelle demande ? 🙂

**Trace courte**
- http_status: `200`
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `active_handoff_turn_unclear`
- safety: `low`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- memory_plan: `present`
- executed_tools: `[]`
- durable_effect: aucun commit, `committed=0`
- tool_execution: `none`
- tool_status: `null`
- tool_reason_code: `null`
- effect_ledger: `asked=1`, `proposed=1`, `delivered=0`
- stable_clarte_handoff: `false`

**Analyse si yellow/red**
- Symptome: le user repond exactement a la question du champ clarté, mais le tour sort vers `orientation_clarification`.
- Source amont probable: active flow arbitration / continuation policy. Une reponse au champ actif est classee comme ambiguite d'orientation au lieu de retourner a `select_state_potion`.
- Owner runtime: dispatcher actif global, avant le reducer local clarté.
- Meilleure correction selon les guidelines: donner priorite a l'active handoff field continuation quand le dernier tour a `tool_status=clarifying` et un `field_id` attendu.
- Pourquoi ce n'est pas un patch local: le visible agent ne peut pas corriger un mauvais owner; il faut corriger l'arbitrage structure.

### Scenario N2 - Tour 3

**Verdict du tour:** green

**User**
> Je réponds à la question de la Potion de clarté: mon plan n'a plus de sens parce que je coche des cases au lieu de sentir que mes actions nourrissent ce qui compte vraiment.

**Sophia**
> D'accord, je comprends mieux. Pour t'aider à retrouver du sens, nous allons préparer une Potion de clarté. Tu la trouveras dans État / Potions. Pour le champ "Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?", il faudra renseigner : "Mon plan n'a plus de sens parce que je coche des cases au lieu de sentir que mes actions nourrissent ce qui compte vraiment." 🙂

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_field_confirmation`
- safety: `low`
- direct_effects: `[]`
- operation: `select_state_potion`
- pending_confirmation: `null`
- memory_plan: `present`
- executed_tools: `[]`
- durable_effect: aucun commit, `committed=0`
- tool_execution: `platform_handoff`
- tool_status: `handoff_delivered`
- tool_reason_code: `clarte_handoff_delivered`
- potion_type: `clarte`
- field_value: `Mon plan n'a plus de sens parce que je coche des cases au lieu de sentir que mes actions nourrissent ce qui compte vraiment.`
- stable_clarte_handoff: `true`

### Scenario N2 - Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow

**User**
> Ok, je la trouve où dans la plateforme ?

**Sophia**
> Elle est dans État / Potions 🙂  
> Ouvre cette section, puis cherche “Potion de clarté”.
>
> Tu la vois déjà dans la liste, oui ou non ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_platform_destination_followup`
- safety: `low`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- memory_plan: `present`
- executed_tools: `[]`
- durable_effect: aucun commit, `committed=0`
- tool_execution: `none`
- tool_status: `null`
- tool_reason_code: `active_handoff_platform_destination_followup`
- effect_ledger: `proposed=1`, `delivered=0`
- stable_clarte_handoff: `false`

**Analyse si yellow/red**
- Symptome: la destination est donnee correctement, mais Sophia ajoute une nouvelle question oui/non non demandee.
- Source amont probable: contrat visible de stage destination / continuation state. Le stage "destination followup" ne contraint pas assez le message a rester court et terminal.
- Owner runtime: visible agent stage-specific pour `platform_destination_followup`.
- Meilleure correction selon les guidelines: renforcer le prompt/contrat de destination pour interdire de creer une nouvelle demande de confirmation ou un nouveau micro-flow si le user demande seulement le chemin.
- Pourquoi ce n'est pas un patch local: il faut corriger le contrat de stage, pas supprimer une phrase exacte.

### Scenario N2 - Tour 5

**Verdict du tour:** green

**User**
> Ok alors lance-la depuis le chat.

**Sophia**
> Je ne peux pas lancer la Potion de clarté directement depuis le chat. Pour l'activer, il faut te rendre dans État / Potions sur la plateforme. Tu y trouveras la Potion de clarté et tu pourras renseigner pour le champ "Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?" : "Mon plan n'a plus de sens parce que je coche des cases au lieu de sentir que mes actions nourrissent ce qui compte vraiment." 🙂

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_turn_unclear`
- safety: `none`
- direct_effects: `[]`
- operation: `select_state_potion`
- pending_confirmation: `null`
- memory_plan: `present`
- executed_tools: `[]`
- durable_effect: aucun commit, `committed=0`
- tool_execution: `platform_handoff`
- tool_status: `apply_attempt`
- tool_reason_code: `clarte_apply_attempt_no_chat_execution`
- effect_ledger: `asked=1`, `proposed=1`, `delivered=1`, `committed=0`
- potion_type: `clarte`
- field_value: `Mon plan n'a plus de sens parce que je coche des cases au lieu de sentir que mes actions nourrissent ce qui compte vraiment.`
- has_apply_claim: `false`

### Scenario N3 - Tour 1

**Verdict du tour:** green

**User**
> Je veux une potion mais je ne sais pas laquelle. Je ne suis pas spécialement stressé; c'est plutôt que mes actions avancent sans que je voie encore le pourquoi derrière.

**Sophia**
> Est-ce que tu as l'impression de manquer de sens ou de direction claire dans tes actions, ou plutôt que tu es en train de perdre ton élan et de glisser sans t'en rendre compte ? 🙂

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: `[]`
- operation: `select_state_potion`
- pending_confirmation: `null`
- memory_plan: `present`
- executed_tools: `[]`
- durable_effect: aucun commit, `committed=0`
- tool_execution: `platform_handoff`
- tool_status: `clarifying`
- tool_reason_code: `state_potion_handoff_clarifying`
- stable_clarte_handoff: `false`

### Scenario N3 - Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-LEDGER-01` - Claim sans commit

**User**
> C'est clairement un manque de sens: je fais avancer les choses, mais je ne sens plus le lien entre ces actions et mon pourquoi profond.

**Sophia**
> Pour t'aider à retrouver ce lien, la Potion de clarté semble tout indiquée. Elle est conçue pour les moments où l'on fait avancer les choses sans sentir le pourquoi profond derrière, comme tu le décris. Tu la retrouveras dans la section État / Potions. Le champ 'Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?' sera déjà rempli avec 'Je fais avancer les choses, mais je ne sens plus le lien entre ces actions et mon pourquoi profond.'. 🙂

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `same_operation_signal_continues_active_handoff`
- safety: `low`
- direct_effects: `[]`
- operation: `select_state_potion`
- pending_confirmation: `null`
- memory_plan: `present`
- executed_tools: `[]`
- durable_effect: aucun commit, `committed=0`
- tool_execution: `platform_handoff`
- tool_status: `handoff_delivered`
- tool_reason_code: `clarte_handoff_delivered`
- potion_type: `clarte`
- field_value: `Je fais avancer les choses, mais je ne sens plus le lien entre ces actions et mon pourquoi profond.`
- stable_clarte_handoff: `true`

**Analyse si yellow/red**
- Symptome: la stabilisation clarté fonctionne en deux tours, mais "sera déjà rempli" implique un pre-remplissage automatique absent.
- Source amont probable: meme faille no-mutation que N1 T2, cote visible agent/guard.
- Owner runtime: visible agent / final response guard no-mutation.
- Meilleure correction selon les guidelines: interdire les formulations qui attribuent a la plateforme une action deja faite quand `committed=0`, `executed_tools=[]` et `tool_execution=platform_handoff`.
- Pourquoi ce n'est pas un patch local: le critere doit venir du ledger et du contrat visible, pas d'un remplacement textuel ponctuel.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Les blocs legacy fixes ne reapparaissent pas: pas de "Ce que je comprends", "Je te conseille", "Pourquoi cette potion", "Petit pas immediat".
- Les noms produit restent corrects: `Potion de clarté`; pas de potion de reparation, rappel, sens ou clarification.
- Les demandes d'activation depuis le chat sont refusees sans claim d'execution, avec chemin plateforme.
- Les questions visibles sont plus naturelles qu'avant et le router general formule une question de besoin en N3 T1 au lieu de demander seulement un choix de noms produit.
- N1 T1 montre une clarification acceptable: le user demande bien clarté, mais la raison n'est pas encore assez directement recopiable dans le champ plateforme.

**Problemes**
- N2 T2: la reponse au champ actif est sortie vers `orientation_clarification`. Famille: `BF-ROUTE-01`. Impact: experience confuse; le user doit parler comme un test pour revenir au flow. Severite: red.
- N1 T2 et N3 T2: formulations "sera enregistré" / "sera déjà rempli". Famille: `BF-LEDGER-01`. Impact: ambiguite produit sur ce que le chat a fait. Severite: yellow.
- N2 T4: la reponse destination ajoute une question non demandee. Famille: `BF-STATE-01`. Impact: petite friction et nouveau tour inutile. Severite: yellow.

**Fix propose**
- Source amont: active flow arbitration, sous-flow clarté intake/reducer, visible agent no-mutation guard, contrat du stage destination.
- Correction recommandee: prioriser l'active field continuation apres une clarification clarté et contraindre les visibles handoff/destination par le ledger sans fallback deterministe.
- Tests d'invariant attendus: clear answer locks T1; vague answer stays missing; field answer after clarté question remains in `select_state_potion`; apply_attempt committed=0 and no activation claim; destination followup short and terminal; visible handoff uses "tu peux mettre/il faudra renseigner", never "sera enregistré/deja rempli" when no commit exists.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- `select_state_potion` est bien choisi sur N1 T1, N1 T2, N2 T1, N2 T3, N2 T4, N2 T5, N3 T1 et N3 T2.
- N2 T2 est le mauvais owner: `orientation_clarification` prend la main alors que le dernier tour Sophia avait ouvert le champ clarté. C'est bloquant pour le sous-skill.
- N3 T1 respecte le principe du router general: quand le user dit ne pas savoir quelle potion prendre, Sophia clarifie entre besoins possibles avant de selectionner clarté.

**Skills / Operations / Tools**
- `executed_tools=[]` sur tous les tours.
- Les handoffs stabilises utilisent `tool_execution=platform_handoff`, `tool_status=handoff_delivered`, `potion_type=clarte`, le champ exact `plan_meaning_loss_reason` et la destination `État / Potions`.
- L'apply attempt est identifie par `tool_status=apply_attempt` et `tool_reason_code=clarte_apply_attempt_no_chat_execution`.

**Memory / Effets durables**
- Aucun effet durable n'a ete commit: `committed=0` sur tous les tours.
- Le nettoyage cible du run est termine: `chat_messages=204`, `user_chat_states=204`, suppression Auth `200`.
- Le probleme n'est pas une mutation reelle, mais une ambiguite visible: N1 T2 et N3 T2 parlent comme si une valeur etait enregistree ou deja remplie.

**Problemes**
- N2 T2: active flow continuation perdue. Famille: `BF-ROUTE-01`. Impact systeme: mauvais owner, pas d'operation, pas de field update. Severite: red.
- N1 T2/N3 T2: claim de persistance sans commit. Famille: `BF-LEDGER-01`. Impact systeme: divergence final response / ledger. Severite: yellow.
- N2 T4: stage destination genere une suite non demandee. Famille: `BF-STATE-01`. Impact systeme: le followup n'est pas terminal. Severite: yellow.

**Fix propose**
- Source amont: `select_state_potion` active handoff policy + clarté local reducer + visible agent guard.
- Correction recommandee: corriger l'arbitrage et l'intake au niveau des contrats JSON structurés, puis renforcer le guard no-mutation par classes semantiques de claim quand `committed=0`.
- Tests d'invariant attendus: unitaires dispatcher local, reducer field state et visible guard; integration locale `test-send-message` sur N1/N2/N3; assertion trace `response_owner=tool_skill` apres question de champ; assertion texte sans "sera enregistré", "sera déjà rempli", "activé", "lancé" hors effet durable.

## Verdict Global

**Red.** Le deuxieme passage a bien supprime la rigidite visible principale et aucun effet durable interdit n'est observe, mais le sous-flow clarté n'est pas encore stabilise: une reponse au champ actif peut sortir vers `orientation_clarification`, et le visible peut encore suggerer une persistance inexistante.
