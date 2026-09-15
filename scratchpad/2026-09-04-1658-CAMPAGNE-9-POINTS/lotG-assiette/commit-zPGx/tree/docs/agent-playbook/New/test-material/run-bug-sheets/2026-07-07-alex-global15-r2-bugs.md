# Run Bug Sheet — Alex global15 r2 (2026-07-07)

Rapport associé: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-07-alex-global15-r2.md`

Run: `qa-global15-alex-2026-07-07-r2` — Persona Alex (`aac76fd6-a688-4027-951a-fa79c628fac5`).
Verdict global: **yellow** (0 red, 3 yellow). 15/15 HTTP 200, chemin IA réel local, `force_full_ai=true`.

Surfaces ciblées peu/pas testées (toutes exercées) : product_help explication-seule, coaching_recommendation→potion (`state_potion`), flag `needs_research`, feature_opportunity/initiatives (+ coach_preferences).

---

## R2-B01 — Complétion loguée mais rendue comme non enregistrée

- Bug id: `R2-B01`
- Tours: **T9**
- Famille: **BF-LEDGER-02** (Commit réel mal rendu)
- Domaine owner: final response pipeline / companion (grounding sur EffectLedger)
- Source amont: le renderer ne se conditionne pas sur le résultat du tool skill du tour. `track_progress_plan_item` retourne `logged` (committed), mais le companion rend un **démenti** (« je ne le compte pas comme "fait" tant qu'il n'y a pas de coche enregistrée ici »).
- Symptome visible: user informé à tort que sa complétion du sas n'est **pas** prise en compte.
- Preuve système: `tool_skill_run.committed_effects=[{logged_progress_id:1edef063, target_item_id:f56793eb, progress_status:completed}]` ; DB `user_plan_items.current_reps` 1→2 ; entry `1edef063` (`checkin`/`completed`/value 1/`effective_at=2026-07-08`).
- Correction attendue: rendre le message de complétion **depuis l'EffectLedger** — si `logged`, confirmation positive obligatoire ; le disclaimer « seule la coche in-app compte » ne peut apparaître que si l'effet est `blocked`/`needs_clarify`. Invariant : **jamais démentir un effet `committed`**.
- Statut: `fix_applied` — chantier V4-4 (2026-07-08). Double étage : (a) la guidance committed (DONNÉE du contrat, cmd 16) porte l'interdiction verbatim — « ne DÉMENS jamais cet effet : 'pas compté tant que pas coché dans l'app' est INTERDIT sur un committed, réservé aux blocked/needs_clarify » ; (b) la règle companion source du conflit reçoit son exception : « un track committed s'accuse POSITIVEMENT — ne le démens jamais ». Tests contrat verts. Escalade si récidive : override déterministe (famille X1).
- Fix reference: `direct_effect_local_context.ts`, `agents/companion.ts`
- Tests requis:
  - positif: report de complétion identifiable → `logged` → réponse confirme l'enregistrement (pas de démenti).
  - paraphrase: variantes « ça c'est fait / j'ai fait mon sas / note-le » → même confirmation positive.
  - anti-faux-positif: raté ambigu (`blocked`/`target_not_evidenced`) → là le disclaimer « pas compté » est légitime.
  - intégration: assert que le texte final ne contient pas de négation d'un `committed_effects` non vide.

## R2-B02 — Tour de recherche mal-owné + `needs_research` non câblé (capability gap)

- Bug id: `R2-B02`
- Tours: **T6** (owner) ; observation liée **T5** (même intention, owner différent)
- Famille: **BF-ROUTE-01** (Mauvais owner) ; sous-jacent `a classifier` (capability gap `needs_research` sans exécuteur)
- Domaine owner: dispatcher / arbitration d'owner + (manque) exécuteur de recherche
- Source amont: `needs_research` est détecté et préservé dans le TurnFrame (T5/T6, conf 0.98) mais **aucune route ne possède le tour de recherche**. Le tour retombe sur `normal_reply` (T5) puis `product_help` (T6, `reason=need_fresh_verified_study_data`) → ownership non déterministe. Le marqueur `RESEARCH_CONTEXT_MARKER` consommé par `companion.ts` **n'est produit par aucun exécuteur** de `sophia-brain` : le flag est décoratif (aucun fetch web).
- Symptome visible: réponses honnêtes (aucune hallucination), mais posture « je peux/ne peux pas chercher » flottante ; une question de savoir monde (mélatonine/études 2025) est traitée comme `product_help`.
- Preuve système: T5 `response_owner=normal_reply`, T6 `response_owner=product_help` + `skill_signals.product_help.detected=true` ; les deux avec `needs_research.value=true`. Grep repo : aucun producteur de `RECHERCHE WEB (informations fraiches)` hors du consumer `companion.ts`.
- Correction attendue: choix produit — (a) **câbler un exécuteur de recherche** derrière `needs_research` (peuple `RESEARCH_CONTEXT_MARKER`), ou (b) si pas d'accès web assumé, **owner stable** pour les tours `needs_research` (réponse normale « pas d'accès web live + consensus/limite ») et **interdire** à `product_help` de capter une question de connaissance externe. Cohérence T5↔T6 garantie par la politique d'owner.
- Statut: `fix_applied` — chantier V4-1 (2026-07-08, décision produit : REBRANCHER). Exécuteur `router/research_grounding.ts` (signal structuré → recherche Gemini grounding gatée safety → bloc « RECHERCHE WEB » injecté ; échec → directive d'honnêteté interdisant tout claim de vérification) ; events `research_grounding` ré-émis ; contre-exemple product_help au dispatcher. Probes live : voie succès (vraie recherche, event `success`) ET voie échec (« de mémoire, à vérifier ») vertes. Cf. rose-r6 B01 (fiche détaillée).
- Fix reference: `router/research_grounding.ts` (owner du tour recherche désormais déterministe : normal_reply + bloc injecté ; product_help exclu des questions de connaissance externe)
- Tests requis:
  - positif: demande de vérification web fraîche → owner déterministe unique sur 2 tours consécutifs.
  - anti-faux-positif: `product_help` ne se déclenche pas sur une question de connaissance externe non-produit.
  - contractuel: si `needs_research.value=true` et aucun exécuteur, la réponse déclare l'absence d'accès web sans fabriquer de données ; si exécuteur présent, `RESEARCH_CONTEXT_MARKER` est peuplé.

## R2-B03 — coach_preferences : portée « pour la suite » réduite à « cette conversation »

- Bug id: `R2-B03`
- Tours: **T15**
- Famille: **BF-PREF-01** (Préférence non appliquée durablement / portée réduite) + fuite de label interne
- Domaine owner: skill `feature_opportunity` (branche `coach_preferences`) / politique de préférence
- Source amont: le flow répond en **acquittement scoped-turn** (« je fais ça **sur cette conversation** ») alors que le user demande un changement **« pour la suite »** (durable). Pas de redirection vers une surface de préférence, pas d'accusé de persistance ; « sur cette conversation » est une fuite du label interne (déjà vu r1 T15).
- Symptome visible: le user peut croire que le style « plus direct / moins de questions » n'est retenu que pour la conversation courante.
- Preuve système: `skill_signals.feature_opportunity.context={feature:coach_preferences, opportunity_kind:coach_style_feedback}`, `direct_effects=[]`, `memory_mode=none`. Détection correcte, portée/rendu insuffisants.
- Correction attendue: sur feedback de style explicitement durable, **orienter/persister** (redirection surface préférences, comme initiatives, ou accusé de prise en compte persistante appliquée par le pipeline pref) au lieu de scoper à la conversation ; ne pas exposer le libellé interne.
- Statut: `fix_applied` — chantier V4-7 (2026-07-08) : doctrine FO — un feedback de style DURABLE (« pour la suite ») porte TOUJOURS les trois volets : application immédiate + honnêteté sur la portée (« le réglage durable depuis le chat arrive dans une prochaine version ») + renvoi Préférences coach ; interdit d'acquitter « sur cette conversation » sec (fuite de libellé interne). L'engagement de session reste porté par `session_style_commitment` (V3).
- Fix reference: `feature_opportunity/local_flow.ts`
- Tests requis:
  - positif: « sois plus direct pour la suite » → réponse oriente/persiste (pas de « sur cette conversation »).
  - paraphrase: « tu poses trop de questions » / « sois plus cash » → même traitement durable.
  - anti-fuite: la réponse ne contient pas le libellé interne de portée conversationnelle.

---

## Incident Environnement (non-bug produit)

- `trigger-memorizer-daily` local : **502 gateway** répété, run d'extraction laissée `running` (async ne survit pas au 502 dans l'edge-runtime local). 5 tentatives (reset + re-trigger) sans complétion. Persistance mémoire **batch** (T12 fait « jeudi 23h ») et anti-fossilisation (T3 état passager, T10 identité) **non vérifiées** ce run. Comportement **in-turn** vérifié OK (`memory_items` stable à 9 → aucun write in-turn). Memorizer Alex avait fonctionné en r1 (même jour) → capacité présente mais **flaky en local**. À suivre côté infra QA (timeout Kong / walltime edge), **pas un bug conversationnel**.

## Reset De Fin De Run (vérifié)

- `user_plan_items.f56793eb` reps 2→**1** (revert complétion T9) ; entry `1edef063` supprimée.
- `scheduled_checkins.6653f574` (one-shot T8, cancelled T14) supprimé.
- run d'extraction orpheline `76851774` supprimée ; 0 run `running` restante.
- `chat_messages` (30) et `user_chat_states` du scope `qa-global15-alex-2026-07-07-r2` supprimés.
- `memory_items` = **9** (baseline, aucun item de test créé).
