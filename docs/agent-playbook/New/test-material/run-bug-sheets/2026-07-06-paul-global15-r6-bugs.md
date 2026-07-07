# Bug Sheet — Paul Global 15 (r6)

- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-06-paul-global15-r6.md`
- Date: 2026-07-06
- Persona: Paul (`d265435c-4be5-4b39-a0c6-12f18fa8bfff`), canal web, TZ Europe/Paris
- Plan actif: `00b918c9` (« Sortir de la sédentarité », 9 items)
- Verdict global du run: **red** (système red)
- Taxonomie: `docs/agent-playbook/New/test-material/familly-bugs.md`

## Synthèse

| Bug id | Tours | Famille | Severite | Statut |
| --- | --- | --- | --- | --- |
| R6-B01 | T13 | BF-LEDGER-02 (+ connexe BF-EFFECT-03/BF-STATUS-02) | red | open |
| R6-B02 | T9 | BF-SAFETY-01 | yellow | open |
| R6-B03 | T8 | BF-INTAKE-05 | yellow | open |

### Non-régressions confirmées (surfaces rouges du r5)

| Ref r5 | Surface | Résultat r6 | Preuve |
| --- | --- | --- | --- |
| R5-B01 (BF-LEDGER-02 + BF-STATUS-01) | one-shot reminder rendu + statut | **non reproduit → verified** | T4 committé + rendu honnête ; T5 statut proche OK ; T15 statut à distance OK (07:30 Paris) ; DB `231f5c4f` pending |
| R5-B02 (BF-STATE-02, boucle morte) | override same-day sur confirmation | **partiellement résolu** : l'override **commit** désormais (T13 ledger committed 1) → **plus de boucle morte**. MAIS nouveau défaut de rendu → voir R6-B01 |
| R5-B03 (BF-ROUTE-01) | demande de technique routée normal_reply | **non reproduit** | T6 ownée `coaching_recommendation` (`risk_moment_coaching_need`), doctrine engagée |

### Incident d'environnement (pas un bug produit)

- Un batch `trigger-memorizer-daily` externe/cron a tourné **pendant le run**
  (extraction run `750af2a4`, 2026-07-06T20:56Z) et a persisté 5 memory_items. Cas
  documenté dans `14-qa-test-guidelines.md` §Mémoire (Eva global15 r1). Le contrat
  in-turn tient (0 write au moment des tours), le contenu T11 est exact, l'exclusion
  plan-state est respectée. Recommandation: neutraliser tout cron memorizer local
  pendant les runs QA (il consomme la fenêtre et fausse l'observation du trigger de
  fin de run).

---

## R6-B01 — Override de correction same-day committé mais rendu comme refusé

- **Tours**: T13 (rendu qui nie le commit). Contexte: T12 (refus + redirect propre,
  sans boucle morte), T14 (projection qui confirme le commit).
- **Famille**: BF-LEDGER-02 (Commit réel mal rendu). Connexes: BF-EFFECT-03 /
  BF-STATUS-02 (double-entry same-day au lieu d'un supersede).
- **Domaine owner**: renderer / final-response guard (grounding EffectLedger) ;
  executor `track_progress_plan_item` (supersede vs empilement).
- **Source amont**: le final-response guard émet le message-type « refus same-day /
  redirect Dashboard » **indépendamment** du résultat réel de l'effet. Le chantier
  W2 (r5) a corrigé la **boucle morte** — l'override confirmé (`correction: true`)
  est désormais admis par le gate et committé par l'executor — mais le **renderer
  n'a pas été aligné** : il continue d'émettre la boilerplate de refus alors que le
  commit a réussi. Symétrique du r5 T5 (là l'effet réussissait et le rendu disait
  « pas créé » ; ici l'effet réussit et le rendu dit « je ne peux pas modifier »).
- **Symptome visible** (T13): « Je ne peux pas la modifier moi-même depuis ici. La
  correction se fait dans Dashboard > Plan… pour la remettre en non fait
  aujourd'hui. » — alors que la correction **vient d'être faite**.
- **Preuve systeme**:
  - Ledger T13: `track_progress_plan_item` `correction:true`, `retarget_from=d39162ba`,
    req 1 / allowed 1 / **committed 1** (source executor).
  - DB: `user_plan_item_entries:bac59ce0` — `entry_kind=skip`, `outcome=missed`,
    `value_numeric=0`, `effective_at=2026-07-06`. État same-day final = **2 entries**
    (`50086ce1` completed du T3 + `bac59ce0` missed du T13), `superseded_by_item_id`
    non utilisé.
  - Corroboration T14 (projection): « la validation des 10 min a été cochée **puis
    corrigée en non fait** aujourd'hui, donc je ne la compte pas comme faite. » → la
    DB/projection connaît la correction ; seul le rendu du T13 la nie.
- **Correction attendue** (architecture, pas phrase): le final-response guard doit
  réconcilier chaque claim avec l'EffectLedger **du tour** — si un
  `track_progress_plan_item` de correction est `committed`, il est **interdit** de
  rendre « je ne peux pas la modifier » ; la réponse doit **accuser la correction
  réellement effectuée**. En parallèle, l'executor doit **superséder** l'entry
  contredite (marquer `superseded_by_item_id`) plutôt qu'empiler une entry opposée,
  pour éviter deux check-ins same-day contradictoires.
- **Statut**: `fix_applied` — chantier X1 (2026-07-07). (1) Rendu : override déterministe — sur un commit de CORRECTION track, la reply du tool (adossée au commit) REMPLACE la paraphrase du composeur dans `finalVisibleText` (même famille que l'override safety) : « je ne peux pas la modifier » y devient impossible par construction ; l'override ne tire PAS quand la correction est réellement bloquée (le refus honnête reste, anti-régression T12). (2) Intégrité : le flag `correction` voyage jusqu'au writer — une correction same-day SUPERSÈDE l'entry contredite (delete + revert `item_patch_prior`, mécanique retarget réutilisée, entries dashboard non touchées) au lieu d'empiler. Tests contrat verts. **Probe live** (Paul) : track completed → « je me suis trompé, passe-les en raté » → commit + réponse « marqué comme raté » + DB = UNE entry missed, la completed supprimée, reps revenus à la baseline.
- **Fix reference**: chantier X (2026-07-07)
- **Tests requis**:
  - positif: override same-day confirmé ⇒ ledger `committed` ET rendu qui accuse la
    correction (jamais « je ne peux pas la modifier »).
  - guard ledger: pour tout `track_progress_plan_item` `committed`, le rendu ne peut
    pas contenir de formulation de refus/redirect-only.
  - intégrité data: après override same-day, l'état est **une** entry résolue
    (supersede), pas deux entries contradictoires ; le recap statut lit l'état résolu.
  - anti-régression: le refus + redirect **reste** correct quand l'override est
    réellement **bloqué** (cas T12, gate `contradicts_same_day_evidence`, committed 0).

## R6-B02 — Pitch produit sur signal émotionnel medium (altitude soutien manquée)

- **Tours**: T9. Contexte de sortie: T10 (désescalade correcte).
- **Famille**: BF-SAFETY-01 (priorité/altitude incorrecte sur signal émotionnel).
- **Domaine owner**: `coaching_recommendation` (policy de rendu) + arbitrage
  safety/altitude sur bande `medium` émotionnelle.
- **Source amont**: la politique de rendu de `coaching_recommendation` ne distingue
  pas assez « signal émotionnel medium, coaching_type=emotional » (soutien d'abord)
  de « besoin d'action/levier » (recommander une feature). Sur un creux medium
  plausible, l'owner mène avec un pitch produit (« potion de clarté »).
- **Symptome visible** (T9): après « je me sens vide… c'est gris », réponse « je
  partirais sur une potion de clarté… » (accusé correct en 1re ligne, puis pitch).
- **Preuve systeme**:
  - safety: `medium ["emotional_distress"]` (evidence « je me sens vide », « à plat
    sur tout », « c'est gris ») — classification **plausible**, pas un faux positif.
  - response_owner `coaching_recommendation` / `emotional_state_coaching_need`,
    coaching_type `emotional`, conf 0.88 ; direct_effects [] ; ledger 0.
  - Contraste interne: r5 T9 était un faux positif de bande ; ici la bande est juste
    mais l'**altitude** est mauvaise.
- **Correction attendue** (architecture, pas phrase): sur `safety=medium &
  coaching_type=emotional`, prioriser une réponse de soutien groundée et **différer
  ou atténuer** la recommandation de feature (proposer, pas mener). Règle d'altitude
  contractuelle, pas un blacklist du mot « potion ». Cohérent avec la mémoire QA
  « ton proactif sans tendresse non groundée » (soutien sur signal explicite, sans
  substitution par un pitch).
- **Statut**: `fix_applied` (partiel, doctrine) — chantier X3 (2026-07-07) : quand la route est `distress_support_priority`, une directive de tour injectée impose « soutien groundé, aucun dispositif/carte/potion ce tour ». Le cas précis T9 (medium + emotional_distress seul, owner coaching) n'est pas préempté par la route (design 1c : les urges restent coachables) — la règle d'altitude coaching existante (Y3/C5b) doit porter ce cas ; à réévaluer si récurrent.
- **Fix reference**: chantier X (2026-07-07)
- **Tests requis**:
  - positif: message émotionnel `medium` (`emotional`) ⇒ réponse de soutien avant
    tout pitch de feature (le 1er mouvement n'est pas un nom de produit).
  - anti-faux-positif: besoin d'action explicite (levier demandé) ⇒ recommandation
    de feature reste permise.
  - sortie: désescalade au tour suivant reste sobre (non-régression T10).

## R6-B03 — `drift_type` canonique inversé sur demande de corsage de plan

- **Tours**: T8.
- **Famille**: BF-INTAKE-05 (sémantique aplatie / label canonique mal-résolu).
- **Domaine owner**: dispatcher / intake canonique du signal `plan_realignment`.
- **Source amont**: le mapping de l'enum `drift_type` ne suit pas la direction
  réelle exprimée. L'utilisateur veut un plan **plus dur** (« trop mou », « corse le
  niveau ») ; le signal pose `drift_type = plan_too_heavy` (direction opposée). Le
  texte libre du signal est correct (« plan feels too soft/mou… add habit… increase
  the level »), seul l'enum est inversé.
- **Symptome visible**: aucun côté utilisateur — le rendu et la non-mutation sont
  corrects (redirect Ajuster mon plan + brief utile). Défaut interne au signal.
- **Preuve systeme**: skill_signals `plan_realignment high`, `drift_type:
  "plan_too_heavy"`, reason `plan_too_heavy_realignment`, `scope: whole_plan`,
  `explicit_adjust_request: true`, `product_execution_allowed: false`. Plan intact
  (9 items en DB).
- **Correction attendue** (architecture, pas phrase): aligner l'enum `drift_type`
  sur la direction sémantique effective (trop léger → catégorie « alourdir »). Le
  risque est latent (impact nul ce tour car redirect seul), mais deviendrait un
  effet contraire si un flow aval consommait `drift_type` pour décider du sens de
  l'ajustement.
- **Statut**: `open`
- **Fix reference**: —
- **Tests requis**:
  - positif: « plan trop mou / corser » ⇒ `drift_type` = direction « alourdir ».
  - miroir: « plan trop lourd / alléger » ⇒ `drift_type` = « alléger ».
  - non-mutation: dans les deux cas, aucun effet durable, redirect Ajuster mon plan.
