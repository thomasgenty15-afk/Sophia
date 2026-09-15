# QA Run Report - prepare_attack_card local flow real AI R1

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `prepare-attack-card-local-real-r1`
- Persona: `qa-skill`, connexion temporaire `all_skills_prepareattacklocalr1`
- Objectif: verifier en conditions reelles le nouveau flow local `prepare_attack_card`.
- Trajectoire: demande de carte d'attaque libre -> collecte champs -> handoff plateforme -> apply attempt -> destination -> revision -> sortie/changement de sujet.
- Surfaces visees: dispatcher global, active local flow, `prepare_attack_card.local_dispatcher`, reducer local, visible agent, Product Surface Registry, EffectLedger/no mutation.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer deterministe appele comme oracle QA, aucun fallback `processMessage`.
- Validite QA: valide. Run via endpoint local reel, transcript et traces sauvegardes.
- Artefacts:
  - Raw: `tests/real-personas/qa-skill/runs/prepare_attack_card/2026-06-08-prepare-attack-card-local-real-r1.raw.json`
  - Summary: `tests/real-personas/qa-skill/runs/prepare_attack_card/2026-06-08-prepare-attack-card-local-real-r1.summary.json`
  - Durable: `tests/real-personas/qa-skill/runs/prepare_attack_card/2026-06-08-prepare-attack-card-local-real-r1.durable.json`
- Cleanup: connexion temporaire supprimee apres run via `scripts/qa-cleanup-run-connection.sh`; artefacts de run conserves.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J'aimerais preparer une carte d'attaque pour que je ne repousse plus ma seance de mobilite le soir; je negocie toujours en me disant que je la ferai demain.

**Sophia**
> C'est une excellente cible pour une carte. Pour t'aider a arreter de negocier avec toi-meme, je te propose d'utiliser Le texte magique. Est-ce qu'on commence par valider ceci : Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ? (ta seance de mobilite le soir, c'est bien ca ?) 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `prepare_attack_card_local_ask_target`
- safety: low/none observed
- direct_effects: []
- operation: collecting, no platform handoff yet
- pending_confirmation: none
- memory_plan: present in trace
- executed_tools: []
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Oui, exactement: ma seance de mobilite le soir, surtout les jours ou je rentre un peu fatigue.

**Sophia**
> C'est tres clair, la fatigue est souvent le terreau ideal pour ce genre de negociations. Pour completer Le texte magique, dans quel etat d'esprit ou quelle disposition voudrais-tu te retrouver au moment ou tu liras ce texte pour te remettre en mouvement ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `prepare_attack_card_local_ask_target`
- safety: low/none observed
- direct_effects: []
- operation: collecting
- pending_confirmation: none
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Je veux revenir dans un etat simple et decide: je fais dix minutes, sans debat, meme si ce n'est pas parfait.

**Sophia**
> C'est une excellente approche : viser la simplicite plutot que la perfection est souvent le meilleur moyen de briser la resistance. Tout est pret pour que tu puisses configurer ta carte dans la destination Cartes d'attaque avec la technique Le texte magique. Voici les elements a reporter :
>
> Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ? : seance de mobilite le soir
> Quelles excuses ou pensees reviennent quand tu sens que tu glisses ? : je la ferai demain
> Dans quel etat tu veux te remettre en ecrivant ce texte ? : simple et decide (10 min sans debat, meme si imparfait) 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `handoff_ready`
- safety: low/none observed
- direct_effects: []
- operation: `platform_handoff.prepare_attack_card`
- pending_confirmation: none
- executed_tools: []
- durable_effect: `platform_handoff.surface_id=attack_cards`, `committed_effects=[]`

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Ok cree-la maintenant.

**Sophia**
> Je garde la carte d'attaque en cours, mais je n'arrive pas a formuler correctement la reponse visible. Reessaie dans un instant. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `prepare_attack_card_visible_agent_failed`
- safety: low/none observed
- direct_effects: []
- operation: blocked
- pending_confirmation: none
- executed_tools: []
- durable_effect: none, `committed_effects=[]`

**Analyse si yellow/red**
- Symptome: l'apply attempt est correctement non-mutant, mais la reponse visible contractuelle echoue.
- Source amont probable: visible agent / guard `apply_attempt_missing_chat_boundary`.
- Owner runtime: `prepare_attack_card.visible_agent`.
- Meilleure correction selon les guidelines: corriger le contrat visible ou le guard pour accepter une phrase non-mutante explicite et stable; ajouter un test realiste de visible `apply_attempt`.
- Pourquoi ce n'est pas un patch local: le dispatcher et le reducer ont fait le bon travail; la faille est dans la couche visible/validation de contrat.

### Tour 5

**Verdict du tour:** green

**User**
> D'accord. Et je la mets ou dans l'app ?

**Sophia**
> C'est dans la section Cartes d'attaque que tu peux la configurer. Voici les elements a reporter pour ta technique Le texte magique :
>
> Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ? : seance de mobilite le soir
> Quelles excuses ou pensees reviennent quand tu sens que tu glisses ? : je la ferai demain
> Dans quel etat tu veux te remettre en ecrivant ce texte ? : simple et decide (10 min sans debat, meme si imparfait) 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `destination_short`
- safety: low/none observed
- direct_effects: []
- operation: `platform_handoff.prepare_attack_card`
- pending_confirmation: none
- executed_tools: []
- durable_effect: `platform_handoff.surface_id=attack_cards`, `committed_effects=[]`

### Tour 6

**Verdict du tour:** green

**User**
> Change le dernier champ: mets plutot 'calme mais ferme, je lance juste le tapis et je commence'.

**Sophia**
> C'est entendu, j'ai mis a jour ce dernier point. Voici donc le recapitulatif final pour configurer ta carte dans la destination Cartes d'attaque avec la technique Le texte magique :
>
> Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ? : seance de mobilite le soir
> Quelles excuses ou pensees reviennent quand tu sens que tu glisses ? : je la ferai demain
> Dans quel etat tu veux te remettre en ecrivant ce texte ? : calme mais ferme, je lance juste le tapis et je commence 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `handoff_ready`
- safety: low/none observed
- direct_effects: []
- operation: `platform_handoff.prepare_attack_card`
- pending_confirmation: none
- executed_tools: []
- durable_effect: `platform_handoff.surface_id=attack_cards`, `committed_effects=[]`

### Tour 7

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-02 - Ancien flow capture une nouvelle intention

**User**
> Laisse tomber la carte pour maintenant, aide-moi plutot a prioriser ce que je fais ce soir.

**Sophia**
> Je garde la carte d'attaque en cours, mais je n'arrive pas a traiter correctement ce tour. Reessaie dans un instant. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_runtime_null`
- safety: low/none observed
- direct_effects: []
- operation: local runtime null
- pending_confirmation: none
- executed_tools: []
- durable_effect: none, `committed_effects=[]`

**Analyse si yellow/red**
- Symptome: la demande explicite de sortie/priorisation ne sort pas vers le global dispatcher et finit en blocage technique.
- Source amont probable: integration active-flow `run.ts` / selection route locale `maybeRunPrepareAttackCardOperation` apres handoff actif.
- Owner runtime: `router/run.ts` + `prepare_attack_card/router.ts`.
- Meilleure correction selon les guidelines: garantir que `exit_to_global_dispatcher` produit un runtime non-null jusqu'a la branche de reroute globale, ou que l'etat actif ne bloque pas une intention nouvelle explicite.
- Pourquoi ce n'est pas un patch local: ce n'est pas une phrase a detecter; c'est la frontiere active-flow -> local dispatcher -> global dispatcher qui ne respecte pas le contrat de sortie.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Les tours 1-3 sont naturels et utiles: Sophia comprend la cible, propose une technique pertinente, collecte les champs et livre une reprise plateforme claire.
- Le tour 5 repond correctement a la destination produit.
- Le tour 6 remplace bien la valeur corrigee et redonne un recap exploitable.

**Problemes**
- Tour 4: l'utilisateur demande "cree-la"; Sophia ne cree rien, mais repond par une erreur technique visible. Famille: BF-STATE-01. Impact: experience cassante sur un invariant central. Severite: red.
- Tour 7: l'utilisateur sort du flow et demande de prioriser; Sophia reste bloquee dans la carte et renvoie une erreur technique. Famille: BF-ROUTE-02. Impact: l'utilisateur ne peut pas changer naturellement de sujet. Severite: red.

**Fix propose**
- Source amont: visible agent apply_attempt + integration active flow exit.
- Correction recommandee: renforcer le contrat visible `apply_attempt` avec un fallback non-mutant localement valide, et corriger la branche active `prepare_attack_card` pour que `exit_to_global_dispatcher` reroute effectivement le meme message au dispatcher global.
- Tests d'invariant attendus: apply attempt visible avec phrase "depuis le chat"; active flow exit vers priorisation; anti-faux-positif "ou je la mets ?" reste dans le flow.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tours 1-6: `selected_handler=prepare_attack_card`, `response_owner=tool_skill`, conforme.
- Tour 7: l'active flow garde l'owner `prepare_attack_card`, mais le runtime local ne produit pas de sortie exploitable. Le dispatcher global ne reprend pas.

**Skills / Operations / Tools**
- Le local dispatcher et le reducer fonctionnent pour collecte, handoff, destination et revision.
- `apply_attempt` est bien non-mutant, mais l'agent visible echoue son guard.
- Aucun appel executor observe.

**Memory / Effets durables**
- `executed_tools=[]` sur tous les tours.
- `committed_effects=[]` sur tous les tours.
- Durable DB final: `user_attack_cards=[]`.
- Les handoffs valides portent `operation_type=prepare_attack_card`, `surface_id=attack_cards`, `no_chat_mutation=true`.

**Problemes**
- Tour 4: visible agent contract failure sur `apply_attempt_missing_chat_boundary`. Famille: BF-STATE-01. Impact systeme: un apply_attempt attendu devient `blocked` sans `platform_handoff`. Severite: red.
- Tour 7: `active_prepare_attack_card_local_runtime_null` au lieu de sortie globale. Famille: BF-ROUTE-02. Impact systeme: interruption explicite non restauree. Severite: red.

**Fix propose**
- Source amont: `prepare_attack_card/visible_agent.ts`, `prepare_attack_card/router.ts`, branche active locale dans `router/run.ts`.
- Correction recommandee: rendre le visible guard apply_attempt compatible avec les formulations non-mutantes generees, puis assurer un runtime de sortie non-null et une reroute globale testee.
- Tests d'invariant attendus: un test endpoint/local full-AI ou integration injectee qui couvre apply attempt apres handoff, sortie vers priorisation, destination qui reste locale, et DB proof sans carte creee.

## Verdict Global

- Verdict: red
- Raison principale: le handoff local fonctionne et ne mute pas la DB, mais deux invariants conversationnels critiques echouent en conditions reelles: `apply_attempt` visible et sortie vers global dispatcher.
- Follow-up prioritaire: corriger `apply_attempt` visible, puis la sortie active-flow `exit_to_global_dispatcher`; rerun QA sur la meme trajectoire.
