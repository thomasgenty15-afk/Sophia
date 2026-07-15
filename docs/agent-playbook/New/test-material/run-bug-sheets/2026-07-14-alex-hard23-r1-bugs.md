# Bug Sheet — alex-hard23-r1 (2026-07-14)

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-14-alex-hard23-r1.md`
Persona: Alex (`aac76fd6-a688-4027-951a-fa79c628fac5`) · channel web · Supabase local · IA réelle `force_full_ai=true`.
Verdict global: **yellow** (2 yellow, 0 red ; 2 reds ouverts 14/07 re-checkés et non reproduits).

## Bugs

### R1-B01 — Mot de bascule non servi sur fenêtre de rupture explicite

- **Bug id**: R1-B01
- **Tours**: T7 (setup T6)
- **Famille**: `BF-EFFECT-03` (bonne opération coaching, mauvaise technique)
- **Domaine owner**: `sophia-brain/skills/coaching_recommendation` (sélecteur de levier / décision de technique)
- **Source amont**: décision de technique du skill coaching. Le skill supporte `mot_de_bascule` (`skills/coaching_recommendation/contract.ts:84`) et un invariant de test l'exige : `skills/coaching_recommendation/local_flow_test.ts:4563` (« Une vraie fenetre de rupture demandee comme mot de bascule reste servie sans doute ») ; `:204` (« N'utilise pas Mot de bascule pour un simple blocage » — ici PAS un simple blocage). Le mot de bascule est une variété de carte d'attaque (`:290`) ; l'objet « rallumer le téléphone au lit » est lié à l'habitude du plan `7df6d84d` « Couper les écrans ».
- **Symptôme visible**: le user demande « juste UN mot, un déclencheur ultra court » pour « la seconde exacte où je craque » (fenêtre de rupture, refus explicite du « plan B »). Sophia répond que « un simple mot seul risque d'être trop fragile » et impose une carte de défense libre, sans jamais proposer/décrire le mot de bascule.
- **Preuve système**: T7 `response_owner=coaching_recommendation`, `reason=active_coaching_recommendation`, `direct_effects=[]`, `effect_ledger={}` ; T6 `skill_signals.coaching_recommendation.reason=free_action_coaching_need`. Aucun effet durable (suggestion).
- **Correction attendue**: le sélecteur de levier doit classer « mot court + instant de rupture + refus de l'appareil plan » comme fenêtre de rupture → proposer le **mot de bascule** (ou garder le doute et présenter les deux dispositifs en langage courant sans nom interne, cf. `visible_agents/shared.ts:88`), au lieu de disqualifier le mot court. Honorer en run réel l'invariant `local_flow_test.ts:4563`.
- **Tests requis**:
  - positif: « je veux juste un mot pour tenir la seconde où je craque et pas rallumer » → propose mot de bascule.
  - paraphrase: « un déclic ultra court, j'ai pas le temps de réfléchir à un plan » → idem.
  - anti-faux-positif: simple blocage sans fenêtre de rupture (« j'ai du mal à m'y mettre ») → carte de défense / potion, PAS mot de bascule.
  - intégration: run réel coaching sur habitude plan « couper les écrans » → technique servie = mot de bascule / carte d'attaque, pas défense.
- **Statut**: `fix_applied`
- **Fix reference**: fix_applied (P8-G, 2026-07-14) — cas (e) DISQUALIFICATION INTERDITE ajouté au contrat technique_coherence (coaching local_flow.ts) avec le verbatim du run: fenêtre de rupture EXPLICITE + refus de l'appareil ⇒ le mot de bascule est PROPOSÉ (ou les deux dispositifs décrits avec le doute); « un simple mot risque d'être trop fragile » + carte de défense imposée = l'erreur nommée. Tests: ancre prompt. Doctrine prompt-only — l'invariant local_flow_test.ts:4563 reste le filet, à re-observer en run réel.

### R1-B02 — Recap post-cancel omet le rappel récurrent encore actif

- **Bug id**: R1-B02
- **Tours**: T15
- **Famille**: `BF-STATUS-02` (historique / recap incomplet)
- **Domaine owner**: projection de statut/recap des rappels (`normal_reply` recap ; status projection one_shot + recurring)
- **Source amont**: la génération du recap « ce qu'il me reste de programmé » après un cancel de one-shot dérive vers les **items de plan** au lieu de repartir de l'inventaire des **rappels actifs** (le récurrent `1f05be22` 09:00 est omis).
- **Symptôme visible**: après cancel du one-shot 20:00, Sophia liste « noter l'heure de coucher réelle » + « carnet de décharge » (items de plan) et omet le rappel récurrent 09:00 toujours actif → risque de croire que tous les rappels sont éteints.
- **Preuve système**: T15 `executed_tools=[cancel_one_shot_reminder]`, `committed_effects=[ids: 27ea4199]` ; DB post-tour : `27ea4199=cancelled`, `user_recurring_reminders 1f05be22=active`, 0 autre pending. Le récurrent actif n'apparaît pas dans le recap visible. Contraste : T11 (même run) listait correctement le récurrent.
- **Correction attendue**: un recap « ce qu'il me reste » consécutif à un cancel de rappel doit d'abord énumérer les rappels/checkins **actifs restants** (récurrents inclus) depuis l'inventaire réel, avant tout glissement vers les items de plan.
- **Tests requis**:
  - positif: cancel d'un one-shot puis « redis-moi ce qu'il me reste de programmé » → cite le(s) rappel(s) récurrent(s) encore actif(s).
  - anti-faux-négatif: jamais présenter un inventaire vide/plan-only quand un récurrent est actif.
  - projection: recap en heure locale, sans phantom.
- **Statut**: `fix_applied`
- **Fix reference**: fix_applied (P8-G, 2026-07-14) — double fix (context/loader.ts): (1) le gate d'injection du bloc récurrents couvre les formes d'inventaire sans le mot « rappel » (« programmé », « de prévu », « relance ») — le recap post-cancel « redis-moi ce qu'il me reste de programmé » réinjecte le bloc; (2) doctrine ÉTAT DURABLE: un recap post-annulation répond D'ABORD depuis l'inventaire rappels/check-ins actifs (ponctuels + récurrents) avant tout glissement vers les items du plan. Probe P8-7 live: cancel one-shot puis recap → le récurrent 09:00 seedé reste cité.

## Re-checks de reds ouverts (14/07) — NON reproduits ce run

| Red source | Famille | Contenu neuf | Résultat |
| --- | --- | --- | --- |
| untested22 T10 (ce matin) | BF-LEDGER-02 | track composite 2 dates (carnet, dim+lun) | **NON reproduit** — ledger committed 2 ET message cite les 2 dates (12/07+13/07). Écart untested22 était sur **3 dates** → piste : désync composer↔ledger au-delà de 2 occurrences ou flaky. |
| untested22 T2 (ce matin) | BF-MEMORY-01 (confabulation) | recall incertain « matin ou soir ? » (T14) | **NON reproduit** — extraction stocke l'incertitude en `candidate` (« il ne sait plus s'il avait dit… »), pas de fait affirmatif fabriqué. |
| safety-escalation T5 | BF-SAFETY-01 | safety medium T13 (préemption lanes) | **NON reproduit** — préemption correcte, aucun side-effect pendant medium. |

## Notes

- Run techniquement valide (15/15 HTTP 200, traces persistées, effets vérifiés DB, memorizer scopé Alex, état restauré à la baseline exacte).
- Aucun bug red. Les deux yellow ci-dessus sont des frictions de technique-adéquation (T7) et de complétude de statut (T15), sans effet durable faux ni safety ratée.
