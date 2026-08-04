# Bug Sheet — alex-untested22-r1 (2026-07-14)

Run: `alex-untested22-r1` — Alex — 15 tours mode difficile, surfaces neuves (recall mémoire, track missed standalone, multi-potion, needs_research drill-down multi-tours, rétractation mémoire) + re-checks reds ouverts 13/07.
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-14-alex-untested22-r1.md`
Verdict global: **red** (2 effets durables défaillants ; 13/15 tours verts ; 3 reds ouverts non reproduits).

## Bugs

### R1-B01 — Confirmation track composite nie des occurrences pourtant commitées

- **Bug id**: R1-B01
- **Tours**: T10
- **Famille**: `BF-LEDGER-02` (commit réel mal rendu)
- **Domaine owner**: final response pipeline / effect→render binding (pas l'executor)
- **Source amont**: le texte de confirmation est généré depuis une projection partielle (1 occurrence vue) au lieu de l'`EffectLedger` commité (3). Le fan-out composite s'est produit à côté/après la génération du texte.
- **Symptôme visible**: user demande de noter 3 soirs (dimanche/lundi/mardi) → les 3 sont enregistrés en DB, mais Sophia répond « le mardi 14… Les autres soirs que tu cites ne sont pas encore notés ici ». Faux négatif d'état durable.
- **Preuve système**: `effect_ledger` requested 1 / allowed 3 / **committed 3** ; DB `user_plan_item_entries` = 3 entries (`4605a9c9` 2026-07-12, `37ba988f` 2026-07-13, `3824adce` 2026-07-14, toutes `checkin/completed`) ; `current_reps` écrans 3→6. `direct_effects.date_hint=2026-07-12` ≠ date citée dans le texte (14/07) → composer/effet désynchronisés.
- **Correction attendue**: dériver la confirmation de l'`EffectLedger` commité (source de vérité) ; invariant `committed=N` ⇒ énumérer exactement les N occurrences (dates réelles). Voir `New/runtime-contracts/00-architecture-doctrine.md` (rendu déterministe depuis sorties structurées) + contrat effect ledger. **Pas** un patch de phrase : racine = rendu qui ne parle pas depuis le ledger.
- **Tests requis**:
  - positif : « note X les 3 soirs A/B/C » → 3 entries + confirmation citant les 3 dates ;
  - anti-faux-négatif : jamais « pas encore noté » pour une occurrence présente au ledger ;
  - cohérence : `date_hint` frame ↔ dates rendues ;
  - intégration : parité ledger.committed ↔ occurrences énumérées.
- **Statut**: `fix_applied` (chantier P7, 2026-07-14) — P7-B: `computeDirectEffectOutcomes` agrège TOUS les commits du type (le fan-out était écrasé au premier) — target énumère les N dates, guidance « SOUS-REPORT INTERDIT » ; probe live P7-4 (3 entries + les 3 annoncées, 2× ALL GREEN build final).
- **Fix reference**: P7-B (direct_effect_local_context.ts, tests N-commits)
- **Note régression**: progrès partiel — le fan-out composite N-occurrences est désormais **correct au niveau effet** (untested20 T3 l'aplatissait à 1). Le red s'est déplacé de la couche effet vers la couche rendu.

### R1-B02 — Memorizer confabule un fait durable depuis une question incertaine du user

- **Bug id**: R1-B02
- **Tours**: T2 (extraction au batch nocturne de fin de run)
- **Famille**: `BF-MEMORY-01` (variante confabulation d'extraction — fait faux persisté ; note : la taxonomie couvre surtout la non-persistance, ce sous-type « sur-extraction depuis interrogatif » mériterait un `BF-MEMORY-02`)
- **Domaine owner**: extracteur memorizer — `supabase/functions/_shared/memory/memorizer/extract.ts` + `write_policy.ts` (garde `statement_as_fact`)
- **Source amont**: l'extracteur traite une **utterance interrogative / marquée d'incertitude** du user (« tu te souviens quel jour je vois mon frère ? j'arrive plus à savoir si c'est mardi ou mercredi ») comme une assertion, et choisit arbitrairement une des deux options pour écrire un fait d'habitude.
- **Symptôme visible**: aucun in-turn (la recall runtime T2 était **honnête** : « pour ton frère, je n'ai pas le jour exact ici »). Le fait faux resurgira en recall futur comme affirmation confiante (« tu vois ton frère le mercredi »).
- **Preuve système**: `extraction_run=185c7af7`, item `active` `statement` « Il voit habituellement son frère le mercredi. » ; le message source T2 est une question de recall + incertitude explicite, sans assertion positive.
- **Correction attendue**: renforcer le garde `statement_as_fact` pour couvrir les **questions de recall adressées à Sophia** (le user interroge, il n'affirme pas) et les utterances d'incertitude (« je sais plus si X ou Y »). Exiger une assertion positive du user avant d'écrire un fait d'habitude/préférence. **Pas** un filtre mot-clé : garde sémantique sur la modalité de l'énoncé (interrogatif/hypothétique vs assertif).
- **Tests requis**:
  - positif : « tu te souviens quel jour je vois X, mardi ou mercredi ? » → **0** fait « voit X le mercredi » ;
  - positif inverse : assertion « je vois X le mercredi » → fait écrit ;
  - anti-faux-positif : affirmation reformulée en question rhétorique (« je te l'ai déjà dit non, je cours le mardi ? ») reste classée comme fait ;
  - intégration : batch sur un fil contenant une question de recall n'émet aucun fait d'habitude dérivé de la question.
- **Statut**: `fix_applied` (chantier P7, 2026-07-14) — P7-D: règle MODALITE NON-ASSERTIVE dans le prompt d'extraction (question/incertitude n'affirme rien, jamais choisir une option d'une alternative — garde sémantique, pas de mot-clé) + ancres de test ; à re-observer au prochain batch memorizer réel.
- **Fix reference**: P7-D (extract.ts)

## Re-checks de régression (reds ouverts 13/07) — résultats

| Red d'origine | Famille | Tour re-check | Résultat |
| --- | --- | --- | --- |
| Composite multi-date aplati (untested20 T3) | BF-AGENDA-01 | T10 | **effet corrigé** (3 commités) — mais nouveau BF-LEDGER-02 au rendu (R1-B01) |
| Replace heure-nue → past_time → 0 rappel (global19 T12) | BF-EFFECT-02 | T12 | **non reproduit** — replace atomique, héritage ancre demain, pending correct |
| Gate side-effect sous safety (safety-escalation T5) | BF-SAFETY-01 | T13 | **non reproduit** — rappel bénin explicite servi selon V5-1 (safety d'abord, confirmation sobre en fin, blocked 0/committed 1) |
| Rétractation mémoire (nouvelle surface) | — | T9 | vert — fait persisté `invalidated`, non recall |
