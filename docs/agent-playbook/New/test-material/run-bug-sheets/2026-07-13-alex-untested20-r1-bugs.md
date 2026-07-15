# Bug Sheet — alex-untested20-r1 (2026-07-13)

Run: `alex-untested20-r1` · Persona: Alex · Rapport: `qa-run-reports/2026-07-13-alex-untested20-r1.md`
Verdict global: **red** (1 red T3 ; 3 yellows T1/T6/T8).

Cadre: 15 tours IA réel local, `force_full_ai=true`, scope DB `qa-alex-untested17-2026-07-13-r1`. Surfaces neuves Alex validées vertes (product_help billing, presence approfondie + recovery + offre sur pull, carte de défense adéquate, cancel+statut, capacité impossible). Re-checks positifs : replace atomique + héritage d'ancre (fix P4-B) **confirmé vert** (T2), multi-intent cross-lane track+rappel vert (T4), BF-PREF-01 comportement cible (T14). Red = **generalisation** du trou « effet composite aplati » au track multi-cardinalité (hors périmètre P4).

---

## R1-B01 — Track composite multi-date aplati en une seule occurrence (2 des 3 soirs perdus) + rendu contradictoire

- **Tours**: T3
- **Famille**: `BF-AGENDA-01` (effet composite/multi-cardinalité aplati) ; contributeurs `BF-EFFECT-02` (occurrences attendues absentes) et `BF-LEDGER-02` (rendu contredit le commit)
- **Domaine owner**: dispatcher / TurnFrame (émission des `direct_effects` d'un track multi-date) + admission `track_progress_plan_item` (fan-out des occurrences)
- **Source amont**: une intention de track à multi-cardinalité (N dates explicites sur la même cible dans un tour) est modélisée comme **un seul** `direct_effect` (la première date résolue). `turn_frame.direct_effects` ne porte qu'un effect, `target_evidence="vendredi"` ; samedi (11/07) et dimanche (12/07) droppés à l'émission. Racine identique aux composites bi-parties global19 T10 (retarget) / T12 (replace), mais sur l'axe **fan-out N-occurrences homogènes** — non couvert par P4-A/P4-B.
- **Symptome visible**: « Bien joué, trois soirs d'affilée … Pour l'instant je vois seulement 3/7 pour le carnet — pas encore les trois soirs de vendredi, samedi et dimanche comptés. » Le rendu prétend n'avoir rien compté des trois, alors qu'un a été committé (reps 2→3).
- **Preuve système**: `tool_skill_run.allowed_effects=[{target=cb91224c(carnet), date_hint=2026-07-10, progress_status=completed, value=1}]` (1 seul) ; DB post-T3 : **1** entrée carnet `e45787b8` (completed, effective 10/07), `carnet current_reps=3`, aucune entrée pour 11/07 ni 12/07.
- **Correction attendue**: contractualiser le track multi-cardinalité comme **fan-out déterministe** — un tour portant plusieurs dates/occurrences explicites sur la même cible émet **N** `track_progress_plan_item` (un par date résolue) OU un effect `batch` déplié en N écritures par l'admission ; garde d'admission déterministe « rendu asservi au commit réel » : interdire un rendu « 0/aucun compté » quand ≥1 écriture a réussi. Généralisation de la doctrine composite P4 (retarget/replace) au fan-out d'occurrences.
- **Statut**: **fix_applied (P5-C, 13/07 nuit)** — dépliage des jours de semaine nommés dans `resolveExplicitTrackDayList` (plus récent passé, négations exclues, borné 3) ; la confirmation est asservie aux jours réellement committés (reply déterministe de la boucle multi-jours). Test intégration : 3 writes aux 3 dates + « 3 jours » dans la reply.
- **Tests requis**: (positif) « j'ai fait X vendredi, samedi et dimanche » → 3 entrées sur 3 dates distinctes + rendu « 3 comptés » + reps +3 ; (paraphrase plage) « j'ai tenu X tout le week-end (3 soirs) » → même résultat ; (anti-régression rendu) tout commit ≥1 réussi ⇒ rendu ne dit jamais « pas encore compté » ; (borne) plage dépassant la cible hebdo → écritures + note honnête, pas de silent-drop.

---

## R1-B02 — Brouillon/preview de rappel non honoré (« montre avant de poster, je valide » committe quand même)

- **Tours**: T1
- **Famille**: `BF-INTAKE-03` (contrainte explicite perdue par le dispatcher, non opposable en admission)
- **Domaine owner**: dispatcher / TurnFrame (émission de l'effect) + admission `create_one_shot_reminder`
- **Source amont**: l'anti-instruction explicite « montre-le-moi d'abord avant de le poser pour de vrai, je veux valider » est reconnue en **intention** (`memory_plan.response_intent=confirm_and_wait_for_validation`) mais pas portée comme contrainte opposable ; la lane émet un `create_one_shot_reminder` `explicit/high` et committe la ligne pending. Il n'existe pas de chemin brouillon/preview pour `create_one_shot_reminder`.
- **Symptome visible**: « Demain soir 21:30 : « sortir mon carnet avant de dormir ». » — rendu ambigu (se lit comme un brouillon présenté) alors que la ligne DB existe déjà.
- **Preuve système**: `tool_skill_run.status=success`, committed `780c0e9c` (`scheduled_for=2026-07-14T19:30Z`) ; DB post-T1 : `pending one-shot=1` malgré la demande de validation préalable.
- **Correction attendue**: porter l'anti-instruction « preview/validate first » dans le TurnFrame comme contrainte explicite du tour ; garde d'admission déterministe : `response_intent=confirm_and_wait_for_validation` ⇒ la lane produit un **brouillon** (aucune ligne pending) + demande de validation ; le commit n'a lieu qu'au tour de confirmation. Même philosophie que le blocage side-effects sous safety (garde d'admission, pas prompt). Pendant « create » de l'anti-instruction `track` non honorée (alex-untested-surfaces T14, 12/07).
- **Statut**: **fix_applied (P5-F, 13/07 nuit)** — garde d'admission déterministe (marqueurs brouillon/validation préalable) ⇒ brouillon rendu, ZÉRO pending, slots persistés ; confirmation → commit fidèle. Guidance composeur `draft_pending_confirmation` (« c'est créé » INTERDIT). Probe P5-6 2× GREEN.
- **Tests requis**: (positif) « prépare un rappel mais montre avant de poster » → 0 pending, rendu « voici le brouillon, tu valides ? » ; puis « ok pose-le » → 1 pending ; (anti-régression) demande de rappel sans anti-instruction → commit immédiat inchangé.

---

## R1-B03 — Offre de technique de coaching sur dépôt émotionnel vulnérable sans pull (anti-poussée presence)

- **Tours**: T8 (récupéré T9)
- **Famille**: `à classifier` (arbitrage presence/coaching) ; proche `BF-INTAKE-06` (technique proposée hors du besoin du moment)
- **Domaine owner**: dispatcher (arbitrage presence vs coaching) + skill `coaching_recommendation`
- **Source amont**: sur un dépôt émotionnel réflexif (« tapis roulant … c'est con hein ») sans aucun pull d'action, le tour est reclassé `coaching_recommendation_signal` et propose une technique (« clarte »). L'intention est pourtant `supportive_emotional_reflection` ; la doctrine presence (anti-poussée structurelle, offre unique **sur pull**) n'est pas prioritaire quand un thème « effort/sens » est saisissable par le coaching.
- **Symptome visible**: « Ici, ce qui colle le mieux, c'est clarte … si tu veux on peut remettre ça à plat en une phrase. » Récupéré au T9 seulement après refus explicite (« pas d'exercice, pas maintenant … je reste là »).
- **Preuve système**: T8 `response_owner=coaching_recommendation`, `reason=coaching_recommendation_signal`, `memory_plan.response_intent=supportive_emotional_reflection` ; T9 coaching `status=exit` → `presence_conversation_entry`.
- **Correction attendue**: quand `response_intent=supportive_emotional_reflection` et aucun pull d'action présent, tenir la presence (refléter + rester), ne pas offrir de technique tant que le user ne tire pas. Le doute d'adéquation bascule vers « rester » plutôt que « proposer » sur un dépôt.
- **Statut**: **fix_applied (P5-H, doctrine, 13/07 nuit)** — règle 5 dispatcher : dépôt réflexif auto-dérisoire = invitation à RESTER, le doute bascule vers rester jamais vers proposer (ancre testée) ; anti-FP pull explicite conservé. À re-observer en run réel.
- **Tests requis**: dépôt émotionnel réflexif sans pull → `presence` tenue, 0 offre de technique ; même tour + pull explicite (« tu ferais quoi ») → offre servie (T10 déjà vert).

---

## R1-B04 — Capacité produit inexistante : mis-route + claim d'intégrations non groundé

- **Tours**: T6
- **Famille**: `à classifier` ; proche `BF-STATUS-01` (claim de capacité/projection produit non groundé)
- **Domaine owner**: dispatcher (routing feature_opportunity) + composeur `normal_reply` (grounding capacité)
- **Source amont**: une demande de capacité produit inexistante (« connecte-toi à ma montre pour tracker le sommeil automatiquement ») reste en `normal_reply` (`response_intent=product_capability_request`) au lieu de router vers `feature_opportunity` ; le composeur comble le vide en spéculant des intégrations (Apple Health / Google Fit / Fitbit) sans preuve registre.
- **Symptome visible**: « Je ne peux pas me brancher directement à ta montre … je peux t'aider à voir si l'appli propose une synchro avec Apple Health, Google Fit ou Fitbit … »
- **Preuve système**: T6 `response_owner=normal_reply`, `reason=normal_reply_default`, `memory_plan.response_intent=product_capability_request` ; aucun signal feature_opportunity.
- **Correction attendue**: router les demandes de capacité produit vers `feature_opportunity` (registre des capacités réelles) → réponse groundée (« existe, voici où » ou « pas dispo, idée notée »), jamais une spéculation « si l'appli propose… ». Invariant : aucune intégration nommée sans preuve registre.
- **Statut**: **fix_applied (P5-H, doctrine, 13/07 nuit)** — règle 7 dispatcher : demande de capacité produit inexistante = feature_opportunity, jamais une réponse normale qui spécule des intégrations sans preuve registre (ancre testée). À re-observer en run réel.
- **Tests requis**: demande de capacité inexistante → route `feature_opportunity`, 0 intégration nommée sans preuve ; demande de capacité existante → renvoi produit exact.

---

## Watch-points (non bloquants, pas de ligne bug)

- **T10**: guidance sur pull livrée en dump dense de 4 points vs doctrine « offre unique sur pull » — atterrit néanmoins sur un premier pas unique. Watch composeur presence.
- **T13**: le fait mémoire **explicitement demandé** (« garde-le en tête ») persiste en `status=candidate` alors qu'un fait **inféré** (T11) persiste en `active`. Inversion mineure de durabilité explicite vs inféré — à surveiller sur la classification memorizer.
- **T15**: clôture reste ownée par `feature_opportunity` (flow style) plutôt qu'un `normal_reply` propre ; re-mention 3e du « plus cash ». Léger.

## Vérification chantier P5 (2026-07-13 nuit)

- Probes live 2× ALL GREEN consécutives sur le build final (le fan-out multi-dates est couvert par la probe P5-3 sur nina, même code).
- Sweep scopé 1082 verts / 17 échecs = baseline env-gated exacte ; harness rappels 5/5 GREEN ×2.
- Les deux fixes doctrine (B03/B04) sont prompt-only : re-observation en run réel demandée à la prochaine vague.
