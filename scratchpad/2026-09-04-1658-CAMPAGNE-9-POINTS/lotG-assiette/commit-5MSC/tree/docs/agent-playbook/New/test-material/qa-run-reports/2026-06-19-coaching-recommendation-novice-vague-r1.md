## 1. Contexte Du Test

- Date: 2026-06-19
- Run: `coachingrec-novice-vague-20260619-r1`
- Persona: user QA local temporaire `qa-normal-coachingrec-novice-vague-20260619-r1-1781881162004@example.com`
- Objectif: tester `coaching_recommendation` avec un user novice, peu familier de la plateforme, qui donne peu de scope au depart et pose des questions produit/techniques.
- Trajectoire: blocage vague -> question definition carte/technique -> guidance produit -> comparaison attaque/defense/potion -> nouvelle action hors plan.
- Surfaces visees: dispatcher global, active flow ownership, reducer local `coaching_recommendation`, visible agents `action_plan_coaching` / `no_plan_coaching`, product guidance.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun fallback deterministe.
- Validite QA: valide avec incident documente. Fixture plan locale creee puis supprimee; un tour a renvoye `502` et a ete conserve dans le rapport, puis le run a repris.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je viens d'arriver dans Sophia et je comprends pas encore les trucs. J'ai un truc administratif à faire, je bloque avant de commencer, et je ne sais pas si je dois utiliser une carte, une potion, ou je sais pas quoi. Tu peux m'aider ?

**Sophia**
> Je partirais sur une carte d’attaque, technique Préparer le terrain : elle te sert à mettre en place tout ce qu’il faut avant de démarrer, pour que le premier geste soit plus simple sur ton dossier mutuelle.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: coaching_recommendation_signal
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- selected_skill_id: coaching_recommendation
- visible_task: action_plan_coaching
- coaching_type: plan_action
- action_context: `Préparer le dossier mutuelle`
- executed_tools: []
- durable_effect: none

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Attends, je connais pas ces mots. C'est quoi une carte d'attaque, et Préparer le terrain ça veut dire quoi concrètement ?

**Sophia**
> Je partirais sur une carte d’attaque, technique Préparer le terrain : tu mets en place avant de commencer tout ce qui peut te faciliter le démarrage du dossier mutuelle, pour rendre le premier geste plus simple et moins lourd. Et pour la préparer, ça se fait depuis l’action concernée dans le Plan, pas depuis Ressources.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- selected_skill_id: coaching_recommendation
- visible_task: action_plan_coaching
- coaching_type: plan_action
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le user demande une definition simple de "carte d'attaque" et de la technique; Sophia repete la recommandation et ajoute de la navigation.
- Source amont probable: le visible agent `action_plan_coaching` reste en mode recommandation/guidance produit au lieu de traiter la question explicative novice.
- Owner runtime: `skills/coaching_recommendation/visible_agents/action_plan_coaching.ts` et contexte local associe.
- Meilleure correction selon les guidelines: ajouter une regle visible "si le user demande c'est quoi / je ne connais pas ces mots, expliquer d'abord le concept en langage novice, puis rattacher a la recommandation".
- Pourquoi ce n'est pas un patch local: c'est un besoin de sous-intention de suivi dans le flow, pas une phrase a remplacer.

### Tour 3

**Verdict du tour:** green

**User**
> Ok mais je suis perdu dans l'app. Je vais où exactement si je veux juste regarder et préparer ça moi-même ? Ne crée rien depuis le chat.

**Sophia**
> Je partirais sur une carte d’attaque, technique Préparer le terrain : pour un dossier mutuelle, ça aide à ranger les documents, ouvrir le bon espace et rendre le démarrage plus simple. Pour la préparer toi-même, va dans Dashboard > Plan, ouvre l’action « Préparer le dossier mutuelle », puis lance la carte d’attaque depuis cette action. Si tu veux juste retrouver une carte déjà existante, c’est dans Ressources.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- selected_skill_id: coaching_recommendation
- visible_task: action_plan_coaching
- coaching_type: plan_action
- executed_tools: []
- durable_effect: none

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Et une carte de défense ou une potion, c'est pour quoi alors ? Comment je sais que c'est pas plutôt ça ?

**Sophia**
> Je partirais sur une carte d’attaque, technique Préparer le terrain : pour un dossier mutuelle, ça aide à lever le blocage avant le premier geste en rendant le démarrage plus simple. Si tu veux la préparer toi-même, va dans Dashboard > Plan, depuis l’action « Préparer le dossier mutuelle » ; les cartes d’attaque se préparent depuis l’action concernée, pas depuis Ressources.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- selected_skill_id: coaching_recommendation
- visible_task: action_plan_coaching
- coaching_type: plan_action
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le user demande une comparaison attaque/defense/potion; Sophia ignore defense/potion et boucle sur la carte d'attaque + navigation.
- Source amont probable: le flow ne distingue pas assez les follow-ups explicatifs/comparatifs d'une demande de guidance produit.
- Owner runtime: visible agent `action_plan_coaching`, avec possible besoin d'un champ local "followup_intent=compare_levers".
- Meilleure correction selon les guidelines: quand le user demande "comment je sais que ce n'est pas X", le visible agent doit expliquer les alternatives et pourquoi elles ne sont pas prioritaires ici.
- Pourquoi ce n'est pas un patch local: le probleme est la priorisation de la sous-intention du tour, pas le wording d'une seule reponse.

### Tour 5

**Verdict du tour:** green

**User**
> Tu ne m'as pas vraiment expliqué la différence. Je veux comprendre simplement : attaque, défense, potion, ça sert à quoi chacun ?

**Sophia**
> Oui — pour ton dossier mutuelle, je partirais sur une carte d’attaque, technique Préparer le terrain : elle sert à rendre le démarrage plus facile en mettant ton environnement et tes premières étapes en place avant de te lancer.
>
> En simple :
> - carte d’attaque = quand tu bloques pour commencer
> - carte de défense = quand tu risques de déraper, décrocher ou abandonner pendant l’action
> - potion = quand c’est surtout un état intérieur qui prend trop de place sur la durée
>
> Si tu veux, je peux aussi te donner un exemple concret de Préparer le terrain pour ce dossier.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- selected_skill_id: coaching_recommendation
- visible_task: action_plan_coaching
- coaching_type: plan_action
- executed_tools: []
- durable_effect: none

### Tour 6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Ok. Autre exemple : j'ai aussi un mail perso à envoyer qui n'est pas dans Sophia ni dans mon plan. Là je bloque pareil. Je dois aller au même endroit ?

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: null
- direct_effects: []
- operation: none
- pending_confirmation: none
- selected_skill_id: null
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: erreur HTTP `502`, reponse vide.
- Source amont probable: incident runtime local ou appel LLM; pas assez d'information dans la trace courte pour isoler.
- Owner runtime: infrastructure test/local function.
- Meilleure correction selon les guidelines: garder l'incident dans le rapport, ne pas utiliser de fallback, reprendre au tour suivant.
- Pourquoi ce n'est pas un patch local: aucun comportement metier exploitable sur ce tour.

### Tour 7

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Je réessaie : pour un mail perso qui n'est pas dans mon Plan Sophia, est-ce que je prépare la carte au même endroit que le dossier mutuelle ?

**Sophia**
> Pour préparer ce dossier mutuelle toi-même, va dans Dashboard > Plan, sur l’action « Préparer le dossier mutuelle ». C’est là que tu prépares une carte d’attaque pour cette action ; Ressources sert surtout à consulter une carte déjà existante.
>
> Je partirais sur une carte d’attaque, technique Préparer le terrain : elle colle bien ici parce que ton blocage est au démarrage, et organiser l’environnement avant d’ouvrir le dossier rend le premier geste plus simple.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- selected_skill_id: coaching_recommendation
- visible_task: action_plan_coaching
- coaching_type: plan_action
- action_context: `Préparer le dossier mutuelle`
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le user dit explicitement "mail perso qui n'est pas dans mon Plan Sophia"; Sophia reste sur l'ancien dossier mutuelle et donne la mauvaise destination Plan.
- Source amont probable: active local state trop dominant; le dispatcher local/reducer ne reconnait pas le changement clair vers `no_plan_action`.
- Owner runtime: `skills/coaching_recommendation/local_flow.ts` et visible context action plan.
- Meilleure correction selon les guidelines: un signal explicite "pas dans mon Plan / mail perso" doit invalider l'ancien action_context plan et switcher vers `no_plan_coaching`, avec guidance Ressources/cartes libres.
- Pourquoi ce n'est pas un patch local: le bug est une transition d'etat et de contexte canonique, pas une formulation.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Sophia nomme bien la technique quand elle recommande une carte d'attaque.
- La guidance Plan du tour 3 est correcte pour l'action du plan.
- Au tour 5, Sophia finit par expliquer simplement attaque/defense/potion.

**Problemes**
- Tour 2: pour un user novice, Sophia n'explique pas assez le vocabulaire et repart en recommandation. Famille: BF-STATE-01. Impact: le user doit relancer pour comprendre.
- Tour 4: question comparative ignoree; Sophia boucle sur la carte d'attaque. Famille: BF-STATE-01. Impact: frustration et impression que Sophia n'ecoute pas.
- Tour 6: 502 avec reponse vide. Famille: BF-TEST-01. Impact: run interrompu, experience inutilisable sur ce tour.
- Tour 7: nouveau scope explicitement hors plan ignore; Sophia repond sur l'ancien dossier mutuelle. Famille: BF-STATE-01. Impact: conseil faux et destination produit fausse.

**Fix propose**
- Source amont: dispatcher/reducer local `coaching_recommendation` et prompts visibles action.
- Correction recommandee: ajouter une sous-intention de follow-up explicatif/comparatif pour les users novices; ajouter une garde de transition qui invalide l'ancien `action_context` quand le dernier user dit explicitement "pas dans mon Plan", "hors Sophia", "mail perso", ou equivalent semantique via sortie structuree du dispatcher.
- Tests d'invariant attendus: action_plan active -> user introduit explicitement action hors plan -> `visible_task=no_plan_coaching`, `coaching_type=no_plan_action`, aucune destination Plan.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tours 1-5: ownership conserve par `coaching_recommendation`, pas d'exit parasite.
- Tours 2 et 4: ownership correct mais sous-intention visible mal traitee.
- Tour 7: ownership correct mais etat local faux; `coaching_type` reste `plan_action` alors que le message courant demande un cas hors plan.

**Skills / Operations / Tools**
- Skill active: `coaching_recommendation`.
- Operations/tools: aucun outil appele, conforme au cadre conversationnel.
- Direct effects: aucun, conforme aux messages user.
- Effets durables: aucun.

**Memoire / Etat**
- L'etat actif garde trop fortement l'action `Préparer le dossier mutuelle`.
- Le contexte du tour 7 devrait remplacer l'ancien action_context par une action libre ou declencher `change_confirm_coaching_type` si la confiance etait faible.
- `pending_type_change` reste null sur le tour 7, ce qui montre que le changement de scope n'a pas ete pris en compte.

**Nettoyage**
- Fixture plan QA supprimee via cleanup cible: `seeded_plan_cleanup=2026-06-19T15:03:47.094Z`.
- Trace locale: `tmp/qa-normal-conversation/coachingrec-novice-vague-20260619-r1/state.json`.

## Verdict Global

**red** — le flow fonctionne pour une action du plan et peut expliquer les leviers apres relance, mais il echoue sur les besoins novice/comparatifs et surtout sur le changement explicite vers une action hors plan.
