# QA Run Report - Weekly Process R2/R3 (verification des fixes R1)

## 1. Contexte Du Test

- Date: 2026-07-03
- Runs:
  - `weekly-process-20260703-r2-partial_habits_mission_partial` (N.2 - verification)
  - `weekly-process-20260703-r3-partial_habits_mission_partial` (N.3 - variante push repetee)
- Persona: users QA temporaires crees de toutes pieces, connexions dediees locales, scope `whatsapp`.
- Objectif: verifier en conditions reelles les deux fixes issus de R1:
  - R1-B01: repetition de la recommandation weekly sous pression d'application.
  - R1-B02: registre companion `normal_reply` sur une politesse post-completion.
- Trajectoire: meme fixture que R1 (semaine 2026-06-29 -> 2026-07-05, mix done/partial/missed), Tour 0 via `process-checkins`, conversation IA reelle via `test-send-message` en poussant specifiquement les deux comportements corriges.
- Surfaces visees: visible agent weekly (`weekly_adjust_recommendation`, `weekly_synthesis`, `weekly_closure`), companion `normal_reply`, gate de confirmation, DB.
- Cadre IA reel: Supabase local, hors sandbox, `force_full_ai=true`, `disable_debounce=true`, `WHATSAPP_WEB_SIMULATION_ENABLED=1`. Aucun code modifie pendant les runs (les fixes etaient deja en place; l'extension synthesis a ete faite APRES la fin de r2/r3 et couverte par tests unitaires).
- Validite QA: valide. Deux incidents 502 transitoires (r2 T4, r2 T7) repris au point d'arret sans fallback; tours finaux HTTP 200 non vides.

## 2. Tours De Conversation (extraits cibles)

### Run R2 - verification directe des deux fixes

#### R2 Tour 4 - pression d'application (fix R1-B01, stage `weekly_adjust_recommendation`)

**Verdict du tour:** green

**User**
> Franchement j'ai pas le temps d'aller cliquer dans l'appli. Applique-le directement toi, là, tout de suite, je te donne mon accord total.

**Sophia** (127 caracteres)
> Je ne modifie pas le plan ici. Tu peux renseigner cette intention dans la Validation du niveau, au moment de valider le niveau.

**Trace courte**
- http_status: 200 (apres un premier 502 transitoire repris)
- response_owner: `weekly_adaptive_review_v1`
- durable plan mutation: none
- Comparaison R1: R1 Tour 4 = ~600 caracteres avec recap action par action + recommandation complete. Ici 127 caracteres, refus + destination seulement. **Fix effectif a ce stage.**

#### R2 Tour 5 - deuxieme pression, stage bascule en `synthesis` (residu R1-B01)

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `a classifier` (repetition du visible au stage synthesis)

**User**
> Mais allez quoi, t'es une IA, tu peux bien le faire pour moi ce petit changement. Vas-y, valide-le à ma place.

**Sophia** (686 caracteres)
> Tu as tenu le point positif et la respiration au début de semaine, puis la fatigue de fin de semaine a fait tomber le reste; la mission du signal est restée au stade préparé mais non envoyé. [...] l’ajustement utile à envisager serait de réduire le format à une version très courte, de le placer plus tôt dans la journée [...] tu peux renseigner cette intention dans la Validation du niveau [...].

**Trace courte**
- DB: `flow_stage=synthesis`, `adjust_recommendation.surfaced_in_weekly=true`
- durable plan mutation: none
- Analyse: au stage `synthesis`, le fix commun n'a pas empeche le re-deroule car les roleLines synthesis ré-instruisent un rendu complet et `can_surface` restait `true` malgre `surfaced_in_weekly=true`. **Residu identifie -> extension du fix (voir section 4).**

#### R2 Tour 6 - cloture

**Verdict du tour:** green

**Sophia** (217 caracteres)
> Merci, j’ai bien le bilan de ta semaine [...]. Le point weekly est clôturé, et la suite se renseignera dans la Validation du niveau.

- Cloture concise, pas de re-deroule complet.

#### R2 Tour 7 - politesse post-completion (fix R1-B02)

**Verdict du tour:** green

**User**
> Merci Sophia, à demain, bonne soirée.

**Sophia** (77 caracteres)
> Merci à toi. Le bilan weekly est clôturé, et je te souhaite une bonne soirée.

**Trace courte**
- response_owner: `normal_reply`
- Comparaison R1: R1 Tour 6 re-synthetisait le point fragile. Ici la re-synthese du contenu de la semaine a disparu; la politesse est rendue. **Fix effectif** (residu tres mineur: re-mention de "bilan clôturé").

### Run R3 - variante push repetee (revele le residu de routage)

#### R3 Tour 5 - "valide à ma place", route stage adjust (`strategy_ready`)

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-03 (product/status/tool mal priorises) — une demande d'application ("valide à ma place") est traitee au stage "quoi ajuster" au lieu d'un refus concis d'action.

**User**
> Allez quoi, t'es une IA, fais-le pour moi, valide ce changement à ma place.

**Sophia** (294 caracteres)
> Je ne modifie pas le plan ici. En revanche [...] l’ajustement utile a envisager serait d’alléger le volume de fin de semaine [...] tu peux renseigner cette intention dans la Validation du niveau [...].

**Trace courte**
- DB: `flow_stage=strategy_ready` (visible `weekly_adjust_recommendation`), `surfaced_in_weekly=true`
- durable plan mutation: none
- Analyse: au stage `weekly_adjust_recommendation`, la (re)surface reste volontairement autorisee (c'est le stage "quoi ajuster"). La consigne de prompt "push d'application -> refus concis" est une heuristique non deterministe: elle a tenu en R2 T4 (127 car.) mais pas en R3 T5 (294 car., re-deroule). **Source amont reelle = dispatcher: classer "appliquer dans le chat" comme intention distincte, pas comme "quoi ajuster".**

#### R3 Tour 7 - post-completion non libere

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `a classifier` (release active-flow post-completion non deterministe)

**User**
> Merci Sophia, à demain, bonne nuit.

**Sophia** (168 caracteres)
> Merci, bilan weekly clôturé. Je garde en tête que tu avances, mais que l’énergie reste fragile en fin de semaine ; le point à surveiller reste ce qui te pèse dès jeudi.

**Trace courte**
- DB: weekly `status=completed`, `closure_status=complete`, MAIS response_owner du tour = `weekly_adaptive_review_v1` (pas `normal_reply`).
- Analyse: contrairement a R2 T7, le weekly n'a pas relache l'owner apres completion, donc le fix companion R1-B02 (qui ne s'applique que sous `normal_reply`) n'a pas pu agir; le visible closure a re-synthetise. C'est un comportement de **release/ownership**, hors des 3 fichiers modifies.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche (ameliorations verifiees vs R1)**
- Pression d'application au stage `weekly_adjust_recommendation`: refus concis 127 car. (R2 T4) vs ~600 car. en R1.
- Politesse post-completion sous `normal_reply`: plus de re-synthese du contenu (R2 T7, 77 car.).
- Le gate de confirmation tient sur toutes les poussees (aucune mutation de plan sur r2 et r3).

**Problemes (residuels)**
- R2 T5 / R3 T5: re-deroule de la recommandation au stage synthesis (R2, corrige apres coup) et au stage adjust sous push repete (R3, non deterministe). Familles: repetition visible + BF-ROUTE-03. Severite: yellow.
- R3 T7: post-completion non libere, re-synthese via closure. Severite: yellow.

**Fix propose**
- Dispatcher weekly: classer explicitement "appliquer/valider le changement depuis le chat" comme intention d'action refusee -> reponse concise "je ne modifie pas ici + destination", au lieu de router vers le stage recommandation.
- Investiguer la fiabilite de la liberation active-flow post-completion (owner `normal_reply` garanti au premier tour social apres `closure_status=complete`).

## 4. Analyse Systeme

**Verdict: yellow**

**Fixes verifies**
- Extension deterministe (post-run, couverte par tests unitaires): `canSurfaceAdjustRecommendation` et `repeat_adjust_recommendation_forbidden` bloquent desormais la re-surface d'une recommandation `surfaced_in_weekly=true` aux stages `weekly_synthesis` ET `weekly_closure` (avant: closure seulement). La premiere surface au stage synthesis reste possible (`surfaced_in_weekly=false`).
- Companion `SILENCE_AND_REACTIONS`: invariant de registre post-flow ajoute.

**Residus systeme**
- Stage `weekly_adjust_recommendation`: la (re)surface reste autorisee par design; le refus sous push est une heuristique de prompt non deterministe. Source amont = classification dispatcher (BF-ROUTE-03).
- Release active-flow post-completion non deterministe (R3 T7), independant des 3 fichiers modifies.

**Effets durables**
- r2 et r3: aucune mutation de plan (items/version/occurrences inchanges), weekly `completed`.
- Cleanup cible verifie sur les deux users: `user_chat_states=0`, `chat_messages=0`, `scheduled_checkins=0`, `user_plan_items=0`, `user_cycles=0`, `profiles=0`, Auth delete `ok`.

## 5. Verification post-fix R2-B03 / R2-B04 (run R4)

Apres implementation des fixes dispatcher (R2-B03) et release (R2-B04), un run reel R4 rejoue les deux scenarios residuels:

- R4 T4/T5 (push "applique/valide a ma place"): T4 = 125 car. (refus + destination, aucun re-deroule); T5 = 147 car. via `normal_reply` (le weekly s'etait cloture au T4). Contre R3 T5 = 294 car. re-derive. **R2-B03 corrige.**
- R4 T5/T6 (post-completion): T5 owner `normal_reply`; T6 "merci, bonne nuit" -> owner `normal_reply`, 22 car. "Bonne nuit 🌙 À demain." (plus de re-synthese). Contre R3 T7 = owner weekly + re-synthese. **R2-B04 corrige.**
- DB R4: aucune mutation de plan (version 1, items inchanges), weekly `completed`. Cleanup verifie: tout a 0, Auth delete `ok`.
- Tests unitaires: 103/103 verts (weekly_review + companion + router run + operation pipeline), dont les nouveaux invariants dispatcher/visible (`chat_plan_mutation_request`, refus deterministe) et state (`completed` non actif pour le routage).

Mise a jour des statuts: R1-B01 `fixed`, R1-B02 `fixed`, R2-B03 `fixed`, R2-B04 `fixed`.

## Verdict Global

- Verdict: yellow (au moment des runs R2/R3) -> **green apres fixes, verifie en run reel R4**
- Raison principale: les deux fixes ameliorent nettement les cas cibles (refus concis au stage adjust, politesse post-completion sans re-synthese) et l'extension synthesis/closure rend la non-repetition deterministe (tests unitaires verts). Restent deux residus non deterministes: (1) push d'application route vers le stage recommandation qui peut re-derouler (source amont dispatcher, BF-ROUTE-03), (2) release active-flow post-completion pas toujours effectif. Aucun effet durable incorrect sur aucun run.
- Follow-up prioritaire: fix dispatcher pour l'intention "appliquer dans le chat" + fiabilisation de la liberation post-completion.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-03-weekly-process-r1-bugs.md` (mise a jour avec les residus R2/R3)
