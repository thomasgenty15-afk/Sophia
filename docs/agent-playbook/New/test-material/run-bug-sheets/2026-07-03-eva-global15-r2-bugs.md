# Bug Sheet — Global 15 — Eva — R2

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-03-eva-global15-r2.md`

## R2-B01 — Report négatif track_progress jamais persisté (occurrence non datée + `needs_clarify` avalé)

- Bug id: R2-B01
- Tours: 13, 14, 15
- Famille: BF-EFFECT-02 (effet attendu absent) + BF-LEDGER-01 (claim/acquittement sans commit)
- Owner runtime: tool skill `track_progress_plan_item` (ancrage d'occurrence + garde `contradicts_same_day_evidence`) + pipeline de réponse finale (surfaçage `needs_clarify`) + dispatcher/route policy (re-route après blocage)
- Source amont: l'occurrence `completed` du T3 est stockée avec `effective_at = heure d'insertion` (2026-07-03 02:58:12Z), **non ancrée** à la nuit rapportée ; le report `missed` « avant-hier » (T13) n'est pas non plus ancré à sa date. La garde `contradicts_same_day_evidence` compare alors deux évènements dans la même fenêtre et bloque un miss légitime d'une nuit distincte. En parallèle, le tool renvoie `status=needs_clarify` mais le pipeline de réponse finale ne surface pas la clarification : Sophia free-texte un acquittement. Aux T14/T15, l'échange est reclassé `normal_reply` et le tool skill n'est même plus tenté (`tool_skill_run=null`), donc l'écriture n'est jamais retentée malgré désambiguïsation explicite.
- Symptome visible: T13 « la coupure n'a pas tenu ce soir-là, point » ; T14 « je l'ai bien en tête dans l'échange ici : le raté d'avant-hier compte aussi » ; T15 « Avant-hier compte comme un vrai soir manqué ». Eva réclame explicitement un suivi « les deux, bons et mauvais soirs » et croit l'avoir — il n'existe pas.
- Preuve systeme: T13 `tool_skill_run.status=needs_clarify`, `reason=contradicts_same_day_evidence`, `committed_effects=[]`, `blocked_effects=[{reason_code: contradicts_same_day_evidence}]` ; T14/T15 `tool_skill_run=null`, `direct_effects=[]`. DB `user_plan_item_entries` = 1 seule ligne (`checkin/completed`, effective_at 02:58Z), aucune ligne `missed`. Preuve croisée: `memory_items` contient l'event « Échec de la coupure écran … le 01/07/2026 » — la résolution de date existe côté extraction mémoire, donc le défaut est **spécifique à track_progress**.
- Correction attendue: (1) ancrer l'occurrence track_progress sur la date résolue du report (`effective_at`/occurrence_date = nuit rapportée), pas sur l'heure d'insertion, pour que `completed@nuitN` et `missed@nuitN-1` coexistent sans fausse contradiction ; (2) contrat: un `needs_clarify` de tool skill doit être surfacé par la réponse finale (poser la question), jamais remplacé par un acquittement ; (3) re-route: la désambiguïsation fournie ensuite doit ré-alimenter le tool skill ouvert et committer ; (4) garde de réponse finale: interdire « c'est noté / ça compte » sans commit DB.
- Statut: fix_applied partiel (chantier O, rerun requis) — volets (2)(3)(4) traités : un `needs_clarify` de tool skill arrive désormais au composeur comme outcome avec sa question (`effects_outcome`, contrat total) et la politique default-deny interdit tout acquittement sans commit ; l'état pending (question + slots connus) est ré-exposé une fois au dispatcher global (doctrine 3g `pending_direct_effect_clarification`) pour que la désambiguïsation du tour suivant ré-alimente l'écriture. Volet (1) traité (chantier F1, 2026-07-03) : contrat dispatcher 3d-bis — `date_hint` OBLIGATOIRE en date ISO locale (YYYY-MM-DD) résolue depuis `direct_effect_time_context` pour tout report rétro-daté ; l'exemple doctrine qui enseignait `date_hint:"hier soir"` est corrigé. Le writer (`resolveLoggedAtIso`) et les gardes (`already_tracked_today`, `contradicts_same_day_evidence`) travaillent déjà sur `effectiveDay` → `completed@nuitN` et `missed@nuitN-1` coexistent sans fausse contradiction. Rerun requis.
- Tests requis: test d'intégration « report positif nuit N puis report négatif nuit N-1 → 2 occurrences distinctes committées (completed + missed) » ; test contractuel « tool_skill `needs_clarify` → réponse visible pose la clarification, aucun acquittement » ; test « demande de vérification d'un report bloqué sans écriture existante → réponse n'affirme pas un suivi à jour » ; rerun QA ciblé track_progress négatif multi-nuits (Eva ou qa-skill).

## R2-B02 — Feedback de style coach non routé vers update_coach_preferences

- Bug id: R2-B02
- Tours: 10
- Famille: BF-ROUTE-01 (mauvais owner) + secondaire BF-PREF-01 (préférence non appliquée runtime) / BF-EFFECT-02
- Owner runtime: dispatcher/route policy + skill `update_coach_preferences`
- Source amont: l'intention « tuning du coach » (« plus direct, moins de relances ») est routée vers `feature_opportunity` au lieu du domaine `update_coach_preferences` ; aucune préférence runtime n'est appliquée (cible naturelle: `companion_question_rhythm` / préférences coach). Eva est renvoyée régler ça « dans Preferences coach ».
- Symptome visible: « Bien reçu. Je peux te parler plus cash … Pour le réglage durable, ça se joue dans Preferences coach, avec le ton plus direct et une tendance à poser peu de questions. »
- Preuve systeme: T10 `response_owner=feature_opportunity`, `skill_status=continue`, `direct_effects=[]`, aucune invocation `update_coach_preferences`.
- Progrès vs r1 (T12): plus de fuite de clés de config internes (`coach.tone=direct` / `coach.question_tendency` ont disparu ; formulation naturelle). Le défaut de **rendu** est corrigé ; le défaut de **routage/effet** persiste (même famille BF-ROUTE-01 que r1-Eva-T12).
- Correction attendue: reconnaître le signal préférence-de-style comme domaine `update_coach_preferences` (capture + application runtime), pas feature_opportunity. Ne pas se contenter d'acquitter et renvoyer à la plateforme.
- Statut: open (récurrent depuis r1 ; pas de correction pendant le run)
- Tests requis: test contractuel dispatcher « feedback style coach (‘sois plus direct / moins de relances') → owner update_coach_preferences » ; test runtime « préférence appliquée dans la conversation en cours (moins de relances) après capture ».

## Notes non bloquantes (pas de ligne BF dédiée)

- Motifs mécaniques de fluidité: préambule « carte d'attaque, technique texte magique » répété verbatim (T1/T2) ; raccroche systématique à « ta carte de défense » (T4/T5/T6) ; refrain « je garde en tête » (T6/T7). Qualité de génération/altitude, non taxonomie routing/effets.
- Précision mémoire: item « Objectif … ajusté à 1 soir par semaine » formule comme appliqué une **demande** non confirmée (T11). Non bloquant.
