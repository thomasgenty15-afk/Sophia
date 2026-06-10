# QA Run - emotional-repair-local-doctrine-r4

## 1. Contexte Du Test

- Date: 2026-06-09
- Run: `emotional-repair-local-doctrine-r4`
- Persona: persona temporaire locale `qa-normal-emotional-repair-local-doctrine-r4-...@example.com`, Auth vérifié `200`.
- Objectif: vérifier en conditions réelles les modifications du prompt dispatcher local `emotional_repair`, notamment remplissage champ par champ, contrainte "phrase courte", stop local et transition vers autre sujet.
- Trajectoire: entrée émotionnelle -> phrase courte contrainte -> stop local -> nouvelle entrée émotionnelle -> changement de sujet produit.
- Surfaces visées: `emotional_repair`, dispatcher local actif, `visible_task.conversation_context`, skip du dispatcher global, `stop_local_no_handoff`, `product_help`, state DB, side effects.
- Cadre IA réel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, aucun renderer déterministe, aucun fallback `processMessage`.
- Validité QA: valide. Run exécuté hors sandbox comme demandé par les guidelines.
- Nettoyage: cleanup ciblé exécuté sur `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, `auth.users`. `user_memories` a répondu `404` car table absente localement. Le fichier de state contenant les jetons locaux a été supprimé.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je me suis plante devant mon equipe ce matin et depuis je me parle comme si j'etais un incapable. J'ai besoin que tu m'aides a redescendre sans me juger.

**Sophia**
> Je suis là avec toi. C'est un moment vraiment éprouvant, et il est normal que tu te sentes secoué après ce qui s'est passé devant ton équipe. Mais ce raté de ce matin est un événement, pas ta définition. Tu n'es pas ce mot « incapable », même si ta voix intérieure essaie de te le faire croire en ce moment. On peut simplement rester là, dans cet espace sans aucun jugement.

**Trace courte**
- http_status: `200`
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: no route memory
- executed_tools: `[]`
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Oui, garde juste une phrase courte pour m'aider a separer ce moment de ma valeur. Pas d'exercice, pas de plan, pas de question.

**Sophia**
> J'ai commis une erreur, mais je ne suis pas cette erreur ; ma valeur reste entière, indépendamment de ce moment précis.

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

**Verdict du tour:** green

**User**
> Merci, on peut s'arreter ici. Je ne veux pas continuer sur ce sujet maintenant.

**Sophia**
> Je comprends tout à fait. On s'arrête ici pour le moment. Prends bien soin de toi.

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
- local detail: `flow_action=stop_local_no_handoff`, `visible_task=exit_or_cancel`, `status=complete`, `global_dispatcher_skipped=true`, active skill cleared after turn

### Tour 4

**Verdict du tour:** green

**User**
> En fait il reste un petit pic de honte quand j'y repense, juste aide-moi a ne pas repartir dans l'auto-attaque.

**Sophia**
> Ce pic de honte est une réaction très vive, mais il ne définit pas qui tu es. Je reste simplement là avec toi pour traverser ce moment sans te laisser emporter par l'auto-critique.

**Trace courte**
- http_status: `200`
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: no route memory
- executed_tools: `[]`
- durable_effect: none

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-02` - Ancien flow capture une nouvelle intention

**User**
> Je change de sujet : dans l'app, ou est-ce que je peux retrouver mes cartes d'attaque deja creees ?

**Sophia**
> Tu peux retrouver tes cartes d'attaque dans l'onglet Ressources de ton Dashboard. Elles y sont rangées par niveau une fois qu'elles ont été générées.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: no route memory
- executed_tools: `[]`
- durable_effect: none
- local detail: `active_flow_arbitration.reason_code=no_active_flow`, `product_help_note_information=null`

**Analyse si yellow/red**
- Symptôme: la réponse produit est utile, mais le changement de dispatcher n'est pas prouvé doctrinalement. Le tour arrive à `product_help` comme une entrée standalone, sans `note_information`.
- Source amont probable: active flow/routing transverse nettoie ou ignore l'état actif `emotional_repair` avant que le dispatcher local puisse produire `exit_to_global_dispatcher`.
- Owner runtime: active flow policy / router, avec contrat de handoff local `emotional_repair -> global/product_help`.
- Meilleure correction selon les guidelines: empêcher la reprise product/global silencieuse pendant un flow actif ; forcer le dispatcher local actif à produire `exit_to_global_dispatcher` + `note_information`, ou transformer la purge transverse en exit documenté.
- Pourquoi ce n'est pas un patch local: le prompt `emotional_repair` est désormais mieux renseigné, mais le runtime ne lui donne pas la main au tour 5.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia répond mieux au besoin humain immédiat qu'au run R3.
- La demande "une phrase courte, pas de plan, pas de question" est respectée précisément.
- Le stop local est naturel, court, et ne relance pas le sujet sensible.
- Le changement produit est compréhensible côté utilisateur.

**Problemes**
- Tour 5: la fluidité visible est correcte, mais le handoff système n'est pas conforme. Famille: `BF-ROUTE-02`. Impact UX direct faible sur ce tour, risque élevé pour auditabilité et handoffs sensibles. Sévérité système: red.

**Fix propose**
- Source amont: active flow policy / router.
- Correction recommandée: pendant un flow actif, donner d'abord la main au dispatcher local source pour tout changement de sujet, afin qu'il émette `exit_to_global_dispatcher` avec `note_information`.
- Tests d'invariant attendus: changement de sujet produit pendant `emotional_repair` actif, changement de sujet normal coaching, safety preempt, et vérification trace `note_information`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1 et T4: entrée `emotional_repair` correcte par `skill_entry_signal`.
- T2: flow actif maintenu, global dispatcher bloqué, `flow_action=provide_concrete_phrase`.
- T3: flow actif maintenu, global dispatcher bloqué, `flow_action=stop_local_no_handoff`, active skill cleared après le tour. Le bug R3-B01 est vérifié corrigé en conditions réelles.
- T5: `product_help` répond correctement, mais `active_flow_arbitration=no_active_flow` alors que T4 avait réactivé `emotional_repair`. Aucune `note_information` visible.

**Skills / Operations / Tools**
- Aucun tool ni operation suggestion exécuté.
- Aucun side effect durable créé.
- Aucun executor appelé directement par un skill conversationnel.

**State / DB**
- Après T2: `__active_skill_state.skill_id=emotional_repair`, `turn_count=2`.
- Après T3: `__active_skill_state=null`, conforme à `stop_local_no_handoff`.
- Après T4: `__active_skill_state.skill_id=emotional_repair`, actif.
- Après T5: `__active_skill_state.skill_id=product_help`, `product_help_note_information=null`, `previous_skill_id=null`.

**Memory**
- Pas de mémoire route utilisée.
- Pas de mémoire brute leakée au visible prompt observée.

**Side Effects**
- `direct_effects=[]`, `executed_tools=[]`, `tool_execution=none` sur tous les tours.
- Aucun effet durable non consenti observé.

**Fix concret**
- Ne pas patcher par regex. Corriger l'orchestration active-flow pour que le dispatcher local source possède le tour avant toute sortie globale/produit, ou que la purge transverse produise une `note_information` canonique.

## Verdict Global

`red` système, `green` sur les modifications prompt `emotional_repair`.

Le correctif demandé fonctionne pour la contrainte "phrase courte" et pour `stop_local_no_handoff`. Il ne suffit pas à corriger la transition active vers `product_help`, car le runtime ne laisse pas le dispatcher local source produire une `note_information` au tour de changement de sujet.
