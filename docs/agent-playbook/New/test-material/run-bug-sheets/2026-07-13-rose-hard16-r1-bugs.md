# Feuille De Suivi Bugs — rose-hard16-r1 (2026-07-13)

Run: `rose-hard16-r1` — Persona Rose — Verdict global **red**.
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-13-rose-hard16-r1.md`.
Cadre: IA réel local (`test-send-message` + `force_full_ai=true`), horloge simulée ancrée `2026-07-13T18:30+02:00`.
Incident environnement: run QA concurrent (`e5630c78`) + 3 batchs memorizer étrangers sur la même fenêtre → état DB post-hoc confondu ; verdicts basés sur preuves in-turn.

## Bugs

### R1-B01 — Correction de cible : retarget non exécuté en tour
- Bug id: R1-B01
- Tours: T4
- Famille: **BF-EFFECT-03** (payload/effet durable de correction incomplet)
- Domaine owner: lane direct-effect `track_progress_plan_item` (effect payload compiler + executor admission)
- Source amont: la frame porte `correction:true` + `retarget_from:5ef704c2`, mais l'executor n'émet qu'un `insert` sur la nouvelle cible (`ae4ec8d7`) sans `supersede/cancel` de la dernière entrée de l'item source.
- Symptome visible: « enlève-le de cartographier et mets-le sur le sas » → seule la 2e moitié est faite ; l'entrée Cartographier/partial survit ; la réponse ne mentionne pas le retrait (correction silencieusement partielle).
- Preuve systeme: ledger `requested 1 / committed 1 / superseded 0 / cancelled 0` ; DB in-turn : `5191340a` (Cartographier/partial) **+** `9839a47a` (sas/completed) coexistent ; ré-exposé au T5 (récap liste les deux).
- Correction attendue: sur `retarget_from`, émettre un couple **atomique** insert (nouvelle cible) + supersede/cancel (dernière entrée de l'item source), exposé au ledger (`superseded>=1`) et à la réponse (« retiré de X, mis sur Y »).
- Statut: fix_applied
- Fix reference: P4-A 13/07 — `invalidateChatEntryForRetarget` sans filtre d'outcome (la source `partial` corrigée vers `completed` survivait, cause racine trouvée en code) + le committed porte `retarget_invalidated`/`retarget_from_title`, le ledger porte `superseded_effects` (`superseded_by_retarget`), le rendu énonce le retrait (« — et je l'ai retiré de « X » ») ; probe live P4-2 (rejeu debug) : 1 seule entrée finale, retrait énoncé
- Tests requis: (positif) correction de cible → 1 entrée sur la nouvelle cible + 0 entrée survivante sur la source + `superseded>=1` ; (paraphrase) « en fait c'était Y pas X » ; (anti-faux-positif) une confirmation simple ne doit pas déclencher de retarget spurieux (cf. T8) ; (intégration) ledger reflète le supersede.
- Récurrence: reproduction sur Rose du red BF-EFFECT-03 déjà vu Alex-untested T2, Paul-untested16 T2 (ici la frame porte le flag — le trou est purement à l'exécution).

### R1-B02 — Plage de dates composite aplatie + claim des deux jours
- Bug id: R1-B02
- Tours: T6
- Famille: **BF-INTAKE-05** (sémantique composite aplatie) ; **+ BF-LEDGER-01** (claim fantôme)
- Domaine owner: intake/extractor (canonical date mapping) + final response pipeline
- Source amont: instruction bi-date « hier **et** avant-hier » → un seul `date_hint:"2026-07-12"` extrait ; renderer verbalise les deux dates.
- Symptome visible: « marqué comme fait pour hier et avant-hier » alors qu'une seule entrée (12/07) est créée ; avant-hier (11/07) absent.
- Preuve systeme: tf.direct_effect `date_hint:"2026-07-12"` seul ; ledger `committed 1` ; entry unique `9f573ced` (effective_at 2026-07-12) ; aucune entrée 2026-07-11.
- Correction attendue: déplier plage/liste de dates en N effets `track` (un par jour) ou clarifier si ambigu ; caler la verbalisation sur les dates **réellement** committées.
- Statut: fix_applied
- Fix reference: P4-B 13/07 — `resolveExplicitTrackDayList` (router track) déplie « hier et avant-hier » / « ces deux/trois derniers soirs » en une entrée PAR jour (idempotence par jour, confirmation = jours réellement committés) ; règle 3d-bis dispatcher réécrite (jour le plus récent en date_hint, le runtime déplie) ; test unitaire triplet + probe live P4-4 GREEN (2 entrées J-1/J-2)
- Tests requis: (positif) « J1 et J2 » → 2 entries aux 2 dates ; (paraphrase) « ces trois derniers jours » → 3 entries ; (anti-faux-positif) une seule date → 1 entry ; (renderer) verbalisation = dates committées.
- Récurrence: même famille qu'Eva-global17 T7 ; premier passage confirmé sur Rose.

### R1-B03 — Recall inter-session non déclenché (planner sans target)
- Bug id: R1-B03
- Tours: T16 (bonus, scope neuf)
- Famille: **BF-MEMORY** (recall runtime)
- Domaine owner: planner de retrieval (émission de targets) + loader runtime
- Source amont: `memory_plan` du tour émet `memory_mode:none` / `targets:[]` sur un tour vendredi-soir matchant un domaine mémorisé → pas de retrieval.
- Symptome visible: le fait persisté « vendredi soir = point le plus fragile » n'est pas remonté ; conseil générique.
- Preuve systeme: `memory_used_for_route:false`, `memory_item_ids_used:[]`, `memory_mode:none`, `targets:[]` ; embeddings pourtant présents à la création (`emb=true`).
- Correction attendue: émettre des targets taxonomiques quand le tour matche un domaine mémorisé (addictions.cannabis / psychologie.emotions) ; recall sémantique par embedding sur ces domaines.
- Statut: fix_applied (volet déclenchement)
- Fix reference: P4-D 13/07 — signal `advice_seeking` (signal_detection) + override runtime du memory_mode=none (dispatcher_plan_adapter) : une demande de conseil déclenche un recall topic léger routé sémantiquement (embedding du message) même quand le planner n'émet aucun target ; test unitaire triplet du signal — recall bout-en-bout à re-vérifier en run réel
- Tests requis: (intégration) tour matchant domaine X → `memory_item_ids_used` non vide ; (invariant) fait mémorisé remonté au tour suivant matchant son domaine.

### R1-B04 — Objet-rappel persisté en memory_item candidate (hygiène memorizer)
- Bug id: R1-B04
- Tours: post-run (batch memorizer scopé Rose)
- Famille: **BF-MEMORY** (hygiène d'objet mémoire)
- Domaine owner: memorizer (filtre objet-rappel / write policy)
- Source amont: le filtre objet-rappel (validé eva-global18 / paul-untested16 pour les items *active*) ne **rétrograde** l'intention de rappel qu'en `candidate` au lieu de l'exclure.
- Symptome visible: item candidate « Elle veut un rappel demain soir pour préparer son sac de sport » (domaine habitudes.planification) — un objet-outil dans la mémoire personnelle.
- Preuve systeme: `memory_items` (extraction `db0aa2db`), status `candidate`, contenu = intention de rappel.
- Correction attendue: exclure toute intention/objet de rappel du périmètre mémoire (active **et** candidate), pas seulement rétrograder ; les candidates polluent le recall inter-runs (guidelines P2-5).
- Statut: fix_applied
- Fix reference: P4-D 13/07 — `isReminderObjectItem` élargi (heures en toutes lettres + moments sans chiffre « demain soir » + nom « rappel(s) » hors verbe « rappelé ») : REJET total, jamais une rétrogradation en candidate ; + `isToolRequestObjectItem` (demande de carte/potion rejetée) ; triplet unitaire vert (la candidate fuyée de ce run est le cas de test)
- Tests requis: (négatif) un message « rappelle-moi X » ne produit aucun memory_item (active/candidate) ; (positif) un fait personnel dans le même tour reste capté.

## Positifs notables (régressions/reds antérieurs NON reproduits ce run)
- **V5-1 en medium** servi (T11) : le red hard15 T10 (rappel bénin nié en medium) n'est pas reproduit.
- **Traîne `conversation_risk`** fonctionnelle (T12, score 2 `previous_risk_trail`) : contredit BF-ROUTE-04 « conv_risk inerte » des runs antérieurs.
- **Résolution des dates relatives stable** (T2/T7/T11/T14) : aucune dérive « demain » = aujourd'hui, contraste avec hard15 (BF-INTAKE-04).
- **Embeddings memorizer à la création** (les 8 items) : corrige une des deux causes racines du recall raté hard15 T16.
- **Draft lifecycle** (T1-T2), **anti-instruction verify** (T5), **multi-intent sans perte** (T7), **pas de fuite de slug** au récap (T13) : surfaces neuves/à risque, toutes vertes.
