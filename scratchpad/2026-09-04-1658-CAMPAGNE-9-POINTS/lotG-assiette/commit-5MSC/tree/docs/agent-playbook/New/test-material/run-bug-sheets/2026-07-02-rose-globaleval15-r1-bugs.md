# Run Bug Sheet - 2026-07-02-rose-globaleval15-r1

## Metadata

- Date: 2026-07-02
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-02-rose-globaleval15-r1.md`
- Run id: `qa-rose-2026-07-02-globaleval15-r1`
- Persona / scenario: Rose (`02dc9ae2-4128-412b-b0be-56712bf775a8`), run global exploratoire 15 tours, plan « Libération progressive du cannabis ».
- Verdict run: yellow
- Validite QA: valide (chemin IA réel, `test-send-message` + `force_full_ai=true`, 15/15 tours répondus, aucun abort/vide/timeout).
- Agent owner: agent QA (run conversationnel).

## Synthese

- Familles dominantes: `BF-STATUS-01`, `BF-STATE-03`, `BF-EFFECT-02`, deux cas `a classifier` (qualité de génération, cohérence de technique).
- Bug le plus bloquant: `R1-B03` (T5, `BF-EFFECT-02`) — le tracking de progression échoue sur une demande explicite et univoque, ce qui touche directement la promesse produit (« Sophia suit mes actions »).
- Fix architectural prioritaire: exposer `blocked_effects[].reason` dans `conversation_turn_trace` pour `track_progress_plan_item`, afin de distinguer un blocage gate légitime (dédup/idempotence) d'un échec d'intake — actuellement invisible en trace, ce qui empêche tout diagnostic QA fiable.
- Rerun requis: oui, ciblé sur `track_progress_plan_item` avec une connexion QA dédiée temporaire (pas Rose, pour éviter la pollution par les scopes concurrents observée dans ce run) et un item de plan sans écriture récente.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R1-B01` | T1 | `BF-STATUS-01` | status/recap projection | lecture de statut inférée depuis le contexte court-terme plutôt que `scheduled_checkins.status` réel | « il est déjà marqué comme fait aujourd'hui » alors que `scheduled_checkins.status=pending`, `processed_at=null` | `response.content` T1 vs `GET scheduled_checkins?id=eq.45d61e4c` (`status=pending`) | Lire l'état réel de `scheduled_checkins` (ou l'`EffectLedger` associé) avant d'affirmer un accompli ; rester au conditionnel sinon | `open` | — | positif (rappel pending ⇒ jamais affirmé fait) + paraphrase + anti-FP (rappel réellement `sent`/`done` ⇒ peut être affirmé) |
| `R1-B02` | T3 | `BF-STATE-03` | `attack_card/renderer.ts` (`apply_attempt`) | renderer `apply_attempt` incomplet vs les 8 blocs du contrat `prepare_attack_card` | pas de brouillon de carte, pas de « à préserver »/« à éviter », pas de ligne no-mutation canonique explicite | réponse T3 vs `runtime-contracts/tools/prepare-attack-card.md` (§Renderer, 8 blocs requis) | Renderer `apply_attempt` doit toujours produire les 8 blocs (cible, obstacle, technique, brouillon, préserver, éviter, destination, ligne no-mutation) | `open` | — | positif (apply_attempt ⇒ 8 blocs présents) + paraphrase + anti-FP (draft_only/no_create restent non-mutants) |
| `R1-B03` | T5 | `BF-EFFECT-02` | `tools/always_on/track_progress_plan_item/router.ts` + `direct_effect_gate.ts` | effet `track_progress_plan_item` identifié par `route_decision` mais jamais commis ; raison de blocage non exposée en trace | « je n'ai pas la preuve ici que ce sas a été coché... je ne peux pas le marquer » sur une demande explicite « marque-le comme fait » | `route_decision.direct_effects_to_run=["track_progress_plan_item"]` mais `effect_ledger.counts` tout à 0, `executed_tools=[]` ; 0 entrée `user_plan_item_entries` liée au `source_message_id` de ce tour | Exposer `blocked_effects[].reason` dans `conversation_turn_trace` ; si le blocage vient d'une garde d'idempotence légitime, le dire explicitement | `fix_applied` (rerun requis) | Cause : `operationRuntimeFromTrackProgress` (`operation_runtime_pipeline.ts`) jetait le résultat entier (`return null`) quand la lane bloquait sans texte — requested/blocked n'atteignaient jamais le ledger ni la trace. Fix : résultat trace-seule conservé (content vide ⇒ la composition normale garde la main, `routeIsPureDirectEffect` exige un content non vide), le ledger enregistre requested+blocked avec reason. Test « blocked track_progress result without reply still reaches the ledger ». Le wording utilisateur (« déjà noté récemment ») reste à améliorer au vu des raisons désormais visibles au rerun. | positif (completed explicite ⇒ commit + `logged_progress_id`) + paraphrase + anti-FP (duplicate réel ⇒ blocage explicite et compréhensible, pas une négation vague) |
| `R1-B04` | T11 | `a classifier` | final response composer (`normal_reply`) | artefact de génération : mélange de langue dans le texte de sortie | « Mini récap de **اليوم** : » (token arabe injecté dans une phrase française) | `response.content` T11, scope `qa-rose-2026-07-02-globaleval15-r1` | Test de non-régression « langue de sortie = langue du tour utilisateur », investigation du prompt/contexte de génération du chemin récap `normal_reply` | `open` | — | positif (0 token hors-langue sur N générations récap) + paraphrase (récaps variés) + anti-FP (citations légitimes en langue étrangère si le user écrit dans cette langue) |
| `R1-B05` | T12 (contredit T4) | `a classifier` | `coaching_recommendation` (sélecteur de technique) | mot-clé utilisateur (« mot de bascule ») prime sur la nature de l'action (pattern récurrent) sans expression de doute | T4 (même pattern, sans mot-clé imposé) → carte de défense recommandée avec justification explicite ; T12 (même pattern, mot-clé « mot de bascule » imposé) → Sophia change d'avis sans le dire ni proposer l'alternative plus proche | comparaison directe T4 vs T12 dans le même run, réponses `coaching_recommendation` | Faire primer la nature de l'action sur le mot-clé utilisateur ; si le user impose un mot-clé incohérent avec le pattern décrit, exprimer le doute et proposer l'option la plus proche (carte de défense ici), conformément aux guidelines | `open` | — | positif (wording incohérent ⇒ doute exprimé + alternative proposée) + paraphrase + anti-FP (wording cohérent avec la nature de l'action ⇒ pas de friction ajoutée) |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-02 | Run mené sur Rose malgré des scopes QA concurrents actifs sur le même compte (`qa-rose-broadflow-20260702-r1`, `qa-run-20260702-r1`, `qa-multiflow2-20260702-r1`) | Rose est la seule persona locale (`alex`, `nina`, `paul`, `rose`) disposant d'un plan actif réel en base au moment du run — `alex`/`nina`/`paul` n'ont aucun `user_plan_items` local (comptes Auth présents mais plan non seedé/regénéré) | agent QA | Contexte Du Test, rapport principal |
| 2026-07-02 | Chaque effet DB attribué au run uniquement via `metadata.source_message_id` exact, jamais par simple présence/timestamp approximatif | La collision de scopes concurrents sur `user_plan_item_entries` (table globale par `user_id`, pas par scope) aurait produit de faux positifs sinon | agent QA | Tour 5, Analyse Système |
| 2026-07-02 | Pas de tentative de contournement du secret interne `trigger-memorizer-daily` après un premier échec avec `SECRET_KEY` documenté | Éviter toute exploration de credentials au-delà de la valeur documentée dans les guidelines QA | agent QA | Contexte Du Test (Incident mineur) |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-02 | — | Régression `BF-SAFETY-01` (R1-B01 du run `2026-07-02-rose-multiflow-r1`, `fix_applied`) testée à nouveau sur T9/T10 avec formulations différentes | Confirmé corrigé en run réel : pas de sur-escalade `safety_crisis`/hotlines sur urge de substance `risk_band=medium` | `2026-07-02-rose-globaleval15-r1.md` T9, T10 |
