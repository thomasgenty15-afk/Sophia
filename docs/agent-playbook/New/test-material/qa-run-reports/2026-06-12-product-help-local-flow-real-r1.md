# Product Help Local Flow Real QA R1

## 1. Contexte Du Test

- Date: 2026-06-12
- Run: `product-help-local-flow-20260612-r1`
- Persona: `qa-normal-product-help-local-flow-20260612-r1-1781219601107@example.com`, user temporaire `ff4dd8ef-1a57-41a7-88b7-065aec61f30c`
- Objectif: verifier en conditions reelles locales que le flow `product_help` respecte le nouveau fonctionnement local dispatcher -> reducer -> visible agent, sans legacy ni side effect.
- Trajectoire: question produit, follow-up navigation, demande d'action depuis product_help, abandon de cette action.
- Surfaces visees: dispatcher global d'entree, active flow `product_help`, local dispatcher product_help, handoff `prepare_attack_card`, visible agent, traces, side effects.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide techniquement. Les 4 tours ont retourne `200`, reponses non vides, traces exploitables. Verdict fonctionnel global: red.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** N/A

**User**
> Dans Sophia, je ne comprends pas la différence entre une carte d'attaque et une carte de défense. Tu peux me l'expliquer sans créer quoi que ce soit ?

**Sophia**
> C'est une distinction importante pour bien choisir tes outils. En résumé : la carte d'attaque sert à lancer l'action quand tu as du mal à t'y mettre (elle répond à « comment je commence ? »). La carte de défense, elle, sert à te protéger des pièges ou des impulsions quand tu risques de dévier (elle répond à « que faire si je craque ? »). Est-ce que cette différence t'aide à y voir plus clair ?

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: []
- operation: none
- pending_confirmation: null
- memory_plan: non pertinent au verdict
- executed_tools: []
- durable_effect: aucun
- skill_run: `product_help`, status `continue`, intent `compare_features`
- flow_action: `compare_features`
- visible_task: `compare_features`

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** N/A

**User**
> Oui, et si j'en ai une plus tard, je la retrouve où dans l'app ? Je veux juste le chemin, pas un statut de mes cartes.

**Sophia**
> Tu trouveras tes cartes d'attaque et de défense dans l'onglet **Ressources** de ton Dashboard. Elles y sont classées par niveau. Tu peux aussi en voir un aperçu directement depuis ton **Plan**, sur les missions ou habitudes concernées.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `active_product_help_local_dispatcher`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: null
- memory_plan: non pertinent au verdict
- executed_tools: []
- durable_effect: aucun
- skill_run: `product_help`, status `continue`, intent `where_is_it`
- flow_action: `answer_destination`
- visible_task: `answer_destination`
- blocked_paths: `global_dispatcher`, `global_router` avec `active_local_conversation_skill_owns_turn`

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow; BF-LEDGER-01 - Claim sans commit

**User**
> D'accord. Alors prépare-moi une carte d'attaque pour ranger mes papiers demain matin.

**Sophia**
> C'est entendu, on s'occupe de préparer ta carte d'attaque pour ranger tes papiers demain matin.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `active_product_help_local_dispatcher`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: null
- memory_plan: non pertinent au verdict
- executed_tools: []
- durable_effect: aucun
- skill_run: `product_help`, status `handoff`, intent `tool_action_request`
- flow_action: `exit_to_global_dispatcher`
- visible_task: `exit_ack`
- bridge: `operation_type=prepare_attack_card`, `kind=handoff_needed`, `executable=false`
- note_information_target: `prepare_attack_card`
- state_patch: active product_help cleared, `product_help_exit_memo.target=prepare_attack_card`

**Analyse si yellow/red**
- Symptome: le dispatcher local produit bien un handoff vers `prepare_attack_card`, mais le tour reste visiblement rendu par `product_help`; le dispatcher cible n'est pas execute sur ce tour.
- Symptome visible: Sophia dit "on s'occupe de préparer ta carte", ce qui promet une preparation alors qu'aucun outil, aucun flow cible visible et aucun effet durable ne sont observes.
- Source amont probable: arbitration/handoff runtime apres sortie `exit_to_global_dispatcher`; le handoff note est stocke mais pas consomme immediatement par le dispatcher local cible.
- Owner runtime: handoff runtime entre conversation skills / router, puis visible response guard pour le claim sans commit.
- Meilleure correction selon les guidelines: apres `product_help_exit_to_global_dispatcher`, router directement vers le dispatcher local cible avec `note_information`, ou rendre un vrai `exit_ack` minimal qui ne promet pas l'action.
- Pourquoi ce n'est pas un patch local: le JSON product_help est correct (`exit_to_global_dispatcher`, note cible `prepare_attack_card`); la rupture se produit apres reducer/route handoff.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow; BF-LEDGER-01 - Claim / contenu visible hors contrat

**User**
> Attends non, laisse tomber la carte, on arrête là.

**Sophia**
> Ok, on arrête là. 👌  
> Je ne fais rien de plus côté carte.
>
> <!--fil_rouge: L’utilisateur a demandé d’arrêter la création/la préparation de la carte d’attaque. Rien d’autre n’est ajouté.-->

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: []
- operation: none
- pending_confirmation: null
- memory_plan: non pertinent au verdict
- executed_tools: []
- durable_effect: aucun
- skill_run: null
- blocked_paths: `product_help.local_visible_reply` avec `local_exit_to_global_dispatcher_blocks_local_reply`
- local_flow_exit_handoff: target `prepare_attack_card`, consumed_by `global_dispatcher_second_pass`, final owner `normal_reply`

**Analyse si yellow/red**
- Symptome: la note de handoff `prepare_attack_card` du tour 3 est consommee au tour 4 par `global_dispatcher_second_pass`, mais ne route toujours pas vers le dispatcher cible; le systeme revient en `normal_reply`.
- Symptome visible: commentaire HTML interne `<!--fil_rouge...-->` fuit dans la reponse utilisateur.
- Source amont probable: handoff runtime / second pass global + final response formatting.
- Owner runtime: router/handoff flow arbitration, final response pipeline.
- Meilleure correction selon les guidelines: ne pas consommer une note de handoff local par un second pass global qui finit en `normal_reply`; filtrer les commentaires internes avant sortie visible.
- Pourquoi ce n'est pas un patch local: `product_help` n'est plus owner au tour 4; le probleme est la consommation post-handoff et le formatting visible.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tours 1-2: reponses naturelles, utiles, non mutantes.
- Tour 2: la contrainte "pas un statut" est respectee; Sophia donne un chemin produit sans inventaire DB.

**Problemes**
- Tour 3: Sophia promet une action ("on s'occupe de préparer") alors qu'aucune prise en charge effective par `prepare_attack_card` n'apparait. Famille: BF-LEDGER-01. Impact: l'utilisateur peut croire qu'une carte est en preparation. Severite: red.
- Tour 4: fuite d'un commentaire HTML interne `fil_rouge`. Famille: BF-LEDGER-01 / formatting visible. Impact: experience mecanique et non professionnelle. Severite: red.

**Fix propose**
- Source amont: handoff runtime + final response guard.
- Correction recommandee: garantir que `exit_to_global_dispatcher` soit suivi du dispatcher cible ou d'un ack strictement minimal sans promesse; interdire les commentaires HTML internes dans la sortie finale.
- Tests d'invariant attendus: demande "prepare-moi une carte" depuis `product_help` doit produire `prepare_attack_card` comme prochain owner/handler ou une transition sans claim; toute reponse visible doit etre sans `<!--`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1: correct, `product_help` via `skill_entry_signal`.
- T2: correct, active flow `product_help` owns turn; global dispatcher/router bloques.
- T3: partiellement correct: dispatcher local product_help detecte `exit_to_global_dispatcher` et produit une `note_information` vers `prepare_attack_card`; incorrect ensuite car le dispatcher cible n'est pas execute.
- T4: incorrect: la note de handoff est consommee par `global_dispatcher_second_pass`, mais la sortie finale est `normal_reply`, pas `prepare_attack_card` ni un stop local cible.

**Skills / Operations / Tools**
- Aucun outil durable execute.
- Aucun `direct_effects`.
- Aucun `scheduled_checkins`.
- Pas de pending confirmation.
- T3 aurait du transferer l'ownership vers `prepare_attack_card` ou demander/poser une transition neutre; il reste dans une reponse visible product_help.

**Memory / Effets durables**
- Aucun effet durable observe.
- Cleanup final: `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items` supprimes; `auth.users` supprime. `user_memories` retourne 404 car table absente dans ce local.

**Problemes**
- Tour 3: handoff local non finalise vers target dispatcher. Famille: BF-STATE-01. Impact systeme: note_information produite mais pas executee par le dispatcher cible. Severite: red.
- Tour 3: claim visible sans commit ni flow cible visible. Famille: BF-LEDGER-01. Impact systeme: le final response guard ne neutralise pas la promesse. Severite: red.
- Tour 4: local handoff consomme par global second pass et finit en `normal_reply`; commentaire HTML interne visible. Famille: BF-STATE-01 / BF-LEDGER-01. Severite: red.

**Fix propose**
- Source amont: `handoff_flow_arbitration`, route runtime local handoff, final response pipeline.
- Correction recommandee: brancher `product_help_exit_memo.note_information.target_dispatcher=prepare_attack_card` vers le dispatcher local cible au meme tour ou au tour suivant sans passer par un `normal_reply_default`; bloquer toute phrase de type "on s'occupe" quand `tool_execution=none` et aucun effect/target flow n'a produit de visible task; filtrer les commentaires HTML internes.
- Tests d'invariant attendus:
  - `product_help` + demande operationnelle explicite -> `exit_to_global_dispatcher` avec `note_information` et owner cible `prepare_attack_card`.
  - Aucun claim d'action quand `direct_effects=[]`, `executed_tools=[]`, `tool_execution=none`.
  - Reponse finale ne contient jamais `<!--`.
  - Stop apres handoff annule proprement le flow cible ou repond sans global second pass incoherent.

## Verdict Global

- Verdict: red
- Raison principale: le flow product_help fonctionne bien pour les questions produit simples, mais le handoff operationnel vers `prepare_attack_card` casse l'ownership et produit une promesse visible sans effet ni dispatcher cible.
- Follow-up prioritaire: corriger le runtime de handoff local apres `product_help_exit_to_global_dispatcher`, puis ajouter un guard visible anti-claim sans commit/flow cible.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-12-product-help-local-flow-real-r1-bugs.md`
