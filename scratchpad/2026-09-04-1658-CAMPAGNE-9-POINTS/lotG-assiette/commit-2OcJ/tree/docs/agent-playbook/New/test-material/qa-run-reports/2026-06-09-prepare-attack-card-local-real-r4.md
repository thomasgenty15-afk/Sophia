# QA Run - prepare_attack_card local dispatcher r4

## 1. Contexte Du Test

- Date: 2026-06-09
- Run: `prepare_attack_card_local_real_r4`
- Persona: `qa-skill`, connexion temporaire `all_skills_prepare_attack_local_20260609_r4`
- Objectif: verifier en conditions reelles que les modifications recentes du prompt dispatcher local `prepare_attack_card` fonctionnent sur un debut de flow carte d'attaque.
- Trajectoire: demande explicite de carte d'attaque avec cible et piege deja fournis, puis attente d'un choix/proposition de technique.
- Surfaces visees: routing global vers tool skill, dispatcher local `prepare_attack_card`, reducer local, agent visible stage-specific, EffectLedger, no-mutation DB.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas de fallback direct `processMessage`.
- Validite QA: valide. Le tour a produit une vraie reponse Sophia via le chemin IA local (`ok=true`, pas d'abort, reponse non vide).

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-03` - Draft lifecycle casse

**User**
> Je veux préparer une carte d’attaque pour arrêter de négocier mes vingt minutes de dossier administratif le soir. Mon piège, c’est que je commence à trier mes notes au lieu d’ouvrir le dossier.

**Sophia**
> Je garde la carte d'attaque en cours, mais je n'arrive pas a formuler correctement la reponse visible.

**Trace courte**
- http_status: non capture dans le wrapper, mais payload `ok=true`
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: risk score `0`, risk band `none`, `safety_preempt=false`
- direct_effects: `[]`
- operation: `prepare_attack_card`
- pending_confirmation: none observe
- memory_plan: targeted/light dans le `turn_frame`, non utilise pour route
- executed_tools: `[]`
- durable_effect: `blocked_effects=[visible_agent: prepare_attack_card_visible_agent_failed]`, `committed_effects=[]`
- local dispatcher trace: `global_dispatcher_skipped`, `note_information_consumed`, `local_dispatcher start`, `local_dispatcher decision`, `reducer reduced`, `visible_stage start`
- dispatcher decision: `flow_action=choose_technique`, `stage=ask_or_confirm_technique`, `visible_task_kind=ask_or_confirm_technique`, `target_status=locked`, `blocker_status=locked`
- visible agent guard: attempt 1 rejected `wrong_technique_label`, attempt 2 rejected `wrong_technique_label`
- DB check: `user_attack_cards` count for the QA user = `0`

**Analyse si yellow/red**
- Symptome: le flow local demarre correctement, mais l'utilisateur recoit un message d'erreur au lieu d'une question/proposition de technique.
- Source amont probable: contrat prompt visible ou garde `wrong_technique_label` trop fragile sur le stage `ask_or_confirm_technique`.
- Owner runtime: `prepare_attack_card` local visible stage / validation guard.
- Meilleure correction selon les guidelines: aligner le contexte donne au visible agent et le validateur des labels techniques pour que l'agent puisse citer uniquement les labels autorises sans etre rejete a tort. La correction doit rester au niveau du contrat visible/guard, sans regex metier ni renderer deterministe.
- Pourquoi ce n'est pas un patch local: le dispatcher et le reducer ont produit une decision structuree coherente; le blocage survient dans la continuation visible du flow, donc il faut corriger le contrat stage-specific ou son garde d'acceptation, pas fabriquer une phrase de secours.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Sophia ne pretend pas avoir cree la carte.
- Le flow garde la frontiere no-mutation: aucun outil execute, aucun effet commit, aucune carte creee.

**Problemes**
- Tour 1: experience bloquante. Sophia annonce qu'elle garde la carte en cours mais ne peut pas formuler la reponse visible. Famille: `BF-STATE-03`. Impact: l'utilisateur ne peut pas continuer naturellement le flow. Severite: red.

**Fix propose**
- Source amont: stage visible `ask_or_confirm_technique` et guard `wrong_technique_label`.
- Correction recommandee: fournir au prompt visible la liste canonique exacte des techniques et labels autorises dans `conversation_context`, puis ajuster le guard pour valider contre ces labels canoniques sans rejeter une sortie conforme.
- Tests d'invariant attendus: le stage `ask_or_confirm_technique` doit produire une reponse visible acceptee avec les six labels exacts, sans platform steps prematurees, sans creation claim, sans renderer deterministe.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Le routage initial est correct: le global dispatcher selectionne `prepare_attack_card` pour une demande explicite de carte d'attaque.
- Le flow actif respecte l'invariant local: la trace contient `global_dispatcher_skipped` et `selected_handler=prepare_attack_card`.
- La `note_information` initiale est presente et consommee par le dispatcher local.

**Skills / Operations / Tools**
- Le dispatcher local a locke la cible et le piege, puis a choisi le stage attendu `ask_or_confirm_technique`.
- Le reducer a conserve cette decision sans mutation DB.
- L'agent visible a echoue deux fois sur `wrong_technique_label`, ce qui bloque le runtime avec `prepare_attack_card_visible_agent_failed`.
- `executed_tools=[]`, `requested_effects=[]`, `allowed_effects=[]`, `committed_effects=[]`.

**Memory / Effets durables**
- `memory_used_for_route=false`.
- Aucun effet durable n'a ete commit.
- Verification DB locale: aucune entree `user_attack_cards` pour l'utilisateur QA temporaire.

**Problemes**
- Tour 1: la continuite locale est cassee entre reducer et visible agent. Famille: `BF-STATE-03`. Impact systeme: flow actif inutilisable des le premier stage visible de choix technique. Severite: red.

**Fix propose**
- Source amont: `prepare_attack_card.visible.ask_or_confirm_technique` / guard de validation des labels techniques.
- Correction recommandee: rendre le contrat visible auto-suffisant avec labels canoniques exacts, puis renforcer le retry guard pour renvoyer l'erreur avec les labels acceptes sans changer le contenu metier.
- Tests d'invariant attendus: test IA reel ou integration qui couvre une demande avec cible + piege fournis, verifie `visible_stage complete`, absence de `wrong_technique_label`, `selected_handler=prepare_attack_card`, `executed_tools=[]`, `committed_effects=[]`.

## Verdict Global

- Verdict: red
- Raison principale: le flow local route et reduit correctement, mais l'agent visible `ask_or_confirm_technique` est rejete deux fois par le guard `wrong_technique_label`, ce qui bloque la conversation au premier tour.
- Follow-up prioritaire: corriger le contrat visible/guard des labels techniques pour que le stage de choix technique rende une reponse acceptee sans renderer deterministe ni mutation.
