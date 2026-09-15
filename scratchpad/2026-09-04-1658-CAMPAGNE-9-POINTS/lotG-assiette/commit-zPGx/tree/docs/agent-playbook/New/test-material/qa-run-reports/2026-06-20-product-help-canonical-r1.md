# QA Run Report - Product Help Canonical R1

## 1. Context

- Date: 2026-06-20, Europe/Paris.
- Run id: `product_help_canonical_20260620_r1`.
- Persona / scenario: temp QA connection `product_help_canonical_product_help_canonical_20260620_r1`.
- User id: `ad612a87-041d-40e8-9a92-193deb7e8a51`.
- Surface cible: `product_help` local / product questions / active ownership.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun appel direct executor.
- Validite QA: valide. Les messages ont ete choisis tour par tour apres lecture de la reponse et des traces courtes.
- Artefacts: `tests/real-personas/qa-skill/runs/product_help/product_help_canonical_20260620_r1.t01..t06.*.json`.
- DB snapshot: `tests/real-personas/qa-skill/runs/product_help/product_help_canonical_20260620_r1.db_after_t06.json`.
- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-20-product-help-canonical-r1-bugs.md`.

## 2. Tours

### T1 - Question produit canonique

- User: difference entre ajuster un plan et preparer une carte d'attaque.
- Assistant: explique correctement la difference entre plan a corriger et carte d'attaque a preparer.
- Trace courte: `response_owner=product_help`, `selected_handler=product_help`, `reason_code=product_help_signal`, `skill_run.status=complete`, `committed=0`.
- Verdict: green.
- Notes: Product Help repond bien en inline, sans effet durable.

### T2 - Follow-up produit ambigu mais non operationnel

- User: "si je veux juste me debloquer maintenant sans toucher au plan, c'est lequel ?"
- Assistant: demande si c'est une action de plan, hors plan, ou un etat emotionnel.
- Trace courte: `response_owner=coaching_recommendation`, `selected_handler=coaching_recommendation`, `reason_code=coaching_recommendation_signal`, `skill_run.status=continue`.
- Verdict: red.
- Bug family: `BF-ROUTE-03` / `BF-ROUTE-01`.
- Pourquoi: le tour reste une demande de recommandation produit entre surfaces Sophia. Le bon comportement attendu etait Product Help ou une recommandation produit explicite, pas l'ouverture durable de `coaching_recommendation`.

### T3 - Question produit explicite + demande de rappel

- User: question produit sur modification d'une carte d'attaque + rappel demain 9h.
- Assistant: repond a la question, puis dit qu'il ne peut pas poser le rappel de facon fiable dans ce chat.
- Trace courte: `response_owner=normal_reply`, `reason_code=coaching_recommendation_exit_to_global`, `skill_run.selected_skill_id=coaching_recommendation`, `skill_run.status=exit`, `exit_target=global`, `committed=0`.
- Verdict: red.
- Bug family: `BF-ROUTE-02`.
- Notes: pas de faux commit durable observe (`committed=0` et le visible ne dit pas "c'est fait"). Mais la demande produit explicite n'est pas reprise par Product Help, car l'ancien flow actif sort vers global au lieu de liberer proprement la main.

### T4 - Retour explicite a une question produit

- User: "Je reviens juste a une question produit..." sur carte d'attaque vs plan.
- Assistant: repond correctement que c'est separe.
- Trace courte: `response_owner=normal_reply`, `reason_code=coaching_recommendation_exit_to_global`, `skill_run.selected_skill_id=coaching_recommendation`, `skill_run.status=exit`.
- Verdict: red systeme malgre visible utile.
- Bug family: `BF-ROUTE-02`.
- Pourquoi: l'ancien flow `coaching_recommendation` continue d'intercepter un tour produit autonome.

### T5 - Stop explicite

- User: stop, arreter la recommandation, revenir a zero.
- Assistant: "Compris, on revient a zero."
- Trace courte: `response_owner=normal_reply`, `reason_code=coaching_recommendation_exit_to_global`, `skill_run.status=exit`.
- Verdict: yellow/red.
- Bug family: `BF-STATE-01` / `BF-ROUTE-02`.
- Pourquoi: le stop visible semble correct, mais la DB apres T6 montre encore `__active_skill_state.status=active`, `skill_id=coaching_recommendation`.

### T6 - Question produit seulement

- User: "Question produit seulement : ou retrouver une carte d'attaque..."
- Assistant: redemande action de plan / hors plan / etat emotionnel.
- Trace courte: `response_owner=coaching_recommendation`, `selected_handler=coaching_recommendation`, `reason_code=active_coaching_recommendation`, `skill_run.status=continue`.
- Verdict: red.
- Bug family: `BF-ROUTE-02`.
- Pourquoi: capture evidente d'une nouvelle intention produit par un ancien flow actif.

## 3. Human Fluidity

- T1 est fluide et utile.
- T2 casse l'experience: le user demande "lequel" dans la suite d'une explication produit, Sophia bascule en questionnaire de coaching.
- T3/T4 donnent des reponses visibles partiellement utiles, mais le systeme ne montre pas le bon owner. Cela rend les transitions instables et masque le vrai probleme.
- T5 est humainement acceptable, mais n'a pas l'effet systeme attendu: l'ancien flow reste actif.
- T6 est la rupture la plus nette: "Question produit seulement" recoit une clarification coaching hors sujet.

## 4. System Analysis

### Ce qui tient

- Product Help fonctionne sur activation initiale explicite: T1 route correctement vers `product_help`.
- Aucun effet durable faux n'a ete commite: `effect_ledger.counts.committed=0` sur tous les tours.
- Le rappel T3 n'est pas faussement confirme. La formulation visible est discutable pour Sophia, mais elle ne ment pas sur un commit.

### Ce qui casse

- `coaching_recommendation` est ouvert a T2 sur un message qui aurait du rester Product Help ou recommandation produit non durable.
- Les sorties `skill_run.status=exit`, `exit_target=global` sur T3/T4/T5 ne suffisent pas a liberer l'active state.
- Snapshot DB apres T6:
  - `temp_memory.__active_skill_state.status=active`
  - `skill_id=coaching_recommendation`
  - `working_state.coaching_recommendation_local_state.last_visible_task_kind=change_confirm_coaching_type`
  - `user_need_summary` mute jusqu'a la question produit T6.
- Cela indique une divergence entre la trace de sortie et la persistence de l'ownership actif.

### Observabilite

- Les traces utiles sont presentes dans les reponses endpoint et les fichiers raw/summary.
- La table REST `conversation_turn_traces` retourne 0 ligne pour ce user apres le run.
- Une tentative de select avec `effect_ledger` retourne `400`, colonne absente. Ce point est classe observabilite/testability, pas cause fonctionnelle principale.

### Hypothese racine

- Source amont principale: active flow arbitration / reducer ou persistence de `active_skill_state` pour `coaching_recommendation`.
- Product Help n'est pas directement le seul fautif: il est correctement selectionne en T1, mais il ne peut plus reprendre apres capture et sticky state d'un autre local flow.
- Correction attendue: une sortie locale `exit_to_global_dispatcher` / `stop_local_no_handoff` doit produire une mutation runtime qui clear ou suspend explicitement l'active state, puis laisser le prochain tour etre arbitre normalement. Un ancien flow ne doit pas continuer a capter une question produit autonome.

## Global Verdict

RED.

Raison principale: le flow Product Help fonctionne au premier tour, mais le run revele une capture durable par `coaching_recommendation` et une persistence d'active state incompatible avec les sorties declarees. Cela casse l'ownership local et empeche Product Help de reprendre des questions produit explicites.

Rerun requis apres correction: oui, avec au minimum T1 product question, T2 follow-up "sans toucher au plan", T3 question produit explicite, T4 stop/exit, T5 nouvelle question produit, et une lecture DB `user_chat_states.temp_memory.__active_skill_state`.
