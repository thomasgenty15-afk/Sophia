# QA Run Report - coachingrec-defense-naming-20260626-r1

## 1. Contexte Du Test

- Date: 2026-06-26
- Run: `coachingrec-defense-naming-20260626-r1`
- Persona: user QA temporaire `qa-normal-coachingrec-defense-naming-20260626-r1-1782470924864@example.com`
- Objectif: verifier que les visibles agents `action_plan_coaching` et `no_plan_coaching` ne presentent plus les techniques de carte d'attaque comme des techniques de carte de defense.
- Trajectoire: action du Plan `Preparer le dossier mutuelle` -> defense in-plan -> clarification "mot de bascule" -> guidance produit Plan -> action hors plan -> defense libre -> guidance Ressources.
- Surfaces visees: dispatcher global, active flow ownership, dispatcher local `coaching_recommendation`, visibles `action_plan_coaching` et `no_plan_coaching`, absence de direct effect.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide avec incidents. 5 tours exploitables HTTP 200 et 2 tours HTTP 502 inclus dans le rapport. Cleanup cible effectue: `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, `auth.users`; `user_memories` 404 car table absente.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** N/A

**User**
> Dans mon Plan, j’ai Préparer le dossier mutuelle. J’arrive à ouvrir les justificatifs, mais après deux ou trois minutes je décroche et je finis sur YouTube. Tu conseillerais une carte d’attaque ou une carte de défense ?

**Sophia**
> La carte d’attaque aide à **démarrer** quand ça bloque au premier geste. La carte de défense aide à **tenir** quand tu décroches en cours de route ou que YouTube t’embarque.
>
> Ici, je partirais sur une **carte de défense** : au moment critique, tu identifies le piège visible, tu prévois un geste de retour en moins de 30 secondes, et un plan B simple pour reprendre le dossier sans repartir sur YouTube.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: none
- active local state: `coaching_type=plan_action`, `last_visible_task_kind=action_plan_coaching`, `current_recommendation=defense_card`, `visible_decision.lever=defense_card`, `variant=null`, `pending_type_change=null`

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** N/A

**User**
> Donc pour une carte de défense je ne dois pas choisir un mot de bascule ? Je prépare quoi à la place, concrètement ?

**Sophia**
> Oui : pour une carte de défense, tu ne choisis pas un mot de bascule. Tu prépares plutôt 4 choses : le moment critique, le piège visible, un geste de retour en moins de 30 secondes, et un plan B simple. Ici, ça peut donner : "au bout de 2-3 minutes sur les justificatifs, je sens l’envie d’ouvrir YouTube" ; piège = l’onglet ou l’impulsion d’évasion ; geste de retour = fermer YouTube et revenir juste au prochain justificatif ; plan B = faire une seule pièce du dossier puis arrêter 1 minute.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: none
- active local state: `coaching_type=plan_action`, `last_visible_task_kind=action_plan_coaching`, `current_recommendation=defense_card`, `visible_decision.lever=defense_card`, `variant=null`, `pending_type_change=null`

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Ok, et cette carte de défense liée à Préparer le dossier mutuelle, je la prépare où exactement dans Sophia ? Ne crée rien depuis le chat.

**Sophia**
> [reponse vide - HTTP 502]

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: null
- direct_effects: `[]`
- operation: null
- pending_confirmation: null
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: none
- active local state apres incident: toujours `coaching_recommendation`, `coaching_type=plan_action`, `current_recommendation=defense_card`, `pending_type_change=null`

**Analyse si yellow/red**
- Symptome: endpoint local retourne 502 sans reponse assistant ni trace utile.
- Source amont probable: runtime/provider/test endpoint, pas le flow coaching.
- Owner runtime: infrastructure QA / upstream LLM runtime.
- Meilleure correction selon les guidelines: rendre l'erreur observable avec trace systeme exploitable et eviter les reponses vides 502 sur skill actif.
- Pourquoi ce n'est pas un patch local: le flow state reste correct; l'incident est un echec HTTP sans sortie Sophia.

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** N/A

**User**
> Je reprends ma question : pour cette carte de défense liée à Préparer le dossier mutuelle, je la prépare où exactement dans Sophia ? Ne crée rien depuis le chat.

**Sophia**
> Tu la prépares dans **Dashboard > Plan**, en ouvrant l’action **“Préparer le dossier mutuelle”** puis en lançant la **carte de défense** depuis cette action.
>
> Si tu veux la retrouver plus tard, elle sera dans **Ressources**.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: none
- active local state: `coaching_type=plan_action`, `last_visible_task_kind=action_plan_coaching`, `current_recommendation=defense_card`, `pending_type_change=null`

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Autre cas : j’ai un mail perso à écrire à Camille, il n’est pas dans mon Plan. J’arrive à commencer, puis je panique après quelques lignes et je ferme le brouillon. Tu me conseillerais quoi ?

**Sophia**
> [reponse vide - HTTP 502]

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: null
- direct_effects: `[]`
- operation: null
- pending_confirmation: null
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: none
- active local state apres incident: toujours `coaching_recommendation`, `coaching_type=plan_action`, `current_recommendation=defense_card`, `pending_type_change=null`

**Analyse si yellow/red**
- Symptome: deuxieme 502 sans reponse ni trace exploitable.
- Source amont probable: runtime/provider/test endpoint.
- Owner runtime: infrastructure QA / upstream LLM runtime.
- Meilleure correction selon les guidelines: investiguer la stabilite du chemin `/functions/v1/test-send-message` et exposer une trace d'erreur exploitable.
- Pourquoi ce n'est pas un patch local: aucune mutation ni mauvais reducer observe; le tour ne produit pas de sortie.

### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-03 - Contrainte explicite perdue

**User**
> Je reprends l’autre cas : le mail perso à Camille n’est pas dans mon Plan. Je commence à écrire, puis après quelques lignes je panique et je ferme le brouillon. Là tu me conseillerais quoi ?

**Sophia**
> Tu la prépares dans Dashboard > Ressources : tu ouvres Ressources, puis tu choisis ou crées une carte de défense là-bas. Pour ton mail à Camille, je partirais sur une carte de défense, avec un moment critique clair, le piège à repérer, un geste de retour en moins de 30 secondes et un plan B simple pour rouvrir le brouillon sans repartir de zéro.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: none
- active local state: `coaching_type=no_plan_action`, `last_visible_task_kind=no_plan_coaching`, `current_recommendation=defense_card`, `visible_decision.lever=free_defense_card`, `variant=null`, `pending_type_change=null`

**Analyse si yellow/red**
- Symptome: Sophia donne la bonne recommandation, mais commence par une guidance produit alors que le dernier message demande d'abord "tu me conseillerais quoi ?".
- Source amont probable: dernier message apres un 502 + preservation du contexte produit precedent; priorisation excessive de destination produit dans le visible no-plan.
- Owner runtime: `coaching_recommendation/no_plan_coaching`.
- Meilleure correction selon les guidelines: quand le dernier message demande un conseil et non "ou trouver", repondre d'abord au choix de levier; mentionner la destination seulement en second plan ou attendre une question produit.
- Pourquoi ce n'est pas un patch local: il faut renforcer la priorite du dernier message user dans le visible agent, pas reformuler ce cas exact.

### Tour 7

**Verdict du tour:** green

**Famille de bugs si yellow/red:** N/A

**User**
> Ok, et cette carte de défense libre pour le mail à Camille, je la trouve où exactement ? Je veux juste savoir où aller.

**Sophia**
> Tu la trouves dans **Dashboard > Ressources**. Ouvre **Ressources**, puis choisis ou crée une carte de défense libre pour ton mail à Camille. Si tu veux, je peux aussi te dire quoi mettre dedans.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: non observe
- executed_tools: `[]`
- durable_effect: none
- active local state: `coaching_type=no_plan_action`, `last_visible_task_kind=no_plan_coaching`, `current_recommendation=defense_card`, `visible_decision.lever=free_defense_card`, `variant=null`, `pending_type_change=null`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia ne confond plus `mot de bascule` avec une technique de carte de defense.
- Les reponses defense utilisent les bons composants: moment critique, piege visible, geste de retour en moins de 30 secondes, plan B.
- La recommendation principale est bonne en Plan et hors Plan.
- Les destinations produit sont correctes: `Dashboard > Plan` pour carte liee au Plan, `Dashboard > Ressources` pour carte libre.

**Problemes**
- Tours 3 et 5: reponses vides HTTP 502. Famille: BF-TEST-01. Impact: experience interrompue et run techniquement bruite. Severite: red par tour.
- Tour 6: la reponse commence par "tu la prepares dans Ressources" alors que le user demande d'abord un conseil. Famille: BF-INTAKE-03. Impact: leger decalage UX apres reprise d'incident. Severite: yellow.

**Fix propose**
- Source amont: runtime/test endpoint pour les 502; visible no-plan pour la priorite du dernier message.
- Correction recommandee: stabiliser/observer les 502; rappeler dans `no_plan_coaching` que les demandes "tu me conseillerais quoi" doivent repondre au levier avant la destination produit.
- Tests d'invariant attendus: no-plan "tu me conseillerais quoi ?" apres contexte produit precedent -> recommandation d'abord, destination seulement si demandee explicitement.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1-T4: owner `coaching_recommendation`, `coaching_type=plan_action`, visible `action_plan_coaching`.
- T6-T7: owner `coaching_recommendation`, `coaching_type=no_plan_action`, visible `no_plan_coaching`.
- Aucun saut vers `product_help`.
- Aucun `change_confirm_coaching_type`, aucun `pending_type_change`.

**Skills / Operations / Tools**
- Skill actif: `coaching_recommendation`.
- `defense_card` gagne correctement dans les deux scopes.
- `visible_decision.variant=null` pour defense in-plan et defense libre.
- Aucun direct effect, aucun tool execute, aucune operation mutante.

**Effets durables**
- Aucun effet durable attendu ni observe.
- Cleanup cible effectue apres run.

**Fix verifie**
- Le bug "mot de bascule presente comme technique de defense" est verifie comme corrige en run reel.
- Le comportement in-plan et no-plan conserve la bonne frontiere produit: defense sans technique d'attaque, attack techniques reservees aux cartes d'attaque.

**Problemes restants**
- Deux incidents HTTP 502 sans trace utile.
- Petit decalage visible au tour 6: destination produit donnee avant la recommandation alors que le user demandait un conseil.

## Verdict Global

Verdict global: yellow.

Le point fonctionnel cible est valide: `defense_card/free_defense_card` ne reutilise plus les techniques d'attaque et le flow garde le bon owner. Le run reste yellow a cause de deux 502 et d'une reponse no-plan legerement trop orientee destination produit au tour 6.
