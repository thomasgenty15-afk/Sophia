# QA Run Report — Emotional Repair Potion Bridges R3

## 1. Contexte Du Test

- Date: 2026-06-15
- Run: `emotional-repair-potion-bridges-r3-{amour,guerison,apaisement}`
- Persona: `qa-skill`, connexions temporaires dediees puis nettoyees.
- Objectif: verifier apres fix que `emotional_repair` bridge correctement vers les potions `amour`, `guerison`, `apaisement`.
- Trajectoire: entree `emotional_repair` -> demande explicite de potion -> handoff `select_state_potion` -> verification du sous-flow potion quand le handoff reussit.
- Surfaces visees: local dispatcher `emotional_repair`, reducer local, active skill state, `select_state_potion`, trace et projections durables.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de fallback deterministe, pilotage tour par tour.
- Validite QA: valide.

Artefacts:

- `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-15-emotional-repair-potion-bridges-r3-amour.{raw,summary,durable}.json`
- `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-15-emotional-repair-potion-bridges-r3-guerison.{raw,summary,durable}.json`
- `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-15-emotional-repair-potion-bridges-r3-apaisement.{raw,summary,durable}.json`

## 2. Tours De Conversation

### Run Amour

#### Tour 1

**Verdict du tour:** green

**User**
> Je me parle durement depuis ce matin, comme si mon erreur disait quelque chose de nul sur moi. J'ai besoin que tu m'aides à redescendre sans me donner de plan.

**Sophia**
> C'est vraiment éprouvant quand cette voix intérieure devient si dure. On a souvent tendance à transformer un faux pas en une vérité sur soi, mais une erreur reste un acte, pas ton identité. Je suis là avec toi pour laisser cette tension s'apaiser doucement, sans rien forcer.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- executed_tools: []
- durable_effect: `chat_messages=6` final run, no memory/reminder/checkin.

#### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` — mauvaise transition de flow.

**User**
> Là ça a un peu baissé. Je veux bien passer sur une potion d'amour pour arrêter de me traiter comme si j'étais mon erreur.

**Sophia**
> Je suis contente de sentir que la pression redescende un peu. C'est essentiel de ne plus te laisser définir par cette erreur, car tu es bien plus que cela. Qu'est-ce qui t'aiderait le plus à retrouver un regard doux sur toi-même en ce moment ?

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_emotional_repair_local_dispatcher`
- operation: `flow_action=confirm_potion_bridge`, `visible_task=ask_gentle_clarification`
- reason_code: `emotional_repair_potion_bridge_blocked`
- blocked_effects: `select_state_potion/missing_previous_potion_offer`
- durable_effect: no handoff.

**Analyse**
- Symptome: demande explicite de Potion d'amour absorbee par `emotional_repair`.
- Source amont probable: contrat/decision direct handoff incomplet pour `amour`; le dispatcher choisit `confirm_potion_bridge`, mais la transition n'est pas validable sans offre precedente.
- Owner runtime: `emotional_repair` local dispatcher + reducer contract.
- Correction attendue: rendre la demande directe `amour` aussi complete que `guerison/apaisement` (`user_requested_direct_handoff`, durable need, candidate high/medium), ou diagnostiquer quel champ manque dans la trace.

#### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` — mauvaise transition de flow.

**User**
> Ce qui m'aiderait, c'est précisément la Potion d'amour. Je veux continuer avec cette potion maintenant.

**Sophia**
> Je comprends ton souhait de retrouver un peu de douceur envers toi-même. Qu'est-ce qui te semble le plus difficile à apaiser dans ce regard que tu portes sur toi en ce moment ?

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_emotional_repair_local_dispatcher`
- operation: `flow_action=confirm_potion_bridge`, `visible_task=ask_gentle_clarification`
- reason_code: `emotional_repair_potion_bridge_blocked`
- blocked_effects: `select_state_potion/missing_previous_potion_offer`
- durable_effect: no handoff.

### Run Guerison

#### Tour 1

**Verdict du tour:** green

**User**
> Depuis une discussion qui m'a blessé, je rumine et j'ai honte de ma réaction. Je veux d'abord que tu m'aides à remettre ça à une taille humaine, sans exercice compliqué.

**Sophia**
> C'est épuisant de porter cette honte après une discussion difficile. Je comprends que tu aies besoin de ramener tout ça à une taille plus humaine. [...] Tu as le droit de laisser cette pression redescendre sans avoir rien d'autre à faire que de respirer un peu.

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`

#### Tour 2

**Verdict du tour:** green

**User**
> Ça redescend un peu. Je veux bien passer sur une potion de guérison pour ne pas rester coincé dans la blessure.

**Sophia**
> Je suis contente que la pression retombe. On va regarder cette potion de guérison pour t'aider à cicatriser et à ne pas rester sur cette blessure.

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- operation: `flow_action=confirm_potion_bridge`, `visible_task=potion_bridge_handoff`
- status: `handoff`
- reason_code: `emotional_repair_handoff_to_select_state_potion`
- blocked_effects: []

#### Tour 3

**Verdict du tour:** green

**User**
> Oui, on continue. La blessure principale, c'est cette discussion où je me suis senti jugé, et je veux surtout cicatriser la honte qui reste.

**Sophia**
> Ta Potion de guérison est prête ! Tu peux l'utiliser dès maintenant dans la section État / Potions de ton espace. Voici les éléments à reporter : [...]

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.guerison`
- route_reason: `active_guerison_local_dispatcher`
- operation status: `handoff_delivered`
- tool_execution: `platform_handoff`
- durable_effect: `chat_messages=6`, no memory/reminder/checkin.

### Run Apaisement

#### Tour 1

**Verdict du tour:** green

**User**
> Je suis tendu et à cran, j'ai l'impression que tout appuie sur moi. Aide-moi juste à faire baisser la pression avant de décider quoi que ce soit.

**Sophia**
> Je t'entends et je sens cette pression qui t'écrase. Je suis là, tout près de toi, sans rien attendre et sans rien te demander. On s'arrête juste un instant, le temps que tu puisses souffler un peu.

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`

#### Tour 2

**Verdict du tour:** green

**User**
> Je me sens un peu moins submergé. Je veux bien passer sur une potion d'apaisement pour travailler cette pression sans repartir dans tous les sens.

**Sophia**
> Je suis ravie que tu te sentes un peu moins submergé. On se tourne maintenant vers la Potion d'apaisement pour t'aider à réguler cette pression.

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- operation: `flow_action=confirm_potion_bridge`, `visible_task=potion_bridge_handoff`
- status: `handoff`
- reason_code: `emotional_repair_handoff_to_select_state_potion`
- blocked_effects: []

#### Tour 3

**Verdict du tour:** green

**User**
> Oui, je continue avec cette potion. La pression vient surtout de trop de choses à porter en même temps, et je suis encore un peu à cran.

**Sophia**
> Je suis prête à t'aider pour ta Potion d'apaisement. Est-ce que c'est bien ce poids d'avoir trop de choses à porter en même temps qui te met ainsi à cran ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.apaisement`
- route_reason: `active_apaisement_local_dispatcher`
- operation status: `clarifying`
- tool_execution: `platform_handoff`

#### Tour 4

**Verdict du tour:** green

**User**
> Oui, c'est exactement ça : trop de choses à porter en même temps, et ça me met à cran.

**Sophia**
> Je sens que c'est vraiment pesant de tout porter de front. Pour affiner ta Potion d'apaisement, qu'est-ce qui s'accumule le plus pour toi en ce moment ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.apaisement`
- reason_code: `apaisement_field_needs_more_detail`

#### Tour 5

**Verdict du tour:** green

**User**
> Ce qui s'accumule le plus, c'est le travail en retard, les messages à traiter et la peur de ne pas tenir.

**Sophia**
> Je sens que c'est pesant pour toi en ce moment. Ta Potion d'apaisement t'attend dans la section État / Potions. Voici ce que j'ai retenu pour ta session : [...]

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.apaisement`
- operation status: `handoff_delivered`
- tool_execution: `platform_handoff`
- durable_effect: `chat_messages=10`, no memory/reminder/checkin.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- `guerison` et `apaisement` ont une transition lisible : Sophia accuse reception, annonce la potion, puis le sous-flow potion reprend la main.
- Pas de reponse vide, pas d'abort, pas de fallback visible.

**Problemes**
- Run amour T2-T3: la demande explicite est reconnue partiellement mais Sophia reste en questionnement emotionnel au lieu de bridge. Famille: `BF-STATE-01`. Impact: l'utilisateur doit insister et n'obtient toujours pas la potion demandee.

**Fix propose**
- Source amont: `emotional_repair` local dispatcher direct potion bridge contract.
- Correction recommandee: instrumenter ou exposer les champs de decision `potion_bridge.user_requested_direct_handoff`, `selected_potion`, `durable_need.kind`, `candidate_potions` dans la trace courte, puis corriger la decision `amour` pour produire le meme contrat complet que `guerison/apaisement`.
- Tests d'invariant attendus: direct request amour, paraphrase amour, anti-faux-positif mention amour sans demande.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Entree `emotional_repair`: OK sur les trois runs.
- Handoff direct: OK pour `guerison` et `apaisement`; KO pour `amour`.

**Skills / Operations / Tools**
- `select_state_potion.guerison`: actif au tour suivant, `handoff_delivered`.
- `select_state_potion.apaisement`: actif au tour suivant, clarifie puis `handoff_delivered`.
- `select_state_potion.amour`: jamais active.

**Effets durables**
- Aucun memory/reminder/checkin cree, attendu.
- Messages chat persistés: amour 6, guerison 6, apaisement 10.

**Regression / amelioration vs r2**
- Amelioration nette: `guerison` ne reste plus en `regulation_without_potion`; il bridge et livre la potion.
- Amelioration nette: `apaisement` ne perd plus l'offre/confirmation; il bridge et livre la potion.
- Reste rouge: `amour` echoue encore avec `missing_previous_potion_offer` malgre demande directe.

## Verdict Global

**yellow**

Le fix améliore clairement 2 branches sur 3. `guerison` et `apaisement` sont validées en run IA réel. `amour` reste bloqué dans `emotional_repair` et doit être corrigé avant de considérer le bridge emotional repair complètement vert.
