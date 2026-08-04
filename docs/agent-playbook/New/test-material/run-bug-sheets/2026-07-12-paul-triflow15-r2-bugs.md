# Run Bug Sheet - paul-triflow15-r2

## Metadata

- Date: 2026-07-12
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-12-paul-triflow15-r2.md`
- Run id: `paul-triflow15-r2`
- Persona / scenario: Paul / triflow 15 tours (coaching_recommendation + presence + normal_reply + one-shot reminder)
- Verdict run: yellow
- Validite QA: valide (IA reelle, Supabase local, `force_full_ai=true`, 15/15 HTTP 200)
- Agent owner: QA (Claude)

## Synthese

- Familles: `a classifier` (altitude coaching, T14), `BF-TEST-01` (observabilite traces, transversal).
- Aucun bug rouge. Effet durable rappel exact (T6), status lu correctement (T10), grounding plan correct (T11), BF-PREF-01 cible respecte (T13), evidence-gate track_progress OK (T1/T2).
- **Validation des fixes r1**: les trois bugs de `paul-triflow15-r1` (BF-STATUS-01, BF-ROUTE-02, renderer coaching r1-T5) **ne se reproduisent pas** — voir table « Validation regressions ».
- Fix architectural prioritaire: modeliser l'intention « conseil tactique immediat » (fenetre courte, « ce soir », « un seul truc ») vs « recommandation d'outil » dans le skill `coaching_recommendation`.
- Rerun requis: non bloquant. Un rerun cible coaching-altitude peut valider un futur etat `immediate_tactic_request`.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R2-B01` | T14 | `a classifier` (altitude/renderer coaching) | `coaching_recommendation` visible agent / altitude policy | Le skill ne distingue pas « quel outil construire » (recommandation) de « donne-moi le micro-geste pour ce soir » (conseil tactique in-turn) ; il retombe sur la recommandation d'outil par defaut | Sur « un seul truc pour ce soir pour pas rechuter dans le canapé », Sophia re-recommande de **construire une carte de defense** (deja recommandee/handoffe a T5) au lieu du geste unique demande | owner=`coaching_recommendation`, route_reason=`coaching_recommendation_signal`, `coaching_type=risk_moment_coaching_need` ; ledger 0 ; aucun effet durable | Etat de skill `immediate_tactic_request` (fenetre courte / « ce soir » / « un seul truc ») qui sort de la boucle recommandation-d'outil pour livrer un geste unique concret, la carte devenant suite optionnelle | `fix_applied` (2026-07-12, chantier P1-3) | Regle « Demande TACTIQUE IMMEDIATE » dans le dispatcher local coaching (`local_flow.ts`) : fenetre courte + « un seul truc » = livrer LE geste concret, jamais re-recommander l'outil deja handoffe. Tests (`local_flow_test.ts`). Probe live 12/07 : « un seul truc pour CE soir » apres reco carte → geste unique concret (chaussures/signal 22h), zero re-reco (2 passes GREEN) | positif (micro-conseil immediat => 1 geste concret, pas re-reco d'un outil deja handoffe) + non-regression (demande de METHODE/outil => recommandation carte conservee) |
| `R2-B02` | T13, T14, T15 (queue de run) | `BF-TEST-01` | persistance `conversation_turn_traces` (writer best-effort/async) | Les traces des 3 derniers tours ne sont pas persistees en DB au moment de la verification, alors que les reponses et les 30 `chat_messages` web (15 tours) existent et que les traces inline sont retournees pour les 15 tours | 12/15 lignes `conversation_turn_traces` persistees ; T13 `feature_opportunity`, T14, T15 absentes ; `max(ts)` = tour 12 | `count(conversation_turn_traces)=12` sur la fenetre run ; `count(chat_messages web)=30` (=15 tours) ; traces inline capturees pour T1-T15 (memes sorties `processMessage`, autoritatives) | Garantir le flush des traces de fin de session (chemin synchrone ou `waitUntil` fiabilise) ; a investiguer hors run | `fix_applied` (2026-07-12, chantier P1-4) — `logConversationTurn` retry ×3 avec backoff (250/500ms, `trace_logger.ts`), echec final loggue en `console.error` structure aux 3 call sites (plus de warn avale). Invariant vise : N tours envoyes = N lignes persistees | invariant « N tours envoyes => N lignes `conversation_turn_traces` persistees », en particulier sur les derniers tours d'une session |

## Non-bugs / Artefacts (documentes, pas de ligne bug)

| Item | Tours | Nature | Detail |
| --- | --- | --- | --- |
| Rappel auto-delivre par cron | post-T6 | Artefact environnement (horloge simulee QA vs cron) | Rappel cree pour 14h Paris (horloge client simulee ~09h) est dans le passe de l'horloge serveur reelle (~20h) ; `process-checkins` l'a delivre pendant le run (`processed_at=18:21Z`, `status=awaiting_user`, `whatsapp_pending_actions 2229502b` cree). N'invalide pas la creation (payload exact). Pattern connu, a nettoyer. |
| `track_progress_plan_item` request puis bloque | T1, T2 | Comportement attendu (garde-fou) | Router request un track (partial 0.5) sur un aveu de report ; executor bloque `target_not_evidenced`. Aucun effet durable. Note: legere sur-emission du router, rattrapee par l'admission executor. |
| BF-PREF-01 | T13 | Won't-fix acte (08/07) | Preference de ton non ecrite en DB (`user_relation_preferences`=0). Comportement cible (applique + honnete + renvoi Preferences coach) respecte — pas de ligne bug. |

## Validation regressions (fixes r1 rejoues implicitement)

| Bug r1 | Famille | Fix r1 date | Tour r2 qui le couvre | Resultat r2 |
| --- | --- | --- | --- | --- |
| `R1-B01` (status rappel nie) | `BF-STATUS-01` | 2026-07-11 (chantier R) | T10 (« mon rappel de 14h est bien enregistre ? ») | **Non reproduit**: `read_one_shot_reminder_status` projette le pending, Sophia confirme « dimanche 12 juillet à 14:00 » (jour + heure exacts) |
| `R1-B02` (presence capture intention plan/status) | `BF-ROUTE-02` | 2026-07-12 (chantier V6-2) | T10 (topic-change) + T11 (question plan) | **Non reproduit**: topic-change preempte presence (owner -> `normal_reply`) ; T11 liste les 4 items actifs exacts |
| `R1-B03` (handoff materialisation coaching mou) | `a classifier` | 2026-07-12 (chantier V6-3) | T5 (« crée-la ») | **Non reproduit**: handoff net « je ne peux pas la créer depuis le chat » + emplacement precis Plan + recap des 4 composantes, sans re-definition |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-12 | Classer T14 en `a classifier` (altitude coaching) et non `BF-ROUTE-*` | L'owner `coaching_recommendation` est legitime pour un moment de rupture ; le manque est la granularite d'intention (reco d'outil vs conseil immediat), pas le routage | QA | Regle de classification familly-bugs (source amont = altitude/renderer skill) |
| 2026-07-12 | Ouvrir `R2-B02` en `BF-TEST-01` (observabilite) plutot qu'un bug produit | Les traces inline et les `chat_messages` des 15 tours existent ; seul le persist DB des 3 derniers tours manque — gap d'audit, non user-facing | QA | familly-bugs `BF-TEST-01` (trace/audit incoherent) |
| 2026-07-12 | Ne pas ouvrir de ligne memory | Aucune intention memoire explicite ; `memory_items=0` attendu et verifie | QA | 14-qa-test-guidelines (memorizer nocturne) |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-12 | R2-B02 | `count(conversation_turn_traces)` vs `count(chat_messages web)/2` sur la fenetre run | 12 traces vs 15 tours ; traces inline capturees pour les 15 | rapport section 4 |
| 2026-07-12 | R1-B01/B02/B03 | Rejeu implicite via T5, T10, T11 + lecture DB | Fixes r1 tiennent (status lu, presence relache, handoff net) | rapport sections T5/T10/T11 |
| 2026-07-12 | — | Effet durable rappel | `scheduled_checkins a437b946` cree, heure locale 14h exacte, texte utile | rapport T6 |
| 2026-07-12 | — | Nettoyage fin de run | voir rapport annexe post-run | rapport annexe |
