# QA Run - emotional-repair-local-doctrine-r7

## 1. Contexte Du Test

- Date: 2026-06-11
- Run: `emotional-repair-local-doctrine-r7`
- Persona: connexion temporaire locale `qa-qa-skill-emotional-repair-emotional-repair-local-doctrine-r7@example.com`, `is_test_persona=true`.
- Objectif: relancer en conditions reelles le scenario `emotional_repair` actif -> changement de sujet produit, avec les nouvelles traces `active_flow_debug`.
- Trajectoire: entree emotionnelle -> demande de phrase courte sans plan/question -> verification DB du flow actif -> changement clair vers une question produit sur les cartes d'attaque.
- Surfaces visees: `emotional_repair`, active flow state loader, dispatcher local actif, second passage global apres sortie locale, `note_information`, `product_help`, state DB.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, aucun renderer deterministe, aucun fallback `processMessage`, aucun staging/remote.
- Validite QA: valide. Connexion temporaire creee, trois tours HTTP `200`, verification DB apres T2 et T3, cleanup cible execute via `scripts/qa-cleanup-run-connection.sh`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J'ai eu un blanc devant mon équipe ce matin, et je suis en train d'en faire une preuve que je ne suis pas légitime. Aide-moi à remettre ça à sa vraie taille, sans me brusquer.

**Sophia**
> C'est tout à fait compréhensible que ce moment t'ait bousculé. Ce blanc est un événement isolé, un simple court-circuit comme il en arrive à tout le monde. Il appartient au déroulement de la réunion, mais il ne définit pas ta valeur ni ta légitimité. On peut prendre le temps de regarder ce fait pour ce qu'il est, sans le laisser peser sur qui tu es.

**Trace courte**
- http_status: `200`
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- active_flow_arbitration: `no_active_flow`
- note_information: `source_flow_id=global_dispatcher`, `target_dispatcher=emotional_repair`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: no route memory
- executed_tools: `[]`
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Oui. Donne-moi juste une phrase très courte à garder pour aujourd'hui, sans exercice, sans plan, et sans me poser de question.

**Sophia**
> J'ai eu un blanc ce matin, c'est un incident de parcours, pas ma définition.

**Trace courte**
- http_status: `200`
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_emotional_repair_local_dispatcher`
- operation_flow_run: `mode=conversation_skill_local_flow`, `status=continue`, `global_dispatcher_skipped=true`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- executed_tools: `[]`
- verification DB apres T2: `__active_skill_state.skill_id=emotional_repair`, `status=active`

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-02` - Active flow / interruption policy non respectee

**User**
> Je change de sujet : dans Sophia, où est-ce que je retrouve les cartes d'attaque que j'ai déjà créées ?

**Sophia**
> Tu trouveras tes cartes d'attaque dans l'onglet **Ressources** de ton dashboard, rangées par niveau. Elles sont aussi visibles directement sur tes missions ou tes habitudes dans ton **Plan**.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- active_flow_arbitration: `decision=none`, `active_owner=none`, `reason_code=no_active_flow`
- note_information visible finale: `source_flow_id=global_dispatcher`, `target_dispatcher=product_help`
- product_help diagnosis: `mode=standalone`, `active_flow_used=false`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- executed_tools: `[]`
- verification DB apres T3: `__active_skill_state.skill_id=product_help`, `status=active`

**Trace active_flow_debug**
- `user_state_loaded`: raw `__active_skill_state.skill_id=emotional_repair`, `status=active`
- `after_onboarding_and_reconcile`: raw `__active_skill_state.skill_id=emotional_repair`, `status=active`
- `read_active_flow_state`: `active_skill_state.skill_id=emotional_repair`
- `after_pending_confirmation_reload`: `active_skill_state.skill_id=emotional_repair`
- `before_run_conversation_routers`: raw active key absent, `active_skill_state=null`
- `after_run_conversation_routers`: `route_reason=skill_entry_signal`, `route_active_flow_reason_code=no_active_flow`

**Analyse si yellow/red**
- Symptome: la reponse produit est utile, mais la trace finale masque le passage par le dispatcher local source et presente `product_help` comme standalone.
- Source amont probable: branche runtime active `emotional_repair` entre `after_pending_confirmation_reload` et `before_run_conversation_routers`.
- Owner runtime: `router/run.ts` branche active `emotional_repair`, sortie locale, propagation de `note_information`, trace finale.
- Meilleure correction selon les guidelines: si `emotional_repair` decide de quitter vers global, la trace finale doit conserver la sortie locale (`source_flow=emotional_repair`, `exit_to_global_dispatcher`, `note_information`) et le second passage global ne doit pas ecraser cette provenance par `global_dispatcher -> product_help`.
- Pourquoi ce n'est pas un patch local: le loader DB fonctionne. Le probleme n'est plus la persistance post-T2; c'est la transition locale -> global et son audit trail.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- T1 et T2 sont humains, doux, et respectent la contrainte utilisateur.
- T3 repond correctement a la question produit.

**Problemes**
- Tour 3: la transition systeme n'est pas auditably doctrinale. L'utilisateur voit une bonne reponse, mais le runtime final ne montre pas la sortie locale obligatoire depuis `emotional_repair`. Famille: `BF-ROUTE-02`. Impact UX direct faible, impact fiabilite/audit eleve.

**Fix propose**
- Source amont: branche active `emotional_repair` dans `router/run.ts`, puis construction de la trace globale finale.
- Correction recommandee: enrichir/propager explicitement le memo de sortie locale dans le second passage global et dans `route_decision` final; ne pas laisser `note_information` finale devenir uniquement `global_dispatcher -> product_help`.
- Tests d'invariant attendus: T3 doit montrer `active_flow_debug` avec sortie locale, `note_information.source_flow_id=emotional_repair` ou champ equivalent de handoff source, et `product_help` ne doit pas etre `mode=standalone` si la demande vient d'un flow actif.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1: entree `emotional_repair` correcte.
- T2: reprise locale correcte, DB active state correcte.
- T3: le debug prouve que l'etat est lu correctement depuis DB puis disparait avant `runConversationRouters`.
- Interpretation: le bug n'est pas dans le chargement DB. Le flow actif est quitte dans le runtime local avant le second passage global, mais la sortie n'est pas visible comme `exit_to_global_dispatcher` dans la trace finale.

**Skills / Operations / Tools**
- Aucun tool ni operation engageante.
- `product_help` repond en `mode=standalone`, alors que le message etait issu d'une conversation avec `emotional_repair` actif.

**State / DB**
- Apres T2: `__active_skill_state.skill_id=emotional_repair`.
- Au debut T3: trace `user_state_loaded` confirme `emotional_repair`.
- Avant router global T3: raw active key absent.
- Apres T3: `__active_skill_state.skill_id=product_help`.

**Memory**
- Pas de memoire route utilisee.
- Aucun leak de memoire brute observe.

**Side Effects**
- `direct_effects=[]`, `executed_tools=[]`, `tool_execution=none`.
- Aucun effet durable non consenti observe.

**Fix concret**
- Ajouter une trace persistante dans la branche `skillOutput.status === "exit"` de `emotional_repair`, visible dans `conversation_turn_trace`, pas seulement dans `brain-trace`.
- Propager `attachNoteInformationToLocalExitMemo` vers le second passage global de maniere auditée.
- Faire en sorte que le `product_help` de second passage sache qu'il vient d'une sortie `emotional_repair` et ne se declare pas `standalone`.

## Verdict Global

`red` systeme.

Le run est valide et les nouvelles traces ont localise la panne: `emotional_repair` n'est pas perdu au chargement DB. Il est lu correctement, puis l'etat actif est supprime avant le router global, probablement dans la branche de sortie locale `emotional_repair`; cette sortie n'est pas conservee comme `note_information` exploitable dans la trace finale.
