# Bug Sheet - coachingrec-novice-confused-rerun-20260620-r1

## R1-B01

- Bug id: R1-B01
- Tours: 1
- Famille: BF-ROUTE-03 - Product/status/tool mal priorises
- Domaine owner: global dispatcher / product_help exit arbitration
- Source amont: multi-intention "blocage concret + incomprehension vocabulaire" route d'abord product_help puis `normal_reply`, sans creer le flow coaching.
- Symptome visible: Sophia explique les cartes et donne un conseil general, mais le flow `coaching_recommendation` ne devient owner qu'au tour suivant.
- Preuve systeme:
  - T1 `response_owner=normal_reply`
  - T1 `route_reason=product_help_exit_to_global`
  - T1 `selected_skill_id=product_help`
  - User T1 contient aussi "j'ouvre mon ordi puis je fais autre chose".
- Correction attendue: pour un message qui contient a la fois un blocage actionable et une question de vocabulaire coaching, creer `coaching_recommendation` et laisser le visible expliquer les termes.
- Statut: open
- Fix reference: none
- Tests requis:
  - "je bloque + c'est quoi les cartes" -> `response_owner=coaching_recommendation`.
  - Anti-faux-positif: pure question "c'est quoi une carte" sans blocage -> product_help possible.

## R1-B02

- Bug id: R1-B02
- Tours: 4
- Famille: BF-INTAKE-03 - Contrainte explicite perdue
- Domaine owner: `coaching_recommendation` / visible agent `no_plan_coaching`
- Source amont: la contrainte "je demande pas encore quoi choisir" n'est pas priorisee sur le contexte deja connu de blocage au demarrage.
- Symptome visible: Sophia compare puis recommande encore `carte d'attaque libre / Preparer le terrain`.
- Preuve systeme:
  - T4 `response_owner=coaching_recommendation`
  - T4 `visible_task=no_plan_coaching`
  - T4 `last_visible_decision=free_attack_card / preparer_terrain`
  - User T4: "je demande pas encore quoi choisir".
- Correction attendue: `last_visible_decision.lever=coaching_only`, reponse de comparaison seulement, sans "je partirais sur".
- Statut: open
- Fix reference: none
- Tests requis:
  - no-plan actif + "je demande pas encore quoi choisir" -> `coaching_only`.
  - no-plan actif + "je veux juste comprendre la difference" -> `coaching_only`.
  - Anti-faux-positif: "ok maintenant choisis pour moi" -> carte libre possible.

## R1-B03

- Bug id: R1-B03
- Tours: 6
- Famille: BF-TEST-01 - Trace/test incoherent ou suite malsaine
- Domaine owner: runtime local / edge function QA
- Source amont: incident HTTP local ponctuel pendant `/functions/v1/test-send-message`.
- Symptome visible: `http_status=502`, reponse assistant vide, aucune trace de routage exploitable.
- Preuve systeme:
  - T6 `http_status=502`
  - T6 `assistant=""`
  - T6 `executed_tools=[]`
  - T7 retry du meme message retourne 200.
- Correction attendue: si recurrent, analyser logs runtime; ne pas masquer par fallback.
- Statut: open
- Fix reference: none
- Tests requis: verifier absence d'effet durable sur 502 et stabilite du retry.

## R1-B04

- Bug id: R1-B04
- Tours: 7
- Famille: BF-STATE-01 - Mauvaise transition de flow
- Domaine owner: `coaching_recommendation` local flow exit policy / max_turns
- Source amont: apres un tour `coaching_only`, une nouvelle difficulte actionable est traitee par sortie `coaching_recommendation_exit_to_global` au lieu de relancer le visible agent cible.
- Symptome visible: Sophia dit "encore une logique d'attaque" alors que le user decrit un decrochage pendant l'action et que la reponse elle-meme dit "tenir quand ca devient complique".
- Preuve systeme:
  - T7 `response_owner=normal_reply`
  - T7 `route_reason=coaching_recommendation_exit_to_global`
  - Etat avant sortie: `visible_task=no_plan_coaching`, `coaching_type=no_plan_action`, `last_visible_decision=coaching_only`
  - User T7: "j'arrive a ouvrir le dossier, mais ... je panique et je ferme".
- Correction attendue: nouvelle difficulte actionable pendant un coaching actif doit continuer le flow et reclassifier le levier; ici `no_plan_coaching` avec `free_defense_card` probable.
- Statut: open
- Fix reference: none
- Tests requis:
  - no-plan active + `coaching_only` puis "j'ouvre mais je ferme quand ca devient complique" -> continue active, pas exit.
  - attendu: `last_visible_decision.lever=free_defense_card` ou au minimum comparaison attaque/defense sans affirmer "encore attaque".
