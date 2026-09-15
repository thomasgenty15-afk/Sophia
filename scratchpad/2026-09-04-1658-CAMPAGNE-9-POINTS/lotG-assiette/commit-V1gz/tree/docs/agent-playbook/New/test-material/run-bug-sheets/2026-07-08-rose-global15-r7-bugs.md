# Bug Sheet — Rose global15 r7 (2026-07-08)

Run: `qa-rose-global15-20260708-r7` · Persona: Rose (`02dc9ae2-4128-412b-b0be-56712bf775a8`)
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-08-rose-global15-r7.md`
Verdict global: **red** (1 red, 3 tours yellow sur 2 familles).

Contexte : run difficile ciblant les surfaces fraîchement livrées par le **chantier V4 (2026-07-08)**, validées seulement par probes dev. Résultat clé : `needs_research` consommé **confirmé live** (R6-B01 résolu), mais 3 régressions/incomplétudes de V4 surfacées en run réel.

---

## R7-B01 — Démenti de commit sur la lane `track_progress` (le fix V4-4 ne couvre pas `logged`)

- **Bug id**: R7-B01
- **Tours**: T10 (contraste avec T9)
- **Famille**: `BF-LEDGER-02` (commit réel mal rendu / confirmation ratée)
- **Domaine owner**: final response pipeline / companion guidance committed (cmd 16) + mapping `EffectLedger.committed` ↔ statut tool_skill_run
- **Source amont**: la guidance « interdiction verbatim du disclaimer in-app sur un commit » (V4-4) est déclenchée sur `tool_skill_run.status="success"` (lane rappel, T9 OK) mais **pas** sur `status="logged"` (lane track, T10). La règle companion « sans effet commis prouvé, dis que ce n'est pas enregistré » l'emporte à nouveau sur un COMMITTED.
- **Symptome visible**: track du sas réellement enregistré, mais Sophia répond « je ne peux pas te dire que c'est coché… je peux t'aider à le formuler pour le suivi » (T10). Le recap T15 lit pourtant le sas comme coché → bug de rendu, pas d'effet.
- **Preuve systeme**: `EffectLedger` requested 1/allowed 1/**committed 1** ; `tool_skill_run.status=logged` ; DB : entry `cdc62242` (completed, value 1, effective 2026-07-08) + `user_plan_items.current_reps` 0→1. T9 (rappel, `status=success`) confirme correctement → asymétrie prouvée.
- **Correction attendue**: brancher l'interdiction de démenti sur `EffectLedger.counts.committed >= 1` (source de vérité), **indépendamment** du libellé texte du handler (`success`/`logged`). Étendre à toutes les lanes (rappel, track, cancel, potion…).
- **Tests requis**: (positif) track committé → réponse confirme, jamais « je ne peux pas dire que c'est coché » ; (symétrie) même invariant que rappel T9 ; (anti-régression) toute lane à statut ≠ `success` mais `committed>=1` → confirmation ; (paraphrase) « c'est bien enregistré ? » après track → oui.
- **Statut**: `fix_applied` (2026-07-08, chantier V5-3)
- **Fix reference**: garde anti-démenti élargie à toutes les lanes — guidance committed armée sur le LEDGER (variantes « je ne peux pas te dire/confirmer que c'est coché » et « t'aider à le formuler pour le suivi » interdites en toutes lettres, indépendamment du libellé de statut du handler) dans `router/direct_effect_local_context.ts` ; règle companion 682 réordonnée (accusé positif AVANT le default-deny, toute lane) ; ligne track du bloc canonique renforcée dans `router/one_shot_reminder_prompt_contract.ts`. Tests: `direct_effect_local_context_test.ts` (« forbids every denial variant »), `companion_prompt_contract_test.ts`, `one_shot_reminder_prompt_contract_test.ts`.

## R7-B02 — Cohérence `potion_type` non tenue en run réel (le fix V4-5 diverge de la probe dev)

- **Bug id**: R7-B02
- **Tours**: T3, T4 (racine des T12/T15)
- **Famille**: `BF-INTAKE-06` (mauvais domaine sémantique / doctrine de cohérence)
- **Domaine owner**: skill `coaching_recommendation` (doctrine `technique_coherence` sur `potion_type` dans `CoachingVisibleDecision`) ; secondairement dispatcher (choix de levier vs reformulation de reco)
- **Source amont**: le garde `technique_coherence` censé devenu levier-agnostique (V4-5) ne s'applique pas au `potion_type` en conversation réelle : forçage courage sur un état d'apaisement → capitulation immédiate (T3), puis sous challenge, **rationalisation d'un cadre « évitement » non exprimé** (T4), sans doute, sans exposer la différence, sans justifier le revirement.
- **Symptome visible**: T2 « apaisement » → T3/T4 « courage » avec fabrication d'un motif d'évitement que Rose n'a jamais décrit ; reproduction quasi-exacte du RED r6 T12.
- **Preuve systeme**: `response_owner=coaching_recommendation` (`active_coaching_recommendation`) aux T2/T3/T4 ; aucun signal de doute/mismatch dans la trace ; 0 effet durable (la faute est doctrinale, pas d'effet).
- **Correction attendue**: réactiver le contrat de cohérence `potion_type` **en run réel** : état décrit ↔ potion_type ; mismatch → doute + différence + options proches ; changement de position → justification explicite ; réaffirmation cohérente user (T5 apaisement) → accept sans requalification. Ne pas se fier à la probe live comme preuve — ajouter test contract sur `CoachingVisibleDecision`.
- **Tests requis**: (négatif/forçage) courage forcé sur surcharge/apaisement → doute + différence, pas de bascule sèche ; (positif) réaffirmation cohérente → accept ; (anti-faux-positif) wording cohérent → pas de requalification ; (intégration) le potion_type retenu n'inscrit pas l'option rejetée dans `__session_decisions` (lien R7-B03).
- **Statut**: `fix_applied` (2026-07-08, chantier V5-5)
- **Fix reference**: contrat de cohérence étendu au stade FORMATION/COLLECTE (`skills/coaching_recommendation/local_flow.ts`) : doute + différence + options avant toute bascule, interdiction de fabriquer rétroactivement un cadre non exprimé (« évitement »), réaffirmation cohérente acceptée sans requalification. Test contrat ajouté (`local_flow_test.ts`, hook `coachingDispatcherPromptForTest`) — la probe live ne sert plus de preuve seule.

## R7-B03 — Décisions de session : option rejetée listée comme retenue + effet créé-puis-annulé omis du recap

- **Bug id**: R7-B03
- **Tours**: T12 (recall), T15 (recap)
- **Famille**: `BF-STATUS-02` (projection historique de session incomplète/inexacte)
- **Domaine owner**: couche `__session_decisions` (V4-3) + recap/status projection (fenêtre EFFETS RÉCENTS 15 tours, V4-4)
- **Source amont**: (a) l'accumulateur de décisions capte courage comme « retenue » (via la capitulation R7-B02) et **n'invalide pas** cette entrée après le rejet user explicite au T5 → recall/recap listent « courage et apaisement retenues » ; (b) la fenêtre d'effets ne projette pas le lifecycle **créé-puis-annulé** d'un one-shot (rappel T8→T14) → omis du recap.
- **Symptome visible**: T12 « on a retenu deux potions : courage et apaisement » ; T15 « recommandations retenues : potion courage et apaisement » + aucune mention du rappel demain 19h créé puis annulé — précisément la « surprise » que l'utilisatrice a demandé à éviter.
- **Preuve systeme**: DB — courage non retenu (rejeté T5) ; checkin `651576c5` créé (T8, pending) puis `cancelled` (T14). **Contre-preuve mémoire** : memory_item « il veut revenir à apaisement, **pas** courage » → le memorizer encode correctement le rejet, le in-turn non.
- **Correction attendue**: (1) consommer la correction/rejet user dans `__session_decisions` (statut `dropped`) → recall/recap ne listent que la décision tranchée ; (2) recap = lifecycle des effets de session (créé / déclenché / annulé), un one-shot annulé le même soir inclus. Dépend en partie de R7-B02 (ne pas inscrire courage).
- **Tests requis**: (décisions) forçage puis rejet → recall = seule option tranchée ; (recap) effet créé puis annulé dans la fenêtre → recap mentionne les deux états ; (anti-régression) recap ne réintroduit pas une décision `dropped`.
- **Statut**: `fix_applied` (2026-07-08, chantier V5-4)
- **Fix reference**: (a) `SessionDecision.status retained|dropped` — une nouvelle décision sur le même levier SUPERSEDE l'ancienne (marquée écartée, section « Options ECARTEES » du bloc, jamais re-listée comme retenue) dans `router/session_decisions.ts` ; (b) récap lifecycle : le bloc EFFETS RÉCENTS du chemin companion web était silencieusement VIDE (seul call site sans `ledgerReadClient` service-role — RLS sur `turn_summary_logs`) → corrigé dans `context/loader.ts` + ligne de comptage exigible (« cette liste contient N effet(s) »). Tests: `session_decisions_test.ts` (supersedence), `loader_durable_effects_test.ts`.

---

## Points verts notables (suivi de non-régression)

- **`needs_research` consommé (V4-1)** : **VÉRIFIÉ LIVE** (T6) — lane `research_grounding` réellement exécutée (gemini-3-flash-preview, 8 snippets/4 sources, has_text), réponse groundée sans faux claim ; différentiel négatif propre (T7, `needs_research=false`). **R6-B01 (câblage mort) → résolu, vérifié en run QA.**
- **Démenti de commit rappel (V4-4)** : refusé correctement (T9) — la lane `success` est couverte (contraste avec R7-B01).
- **`coach_preferences` durable (V4-7)** : doctrine trois volets respectée (T11), neuf pour Rose.
- **`plan_realignment` direction `too_light`** : correcte, aucun patch sans confirmation (T13), neuf pour Rose.
- **Memorizer (V4-6)** : 8 items fidèles, préférence durable légitime (pas de fossilisation), encode correctement le rejet de courage ; genre `il` cohérent avec `profiles.gender=male`.
- **Pacing 1er tour (V4-5)** : restraint respecté (T1), aucun dispositif nommé sur signal diffus.
