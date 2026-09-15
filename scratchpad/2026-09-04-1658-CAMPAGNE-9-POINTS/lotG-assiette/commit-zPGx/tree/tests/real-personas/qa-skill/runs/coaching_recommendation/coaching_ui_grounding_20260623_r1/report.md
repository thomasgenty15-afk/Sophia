# QA Run Report - coaching_ui_grounding_20260623_r1

## 1. Contexte Du Test

- Date: 2026-06-23
- Run: `coaching_ui_grounding_20260623_r1`
- Persona: connexion temporaire locale `qa-skill-coaching-ui-coaching_ui_grounding_20260623_r1@example.com`
- Objectif: verifier en IA reelle les indications UI de `coaching_recommendation` apres passage en elements UI data-like: carte libre hors plan, carte liee au Plan, potion.
- Trajectoire: no-plan coaching -> question destination carte libre -> comparaison hors plan/plan -> correction explicite vers action du Plan -> clarification -> potion.
- Surfaces visees: dispatcher global d'entree, active local flow ownership, `coaching_recommendation`, visible agents `no_plan_coaching`, `action_plan_coaching`, `emotion_coaching`, active state, trace DB.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas de fallback direct, messages choisis tour par tour apres lecture reponse/trace.
- Validite QA: valide. Auth locale verifiee. Aucun code modifie pendant le run.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je bloque sur un mail perso a envoyer, mais ce n'est pas dans mon plan. Je veux juste me debloquer maintenant sans toucher au plan.

**Sophia**
> Je partirais sur une carte d'attaque libre, technique Preparer le terrain : ouvre ton brouillon, enleve tout ce qui distrait, puis pose juste les 3 infos a ecrire pour rendre le demarrage simple.
>
> Si tu veux la retrouver ensuite, va dans Dashboard > Ressources puis choisis ou cree ce type de carte.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: `support_user_with_non_plan_action_coaching`
- executed_tools: none
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Ok, cette carte d'attaque libre, je la cree ou exactement dans Sophia ?

**Sophia**
> Va dans Dashboard > Ressources, puis ouvre la section des cartes d'attaque pour en choisir une ou en creer une nouvelle. Pour ton mail, je partirais sur une carte d'attaque libre, technique Preparer le terrain : ca t'aide a te mettre dans de bonnes conditions avant d'ecrire, sans toucher au reste.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- active_flow_arbitration: `continue_active`, active_owner `coaching_recommendation`
- safety: none
- direct_effects: none
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Et si finalement c'est pour une action de mon plan, envoyer le dossier mutuelle, je prepare la carte au meme endroit ou ailleurs ?

**Sophia**
> Oui, ce n'est pas au meme endroit.
>
> - Pour une action hors plan : tu vas dans Ressources et tu choisis une carte d'attaque libre.
> - Pour une action du plan : tu pars depuis l'action concernee dans le Plan, puis la carte se retrouve ensuite dans Ressources.
>
> Donc ici, pour ton mail perso, reste sur Ressources. Si c'etait le dossier mutuelle, tu la preparerais depuis l'action du Plan.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- active_flow_arbitration: `continue_active`, active_owner `coaching_recommendation`
- safety: none
- direct_effects: none
- durable_effect: none

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-01` - slot fourni mais redemande

**User**
> Ok on change de cible : c'est bien l'action de mon plan envoyer le dossier mutuelle qui bloque au demarrage. Ou je prepare sa carte d'attaque ?

**Sophia**
> Oui, pour l'action de ton plan « envoyer le dossier mutuelle », c'est bien une carte d'attaque liee a cette action. Tu veux surtout savoir ou la preparer, ou ou la retrouver ensuite ?

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- active_flow_arbitration: `continue_active`, active_owner `coaching_recommendation`
- safety: none
- direct_effects: none
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le user demande explicitement "ou je prepare", mais Sophia redemande "preparer ou retrouver".
- Source amont probable: intake/local reducer ne stabilise pas le slot `prepare` du dernier message.
- Owner runtime: `coaching_recommendation` local dispatcher/reducer, branche action du Plan.
- Meilleure correction selon les guidelines: reconnaitre la destination demandee dans le dernier message et ne clarifier que si la demande est vraiment ambigue.
- Pourquoi ce n'est pas un patch local: le probleme porte sur la conservation/lecture du slot de destination, pas sur une phrase exacte.

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - mauvaise transition de flow

**User**
> Je parle bien de la preparer, pas juste de la retrouver.

**Sophia**
> Oui, pour une action hors plan, tu la prepares depuis Ressources. Mais pour te guider proprement : qu'est-ce qui bloque au demarrage de ton mail ?

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- active_flow_arbitration: `continue_active`, active_owner `coaching_recommendation`
- safety: none
- direct_effects: none
- durable_effect: none

**Analyse si yellow/red**
- Symptome: apres correction explicite vers l'action du Plan "envoyer le dossier mutuelle", Sophia revient a l'ancien contexte "mail hors plan".
- Source amont probable: active local state conserve l'ancien `no_plan_action` comme proprietaire semantique au lieu de remplacer la cible sur correction explicite.
- Owner runtime: `coaching_recommendation` reducer/state merge.
- Meilleure correction selon les guidelines: une correction explicite de cible doit remplacer uniquement la cible/action source concernee et recalculer le step context `action_plan_coaching`; l'ancien no-plan context ne doit pas recapturer le tour suivant.
- Pourquoi ce n'est pas un patch local: c'est une transition de state active et de working_state, pas une formulation visible.

### Tour 6

**Verdict du tour:** green

**User**
> On met les cartes de cote. La c'est plutot une pression globale, pas liee a une action precise. Si tu me conseilles une potion, je la trouve ou ?

**Sophia**
> Oui - pour une pression globale, la potion la plus adaptee ici est plutot l'apaisement.
>
> Tu la trouves dans Dashboard > Ressources > Potions. Ensuite, tu choisis celle qui correspond a ton etat et tu peux l'ouvrir depuis la.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- active_flow_arbitration: `continue_active`, active_owner `coaching_recommendation`
- safety: none
- direct_effects: none
- durable_effect: none
- DB state apres tour: `coaching_type=emotional`, `last_visible_task_kind=emotion_coaching`, `platform_destination.user_facing_destination=surface=Dashboard > Ressources; section=Potions; object_type=potion; ...`

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- T1/T2: la carte d'attaque libre est expliquee et la destination est formulee naturellement, sans "comme carte d'attaque libre".
- T3: la distinction hors plan vs action du Plan est comprehensible et utile.
- T6: la destination potion est fluide et ne recopie pas les elements UI data-like.

**Problemes**
- Tour 4: Sophia redemande un slot deja donne. Famille: `BF-INTAKE-01`. Impact: friction inutile. Severite: yellow.
- Tour 5: Sophia oublie la correction explicite vers action du Plan et revient au mail hors plan. Famille: `BF-STATE-01`. Impact: reponse fausse et perte de confiance. Severite: red.

**Fix propose**
- Source amont: reducer/state merge `coaching_recommendation`, transition `no_plan_action` -> `plan_action`.
- Correction recommandee: traiter les corrections explicites de cible/action source comme des remplacements server-owned autorises, recalculer `coaching_type`, `difficulty`, `recommendation_decision` et `step_context`, puis purger les references visibles a l'ancienne cible sauf si elles servent a comparer.
- Tests d'invariant attendus: no-plan active -> correction explicite vers plan action -> prochaine reponse ne mentionne plus l'ancien mail; "preparer" fourni -> pas de clarification preparer/retrouver.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- L'entree dans `coaching_recommendation` est correcte.
- L'active owner est conserve pendant le flow, ce qui respecte l'invariant "pas de dispatcher global pendant flow local actif".
- Le passage semantique vers `emotion_coaching` fonctionne au T6.
- Echec: le passage semantique no-plan -> action du Plan n'est pas stabilise correctement entre T4 et T5.

**Skills / Operations / Tools**
- Aucun outil ni effet durable appele, ce qui est correct pour ce scenario.
- `scheduled_checkins`: 0.

**Memory / Effets durables**
- Pas d'effet durable.
- DB snapshot avant cleanup: `chat_messages=12`, `user_chat_states=1`, `conversation_turn_traces=0`.

**Problemes**
- T5: state actif recapture l'ancienne cible hors plan apres correction explicite. Famille: `BF-STATE-01`. Impact systeme: working_state stale. Severite: red.
- Observabilite: `conversation_turn_traces` ne contient aucune ligne du run, ni par `user_id`, ni par `turn_id like coaching_ui_grounding_20260623_r1*`. Famille: `BF-TEST-01`. Impact: diagnostic DB incomplet, meme si les raw endpoint ont ete sauvegardes. Severite: yellow.
- DB state T6: `coaching_type=emotional` est correct, mais `coaching_type_evidence` conserve une evidence du vieux mail hors plan. Famille: `BF-STATE-01`. Impact: risque de stale evidence future. Severite: yellow.

**Fix propose**
- Source amont: `coaching_recommendation` reducer/state merge + trace persistence du endpoint QA.
- Correction recommandee: ajouter une transition explicite pour correction de cible no-plan -> plan, avec audit de remplacement; garantir que les traces du chemin `/test-send-message` sont persistantes ou documenter la source canonique alternative.
- Tests d'invariant attendus: correction explicite remplace la cible; evidence stale purgee ou scoped; trace persistente presente pour run force_full_ai.

## Verdict Global

**RED**

Le fix de formulation UI est valide sur carte libre et potion. Mais le flow n'est pas safe a considerer green: une correction explicite vers action du Plan est perdue au tour suivant, et le state actif revient a l'ancien mail hors plan. Nettoyage cible effectue: `scheduled_checkins=0`, `user_chat_states=1`, `chat_messages=12`, `conversation_turn_traces=0`, user Auth temporaire supprime status `200`.
