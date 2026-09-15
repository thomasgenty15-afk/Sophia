# Bug Sheet — bridge-potions-repair-r2

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, 2 runs QA conversationnels pilotés tour par tour. Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-03-bridge-potions-repair-r2.md`.

## R2-B01 — Consentement clarté non consommé après suggestion demotivation

- Tours: Run A T3-T4
- Famille: `BF-STATE-02`
- Domaine owner: `demotivation_repair` bridge runtime + orientation/tool skill handoff.
- Source amont: absence ou perte d'un pending/bridge state consentable entre proposition de potion et `select_state_potion`.
- Symptôme visible: le user accepte `potion de clarté`, puis corrige explicitement qu'il ne veut pas alléger une action; Sophia repropose encore la potion au lieu d'entrer dans le flow.
- Preuve système: T3/T4 `selected_handler="demotivation_repair"`, `tool_execution="none"`, `executed_tools=[]`, aucun `select_state_potion`.
- Correction attendue: quand `demotivation_repair` propose `clarte`, créer un bridge consentable avec `potion_kind="clarte"` et `handoff_summary`; le consentement suivant doit résoudre vers `select_state_potion`.
- Statut: `open`
- Fix reference: R2 confirme que la taxonomie/prompt améliore la suggestion mais ne suffit pas sans state/handoff runtime.
- Tests requis: positif perte de sens -> suggestion `clarte` -> "oui" -> `select_state_potion`; correction user après mauvaise reformulation -> récupération; anti-faux-positif "modifier les actions" -> plan/adjust, pas clarté.

## R2-B02 — Emotional repair répond en posture méta au lieu de soutenir l'émotion

- Tours: Run B T1-T2
- Famille: `BF-INTAKE-06`
- Domaine owner: `emotional_repair`.
- Source amont: prompt/intake trop focalisé sur "ne pas lancer d'outil" et pas assez sur le support conversationnel avant maturité.
- Symptôme visible: Sophia répète presque la même phrase ("Je reste avec toi...") sans refléter la phrase froide ni soutenir le besoin de chaleur.
- Preuve système: T1/T2 `selected_handler="emotional_repair"`, `opportunity="none"`, aucun outil; réponse visible quasi identique.
- Correction attendue: garder la temporalité "repair d'abord", mais produire une vraie réponse de réparation émotionnelle: reflet précis, validation, micro-question ou micro-appui avant toute potion.
- Statut: `open`
- Fix reference: R2, emotional vers amour.
- Tests requis: froid envers soi -> réponse soutien précise; répétition/slot émotionnel -> pas de phrase méta dupliquée; pas de potion immédiate avant stabilisation.

## R2-B03 — Bridge amour atteint le tool skill mais cible/payload non vérifiables

- Tours: Run B T3-T4
- Famille: `BF-STATE-02`
- Domaine owner: active skill bridge payload + `select_state_potion` intake/trace.
- Source amont: payload de handoff insuffisamment porté ou insuffisamment exposé après orientation clarification.
- Symptôme visible: Sophia propose "choisir une potion" sans nommer `amour`; après consentement explicite, le sous-skill demande "comment tu te sens" sans montrer qu'il a reçu chaleur/douceur/amour comme contexte.
- Preuve système: T4 `selected_handler="select_state_potion"`, `tool_execution="platform_handoff"`, mais trace courte sans `potion_kind`, `handoff_summary` ou operation input observable.
- Correction attendue: pendant `emotional_repair`, les signaux chaleur/douceur envers soi doivent privilégier `amour`; le handoff doit porter et tracer `potion_kind="amour"` avec résumé contextuel.
- Statut: `open`
- Fix reference: R2 améliore R1-B04 car plus de drift `product_help`, mais le bridge payload reste à compléter.
- Tests requis: douceur/chaleur envers soi stabilisée -> suggestion `amour`; consentement -> `select_state_potion(amour)` avec `handoff_summary`; anti-faux-positif demande générale "où trouver les potions dans l'app ?" -> `product_help`.
