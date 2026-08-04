# Run Bug Sheet - global15-nina-20260706-r1

## Metadata

- Date: 2026-07-06
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-06-nina-global15-r1.md`
- Run id: `global15-nina-20260706-r1` (scope `qa-global15-nina-2026-07-06-r1`)
- Persona / scenario: Nina — run global 16 tours (attaque, défense, track, reminder, status, product_help, wish, clarify, safety, adjust, mémoire, suppression, report vague, cohérence)
- Verdict run: **yellow** (0 red, 4 yellow, 12 green)
- Validite QA: **valide** (IA réelle locale, `force_full_ai=true`, 16× HTTP 200, 16 traces réelles, scope dédié, 0 incident, cleanup vérifié)
- Agent owner: QA agent (Claude)

## Synthese

- Familles dominantes: `BF-ROUTE-02` (flow actif non relâché sur bascule d'intention — T4, T11, T12) et `BF-ROUTE-01` (carte de défense captée par `feature_opportunity` — T3). Racine commune: la politique de sortie/arbitrage de flow.
- Bug le plus bloquant: aucun bloquant dur (pas d'effet durable faux, safety/mémoire OK). Le plus impactant UX = rétention de flow actif (`active_feature_opportunity`, `active_coaching_recommendation`) qui rend inatteignables `prepare_defense_card` et `plan_realignment` tant qu'un flow est ouvert.
- Fix architectural prioritaire: condition de sortie de flow sur bascule d'intention explicite (rejet de la piste proposée / nouvelle demande d'un autre domaine), en plus du seuil de risque `should_exit_flows` ; + priorité `coaching_recommendation` (défense) sur `feature_opportunity` pour un pattern récurrent de bascule.
- Rerun requis: oui après fix de la politique de flow — cibler un scénario piège récurrent + adjust plan enchaînés après un tour coaching/safety.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R1-B01` | T3 | `BF-ROUTE-01` | dispatcher / route policy | arbitrage `coaching_recommendation` vs `feature_opportunity` sur pattern récurrent | Piège récurrent 16h (cas carte de défense) traité comme feature « initiative » | trace: response_owner=`feature_opportunity`, reason_code=`feature_opportunity_signal`; ledger 0 | Router `coaching_recommendation`/`prepare_defense_card` d'abord sur « ce moment me piège à chaque fois », initiative en option secondaire | `fix_applied` — chantier Y2 (2026-07-06): règle dispatcher « pattern récurrent SUBI = carte de défense; initiative seulement si demande explicite de cadre/rituel ». **Probe live** (Nina, scope dédié): « tous les dimanches soir le même moment me piège » → owner `coaching_recommendation`, carte de défense proposée, 0 initiative | — reproduction de R2-T3 (2026-07-03) | positif (pattern récurrent→défense) + paraphrase + anti-FP (piège ponctuel ≠ récurrent) |
| `R1-B02` | T4 | `BF-ROUTE-02` | active flow / interruption policy | flow `feature_opportunity` de T3 non relâché | Rejet explicite de l'initiative + demande explicite d'un outil concret, toujours capté par le flow feature | trace: response_owner=`feature_opportunity`, reason_code=`active_feature_opportunity`; `should_exit_flows=false` (score 0) | Sortie de flow sur rejet explicite / reformulation de besoin → réévaluation d'owner (défense) | `fix_applied` — chantier Y1 (2026-07-06): doctrine d'exit FO « sortie obligatoire sur REJET de la piste » (rejet explicite ou demande d'un levier/outil concret → exit_to_global avec note; anti-FP: question sur la même opportunité ≠ rejet). Doctrine posée, **à confirmer au prochain run** (scénario rejet-sous-flow-FO non probé directement — Y2 rend le cas plus rare en amont) | — | positif (rejet→relâche flow) + intégration T3→T4 + anti-FP (continuité légitime du même sujet) |
| `R1-B03` | T11, T12 | `BF-ROUTE-02` | active flow / interruption policy | flow `coaching_recommendation` (potion, T10) non relâché | Demande d'ajustement durable de plan captée par le flow coaching au lieu de `plan_realignment` (owner attendu) | trace: response_owner=`coaching_recommendation`, reason_code=`active_coaching_recommendation`; aucune mutation (outcome sûr) | Relâcher le flow sur « modifier mon plan pour de bon » → owner `plan_realignment`; redirection UI sans mutation reste correcte | `fix_applied` — chantier Y1 (2026-07-06): doctrine d'exit coaching « sortie obligatoire sur MODIFICATION DURABLE du plan » (exit_to_global, coaching_intent=plan_misaligned, note avec les mots du user; anti-FP: adapter la manière de faire = coaching). **Probe live** (Nina): T1 défense (flow actif) → T2 « modifier mon plan pour de bon, alléger durablement » → exit → owner `plan_realignment`/`plan_realignment_signal`, redirection UI sans mutation | — régression type R1 (R2-T11 routait `plan_realignment`) | positif (adjust→`plan_realignment`) + anti-régression (flow actif + adjust) + anti-FP (pas de mutation auto) |

## Notes Green Notables (non-bugs)

- T15/T16: le RED de R2 (report vague → complétion fantôme sur `9c539292` puis déni incohérent) **ne se reproduit pas**: aucun track commité sur report ambigu, réponse de cohérence véridique et DB-consistante. Amélioration à conserver (candidat test d'invariant anti-FP track).
- T5: `message_payload.user_timezone="UTC"` incohérent alors que `scheduled_for` est correct (13:45Z = 15h45 Paris CEST). Métadonnée cosmétique, pas d'effet — à surveiller si un jour le calcul s'aligne à tort sur ce champ.

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-06 | Classer T3/T4/T11/T12 en `yellow` (pas `red`) | Outcomes sûrs: aucun effet durable faux, aucune mutation illégitime, garde-fous BF-EFFECT-01 respectés; friction owner/UX uniquement | QA agent | Guidelines §Verdicts; R2 precedent (T3 yellow) |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-06 | R1-B01/B02/B03 | Traces inline `conversation_turn_traces` + EffectLedger + DB post-run | Confirmés (owners/reason_codes observés); aucun effet durable faux | run report §2 |
| 2026-07-06 | — | Cleanup baseline (reps, entry, checkin, 8 memory_items, msgs run-scope, chat_state) | Baseline restaurée (tous compteurs `*/0`, habits 0/3 & 0/2, item `e205079e` active) | run report §1/§5 |
