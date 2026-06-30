## 1. Contexte Du Test

- Date: 2026-06-19
- Run: `coachingrec-visible-decision-free-emotion-20260619-r1`
- Persona: user QA local temporaire `qa-normal-coachingrec-visible-decision-free-emotion-20260619-r1-1781883517119@example.com`
- Objectif: verifier la decision visible dans `no_plan_coaching` et `emotion_coaching`: carte libre, coaching only, defense libre, potion precise.
- Trajectoire: action hors plan floue -> clarification d'intention -> risque pendant l'action -> guidance Ressources -> etat emotionnel global.
- Surfaces visees: dispatcher global, local flow `coaching_recommendation`, visible agents `no_plan_coaching` et `emotion_coaching`, stockage `last_visible_decision`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback deterministe.
- Validite QA: valide. Aucun seed plan utilise.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je suis nouveau dans Sophia. J'ai un mail perso à envoyer à Camille, ce n'est pas dans mon Plan. Je bloque parce que je ne sais même pas ce que je veux dire. Est-ce qu'il faut une carte ou juste réfléchir ?

**Sophia**
> Dans Sophia, une « carte d’attaque », c’est juste une aide pour te lancer plus facilement quand tu bloques au départ. Ici, je partirais sur une carte d’attaque libre, technique Preparer le terrain : elle t’aide à poser ton idée avant d’écrire, ce qui est utile quand tu ne sais pas encore quoi dire à Camille.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: coaching_recommendation_signal
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- visible_task: no_plan_coaching
- coaching_type: no_plan_action
- last_visible_decision: `free_attack_card / preparer_terrain`
- executed_tools: []
- durable_effect: none

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-03 - Contrainte explicite perdue

**User**
> En fait avant de me lancer, je dois surtout comprendre ce que je veux obtenir avec ce mail. Je n'ai pas besoin d'un support à préparer tout de suite. Là tu ferais quoi ?

**Sophia**
> Oui, je partirais sur une carte d’attaque libre, technique Mot de bascule : prends un seul mot comme “Départ” ou “Go”.
>
> En simple : une carte d’attaque sert à t’aider à commencer plus facilement. Là, tu ne bloques pas parce que le mail est “dangereux”, mais parce que tu ne vois pas encore ce que tu veux dire. Donc le bon levier, c’est de clarifier l’intention avant d’écrire.
>
> Si tu veux, je peux aussi t’aider à formuler en une phrase ce que tu veux obtenir avec ce mail.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- visible_task: no_plan_coaching
- coaching_type: no_plan_action
- last_visible_decision: `free_attack_card / mot_de_bascule`
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le user dit explicitement ne pas avoir besoin d'un support a preparer; Sophia maintient `free_attack_card` puis dit que le bon levier est de clarifier l'intention.
- Source amont probable: prompt `no_plan_coaching` ne priorise pas assez `coaching_only` quand l'action est trop floue ou que le user refuse explicitement un support produit immediat.
- Owner runtime: `visible_agents/no_plan_coaching.ts` et decision visible.
- Meilleure correction selon les guidelines: si le dernier message dit "pas besoin d'un support" ou "je dois comprendre ce que je veux obtenir", `visible_decision.lever` doit pouvoir devenir `coaching_only`.
- Pourquoi ce n'est pas un patch local: le contrat visible_decision fonctionne techniquement, mais le prompt de decision dans le perimetre no-plan est incomplet.

### Tour 3

**Verdict du tour:** green

**User**
> Autre cas sur ce même mail : si je commence à écrire mais que dès que je vois une phrase un peu froide je ferme tout par peur de sa réaction, c'est plutôt quoi ?

**Sophia**
> Là, je partirais plutôt sur une carte de défense libre, pas une carte d’attaque.
>
> Différence simple :
> - carte d’attaque = t’aider à démarrer quand tu bloques avant d’écrire
> - carte de défense = t’aider à ne pas décrocher au moment où le risque arrive
>
> Ici, tu écris déjà, puis tu fermes tout dès qu’une phrase te paraît froide par peur de sa réaction : le piège est pendant l’action. Donc défense.
>
> Je prendrais une défense avec un geste très court du type : relire une phrase, respirer, puis la reformuler en plus douce avant de continuer.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- visible_task: no_plan_coaching
- coaching_type: no_plan_action
- last_visible_decision: `free_defense_card`
- current_recommendation: `defense_card`
- executed_tools: []
- durable_effect: none

### Tour 4

**Verdict du tour:** green

**User**
> Et comme ce mail n'est pas dans mon Plan, je la prépare où cette carte de défense libre ?

**Sophia**
> Tu la prépares dans Ressources, comme carte de défense libre. Ici, elle sert bien si tu commences puis tu décroches dès qu’une phrase te semble risquée. Le bon réflexe : repérer ce moment précis, le piège visible, ton geste de moins de 30 secondes, puis un plan B simple.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- visible_task: no_plan_coaching
- coaching_type: no_plan_action
- last_visible_decision: `free_defense_card`
- executed_tools: []
- durable_effect: none

### Tour 5

**Verdict du tour:** green

**User**
> Là je change de sujet : ce n'est plus le mail. Depuis ce matin je suis dur avec moi-même et je me parle mal, sans action précise. Si Sophia propose une potion, laquelle serait la plus adaptée ?

**Sophia**
> La potion la plus adaptée ici, c’est l’amour. Elle sert quand tu te parles trop durement et que tu as surtout besoin de plus de douceur envers toi-même. Si tu veux, je peux aussi t’aider à voir en une phrase si c’est plutôt amour ou apaisement.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- visible_task: emotion_coaching
- coaching_type: emotional
- last_visible_decision: `state_potion / amour`
- executed_tools: []
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le flow reste owner `coaching_recommendation`.
- Le visible agent bascule correctement vers carte de defense libre au tour 3.
- La guidance hors plan du tour 4 est correcte: Ressources, carte libre, pas Plan.
- L'agent emotionnel choisit une potion precise coherente: `amour`.

**Problemes**
- Tour 2: Sophia maintient une carte d'attaque libre alors que le user demande explicitement de clarifier l'intention sans support a preparer. Famille: BF-INTAKE-03. Impact: recommendation contradictoire et confusion pour un novice.

**Fix propose**
- Source amont: prompt `no_plan_coaching`.
- Correction recommandee: renforcer `coaching_only` comme choix visible quand le user dit que l'objectif est encore flou, qu'il ne sait pas ce qu'il veut obtenir, ou qu'il ne veut pas de support produit tout de suite.
- Tests d'invariant attendus: no-plan actif + "je n'ai pas besoin d'un support, je dois comprendre ce que je veux obtenir" -> `last_visible_decision.lever=coaching_only`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tous les tours restent `response_owner=coaching_recommendation`.
- T1-T4: `coaching_type=no_plan_action`.
- T5: switch propre vers `coaching_type=emotional`.

**Skills / Operations / Tools**
- Skill actif: `coaching_recommendation`.
- Aucun tool ou effet durable appele.

**Decision Visible**
- T1: `free_attack_card / preparer_terrain`.
- T2: `free_attack_card / mot_de_bascule`, mais attendu probable `coaching_only`.
- T3-T4: `free_defense_card`.
- T5: `state_potion / amour`.

**Nettoyage**
- Aucun seed plan utilise.
- Trace locale: `tmp/qa-normal-conversation/coachingrec-visible-decision-free-emotion-20260619-r1/state.json`.

## Verdict Global

**yellow** — le nouveau contrat visible_decision fonctionne techniquement, mais `no_plan_coaching` doit mieux utiliser `coaching_only` quand le user refuse un support produit et demande une clarification d'intention.
