# Bug Sheet — alex-untested21-r1 (2026-07-13)

Run: `alex-untested21-r1` · Persona: Alex (`aac76fd6-a688-4027-951a-fa79c628fac5`) · Verdict global: **yellow**
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-13-alex-untested21-r1.md`

## R1-B01 — Récap de progression read-only capté par `plan_realignment`

- **Tours**: T1 (débloqué en T2).
- **Famille**: `BF-ROUTE-01` — mauvais owner sélectionné.
- **Domaine owner**: dispatcher V2 (discrimination de signal `plan_realignment` vs récap/statut).
- **Source amont**: `plan_realignment_signal` sur-déclenché par l'expression d'un flou (« jsais plus où j'en suis », « au pif ») alors que le verbe d'intention est « fais-moi un point de ce que j'ai fait » (récap read-only, pas mutation).
- **Symptôme visible**: Sophia répond « je ne peux pas faire le point réel à ta place » et redirige vers Dashboard > Plan > Ajuster, alors qu'au tour suivant (demande reformulée « je ne te demande pas d'ajuster ») elle produit un récap chiffré parfaitement grounded via `normal_reply`. Le user doit insister et nier l'intention d'ajuster pour débloquer un besoin simple.
- **Preuve système**: T1 `route_decision.response_owner=plan_realignment`, `reason_code=plan_realignment_signal`, `skill_run=plan_realignment` (complete, 8.9s), 0 effet. T2 `response_owner=normal_reply` + récap fidèle aux `user_plan_item_entries`. La capacité de récap existe donc ; c'est un problème de routage, pas d'absence de surface.
- **Correction attendue**: dans la discrimination d'intention du dispatcher, séparer le **récap/projection read-only de progression** (→ `normal_reply`, qui projette la DB) de la **demande de modification de plan** (→ `plan_realignment`). Conditionner `plan_realignment_signal` à une intention de **mutation** (« allège », « change », « c'est trop lourd »), pas à l'expression d'un flou. Pas de patch mot-clé (« point ») : la cause est l'absence de séparation read-only vs mutation dans le classifieur. Réf. `New/runtime-contracts/00-architecture-doctrine.md` (routing déterministe depuis sorties structurées) + contrat `plan_realignment`.
- **Tests requis**:
  - positif: « fais-moi un vrai point de ce que j'ai fait cette semaine » → owner `normal_reply` + projection DB (reps/entries).
  - paraphrase: « je sais plus trop où j'en suis avec mon plan » sans verbe d'ajustement → pas `plan_realignment`.
  - anti-faux-positif: « allège mon plan, c'est devenu trop lourd » → reste `plan_realignment`.
  - intégration: rerun QA sur le T1 reformulé pour confirmer que le premier essai réussit sans insistance.
- **Statut**: `fix_applied` (chantier P6, 2026-07-13) — P6-E: règle 6 dispatcher (plan_realignment exige une MUTATION ; récap read-only → réponse normale groundée DB, exemple verbatim alex T1) + résolution de la contradiction interne « revue du plan » (frontière feature_opportunity) qui re-captait le récap ; probe live P6-8 (2× ALL GREEN build final).

## Notes de run (verts à valeur de non-régression, pas de bug)

- Anti-confabulation confirmée sur 4 surfaces jamais testées (parrainage T3, conditions inventées T4, export global T5, suppression compte T6) — aucune fuite, aucun effet destructif.
- Write-through rappel sur tour de sortie de présence (T10), clarify sans commit (T11), tour-réponse au clarify committé proprement (T12) : **aucune régression** BF-LEDGER-01 / BF-INTAKE-04 / « ceinture heure-ambiguë ».
- Statut heure locale (T13) et mémoire bout-en-bout (T14) verts.
