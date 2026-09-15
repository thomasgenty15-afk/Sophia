# Run Bug Sheet - global15-rose-r2

## Metadata

- Date: 2026-07-03
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-03-rose-global15-r2.md`
- Run id: `qa-global15-2026-07-03-rose-r2`
- Persona / scenario: Rose (`02dc9ae2-4128-412b-b0be-56712bf775a8`) / global 15 tours, variante N.2 (couverture large flows/options)
- Verdict run: yellow
- Validite QA: valide (IA reelle, `force_full_ai=true`, Supabase local, messages choisis tour par tour, aucun fallback deterministe)
- Agent owner: QA agent (run conversationnel)

## Synthese

- Familles dominantes: BF-MEMORY-01, BF-STATUS-01, BF-ROUTE-01 (+ 1 friction fluidite `a classifier`).
- Bug le plus bloquant: `R2-B02` (BF-MEMORY-01) — intention memoire explicite acquittee mais `smart_pre_filter` rejette tout, `memory_items=0` apres batch : perte silencieuse d'un fait personnel demande.
- Fix architectural prioritaire: exempter/prioriser du pre-filtre memory_v2 les intentions memoire explicites de premier ordre (« retiens que », « garde en tete », fait auto-descriptif).
- Rerun requis: oui — fixes appliques le 2026-07-03 pour T13 (signal memorize dans le pre-filtre), T15 (cap 5 supprime + count exact) et T4 (progression apres acceptation) ; reste `R2-B01` (arbitrage product_help vs plan_realignment) open.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R2-B01` | T9 | `BF-ROUTE-01` | dispatcher / route policy (arbitrage product_help vs plan_realignment) | `plan_realignment_signal` sur-declenche parce que le message nomme des objets du plan (« mon plan », « habitudes », « clarifications ») alors qu'aucune mutation n'est demandee | Question conceptuelle « c'est quoi la difference entre habitudes et clarifications » routee vers owner `plan_realignment` (reponse juste mais mauvais skill) | `response_owner=plan_realignment`, `reason_code=plan_realignment_signal`, effect_ledger req0/commit0 | Distinguer intention conceptuelle/explicative (→ product_help) vs intention de mutation (→ plan_realignment) sur signal structure, pas par mot-cle « plan » | `open` |  | positif (« explique la difference entre X et Y du plan » ⇒ product_help) + paraphrase + anti-FP (« modifie X » reste plan_realignment) |
| `R2-B02` | T13 | `BF-MEMORY-01` | memory planner/extractor (pre-filtre memory_v2 + politique d'acceptation) | `smart_pre_filter` sur-filtre et ecarte meme un enonce a intention memoire explicite de premier ordre | Accuse « c'est note, je le garde en tete » sur « retiens que je flanche le dimanche apres-midi… garde-le en tete », mais rien persiste | Batch memorizer scoped Rose : `status=completed`, `message_count=15`, `persisted_count=0`, `rejected_item_count=15`, `rejection_reasons={smart_pre_filter:15}`, `memory_items=0` | Exempter/prioriser du pre-filtre les intentions memoire explicites (fait auto-descriptif demande) pour qu'au moins ce candidat atteigne la decision d'ecriture ; garder l'ecriture au memorizer nocturne (pas de write in-turn) | `fix_applied` (rerun requis) | Signal `memorize` ajoute a la couche de signaux memoire (`_shared/memory/runtime/signal_detection.ts`, miroir de `forget` qui existait deja) et consomme par le set `important` du `smart_pre_filter` (`_shared/memory/memorizer/batch_selector.ts`) : une intention memoire explicite courte atteint toujours le LLM d'extraction, qui reste le decideur final. Proces-verbal regex (charte cmd 5) consigne dans `15-chantiers-log.md`. Tests : `batch_selector_test.ts` (positif + paraphrase + anti-FP bavardage + forget intact). | positif (« retiens que <fait sur moi> » ⇒ apres batch `memory_items>=1` bon contenu) + paraphrase + anti-FP (bavardage non memoire reste filtre) |
| `R2-B03` | T15 | `BF-STATUS-01` | status projection / recap des rappels (lecture `scheduled_checkins`) | Projection borne/cap (≈5) et n'inclut pas le checkin fraichement ecrit dans la session ; rend le total sans marquer l'incompletude | Recap annonce « 5 rappels ponctuels » comme exhaustif alors que 6 sont pending ; le rappel cree en seance (T6, `e708c905`, 20h30 Paris) est omis. Heures correctement localisees (pas un bug timezone) | DB : 6 `scheduled_checkins` pending vs 5 listes ; l'omis = 18:30 UTC = 20:30 Paris = one-shot du T6 | Projection recap fidele a la DB (tous les pending du scope), sans cap silencieux ; n'affirmer l'exhaustivite que si complet, sinon signaler « et d'autres » | `fix_applied` (rerun requis) | Recidive de R1 (`2026-07-03-rose-global15-r1`, BF-STATUS-01). Cause localisee : `.limit(5)` litteral dans `loadDurableEffectsSummary` (`context/loader.ts`) + total rendu depuis le tableau tronque. Fix : chargement large (50) avec `count: "exact"`, total annonce = count DB reel, et si troncature la ligne « ... et N autres rappels non listes ici — ne presente jamais cette liste comme complete » est injectee (no silent caps). Tests : `loader_durable_effects_test.ts` (6 pending tous listes + total exact ; 60 pending → troncature explicite). | positif (rappel cree au tour N apparait au recap du tour N+1) + count = pending DB + anti-FP (rappels annules non listes) |
| `R2-B04` | T4 | `a classifier` (fluidite : repetition / non-progression) | coaching_recommendation (progression intra-flow / handoff vers l'aide offerte) | Pas de memoire de tour courte sur « scaffold deja servi + offre acceptee » → le skill re-genere le cadrage au lieu d'avancer | Sur « oui prepare-la », Sophia refait verbatim le scaffold 4-points du T3 + re-propose « je peux t'aider a formuler », sans avancer | `response_owner=coaching_recommendation`, req0/commit0 ; frontiere produit correcte (pas de remplissage depuis le chat) | Quand l'offre du tour precedent est acceptee, router vers le sous-etat « aider a formuler » au lieu de rejouer le cadrage | `fix_applied` + renforce (valide en conditions reelles 2026-07-03) | Doctrine « Progression apres acceptation » + « Distinction contenu vs destination » dans le dispatcher local (`local_flow.ts`) : demande d'avancee/contenu apres une carte recommandee ⇒ `answer_followup` avec instruction d'AVANCER sans re-nommer la technique. Regles visibles (`visible_agents/shared.ts`) : nomination de la technique scopee a la PREMIERE recommandation ; carte d'attaque → contenu concret pour le cas ; carte de defense → composants appliques au cas SANS remplissage (frontiere stricte). Probe reel : « aide-moi a la preparer » avance desormais (contenu concret) au lieu de radoter. Tests : `local_flow_test.ts`. | positif (offre acceptee ⇒ tour suivant ≠ repetition du cadrage) + anti-FP (nouvelle demande ⇒ cadrage legitime) |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-03 | T13 classe yellow (pas red) | L'accuse in-turn est conforme au contrat memorizer nocturne ; aucun effet durable errone applique — c'est une omission (pre-filtre), pas une corruption | QA | `14-qa-test-guidelines.md` §Memoire |
| 2026-07-03 | T4 laisse en `a classifier` | Repetition/non-progression conversationnelle ; routing et frontiere d'execution corrects, aucun BF-* systeme ne colle proprement | QA | rapport §Tour 4 |
| 2026-07-03 | T5/T9 owner `coaching_recommendation`/`plan_realignment` note mais T5 reste green | T5 : sortie visible = redirection plan_realignment attendue, aucun effet ; T9 : mauvais owner avec impact routing → yellow | QA | rapport §Tour 5, §Tour 9 |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-03 | R2-B02 | Trigger `trigger-memorizer-daily` scoped Rose apres run (secret local aligne) | `persisted_count=0`, `memory_items=0`, `rejection_reasons={smart_pre_filter:15}` | rapport §Tour 13 |
| 2026-07-03 | R2-B03 | Query `scheduled_checkins` pending Rose vs recap rendu | 6 pending DB vs 5 listes ; omis = one-shot T6 (`e708c905`) | rapport §Tour 15 |
| 2026-07-03 | R2-B01 | Trace du tour | `response_owner=plan_realignment` sur question produit | rapport §Tour 9 |
