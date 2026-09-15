## 1. Contexte Du Test

- Date: 2026-06-19
- Run: `coachingrec-visible-decision-plan-20260619-r1`
- Persona: user QA local temporaire `qa-normal-coachingrec-visible-decision-plan-20260619-r1-1781883309672@example.com`
- Objectif: verifier que les visible agents peuvent reviser le levier fin dans le perimetre `action_plan_coaching`.
- Trajectoire: action plan demarrage -> risque pendant l'action -> guidance defense -> action trop grosse -> comparaison novice.
- Surfaces visees: dispatcher global, local flow `coaching_recommendation`, visible agent `action_plan_coaching`, stockage `last_visible_decision`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback deterministe.
- Validite QA: valide. Fixture plan locale creee puis supprimee.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Dans mon Plan, j'ai l'action Préparer le dossier mutuelle. Je la repousse parce que je ne sais jamais par quel document commencer. Je ne connais pas bien Sophia : tu me conseillerais quoi ?

**Sophia**
> Bien sûr. Ici, une **carte d’attaque** sert à t’aider à **commencer** une action quand le premier pas bloque.
>
> Je partirais sur une carte d’attaque, technique **Préparer le terrain** : tu y fixes à l’avance le premier document à prendre et l’ordre de départ, pour que le démarrage soit plus simple et moins flou.
>
> Si tu veux, je peux aussi t’aider à choisir la bonne technique de carte d’attaque pour cette action.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: coaching_recommendation_signal
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- visible_task: action_plan_coaching
- coaching_type: plan_action
- last_visible_decision: `attack_card / preparer_terrain`
- executed_tools: []
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> En fait je me rends compte que le démarrage va à peu près. Le vrai problème, c'est qu'au bout de 3 minutes je panique, je ferme tout et je pars faire autre chose. Là c'est toujours une carte d'attaque ?

**Sophia**
> Non : ici, je partirais plutôt sur une carte de défense. La carte d’attaque sert surtout quand tu bloques au démarrage ; là, tu arrives à commencer, puis tu risques de décrocher au moment critique. Technique conseillée : Repérer le moment des 3 minutes, le piège concret qui déclenche la panique, un geste de 30 secondes pour rester dedans, puis un plan B simple.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- visible_task: action_plan_coaching
- coaching_type: plan_action
- last_visible_decision: `defense_card`
- current_recommendation: `defense_card`
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Ok, si c'est une carte de défense pour cette action du plan, je la prépare où exactement ? Je veux juste savoir où aller, ne crée rien.

**Sophia**
> Oui : depuis l’action concernée dans le Plan, donc dans Dashboard > Plan, pas depuis Ressources. Tu ouvres l’action « Préparer le dossier mutuelle » puis tu lances la carte de défense depuis là.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- visible_task: action_plan_coaching
- coaching_type: plan_action
- last_visible_decision: `defense_card`
- executed_tools: []
- durable_effect: none

### Tour 4

**Verdict du tour:** green

**User**
> En regardant mieux, l'action entière est peut-être trop grosse : il y a mutuelle, banque et impôts dedans. Même avec une carte, je crois que c'est mal découpé. Là tu conseillerais quoi ?

**Sophia**
> Je partirais sur un ajustement du plan : si l’action mélange mutuelle, banque et impôts, le souci n’est plus le démarrage mais le découpage même de l’action. On la recadre en plusieurs actions plus nettes.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- visible_task: action_plan_coaching
- coaching_type: plan_action
- last_visible_decision: `adjust_plan`
- current_recommendation: `adjust_plan`
- executed_tools: []
- durable_effect: none

### Tour 5

**Verdict du tour:** green

**User**
> Je suis encore un peu perdu : comment je sais simplement quand c'est attaque, défense ou ajustement du plan ?

**Sophia**
> Simplement :
> - carte d’attaque = tu bloques au démarrage
> - carte de défense = tu risques de décrocher, fuir ou déraper en plein milieu
> - ajustement du plan = l’action elle-même est trop grosse, mal découpée ou mal calibrée
>
> Ici, je partirais sur un ajustement du plan, parce que « préparer le dossier mutuelle » semble encore trop large pour être confortable tel quel.

**Trace courte**
- http_status: 200
- response_owner: coaching_recommendation
- selected_handler: coaching_recommendation
- route_reason: active_coaching_recommendation
- safety: none
- direct_effects: []
- operation: none
- pending_confirmation: none
- visible_task: action_plan_coaching
- coaching_type: plan_action
- last_visible_decision: `adjust_plan`
- executed_tools: []
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le visible agent explique les termes pour un user novice.
- Il revise le levier fin selon les precisions du user: attaque -> defense -> ajustement.
- La comparaison du tour 5 est claire et utile.

**Problemes**
- Aucun probleme bloquant observe.

**Fix propose**
- Aucun fix requis sur ce run.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tous les tours restent `response_owner=coaching_recommendation`.
- Aucun exit parasite.
- `coaching_type=plan_action` maintenu correctement.

**Skills / Operations / Tools**
- Skill actif: `coaching_recommendation`.
- Aucun tool ou effet durable appele.

**Decision Visible**
- T1: `last_visible_decision.lever=attack_card`, `variant=preparer_terrain`.
- T2-T3: `last_visible_decision.lever=defense_card`.
- T4-T5: `last_visible_decision.lever=adjust_plan`.
- Les champs projetes `current_recommendation` et `recommendation_decision.primary_feature` suivent la decision visible.

**Nettoyage**
- Fixture plan QA supprimee apres le run.
- Trace locale: `tmp/qa-normal-conversation/coachingrec-visible-decision-plan-20260619-r1/state.json`.

## Verdict Global

**green** — le nouveau contrat visible_decision fonctionne pour `action_plan_coaching`.
