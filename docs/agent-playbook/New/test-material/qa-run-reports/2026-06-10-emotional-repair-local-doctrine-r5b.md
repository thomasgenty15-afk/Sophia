# QA Run - emotional-repair-local-doctrine-r5b

## 1. Contexte Du Test

- Date: 2026-06-10
- Run: `emotional-repair-local-doctrine-r5b`
- Persona: connexion temporaire locale `qa-qa-skill-emotional-repair-emotional-repair-local-doctrine-r5@example.com`, `is_test_persona=true`.
- Objectif: reverifier en conditions reelles le fix de sortie/changement de sujet pendant un flow local `emotional_repair` actif.
- Trajectoire: entree emotionnelle -> demande de phrase courte sans plan/question -> changement clair vers une question produit sur les cartes d'attaque.
- Surfaces visees: `emotional_repair`, dispatcher local actif, skip du global dispatcher, `exit_to_global_dispatcher`, `note_information`, `product_help`, state DB, side effects.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, aucun renderer deterministe, aucun fallback `processMessage`.
- Validite QA: valide pour `r5b`. Tentative `r5` invalide au tour 2 suite a une erreur de pilotage de cle gateway (`401`), non utilisee pour le verdict.
- Nettoyage: cleanup cible execute via `scripts/qa-cleanup-run-connection.sh` sur la connexion temporaire. Donnees du user QA et Auth local supprimes.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je viens de bafouiller devant deux collegues et je sens que je transforme ca en preuve que je ne suis pas credible. Aide-moi a revenir a quelque chose de plus juste, sans me secouer.

**Sophia**
> Je vous entends, et nous allons rester dans cette douceur. Ce qui s'est passé est un simple accroc de langage, un moment de vulnérabilité devant ces collègues. Il est fréquent que notre esprit transforme un petit bafouillage en un jugement définitif sur notre crédibilité, alors qu'il ne s'agit que d'un fait isolé qui ne définit pas qui vous êtes.

**Trace courte**
- http_status: `200`
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: no route memory
- executed_tools: `[]`
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Oui. Donne-moi juste une phrase courte que je peux me repeter, sans technique, sans plan, et ne me pose pas de question.

**Sophia**
> Mes mots ont trébuché, mais ma compétence reste entière.

**Trace courte**
- http_status: `200`
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_emotional_repair_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: no route memory
- executed_tools: `[]`
- durable_effect: none
- local detail: `flow_action=provide_concrete_phrase`, `visible_task=concrete_phrase`, `global_dispatcher_skipped=true`

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-02` - Ancien flow capture une nouvelle intention

**User**
> Je change de sujet maintenant : dans Sophia, ou est-ce que je retrouve les cartes d'attaque que j'ai deja creees ?

**Sophia**
> Tu peux retrouver tes cartes d'attaque dans l'onglet **Ressources** de ton dashboard, où elles sont classées par niveau. Elles sont également accessibles directement sur la mission ou l'habitude concernée dans ton **Plan**.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: no route memory
- executed_tools: `[]`
- durable_effect: none
- local detail: `active_flow_arbitration.reason_code=no_active_flow`, `note_information=null`, `operation_flow_run=null`

**Analyse si yellow/red**
- Symptome: la reponse produit est utile, mais le changement de dispatcher contourne encore le dispatcher local source.
- Source amont probable: persistance ou rechargement de `__active_skill_state` entre T2 et T3, avant la branche active `emotional_repair`.
- Owner runtime: active flow state / normal reply persistence / conversation route persistence.
- Meilleure correction selon les guidelines: garantir qu'apres un tour local `emotional_repair` en `continue`, l'etat actif persiste et est recharge au tour suivant avant tout dispatch global; le dispatcher local doit produire `exit_to_global_dispatcher` + `note_information`.
- Pourquoi ce n'est pas un patch local: le prompt local sait deja produire les sorties; au T3, le runtime indique `no_active_flow`, donc le dispatcher local source n'a pas recu le tour.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- L'entree emotionnelle est comprise.
- La contrainte "phrase courte, sans technique, sans plan, pas de question" est respectee.
- La reponse produit visible est utile pour l'utilisateur.

**Problemes**
- Tour 3: la transition visible est fluide, mais le systeme ne prouve pas la sortie doctrinale du flow sensible. Famille: `BF-ROUTE-02`. Impact utilisateur direct faible sur ce tour, impact systeme eleve pour auditabilite et handoffs.

**Fix propose**
- Source amont: state active-flow entre `handleOperationRuntimeResponse`, `persistNormalReplyTurn` et `persistConversationSkillRoute`.
- Correction recommandee: ajouter une preuve contractuelle que tout `skillOutput.status=continue` de `emotional_repair` persiste `__active_skill_state.skill_id=emotional_repair`, puis que le tour suivant charge cet etat avant dispatcher global.
- Tests d'invariant attendus: integration `test-send-message` T1/T2/T3, assertion DB apres T2, assertion trace T3 `active_emotional_repair_local_dispatcher` puis `exit_to_global_dispatcher` avec `note_information`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1: entree `emotional_repair` correcte par `skill_entry_signal`.
- T2: flow actif maintenu, global dispatcher bloque, `flow_action=provide_concrete_phrase`.
- T3: regression persistante. `product_help` est selectionne comme standalone avec `active_flow_arbitration=no_active_flow`, alors que T2 venait de continuer `emotional_repair`.

**Skills / Operations / Tools**
- Aucun tool ni operation engageante appele.
- `product_help` repond correctement au contenu produit, mais sans note de transition locale documentee.

**State / DB**
- Apres T3, `user_chat_states.temp_memory.__active_skill_state.skill_id=product_help`.
- `previous_skill_id=null`.
- `product_help_note_information=null`.
- `__conversation_risk_last.should_exit_flows=false`.

**Memory**
- Pas de memoire route utilisee.
- Aucun leak de memoire brute observe.

**Side Effects**
- `direct_effects=[]`, `executed_tools=[]`, `tool_execution=none` sur les tours.
- Aucun effet durable non consenti observe.

**Fix concret**
- Le fix precedent qui bloque la purge `conversation_risk` et protege `product_help` dans `persistConversationSkillRoute` ne couvre pas la cause reelle observee.
- Corriger le point ou l'etat actif `emotional_repair` disparait ou n'est pas recharge apres un tour local `continue`.

## Verdict Global

`red` systeme.

Le run confirme que la partie prompt/local dispatcher fonctionne pour la phrase courte, mais le bug de changement de sujet pendant flow actif reste present en conditions reelles. R4-B01 ne peut pas passer en `verified`; il doit etre rouvert.
