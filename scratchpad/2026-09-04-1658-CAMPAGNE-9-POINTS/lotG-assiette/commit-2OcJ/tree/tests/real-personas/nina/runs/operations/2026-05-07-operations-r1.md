# Nina Operations Routing Run - 2026-05-07 - r1

## 1. Setup

- Mode : E-MVP QA operations routing probe.
- Persona : Nina.
- Date : 2026-05-07.
- Run id : `r1`.
- Scope : `qa-operations-nina-2026-05-07-r1`.
- Endpoint : local `POST /functions/v1/test-send-message`.
- Channel : `web`.
- Runtime flags : `force_full_ai=true`, `disable_debounce=true`.
- User : `e5630c78-447e-452c-b7d6-e4b475cd22fd`, `nina@gmail.com`.
- Auth setup : le premier appel a bloque en 403 car Nina n'etait pas marquee `is_test_persona`. Apres confirmation humaine explicite, ajout du marqueur Auth Admin local `app_metadata.is_test_persona=true`, puis reset des artefacts de run et relance depuis le tour 1.
- Artefacts :
  - raw : `tests/real-personas/nina/runs/operations/2026-05-07-operations-r1.raw.json`
  - summary : `tests/real-personas/nina/runs/operations/2026-05-07-operations-r1.summary.json`
  - state : `tests/real-personas/nina/runs/operations/2026-05-07-operations-r1.state.json`

## 2. Plan Nina Utilise Pour Le Run

- Transformation active : `Retrouver un poids de forme pour plus de confort au quotidien`.
- Niveau actif : `Reprendre le controle sur le grignotage`.
- Mission active : `Nettoyer ton environnement direct` (`a751731a-3832-4bea-a707-c72170fd15a0`).
- Habitude active : `Faire le choix du brut` (`eb9df535-b6e9-40d9-af57-effafdc2f662`), baseline DB apres run : `target_reps=6`, `cadence_label=6 jours / semaine`.
- Clarification pending : `Decoder ton envie de grignoter` (`7ed21c74-e2ad-4ffb-85d9-5d204d72bbcf`).
- Mission pending : `Preparer tes alternatives d'avance` (`23f34398-87ae-4388-80b4-786989faac97`).

## 3. Conversation Complete

| Tour | Nina | Sophia visible | Trace essentielle |
|---:|---|---|---|
| 1 | Ancre le plan : placards + truc brut, sans pression. | Reconnait les deux reperes, propose placards ou brut. | `normal_reply`, aucun outil. |
| 2 | Blocage ponctuel clair sur les placards. | Donne un micro-pas en 3 lignes. | `execution_breakdown`, aucun outil. |
| 3 | Demande de garder la version pour cette action. | Propose phrase courte ou checklist. | `execution_breakdown`, aucun outil. |
| 4 | Demande d'enregistrer dans Sophia sur l'action placards. | Dit ne pas pouvoir le faire directement depuis le chat. | `execution_breakdown`, aucun `prepare_attack_card`. |
| 5 | Pattern recurrent : retour travail stresse -> sucre. | Propose rituel 60 secondes. | `execution_breakdown`, aucun outil. |
| 6 | Demande de preparer avant demain soir. | Prepare un kit texte, demande A/B sur le type de piege. | `execution_breakdown`, `recommendation_tool_run` vide. |
| 7 | Cible serie apéro puis sucre, demande de mettre dans Sophia. | Dit "on va te mettre un mini script dans Sophia", puis derive vers horaire/rappel. | Aucun operation flow. |
| 8 | Corrige : pas rappel horaire, fiche liee au piege. | Recadre en fiche memo texte. | Aucun operation flow. |
| 9 | Demande durable : baisser `Faire le choix du brut` a 3 jours/semaine. | Dit "on baisse a 3 jours", demande jours fixes ou au choix. | Aucun `adjust_plan_item`. |
| 10 | Demande de modifier vraiment le plan. | Dit "on modifie l'habitude", demande A/B. | Aucun operation flow. |
| 11 | Confirme 3 jours au choix. | Dit "c'est valide", demande matin/soir. | Aucun operation flow. |
| 12 | Demande volontairement ambigue "changer un peu" les placards. | Ne clarifie pas, propose directement une version ultra light. | `recommendation_tool_run` vide. |
| 13 | Refuse "je renonce" et corrige cible vers choix du brut. | Corrige la cible en texte. | Faux `direct_effect` `track_progress_plan_item` cible manquante, non execute. |
| 14 | Demande d'appliquer fruit/amandes dans le plan. | Dit pouvoir appliquer, demande libelle mot pour mot. | Aucun operation flow. |
| 15 | Confirme option B + 3 jours/semaine au choix. | Affirme "je l'applique bien", demande encore un detail. | Aucun operation flow. |
| 16 | Demande si vraiment modifie ou juste formule. | Admet ne pas pouvoir verifier/modifier depuis ici, propose dashboard. | `product_help`, aucun outil. |
| 17 | Refuse toute modification tant que ce n'est pas clair. | Confirme qu'on ne touche pas au plan. | Aucun outil. |
| 18 | Demande recap sans creer ni modifier. | Recap mental "sans toucher au plan". | Aucun outil. |

## 4. Decisions Adaptatives Du Runner

- Apres le tour 4, `prepare_attack_card` etait attendu mais clairement rate : cible plan item claire + blocage ponctuel + demande d'enregistrement, pourtant Sophia repond "je ne peux pas le faire directement depuis le chat".
- Apres les tours 5-8, `prepare_defense_card` etait attendu ou au moins une proposition de flow avec consentement. Sophia produit une fiche texte et promet "mettre dans Sophia" sans trace d'operation.
- Apres les tours 9-15, `adjust_plan_item` etait attendu. Le runner a donne les slots demandes et une confirmation explicite, mais aucun flow n'a demarre.
- Tour 16 ajoute pour verifier la transparence visible : Sophia finit par admettre qu'elle ne peut pas verifier l'enregistrement depuis le chat.
- Tours 17-18 ajoutés pour verifier que le refus final ne cree aucun effet durable.

## 5. Matrice Operations Attendues / Observees

| Famille | Signal utilisateur | Attendu | Observe |
|---|---|---|---|
| `prepare_attack_card` | Tours 2-4 : blocage de demarrage sur `Nettoyer ton environnement direct`, demande de garder/enregistrer la checklist sur l'action. | Proposition de carte d'attaque avec consentement, rattachee a `a751731a-3832-4bea-a707-c72170fd15a0`. | Fail : aucun `operation_intents`, aucun `operation_flow_run`, aucune carte creee. |
| `prepare_defense_card` | Tours 5-8 : risque recurrent retour du travail -> stress mental -> serie apéro/sucre, demande de fiche a retrouver quand le piege revient. | Proposition de carte de defense avec consentement si surface disponible. | Fail : aucun `prepare_defense_card`. Sophia promet un "mini script dans Sophia" sans effet durable. |
| `adjust_plan_item` | Tours 9-15 : demande explicite de baisser durablement `Faire le choix du brut` de 6 a 3 jours/semaine. | Reformulation du changement exact + confirmation + patch uniquement sur `eb9df535-b6e9-40d9-af57-effafdc2f662`. | Fail : aucun `adjust_plan_item`; Sophia annonce plusieurs fois "on modifie / je l'applique" sans write. |
| Clarification | Tour 12 : "on peut changer un peu ?" avec contexte mélange. | Clarifier cible et nature changement avant operation. | Fail partiel : Sophia ne clarifie pas et propose une nouvelle regle. Pas d'effet durable. |
| Refus / correction | Tours 13, 17, 18. | Annuler/corriger sans write. | Pass DB : aucun write. Texte corrige la cible au tour 13, refuse write aux tours 17-18. |

## 6. Assertions

| Assertion | Verdict | Preuve |
|---|---|---|
| all_turns_http_200_or_expected_status | pass | 18/18 tours status 200 apres relance autorisee. |
| no_empty_response | pass | Aucun `empty_response=true`. |
| no_unexpected_abort | pass | Aucun `aborted=true`. |
| force_full_ai_respected | pass | Tous les messages DB du scope ont `metadata.force_full_ai=true`; aucun fallback deterministe utilise comme verdict. |
| no_deterministic_fallback_used | pass | Appels via `test-send-message`; pas de fallback direct `processMessage` hors endpoint. |
| plan_grounding_correct | pass | Sophia nomme les placards et `faire le choix du brut`; pas d'invention de plan majeur. |
| no_operation_without_clear_target | pass | Aucun outil execute. |
| no_operation_execution_without_confirmation | pass | Aucun outil execute. |
| no_plan_adjustment_for_simple_execution_block | pass | Aucun patch DB sur le blocage placards. |
| attack_card_used_for_point_blocker_or_fail_documented | fail | Tours 2-4, aucun `prepare_attack_card`. |
| defense_card_used_for_recurrent_risk_or_fail_documented | fail | Tours 5-8, aucun `prepare_defense_card`. |
| adjust_plan_only_for_explicit_structural_change | fail | Le flow legitime n'est jamais lance; le texte affirme pourtant modifier. |
| durable_effect_matches_operation_and_target | n/a | Aucun effet durable cree. |
| refusal_cancels_pending_operation | n/a | Aucun pending operation observe. |
| correction_updates_target_before_execution | pass | Tour 13 corrige verbalement vers `Faire le choix du brut`; aucun write incorrect. |
| visible_response_names_target_and_effect | fail | Cible souvent nommee, mais effet visible mensonger ou ambigu : "on modifie", "je l'applique bien" sans operation. |
| no_fake_tool_or_fake_operation_name | fail | Pas de faux nom technique, mais fausse promesse produit : "on va te mettre un mini script dans Sophia", "je l'applique bien". |
| no_internal_metadata_visible | pass | Aucun metadata interne visible dans les réponses. |

## 7. Effets Durables Observes En DB

- `user_attack_cards` : 0 carte pour Nina apres run.
- `user_defense_cards` : 0 carte pour Nina apres run.
- `user_plan_items` :
  - `Nettoyer ton environnement direct` reste `cards_status=not_started`, `attack_card_id=null`, `defense_card_id=null`.
  - `Faire le choix du brut` reste `target_reps=6`, `cadence_label=6 jours / semaine`, `payload` inchangé, `attack_card_id=null`, `defense_card_id=null`.
- `chat_messages` : messages du scope bien persistés avec `test_endpoint=test-send-message` et `force_full_ai=true`.

## 8. Rapport Fluidite Humaine

- Le ton est globalement humain, doux et non culpabilisant sur le poids.
- Les micro-pas sont concrets et utiles, mais Sophia prend trop vite des decisions de coaching non demandées : "10 minutes", "3 jours", "une fois sur deux".
- Gros probleme de confiance produit : Sophia dit "on baisse", "on modifie", "je l'applique bien" alors qu'aucun effet n'existe.
- La distinction entre aide conversationnelle, fiche enregistrée et modification du plan n'est pas claire pour l'utilisatrice.

## 9. Rapport Systeme

- Le routeur reste colle a `execution_breakdown` des tours 2 a 15, meme quand les signaux deviennent operationnels (`enregistrer`, `mettre dans Sophia`, `modifier vraiment mon plan`, confirmation explicite).
- `recommendation_tool_run` apparait aux tours 6, 12 et 16 mais sans decision, operation type, surface, ni reason code dans la synthese.
- Aucun `operation_intents` n'est produit sur l'ensemble du run.
- Tour 13 produit un faux `direct_effect` `track_progress_plan_item` avec `target_status=missing` alors que Nina corrige une cible, sans declarer une completion. Le gate bloque l'execution, mais le signal est mauvais.

## 10. Bugs / Corrections Proposees

1. High - Operations non routees depuis `execution_breakdown`.
   - Repro : tours 2-4, 5-8, 9-15.
   - Correction : permettre au skill actif de handoff vers recommendation/operation flow quand une demande produit/actionnable claire arrive.

2. High - Promesse visible d'effet durable sans operation.
   - Repro : tours 7, 9, 10, 11, 15.
   - Correction : interdire les formulations "je l'applique / on modifie / on va te mettre dans Sophia" si aucun pending operation ou executor n'a ete cree.

3. High - `adjust_plan_item` jamais lance sur demande structurelle explicite.
   - Repro : `Faire le choix du brut` 6 -> 3 jours/semaine, tours 9-15.
   - Correction : routing prioritaire vers `adjust_plan_item_operation_flow` quand le user demande changement durable de cadence/frequence/difficulte.

4. Medium - `prepare_defense_card` non propose sur risque recurrent clair.
   - Repro : retour du travail + stress mental + serie apéro/sucre, tours 5-8.
   - Correction : surface defense card doit etre reconnue pour pattern recurrent avec declencheur identifiable.

5. Medium - Clarification insuffisante sur demande ambigue.
   - Repro : tour 12 "on peut changer un peu ?".
   - Correction : clarifier cible + nature "aide ponctuelle ou changement du plan" avant proposition.

6. Low/Medium - Faux direct effect `track_progress_plan_item`.
   - Repro : tour 13, correction de cible detectee comme completion explicite avec cible manquante.
   - Correction : exclure les corrections/refus contenant "pas X, je parlais de Y" du progress tracking.

## 11. Verdict

Red.

Le run est techniquement stable (HTTP 200, pas d'abort, pas de write non confirme), mais il echoue le coeur du probe : aucune des trois operations attendues n'est observee, et le texte laisse croire a des modifications/enregistrements qui n'existent pas.

## 12. Prochain Run A Lancer Et Pourquoi

Apres correction du handoff `execution_breakdown` -> operation flow, relancer un run court Nina en trois blocs :

1. Blocage placards clair -> attendre `prepare_attack_card`.
2. Risque recurrent retour travail -> attendre `prepare_defense_card`.
3. Cadence `Faire le choix du brut` 6 -> 3 jours/semaine -> attendre `adjust_plan_item`.

Limiter a 10-12 tours et stopper des qu'une operation annonce un effet sans trace `operation_flow_run`.
