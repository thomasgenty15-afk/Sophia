# Bug Sheet — eva-hard24-r1 (2026-07-14)

Run: `eva-hard24-r1` — persona Eva (web), scope `qa-eva-hard24`, branche `clean-v2-redesign` (WIP).
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-14-eva-hard24-r1.md`.

Verdict global: **red** (1 red système, 1 yellow post-run). Baseline restaurée (entries 0, rappels 0, potions 0, memory 0).

---

## R1-B01 — Multi-intent track+rappel : 2ᵉ effet droppé + faux refus de capacité

- **Bug id**: R1-B01
- **Tours**: T10
- **Famille**: `BF-AGENDA-01` (multi-intention incomplète) ; adjacent final response pipeline (refus de capacité non fondé, proche `BF-LEDGER`)
- **Domaine owner**: `TurnAgenda` (compilation multi-intention) + final response pipeline (garde contre refus confabulé)
- **Source amont**: quand un tour porte un `track_progress_plan_item` **et** un `create_one_shot_reminder`, seul le track survit au plan d'effets (`direct_effects_to_run: ["track_progress_plan_item"]` uniquement) ; le composeur, ne voyant pas d'effet rappel, **invente** un refus « je ne peux pas le créer ici ».
- **Symptome visible**: User dit « note le puzzle **et** rappelle-moi demain 19h ». Sophia note le track puis répond « Pour le rappel de demain à 19h, je ne peux pas le créer ici » — **faux** (T9 et T12 créent des rappels sans souci). Le rappel 19h n'est jamais créé.
- **Preuve systeme**: `route_decision.direct_effects_to_run = ["track_progress_plan_item"]` (pas de `create_one_shot_reminder`). DB: entry `checkin/completed` sur `f539e68c` le 2026-07-14 (reps null→1) OK ; `scheduled_checkins` reste à 1 (celui du T9), **aucun rappel 19h**. Confirmé côté user au T15 (« pas de rappel de demain 19h »). Contraste T9 (rappel solo committé) et T12 (rappel solo committé sous safety) → capacité rappel intacte, seule la **collision multi-intent** échoue.
- **Correction attendue**: doctrine multi-intention = N effets indépendants → un tour track+rappel compile **les deux** effets ; garde composeur interdisant tout refus de capacité non fondé (commit, ou différé honnête nommé, jamais « je ne peux pas »). Réf: `00-architecture-doctrine.md` (routing déterministe depuis sorties structurées), contrat TurnAgenda ; double-red historique global18 T9 / global19 T13 (censé revalidé p4verify/hard23).
- **Tests requis**: (positif) « note A + rappelle-moi B demain 19h » → 1 entry + 1 `scheduled_checkins` ; (paraphrase) ordre inversé rappel-puis-track ; (anti-faux-positif) aucune occurrence de refus « je ne peux pas le créer » quand `create_one_shot_reminder` est disponible ; (intégration) ledger `committed>=2` sur le tour multi-intent.
- **Statut**: `fix_applied` (P10-C, 15/07) — doctrine dispatcher ancrée sur l'INVALIDE hard24 verbatim (3e occurrence : les DEUX effets, toujours) + GARDE STRUCTURELLE `stripUnfoundedReminderCapacityDenial` : un refus de capacité rappel sans AUCUN outcome create du tour est retiré et remplacé par une récupération honnête (« redonne-le moi et je te le pose ») — le refus reste intact quand un outcome bloqué le justifie (récurrent, artefact, safety). Probe live P10-5 : track committé + zéro refus confabulé + parité rappel↔DB, 2× ALL GREEN.
- **Fix reference**: chantier P10 (`15-chantiers-log.md`)

---

## R1-B02 — Rétractation mémoire non honorée par le memorizer (récurrent)

- **Bug id**: R1-B02
- **Tours**: T14 (rétractation) → Post-run (memorizer)
- **Famille**: `BF-MEMORY-01` (promesse/état mémoire incorrect) ; couche extraction = `BF-INTAKE-03` (contrainte explicite « le retiens pas » perdue)
- **Domaine owner**: memorizer `extract` / write_policy (propagation des rétractations conversationnelles à l'extraction)
- **Source amont**: la contrainte de rétractation exprimée in-turn (« oublie ça, le retiens surtout pas comme un truc sur moi ») n'est pas propagée au batch d'extraction ; l'item est extrait puis persisté `active`.
- **Symptome visible**: fait « prépare ses affaires le dimanche soir » stocké comme trait durable **malgré** la rétractation explicite du T14.
- **Preuve systeme**: memorizer scopé Eva `processed_count=1, message_count=15, persisted 5, statement_as_fact_violation=0`. `memory_items` item 3 = `active statement` « prépare souvent ses affaires le dimanche soir… ». In-turn T14 correct (owné `normal_reply`, 0 effet, accusé honnête) — le trou est **à l'extraction**. Contraste alex-untested22 T9 (rétractation → `invalidated`).
- **Correction attendue**: propager la rétractation explicite à l'extraction/write_policy → l'item ciblé passe `invalidated` (ou n'est jamais persisté). Invariant « oublie X » ⇒ X non-`active` au batch.
- **Tests requis**: (positif) store « retiens X » puis « oublie X » sur le même run → item `invalidated`/absent après memorizer ; (paraphrase) « laisse tomber ce truc », « en fait garde pas ça » ; (anti-faux-positif) une rétractation ne doit pas invalider un autre fait non ciblé.
- **Statut**: `fix_applied` (P10-D, 15/07) — VERROU STRUCTUREL `retraction_guard` au write-path du memorizer (les segments rétractés du lot droppent tout item qui les recouvre, « oublie ça » en tête de message ciblant le message user précédent — le cas eva exact en test) + injection session côté composeur. La doctrine prompt v7 reste en place mais n'est plus le seul rempart.
- **Fix reference**: chantier P10 (`15-chantiers-log.md`)

---

## Nits (non bloquants, pas de ligne BF ouverte)

- **T2**: drill-down quantitatif needs_research ne re-déclenche pas de grounding ; réponse honnête et générique, pas de chiffre confabulé → acceptable, à surveiller si un jour la réponse chiffre au-delà du contexte groundé.
- **Post-run item 4**: état transitoire « le soir vers 22h speed » persisté `active` plutôt que `candidate` (même nit que hard23).
- **Couverture T8**: fan-out validé sur **jours nommés** (jeudi/vendredi/samedi) ; variante **relative chaînée** (« hier, avant-hier, le soir d'avant », red hard23 T1) non rejouée → à couvrir en 24.2.
