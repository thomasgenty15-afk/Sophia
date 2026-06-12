# QA Run - emotional-repair-local-doctrine-r9

## 1. Contexte Du Test

- Date: 2026-06-11
- Run: `emotional-repair-local-doctrine-r9`
- Persona: connexion temporaire locale `qa-qa-skill-emotional-repair-emotional-repair-local-doctrine-r9@example.com`, `is_test_persona=true`.
- Objectif: relancer le test reel apres le run vert r8 pour confirmer la stabilite du fix local-exit -> second pass global -> `product_help`.
- Trajectoire: entree emotionnelle -> phrase courte sans methode/plan/question -> verification DB active `emotional_repair` -> changement clair vers question produit sur cartes d'attaque.
- Surfaces visees: `emotional_repair`, active flow state, local exit handoff, `note_information`, second pass global, `product_help`, trace finale.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, aucun renderer deterministe, aucun fallback `processMessage`, aucun staging/remote.
- Validite QA: valide. Trois tours HTTP `200`, verification DB apres T2, cleanup cible execute via `scripts/qa-cleanup-run-connection.sh`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J'ai raté une réponse pendant un échange avec mon manager et je suis en train d'en faire une preuve que je ne mérite pas ma place. Aide-moi à remettre ça à sa taille réelle, calmement.

**Sophia**
> C'est souvent le piège : transformer un moment de flottement en un verdict définitif sur ta valeur. Le fait, c'est que tu n'as pas eu la réponse à un instant T face à ton manager. C'est un événement précis, pas une preuve que tu es illégitime. Ta place et tes compétences ne se résument pas à cette seule interaction.

**Trace courte**
- http_status: `200`
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- note_information: `source_flow_id=global_dispatcher`, `target_dispatcher=emotional_repair`
- direct_effects: `[]`
- operation: `none`
- executed_tools: `[]`
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Oui. Fais-moi une phrase courte à garder en tête, pas de méthode, pas de plan, et pas de question.

**Sophia**
> Ce que tu as dit à ton manager est un événement isolé, pas le reflet de ta valeur.

**Trace courte**
- http_status: `200`
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_emotional_repair_local_dispatcher`
- global_dispatcher_skipped: `true`
- verification DB apres T2: `__active_skill_state.skill_id=emotional_repair`, `status=active`
- direct_effects: `[]`
- executed_tools: `[]`

### Tour 3

**Verdict du tour:** green

**User**
> Je change de sujet : dans Sophia, où puis-je retrouver mes cartes d'attaque déjà créées ?

**Sophia**
> Tu trouveras tes cartes d'attaque dans l'onglet **Ressources** de ton dashboard, elles y sont classées par niveau. Tu peux aussi voir un aperçu directement sur la mission ou l'habitude correspondante dans ton **Plan**.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- turn_note_source: `emotional_repair`
- turn_note_target: `global`
- local_exit_source: `emotional_repair`
- local_exit_consumed_by: `global_dispatcher_second_pass`
- local_exit_response_owner: `product_help`
- product_help diagnosis: `mode=inline`, `return_to_parent_flow=true`
- direct_effects: `[]`
- operation: `none`
- executed_tools: `[]`
- durable_effect: none

**Trace active_flow_debug**
- `user_state_loaded`: raw `__active_skill_state.skill_id=emotional_repair`
- `read_active_flow_state`: `active_skill_state.skill_id=emotional_repair`
- `before_run_conversation_routers`: active skill absent apres sortie locale
- `after_run_conversation_routers`: `route_reason=skill_entry_signal`, `route_active_flow_reason_code=no_active_flow`
- La sortie locale reste visible via `local_flow_exit_handoff` et `turnFrame.note_information.source_flow_id=emotional_repair`.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- La reparation emotionnelle est claire et proportionnee.
- La phrase courte respecte les contraintes explicites.
- La question produit recoit une reponse directe.
- Le changement de sujet est fluide et auditable sans message visible mecanique.

**Problemes**
- Aucun probleme bloquant observe.

**Fix propose**
- Aucun fix supplementaire requis pour ce scenario.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T2 prouve que `emotional_repair` est actif et persiste en DB.
- T3 conserve la provenance locale dans la trace finale: `turn_note_source=emotional_repair`, `local_exit_source=emotional_repair`.
- `product_help` reprend en `mode=inline`, pas en standalone silencieux.

**Skills / Operations / Tools**
- `emotional_repair` possede le flow actif avant la sortie locale.
- `product_help` repond au sujet produit apres second pass global documente.
- Aucun tool ni operation engageante appele.

**State / DB**
- Apres T2: `__active_skill_state.skill_id=emotional_repair`.
- Apres T3: la trace conserve le handoff local source vers le second pass global.

**Memory**
- Pas de memoire route utilisee.
- Aucun leak de memoire brute observe.

**Side Effects**
- `direct_effects=[]`, `executed_tools=[]`.
- Aucun effet durable non consenti.

## Verdict Global

`green`.

Le run confirme r8: le changement de sujet pendant `emotional_repair` actif ne devient plus une capture standalone silencieuse par `product_help`. La sortie locale et la note source sont conservees dans la trace finale.
