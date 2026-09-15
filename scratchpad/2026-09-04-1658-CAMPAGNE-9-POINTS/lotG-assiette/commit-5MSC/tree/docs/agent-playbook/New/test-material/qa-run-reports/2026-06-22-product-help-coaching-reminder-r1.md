# QA Run Report - Product Help / Coaching Recommendation / One-Shot Reminder R1

## 1. Contexte Du Test

- Date: 2026-06-22
- Run: `product-help-coaching-reminder-20260622-r1`
- Persona: user QA local temporaire `qa-qa-skill-ph-coach-reminder-product-help-coaching-reminder-20260622-r1@example.com`
- Objectif: verifier les corrections Product Help / Coaching Recommendation / one-shot reminder multi-intent.
- Trajectoire: Product Help initial -> follow-up ambigu acceptable en Product Help -> Product Help + rappel ponctuel explicite -> questions Product Help autonomes -> anti-faux-positif reminder.
- Surfaces visees: dispatcher global, `product_help`, active flow arbitration, direct effects, EffectLedger, `scheduled_checkins`, `user_chat_states.temp_memory.__active_skill_state`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `include_trace=true`, aucun renderer deterministe, aucun fallback direct, aucun staging/deploy, aucun redemarrage Supabase.
- Validite QA: valide. Connexion QA temporaire creee, auth verifiee par le runner, 6 tours HTTP 200, raw et snapshots DB sauvegardes dans `tmp/qa-one-shot-transverse/product-help-coaching-reminder-20260622-r1/`, cleanup cible effectue.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je mélange un peu les choses dans Sophia : ajuster une action de mon plan et préparer une carte d'attaque, ça change quoi concrètement ?

**Sophia**
> Oui : l’ajustement du plan sert à corriger l’action elle-même si elle ne colle plus. La carte d’attaque, elle, sert à préparer le passage à l’action pour qu’il soit plus simple au bon moment.
>
> En bref : si le problème est le fond, c’est l’ajustement ; si le problème est le démarrage, c’est la carte d’attaque.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `explain product difference between plan item adjustment and attack card preparation`
- executed_tools: []
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> D'accord. Si mon souci c'est surtout de réussir à commencer tout de suite, sans réécrire l'action du plan, je devrais partir sur quoi ?

**Sophia**
> Pars sur une carte d’attaque. C’est l’option faite pour t’aider à démarrer tout de suite, sans réécrire l’action du plan. Tu la retrouves depuis Dashboard > Plan, sur la mission ou l’habitude concernée.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `minimal product-context follow-up`
- executed_tools: []
- durable_effect: none
- note: `coaching_recommendation` ne s'est pas active; aucune clarification taxonomique observee.

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-EFFECT-02 - Effet attendu absent; BF-LEDGER-01 - Claim/ledger incoherent autour du commit

**User**
> Question produit : une carte d'attaque déjà préparée peut encore être retouchée après coup ? Et rappelle-moi demain à 9h de vérifier ça.

**Sophia**
> Oui, mais pas librement : une carte d’attaque déjà générée ne se retouche pas comme tu veux. Si le contenu ne convient plus, il faut repartir sur une nouvelle version. Et si tu veux, je peux aussi t’aider à formuler le rappel de demain à 9h de façon claire.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_with_direct_effects`
- safety: `none`
- turn_frame.direct_effects: `create_one_shot_reminder`, explicit, high confidence, target_status `identified`, `when_hint=demain à 9h`, `instruction_hint=vérifier ça`
- skill_signals: `product_help.detected=true`, high confidence, reason `product_help_question_with_one_shot_reminder`
- route_decision.direct_effects_to_run: [`create_one_shot_reminder`]
- operation: none
- pending_confirmation: none
- memory_plan: `question_produit_and_reminder`
- executed_tools: []
- effect_ledger: counts all `0`, entries `[]`
- durable_effect: no `scheduled_checkins` row
- visible claim check: no false "programmé" claim.

**Analyse si yellow/red**
- Symptome: le dispatcher detecte correctement Product Help + one-shot reminder et route le direct effect, mais aucun executor ne tourne, aucun ledger entry n'est produit, aucun reminder n'est cree, et aucun blocage explicite n'est trace.
- Source amont probable: admission/execution des `direct_effects_to_run` quand `response_owner=product_help`, ou pipeline EffectLedger qui ne materialise pas l'effet route.
- Owner runtime: global dispatcher / direct effect execution lane / EffectLedger integration.
- Meilleure correction selon les guidelines: lorsqu'un direct effect explicite est dans `route_decision.direct_effects_to_run`, le pipeline doit soit l'executer et inscrire commit/failed/blocked dans l'EffectLedger, soit produire un blocage structure clair qui contraint la reponse visible.
- Pourquoi ce n'est pas un patch local: la detection semantique est deja bonne; le bug est dans le contrat runtime entre routing, executor et ledger, pas dans une phrase ou regex de rappel.

### Tour 4

**Verdict du tour:** green

**User**
> Je reviens au fonctionnement : quand Sophia me propose une carte d'attaque, est-ce que mon plan est changé automatiquement ou la carte reste à part ?

**Sophia**
> La carte d’attaque reste à part : elle prépare le passage à l’action, sans changer ton plan. Si ton souci, c’est que l’action elle-même n’est plus adaptée, là il faut plutôt passer par l’ajustement du plan.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `answer_product_behavior_question`
- executed_tools: []
- durable_effect: none
- active state: no `active_coaching_recommendation`; DB after run has `__active_skill_state=null`.

### Tour 5

**Verdict du tour:** green

**User**
> Question produit seulement : après avoir préparé une carte d'attaque, je la retrouve dans quel endroit de Sophia ?

**Sophia**
> Tu la retrouves dans Dashboard > Ressources, rangée par niveau. Elle peut aussi apparaître en aperçu depuis la mission ou l’habitude concernée dans le Plan. Limite : si elle n’a pas été générée, elle n’est pas disponible là-bas.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `answer_product_question_about_card_location`
- executed_tools: []
- durable_effect: none
- active state: no `active_coaching_recommendation`.

### Tour 6

**Verdict du tour:** green

**User**
> Et si je veux juste consulter les cartes que j'ai déjà, ça crée une nouvelle carte ou c'est uniquement une vue ?

**Sophia**
> C’est juste une vue : tu la retrouves dans Dashboard > Ressources. Si une carte liée au plan existe déjà, elle apparaît là, sans en créer une nouvelle.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- memory_plan: `answer_product_surface_question`
- executed_tools: []
- durable_effect: none
- anti-faux-positif: no `create_one_shot_reminder`.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- T1/T2: les explications Product Help sont claires, courtes et contextualisees.
- T2: pas de clarification brutale du type "action du plan / action hors plan / etat emotionnel".
- T4/T5/T6: Sophia reste sur des reponses produit autonomes et n'est pas capturee par un ancien flow coaching.
- T3: Sophia ne dit jamais que le rappel est programme alors qu'aucun commit n'existe.

**Problemes**
- Tour 3: la demande de rappel explicite n'est pas honoree; Sophia propose seulement d'aider a la formuler alors que le signal est high confidence et route pour execution. Famille: BF-EFFECT-02 / BF-LEDGER-01. Impact: l'utilisateur croit devoir reformuler une demande pourtant claire. Severite: red systeme, yellow visible car il n'y a pas de faux commit.

**Fix propose**
- Source amont: direct effect execution lane apres arbitrage Product Help.
- Correction recommandee: composer la reponse produit avec le resultat reel du direct effect: confirmation si commit, blocage/clarification si blocage, aucune mention de programmation sinon.
- Tests d'invariant attendus: Product Help + "rappelle-moi demain a 9h de X" doit creer un `scheduled_checkins` ou tracer un blocage structure; Product Help seul ne doit pas creer de reminder.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1/T2/T4/T5/T6: `response_owner=product_help`, coherent.
- T3: routage semantique correct: `skill_signals.product_help` high + `turn_frame.direct_effects[0].effect_type=create_one_shot_reminder` + `route_decision.direct_effects_to_run=["create_one_shot_reminder"]`.
- `coaching_recommendation_exit_to_global` n'a pas ete exerce dans cette branche, car Coaching Recommendation ne s'est jamais active; DB post-run confirme toutefois aucun active state stale.

**Skills / Operations / Tools**
- Aucun tool execute sur les 6 tours.
- Le probleme est precisement T3: un direct effect route comme `to_run` ne passe pas dans la lane executor.

**Memory / Effets durables**
- DB post-run sauvegardee: `user_chat_states.temp_memory.__active_skill_state=null`.
- `scheduled_checkins`: `0`, donc aucun rappel cree.
- `chat_messages`: `12` avant cleanup.
- `conversation_turn_traces` REST: requete valide mais `0` rows; les traces inline renvoyees par `/test-send-message` sont sauvegardees dans `raw.jsonl`.
- Cleanup cible: complete pour la connexion temporaire et le user QA.

**Problemes**
- Tour 3: effet attendu absent malgre detection/routage. Famille: BF-EFFECT-02. Impact systeme: perte du one-shot reminder dans un tour multi-intent Product Help. Severite: red.
- Tour 3: EffectLedger vide alors que le routeur declare un direct effect a lancer. Famille: BF-LEDGER-01. Impact systeme: impossible de distinguer execute/blocked/failed dans les traces persistantes. Severite: red.

**Fix propose**
- Source amont: pipeline `route_decision.direct_effects_to_run` -> executor direct effects -> EffectLedger -> final response guard.
- Correction recommandee: garantir l'invariant "direct_effects_to_run non vide implique ledger entry terminale" (`committed`, `blocked` ou `failed`) et execution effective lorsque le payload est high confidence.
- Tests d'invariant attendus: integration locale `/test-send-message force_full_ai=true` pour Product Help + one-shot reminder, avec assertion `scheduled_checkins=1`, `executed_tools` contient `create_one_shot_reminder`, EffectLedger commit; anti-FP Product Help sans rappel `scheduled_checkins=0`.

## Verdict Global

- Verdict: red
- Raison principale: T3 detecte et route `create_one_shot_reminder`, mais ne l'execute pas, ne cree aucun reminder et ne trace aucun blocage explicite.
- Follow-up prioritaire: corriger la liaison `direct_effects_to_run` -> executor/EffectLedger pour les tours Product Help multi-intent, puis relancer ce scenario.
