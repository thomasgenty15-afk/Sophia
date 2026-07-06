# Run Bug Sheet - qa-global15-alex-2026-07-06-r3

## Metadata

- Date: 2026-07-06
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-06-alex-global15-r3.md`
- Run id: `qa-global15-alex-2026-07-06-r3`
- Persona / scenario: Alex (sommeil) — global15 variante nuit/session tardive, mode difficile
- Verdict run: `yellow`
- Validite QA: valide (15 tours réels, HTTP 200 x15, IA réelle locale `test-send-message` `force_full_ai=true`, chaque tour choisi après lecture, état durable reset et vérifié)
- Agent owner: QA agent (run automatisé)

## Synthese

- Familles dominantes: `BF-ROUTE-01` (arbitrage ownership carte de coaching), `BF-ROUTE-02` (flow coaching collant), `BF-EFFECT-03` (planner d'effets non polarity-aware), memory write-policy (`a classifier` / cf `BF-MEMORY-01`).
- Bug le plus bloquant: `R3-B01` — demande explicite de carte non ownerisée vers `coaching_recommendation` (3 tours pour atteindre le bon skill), bloque au passage le test de cohérence-technique.
- Fix architectural prioritaire: renforcer le classifieur d'intention « créer/obtenir une carte » comme signal `coaching_recommendation` prioritaire sur `feature_opportunity`/`product_help`.
- Rerun requis: oui après fix routing carte + planner polarity-aware; re-vérifier la rétention mémoire de la correction (R3-B04).

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R3-B01` | T2, T3 | `BF-ROUTE-01` | dispatcher / route policy (arbitrator carte vs feature/product) | classifieur d'intention: « une carte à sortir/utiliser » pas mappé assez fort vers `coaching_recommendation`; « soir/récurrent » tire vers `feature_opportunity`, verbe « fais/veux » vers `product_help` | l'user demande explicitement une carte, Sophia renvoie Initiatives (T2) puis explique le concept (T3); le skill carte n'est atteint qu'au verbe « formule » (T4) | T2 `response_owner=feature_opportunity`/`feature_opportunity_signal`; T3 `product_help`/`product_help_signal`; T4 `coaching_recommendation`/`coaching_recommendation_signal` | « créer/obtenir une carte (attaque/défense) » = signal `coaching_recommendation` prioritaire sur `feature_opportunity`/`product_help` | `open` | — | positif (`fais/veux/donne une carte` → coaching) + paraphrase + anti-FP (`rappel récurrent` reste `feature_opportunity`) |
| `R3-B02` | T6 (T5 précurseur) | `BF-ROUTE-02` | active flow / interruption policy (TurnAgenda) | `active_flow_arbitration` maintient `continue_active` pour `coaching_recommendation` sur un tour émotionnel/identitaire sans signal de reprise de carte | ouverture anti-fossilisation correcte, puis re-pitch forcé d'une carte de défense (3e mention) sur un self-label identitaire qui ne demandait rien | T5/T6 `route_reason=active_coaching_recommendation`, `response_owner=coaching_recommendation`; safety T6 `none` | relâcher `coaching_recommendation` actif quand le tour est émotionnel/identitaire sans continuation carte → `normal_reply`/soutien | `open` | — | positif (tour self-label/détresse pendant flow coaching → `normal_reply`) + anti-FP (vraie continuation carte reste dans le flow) |
| `R3-B03` | T14 | `BF-EFFECT-03` | direct-effect planner (`route_decision.direct_effects_to_run`) | planner non polarity-aware: toute mention de « rappel » → `create_one_shot_reminder`, même sur « annule-le » | réponse honnête « rien à supprimer », mais un `create_one_shot_reminder` est armé sur une intention d'annulation (bloqué par le gate) | T14 `direct_effects_to_run=["create_one_shot_reminder"]`, effect_ledger requested 1 / blocked 1 / committed 0; DB: 0 reminder | intention d'annulation/négation n'arme aucun `create_*`; si objet inexistant, aucun effet armé (armer un `cancel_*` seulement si objet existe) | `open` | — | positif (`annule le rappel` → aucun `create_*` dans `direct_effects_to_run`) + paraphrase négative + anti-FP (`crée un rappel` arme bien le create) |
| `R3-B04` | T8 (+ batch nocturne) | `a classifier` (memory write-policy / conflict resolution; cf `BF-MEMORY-01`) | memorizer (`trigger-memorizer-daily` / memorizer_async / extract) — résolution de conflit | correction de mécanisme extraite puis auto-invalidée dans le même batch, sans item superseding | la compréhension actuelle du mécanisme (« décrochage mental = problème, écrans réglés ») n'est pas retenue en mémoire active | `memory_items`: item `status=invalidated`, `superseded_by_item_id=none`, `valid_until`=heure du batch; aucun item obsolète contradictoire ne survit en `active` (seul reste un item générique) | une correction qui supersede une croyance antérieure marque l'ancien item superseded et garde le nouveau actif; interdire une invalidation `superseded_by=none` sur un item frais non conflictuel | `open` | extraction_run_id `aff1c1b8-…` | positif (correction de mécanisme reste `active` ou supersede explicitement) + anti-FP (vrai doublon conflictuel toujours dédupliqué) + intégration memorizer |

## Points Positifs Verifies (non-régressions)

| Item | Tours | Preuve | Note |
| --- | --- | --- | --- |
| Contrainte « ne crée rien » respectée | T1 | `direct_effects_to_run=[]`, memory_plan capture l'intention no-effect | gating d'entrée OK |
| Guardrail raté (pas de fausse complétion) | T5 | 0 entry DB, effect_ledger vide sur un quasi-abandon ambigu | contrepartie de T13 |
| Désescalade safety (non imminent) | T9 | `distress_support_priority`, `risk_band=medium/hopelessness`, 0 side effect, pas de hotline | conforme classification safety |
| Pas de patch de plan silencieux | T10 | `plan_realignment`, plan items = baseline (diff), 0 effet | invariant weekly/realignment |
| Récurrent → Initiatives sans one-shot armé | T11 | `feature_opportunity`, `direct_effects_to_run=[]`, 0 reminder | **non-régression vs finding r2 BF-EFFECT-03** |
| `track_progress` positif correct | T13 | commit sur `f56793eb`, `progress_status=completed`, reps 1→2 | bonne cible |
| Anti-fossilisation identité en mémoire | T6 + batch | self-label identitaire **rejeté**, absent des `memory_items active` | **amélioration vs r2 R2-B01** |
| Commit mémoire fait personnel légitime | T7 + batch | `active`, `fact`, conf 0.95, date normalisée 27/07/2026 | accusé in-turn conforme |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-06 | R3-B04 classé `a classifier` (memory write-policy) plutôt que `BF-MEMORY-01` strict | la taxonomie n'a pas de code « invalidation orpheline / rétention de correction »; `BF-MEMORY-01` vise la promesse mémoire explicite non persistée, pas une correction auto-invalidée par la résolution de conflit | QA agent | familly-bugs.md |
| 2026-07-06 | T5 noté green malgré capture par flow coaching actif | outcome durable correct (0 fausse complétion); la capture ne devient dommageable qu'au T6 (répétition visible) → R3-B02 | QA agent | rapport §2 T5/T6 |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-06 | R3-B03 | non-régression du finding r2 sur besoin récurrent (T11) | one-shot non armé sur récurrent (mais toujours armé sur annulation T14) — famille partiellement active | rapport §2 T11/T14 |
| 2026-07-06 | R2-B01 (rappel) | rétention identité en mémoire (T6) | corrigé/non reproduit — identité rejetée | rapport §4 |
