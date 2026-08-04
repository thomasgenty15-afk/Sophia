# QA Run Report — prepare_attack_card local real R2

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `prepare-attack-card-local-real-r2` puis variante corrective `prepare-attack-card-local-real-r2b`
- Persona: `qa-skill`, connexion temporaire `all_skills_prepareattacklocalr2`, user `35bcd2b9-4aca-49e9-9ab7-cec5ce9d3e93`
- Objectif: vérifier en conditions réelles les corrections des tours rouges R1: `apply_attempt` et sortie locale vers dispatcher global.
- Trajectoire: création d'une carte d'attaque, handoff, tentative de création depuis le chat, abandon du flow puis priorisation normale.
- Surfaces visees: `prepare_attack_card.local_dispatcher`, reducer local, visible agent, `run.ts` active flow, dispatcher global, EffectLedger/no mutation.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer déterministe, pas de fallback direct.
- Validite QA: valide. R2 a exposé un bug de fallthrough corrigé pendant le run; R2b valide le comportement attendu après correction.

## 2. Tours De Conversation

### Run R2 — Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-UX-01 — stage visible incohérent avec état structuré

**User**
> Je veux préparer une carte d'attaque pour arrêter de repousser mon étirement du soir; quand je rentre tard je me raconte que je le ferai demain.

**Sophia**
> C'est une situation très classique quand on rentre tard. Pour t'aider à ne plus repousser tes étirements, je te propose d'utiliser Le texte magique. Pour commencer : Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- operation: `prepare_attack_card`
- tool_execution: `blocked`
- executed_tools: `[]`
- durable_effect: `committed_effects=[]`, `platform_handoff=null`

**Analyse si yellow/red**
- Symptome: la trace montre cible et blocker locked, mais le visible redemande l'action.
- Source amont probable: mismatch `visible_task.kind=ask_target` produit par dispatcher local malgré un état déjà locked.
- Owner runtime: `prepare_attack_card.local_dispatcher` / prompt visible stage.
- Correction recommandee: forcer le dispatcher local à sélectionner `ask_platform_field` ou `confirm_technique_proposal` quand target/blocker sont locked.

### Run R2 — Tour 2

**Verdict du tour:** green

**User**
> Oui, l'action c'est mon étirement du soir. L'excuse qui revient, c'est surtout: je suis trop fatigué, je le ferai demain matin.

**Sophia**
> C'est une excuse très tentante quand la fatigue s'en mêle. Pour finaliser Le texte magique, dans quel état est-ce que tu aimerais te remettre au moment de le lire pour retrouver ta motivation ? 🙂

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- reason_code: `prepare_attack_card_local_ask_platform_field`
- current_field_id: `desired_reframe_state`
- executed_tools: `[]`
- durable_effect: none

### Run R2 — Tour 3

**Verdict du tour:** green

**User**
> Je veux me remettre dans un état simple et ferme: je déroule le tapis, je fais huit minutes, et je ne rouvre pas le débat.

**Sophia**
> C'est une excellente approche pour ne plus laisser de place au doute. Tu peux maintenant te rendre dans la destination Cartes d'attaque pour utiliser la technique Le texte magique avec ces éléments : [...]

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- tool_execution: `platform_handoff`
- reason_code: `handoff_ready`
- platform_handoff: `operation_type=prepare_attack_card`, `surface_id=attack_cards`, `no_chat_mutation=true`
- executed_tools: `[]`
- committed_effects: `[]`

### Run R2 — Tour 4

**Verdict du tour:** green

**User**
> Ok, crée-la maintenant.

**Sophia**
> Je ne crée pas la carte directement depuis notre discussion, mais tu peux l'ajouter en un instant dans la section Cartes d'attaque. Voici les données exactes à saisir [...]

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- reason_code: `apply_attempt_no_chat_mutation`
- status: `apply_attempt`
- visible_agent: accepted attempt 1
- blocked_effects: `create_attack_card/chat_creation_disabled_platform_handoff`
- executed_tools: `[]`
- committed_effects: `[]`
- DB: `user_attack_cards=[]`

### Run R2 — Tour 5

**Verdict du tour:** red puis corrigé dans R2b

**Famille de bugs si yellow/red:** BF-ROUTE-02 — ancien flow capture une nouvelle intention

**User**
> Laisse tomber la carte pour l'instant; aide-moi plutôt à décider ce que je fais ce soir en priorité.

**Sophia**
> Je garde la carte d'attaque en cours, mais je n'arrive pas à traiter correctement ce tour. Réessaie dans un instant. 🙂

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- reason_code: `active_prepare_attack_card_local_runtime_null`
- runtime_trace: `local_runtime_null`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: le local dispatcher avait vidé l'état et écrit un mémo de sortie, mais `run.ts` tombait ensuite dans le fallback `local_runtime_null`.
- Source amont probable: fallthrough après `*_local_exit_to_global_dispatcher` dans les branches actives `prepare_attack_card`, `prepare_defense_card`, `select_state_potion`.
- Owner runtime: `router/run.ts`.
- Correction appliquee: ajout d'un flag `continueToGlobalAfterLocalExit`, mémo `last_local_flow_exit`, suppression one-shot, normalisation de raison `none -> topic_change`.

### Run R2b — Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-UX-01 — stage visible incohérent avec état structuré

**User**
> J'ai besoin d'une carte d'attaque pour ne pas repousser mes dix minutes de rangement le soir. Le piège, c'est que je me dis que ce n'est pas urgent et que je le ferai demain.

**Sophia**
> Je vois bien le genre de négociation interne qui s'installe pour ces dix minutes de rangement. Pour t'aider à ne plus repousser au lendemain, on pourrait s'appuyer sur Le texte magique, qu'en penses-tu ? 🙂

**Trace courte**
- selected_handler: `prepare_attack_card`
- reason_code: `prepare_attack_card_local_ask_target`
- trace: target/blocker locked, technique proposed
- executed_tools: `[]`
- durable_effect: none

### Run R2b — Tour 2

**Verdict du tour:** green

**User**
> Oui pour Le texte magique. L'action à saisir, c'est dix minutes de rangement le soir; l'excuse, c'est ce n'est pas urgent, je le ferai demain; l'état voulu, c'est net et léger: je range juste dix minutes et je m'arrête.

**Sophia**
> Tout est prêt pour ta préparation. Tu peux maintenant te rendre dans la section Cartes d'attaque pour finaliser l'outil avec la technique Le texte magique [...]

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- reason_code: `handoff_ready`
- platform_handoff: `prepare_attack_card`, `attack_cards`, `no_chat_mutation=true`
- executed_tools: `[]`
- committed_effects: `[]`

### Run R2b — Tour 3

**Verdict du tour:** green

**User**
> Finalement laisse cette carte de côté; aide-moi plutôt à choisir ma priorité pour ce soir.

**Sophia**
> Ok, on met la carte de côté. Là, on choisit juste LA priorité de ce soir [...]

**Trace courte**
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- tool_execution: `none`
- executed_tools: `[]`
- committed_effects: `[]`
- DB: no active attack handoff after turn

### Run R2b — Tour 4

**Verdict du tour:** green

**User**
> Mes options sont: ranger dix minutes, préparer mon sac, ou répondre à un mail rapide.

**Sophia**
> OK, là t’as une vraie bonne shortlist [...] Je prendrais l’ordre suivant pour ce soir : répondre au mail rapide, puis préparer ton sac, et en dernier seulement les dix minutes de rangement.

**Trace courte**
- response_owner: `normal_reply`
- selected_handler: `null`
- tool_execution: `none`
- executed_tools: `[]`
- committed_effects: `[]`
- DB temp_memory: `has_active_attack=false`, `has_last_exit=false`

## 3. Analyse De Fluidite Humaine

**Verdict:** yellow

**Ce qui marche**
- Le handoff est clair et donne les champs exacts à saisir.
- La tentative de création est maintenant bien recadrée sans claim de création.
- La sortie du flow est naturelle après correction: Sophia passe à la priorisation.

**Problemes**
- Tours R2-1 et R2b-1: le message visible peut redemander une cible déjà locked. Famille: BF-UX-01. Impact: friction légère et impression de répétition.

**Fix propose**
- Source amont: `prepare_attack_card.local_dispatcher` / contrat de stage visible.
- Correction recommandee: invariant stage-state: si target et blocker sont locked, le visible_task ne peut pas être `ask_target`.
- Tests d'invariant attendus: target+blocker locked + technique proposed => `ask_or_confirm_technique` ou `ask_platform_field`, jamais `ask_target`.

## 4. Analyse Systeme

**Verdict:** green pour les deux bugs critiques, yellow global à cause de la friction stage.

**Routage**
- Pendant le flow actif, le dispatcher global est bien skippé jusqu'au signal local de sortie.
- Après correction, `exit_to_global_dispatcher` permet une deuxième analyse globale du même message.
- Le tour R2b-3 sort bien en `normal_reply`, pas en `prepare_attack_card`.

**Skills / Operations / Tools**
- `apply_attempt` reste dans `prepare_attack_card`, bloque la création et répète les champs plateforme.
- Aucun appel DB de création de carte n'a été observé.
- `executed_tools=[]` et `committed_effects=[]` sur tous les tours.

**Memo De Sortie**
- Le mémo de sortie est consommé puis supprimé: vérification DB après R2b-4, `has_last_exit=false`.
- Même correction appliquée à `prepare_defense_card` et `select_state_potion` dans le routeur.

**Verification DB**
- `2026-06-08-prepare-attack-card-local-real-r2.durable.json`: `cards=[]`
- `2026-06-08-prepare-attack-card-local-real-r2b.durable.json`: `cards=[]`

## Verdict Global

`yellow`.

Les deux bugs critiques R1 sont corrigés en conditions réelles: `apply_attempt` ne tombe plus en échec visible, et la sortie locale reroute vers le global. Il reste une friction UX de stage initial (`ask_target` alors que l'état est déjà locked), à traiter comme bug séparé non bloquant.
