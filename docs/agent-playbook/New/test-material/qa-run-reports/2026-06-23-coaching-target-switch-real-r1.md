# QA Run — Coaching Target Switch Real R1

## 1. Contexte Du Test

- **Date:** 2026-06-23
- **Run:** `coaching_target_switch_20260623_r1`
- **Persona:** `qa-skill`, connexion temporaire
  `coaching_target_switch_coaching_target_switch_20260623_r1`
- **Objectif:** verifier en conditions reelles que `coaching_recommendation`
  gere un switch de cible actif depuis une action hors plan vers une action du
  plan, sans retomber sur l'ancienne cible.
- **Trajectoire:** question de choix de levier hors plan -> activation
  `coaching_recommendation` -> switch vers action du plan -> suivi UI.
- **Surfaces visees:** global dispatcher, active flow arbitration, local
  dispatcher `coaching_recommendation`, reducer local, visible agents, state
  active skill, direct effects.
- **Cadre IA reel:** Supabase local, `/functions/v1/test-send-message`,
  `force_full_ai=true`, messages choisis tour par tour apres lecture des
  reponses et traces. Pas de staging, pas de fallback deterministe.
- **Validite QA:** valide. Cleanup cible de la connexion temporaire effectue en
  fin de run.
- **Artefacts:**
  `tests/real-personas/qa-skill/runs/coaching_recommendation/coaching_target_switch_20260623_r1.raw.json`,
  `...summary.json`, `...trace-summary.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` — Mauvais owner selectionne

**User**

> J'ai un mail perso à envoyer qui n'est pas dans mon plan, et je bloque à
> démarrer. Dans Sophia, je dois plutôt faire une carte d'attaque ou ajuster mon
> plan ?

**Sophia**

> Carte d’attaque, clairement. C’est le bon levier pour un blocage ponctuel sur
> une action hors plan : tu traites le démarrage sans toucher à la structure
> globale du plan. ✉️
>
> Si tu veux, je peux aussi te dire quand ça vaut plutôt le coup d’ajuster le
> plan.

**Trace courte**

- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `product_help_exit_to_global`
- skill: `product_help`, status `exit`, target `global`
- safety: null
- direct_effects: []
- durable_effect: none

**Analyse si yellow/red**

- Symptome: la reponse est utile, mais le premier owner choisi est
  `product_help` pour une demande mixte produit/coaching.
- Source amont probable: arbitrage global sur question "dans Sophia".
- Owner runtime: global dispatcher / product_help exit policy.
- Meilleure correction selon guidelines: renforcer la priorite
  `coaching_recommendation` quand le user demande quel soutien choisir pour un
  blocage concret, meme si le message mentionne Sophia.
- Pourquoi ce n'est pas un patch local: ce n'est pas une phrase a matcher; c'est
  une frontiere d'ownership product_help vs coaching.

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` — Mauvaise transition de flow

**User**

> Ok, aide-moi vraiment à choisir le bon soutien de coaching pour ce mail perso
> : je procrastine, je ne sais pas si c'est plutôt un problème de démarrage, de
> risque de lâcher ou d'organisation.

**Sophia**

> Pour ce cas, je te mettrais sur une carte d’attaque.
>
> Pourquoi : le problème principal, c’est le passage à l’action sur un mail
> unique.
>
> - démarrage : oui, très probablement
> - risque de lâcher : secondaire
> - organisation : pas le cœur du sujet ici
>
> Donc le bon soutien, c’est celui qui t’aide à enclencher et tenir le fil sur
> une action ponctuelle, sans remodeler ton plan. ✉️

**Trace courte**

- http_status: 200
- response_owner: `normal_reply`
- route_reason: `coaching_recommendation_exit_to_global`
- skill: `coaching_recommendation`, status `exit`, target `global`
- selected_handler: null
- safety: null
- direct_effects: []
- durable_effect: none

**Analyse si yellow/red**

- Symptome: `coaching_recommendation` est appele mais sort immediatement vers
  global.
- Source amont probable: dispatcher local choisit `exit_to_global_dispatcher` au
  lieu de continuer avec une recommandation locale active.
- Owner runtime: `coaching_recommendation` local dispatcher/reducer.
- Meilleure correction: clarifier dans le dispatcher local qu'une demande de
  choix de soutien pour une action concrete reste dans le flow, surtout si le
  user demande explicitement de l'aide au choix.
- Pourquoi ce n'est pas un patch local: le probleme est une action de flow
  (`exit`) et non une phrase visible.

### Tour 3

**Verdict du tour:** green

**User**

> Reste avec moi sur ce choix, j'ai deux cas à comparer. Premier cas : le mail
> perso hors plan, je veux juste savoir quel soutien choisir et ensuite je te
> donnerai un cas dans mon plan.

**Sophia**

> Pour ce mail perso hors plan, je partirais sur une carte d’attaque libre,
> technique Preparer le terrain : tu facilites le démarrage en réduisant ce qui
> te freine avant d’écrire.
>
> L’ajustement du plan ne convient pas ici, parce que le sujet n’est pas une
> action du plan mais un mail perso à lancer.

**Trace courte**

- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- skill: `coaching_recommendation`, status `continue`
- safety: null
- direct_effects: []
- durable_effect: none

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` — Mauvaise transition de flow

**User**

> Deuxième cas : dans mon plan j'ai préparer le dossier mutuelle, et je bloque
> pareil avant de m'y mettre. Là tu choisirais quoi ?

**Sophia**

> Carte d’attaque aussi.
>
> Là, tu es sur une action concrète de ton plan avec un blocage de démarrage,
> donc le bon soutien reste celui qui t’aide à enclencher l’action sans toucher
> au plan lui-même. ✅

**Trace courte**

- http_status: 200
- active_flow_arbitration: `continue_active`, active_owner
  `coaching_recommendation`
- selected_skill_id: `coaching_recommendation`
- skill_reason_code: `active_coaching_recommendation`
- skill_status: `exit`
- response_owner: `normal_reply`
- route_reason: `coaching_recommendation_exit_to_global`
- exit_target: `global`
- note_information: source `coaching_recommendation`, target `global`
- collected_state.dispatcher_signal_context: still `no_plan_action`,
  action_title `mail perso à envoyer`
- evidence: says user mentions an action in the plan and a launch blocker
- direct_effects: []
- durable_effect: none

**Analyse si yellow/red**

- Symptome: le flow actif ne conserve pas l'ownership au moment exact du switch
  de cible. Il sort au global alors que le message courant donne explicitement
  une nouvelle cible de coaching.
- Source amont probable: le dispatcher local n'utilise pas
  `target_switch.status=explicit` vers `plan_action`, ou le contrat prompt ne
  rend pas ce champ assez obligatoire dans ce cas.
- Owner runtime: `coaching_recommendation` local dispatcher / reducer state
  transition.
- Meilleure correction selon guidelines: dans le contrat local, rendre
  obligatoire le traitement "nouvelle cible explicite dans un flow actif" comme
  continuation avec `target_switch`, puis reducer vers `action_plan_coaching`.
  Ne pas passer par global si le user reste dans le meme besoin de coaching.
- Pourquoi ce n'est pas un patch local: l'arbitrage actif a deja selectionne le
  bon flow. Le bug est la decision structuree du dispatcher local et sa
  transition, pas un wording visible ni une regex.

### Tour 5

**Verdict du tour:** green

**User**

> Oui je parle bien de préparer le dossier mutuelle dans mon plan, pas du mail
> perso. Si je veux juste commencer demain, tu me conseilles quoi ?

**Sophia**

> Je partirais sur une carte d’attaque, technique Préparer le terrain : elle te
> facilite le tout premier pas demain en réduisant la friction autour du dossier
> mutuelle.

**Trace courte**

- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- skill: `coaching_recommendation`, status `continue`
- safety: null
- direct_effects: []
- durable_effect: none

### Tour 6

**Verdict du tour:** green

**User**

> Et je la crée où cette carte pour le dossier mutuelle ?

**Sophia**

> Depuis **Dashboard > Plan**, ouvre l’action **préparer le dossier mutuelle**,
> puis prépare une **carte d’attaque** depuis cette action. Pour un blocage de
> démarrage, c’est le bon levier. Ensuite, la carte sera retrouvable dans
> **Dashboard > Ressources** si tu veux la consulter.

**Trace courte**

- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- active_flow_arbitration: `continue_active`
- skill: `coaching_recommendation`, status `continue`
- safety: null
- direct_effects: []
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**

- Les reponses visibles sont globalement naturelles et utiles.
- Sophia distingue bien action hors plan vs action du plan dans le contenu.
- T6 donne un chemin UI correct et contextualise par rapport a l'action du plan.

**Problemes**

- Tour 1: owner product_help alors que le besoin humain est deja un choix de
  soutien coaching. Famille: `BF-ROUTE-01`. Impact: entree moins nette dans le
  bon flow. Severite: yellow.
- Tour 4: la reponse visible est correcte, mais le flow sort au global. Famille:
  `BF-STATE-01`. Impact: perte potentielle de continuite et de state, risque de
  retomber sur l'ancienne cible dans des variantes. Severite: red systeme,
  yellow visible.

**Fix propose**

- Source amont: dispatcher local `coaching_recommendation`, puis global
  dispatcher pour la frontiere product/coaching de T1.
- Correction recommandee: rendre le switch explicite de cible prioritaire dans
  le prompt et le reducer local quand l'active flow est
  `coaching_recommendation`.
- Tests d'invariant attendus: active no-plan -> action plan explicite continue
  localement ; target_switch absent avec evidence contradictoire refuse l'exit ;
  mention vague d'un item plan demande confirmation.

## 4. Analyse Systeme

**Verdict: red**

**Routage**

- T3 prouve que le flow peut etre actif en `coaching_recommendation`.
- T4 prouve que l'arbitrage actif selectionne bien `coaching_recommendation`
  (`continue_active`), donc le dispatcher global n'est pas la source principale
  du bug.
- Le skill local sort ensuite avec `coaching_recommendation_exit_to_global`, ce
  qui casse l'ownership local.

**Skills / Operations / Tools**

- Aucun tool ni operation durable appele.
- Pas de promesse de creation ou modification.
- Pas de confirmation pending.

**Memory / Effets durables**

- Aucun effet durable observe.
- Cleanup cible de la connexion temporaire effectue.

**Problemes**

- Tour 4: mauvaise transition de flow. Famille: `BF-STATE-01`. Impact systeme:
  le flow actif perd l'ownership alors que le user reste dans le meme travail de
  coaching avec une nouvelle cible explicite. Severite: red.

**Fix propose**

- Source amont: contrat de sortie du dispatcher local `coaching_recommendation`,
  section `target_switch`, et enforcement reducer.
- Correction recommandee: le dispatcher local doit produire
  `target_switch.status=explicit`, `to_coaching_type=plan_action`,
  `target.kind=plan_action`, `target.title=<action>`, `target.source=plan` dans
  ce cas. Le reducer doit convertir en `action_plan_coaching` sans sortie
  global.
- Tests d'invariant attendus: run reel + unitaires avec mutation de cible
  no-plan -> plan, puis follow-up "je parle bien de la préparer" qui conserve
  l'action du plan.

## Verdict Global

**RED systeme / YELLOW visible.**

La conversation est humainement exploitable, mais le fix `target_switch` n'est
pas valide en conditions reelles : le cas critique T4 sort encore au global au
lieu de rester dans le dispatcher local actif.
