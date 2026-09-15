# Bug Sheet — alex-global19-r1 (2026-07-13)

Run: `alex-global19-r1` · Persona: Alex · Rapport: `qa-run-reports/2026-07-13-alex-global19-r1.md`
Verdict global: **red** (2 reds T10/T12, même racine ; 2 yellows T5/T9).

Cadre: 15 tours IA réel local, `force_full_ai=true`. Surfaces neuves Alex validées vertes (potion, needs_research, adéquation technique). Reds = effets composites bi-parties aplatis.

---

## R1-B01 — Retarget de progression collapsé en une seule moitié (crédit cible absent)

- **Tours**: T10 (préparé T8/T9)
- **Famille**: `BF-EFFECT-02` (effet attendu absent) ; contributeur `BF-AGENDA-01` (correction bi-partie exécutée à moitié)
- **Domaine owner**: dispatcher (émission `direct_effects` d'une correction) + admission `track_progress_plan_item`
- **Source amont**: la correction « corrige : c'est Y pas X, mets Y à la place » est modélisée comme mutation unilatérale de X (`missed`) au lieu d'un transfert X→Y. `correction=true` mais `retarget_from_item_id=null` ; la cible de destination (écrans, émise au T9) est droppée à l'exécution.
- **Symptome visible**: « C'est noté : Carnet ... marqué comme raté. » Le carnet est dé-crédité (reps 3→2, entrée `82f9c731` supprimée, `befcd1f9 missed` ajoutée) mais les écrans ne sont **jamais crédités** (reps=3 inchangé, 0 entrée). Le rendu omet la moitié écrans.
- **Preuve système**: `tool_skill_run.requested_effects=[{target=cb91224c(carnet), progress_status=missed, retarget_from_item_id=null, correction=true}]` ; DB post-T10 : `carnet reps=2`, `ecrans reps=3`, aucune entrée écrans.
- **Correction attendue**: retarget contractualisé comme **transaction bi-partie tout-ou-rien** — `response_intent=track_progress_correction` + cible destination identifiée ⇒ payload porte `retarget_from_item_id=<X>` ET crédite `Y` ; garde d'admission refuse une correction qui invalide X sans re-créditer la cible nommée.
- **Statut**: `fix_applied`
- **Fix reference**: P4-A 13/07 — ré-arm bi-partie dans run.ts : quand la clarification `correction_retarget_missing` est pendante et que la réponse nomme la SOURCE (le dispatcher la modélise en mutation unilatérale), la transaction se reconstruit (cible = known_slots, retarget_from = l'item nommé) ; + résolution du retarget_from depuis le marqueur « pas X » du message (le T9 ne re-demande plus) — le T10 en amont ne se produit plus dans cette forme
- **Tests requis**: (positif) « corrige : c'est Y pas X » → 1 entrée X invalidée + 1 entrée Y créditée, même tour ; (paraphrase) « en fait c'était pas X hier, c'était Y » ; (anti-faux-positif) correction sans cible destination nommée → `needs_clarify`, pas de mutation partielle.

---

## R1-B02 — Replace de rappel non atomique (turn_frame aplatit cancel+create en un seul effect)

- **Tours**: T12 (préparé T11)
- **Famille**: `BF-EFFECT-02` (effet attendu absent — create) ; contributeurs `BF-AGENDA-01` / `BF-INTAKE-05` (replace bi-partie aplati)
- **Domaine owner**: dispatcher / TurnFrame (émission des effects composites) + lane `create_one_shot_reminder` (séquencement cancel/create)
- **Source amont**: un tour « annule X et remets Y » produit **un seul** `direct_effect` `create_one_shot_reminder` dont `payload_hint.intent="cancel"` et `when_hint="demain soir vers 21h30"` (l'**ancien** horaire). La moitié create-21h00 n'est jamais un effect distinct → seul le cancel s'exécute.
- **Symptome visible**: « Le rappel de 21h30 pour le carnet est annulé. Pour 21h00, je n'ai pas de confirmation ici qu'il ait été créé. » → utilisateur sans aucun rappel.
- **Preuve système**: `turn_frame.direct_effects=[{effect_type:create_one_shot_reminder, payload_hint:{intent:"cancel", when_hint:"demain soir vers 21h30"}}]` ; `tool_skill_run.selected_handler=cancel_one_shot_reminder`, committed=cancel de `26f58614` ; DB : `pending one-shot=0`. Violation invariant « replace atomique tout-ou-rien » (chantier R).
- **Note**: reproduction du red alex-untested-surfaces T6 (12/07) par une cause amont **différente** (là : create émis puis bloqué `past_time` ; ici : create jamais émis, frame aplati). Rendu honnête sur l'échec (progrès), état durable toujours faux.
- **Correction attendue**: (1) tour replace ⇒ effect composite explicite (cancel cible + create nouveau) ou lane `replace` atomique : cancel committé seulement si create admis, sinon `needs_clarify` global sans mutation ; (2) héritage d'ancre temporelle (heure nue hérite de la date du rappel remplacé) ; (3) `when_hint` du create issu du **nouvel** horaire.
- **Statut**: `fix_applied`
- **Fix reference**: P4-B 13/07 — reclassification déterministe au router rappels : intent=cancel + verbe de re-création dans raw_text + horaire parseable APRÈS le verbe (segment isolé, leçon P3-B) ≠ heure de la cible ⇒ REPLACE (cancel+create atomiques) ; + héritage de JOUR par défaut dès que la nouvelle heure ne porte aucun marqueur de jour (plus seulement quand elle est passée) ; test unitaire (reclassification + jour hérité 21:00 demain) + probe live P4-3 GREEN ×2
- **Tests requis**: (positif) « annule X et remets à HHhMM » → `pending` de remplacement présent, ancien cancelled ; (anti-régression) heure nue en après-midi → create sur demain (date héritée), jamais cancel-sans-create ; scénario ajouté au harness 5-scénarios chantier R « replace heure nue ».

---

## R1-B03 — Adéquation technique carte non gardée au 1er tour (mot de bascule forcé accepté)

- **Tours**: T5 (récupéré T6)
- **Famille**: `BF-INTAKE-06` (mauvais domaine sémantique / technique)
- **Domaine owner**: `coaching_recommendation` (choix de technique / contrat de recommandation)
- **Source amont**: sélection de technique alignée sur le wording user (« mot de bascule ») plutôt que sur la **nature de l'action** (lancement/enclenchement, pas fenêtre de rupture). Le doute n'apparaît qu'après confrontation (T6).
- **Symptome visible**: T5 « je partirais sur ... technique mot de bascille ... Le mot : Démarre. » sans réserve, sur un besoin d'enclenchement.
- **Preuve système**: T5 `skill_run status=continue`, technique alignée user ; T6 doute correct après pushback.
- **Note**: reproduction exacte de eva-global18 T1 (13/07). Non corrigé.
- **Correction attendue**: garde d'adéquation dans le contrat — la nature de l'action prime sur le nom de technique cité ; tension ⇒ exprimer le doute et proposer les 2 options proches dès le 1er tour.
- **Statut**: `fix_applied`
- **Fix reference**: P4-D 13/07 — les 4 INVALIDES de la vague (dont CE tour, cas a) ancrés verbatim dans le contrat technique_coherence (« la règle n'a pas tenu, applique-la mot à mot ») — doctrine, à re-observer en run réel
- **Tests requis**: (positif) « mot de bascule pour ENCLENCHER X » → doute + proposition alternative au 1er tour ; (anti-faux-positif) « mot de bascule pour tenir quand je vais craquer » → mot de bascule accepté sans doute.

---

## R1-B04 — Cible source de correction redemandée alors qu'explicite

- **Tours**: T9
- **Famille**: `BF-INTAKE-01` (slot fourni mais redemandé)
- **Domaine owner**: admission `track_progress_plan_item` (résolution `retarget_from`) + dispatcher (extraction cible de correction)
- **Source amont**: le garde `correction_retarget_missing` bloque bien l'append (progrès net vs BF-EFFECT-03) mais ne résout pas `retarget_from` depuis le marqueur explicite « pas le carnet » + l'entrée committée du même fil (T8).
- **Symptome visible**: « ... à la place de quelle action que je l'avais noté ? » alors que « c'est les écrans, **pas le carnet** » donne déjà la cible.
- **Preuve système**: `tool_skill_run status=needs_clarify, reason=correction_retarget_missing` ; aucune mutation (bien).
- **Correction attendue**: résoudre `retarget_from=X` quand le message porte « pas X » + une entrée committée sur X dans la même conversation ; garder `needs_clarify` seulement si la cible d'origine est réellement ambiguë.
- **Statut**: `fix_applied`
- **Fix reference**: P4-A 13/07 — `resolvePlanItemByNaming` : un item du plan (≠ cible) nommé sans ambiguïté dans le message vaut retarget_from, la clarify ne reste que quand rien n'est résoluble ; triplet unitaire vert (source nommée → retarget exécuté ; source non identifiable → clarify conservée)
- **Tests requis**: (positif) correction avec « pas X » explicite → retarget résolu sans re-question ; (anti-faux-positif) correction sans cible d'origine identifiable → `needs_clarify`.

---

## Régressions positives observées (à contractualiser)

- **BF-EFFECT-03 (faux positif silencieux) ne se reproduit pas** : le garde de correction bloque (`needs_clarify`) au lieu de committer un track plain qui laissait l'entrée erronée en DB (le red Paul-untested16 T2 du 13/07 / alex-untested T2 du 12/07). Le nouveau trou (R1-B01) est la moitié manquante du retarget, pas le faux positif.
- **BF-STATUS-03** (jour-de-semaine faux, « dimanche 13 » du run 12/07) **ne se reproduit pas** au T13 (« 14 juil. » sans jour erroné).
- **needs_research** groundé réel (event `sophia-brain:research_grounding`, gemini-3-flash) — 1re preuve bout Alex, à protéger par test de non-régression.
- **Mémoire bout-en-bout** re-validée sans contamination hors-persona (scope dédié).
