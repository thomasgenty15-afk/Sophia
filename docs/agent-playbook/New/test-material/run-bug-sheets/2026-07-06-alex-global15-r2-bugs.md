# Bug Sheet — Alex global15 r2 (2026-07-06)

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-06-alex-global15-r2.md`
Verdict run: **yellow** (fluidité green, système yellow — 2 warnings non bloquants, aucun effet durable faux atteignant l'utilisateur).

Taxonomie: `docs/agent-playbook/New/test-material/familly-bugs.md`.

---

## R2-B01 — Étiquette identitaire fossilisante persistée en mémoire active

- Bug id: `R2-B01`
- Tours: T7 (+ batch memorizer nocturne de fin de run)
- Famille: `a classifier` — couche **memory / write-policy**. La taxonomie n'a pas de code « sur-mémorisation / anti-fossilisation identité » ; `BF-MEMORY-01` est l'inverse (promesse non persistée). Proposition: ouvrir un code dédié (ex. `BF-MEMORY-02` « fact durable indésirable persisté »).
- Domaine owner: `trigger-memorizer-daily` (extraction / write-decision policy).
- Source amont: pas de règle qui détecte les self-labels identitaires et les down-weight / rattache à la réfutation présente dans le même batch. L'item est écrit en `status=active`.
- Symptome visible: après batch, `memory_items` contient « L'utilisateur dit avoir toujours été insomniaque chronique » en `active`, alors que Sophia a réfuté l'étiquette en tour (T7) et que la persona exige d'éviter la fossilisation identitaire (« je suis insomniaque / déréglé »).
- Preuve systeme: `memory_extraction_runs` `14aab9a6…` → 11 items persistés (9 active + 2 candidate) ; parmi les active, la ligne identité ci-dessus. La correction T5 (« le vrai problème n'est plus les écrans ») est aussi persistée → contexte contradictoire disponible (raison du yellow, pas red).
- Correction attendue: extraction identité-aware — self-labels identitaires (« je suis X chronique », « c'est ma nature ») stockés en `candidate`/faible confiance, ou supersédés/atténués par la réfutation/correction du même batch, plutôt qu'en `active`. Ne pas patcher par filtre de phrase exacte (« insomniaque chronique »), qui ne couvre pas la famille.
- Statut: `fix_applied` — chantier Z (2026-07-06). (1) Politique d'extraction v3 (garde identité): un self-label identitaire pathologisant/figé n'est JAMAIS un item durable — symptôme contextualisé mémorisable, étiquette rejetée, et jamais persistée si Sophia l'a recadrée en tour ; (2) supersedence intra-lot: `applyCorrections` voit désormais les items tout juste persistés du même batch comme cibles (avant: résolution sur la DB seule → correction skipped, deux vérités contradictoires actives). Test contrat vert (fait 3x8 + correction même lot → cible intra-lot exposée avec l'id réel persisté). Version prompt: v3_identity_guard_intra_batch_supersede. Validation e2e au prochain run avec batch réel.
- Fix reference: chantier Z (2026-07-06)
- Tests requis:
  - positif: un self-label identitaire réfuté dans le même batch n'atterrit pas en `memory_items status=active` comme fait durable ;
  - anti-faux-positif: le fait personnel légitime T8 (horaires décalés mardi/jeudi) reste persisté en `active` ;
  - paraphrase: variantes du self-label (« c'est ma nature », « j'ai toujours été comme ça ») couvertes ;
  - intégration: rerun QA persona Alex confirmant l'absence de fossilisation identitaire durable.

---

## R2-B02 — Effet durable planifié incohérent avec une demande récurrente (gated)

- Bug id: `R2-B02`
- Tours: T13
- Famille: `BF-EFFECT-03` — Payload/type d'effet durable faux (variante : effet planifié incohérent, sauvé par le gate).
- Domaine owner: dispatcher / direct-effect planner (`route_decision.direct_effects_to_run`).
- Source amont: le mapping intention→type d'effet n'est pas cadence-aware ; il arme un `create_one_shot_reminder` (one-shot) pour une demande explicitement récurrente (« chaque soir à 22h30 »).
- Symptome visible: aucun (côté user, `feature_opportunity` renvoie honnêtement vers Initiatives, « rien n'a été créé »). Le problème est interne : `direct_effects_to_run=["create_one_shot_reminder"]` contradictoire.
- Preuve systeme: trace T13 `response_owner=feature_opportunity`, `direct_effects_to_run=["create_one_shot_reminder"]` ; DB: 0 `scheduled_checkins`, 0 `user_recurring_reminders` créés (effet gated).
- Correction attendue: planner cadence-aware — récurrent ⇒ ne pas armer `create_one_shot_reminder` ; quand `feature_opportunity` conclut « surface = Initiatives », n'armer aucun effet de création. Le gate ne doit pas être la seule barrière.
- Pourquoi pas patch local: filtrer le `create_one_shot_reminder` par règle de phrase ne corrige pas la sélection d'effet ; d'autres formulations récurrentes ré-armeront le même one-shot.
- Statut: `fix_applied` (doctrine) — chantier P (2026-07-06): exemple négatif verbatim ajouté au bloc canonique dispatcher (« mets-moi un rappel chaque soir à 22h30 » → direct_effects=[] + feature_opportunity, « une heure fixe répétée reste une récurrence »). Le filet runtime cardinality/recurring_not_supported reste en place. À confirmer au prochain run.
- Fix reference: chantier P (2026-07-06)
- Tests requis:
  - positif: une demande récurrente à heure fixe ne produit jamais `create_one_shot_reminder` dans `direct_effects_to_run` ;
  - anti-faux-positif: une vraie demande ponctuelle (« rappelle-moi demain à 9h ») arme toujours le one-shot légitime ;
  - paraphrase: variantes récurrentes (« tous les soirs », « chaque matin ») couvertes ;
  - intégration: `feature_opportunity` → Initiatives n'arme aucun effet de création durable.
