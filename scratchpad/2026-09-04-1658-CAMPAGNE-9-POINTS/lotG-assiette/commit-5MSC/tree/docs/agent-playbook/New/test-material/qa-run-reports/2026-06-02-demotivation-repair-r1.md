# QA Run Report - Demotivation Repair R1

## 1. Contexte Du Test

- Date: 2026-06-02
- Run: `demotivation_repair_20260602_r1`
- Persona: `qa-skill`
- Connection: `demotivation_repair_20260602-r1` temporaire, creee pour le run
- Objectif: tester `demotivation_repair` en IA reelle locale sur decouragement global, refus explicite de potion/outil, demande de plus petit geste.
- Trajectoire: perte de sens -> refus potion/outil -> correction explicite -> demande de micro-geste -> verification DB.
- Surfaces visees: dispatcher, conversation skill `demotivation_repair`, arbitrage tool skill `select_state_potion`, orientation clarification, contraintes `no_potion` / `no_tool` / `no_questions`, memory/effects.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, pas de renderer deterministe ni fallback direct.
- Validite QA: valide. Le run a ete arrete a 5 tours car la capture par `select_state_potion` s'est reproduite deux fois.

Notes setup:

- La connexion stable `demotivation_repair` n'etait pas marquee `is_test_persona=true`; le reset a donc refuse correctement.
- Une connexion temporaire isolee a ete creee via `scripts/qa-create-run-connection.sh`.
- Raw JSON: `tmp/demotivation_repair_20260602_r1/`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je regarde ma liste depuis dix minutes et j'ai juste envie de fermer l'ordi. Ce n'est pas une panique, c'est plutot un vieux 'a quoi bon' qui revient.

**Sophia**
> Je comprends ce 'à quoi bon', c'est un signal de perte de sens, pas un manque de volonté. Quand l'utilité s'efface, l'écran devient un mur. Je te suggère de ne rien décider pour l'instant. Est-ce que ce sentiment est lié à une tâche précise ou c'est l'ensemble qui te semble vide ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `skill_entry_signal`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: none observed

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-AGENDA-02` - interruption explicite mal restauree

**User**
> C'est l'ensemble. J'ai deja relance ce sujet plusieurs fois et ca finit toujours par retomber. La, je ne veux pas de potion ni de nouvel outil, juste comprendre comment ne pas abandonner direct.

**Sophia**
> Je ne l'active pas depuis le chat. Reprends cette recommandation dans la section État / Potions.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `orientation_clarification_resolved`
- safety: none
- direct_effects: none
- operation: `select_state_potion` blocked
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: no potion session created

**Analyse si yellow/red**
- Symptome: le refus explicite "pas de potion ni de nouvel outil" est transforme en aide produit/potion.
- Source amont probable: arbitrage orientation/tool skill apres suggestion ou clarification, qui ne restaure pas le owner conversationnel quand `no_potion` / `no_tool` est present.
- Owner runtime: active flow / orientation clarification / tool skill arbitration, avec contrat `demotivation_repair` comme source de contraintes.
- Meilleure correction selon les guidelines: rendre les hard negatives `no_potion` et `no_tool` bloquants au niveau agenda/arbitrage, pas seulement dans le reducer local du skill.
- Pourquoi ce n'est pas un patch local: le test contractuel `demotivation_repair no_potion_blocks_potion` passe deja; l'echec est dans le chemin runtime IA reel entre skill, clarification et tool skill.

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-01` - slot fourni mais redemande

**User**
> Non justement, pas la section Potions. Je te parle du decouragement la, j'ai besoin d'une reponse simple dans la conversation.

**Sophia**
> Je comprends ce 'à quoi bon', c'est un signal de perte de sens, pas un manque de volonté. Quand l'utilité s'efface, l'écran devient un mur. Je te suggère de ne rien décider pour l'instant. Est-ce que ce sentiment est lié à une tâche précise ou c'est l'ensemble qui te semble vide ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_conversation_skill_continue`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: bonne recuperation du owner, mais reponse quasi identique au tour 1 et question deja repondue au tour 2.
- Source amont probable: working state / intake context ne reutilise pas correctement le slot "c'est l'ensemble" apres interruption.
- Owner runtime: `demotivation_repair` context/intake ou state handoff apres interruption.
- Meilleure correction: conserver la contrainte et le slot deja fournis quand une interruption tool skill est corrigee par l'utilisateur.

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` - contrainte explicite perdue

**User**
> Je t'ai repondu: c'est l'ensemble. Si je dois rester avec un seul geste, ce serait quoi, sans me vendre une methode et sans me demander encore de choisir ?

**Sophia**
> Est-ce que tu veux qu'on allège toute ta liste pour y voir plus clair, ou qu'on choisisse juste une micro-tâche pour démarrer ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: l'utilisateur demande explicitement "sans me demander encore de choisir"; Sophia redemande un choix.
- Source amont probable: orientation clarification ignore `no_questions` / `concrete_before_question`.
- Owner runtime: orientation clarification / TurnAgenda.
- Meilleure correction: si le user demande un seul geste et interdit une nouvelle question, preferer une reponse concrete minimale au lieu d'une clarification binaire.

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-AGENDA-02` - interruption explicite mal restauree

**User**
> Choisis juste une micro-tache pour demarrer. Je n'ai pas assez d'energie pour trier toute la liste.

**Sophia**
> Je peux t'aider à choisir une potion à reprendre dans la plateforme, sans l'activer depuis le chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `orientation_clarification_resolved`
- safety: none
- direct_effects: none
- operation: `select_state_potion` blocked
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: no potion session created

**Analyse si yellow/red**
- Symptome: apres slot fourni, Sophia revient encore vers potion au lieu de proposer une micro-tache.
- Source amont probable: clarification/orientation resolue vers l'operation incorrecte; la contrainte initiale `no_potion` n'est pas portee sur les tours suivants.
- Owner runtime: active flow / orientation clarification / tool skill arbitration.
- Meilleure correction: propager les hard negatives et le target conversationnel dans le state de clarification; ne jamais resoudre une clarification de micro-action vers `select_state_potion` quand le run actif est `demotivation_repair` et que `no_potion` a ete exprime.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- L'entree initiale en `demotivation_repair` est naturelle et non culpabilisante.
- Sophia ne moralise pas la demotivation au tour 1.

**Problemes**
- Tour 2: le refus explicite de potion/outil est ignore. Famille: `BF-AGENDA-02`. Impact: rupture de confiance dans un moment de decouragement. Severite: red.
- Tour 3: repetition forte et question deja repondue. Famille: `BF-INTAKE-01`. Impact: l'utilisateur doit se repeter pour revenir au sujet. Severite: yellow.
- Tour 4: Sophia redemande de choisir malgre l'interdiction explicite. Famille: `BF-INTAKE-03`. Impact: friction visible, surtout avec faible energie. Severite: yellow.
- Tour 5: la potion revient encore alors que l'utilisateur demande une micro-tache. Famille: `BF-AGENDA-02`. Impact: experience bloquante. Severite: red.

**Fix propose**
- Source amont: TurnAgenda / orientation clarification / tool skill arbitration.
- Correction recommandee: porter `no_potion`, `no_tool`, `no_questions` et `prefer_smallest_action` comme contraintes runtime cross-owner, pas seulement comme normalisation locale du skill.
- Tests d'invariant attendus: run IA reel avec paraphrases de "pas de potion", "pas d'outil", "choisis pour moi une micro-tache"; verifier owner `demotivation_repair` ou handoff `execution_breakdown`, jamais `select_state_potion`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1: correct, `conversation_handler` / `demotivation_repair`.
- T2: incorrect, `tool_skill` / `select_state_potion` malgre `no_potion` + `no_tool`.
- T3: owner corrige, mais state incomplet/repetition.
- T4: `orientation_clarification` prend la main malgre `no_questions`.
- T5: incorrect, `tool_skill` / `select_state_potion` apres demande de micro-tache.

**Skills / Operations / Tools**
- `demotivation_repair` fonctionne en entree mais ne garde pas assez ses contraintes a travers l'arbitrage.
- `select_state_potion` n'execute rien, mais prend deux fois la reponse visible a tort.
- Aucun executor durable appele.

**Memory / DB**
- Verification avant cleanup:
  - `chat_messages`: 10
  - `scheduled_checkins`: 0
  - `user_potion_sessions`: 0
  - `user_cycles`: 0
  - `memory_items`: 0
  - `user_topic_memories`: 0
  - `user_profile_facts`: 9 defaults systeme coach, aucun fact issu de l'auto-devalorisation.
- Tables `operation_suggestions` et `tool_recommendations` non presentes dans le schema REST local; non probantes.

**Tests techniques complementaires**
- `deno test --allow-env --allow-net --allow-read --filter demotivation_repair supabase/functions/sophia-brain/skills/skills_s3.test.ts`: 15 passed, 0 failed, 33 filtered out.
- `deno check supabase/functions/sophia-brain/skills/demotivation_repair/skill.ts ... router/run.ts`: pass.

**Conclusion systeme**
- Les tests contractuels locaux sont verts, mais le chemin IA reel est rouge.
- Le bug est donc situe dans l'integration runtime/arbitrage plutot que dans le normalizer local `demotivation_repair`.

## Verdict Global

Red. Le run est techniquement valide et prouve une regression/limite d'integration: `demotivation_repair` detecte correctement l'entree, mais les contraintes explicites `no_potion`, `no_tool` et `no_questions` ne survivent pas a l'arbitrage orientation/tool skill.
