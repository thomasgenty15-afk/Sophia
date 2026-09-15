# QA Run Report - coachingrec-defense-revision-20260625-r1

## 1. Contexte Du Test

- Date: 2026-06-25
- Run: `coachingrec-defense-revision-20260625-r1`
- Persona: user QA temporaire `qa-normal-coachingrec-defense-revision-20260625-r1-1782396689035@example.com`
- Objectif: verifier le comportement `coaching_recommendation` apres correction du contrat visible: une hypothese `attack_card` doit pouvoir etre revisee vers `defense_card` quand le user decrit un decrochage pendant l'action.
- Trajectoire: action du Plan `Preparer le dossier mutuelle` -> comparaison attaque/defense -> correction technique -> guidance produit Plan -> nouveau cas hors plan -> guidance produit Ressources.
- Surfaces visees: dispatcher global, active flow ownership, dispatcher local `coaching_recommendation`, visible agents `action_plan_coaching` et `no_plan_coaching`, absence de direct effect.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide. 5 tours HTTP 200. Cleanup cible effectue: `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, `auth.users`; `user_memories` 404 car table absente dans cet environnement.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-06 - Mauvais domaine semantique

**User**
> Dans mon Plan, j’ai Préparer le dossier mutuelle. J’arrive à ouvrir les justificatifs, mais après deux ou trois minutes je décroche et je finis sur YouTube. Tu conseillerais une carte d’attaque ou une carte de défense ?

**Sophia**
> Entre les deux, la différence est simple :
> - carte d’attaque = t’aider à démarrer quand ça bloque au départ
> - carte de défense = te protéger quand tu décroches en cours de route
>
> Ici, je partirais sur une carte de défense, parce que tu commences bien puis tu bascules sur YouTube au bout de quelques minutes. La technique la plus adaptée serait un **mot de bascule** : un mot unique comme « Stop » pour couper le réflexe de fuite au moment critique.

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

**Analyse si yellow/red**
- Symptome: la decision principale est corrigee (`defense_card`), mais Sophia presente `mot de bascule` comme "technique" de carte de defense alors que c'est une technique d'attaque.
- Source amont probable: knowledge visible cartes d'action: separation insuffisante entre techniques d'attaque et contenu d'une carte de defense.
- Owner runtime: `coaching_recommendation/visible_agents/shared.ts` et visible `action_plan_coaching`.
- Meilleure correction selon les guidelines: ajouter une contrainte visible: les cartes de defense n'ont pas de `variant` d'attaque; elles se decrivent par moment critique, piege, geste 30 secondes, plan B.
- Pourquoi ce n'est pas un patch local: le probleme est une confusion de modele produit entre deux familles de cartes, pas une phrase exacte.

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** N/A

**User**
> Attends, le mot de bascule c’est pas plutôt une technique de carte d’attaque ? Si je fais une carte de défense pour le moment où je pars sur YouTube, je dois préparer quoi exactement ?

**Sophia**
> Oui : le mot de bascule est bien une technique de carte d’attaque, et il sert à lancer le démarrage avec un seul mot qui te remet dans l’action.
>
> Ici, comme tu décroches après 2 ou 3 minutes et que tu pars sur YouTube, je partirais sur une carte de défense : tu prépares le moment précis où tu bascules, le piège visible, un geste de retour en moins de 30 secondes, et un plan B simple.
>
> Exemple : « quand j’ouvre YouTube alors que je suis sur le dossier mutuelle, je ferme l’onglet, je reviens au dossier, et je rouvre le justificatif ».

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
- active local state: `coaching_type=plan_action`, `last_visible_task_kind=action_plan_coaching`, `current_recommendation=defense_card`, `visible_decision.lever=defense_card`, `pending_type_change=null`

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** N/A

**User**
> Ok, et pour cette carte de défense liée à Préparer le dossier mutuelle, je la prépare où exactement dans Sophia ? Ne crée rien depuis le chat.

**Sophia**
> Dans le Plan, ouvre l’action « Préparer le dossier mutuelle », puis prépare la carte de défense depuis cette action. C’est là qu’elle se rattache à l’action concernée ; Ressources sert plutôt à la consulter ou la retrouver ensuite.

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

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** N/A

**User**
> Autre cas : j’ai aussi un mail perso à envoyer à Camille, il n’est pas dans mon Plan. Je commence à écrire, puis au bout de quelques lignes je panique et je ferme le brouillon. Là tu m’aiderais comment ?

**Sophia**
> Je partirais sur une carte de défense libre. Ici, le piège, c’est le moment où la panique monte et te fait fermer le brouillon. Je te conseille de prévoir un geste ultra simple de 30 secondes pour rester dans le mail, puis un plan B si ça remonte encore. Par exemple: tu t’arrêtes, tu lis seulement la dernière phrase, puis tu rajoutes une ligne très courte avant de décider si tu continues ou si tu fais une pause de 2 minutes.

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
- active local state: `coaching_type=no_plan_action`, `last_visible_task_kind=no_plan_coaching`, `current_recommendation=defense_card`, `visible_decision.lever=free_defense_card`, `pending_type_change=null`

### Tour 5

**Verdict du tour:** green

**Famille de bugs si yellow/red:** N/A

**User**
> Et cette carte de défense libre pour le mail à Camille, je la trouve où ? Je veux juste savoir où aller, pas créer depuis le chat.

**Sophia**
> Oui, pour ça tu vas dans Dashboard > Ressources, puis tu ouvres Ressources et tu choisis ou crées une carte de défense libre. Ici, elle te sert à protéger le moment où la panique monte et où tu fermes le brouillon.

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
- active local state: `coaching_type=no_plan_action`, `last_visible_task_kind=no_plan_coaching`, `current_recommendation=defense_card`, `visible_decision.lever=free_defense_card`, `pending_type_change=null`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia distingue enfin correctement demarrage vs decrochage pendant l'action.
- Le user n'a pas besoin de forcer le mot "defense": la defense est selectionnee dans les deux scopes.
- La correction au tour 2 est naturelle et utile.
- Les destinations produit sont coherentes: Plan pour carte liee a l'action du Plan, Ressources pour carte libre hors plan.

**Problemes**
- Tour 1: Sophia melange carte de defense et technique `mot de bascule`, qui appartient aux cartes d'attaque. Famille: BF-INTAKE-06. Impact: confusion produit pour un user novice. Severite: yellow.

**Fix propose**
- Source amont: bloc commun cartes d'action / contrat visible decision.
- Correction recommandee: interdire d'associer une technique d'attaque (`texte_magique`, `mot_de_bascule`, etc.) a une carte de defense. Pour defense, imposer un vocabulaire de structure: moment critique, piege, geste 30 secondes, plan B.
- Tests d'invariant attendus: si `visible_decision.lever=defense_card/free_defense_card`, `visible_decision.variant=null` et le message ne presente pas les techniques d'attaque comme techniques de defense.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1-T3: owner stable `coaching_recommendation`, `coaching_type=plan_action`, visible `action_plan_coaching`.
- T4: nouveau signal explicite hors plan, owner `coaching_recommendation`, `coaching_type=no_plan_action`, visible `no_plan_coaching`.
- T5: continuation active `coaching_recommendation`, `no_plan_action`.
- Aucun saut vers `product_help`.
- Aucun `change_confirm_coaching_type`, aucun `pending_type_change`.

**Skills / Operations / Tools**
- Skill actif: `coaching_recommendation`.
- T1-T3: `current_recommendation=defense_card`, destination `Dashboard > Plan`.
- T4-T5: `current_recommendation=defense_card`, `visible_decision.lever=free_defense_card`, destination `Dashboard > Ressources`.
- Aucun direct effect, aucun tool execute, aucune operation mutante.

**Effets durables**
- Aucun effet durable attendu ni observe.
- Cleanup cible effectue apres run.

**Fix verifie**
- La correction de poids defense est validee en run reel pour action du Plan et action hors plan: le dernier message user peut faire gagner defense contre l'ancienne hypothese attack.

**Probleme restant**
- Confusion produit visible: les techniques nommees de carte d'attaque peuvent encore etre mentionnees comme si elles etaient des techniques de carte de defense.

## Verdict Global

Verdict global: yellow.

Le comportement structurel et la recommendation principale sont maintenant bons: `defense_card/free_defense_card` gagne dans les cas de decrochage pendant l'action, avec ownership correct. Il reste un bug de precision produit au tour 1: ne pas appeler `mot de bascule` une technique de defense.
