# QA Run Report - select-state-potion-arch-r1

## 1. Contexte Du Test

- Date: 2026-06-04
- Run: `select-state-potion-arch-r1`
- Persona: `qa-skill`
- Connexions dediees: `statepotion_select_potion_arch_n1_r1`, `statepotion_select_potion_arch_n2_r1`, `statepotion_select_potion_arch_n3_r1/r2/r3`
- Objectif: valider le nouveau routing `select_state_potion` en IA reelle, avec trois tests de difficulte croissante.
- Trajectoire: potion exacte de clarte + post-handoff, potion inconnue apaisement vs anti-decrochage, puis tentative clarté complexe.
- Surfaces visees: global dispatcher, active flow/local dispatcher, `select_state_potion`, router potion, intake de champs, handoff plateforme, no-mutation.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `include_trace=true`; aucun fallback deterministe utilise pour sauver un verdict.
- Validite QA: N.1 et N.2 valides; N.3 invalide/red technique apres trois tentatives HTTP 502 reproductibles. Les comportements post-handoff difficiles ont ete couverts dans N.1 tours 2-4.

Artefacts bruts:

- `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-04-select-state-potion-arch-n1-r1.summary.json`
- `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-04-select-state-potion-arch-n2-r1.summary.json`
- `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-04-select-state-potion-arch-n3-r1.summary.json`
- `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-04-select-state-potion-arch-n3-r2.summary.json`
- `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-04-select-state-potion-arch-n3-r3.summary.json`

## 2. Tours De Conversation

### N.1 - Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PREF-01` - Preference non appliquee runtime; `BF-INTAKE-02` - Extraction trop large ou polluee, mineur sur renderer

**User**
> Je veux une potion de clarté. Je fais les actions prévues, mais je ne sens plus pourquoi elles comptent pour moi aujourd'hui.

**Sophia**
> Ce que je comprends : Je fais les actions prévues, mais je ne sens plus pourquoi elles comptent pour moi aujourd'hui.
>
> Je te conseille de choisir Potion de clarté. Le shift recommandé est de retrouver un fil simple plutôt que tout résoudre.
>
> Pourquoi cette potion : Tu m'as dit que tu faisais les actions prévues, mais que tu ne sentais plus pourquoi elles comptaient pour toi aujourd'hui.
> Petit pas immédiat : Je comprends que tu te sentes déconnecté de tes actions. C'est un sentiment lourd quand on ne voit plus le sens. Prends un instant pour respirer. Je suis là pour t'aider à retrouver cette clarté.
>
> À mettre dans la plateforme :
> Potion : Potion de clarté
> - Qu'est-ce qui te donne l'impression que ton plan n'a plus de sens pour toi aujourd'hui ? Je fais les actions prévues, mais je ne sens plus pourquoi elles comptent pour moi aujourd'hui.
>
> Dans la plateforme, dans la section État / Potions, puis choisis la potion recommandée, active-la depuis la plateforme si elle te convient.
>
> Je ne lance pas de potion depuis le chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `tool_skill_intent_start`
- safety: none
- direct_effects: none
- operation: `platform_handoff`, status `handoff_delivered`, reason `state_potion_platform_handoff_delivered`
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: no potion/session/reminder/checkin rows created

**Analyse si yellow/red**
- Symptome: bonne potion et bon champ plateforme, mais message encore tres template, avec emoji final.
- Source amont probable: handoff renderer stage-specific.
- Owner runtime: `select_state_potion` renderer.
- Meilleure correction selon les guidelines: contraindre le visible prompt a produire une restitution naturelle sans structure fixe, sans emoji, tout en gardant potion exacte, champs exacts et chemin plateforme.
- Pourquoi ce n'est pas un patch local: la correction doit porter sur le contrat de rendu par stage, pas sur cette phrase.

### N.1 - Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PREF-01` - Preference non appliquee runtime

**User**
> Je vais où pour la lancer ?

**Sophia**
> Tu peux la reprendre dans la plateforme, dans la section État / Potions.
> Choisis : Potion de clarté.
> À renseigner :
> - Qu'est-ce qui te donne l'impression que ton plan n'a plus de sens pour toi aujourd'hui ? Je fais les actions prévues, mais je ne sens plus pourquoi elles comptent pour moi aujourd'hui. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_platform_destination_followup`
- safety: none
- direct_effects: none
- operation: `platform_handoff`, status `repeat_handoff`, reason `state_potion_platform_destination_followup`
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: no potion/session/reminder/checkin rows created

**Analyse si yellow/red**
- Symptome: le follow-up destination est court et ne repete pas la ligne no-mutation, mais ajoute encore un emoji.
- Source amont probable: renderer de follow-up destination.
- Owner runtime: `select_state_potion` renderer.
- Meilleure correction selon les guidelines: appliquer la preference de ton sans emoji au renderer de tous les stages.
- Pourquoi ce n'est pas un patch local: l'invariant doit couvrir `handoff_delivered`, `platform_destination_followup`, `revise_collected_field` et `apply_attempt`.

### N.1 - Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow, mineur sur label; `BF-PREF-01`

**User**
> Reformule le champ comme ça : je fais les actions prévues, mais je ne sens plus pourquoi elles comptent pour moi aujourd'hui.

**Sophia**
> Oui, garde plutôt cette version : elle remplace l’ancienne formulation.
>
> Dans la plateforme, pour Potion de clarté, mets :
>
> Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?
> je fais les actions prévues, mais je ne sens plus pourquoi elles comptent pour moi aujourd'hui. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_revise_handoff`
- safety: none
- direct_effects: none
- operation: `platform_handoff`, status `handoff_delivered`, reason `clarte_revision_applied`
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: no potion/session/reminder/checkin rows created

**Analyse si yellow/red**
- Symptome: la valeur plateforme est bien revisee, mais le label visible/structure change par rapport au premier handoff et l'emoji reste.
- Source amont probable: `revise_collected_field` renderer + conservation des labels canoniques.
- Owner runtime: local dispatcher/reducer de revision et renderer post-revision.
- Meilleure correction selon les guidelines: revision non-mutante par reducer, puis message conversationnel de confirmation qui rend la valeur mise a jour et conserve les champs plateforme exacts.
- Pourquoi ce n'est pas un patch local: il faut un invariant de contrat "revision updates platform value and preserves canonical field identity".

### N.1 - Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PREF-01` - Preference non appliquee runtime

**User**
> Ok lance-la.

**Sophia**
> Je ne peux pas encore lancer de potion depuis le chat :)
>
> Tu peux la créer dans section État / Potions, en choisissant Potion de clarté.
>
> À mettre :
> Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?
> je fais les actions prévues, mais je ne sens plus pourquoi elles comptent pour moi aujourd'hui. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_apply_attempt`
- safety: none
- direct_effects: none
- operation: `platform_handoff`, status `apply_attempt`, reason `clarte_apply_attempt_no_chat_execution`
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: no potion/session/reminder/checkin rows created

**Analyse si yellow/red**
- Symptome: comportement systeme correct pour `apply_attempt`, mais rendu encore avec smiley/emoji et une formulation de chemin imparfaite.
- Source amont probable: renderer `apply_attempt`.
- Owner runtime: `select_state_potion` renderer.
- Meilleure correction selon les guidelines: stage-specific visible prompt court, sans claim d'activation, chemin exact, no-mutation seulement ici.
- Pourquoi ce n'est pas un patch local: l'invariant porte sur le stage `apply_attempt`, pas sur une phrase.

### N.2 - Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-04` - Ambiguite non reconnue/gate de clarification insuffisamment naturelle; `BF-PREF-01`

**User**
> Je crois que j'ai besoin d'une potion, mais je ne sais pas laquelle. Je suis tendu et découragé, j'hésite entre me calmer et retrouver assez d'élan pour ne pas lâcher mon rythme.

**Sophia**
> Laquelle de ces deux potions te parle le plus : la Potion anti-décrochage ou la Potion d'apaisement ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `skill_entry_signal`
- safety: none
- direct_effects: none
- operation: `platform_handoff`, status `clarifying`, reason `state_potion_handoff_clarifying`
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: no potion/session/reminder/checkin rows created

**Analyse si yellow/red**
- Symptome: pas de choix arbitraire et les deux bonnes potions restent en lice, mais la question demande de choisir par nom produit au lieu de distinguer le besoin humain.
- Source amont probable: prompt de clarification entre potions ou visible prompt de routing.
- Owner runtime: potion router + renderer de clarification.
- Meilleure correction selon les guidelines: decision structuree `needs_potion_choice` puis visible task qui pose une seule question par besoin reel, par exemple pression a redescendre vs rythme a raccrocher.
- Pourquoi ce n'est pas un patch local: la correction doit porter sur le contrat `clarification`, pas sur un couple exact de mots.

### N.2 - Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow, trace/action locale ambigue; `BF-PREF-01`

**User**
> Là c'est surtout la pression qui me serre. Je veux redescendre avant de penser à repartir.

**Sophia**
> Tu te sens plutôt comment ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_field_confirmation`
- safety: none
- direct_effects: none
- operation: `platform_handoff`, status `clarifying`, reason `state_potion_handoff_clarifying`
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: no potion/session/reminder/checkin rows created

**Analyse si yellow/red**
- Symptome: la conversation avance vers apaisement, mais la trace locale qualifie la reponse de `field_confirmation` alors qu'il s'agit d'une reponse de clarification/routing.
- Source amont probable: local flow dispatcher ou mapping route_reason.
- Owner runtime: active handoff arbitration / local dispatcher `select_state_potion`.
- Meilleure correction selon les guidelines: normaliser les actions locales structurees pour separer `routing_clarification_answer`, `field_confirmation` et `field_answer`.
- Pourquoi ce n'est pas un patch local: ce sont les contrats de sortie et traces de reducer qui doivent etre corriges.

### N.2 - Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-02` - Extraction trop large ou polluee; `BF-STATE-01`; `BF-PREF-01`

**User**
> Je suis à cran, comme si tout mon corps restait en alerte.

**Sophia**
> Ce que je comprends : la pression ; a_cran
>
> Je te conseille de choisir Potion d'apaisement. Le shift recommandé est de redescendre la pression avant de reprendre.
>
> Pourquoi cette potion : Tu te sens à cran, comme si tout ton corps restait en alerte, et c'est surtout la pression qui te serre.
> Petit pas immédiat : Je comprends que tu te sentes à cran et sous pression. Prends une grande inspiration, même petite. Je suis là pour t'aider à retrouver un peu d'espace.
>
> À mettre dans la plateforme :
> Potion : Potion d'apaisement
> - Qu'est-ce qui te met le plus sous pression la ? la pression
> - Tu te sens plutot comment ? A cran
>
> Dans la plateforme, dans la section État / Potions, puis choisis la potion recommandée, active-la depuis la plateforme si elle te convient.
>
> Je ne lance pas de potion depuis le chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_turn_unclear`
- safety: none
- direct_effects: none
- operation: `platform_handoff`, status `handoff_delivered`, reason `state_potion_platform_handoff_delivered`
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: no potion/session/reminder/checkin rows created

**Analyse si yellow/red**
- Symptome: bonne potion, pas de mauvais label produit, mais `pressure_source` est verrouille sur "la pression", `a_cran` fuite dans le resume visible, et le label contient des fautes.
- Source amont probable: detail intake apaisement + renderer de handoff.
- Owner runtime: sous-skill detail `apaisement`, field reducer, renderer stage handoff.
- Meilleure correction selon les guidelines: extraction opportuniste gardee candidate si le champ source reste trop vague; le champ source doit rester clarifiable ou recevoir une valeur user plus specifique; les enum internes ne doivent pas apparaitre dans `user_state_summary`.
- Pourquoi ce n'est pas un patch local: il faut renforcer le contrat `field_progression` et les regles de projection visible.

### N.3 - Tour 1, tentative 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` - Trace/test incoherent ou suite malsaine

**User**
> Je veux préparer une potion de clarté. Je continue mes blocs de travail, mais je ne sens plus le lien avec la raison pour laquelle j'avais construit ce plan.

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: null
- direct_effects: null
- operation: none
- pending_confirmation: null
- executed_tools: `[]`
- durable_effect: no potion/session/reminder/checkin rows created; only the user message was persisted

**Analyse si yellow/red**
- Symptome: `/test-send-message` retourne "An invalid response was received from the upstream server".
- Source amont probable: endpoint local / gateway IA / runtime test-send-message.
- Owner runtime: local test endpoint and upstream response handling.
- Meilleure correction selon les guidelines: ne pas fallback; garder le tour comme red technique, inspecter logs runtime/upstream, puis rerun.
- Pourquoi ce n'est pas un patch local: le probleme empeche l'observation IA reelle.

### N.3 - Tour 1, tentative 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` - Trace/test incoherent ou suite malsaine

**User**
> Je veux préparer une potion de clarté. Je continue mes blocs de travail, mais je ne sens plus le lien avec la raison pour laquelle j'avais construit ce plan.

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: null
- direct_effects: null
- operation: none
- pending_confirmation: null
- executed_tools: `[]`
- durable_effect: no potion/session/reminder/checkin rows created; only the user message was persisted

**Analyse si yellow/red**
- Symptome: meme 502 sur nouvelle connexion QA.
- Source amont probable: endpoint local / gateway IA / runtime test-send-message.
- Owner runtime: local test endpoint and upstream response handling.
- Meilleure correction selon les guidelines: arreter les contournements et documenter la reproduction.
- Pourquoi ce n'est pas un patch local: le run ne peut pas etre reconstruit apres coup.

### N.3 - Tour 1, tentative 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` - Trace/test incoherent ou suite malsaine

**User**
> Je veux une potion de clarté. Je fais les actions, mais je ne sens plus pourquoi elles comptent.

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: null
- direct_effects: null
- operation: none
- pending_confirmation: null
- executed_tools: `[]`
- durable_effect: no potion/session/reminder/checkin rows created; only the user message was persisted

**Analyse si yellow/red**
- Symptome: 502 reproduit sur une version plus courte du cas clarté.
- Source amont probable: endpoint local / gateway IA / runtime test-send-message.
- Owner runtime: local test endpoint and upstream response handling.
- Meilleure correction selon les guidelines: classer la suite demandee en red technique pour N.3; ne pas remplacer par renderer deterministe.
- Pourquoi ce n'est pas un patch local: la validite QA requiert le chemin IA reel.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le flow ne cree pas et ne lance pas de potion depuis le chat.
- La potion de clarté est selectionnee correctement quand le user exprime une perte de sens du plan.
- L'ambiguite apaisement vs anti-decrochage n'est pas tranchee arbitrairement.
- Le follow-up "ou la lancer ?" est court et ne repete pas inutilement la ligne no-mutation.
- La revision de champ modifie bien la valeur plateforme, pas seulement l'explication.

**Problemes**
- N.1 T1/T4 et N.2 T3: les handoffs restent en format visible tres templatisé. Famille: `BF-PREF-01` / renderer. Impact: Sophia ressemble encore a un formulaire.
- N.1 T1-T4 et N.2 T1-T3: emojis/smileys apparaissent dans tous les stages. Famille: `BF-PREF-01`. Impact: ton non conforme pour ce type de handoff operationnel.
- N.2 T1: clarification par noms produit plutot que par besoin. Famille: `BF-INTAKE-04`. Impact: le user doit choisir comme dans une UI au lieu d'etre accompagne.
- N.2 T3: valeurs visibles polluees par `a_cran` et `la pression`. Famille: `BF-INTAKE-02`. Impact: restitution moins credible et champs plateforme moins utiles.

**Fix propose**
- Source amont: visible prompt stage-specific et contrats `clarification` / `field_progression`.
- Correction recommandee: separer strictement decision structuree et rendu visible, puis tester les stages `routing_clarification`, `handoff_delivered`, `platform_destination_followup`, `revise_collected_field`, `apply_attempt`.
- Tests d'invariant attendus: pas d'emoji; pas de template fixe; une seule question naturelle; labels produit canoniques; enum interne jamais visible; no-mutation seulement quand pertinent.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- N.1 et N.2 utilisent le bon owner: `response_owner=tool_skill`, `selected_handler=select_state_potion`.
- Le global dispatcher ne reprend pas la main pendant le flow actif; les follow-ups post-handoff sont traites par le périmetre `select_state_potion`.
- Warning: N.2 T2 trace `active_handoff_field_confirmation` pour une reponse de clarification routing; N.2 T3 trace `active_handoff_turn_unclear` alors qu'un handoff est finalement livre. Cela pointe vers des actions locales encore trop floues.

**Skills / Operations / Tools**
- `tool_execution=platform_handoff` sur tous les tours valides.
- `executed_tools=[]` sur tous les tours: conforme au contrat platform handoff.
- Aucun token de confirmation executable emis.
- `apply_attempt` est non-mutant et bloque bien l'execution chat.

**Memory / Effets durables**
- Verification durable: N.1 et N.2 n'ont cree aucune ligne `user_potion_sessions`, `user_recurring_reminders` ou `scheduled_checkins`.
- Les tentatives N.3 n'ont cree aucun effet durable; seules les entrées user de test ont ete persistees.

**Problemes**
- N.2 T2/T3: transition locale et trace d'action insuffisamment contractuelles. Famille: `BF-STATE-01`. Impact systeme: les tests d'invariant auront du mal a distinguer confirmation, field answer et clarification answer.
- N.2 T3: champ `pressure_source` trop vague verrouille. Famille: `BF-INTAKE-02`. Impact systeme: la plateforme recoit un champ peu actionnable.
- N.3: trois tentatives HTTP 502. Famille: `BF-TEST-01`. Impact systeme: le troisieme test de difficulte croissante est invalide et bloque le verdict complet de la suite.

**Fix propose**
- Source amont: local flow dispatcher contract, field reducer, detail intake apaisement, local test endpoint/upstream handling.
- Correction recommandee: ajouter des actions locales structurees explicites (`routing_clarification_answer`, `field_answer`, `field_confirmation`, `revise_collected_field`, `apply_attempt`), et gate de suffisance qui garde `pressure_source` candidat si trop generique.
- Tests d'invariant attendus: revision modifie la valeur plateforme; confirmation ne devient pas apply attempt; clarification answer ne devient pas field confirmation; vague field source reste clarifiable; run IA reel N.3 rerun sans 502.

## Verdict Global

- Verdict: red
- Raison principale: N.1/N.2 valident le coeur no-mutation et local flow, mais N.3 est invalide apres trois 502; les runs valides restent yellow cote fluidite/intake.
- Follow-up prioritaire: corriger le renderer stage-specific et la clarification naturelle, puis investiguer le 502 local avant rerun des trois niveaux.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-04-select-state-potion-arch-r1-bugs.md`
