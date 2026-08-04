# Bug Sheet — paul-global15-r9 (2026-07-08)

Run: `qa-paul-global15-20260708-r9` — Persona Paul — Verdict global: **yellow**
(13 green, 2 yellow, 0 red). Rapport: `qa-run-reports/2026-07-08-paul-global15-r9.md`.

Contexte: run difficile validant **en intégré** les surfaces corrigées par le chantier
V4 (08/07). Les 6 surfaces V4 sont validées (voir « Validations » ci-dessous). Les 2
yellow remontent à une **seule source amont** : `router/session_decisions.ts`.

---

## R9-B01 — Recall de décision de session hedgé/injustifié sous product_help

- Bug id: `R9-B01`
- Tours: T13
- Famille: **BF-STATUS-02** (recall de décision de session rendu incertain ; co-cause **BF-ROUTE-03** : recall capté par `product_help`)
- Domaine owner: `supabase/functions/sophia-brain/router/session_decisions.ts` (+ arbitrage dispatcher recall vs product_help)
- Source amont: le bloc « DECISIONS DE SESSION » avec sa règle de recall confiant
  (« recall depuis la liste, jamais la mémoire libre », V4-3) n'est **pas injecté /
  pas utilisé** quand le tour de recall est routé vers `product_help`. La réponse
  recall alors depuis la mémoire libre de l'historique et hedge (« je ne peux pas
  retrouver la potion exacte sans risque de me tromper ») alors que la décision est
  bien enregistrée. La probe V4-3 (Nina) était routée vers `coaching_recommendation`,
  où le recall confiant fonctionne — l'angle `product_help` n'était pas couvert.
- Symptome visible: Sophia donne la bonne potion (apaisement) et sépare correctement
  les distracteurs (mot « pause », habitude marche), mais préface d'un hedge
  auto-contradictoire qui sème un doute inutile et sous-vend la capacité de recall.
- Preuve systeme: `__session_decisions = [{lever:state_potion, potion_type:apaisement}]`
  (vérifié DB, scope run) ; `response_owner=product_help`, `reason=product_help_question`.
- Correction attendue: injecter le bloc DECISIONS DE SESSION + la règle de recall
  confiant **quel que soit l'owner** d'un tour de recall/recap (product_help,
  normal_reply, coaching). Alternative co-cause : router les questions « c'était quoi
  la potion/carte » vers le chemin session-decision-aware plutôt que product_help.
- Tests requis:
  - positif: recall d'un dispositif retenu ⇒ réponse certaine depuis la liste,
    aucun « sans risque de me tromper », quel que soit l'owner.
  - paraphrase: « redis-moi laquelle tu m'avais conseillée » routé vers product_help
    (framing produit/confusion) ⇒ recall confiant.
  - anti-faux-positif: aucun dispositif retenu ⇒ Sophia ne fabrique pas de recall.
- Statut: `fix_applied` (2026-07-08, chantier V5-4)
- Fix reference: (a) source — contre-exemple dispatcher (alex-r3 B01, même racine): un recall sur ce qui a été décidé DANS la conversation n'est JAMAIS product_help (`dispatcher.prompts.ts`) ; (b) ceinture — le bloc DECISIONS DE SESSION est maintenant injecté dans le runtime_context de TOUS les skills (`router/run.ts`) et lisible par le visible product_help (règle anti-amnésie: « ne dis JAMAIS que tu ne peux pas retrouver la décision », `skills/product_help/{skill,visible_agent}.ts`) — un routage raté ne produit plus de hedge. Tests: `dispatcher_prompt_contract_test.ts`, `session_decisions_test.ts`.

---

## R9-B02 — Capture __session_decisions mono-levier ⇒ recap omet initiative + mot de bascule

- Bug id: `R9-B02`
- Tours: T14 (capture manquée en amont à T5 mot de bascule et T9 initiative)
- Famille: **BF-STATUS-02** (recap de session incomplet : effets/recommandations de session omis)
- Domaine owner: `supabase/functions/sophia-brain/router/session_decisions.ts` (couverture de capture) + composeur recap V4-4
- Source amont: la capture `__session_decisions` n'enregistre **que** le levier coaching
  potion (une entrée, `technique=null`) ; elle ne capte ni la reco
  `feature_opportunity/initiatives` (T9, initiative matinale à créer) ni le raffinement
  mot de bascule (T5, « pause »). Le recap V4-4 lit `__session_decisions` (+ EFFETS
  RECENTS), donc l'omission de capture se propage au recap. Contrat V4-4 violé :
  « un effet de session ne s'omet jamais » ; « les recommandations ouvertes se listent
  en reste à faire ».
- Symptome visible: le recap de session (T14) liste correctement la marche cochée et la
  potion retenue, et le « reste à faire » du plan est complet (pending inclus), mais
  **omet le mot de bascule et surtout l'initiative matinale à créer** — la chose
  principale que Paul voulait mettre en place.
- Preuve systeme: `__session_decisions` = 1 entrée (potion) ; T5 (mot de bascule) et T9
  (initiative feature_opportunity) n'ont créé aucune entrée de décision. T15 confirme
  que le contexte reste récupérable (donc lacune côté capture/recap, pas mémoire de
  conversation).
- Correction attendue: étendre la capture des décisions de session à **toutes** les
  catégories — feature_opportunity (initiative-à-créer), technique d'attaque (mot de
  bascule), pas seulement le levier potion — avec leur lifecycle ; recap qui n'omet
  aucune recommandation ouverte.
- Tests requis:
  - positif: session avec potion retenue + mot de bascule donné + initiative à créer
    ⇒ recap liste les trois avec lifecycle (« retenue » / « donné » / « à créer »).
  - paraphrase: « récap de ce qu'on a mis en place » ⇒ aucune recommandation ouverte omise.
  - integration: capture d'une entrée `__session_decisions` par catégorie de décision
    (coaching lever, technique, feature_opportunity) sur un run multi-décisions.
- Statut: `fix_applied` (2026-07-08, chantier V5-4)
- Fix reference: capture multi-sources — en plus du coaching, `withSessionDecision` capture désormais les hand-offs `feature_opportunity` (initiative à créer, depuis `feature` + `user_problem_summary` du contrat) et `plan_realignment` (ajustement discuté) dans `router/run.ts` + `router/session_decisions.ts` ; le bloc les liste comme « reste à faire de ton côté » (règle « jamais omises »). Tests: `session_decisions_test.ts` (« hand-offs captures comme decisions »).

---

## Validations (non-régression V4 confirmée ce run — informative)

| Surface V4 | Tour | Ex-statut | Résultat r9 | Preuve |
| --- | --- | --- | --- | --- |
| V4-1 needs_research rebranché + grounding | T1, T2 | RED r8-T7 (orphelin) | **green** | logs `research_grounding` req_id=turn_id, 6/3 sources, réponses fondées + honnêtes sous pression |
| V4-2 track target-reaching + déblocage principe | T7 | RED r8-T12 (échec avalé) | **green** | DB : `fad299cb` 2/2 `in_maintenance`, `hara_hachi_bu` débloqué sous `authenticated` |
| V4-3 catalogue potions canonique | T4 | — | **green** | 6 potions = union `CoachingPotionType` exacte |
| V4-4 démenti de commit | T8 | (alex-r2 B01) | **green** | commit confirmé, pas de démenti |
| V4-5 composite post-acceptation | T5 | yellow r8-T4 | **green** | acceptation consommée, nouvelle demande adressée |
| V4-5 technique_coherence forçage | T6 | (r7-T3) | **green** | doute + différence + option proche, aucune carte |
| V4-7 doctrine FO / pas de one-shot interdit | T9 | yellow r8-T5 | **green** | ledger 0/0/0, aucun `create_one_shot_reminder` émis |
| safety préemption + blocage side-effect | T11 | — | **green** | 4 paths bloqués `distress_support_priority`, plan non supprimé |

## Hygiène environnement (à suivre, hors run)

- Résidu item `d39162ba` : **2/3 `in_maintenance`** (incohérent) — laissé par le cleanup
  de la probe V4-2 (revert des reps sans revert du `habit_state`). Non touché ce run.
  Owner: procédure de cleanup des probes. Statut: `fix_applied` (2026-07-08, chantier V5-7 — résidu `d39162ba` reverté en DB: statut/état d'habitude réalignés sur les reps réels, vérifié par requête).
