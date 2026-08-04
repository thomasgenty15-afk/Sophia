# Bug Sheet — Rose global15 r1 (2026-07-06)

Run: `qa-rose-global15-20260706-r1` · Persona: Rose · Rapport:
`qa-run-reports/2026-07-06-rose-global15-r1.md`

Verdict global du run: **yellow** (système yellow, fluidité green). Aucun `red`.
Effets durables tous corrects, état restauré en fin de run.

## Bugs

### R1-B01 — Rappel récurrent explicite reclassé en initiative

- Bug id: R1-B01
- Tours: T6
- Famille: BF-ROUTE-03 (Product/status/tool mal priorisés) — borderline / probable by-design
- Domaine owner: routing/ownership + contrat `feature_opportunity`
- Source amont: arbitration `feature_opportunity` vs tool skill rappel; distinction
  ponctuel/récurrent dans la route policy
- Symptome visible: « mets-moi un rappel tous les jours à 18h » → Sophia répond
  « ça ressemble à une initiative, pas à un rappel ponctuel » et renvoie vers
  Dashboard > Initiatives à configurer soi-même; aucun rappel récurrent créé
- Preuve systeme: owner=`feature_opportunity`, route_reason=`feature_opportunity_signal`,
  direct_effects=[], aucun effet durable
- Correction attendue: statuer le contrat produit — un rappel récurrent explicite
  peut-il être un tool skill agent (avec collecte de slots + confirmation) ou
  reste-t-il une initiative user-owned ? Rendre la route déterministe et
  documentée. Pas de patch de phrase.
- Statut: `fix_applied` — **arbitrage produit tranché (2026-07-06)**: le récurrent
  reste user-owned (seuls one-shot reminder et track_progress s'écrivent depuis le
  chat), pas de nouveau tool skill. Chantier Y4: doctrine FO « rappel récurrent
  explicite = opportunité initiatives, mais la réponse ACCOMPAGNE » (expliquer,
  donner la destination, proposer de garder le créneau, ne jamais dire créé ni
  impossible). **Probe live** (Rose): « un rappel tous les jours à 18h » → outcome
  `recurring_not_supported` honnête, réponse accompagnante avec destination +
  offre d'aide à formuler le message.
- Fix reference: chantier Y (2026-07-06)
- Tests requis: positif (« rappelle-moi chaque jour à 18h de … » → route stable);
  paraphrase (« mets un rappel quotidien … »); anti-faux-positif (one-shot reste
  one-shot, cf. T7 OK)

### R1-B02 — product_help non groundé sur l'emplacement des rappels ponctuels

- Bug id: R1-B02
- Tours: T13
- Famille: `a classifier` (gap de base de connaissance `product_help`; pas de
  famille BF exacte pour un contenu product_help thin/inexact — routing correct)
- Domaine owner: `product_help` (source de grounding produit)
- Source amont: base de connaissance produit incomplète (mapping surface→écran)
  pour rappels one-shot vs initiatives
- Symptome visible: « c'est où dans l'app que je vois mon rappel ? » → « je n'ai
  pas la source exacte … Dashboard > Initiatives … sinon ce n'est pas exposé ici »
  (probablement inexact: le one-shot vit dans `scheduled_checkins`, pas dans
  Initiatives)
- Preuve systeme: owner=`product_help`, route_reason=`product_help_signal`,
  réponse hedgée sans grounding; rappel réellement créé en `scheduled_checkins`
  (id `92e47ff9`, one_shot)
- Correction attendue: enrichir la source de vérité produit du `product_help`
  (emplacement UI des rappels ponctuels et des initiatives). L'honnêteté évite
  l'hallucination mais la réponse reste inexploitable. Lié à R1-B01 (surfaces
  rappel/initiative mal documentées côté produit).
- Statut: `fix_applied` — chantier Y4 (2026-07-06). Vérité produit établie dans le
  frontend (RemindersSection lit `scheduled_checkins`, rendue dans l'onglet
  Dashboard libellé « Initiatives », avec voir/modifier/pause/supprimer). Fix:
  entrée de connaissance dédiée `one_shot_reminder` (création en conversation,
  visible dans Dashboard > Initiatives section rappels, distinction
  ponctuel/récurrent) + alias « rappel/rappels » retirés de l'entrée initiatives
  (ils captaient à tort les questions one-shot). **Probe live** (Rose, rappel créé
  puis « je le vois où dans l'app ? ») → « Dashboard > Initiatives, dans la
  section des rappels » avec l'heure exacte.
- Fix reference: chantier Y (2026-07-06)
- Tests requis: positif (« où voir mon rappel ponctuel » → écran correct);
  anti-faux-positif (ne pas renvoyer systématiquement vers Initiatives)

## Notes de surveillance (non-bug)

- T11: `turn_frame.safety` vide sur un cluster de découragement/dévalorisation.
  Réponse conversationnelle correcte et protectrice, side effects bloqués → pas
  de safety ratée. À surveiller: consigner un signal soft même quand la route
  reste `normal_reply` (observabilité), sans changer le comportement de soutien.
- T14: recap status servi sous owner `product_help` (continuité de flow depuis
  T13). Donnée exacte, sans impact; à noter comme légère persistance de flow.
