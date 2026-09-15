# Run Bug Sheet - eva-global15-multiflow-r1-20260706

## Metadata

- Date: 2026-07-06
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-06-eva-global15-multiflow-r1.md`
- Run id: `eva-global15-multiflow-r1-20260706`
- Persona / scenario: Eva — run large multi-flow 15 tours (recommandation / cartes attaque+défense, ajustement de plan, track progress succès+échec, mémoire, register émotionnel)
- Verdict run: yellow
- Validite QA: valide (chemin IA réel `test-send-message` + `force_full_ai=true`, 15/15 HTTP 200, effets durables vérifiés DB, reset effectué)
- Agent owner: QA agent (Claude)

## Synthese

- Familles dominantes: `BF-ROUTE-01` (altitude/owner d'entrée), `BF-LEDGER-01` (renvoi vers ressource non commitée).
- Bug le plus bloquant: T14 `BF-LEDGER-01` — Sophia implique une carte de défense consultable dans "Dashboard > Ressources" alors qu'aucune opération n'est persistée sur tout l'arc recommandation.
- Fix architectural prioritaire: trancher la frontière `coaching_recommendation` ↔ operation-suggestion / EffectLedger : matérialiser la carte co-construite en opération durable confirmée, ou cesser d'impliquer un artefact "à retrouver".
- Rerun requis: oui, après décision de contrat sur T14 (variante T14.2 ciblant explicitement la persistance de la carte).

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `EVA-G15MF-B01` | T1 | `BF-ROUTE-01` | dispatcher / route policy + altitude d'entrée `coaching_recommendation` | Premier message émotionnel (auto-jugement "pathétique") routé directement vers une tactique produit | Sophia saute à "carte d'attaque / technique texte magique" avec jargon interne non traduit dès T1 | trace T1: `response_owner=coaching_recommendation`, `reason_code=active_coaching_recommendation`, skill_run continue, aucun beat d'exploration | Exiger un beat de compréhension/miroir avant de nommer une carte quand le tour porte un marqueur émotionnel; masquer le vocabulaire système tant qu'il n'est pas adopté | `fix_applied` (doctrine) — chantier Y3 (2026-07-06): règle visible « le nom interne d'une technique (texte magique, ancre visuelle…) est du vocabulaire système: ne le prononce JAMAIS avant adoption; décris d'abord l'effet en langage courant », en plus de la règle d'altitude premier tour (C5b) déjà présente. Non probé directement sur un T1 émotionnel — à confirmer au prochain run |  | positif (1er tour émotionnel ⇒ pas de terme "carte/technique" avant validation) + paraphrase (variantes de venting) + anti-FP (demande explicite d'outil reste servie directement) |
| `EVA-G15MF-B02` | T14 | `BF-LEDGER-01` | skill `coaching_recommendation` + contrat operation-suggestion + final response guard (EffectLedger) | La carte co-construite (T12-T14) n'est jamais matérialisée en opération durable; renvoi vers surface produit générique | "une carte de défense liée à cette action se consulte ensuite dans Dashboard > Ressources" alors que rien n'est persisté (`operation=null`, aucun `direct_effects`, aucun commit sur T1→T14) | traces T12-T14: skill_run `coaching_recommendation` seul, effect_ledger vide; DB: aucune carte/opération créée | Soit proposer la vraie opération (draft → confirmation → commit surfacé dans Ressources), soit ne référencer aucune ressource "à retrouver" sans effet durable commité; garde ledger "mention ressource ⇒ commit présent" | `fix_applied` — chantier Y4 (2026-07-06), arbitrage produit: les seuls effets écrits depuis le chat sont one-shot reminder + track_progress, tout artefact coaching est de l'ACCOMPAGNEMENT (option « matérialiser » écartée définitivement). Politique visible ajoutée: un claim d'EXISTENCE d'artefact suit le même régime default-deny qu'un claim d'écriture — langage de création uniquement (« tu peux la créer depuis ton action »). **Probe live** (Eva, carte co-construite sur 2 tours puis « je la retrouve où ? »): réponse « Pour la préparer, ouvre l'action… c'est depuis cette action que tu complètes la carte », Ressources mentionné seulement au conditionnel pour une carte déjà existante — zéro claim d'existence |  | positif (mention ressource ⇒ commit présent) + paraphrase ("garde ça / retrouve ça le soir") + anti-FP (recommandation verbale sans promesse de ressource reste permise) |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-06 | Classer T1 en `BF-ROUTE-01` plutôt que `BF-INTAKE-06` | La source amont est le choix d'owner/altitude par le dispatcher (handoff émotionnel→produit trop précoce), pas une mauvaise cartographie de domaine (le domaine "habitude" est correct) | QA agent | report §2 T1 |
| 2026-07-06 | T14 en `BF-LEDGER-01`, à confirmer vs choix produit assumé | Sophia pointe une ressource consultable non commitée; owner doit trancher si la carte doit devenir une opération durable ou si le langage doit changer | QA agent | report §2 T14 |
| 2026-07-06 | T5-T6 (renvoi UI ajustement) laissés `green` | Conforme à la doctrine adjust-plan-v1 (cadre dédié) et à "aucun patch sans confirmation"; friction UX seulement | QA agent | report §2 T6, memory adjust-plan-v1-design |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-06 | EVA-G15MF-B01 | Lecture trace T1 (owner/altitude), transcript T1→T2 | Confirmé: owner recommandation + jargon dès T1, traduction demandée à T2 | turn_01/turn_02 |
| 2026-07-06 | EVA-G15MF-B02 | Inspection traces T12-T14 (operation/effect_ledger) + DB (aucune carte/opération) | Confirmé: aucune persistance, renvoi Ressources sans commit | turn_12..14 |
| 2026-07-06 | — (contrôle sain) | DB `user_plan_item_entries` après T8 | Commit correct (checkin/completed, item 754f1544, 2026-07-05) — pas de bug | report §2 T8 |
| 2026-07-06 | — (contrôle sain) | `memory_items` après `trigger-memorizer-daily` | 6 items fidèles dont fait "après 21h" (T10) — pas de `BF-MEMORY-01` | report §4 |
