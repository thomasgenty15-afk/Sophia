# Bug Sheet — potion_support_7day_e2e_20260717_r1

Rapport source : `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-17-potion-support-7day-e2e-r1.md`

## PS7-B01 — Deadlock du jour silencieux : le sas armé annule tous les jours suivants

- Tour concerné: Jours 5 et 6 (J5 et J6 `cancelled`, `delivery_last_error=potion_support_preempted_by:potion_support_admission_v1`), après un J4 délivré sans réponse.
- Famille: `BF-STATE-01` — mauvaise transition de flow (garde sans condition de désarmement).
- Owner runtime: garde de préemption potion de `process-checkins` (anti-empilement) × exemption de fraîcheur du sas `potion_support_admission_v1` (`active_flow_state`, test « keeps the semantic first reply beyond four hours »).
- Source amont: deux mécanismes individuellement corrects forment un verrou permanent — le sas ne périme jamais pour rester capteur d'une réponse tardive, et le scheduler annule tout créneau tant qu'un état potion est actif. Après UNE ouverture ignorée, chaque jour suivant est consommé en silence ; sans message spontané du user, la campagne meurt sans terminalisation ni trace visible. Leçon P9 (toute ceinture porte sa condition de désarmement) exactement reproduite.
- Correction recommandée (décision produit à acter d'abord) :
  - Option A (recommandée) — remplacement : au créneau suivant dû, une admission `awaiting_first_reply` non consommée est REMPLACÉE — l'ouverture du jour part (focus conscient du silence, ex. fil porté), le sas est ré-armé sur le nouveau jour (nouveau checkin_id/day_index). Le capteur de réponse tardive reste actif en continu, simplement re-pointé.
  - Option B — péremption de livraison : le sas reste collant pour la CONVERSATION mais cesse de bloquer la LIVRAISON après X heures ; moins bon (deux ouvertures consécutives sans lien explicite).
  - Dans les deux cas : consigner l'issue dans `opening_history` (`outcome=skipped_awaiting_reply` ou `replaced`), jamais deux jours consécutifs perdus sans décision.
- Tests d'invariant attendus: J_N sans réponse → J_{N+1} délivré avec sas ré-armé sur day N+1 ; réponse tardive après remplacement → toujours captée par le dispatcher local (contexte du dernier jour armé) ; deux jours silencieux consécutifs → deux ouvertures adaptées, zéro annulation silencieuse ; la garde anti-empilement reste effective pendant une GÉNÉRATION en cours (course).
- Statut: open (red).

## PS7-B02 — Extraction composite : un message progrès + nouveau fil ne produit que le progrès

- Tour concerné: Jour 3 — l'ouverture complimente les limites acquises (`kind=progress`, « sans fil frais concurrent ») alors que la veille portait aussi « réunion d'équipe vendredi, ventre noué » ; le fil n'est jamais entré dans `cumulative_ledger.open_threads`.
- Famille: `BF-PROACTIVE-01` — preuve → décision proactive cassée (extraction).
- Owner runtime: reducer d'extraction `preparePotionSupportOpening` (unités structurées).
- Source amont: message utilisateur composite (bonne nouvelle + inquiétude nouvelle dans le même message) → une seule unité extraite. La politique serveur de sélection (fil frais > progrès) est saine et a fonctionné sur des entrées incomplètes ; ne pas la toucher.
- Correction recommandée: contrat d'extraction explicite sur les messages composites (progrès ET fil dans la même phrase = 2 unités), test paraphrase + test « même message » dédiés — parallèle direct des tests unitaires existants « J3 sends fresh focus and progress » qui passent sur fixtures mais ont raté ce cas réel.
- Résilience observée: auto-guérison quand le user re-mentionne le fil (J4 correct) ; perte sèche sinon.
- Statut: open (yellow).

## PS7-B03 — Déictiques temporels recopiés sans réancrage (« pour demain » un jour plus tard)

- Tour concerné: Jour 2 — « Tu as aussi déjà posé deux limites concrètes pour demain » alors que le rendez-vous est devenu aujourd'hui.
- Famille: `BF-STATUS-03` — temps mal rendu.
- Owner runtime: extraction potion (faits stockés avec leurs déictiques d'origine) ; famille de la doctrine « dates dépliées » P4.
- Correction recommandée: normaliser les références relatives en dates absolues à l'extraction (fait stocké = date résolue), re-projection relative correcte au rendu.
- Statut: open (yellow).

## PS7-B04 — Campagne épuisée jamais terminalisée

- Tour concerné: fin de run — après J7 (dernier jour) : reminder `active`, `potion_support_v1.status=active`, 0 créneau restant, aucune raison terminale ; aucun mécanisme de complétion dans le code.
- Famille: `BF-STATE-03` — lifecycle cassé.
- Owner runtime: lifecycle de campagne (process-checkins post-livraison du dernier créneau ou backstop scheduler).
- Impact: le reminder reste rendu comme récurrent actif à vie (cf. « mini pause du jour » dans le readout du run R1).
- Correction recommandée: terminalisation `completed_series` à la clôture du dernier créneau, même mécanique vérifiée (relecture) que les autres raisons terminales ; verdict distinct de `completed_resolved` (fin de série ≠ sujet réglé).
- Tests d'invariant attendus: dernier jour `sent` → reminder terminal `completed_series` ; dernier jour `cancelled` (préemption) → idem ; une campagne terminale n'apparaît plus dans les readouts de reminders actifs.
- Statut: open (yellow).
