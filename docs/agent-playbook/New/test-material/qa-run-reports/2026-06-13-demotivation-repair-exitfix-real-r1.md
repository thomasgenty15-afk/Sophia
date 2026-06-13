# QA Run Report — demotivation_repair exitfix real r1

## 1. Contexte Du Test

- Date: 2026-06-13
- Run: `exitfix_real_r1`, `exitfix_real_r1b`, `exitfix_real_r1c`
- Persona: `qa-skill`, connexions temporaires dediees:
  - `demotivation_repair_exitfix_real_20260613_r1`
  - `demotivation_repair_exitfix_real_20260613_r1b`
  - `demotivation_repair_exitfix_real_20260613_r1c`
- Objectif: verifier en conditions reelles que les corrections post-run fonctionnent mieux pour:
  - T1: besoin actuel / perte d'elan maintenant -> `prepare_defense_card`, pas `prepare_attack_card`.
  - T6: refus explicite carte/action + focus perte d'envie/ressenti -> `demotivation_repair`, pas `prepare_attack_card` ni opportunity attaque.
- Trajectoire:
  - Phase A: demande explicite de carte dans un moment present de decrochage.
  - Phase B: entree et continuation legitimes dans `demotivation_repair`.
  - Phase C: refus action/carte avec focus ressenti, avec puis sans flow actif.
- Surfaces visees: global dispatcher, router, `prepare_defense_card`, `demotivation_repair`, `flow_opportunity`, effects/runtime.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback `processMessage`, aucun staging/deploy.
- Validite QA: valide. Messages choisis tour par tour apres lecture de la reponse et de la trace courte.

## 2. Tours De Conversation

### Tour 1 — Phase A / frontiere defense vs attaque

**Verdict du tour:** green

**User**
> Je suis devant le dossier là, et je sens que je décroche déjà. J’ai peur de perdre l’énergie dans deux minutes et de partir ailleurs. Tu peux me préparer une carte pour tenir le moment sans déraper ?

**Sophia**
> Je vois que c'est difficile de rester sur ce dossier en ce moment. Quelle petite action concrète pourrais-tu faire là, tout de suite, pour t'aider à tenir sans décrocher ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `tool_skill_intent_start`
- normal_reply_fit_score: `0.1`
- tool_skill_intents: `prepare_defense_card`, explicit, high, target `moment de décrochage devant le dossier`
- flow_opportunity: null
- direct_effects: []
- blocked_paths: []
- executed_tools: []
- durable_effect: aucun effet durable hors chat message

### Tour 2 — Phase A / continuation defense

**Verdict du tour:** green

**User**
> L’action minuscule ce serait d’ouvrir le document et d’écrire juste le titre du paragraphe, mais le piège c’est que je vais ouvrir un onglet à côté dès que ça pique.

**Sophia**
> Pour le champ « Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ? », est-ce que cette formulation te convient : « quand je suis devant mon dossier et que j'ai l'impulsion d'ouvrir un onglet dès que l'effort devient difficile » ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- blocked_paths: `global_dispatcher` blocked by `active_prepare_defense_card_uses_local_dispatcher`
- tool_skill_intents: []
- flow_opportunity: null
- direct_effects: []
- executed_tools: []
- durable_effect: aucun effet durable hors chat message

### Tour 3 — Phase B / entree demotivation_repair

**Verdict du tour:** green

**User**
> Depuis ce matin je sens que l’envie est tombée d’un coup. Je sais que le dossier compte, mais dès que j’y pense j’ai l’impression que tout devient lourd et que je vais encore lâcher.

**Sophia**
> C’est épuisant quand l’élan se coupe net et que la peur de lâcher refait surface. Pour mieux comprendre ce qui se joue, est-ce que cette lourdeur vient de la complexité du dossier lui-même ou plutôt de l'appréhension de ne pas réussir à aller au bout ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `skill_entry_signal`
- normal_reply_fit_score: `0.2`
- skill_signals.entry.demotivation_repair: detected, high, score `0.85`
- flow_opportunity: `demotivation_repair.loss_of_desire`
- tool_skill_intents: []
- direct_effects: []
- executed_tools: []
- durable_effect: aucun effet durable hors chat message

### Tour 4 — Phase B / continuation demotivation_repair

**Verdict du tour:** green

**User**
> C’est plutôt l’appréhension. J’ai déjà eu deux moments où j’ai tenté de relancer et où je me suis retrouvé bloqué, du coup maintenant mon corps anticipe l’échec avant même que je commence.

**Sophia**
> C'est une réaction de protection tout à fait normale : ton corps se souvient des blocages passés et cherche à t'éviter une nouvelle frustration. Pour l'instant, l'idée n'est pas de réussir ou de produire, mais juste de désamorcer cette alerte. Est-ce que tu pourrais simplement ouvrir ton espace de travail ou ton document, juste pour une minute, sans aucune obligation d'y toucher ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_demotivation_repair_local_dispatcher`
- active_flow_arbitration: `continue_active`
- blocked_paths: `global_dispatcher`, `global_router` blocked by `active_local_conversation_skill_owns_turn`
- tool_skill_intents: []
- flow_opportunity: null
- direct_effects: []
- executed_tools: []
- durable_effect: aucun effet durable hors chat message

### Tour 5 — Phase C / refus action pendant demotivation_repair actif

**Verdict du tour:** green

**User**
> Non, pas de carte et pas de micro-action maintenant. Je veux rester sur ce qui se passe dedans : comprendre pourquoi l’envie s’éteint aussi vite et pourquoi ça me coupe avant même d’essayer.

**Sophia**
> Ton corps cherche simplement à te protéger. Cette appréhension que tu ressens est une réaction réflexe pour t'éviter de revivre la frustration de tes précédents blocages. Il n'y a aucune pression pour agir tout de suite, on peut juste laisser cette tension redescendre doucement.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `active_demotivation_repair_local_dispatcher`
- active_flow_arbitration: `continue_active`
- blocked_paths: `global_dispatcher`, `global_router` blocked by `active_local_conversation_skill_owns_turn`
- tool_skill_intents: []
- flow_opportunity: null
- direct_effects: []
- executed_tools: []
- durable_effect: aucun effet durable hors chat message

### Tour 6 — Phase C / refus action sans flow actif

**Verdict du tour:** green

**User**
> Non, pas de carte et pas de micro-action maintenant. Je veux juste comprendre pourquoi l’envie s’éteint aussi vite dès que je pense au dossier, et rester sur ce ressenti plutôt que chercher une solution tout de suite.

**Sophia**
> C'est tout à fait légitime de vouloir comprendre ce qui se joue avant de chercher à avancer. Quand cette envie s'éteint brusquement face au dossier, est-ce que tu identifies un aspect précis qui semble « couper le courant » ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `skill_entry_signal`
- normal_reply_fit_score: `0.1`
- skill_signals.entry.demotivation_repair: detected, high, score `0.95`, reason `explicit_action_refusal_focus_on_loss_of_desire`
- tool_skill_intents: []
- flow_opportunity: null
- direct_effects: []
- executed_tools: []
- durable_effect: aucun effet durable hors chat message

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- La demande de carte pour un moment de decrochage actuel est traitee comme une carte de defense. Sophia ne parle pas d'attaque et collecte un contexte de risque pertinent.
- `demotivation_repair` entre naturellement sur perte d'elan et peur de relacher.
- Quand l'utilisateur refuse explicitement carte/action, Sophia respecte le refus et revient au ressenti sans pousser de solution.

**Problemes**
- Aucun probleme bloquant observe.

**Fix propose**
- Aucun fix requis sur ce run. Garder les invariants:
  - present / risque de perdre l'elan maintenant -> defense.
  - refus action + focus perte d'envie -> demotivation, sans attaque/opportunity.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Phase A: le global dispatcher produit `tool_skill_intents[0].operation_type=prepare_defense_card`; `response_owner=tool_skill`; `selected_handler=prepare_defense_card`.
- Phase B: `demotivation_repair` entre puis continue via local dispatcher.
- Phase C active: le local `demotivation_repair` reste owner et ne laisse pas une carte/action reprendre le tour.
- Phase C sans flow actif: le global dispatcher produit le signal attendu `explicit_action_refusal_focus_on_loss_of_desire`, sans `prepare_attack_card`, sans `flow_opportunity`.

**Skills / Operations / Tools**
- `prepare_defense_card` collecte des slots; aucun effet final n'est execute.
- `demotivation_repair` repond en conversation handler; aucun tool execute.
- `executed_tools=[]` sur tous les tours.

**Effets Durables / DB**
- Snapshots durables:
  - `exitfix_real_r1`: `chat_messages=4`, `memory_items=0`, `scheduled_checkins=0`, `user_recurring_reminders=0`.
  - `exitfix_real_r1b`: `chat_messages=6`, `memory_items=0`, `scheduled_checkins=0`, `user_recurring_reminders=0`.
  - `exitfix_real_r1c`: `chat_messages=2`, `memory_items=0`, `scheduled_checkins=0`, `user_recurring_reminders=0`.
- Aucun effet durable non demande n'a ete cree.
- Connexions temporaires nettoyees en fin de run.

## Verdict Global

**Green.** Les deux corrections visees sont verifiees en conditions reelles locales:

- Sortie T1 corrigee: oui, le cas present/perte d'elan route `prepare_defense_card`, pas `prepare_attack_card`.
- Sortie T6 corrigee: oui, refus carte/action + focus perte d'envie route `demotivation_repair`, sans tool/opportunity attaque.
- Bugs ouverts: aucun pour ce run.
- Bug sheet: non creee, verdict global green.
- Artefacts:
  - `tests/real-personas/qa-skill/runs/operations/2026-06-13-exitfix_real_r1.*.json`
  - `tests/real-personas/qa-skill/runs/operations/2026-06-13-exitfix_real_r1b.*.json`
  - `tests/real-personas/qa-skill/runs/operations/2026-06-13-exitfix_real_r1c.*.json`
- Nettoyage: connexions temporaires `r1`, `r1b`, `r1c` supprimees via `qa-cleanup-run-connection.sh`.
