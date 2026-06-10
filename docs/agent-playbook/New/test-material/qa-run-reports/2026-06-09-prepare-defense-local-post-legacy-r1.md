# QA Run - prepare_defense_card Local Post Legacy R1

## 1. Contexte Du Test

- Date: 2026-06-09
- Run: `prepare-defense-local-post-legacy-r1`
- Persona: `alex` (`tests/real-personas/alex/connection.json`, auth via `scripts/get-jwt.sh`; JWT non consigne)
- Objectif: verifier en conditions IA reelles que les modifications post suppression legacy de `prepare_defense_card` tiennent en conversation complete.
- Trajectoire: entree defense explicite -> confirmation -> destination -> revision -> tentative de creation -> bascule vers carte d'attaque.
- Surfaces visees: dispatcher global, active local flow routing, `prepare_defense_card.local_dispatcher`, reducer local, visible agent local, note_information, handoff plateforme, effect ledger, handoff vers `prepare_attack_card`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide. Incident pre-run: un premier appel a ete bloque par le sandbox Codex (`EPERM 127.0.0.1:54321`) avant d'atteindre Sophia. Le run exploitable a ensuite ete mene via le endpoint local reel, tour par tour, avec acces reseau local autorise.
- Cleanup: non effectue. Le cleanup cible du scope QA a ete tente apres le rapport, mais la demande d'autorisation hors sandbox a ete rejetee par la couche d'approbation automatique. Les lignes locales de `chat_messages` et `user_chat_states` du scope `qa-prepare-defense-card-alex-2026-06-09-prepare-defense-local-post-legacy-r1` restent donc presentes.

Artefacts:

- Raw: `tests/real-personas/alex/runs/operations/2026-06-09-prepare-defense-prepare-defense-local-post-legacy-r1.raw.json`
- Summary: `tests/real-personas/alex/runs/operations/2026-06-09-prepare-defense-prepare-defense-local-post-legacy-r1.summary.json`
- Durable: `tests/real-personas/alex/runs/operations/2026-06-09-prepare-defense-prepare-defense-local-post-legacy-r1.durable.json`
- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-09-prepare-defense-local-post-legacy-r1-bugs.md`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je veux préparer une carte de défense pour le moment où je rentre cramé et que je commande n'importe quoi au lieu de manger correctement.

**Sophia**
> Est-ce que cette formulation te convient pour décrire la situation (« Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? ») : « Quand je rentre fatigué le soir et que j'ai l'impulsion de commander de la malbouffe » ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `tool_skill_intent_start`
- global signal: `tool_skill_intents[0].operation_type=prepare_defense_card`, `explicitness=explicit`, `confidence_band=high`, `ambiguity=none`
- local dispatcher: `flow_action=confirm_proposed_field`, `visible_task=confirm_support_need_proposal`, `support_need_status=proposed`
- note_information: presente, `source_flow_id=global_dispatcher`, `target_dispatcher=prepare_defense_card`
- safety: `risk_band=none`
- direct_effects: `[]`
- operation: `collecting`, reason `prepare_defense_card_local_collecting`
- pending_confirmation: `null`
- memory_plan: `none`
- executed_tools: `[]`
- durable_effect: none
- ai_call_count: 2

### Tour 2

**Verdict du tour:** green

**User**
> Oui, c'est ça. Garde cette idée : quand je rentre fatigué et que je commande n'importe quoi au lieu de manger correctement.

**Sophia**
> Ta préparation est prête. Pour finaliser ta carte de défense, il faudra te rendre dans Ressources / Défense / Cartes de défense libres. Tu pourras y reporter cette formulation pour le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? : Quand je rentre fatigué le soir et que j'ai l'impulsion de commander de la malbouffe. La carte ne se crée pas directement depuis notre échange, c'est à toi de l'ajouter dans l'onglet dédié.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- blocked_paths: `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`
- local dispatcher: `flow_action=handoff_ready`, `visible_task=handoff_ready`, `support_need_status=locked`
- visible guard: accepted, `issues=[]`
- safety: `risk_band=none`
- direct_effects: `[]`
- operation: `handoff_delivered`, reason `platform_handoff_delivered`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none
- ai_call_count: 2

### Tour 3

**Verdict du tour:** green

**User**
> Ok, je la mets où exactement ?

**Sophia**
> Tu peux maintenant placer cette carte de défense dans Ressources / Défense / Cartes de défense libres. Pour le champ « Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? », tu peux recopier : Quand je rentre fatigué le soir et que j'ai l'impulsion de commander de la malbouffe

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- blocked_paths: `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`
- local dispatcher: `flow_action=platform_destination_followup`, reducer `visible_task=destination_short`, `support_need_status=locked`
- visible guard: accepted, `issues=[]`
- safety: `risk_band=none`
- direct_effects: `[]`
- operation: `handoff_delivered`, reason `destination_short`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none
- ai_call_count: 2

### Tour 4

**Verdict du tour:** green

**User**
> Reformule plutôt comme ça : quand je rentre stressé et vidé, j'ai besoin d'aide à ne pas partir directement dans une commande compulsive.

**Sophia**
> Voici la formulation que tu peux utiliser pour ta carte de défense. Pour la mettre en place, rends-toi dans Ressources / Défense / Cartes de défense libres. Dans le champ Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?, tu peux recopier ceci : Quand je rentre stressé et vidé, j'ai besoin d'aide à ne pas partir directement dans une commande compulsive. Note bien que la carte n'est pas créée directement depuis notre échange, il faudra l'ajouter toi-même dans l'outil.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- blocked_paths: `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`
- local dispatcher: `flow_action=revise_support_need`, reducer `visible_task=handoff_ready`, `support_need_status=locked`
- slots_modified: `tool_fit`, `support_need`
- visible guard: accepted, `issues=[]`
- safety: `risk_band=none`
- direct_effects: `[]`
- operation: `handoff_delivered`, reason `revised_platform_handoff`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none
- ai_call_count: 2

Verification ciblee:
- La nouvelle valeur remplace bien la valeur principale visible.
- Aucun claim de creation ou de persistance durable n'est observe.

### Tour 5

**Verdict du tour:** green

**User**
> Ok vas-y, crée-la.

**Sophia**
> Je ne peux pas créer ta carte de défense directement depuis notre discussion, mais tu peux l'ajouter toi-même dans Ressources / Défense / Cartes de défense libres. Pour cela, ouvre Ressources / Défense, dans Cartes de défense libres, choisis Ajouter une carte et reprends les champs préparés par Sophia. Pour le champ « Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? », tu peux copier cette formulation : Quand je rentre stressé et vidé, j'ai besoin d'aide à ne pas partir directement dans une commande compulsive.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- blocked_paths: `global_dispatcher / active_prepare_defense_card_uses_local_dispatcher`
- local dispatcher: `flow_action=apply_attempt`, reducer `visible_task=apply_attempt`, `support_need_status=locked`
- visible guard: accepted, `issues=[]`
- safety: `risk_band=none`
- direct_effects: `[]`
- operation: `apply_attempt`, reason `apply_attempt_no_chat_mutation`
- blocked_effects: `create_defense_card / chat_creation_disabled_platform_handoff`
- committed_effects: `[]`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none
- ai_call_count: 2

### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-03` - Draft lifecycle casse

**User**
> Finalement je veux plutôt une carte d'attaque pour démarrer mon dossier d'assurance demain matin.

**Sophia**
> C'est un objectif important. Qu'est-ce qui a tendance à te faire dérailler ou à te bloquer au moment précis où tu dois t'attaquer à ce dossier d'assurance ?
>
> Pour la suite, tout se passe dans la section Cartes d’attaque : ouvre la section Cartes, choisis Carte d’attaque et reprends le brouillon proposé.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `prepare_defense_card_handoff_to_prepare_attack_card`
- blocked_paths: `global_dispatcher / prepare_defense_card_handoff_to_prepare_attack_card`
- note_information: presente, `source_flow_id=prepare_defense_card`, `target_dispatcher=prepare_attack_card`
- attack local dispatcher: `flow_action=continue_local`, `visible_task=ask_blocker`, `target_status=locked`, `blocker_status=missing`
- visible guard: accepted, `issues=[]`
- safety: `risk_band=none`
- direct_effects: `[]`
- operation: `clarifying`, reason `prepare_attack_card_local_ask_blocker`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: la transition vers `prepare_attack_card` pose bien la bonne question de clarification, mais ajoute "reprends le brouillon proposé" alors qu'aucun brouillon de carte d'attaque n'a encore ete propose.
- Source amont probable: `prepare_attack_card` visible agent ou `conversation_context` du stage `ask_blocker` apres handoff local depuis defense.
- Owner runtime: `prepare_attack_card`.
- Meilleure correction selon les guidelines: le prompt visible `ask_blocker` doit interdire toute mention de brouillon ou destination plateforme tant que le handoff attaque n'est pas pret. La destination doit rester reservee aux stages `handoff_ready`, `repeat_handoff`, `destination_short` ou `apply_attempt`.
- Pourquoi ce n'est pas un patch local: le routage et le handoff sont corrects; le probleme vient de la projection visible du stage cible, pas de mots-cles user.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- T1-T5 sont naturels et exploitables: Sophia confirme, verrouille, repond a la destination, revise, puis refuse la creation depuis le chat.
- Les reponses defense n'exposent pas l'ancien formulaire multi-champs et restent centrees sur le champ canonique.
- La tentative "cree-la" est traitee sans durete et sans fausse promesse.
- La bascule vers attaque est comprehensible humainement: Sophia comprend le changement d'objectif.

**Problemes**
- Tour 6: mention prematuree d'un "brouillon proposé" cote carte d'attaque. Famille: `BF-STATE-03`. Impact: le user peut croire qu'un brouillon existe deja alors que le flow attaque demande encore le bloqueur. Severite: yellow.

**Fix propose**
- Source amont: `prepare_attack_card` visible agent, stage `ask_blocker`, ou son `conversation_context` lors d'un handoff local depuis defense.
- Correction recommandee: au stage `ask_blocker`, ne produire qu'une question de clarification sur le bloqueur; ne pas mentionner de destination plateforme ni de brouillon tant que les champs requis ne sont pas verrouilles.
- Tests d'invariant attendus: handoff defense -> attack avec `visible_task=ask_blocker` ne contient pas "brouillon", "reprends", "section Cartes" ou destination plateforme; handoff attack ready continue a afficher la destination.

## 4. Analyse Systeme

**Verdict: green cote defense, yellow sur la transition visible vers attack**

**Routage**
- T1: le dispatcher global detecte une demande explicite `prepare_defense_card`.
- T2-T5: le dispatcher global est bien bloque pendant le flow actif via `active_prepare_defense_card_uses_local_dispatcher`.
- T6: la sortie vers `prepare_attack_card` ne repasse pas par le dispatcher global normal; `blocked_paths` contient `global_dispatcher / prepare_defense_card_handoff_to_prepare_attack_card`.
- Les transitions avec changement de dispatcher portent bien une `note_information`.

**Skills / Operations / Tools**
- T1-T5: runtime `prepare_defense_card` actif, `ai_call_count=2` par tour utile.
- T2: `support_need` passe a `locked`.
- T3: `platform_destination_followup` reduit vers `destination_short`.
- T4: `revise_support_need` remplace la formulation.
- T5: `apply_attempt` produit `blocked_effects=create_defense_card/chat_creation_disabled_platform_handoff`.
- T6: `prepare_attack_card` reprend avec `flow_action=continue_local`, `visible_task=ask_blocker`, ce qui est systemiquement correct.

**Memory / Effets durables**
- `user_defense_cards` reste vide apres le run (`count=0`).
- `committed_effects=[]` sur tous les tours.
- `executed_tools=[]` sur tous les tours.
- `pending_confirmation=null` sur tous les tours.
- Aucun writer de carte n'est observe.

**Problemes**
- Tour 6: le visible agent attaque annonce un brouillon non encore disponible. Famille: `BF-STATE-03`. Impact systeme: la state machine est correcte, mais le message visible anticipe un etat futur. Severite: yellow.

**Fix propose**
- Source amont: prompt visible stage-specific `prepare_attack_card.ask_blocker`.
- Correction recommandee: filtrer le `conversation_context` ou renforcer le prompt pour que `ask_blocker` ne parle jamais de handoff plateforme.
- Tests d'invariant attendus: defense local handoff -> attack local `ask_blocker` avec global skipped; reponse visible = question blocker uniquement; pas de claim de brouillon.

## Verdict Global

Verdict global: **yellow**.

Les nouvelles modifications de `prepare_defense_card` fonctionnent en conditions IA reelles: local dispatcher actif, global skipped pendant le flow, `support_need` seul champ plateforme, revision correcte, apply attempt non-mutant, aucun pending et aucun writer. Le seul probleme observe est hors coeur defense: la transition visible vers `prepare_attack_card` contient une phrase prematuree sur un brouillon.
