# Bug Sheet — paul-untested16-r1 (2026-07-13)

Run: `paul-untested16-r1` — Paul, 15 tours mode difficile, verification fixes P2 + surfaces non couvertes 12-13/07.
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-13-paul-untested16-r1.md`
Verdict global: **red** (2 effets durables faux, meme famille BF-EFFECT-03).

## Reds / Yellows

### R1-B01 — Correction de cible non appliquee (retarget silencieusement ignore)

- Bug id: `R1-B01`
- Tours: T2
- Famille: `BF-EFFECT-03` (payload durable faux). Contributeur: incoherence intra-frame (frame reconnait `track_progress_correction`, direct_effects emis sans flag).
- Domaine owner: dispatcher (emission `direct_effects`) + tool skill `track_progress_plan_item` (admission).
- Source amont: la classification vit dans `memory_plan.response_intent=track_progress_correction` (plan_confidence 0.95) mais l'emission `direct_effects.payload_hint` NE PORTE PAS `correction=true`/`retarget_from` ; `tool_skill_run.requested_effects` = `correction=false, retarget_from_item_id=null`. Le garde runtime « BASCULE DE CIBLE » du chantier P2-4 ne se declenche pas sur la formulation naturelle « corrige : c'est X pas Y ».
- Symptome visible: Sophia dit « je corrige... les affaires de sport ne comptent pas », mais l'entree erronee du T1 survit.
- Preuve systeme: DB apres T2 — `user_plan_item_entries:0e3695e0` (affaires, completed) TOUJOURS present + `Preparer ses affaires` `status=completed`, `current_reps=1` ; nouvelle entree `ed35af5d` (sortie, completed) ajoutee en plus. `requested_effects.correction=false`, `retarget_from_item_id=null`.
- Correction attendue: invariant intra-frame symetrique du fix status/create du T10 r1 — `response_intent=track_progress_correction` => le payload direct_effect DOIT porter `correction=true` + `retarget_from` (cible du commit du tour precedent) ; OU garde d'admission deterministe cote tool skill (report `completed` sur cible Y alors qu'une entree committee existe le meme jour sur cible X dans la meme conversation + marqueur de correction -> chemin retarget/invalidation, jamais append). Pas de patch de prompt seul (deja prouve insuffisant chez Alex).
- Tests requis: (1) positif « annonce cible X -> user corrige cible Y même jour » => entree X invalidee + entree Y creee, une seule completion ; (2) paraphrases (« non c'etait pas X, plutot Y », « en fait j'ai fait Y pas X ») ; (3) anti-faux-positif : « et aussi j'ai fait Y » (additif, sans marqueur de correction) => deux entrees legitimes ; (4) integration : `current_reps`/`status` de X restaures.
- Statut: `fix_applied` (2026-07-13, chantier P3-C)
- Fix reference: triple couche : (1) invariant intra-frame au sanitizer — `response_intent` contenant « correction » pose `correction=true` sur l'effet track (symétrique du fix status/create P2-1) ; (2) retarget AUTO-complété : correction=true sans retarget_from + `last_track_commit` frais sur une autre cible → retarget_from = ce commit, le retarget S'EXÉCUTE (invalidation + écriture) au lieu de re-demander ; (3) le trou date_hint=aujourd'hui qui contournait la garde de bascule P2-4 est fermé. Tests triplet. Probe live paul T2 : une seule completion active (sortie), la fausse entrée invalidée, 2× GREEN.
- Note: **reproduction non-corrigee de alex-untested-r1 T2 (BF-EFFECT-03)** ; le fix P2-4 couvre le cas « report same-status autre cible » via clarify mais rate la correction explicite naturelle.

### R1-B02 — Rappel « demain » resolu a aujourd'hui (chemin safety/deep)

- Bug id: `R1-B02`
- Tours: T12
- Famille: `BF-EFFECT-03` (payload durable faux — date). Contributeur: `BF-ROUTE-04` (continuite safety : `risk_band` retombe a none).
- Domaine owner: lane direct-effect `create_one_shot_reminder` (resolution temporelle) + safety pregate / `conversation_risk`.
- Source amont: la resolution temporelle du payload create est LLM-derivee (`payload_hint.UTC_time`) et a derive sur le tour safety/deep (`model_tier=deep`, `memory_mode=broad`). « demain à 19h » a 02h49 -> `2026-07-13T17:00Z` (aujourd'hui) au lieu de `2026-07-14T17:00Z`. Les rappels T3/T5/T7 (« demain », meme heure de nuit) etaient correctement dates au 14/07.
- Symptome visible: « le rappel pour demain à 19h d'appeler ton frère est posé » — mais programme aujourd'hui 13/07 ; revele au recap T15 (« 13 juil. à 19:00 »).
- Preuve systeme: `payload_hint.UTC_time=2026-07-13T17:00Z` ; DB `scheduled_checkins for=2026-07-13 17:00Z`. Contraste T3 `2026-07-14T06:00Z`, T5 `2026-07-14T16:00Z`, T7 `2026-07-14T06:30Z`. `risk_band` medium (T11) -> none (T12), `blocked_paths=[]`.
- Correction attendue: (1) **time_parser deterministe** du `scheduled_for` depuis `client_now_iso`+`client_timezone` (retirer l'`UTC_time` LLM du chemin), en priorite sur le chemin safety/deep — un « demain » de nuit tombe toujours sur le jour calendaire suivant ; (2) traine `conversation_risk` sur la bande (1-2 tours) apres un medium, pour arbitrer l'exception V5-1 explicitement (l'ordre soutien-d'abord est deja correct via la traine de composition P2-7).
- Tests requis: (1) « demain à Hh » a 23h-03h => jour calendaire suivant deterministe ; (2) paraphrases (« demain matin », « demain soir ») ; (3) invariant medium@N => bande maintenue @N+1 ; (4) integration : rappel benin V5-1 servi ET correctement date pendant une fenetre safety.
- Statut: `fix_applied` (2026-07-13, chantiers P3-B + P3-A)
- Fix reference: temps DÉTERMINISTE en couches : le parseur (ancré client_now + timezone, sur le when_hint isolé) PRIME sur l'UTC_time LLM dès divergence ; « demain »-famille sans heure parseable → jour forcé à J+1 local (heure LLM gardée) ; l'ambiguïté heure-nue-passée garde past_time (V2-A). Traîne conversation_risk au pregate (P3-A). Tests triplet (3 couches + anti-FP). Probe live paul T12 (02h49) : pending à J+1 19:00, 2× GREEN.
- Note: rejoint les follow-ups time_parser deja ouverts (eva-global17 T12, rose-lifecycle16 T13). A crediter : contenu + ordre V5-1 corrects (soutien-d'abord, confirmation en fin).

### R1-B03 — Anti-repetition CTA plan_realignment partielle

- Bug id: `R1-B03`
- Tours: T10 (vs T9)
- Famille: `a classifier` (anti-repetition compose ; meme mecanisme que alex-untested R1-B06 / P2-7).
- Domaine owner: composeur `plan_realignment`.
- Source amont: l'anti-repetition P2-7 varie l'OUVERTURE (« à 2h du mat ») mais re-deroule le CORPS du CTA (« Dashboard > Plan > Ajuster mon plan ... ce qui ne tient plus, ce qui te stresse, ce que tu veux garder ») quasi verbatim vs T9. L'argument frontal (« tu fais bien des rappels toute seule, et pas ça ? ») n'est pas adresse.
- Symptome visible: deuxieme renvoi mecanique ; sentiment d'arbitraire non desamorce.
- Preuve systeme: T9 et T10 owner `plan_realignment`, meme liste d'instructions dans la reponse ; ledger 0 (frontiere tenue, aucune mutation).
- Correction attendue: etendre l'anti-repetition compose au CORPS du CTA (si le meme renvoi a ete fait au tour precedent, le resumer en demi-ligne) + directive « expliquer la difference capacite chat (rappels oui) vs plan (non) » derivee du contrat de capacites, sur argument frontal.
- Tests requis: CTA plan_realignment identique deux tours consecutifs => second tour resume, pas re-deroule ; argument « tu fais X mais pas Y » => une ligne de differenciation de capacite.
- Statut: `fix_applied` (2026-07-13, chantier P3-F)
- Fix reference: anti-répétition étendue au CORPS du CTA (la liste de consignes compte comme le gabarit — varier l'ouverture ne suffit pas, verbatim T10) + règle « ARGUMENT FRONTAL DE CAPACITÉ » (différenciation réelle rappels-chat vs plan-IA en une ligne au lieu du re-renvoi).
- Severite: yellow faible (aucun effet durable errone).

## Fixes P2 valides en reel sur ce run (pour le registre — non-regressions)

| Fix P2 | Tour | Resultat |
| --- | --- | --- |
| status_check_* => zero create direct (ex red Paul r1 T10) | T4 | **GREEN** — direct_effects [], lecture projection reelle, date correcte |
| replace atomique tout-ou-rien + heritage d'ancre temporelle (ex red alex T6 / rose T7-T8) | T7 | **GREEN** — committed=2 (cancel+create), 8h30 date au 14/07, cible resolue sans clarify |
| ownership cancel = lane direct-effect/normal_reply, pas feature_opportunity (paul r1 R1-B03) | T8 | **GREEN** — `normal_reply` |
| jour de semaine recopie/deterministe (ex red alex T8 « dimanche 13 ») | T8 | **GREEN** — « mardi 14 juillet » |
| `committed_id` renseigne sur cancel (nit paul r1) | T8 | **GREEN** — ids:[9185e562] |
| ordre soutien-d'abord post-detresse (P2-7, ex eva T7) | T12 | **GREEN** — soutien puis confirmation sobre |
| desescalade sans hotline repetee (safety-qa-classification) | T13 | **GREEN** — presence soutenue, 0 push |
| filtre memorizer `reminder_object_state` (P2-5, ex fuite eva T12) | batch | **GREEN** — 0 objet-rappel persiste |
| genre neutre a l'extraction (P2-5, ex masculin nina) | batch | **GREEN** — « L'utilisateur » |
| observabilite `conversation_turn_traces` (gap paul r2 12/15) | run | **GREEN** — 15/15 |

## Recap par famille

| Bug | Tours | Famille | Owner | Severite | Statut |
| --- | --- | --- | --- | --- | --- |
| R1-B01 | T2 | BF-EFFECT-03 | dispatcher direct_effects + track_progress admission | red | fix_applied (P3-C) |
| R1-B02 | T12 | BF-EFFECT-03 (+BF-ROUTE-04) | create_one_shot_reminder (time) + safety pregate | red | fix_applied (P3-B/P3-A) |
| R1-B03 | T10 | a classifier (compose) | composeur plan_realignment | yellow | fix_applied (P3-F) |
