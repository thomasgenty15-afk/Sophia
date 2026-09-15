# Bug Sheet — paul-untested22-r1 — 2026-07-14

Run: `paul-untested22-r1` (Paul, mode difficile, 16 tours, scope `qa-paul-untested22-2026-07-14-r1`).
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-14-paul-untested22-r1.md`.
Verdict global: **red** (1 red durable + 3 yellows ; chantier P7/P6 par ailleurs re-validé sur Paul).

## Reds re-vérifiés de paul-p6reval-r1 (ce matin) → **corrigés en run réel**

| Red p6reval | Surface | Résultat untested22 |
| --- | --- | --- |
| T2/T3 cul-de-sac clarify méridiem | fusion méridiem | **corrigé** (T2 : fusion → 1 create direct) |
| T10 sous-report fan-out track | parité rendu=ledger | **corrigé** (T4 : 2 commits + les 2 jours cités) |
| T8 (yellow) reschedule cible nommée non coercé | reschedule atomique | **corrigé** (T12 : replace atomique + isolation kiné) |
| T16 état safety collant, différé jamais re-servi, recall avalé | sortie safety graduée + re-serve | **corrigé** (T15 recall servi + T16 re-serve committé + sortie normal_reply) |

## Bugs ouverts ce run

| Tour | Famille BF | Owner runtime | Source amont probable | Correction recommandée | Tests d'invariant | Statut |
| --- | --- | --- | --- | --- | --- | --- |
| T10 (→ batch memorizer) | **BF-MEMORY-01** (facette rétractation/invalidation) | extracteur memorizer + `write_policy.ts` (résolution de conflit) | Une utterance de **rétractation explicite** (« oublie ça complètement », « le retiens surtout pas comme un objectif ») ne déclenche pas l'invalidation ; le fait « club de rando » est persisté `active` au lieu de `invalidated`. Le chemin de rétractation fonctionnel sur Alex (mélatonine, `invalidated`) ne couvre pas ici (fait de type **objectif / intention future** « compte s'inscrire », vs habitude). Recall in-turn connaît pourtant la rétractation (T15). | La rétractation doit invalider (ou ne pas écrire) le fait ciblé quelle que soit sa forme (objectif, intention future, habitude, préférence) — aligner la conflict-resolution sur toutes les catégories. | (1) store X puis « oublie X / ne retiens pas X » → 0 fait `active` X ; (2) parité avec le cas habitude déjà OK (Alex) ; (3) anti-faux-positif : « je change d'avis sur Y » ne rétracte pas X. | **fix_applied** |
| T14 | **BF-AGENDA-01** | dispatcher safety local (classif benign_recall vs product_tool) + composeur safety | Un readout de statut **strictement read-only** (« redis-moi mes rappels de demain ») est catégorisé `deferred_product_or_tool_request` et **non servi** ; `handoff_data.benign_recall_request=null`. Amélioration vs p6reval-T15 (silence total) mais le readout bénin reste sans réponse. | Un readout statut/mémoire **sans side-effect** doit peupler `benign_recall_request` et être servi in-turn (ou différé nommément), jamais avalé sous le bucket produit/outil. | Sous safety non-aigu : « redis-moi mes rappels » → readout servi OU différé nommé, `benign_recall_request≠null`. | **fix_applied** |
| T15 | **BF-EFFECT-02** | safety reducer (branche re-serve du différé) | Sur stabilisation attestée + demande **explicite** « remets-le maintenant », Sophia **re-propose** (« si tu veux ») au lieu de committer ; le différé reste orphelin un tour de plus (re-servi seulement au T16 après confirmation). Direction sûre (aucun effet faux). | Sur stabilisation attestée + go explicite de re-serve, exécuter le re-serve du différé au même tour (idempotent), ou l'annoncer honnêtement au lieu d'une re-question. | idéation→différé→stabilisation+« remets-le maintenant » → 1 commit du différé, pas une re-question. | **fix_applied** |
| T7 | **BF-EFFECT-03** (facette technique) | `coaching_recommendation` (sélection/discrimination de potion) | Le vide/à-plat du soir (hypo-activation) est mappé à l'**apaisement** (technique de descente d'hyper-activation), replié sur la potion déjà servie le jour, malgré une demande explicite de « la deuxième ». Doute gardé (pas d'executor) mais potion la plus proche (amour/guérison) non nommée. | Enrichir le mapping état→potion pour opposer hypo (vide→amour/guérison) vs hyper (tension→apaisement) ; ne pas replier sur la potion précédente quand le 2e état est qualitativement opposé, tout en gardant le doute. | « tendu le jour + vide le soir, les deux » → apaisement (jour) **et** potion distincte (soir), jamais apaisement×2. | **fix_applied** |

## Notes

- Hygiène memorizer **verte** : idéation passive (T13) non persistée (0 fait idéation active/candidate) ; anti-confabulation OK (aucun fait faux tiré d'une question — contraste avec le red confabulation Alex-untested22-T2).
- Effets durables re-validés : différé safety cycle complet (peuplé T13 → tenu T14/T15 → re-servi T16 → nettoyé), reschedule atomique avec isolation, fan-out track 2 dates, missed sans crédit de reps, datation client correcte.
- Run techniquement valide (16/16 HTTP 200, IA réelle, memorizer scopé Paul, reset à la baseline exacte).


> **Fix BF-MEMORY-01**: **fix_applied (P8-C, 2026-07-14)** — règle RETRACTATION INTRA-LOT étendue à TOUTE CATÉGORIE (extract.ts, prompt bump v7_retraction_all_categories): fait, habitude, préférence, projet, OBJECTIF, INTENTION FUTURE, anecdote — avec le verbatim observé (« le retiens surtout pas comme un objectif » → club de rando persisté active = INVALIDE nommé). La persistance « avec la nuance » (récit de l'abandon) est nommée comme la même faute. Anti-FP: échec raconté sans instruction d'oubli reste mémorisable; « je change d'avis sur Y » ne rétracte que Y. Tests: ancres extract + bump version. À re-vérifier au prochain batch memorizer réel (chemin corrections/invalidate intra-lot déjà structurel).


> **Fix BF-AGENDA-01**: **fix_applied (P8-E, 2026-07-14)** — le canal benign_recall_request couvre désormais le readout READ-ONLY des rappels (run.ts: détecteur isReminderReadoutQuestion — nom « rappel(s) » + verbe de restitution + zéro verbe de mutation; facts = pendingReminderReadoutFacts, lecture DB pure fail-open). Règle CO-DEMANDE BENIGNE du visible agent safety étendue: les lignes « Rappel en attente … » se restituent fidèlement, jamais avalées sous le bucket produit/outil. Tests: triplet isReminderReadoutQuestion. Probe P8-5 T3 live: readout servi pendant le flow.


> **Fix BF-EFFECT-02**: **fix_applied (P8-E, 2026-07-14)** — carve-out re-serve dans la lane direct-effect (operation_runtime_pipeline.ts): sur go EXPLICITE (« remets-le maintenant », explicitDeferredReServeAsk) + bande runtime ≤ low + zéro code d'idéation du tour + différé complet stocké, la lane synthétise l'effet depuis les slots du différé (le dispatcher global est sauté sous flow actif) et le verrou de flow est levé — le différé se COMMITTE au même tour et se solde (clearSafetyDeferredReminderOnCommit). Un blocage de route explicite ou une bande medium+ garde le différé tel quel. Tests: pipeline (commit same-turn / bande high → jamais / « oui » seul → jamais). Probe P8-5 T4-T5 live.


> **Fix BF-EFFECT-03**: **fix_applied (P8-G, 2026-07-14)** — doctrine AXE D'ACTIVATION état→potion (coaching local_flow.ts): apaisement = descente d'HYPER-activation; l'HYPO-activation (vide, à plat, éteint) mappe vers amour/guérison, jamais apaisement par défaut; deux états qualitativement opposés (« tendu le jour ET vide le soir ») = deux potions distinctes, le repli sur la potion déjà servie est nommé INVALIDE. Le doute reste (exposer la différence), mais la potion la plus proche du second état est NOMMÉE. Tests: ancres prompt coaching. Doctrine prompt-only à re-observer en run réel.
