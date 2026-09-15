# Bug Sheet — defense-single-field-runs-r1

## Contexte

- Date: 2026-06-03
- Run: `defense-single-field-r1` + `defense-uncertain-single-field-rerun-r1`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-03-defense-single-field-runs-r1.md`
- Statut global: `red`

## Bugs

### R1-B01 — Ambiguïté attaque/défense ignorée

- Tours: B1
- Famille: `BF-INTAKE-04` — ambiguïté non reconnue
- Domaine owner: routing / orientation clarification
- Source amont: `turn_intent_arbitrator` et `shouldBypassOrientationClarificationForExplicitToolRoute`
- Symptôme visible: le user dit ne pas savoir s'il lui faut attaque ou défense, mais Sophia livre directement un handoff défense.
- Preuve système: `turn_frame.tool_skill_intents` contient `prepare_attack_card` et `prepare_defense_card`; `route_reason=central_arbitrator_defense_card_structured_intent`; `response_owner=tool_skill`.
- Correction attendue: deux intents carte concurrents doivent router vers `orientation_clarification`, avec les deux candidats conservés pour que `clarification_tool` demande le choix métier.
- Statut: `verified`
- Fix reference: tests `L3 asks clarification when attack and defense card intents compete` et `competing attack and defense card routes do not bypass orientation clarification`
- Verification: QA reel `defense-ambiguous-clarification-r2` tour 1 retourne `response_owner=orientation_clarification`, `selected_handler=orientation_clarification`, `tool_execution=none`, `executed_tools=[]`.
- Tests requis: positif competing intents -> clarification; anti-faux-positif défense explicite seule -> handoff; apply_attempt après handoff -> non-mutant.

### R1-B02 — Handoff mono-champ encore trop formulaire en contexte ambigu

- Tours: B1
- Famille: `BF-INTAKE-04` — ambiguïté non reconnue
- Domaine owner: orientation clarification avant renderer
- Source amont: même mauvais owner que R1-B01
- Symptôme visible: le rendu `Question : valeur` paraît robotique parce qu'il arrive avant que le user ait choisi défense.
- Preuve système: pas de bug renderer sur demande explicite A1; le problème apparaît quand le handoff est prématuré.
- Correction attendue: ne pas rendre le handoff en contexte ambigu; commencer par clarification attaque/défense.
- Statut: `verified`
- Fix reference: même correction que R1-B01.
- Verification: QA reel `defense-ambiguous-clarification-r2` ne rend aucun handoff au tour incertain; le handoff mono-champ apparait seulement apres choix explicite defense au tour 2.
- Tests requis: QA réel incertain doit produire une clarification avant tout handoff.
