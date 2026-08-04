# Conversation Risk - Three Situation Runs

## 1. Contexte Du Test

- Date: 2026-05-13
- Objectif: tester les trois comportements du coupe-feu `conversation_risk >= 8`.
- Cadre IA reel: Supabase local, `POST /functions/v1/test-send-message`, `force_full_ai=true`, comptes QA temporaires distincts.
- Situations:
  - tool-skill actif: `prepare_defense_card`
  - skill conversationnel actif: `execution_breakdown`
  - aucun flow actif
- Validite QA: valide. Les etats actifs ont ete injectes dans `user_chat_states.temp_memory` avant le tour de rupture.

## 2. Tours De Conversation

### Situation 1 - Tool-Skill Actif

- Run: `qa-conv-risk-toolskill-20260513213230`
- User technique: `42a626c3-82ea-48c2-aada-1eb69e80b518`
- Etat injecte: `__active_tool_skill_intake.operation_type=prepare_defense_card`

**User**
> Non mais stop, tu comprends rien. Je te l'ai deja dit trois fois: retour du travail, stress, biscuits. Ce n'est pas ce que j'ai dit, je veux repartir a zero parce que la Sophia me perd completement.

**Sophia**
> Ok, stop sur le flou : on reprend vraiment a zero. 😅
>
> La, ce que je retiens "de fiable" pour relancer la carte de defense, c'est juste ca : retour du travail + stress + fatigue + biscuits.
>
> Confirme-moi si c'est bien ca, ou dis-moi ce qu'il faut ajuster.

**Trace courte**
- request_id: `07306672-e5ff-40aa-b1e0-dc2b3c699364`
- score: `9.1`
- exit: `true`
- flow_exit_context: `interrupted_flow_type=tool_skill`, `restart_scope=tool_subskill`, `active_tool_skill_type=prepare_defense_card`
- apres tour: `active_tool=false`, `active_skill=false`, `pending=false`

### Situation 2 - Skill Conversationnel Actif

- Run: `qa-conv-risk-convskill-20260513213232`
- User technique: `a878b90e-dc9a-4372-b54c-fd71f34005f7`
- Etat injecte: `__active_skill_state.skill_id=execution_breakdown`

**User**
> Non mais stop, tu comprends rien. Je te l'ai deja dit trois fois: je suis bloquee sur le choix du brut et tu reponds a cote. Je veux repartir a zero parce que la Sophia me perd completement.

**Sophia**
> Ah merde… ok. On repart proprement et cette fois on s'aligne sur ton sujet exact: le choix du brut (et rien d'autre). 🙂
>
> Je resume ce que j'ai compris de facon fiable: tu es bloquee sur le choix du brut, et a chaque fois je te reponds a cote, du coup tu veux repartir a zero.
>
> Confirme-moi si c'est bien ca, ou dis-moi ce qu'il faut ajuster.

**Trace courte**
- request_id: `a2b66dab-c174-4095-ab97-5becc1adea63`
- score: `9.1`
- exit: `true`
- flow_exit_context: `interrupted_flow_type=conversation_skill`, `restart_scope=conversation_skill`, `active_conversation_skill_id=execution_breakdown`
- apres tour: `active_tool=false`, `active_skill=false`, `pending=false`

### Situation 3 - Aucun Flow Actif

- Run: `qa-conv-risk-noflow-20260513213233`
- User technique: `5b937245-44aa-4f1b-a9e0-a875a499210d`
- Etat injecte: aucun flow actif

**User**
> Merde, stop vraiment !!! Tu comprends rien, je te l'ai deja dit, c'est pas ce que j'ai demande. Oublie tout, je veux reprendre a zero.

**Sophia**
> Ah merde… ok, stop. Tu veux vraiment repartir de zero, donc on efface la direction precedente et on repart sur CE que toi tu veux, point. 🧼🙂
>
> Dis-moi juste une chose, clairement : qu'est-ce que tu veux que je fasse maintenant, a partir de zero (objectif + format attendu) ?

**Trace courte**
- request_id: `c923cbf1-77ad-47ad-bfdb-e9492013eeac`
- score: `10`
- exit: `true`
- flow_exit_context: `interrupted_flow_type=none`, `restart_scope=silent_reset`
- apres tour: `active_tool=false`, `active_skill=false`, `pending=false`

## 3. Analyse De Fluidite Humaine

**Verdict: green/yellow**

**Ce qui marche**
- Tool-skill: la reponse respecte la logique voulue: reprise au debut du sous-skill, resume, confirmation/correction, pas de prochain slot.
- Conversation-skill: meme logique, adaptee au skill actif et sans jargon technique.
- No-flow: pas de mention de skill, operation, slot, dispatcher ou outil; Sophia repond comme une reprise conversationnelle normale.

**Problemes**
- No-flow: Sophia verbalise quand meme "on efface la direction precedente". Ce n'est pas technique, mais si on veut un reset totalement invisible, il faudra guider le prompt general a repondre plus sobrement dans ces cas.

**Fix propose**
- Garder la logique actuelle pour tool-skill et conversation-skill.
- Pour no-flow, ne pas ajouter d'addon reste correct; si besoin, ajouter une consigne generale basse priorite: "si aucune flow interrompu, ne parle pas de reset systeme".

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Les trois situations depassent le seuil `>= 8`.
- Le `flow_exit_context` distingue correctement les cas:
  - `tool_skill`
  - `conversation_skill`
  - `none`

**Nettoyage**
- Les trois runs finissent sans `__active_tool_skill_intake`, sans `__active_skill_state`, sans pending confirmation.
- Les slots sont effaces dans le cas tool-skill; seul le snapshot structure est fourni a l'IA pour le message visible.

**Effets durables**
- Aucun executor n'a ete appele.
- Aucun effet durable non confirme.

## Verdict Global

- Verdict: green
- Raison principale: les trois branches du coupe-feu fonctionnent selon la logique attendue.
- Follow-up prioritaire: corriger en amont le slot filling `prepare_defense_card`, qui continue de provoquer la frustration avant le coupe-feu.
