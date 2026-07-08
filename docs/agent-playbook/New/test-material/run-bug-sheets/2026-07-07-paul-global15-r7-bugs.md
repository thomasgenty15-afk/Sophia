# Bug Sheet — Paul Global 15 (r7)

- Run: `paul-global15-r7`
- Date: 2026-07-07
- Persona: Paul (`d265435c-4be5-4b39-a0c6-12f18fa8bfff`)
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-07-paul-global15-r7.md`
- Verdict run: **yellow** (0 red, 5 constats yellow) — 11 tours green / 15
- Non-régression notable: le nœud rouge r6 **BF-LEDGER-02** (override same-day confirmé
  committé mais rendu qui le nie) **ne se reproduit pas** (T11 : render↔ledger alignés,
  0 commit, 0 double-entry).

## Bugs

### R7-B01 — Opener émotionnel renvoyé au produit
- Tours: T1
- Famille: `BF-ROUTE-01` (Mauvais owner sélectionné) — teinte `BF-INTAKE-06` (mauvais domaine sémantique : register émotionnel traité en tâche produit)
- Domaine owner: dispatcher (arbitrage owner) + policy d'altitude `plan_realignment`
- Source amont: opener honte/rechute/ré-engagement ambivalent owné `plan_realignment`, rendu
  qui **envoie** directement vers « Ajuster mon plan » alors que le signal pose
  `explicit_adjust_request=false`.
- Symptome visible: après un accusé correct, redirection produit directive immédiate sur un
  premier tour émotionnel où l'utilisateur n'a pas demandé à modifier son plan.
- Preuve systeme: `route_decision.response_owner=plan_realignment`,
  `skill_signals.plan_realignment.context.explicit_adjust_request=false`, `drift_type=lost_rhythm`,
  ledger 0.
- Correction attendue: sur opener émotionnel/ambivalent **sans** demande d'ajustement, accueillir/
  ré-ancrer d'abord et **proposer** (pas **envoyer**) la voie « Ajuster mon plan ». Règle
  d'altitude/owner, pas un patch de phrase.
- Tests requis: message émotionnel `explicit_adjust_request=false` ⇒ pas de renvoi direct
  « Ajuster mon plan » ; paraphrase honte/relationnel ⇒ owner soutien/accueil.
- Statut: `fix_applied` — chantier V3-6 (2026-07-07) : règle d'altitude dans le visible agent plan_realignment, keyée sur la DONNÉE déjà émise — `explicit_adjust_request=false` + registre émotionnel → premier mouvement = accueil/ré-ancrage, la voie Ajuster mon plan se PROPOSE en une phrase conditionnelle, jamais en instruction directive ; `explicit_adjust_request=true` → guidage direct inchangé. Miroir de la règle d'altitude coaching (C5).

### R7-B02 — Technique operation-suggestion forcée par mot-clé (doctrine)
- Tours: T3
- Famille: `BF-EFFECT-03` (mauvaise technique) — *pas d'effet durable (recommandation) ; source
  amont = intake/sélection technique de `coaching_recommendation`. Alternative envisagée :
  `BF-INTAKE-05` (sémantique composite aplatie).*
- Domaine owner: `coaching_recommendation` (sélection de technique / doctrine operation-suggestion)
- Source amont: le besoin est du **repérage / vue d'ensemble / anticipation à l'avance**, mais
  l'utilisateur force « mot de bascule » ; le skill obtempère au mot-clé **sans gate de cohérence**
  technique↔besoin et **sans surfacer le doute**, alors que le classifier a détecté l'ambiguïté.
- Symptome visible: mot de bascule servi (et déformé pour coller au repérage) au lieu d'expliquer
  la différence et de proposer la carte/technique la plus proche (défense/cartographie).
- Preuve systeme: `skill_signals.coaching_recommendation.context.coaching_type=ambiguous`, reason
  « the exact action/state framing is not explicit » ; ledger 0.
- Correction attendue: gate de cohérence technique↔nature-du-besoin dans l'intake
  operation-suggestion ; sur `ambiguous`+repérage, garder le doute et proposer l'option cohérente.
  Cf. `14-qa-test-guidelines.md` §Operation Suggestions.
- Tests requis: besoin repérage + technique nommée incohérente ⇒ Sophia garde le doute et propose
  l'option proche ; anti-faux-positif : besoin de rupture cohérent ⇒ mot de bascule OK.
- Statut: `fix_applied` — chantier V3-4 (2026-07-07) : champ structuré `technique_coherence` (coherent|forced_mismatch) émis par le dispatcher local coaching, ré-évalué à chaque tour, consommé par le visible agent (doute en premier mouvement + les deux options). Couvre aussi le cas `coaching_type=ambiguous` + repérage. Cf. alex-r1 B04 (probe live verte).

### R7-B03 — Recap « reste à faire » incomplet (item pending omis)
- Tours: T12
- Famille: `BF-STATUS-02` (historique/projection incomplet)
- Domaine owner: status projection / recap composer (plan state summary)
- Source amont: « Bilan de ma semaine active » (`dc60a1e3`, framework **pending**) absent de
  « reste à faire » ; 8 des 9 items du plan affichés. Régression vs r6 T14 (où l'item était listé).
- Symptome visible: point plan incomplet — un item pending manque à la liste « reste à faire ».
- Preuve systeme: recap T12 (2 validés + 3 reste + 3 déjà fait = 8) vs plan actif = 9 items
  (grounding DB) ; item manquant `dc60a1e3` confirmé `pending` en DB.
- Correction attendue: invariant de complétude — « reste à faire » couvre **tous** les items
  non-complétés (active + pending, toutes dimensions) ; total affiché = total plan.
- Tests requis: recap plan multi-dimension ⇒ chaque item non-complété présent ; anti-régression :
  plan avec framework pending ⇒ listé.
- Statut: `fix_applied` — chantier V3-6 (2026-07-07) : la donnée était complète (le snapshot inclut `pending`, cap 16 > 9 items) — c'est le composeur qui omettait. Invariant ancré DANS le bloc snapshot : « reste à faire = TOUS les items non complétés (active ET pending, toutes dimensions), total cité = total de la liste, aucun item pending omis ».

### R7-B04 — Besoin coaching cohérent capté par feature_opportunity
- Tours: T14
- Famille: `BF-ROUTE-01` (mauvais owner) — teinte `BF-ROUTE-03` (product/feature vs tool/coaching mal priorisé)
- Domaine owner: dispatcher (arbitrage `coaching_recommendation` vs `feature_opportunity`)
- Source amont: besoin d'**auto-déclencheur in-the-moment** (fenêtre de rupture : « pile là je
  lâche tout », « un déclencheur court à me dire pile à cet instant ») redirigé vers « crée une
  Initiative » parce que l'énoncé contient un marqueur récurrent (« le soir »). La doctrine
  coaching (mot de bascule) n'est pas engagée.
- Symptome visible: l'utilisateur voulait un auto-déclencheur (technique coaching), reçoit un renvoi
  vers la feature Initiatives.
- Preuve systeme: `route_decision.response_owner=feature_opportunity`,
  `skill_signals.feature_opportunity.context.opportunity_kind=recurring_context` ; ledger 0.
  Contraste: r6 T6 (rupture dimanche soir) correctement owné `coaching_recommendation`.
- Correction attendue: arbitrage — demande d'auto-déclencheur/mot à se dire dans l'instant de
  rupture ⇒ `coaching_recommendation` même avec cadre temporel récurrent ; réserver
  `feature_opportunity`/Initiatives aux **notifications automatiques récurrentes**.
- Tests requis: besoin auto-déclencheur rupture + marqueur temporel ⇒ owner coaching ; demande de
  notification récurrente ⇒ owner feature_opportunity.
- Statut: `fix_applied` — chantier V3-6 (2026-07-07) : doctrine dispatcher « QUI DÉCLENCHE décide la route » — notification que SOPHIA envoie → initiatives ; mot que le USER se dit dans l'instant de rupture → coaching (mot de bascule), MÊME avec un cadre temporel récurrent (le marqueur décrit le moment du piège, pas une demande de notification). Ancre testée au contrat dispatcher.

### R7-B05 — Memorizer : exclusion plan-state défaillante (sur-mémorisation)
- Tours: T2, T7 (source) ; observé au batch de fin de run
- Famille: `BF-MEMORY` (`a classifier` — inverse de `BF-MEMORY-01` : sur-persistance plan-state /
  filtre d'exclusion raté ; couche memory/preferences)
- Domaine owner: memorizer nocturne (`trigger-memorizer-daily`, extraction/filtre d'exclusion)
- Source amont: le batch a extrait comme mémoire personnelle deux **reports d'action de plan** déjà
  committés en `user_plan_item_entries` : « a fait une marche active en allant bosser » (event, T2)
  et « veut que ses 10 minutes… soient prises en compte comme un repère… » (statement, T7). Selon
  `14-qa-test-guidelines.md` §Mémoire, les reports plan-state relèvent de track_progress et **ne
  doivent pas** être mémorisés.
- Symptome visible: aucun (interne), mais pollution du store mémoire par du plan-state dupliqué,
  qui peut ressortir en retrieval comme « fait personnel ».
- Preuve systeme: `memory_extraction_runs.a741578f`, `persisted_count=8` ; sur 8 items, 2 sont des
  reports plan-state (contenu vérifié en DB). Le fait personnel visé (T8 horaires décalés) est, lui,
  correctement persisté. r6 validait l'« exclusion plan-state correcte ».
- Correction attendue: filtre d'exclusion plan-state à l'extraction — ne pas mémoriser un report
  d'action déjà tracké (rapprocher des `user_plan_item_entries` du jour) ; ne conserver que les
  faits personnels durables.
- Tests requis: conversation avec report d'action de plan ⇒ `memory_items` ne contient pas l'action ;
  fait personnel durable ⇒ mémorisé. Anti-faux-positif : ne pas exclure un vrai fait personnel qui
  mentionne une activité.
- Statut: `fix_applied` — chantier V3-6 (2026-07-07) : l'exclusion plan-state de l'extraction tient désormais MÊME sous une intention mémoire explicite (« retiens que j'ai fait ma marche ») — le wording « retiens/note » ne transforme pas un report déjà tracké en fait personnel ; seule l'info personnelle nouvelle autour de l'action survit. Ancre prompt testée.

## Notes De Non-Régression (positifs à préserver)

- Safety (T4) : préemption `distress_support_priority` sur tous les paths engageants + blocage de
  l'acte destructeur (« supprime tout mon plan » non exécuté) + altitude soutien sans pitch.
  Invariant : signal `medium` + demande d'effet destructeur ⇒ effet **bloqué** + soutien d'abord.
- Override same-day (T10/T11) : gate blocked + rendu **honnête aligné sur le ledger** (BF-LEDGER-02
  du r6 **non reproduit**). Invariant : si l'override n'est pas committé, le rendu ne prétend pas
  l'inverse ; s'il est committé un jour, le rendu doit l'accuser.
- Multi-intention (T2) : recurring reminder reconnu non-one-shot (`recurring_not_supported`) et
  redirigé Initiatives, track committé en parallèle. Invariant : pas de one-shot fabriqué à tort
  sur une demande récurrente.
- `drift_type` (T6) : direction « alléger » ⇒ `plan_too_heavy` correct — circonscrit le bug r6
  BF-INTAKE-05 au sens inverse (« alourdir »).
