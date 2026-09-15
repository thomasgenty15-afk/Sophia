# Bug Sheet — Global 15 — Alex — R4

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-03-global15-alex-r4.md`

Run vert-tirant-jaune: aucun rouge, 2 tours yellow. Effets durables tous conformes, mémoire e2e correcte, non-régressions R1-B01 / R3-T5 / R1-B03 confirmées.

## R4-B01

- Bug id: R4-B01
- Tours: 6
- Famille: `a classifier` (source amont probable BF-ROUTE-01 — mauvais owner : opportunité `coaching_recommendation`/carte de défense captée par `normal_reply`)
- Domaine owner: dispatcher (arbitration coaching vs normal_reply) + `coaching_recommendation` (sélection defense card vs attack card)
- Source amont: le signal « moment précis à bloquer » (moment daté « déjà couché, lumière éteinte » + piège observable « la main attrape le tel » + geste qui embarque « juste 2 min → 45 min » + demande explicite « bloquer pile ce moment-là ») n'est pas reconnu de façon fiable comme signal de **carte de défense** ; le tour bascule vers `normal_reply` (conseil environnemental générique) et offre une « phrase courte » (technique d'attaque). Variance LLM: à R3-T6 une demande de même nature avait bien routé coaching_recommendation → carte de défense.
- Symptome visible: user demande un appui solide pour bloquer le moment où sa main part vers le téléphone au lit ; Sophia répond « mets le téléphone hors de portée » + « je peux te proposer une phrase ultra courte », sans proposer de carte de défense. L'appui structuré demandé n'est pas offert.
- Preuve systeme: `response_owner=normal_reply`, `reason_code=normal_reply_default`, `direct_effects=[]` au T6 (transcript §2). À comparer avec R3-T6 (`coaching_recommendation` / carte de défense) sur une intention équivalente.
- Correction attendue: doctrine de détection dans le dispatcher/`coaching_recommendation` — un « moment de rupture explicite à bloquer » (marqueurs: moment situé + geste observable + demande de blocage ponctuel) route vers `coaching_recommendation` et sélectionne une **carte de défense** ; distinguer defense card (protéger un moment qui craque) d'attack card / texte magique (recadrage cognitif). Pas un patch de wording : c'est la reconnaissance de signal + la sélection de technique.
- Statut: open
- Fix reference: —
- Tests requis: test contractuel « moment de rupture explicite (moment situé + geste observable + demande de blocage) → owner `coaching_recommendation`, technique defense card » ; test anti-faux-positif « boucle de rumination cognitive → attack card / texte magique » (garde le comportement correct du T2) ; rerun QA ciblé sur un moment de défense avec Alex.

## R4-B02

- Bug id: R4-B02
- Tours: 11
- Famille: BF-INTAKE-01 (slot fourni altéré au rendu)
- Domaine owner: `feature_opportunity` (extraction/composition du slot heure du draft d'initiative)
- Source amont: sur la demande de relance récurrente, le draft d'initiative reprend l'heure « 22h30 » (heure du one-shot créé au T5) au lieu de l'heure explicitement énoncée au tour courant (« vers 22h »). Le slot heure est récupéré depuis le contexte court / un effet antérieur plutôt que depuis l'énoncé du tour.
- Symptome visible: user dit « me relancer tous les soirs vers **22h** » ; Sophia propose deux fois « relance récurrente tous les soirs vers **22h30** ». Heure altérée.
- Preuve systeme: `response_owner=feature_opportunity`, `direct_effects=[]`, aucun effet durable créé (checkins/récurrents inchangés, vérifié DB). Le T12 (recap) rend « 22h30 » correctement pour le one-shot T5, confirmant l'ancrage. Positif à préserver: **aucun `create_one_shot_reminder` émis** sur l'intention récurrente (fix R1-B01 tient).
- Correction attendue: priorité de source du slot heure « énoncé du tour courant > heure d'un effet du contexte » dans la composition du draft d'initiative. Pas un patch de phrase : c'est une règle de priorité de slot.
- Statut: open
- Fix reference: —
- Tests requis: test positif « heure fournie au tour (22h) → draft d'initiative reprend 22h » ; test anti-régression « slot heure du tour absent → pas d'invention, demande de précision » ; anti-faux-positif « heure d'un effet antérieur en contexte n'écrase pas le slot du tour ».
