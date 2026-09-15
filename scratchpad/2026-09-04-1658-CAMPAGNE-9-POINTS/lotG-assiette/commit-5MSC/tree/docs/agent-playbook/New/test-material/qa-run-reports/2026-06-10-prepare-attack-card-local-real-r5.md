# QA Run - prepare_attack_card local dispatcher r5

## 1. Contexte Du Test

- Date: 2026-06-10
- Run: `prepare_attack_card_local_real_r5`
- Persona: `qa-skill`, connexion temporaire `all_skills_prepare_attack_local_20260610_r5`
- Objectif: verifier en conditions reelles, sur plusieurs tours, que la correction du guard `wrong_technique_label` permet au flow local `prepare_attack_card` d'aller jusqu'au handoff.
- Trajectoire: demande explicite de carte d'attaque avec cible et piege, choix de technique, remplissage des champs `texte_recadrage`, handoff, tentative de creation, demande de destination, sortie vers priorisation.
- Surfaces visees: dispatcher global d'entree, dispatcher local `prepare_attack_card`, reducer local, agent visible stage-specific, active flow, EffectLedger, no-mutation DB, sortie vers un autre tool skill.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `include_trace=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide. Les 9 tours ont produit des reponses Sophia reelles via le endpoint local; les messages user ont ete choisis tour par tour apres lecture des reponses et traces.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-03` - Draft lifecycle casse

**User**
> Je veux préparer une carte d’attaque pour arrêter de négocier mes vingt minutes de dossier administratif le soir. Mon piège, c’est que je commence à trier mes notes au lieu d’ouvrir le dossier.

**Sophia**
> Je garde la carte d'attaque en cours, mais je n'arrive pas a formuler correctement la reponse visible.

**Trace courte**
- http_status: payload `ok=true`, `aborted=false`, reponse non vide
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: risk score `0`, pas de safety preempt observee
- direct_effects: `[]`
- operation: `prepare_attack_card`
- pending_confirmation: none
- memory_plan: non pertinent pour le verdict
- executed_tools: `[]`
- durable_effect: `blocked_effects=[visible_agent: prepare_attack_card_visible_agent_failed]`, `committed_effects=[]`
- local decision: `flow_action=confirm_technique_proposal`, `stage=ask_or_confirm_technique`, `visible_task=ask_or_confirm_technique`
- visible guard: attempts 1 et 2 rejetes avec `premature_platform_handoff:Cartes d'attaque` et `premature_platform_handoff:Cartes d’attaque`

**Analyse si yellow/red**
- Symptome: le bug `wrong_technique_label` ne reapparait pas, mais le stage visible de choix technique echoue encore parce que l'agent mentionne la destination plateforme trop tot.
- Source amont probable: prompt visible `ask_or_confirm_technique` ou guard `premature_platform_handoff` insuffisamment aligne avec le contexte donne au modele.
- Owner runtime: `prepare_attack_card.visible.ask_or_confirm_technique`.
- Meilleure correction selon les guidelines: rendre le prompt de retry plus explicite sur l'interdiction de mentionner `Cartes d'attaque` dans les stages d'intake, ou retirer toute destination plateforme du contexte visible de ce stage.
- Pourquoi ce n'est pas un patch local: le dispatcher/reducer ont produit une decision structuree plausible; le blocage vient du contrat visible/guard.

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je continue avec Le texte magique.

**Sophia**
> On part donc sur Le texte magique pour tes vingt minutes de dossier administratif le soir, afin de contrer la tentation de trier tes notes au lieu d'ouvrir le dossier. C'est bien cette technique que tu souhaites utiliser ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- active_flow_arbitration: `no_active_flow`
- operation: `prepare_attack_card`
- toolSkillStatus: `clarifying`
- reason: `prepare_attack_card_local_ask_or_confirm_technique`
- local decision: `flow_action=confirm_technique_proposal`, `visible_task=ask_or_confirm_technique`
- visible guard: accepted attempt 1, issues `[]`
- executed_tools: `[]`
- durable_effect: `committed_effects=[]`

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, c’est bien Le texte magique.

**Sophia**
> C'est entendu pour Le texte magique. Pour avancer sur ta carte, est-ce que l'action que tu sais devoir faire, mais que tu commences souvent à négocier, c'est bien tes vingt minutes de dossier administratif le soir ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- operation: `prepare_attack_card`
- toolSkillStatus: `clarifying`
- reason: `prepare_attack_card_local_confirm_platform_field_proposal`
- local decision: `flow_action=confirm_proposed_field`, `visible_task=confirm_platform_field_proposal`
- current_field_id: `negotiated_action`
- visible guard: accepted attempt 1
- executed_tools: `[]`
- durable_effect: `committed_effects=[]`

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui, c’est exactement ça : vingt minutes de dossier administratif le soir.

**Sophia**
> On avance bien. Pour préparer Le texte magique, est-ce que l'idée de « trier mes notes au lieu d'ouvrir le dossier » est bien l'excuse ou la pensée qui te vient à l'esprit quand tu sens que tu décroches ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- operation: `prepare_attack_card`
- reason: `prepare_attack_card_local_confirm_platform_field_proposal`
- local decision: `flow_action=confirm_proposed_field`
- current_field_id: `recurring_excuse`
- visible guard: accepted attempt 1
- executed_tools: `[]`
- durable_effect: `committed_effects=[]`

### Tour 5

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Oui. L’excuse exacte c’est : je vais juste trier mes notes avant, comme ça ce sera plus propre.

**Sophia**
> Pour compléter Le texte magique, dans quel état d'esprit est-ce que tu aimerais te replonger au moment de le lire ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- operation: `prepare_attack_card`
- reason: `prepare_attack_card_local_ask_platform_field`
- local decision: `flow_action=answer_current_field`, `visible_task=ask_platform_field`
- current_field_id: `desired_reframe_state`
- visible guard: accepted attempt 1
- executed_tools: `[]`
- durable_effect: `committed_effects=[]`

### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-06` - Mauvais domaine semantique

**User**
> Je veux revenir à un état simple et décidé : j’ouvre le dossier maintenant, même imparfaitement.

**Sophia**
> Tout est prêt pour ton rappel. Pour finaliser cela, rends-toi dans la section Cartes d’attaque avec la technique Le texte magique. Il te suffit de suivre ces étapes : ouvre la section Cartes, choisis Carte d’attaque, puis reprends le brouillon proposé.
>
> Voici les informations à reporter :
> - Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ? : vingt minutes de dossier administratif le soir
> - Quelles excuses ou pensees reviennent quand tu sens que tu glisses ? : je vais juste trier mes notes avant, comme ça ce sera plus propre.
> - Dans quel etat tu veux te remettre en ecrivant ce texte ? : un état simple et décidé : j’ouvre le dossier maintenant, même imparfaitement.
>
> Est-ce que tu vois bien comment y accéder ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- operation: `prepare_attack_card`
- toolExecution: `platform_handoff`
- toolSkillStatus: `handoff_delivered`
- reason: `handoff_ready`
- local decision: `stage=handoff_ready`, `visible_task=handoff_ready`
- visible guard: attempt 1 rejected `missing_technique_label`, attempt 2 accepted
- executed_tools: `[]`
- durable_effect: `requested_effects=[]`, `allowed_effects=[]`, `committed_effects=[]`

**Analyse si yellow/red**
- Symptome: handoff fonctionnel et non mutant, mais Sophia dit "rappel" au lieu de "carte d'attaque".
- Source amont probable: agent visible `handoff_ready`, contamination de domaine produit.
- Owner runtime: prompt visible `prepare_attack_card.visible.handoff_ready`.
- Meilleure correction selon les guidelines: renforcer le contexte visible/contraintes de domaine pour interdire les noms d'autres surfaces comme "rappel" dans ce flow.
- Pourquoi ce n'est pas un patch local: le probleme est une generation visible de mauvais domaine, pas une extraction de slot.

### Tour 7

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Ok crée-la maintenant.

**Sophia**
> Je ne peux pas créer la carte moi-même directement depuis notre échange, c'est à toi de l'enregistrer dans ton interface. Pour cela, rends-toi dans la section Cartes d'attaque.
>
> Voici les étapes à suivre :
> 1. ouvre la section Cartes
> 2. choisis Carte d’attaque
> 3. reprends le brouillon proposé
>
> Tu pourras y inscrire ces éléments pour ta technique Le texte magique :
> - Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ? : vingt minutes de dossier administratif le soir
> - Quelles excuses ou pensees reviennent quand tu sens que tu glisses ? : je vais juste trier mes notes avant, comme ça ce sera plus propre.
> - Dans quel etat tu veux te remettre en ecrivant ce texte ? : un état simple et décidé : j’ouvre le dossier maintenant, même imparfaitement.
>
> Est-ce que tu as pu accéder à la section pour finaliser tout ça ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- operation: `prepare_attack_card`
- toolExecution: `platform_handoff`
- toolSkillStatus: `apply_attempt`
- reason: `apply_attempt_no_chat_mutation`
- local decision: `flow_action=apply_attempt`, `visible_task=apply_attempt`
- visible guard: attempt 1 rejected missing field labels/values, attempt 2 accepted
- blocked_effects: `create_attack_card: chat_creation_disabled_platform_handoff`
- executed_tools: `[]`
- durable_effect: `committed_effects=[]`

### Tour 8

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow

**User**
> Je la mets où exactement ?

**Sophia**
> C’est dans la section Cartes d’attaque. Il te suffit de suivre ces étapes : ouvre la section Cartes, choisis Carte d’attaque et reprends le brouillon proposé.
>
> Voici les éléments à saisir pour Le texte magique :
> - Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ? : vingt minutes de dossier administratif le soir
> - Quelles excuses ou pensees reviennent quand tu sens que tu glisses ? : je vais juste trier mes notes avant, comme ça ce sera plus propre.
> - Dans quel etat tu veux te remettre en ecrivant ce texte ? : un état simple et décidé : j’ouvre le dossier maintenant, même imparfaitement.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- operation: `prepare_attack_card`
- toolExecution: `platform_handoff`
- toolSkillStatus: `repeat_handoff`
- reason: `repeat_platform_handoff`
- local decision: `flow_action=repeat_handoff`, `visible_task=repeat_handoff`
- visible guard: attempt 1 rejected missing field labels/values, attempt 2 accepted
- executed_tools: `[]`
- durable_effect: `committed_effects=[]`

**Analyse si yellow/red**
- Symptome: le user demande seulement ou mettre la carte, mais le dispatcher route en `repeat_handoff` et la reponse repete tous les champs.
- Source amont probable: local dispatcher transition `destination_short` vs `repeat_handoff`.
- Owner runtime: `prepare_attack_card.local_dispatcher`.
- Meilleure correction selon les guidelines: distinguer explicitement demande de destination courte et demande de repetition des donnees a saisir; `destination_short` doit rester court.
- Pourquoi ce n'est pas un patch local: c'est une mauvaise action structuree du dispatcher local, pas un wording visible a corriger.

### Tour 9

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Laisse tomber la carte pour maintenant, aide-moi plutôt à prioriser ce que je fais ce soir.

**Sophia**
> J'ai fait le point sur ce qui est prévu pour ce soir afin de t'aider à y voir plus clair. Pour définir tes priorités, tu peux maintenant te rendre dans l'onglet Plan et sélectionner 'Ajuster mon plan' juste en dessous de ton programme actuel. Quelles sont les actions que tu considères comme les plus importantes pour ta soirée ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- active_flow_arbitration: `no_active_flow`
- operation: `adjust_plan_item`
- toolExecution: `none`
- toolSkillStatus: `clarifying`
- reason: `adjust_plan_item_get_info_db`
- subskill: `status_recap`
- executed_tools: `[]`
- durable_effect: `committed_effects=[]`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Apres le tour 1, le flow devient fluide: confirmation technique, champs plateforme, handoff, apply attempt bloque.
- Sophia ne pretend pas avoir cree la carte.
- Les questions sont globalement comprehensibles et suivent une progression logique.
- La sortie vers la priorisation est humainement acceptable.

**Problemes**
- Tour 1: blocage visible complet au premier message. Famille: `BF-STATE-03`. Impact: premiere experience inutilisable. Severite: red.
- Tour 6: "Tout est pret pour ton rappel" utilise le mauvais domaine. Famille: `BF-INTAKE-06`. Impact: confusion produit. Severite: yellow.
- Tour 8: demande de destination courte transformee en repetition complete. Famille: `BF-STATE-01`. Impact: reponse trop longue et moins fluide. Severite: yellow.

**Fix propose**
- Source amont: prompts visibles `ask_or_confirm_technique` / `handoff_ready` et dispatcher local pour `destination_short`.
- Correction recommandee: interdire explicitement toute destination plateforme dans les stages d'intake visibles, ajouter une contrainte de domaine "carte d'attaque, jamais rappel", et renforcer la regle dispatcher `destination_short` vs `repeat_handoff`.
- Tests d'invariant attendus: run IA reel sur premier tour cible+piege doit passer `visible_stage complete`; handoff ne doit jamais contenir "rappel"; "ou je la mets exactement ?" doit produire `destination_short` et une reponse courte.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Le routage initial selectionne bien `prepare_attack_card`.
- A partir du tour 3, les tours actifs passent par `active_prepare_attack_card_local_dispatcher`, ce qui respecte l'invariant local.
- Le tour 9 sort vers `adjust_plan_item` et reanalyse le nouveau sujet; aucun ancien flow ne capture la priorisation.
- Point a noter: apres le tour 1 bloque, le tour 2 indique `no_active_flow`; le premier blocage visible n'a pas laisse un flow actif recuperable.

**Skills / Operations / Tools**
- `wrong_technique_label` n'est plus observe sur `ask_or_confirm_technique`.
- Le flow collecte correctement les champs de `texte_recadrage`: `negotiated_action`, `recurring_excuse`, `desired_reframe_state`.
- `apply_attempt` bloque bien la creation depuis le chat.
- Les guards visibles restent bruyants: retries sur `missing_technique_label` et missing field labels/values aux tours 6-8.

**Memory / Effets durables**
- `executed_tools=[]` sur tous les tours prepare_attack_card.
- `committed_effects=[]` sur tous les tours.
- Verification DB locale: `user_attack_cards` count pour l'utilisateur QA = `0`.

**Problemes**
- Tour 1: visible stage rejete deux fois pour `premature_platform_handoff`. Famille: `BF-STATE-03`. Impact systeme: un premier tour valide peut produire `prepare_attack_card_visible_agent_failed`. Severite: red.
- Tour 8: mauvaise action locale `repeat_handoff` au lieu de `destination_short`. Famille: `BF-STATE-01`. Impact systeme: transition locale trop large. Severite: yellow.
- Tours 6-8: retry guards internes frequents. Famille: `BF-STATE-03`. Impact systeme: robustesse faible et latence/retry inutile. Severite: yellow.

**Fix propose**
- Source amont: `prepare_attack_card.visible_agent` prompts/guard et prompt dispatcher local.
- Correction recommandee: retirer ou masquer toute mention de destination dans le contexte visible des stages d'intake; ajouter des exemples de sortie non visibles pour `destination_short`; rendre le guard de handoff moins fragile si le message contient les valeurs exactes mais varie la ponctuation.
- Tests d'invariant attendus: unitaires sur `premature_platform_handoff` stage-aware, integration IA du tour 1, test `destination_short`, test anti-mutation DB apres `ok cree-la`.

## Verdict Global

- Verdict: red
- Raison principale: le bug `wrong_technique_label` est corrige, mais le premier tour reste bloquant a cause du guard `premature_platform_handoff`; le reste du run prouve toutefois que le flow peut aller jusqu'au handoff et bloque correctement la creation.
- Follow-up prioritaire: corriger le stage visible `ask_or_confirm_technique` pour ne jamais mentionner `Cartes d'attaque` pendant l'intake, puis renforcer `destination_short`.
