# Chantiers Log

Append-only. Ce document tient le journal des **chantiers** déclenchés par les
runs QA. Un chantier = une intervention chirurgicale sur le code (un ou
plusieurs fichiers) qui répond à un bug ou une famille de bugs observée dans un
rapport de run.

Ce document est différent de :

- `07-decision-log.md` — décisions produit/architecture durables qui survivent
  au contexte d'une conversation.
- `runtime-contracts/00-architecture-doctrine.md` — doctrine architecturale
  stable (principes, couches L1-L6, règles par couche, contrats des
  Tool/Conversation Skills).
- `01-qa-run-report-structure.md` — structure attendue des rapports de run.

Pourquoi un journal séparé. Le doc architecture devait rester court, lisible et
doctrinal. Les chantiers grossissent au fil des runs et noyaient les principes
dans des détails de fix. On les sort ici, le doc architecture pointe vers eux
quand un exemple est utile.

## Convention d'entrée

Chaque chantier doit citer :

- le ou les runs déclencheurs (`A4-r6 T7`, `A2-codex-r6 T9`, …) ;
- la **couche du pipeline** touchée (L1 / L3 / L4 / L5 / L6, voir
  `runtime-contracts/00-architecture-doctrine.md`) ;
- la **décision** prise (1 paragraphe) ;
- les **fichiers** modifiés ;
- les **tests** ajoutés (toujours au moins un test de régression cité par tour)
  ;
- les **limites connues** et le hors-scope.

Si une garde transitionnelle est ajoutée à L3 ou L4, elle DOIT inclure un
**critère de suppression** (quel run QA + quels signaux permettent de
l'enlever).

---

## J78 — BF-SAFETY-01 contextual safety renderer

Runs declencheurs. `safety_crisis` R2 du 2026-06-02, tour T2 : apres avoir dit
que les medicaments avaient ete donnes a une voisine et que la soeur etait au
telephone, la reponse visible relancait une checklist generique d'eloignement.

Couche. L5 conversation skill `safety_crisis` : garde-fous safety, renderer,
tests et contrat runtime.

Decision. Les regex safety restent limitees a des garde-fous non metier :
elles peuvent reconnaitre une preuve stabilisante comme des moyens donnes ou
confies a quelqu'un, mais ne choisissent pas de skill, d'intention, de phase
directe ou de resolution. Le renderer safety ne doit plus fonctionner comme une
table de phrases completes par phase ; il compose une reponse depuis les
signaux structures et le working state, reconnait les gestes deja faits, puis
pose seulement le prochain point safety utile.

Fichiers modifies.

- `docs/agent-playbook/New/runtime-contracts/conversation-skills/safety-crisis.md`
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`
- `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-02-safety-crisis-r2-bugs.md`
- `supabase/functions/sophia-brain/skills/safety_crisis/renderer.ts`
- `supabase/functions/sophia-brain/skills/safety_crisis/signals.ts`
- `supabase/functions/sophia-brain/skills/skills_s3.test.ts`

Tests ajoutes. Regression `BF-SAFETY-01` dans `skills_s3.test.ts` :
medicaments donnes a la voisine + soeur au telephone conserve le flow safety,
marque les moyens hors de portee et l'appui humain, et interdit les formulations
`Eloigne d'abord`, `Pose ou eloigne`, `reponds seulement` et `mode securite`.

Tests lances.

- `deno test --allow-env --allow-net --allow-read --filter "safety_crisis" supabase/functions/sophia-brain/skills/skills_s3.test.ts`
  : 5 verts.
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/final_response_pipeline_test.ts`
  : 10 verts.
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`
  : 83 verts.
- `deno check supabase/functions/sophia-brain/skills/safety_crisis/skill.ts supabase/functions/sophia-brain/skills/safety_crisis/contract.ts supabase/functions/sophia-brain/skills/safety_crisis/signals.ts supabase/functions/sophia-brain/skills/safety_crisis/intake.ts supabase/functions/sophia-brain/skills/safety_crisis/reducer.ts supabase/functions/sophia-brain/skills/safety_crisis/renderer.ts supabase/functions/sophia-brain/router/safety_crisis_runtime.ts`
  : vert.

Limites restantes. Le rerun QA reel via `/functions/v1/test-send-message` avec
`force_full_ai=true` reste requis pour valider l'intake IA en bout en bout. Les
ressources d'urgence restent deterministes ; le chantier ne transforme pas le
renderer en appel IA.

---

## J77 — Active handoff arbitration and product surface registry

Runs declencheurs. Chantier produit du 2026-06-01 : stabiliser les suites de
handoff apres transformation des complex tools en `platform_handoff`, et
centraliser leurs destinations produit.

Couche. L3/L4 orchestration, Product Surface Registry, renderers handoff L5.

Decision. Une policy commune `handoff_flow_arbitration` arbitre les tours quand
un handoff plateforme est actif : continuer le handoff (`revise_handoff`,
`repeat_handoff`, `apply_attempt`), sortir vers une intention explicite
one-shot/progress/status/safety, demander clarification ou clear le handoff.
La policy ne remplit aucun slot metier et ne declenche aucune execution. Les
destinations produit sont lues depuis `product_surface_registry` via
`getHandoffTargetForOperation`; les renderers gardent seulement des fallbacks
generiques.

Fichiers modifies.

- `docs/agent-playbook/New/runtime-contracts/08-product-surface-registry.md`
- `docs/agent-playbook/New/runtime-contracts/tools/prepare-attack-card.md`
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`
- `supabase/functions/sophia-brain/product_surface_registry/contract.ts`
- `supabase/functions/sophia-brain/product_surface_registry/registry.ts`
- `supabase/functions/sophia-brain/product_surface_registry/surfaces.json`
- `supabase/functions/sophia-brain/product_surface_registry/surfaces_data.ts`
- `supabase/functions/sophia-brain/router/handoff_flow_arbitration.ts`
- `supabase/functions/sophia-brain/router/run.ts`
- `supabase/functions/sophia-brain/router/active_flow_state.ts`
- `supabase/functions/sophia-brain/router/turn_agenda.ts`
- `supabase/functions/sophia-brain/router/turn_interruption_policy.ts`
- `supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts`
- handoff renderers/generators/routers sous `tools/operations/*`.

Tests ajoutes. `handoff_flow_arbitration_test.ts`,
`product_surface_registry_test.ts` et `handoff_renderer_registry_test.ts`
couvrent les continuations, interruptions, ambiguite, mappings registry,
operations non-handoff et destinations canoniques dans les renderers.

Tests lances.

- `/usr/local/bin/deno check supabase/functions/sophia-brain/router/handoff_flow_arbitration.ts supabase/functions/sophia-brain/router/run.ts supabase/functions/sophia-brain/router/turn_agenda.ts supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts supabase/functions/sophia-brain/product_surface_registry/contract.ts supabase/functions/sophia-brain/product_surface_registry/registry.ts supabase/functions/sophia-brain/tools/operations/handoff_renderer_registry_test.ts`
  : vert.
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/handoff_flow_arbitration_test.ts supabase/functions/sophia-brain/product_surface_registry/product_surface_registry_test.ts supabase/functions/sophia-brain/product_surface_registry/registry.test.ts supabase/functions/sophia-brain/tools/operations/handoff_renderer_registry_test.ts`
  : 33 verts.
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/operation_runtime_pipeline_test.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/handoff_runtime_test.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff_test.ts supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/tests.ts supabase/functions/sophia-brain/tools/operations/prepare_attack_card/tests.ts supabase/functions/sophia-brain/tools/operations/prepare_defense_card/tests.ts supabase/functions/sophia-brain/tools/operations/update_coach_preferences/tests.ts`
  : 99 verts.
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tool_skill_runtime/operation_suggestion_resolver_test.ts supabase/functions/sophia-brain/recommendation/recommendation_tool.test.ts`
  : 9 verts.

Limites restantes. QA reelle via `/functions/v1/test-send-message` a relancer
sur Supabase local pour verifier les traces end-to-end avec dispatcher L1 reel.
Tentative locale du 2026-06-01 bloquee car le CLI `supabase` n'est pas present
dans le PATH de cette session. La clarification active-handoff route vers
`orientation_clarification`; l'appel outille avec candidats peut encore etre
affine pour les candidats cross-skill.

---

## J76 — prepare_attack_card platform handoff owner

Runs declencheurs. Chantier produit du 2026-06-01 : transformer
`prepare_attack_card` depuis un tool flow executable vers un coaching handoff
proprietaire, sans perdre l'intake structure, le choix de technique, le binding
cible/action, la generation de draft ni le state multi-tour.

Couche. L5 tool skill, L4 operation runtime pipeline, renderer no-mutation.

Decision. `prepare_attack_card` ne passe plus par le handoff generique global :
le skill reste owner de son domaine et produit un `platform_handoff` riche avec
draft, destination `Cartes / Attaque`, et state actif continuable. Les demandes
d'application type "ok cree-la" deviennent `apply_attempt` non-mutant. Aucun
confirmation token, executor, writer DB ou `committed_effect` n'est produit par
le chemin runtime nominal.

Fichiers modifies.

- `docs/agent-playbook/New/runtime-contracts/tools/prepare-attack-card.md`
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`
- `supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts`
- `supabase/functions/sophia-brain/router/operation_runtime_pipeline_test.ts`
- `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/ai_intake.ts`
- `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/contract.ts`
- `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/executor.ts`
- `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/renderer.ts`
- `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/router.ts`
- `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/slot_filler.ts`
- `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/state.ts`
- `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/test_helpers.ts`
- `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/tests.ts`
- `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/prepare_attack_card_fallback_test.ts`

Tests ajoutes. Tests unitaires couvrant le renderer complet, absence de pending
executable, `apply_attempt` non-mutant, `repeat_handoff`, `revise_handoff`,
no-create/draft-only, et approval legacy converti en handoff.

Tests lances.

- `/usr/local/bin/deno check supabase/functions/test-send-message/index.ts supabase/functions/sophia-brain/router/run.ts supabase/functions/sophia-brain/tools/operations/prepare_attack_card/router.ts supabase/functions/sophia-brain/tools/operations/prepare_attack_card/tests.ts supabase/functions/sophia-brain/router/operation_runtime_pipeline_test.ts`
  : vert.
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/prepare_attack_card/tests.ts supabase/functions/sophia-brain/tools/operations/prepare_attack_card/prepare_attack_card_fallback_test.ts supabase/functions/sophia-brain/router/operation_runtime_pipeline_test.ts`
  : 44 verts.

QA reelle. `supabase start` local relance via Docker. Scenario ambigu
product_help vs preparation : vert, owner `orientation_clarification`, aucun
executor. Le scenario de handoff direct a d'abord montre un mauvais raccord
`orientation_clarification_resolved -> normal_reply`, corrige dans `run.ts`.
Apres correction, le endpoint local retourne encore
`502 upstream prematurely
closed connection` sur le tour de handoff, malgre
`deno check` vert; la connexion temporaire QA creee pour ce run a ete nettoyee.

Limites restantes. Relancer le run reel complet quand l'Edge Runtime local ne
renvoie plus 502 sur `test-send-message`. Aucune commande DB destructive large
lancee; seul le nettoyage cible de la connexion QA temporaire du run a ete
effectue.

---

## J75 — prepare_defense_card platform handoff

Runs declencheurs. Chantier produit du 2026-06-01 : transformer
`prepare_defense_card` depuis un tool flow executable vers un flow de coaching
et handoff plateforme.

Couche. L4/L5 operation runtime pipeline, router local du skill, contrat runtime
et renderer.

Decision. `prepare_defense_card` garde l'intake structure, le target/action
binding, l'analyse du risque, le choix de strategie et la generation de
brouillon, mais supprime le terminal operationnel depuis le chat. Le succes
nominal est un `platform_handoff` continuable avec `no_chat_mutation=true`,
`executedTools=[]`, `committed_effects=[]`, sans confirmation token, sans
executor et sans writer `user_defense_cards`. `apply_attempt` repete la
destination plateforme au lieu d'executer.

Fichiers modifies.

- `docs/agent-playbook/New/runtime-contracts/tools/prepare-defense-card.md`
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`
- `supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts`
- `supabase/functions/sophia-brain/router/turn_agenda.ts`
- `supabase/functions/sophia-brain/tools/operations/prepare_defense_card/contract.ts`
- `supabase/functions/sophia-brain/tools/operations/prepare_defense_card/ai_intake.ts`
- `supabase/functions/sophia-brain/tools/operations/prepare_defense_card/slot_filler.ts`
- `supabase/functions/sophia-brain/tools/operations/prepare_defense_card/router.ts`
- `supabase/functions/sophia-brain/tools/operations/prepare_defense_card/renderer.ts`
- `supabase/functions/sophia-brain/tools/operations/prepare_defense_card/tests.ts`

Tests ajoutes. `prepare_defense_card/tests.ts` couvre le renderer handoff
complet, l'absence de confirmation token/executor/writer dans le router, le
draft-only/no-create non executable, `apply_attempt` non mutant,
`repeat_handoff` sur "redis-moi" et le wording no-mutation avec destination
plateforme.

Tests lances.

- `/usr/local/bin/deno test --allow-env --allow-net --allow-read
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/tests.ts`
  : 22 verts.
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read
  supabase/functions/sophia-brain/router/operation_runtime_pipeline_test.ts`
  : 4 verts.

Limites restantes. Les runs QA reels via Supabase local et
`/functions/v1/test-send-message` avec `force_full_ai=true` restent a executer.
Les fichiers legacy `executor.ts` et `persistence.ts` existent encore pour
compatibilite historique, mais ne sont plus appeles par le router nominal
`prepare_defense_card`.

---

## J75 — Recurring reminder platform handoff

Runs declencheurs. Chantier produit du 2026-06-01 : transformer
`create_recurring_reminder` depuis un flow de creation executable en handoff
plateforme non-mutant.

Couche. L4/L5 operation runtime, Tool Skill recurring reminder, renderer et
tests de contrat.

Decision. Le skill conserve l'intake structure cadence/jours/heure/contenu, les
contraintes `draft_only` / `no_create`, la distinction recurring vs one-shot et
l'etat multi-tour. Il ne produit plus de pending confirmation executable, ne
cree plus de confirmation token, n'appelle plus l'executor et n'ecrit plus dans
`user_recurring_reminders`. Le resultat nominal est `platform_handoff` avec
`no_chat_mutation=true`, `executedTools=[]` et `committed_effects=[]`. Une
clarification one-shot sort proprement vers le proprietaire one-shot.

Fichiers modifies.

- `docs/agent-playbook/New/runtime-contracts/tools/create-recurring-reminder.md`
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`
- `supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts`
- `supabase/functions/sophia-brain/router/turn_agenda.ts`
- `supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/contract.ts`
- `supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/generator.ts`
- `supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/intake.ts`
- `supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/renderer.ts`
- `supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/router.ts`
- `supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/state.ts`
- `supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/tests.ts`

Tests ajoutes. `create_recurring_reminder/tests.ts` couvre le renderer handoff
complet, l'absence de pending confirmation/token/writer, `apply_attempt`
non-mutant, `repeat_handoff`, `revise_handoff`, `draft_only/no_create`, sortie
one-shot et ambiguite one-shot vs recurring.

Tests lances.

- `/usr/local/bin/deno check supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/contract.ts supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/state.ts supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/intake.ts supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/generator.ts supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/router.ts supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/renderer.ts supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts`
  : vert.
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/tests.ts supabase/functions/sophia-brain/router/operation_runtime_pipeline_test.ts`
  : 12 verts.

Limites restantes. Les runs QA reels via Supabase local restent a lancer. Les
fichiers legacy `executor.ts` et `persistence.ts` existent encore mais ne sont
plus importes par le router recurring handoff.

Addendum QA reelle. Une tentative locale via `/functions/v1/test-send-message`
avec connexion temporaire `qa-skill/recurring_handoff_20260601` a ete nettoyee.
Le chemin L5 corrige fonctionne quand le dispatcher fournit
`tool_skill_intents.operation_input`, mais le run direct est reste rouge en L1/L3
: `route_decision.reason_code=orientation_clarification_resolved`,
`selected_handler=normal_reply`, `tool_skill_intents=[]`, donc le router
recurring n'est pas appele et la reponse normale peut encore employer un wording
interdit. Ce point est hors terminal L5 recurring et doit etre repris cote
dispatcher/clarification arbitration.

## J74 — Platform handoff runtime category

Runs declencheurs. Chantier produit du 2026-06-01 : separer trois resultats
runtime aujourd'hui confondus (`durable_effect`, `clarification`,
`platform_handoff`), et eviter de representer un handoff plateforme comme un
effet bloque ou rate.

Couche. L2/L3/L4 orchestration, EffectLedger transversal, final guards et
operation runtime pipeline.

Decision. `platform_handoff` devient une categorie runtime canonique : Sophia
peut comprendre une intention complexe, clarifier, coacher et livrer une
redirection vers une surface produit sans creer/modifier depuis le chat. Les
operations complexes (`adjust_plan_item`, cartes, potion, rappel recurrent,
preferences coach) ne deviennent plus des effects executables par defaut. Les
effets chat executables restent limites a one-shot reminder, cancel one-shot et
track progress. `clarification` devient egalement une task agenda/ledger
non-mutante.

Fichiers modifies.

- `docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md`
- `docs/agent-playbook/New/runtime-contracts/03-user-turn-snapshot-agenda.md`
- `docs/agent-playbook/New/runtime-contracts/05-effect-ledger.md`
- `docs/agent-playbook/New/runtime-contracts/README.md`
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`
- `supabase/functions/sophia-brain/router/turn_agenda.ts`
- `supabase/functions/sophia-brain/router/turn_interruption_policy.ts`
- `supabase/functions/sophia-brain/router/run_turn_agenda.ts`
- `supabase/functions/sophia-brain/router/effect_ledger.ts`
- `supabase/functions/sophia-brain/router/effect_ledger_adapter.ts`
- `supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts`
- `supabase/functions/sophia-brain/router/turn_agenda.test.ts`
- `supabase/functions/sophia-brain/router/effect_ledger.test.ts`
- `supabase/functions/sophia-brain/router/effect_ledger_adapter_test.ts`
- `supabase/functions/sophia-brain/router/effect_ledger_integration_test.ts`
- `supabase/functions/sophia-brain/router/final_response_pipeline_test.ts`
- `supabase/functions/sophia-brain/router/operation_runtime_pipeline_test.ts`
- `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/adjust_plan_handoff_architecture_test.ts`
- `supabase/functions/sophia-brain/skills/status_recap/contract.ts`
- `supabase/functions/sophia-brain/skills/status_recap/effect_history.ts`

Tests ajoutes. `turn_agenda.test.ts` couvre les handoffs pour adjust plan,
attack card et recurring reminder, les direct effects qui restent executables,
la preemption par clarification, safety et l'interruption d'ancien flow.
`effect_ledger*.test.ts` couvre handoff/clarification comme entries non
mutantes, recommendation complexe -> handoff, absence de commit/executed tool,
et distinction durable blocked. `final_response_pipeline_test.ts` couvre le
wording handoff honnete autorise et le langage "fait/cree/modifie" bloque sans
commit. `operation_runtime_pipeline_test.ts` couvre l'absence d'appel executor
sur operation complexe et sur approval legacy.

Tests lances.

- `/usr/local/bin/deno test --allow-env --allow-net --allow-read
  supabase/functions/sophia-brain/router/turn_agenda.test.ts
  supabase/functions/sophia-brain/router/effect_ledger.test.ts
  supabase/functions/sophia-brain/router/effect_ledger_adapter_test.ts
  supabase/functions/sophia-brain/router/effect_ledger_integration_test.ts
  supabase/functions/sophia-brain/router/final_response_pipeline_test.ts
  supabase/functions/sophia-brain/router/operation_runtime_pipeline_test.ts`
  : 70 verts.
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read
  supabase/functions/sophia-brain/tools/operations/adjust_plan_item/adjust_plan_handoff_architecture_test.ts`
  : 3 verts.
- `/usr/local/bin/deno check
  supabase/functions/sophia-brain/router/turn_agenda.ts
  supabase/functions/sophia-brain/router/turn_interruption_policy.ts
  supabase/functions/sophia-brain/router/run_turn_agenda.ts
  supabase/functions/sophia-brain/router/effect_ledger.ts
  supabase/functions/sophia-brain/router/effect_ledger_adapter.ts
  supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts
  supabase/functions/sophia-brain/skills/status_recap/contract.ts
  supabase/functions/sophia-brain/skills/status_recap/effect_history.ts`
  : vert.
- Runs reels locaux via `/functions/v1/test-send-message` avec
  `force_full_ai=true` :
  - adjust plan ambigu : `tool_execution=platform_handoff`, `executed_tools=[]`,
    ledger `platform_handoff proposed` puis `delivered`, aucun commit, wording
    "Je ne le modifie pas depuis le chat" ;
  - carte d'attaque vs explication produit : `response_owner` et
    `selected_handler=orientation_clarification`, agenda `clarification asked`,
    ledger `clarification asked`, `executed_tools=[]`.

Limites restantes. Les runs QA reels restent a executer via Supabase local et
`/functions/v1/test-send-message` ont ete faits avec des users QA temporaires
locaux ; aucun cleanup destructif n'a ete lance. Aucune commande DB destructive
lancee ; aucun nouveau classifier regex metier ajoute pour choisir l'intention.

---

## J62 — Card tools persistence cycle helper

Runs declencheurs. Passe de nettoyage ciblee sur `prepare_attack_card` /
`prepare_defense_card` demandee le 2026-05-30.

Couche. L5 tool skills, persistence DB non user-facing.

Symptome architectural. Les deux persistences carte dupliquaient la meme
mecanique `user_cycles` : charger le dernier cycle user, sinon creer un cycle
draft hors plan avec le meme payload. Cette duplication etait technique, pas
metier, et rendait les deux writers plus longs sans clarifier leur ownership.

Fix reel. Extraction de
`tools/operations/_shared/operation_cycle.ts::ensureToolOperationCycle(...)`.
`prepare_attack_card/persistence.ts` conserve l'ecriture `user_attack_cards`;
`prepare_defense_card/persistence.ts` conserve l'ecriture `user_defense_cards`;
le helper partage ne possede ni draft, ni confirmation, ni renderer, ni effet
commite.

Fichiers modifies.

- `docs/agent-playbook/New/runtime-contracts/tools/prepare-attack-card.md`
- `docs/agent-playbook/New/runtime-contracts/tools/prepare-defense-card.md`
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`
- `supabase/functions/sophia-brain/tools/operations/_shared/operation_cycle.ts`
- `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/persistence.ts`
- `supabase/functions/sophia-brain/tools/operations/prepare_defense_card/persistence.ts`

Tests lances.

- `/usr/local/bin/deno fmt --check
  supabase/functions/sophia-brain/tools/operations/_shared/operation_cycle.ts
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/persistence.ts
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/persistence.ts
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/tests.ts
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/tests.ts`
  : vert.
- `/usr/local/bin/deno check
  supabase/functions/sophia-brain/tools/operations/_shared/operation_cycle.ts
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/persistence.ts
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/persistence.ts
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/router.ts
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/router.ts
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/tests.ts
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/tests.ts`
  : vert.
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/tests.ts
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/tests.ts`
  : 48 verts.
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/prepare_attack_card_fallback_test.ts
  supabase/functions/sophia-brain/tools/operations/prepare_defense_card/prepare_defense_card_fallback_test.ts`
  : 12 verts.
- `/usr/local/bin/deno check supabase/functions/sophia-brain/router/run.ts` :
  rouge hors perimetre, erreurs preexistantes d'import/declaration locale en
  conflit (`attachDynamicAddons`, `DEFAULT_DISPATCHER_MEMORY_PLAN`,
  `dispatcherSignalsFromTurnFrame`, etc.).

Limites restantes. Le reducer defense reste dans `router.ts` comme exception
documentee. Les duplications d'intake structurées entre attaque et defense
restent volontairement locales tant qu'elles portent des slots metier distincts.
Aucun nouveau fallback regex, aucun write DB hors executor/persistence
proprietaire, aucune commande destructive DB lancee.

---

## Chantier — 2026-05-30 — runtime contract turnagenda

Runs declencheurs. Suite du chantier `UserTurnSnapshot + TurnAgenda` : le code
introduit snapshot, agenda, policy d'interruption, integration EffectLedger et
blocage partiel des effects, mais le contrat runtime du domaine restait trop
vague pour guider un futur agent.

Couche. Documentation operationnelle L2/L3/L4 + contrats runtime globaux.

Symptome architectural. Le fichier
`runtime-contracts/03-user-turn-snapshot-agenda.md` ne citait pas les fichiers
reels, ne distinguait pas intake/reducer/effects/application/renderer, et
laissait croire que l'agenda etait seulement trace-only alors que `run.ts`
utilise deja `resolveFlowInterruptions`, filtre des effects bloques et appelle
`recordAgendaEffectsInLedger`.

Fix reel. Remplacement du contrat runtime du domaine par une version
operationnelle qui documente `router/user_turn_snapshot.ts`,
`router/turn_agenda.ts`, `router/turn_interruption_policy.ts`, `router/run.ts`,
`router/effect_ledger_adapter.ts`, `router/confirmation_contract.ts` et
`router/effect_ledger.ts`. La doc precise les responsabilites de TurnAgenda, ce
qui reste hors domaine, les invariants non negociables, les exceptions legacy et
les tests qui protegent le contrat.

Fichiers modifies.

- `docs/agent-playbook/New/runtime-contracts/03-user-turn-snapshot-agenda.md`
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`

Tests lances. Changement documentaire uniquement ; relance des tests
contractuels avec `/usr/local/bin/deno` car `deno` n'etait pas dans le `PATH` du
shell :

- `/usr/local/bin/deno test --allow-env --allow-net --allow-read
  supabase/functions/sophia-brain/router/user_turn_snapshot.test.ts
  supabase/functions/sophia-brain/router/turn_agenda.test.ts`
  : 10 verts.
- `/usr/local/bin/deno check
  supabase/functions/sophia-brain/router/user_turn_snapshot.ts
  supabase/functions/sophia-brain/router/turn_agenda.ts
  supabase/functions/sophia-brain/router/turn_interruption_policy.ts
  supabase/functions/sophia-brain/observability/trace_logger.ts`
  : vert.

Limites restantes. `RouteDecision` reste mono-owner et `run.ts` conserve des
guards L4 legacy ; TurnAgenda encadre et bloque certains effects mais ne possede
pas encore l'execution complete des workflows L5. Le durable state snapshot
reste minimal tant que les loaders dedies ne fournissent pas une projection
stable.

---

## Chantier — 2026-05-30 — runtime contract prepare_attack_card

Runs declencheurs. Revue architecture du domaine `prepare_attack_card` après la
migration ownership L5.

Couche. Documentation opérationnelle L5 + contrats runtime.

Symptome architectural. Le fichier
`runtime-contracts/tools/prepare-attack-card.md` ne décrivait pas assez le code
réel : séparation `draftReview`/pending exécutable, `committed_effects`,
`technical_blocked`, renderer dédié, persistence DB et dépendances
UserTurnSnapshot/TurnAgenda/ConfirmationContract/EffectLedger.

Fix réel. Remplacement du contrat runtime du domaine par une version
opérationnelle qui cite les fichiers et fonctions propriétaires : `contract.ts`,
`slot_filler.ts`, `ai_intake.ts`, `workflow.ts`, `router.ts`, `executor.ts`,
`persistence.ts`, `renderer.ts` et `run_support.ts`. La doc formalise les
responsabilités du skill, ce qui n'appartient pas au skill, les invariants non
négociables, les exceptions legacy temporaires et les tests de contrat.

Fichiers modifiés.

- `docs/agent-playbook/New/runtime-contracts/tools/prepare-attack-card.md`
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`

Tests lancés. Changement documentaire uniquement ; relance des tests domaine via
`/usr/local/bin/deno` car `deno` n'était pas dans le `PATH` du shell :

- `/usr/local/bin/deno test --allow-env --allow-net --allow-read
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/tests.ts`
  : 30 verts.
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/prepare_attack_card_fallback_test.ts`
  : 6 verts.
- `/usr/local/bin/deno check
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/router.ts
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/contract.ts
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/executor.ts
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/persistence.ts
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/renderer.ts`
  : vert.

Limites restantes. `run.ts` et `weekly_review/runtime.ts` restent en échec de
type-check global hors périmètre. Les exceptions legacy skill-local restantes
pour `prepare_attack_card` sont documentées dans le contrat runtime avec leurs
conditions de suppression.

---

## Chantier — 2026-05-29 — UserTurnSnapshot + TurnAgenda trace-only

Runs declencheurs. RED orchestration: route_owner unique, stale flows,
confirmation appliquee au mauvais pending, status/action et multi-intention mal
representes.

Couche. L2/L3/L4 orchestration, en trace-only pour cette premiere iteration.

Decision. Ajout d'un `UserTurnSnapshot` canonique pour figer l'etat du tour et
d'un `TurnAgenda` multi-taches pour representer les effets simultanes sans
supprimer `route_decision`. `run.ts` construit maintenant snapshot + agenda
apres routage/arbitrage et les expose dans les traces compactes
`turn_agenda_summary`. La politique d'interruption est isolee dans un module pur
testable, mais elle n'est pas encore branchee pour muter l'execution metier.

Fichiers modifies.

- `router/user_turn_snapshot.ts`
- `router/turn_agenda.ts`
- `router/turn_interruption_policy.ts`
- `router/user_turn_snapshot.test.ts`
- `router/turn_agenda.test.ts`
- `router/run.ts`
- `observability/trace_logger.ts`

Tests ajoutes. `router/user_turn_snapshot.test.ts` couvre capture flows actifs,
pending confirmation et contraintes explicites. `router/turn_agenda.test.ts`
couvre cancel+create reminder, status_only qui conserve status et bloque effets,
confirmation incompatible avec pending, vieux flow attack card interrompu par
reminder explicite, `no_potion`, `preview_only update_coach_preferences`,
status+action, et conservation des taches secondaires malgre un owner unique.

Limites connues. L'agenda est observe et teste, mais ne pilote pas encore
l'execution runtime. `run.ts` garde des gardes transitionnelles L3/L4
existantes. Le check de `router/run.ts` reste bloque par une duplication
preexistante `isRecord` hors perimetre.

Verification locale.

- `deno test --allow-env --allow-net --allow-read
  supabase/functions/sophia-brain/router/user_turn_snapshot.test.ts
  supabase/functions/sophia-brain/router/turn_agenda.test.ts`
- `deno check
  supabase/functions/sophia-brain/router/user_turn_snapshot.ts
  supabase/functions/sophia-brain/router/turn_agenda.ts
  supabase/functions/sophia-brain/router/turn_interruption_policy.ts
  supabase/functions/sophia-brain/observability/trace_logger.ts`
- `deno test --allow-env --allow-net --allow-read
  supabase/functions/sophia-brain/router/turn_intent_arbitrator.test.ts`

---

## Chantier — 2026-05-29 — prepare_attack_card ownership L5 finalisation

Runs declencheurs. Migration ownership L5 `prepare_attack_card`, rouges
draft-only/confirmation/stale flow.

Couche. L5 Tool Skill, avec adapter runtime final.

Decision. `prepare_attack_card` separe maintenant le brouillon consultable du
pending executable: `__pending_attack_card_draft_review` ne donne pas droit a un
commit DB, tandis que `__pending_tool_skill_confirmation` reste le seul etat
convertible en creation. Le premier tour `pending_confirmation` repasse par le
contrat/reducer: `draft_only` et `no_create` produisent `draft_ready`, jamais
une confirmation executable. Le resultat canonique porte `requested_effects`,
`allowed_effects`, `blocked_effects` et `committed_effects`; `executedTools` est
pose uniquement si `committed_effects.length > 0`.

Fichiers modifies.

- `tools/operations/prepare_attack_card/contract.ts`
- `tools/operations/prepare_attack_card/router.ts`
- `tools/operations/prepare_attack_card/executor.ts`
- `tools/operations/prepare_attack_card/persistence.ts`
- `tools/operations/prepare_attack_card/renderer.ts`
- `tools/operations/prepare_attack_card/run_support.ts`
- `tools/operations/prepare_attack_card/tests.ts`

Tests ajoutes. Le module couvre le draft-only initial sans pending executable ni
executed tool, le renderer draft/pending/executed/failed, les effets bloques par
`no_create`, l'approbation compatible, reject/revise/topic_change sans effet DB,
les contraintes `single_proposal` et le guard executor token.

Limites connues. `router/run.ts` conserve de la glue generique et des helpers
partages pour d'autres perimetres, mais `prepare_attack_card/router.ts` ne les
importe plus et ne depend plus de la comprehension metier de `run.ts`. Le check
global incluant `router/run.ts` reste bloque par des symboles manquants dans les
chantiers weekly/recommendation hors perimetre de cette intervention.

Verification locale.

- `deno test --allow-env --allow-net --allow-read
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/tests.ts`
- `deno check
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/router.ts
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/contract.ts
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/executor.ts
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/persistence.ts
  supabase/functions/sophia-brain/tools/operations/prepare_attack_card/renderer.ts`
- `deno test --allow-env --allow-net --allow-read
  supabase/functions/sophia-brain/router/turn_intent_arbitrator.test.ts`

---

## Chantier — 2026-05-29 — track_progress_plan_item direct effect

Runs declencheurs. Stabilisation interne `track_progress_plan_item` comme direct
effect always-on.

Couche. L4/L5 direct effect runtime.

Decision. `track_progress_plan_item` reste un direct effect minimal, pas un Tool
Skill multi-tour. Le module possede maintenant un contrat canonique et un router
leger qui convertit l'outcome bas niveau en `reply`, `executed_tools`,
`committed_effects`, `blocked_effects` et `debug.reason_code`. La reponse
"Note..." n'est produite que pour `status: "logged"` avec `logged_progress_id`;
tous les chemins non-logged restent sans executed tool et sans commit structure.

Fichiers modifies.

- `tools/always_on/track_progress_plan_item/contract.ts`
- `tools/always_on/track_progress_plan_item/db.ts`
- `tools/always_on/track_progress_plan_item/router.ts`
- `tools/always_on/track_progress_plan_item/track_progress_plan_item_tool.ts`
- `tools/always_on/track_progress_plan_item/track_progress_plan_item_tool_test.ts`
- `router/run.ts`

Tests ajoutes. Le test du module couvre completed/partial/missed avec valeurs
1/0.5/0, future intent, target hors plan, pending confirmation, duplicate source
message, duplicate DB, cible ambigue/manquante, statut manquant, status
question, contexte global no-mutation, blocage externe narrow
`attack_keyword_trigger_is_not_completion`, coexistence emotional repair, et les
invariants non-logged/no-note/no executed tool + logged avec
`logged_progress_id`.

Limites connues. Le writer DB V2 est maintenant dans le module
`track_progress_plan_item/db.ts`; `router/run.ts` ne contient plus le runtime du
direct effect et appelle seulement `maybeRunTrackProgressPlanItemRuntime`. Le
weekly forgotten progress passe par l'adapter contractuel
`runTrackProgressPlanItemFromWeeklyCorrection` avant commit. `magic_reset.ts`
nettoie la cle runtime canonique du module.

Verification locale.

- `deno test --allow-env --allow-net --allow-read
  supabase/functions/sophia-brain/tools/always_on/track_progress_plan_item/track_progress_plan_item_tool_test.ts`
  : 8 verts.
- `deno check` sur les fichiers du module track progress : vert.
- Baseline preexistante : `run_product_help_guard.test.ts` echoue au type-check
  sur recurring reminders / adjust plan / coach preferences avant ce chantier.

---

## Decision Log technique — 2026-05-28 (chantier 0)

Contexte. 4 runs QA (A2-r4, A3-r5, A4-r4, A6-r2) ressortent rouges malgré
l'ajout de `router/turn_intent_arbitrator.ts` par codex. Triage des 28 tours
rouges/jaunes consolidé.

Décisions prises.

1. Suppression des détecteurs `detectsHumanRecap` et `detectsHybridDurableRecap`
   dans `router/turn_intent_arbitrator.ts`. Raison : ils matchaient les mots
   `piege`/`honte`/`fragile` nus et écrasaient des décisions correctes du
   dispatcher (cas confirmé : A6-r2 T2). Impact : suppression de la régression
   visible ; aucune perte de fonctionnalité (composers `status_only` et
   `normal_reply` gèrent ces cas en aval).

2. Marquage des autres détecteurs (`detectsExplicitOneShotReminderCreate`,
   `detectsActiveToolCancellation`, `detectsDurableCoachPreference`,
   `detectsExplicitProductHelp`, `detectsExactDurableStatus`) comme
   **TRANSITIONNELS** dans le code, avec interdiction documentée d'en ajouter.
   Raison : ils violent le principe central mais leur retrait sec ferait
   régresser des tours actuellement verts. Ils doivent être remplacés par des
   few-shots dans le prompt du dispatcher au fur et à mesure.

3. Ajout d'une garde anti-faux-positif `looksLikeExplicitAttackCardRequest` dans
   `turn_intent_arbitrator.ts`. Tant qu'un détecteur transitionnel existe, cette
   garde court-circuite l'arbitre quand le user écrit une demande d'attack card
   structurée (verbe + « carte d'attaque » + marqueurs
   `Action:`/`Piège:`/`Signal:`/`Phrase:`). Défense en profondeur contre les
   régressions du type A6-r2 T2.

4. Correction du bug payload dans `rewriteForOneShotReminder` : `payload_hint`
   passe de `{}` à `{ raw_text: userMessage }`. Le runtime aval
   (`maybeCreateOneShotReminder`) a besoin du texte source pour extraire
   `scheduled_for` et l'instruction. Sans `raw_text`, le rappel n'est jamais
   créé alors que la route signale
   `central_arbitrator_one_shot_reminder_priority` (cas confirmé : A4-r4 T8/T9).

5. Tests de régression dans `router/turn_intent_arbitrator.test.ts` :
   `attack card request that contains 'piège'`,
   `attack card request that contains 'honte'`,
   `propagates raw_text in one_shot_reminder payload_hint`.

---

## Chantier 1 — Composer status_only : garde de format conversationnel (2026-05-28)

Couche. L5 (composer).

Contexte. ~6 tours rouges (A2-r4 T13/T14, A4-r4 T2/T14, A6-r2 T15) où le user
impose un format conversationnel explicite mais Sophia rend le panneau status
canonique à 4 lignes
(`Carte d'attaque / Carte de défense / Rappels /
Préférences coach`). Le bug est
en L5 (composer), pas en L3 : la route_decision était souvent correcte, mais le
runtime `buildStatusOnlyNoMutationRuntime` était déclenché avant que le composer
normal_reply ne puisse répondre.

Décisions.

1. Ajout de `isExplicitConversationalFormatRequestForTest` dans `router/run.ts`.
   Détecte les contraintes de format dures et explicites du user : séquence «
   fait, prévu, fragile », « en X lignes » / « X lignes max » / « X lignes, sans
   … » / début de phrase « X lignes … », « en une phrase » / « une seule phrase
   », « pas de panneau » / « sans panneau », « pas de statut système », « récap
   conversationnel ».

2. Pourquoi cette regex est légitime malgré la règle anti-sémantique. Cette
   détection ne porte pas sur l'**intention** (carte vs rappel vs préférence).
   Elle porte sur un **contrat de format** imposé par le user. La regex est
   volontairement étroite et accompagnée d'anti-faux-positifs explicites (titres
   de cartes, objets d'action).

3. `statusOnlyNoMutationRuntime` n'est plus produit si
   `isExplicitConversationalFormatRequestForTest(userMessage) === true`. La
   réponse passe par les composers aval (`normal_reply`).

4. Anti-faux-positifs documentés. La regex
   `(une|deux|trois|quatre|cinq|1|2|3|4|5)\s+ligne(s)?` exige un contexte sans
   ambiguïté : préposition `en`, suffixe `max/maximum/seulement`, virgule +
   `sans`, ou début de message. Sans cette contrainte, « carte Samir 3 lignes »
   ou « envoyer trois lignes à Samir » seraient matchés à tort.

5. 12 tests dans `router/run_product_help_guard.test.ts`.

Limite. Ne corrige pas A6-r2 T13 (4 items dont 1 conversationnel). Le composer
status_only doit être paramétrique ou délégué à un LLM (chantier ultérieur).

---

## Chantier 2 — Lookup DB des effets durables dans les handlers (2026-05-28)

Couche. L5 (skill) + contexte LLM companion.

Contexte. ~3 tours rouges (A2-r4 T7/T9) où Sophia répond à côté du sujet ou nie
un effet durable existant. Le handler ne consulte pas la DB et se base sur des
heuristiques internes ou sur le contexte conversationnel.

Phase A. Disambiguation `product_help` direct replies entre carte et rappel.

- Helpers `currentMessageTargetsAttackCard` /
  `currentMessageTargetsOneShotReminder` qui regardent uniquement le **message
  courant** (pas le contexte récent).
- `directOneShotReminderReply` exige que le message courant mentionne
  explicitement le rappel ; sinon renvoie null pour laisser
  `directAttackCardLocationReply` répondre.
- `directAttackCardLocationReply` symétrique.
- Réordonnancement dans `runProductHelpSkill` : attack card AVANT one_shot
  reminder.
- Tests dans `skills/skills_s3.test.ts` (A2-r4 T7 + negative control +
  pronominal).

Phase B. Injection d'un résumé DB dans le contexte du LLM companion.

- Nouvelle fonction `loadDurableEffectsSummary(supabase, userId)` dans
  `context/loader.ts`. Interroge en parallèle `user_attack_cards`,
  `user_defense_cards`, `scheduled_checkins`, `user_profile_facts` (préfixe
  `coach.%`) et produit un bloc texte compact.
- Champ `durableEffectsSummary?: string` dans `LoadedContext`.
- Déclenchement uniquement en mode `companion`.
- Position dans `buildContextString` : après `facts`, avant
  `whatsappFilRouge`/`memoryV2Payload`.
- Consigne explicite : « Ne dis JAMAIS "on n'a pas validé/créé X" si la ligne
  correspondante est présente. »

Pourquoi ce n'est pas un détecteur sémantique. Cette injection n'examine pas le
message user, ne décide d'aucun routing. Elle fournit un état de DB vérifiable
au LLM + consigne anti-hallucination.

Tests dans `context/loader_durable_effects_test.ts` (6 cas).

Limite. A2-r4 T8 reste hors scope : `prepare_attack_card` AI intake nie
l'existence d'une carte fraîche parce que son contexte d'entrée ne contient pas
la DB. Traité au chantier 4.

---

## Chantier 3 — Few-shots dispatcher pour migration L3 → L1 (2026-05-28)

Couche. L1 (dispatcher prompt).

Contexte. `router/turn_intent_arbitrator.ts` contient 5 détecteurs
transitionnels qui violent la règle architecturale anti-sémantique de L3. Le
chantier 3 prépare leur suppression en transférant la sémantique vers le
dispatcher LLM sous forme de few-shots.

Décisions.

1. Mise à jour de `DISPATCHER_V2_PROMPT_VERSION` :
   `dispatcher_v2_prompt_2026_05_s16` →
   `dispatcher_v2_prompt_2026_05_s17_l3_migration`.

2. Ajout de 5 few-shots dans `critical_routing_examples`. Un par détecteur L3
   transitionnel. Chaque few-shot contient un `user_message`, les `expected`
   signaux à produire, et une `note` qui explicite le piège à éviter.

3. Mapping détecteur → few-shot :

   - `detectsExplicitOneShotReminderCreate` → "Programme-moi un rappel ponctuel
     demain à 11h35 pour payer la facture."
   - `detectsActiveToolCancellation` → "Non, pas de carte. Annule ce flow…"
   - `detectsDurableCoachPreference` → "Pour la suite, enregistre une préférence
     durable : quand je dis 'court', zéro emoji…"
   - `detectsExplicitProductHelp` → "Où est-ce que je retrouve cette carte
     d'attaque dans l'app ? Juste l'emplacement…"
   - `detectsExactDurableStatus` → "Sans rien modifier, vérifie ce qui est
     vraiment en place côté carte, rappel et préférence coach."

4. Conservation des détecteurs L3 en filet de sécurité. Sans run QA Gemini réel,
   on ne peut valider que le dispatcher LLM obéit aux few-shots de manière
   fiable.

5. 4 tests dans `dispatcher/dispatcher.test.ts` (version, présence des
   few-shots, `payload_hint.raw_text` non vide, signaux exit pour cancellation).

Critère de suppression d'un détecteur L3 (sessions ultérieures).

- Lancer un run QA real-persona qui couvre les 5 cas (~15-25 tours).
- Pour chaque détecteur, vérifier dans les traces que le `TurnFrame` produit par
  le dispatcher contient les bons signaux SANS intervention de L3 (`arbitrate`
  retourne `changed=false`).
- Si OK sur 2 runs consécutifs, supprimer le détecteur + tests associés.
- Documenter chaque suppression dans le bloc « Historique de suppression » en
  tête de `router/turn_intent_arbitrator.ts`.

---

## Chantier 4 — Garde-fou DB anti-doublon dans `prepare_attack_card` (2026-05-28)

Couche. L5 (handler tool skill).

Contexte. A2-r4 T8 : Sophia a créé une carte au tour 6, et au tour 8 le user
demande "Donne juste l'emplacement de la carte que tu viens de créer". Le
dispatcher route à tort vers `prepare_attack_card`, le handler démarre un
nouveau slot filling, et Sophia répond "Je n'ai pas encore créé de carte
d'attaque" — directement contradictoire avec la DB.

Décisions.

- Helper DB `loadRecentActiveAttackCardForUser` (exporté, testable) dans
  `router/run.ts` : interroge `user_attack_cards` (status=active, ordre desc,
  limite 1), parse l'âge, retourne `{id, title, technique, ageSeconds}` ou
  `null` selon une fenêtre temporelle paramétrable (défaut 300s = 5 min).
- Détecteur narrow `userExplicitlyAsksForNewAttackCard` : matche seulement les
  expressions explicites d'une volonté de **nouvelle/autre** carte ("nouvelle
  carte", "une autre carte", "deuxième carte", "encore une carte", "carte
  supplémentaire"). NE matche PAS "cette carte", "la carte", "ma carte".
- Branchement dans `maybeRunPrepareAttackCardOperation`, branche "fresh start"
  (avant le 4ème appel à `runAttackCardIntake`) : si carte active < 5 min ET pas
  de demande explicite de nouvelle, on court-circuite et on renvoie une
  clarification.
- Statut `toolSkillRun.status = "duplicate_active_attack_card_guard"`.
- 11 tests dans `run_product_help_guard.test.ts`.

Justification architecturale.

1. N'est PAS un détecteur sémantique au sens L3. S'appuie sur un fait DB
   binaire + une regex narrow sur la demande explicite de nouvelle.
2. Ne route pas. Intervient uniquement quand `prepare_attack_card` a déjà été
   choisi.
3. Préserve la création légitime d'une seconde carte.
4. Coût plafonné : 1 tour de clarification dans le pire cas.

Critère de suppression. Un run QA confirme que le dispatcher (avec les few-shots
du chantier 3) route systématiquement vers `product_help` dans le cas A2-r4 T8
sans que la garde L5 ne déclenche.

---

## Chantier 5 — Rapatriement de la glue layer dans le module skill (2026-05-28)

Couche. Refactor structurel (déplacement physique, pas de logique modifiée).

Contexte. La fonction d'orchestration `maybeRunPrepareAttackCardOperation`
vivait dans `router/run.ts` et représentait ~970 lignes pour ce seul tool.
Multiplié par 5 tools, ~5K lignes de "glue layer" dans un fichier de 20K lignes
— la cause racine du sentiment "run.ts me fait peur à éditer".

Décisions.

- Création de `tools/operations/prepare_attack_card/router.ts` (~1026 lignes)
  qui contient désormais la fonction dans son intégralité avec ses 4 branches
  (pending_review, active_target_candidate, pending_recommendation,
  fresh_start).
- `router/run.ts` : fonction supprimée, remplacée par un thin re-export.
  `run.ts` passe de 20146 lignes à 19185 lignes (-961, ~5%).
- 20 helpers utilisés par la fonction marqués `export` dans `run.ts` (pas
  déplacés physiquement pour limiter le risque).
- Aucune logique modifiée. `deno check` 0 erreur, 151/151 tests verts.

Plan de continuité.

- Répliquer le pattern sur les 4 autres tools (`prepare_defense_card`,
  `create_recurring_reminder`, `select_state_potion`,
  `update_coach_preferences`).
- Quand les 5 tools sont migrés, `run.ts` devrait peser ~13-14K lignes.
- Plus tard : déplacer les helpers attack-card-only dans le module du tool,
  formaliser un module partagé `tools/operations/_shared.ts`. Cible : `run.ts`
  ~2-3K lignes.

---

## Chantiers 6-10 — Méga-plan post runs r5-r6 (2026-05-28)

Couche. L3 (transitionnel) + L5 (contexte loader + tool extractor).

Contexte. Après les chantiers 1-5, 4 runs (A2-codex-r4, A3-r6, A4-r5, A7-r2)
restent rouges. 5 nouvelles familles de bugs identifiées, chacune avec un fix
surgical.

### C6 — `loadDurableEffectsSummary` détaille TOUS les rappels en attente

A4-r5 T11. Avec deux rappels en DB, Sophia répondait "non confirmé / non
confirmé" car le summary ne détaillait que le premier. Fix : list jusqu'à 5
rappels avec scheduled_for + instruction, renforcement de la consigne LLM.

Fichiers. `context/loader.ts`, `context/loader_durable_effects_test.ts`.

### C7 — Anaphore "le même texte" pour reminder

A4-r5 T6 ("le même rappel"), A6-r2 T11 ("comme tout à l'heure"). Détection d'une
anaphore (`ANAPHORA_REMINDER_PATTERN`) + résolution depuis le dernier rappel
pending du user.

Fichiers. `tools/always_on/one_shot_reminder/one_shot_reminder_tool.ts`
(`detectsReminderAnaphora`, `loadLastReminderInstructionForUser`,
`isGenericOrAnaphoricInstruction`) + 6 tests régression.

### C8 — Détecteur multi-entity status pour éviter le hijack par product_help

A4-r5 T10, A7-r2 T11. "quelle carte / quels rappels / quelle préf ?" tombait sur
`detectsExplicitProductHelp`. Nouveau `detectsMultiEntityDurableStatus` plugué
AVANT `detectsExplicitProductHelp`.

Fichiers. `router/turn_intent_arbitrator.ts` + 7 tests régression.

### C9 — Continuation d'un brouillon `prepare_attack_card` mid-flow

A4-r5 T9, A3-r6 T7. Quand une correction de slot ("change la technique en ancre
visuelle") arrive alors qu'un `prepare_attack_card` est actif/pending, la couche
product_help la captait. Fix : `looksLikeAttackCardSlotCorrection`

- `rewriteForPendingAttackCardContinuation` qui force la continuation.

Fichiers. `router/turn_intent_arbitrator.ts` + 5 tests régression.

### C10 — Détecteur recap qui bloque `update_coach_preferences`

A7-r2 T15. "Fais un récap final" était routé vers `update_coach_preferences`
parce que la phrase contenait des mots de préférence. Nouveau
`detectsRecapRequest` plugué AVANT `detectsDurableCoachPreference` (force
normal_reply, bloque tool_skill).

Fichiers. `router/turn_intent_arbitrator.ts` + 3 tests régression.

---

## Chantiers 11-19 — Méga-plan post runs r6-r7 (2026-05-28)

Couche. L3 (transitionnel) + L5 (contexte loader + reminder extractor +
product_help anti-contamination).

Contexte. Runs `A3-r7`, `A4-r6`, `A8-r1`, `A2-codex-r6`. Deux passent red→yellow
(A3-r7, A8-r1), deux restent red avec un mix de bugs persistants et nouveaux. 11
familles identifiées, 8 chantiers exécutés, 1 différé (C17).

### C11 — Reorder arbitrator : multi-entity-status AVANT coach_preference

A4-r6 T10. "Statut fiable sans rien modifier : quelle carte / quels rappels /
quelle préférence coach ?" — `detectsDurableCoachPreference` matchait
"préférence coach" et firait avant `detectsMultiEntityDurableStatus` (C8). Fix :
inverser l'ordre dans `arbitrateTurnIntent`. Une question d'état durable est une
lecture, jamais une mutation.

Fichiers. `router/turn_intent_arbitrator.ts` + 1 test régression.

### C12 — Heures locales `user_timezone` dans `durableEffectsSummary`

A4-r6 T15. Récap affiche "09:21/09:37" (UTC) au lieu de "11:21/11:37"
Europe/Paris. Fix : fetch `profiles.timezone` en parallèle, formater chaque
horaire via `Intl.DateTimeFormat` en local (`28 mai, 11:21 (Europe/Paris)`),
garder l'ISO entre crochets pour traçabilité, consigne anti-UTC renforcée.

Fichiers. `context/loader.ts` + 2 tests régression.

### C13 — `extractReminderInstruction` priorise les quotes "texte exact 'X'"

A4-r6 T7. "rappel ponctuel aujourd'hui à 11h37, texte exact 'envoyer à Noa…'" →
DB stocke la méta-instruction complète. Fix : nouveau
`extractQuotedReminderInstruction` appelé EN PREMIER dans
`extractReminderInstruction`. Si une quote labelée existe, elle est la seule
source.

Fichiers. `tools/always_on/one_shot_reminder/one_shot_reminder_tool.ts` + 5
tests régression.

### C14 — Product help rappel : "où vérifier/annuler dans l'app" prime sur modification-detector

A2-r6 T4/T8, A3-r7 T3. `isExplicitOneShotReminderModificationRequestForTest`
matchait "change" dans "ne change rien". Fix : garde anti-faux-positif
(négations explicites + marqueurs question produit).

Fichiers. `router/run.ts` + 4 tests régression.

### C15 — Garde inverse de C9 : "crée le deuxième rappel" force `create_one_shot_reminder`

A4-r6 T5. Dispatcher hijack vers `prepare_attack_card` (carte récente) parce que
`detectsExplicitOneShotReminderCreate` ne matchait pas "crée le deuxième
rappel". Fix : élargir `createSignal` aux ordinaux/déterminants (`un autre`,
`un second`, `le deuxième`, `le troisième`, …). Effet de bord : `normalizeText`
convertit aussi les tirets en espace → "fais-moi un rappel" matche désormais
comme "fais moi un rappel".

Fichiers. `router/turn_intent_arbitrator.ts` + 3 tests régression.

### C16 — Détecteur memory-recap + opt-out status explicite

A2-r6 T9. "Résume ce que tu dois retenir de mon piège de ce matin, pas les
statuts système" — routé sur status resolver. Fix : `detectsRecapRequest`
étendu + nouveau `detectsExplicitNoStatusRequest` ("pas les statuts système"),
plugué EN TOUT PREMIER après les gardes de sécurité avec reason_code
`central_arbitrator_explicit_no_status_request`. Force `normal_reply` et bloque
`status_only` + `tool_skill.update_coach_preferences` + `tool_skill_flow`.

Fichiers. `router/turn_intent_arbitrator.ts` + 4 tests régression.

### C17 — DIFFÉRÉ : composer guard "c'est fait/programmé" sans exécution

A4-r6 T6. Sophia annonce le rappel "correspond bien à ce que j'ai déjà indiqué"
alors que `executed_tools=[]`. `direct_effects` finit vide en aval. Quelque
chose entre L3 (arbitre) et L5 (exécuteur) perd l'effet.

Pourquoi différé. Nécessite instrumentation traceur entre `arbitrateTurnIntent`
et `maybeCreateOneShotReminder`. Approche text-postprocess (rewrite "c'est
programmé" si executed_tools vide) est risquée pour les cas légitimes. À traiter
en session dédiée avec un test end-to-end ciblé.

### C18 — `extractReminderInstruction` capture "pour relire X avant Y" complet

A3-r7 T2. "Mets-moi un rappel demain à 9h05 pour relire ce mail client avant de
l'envoyer" → DB stocke `"l'envoyer"`. Dans la cascade de regex, `\bde\s+(.+)$`
était testé AVANT `\bpour\s+(.+)$`, donc le trailing "de l'envoyer" gagnait. Fix
: inverser l'ordre. Le pattern explicite "pour me dire/rappeler/faire penser"
reste prioritaire.

Fichiers. `tools/always_on/one_shot_reminder/one_shot_reminder_tool.ts` + 2
tests régression.

### C19 — Anti-contamination `product_help` ← draft `update_coach_preferences`

A4-r6 T13. `response_owner=product_help` correct mais Sophia répond avec le
draft confirmation `update_coach_preferences` du tour précédent. Fix : quand
`rewriteForProductHelp` fire, on nettoie aussi la `tempMemory` (suppression de
`__pending_tool_skill_confirmation`, `pending_tool_skill_confirmation`,
`__active_tool_skill_intake`, `active_tool_skill_intake`,
`__pending_recommendation_operation`). On ajoute
`tool_skill.update_coach_preferences` + `tool_skill_flow` aux `blocked_paths`.

Fichiers. `router/turn_intent_arbitrator.ts` + 1 test régression.

### Bilan tests C11-19

- `turn_intent_arbitrator.test.ts` : 32 verts (+13 nouveaux).
- `run_product_help_guard.test.ts` : 60 verts (+4 nouveaux).
- `loader_durable_effects_test.ts` : 9 verts (+2 nouveaux).
- `one_shot_reminder_tool_test.ts` : 34 verts (+7 nouveaux).
- Total touché : 135 verts, 0 nouveau rouge.

Trois échecs pré-existants dans `run_test.ts` (attack card opportunity, adjust
plan, writePlanAdjustmentPatch) confirmés AVANT et APRÈS le chantier via
`git stash` → régressions antérieures hors scope.

---

## Groupe A — C1/C2/C3 « arrêter l'hémorragie » post runs r6-r8 (2026-05-28)

Couche. L3 (arbitre) + L4 (run.ts overrides) + L5 (composer + loader).

Contexte. Runs `A4-syncskills-r6`, `A2-codex-r7`, `A3-r8`, `A9-r1`. Analyse
tour-par-tour des traces (dispatcher vs route finale). Bug racine n°1
reproductible sur 3 runs/4 : `status_only`/`status_exact` gagne contre une
décision correcte (`product_help`) ou contre un flow tool actif (meurtre de la
carte de défense A3-r8 T6/T8). Plus deux familles L5 : succès annoncé sans
exécution, et heures/texte de rappel non fiables.

### C1 — Subordonner le status (L3 + L4)

Deux gardes **non-sémantiques** (sur des faits structurels : `response_owner` et
`operation_type` du flow actif), pas sur l'interprétation du message.

1. **Garde produit (L4)**. Le bloc `status_only_request_blocks_tool_start` dans
   `router/run.ts` ne fire plus si
   `routeDecision.response_owner ===
   "product_help"`. Répare A2-r7 T4, A4-r6
   T14, A3-r8 T3 (« où retrouver/annuler dans l'app, sans modifier » finissait
   en panneau status au lieu de l'aide produit). Le détecteur status
   (`isStatusOnlyNoMutationRequestForTest`) reste vrai sur ces tours : c'est le
   garde qui porte la subordination, pas un affaiblissement du détecteur (test
   dédié).

2. **Garde flow de carte (L3 + L4)**. Les réécritures status de l'arbitre
   (`detectsExactDurableStatus`, `detectsMultiEntityDurableStatus`) cèdent quand
   un flow de **carte** (`prepare_attack_card`/`prepare_defense_card`) est en
   cours de collecte. La free-text des slots (« Mon geste : écrire 'je te
   confirme ça demain matin' ») faisait des faux positifs sur les détecteurs
   status et tuait le flow (A3-r8 T6/T8). En L4, helper
   `isActiveCardDraftingOperationForTest(activeOperationIntake)`. Scope
   **volontairement limité aux cartes** (PAS `update_coach_preferences`) : c'est
   ce qui évite de régresser A4-r6 T11 — où un intake coach obsolète restait
   actif depuis T10 mais une vraie question de statut devait gagner (vérifié sur
   les traces : T11 entre avec
   `__active_tool_skill_intake =
   update_coach_preferences` et le status doit
   primer).

Fichiers. `router/turn_intent_arbitrator.ts`, `router/run.ts`.

Tests. `turn_intent_arbitrator.test.ts` (A3-r8 T6, A3-r8 T8, anti-régression
A4-r6 T11) ; `run_product_help_guard.test.ts`
(`isActiveCardDraftingOperationForTest` true/false, détecteur status toujours
vrai sur A2-r7 T4).

Critère de suppression. Quand les slot fillers attack/defense renvoient un
signal `topic_change` fiable, le garde flow-de-carte peut disparaître (le slot
filler libérera lui-même le tour vers le status).

Limite. C1 corrige le **routage** (le flow de défense n'est plus tué). Le vert
complet de la carte de défense dépend du slot filler interne (hors scope ici).

### C2 — Garde anti-hallucination « c'est fait » (L5 composer) — clôt C17 (différé)

Garantie dure non-sémantique : dans le chemin `normal_reply` libre
(`operationRuntime === null`, donc AUCUN tool de mutation n'a tourné ce tour),
le composer ne peut pas affirmer qu'un effet a eu lieu si le tool n'est pas dans
`executedTools`.

Mécanique. Nouveau
`applyUnexecutedEffectClaimGuardForTest({ responseContent,
intendedTools, executedTools })`.
Précondition forte (anti-FP) : on ne déclenche que si un tool de mutation était
**visé** (`direct_effects_to_run` / `selected_handler`) mais **non exécuté**, ET
que la réponse contient un marqueur d'affirmation (✅, « c'est
programmé/créé/enregistré », « correspond bien à ce que j'ai indiqué », « reste
actif »…), ET qu'elle n'est pas déjà honnête (« je n'ai pas pu », « déjà actif
»…). On remplace alors par un message honnête. Répare A4-r6 T6.

Anti-FP structurel : une exécution réelle passe par `operationRuntime` (chemin
distinct), jamais par ce garde — le « C'est programmé pour 11:21 » de A4-r6 T3
est donc intact.

Fichiers. `router/run.ts` (helper + branchement après les autres guards
normal_reply).

Tests. `run_product_help_guard.test.ts` : A4-r6 T6 (neutralisé) + 3 anti-FP
(exécution réelle, réponse déjà honnête, aucune mutation visée).

Critère de suppression. Quand tout `direct_effect`/handler de mutation passe
garanti par un runtime honnête (jamais le normal_reply libre), ce garde devient
redondant.

### C3 — Source unique status/recap depuis la DB + tz locale (L5/loader) — corrige le résiduel de C12

Problème. C12 affichait l'heure locale MAIS gardait l'ISO UTC entre crochets
(`11:21 [iso: …T09:21:00Z]`) « pour traçabilité ». A4-r6 T15 restait rouge : le
LLM recopiait le `09:21` UTC visible dans le prompt malgré la consigne.

Fix loader. On n'expose plus aucun chiffre d'horloge UTC au LLM : l'ISO inline
est remplacé par une réf non-horaire (`[ref: <checkin_id>]`). Traçabilité
conservée, source du « 09:21 » supprimée. Consigne ajustée (le `[ref:]` est un
id technique, jamais une heure).

Fix composer status. `buildStatusOnlyNoMutationRuntime` énumère désormais CHAQUE
rappel en attente avec son heure locale + son `reminder_instruction` réel (DB),
au lieu de « le prochain » seulement. Répare A4-r6 T12 (texte exact des deux
rappels) et fiabilise la lecture multi-rappels.

Fichiers. `context/loader.ts`, `context/loader_durable_effects_test.ts`,
`router/run.ts` (export de `buildStatusOnlyNoMutationRuntime` pour test).

Tests. `loader_durable_effects_test.ts` : heure UTC absente + `[ref:]` présent
(A4-r6 T15), idem multi-rappels (A4-r5 T11) ; `run_product_help_guard.test.ts` :
status composer liste les deux instructions exactes + pas d'UTC (A4-r6 T12).

### Bilan tests Groupe A

- `turn_intent_arbitrator.test.ts` : 35 verts (+3).
- `run_product_help_guard.test.ts` : 68 verts (+8).
- `loader_durable_effects_test.ts` : 9 verts (assertions C12/C6 mises à jour).
- `deno check` 0 erreur sur les fichiers touchés (loader.ts, run.ts,
  turn_intent_arbitrator.ts).

Hors scope / différé (groupes B+). La qualité de CONTENU `product_help` (A4-r6
T14 route maintenant correctement vers product_help mais le « où retrouver »
doit être étoffé par le handler), le slot filler défense (vert complet de la
carte), et la migration finale L3→L1 restent ouverts. Six erreurs de type-check
pré-existantes (WIP non lié : `memory_plan_loader_test.ts`,
`types_action_details_test.ts`, `flow_context.ts`) confirmées hors scope.

---

## Groupe B — C4/C5/C6 « corriger le contenu » post runs r6-r7 (2026-05-28)

Objectif. Les rouges restants sont des bugs de CONTENU (route correcte, sortie
fausse), pas de routage. Trois chantiers, risque faible/moyen.

### C4 — Isoler `product_help` des drafts tool (L5 tempMemory)

Couche. L3 (`rewriteForProductHelp`) → propagation L4 (`run.ts`).

Symptôme (A4-r6 T13). « Question produit… où retrouver une carte et un rappel
dans l'app ? » route correctement vers `product_help`
(`central_arbitrator_product_help_priority`), MAIS la réponse rendue était mot
pour mot le `confirmation_message` du draft `update_coach_preferences` resté en
mémoire (« je te proposerai une seule action… je le garde comme préférence »).

Cause racine. Le chantier C19 nettoyait bien la `tempMemory`
(`clearToolSkillFlowEntries`) MAIS renvoyait `clearTargets: []`. Les variables
de `run.ts` (`activeOperationIntake` / `pendingOperationConfirmation` /
`pendingOperationConfirmationForGlobalRouting`), lues AVANT l'arbitre, restaient
peuplées → le composer aval rendait quand même le draft. Incohérence
tempMemory-nettoyée / variables-peuplées.

Décision. Aligner les deux : `rewriteForProductHelp` renvoie désormais
`clearTargets: ["active_tool", "pending_tool"]`. `run.ts` (déjà câblé pour ces
deux targets) annule les variables avant la composition `product_help`. Fix
minimal, aucune nouvelle regex sémantique.

Fichiers. `router/turn_intent_arbitrator.ts` (`rewriteForProductHelp`).

Tests. `turn_intent_arbitrator.test.ts` : la régression A4-r6 T13 vérifie
maintenant aussi `clearTargets.includes("active_tool"|"pending_tool")`.

Risque. Faible.

### C5 — Obéissance au contrat de format « fait / prévu / fragile » (L5 composer)

Couche. L5 (nouveau composer déterministe). Remplace F9/F10 (partie composer).

Symptôme. A2-codex-r7 T13 (« récap : fait, prévu, fragile, en trois lignes. Pas
de question. ») → la réponse n'était qu'une intro-promesse (« je m'occupe de ton
récap ») sans corps. A2-codex-r7 T14 (« trois lignes seulement, fait / prévu /
fragile, heure France, pas de question. ») → routé en
`immediate_mode_request_not_state_potion` et le LLM posait une QUESTION («
qu'est-ce qui te pèse ? »).

Décision. Pour ce contrat très spécifique et borné, on bypasse le LLM : un
composer DÉTERMINISTE `buildFaitPrevuFragileRecapRuntime` rend exactement 3
lignes labellisées, SANS question, sourcées DB, heures en `user_timezone`.
Détecteur `isFaitPrevuFragileRecapRequestForTest` volontairement narrow (exige
la séquence `fait [,/] prevu [,/] fragile`) → quasi zéro faux positif. Placé
dans la chaîne `operationRuntime` AVANT `statusOnlyNoMutationRuntime`, donc il
prime même quand le routage amont était émotionnel (corrige T14 au niveau
composer, pas au niveau route).

Mapping des labels (honnête, pas d'invention) :

- Fait = écritures durables persistées (cartes actives + préférences coach).
- Prévu = rappels ponctuels en attente (scheduled, heure locale).
- Fragile = repère de conversation, explicitement « pas une écriture durable ».

Fichiers. `router/run.ts` (`isFaitPrevuFragileRecapRequestForTest`,
`buildFaitPrevuFragileRecapRuntime`, insertion chaîne `operationRuntime`).

Tests. `run_product_help_guard.test.ts` : détecteur positif (T13/T14), anti-FP
(message normal contenant fait/fragile sans la séquence), composer = 3 lignes
labellisées + 0 « ? » + heure locale (11:21 pas 09:21) + Fait reflète la DB.

Risque. Faible/moyen (touche la chaîne runtime, mais en lecture seule et borné).

Note d'évolution. Quand le dispatcher (L1) saura router nativement ce contrat et
qu'un composer recap LLM fiable existera, ce runtime déterministe peut être
retiré ; critère de suppression = T13/T14 verts sur 2 runs sans le runtime.

### C6 — Extracteur de rappel : quotes prioritaires (L6) — DÉJÀ COUVERT par C13

Couche. L6 (`extractReminderInstruction`).

Constat. Le chantier C13 a déjà implémenté la priorité des quotes
(`extractQuotedReminderInstruction` : « texte exact 'X' » → X seul) et
`maybeCreateOneShotReminder` consomme bien cet extracteur. L'écho de la phrase
complète vu en A4-r6 T7 datait d'AVANT C13. Aucun code à modifier.

Action. Ajout d'un anti-FP explicite au libellé exact du chantier B pour
traçabilité (« rappelle-moi de payer le parking » → pas de quote ; « texte exact
'payer le parking' » → quote seule).

Fichiers. `run_product_help_guard.test.ts` (test anti-FP C6).

Risque. Nul (vérification + test).

### Bilan tests Groupe B

- `run_product_help_guard.test.ts` : 73 verts (+5 : C5 ×4, C6 ×1).
- `turn_intent_arbitrator.test.ts` : 35 verts (assertion C4 ajoutée à la
  régression A4-r6 T13 existante).
- `one_shot_reminder_tool_test.ts` : verts (C6 déjà couvert par C13).
- `deno check` 0 erreur sur `run.ts` + `turn_intent_arbitrator.ts`.

Différé après Groupe B.

- C5 ne couvre QUE le contrat `fait/prévu/fragile`. Les autres contrats de
  format libres (« une ligne », « X lignes » sans labels) restent au LLM
  normal_reply — F8 (slot filler attack ignore « une seule proposition ») reste
  ouvert.
- Préférences conditionnelles structurées en `user_profile_facts` (schema)
  toujours requis pour que « court = zéro emoji, 3 lignes » s'applique partout.
- Étoffement du CONTENU `product_help` (« où retrouver dans l'app ») : la route
  est bonne (C1/C14), le handler doit produire une vraie réponse produit.

---

## Groupe C — C7/C8 « routage & fidélité skill » post runs r6-r8 (2026-05-28)

Objectif. Réduire le sur-déclenchement L1 (C7) et fiabiliser les internals du
Tool Skill (C8). Groupe plus risqué : C7 est un changement de prompt dont
l'effet ne se valide qu'au prochain run QA ; C8 est le moins déterministe.

### C7 — Dispatcher (L1) : réduire le sur-déclenchement coach_preference / prepare_attack_card

Couche. L1 (`dispatcher.prompts.ts`, `critical_routing_examples`).

Symptômes (dispatcher émet la mauvaise intention À LA SOURCE) :

- A4-r6 T5. « crée le deuxième rappel à 11h37 avec le même texte » → émis en
  `prepare_attack_card` au lieu de `create_one_shot_reminder`.
- A4-r6 T10. « quelle carte / quels rappels / quelle préférence coach est
  appliquée ? » (question d'état) → émis en `update_coach_preferences`.
- A9-r1 T12. « ajoute le repère conversationnel: carnet bleu fermé = … » (note
  mémoire personnelle) → émis en `update_coach_preferences`.

Décision. 3 nouveaux few-shots L1 (avec `note` explicite) :

1. Rappel ordinal + heure + texte = `create_one_shot_reminder`, JAMAIS
   `prepare_attack_card` (même si l'instruction décrit une action).
2. Question d'état contenant « quelle préférence coach est appliquée » = LECTURE
   (aucun intent), PAS `update_coach_preferences` (demander ≠ changer).
3. « ajoute/note/retiens un repère conversationnel » = mémoire durable
   personnelle (extraction aval), PAS `update_coach_preferences` (qui ne
   concerne QUE le style de Sophia).

Version de prompt bumpée :
`dispatcher_v2_prompt_2026_05_s18_c7_dispatcher_precision`.

Fichiers. `dispatcher/dispatcher.prompts.ts`.

Tests. `dispatcher.test.ts` : version s18 ; présence des 3 few-shots avec
assertion sur l'intent attendu (rappel → create_one_shot_reminder & pas
attack_card ; status pref → 0 intent / 0 effet ; repère → pas
update_coach_preferences).

Risque. Moyen (impact routage large). Effet réel À VALIDER au prochain run QA :
un changement de prompt ne se prouve qu'en exécution.

### C8 — Internals Tool Skill `prepare_attack_card` (le plus dur)

Couche. L5 (slot_filler + ai_intake du skill).

Symptôme 1 (A2-codex-r7 T5/T7). L'utilisateur demande « Technique: ancre
visuelle » mais la carte générée affiche « Mot de bascule » : le LLM avait
interprété le post-it 'payé fermé' comme un mot de bascule, écrasant le choix
explicite.

Décision 1. Deux gardes déterministes (mapping lexical d'un TITRE de technique
exact → clé enum, pas une heuristique d'intention) :

- `enforceExplicitTechniqueRequestForTest` (slot_filler) : quand l'utilisateur
  nomme lui-même une technique, on verrouille `technique.value` +
  `explicitly_requested=true`. Tourne APRÈS le refine de fit (le choix explicite
  prime sur le steering).
- `normalizeDraft` (ai_intake) : quand `explicitly_requested`, le générateur
  (LLM séparé) ne peut plus remplacer la technique.

Symptôme 2 (A3-r8 T11). « crée une carte, choisis la technique toi-même » →
échec technique → message vague « Je n'ai pas réussi… je préfère m'arrêter
plutôt que deviner à ta place » (laisse croire à un refus de jugement).

Décision 2.

- Retry : un échec de génération est retenté UNE fois avant de tomber en
  fallback (raté transitoire ≠ raison de s'arrêter).
- Message : erreur technique propre + invitation à relancer (« Petit raté
  technique de mon côté… Redis-moi de la créer et je relance tout de suite »),
  sans jamais affirmer un succès.

Fichiers. `tools/operations/prepare_attack_card/slot_filler.ts`,
`tools/operations/prepare_attack_card/ai_intake.ts`.

Tests. `tools/operations/prepare_attack_card/tests.ts` (+5) : détecteur de
technique nommée (+ anti-FP « choisis toi-même » → null) ; enforce verrouille
ancre_visuelle sur un output LLM pre_engagement ; retry une fois → succès ;
échec persistant → message « raté technique » sans « deviner à ta place ».

Risque. Plus élevé, moins déterministe. C'est le groupe où l'itération QA est
attendue (le steering de technique reste partiellement LLM).

### Bilan tests Groupe C

- `dispatcher.test.ts` : 26 verts (+1 test C7, version bumpée).
- `tools/operations/prepare_attack_card/tests.ts` : 13 verts (+5 C8).
- `deno check` 0 erreur sur les 4 fichiers touchés.

Différé après Groupe C.

- C7 : valider en run QA que le dispatcher émet bien les bons signaux ; sinon
  itérer les few-shots. À terme, ces few-shots alimentent la migration L3→L1.
- C8 : la sélection de technique quand l'utilisateur NE nomme PAS la technique
  reste LLM (refine de fit) → peut encore se tromper ; F8 (« une seule
  proposition ») reste ouvert. Le retry est un seul essai en intra-tour ; pas de
  reprise inter-tour sur « réessaie » (flow exit après fallback).

---

## Groupe D — D0/D1/D3/D4/D2/D5 post runs r7-r9 (2026-05-28)

Contexte. Après validation des runs r7/r8/r9 : la plupart des fixes C1-C8
tiennent, mais (a) une régression introduite par C8 (carte one-shot « ancre
visuelle » qui tombe en `fallback_dashboard`), (b) des faux positifs résiduels
de routage/rendering. Ordre exécuté : D0 → D1 → D3 → D4 → D2 → D5.

### D0 — Régression carte one-shot « ancre visuelle » (C8) — RÉSOLU

Couche. L5 (`prepare_attack_card/ai_intake.ts`, `normalizeDraft`).

Symptôme. A2-codex-r8 T5/T6, A3-r9 T13 : une carte one-shot entièrement
spécifiée échouait en `fallback_dashboard`. Pré-C8 elle réussissait (avec la
mauvaise technique). Cause : le verrou de technique C8 (forçage
`explicitly_requested`) désynchronisait le draft LLM (title/instruction/
confirmation construits pour une autre technique) et `normalizeDraft` jetait sur
des incohérences mineures (`required_text_missing`,
`confirmation_message_draft_mismatch`) → fallback.

Décision. `normalizeDraft` devient RÉSILIENT : on garde le verrou de technique
(comportement voulu) mais on RÉPARE déterministe les champs secondaires (title →
`Carte d'attaque — {cible}`, instruction → `mode_emploi` de la technique,
confirmation_message reconstruit pour citer `generated_asset`) au lieu de jeter.
Seul un `generated_asset` réellement absent reste une vraie erreur technique
(retry C8 puis message propre). Pas de fabrication d'intention/slot : tous les
slots sont déjà présents, on ne fait que rendre la carte robuste (L5 content
resilience).

Fichiers. `ai_intake.ts` (`normalizeDraft` + export
`normalizeAttackCardDraftForTest`). Tests. `prepare_attack_card/tests.ts` : 3 D0
(draft désynchronisé → carte rendue, title manquant défaillé, `generated_asset`
manquant → vraie erreur).

### D1 — Format de réponse ponctuel ≠ préférence durable (arbitre) — RÉSOLU

Couche. L3 (`turn_intent_arbitrator.ts`). TRANSITIONNEL.

Symptôme. A4-r7 T15 : « en 4 lignes maximum… dis s'il y a une préférence coach
nouvelle appliquée. Pas d'explication. » → `update_coach_preferences` (faux
positif `central_arbitrator_coach_preference_priority`). La mention « préférence
coach » est une LECTURE ; le « 4 lignes / pas d'explication » est une contrainte
de FORME ponctuelle.

Décision. Nouveau détecteur `detectsPonctualResponseFormatConstraint` + garde
AVANT `rewriteForCoachPreference` → `normal_reply`
(`central_arbitrator_ponctual_response_format`). Anti-FP : désactivé si marqueur
de durabilité explicite (toujours / désormais / « garde comme préférence »…),
qui reste un vrai `update_coach_preferences` (A4-r7 T11). Généralise C5 (récap
déterministe) au niveau routage. Critère de suppression. Quand L1 distingue
fiablement forme ponctuelle vs préférence durable (few-shots), retirer. Tests.
`turn_intent_arbitrator.test.ts` : 3 anti-FP + 1 positif + 2 e2e (T15 →
normal_reply, T11 → update_coach_preferences).

### D3 — Exclure les clauses de gestion d'un autre rappel de l'extraction — RÉSOLU

Couche. L6 (`one_shot_reminder_tool.ts`, `cleanReminderInstructionTarget`).

Symptôme. A4-r7 T6 : le payload durable contenait « Celui de 11h24 doit rester
actif » dans `reminder_instruction`. C'est une consigne de gestion d'un AUTRE
rappel, pas le contenu du rappel courant.

Décision. 3 strips narrow en fin d'instruction : « celui de X (doit) rester
actif », « garde/laisse celui de X / l'autre actif », « ne touche/supprime pas
l'autre / le premier / celui de X ». Anti-FP : exige un séparateur de fin de
phrase `[.,;]` ET une RÉFÉRENCE à un autre rappel, pour ne pas amputer une
instruction qui contient juste le mot « actif ». Tests.
`one_shot_reminder_tool_test.ts` : 1 anti-FP (« rester actif sur le dossier Sam
») + 2 positifs (T6 + « garde celui de X actif »).

### D4 — Pattern C8 (retry + message propre) sur `update_coach_preferences` — RÉSOLU

Couche. L5 (`update_coach_preferences/intake.ts`).

Décision. Retry unique en intra-tour du slot filler IA avant
`fallback_dashboard`, et message d'échec TECHNIQUE propre + invitation à
relancer (à la place du refus vague « deviner à ta place »). Symétrique de C8.
Tests. `update_coach_preferences/tests.ts` : retry (échoue 1 fois → succès),
échec persistant (message propre, plus « deviner à ta place »).

### D2 — Le renderer obéit à `explicit_no_status` — RÉSOLU

Couche. L5 (`run.ts`, gate du composer `statusOnlyNoMutationRuntime`).

Symptôme. A2-codex-r8 T7 : l'arbitre route bien en
`central_arbitrator_explicit_no_status_request` (normal_reply), mais le composer
status_only prenait quand même la main → bloc « Sans rien modifier : ». Le
détecteur de format existant ne couvrait que « pas DE statut » (singulier) ; T7
disait « pas LES statutS système » (pluriel).

Décision. Gate extraite en helper testable
`shouldRenderStatusOnlyNoMutationForTest` qui ajoute
`!detectsExplicitNoStatusRequest(message)` (réutilise le détecteur de l'arbitre,
pluriel inclus). Le composer status_only ne prend plus la main sur un opt-out
no-status. Tests. `run_product_help_guard.test.ts` : T7 → false, anti-régression
statut sans opt-out → true.

### D5 — `product_help` ne capture pas une intention tool explicite — RÉSOLU

Couche. L3 (`turn_intent_arbitrator.ts`). TRANSITIONNEL.

Symptôme. A3-r9 T11/T12 : « Crée-moi une carte d'attaque… fais-moi le brouillon
» / « prépare la carte d'attaque maintenant, demande-moi de valider » routés en
`product_help` (`skill_entry_signal`) parce que le brouillon/réponse mentionne «
Dashboard / Ressources / Carte d'attaque ».

Décision. Détecteur `detectsExplicitAttackCardCreationRequest` (NOM + VERBE de
création + INDICE de création, EXCLUT les questions de navigation « où je la
retrouve / comment l'annuler dans l'app ») + garde tôt dans l'arbitre qui force
`prepare_attack_card` (`central_arbitrator_explicit_attack_card_creation`). Ne
s'active que si la route n'est PAS déjà `prepare_attack_card` (le garde
structuré existant gère ce cas) et hors safety. Critère de suppression. Quand L1
route fiablement les créations de carte vers prepare_attack_card (few-shots),
retirer. Tests. `turn_intent_arbitrator.test.ts` : 2 anti-FP navigation + 2
positifs (T11/T12) + 1 e2e (product_help → prepare_attack_card).

### Bilan tests Groupe D

- `turn_intent_arbitrator.test.ts` : 46 verts (+D1, +D5).
- `run_product_help_guard.test.ts` : 74 verts (+D2).
- `prepare_attack_card/tests.ts` : 16 verts (+D0).
- `update_coach_preferences/tests.ts` : 12 verts (+D4).
- `one_shot_reminder_tool_test.ts` : 37 verts (+D3).
- `deno check` 0 erreur sur les 5 fichiers source touchés.

Différé après Groupe D (à valider en run QA, effets de prompt/routage).

- D0 : la résilience de `normalizeDraft` masque une dérive du générateur LLM
  (technique forcée). À terme, fiabiliser le prompt générateur pour qu'il
  respecte la technique verrouillée sans désync ; alors la réparation
  déterministe deviendrait un simple filet.
- D1/D5 : détecteurs L3 TRANSITIONNELS — cibles de la migration L3→L1.
- F8 (« une seule proposition », A3-r9 T11) reste ouvert : c'est le contenu du
  draft, pas le routage ; hors scope D.
- A3-r9 T7/T8 (carte de défense `plan_b` → `adjust_plan_item` / annulation →
  `update_coach_preferences`) non traités ce lot ; à ouvrir comme chantier dédié
  défense-card.

---

## Groupe E — E0/E1/E2/E3/E5/E6 post runs edge-skills (2026-05-28)

Runs sources : A3-r10 (n4-strict), A11 (edge-skills-n3-strict), A2-codex-r9
(edge-skills). Tous les fixes respectent `14-qa-test-guidelines.md` (aucune
opération engageante sans confirmation, un seul cerveau, garde déterministe
uniquement sur des contrats/consentement).

### E0 — Potion : bloquer tout follow-up quand le user refuse — RÉSOLU

Couche. L5 (executor + writer). Gravité max (effet durable non consenti).

A3-r10 T6/T7 : l'utilisateur dit « ne programme rien » (T6) puis lance la potion
(T7) ; le système programmait quand même un rappel récurrent + des check-ins. Le
refus devait persister entre les tours.

Fix. Détecteur `detectsPotionFollowUpRefusalForTest` (refus explicite), refus
persisté dans `tempMemory.__potion_followup_consent="refused"`, propagé en
`suppress_follow_up_scheduling` jusqu'à `executeActivateStatePotion` et
`writeStatePotionActivation` (qui saute alors `user_recurring_reminders` ET
`scheduled_checkins`). La session de potion (le soutien) a bien lieu ; aucun
effet durable n'est créé. Cleanup du flag après exécution/blocage.

Tests. `select_state_potion/tests.ts` (suppression effective) + 3 tests
détecteur dans `run_product_help_guard.test.ts` (positif A3-r10 T6, variantes,
anti-FP).

### E1 — Potion : sortie propre sur STOP explicite — RÉSOLU

Couche. L4 (subordination du re-verrou) + L5 (clear d'état).

A3-r10 T8 (« Stop potion. Où je vois dans l'app… »). Le re-verrou
`active_select_state_potion_kept_in_tool_skill` pouvait piéger l'utilisateur
dans le flow potion.

Fix. `detectsExplicitStatePotionExitForTest` (marqueur d'arrêt + cible
potion/mode, anti-FP : « lance la potion » ne matche pas). Quand vrai et flow
potion actif/pending : on libère `activeOperationIntake` / pending / les clés
`tempMemory` du flow, et on rend la main (`normal_reply`
`explicit_state_potion_exit`, ou product_help si le dispatcher l'avait déjà
choisi). Subordination du garde existant, pas un nouveau if-block sémantique.

Tests. 3 tests détecteur (positif T8, variantes, anti-FP) dans
`run_product_help_guard.test.ts`.

### E2 — `product_help` « où corriger/annuler dans l'app » prime sur status — RÉSOLU

Couche. L3 (arbitre, déjà couvert) + L4 (défense en profondeur, symétrique C1).

A2-codex-r9 T4. Vérifié : sur le code actuel, `detectsExplicitProductHelp`
matche déjà T4 et l'arbitre route vers `product_help` AVANT les détecteurs
status (le run rouge était sur du code obsolète). Ajout d'une subordination
symétrique à C1 dans le garde status L4 (`!detectsExplicitProductHelp`) pour que
le panneau status n'avale jamais une question de navigation produit, même en
ordre d'évaluation limite. Un seul cerveau (même détecteur qu'en L3).

Tests. Régression arbitre pinnée sur la formulation exacte T4
(`turn_intent_arbitrator.test.ts`).

### E3 — Préférence durable explicite prime sur `prepare_defense_card` — RÉSOLU

Couche. L4 (subordination du garde defense-card). Généralise D1/D5.

A11 T9/T10. « Préférence durable de coaching : quand une carte de défense vient
d'être créée, … » était hijackée vers `prepare_defense_card` parce que
`isExplicitDefenseCardIntentForTest` matche un verbe générique (« ce que je vais
faire »), écrasant la décision correcte `update_coach_preferences` de l'arbitre.

Fix. Subordination du garde L4 au MÊME détecteur de préférence durable qu'en L3
(`!detectsDurableCoachPreference(userMessage)`). Anti-FP vérifié : une vraie
demande « Crée une carte de défense … » garde `defIntent=true` / `pref=false`,
donc le garde tire toujours.

Tests. Régression arbitre T9 → `update_coach_preferences`
(`turn_intent_arbitrator.test.ts`) + anti-FP création de carte
(`run_product_help_guard.test.ts`).

### E5 — Rappel : persister le créneau avant la confirmation unique/récurrent — RÉSOLU

Couche. L5/L6 (récupération de slot dans le tool reminder).

A11 T2/T3. L'heure (16h40) donnée à T2 était perdue à T3 (« Oui, rappel unique
») car `create_one_shot_reminder` ne lit que le message courant →
`missing_time`.

Fix. `maybeCreateOneShotReminder` accepte `contextMessages` (messages user
récents). Quand le message courant est une confirmation de rappel
(`looksLikeReminderSlotConfirmationForTest`) SANS heure propre, on récupère
heure + instruction depuis le dernier message pertinent via
`parseReminderFromMessageDeterministic` (strict→local→one-shot, AUCUN appel IA).
Analogue à la résolution d'anaphore du chantier 7.

Tests. `one_shot_reminder_tool_test.ts` : détecteur confirmation (+anti-FP),
récupération du 16h40 depuis T2, confirmation seule = pas de slot.

### E6 — Récap status : surfaces complètes + defaults vs prefs explicites — RÉSOLU

Couche. L5 (`loadDurableEffectsSummary`).

A11 T13 / A3-r10 T15. Le récap listait les 9 defaults comme « préférences coach
: oui » et ne couvrait ni les rappels récurrents ni la session de potion.

Fix. Le summary récupère `source_type` et sépare préférences DÉFINIES PAR
L'UTILISATEUR (`!= system_default`) des réglages PAR DÉFAUT système ; consigne
explicite « si aucune préférence explicite, dis "aucune préférence enregistrée",
ne présente jamais les defaults comme des choix ». Ajout des surfaces
`user_recurring_reminders` (actifs) et `user_potion_sessions` (session récente).

Tests. `loader_durable_effects_test.ts` : prefs explicites, defaults-only (A11
T13), rappels récurrents, session de potion (A3-r10 T15).

### Bilan tests Groupe E

- `turn_intent_arbitrator.test.ts` : 47 verts (+E2, +E3).
- `run_product_help_guard.test.ts` : 80 verts (+E1×3, +E3 anti-FP).
- `one_shot_reminder_tool_test.ts` : 41 verts (+E5×4).
- `loader_durable_effects_test.ts` : 12 verts (+E6×3).
- `select_state_potion/tests.ts` : vert (+E0).
- `deno check` 0 erreur sur les 3 fichiers source touchés (run.ts, loader.ts,
  one_shot_reminder_tool.ts). 204 tests verts sur les 5 suites combinées.

Différé / à valider en run QA.

- E2/E3 reposent sur des détecteurs L3 TRANSITIONNELS
  (`detectsExplicitProductHelp`, `detectsDurableCoachPreference`) — cibles de la
  migration L3→L1.
- E1 : la sortie propre est déterministe (marqueur d'arrêt) ; le critère de
  suppression est un signal `skill_signals.exit` fiable côté slot filler potion.
- A11 T12 (faux intent `prepare_attack_card` sur demande no-tool/micro-action)
  non traité ce lot ; à ouvrir comme chantier dédié.

---

## Groupe F — F0/F1/F2/F3/F4 post runs 2026-05-29 (edge + normal)

Runs source : `operations-r2`,
`qa-run-global15-edgecases-20260529-n4-strict-r2`,
`global-run-A2 edge-skills codex-r10`, `global-run-A3 r11`. Le bilan post-E a
montré que plusieurs correctifs E avaient le bon routage mais le mauvais RENDU,
et qu'une violation de consentement durable subsistait (la plus grave).

### F0 — Potion : hard-block durable + isolation rappel ponctuel (GRAVITÉ MAX)

Couche. L5 (executor + writer) + L4 (garde supersede) + détecteur de contrat.
Run. operations-r2 T7/T10/T13.

Symptôme : malgré des refus répétés (« pas de rituel récurrent » T7, « sans
rappel, sans demain, sans semaine » T10, « rien d'autre » T13),
`select_state_potion` a créé une session + un `user_recurring_reminders` + un
`scheduled_checkins`. E0 ne couvrait pas ces formulations et le flag de refus ne
survivait pas entre tours quand le handler potion ne tournait pas au tour du
refus.

Fix (généralise E0) :

- `detectsPotionFollowUpRefusalForTest` élargi : « pas de
  rituel/routine/récurrent », « sans demain/semaine », « rien d'autre », «
  juste/seulement maintenant », « une seule fois », « ponctuel », « non pour le
  suivi ». Normalisation des apostrophes (droites + typographiques).
- Le refus est ré-évalué sur la **fenêtre des 8 derniers messages user** à
  l'activation (`recentUserMessages`), pas seulement sur le message courant : un
  refus T7/T10 supprime donc le follow-up à l'activation T13. Garantie dure de
  consentement (jamais d'effet récurrent/durable non consenti).
- Isolation : la garde L4 `explicit_one_shot_reminder_supersedes_tool_flow`
  excluait `select_state_potion`. Elle laisse maintenant un rappel PONCTUEL
  explicite (signal fort : `detectsExplicitOneShotReminderCreate` + refus du
  récurrent) sortir d'un flow potion actif — la confirmation d'un rappel
  ponctuel n'est plus absorbée en effet récurrent.

Tests. `run_product_help_guard.test.ts` : F0 ×3 (variantes operations-r2 +
formulations + anti-FP « rituel/suivi/récurrent légitime »). L'exécuteur
conserve le test E0 de suppression (aucun
`user_recurring_reminders`/`scheduled_checkins`).

### F1 — Récap status : defaults vs préférences explicites (composer réel)

Couche. L5 (`buildStatusOnlyNoMutationRuntime`). Run. A11 T13 / A3-r11 T15.

E6 avait corrigé `loadDurableEffectsSummary`, mais les récaps des runs sont
rendus par `buildStatusOnlyNoMutationRuntime` (composer réellement branché), qui
listait toujours les 9 réglages par défaut comme « préférences en place ».

Fix : la requête `user_profile_facts` récupère `source_type` (limite portée à
12) ; on ne compte comme « préférences » que `source_type !== system_default`.
Les defaults sont mentionnés séparément (« seuls les réglages par défaut système
sont actifs » / « le reste est sur la valeur par défaut système »).
`coach_preference_found` dérive désormais des préférences explicites.

Tests. `run_product_help_guard.test.ts` : F1 ×2 (defaults seuls → pas de pref ;
explicite + defaults → pref listée + defaults notés).

### F2 — Renderer product_help ne produit jamais le bloc status (symétrique E2)

Couche. L4 (gate de rendu). Run. A2-codex T4 / A3-r11 T14.

E2 gagnait le routage (`response_owner=product_help`) mais le composer
`buildStatusOnlyNoMutationRuntime` (et `buildFaitPrevuFragileRecapRuntime`)
rendait quand même le bloc « Sans rien modifier : … ».

Fix : les deux composers de récap sont subordonnés à `routeIsProductHelp`
(`response_owner`/`selected_handler === "product_help"`). Gate déterministe ;
couvert côté routage par les tests E2 de l'arbitre.

### F3 — Exécution rappel multi-tour sur ordre explicite (anti-boucle)

Couche. L3 (arbitre, promotion) + L5 (runtime + tool). Run. edgecases-r2 T6-T10.

Symptôme : heure + date + texte donnés sur plusieurs tours, puis « programme-le
maintenant » (T9) ; le dispatcher proposait `create_one_shot_reminder` (high)
mais l'effet n'était jamais promu en `direct_effects_to_run` → boucle de
clarification. Trois gates bloquaient (arbitre, runtime, tool early-return).

Fix :

- `looksLikeReminderExecutionConfirmationForTest` (one_shot_reminder_tool) :
  détecte un ORDRE d'exécution explicite (« programme-le maintenant », « vas-y
  lance le rappel ») avec anti-FP question produit.
- Arbitre (TRANSITIONNEL) : si le **dispatcher a déjà proposé** un
  `create_one_shot_reminder` (explicit/high) ET que le message est un ordre
  d'exécution → promotion en `direct_effects_to_run`
  (`central_arbitrator_one_shot_reminder_execution_confirmation`). On ne
  re-dérive PAS l'intention : on s'appuie sur la compréhension L1, le code
  valide sur un contrat de confirmation.
- Runtime (`run.ts`) : le gate exécute aussi sur ordre d'exécution (sans heure
  dans le message), fenêtre contexte portée à 6.
- Tool : l'early-return `!isLikelyOneShotReminderRequest` est relâché quand
  c'est une confirmation/ordre avec `contextMessages` (récupération de créneau
  E5/F3). Anti-boucle : si rien n'est récupérable → `needs_clarify`, pas un
  silence.

Tests. `one_shot_reminder_tool_test.ts` : F3 ×3 (détecteur + anti-FP +
récupération T8). `turn_intent_arbitrator.test.ts` : F3 ×2 (promotion + anti-FP
sans proposition dispatcher).

Différé. La qualité du texte d'instruction récupéré peut inclure du préfixe («
Texte exact : … ») — polissage extracteur L6 à part. L'effet (heure + exécution)
est correct.

### F4 — `select_state_potion` ne redemande pas un slot déjà donné (jaune)

Couche. L5 (intake → router IA). Run. A3-r11 T4.

Symptôme : « Apaisement » choisi à T3 (routé normal_reply hors flow potion),
puis à T4 le flow potion ré-actif redemande le type. Le router IA ne recevait
pas l'historique.

Fix : `maybeRunSelectStatePotionOperation` transmet `recentMessages` (user +
assistant, 8 derniers) à `runSelectStatePotionIntake` → au router IA
(`recent_messages`). L'IA voit le choix antérieur et ne re-pose pas la question.
Doctrine : on enrichit le contexte de l'IA, pas de regex métier.

Tests. `select_state_potion/tests.ts` : F4 ×1 (le slot filler reçoit bien
`recent_messages`).

### Bilan tests Groupe F

- `run_product_help_guard.test.ts` : 86 verts (+F0×3, +F1×2).
- `turn_intent_arbitrator.test.ts` : 50 verts (+F3×2).
- `one_shot_reminder_tool_test.ts` : 44 verts (+F3×3).
- `select_state_potion/tests.ts` : 23 verts (+F4×1).
- `loader_durable_effects_test.ts` : inchangé, vert.
- `deno check` 0 erreur (run.ts, turn_intent_arbitrator.ts,
  one_shot_reminder_tool.ts). 215 tests verts sur les 5 suites combinées.

Différé / à valider en run QA.

- F2 : gate de rendu déterministe, à confirmer côté run (rendu product_help
  réel).
- F3 : promotion arbitre TRANSITIONNELLE (anchor sur proposition dispatcher) —
  cible migration L3→L1 quand le dispatcher promeut nativement sur confirmation
  d'exécution multi-tour. Polissage du texte d'instruction (extracteur L6)
  différé.
- edgecases-r2 T14 (`select_state_potion` ignore « pas de potion ») : refus
  d'entrée de flow potion non traité ce lot — chantier dédié (hard negative).

---

## Groupe G — G0/G1/G2/G3/G4 post runs 2026-05-29 (edgecases-r3 + syncskills-r2)

Runs source : `qa-run-global15-edgecases-20260529-n4-strict-r3`,
`qa-run-global15-syncskills-20260528/29-n3-strict-r2`, plus les A2/A3/A9
edge-skills associés. Le bilan post-F a montré que le status/recap pouvait
encore préempter une COMMANDE d'opération explicite (symétrique inverse de F2),
qu'un refus dur de potion à l'entrée n'était pas honoré, et que `cancel`
ponctuel n'avait pas d'exécuteur. Tous les fixes respectent
`14-qa-test-guidelines.md` (aucune mutation sans confirmation, un seul cerveau,
gardes déterministes sur des faits/contrats, pas de fabrication d'intention).

### G0 — Status/recap ne préempte JAMAIS une commande d'opération explicite

Couche. L3 (arbitre, défense en profondeur) + L4 (gardes routage) + L5 (ordre de
rendu). Symétrique de F2, côté opérations. Run. edgecases-r3 T5 (rappel « 14h20
ou 16h10 »), syncskills-r2 T2 (carte d'attaque), ~7 tours rouges/4 runs.

Symptôme : une commande d'opération explicite (créer une carte, créer/exécuter
un rappel) contenant accessoirement un motif status/recap (« Mets-moi un rappel…
14h20 ou 16h10 » matche le status-exact rappel `\dh\d\d ou \dh\d\d`) était
avalée par le bloc status/recap, soit au routage (L3/L4), soit au rendu (le
composer status_only / fait-prévu-fragile passe AVANT les runtimes d'opération
dans la chaîne `??`).

Fix :

- Helper unique `isExplicitOperationCommandForTest` (`run.ts`) qui compose les
  détecteurs d'opération explicite déjà présents :
  `detectsExplicitOneShotReminderCreate`,
  `looksLikeReminderCreationCommandForTest` (NOUVEAU, tolérant aux incises),
  `looksLikeReminderExecutionConfirmationForTest`,
  `detectsExplicitAttackCardCreationRequest`, approbations carte attack/defense.
- `looksLikeReminderCreationCommandForTest` : capte une commande de création de
  rappel même ambiguë (deux horaires candidats, incise « plutôt »). Anti-FP :
  exige « rappel » + verbe de création, EXCLUT recap/bilan et le cadrage
  vérification/status (« quelle heure », « tu as vraiment programmé »).
- L4 : les gardes `recap_only_request_supersedes_tool_flow` et
  `status_only_request_blocks_tool_start` ne tirent plus si
  `isExplicitOperationCommandForTest(userMessage)`.
- L5 (rendu) : `statusOnlyNoMutationRuntime` et `faitPrevuFragileRecapRuntime`
  ne s'arment plus si `messageIsExplicitOperationCommand` (sinon ils préemptent
  la création/confirmation dans la chaîne `??`).
- L3 (défense en profondeur) : `isExplicitOperationCommand` (arbitre) subordonne
  les branches `detectsRecapRequest`, `detectsMultiEntityDurableStatus`,
  `detectsExactDurableStatus`.

Tests. `run_product_help_guard.test.ts` : G0 ×6 (rappel 2-horaires, ordre
d'exécution, carte d'attaque positifs ; anti-FP récap pur reste éligible au
rendu status ; anti-FP vraie question d'heure exacte).

Critère de suppression. Quand L1 distingue nativement commande d'opération vs
lecture status/recap (few-shots), retirer les gardes L3/L4.

### G1 — « pas de potion » = hard-negative qui annule/suspend select_state_potion

Couche. L4 (garde tôt, avant le re-verrou potion). Run. edgecases-r3 T12-14,
syncskills-r2 T13-14.

Symptôme : un refus explicite de la potion (« ne me propose pas de potion », «
ne lance pas de potion », « sans potion ») était ignoré quand la potion n'était
pas encore active (elle démarrait quand même ce tour) ou ressuscitait au tour
suivant via `active_select_state_potion_kept_in_tool_skill`. E1
(`detectsExplicitStatePotionExitForTest`) ne couvrait que le STOP d'un flow DÉJÀ
actif.

Fix : `detectsExplicitNoPotionRequestForTest` (exige « potion » + marqueur
négatif clair ; « lance la potion »/« oui pour la potion » ne matchent pas).
Nouvelle garde L4 placée AVANT le bloc `potionFlowActive` : si vrai, (a) purge
l'état potion (local + `tempMemory`), (b) retire `select_state_potion` des
intents/opportunity du tour, (c) si la route allait vers la potion, rend la main
à la conversation (`normal_reply`,
`explicit_no_potion_suspends_select_state_potion`) pour livrer la demande
concrète (« juste une phrase de réparation »).

Tests. `run_product_help_guard.test.ts` : G1 ×4 (T12, T13, variantes « sans
potion »/« pas de potion » ; anti-FP accepter/demander une potion + « pas de
rappel » sans mention potion).

### G2 — Texte du rappel : préserver l'instruction quand la confirmation ne porte que l'heure/le style

Couche. L6 (`one_shot_reminder_tool.ts`, `maybeCreateOneShotReminder`). Polish
de F3. Run. edgecases-r3 T7.

Symptôme : au tour de confirmation (« Rappel neutre. Programme-le maintenant
pour aujourd'hui à 16h10. »), l'instruction extraite est DÉGÉNÉRÉE (juste
l'horaire/le style) et écrasait l'instruction réelle (« vérifier les 5 lignes du
devis ») donnée au tour précédent.

Fix : `isDegenerateReminderInstructionForTest` détecte une instruction qui ne
porte QUE de l'horaire/jour/style (après strip des marqueurs temporels +
mots-clés de style → vide). Quand l'instruction est dégénérée ET que le message
est une confirmation (`looksLikeReminderExecutionConfirmationForTest` /
`looksLikeReminderSlotConfirmationForTest`), on RÉCUPÈRE l'instruction réelle
depuis `contextMessages` (premier candidat non dégénéré via
`extractReminderInstruction`, exporté), sinon depuis le dernier rappel pending
en DB. On NE remplace JAMAIS une instruction réelle par l'heure.

Tests. `one_shot_reminder_tool_test.ts` : G2 ×4 (instruction dégénérée
horaire/style/vide/anaphore ; vraie instruction non dégénérée ; confirmation T7
→ dégénérée à récupérer ; texte exact T6 récupérable et non dégénéré).

### G3 — Executor `cancel_one_shot_reminder` (annuler réellement ou le dire)

Couche. L5 (nouvel exécuteur) + L5 (chaîne runtime `run.ts`). Nouvelle feature.
Run. edgecases-r3 T9/T10.

Symptôme : `cancel_one_shot_reminder` était détecté par le dispatcher mais AUCUN
exécuteur ne l'appliquait → Sophia promettait l'annulation alors que le rappel
restait `pending` en DB.

Fix :

- `detectsExplicitOneShotReminderCancelForTest` (`run.ts`) : verbe d'annulation
  - référence rappel/ping. Anti-FP : négation (« ne l'annule pas », tolérante
    aux apostrophes non normalisées), question produit/navigation (« où annuler
    dans l'app »).
- `maybeCancelOneShotReminder` (`one_shot_reminder_tool.ts`) : lit les
  `scheduled_checkins` pending `one_shot_reminder:%`, filtre par heure locale
  ciblée si le message la précise (`extractTargetHHMMFromMessage` +
  `localHHMMForScheduledFor`, tz-aware), passe les ciblés en `cancelled` via le
  write client. Renvoie `cancelled` (avec labels locaux), `no_reminder`, ou
  `failed` (souci technique dit honnêtement, jamais de faux succès).
- Branché dans la chaîne `operationRuntime` AVANT
  `oneShotReminderModificationRuntime`.

Tests. `one_shot_reminder_tool_test.ts` : G3 ×3 (annulation réelle 16h10 →
`status=cancelled`, aucun pending → `no_reminder`, heure ciblée ne coupe que le
bon rappel). `run_product_help_guard.test.ts` : G3 ×3 (détecteur positif T9, «
coupe ce ping »/« annule-le vraiment » ; anti-FP question produit + négation

- remerciement).

### G3-fix — Annulations non consenties (régression G3) — RÉSOLU

Couche. L5 (détecteur `detectsExplicitOneShotReminderCancelForTest` + gate
runtime). Runs. A14-r1 T3/T13/T14, normal-conversation-r4 T13, edgecases-r4 T15.

Symptôme (CRITIQUE) : le détecteur G3 matchait « annule/annulé » + « rappel »
sans distinguer une COMMANDE d'une question/vérification/description. Il a
déclenché des annulations DB NON CONSENTIES sur :

- « si je veux l'annuler plus tard, je passe par où ? » (question produit/futur)
  ;
- « le rappel a été annulé puis recréé … sans le lancer » (description passée +
  refus d'outil explicite — violation du garde no-tool) ;
- « Vérifie sans modifier : … l'ancien annulé ? » (vérification status) ;
- « récap : … rappel 15h50 créé ou annulé » (récap → réponse cancel parasite).

Fix :

- Le détecteur exige désormais une COMMANDE impérative immédiate et exclut en
  amont quatre familles de cadres non-impératifs : (A) vérification/status/récap
  (« vérifie », « confirme-moi », « sans modifier », « récap/bilan/résume »),
  (B) question produit/navigation/futur conditionnel (« comment annuler », « si
  je veux … plus tard », « je passe par où », « dans l'app »), (C) refus d'outil
  (« ne crée rien », « sans le lancer », « propose-le seulement »), (D)
  description d'une annulation PASSÉE (« a été annulé », « tu viens d'annuler »,
  « annulé puis recréé »).
- Défense en profondeur au runtime : le runtime de cancellation est subordonné à
  `!isExplicitNoToolRequestForTest(userMessage)` (aucune mutation sous refus
  d'outil explicite).

Tests. `run_product_help_guard.test.ts` : 5 anti-FP (les 5 tours observés) + 1
positif (commande combinée annuler+créer reste détectée).

### G4 — `update_coach_preferences` : validation sémantique de la paraphrase (jaune)

Couche. L5 (`maybeRunUpdateCoachPreferencesOperation`). Run. syncskills-r2 T10.

Symptôme : le slot filler pouvait INVERSER le sens de la préférence de
questionnement. À T10, « commence par un geste concret AVANT de me poser
plusieurs questions » (= MOINS de questions) était paraphrasé en draft
`coach.question_tendency = "high"` (= PLUS de questions), et Sophia s'apprêtait
à confirmer ce sens inversé.

Fix : `detectsCoachPreferenceDirectionContradictionForTest(message, patch)`
valide que la DIRECTION du patch (`coach.question_tendency` low/high) ne
contredit pas l'intention exprimée (marqueurs « moins de questions »/« geste
concret avant … questions »/« une seule question » vs « plus de questions »/ «
questionne-moi davantage »). Si contradiction ET que ce n'est pas une
confirmation explicite, on ne confirme PAS : on purge le pending/intake et on
demande une clarification de direction (« MOINS ou PLUS de questions ? »),
`status=direction_needs_confirmation`. Scope = `coach.question_tendency` (le cas
observé). « IA comprend, code valide ».

Tests. `run_product_help_guard.test.ts` : G4 ×4 (T10 geste-concret-avant vs
patch high ; « moins de questions » vs high ; « plus de questions » vs low ;
anti-FP directions cohérentes + patch sans `question_tendency`).

### Bilan tests Groupe G

- `run_product_help_guard.test.ts` : 102 verts (+G0×6, +G1×4, +G3×3, +G4×4).
- `one_shot_reminder_tool_test.ts` : 51 verts (+G2×4, +G3×3).
- `turn_intent_arbitrator.test.ts` : 50 verts (G0 défense en profondeur,
  inchangé côté compteur).
- `deno check` 0 erreur sur les fichiers touchés (run.ts,
  turn_intent_arbitrator.ts, one_shot_reminder_tool.ts).

Différé / à valider en run QA.

- G0 : gardes L3/L4 TRANSITIONNELLES — cibles migration L3→L1.
- G3 : pas de prise en charge de l'annulation par ID exact (seulement par heure
  locale ou globale) ; suffisant pour les formulations observées.
- G4 : scope limité à `coach.question_tendency`. D'autres dimensions (ton,
  longueur) pourraient inverser ; à élargir si un run le montre. À terme, la
  validation devrait être portée par le slot filler IA lui-même.

---

## Groupe H — Correctifs RED hors périmètre G (2026-05-29)

Runs cibles : edgecases-r4, syncskills-r3, A14-r1, A2-r12, A9-r4.

### H1 — « pas de potion » honoré dans `emotional_repair`

Couche. L4 (`run.ts` route guard + `explicitNoPotionConcreteReplyRuntime`).

Symptôme : tools bloqués mais la réponse posait encore des questions au lieu de
livrer phrase/micro-action/reset (edgecases-r4 T12-14, syncskills-r3 T13-14).

Fix :

- Garde G1 étendue : si `emotional_repair` actif OU livrable concret demandé,
  bascule vers `normal_reply` (pas seulement potion active/would-start).
- Runtime `explicitNoPotionConcreteReplyRuntime` : livre reset 2 min, phrase de
  réparation + micro-action, sans `?`.

Tests. `run_product_help_guard.test.ts` : H1×2.

### H2 — `prepare_defense_card` ne rend plus status-only au lieu du brouillon

Couche. L4 (gate status composer).

Symptôme : A14-r1 T6-T8 — status-only preempt le flow carte de défense.

Fix : le composer `statusOnlyNoMutationRuntime` est désactivé quand
`routeIsCardToolSkill`, `messageIsExplicitCardCommand`, ou
`isActiveCardDraftingOperationForTest(activeOperationIntake)`.

### H3 — `update_coach_preferences` mapping précis

Couche. L5 (`intake.ts` + `generator.ts` + preview runtime).

Symptômes :

- `mode tunnel` mappé vers règle « court » (A2-r9 T8-10).
- `challenger doucement` → `coach.tone=soft` (A9-r4 T13-14).
- syncskills-r3 T10 : clarification inutile malgré geste concret + question max.

Fix :

- `mode tunnel` → patch multi-clés (`tone=direct`, `emoji=none`,
  `final_question=avoid`, `question_tendency=low`) + summaries nommant le
  déclencheur « mode tunnel » (jamais « court »).
- `challenger doucement` + technique ne colle → `challenge_level=balanced`.
- Geste concret <10 min + question max → patch direct sans slot filler.
- Preview sans enregistrement : `buildCoachPreferencePreviewReplyForTest`.

Tests. `update_coach_preferences/tests.ts` : H3×3 ;
`run_product_help_guard.test.ts` : H3 preview×1.

### H4 — Status-only au démarrage + récaps incomplets

Couche. L4 (`isRecapOnlyRequestForTest` + `buildStatusOnlyNoMutationRuntime`).

Symptômes : edgecases-r4 T1 (note de synthèse ≠ récap) ; récaps oubliant potion
/ rappel annulé.

Fix :

- Anti-FP « note de synthèse » + « juste démarrer ».
- Récap enrichi : rappels `cancelled`, sessions potion `completed`, piège
  notifications/doc si mentionné.

### H5 — Rappel ambigu ne bascule plus vers `create_recurring_reminder`

Couche. L4 (`shouldPreferOneShotReminderOverRecurringForTest` +
`recurringReminderRouteIsSelected`).

Symptôme : edgecases-r4 T7 — rappel ponctuel ambigu → récurrent.

Fix : heure + texte exact / « pas récurrent » / « aujourd'hui » → one-shot only.

Tests. `run_product_help_guard.test.ts` : H5×1.

### H6 — Multi-intention : 2e demande du même message après tool

Couche. L4 (cancellation replace + reminder addon).

Symptôme : syncskills-r3 T5/T12 — annuler+créer ou séquence minute/minute
perdue.

Fix :

- Cancel runtime : si create intent aussi détecté → `maybeCreateOneShotReminder`
  après cancel réussi (`replaced_after_cancel`).
- Reminder runtime : append `buildMinuteByMinuteSequenceAddonForTest` sur
  succès.

Tests. `run_product_help_guard.test.ts` : H6×1.

### Bilan tests Groupe H

- `run_product_help_guard.test.ts` : +H1×2, +H3×1, +H5×1, +H6×1 (113 total
  attendu).
- `update_coach_preferences/tests.ts` : +H3×3.
- `deno check` sur fichiers touchés.

Différé / à valider en run QA all_skills.

---

## Groupe I — Correctifs architecture post runs 2026-05-29 (A15 / edgecases-r5 / A9-r5 / syncskills-r4)

Runs cibles : `global-run-A15-r1`, `edgecases-r5`, `A9-r5`, `syncskills-r4`,
`A2-r13`, `normal-conv-r5`.

### I1 — `prepare_attack_card` : validation brouillon vs création

Couche. L5 tool skill (`prepare_attack_card`) + validation contractuelle
existante dans `run.ts`.

Symptôme : A9-r5 T5 exécutait `prepare_attack_card` alors que le user disait «
affiche le brouillon complet maintenant, sans le créer encore ».

Décision : ne pas créer une carte sur une validation qui contient explicitement
un contrat de brouillon/non-durabilité. Le correctif reste dans le contrat de
validation du tool skill : une approbation déterministe n'est valide que si elle
ne contredit pas l'exécution. Pas de nouveau détecteur L3/L4 de routing.

Fichiers modifiés :

- `router/run.ts`
- `router/run_product_help_guard.test.ts`

Tests :

- `I1: attack card draft-only wording is not treated as creation approval`.

Limite : ne corrige pas à lui seul les mauvais routages initiaux `normal_reply`
vs `prepare_attack_card` de syncskills-r4 T2-T3 ; ces cas dépendent encore du
dispatcher / router d'entrée.

### I2 — L6 rappel ponctuel : extraction du texte utile après `Texte exact :`

Couche. L6 (`tools/always_on/one_shot_reminder`).

Symptôme : A15 T2 et edgecases-r5 T7 persistaient une instruction polluée par la
méta-commande (« choisis 16h05. Texte exact : … ») au lieu du texte utile.

Décision : dans l'extracteur de payload, prioriser les labels explicites
`texte exact:`, `instruction:`, `message:` même quand le contenu n'est pas
encadré par des guillemets et même si une autre phrase contient déjà un deux
points. C'est du parsing de payload, autorisé en L6.

Fichiers modifiés :

- `tools/always_on/one_shot_reminder/one_shot_reminder_tool.ts`
- `tools/always_on/one_shot_reminder/one_shot_reminder_tool_test.ts`

Tests :

- `I2: parseOneShotReminderRequest strips unquoted Texte exact meta-command after earlier colon`.

### I3 — Préférences composites : clé durable `coach.action_first_policy`

Couche. L5 tool skill `update_coach_preferences` + schéma applicatif de
préférence.

Symptôme : syncskills-r4 T9-T14 et A15 T7-T12 réduisaient « geste concret /
action d'abord avant questions » à `coach.question_tendency=low`, ce qui perd le
cœur de la préférence et rend les récaps contradictoires.

Décision : ajouter une clé durable dédiée
`coach.action_first_policy=concrete_before_questions`. Les demandes composites
peuvent maintenant écrire cette clé en plus de `question_tendency`, `tone`, etc.
Le builder, le slot filler, la validation de payload, le label de statut et
l'upsert DB acceptent cette clé. Ce n'est pas une regex de routing : c'est une
extension de modèle pour représenter un concept qui n'avait pas de slot.

Fichiers modifiés :

- `tools/operations/_shared/operation_payload_builder.ts`
- `tools/operations/update_coach_preferences/workflow.ts`
- `tools/operations/update_coach_preferences/intake.ts`
- `tools/operations/update_coach_preferences/generator.ts`
- `tools/operations/update_coach_preferences/slot_filler.ts`
- `router/run.ts`
- `tools/operations/update_coach_preferences/tests.ts`
- `router/run_product_help_guard.test.ts`

Tests :

- `I3: action-first preference gets its own durable key, not only question_tendency`.
- H3 existant mis à jour : le cas « geste concret + question max » vérifie
  maintenant aussi `coach.action_first_policy`.

Limite : l'application runtime de cette préférence dans tous les composers n'est
pas entièrement traitée ici. Le statut et la persistance sont corrigés ; le
rendu conversationnel devra lire cette clé de façon systématique dans un
chantier dédié si les prochains runs montrent encore des questions finales.

### I4 — Status DB-grounded : rappel créé puis annulé

Couche. L5 composer status (`buildStatusOnlyNoMutationRuntime`).

Symptôme : edgecases-r5 T15 répondait « rappels ponctuels : je n'en vois pas en
place » alors que le bon état était « créé puis annulé ». La ligne était
techniquement vraie pour les rappels actifs, mais fausse pour le récap demandé.

Décision : quand il n'y a aucun rappel actif mais qu'un rappel one-shot annulé
récent existe et que le message demande un récap/statut d'annulation, la ligne
principale dit explicitement `aucun actif ; ... créé puis annulé`. Les détails
annulés restent aussi disponibles en lignes extra.

Fichiers modifiés :

- `router/run.ts`
- `router/run_product_help_guard.test.ts`

Tests :

- `I4: status composer reports created-then-cancelled one-shot reminders`.

### I5 — Priorité one-shot explicite sur ancien flow outil

Couche. L5 orchestration runtime (`run.ts` direct effects).

Symptôme : edgecases-r5 T6 ignorait une demande de rappel ponctuel parce qu'un
ancien flow `prepare_attack_card` reprenait la main.

Décision : si `direct_effects_to_run` contient `create_one_shot_reminder` et que
le message courant porte un rappel one-shot exécutable, le runtime one-shot peut
s'exécuter même si `routeDecision.response_owner` est encore `tool_skill`. Le
succès nettoie déjà le flow technique via `clearToolSkillFlowForDirectReminder`.
Cette décision privilégie l'effet structuré du dispatcher sur le propriétaire
stale, sans ajouter de regex de sémantique carte.

Fichiers modifiés :

- `router/run.ts`

Tests couverts indirectement :

- suite `one_shot_reminder_tool_test.ts`
- suite `run_product_help_guard.test.ts`

### Bilan tests Groupe I

- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/one_shot_reminder_tool_test.ts`
  : 52 verts.
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/update_coach_preferences/tests.ts`
  : 16 verts.
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`
  : 115 verts.
- `deno check` sur les fichiers modifiés : vert.

Différé / à valider en run QA all_skills : `prepare_attack_card` durable depuis
`normal_reply` (syncskills T2-T4), mémoire conversationnelle
`garde comme repère`, et application runtime exhaustive de
`coach.action_first_policy`.

## Chantier adjust_plan_item ownership L5 — 2026-05-29

Objectif : rendre `adjust_plan_item` propriétaire du lifecycle d'exécution sans
réécrire son intake L5.

Avancé dans cette session :

- Ajout de `tools/operations/adjust_plan_item/contract.ts` avec le contrat
  `AdjustPlanSkillResult`, `AdjustPlanUserIntent` et le résultat runtime.
- Ajout de `tools/operations/adjust_plan_item/state.ts` pour encapsuler les clés
  tempMemory existantes (`__pending_adjust_plan_draft_review`,
  `__active_tool_skill_intake`, `__pending_tool_skill_confirmation`,
  `__last_adjust_plan_execution`).
- Ajout de `tools/operations/adjust_plan_item/router.ts`; l'exécution d'un
  pending draft confirmé y crée désormais le token, appelle
  `executeAdjustPlanItem`, bloque les drafts non matérialisés via l'executor,
  nettoie le frame adjust_plan et écrit `__last_adjust_plan_execution`.
- `run.ts` ne fait plus d'appel direct à `executeAdjustPlanItem`; il injecte
  seulement le writer DB `writePlanAdjustmentPatch` et le contexte global.
- Ajout de `router_test.ts` pour couvrir exécution, blocage plan_item_id
  manquant et blocage materialization sans écriture.
- Suite de migration : `maybeRunAdjustPlanItemOperation` est maintenant dans
  `tools/operations/adjust_plan_item/router.ts`. `run.ts` ne garde plus qu'un
  wrapper d'assemblage contexte + callbacks (`writePlanAdjustmentPatch`, helpers
  weekly provisoires, rendu d'ack).
- Le router du skill possède désormais pending draft review approve/reject,
  explain, revision déterministe, revision via intake, pending recommendation,
  active intake, weekly exact/copy-forward/light-repeat bridge et exécution.
- `run.ts` n'importe plus `runAdjustPlanItemIntake` ni `executeAdjustPlanItem`.
- Ajout de `tools/operations/adjust_plan_item/draft_review.ts`; le rendu d'ack,
  l'explication du pending draft et les révisions déterministes ne sont plus
  définis dans `run.ts`.
- Ajout de `tools/operations/adjust_plan_item/weekly_bridge.ts`; les builders
  weekly exact/copy-forward/mission carry-over/light-repeat et le patch du
  pending draft weekly vivent maintenant dans le skill.
- `run.ts` importe les helpers du skill et garde seulement la conversation
  weekly générique, le contexte runtime et les writers injectés.
- Nettoyage legacy du périmètre state : les type guards pending draft / pending
  confirmation / pending recommendation adjust_plan sont centralisés dans
  `state.ts`; `run.ts` lit/clear le frame adjust_plan via l'API du skill au lieu
  de manipuler directement les clés tempMemory.
- Correction de wording dans `intake.ts` pour les drafts whole-plan
  `success_criteria_change` : le message parle explicitement des "critères de
  réussite", ce qui aligne le draft avec le contrat de tests.
- `router_test.ts` couvre maintenant approve, reject, explain, revise, missing
  plan item id et materialization block.

Validation :

- `deno check supabase/functions/sophia-brain/router/run.ts` : vert.
- `deno check` sur `run.ts`, `adjust_plan_item/draft_review.ts`,
  `weekly_bridge.ts`, `router.ts`, `router_test.ts` : vert.
- `deno test .../adjust_plan_item/router_test.ts` : 7 verts.
- `deno test .../adjust_plan_item/tests.ts` : 47 verts.
- `deno test .../adjust_plan_item/draft_compiler_test.ts` : 7 verts.
- `deno test .../adjust_plan_item/candidate_builder_test.ts` : 7 verts.
- `deno test .../router/run_product_help_guard.test.ts` : 116 verts.
- Après nettoyage legacy state : `deno check` sur `run.ts`,
  `adjust_plan_item/state.ts`, `router.ts`, `draft_review.ts`,
  `weekly_bridge.ts` : vert ; `router_test.ts` : 7 verts ;
  `adjust_plan_item/tests.ts` : 47 verts ; `run_product_help_guard.test.ts` : 95
  verts dans l'état courant de la suite.
- `deno test .../router/turn_intent_arbitrator.test.ts` : 50 verts.

## 2026-05-29 — select_state_potion L5 ownership

Migration structurelle du skill `select_state_potion` vers un ownership L5.

Changements réalisés :

- ajout de `tools/operations/select_state_potion/contract.ts` avec le contrat
  `SelectStatePotionSkillResult`, intents, contraintes et effets ;
- ajout de `tools/operations/select_state_potion/state.ts` pour encapsuler les
  clés tempMemory historiques (`__active_tool_skill_intake`,
  `__pending_tool_skill_confirmation`, `__pending_recommendation_operation`,
  `__potion_followup_consent`) ;
- création de `tools/operations/select_state_potion/router.ts` et déplacement
  hors `router/run.ts` de l'orchestration pending confirmation, recommendation,
  intake actif, draft review approve/reject/revise/explain, activation via
  `executeActivateStatePotion`, et consentement follow-up ;
- déplacement de la décision métier `no_potion` dans le router du skill :
  annulation/clear si flow actif, blocage sans démarrage si route candidate ;
- ajout du handoff skill pour rappel ponctuel explicite pendant flow potion
  (`status: "handoff"`, cible `create_one_shot_reminder`) ;
- retrait du hard-guard `explicit_no_potion_suspends_select_state_potion` de
  `router/run.ts`.

Passe stricte complémentaire :

- ajout de `policy.ts` pour sortir de `run.ts` les détecteurs/réponses/type
  guards potion (`no_potion`, refus follow-up, sortie potion, pending potion,
  route admission locale) ;
- ajout de `persistence.ts` pour sortir de `run.ts` le writer DB
  `writeStatePotionActivation` ;
- retrait de `run.ts` des guards spécifiques `active_select_state_potion`,
  `immediate_mode_request_not_state_potion`, `explicit_no_potion...`, et du
  supersede one-shot spécifique potion ;
- `select_state_potion/router.ts` ne dépend plus de `router/run.ts`.

Ce qui reste global :

- le verrouillage `active_select_state_potion_kept_in_tool_skill`, parce qu'il
  sert encore d'admission inter-handlers pour garantir qu'un flow actif arrive
  au router du skill ;
- les détecteurs historiques exportés depuis `run.ts` restent partagés comme
  transition, sur le même pattern que `prepare_attack_card`.

Vérification locale :

- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/select_state_potion/tests.ts`
  : 26 verts ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`
  : 115 verts ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/turn_intent_arbitrator.test.ts`
  : 50 verts ;
- `deno check` sur `select_state_potion/router.ts`, `contract.ts`, `state.ts`,
  `policy.ts`, `persistence.ts`, `tests.ts` : vert.

Note de vérification globale : `run_product_help_guard.test.ts` a maintenant un
rouge hors périmètre potion sur
`F1: status ignores backend-only coach
preference rows`. Les assertions
potion/follow-up déplacées sont vertes.

---

Reste à migrer dans une passe suivante :

- déplacer tout `maybeRunAdjustPlanItemOperation` dans le router du skill ;
- déplacer pending draft review approve/reject/revise/explain hors `run.ts` ;
- passer le weekly exact proposal bridge par le router pour confirmation et
  exécution, sans déplacer toute la conversation weekly.

Vérification locale :

- `deno check` sur `contract.ts`, `state.ts`, `router.ts`, `router_test.ts` :
  vert.
- `deno test --allow-env --allow-net --allow-read .../router_test.ts` : 3 verts.
- Baseline préexistante : `adjust_plan_item/tests.ts` échoue sur 2 assertions
  "critères de réussite"; `run_product_help_guard.test.ts` échoue au type-check
  sur `create_recurring_reminder/intake.ts`.

---

## Familles de bugs identifiées mais hors scope

Référence pour les prochaines sessions, classées par couche et par effort.

### F8 — `prepare_attack_card` slot filler ignore "une seule proposition"

Couche. L5 (generator du skill). Effort. ~2-3h.

A3-r7 T11. User demande "une seule proposition, pas trois options", Sophia
propose deux options. Le générateur ne lit pas la contrainte de forme.

### F9/F10 — Composer recap "fait/prévu/fragile" et hallucination "c'est fait" — RÉSOLU (C5 + C2)

Couche. L5 (composer) + traçage runtime.

A2-codex T13/T14 → résolu par C5 (composer déterministe
`buildFaitPrevuFragileRecapRuntime`, 3 lignes, 0 question, DB).

A4-r6 T6 (ex-C17) → résolu par C2 (`applyUnexecutedEffectClaimGuardForTest`).

### Préférences conditionnelles structurées en `user_profile_facts`

Couche. Schema + migration DB. Effort. session dédiée.

Aujourd'hui, une préférence comme "quand je dis 'court', zéro emoji, trois
lignes max" est stockée comme texte libre. Pour qu'elle s'applique réellement en
aval, il faut un schema `(trigger, action_sequence, scope)` testable.

### Stabilisation infra (HTTP 502 upstream)

Couche. Infra. Prérequis à toute validation QA fiable.

### Migration finale L3 → L1

Couche. L1 (dispatcher prompt). Effort. variable.

Quand le dispatcher (avec les few-shots des chantiers 3, 8, 9, 10, 11, 15, 16,
C7) prouve sur 2 runs QA consécutifs qu'il produit nativement les bons signaux,
supprimer les détecteurs L3 correspondants un par un. Voir critère de
suppression du chantier 3.

### Refactor des 4 autres tools sur le pattern du chantier 5

Couche. Refactor structurel. Effort. ~1 tool/session.

`prepare_defense_card`, `create_recurring_reminder`, `select_state_potion`,
`update_coach_preferences`.

---

### I6 — `prepare_attack_card` ownership L5 local

Couche. L5 tool skill (`prepare_attack_card`) + réduction L3/L4.

Changement.

- Ajout d'un contrat local `prepare_attack_card/contract.ts` avec `user_intent`,
  contraintes structurées, effets demandés/autorisés/bloqués et décision pure
  `decidePrepareAttackCardNextStep`.
- Le slot filler produit maintenant `user_intent` et `constraints` ; l'intake
  les propage dans `state_patch`, `operation_input` et la sortie runtime du
  skill.
- Les approvals de brouillon pending ne passent plus par un helper déterministe
  legacy dans le router du skill. La décision
  create/draft_only/reject/revise/explain/topic_change vient du contrat L5.
- Les créations DB du router passent par `executePrepareAttackCard` avec token
  de confirmation local, puis par le writer DB. Les flows fresh/target-candidate
  retournent une confirmation pending au lieu d'insérer directement.
- TempMemory attack-card a des wrappers locaux de lecture/écriture/clear pour
  garder la compatibilité des clés existantes sans laisser `run.ts` interpréter
  le métier carte d'attaque.
- Les helpers métier attack-card restants ont été rapatriés dans
  `prepare_attack_card/run_support.ts` : reprise de carte récente, rendu de
  question, recommendation input et writer DB injecté dans l'executor.
- `run.ts` ne réexporte plus ces helpers et ne contient plus
  `insertAttackCardFromDraft`, `AttackCardDraftV1`, `ATTACK_TECHNIQUES` ni les
  guards locaux legacy d'approval/cancel/micro-action.
- Nettoyage legacy final : suppression des helpers d'approval/cancel/micro
  attack-card et des tests L4 associés ; les tests restants du périmètre
  attack-card vivent dans `prepare_attack_card/tests.ts`.
- L'arbitre central continue à router les créations explicites vers
  `prepare_attack_card`, mais son `tool_skill_intent` est dégradé en hint
  (`user_intent: "none"`, `payload_hint.route_hint`) au lieu d'imposer `create`.

Tests ajoutés.

- Normalisation `user_intent=draft_only` + contraintes `no_create`.
- `draft_only` bloque tout effet `create_attack_card`.
- `approve` n'autorise la création que si un pending compatible existe.
- "montre-moi", reject, revise et topic_change ne demandent aucun effet DB.
- La contrainte `single_proposal` survit jusque dans `operation_input`.

Vérification locale.

- `prepare_attack_card/tests.ts` : 21 verts.
- `turn_intent_arbitrator.test.ts` : 50 verts.
- Après nettoyage legacy : `prepare_attack_card/tests.ts` : 26 verts.
- Après nettoyage legacy : `run_product_help_guard.test.ts` : 79 verts
  (`--no-check`, le test router ne porte plus les tests attack-card déplacés).
- `turn_intent_arbitrator.test.ts` : 50 verts.
- `deno check` vert sur `prepare_attack_card/run_support.ts`.
- `deno check` sur `router/run.ts` / le graphe complet reste bloqué par une
  dette hors périmètre dans `skills/execution_breakdown` et
  `skills/product_help`.
- Pendant la recompilation du graphe, deux typages latents hors chantier ont été
  stabilisés : `scope` dans `update_coach_preferences` et `turnFrame` nullable
  dans `dispatcherSignalsFromTurnFrame`.

### Composer `status_only` paramétrique ou délégué à un LLM

Couche. L5. Effort. ~1-2j.

Reste du levier sur les cas multi-items (~1-2 tours par run).

### `UserTurnSnapshot` unifié

Couche. Refactor du contexte. Effort. structurel.

Consolider tous les reads DB de début de tour dans un objet unique et le
propager à toutes les couches. Évite les divergences entre ce que voit
l'arbitre, le composer et le skill.

---

### J1 — `one_shot_reminder` direct-effect router

Couche. Always-on direct effect (`one_shot_reminder`) + réduction `run.ts`.

Changement.

- Ajout de `one_shot_reminder/contract.ts` pour formaliser intent, contraintes,
  effets commit en DB, effets bloqués, outils exécutés et statut final.
- Ajout de `one_shot_reminder/router.ts` comme propriétaire de la décision
  directe `create` / `cancel` / `replace` / `modify` / `status_question` /
  `product_help` / `ignore`.
- `run.ts` ne compose plus lui-même le remplacement `cancel + create` : il
  appelle `maybeRunOneShotReminderDirectEffect`, puis mappe seulement le
  résultat en `OperationRuntimeResult`.
- Deuxième passe : les détecteurs et décisions one-shot restants ont été sortis
  de `run.ts` vers `one_shot_reminder/router.ts` (`modification`, `cancel`,
  `exact_status`, `operation_command`, `supersede_tool_flow`,
  `non_mutation_direct_effect_block`, `safe_work_reminder_override`,
  `one_shot_over_recurring`). `run.ts` garde seulement l'application de ces
  décisions sur `routeDecision`/`turnFrame`.
- Troisième passe : suppression du pont legacy. `run.ts` ne ré-exporte plus les
  helpers one-shot, et `run_product_help_guard.test.ts` les importe directement
  depuis `one_shot_reminder/router.ts`. La réponse produit
  `oneShotReminderManagementReplyForTest` a aussi été déplacée dans le module
  one-shot.
- Le router bloque les mutations sur question produit, question de statut,
  wording récurrent, no-tool explicite et confirmation tool pending.
- Le remplacement restitue les effets partiels : si l'annulation réussit mais la
  création échoue, la réponse dit explicitement que seul le demi-effet commit a
  eu lieu.
- Renforcement de l'extraction de texte utile par tests autour de `Texte exact`,
  `rappelle-moi à HH de X` et `rappelle-moi demain à HH : X`.
- Passe finale : ajout du chemin explicite `intake.ts` → `reducer.ts` →
  `executor.ts` → `renderer.ts`, avec `persistence.ts` pour les reads pending.
  Le contrat expose maintenant `requested_effects`, `allowed_effects`,
  `attempted_effects`, `committed_effects` et `blocked_effects`.
- Invariant renderer : `executed_tools` représente seulement les effets commit ;
  les tentatives techniques vivent dans `attempted_effects`. Aucune réponse
  "programmé/annulé/remplacé" n'est produite sans effet commit correspondant.
- Correction critique : une annulation ciblée par heure
  (`annule celui de
  16h10`) retourne `no_reminder` si aucun pending ne matche
  cette heure ; elle ne retombe plus sur l'annulation globale de tous les
  pending.
- Les addons conversationnels one-shot (`phrase courte`, séquence minute par
  minute) sont rendus par `one_shot_reminder/renderer.ts`; `run.ts` consomme
  uniquement `directEffect.reply`.

Tests ajoutés.

- Product-help/status sur rappel ne mutent pas.
- Wording récurrent (`tous les jours`) est handoff/refus one-shot, sans create.
- Replace `cancel + create` retourne les deux effets commit.
- Replace partiel rapporte le demi-effet.
- Confirmation pending bloque la mutation.
- Création one-shot explicite reste classée create malgré un ancien flow carte.
- Helpers migrés : cancel/status/modification/operation-command, guards
  status/tool-flow et product-help/no-mutation.
- Annulation ciblée sans match : 10:00 + 11:00 pending, demande 16h10 → aucun
  update DB.
- Invariants create : succès avec requested/allowed/attempted/committed ; échec
  technique sans `executed_tools`, sans `committed_effects`, sans wording de
  succès.
- `no_mutation` bloque avant executor.
- Intake structuré : exact text + frontière recurring.

Vérification locale.

- `one_shot_reminder_tool_test.ts` : 66 verts.
- `turn_intent_arbitrator.test.ts` : 50 verts.
- `deno check` ciblé sur tout le module `one_shot_reminder`
  (`contract/intake/reducer/executor/renderer/persistence/router/tool/tests`) :
  vert.
- Baseline inchangée : `create_recurring_reminder/tests.ts` échoue encore sur le
  mock `slot_filler` qui ne fournit pas les nouveaux champs
  `user_intent`/`constraints`/`handoff_target`. Le check incluant `run.ts`
  échoue encore sur des dettes globales hors périmètre one-shot
  (`isWeeklyAdaptiveReviewActive`, nullability `skillOutput`/`turnFrame`).
  `run_product_help_guard.test.ts` échoue avant exécution sur un export manquant
  de `weekly_review/runtime.ts` (`resolveWeeklyForgottenProgressCandidate`).

---

### J2 — `create_recurring_reminder` ownership L5

Couche. Tool skill operation (`create_recurring_reminder`) + réduction `run.ts`.

Changement.

- Ajout de `create_recurring_reminder/contract.ts` pour formaliser
  `user_intent`, contraintes, handoff one-shot, effets autorisés/bloqués et
  résultat skill.
- Ajout de `create_recurring_reminder/state.ts` pour encapsuler les clés
  `tempMemory` existantes (`__active_tool_skill_intake`,
  `__pending_tool_skill_confirmation`, `__pending_recommendation_operation`).
- Ajout de `create_recurring_reminder/router.ts` comme propriétaire des branches
  recommandation, intake active, pending confirmation, reject, explain, revise
  et approve.
- Ajout de `create_recurring_reminder/platform_context.ts` : le skill construit
  lui-même le contexte donné au slot filler à partir du runtime plan/snapshot.
- Ajout de `create_recurring_reminder/persistence.ts` : le skill possède le
  mapping jours, l'application du binding draft -> colonnes DB, l'insert
  `user_recurring_reminders` et la classification best-effort.
- `run.ts` ne contient plus le flow métier récurrent ni le writer DB récurrent :
  il appelle le router et lui passe seulement le runtime plan/snapshot déjà
  disponible.
- Suppression du legacy `dashboard_recurring_reminder_intent_addon` dans
  `run.ts` et le context loader : plus de redirection/dashboard addon qui
  réinterprète ponctuel vs récurrent hors du skill.
- Suppression du helper legacy
  `isPendingRecurringReminderRecommendationOperation` dans `run.ts`; les
  recommandations pending passent par le typage générique
  `pendingOperationType`.
- L'intake expose `user_intent`, `constraints` et `handoff_target`.
- Le skill sait retourner `status=handoff_to_one_shot` sans draft ni effet.
- Toute création récurrente passe par `executeCreateRecurringReminder`; le
  writer DB par défaut vit côté skill et reste sous l'executor.
- Ajout du ledger `CreateRecurringReminderCommittedEffect` et propagation
  `committed_effects` depuis l'executor vers le router. `executedTools` ne
  contient `create_recurring_reminder` que si un `recurring_reminder_id` DB est
  présent dans les effets committés.
- Ajout de `create_recurring_reminder/renderer.ts`. Le wording de succès est
  centralisé et ne peut pas dire "C'est fait / J'ai créé" sans effet committé.
- Application réelle de `draft_only` / `no_create` : le skill peut produire un
  brouillon sans pending confirmation exécutable ni écriture DB possible.
- Annulation pendant intake active et handoff one-shot pendant intake active
  nettoient le frame recurring sans writer.

Tests ajoutés.

- Wording one-shot -> `handoff_to_one_shot`, sans draft ni pending recurring.
- Wording récurrent -> `pending_confirmation`.
- Slots manquants heure/contenu -> `ask_question`.
- Pending + approve -> exécution via writer injecté sous executor.
- Pending + revise/explain/reject -> aucun writer appelé.
- Writer DB en échec -> `toolExecution=failed`, `executedTools=[]`,
  `committed_effects=[]`, aucun wording "C'est fait".
- Draft invalide bloqué par executor -> aucun writer, aucun effet committé.
- `draft_only` / `no_create` -> draft prêt sans confirmation exécutable.
- Intake active + cancel -> frame cleared, aucun writer.
- Intake active + wording one-shot -> `handoff_to_one_shot`, frame cleared.
- Succès -> `executedTools=["create_recurring_reminder"]` seulement avec
  `committed_effects[0].recurring_reminder_id`.
- Renderer -> pas de wording créé sans effets committés.

Vérification locale.

- `deno test --no-check
  supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/tests.ts`
  : 16 verts.
- `deno test --allow-env --allow-net --allow-read
  supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/tests.ts`
  : 16 verts.
- `one_shot_reminder_tool_test.ts` : 66 verts.
- `turn_intent_arbitrator.test.ts` : 50 verts.
- `deno check` ciblé sur le module `create_recurring_reminder` : vert.
- `run_product_help_guard.test.ts` est bloqué dans l'état courant par des
  erreurs hors périmètre recurring (`weekly_review/runtime.ts` export manquant
  et helpers adjust-plan absents de `run.ts`).

---

### J3 — `prepare_defense_card` ownership L5

Couche. Tool skill operation (`prepare_defense_card`) + réduction `run.ts`.

Changement.

- Ajout de `prepare_defense_card/contract.ts` pour formaliser `user_intent`,
  contraintes, effets `create_defense_card` autorisés/bloqués et résultat skill.
- Ajout de `prepare_defense_card/router.ts` comme propriétaire des branches
  pending confirmation, recommandation, intake active, draft review,
  reject/explain/revise/topic_change et create.
- `run.ts` ne contient plus `maybeRunPrepareDefenseCardOperation` ni insertion
  DB directe de carte de défense; il importe le router du skill.
- Le slot filler expose `user_intent` et `constraints` structurées, propagées
  par `ai_intake.ts` jusque dans `state_patch` et `operation_input`.
- La création ne s'appuie plus sur `isDefenseCardExplicitApprovalForTest` dans
  `run.ts`; elle exige `draft_validation.decision=approve`, `user_intent=create`
  et aucune contrainte `draft_only/no_create`.
- Toute création passe par `executePrepareDefenseCard`; le writer DB est appelé
  uniquement sous le guard de confirmation de l'executor.
- Les clés `tempMemory` existantes restent compatibles mais sont encapsulées
  dans le module du skill.
- Nettoyage final: les prédicats pending/intent defense sont exposés depuis le
  module du skill; `run.ts` ne contient plus les blocs L4 qui décidaient
  approval/revision d'un pending defense.

Tests ajoutés.

- Normalisation `user_intent=draft_only` + contraintes `draft_only/no_create`.
- Router `draft_only/no_create` : draft prêt, aucun writer DB.
- Router pending + `create` : exécution via executor et effet autorisé.
- Router pending + explain/reject/revise : aucun writer DB; reject efface le
  pending; revise conserve attache et risque pour l'intake.
- `tool_fit=unclear` : clarification, pas de draft de défense forcé.

Vérification locale.

- `prepare_defense_card/tests.ts` : 13 verts.
- `turn_intent_arbitrator.test.ts` : 50 verts.
- `run_product_help_guard.test.ts` : 115 verts.
- `deno check` ciblé sur `run.ts`, `prepare_attack_card/router.ts` et les
  fichiers `prepare_defense_card` touchés : vert.

---

### J4 — `update_coach_preferences` ownership L5

Couche. Tool skill operation (`update_coach_preferences`) + réduction `run.ts`.

Changement.

- Ajout de `update_coach_preferences/contract.ts` pour formaliser `user_intent`,
  règles composites, effets autorisés/bloqués et résultat skill.
- Ajout de `update_coach_preferences/state.ts` pour encapsuler les clés
  `tempMemory` existantes (`__active_tool_skill_intake`,
  `active_tool_skill_intake`, `__pending_tool_skill_confirmation`,
  `pending_tool_skill_confirmation`).
- Ajout de `update_coach_preferences/router.ts` comme propriétaire des branches
  preview, pending confirmation, reject, explain, revise, direction guard,
  ask_question et execution.
- `run.ts` importe le router du skill; il ne contient plus le flow
  `maybeRunUpdateCoachPreferencesOperation`.
- Le slot filler expose `user_intent`, `requested_patch`, `rule_metadata` et
  `structured_constraints`.
- Les préférences composites gardent `trigger_text`, `behavior_contract` et
  `scope` dans le draft et dans la valeur DB (`rule_metadata`).
- Toute écriture DB passe par `executeUpdateCoachPreferences`; le writer
  `user_profile_facts` est injecté sous le guard de confirmation de l'executor.
- `deterministicPatchFromMessage` reste seulement comme filet transitionnel
  désactivé par défaut (`__enable_transition_regex_fallback`) et n'est plus le
  chemin principal.
- Ajout de `runtime_policy.ts` pour traduire les préférences stockées en
  contraintes composer, avec support des règles conditionnelles.

Tests ajoutés.

- `user_intent=set_preference`.
- Preview-only sans pending write.
- Mode tunnel multi-clés + metadata.
- Geste concret avant questions via `coach.action_first_policy`.
- Challenge conditionnel "technique ne colle pas".
- Direction contradiction avant confirmation.
- Approve via executor uniquement.
- Revise/explain/reject sans execution.
- Runtime policy depuis préférences stockées + metadata.

Vérification locale.

- `update_coach_preferences/tests.ts` : 24 verts.
- `turn_intent_arbitrator.test.ts` : 50 verts.
- `run_product_help_guard.test.ts` : 115 verts.
- `deno check` ciblé sur `update_coach_preferences`,
  `_shared/operation_payload_builder.ts` et `run.ts` : vert.

---

### J5 — Réduction du périmètre durable `update_coach_preferences`

Couche. Tool skill operation (`update_coach_preferences`) + projection status /
runtime.

Décision produit. Les préférences coach durables doivent rester alignées avec
les réglages visibles et contrôlables dans le front. Les clés backend-only
suivantes sont retirées du contrat durable :

- `coach.response_max_lines`
- `coach.emoji_policy`
- `coach.final_question_policy`
- `coach.action_first_policy`

Changement.

- `CoachPreferenceKey` ne contient plus que `coach.tone`,
  `coach.challenge_level`, `coach.question_tendency`.
- `COACH_PREFERENCE_VALUES`, le slot filler, le generator, l'intake et le
  payload builder rejettent/ignorent les quatre anciennes clés backend-only.
- `runtime_policy.ts` ne charge plus de préférences invisibles ni de règles
  conditionnelles comme contraintes composer.
- `run.ts` ne lit plus ces clés depuis `user_profile_facts` pour appliquer des
  préférences de style persistantes; seules les demandes ponctuelles explicites
  du tour restent traitées comme contraintes locales de réponse.
- Les tests `update_coach_preferences` couvrent maintenant le comportement
  attendu : longueur/emoji/question finale/action-first ne créent pas de
  préférence durable hors UI; `mode tunnel` se compile seulement vers les clés
  supportées (`tone`, `question_tendency`).

Vérification locale.

- `update_coach_preferences/tests.ts` : 29 verts.
- `run_product_help_guard.test.ts` : 116 verts.
- `turn_intent_arbitrator.test.ts` : 50 verts.
- `deno check` ciblé sur les fichiers `update_coach_preferences` et
  `_shared/operation_payload_builder.ts`, `router/run.ts` et les tests router
  ciblés : vert.

---

### J6 — Fin de migration A-Z `update_coach_preferences` hors `run.ts`

Couche. Tool skill operation (`update_coach_preferences`) + orchestration
router.

Décision. `run.ts` ne doit plus héberger la compréhension sémantique des
préférences coach ni les helpers d'écriture/status propres au skill. Il peut
continuer à arbitrer les priorités globales, mais le code métier
`update_coach_preferences` vit dans le dossier du skill.

Changement.

- Ajout de `update_coach_preferences/route_guards.ts` pour les gardes
  d'orientation coach-pref encore nécessaires au routage global.
- Ajout de `update_coach_preferences/status.ts` pour les labels, le status
  supporté et le writer DB injecté sous executor.
- Déplacement de `loadCoachQuestionTendencyLow` vers
  `update_coach_preferences/runtime_policy.ts`; `prepare_attack_card` ne dépend
  plus de `router/run.ts` pour cette préférence.
- `run_product_help_guard.test.ts` importe les helpers coach-pref depuis le
  skill au lieu de les importer depuis `run.ts`.
- `run.ts` ne contient plus les helpers preview, approval, verification,
  direction-contradiction, writer DB direct ou labels coach-pref.

Vérification locale.

- `update_coach_preferences/tests.ts` : 29 verts.
- `run_product_help_guard.test.ts` : 79 verts.
- `turn_intent_arbitrator.test.ts` : 50 verts.
- `deno check` ciblé sur `update_coach_preferences`, `prepare_attack_card`,
  `router/run.ts` et les tests router ciblés : vert.
- `rg` sur les anciennes clés backend-only et sur les métadonnées runtime
  conditionnelles : aucun match actif côté `supabase/functions/**/*.ts`.

---

### J7 — Ledger d'effets committés `update_coach_preferences`

Couche. Tool skill operation (`update_coach_preferences`) + executor + runtime
policy.

Décision. Le tool doit distinguer structurellement un draft, une preview, un
pending confirmation, un commit DB réel et un échec technique. Le signal
`executedTools` ne doit exister que quand un effet DB est effectivement
committé.

Changement.

- Ajout de `UpdateCoachPreferencesCommittedEffect` et de `committed_effects`
  dans le contrat du skill.
- L'executor retourne maintenant `preference_keys` et `preferences_update_ids`
  pour les patchs multi-clés.
- Le router expose `committed_effects` dans le `toolSkillRun`; sur échec
  d'écriture, `executedTools=[]` et `committed_effects=[]`.
- Le writer DB propage toutes les clés écrites, pas seulement la première.
- `runtime_policy.ts` traduit les trois réglages UI en contraintes composer
  explicites: ton, niveau de challenge, tendance à poser des questions.
- `run.ts` injecte ces contraintes runtime depuis `user_profile_facts`, en
  ignorant les anciennes clés backend-only.
- Le status direct du skill ignore les `system_default` et ne les présente pas
  comme préférences choisies par l'utilisateur.

Vérification locale.

- `update_coach_preferences/tests.ts` : 34 verts.
- `turn_intent_arbitrator.test.ts` : 50 verts.
- `deno check` ciblé sur `update_coach_preferences` : vert.
- `deno check` demandé avec `router/run.ts` reste bloqué par des erreurs
  existantes hors périmètre dans `weekly_review/runtime.ts`, `adjust_plan_item`
  et des helpers manquants de `run.ts`.
- `run_product_help_guard.test.ts` ne démarre pas dans l'état actuel du
  worktree, car `weekly_review/runtime.ts` demande un export inexistant
  (`resolveWeeklyForgottenProgressCandidate`). Ce blocage est hors périmètre
  `update_coach_preferences`.

---

### J6 — Nettoyage legacy `select_state_potion` hors dispatcher

Couche. Tool skill operation (`select_state_potion`) + frontière dispatcher.

Changement.

- Les tests de policy potion (`no_potion`, sortie explicite, refus follow-up,
  réponse concrète sans potion) ne vivent plus dans
  `run_product_help_guard.test.ts`; la couverture est portée par
  `select_state_potion/tests.ts`.
- `run.ts` ne prépare plus les fenêtres `recentUserMessages` / `recentMessages`
  spécifiques potion; le router du skill dérive lui-même l'historique utile.
- Le test global ne dépend plus de `select_state_potion/policy.ts`.

Vérification locale.

- `select_state_potion/tests.ts` : 28 verts.
- `run_product_help_guard.test.ts` (`--no-check`) : 79 verts.
- `turn_intent_arbitrator.test.ts` : 50 verts.
- `deno check` ciblé sur `select_state_potion/router.ts`, `policy.ts`,
  `persistence.ts` et `tests.ts` : vert.
- `deno check router/run.ts` : vert.
- `deno check router/run_product_help_guard.test.ts` : vert.

---

### J7 — Suppression du legacy L4 `prepare_defense_card`

Couche. Frontière router L4 / tool skill operation `prepare_defense_card`.

Changement.

- Retrait des helpers regex transitionnels défense
  `isExplicitDefenseCardIntentForTest`, `isDefenseCardExplicitApprovalForTest`,
  `isDefenseCardRevisionForPendingDraftForTest` et
  `isBroadRescueRequestNotDefenseCardForTest`.
- `run.ts` ne force plus une route `prepare_defense_card` depuis le texte user
  et ne bloque plus les faux positifs défense par regex L4.
- `prepare_attack_card/router.ts` évite une route défense via les signaux
  structurés `routeDecision` / `turnFrame`, pas via une lecture texte.
- Les tests router ne couvrent plus ces helpers legacy; la compréhension défense
  reste portée par le slot filler et le router L5 du skill.

Vérification locale.

- `prepare_defense_card/tests.ts` : 13 verts.
- `run_product_help_guard.test.ts` : 79 verts.
- `turn_intent_arbitrator.test.ts` : 50 verts.
- `deno check` ciblé sur `prepare_defense_card/router.ts`,
  `prepare_attack_card/router.ts`, `router/run.ts` et
  `router/run_product_help_guard.test.ts` : vert.

---

### J8 — `emotional_repair` contract L5

Couche. L5 conversation skill.

Symptôme :

- regex sémantiques dans `skill.ts`;
- no-potion encore patché en L4;
- handoff/potion/memory fragile selon formulation.

Fix :

- ajout contrat structuré;
- intake IA/stubbable;
- contraintes `no_potion`, `no_plan`, `do_not_persist_identity_attack`;
- handoff `execution_breakdown` porté par le skill;
- filtrage invariant des suggestions tool.

Tests :

- `acute_self_attack_no_solution_push`;
- `shame_memory_not_persisted_as_identity`;
- `emotion_lowered_handoff_to_execution`;
- `softened_concrete_ask_handoff`;
- `no_potion_blocks_potion_suggestion`;
- `relationship_context_phrase_repair`;
- `recurring_support_only_when_explicit`;
- `no_done_language`;
- `max_one_question`;
- `safety_escalation_not_swallowed`.

Limites :

- Les défenses L4 H1 restent en place temporairement dans `run.ts`; elles
  peuvent être retirées après validation QA globale de ce contrat L5.

---

### J9 — `execution_breakdown` contract L5

Couche. L5 conversation skill.

Symptôme :

- target/blocker/tool suggestion décidés par regex;
- handoff émotionnel fragile;
- réponse trop diagnostique quand user demande un geste concret;
- mauvais choix attack/defense/adjust.

Fix :

- ajout contrat structuré;
- intake IA/stubbable;
- target + blocker + readiness + constraints;
- handoff émotionnel porté par le skill;
- suggestions tool filtrées par consentement et contraintes.

Tests :

- `target_missing_asks_one_question`;
- `concrete_first_request_gives_action`;
- `no_questions_respected`;
- `exact_phrase_requested`;
- `emotion_dominates_handoff`;
- `emotion_present_but_concrete_request_stays_execution`;
- `attack_card_suggested_for_clear_execution_block`;
- `defense_card_suggested_for_recurrent_risk`;
- `adjust_plan_suggested_only_for_too_large_or_explicit`;
- `no_tool_blocks_suggestions`;
- `no_plan_edit_blocks_adjust`;
- `no_done_language`.

Limites :

- Nettoyage aval réalisé ensuite au J15 : les addons conversationnels
  `execution_breakdown` et les overrides L4 associés ont été retirés de
  `router/run.ts`.

---

### J10 — `demotivation_repair` contract L5

Couche. L5 conversation skill.

Symptôme :

- regex métier dans le skill;
- handoff execution fragile;
- potion/rappel proposés selon mots-clés;
- plan edit trop proche de la démotivation.

Fix :

- ajout contrat structuré;
- intake IA/stubbable;
- motivation_state + action_readiness;
- contraintes no_potion/no_tool/no_plan_edit;
- handoff execution seulement si action prête;
- suggestions tool filtrées par consentement.
- suppression du legacy `motivation_repair` dans `recommendation_tool`;
- `run.ts` laisse les `operation_suggestions` du skill passer avant tout
  recommendation tool et ne relance plus ce tool pour `demotivation_repair`.

Tests :

- `demotivation_repair fatigue_drop_no_moralizing`;
- `demotivation_repair loss_of_meaning_stays_demotivation`;
- `demotivation_repair failure_accumulation_no_identity_freeze`;
- `demotivation_repair concrete_action_ready_handoff`;
- `demotivation_repair hypothetical_action_no_handoff`;
- `demotivation_repair no_potion_blocks_potion`;
- `demotivation_repair no_tool_blocks_all_suggestions`;
- `demotivation_repair recurring_support_only_when_explicit`;
- `demotivation_repair plan_edit_only_when_explicit`;
- `demotivation_repair no_done_language`.
- `recommendation_tool covers recommend, operations, clarification, defer and blocked paths`
  couvre maintenant que `motivation_repair` est propriétaire côté skill;
- `operation suggestion access allows demotivation owned operations`;
- `resolver exposes consented potion suggestion`.

Limites :

- `router/run.ts` et les routers L3/L4 ne reçoivent aucun nouveau `if`
  sémantique pour ce chantier. La défense restante côté routing/run.ts est donc
  uniquement l'existant global: le skill filtre ses propres handoffs et
  suggestions, mais les arbitrages globaux déjà présents restent hors scope.

---

### J11 — `daily_action_review` skill contract

Couche. Proactive daily skill / shared skill runtime.

Symptôme :

- daily mélange sélection, question, intake, reducer, effects;
- risque de "noté" sans commit;
- partial/missed peuvent manquer reason/still_relevant;
- off-topic/safety/user stop doivent suspendre le flow;
- weekly dépend de données daily propres.

Fix :

- ajout contrat structuré dans `_shared/daily_action_review/contract.ts`;
- séparation progressive selector/opening/intake/reducer/effects autour de
  `daily_action_review.ts` comme façade temporaire;
- `effect_plan` explicite et propagé dans `DailyActionReviewState`;
- invariant no effect without complete slots, evidence_text et confidence
  medium/high;
- writer pending guardé par `effect_plan.allowed`;
- evidence daily exposée à `weekly_progress_review`;
- decider daily formalisé via `DailyBilanPolicyDecision`.

Tests :

- `deno test --allow-env --allow-net --allow-read supabase/functions/_shared/daily_action_review_test.ts`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/_shared/v2-daily-bilan-decider_test.ts`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/_shared/weekly_progress_review_test.ts`;
- `deno check supabase/functions/_shared/daily_action_review.ts supabase/functions/_shared/daily_action_review/contract.ts supabase/functions/_shared/daily_action_review/selector.ts supabase/functions/_shared/daily_action_review/opening.ts supabase/functions/_shared/daily_action_review/intake.ts supabase/functions/_shared/daily_action_review/reducer.ts supabase/functions/_shared/daily_action_review/effects.ts`;
- `deno check supabase/functions/_shared/v2-daily-bilan-decider.ts`;
- `deno check supabase/functions/_shared/weekly_progress_review.ts supabase/functions/whatsapp-webhook/handlers_pending.ts`.

Limites :

- `daily_action_review.ts` reste la façade publique temporaire pour ne pas
  casser `process-checkins` et `whatsapp-webhook`;
- l'écriture DB reste dans `whatsapp-webhook/handlers_pending.ts`, mais elle est
  désormais conditionnée par `effect_plan.allowed`;
- le déplacement vers `supabase/functions/sophia-brain/skills/*` reste hors
  scope de cette itération.

---

### J12 — `safety_crisis` contract L5

Couche. L5 conversation skill critique.

Symptôme :

- signaux, phase, reply et state patch mélangés dans `skill.ts`;
- regex utiles mais non isolées;
- désescalade difficile à auditer;
- sécurité doit rester prioritaire sur product/help/tools.

Fix :

- ajout contrat structuré;
- extraction signals/reducer/renderer;
- intake structuré stubbable;
- overrides conservateurs qui escaladent seulement;
- invariants de désescalade stricte;
- operation_suggestions toujours vide.

Tests :

- `safety_crisis handles varied safety scenarios without product push`;
- `safety_crisis owns phased safety state and exits only after deescalation`;
- `safety_crisis deescalates when means are away and human support is present`;
- `safety_crisis L5 contract keeps conservative safety invariants`;
- `safety reply override lets safety_crisis own the visible answer`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/skills/skills_s3.test.ts`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`;
- `deno check supabase/functions/sophia-brain/skills/safety_crisis/skill.ts supabase/functions/sophia-brain/skills/safety_crisis/contract.ts supabase/functions/sophia-brain/skills/safety_crisis/signals.ts supabase/functions/sophia-brain/skills/safety_crisis/intake.ts supabase/functions/sophia-brain/skills/safety_crisis/reducer.ts supabase/functions/sophia-brain/skills/safety_crisis/renderer.ts`.

Limites :

- garde-fous déterministes conservés volontairement dans `signals.ts` comme
  conservative safety overrides;
- ces overrides peuvent forcer danger immédiat, moyens proches ou solitude, mais
  ne peuvent pas forcer `resolved`;
- `skill_router.ts`, `routers.ts` et `router/run.ts` restent inchangés côté
  sémantique safety: la priorité globale existante est préservée, le flow
  interne est traité en L5.

---

### J13 — `track_progress_plan_item` direct effect contractuel

Couche. Direct effect always-on minimal.

Symptôme :

- le module avait déjà un router et un ledger `committed_effects`, mais le vieux
  coeur `runTrackProgressPlanItemV2` gardait encore l'inférence statut;
- le writer DB pouvait encore porter une phrase visible;
- la correction `weekly_forgotten_progress` écrivait via le writer sans exposer
  le même contrat d'effet;
- le runtime devait éviter tout "note/enregistre/marque" sans commit confirmé.

Fix :

- ajout du ledger complet
  `requested_effects -> allowed_effects ->
  committed_effects`;
- extraction `intake.ts` pour statut/future/status_question, avec fallback regex
  marque `TRANSITIONAL` et limite au payload direct-effect explicite;
- extraction `renderer.ts` et invariant no "note/enregistre/marque/valide" hors
  `logged_progress_id`;
- `db.ts` ne rend plus de message utilisateur sur un commit logged, seulement
  l'id via le writer;
- `runTrackProgressPlanItemV2` devient une façade legacy qui délègue au router
  contractuel;
- adapter `runTrackProgressPlanItemFromWeeklyCorrection` pour que le weekly
  oublié produise le même contrat de commit;
- clé runtime canonique `__track_progress_plan_item_runtime`, sans
  `__track_progress_parallel`.

Tests :

- `track_progress_plan_item direct effect router returns canonical logged commits`;
- `track_progress_plan_item direct effect router blocks unsafe or ambiguous writes`;
- `track_progress_plan_item direct effect router fails closed without logged_progress_id`;
- `track_progress_plan_item direct effect router fails closed when writer throws`;
- `weekly forgotten progress uses track_progress commit contract`;
- `track_progress_plan_item runtime state uses canonical key only`.

Limites :

- les regex de statut restent uniquement en fallback transitoire local a
  `intake.ts`;
- le weekly reste un effet distinct côté UX/runtime, mais son écriture passe par
  le même contrat de commit track_progress.

---

### J13 — `product_help` contract L5

Couche. L5 conversation skill.

Symptôme :

- feature/intent/pronom décidés par heuristiques;
- direct replies hardcodées carte/rappel;
- confusion status vs product_help vs tool action;
- affirmations produit parfois non-grounded.

Fix :

- ajout contrat structuré;
- intake IA/stubbable;
- séparation catalog retrieval / target decision / renderer;
- invariants non-mutants;
- bridge tool sans exécution;
- grounding par catalogue + sources DB/recent effects.

Tests :

- `product_help scenarios never start operations`;
- `product_help tool action requests are bridge only, never execution`;
- `product_help status question is not rendered as generic catalog help`;
- `product_help modify/cancel location stays product help and non-mutating`;
- `product_help catalog covers defense free creation and potion follow-up`;
- `product_help catalog reflects dashboard action corrections`;
- `product_help: user asks about the card when context has a recent reminder → card reply (A2-r4 T7)`;
- `product_help: user asks about the reminder only → reminder reply (negative control)`;
- `product_help: current reminder mention wins over recent card`;
- `product_help: user pronoun 'la' for the recently created card still resolves to card`;
- `product_help active flow is preserved for inline product question`;
- `product_help no done language without committed source`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/skills/skills_s3.test.ts`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`;
- `deno check supabase/functions/sophia-brain/skills/product_help/skill.ts supabase/functions/sophia-brain/skills/product_help/contract.ts supabase/functions/sophia-brain/skills/product_help/intake.ts supabase/functions/sophia-brain/skills/product_help/retrieval.ts supabase/functions/sophia-brain/skills/product_help/renderer.ts`.

Limites :

- protections L3/L4 transitionnelles conservées temporairement:
  `detectsExplicitProductHelp`, priorités status/product_help existantes,
  nettoyage tempMemory et inline resume active-flow;
- pas de nouveau patch sémantique ajouté dans L3/L4/run.ts;
- l'intake reste déterministe/stubbable dans cette itération, avec candidats
  catalogue explicites et décision structurée validée par contrat;
- les projections DB réelles restent consommées seulement quand elles sont
  disponibles dans le contexte; sinon la réponse refuse d'affirmer l'objet
  exact.

---

### J14 — `weekly_review` skill contract

Couche. Proactive weekly skill / shared skill runtime.

Symptôme :

- weekly mélange projection, stratégie, patch, confirmation, application et
  rendu;
- risque d'application sans confirmation;
- actions faites parfois reportées;
- low evidence peut produire une décision trop forte;
- wording "corrigé/validé" peut précéder le commit.

Fix :

- ajout contrat structuré `weekly_review_v1`;
- séparation projection/evidence/reducer/plan_patch/confirmation/effects/
  renderer;
- `plan_patch` toujours confirmé;
- effect ledger weekly avec writer injectable;
- invariants completed item / level objective / low evidence.

Tests :

- ajout `weekly_review_test.ts` : 28 tests reducer, confirmation, effects,
  renderer, daily integration, safety/off-topic;
- ajout projection : daily evidence par `occurrence_id`, plans non confirmés
  ignorés, statuts done/partial/missed/not_answered/rescheduled;
- lancés : `deno test --allow-env --allow-net --allow-read`
  `weekly_review_test.ts`, `weekly_progress_review_test.ts`,
  `weekly_adaptive_review_test.ts`, `v2-weekly-bilan-engine_test.ts`,
  `weekly_planning_confirmation_test.ts` : 67 verts;
- lancés : `deno check` sur les fichiers weekly existants et `weekly_review/*` :
  vert.

Limites :

- `weekly_adaptive_review.ts` reste une façade temporaire pour préserver les
  imports et états existants;
- `weekly_progress_review.ts` reste la projection factuelle principale, avec
  ré-export dans `weekly_review/projection.ts`;
- `weekly_adaptive_review_opening_test.ts` n'existe pas dans ce checkout; la
  validation d'ouverture reste couverte par `weekly_adaptive_review_test.ts`;
- l'application DB réelle du patch weekly reste à brancher sur les writers
  métier existants; la couche `effects` formalise le ledger et l'injection.

---

### J15 — `weekly_review` runtime hors `run.ts`

Couche. L5 proactive weekly skill / router glue cleanup.

Symptôme :

- `run.ts` contenait encore les guards de rendu weekly, l'état tempMemory du
  weekly, les addons de contexte, les bridges adjust-plan et le log des actions
  oubliées;
- le legacy weekly pouvait polluer `run.ts` avec de la logique conversationnelle
  métier au lieu de rester dans le skill;
- migration `weekly_review_v1` incomplète : contrat partagé créé, mais runtime
  toujours porté par le router central.

Fix :

- ajout `sophia-brain/skills/weekly_review/runtime.ts`;
- déplacement des guards de rendu, state helpers, addon weekly, routing bridge
  adjust-plan, confirmation early weekly et forgotten progress runtime;
- `run.ts` ne conserve que les appels d'orchestration et imports du runtime;
- suppression de l'import direct `adjust_plan_item/weekly_bridge.ts` depuis
  `run.ts`.

Tests :

- `deno check supabase/functions/sophia-brain/skills/weekly_review/runtime.ts
  supabase/functions/sophia-brain/router/run.ts`
  : vert;
- `deno test --allow-env --allow-net --allow-read`
  `supabase/functions/_shared/weekly_review_test.ts`
  `supabase/functions/_shared/weekly_adaptive_review_test.ts`
  `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/router_test.ts`
  : 42 verts;
- `deno test --allow-env --allow-net --allow-read --filter
  "resolveWeeklyForgottenProgressCandidate"
  supabase/functions/sophia-brain/router/run_test.ts`
  : 2 verts.

Limites :

- `run.ts` garde les points d'appel nécessaires au pipeline central
  (`shouldKeepWeeklyAdaptiveReviewInConversation`,
  `maybeLogWeeklyForgottenProgressParallel`, cleanup de réponse et mise à jour
  tempMemory), mais leur logique vit dans le module weekly;
- `run_test.ts` complet reste rouge sur 3 tests non-weekly dans ce checkout
  (`attack card opportunity`, `adjust plan draft review` sans `OPENAI_API_KEY`,
  `broad pause with V2 item status`), non traités dans ce chantier;
- quelques helpers génériques non-weekly
  (`attachPendingRecommendationOperation`, `isOperationEscapeMessage`) restent
  dans `run.ts` car ils servent plusieurs opérations hors périmètre weekly.

---

### J15 — `execution_breakdown` run.ts legacy cleanup

Couche. L4 cleanup / L5 conversation skill boundary.

Symptôme :

- `router/run.ts` gardait deux addons conversationnels `execution_breakdown`;
- un guard de brièveté WhatsApp recoupait le `response_contract` du skill;
- deux overrides L4 forçaient `execution_breakdown` vers `normal_reply` selon
  des regex locales;
- le helper `isLocalMemoryReformulationRequestForTest` restait dans `run.ts`
  alors qu'il ne devait plus arbitrer ce skill.

Fix :

- retrait des addons `execution_breakdown` de
  `buildRouteDecisionConversationAddon`;
- suppression du guard `applyExecutionBreakdownBrevityGuard` et de son appel;
- suppression des overrides `local_memory_reformulation_not_execution_breakdown`
  et `immediate_mode_request_not_execution_breakdown`;
- suppression du helper/test legacy `isLocalMemoryReformulationRequestForTest`;
- conservation uniquement du câblage nécessaire : import du skill et dispatch
  `runConversationSkillForRecommendation`.

Tests :

- `deno check supabase/functions/sophia-brain/router/run.ts`;
- `deno check supabase/functions/sophia-brain/skills/execution_breakdown/skill.ts`;
- `deno test --allow-env --allow-net --allow-read --filter "execution_breakdown" supabase/functions/sophia-brain/skills/skills_s3.test.ts`.

Limites :

- Les autres gardes L4 non spécifiques à `execution_breakdown` restent hors
  périmètre de ce cleanup.

---

### J19 — `execution_breakdown` structured intake finalization

Couche. L5 conversation skill.

Symptôme :

- le contrat `execution_breakdown` existe déjà, mais l'intake principal reste
  déterministe/lexical ;
- `prompt.ts` n'est pas réellement utilisé comme intake IA ;
- les tests valident surtout le fallback lexical ;
- le skill peut encore dépendre de listes de mots pour target/blocker/tool
  choice.

Fix :

- remplacement de l'intake principal par un intake IA JSON strict via
  `generateWithGemini` et `EXECUTION_BREAKDOWN_PROMPT` ;
- fallback technique conservateur sans suggestion tool ;
- `runExecutionBreakdownSkill` rendu async ;
- tests basés sur `intake_model` stubbé ;
- invariants limités à validation/filtrage contractuel ;
- sanitizer limité à la forme et à la sûreté de la réponse.

Tests :

- `execution_breakdown uses structured intake model`;
- `execution_breakdown model failure is conservative and non-mutating`;
- `execution_breakdown contract owns target blocker constraints and tool suggestions`;
- `execution_breakdown prompt contract includes priority rules`;
- lancé :
  `deno check supabase/functions/sophia-brain/skills/execution_breakdown/skill.ts supabase/functions/sophia-brain/skills/execution_breakdown/intake.ts supabase/functions/sophia-brain/skills/execution_breakdown/contract.ts`
  ;
- lancé :
  `deno test --no-check --allow-env --allow-net --allow-read --filter "execution_breakdown" supabase/functions/sophia-brain/skills/skills_s3.test.ts`.

Limites :

- Aucun fallback lexical n'est conservé dans le chemin normal de production ;
  l'échec IA retourne `conservativeExecutionDecision` sans tool suggestion ;
- la commande demandée avec type-check global de `skills_s3.test.ts` reste
  bloquée par des erreurs hors périmètre dans `emotional_repair/renderer.ts` et
  les tests `product_help` qui appellent un skill async sans `await` ;
- `deno check ... router/run.ts` reste bloqué par erreurs hors périmètre
  `emotional_repair` / `product_help` importées par `run.ts`.

---

### J16 — Retrait legacy L4 `emotional_repair`

Couche. Frontière L4/L5 conversation skill.

Symptôme :

- `run.ts` injectait encore un addon conversationnel `emotional_repair`;
- un guard final retirait des offres potion/carte depuis la réponse visible;
- la reply structurée du skill n'était pas encore utilisée directement.

Fix :

- suppression de l'addon `emotional_repair` dans `run.ts`;
- suppression du helper legacy `emotionalRepairContext`;
- suppression du guard `applyShortRepairNoProductOfferGuardForTest`;
- câblage non sémantique de la `reply` du skill `emotional_repair` comme réponse
  visible quand la route est `conversation_handler/emotional_repair`.

Tests :

- `emotional_repair visible reply is owned by the skill`;
- tests ciblés `emotional_repair` dans `skills_s3.test.ts`.

Limites :

- Les autres guards L4 non spécifiques `emotional_repair` restent hors périmètre
  de ce chantier.

---

### J12 — `adjust_plan_item` committed effects contract

Couche. Tool skill `adjust_plan_item` / router L5.

Symptôme :

- le router exécutait déjà via l'executor, mais le résultat métier ne prouvait
  pas explicitement qu'un patch avait été durablement écrit;
- `executedTools: ["adjust_plan_item"]` restait couplé au statut runtime plutôt
  qu'à un ledger d'effet committé;
- `run.ts` injectait encore des helpers qui appartiennent maintenant aux modules
  du skill (`draft_review.ts`, `weekly_bridge.ts`).

Fix :

- ajout de `AdjustPlanCommittedEffect` et `committed_effects` dans
  `adjust_plan_item/contract.ts`;
- adapter runtime du router basé sur le résultat contractuel: `executedTools`
  n'est rempli que si `committed_effects.length > 0`;
- succès executor enrichi avec `operation_id`, `plan_patch_id`,
  `bridge_plan_item_id` et le draft committé;
- chemins blocked/revised/explained/cancelled gardent un ledger vide;
- defaults internes du router pour renderer, draft review et builders weekly, ce
  qui réduit les deps métier venant de `run.ts`.

Tests :

- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/adjust_plan_item/router_test.ts`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/adjust_plan_item/tests.ts`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/adjust_plan_item/draft_compiler_test.ts`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/adjust_plan_item/candidate_builder_test.ts`;
- `deno check supabase/functions/sophia-brain/tools/operations/adjust_plan_item/router.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/contract.ts`.

Limites :

- le check global `run.ts + adjust_plan_item/router.ts` est encore bloqué par
  des erreurs préexistantes hors chantier (`prepare_attack_card` et
  exports/symboles manquants dans `run.ts`);
- `run.ts` conserve encore les politiques globales de route admission et le
  writer DB; le skill possède le ledger d'exécution, mais pas encore tout l'IO
  global.

---

### J13 — `select_state_potion` contract-driven router

Couche. Tool skill `select_state_potion` / router L5.

Changement.

- `contract.ts` porte maintenant `constraints`, `effect_ledger` et
  `committed_effects`.
- Le router produit un `SelectStatePotionSkillResult` puis l'adapte au runtime
  attendu par `run.ts`.
- `no_potion` est représenté comme contrainte structurée et bloque explicitement
  `activate_state_potion`.
- Le refus de suivi devient une contrainte `no_followup` et se retrouve dans
  l'effet autorisé via `suppress_follow_up_scheduling: true`.
- Activation réussie : `requested_effects`, `allowed_effects` et
  `committed_effects` contiennent l'effet potion et les ids committés.
- Activation bloquée : aucun `committed_effects`, aucun `executedTools`.
- `policy.ts` distingue les `hardConsentGuards` déterministes des
  `legacySemanticDetectors` transitionnels.
- La détection de handoff one-shot est sortie du router vers `policy.ts` et
  marquée legacy.
- Ajout d'un reducer léger `reducePotionDraftReview` pour unifier
  approve/reject/revise/explain/unclear avant adaptation runtime.

Tests.

- `select_state_potion/tests.ts` : 30 verts.
- `deno check select_state_potion/router.ts contract.ts` : vert.

Limites.

- `deno check router/run.ts` et `run_product_help_guard.test.ts` restent bloqués
  par des erreurs globales hors potion dans les chantiers parallèles
  (`weekly_review/runtime.ts`, `prepare_attack_card`, `run.ts` exports/imports).

---

### J14 — `product_help` legacy cleanup in `run.ts`

Couche. L4 rendu / L5 conversation skill boundary.

Symptôme :

- `run.ts` contenait encore un addon `PRODUCT_HELP` qui demandait au composer
  global de réécrire une réponse déjà produite par `product_help`;
- `run.ts` contenait aussi un override direct spécialisé
  `directProductHelpReplyOverrideForTest`;
- ce legacy gardait une logique one-shot-reminder/product_help dans le routeur
  alors que le renderer L5 possède maintenant le contrat grounded.

Fix :

- suppression de l'addon `buildProductHelpKnowledgeAddon`;
- suppression de `directProductHelpReplyOverrideForTest`;
- `directConversationSkillReplyOverrideForTest` devient générique: quand la
  route finale correspond au `skill_id`, la réponse visible vient directement du
  skill L5;
- `product_help` ne repasse plus par une recomposition LLM dans `run.ts`.

Tests :

- `conversation skill reply override lets product_help own its factual answer`;
- `deno test --no-check --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/skills/skills_s3.test.ts`;
- `deno check supabase/functions/sophia-brain/skills/product_help/skill.ts supabase/functions/sophia-brain/skills/product_help/contract.ts supabase/functions/sophia-brain/skills/product_help/intake.ts supabase/functions/sophia-brain/skills/product_help/retrieval.ts supabase/functions/sophia-brain/skills/product_help/renderer.ts`.

Limites :

- les guards globaux `routeIsProductHelp` qui empêchent status/recap/tool
  composers d'écraser une route product_help sont conservés temporairement;
- `deno test` sans `--no-check` sur `run_product_help_guard.test.ts` reste
  bloqué par des erreurs globales hors product_help dans `weekly_review/runtime`
  et des exports/imports `run.ts` en chantier parallèle;
- aucun nouveau patch sémantique n'a été ajouté dans L3/L4.

---

### J15 — `prepare_defense_card` contract-driven finalization

Couche. Tool skill operation (`prepare_defense_card`).

Changement.

- Le contrat expose maintenant `PrepareDefenseCardCommittedEffect` et
  `committed_effects`.
- Le chemin de création produit un résultat contractuel puis l'adapte en
  `OperationRuntimeResult`; `executedTools=["prepare_defense_card"]` n'est émis
  que si `committed_effects` contient un `defense_card_id`.
- Les chemins blocked/failed/draft/explain/reject/revise restent sans
  `committed_effects` et sans `executedTools`.
- L'executor ne construit plus la phrase visible de succès; il retourne un
  résultat technique `{ status: "executed", defense_card_id }`.
- Le rendu visible est déplacé dans `renderer.ts`; le message “C'est fait” n'est
  produit que sur commit DB confirmé.
- La persistence SQL est extraite dans `persistence.ts`.

Tests.

- `prepare_defense_card/tests.ts` : 17 verts.
- `deno check` ciblé sur `prepare_defense_card/router.ts`, `contract.ts`,
  `executor.ts`, `renderer.ts`, `persistence.ts`, `tests.ts` : vert.
- `turn_intent_arbitrator.test.ts` : 50 verts.
- `deno check router/run.ts` : vert après corrections de typage minimales
  nécessaires dans les dépendances weekly.

Limite.

- `run_product_help_guard.test.ts` est à 76/77 verts; l'échec restant concerne
  le chantier product_help (`conversation skill reply override...`) et n'est pas
  lié à `prepare_defense_card`.

---

### J16 — Nettoyage legacy `daily_action_review` hors `run.ts`

Couche. Proactive daily/weekly handoff + frontière `router/run.ts`.

Symptôme :

- `run.ts` ne contenait plus le daily collector, mais gardait encore du parsing
  weekly forgotten progress lié au handoff daily -> weekly;
- le test router importait encore ce parsing depuis `run.ts`;
- l'état weekly actif était résolu depuis `run.ts`, ce qui gardait une dette de
  skill runtime dans la couche globale.

Fix :

- déplacement du résolveur `weeklyAdaptiveReviewStateForTurn` vers
  `adjust_plan_item/weekly_bridge.ts`;
- déplacement du parsing `resolveWeeklyForgottenProgressCandidate(s)` vers
  `adjust_plan_item/weekly_bridge.ts`;
- `weekly_review/runtime.ts` réexporte les helpers du bridge au lieu de garder
  une copie locale;
- `run.ts` n'exporte plus `resolveWeeklyForgottenProgressCandidate`;
- `run_test.ts` importe le helper depuis le bridge propriétaire.

Tests :

- `deno check supabase/functions/sophia-brain/tools/operations/adjust_plan_item/weekly_bridge.ts supabase/functions/sophia-brain/skills/weekly_review/runtime.ts supabase/functions/sophia-brain/router/run.ts supabase/functions/sophia-brain/router/run_test.ts`;
- `deno test --allow-env --allow-net --allow-read --filter "resolveWeeklyForgottenProgressCandidate" supabase/functions/sophia-brain/router/run_test.ts`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/_shared/daily_action_review_test.ts`.

Limites :

- le run complet
  `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_test.ts`
  reste rouge sur 3 tests hors périmètre (`attack card opportunity`,
  `adjust plan draft review` sans clé OpenAI,
  `writePlanAdjustmentPatch broad pause`);
- `run.ts` garde encore des appels au runtime weekly, mais plus le parsing
  legacy ni les exports de test de ce périmètre.

---

### J17 — `daily_action_review` committed effects ledger

Couche. Proactive daily skill / writer boundary.

Symptôme :

- J11 avait posé le contrat `daily_action_review_v1` et `effect_plan`;
- `effect_plan.allowed` protégeait l'application, mais ne prouvait pas ce qui
  avait réellement été écrit;
- `handlers_pending.ts` pouvait encore finir le pending sur une intention
  d'écriture plutôt que sur un ledger explicite de commit/idempotence.

Fix :

- ajout `DailyReviewCommittedEffect`, `DailyReviewFailedEffect` et
  `DailyReviewEffectsResult` au contrat;
- ajout `daily_action_review/executor.ts` pour transformer `effect_plan.effects`
  en `committed_effects` / `failed_effects`;
- ajout `daily_action_review/renderer.ts` pour empêcher le langage "noté" sans
  commit complet;
- `handlers_pending.ts` écrit désormais par effet, retourne un commit ledger,
  traite une entry existante comme commit idempotent explicite
  `commit_status=already_existing`, et ne marque le pending done que si tous les
  effets attendus sont commités;
- le résultat d'exécution est persisté dans le payload sous
  `daily_review_effects_result`.

Tests :

- `effect_plan_not_allowed_no_write`;
- `successful_write_returns_committed_effect`;
- `writer_failure_no_committed_effect`;
- `partial_success_does_not_claim_all_done`;
- `already_existing_entry_is_handled_explicitly`;
- `final_done_language_requires_committed_effect`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/_shared/daily_action_review_test.ts`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/_shared/v2-daily-bilan-decider_test.ts`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/_shared/weekly_progress_review_test.ts`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/_shared/weekly_review_test.ts`;
- `deno check supabase/functions/_shared/daily_action_review.ts supabase/functions/_shared/daily_action_review/contract.ts supabase/functions/_shared/daily_action_review/effects.ts supabase/functions/_shared/daily_action_review/executor.ts supabase/functions/_shared/daily_action_review/renderer.ts supabase/functions/whatsapp-webhook/handlers_pending.ts`.

Limites :

- `handlers_pending.ts` garde encore la logique DB détaillée
  `applyDailyOccurrenceOutcome` + insert `user_plan_item_entries`;
- l'executor est volontairement un adapter léger autour du writer existant, mais
  le résultat d'exécution expose maintenant `committed_effects` et
  `failed_effects`.

---

### J21 — `emotional_repair` safe renderer and memory finalization

Couche. L5 conversation skill.

Symptôme :

- le contrat et l'intake IA existent déjà ;
- mais une erreur d'intake/validation peut produire une sortie technique sans
  réparation visible ;
- les memory candidates peuvent encore transporter le texte brut d'une
  auto-attaque ;
- le prompt impose encore un emoji visible.

Fix :

- ajout d'un renderer/fallback conservateur non-mutant ;
- échec intake -> réponse émotionnelle safe, pas exit vide ;
- validation reply KO -> fallback visible conforme au contrat ;
- sanitization/drop des memory candidates d'auto-attaque ;
- prompt aligné avec les contraintes runtime, sans emoji obligatoire.

Tests :

- `emotional_repair_intake_failure_returns_safe_reply` ;
- `emotional_repair_invalid_reply_uses_safe_renderer` ;
- `emotional_repair_question_budget_fallback` ;
- `emotional_repair_no_potion_filters_reply_and_suggestion` ;
- `emotional_repair_identity_attack_memory_redacted_or_dropped` ;
- `emotional_repair_relationship_memory_can_be_contextual` ;
- `emotional_repair_prompt_does_not_force_emoji` ;
- `emotional_repair_safety_still_wins` ;
- `emotional_repair_handoff_execution_kept`.

Limites :

- le skill continue à dépendre d'un intake IA en chemin normal, avec fallback
  conservateur en cas d'échec ;
- les erreurs de type-check globales liées aux chantiers weekly/adjust_plan
  restent hors périmètre de cette finalisation.

---

### J22 — `weekly_review_v1` integration finalization

Couche. Proactive weekly skill / shared runtime integration.

Symptôme :

- le contrat weekly existe déjà dans `_shared/weekly_review/*`;
- certaines façades weekly pouvaient encore porter du wording ou une stratégie
  parallèle;
- risque de wording "appliqué/validé/corrigé" sans committed effect;
- confirmation/application doivent être garanties par le contrat et le ledger.

Fix :

- `weekly_adaptive_review.ts` reste une façade mais délègue la stratégie à
  `reduceWeeklyReview`;
- `buildWeeklyAdaptiveReviewMessage` rend désormais via
  `renderWeeklyReviewDecision`;
- confirmation weekly centralisée via `reviewWeeklyPatchConfirmation`;
- application weekly centralisée via `applyWeeklyReviewEffects`;
- bridge `adjust_plan_item` testé explicitement pour ne pas afficher d'ack
  positif sans committed effect;
- `v2-weekly-bilan-engine.ts` documenté comme materializer legacy transitionnel,
  hors chemin `weekly_review_v1`.

Tests :

- ajout `weekly_adaptive_review_delegates_to_weekly_review_reducer`;
- ajout `weekly_adaptive_review_message_uses_weekly_review_renderer`;
- ajout `weekly_adjust_plan_bridge_requires_commit_before_ack`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/_shared/weekly_review_test.ts supabase/functions/_shared/weekly_progress_review_test.ts supabase/functions/_shared/weekly_adaptive_review_test.ts`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/_shared/v2-weekly-bilan-engine_test.ts supabase/functions/_shared/weekly_planning_confirmation_test.ts`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/adjust_plan_item/router_test.ts`;
- `deno check supabase/functions/_shared/weekly_review/contract.ts supabase/functions/_shared/weekly_review/evidence.ts supabase/functions/_shared/weekly_review/reducer.ts supabase/functions/_shared/weekly_review/plan_patch.ts supabase/functions/_shared/weekly_review/confirmation.ts supabase/functions/_shared/weekly_review/effects.ts supabase/functions/_shared/weekly_review/renderer.ts supabase/functions/_shared/weekly_progress_review.ts supabase/functions/_shared/weekly_adaptive_review.ts supabase/functions/_shared/weekly_adaptive_review_opening.ts supabase/functions/_shared/v2-weekly-bilan-engine.ts supabase/functions/_shared/weekly_planning_confirmation.ts supabase/functions/sophia-brain/skills/weekly_review/runtime.ts supabase/functions/sophia-brain/router/run.ts`.

Limites :

- `weekly_adaptive_review_opening_test.ts` n'existe pas dans ce checkout;
- `weekly_adaptive_review_opening.ts` reste une génération d'ouverture
  conversationnelle encadrée par guard, pas un rendu déterministe pur;
- `weekly_review/runtime.ts` garde des guards transitionnels de conversation,
  mais `run.ts` ne porte plus le parsing weekly legacy du périmètre.

---

### J20 — `safety_crisis` structured intake finalization

Couche. L5 conversation skill critique.

Symptôme :

- l'architecture safety contract/signals/reducer/renderer existe déjà ;
- mais l'intake structuré réel n'est pas encore branché en production ;
- le prompt safety reste orienté réponse visible et contient une règle emoji
  incohérente ;
- les tests couvrent surtout les overrides/reducer, moins la compréhension IA
  structurée.

Fix :

- ajout d'un intake IA JSON strict via `generateWithGemini` et le modèle global
  ;
- fallback d'échec conservateur avec `uncertainty=high`, jamais de désescalade ;
- overrides déterministes conservés comme garde-fous d'escalade ou de maintien ;
- prompt aligné avec le contrat `SafetySignal`, sans emoji obligatoire ;
- renderer confirmé comme seul propriétaire de la réponse visible ;
- runtime safety vérifié pour suppression des tools/direct effects et sortie
  safety uniquement sur `status=exit` + `phase=resolved`.

Tests :

- `safety_crisis structured intake finalization cases` ;
- `safety route suppresses tool signals and direct effects` ;
- `active safety flow caution keeps at least medium risk` ;
- `active safety flow cannot be downgraded by safe reminder exception` ;
- `deno test --allow-env --allow-net --allow-read --filter "safety_crisis" supabase/functions/sophia-brain/skills/skills_s3.test.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`
  ;
- `deno check supabase/functions/sophia-brain/skills/safety_crisis/skill.ts supabase/functions/sophia-brain/skills/safety_crisis/contract.ts supabase/functions/sophia-brain/skills/safety_crisis/signals.ts supabase/functions/sophia-brain/skills/safety_crisis/intake.ts supabase/functions/sophia-brain/skills/safety_crisis/reducer.ts supabase/functions/sophia-brain/skills/safety_crisis/renderer.ts supabase/functions/sophia-brain/router/safety_crisis_runtime.ts supabase/functions/sophia-brain/skills/product_help/intake.ts`.

Limites :

- les regex de `signals.ts` sont conservées volontairement comme garde-fous
  safety conservateurs ;
- elles peuvent escalader, maintenir ou reconnaître des éléments de
  stabilisation, mais ne peuvent pas résoudre seules le flow.

---

### J23 — `demotivation_repair` structured intake finalization

Couche. L5 conversation skill.

Symptôme :

- le contrat `demotivation_repair` existe déjà;
- mais le chemin normal d'intake ne branche pas encore de modèle IA;
- sans décision préexistante, le skill tombe sur un fallback conservateur;
- le prompt est présent mais pas utilisé comme intake réel;
- les tests couvrent surtout des décisions stubbées.

Fix :

- ajout d'un intake IA JSON strict et injectable;
- fallback conservateur uniquement en cas d'échec technique;
- `runDemotivationRepairSkill` rendu async et attendu par `router/run.ts`;
- mémoire identitaire négative redacted avant émission comme candidate;
- prompt aligné avec sobriété runtime, sans emoji obligatoire.

Tests :

- `demotivation_repair uses structured intake model`;
- `demotivation_repair intake failure conservative no tool`;
- `demotivation_repair no existing state uses model when available`;
- `demotivation_repair prompt does not force emoji`;
- `demotivation_repair identity memory redacted`;
- `deno test --allow-env --allow-net --allow-read --filter "demotivation_repair" supabase/functions/sophia-brain/skills/skills_s3.test.ts`;
- `deno check supabase/functions/sophia-brain/skills/demotivation_repair/skill.ts supabase/functions/sophia-brain/skills/demotivation_repair/intake.ts supabase/functions/sophia-brain/skills/demotivation_repair/contract.ts supabase/functions/sophia-brain/skills/demotivation_repair/prompt.ts supabase/functions/sophia-brain/router/run.ts`.

Limites :

- le fallback conservateur reste volontairement utilisé quand l'intake IA échoue
  techniquement ou retourne un JSON inexploitable;
- les décisions déjà présentes dans le working state restent acceptées pour la
  reprise d'un état structuré, mais le premier tour sans état passe désormais
  par l'intake IA.

---

### J22 — `product_help` structured intake finalization

Couche. L5 conversation skill.

Symptôme :

- le contrat/retrieval/renderer existent déjà ;
- mais l'intake décide encore intent/object/pronom/bridge par heuristiques
  lexicales ;
- le prompt reste orienté style et force un emoji ;
- les tests couvrent surtout le comportement heuristique.

Fix :

- ajout d'un intake IA JSON strict et injectable ;
- retrieval limité au rôle de candidats catalogue ;
- recent effects transformés en candidats sourcés ;
- fallback conservateur non-mutant ;
- invariants renforcés sur bridge, source objet réel, active flow et no done
  language ;
- prompt aligné avec le contrat produit, sans emoji obligatoire ;
- `run.ts` ne garde aucun legacy product_help et attend seulement le skill
  async.

Tests :

- `product_help uses structured intake model decision` ;
- `product_help intake failure uses non-mutating conservative fallback` ;
- `product_help prompt does not force emoji` ;
- `product_help legacy heuristic intake is not the default structured path` ;
- `product_help scenarios never start operations` ;
- `product_help tool action requests are bridge only, never execution` ;
- `product_help status question is not rendered as generic catalog help` ;
- `product_help modify/cancel location stays product help and non-mutating` ;
- `product_help catalog covers defense free creation and potion follow-up` ;
- `product_help catalog reflects dashboard action corrections` ;
- `product_help active flow is preserved for inline product question` ;
- `product_help no done language without committed source` ;
- `deno test --allow-env --allow-net --allow-read --filter "product_help" supabase/functions/sophia-brain/skills/skills_s3.test.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`
  ;
- `deno check supabase/functions/sophia-brain/skills/product_help/skill.ts supabase/functions/sophia-brain/skills/product_help/contract.ts supabase/functions/sophia-brain/skills/product_help/intake.ts supabase/functions/sophia-brain/skills/product_help/retrieval.ts supabase/functions/sophia-brain/skills/product_help/renderer.ts supabase/functions/sophia-brain/router/run.ts`.

Limites :

- `legacyProductHelpHeuristicIntake` reste exporté uniquement pour tests de
  compatibilité et comparaison d'urgence ;
- le chemin production normal appelle `runProductHelpStructuredIntake` avec
  modèle IA ou fallback conservateur en cas d'échec technique ;
- les protections L3/L4 existantes restent en défense route/status/tool, sans
  nouveau patch sémantique ajouté dans `run.ts`.

---

### J46 — Documentation runtime contract `product_help`

Couche. Documentation d'architecture / Conversation Skill contract-driven.

Symptôme architectural :

- le contrat runtime `conversation-skills/product-help.md` existant restait trop
  sommaire après J13/J22 ;
- il ne décrivait pas précisément le lien avec `UserTurnSnapshot`, `TurnAgenda`,
  `Confirmation Contract`, `EffectLedger` et le contrat local ;
- un agent futur pouvait encore réintroduire une regex métier, un fallback
  lexical production, un bridge transformé en opération ou une réponse status
  dans `product_help`.

Fix réel :

- remplacement complet de
  `docs/agent-playbook/New/runtime-contracts/conversation-skills/product-help.md`
  ;
- ajout de la section `Dépend De L'Architecture De product_help` ;
- documentation des fichiers réels : `contract.ts`, `intake.ts`, `retrieval.ts`,
  `knowledge.ts`, `prompt.ts`, `renderer.ts`, `skill.ts`, `context_loader.ts` et
  l'intégration mince dans `router/run.ts` ;
- clarification du fait que `product_help` n'a ni reducer mutatif, ni effects
  exécutables, ni executor DB ;
- documentation des invariants non négociables : `operation_suggestions=[]`,
  bridge confirmation-only, no done-language sans source, pas de status complet,
  pas de claim d'objet réel sans grounding ;
- documentation de `legacyProductHelpHeuristicIntake` comme exception de test et
  comparaison, pas comme fallback production.

Fichiers modifiés :

- `docs/agent-playbook/New/runtime-contracts/conversation-skills/product-help.md`
  ;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests / vérifications :

- changement documentation uniquement pour J46 ;
- vérification manuelle par lecture de
  `runtime-contracts/00-architecture-doctrine.md`,
  `runtime-contracts/README.md`,
  `runtime-contracts/conversation-skills/product-help.md`,
  `runtime-contracts/03-user-turn-snapshot-agenda.md`,
  `runtime-contracts/04-confirmation-contract.md`,
  `runtime-contracts/05-effect-ledger.md` et `15-chantiers-log.md` ;
- scan `rg` des fichiers `skills/product_help/*`, `skills/skills_s3.test.ts`,
  `router/run.ts` et `router/run_product_help_guard.test.ts` pour citer les
  fonctions et tests réels.

Limites restantes :

- le runtime global passe encore un `SkillContext` composé plutôt qu'un objet
  `UserTurnSnapshot`/`TurnAgenda` unique au skill ;
- `legacyProductHelpHeuristicIntake` reste exporté pour tests de compatibilité
  jusqu'à remplacement des scénarios historiques par fixtures JSON structurées
  ou run QA réel validé ;
- des gardes globales product_help/status/tool restent dans `run.ts` pour
  arbitrage cross-skill, mais le contrat interdit d'y ajouter une nouvelle
  compréhension métier propre à product_help.

### J29 — `EffectLedger` runtime par tour

Couche. Router runtime / observabilité / guard de réponse finale.

Symptôme :

- des réponses pouvaient dire "c'est fait", "préférence enregistrée", "rappel
  programmé" ou équivalent sans preuve structurée de commit ;
- `executed_tools` seul ne distinguait pas suffisamment requested / allowed /
  blocked / committed / failed ;
- preview-only, draft-only ou executor failed pouvaient rester difficiles à
  auditer dans la trace du tour.

Fix :

- ajout de `router/effect_ledger.ts` avec entries `requested`, `allowed`,
  `blocked`, `committed`, `failed` ;
- `run.ts` crée un ledger par tour et l'ajoute à `conversation_turn_trace` ;
- `update_coach_preferences` est ledgerisé depuis les résultats réels exposés
  par le router/executor : draft pending => requested, executor executed =>
  committed `coach_preferences.update`, blocked/failed => blocked/failed ;
- `one_shot_reminder` alimente aussi le ledger depuis ses `requested_effects`,
  `allowed_effects`, `committed_effects` et `blocked_effects` ;
- ajout d'un guard minimal `rewriteUncommittedEffectClaims` pour neutraliser les
  claims durables préférence/rappel/annulation/carte sans commit ledger ;
- `trace_logger` écrit `effect_ledger` quand la colonne existe et garde un
  fallback compatible avec les schémas legacy.

Tests :

- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/update_coach_preferences/tests.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/turn_intent_arbitrator.test.ts`
  ;
- `deno check supabase/functions/sophia-brain/router/effect_ledger.ts supabase/functions/sophia-brain/router/run.ts supabase/functions/sophia-brain/observability/trace_logger.ts`.

Limites :

- le ledger est runtime + trace du tour courant, pas encore une source persistée
  réutilisable entre tours ;
- toutes les familles L5 ne sont pas encore enrichies au même niveau : priorité
  actuelle à `update_coach_preferences` et `one_shot_reminder` ;
- les guards restent volontairement étroits pour éviter de réécrire des réponses
  conversationnelles honnêtes ;
- le status cross-turn devra encore combiner DB actuelle + ledger courant +
  traces récentes quand ce stockage sera disponible.

---

### J24 — Confirmation Contract global, branchement L5 progressif

Couche. L5 Tool Skills avec contrat commun appele depuis les routers, sans ajout
de logique metier dans `run.ts`.

Symptome :

- chaque tool interpretait localement `ok`, `oui`, `non`, `montre`, `explique`,
  `oui mais...` ;
- une confirmation courte pouvait consommer un mauvais pending ;
- les demandes preview/status/explain risquaient d'etre traitees comme des
  validations selon le chemin local.

Fix :

- creation de `router/confirmation_contract.ts` avec `decideConfirmation(...)`
  et decisions typees `approve`, `reject`, `revise`, `preview`, `explain`,
  `status`, `unrelated`, `ambiguous` ;
- ciblage explicite du pending via `operation_id`, `operation_type`,
  `effect_type` et source ;
- `approve.should_execute=true` seulement si le pending est unique, compatible
  et non contredit par revise/reject/preview/explain/status ;
- branchement de `update_coach_preferences` sur les confirmations pending ;
- branchement de `prepare_attack_card` sur les pending pour preview/reject/
  explain/status/unrelated et protection de `revise` contre une execution ;
- conservation des helpers historiques (`isCoachPreferenceExplicitApproval...`,
  draft review locaux) pour compatibilite et migration progressive.

Tests :

- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/confirmation_contract.test.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/update_coach_preferences/tests.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/prepare_attack_card/tests.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/prepare_defense_card/tests.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/turn_intent_arbitrator.test.ts`
  ;
- `deno check supabase/functions/sophia-brain/router/confirmation_contract.ts supabase/functions/sophia-brain/tools/operations/update_coach_preferences/router.ts supabase/functions/sophia-brain/tools/operations/prepare_attack_card/router.ts`.

Limites :

- `prepare_defense_card`, reminders et `select_state_potion` ne sont pas encore
  branches directement au contrat ;
- le contrat accepte deja `agenda_tasks`, mais l'agenda reste seulement utilise
  par tests/unitaires de ciblage dans cette iteration ;
- les helpers locaux de confirmation restent exportes/de facto supportes pendant
  la migration pour eviter un big bang refactor.

---

### J25 — Agenda runtime gate + ledger claims élargis

Couche. L2/L3/L4 orchestration, effet runtime prudent.

Symptome :

- `UserTurnSnapshot` + `TurnAgenda` etaient construits et traces, mais ne
  bloquaient pas encore effectivement les effets au runtime ;
- un vieux flow/pending pouvait survivre a une intention explicite incompatible
  selon les chemins ;
- `EffectLedger` neutralisait surtout preferences/rappels/cartes, mais pas
  encore les claims visibles de potion, plan adjustment ou progress tracking ;
- les pending confirmations generiques du `tool_skill_router` utilisaient encore
  directement `turn_frame.confirmation_response.kind`.

Fix :

- branchement de `resolveFlowInterruptions(...)` dans `router/run.ts` apres la
  route finale et avant les runtimes d'operation ;
- blocage effectif des `direct_effects`, `tool_skill_intents` et du
  `selected_handler` quand l'Agenda marque l'effet `blocked` ;
- nettoyage runtime des active tool flows / pending confirmations quand l'Agenda
  detecte une incompatibilite ;
- `track_progress_plan_item` et `one_shot_reminder` consomment maintenant les
  blocages Agenda pour eviter les mutations always-on hors route principale ;
- enregistrement des requested/blocked Agenda tasks dans `EffectLedger` ;
- passage du pending path generique de `tool_skill_router` par
  `ConfirmationContract` pour valider approve/reject/revise/unrelated ;
- extension prudente de `rewriteUncommittedEffectClaims` aux claims
  `state_potion.activate`, `plan_item.adjust` et `plan_item_progress.track` ;
- `prepare_attack_card` accepte une confirmation structuree pour reprendre une
  recommandation pending meme si la route n'est pas deja `tool_skill`.

Tests :

- `deno check supabase/functions/sophia-brain/router/run.ts` ;
- `deno check supabase/functions/sophia-brain/routers/tool_skill_router.ts` ;
- `deno check supabase/functions/sophia-brain/router/effect_ledger.ts` ;
- `deno check supabase/functions/sophia-brain/index.ts` ;
- `deno check supabase/functions/sophia-brain/tools/operations/prepare_attack_card/router.ts`
  ;
- `deno check supabase/functions/sophia-brain/tools/operations/update_coach_preferences/runtime_policy.ts supabase/functions/sophia-brain/tools/operations/prepare_attack_card/router.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/routers/routers.test.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/turn_agenda.test.ts supabase/functions/sophia-brain/router/user_turn_snapshot.test.ts supabase/functions/sophia-brain/router/confirmation_contract.test.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts supabase/functions/sophia-brain/routers/routers.test.ts supabase/functions/sophia-brain/router/turn_agenda.test.ts supabase/functions/sophia-brain/router/user_turn_snapshot.test.ts supabase/functions/sophia-brain/router/confirmation_contract.test.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts supabase/functions/sophia-brain/router/run_test.ts`
  : `run_product_help_guard` passe, `run_test` garde 2 echecs hors J25
  (`OPENAI_API_KEY missing` sur adjust plan, et broad pause attend 2 operations
  mais obtient 3).

Limites :

- l'Agenda reste un gate prudent, pas encore le seul planificateur complet du
  tour ;
- `EffectLedger` reste par tour courant, non persiste cross-turn ;
- certains tools gardent encore leur review locale en plus du contrat global ;
- les deux echecs restants de `run_test.ts` doivent etre traites dans le
  chantier `adjust_plan_item`/test harness, pas contournes par `run.ts`.

### J30 — `run.ts` thin orchestrator extraction

Couche. Router runtime / orchestration globale.

Symptôme :

- `run.ts` contenait encore routing patches, status rendering, operation chain,
  adjust-plan writer, response guards, recommendation bridge et ledger adapter ;
- les contracts skills existaient mais pouvaient être contournés par `run.ts` ;
- risque de recréer des RED par patch L4 après dispatcher/agenda.

Fix :

- extraction plan snapshot runtime dans `router/plan_snapshot_runtime.ts` ;
- extraction active flow state runtime dans `router/active_flow_state.ts` ;
- extraction effect ledger adapter dans `router/effect_ledger_adapter.ts` ;
- extraction status recap runtime dans `skills/status_recap/runtime.ts` ;
- extraction adjust_plan_item materializer dans
  `tools/operations/adjust_plan_item/materializer.ts` ;
- extraction operation runtime pipeline dans
  `router/operation_runtime_pipeline.ts` ;
- extraction final response pipeline dans `router/final_response_pipeline.ts` ;
- `run.ts` conserve `processMessage` comme façade IO/orchestration, avec
  re-exports de compatibilité pour les tests historiques.

Tests :

- `/usr/local/bin/deno check supabase/functions/sophia-brain/index.ts supabase/functions/sophia-brain/router/run.ts supabase/functions/sophia-brain/router/agent_exec.ts supabase/functions/sophia-brain/router/turn_agenda.ts supabase/functions/sophia-brain/router/user_turn_snapshot.ts supabase/functions/sophia-brain/router/effect_ledger.ts`
  ;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/router/run.ts` ;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts supabase/functions/sophia-brain/router/effect_ledger_adapter_test.ts supabase/functions/sophia-brain/router/active_flow_state_test.ts supabase/functions/sophia-brain/router/final_response_pipeline_test.ts supabase/functions/sophia-brain/router/operation_runtime_pipeline_test.ts`
  ;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/turn_agenda.test.ts supabase/functions/sophia-brain/router/user_turn_snapshot.test.ts supabase/functions/sophia-brain/router/confirmation_contract.test.ts`
  ;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/routers/routers.test.ts supabase/functions/sophia-brain/router/run_product_help_guard.test.ts supabase/functions/sophia-brain/skills/status_recap/status_recap_runtime_test.ts`.

Limites :

- `final_response_pipeline.ts` centralise encore des guards legacy défensifs ;
- les regex transitionnelles restent dans `turn_intent_arbitrator.ts` et dans
  les reducers/guards legacy déjà existants, sans ajout de nouvelle regex dans
  `run.ts`, L3 ou L4 ;
- `weekly_review/runtime.ts` a déjà été éclaté en sous-modules, mais reste une
  zone runtime à durcir progressivement côté contrats/renderer/effects ;
- `recommendation_runtime` et `turn_routing_pipeline` restent à extraire dans
  une passe suivante pour éviter un big bang sur `processMessage`.

---

### J26 — `adjust_plan_item` intake decomposition

Couche. Tool skill durable / plan adjustment workflow.

Symptôme :

- `adjust_plan_item/intake.ts` concentrait compréhension, slot filling,
  stratégie, fallback, confirmation et parfois rendu;
- risque de mini-`run.ts`;
- risque d'application durable depuis état ambigu ou fallback;
- weekly bridge et ajustement direct pouvaient contourner le même contrat
  mental.

Fix :

- ajout/renforcement du contrat `AdjustPlanDecision` avec intent, scope, change,
  draft, missing slots, effect_plan, constraints, reply et state patch;
- extraction `structured_intake.ts`, `scope_resolver.ts`, `reducer.ts`,
  `draft_builder.ts`, `confirmation.ts`, `effects.ts` et `renderer.ts`;
- `intake.ts` devient une façade fine et l'ancien fichier est isolé dans
  `legacy_intake.ts`;
- effect_plan explicite et writer/materializer injectable pour tests;
- no apply without confirmation + committed_effect;
- les branches weekly directes du router déposent maintenant un brouillon
  `draft_review` au lieu d'appeler l'executor dans le même tour.

Tests :

- `deno check supabase/functions/sophia-brain/tools/operations/adjust_plan_item/router.ts`;
- `deno check supabase/functions/sophia-brain/tools/operations/adjust_plan_item/intake.ts`;
- `deno check supabase/functions/sophia-brain/tools/operations/adjust_plan_item/generator.ts`;
- `deno check supabase/functions/sophia-brain/tools/operations/adjust_plan_item/intake.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/structured_intake.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/scope_resolver.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/reducer.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/effects.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/renderer.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/confirmation.ts`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/adjust_plan_item/adjust_plan_item_contract_test.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/adjust_plan_item_reducer_test.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/adjust_plan_item_effects_test.ts`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/adjust_plan_item/tests.ts`;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts`.

Limites :

- `legacy_intake.ts` conserve temporairement les anciens helpers/fallbacks
  déterministes pour préserver les tests et le runtime existants;
- `router.ts` reste une façade hybride: il utilise encore l'intake legacy pour
  générer certains brouillons, mais les branches weekly ne contournent plus la
  confirmation;
- `deno check supabase/functions/sophia-brain/router/run.ts` reste bloqué par
  des erreurs hors périmètre déjà présentes dans le worktree
  (`one_shot_reminder` manquant, conflit local
  `detectsMinuteByMinuteSequenceRequest`, types one-shot/update coach);
- `run_product_help_guard.test.ts` reste bloqué au type-check par les mêmes
  problèmes `run.ts`/one-shot hors périmètre.

### J27 — unified tool confirmation contract

Couche. Tool skills / confirmation runtime.

Symptôme :

- routeur générique utilisait `ConfirmationContract`;
- plusieurs tools gardaient des reviews locales divergentes;
- risque d'application sur explication/révision/topic change;
- confirmations courtes pouvaient être interprétées hors contexte propriétaire.

Fix :

- renforcement de `ConfirmationContract` avec décisions canoniques
  `approve/reject/revise/explain/unrelated/topic_change/unclear`, cible pending
  explicite et aliases transitoires pour compatibilité;
- ajout adapter commun `_shared/confirmation_adapter`;
- migration `prepare_defense_card`, `create_recurring_reminder`,
  `one_shot_reminder`, `adjust_plan_item`, et vérification/alignement léger de
  `select_state_potion` et `update_coach_preferences`;
- chaque tool reste propriétaire de son pending et décide localement la
  transition;
- `approve` ne devient exécutable que si pending clair + confiance medium/high
  - pas de blocage safety/no-tool;
- `revise`, `explain`, `reject`, `unrelated`, `topic_change`, `unclear` ne
  produisent pas d'exécution via l'adapter.

Tests :

- `deno check supabase/functions/sophia-brain/router/confirmation_contract.ts supabase/functions/sophia-brain/routers/tool_skill_router.ts supabase/functions/sophia-brain/tools/operations/_shared/confirmation_adapter.ts supabase/functions/sophia-brain/tools/operations/prepare_defense_card/router.ts supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/router.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/router.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/router.ts supabase/functions/sophia-brain/tools/operations/update_coach_preferences/router.ts supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/router.ts supabase/functions/sophia-brain/router/run.ts`
  : vert;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/confirmation_contract.test.ts supabase/functions/sophia-brain/tools/operations/_shared/confirmation_adapter_test.ts supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/tests.ts supabase/functions/sophia-brain/tools/operations/prepare_defense_card/tests.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/router_test.ts`
  : 59 verts;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/routers/routers.test.ts supabase/functions/sophia-brain/router/run_product_help_guard.test.ts supabase/functions/sophia-brain/router/effect_ledger.test.ts`
  : `routers` et `effect_ledger` verts, `run_product_help_guard` garde 4 échecs
  status/product-help hors périmètre confirmation (`C3`, `I4`, deux `F1`);
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/one_shot_reminder_tool_test.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/tests.ts supabase/functions/sophia-brain/tools/operations/update_coach_preferences/tests.ts`
  : bloqué au type-check par API/export legacy one-shot attendus par le test
  harness (`*ForTest`, `createReminder`, `cancelReminder`, shape `constraints`).

Limites :

- `run.ts` conserve encore un helper global legacy `detectConfirmationKind` hors
  tools; condition de suppression: plus aucun chemin runtime ne doit dépendre du
  classifier global pour appliquer un pending;
- `adjust_plan_item/confirmation.ts` expose un bridge legacy
  `legacyAdjustPlanApproveReview` pour les chemins weekly préexistants;
  condition de suppression: les confirmations weekly doivent passer par un
  pending draft explicite relu par l'intake de validation;
- les reviews IA locales de draft restent propriétaires des tools, mais leur
  résultat passe par l'adapter avant toute décision d'exécution;
- les échecs `run_product_help_guard` et `one_shot_reminder_tool_test` relèvent
  du status/product-help et du réalignement du harness one-shot, pas du contrat
  confirmation.

---

### J28 — `weekly_review/runtime.ts` decomposition

Couche. Weekly conversation skill runtime.

Symptôme :

- `weekly_review/runtime.ts` restait un runtime parallèle lourd;
- guards/rendering/bridge/evidence/state mélangés;
- contrat weekly existant mais pipeline pas encore lisible comme
  projection/evidence/reducer/patch/confirmation/effects/renderer;
- risque de deuxième `run.ts` pour les décisions weekly.

Fix :

- extraction `state.ts`, `renderer.ts`, `guards.ts`, `evidence.ts`,
  `bridges.ts`, `confirmation.ts`, `effects.ts`;
- wrappers locaux fins vers `_shared/weekly_review` pour
  `contract/projection/reducer/plan_patch`;
- `runtime.ts` devient une façade de compatibilité par réexports;
- guards legacy isolés et documentés;
- bridge `adjust_plan_item` produit une demande structurée et ne contourne pas
  le contrat d'application;
- no applied/done language without committed effect via renderer/effects.

Tests :

- `/usr/local/bin/deno check supabase/functions/sophia-brain/skills/weekly_review/runtime.ts`
  : vert;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/router/run.ts` :
  vert;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/tools/operations/adjust_plan_item/weekly_bridge.ts`
  : vert;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/skills/weekly_review/weekly_review_state_test.ts supabase/functions/sophia-brain/skills/weekly_review/weekly_review_renderer_test.ts supabase/functions/sophia-brain/skills/weekly_review/weekly_review_guards_test.ts supabase/functions/sophia-brain/skills/weekly_review/weekly_review_bridges_test.ts supabase/functions/sophia-brain/skills/weekly_review/weekly_review_confirmation_test.ts supabase/functions/sophia-brain/skills/weekly_review/weekly_review_evidence_test.ts`
  : 23 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/_shared/weekly_progress_review_test.ts`
  : 7 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/_shared/weekly_adaptive_review_test.ts`
  : 7 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/_shared/v2-weekly-bilan-engine_test.ts`
  : 23 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/_shared/weekly_planning_confirmation_test.ts`
  : 4 verts;
- `supabase/functions/_shared/weekly_adaptive_review_opening_test.ts` non lancé:
  fichier absent du checkout;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`
  : 79 verts, 4 échecs status/product-help hors périmètre weekly (`C3`, `I4`,
  deux `F1`).

Limites :

- guards legacy conservés: forgotten progress ack, repeated clarification,
  concrete organization, conclusion/validation availability;
- condition de suppression: le renderer/reducer weekly couvre ces invariants
  directement à partir de state/effects commités, sans nettoyage de réponse
  après coup;
- certains helpers sémantiques legacy restent inchangés dans les guards/bridges
  pour préserver les projections/triggers existants;
- `run_product_help_guard.test.ts` garde des échecs product-help/status déjà
  hors workflow weekly.

---

### J30 — card tools technical fallback cleanup

Couche. Tool skills / card generation failure handling.

Symptôme :

- `prepare_attack_card` / `prepare_defense_card` pouvaient tomber sur
  `fallback_dashboard`;
- fallback fragile en cas d'IA absente/échouée;
- risque de draft/pending/confirmation incohérent;
- tests sans API key confondaient échec technique et flow métier.

Fix :

- remplacement `fallback_dashboard` par `technical_blocked`;
- no draft/no pending/no committed effect sur échec IA;
- slots structurés déjà compris conservés dans `operation_input` quand la
  génération échoue après l'intake;
- approval d'un pending complet ne dépend pas d'un nouvel appel IA;
- revisions/génération échouées préservent sans appliquer;
- pending recommendation préservée sur échec IA;
- blocked/failed effects exposés au ledger/runtime.

Tests :

- `/usr/local/bin/deno check supabase/functions/sophia-brain/tools/operations/prepare_attack_card/ai_intake.ts supabase/functions/sophia-brain/tools/operations/prepare_attack_card/router.ts supabase/functions/sophia-brain/tools/operations/prepare_defense_card/ai_intake.ts supabase/functions/sophia-brain/tools/operations/prepare_defense_card/router.ts supabase/functions/sophia-brain/router/run.ts`;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/prepare_attack_card/prepare_attack_card_fallback_test.ts`;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/prepare_defense_card/prepare_defense_card_fallback_test.ts`;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/prepare_attack_card/tests.ts`;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/prepare_defense_card/tests.ts`;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts`;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_test.ts`;
- `rg -n "fallback_dashboard" supabase/functions/sophia-brain/tools/operations/prepare_attack_card supabase/functions/sophia-brain/tools/operations/prepare_defense_card supabase/functions/sophia-brain/router`
  retourne aucun résultat.

Limites :

- `run_product_help_guard.test.ts` échoue encore sur 4 tests status composer /
  préférences hors périmètre cards (`C3`, `I4`, deux cas `F1`);
- les tests métier cards sans clé IA doivent continuer à stubber l'intake /
  generator quand ils attendent un vrai `pending_confirmation`; sans stub, le
  contrat attendu est `technical_blocked`.

### Jx — `one_shot_reminder` single runtime architecture

Couche. Always-on tool skill / direct effect.

Symptôme :

- nouvelle architecture contract/router/reducer/executor coexistait avec
  `one_shot_reminder_tool.ts`;
- ancien fichier encore importé en prod pour détecteurs/parsers/runtime;
- risque de double cerveau create/cancel/status;
- extraction instruction/temps et effect commit dispersés.

Fix :

- nouvelle architecture devient source runtime unique;
- extraction `time_parser.ts` / `instruction_parser.ts` / `route_guards.ts`;
- executor unique pour DB writes;
- reducer propriétaire de create/cancel/status/blocked;
- `one_shot_reminder_tool.ts` réduit à façade legacy;
- imports prod nettoyés.

Tests :

- `/usr/local/bin/deno check supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/router.ts supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/reducer.ts supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/executor.ts supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/one_shot_reminder_tool.ts supabase/functions/sophia-brain/router/run.ts supabase/functions/sophia-brain/router/turn_intent_arbitrator.ts`;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/one_shot_reminder_contract_test.ts supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/one_shot_reminder_reducer_test.ts supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/one_shot_reminder_executor_test.ts supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/one_shot_reminder_router_test.ts`
  : 16 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts`
  : 14 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/routers/routers.test.ts`
  : 17 verts;
- `rg -n "one_shot_reminder_tool" supabase/functions/sophia-brain --glob '!**/*test.ts'`
  retourne aucun import prod.

Limites :

- façade legacy conservée pour compat tests (`maybeCreateOneShotReminder`,
  `maybeCancelOneShotReminder`, parsers/guards historiques);
- `one_shot_reminder_tool_test.ts` type-checke puis échoue encore sur 8 tests
  legacy qui documentent l'ancien comportement monolithique/stub direct
  (`replace`, handoff récurrent, product-help/status, intake legacy);
- `run_product_help_guard.test.ts` échoue encore sur 4 tests status composer /
  préférences hors périmètre one-shot (`C3`, `I4`, deux cas `F1`).

---

### J31 — `status_recap` DB-grounded non-mutating skill

Couche. L5 status/recap skill.

Symptôme :

- status/recap existait comme composer caché dans `run.ts`;
- confusion product_help vs status vs tool command;
- risque de contradictions DB/réponse;
- format `fait/prévu/fragile` non propriétaire;
- objets annulés et préférences coach explicites/defaults difficiles à tester
  isolément.

Fix :

- création skill/runtime `status_recap`;
- contrat non-mutating + DB-grounded;
- projection DB isolée (`user_attack_cards`, `user_defense_cards`,
  `scheduled_checkins`, `user_recurring_reminders`, `user_potion_sessions`,
  `user_profile_facts`);
- renderer compact et renderer `fait/prévu/fragile`;
- séparation product_help/status/tool command;
- remplacement des composers status dans le pipeline runtime;
- compatibilité conservée pour les tests legacy via wrappers exportés hors
  `run.ts`;
- ajout d'une lecture d'historique d'effets récents comme source de contexte,
  sans compter requested/failed/blocked comme faits.

Tests :

- `/Users/ahmedamara/.npm/_npx/05b6ef7b13673c57/node_modules/deno/deno check supabase/functions/sophia-brain/router/run.ts supabase/functions/sophia-brain/skills/status_recap/runtime.ts supabase/functions/sophia-brain/skills/status_recap/projection.ts supabase/functions/sophia-brain/skills/status_recap/reducer.ts supabase/functions/sophia-brain/skills/status_recap/renderer.ts`;
- `/Users/ahmedamara/.npm/_npx/05b6ef7b13673c57/node_modules/deno/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/skills/status_recap/status_recap.test.ts supabase/functions/sophia-brain/skills/status_recap/status_recap_runtime_test.ts`
  : 19 verts;
- `/Users/ahmedamara/.npm/_npx/05b6ef7b13673c57/node_modules/deno/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`
  : 83 verts;
- `/Users/ahmedamara/.npm/_npx/05b6ef7b13673c57/node_modules/deno/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/routers/routers.test.ts`
  : 17 verts;
- `/Users/ahmedamara/.npm/_npx/05b6ef7b13673c57/node_modules/deno/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts`
  : 14 verts.

Limites :

- activation encore branchée sur les guards legacy étroits
  `isStatusOnlyNoMutationRequest`, `isRecapOnlyRequest`,
  `isFaitPrevuFragileRecapRequest` et `isOneShotReminderExactStatusRequest`,
  déplacés/consommés côté `status_recap` en attendant un signal dispatcher
  structuré;
- `run.ts` conserve des gardes L4 de routage status/tool historiques, mais ne
  porte plus les composers status principaux;
- l'historique d'effets récents ne remplace jamais la projection DB actuelle.

---

### J31 — persistent effect ledger trace

Couche. Effect ledger / observability / status grounding.

Symptôme :

- `EffectLedger` protégeait surtout les claims du tour courant;
- pas de trace cross-turn facilement exploitable;
- status historiques dépendaient de projections ad hoc;
- risque de confondre effet demandé/bloqué/échoué/commité.

Fix :

- sérialisation persistable du ledger;
- persistance non bloquante dans traces existantes;
- reader recent effect history;
- intégration optionnelle status_recap;
- clarification DB métier = vérité d'état, ledger = vérité d'exécution observée.

Tests :

- `/usr/local/bin/deno check supabase/functions/sophia-brain/router/effect_ledger.ts supabase/functions/sophia-brain/router/effect_ledger_persistence.ts supabase/functions/sophia-brain/router/effect_ledger_reader.ts supabase/functions/sophia-brain/router/run.ts`
  : vert;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts supabase/functions/sophia-brain/router/effect_ledger_persistence_test.ts supabase/functions/sophia-brain/router/effect_ledger_reader_test.ts`
  : 23 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/skills/status_recap/status_recap.test.ts supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`
  : 99 verts.

Limites :

- aucune table dédiée `effect_ledger_entries` créée dans cette passe;
- destination de persistance utilisée: `turn_summary_logs` via
  `log_turn_summary_log`, tag JSON `effect_ledger`;
- reader récent: lecture `turn_summary_logs`, fallback
  `conversation_turn_traces.effect_ledger`;
- le ledger persistant reste une timeline d'exécution observée, pas une preuve
  d'état actuel: status_recap continue de préférer la projection DB métier.

---

### J32 — runtime guards naming and isolation

Couche. Router runtime / L3-L4 guard hygiene.

Symptôme :

- fonctions `*ForTest` utilisées en production;
- guards sémantiques dispersés dans `run.ts` et modules runtime;
- statut ambigu entre invariant prod, policy runtime, patch legacy et helper
  test.

Fix :

- inventaire des guards `ForTest`;
- renommage des invariants prod;
- isolation des patchs sémantiques legacy;
- séparation exports prod vs aliases test;
- déplacement des guards vers modules propriétaires;
- interdiction d'appels `ForTest` depuis runtime prod.

Tests :

- `/usr/local/bin/deno check supabase/functions/sophia-brain/index.ts`;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/router/run.ts`;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/router/effect_ledger.ts`;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/routers/routers.ts`;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/router.ts`;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/runtime_guards_architecture_test.ts`;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts`;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/turn_agenda.test.ts supabase/functions/sophia-brain/router/user_turn_snapshot.test.ts supabase/functions/sophia-brain/router/confirmation_contract.test.ts`;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/routers/routers.test.ts`.

Limites :

- `legacy_semantic_patches.ts` conserve encore les patchs status/no-mutation,
  recap-only, no-tool explicite, revision locale, commande operation explicite
  et sequence minute-par-minute; suppression quand TurnFrame/skills exposent ces
  intents et contraintes sans relecture texte L4;
- `one_shot_reminder/route_guards.ts` conserve les patchs route status/product
  help/modification/annulation; suppression quand le router one-shot consomme un
  intake structure partage par dispatcher et tool;
- les aliases `*ForTest` restent exportes pour compatibilite test uniquement,
  mais le runtime prod importe les noms prod.

---

### J33 — central test suite stabilization

Couche. Test architecture / regression suite.

Symptôme :

- `run_product_help_guard`, agenda, ledger, routers passaient;
- `run_test.ts` gardait des échecs;
- certains tests métier dépendaient implicitement d'une clé IA;
- `fallback_dashboard` masquait des échecs techniques;
- broad pause sautait les writes métier avant audit/régénération.

Fix :

- classification des échecs de `run_test.ts`;
- stub IA déterministe pour le flow recommendation `prepare_attack_card`;
- questions pré-validation `adjust_plan_item` corrigées en fixtures non
  confirmantes;
- chemins sans IA attendent un blocage technique explicite dans les modules;
- suppression du dernier attendu test `fallback_dashboard` côté
  `update_coach_preferences`;
- broad pause matérialise les updates d'items avant snapshot/régénération;
- projection status_recap filtre les statuts DB après lecture pour distinguer
  writes métier, audit/projection et fixtures de test.

Tests :

- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_test.ts`
  : 36 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`
  : 83 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts`
  : 14 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/turn_agenda.test.ts supabase/functions/sophia-brain/router/user_turn_snapshot.test.ts supabase/functions/sophia-brain/router/confirmation_contract.test.ts`
  : 19 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/routers/routers.test.ts`
  : 17 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/update_coach_preferences/tests.ts`
  : 37 verts;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/router/run.ts`;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/router/agent_exec.ts`;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/index.ts`.

Limites :

- aucun test real-AI n'a été ajouté à `run_test.ts`;
- les statuts legacy `fallback_dashboard` restent dans certains contrats anciens
  (`create_recurring_reminder`, `adjust_plan_item`) mais ne sont plus un attendu
  nominal de la suite centrale touchée;
- les tests runtime standards restent stub-first; les vrais appels IA doivent
  rester isolés et conditionnels à une clé.

---

### J34 — `router/run.ts` orchestration shrink

Couche. L4/L5 orchestration runtime.

Symptôme :

- `run.ts` contenait encore trop de logique métier;
- les runtimes de tools étaient câblés directement;
- risque de confirmation/exécution hors skill propriétaire;
- risque de message visible sans effet commité.

Fix :

- extraction/renforcement de `operation_runtime_pipeline.ts`;
- déplacement du runtime direct `track_progress_plan_item` dans le pipeline
  d'opérations, avec `requested_effects`, `allowed_effects`, `committed_effects`
  et `blocked_effects` transmis au ledger;
- réduction des imports directs de runtime tools dans `run.ts`;
- subordination des branches L4 existantes: aucun nouveau détecteur sémantique
  ajouté;
- ajout de garde-fous d'architecture statiques sur l'entrée unique du runtime
  tool et l'absence de commande Supabase destructive dans les fichiers coeur.

Tests :

- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/router/run.ts`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/router/effect_ledger.ts supabase/functions/sophia-brain/router/effect_ledger_adapter.ts supabase/functions/sophia-brain/router/final_response_pipeline.ts supabase/functions/sophia-brain/router/runtime_guards_architecture_test.ts`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts supabase/functions/sophia-brain/router/turn_agenda.test.ts supabase/functions/sophia-brain/router/user_turn_snapshot.test.ts`
  : 24 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/routers/routers.test.ts supabase/functions/sophia-brain/router/runtime_guards_architecture_test.ts`
  : 26 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`
  : 83 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_test.ts`
  : 36 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/operation_runtime_pipeline_test.ts`
  : 1 vert.

Limites :

- `run.ts` garde encore des L4 transitionnels: stale bilan, product_help exit,
  no-tool/recap/status guards, coach preference overrides, recommendation
  bridge, memory grounding guard et resolved plan target;
- les imports de guards one-shot et coach preferences restent directs dans
  `run.ts`, mais les appels runtime de tools durables passent par
  `operation_runtime_pipeline.ts`;
- `weekly_forgotten_progress` et `defense_card_win` restent des effets
  parallèles hors ledger central dans cette itération;
- le wrapper `maybeRunAdjustPlanItemOperation` reste dans `run.ts` comme adapter
  temporaire parce qu'il injecte encore des dépendances de matérialisation de
  plan;
- `deno` n'était pas dans le PATH du shell; les vérifications ont été lancées
  avec `/usr/local/Cellar/deno/2.6.0/bin/deno`.

---

### J35 — Sophia Brain architecture boundaries

Couche. Architecture transverse dispatcher/memory/router/skill/effects.

Symptôme :

- responsabilités documentées mais pas assez explicites dans le code;
- confusion possible entre dispatcher `memory_plan`, context loader, memory
  runtime;
- routers/agenda/runtime/ledger parfois difficiles à distinguer;
- risque que de nouvelles corrections remettent de la compréhension métier dans
  L3/L4.

Fix :

- ajout du contrat testable `contracts/architecture_boundaries.ts`;
- ajout de `contracts/architecture_boundaries_test.ts`;
- clarification explicite: dispatcher = memory planner, pas loader/writer;
- clarification `TurnFrame.memory_plan` -> context loader -> `LoadedContext` ->
  skills -> `MemoryWriteCandidate` -> memory runtime;
- documentation du fait que les memory writes ne sont pas encore pleinement
  prouvées dans `EffectLedger`;
- renforcement léger de `router/active_flow_state.ts` pour centraliser les
  familles de clés `tempMemory` actives, et migration de deux lectures globales
  vers ce helper;
- extension des tests d'architecture runtime pour figer les détecteurs L3
  transitionnels exportés et l'invariant `executedTools` / effets commités.

Tests :

- `/usr/local/Cellar/deno/2.6.0/bin/deno fmt` sur les fichiers touchés;
- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/contracts/architecture_boundaries.ts`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/contracts/architecture_boundaries_test.ts`
  : 6 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/contracts/turn_frame.v1.ts`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/context/types.ts`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/memory_runtime/memorizer_bridge.ts`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/router/effect_ledger.ts`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/router/final_response_guards.ts`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts`
  : 14 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/turn_agenda.test.ts`
  : 9 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/user_turn_snapshot.test.ts`
  : 1 vert;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/routers/routers.test.ts`
  : 17 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/runtime_guards_architecture_test.ts`
  : 11 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/context/loader.ts`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts supabase/functions/sophia-brain/router/active_flow_state.ts supabase/functions/sophia-brain/router/user_turn_snapshot.ts`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/active_flow_state_test.ts`
  : 7 verts.

Limites :

- ce chantier ne supprime pas tous les legacy L3/L4 ni `legacy_intake.ts`;
- `run.ts` reste un orchestrateur large avec plusieurs guards transitionnels;
- les memory writes sont validées/queuées par `memory_runtime`, mais leur preuve
  complète dans `EffectLedger` reste à intégrer;
- les modules skills/tools n'ont pas été refactorés massivement;
- le shell n'avait pas `deno` dans le PATH; un premier `deno fmt` a échoué avec
  `command not found`, puis les commandes ont été relancées avec le binaire
  absolu.

---

### J36 — Tool skills contract unification

Couche. L5 Tool Skills / durable effects.

Symptôme :

- tools pas tous au même standard contractuel;
- risque de write durable annoncé sans preuve de `committed_effect`;
- renderers pas systématiquement séparés pour les messages de succès durable;
- `adjust_plan_item/legacy_intake.ts` reste hybride et trop chargé.

Fix :

- cartographie préalable des six tools concernés;
- `select_state_potion` expose maintenant `committed_effects` au niveau du
  résultat canonique, en plus du ledger local;
- ajout d'un renderer `select_state_potion/renderer.ts` qui refuse une annonce
  d'activation sans commit DB;
- ajout d'un renderer `update_coach_preferences/renderer.ts` et câblage du
  router pour rendre le succès durable seulement avec `committed_effect`;
- ajout du test transversal `tools/operations/tool_skill_contracts_test.ts`;
- déplacement d'un texte visible adjust-plan vers `renderer.ts` et documentation
  précise du périmètre restant de `legacy_intake.ts`.

Tests :

- `/usr/local/bin/deno check supabase/functions/sophia-brain/tools/operations/prepare_attack_card/router.ts supabase/functions/sophia-brain/tools/operations/prepare_defense_card/router.ts`;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/router.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/router.ts supabase/functions/sophia-brain/tools/operations/update_coach_preferences/router.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/router.ts`;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/tools/operations/tool_skill_contracts_test.ts`;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/tool_skill_contracts_test.ts`
  : 3 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/prepare_attack_card/tests.ts`
  : 30 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/prepare_defense_card/tests.ts`
  : 17 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/tests.ts`
  : 16 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/select_state_potion/tests.ts`
  : 30 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/update_coach_preferences/tests.ts`
  : 37 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/adjust_plan_item/tests.ts`
  : 47 verts.

Limites :

- pleinement migrés dans cette passe: `prepare_attack_card` reste la référence;
  `select_state_potion` et `update_coach_preferences` gagnent le rendu/commit
  canonique manquant;
- hybrides conservés: `create_recurring_reminder`, `prepare_defense_card` et
  `update_coach_preferences` gardent encore une partie reducer/effects dans le
  router;
- `adjust_plan_item/legacy_intake.ts` n'est pas réduit massivement; ses blocs
  restants sont documentés dans le README pour extraction progressive;
- aucune modification de `router/run.ts`, aucune nouvelle regex sémantique, et
  aucune commande Supabase destructive lancée.

---

### J37 — L3/L4 transitionals cleanup

Couche. L3/L4 routing safeguards.

Symptôme :

- détecteurs sémantiques transitionnels encore présents dans L3;
- risque de patcher QA en regex L3/L4;
- risque d'écraser une décision structurée correcte;
- risque de confirmation globale sur pending métier.

Fix :

- inventaire L3/L4 produit avant modification;
- subordination de `detectsExplicitProductHelp`, `detectsExactDurableStatus` et
  `detectsMultiEntityDurableStatus`;
- quand L1/L2 a déjà sélectionné une route structurée `product_help` ou
  status_recap/status_only, L3 ne réécrit plus cette décision;
- ajout de tests positif/paraphrase/anti-faux-positifs pour product_help et
  status;
- ajout d'un test architecture qui whiteliste les helpers L3
  `detects*`/`looksLike*`, l'inventaire `TRANSITIONNEL`, et interdit des helpers
  locaux `detects*`/`isExplicit*`/`looksLike*` dans `run.ts`;
- aucun nouveau détecteur sémantique, aucun nouveau `if` sémantique dans
  `run.ts`, aucun nouveau message user-facing métier L3/L4.

Tests :

- `/usr/local/bin/deno check supabase/functions/sophia-brain/router/turn_intent_arbitrator.ts`;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/router/run.ts`;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/dispatcher/dispatcher.prompts.ts`;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/turn_intent_arbitrator.test.ts`
  : 56 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/runtime_guards_architecture_test.ts`
  : 13 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/routers/routers.test.ts`
  : 17 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/skills/status_recap/status_recap.test.ts`
  : 16 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/skills/status_recap/status_recap_runtime_test.ts`
  : 3 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`
  : 83 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_test.ts`
  : 36 verts.

Limites :

- les détecteurs sont subordonnés, pas supprimés; retrait possible après runs QA
  où dispatcher + skills couvrent product_help/status sans intervention L3;
- `detectsExplicitOneShotReminderCreate`, `detectsActiveToolCancellation`,
  `detectsDurableCoachPreference`, `detectsRecapRequest`,
  `detectsExplicitNoStatusRequest`, `detectsPonctualResponseFormatConstraint`,
  `looksLikeAttackCardSlotCorrection` et
  `detectsExplicitAttackCardCreationRequest` restent en legacy transitionnel;
- `run.ts` conserve des guards L4 legacy inventoriés hors périmètre;
- le worktree était déjà largement modifié/non tracké avant ce chantier; cette
  passe n'a pas tenté de nettoyer les changements hors périmètre.

---

### J38 — Conversation skills contract unification

Couche. L5 Conversation Skills.

Symptôme :

- conversation skills pas tous au même standard;
- compréhension, phase, rendu et effets parfois mélangés;
- risque de fallback hardcodé ou de réponse non alignée avec l’état;
- memory candidates / operation suggestions pas toujours clairement séparés des
  effets commités.

Fix :

- ajout d'un contrat partagé minimal pour les effets conversationnels
  `requested/allowed/blocked/committed`;
- ajout/renforcement des reducers dédiés pour `emotional_repair`,
  `demotivation_repair`, `execution_breakdown` et `product_help`;
- ajout des renderers manquants pour `demotivation_repair` et
  `execution_breakdown`;
- les fallbacks d'intake IA de ces skills deviennent conservateurs: pas de
  réponse métier codée, pas de suggestion, pas de candidate mémoire, pas de
  commit;
- `safety_crisis` expose aussi ses effets conversationnels tout en gardant ses
  overrides d'escalade sécurité;
- `weekly_review` et `status_recap` gardent leurs noms/runtime existants mais
  documentent leur statut hybride;
- `normal_reply` reste fallback/composer non durable.

Tests :

- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/contracts/skill_output.v1.ts supabase/functions/sophia-brain/skills/emotional_repair/skill.ts supabase/functions/sophia-brain/skills/demotivation_repair/skill.ts supabase/functions/sophia-brain/skills/execution_breakdown/skill.ts`
  : vert;
- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/skills/safety_crisis/skill.ts supabase/functions/sophia-brain/skills/product_help/skill.ts supabase/functions/sophia-brain/skills/weekly_review/runtime.ts supabase/functions/sophia-brain/skills/status_recap/runtime.ts`
  : vert;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/skills/conversation_skills_contract_test.ts`
  : 4 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/skills/skills_s3.test.ts`
  : 46 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/skills/status_recap/status_recap.test.ts`
  : 16 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/skills/weekly_review/weekly_review_state_test.ts supabase/functions/sophia-brain/skills/weekly_review/weekly_review_renderer_test.ts supabase/functions/sophia-brain/skills/weekly_review/weekly_review_bridges_test.ts`
  : 11 verts.

Limites :

- pleinement migrés dans cette passe: `emotional_repair`, `demotivation_repair`,
  `execution_breakdown`, `product_help`, avec reducers et effets
  conversationnels explicites;
- déjà structuré et renforcé: `safety_crisis`, avec reducer/renderer existants
  et aucun tool effect pendant crise;
- hybrides conservés: `weekly_review` reste branché à des guards/bridges legacy
  et à `adjust_plan_item` pour l'effet durable confirmé;
- hybride conservé: `status_recap` reste non-mutant et DB-grounded, mais son
  activation/reducer comprennent encore le message par gardes déterministes;
- messages hardcodés legacy conservés dans les renderers/guards weekly et
  status, plus les gardes finales de réponse;
- le shell n'avait pas `deno` dans le PATH; les vérifications ont utilisé le
  binaire absolu `/usr/local/Cellar/deno/2.6.0/bin/deno`;
- aucune modification de `router/run.ts`, aucune nouvelle regex sémantique et
  aucune commande Supabase destructive lancée.

---

### J39 — User-facing messages ownership

Couche. L5 renderers / final response safety.

Symptôme :

- messages métier visibles dispersés dans `run.ts`/routers/reducers;
- risque de “c’est fait” sans commit;
- renderers pas toujours propriétaires du rendu;
- messages de slot/confirmation parfois hardcodés au mauvais niveau.

Fix :

- inventaire des messages visibles produit avant édition;
- déplacement des textes d'offre tool/recommandation hors `router/run.ts` vers
  `tools/operations/_shared/recommendation_renderer.ts`;
- ajout d'un guard renderer partagé
  `tools/operations/_shared/committed_effect_renderer_guard.ts`;
- renforcement des renderers touchés pour bloquer le langage de succès sans
  `committed_effects`;
- renforcement du ledger final: un “C'est fait” générique sans commit est
  neutralisé, tandis qu'un commit présent conserve le claim;
- ajout de tests architecture pour empêcher les replies visibles dans L3 et
  vérifier l'ownership du copy migré.

Tests :

- `/usr/local/bin/deno check supabase/functions/sophia-brain/tools/operations/_shared/recommendation_renderer.ts supabase/functions/sophia-brain/tools/operations/_shared/committed_effect_renderer_guard.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/renderer.ts supabase/functions/sophia-brain/tools/operations/prepare_defense_card/renderer.ts supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/renderer.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/renderer.ts supabase/functions/sophia-brain/tools/operations/update_coach_preferences/renderer.ts`
  : vert;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/router/effect_ledger.ts supabase/functions/sophia-brain/router/final_response_guards.ts supabase/functions/sophia-brain/router/final_response_pipeline.ts supabase/functions/sophia-brain/router/run.ts`
  : vert;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts supabase/functions/sophia-brain/router/user_facing_messages_architecture_test.ts`
  : 24 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/tests.ts supabase/functions/sophia-brain/tools/operations/prepare_defense_card/tests.ts supabase/functions/sophia-brain/tools/operations/update_coach_preferences/tests.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/tests.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/tests.ts`
  : 174 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts supabase/functions/sophia-brain/skills/status_recap/status_recap.test.ts supabase/functions/sophia-brain/tools/operations/prepare_attack_card/tests.ts`
  : 129 verts.

Limites :

- legacy conservé dans `router/run.ts`: guards mémoire personnalisés
  sésame/natation/whisky/action 7 minutes et arrêt stale weekly;
- legacy conservé dans `weekly_review`: guards visibles et bridges restent
  hybrides, mais protégés par les guards de rendu existants;
- `status_recap` reste DB-grounded et non mutant, mais son activation contient
  encore des gardes déterministes existantes;
- `turn_intent_arbitrator.ts` conserve ses détecteurs transitionnels existants;
- pas de migration massive des conversation skills déjà traités dans J38;
- le shell n'avait pas `deno` dans le PATH; les vérifications ont utilisé le
  binaire absolu `/usr/local/bin/deno`;
- aucune commande Supabase destructive lancée.

### J41 — runtime contracts documentation base

Couche. Architecture docs / agent playbook.

Symptôme :

- les plans agents contiennent beaucoup de règles architecturales utiles, mais
  elles restent dispersées dans la conversation et dans le journal de chantier;
- un agent peut déplacer du code ou ajouter un patch local sans voir rapidement
  le contrat du domaine concerné;
- `runtime-contracts/00-architecture-doctrine.md` pose la doctrine globale, mais
  ne donne pas encore une base de vérité navigable par skill/runtime.

Fix :

- ajout de `docs/agent-playbook/New/runtime-contracts/` comme base de vérité
  opérationnelle;
- création de contrats séparés pour runtime global, `run.ts`, snapshot/agenda,
  confirmation, EffectLedger, tool skills, conversation skills, daily, weekly,
  legacy guards et suite de tests centrale;
- ajout dans chaque document d'un encart `Suivi Des Décisions Architecturales`
  pour tracer les décisions réellement mises en place;
- rattachement depuis `runtime-contracts/00-architecture-doctrine.md`.

Tests :

- changement documentation uniquement;
- vérification structurelle par
  `find docs/agent-playbook/New/runtime-contracts -type f`;
- vérification des encarts par
  `rg "Suivi Des Décisions Architecturales" docs/agent-playbook/New/runtime-contracts`.

Limites :

- les contrats sont des squelettes prescriptifs de référence; les agents doivent
  les enrichir au fil des chantiers avec les décisions concrètement
  implémentées;
- aucun test applicatif lancé car aucun code runtime n'a été modifié.

---

### J39 — EffectLedger mandatory proof

Couche. Cross-runtime durable effects / final response safety.

Symptôme :

- certains runtimes pouvaient signaler une réussite depuis un status;
- tous les effets n'étaient pas systématiquement
  requested/allowed/blocked/committed/failed;
- final response pouvait annoncer un effet sans preuve transversale;
- memory writes / bridges / recommendations n'étaient pas toujours clairement
  distingués des commits propriétaires.

Fix :

- `EffectLedgerEntry` porte maintenant `committed_id` et accepte les sources
  `bridge` / `recommendation_tool` sans contrat métier;
- `effect_ledger_adapter.ts` mappe génériquement `requested_effects`,
  `allowed_effects`, `blocked_effects`, `committed_effects` et `failed_effects`,
  avec DB refs compactes;
- `executedToolsForStatus` exige maintenant des `committed_effects`, et les
  runtimes touchés dérivent les outils exécutés depuis les commits;
- recommendations et agenda/bridge produisent des requested/blocked effects,
  jamais des commits;
- weekly forgotten progress expose le commit via le runtime propriétaire
  `track_progress_plan_item`;
- final guards couvrent aussi les claims de mémoire durable sans commit;
- renderers one-shot summary / coach preferences refusent le succès visible sans
  preuve commitée;
- tests transversaux ajoutés dans `router/effect_ledger_integration_test.ts`.

Tests :

- `/usr/local/bin/deno check supabase/functions/sophia-brain/router/effect_ledger.ts supabase/functions/sophia-brain/router/effect_ledger_adapter.ts supabase/functions/sophia-brain/router/final_response_guards.ts supabase/functions/sophia-brain/router/final_response_pipeline.ts supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts`
  : vert;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/renderer.ts supabase/functions/sophia-brain/tools/operations/update_coach_preferences/renderer.ts`
  : vert;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts`
  : 18 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger_adapter_test.ts`
  : 7 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger_integration_test.ts`
  : 10 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger_persistence_test.ts`
  : 7 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger_reader_test.ts`
  : 2 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/final_response_pipeline_test.ts`
  : 3 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/recommendation/recommendation_tool.test.ts`
  : 3 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/skills/weekly_review/weekly_review_evidence_test.ts`
  : 3 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/always_on/track_progress_plan_item/track_progress_plan_item_tool_test.ts`
  : 8 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/prepare_attack_card/tests.ts`
  : 30 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/prepare_defense_card/tests.ts`
  : 18 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/adjust_plan_item/tests.ts`
  : 49 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/tests.ts`
  : 17 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/select_state_potion/tests.ts`
  : 31 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/update_coach_preferences/tests.ts`
  : 38 verts.

Limites :

- `one_shot_reminder_tool_test.ts` reste rouge sur 8 tests routeur/intake
  préexistants ou hors périmètre de cette passe: product_help/status non
  mutatifs, recurring handoff, replace cancel+create, partial failure, tentative
  failure/intake/pending confirmation;
- `memory_v2_integration_audit.test.ts` ne type-checke pas actuellement:
  `TurnFrame.tool_skill_opportunity` est optionnel dans le fixture du test;
- `runtime_guards_architecture_test.ts` passe les guards EffectLedger mais reste
  rouge sur `no_supabase_db_reset_reference_outside_safety_docs` à cause d'une
  référence dans `.cursor/rules/safety-no-destructive-db.mdc`;
- memory runtime queue les candidates pour memorizer; aucun `committed` memory
  effect n'est émis tant qu'un vrai write id n'est pas disponible;
- le worktree contenait déjà de nombreux changements non liés; cette entrée ne
  nettoie pas ces modifications.

---

### J40 — Architecture tests guardrails

Couche. Architecture transverse / regression guards.

Symptôme :

- règles du playbook documentées mais pas toujours exécutables;
- risque de réintroduire regex L3/L4, tool success sans commit, bridges qui
  commitent, dispatcher memory loader/writer, ou `run.ts` métier;
- dette legacy difficile à suivre sans whitelist testée.

Fix :

- renforcement de `router/runtime_guards_architecture_test.ts` avec whitelists
  legacy explicites et critères de suppression;
- ajout de checks transversaux EffectLedger / bridge / final messages;
- renforcement des contrats d'architecture, tool skills et conversation skills;
- scan repo pour nouvelles références destructives Supabase, sans lancer de
  commande Supabase;
- aucun changement métier attendu.

Tests :

- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/runtime_guards_architecture_test.ts`
  : 15 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/contracts/architecture_boundaries_test.ts`
  : 7 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger_integration_test.ts`
  : 8 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/bridge_contract_test.ts`
  : 4 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/user_facing_messages_architecture_test.ts`
  : 9 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/tool_skill_contracts_test.ts`
  : 5 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/skills/conversation_skills_contract_test.ts`
  : 5 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts`
  : 18 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/turn_agenda.test.ts`
  : 9 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/user_turn_snapshot.test.ts`
  : 1 vert;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/routers/routers.test.ts`
  : 17 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/contracts/architecture_boundaries.ts`
  : vert;
- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/router/effect_ledger.ts`
  : vert;
- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/router/final_response_guards.ts`
  : vert.

Limites :

- whitelists conservées: détecteurs L3 transitionnels existants,
  `detectsExplicitNoStatusRequest`, `detectsPonctualResponseFormatConstraint`,
  `detectsExplicitAttackCardCreationRequest`, import legacy
  `adjust_plan_item/router.ts` dans `run.ts`, références existantes aux
  commandes Supabase destructives interdites, exceptions `status_recap` /
  `weekly_review`, et `adjust_plan_item/intake.ts` massif;
- `scripts/local_reset.sh` et `package.json` restent une dette explicite: le
  test bloque les nouvelles références mais ne supprime pas ces commandes;
- `adjust_plan_item/intake.ts` reste au-dessus de la cible façade mince; le
  garde-fou bloque sa croissance avant migration;
- règles non encore parfaitement testables sans parsing TypeScript profond:
  toute sémantique L4 noyée dans des branches historiques de `run.ts`;
- le shell n'avait pas `deno` dans le PATH; les vérifications ont utilisé le
  binaire absolu `/usr/local/Cellar/deno/2.6.0/bin/deno`;
- aucune commande Supabase destructive lancée.

---

### J42 — Documentation runtime contract `adjust_plan_item`

Couche. Documentation d'architecture / runtime contracts.

Symptôme :

- `runtime-contracts/tools/adjust-plan-item.md` décrivait une cible trop
  générique (`scope_resolver.ts`, `effects.ts`, `materializer.ts`) qui ne
  correspondait pas au code réel;
- un agent futur pouvait encore croire que `run.ts`, weekly ou un fallback local
  pouvaient confirmer/appliquer un ajustement hors contrat;
- les nouveaux invariants `committed_effects` n'étaient pas documentés comme
  preuve locale d'exécution.

Fix :

- réécriture du contrat runtime `adjust_plan_item` autour de l'architecture
  réelle: `contract.ts`, `workflow.ts`, `intake.ts`, `state.ts`, `router.ts`,
  `executor.ts`, `draft_review.ts`, `weekly_bridge.ts`, `generator.ts`,
  `draft_compiler.ts`, `candidate_builder.ts`;
- ajout d'une section "Dépend De L'Architecture De X" reliant explicitement
  `UserTurnSnapshot`, `TurnAgenda`, `Confirmation Contract`, `EffectLedger` et
  `AdjustPlanSkillResult`;
- clarification des responsabilités de `adjust_plan_item` versus `run.ts`;
- documentation des invariants non négociables: pas de done language sans
  `committed_effects`, pas de `executedTools` sans commit, pas de patch sans
  executor, pas de weekly direct apply;
- documentation des exceptions legacy restantes et de leurs conditions de
  suppression.

Fichiers modifiés :

- `docs/agent-playbook/New/runtime-contracts/tools/adjust-plan-item.md`;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests lancés :

- aucun test runtime relancé: changement documentation uniquement;
- vérification manuelle des exports/fonctions réels via `rg` dans
  `tools/operations/adjust_plan_item/*`.

Limites :

- le contrat documente encore `draft_review.ts` comme renderer effectif, pas un
  `renderer.ts` séparé;
- `intake.ts` reste une façade massive legacy;
- plusieurs politiques de handoff restent injectées depuis `run.ts` jusqu'à ce
  que `UserTurnSnapshot`/`TurnAgenda` portent toute l'admission structurée.

### J43 — Documentation runtime contract `track_progress_plan_item`

Couche. Documentation architecture / direct effect always-on.

Symptôme :

- le contrat runtime `track_progress_plan_item` existant restait trop generique;
- il ne disait pas clairement quels fichiers possedent le contrat, l'intake, la
  transition d'etat, les effets, le writer et le renderer;
- les liens avec UserTurnSnapshot, TurnAgenda, Confirmation Contract et
  EffectLedger n'etaient pas assez explicites pour empecher une future
  reintroduction de logique metier dans `run.ts`.

Fix :

- reecriture de
  `docs/agent-playbook/New/runtime-contracts/tools/track-progress-plan-item.md`;
- ajout d'une section `Dépend De L'Architecture De X` detaillee;
- documentation de `contract.ts`, `intake.ts`, `router.ts`, `db.ts`,
  `renderer.ts`, `track_progress_plan_item_tool.ts`, `run.ts`,
  `operation_runtime_pipeline.ts` et `magic_reset.ts`;
- clarification du ledger
  `requested_effects -> allowed_effects ->
  committed_effects`;
- documentation de l'exception legacy `inferStatusFallback` et de sa condition
  de suppression;
- ajout d'une decision architecturale J43 dans le suivi du contrat runtime.

Fichiers modifies :

- `docs/agent-playbook/New/runtime-contracts/tools/track-progress-plan-item.md`;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests :

- non applicable: documentation only;
- verification manuelle des references avec lecture de
  `runtime-contracts/00-architecture-doctrine.md`,
  `runtime-contracts/README.md`,
  `runtime-contracts/tools/track-progress-plan-item.md`,
  `router/effect_ledger_adapter.ts`, `router/operation_runtime_pipeline.ts` et
  le module `tools/always_on/track_progress_plan_item/*`.

Limites :

- le fallback `inferStatusFallback` reste documente comme exception
  transitionnelle;
- `track_progress_plan_item_tool.ts` reste une facade legacy V2, mais le contrat
  interdit d'y recreer la logique metier;
- cette passe ne modifie pas le code runtime.

### J44 — Documentation runtime contract `prepare_defense_card`

Couche. Documentation architecture / tool skill operation.

Symptôme :

- `runtime-contracts/tools/prepare-defense-card.md` décrivait une cible
  générique et partiellement obsolète (`confirmation.ts`, `effects/executor`)
  qui ne correspondait pas au module réel;
- le contrat ne documentait pas assez clairement le rôle de `committed_effects`,
  ni la séparation actuelle entre `contract.ts`, `ai_intake.ts`,
  `slot_filler.ts`, `router.ts`, `executor.ts`, `persistence.ts` et
  `renderer.ts`;
- un agent futur pouvait encore croire qu'un fallback regex, un insert DB dans
  `run.ts` ou un “C'est fait” sans `defense_card_id` seraient acceptables.

Fix :

- remplacement complet de
  `docs/agent-playbook/New/runtime-contracts/tools/prepare-defense-card.md`;
- ajout d'une section `Dépend De L'Architecture De X` reliant explicitement
  `UserTurnSnapshot`, `TurnAgenda`, `Confirmation Contract`, `EffectLedger` et
  `PrepareDefenseCardSkillResult`;
- documentation des fonctions réelles: `runPrepareDefenseCardAiIntake`,
  `normalizeDefenseCardSlotFillerOutput`, `maybeRunPrepareDefenseCardOperation`,
  `defenseSkillResult`, `toRuntimeResult`, `executePrepareDefenseCard`,
  `writeDefenseCardFromDraft`, `renderDefenseCardExecuted`,
  `renderDefenseCardSkillResult`;
- clarification des responsabilités qui appartiennent au skill et de celles qui
  n'appartiennent pas à `run.ts`;
- documentation des invariants non négociables: pas de `executedTools` sans
  `committed_effects`, pas de “C'est fait” sans `defense_card_id`, pas de DB
  write hors executor/writer, pas de fallback regex de slots;
- documentation des exceptions legacy restantes: clés tempMemory historiques,
  reducer encore dans `router.ts`, slot-question renderer encore local, review
  confirmation IA directe.

Fichiers modifiés :

- `docs/agent-playbook/New/runtime-contracts/tools/prepare-defense-card.md`;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests lancés :

- non applicable: changement documentation uniquement;
- vérification manuelle des références avec lecture de
  `runtime-contracts/00-architecture-doctrine.md`,
  `runtime-contracts/README.md`,
  `runtime-contracts/tools/prepare-defense-card.md`, `15-chantiers-log.md` et
  scan `rg` du module `tools/operations/prepare_defense_card/*`.

Limites :

- le reducer reste documenté comme vivant dans `router.ts`;
- les clés tempMemory legacy restent supportées jusqu'à migration d'une frame
  tool-skill versionnée;
- ce chantier ne modifie pas le code runtime.

### J45 — Documentation runtime contract `create_recurring_reminder`

Couche. Documentation d'architecture / runtime contracts.

Symptôme architectural :

- `runtime-contracts/tools/create-recurring-reminder.md` décrivait une cible
  trop vague et citait un `confirmation.ts` inexistant;
- le contrat ne documentait pas précisément le nouveau ledger
  `committed_effects`, le renderer, `draft_only` / `no_create`, l'annulation en
  intake active ni les responsabilités qui ne doivent plus vivre dans `run.ts`;
- un agent futur pouvait encore réintroduire un writer direct, une confirmation
  parallèle ou un wording "c'est fait" sans preuve DB.

Fix réel :

- remplacement complet du contrat runtime `create_recurring_reminder`;
- ajout de la section "Dépend De L'Architecture De X" reliant explicitement
  `UserTurnSnapshot`, `TurnAgenda`, `Confirmation Contract`, `EffectLedger` et
  le contrat local du skill;
- documentation des fichiers réels : `contract.ts`, `intake.ts`, `state.ts`,
  `platform_context.ts`, `generator.ts`, `router.ts`, `executor.ts`,
  `persistence.ts`, `renderer.ts` et l'intégration mince dans `run.ts`;
- clarification des responsabilités de X : recurring vs one-shot, cadence,
  jours, heure locale, contenu exact, destination, binding plan, draft review,
  confirmation locale, effets committés et rendu;
- documentation des interdits : pas de regex métier, pas de one-shot créé par ce
  skill, pas de `executedTools`/done language sans `committed_effects`, pas de
  pending executable sur `draft_only` / `no_create`;
- documentation des fallbacks legacy restants et de leurs conditions de
  suppression.

Fichiers modifiés :

- `docs/agent-playbook/New/runtime-contracts/tools/create-recurring-reminder.md`;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests / vérifications :

- changement documentation uniquement pour J45;
- vérification manuelle par lecture de
  `runtime-contracts/00-architecture-doctrine.md`,
  `runtime-contracts/README.md`,
  `runtime-contracts/tools/create-recurring-reminder.md`, `15-chantiers-log.md`
  et du module `tools/operations/create_recurring_reminder/*`;
- les validations runtime liées au chantier code précédent restent :
  `create_recurring_reminder/tests.ts` 16 verts en `--no-check` et avec
  `--allow-env --allow-net --allow-read`, `one_shot_reminder_tool_test.ts` 66
  verts, `turn_intent_arbitrator.test.ts` 50 verts, `deno check` ciblé du module
  recurring vert.

Limites restantes :

- le reducer est encore réparti entre `intake.ts`, `state.ts` et `router.ts`,
  pas extrait dans un `reducer.ts`;
- les clés tempMemory legacy restent encapsulées par `state.ts` jusqu'à un frame
  Tool Skill versionné global;
- certains arbitrages globaux d'interruption one-shot/status/coach/recap restent
  dans `run.ts` jusqu'à ce que `UserTurnSnapshot`/`TurnAgenda` portent toute
  l'admission structurée;
- `run_product_help_guard.test.ts` reste bloqué dans l'état courant par des
  erreurs hors périmètre recurring dans `weekly_review/runtime.ts` et des
  helpers adjust-plan manquants.

### J46 — Documentation runtime contract `select_state_potion`

Couche. Documentation d'architecture / Tool Skill contract-driven.

Symptôme :

- le contrat runtime `select_state_potion` existant ne décrivait qu'une cible
  générique;
- il ne citait pas les fichiers réellement propriétaires du contrat, de
  l'intake, du reducer, des effets, de l'executor, du writer et du renderer;
- les invariants critiques `no_potion`, `no_followup`,
  `approve/reject/revise/explain`, handoff one-shot et `committed_effects`
  n'étaient pas assez explicites pour empêcher une réintroduction de logique
  métier potion dans `run.ts`.

Fix réel :

- remplacement de
  `docs/agent-playbook/New/runtime-contracts/tools/select-state-potion.md`;
- ajout d'une section `Dépend De L'Architecture De X` reliant le domaine à
  `UserTurnSnapshot`, `TurnAgenda`, `Confirmation Contract`, `EffectLedger` et
  `SelectStatePotionSkillResult`;
- documentation de `contract.ts`, `intake.ts`, `subskills/*`, `router.ts`,
  `state.ts`, `policy.ts`, `generator.ts`, `draft_validation.ts`, `executor.ts`,
  `persistence.ts`, `renderer.ts`, `operation_runtime_pipeline.ts` et `run.ts`;
- clarification du ledger local
  `requested_effects -> allowed_effects -> blocked_effects ->
  committed_effects`;
- documentation des hard consent guards autorisés et des legacy semantic
  detectors à migrer vers intake, agenda ou interruption policy;
- ajout d'une décision architecturale J46 dans le suivi du contrat runtime.

Fichiers modifiés :

- `docs/agent-playbook/New/runtime-contracts/tools/select-state-potion.md`;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests lancés :

- aucun test runtime relancé: changement documentation uniquement;
- vérification manuelle des références avec lecture de
  `docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md`,
  `docs/agent-playbook/New/runtime-contracts/README.md`,
  `docs/agent-playbook/New/runtime-contracts/tools/select-state-potion.md`,
  `docs/agent-playbook/New/test-material/15-chantiers-log.md` et `rg` sur
  `tools/operations/select_state_potion/*`,
  `router/operation_runtime_pipeline.ts` et `router/run.ts`.

Limites restantes :

- le runtime passe encore des briques legacy séparées (`turnFrame`,
  `routeDecision`, `tempMemory`, `history`) plutôt qu'un objet
  `UserTurnSnapshot`/`TurnAgenda` unique;
- `policy.ts` conserve des `legacySemanticDetectors` transitionnels pour
  l'admission explicite potion, le handoff one-shot et les micro-actions sans
  potion;
- `router/run.ts` contient encore de la mise en forme d'opportunités
  `state_potion` pour les recommendations globales, à migrer vers le builder de
  recommendation ou le dispatcher;
- cette passe ne modifie pas le code runtime.

---

### J47 — Documentation runtime contract `update_coach_preferences`

Couche. Documentation architecture / Tool Skill L5 / preferences coach.

Symptome architectural :

- le flow `update_coach_preferences` etait deja migre cote code vers un
  ownership L5 et un scope produit limite aux trois preferences UI;
- le contrat runtime du domaine ne decrivait pas assez clairement le lien avec
  `UserTurnSnapshot`, `TurnAgenda`, `Confirmation Contract` et `EffectLedger`;
- il manquait une base operationnelle lisible pour empecher une future
  reintroduction de preferences invisibles, regex metier dans `run.ts`, fallback
  fragile, confirmation parallele ou claim user-facing sans commit.

Fix reel :

- creation de
  `docs/agent-playbook/New/runtime-contracts/tools/update-coach-preferences.md`;
- documentation du scope durable exact: `coach.tone`, `coach.challenge_level`,
  `coach.question_tendency`;
- ajout de la section `Dépend De L'Architecture De X` reliant le domaine a
  `UserTurnSnapshot`, `TurnAgenda`, `Confirmation Contract`, `EffectLedger` et
  au contrat local `UpdateCoachPreferencesSkillResult`;
- documentation des fichiers proprietaires: `contract.ts`,
  `_shared/operation_payload_builder.ts`, `workflow.ts`, `slot_filler.ts`,
  `intake.ts`, `generator.ts`, `state.ts`, `router.ts`, `executor.ts`,
  `status.ts`, `runtime_policy.ts`, `route_guards.ts`, `renderer.ts`,
  `router/run.ts`, `PreferencesSection.tsx`;
- clarification des invariants non negociables: pas de cle backend-only durable,
  pas de write sans confirmation explicite, toute ecriture via
  `executeUpdateCoachPreferences`, `executedTools` uniquement avec
  `committed_effects`, runtime policy limitee aux trois cles UI;
- documentation des exceptions legacy restantes: `deterministicPatchFromMessage`
  desactive par defaut, guards regex internes a `route_guards.ts`, adapter
  runtime context encore dans `run.ts`.

Fichiers modifies :

- `docs/agent-playbook/New/runtime-contracts/tools/update-coach-preferences.md`;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests lances :

- verification code precedente du chantier:
  `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/update_coach_preferences/tests.ts`;
- verification code precedente du chantier:
  `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/turn_intent_arbitrator.test.ts`;
- verification code precedente du chantier: `deno check` cible sur les fichiers
  `update_coach_preferences`;
- verification architecture:
  `rg "coach.response_max_lines|coach.emoji_policy|coach.final_question_policy|coach.action_first_policy" supabase/functions/sophia-brain -g "*.ts"`;
- verification documentation:
  `git diff --check -- docs/agent-playbook/New/runtime-contracts/tools/update-coach-preferences.md docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Limites restantes :

- `route_guards.ts` garde des regex transitionnelles d'admission/approval/
  verification, mais elles sont dans le skill et ne creent ni patch ni write;
- `deterministicPatchFromMessage` reste documente comme fallback desactive par
  defaut et ne doit produire que les trois cles UI tant qu'il existe;
- `run.ts` charge encore le runtime context via
  `loadCoachPreferenceRuntimeContext`; la semantique reste dans
  `runtime_policy.ts`, mais ce chargement pourra rejoindre plus tard un registry
  central de policies runtime;
- cette passe documente l'architecture du domaine; elle ne modifie pas le code
  runtime.

### J48 — Documentation runtime contract `daily_action_review`

Couche. Documentation d'architecture / runtime contracts.

Symptôme architectural :

- le contrat runtime `proactive/daily-review.md` était trop générique pour
  empêcher un futur patch local daily;
- il ne citait pas précisément le propriétaire du contrat, de l'intake, du
  reducer, des effets, de l'executor, du writer DB et du renderer;
- il ne documentait pas le standard J17
  `effect_plan -> executor -> committed_effects -> renderer`;
- les exceptions legacy (`daily_action_review.ts` façade, `handlers_pending.ts`
  writer DB, ouverture dynamique dans `process-checkins`) n'avaient pas de
  condition de suppression claire.

Fix réel :

- remplacement complet de
  `docs/agent-playbook/New/runtime-contracts/proactive/daily-review.md`;
- ajout de la section "Dépend De L'Architecture De X" reliant explicitement
  `UserTurnSnapshot`, `TurnAgenda`, `Confirmation Contract`, `EffectLedger` et
  le contrat local daily;
- documentation des fichiers réels : `contract.ts`, `selector.ts`, `opening.ts`,
  `intake.ts`, `reducer.ts`, `effects.ts`, `executor.ts`, `renderer.ts`, la
  façade `_shared/daily_action_review.ts`, `process-checkins/index.ts`,
  `whatsapp-webhook/handlers_pending.ts`, `v2-daily-bilan-decider.ts` et les
  consommateurs weekly;
- clarification des responsabilités daily : sélection, ouverture, intake JSON,
  état multi-tour, missing slots, effect plan, committed effects ledger,
  renderer final et evidence weekly;
- clarification des interdits : pas d'outcome par regex métier, pas de write
  depuis intake/reducer, pas de wording "noté" sans commit, pas de coaching ou
  tool pendant la collecte, pas de réintroduction dans `run.ts`.

Fichiers modifiés :

- `docs/agent-playbook/New/runtime-contracts/proactive/daily-review.md`;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests / vérifications :

- changement documentation uniquement pour J48;
- vérification par lecture de
  `docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md`,
  `docs/agent-playbook/New/runtime-contracts/README.md`,
  `docs/agent-playbook/New/runtime-contracts/proactive/daily-review.md` et
  `docs/agent-playbook/New/test-material/15-chantiers-log.md`;
- vérification par `rg` des fonctions/fichiers cités dans le contrat daily;
- les validations runtime du chantier code précédent restent celles de J17 :
  `daily_action_review_test.ts`, `v2-daily-bilan-decider_test.ts`,
  `weekly_progress_review_test.ts`, `weekly_review_test.ts` et `deno check`
  ciblé daily/handlers pending.

Limites restantes :

- le daily reste une façade `_shared/daily_action_review.ts` plutôt qu'un skill
  complet sous `sophia-brain/skills/*`;
- `handlers_pending.ts` garde encore l'adapter DB concret, même si le résultat
  d'exécution expose maintenant `committed_effects`;
- l'ouverture proactive dans `process-checkins/index.ts` garde une génération
  dynamique bornée par l'instruction et la couverture des targets;
- cette passe ne modifie pas le code runtime.

---

### J50 — Documentation runtime contract `product_help`

Couche. Documentation d'architecture / Conversation Skill contract-driven.

Symptôme architectural :

- le contrat runtime `conversation-skills/product-help.md` ne suffisait plus
  après la finalisation J22 de l'intake structuré ;
- il ne disait pas clairement quels fichiers possèdent le contrat, l'intake, le
  retrieval, le renderer et l'intégration runtime ;
- il ne documentait pas assez les interdits product_help : pas de mutation, pas
  de status complet, pas d'opération suggérée, pas de fallback lexical
  production, pas de claim d'objet réel sans source.

Fix réel :

- remplacement complet de
  `docs/agent-playbook/New/runtime-contracts/conversation-skills/product-help.md`
  ;
- ajout de la section `Dépend De L'Architecture De product_help` reliant le
  domaine à `UserTurnSnapshot`, `TurnAgenda`, `Confirmation Contract`,
  `EffectLedger` et `ProductHelpDecision` ;
- documentation des fichiers réels : `contract.ts`, `intake.ts`, `retrieval.ts`,
  `knowledge.ts`, `prompt.ts`, `renderer.ts`, `skill.ts`, `context_loader.ts` et
  `router/run.ts` ;
- clarification que `product_help` n'a pas de reducer mutatif, ne prépare pas
  d'effet exécutable et n'applique jamais d'effet ;
- documentation de `legacyProductHelpHeuristicIntake` comme exception de tests
  et comparaison uniquement, avec conditions de suppression.

Fichiers modifiés :

- `docs/agent-playbook/New/runtime-contracts/conversation-skills/product-help.md`
  ;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests / vérifications :

- changement documentation uniquement pour J50 ;
- lecture de
  `docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md`,
  `docs/agent-playbook/New/runtime-contracts/README.md`,
  `docs/agent-playbook/New/runtime-contracts/conversation-skills/product-help.md`,
  `docs/agent-playbook/New/runtime-contracts/03-user-turn-snapshot-agenda.md`,
  `docs/agent-playbook/New/runtime-contracts/04-confirmation-contract.md`,
  `docs/agent-playbook/New/runtime-contracts/05-effect-ledger.md` et
  `docs/agent-playbook/New/test-material/15-chantiers-log.md` ;
- scan `rg` des fonctions/fichiers cités dans `skills/product_help/*`,
  `skills/skills_s3.test.ts`, `router/run.ts` et
  `router/run_product_help_guard.test.ts` ;
- `git diff --check -- docs/agent-playbook/New/runtime-contracts/conversation-skills/product-help.md docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Limites restantes :

- le runtime global passe encore un `SkillContext` composé plutôt qu'un objet
  `UserTurnSnapshot`/`TurnAgenda` unique ;
- `legacyProductHelpHeuristicIntake` reste exporté jusqu'à migration des tests
  historiques vers décisions JSON structurées ou validation par run QA réel ;
- des gardes globales product_help/status/tool restent dans `run.ts` pour
  arbitrage cross-skill, mais le contrat interdit d'y ajouter une nouvelle
  compréhension métier propre à `product_help`.

### J57 — Documentation runtime contract `demotivation_repair`

Couche. Documentation d'architecture / Conversation Skill contract-driven.

Symptôme architectural :

- le contrat runtime `conversation-skills/demotivation-repair.md` restait trop
  vague après J10/J23 ;
- il ne permettait pas de distinguer précisément le contrat local, l'intake IA,
  la normalisation reducer-like, les suggestions consenties et l'absence
  d'executor durable ;
- il ne documentait pas assez les limites restantes : fallback conservateur,
  décision structurée reprise depuis le working state, absence de
  `UserTurnSnapshot`/`TurnAgenda` typés dédiés.

Fix réel :

- remplacement complet de
  `docs/agent-playbook/New/runtime-contracts/conversation-skills/demotivation-repair.md`
  ;
- ajout de la section `Dépend De L'Architecture De X` reliant le domaine à
  `UserTurnSnapshot`, `TurnAgenda`, `Confirmation Contract`, `EffectLedger` et
  `DemotivationRepairDecision` ;
- documentation des fichiers réels : `contract.ts`, `intake.ts`, `prompt.ts`,
  `context_loader.ts`, `reducer.ts`, `renderer.ts`, `skill.ts`, `router/run.ts`,
  `operation_access_policy.ts`, `operation_suggestion_resolver.ts` et
  `recommendation_tool.ts` ;
- clarification que `demotivation_repair` possède son diagnostic motivationnel,
  mais ne possède aucun effet durable et ne doit jamais réintroduire de
  sémantique dans `run.ts`.

Fichiers modifiés :

- `docs/agent-playbook/New/runtime-contracts/conversation-skills/demotivation-repair.md`
  ;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests / vérifications :

- changement documentation uniquement pour J57 ;
- lecture de
  `docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md`,
  `docs/agent-playbook/New/runtime-contracts/README.md`,
  `docs/agent-playbook/New/runtime-contracts/conversation-skills/demotivation-repair.md`
  et `docs/agent-playbook/New/test-material/15-chantiers-log.md` ;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read --filter demotivation_repair supabase/functions/sophia-brain/skills/skills_s3.test.ts`
  : 15 passed, 0 failed, 31 filtered out ;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/skills/demotivation_repair/skill.ts supabase/functions/sophia-brain/skills/demotivation_repair/intake.ts supabase/functions/sophia-brain/skills/demotivation_repair/contract.ts supabase/functions/sophia-brain/skills/demotivation_repair/prompt.ts supabase/functions/sophia-brain/skills/demotivation_repair/reducer.ts supabase/functions/sophia-brain/skills/demotivation_repair/renderer.ts supabase/functions/sophia-brain/router/run.ts`
  : vert ;
- `git diff --check -- docs/agent-playbook/New/runtime-contracts/conversation-skills/demotivation-repair.md docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Limites restantes :

- le fallback conservateur reste volontairement présent pour les échecs
  techniques d'intake IA, sans handoff, sans suggestion tool et sans mutation ;
- une décision structurée déjà présente dans le working state peut encore être
  reprise pour continuité, jusqu'à migration vers une frame de décision
  versionnée commune aux conversation skills ;
- `RunSkillInput`/`SkillContext` et `turn_frame` servent encore d'équivalent
  local à `UserTurnSnapshot`/`TurnAgenda` ;
- il n'existe pas d'`effects.ts` ou d'`executor.ts` propriétaire parce que
  `demotivation_repair` ne commite aucun effet durable.

---

### J52 — Documentation runtime contract `one_shot_reminder`

Couche. Documentation d'architecture / runtime contracts.

Symptôme :

- `runtime-contracts/tools/one-shot-reminder.md` décrivait une cible générique
  et incomplète, avec `time_parser.ts`/`instruction_parser.ts` cités mais sans
  préciser le rôle réel de `route_guards.ts`, `intake.ts`, `reducer.ts`,
  `executor.ts`, `persistence.ts`, `renderer.ts` et `router.ts`;
- le contrat ne disait pas clairement comment `one_shot_reminder` dépend de
  `UserTurnSnapshot`, `TurnAgenda`, du Confirmation Contract et de
  l'EffectLedger;
- un agent futur pouvait encore ajouter un fallback dans `run.ts` ou
  `one_shot_reminder_tool.ts` sans voir que ces fichiers ne possèdent plus la
  logique métier.

Fix :

- remplacement complet de `runtime-contracts/tools/one-shot-reminder.md`;
- documentation du runtime actuel : `contract.ts`, `route_guards.ts`,
  `time_parser.ts`, `instruction_parser.ts`, `intake.ts`, `reducer.ts`,
  `executor.ts`, `persistence.ts`, `renderer.ts`, `router.ts` et façade legacy
  `one_shot_reminder_tool.ts`;
- ajout de la section "Dépend De L'Architecture De X" avec usage concret de
  `turnFrame`, `pendingToolSkillConfirmation`, `buildToolConfirmationDecision`,
  `requested_effects`, `allowed_effects`, `attempted_effects`,
  `committed_effects` et `blocked_effects`;
- clarification des responsabilités propres à `one_shot_reminder`, des hors
  périmètre, des invariants non négociables et des tests propriétaires;
- documentation des exceptions legacy restantes : guards regex localisés dans
  `route_guards.ts`, fast-path direct dans `router.ts`,
  `runCreateOneShotReminderV2` protégé par `DirectEffectGate`, et façade
  `one_shot_reminder_tool.ts`.

Fichiers modifiés :

- `docs/agent-playbook/New/runtime-contracts/tools/one-shot-reminder.md`;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests lancés :

- changement documentation uniquement;
- vérification manuelle des fichiers/fonctions réels via `rg` et `sed` dans
  `tools/always_on/one_shot_reminder/*`;
- `git diff --check -- docs/agent-playbook/New/runtime-contracts/tools/one-shot-reminder.md docs/agent-playbook/New/test-material/15-chantiers-log.md`
  : vert;
- pas de test runtime relancé.

Limites :

- le contrat documente une migration encore incomplète : `router.ts` garde un
  fast-path create/cancel direct au lieu d'un câblage intégral
  `intake -> reducer -> executeOneShotReminderEffects`;
- `runCreateOneShotReminderV2` reste nécessaire tant que le router canonique ne
  porte pas toute la politique `DirectEffectGate`/idempotence;
- les guards regex restent acceptés seulement comme legacy transitionnel dans
  `route_guards.ts`, avec condition de suppression documentée.

### J55 — Documentation runtime contract `weekly_adaptive_review`

Couche. Documentation d'architecture / proactive weekly skill.

Symptôme architectural :

- `runtime-contracts/proactive/weekly-review.md` décrivait encore une cible
  générique et ne reflétait pas le code actuel `_shared/weekly_review/*` +
  `skills/weekly_review/*`;
- un agent futur pouvait croire que `weekly_adaptive_review.ts`,
  `weekly_bridge.ts` ou `run.ts` pouvaient encore décider une stratégie,
  confirmer localement ou rendre un succès sans ledger;
- les exceptions legacy weekly restaient insuffisamment documentées, notamment
  l'ouverture IA, les guards lexicaux, les matchers de confirmation et le bridge
  adjust-plan.

Fix réel :

- remplacement complet de
  `docs/agent-playbook/New/runtime-contracts/proactive/weekly-review.md`;
- ajout de la section `Dépend De L'Architecture De X` pour relier précisément
  `UserTurnSnapshot`, `TurnAgenda`, `Confirmation Contract`, `EffectLedger` et
  le contrat local `weekly_review_v1`;
- documentation des fichiers réels : `_shared/weekly_review/contract.ts`,
  `projection.ts`, `evidence.ts`, `reducer.ts`, `plan_patch.ts`,
  `confirmation.ts`, `effects.ts`, `renderer.ts`, les façades
  `_shared/weekly_adaptive_review*.ts`, et les sous-modules runtime `state.ts`,
  `confirmation.ts`, `effects.ts`, `renderer.ts`, `bridges.ts`, `guards.ts`,
  `evidence.ts`;
- clarification des responsabilités propres au weekly : preuve, verdict
  habitudes, stratégie, question, patch confirmable, confirmation locale,
  effet/commit, rendu;
- clarification des hors périmètre : pas de stratégie dans `run.ts`, pas
  d'exécution via `weekly_bridge.ts`, pas de modification directe de l'objectif
  de niveau, pas de report d'items déjà faits;
- documentation des invariants non négociables et des tests qui protègent le
  contrat;
- ajout d'un suivi de décisions architecturales dans le contrat weekly.

Fichiers modifiés :

- `docs/agent-playbook/New/runtime-contracts/proactive/weekly-review.md`;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests / vérifications :

- changement documentation uniquement;
- vérification manuelle par lecture de
  `docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md`,
  `docs/agent-playbook/New/runtime-contracts/README.md`,
  `docs/agent-playbook/New/runtime-contracts/proactive/weekly-review.md` et
  `docs/agent-playbook/New/test-material/15-chantiers-log.md`;
- vérification des références réelles via `rg`/`sed` dans
  `_shared/weekly_review/*`, `_shared/weekly_adaptive_review*.ts`,
  `sophia-brain/skills/weekly_review/*`,
  `sophia-brain/tools/operations/adjust_plan_item/weekly_bridge.ts`,
  `process-checkins/index.ts` et `whatsapp-webhook/handlers_pending.ts`;
- aucun test runtime relancé.

Limites restantes :

- `weekly_adaptive_review_opening.ts` reste une génération IA encadrée par
  guard, pas un renderer déterministe pur;
- `skills/weekly_review/confirmation.ts` garde des matchers localisés de
  validation planning / confirmation explicite jusqu'au branchement complet
  `Confirmation Contract` + `TurnAgenda`;
- `skills/weekly_review/guards.ts` et `renderer.ts` gardent des nettoyages
  lexicaux de sécurité visible tant que le renderer weekly n'est pas l'unique
  source de réponse finale;
- `adjust_plan_item/weekly_bridge.ts` reste un bridge legacy vers pending draft
  review, jamais un executor;
- `v2-weekly-bilan-engine.ts` reste testé pour l'ancien bilan V2, mais son
  materializer est legacy pour `weekly_review_v1`.

### J54 — Documentation runtime contract `safety_crisis`

Couche. Documentation d'architecture / runtime contracts.

Symptôme architectural :

- `runtime-contracts/conversation-skills/safety-crisis.md` restait trop court
  pour servir de base de vérité opérationnelle ;
- le contrat ne documentait pas précisément le flow réel
  `intake -> overrides -> reducer -> renderer`, ni les helpers runtime qui
  bloquent tools/direct effects ;
- un agent futur pouvait encore croire qu'il fallait ajouter une logique safety
  dans `run.ts`, un executor durable, ou un fallback regex de désescalade.

Fix réel :

- remplacement complet du contrat runtime `safety_crisis` ;
- ajout de la section "Dépend De L'Architecture De X" reliant explicitement
  `UserTurnSnapshot`, `TurnAgenda`, Confirmation Contract, EffectLedger et le
  contrat local `SafetyCrisisDecision` ;
- documentation des fichiers réels : `contract.ts`, `prompt.ts`, `intake.ts`,
  `signals.ts`, `reducer.ts`, `renderer.ts`, `skill.ts`,
  `safety_crisis_runtime.ts`, `skill_router.ts`, `routers.ts`,
  `operation_runtime_pipeline.ts`, `final_response_pipeline.ts` et `run.ts` ;
- clarification du fait que `safety_crisis` n'a pas d'executor durable
  propriétaire : il prépare seulement des memory candidates non persistées par
  défaut, et le runtime supprime les tools/direct effects ;
- documentation des invariants non négociables de priorité, non-mutation,
  désescalade stricte, ressources France et sortie du mode safety.

Fichiers modifiés :

- `docs/agent-playbook/New/runtime-contracts/conversation-skills/safety-crisis.md`
  ;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests / vérifications :

- changement documentation uniquement pour J54 ;
- lecture de
  `docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md`,
  `docs/agent-playbook/New/runtime-contracts/README.md`,
  `docs/agent-playbook/New/runtime-contracts/conversation-skills/safety-crisis.md`
  et `docs/agent-playbook/New/test-material/15-chantiers-log.md` ;
- vérification par `rg` / `sed` des fonctions et fichiers cités dans le contrat
  safety ;
- `git diff --check -- docs/agent-playbook/New/runtime-contracts/conversation-skills/safety-crisis.md docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Limites restantes :

- les regex de `signals.ts` restent volontairement documentées comme legacy
  safety conservateur : elles peuvent escalader ou maintenir, jamais résoudre
  seules ;
- `RunSkillInput.context` sert encore de snapshot local au lieu d'un
  `UserTurnSnapshot` typé dédié ;
- le renderer reste déterministe parce que le domaine exige une réponse courte,
  vérifiable et non-mutante ;
- cette passe ne modifie pas le code runtime.

---

### J46 — Documentation runtime contract `emotional_repair`

Couche. Documentation architecture / conversation skill L5.

Symptôme architectural :

- `runtime-contracts/conversation-skills/emotional-repair.md` décrivait encore
  une cible générique et trop courte;
- le document ne reflétait pas l'état réel après J8/J16/J21: contrat structuré,
  intake IA, reducer extrait, renderer fallback safe, mémoire
  anti-identity-freeze et retrait des patches L4 spécifiques dans `run.ts`;
- un agent futur pouvait encore croire qu'un fallback regex, une reply hardcodée
  dans `run.ts`, une mémoire brute "je suis nul" ou un wording "c'est fait"
  seraient acceptables.

Fix réel :

- remplacement complet du contrat runtime `emotional_repair`;
- ajout de la section `Dépend De L'Architecture De X` reliant explicitement
  `UserTurnSnapshot`, `TurnAgenda`, `Confirmation Contract`, `EffectLedger` et
  le contrat local du skill;
- documentation des fichiers et fonctions réels: `runEmotionalRepairSkill`,
  `runEmotionalRepairStructuredIntake`, `normalizeEmotionalRepairDecision`,
  `applyEmotionalRepairInvariants`, `validateEmotionalRepairDecision`,
  `reduceEmotionalRepairTurn`, `safetyHandoffEmotionalRepairOutput`,
  `sanitizeEmotionalRepairMemoryCandidates`, `renderSafeEmotionalRepairReply`,
  `buildFallbackEmotionalRepairDecision`, `toConversationOperationSuggestion`;
- clarification des responsabilités appartenant à `emotional_repair` et de
  celles qui appartiennent à `safety_crisis`, `execution_breakdown`, aux tool
  skills, au Confirmation Contract et à l'EffectLedger;
- documentation des invariants non négociables: safety prioritaire, no-potion,
  no-tool, no done language, suggestions consenties seulement, fallback
  non-mutant, mémoire non persistée et non identitaire;
- documentation des limites restantes: `SkillContext` dérivé plutôt qu'un
  `UserTurnSnapshot`/`TurnAgenda` unique, et arbitrage global
  `emotion_dominates` encore dans `routers.ts`.

Fichiers modifiés :

- `docs/agent-playbook/New/runtime-contracts/conversation-skills/emotional-repair.md`;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests / vérifications :

- changement documentation uniquement;
- vérification manuelle des références avec lecture de
  `docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md`,
  `docs/agent-playbook/New/runtime-contracts/README.md`,
  `docs/agent-playbook/New/runtime-contracts/conversation-skills/emotional-repair.md`
  et `docs/agent-playbook/New/test-material/15-chantiers-log.md`;
- scan `rg` ciblé sur `skills/emotional_repair/*`, `router/run.ts` et
  `routers/routers.ts` pour confirmer les fonctions citées et l'intégration
  `emotion_dominates`.

Limites restantes :

- ce chantier ne modifie pas le code runtime;
- les tests Deno n'ont pas été relancés pour cette passe documentation;
- le runtime global ne passe pas encore une frame `UserTurnSnapshot` /
  `TurnAgenda` unique à tous les conversation skills.

### J57 — Documentation runtime contract `execution_breakdown`

Couche. Documentation d'architecture / runtime contracts.

Symptôme architectural :

- `runtime-contracts/conversation-skills/execution-breakdown.md` était trop
  générique et encore transitionnel après J9/J15/J19;
- le contrat mentionnait un runtime incomplet et ne décrivait pas précisément
  `intake.ts`, `contract.ts`, `reducer.ts`, `renderer.ts`, ni l'intégration
  mince dans `run.ts`;
- un agent futur pouvait encore croire qu'un fallback lexical target/blocker,
  une suggestion tool non consentie ou une confirmation parallèle dans `run.ts`
  restaient acceptables.

Fix réel :

- remplacement complet du contrat runtime `execution_breakdown`;
- ajout de la section "Dépend De L'Architecture De X" reliant concrètement
  `RunSkillInput.context`/snapshot de tour, `turn_frame`/agenda, Confirmation
  Contract, EffectLedger et `ExecutionDecision`;
- documentation des fichiers réels : `contract.ts`, `intake.ts`, `prompt.ts`,
  `reducer.ts`, `renderer.ts`, `context_loader.ts`, `router/run.ts` et les tool
  skills suggérés;
- clarification des responsabilités de X : target, blocker, readiness, emotional
  dominance, constraints, response contract, handoff émotionnel, suggestions
  consenties et candidats mémoire conservateurs;
- clarification des interdits : pas de regex métier, pas de fallback lexical
  après échec IA, pas d'executor durable, pas de done language sans effet
  committé, pas de logique métier ajoutée dans `run.ts`.

Fichiers modifiés :

- `docs/agent-playbook/New/runtime-contracts/conversation-skills/execution-breakdown.md`;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests / vérifications :

- changement documentation uniquement pour J57;
- vérification manuelle par lecture de
  `runtime-contracts/00-architecture-doctrine.md`,
  `runtime-contracts/README.md`,
  `runtime-contracts/conversation-skills/execution-breakdown.md`,
  `15-chantiers-log.md` et du module `skills/execution_breakdown/*`;
- les validations runtime liées au chantier J19 restent :
  `deno test --allow-env --allow-net --allow-read --filter "execution_breakdown" supabase/functions/sophia-brain/skills/skills_s3.test.ts`
  vert et `deno check` ciblé du skill/router vert.

Limites restantes :

- `UserTurnSnapshot` et `TurnAgenda` ne sont pas encore des objets uniques dans
  ce skill; leur équivalent actuel passe par `RunSkillInput.context` et
  `turn_frame` compacté dans `intake.ts`;
- `safeReplyFor(...)` reste un fallback de forme/sûreté dans `contract.ts`,
  limité au blocage du done language, au respect des questions/bullets et aux
  réponses de secours, sans décider target/blocker/tool;
- `execution_breakdown` n'a volontairement pas d'executor durable : toute
  création de carte ou modification de plan reste propriétaire du tool skill
  cible après consentement.

### J58 — Documentation runtime contract `status_recap`

Couche. Documentation d'architecture / runtime contracts.

Symptôme architectural :

- `runtime-contracts/conversation-skills/status-recap.md` était encore trop
  synthétique et indiquait à tort que le runtime était "à implémenter";
- le domaine n'avait pas d'agent dédié alors qu'il est central pour les RED de
  status, recap, préférences, rappels annulés et claims DB;
- l'exception déterministe de `status_recap` n'était pas assez explicitée, ce
  qui pouvait pousser un agent à soit ajouter des regex, soit forcer un intake
  IA inutile pour un skill strictement read-only.

Fix réel :

- documentation détaillée du contrat `status_recap` tel qu'implémenté;
- ajout de la section "Dépend De L'Architecture De status_recap";
- clarification du modèle réel :
  `contract -> DB/effect projection -> deterministic reducer -> renderer`;
- documentation des fichiers propriétaires : `contract.ts`, `projection.ts`,
  `reducer.ts`, `renderer.ts`, `effect_history.ts`, `runtime.ts` et intégration
  dans `operation_runtime_pipeline.ts`;
- clarification des invariants : non-mutating absolu, DB métier comme vérité
  d'état, EffectLedger comme timeline d'exécution, product_help/tool/safety
  préemptent le status, no claim without source.

Fichiers modifiés :

- `docs/agent-playbook/New/runtime-contracts/conversation-skills/status-recap.md`;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests / vérifications :

- changement documentation uniquement;
- vérification manuelle par lecture de `skills/status_recap/*`,
  `operation_runtime_pipeline.ts`, `15-chantiers-log.md` J31/J31 persistent
  effect ledger, et des tests `status_recap.test.ts` /
  `status_recap_runtime_test.ts`;
- pas de test Deno relancé pour cette passe documentaire.

Limites restantes :

- `status_recap` reste volontairement hybride : pas encore
  `contract -> structured_intake -> reducer -> renderer`;
- activation encore dépendante de guards legacy status/recap, acceptés
  temporairement parce qu'ils ne peuvent pas committer d'effet;
- une future migration doit remplacer ces guards par un signal dispatcher /
  TurnAgenda structuré sans affaiblir les anti-préemptions product_help, tool
  command, active card draft et safety.

---

### J53 — Documentation runtime contract `confirmation_contract`

Couche. Documentation d'architecture / runtime contracts.

Symptôme architectural :

- `runtime-contracts/04-confirmation-contract.md` etait trop generique et citait
  `tools/operations/_shared/confirmation_adapter.ts`, qui n'est pas le fichier
  reel du runtime actuel;
- le contrat ne decrivait pas clairement la relation entre
  `router/confirmation_contract.ts`, `UserTurnSnapshot`, `TurnAgenda`,
  `EffectLedger` et les reducers L5 proprietaires;
- un agent futur pouvait encore croire qu'une confirmation globale pouvait
  executer directement ou qu'un tool pouvait garder sa propre interpretation
  parallele de `ok`, `oui`, `montre`, `explique`, `oui mais...`.

Fix réel :

- remplacement complet de `runtime-contracts/04-confirmation-contract.md`;
- ajout de la section "Dépend De L'Architecture De X" pour documenter l'usage
  actuel de `pending`, `active_operation`, `agenda_tasks`,
  `turn_frame.confirmation_response`, `EffectLedger` et des contrats locaux;
- documentation precise des fichiers/fonctions :
  `router/confirmation_contract.ts::decideConfirmation`,
  `confirmation_contract.test.ts`, `update_coach_preferences/router.ts`,
  `prepare_attack_card/router.ts`,
  `prepare_attack_card/contract.ts::decidePrepareAttackCardNextStep`,
  `update_coach_preferences/executor.ts::executeUpdateCoachPreferences`,
  `prepare_attack_card/executor.ts::executePrepareAttackCard`,
  `prepare_attack_card/persistence.ts::insertAttackCardFromDraft`;
- clarification des responsabilites qui appartiennent au contrat global
  (classification commune, ciblage, precedence no-commit) et de celles qui
  restent aux skills L5 (intake, reducer, effects, executor, renderer);
- documentation des exceptions legacy restantes :
  `isCoachPreferenceExplicitApprovalForTest`,
  `reviewToolSkillConfirmationWithAi` et draft reviews locales.

Fichiers modifiés :

- `docs/agent-playbook/New/runtime-contracts/04-confirmation-contract.md`;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests / vérifications :

- changement documentation uniquement;
- lecture de
  `docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md`,
  `docs/agent-playbook/New/runtime-contracts/README.md`,
  `docs/agent-playbook/New/runtime-contracts/04-confirmation-contract.md` et
  `docs/agent-playbook/New/test-material/15-chantiers-log.md`;
- vérification manuelle des références citées via les fichiers runtime
  `router/confirmation_contract.ts`,
  `tools/operations/update_coach_preferences/router.ts`,
  `tools/operations/prepare_attack_card/router.ts` et contrats/executors
  associés;
- pas de test Deno relancé pour cette passe documentation.

Limites restantes :

- `UserTurnSnapshot` et `TurnAgenda` sont documentes comme dependances, mais le
  contrat runtime actuel accepte encore des snapshots partiels plutot qu'une
  frame unique;
- `prepare_defense_card`, reminders et `select_state_potion` ne sont pas encore
  branches directement a `decideConfirmation`;
- les fallbacks legacy restent documentes comme temporaires jusqu'a migration
  complete des pending confirmations.

---

### J54 — EffectLedger mandatory proof

Couche. Cross-runtime durable effects / final response safety / documentation
runtime contract.

Symptôme architectural :

- le contrat runtime `05-effect-ledger.md` était trop vague pour servir de base
  opérationnelle aux agents suivants ;
- certains effets étaient déjà ledgerisés, mais la responsabilité exacte entre
  skill, executor, adapter, final guard, persistence et reader n'était pas assez
  explicite ;
- `select_state_potion` passait encore un `executedTools` explicite dans une
  branche success, au lieu de laisser l'adapter runtime le dériver du commit ;
- memory writes et bridges weekly/recommendation devaient être documentés
  clairement comme request/queue/suggestion, pas comme commits.

Fix réel :

- remplacement complet de
  `docs/agent-playbook/New/runtime-contracts/05-effect-ledger.md` ;
- ajout de la section `Dépend De L'Architecture De X` reliant EffectLedger à
  `UserTurnSnapshot`, `TurnAgenda`, Confirmation Contract, contracts locaux,
  `run.ts`, `operation_runtime_pipeline.ts`, `final_response_pipeline.ts`,
  persistence et reader ;
- ajout d'une matrice opérationnelle des sources d'effet : one-shot reminder,
  track progress, recurring reminder, attack/defense cards, adjust plan, state
  potion, coach preferences, weekly bridge, recommendation, memory candidates,
  status/product reads et final reply claims ;
- clarification des invariants : pas de claim durable sans `committed`,
  `executedTools` dérivé de `committed_effects`, bridges/recommendations sans
  commit, memory candidate non durable, ledger persistant comme timeline ;
- `select_state_potion/router.ts` dérive désormais le `executedTools` par défaut
  de la présence de `committed_effects` dans `adaptSkillResultToRuntime`;
- renforcement de `effect_ledger_integration_test.ts` avec
  `all_tool_runtime_results_map_to_ledger`.

Fichiers modifiés :

- `docs/agent-playbook/New/runtime-contracts/05-effect-ledger.md` ;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md` ;
- `supabase/functions/sophia-brain/tools/operations/select_state_potion/router.ts`
  ;
- `supabase/functions/sophia-brain/router/effect_ledger_integration_test.ts`.

Tests / vérifications :

- `deno check supabase/functions/sophia-brain/router/effect_ledger.ts` ;
- `deno check supabase/functions/sophia-brain/router/effect_ledger_adapter.ts` ;
- `deno check supabase/functions/sophia-brain/router/final_response_guards.ts` ;
- `deno check supabase/functions/sophia-brain/router/final_response_pipeline.ts`
  ;
- `deno check supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger_adapter_test.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger_integration_test.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger_persistence_test.ts supabase/functions/sophia-brain/router/effect_ledger_reader_test.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/final_response_pipeline_test.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/bridge_contract_test.ts`
  ;
- `deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/select_state_potion/tests.ts`.

Limites restantes :

- `memory_runtime/memorizer_bridge.ts` queue des `MemoryWriteCandidate` mais ne
  retourne pas encore de preuve d'écriture durable ni d'ID DB ; le ledger doit
  donc bloquer les claims mémoire durable sans `memory.write` commit ;
- le catch `track_progress_plan_item` dans `operation_runtime_pipeline.ts` peut
  encore retourner `null` après failure interne avant production d'un runtime
  failed ledgerisable ;
- `final_response_guards.ts` garde encore `applyUnexecutedEffectClaimGuard`
  comme défense legacy `intendedTools/executedTools` tant que le pipeline final
  ledger n'a pas remplacé tous les chemins ;
- `runtime_guards_architecture_test.ts` échoue encore sur des références
  documentaires existantes à une ancienne commande reset DB Supabase dans
  `docs/agent-playbook/New/test-material/15-chantiers-log.md` et
  `docs/agent-playbook/New/runtime-contracts/testing/central-test-suite.md` ;
- `memory_v2_integration_audit.test.ts` échoue au type-check sur un
  `TurnFrame.tool_skill_opportunity` optionnel, hors périmètre EffectLedger.

---

### J59 — Runtime contracts canonical doctrine and diagrams

Couche. Documentation d'architecture / runtime contracts.

Symptôme architectural :

- la doctrine globale vivait encore dans `13-architecture-skills` alors que
  `runtime-contracts/` était devenu la base de vérité opérationnelle;
- les agents devaient lire deux sources concurrentes pour comprendre les mêmes
  frontières;
- les fichiers transverses n'étaient pas numérotés pour réserver `00` à la
  doctrine;
- il manquait une vue diagrammée des instances Sophia Brain et de leurs vérités
  respectives.

Fix réel :

- création de `runtime-contracts/00-architecture-doctrine.md` comme doctrine
  canonique;
- transformation de `13-architecture-skills` en stub de compatibilité;
- renumérotation des contrats transverses : `01-global-runtime.md`,
  `02-run-thin-orchestrator.md`, `03-user-turn-snapshot-agenda.md`,
  `04-confirmation-contract.md`, `05-effect-ledger.md`;
- création de `06-sophia-brain-runtime-diagram.md` avec diagrammes Mermaid : vue
  globale du tour, vérités système, ownership par instance, cycle tool skill,
  cycle conversation skill, daily/weekly et priorité safety;
- mise à jour de `runtime-contracts/README.md`, `14-qa-test-guidelines.md` et
  des références documentaires vers les nouveaux chemins.

Fichiers modifiés :

- `docs/agent-playbook/13-architecture-skills`;
- `docs/agent-playbook/New/test-material/14-qa-test-guidelines.md`;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`;
- `docs/agent-playbook/New/runtime-contracts/README.md`;
- `docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md`;
- `docs/agent-playbook/New/runtime-contracts/01-global-runtime.md`;
- `docs/agent-playbook/New/runtime-contracts/02-run-thin-orchestrator.md`;
- `docs/agent-playbook/New/runtime-contracts/03-user-turn-snapshot-agenda.md`;
- `docs/agent-playbook/New/runtime-contracts/04-confirmation-contract.md`;
- `docs/agent-playbook/New/runtime-contracts/05-effect-ledger.md`;
- `docs/agent-playbook/New/runtime-contracts/06-sophia-brain-runtime-diagram.md`;
- contrats runtime qui pointaient encore vers l'ancien chemin doctrinal.

Tests / vérifications :

- changement documentation uniquement;
- vérification par
  `find docs/agent-playbook/New/runtime-contracts -maxdepth 1 -type f`;
- vérification par `rg` des anciennes références `00-global-runtime`,
  `01-run-thin-orchestrator`, `02-user-turn-snapshot-agenda`,
  `03-confirmation-contract`, `04-effect-ledger` et `13-architecture-skills`;
- pas de test Deno relancé pour cette passe documentaire.

Limites restantes :

- les anciennes mentions historiques dans les chantiers restent parfois
  descriptives, mais les chemins opérationnels pointent vers les nouveaux
  fichiers;
- `13-architecture-skills` reste volontairement présent comme redirection pour
  ne pas casser les prompts/plans/logs anciens;
- les diagrammes décrivent l'architecture cible et actuelle au niveau système,
  pas les détails internes de chaque skill local.

---

### J60 — `router/run.ts` orchestration shrink continuation

Couche. L4/L5 orchestration runtime.

Symptôme :

- `run.ts` gardait encore des helpers non-orchestrateurs autour du rendu final,
  du choix de modèle, du stale bilan, des préférences coach et de la sélection
  de route opérationnelle;
- certains blocs connaissaient encore des opérations concrètes alors que
  `run.ts` devrait seulement câbler les contrats;
- les tests importaient encore quelques helpers depuis `run.ts`, ce qui freine
  leur déplacement progressif.

Fix :

- extraction de `memory_response_grounding_guard.ts` pour le garde-fou final
  Memory V2;
- extraction de `agent_model_selection.ts` pour le choix de modèle agent;
- extraction de `stale_bilan_runtime.ts` pour la classification stale bilan;
- extraction de `response_visibility_formatting.ts` pour le nettoyage visible et
  l'emoji final;
- déplacement de `loadCoachPreferenceRuntimeContext` dans le module propriétaire
  `update_coach_preferences/runtime_policy.ts`;
- extraction de `operation_route_selection.ts` pour la sélection transitoire
  d'une opération active;
- extraction de `operation_response_owner.ts` avec ré-export depuis `run.ts`
  pour compatibilité tests;
- aucun nouveau détecteur sémantique ajouté dans `run.ts`;
- aucun nouveau message métier user-facing ajouté dans `run.ts`.

Tests :

- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/router/run.ts supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts supabase/functions/sophia-brain/router/effect_ledger.ts supabase/functions/sophia-brain/router/effect_ledger_adapter.ts supabase/functions/sophia-brain/router/final_response_pipeline.ts supabase/functions/sophia-brain/router/memory_response_grounding_guard.ts supabase/functions/sophia-brain/router/agent_model_selection.ts supabase/functions/sophia-brain/router/stale_bilan_runtime.ts supabase/functions/sophia-brain/router/response_visibility_formatting.ts supabase/functions/sophia-brain/router/operation_route_selection.ts supabase/functions/sophia-brain/router/operation_response_owner.ts`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts supabase/functions/sophia-brain/router/turn_agenda.test.ts supabase/functions/sophia-brain/router/user_turn_snapshot.test.ts supabase/functions/sophia-brain/routers/routers.test.ts`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts supabase/functions/sophia-brain/router/run_test.ts supabase/functions/sophia-brain/router/final_response_pipeline_test.ts supabase/functions/sophia-brain/tools/operations/update_coach_preferences/tests.ts`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/runtime_guards_architecture_test.ts`
  : 14/15 verts, échec documentaire préexistant sur deux fichiers qui citent
  encore une commande reset DB Supabase dans des docs historiques.

Limites :

- `run.ts` reste à 6264 lignes après cette passe, donc encore trop gros;
- `run.ts` conserve encore des branches transitoires d'arbitrage weekly,
  recommendation et adjust plan;
- `run.ts` importe encore des helpers de tool skills pour compatibilité avec des
  dépendances injectées aux routers existants;
- le garde-fou d'architecture documentaire reste rouge tant que les mentions
  historiques dans `15-chantiers-log.md` et
  `runtime-contracts/testing/central-test-suite.md` ne sont pas nettoyées ou
  explicitement whitelistées.

---

### J61 — `adjust_plan_item` intake and runtime adapter cleanup

Couche. Tool skill `adjust_plan_item`.

Symptôme :

- `legacy_intake.ts` dupliquait presque entièrement `intake.ts`, ce qui créait
  deux façades capables de diverger pour le même workflow d'intake;
- le router portait encore la construction `AdjustPlanSkillResult` et
  l'adaptation `AdjustPlanOperationRuntimeResult`, alors que ce mapping relève
  de l'adapter runtime local;
- le fallback de question de génération de draft n'était pas centralisé sur le
  renderer local.

Fix :

- `legacy_intake.ts` devient un alias de compatibilité vers `intake.ts`;
- ajout de `runtime_adapter.ts` pour construire les effets locaux, les
  `AdjustPlanSkillResult` et l'adaptation runtime;
- `router.ts` conserve le lifecycle et l'exécution, mais délègue le mapping
  runtime à `runtime_adapter.ts`;
- `intake.ts` utilise le renderer local comme fallback déterministe pour la
  question de confirmation avant génération de draft;
- aucun writer DB n'a été déplacé hors `executor.ts` / `executePending...`;
- `executedTools` reste dérivé uniquement de `committed_effects.length > 0`.

Fichiers modifiés :

- `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/intake.ts`;
- `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/legacy_intake.ts`;
- `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/router.ts`;
- `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/runtime_adapter.ts`;
- `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/generator.ts`;
- `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/weekly_bridge.ts`;
- `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/README.md`;
- `docs/agent-playbook/New/runtime-contracts/tools/adjust-plan-item.md`;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests / vérifications :

- `/usr/local/Cellar/deno/2.6.0/bin/deno fmt supabase/functions/sophia-brain/tools/operations/adjust_plan_item/intake.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/legacy_intake.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/router.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/runtime_adapter.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/generator.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/weekly_bridge.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/README.md docs/agent-playbook/New/runtime-contracts/tools/adjust-plan-item.md docs/agent-playbook/New/test-material/15-chantiers-log.md`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/tools/operations/adjust_plan_item/intake.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/legacy_intake.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/router.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/runtime_adapter.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/generator.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/weekly_bridge.ts`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/adjust_plan_item/tests.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/router_test.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/draft_compiler_test.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/candidate_builder_test.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/adjust_plan_item_effects_test.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/adjust_plan_item_reducer_test.ts supabase/functions/sophia-brain/tools/operations/adjust_plan_item/adjust_plan_item_contract_test.ts`
  : 91 tests passés.

Limites :

- `intake.ts`, `router.ts`, `weekly_bridge.ts` et `generator.ts` restent gros;
- les matchers weekly ciblés restent une exception legacy autorisée, sans
  écriture directe;
- l'extraction plus fine de `generator.ts` demandera une passe dédiée avec tests
  generator complets.

---

### J62 — Tool effect chains explicit in recurring reminders and coach preferences

Couche. Tool Skills L5 / EffectLedger.

Symptôme :

- `create_recurring_reminder` et certains chemins `update_coach_preferences`
  exposaient bien les `committed_effects`, mais pas toujours l'effet demandé et
  autorisé correspondant dans le runtime result;
- le ledger pouvait donc prouver le commit ou l'échec runtime, mais la chaîne
  locale `requested -> allowed -> committed/failed` restait moins explicite que
  le contrat.

Fix :

- `create_recurring_reminder/router.ts` construit un
  `CreateRecurringReminderEffect` au moment de l'approbation exécutable et
  l'expose dans `requested_effects` et `allowed_effects` sur succès comme sur
  échec writer/executor;
- `update_coach_preferences/router.ts` construit un
  `UpdateCoachPreferencesEffect` au moment de l'approbation exécutable et le
  propage dans les résultats success/failure;
- `executedTools` reste strictement dérivé de `committed_effects`;
- aucun slot, fallback sémantique, phrase métier ou writer DB n'a été déplacé.

Fichiers modifiés :

- `supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/router.ts`;
- `supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/tests.ts`;
- `supabase/functions/sophia-brain/tools/operations/update_coach_preferences/router.ts`;
- `supabase/functions/sophia-brain/tools/operations/update_coach_preferences/tests.ts`;
- `docs/agent-playbook/New/runtime-contracts/tools/create-recurring-reminder.md`;
- `docs/agent-playbook/New/runtime-contracts/tools/update-coach-preferences.md`;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests / vérifications :

- `/usr/local/bin/deno fmt supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/router.ts supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/tests.ts supabase/functions/sophia-brain/tools/operations/update_coach_preferences/router.ts supabase/functions/sophia-brain/tools/operations/update_coach_preferences/tests.ts`
  : vert;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/router.ts supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/contract.ts supabase/functions/sophia-brain/tools/operations/update_coach_preferences/router.ts supabase/functions/sophia-brain/tools/operations/update_coach_preferences/contract.ts`
  : vert;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/tools/operations/select_state_potion/router.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/contract.ts`
  : vert;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/tests.ts`
  : 17 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/update_coach_preferences/tests.ts`
  : 38 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/select_state_potion/tests.ts`
  : 31 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger_adapter_test.ts`
  : 7 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger_integration_test.ts`
  : 9 verts.

Limites :

- `select_state_potion` exposait déjà la chaîne d'effets via son `effect_ledger`
  local; aucun changement comportemental n'a été nécessaire dans ce domaine
  pendant cette passe.

---

### J63 — Conversation skills keep tool bridges non-mutating

Couche. Conversation Skills L5 / EffectLedger conversationnel.

Symptôme :

- `product_help` gardait bien `operation_suggestions=[]`, mais son reducer
  convertissait encore `decision.bridge` en `handoff_request` dans
  `effects.requested/allowed`;
- ce signal pouvait laisser croire qu'un bridge explicatif produit appartenait
  déjà à la chaîne d'effets, alors que le contrat `product_help` dit qu'un tool
  flow doit rester propriétaire de son activation, de sa confirmation et de son
  executor;
- le helper partagé autorisait toute `operation_suggestion` reçue, même si un
  appelant legacy oubliait `requires_user_consent=true`.

Fix :

- `product_help/reducer.ts` ne convertit plus `decision.bridge` en
  `handoff_request`; le bridge reste uniquement dans `diagnosis` et dans la
  réponse rendue;
- `conversationEffectsFromCandidates` bloque une suggestion d'opération sans
  consentement explicite avec `reason_code="user_consent_required"`;
- les tests contractuels vérifient qu'un bridge `product_help` ne remplit pas
  `effects.requested`, `effects.allowed`, `effects.committed` ni
  `handoff_request`;
- le contrat runtime `product_help` documente `reducer.ts` comme transition
  non-mutante et interdit explicitement de transformer `decision.bridge` en
  effet.

Fichiers modifiés :

- `supabase/functions/sophia-brain/skills/_shared/conversation_skill_contract.ts`;
- `supabase/functions/sophia-brain/skills/product_help/reducer.ts`;
- `supabase/functions/sophia-brain/skills/conversation_skills_contract_test.ts`;
- `supabase/functions/sophia-brain/skills/skills_s3.test.ts`;
- `docs/agent-playbook/New/runtime-contracts/conversation-skills/product-help.md`;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests / vérifications :

- `/usr/local/bin/deno fmt supabase/functions/sophia-brain/skills/_shared/conversation_skill_contract.ts supabase/functions/sophia-brain/skills/product_help/reducer.ts supabase/functions/sophia-brain/skills/conversation_skills_contract_test.ts supabase/functions/sophia-brain/skills/skills_s3.test.ts`
  : vert;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/skills/conversation_skills_contract_test.ts`
  : 6 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read --filter "product_help" supabase/functions/sophia-brain/skills/skills_s3.test.ts`
  : 17 verts;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/skills/skills_s3.test.ts`
  : 46 verts;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/skills/demotivation_repair/skill.ts supabase/functions/sophia-brain/skills/demotivation_repair/intake.ts supabase/functions/sophia-brain/skills/demotivation_repair/contract.ts supabase/functions/sophia-brain/skills/demotivation_repair/reducer.ts supabase/functions/sophia-brain/skills/demotivation_repair/renderer.ts supabase/functions/sophia-brain/skills/emotional_repair/skill.ts supabase/functions/sophia-brain/skills/emotional_repair/intake.ts supabase/functions/sophia-brain/skills/emotional_repair/contract.ts supabase/functions/sophia-brain/skills/emotional_repair/reducer.ts supabase/functions/sophia-brain/skills/emotional_repair/renderer.ts supabase/functions/sophia-brain/skills/execution_breakdown/skill.ts supabase/functions/sophia-brain/skills/execution_breakdown/intake.ts supabase/functions/sophia-brain/skills/execution_breakdown/contract.ts supabase/functions/sophia-brain/skills/execution_breakdown/reducer.ts supabase/functions/sophia-brain/skills/execution_breakdown/renderer.ts supabase/functions/sophia-brain/skills/product_help/skill.ts supabase/functions/sophia-brain/skills/product_help/contract.ts supabase/functions/sophia-brain/skills/product_help/intake.ts supabase/functions/sophia-brain/skills/product_help/retrieval.ts supabase/functions/sophia-brain/skills/product_help/renderer.ts supabase/functions/sophia-brain/skills/product_help/reducer.ts supabase/functions/sophia-brain/skills/safety_crisis/skill.ts supabase/functions/sophia-brain/skills/safety_crisis/contract.ts supabase/functions/sophia-brain/skills/safety_crisis/signals.ts supabase/functions/sophia-brain/skills/safety_crisis/intake.ts supabase/functions/sophia-brain/skills/safety_crisis/reducer.ts supabase/functions/sophia-brain/skills/safety_crisis/renderer.ts supabase/functions/sophia-brain/skills/status_recap/runtime.ts supabase/functions/sophia-brain/skills/status_recap/contract.ts supabase/functions/sophia-brain/skills/status_recap/projection.ts supabase/functions/sophia-brain/skills/status_recap/reducer.ts supabase/functions/sophia-brain/skills/status_recap/renderer.ts`
  : vert;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/skills/status_recap/status_recap.test.ts supabase/functions/sophia-brain/skills/status_recap/status_recap_runtime_test.ts`
  : 19 verts.

Vérification bloquée :

- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`
  échoue au type-check dans `router/run.ts` sur des duplications/imports
  coaching préexistants hors périmètre `skills/**`;
- `/usr/local/bin/deno test --no-check --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts`
  échoue avant exécution des tests sur
  `SyntaxError: Duplicate export of
  'mapMomentumStateV2ToCoachingContext'`
  dans `router/run.ts`.

Limites :

- `run_product_help_guard.test.ts` reste bloqué par `router/run.ts`, hors
  périmètre de cette passe;
- `product_help` conserve son intake legacy exporté uniquement comme exception
  documentée; aucun nouveau fallback sémantique n'a été ajouté.

---

### J64 — `always_on` one-shot reminder and progress commit-proof cleanup

Couche. Always-on direct effects `one_shot_reminder` et
`track_progress_plan_item`.

Symptôme :

- `one_shot_reminder/router.ts` adaptait les outcomes legacy directement et
  pouvait dériver `executed_tools` d'un statut `cancelled`/`success` plutôt que
  d'un commit local construit;
- les aliases legacy status/product/recurring handoff existaient dans les tests
  mais n'étaient pas explicités dans le contrat local;
- `parseOneShotReminderRequest` bloquait un message burst multi-lignes dès
  qu'une ligne de contexte contenait une cadence récurrente, même si la demande
  one-shot explicite était dans une ligne séparée;
- `track_progress_plan_item/router.ts` appelait le writer et construisait le
  commit dans le même bloc de routing.

Fix :

- `one_shot_reminder/router.ts` centralise la classification via l'intake local,
  traite `product_help`, `status_question` et `ignore` comme non-mutants, gère
  `replace` comme cancel + create avec réponse honnête en succès partiel, et
  dérive `executed_tools` uniquement de `committed_effects`;
- les commits cancel one-shot sont construits depuis les ids DB quand
  disponibles, ou depuis les labels legacy comme compatibilité; sans preuve
  locale, le router échoue fermé sans wording "annulé";
- `time_parser.ts` sélectionne une ligne candidate one-shot dans un burst
  multi-lignes au lieu de laisser un contexte récurrent voisin bloquer la
  demande ponctuelle;
- `track_progress_plan_item/executor.ts` isole l'appel writer et la preuve
  `logged_progress_id`; le router garde l'intake/gate/routing/rendu.

Fichiers modifiés :

- `supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/contract.ts`;
- `supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/intake.ts`;
- `supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/reducer.ts`;
- `supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/router.ts`;
- `supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/time_parser.ts`;
- `supabase/functions/sophia-brain/tools/always_on/track_progress_plan_item/executor.ts`;
- `supabase/functions/sophia-brain/tools/always_on/track_progress_plan_item/router.ts`;
- `docs/agent-playbook/New/runtime-contracts/tools/one-shot-reminder.md`;
- `docs/agent-playbook/New/runtime-contracts/tools/track-progress-plan-item.md`;
- `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Tests / vérifications :

- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/router.ts supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/intake.ts supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/time_parser.ts supabase/functions/sophia-brain/tools/always_on/track_progress_plan_item/router.ts supabase/functions/sophia-brain/tools/always_on/track_progress_plan_item/executor.ts`
  : vert;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/one_shot_reminder_tool_test.ts supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/one_shot_reminder_router_test.ts supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/one_shot_reminder_reducer_test.ts supabase/functions/sophia-brain/tools/always_on/one_shot_reminder/one_shot_reminder_executor_test.ts supabase/functions/sophia-brain/tools/always_on/track_progress_plan_item/track_progress_plan_item_tool_test.ts`
  : 88 verts.

Conflit / arbitrage :

- conflit mineur entre le contrat one-shot qui ne nommait que `status` /
  `answer_product_question` et les chemins/tests legacy qui exposent
  `status_question` / `product_help` / `ignore`; option conservatrice retenue :
  aliases documentés comme non-mutants, sans effet durable ni wording "fait".

---

### J65 — `router/run.ts` sub-orchestration extraction push

Couche. L4/L5 orchestration runtime.

Symptôme :

- `run.ts` restait au-dessus de 6K lignes malgré les premières extractions;
- des blocs entiers de ciblage plan, recommendation, onboarding/checkup,
  coaching intervention, persistance conversationnelle et bridge adjust-plan
  vivaient encore dans l'orchestrateur;
- viser 3K lignes impose de sortir des sous-orchestrations complètes, pas
  seulement des petits helpers.

Fix :

- extraction de `plan_targeting_support.ts`;
- extraction de `recommendation_runtime_support.ts`;
- extraction de `turn_context_runtime.ts`;
- extraction de `coaching_intervention_runtime_support.ts`;
- extraction de `conversation_route_runtime_support.ts`;
- extraction de `adjust_plan_operation_bridge.ts`;
- `run.ts` descend à 4136 lignes après formatage;
- suppression du dernier import direct de router tool operation dans `run.ts`;
- mise à jour du garde-fou architecture pour exiger zéro import direct de router
  tool operation depuis `run.ts`;
- les exports historiques utilisés par les tests sont conservés via ré-export
  depuis `run.ts`.

Tests :

- `/usr/local/Cellar/deno/2.6.0/bin/deno fmt supabase/functions/sophia-brain/router/run.ts supabase/functions/sophia-brain/router/adjust_plan_operation_bridge.ts supabase/functions/sophia-brain/router/conversation_route_runtime_support.ts supabase/functions/sophia-brain/router/coaching_intervention_runtime_support.ts supabase/functions/sophia-brain/router/turn_context_runtime.ts supabase/functions/sophia-brain/router/recommendation_runtime_support.ts supabase/functions/sophia-brain/router/plan_targeting_support.ts`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/router/run.ts supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts supabase/functions/sophia-brain/router/effect_ledger.ts supabase/functions/sophia-brain/router/effect_ledger_adapter.ts supabase/functions/sophia-brain/router/final_response_pipeline.ts supabase/functions/sophia-brain/router/adjust_plan_operation_bridge.ts supabase/functions/sophia-brain/router/conversation_route_runtime_support.ts supabase/functions/sophia-brain/router/coaching_intervention_runtime_support.ts supabase/functions/sophia-brain/router/turn_context_runtime.ts supabase/functions/sophia-brain/router/recommendation_runtime_support.ts supabase/functions/sophia-brain/router/plan_targeting_support.ts`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_test.ts supabase/functions/sophia-brain/router/run_product_help_guard.test.ts supabase/functions/sophia-brain/router/final_response_pipeline_test.ts`
  : 122 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts supabase/functions/sophia-brain/router/turn_agenda.test.ts supabase/functions/sophia-brain/router/user_turn_snapshot.test.ts supabase/functions/sophia-brain/routers/routers.test.ts`
  : 45 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/runtime_guards_architecture_test.ts`
  : 14/15 verts; échec documentaire préexistant sur deux fichiers qui citent
  encore une ancienne commande de reset DB Supabase.

Limites :

- 3K lignes reste possible, mais le prochain gain doit sortir des parties de
  `processMessage` lui-même : debounce abort, stale checkup/risk reset,
  construction du contexte agent, post-runtime persistence/trace;
- `run.ts` garde encore des imports directs de plusieurs guards legacy et
  bridges weekly;
- le garde-fou d'architecture documentaire connu reste hors périmètre tant que
  les anciennes mentions de commande reset DB dans les docs ne sont pas
  traitées.

---

### J66 — `router/run.ts` below 3K orchestration line

Couche. L4/L5 orchestration runtime.

Symptôme :

- `run.ts` restait à 4136 lignes après les extractions précédentes;
- la réponse post-runtime d'opération contenait encore ledger, rendu visible,
  trace et persistance dans l'orchestrateur;
- la préparation recommendation et la persistance du normal reply vivaient
  encore dans `processMessage`, ce qui rendait le debug trop large.

Fix :

- extraction de `operation_runtime_response_handler.ts` pour gérer la sortie
  `OperationRuntimeResult` : style, weekly guard, ledger, trace, turn summary et
  retour final;
- extraction de `normal_reply_persistence_pipeline.ts` pour gérer merge mémoire,
  recommendation pending, coaching observability, momentum/repair, relation
  preferences, assistant log, turn summary et conversation pulse;
- renforcement de `recommendation_runtime_support.ts` pour posséder la
  recommendation de tour au lieu de laisser `run.ts` appeler registry/tool;
- extraction de `defense_card_win_runtime.ts`;
- déplacement de petits helpers restants vers `turn_context_runtime.ts`,
  `plan_targeting_support.ts` et `adjust_plan_operation_bridge.ts`;
- nettoyage documentaire des anciennes mentions exactes de commandes Supabase
  destructives pour laisser le garde-fou architecture passer;
- `run.ts` descend à 2988 lignes après formatage.

Tests :

- `/usr/local/Cellar/deno/2.6.0/bin/deno fmt supabase/functions/sophia-brain/router/run.ts supabase/functions/sophia-brain/router/operation_runtime_response_handler.ts supabase/functions/sophia-brain/router/normal_reply_persistence_pipeline.ts supabase/functions/sophia-brain/router/recommendation_runtime_support.ts supabase/functions/sophia-brain/router/defense_card_win_runtime.ts supabase/functions/sophia-brain/router/turn_context_runtime.ts supabase/functions/sophia-brain/router/plan_targeting_support.ts supabase/functions/sophia-brain/router/adjust_plan_operation_bridge.ts`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno check supabase/functions/sophia-brain/router/run.ts supabase/functions/sophia-brain/router/operation_runtime_response_handler.ts supabase/functions/sophia-brain/router/normal_reply_persistence_pipeline.ts supabase/functions/sophia-brain/router/recommendation_runtime_support.ts supabase/functions/sophia-brain/router/defense_card_win_runtime.ts supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts supabase/functions/sophia-brain/router/effect_ledger.ts supabase/functions/sophia-brain/router/effect_ledger_adapter.ts supabase/functions/sophia-brain/router/final_response_pipeline.ts`;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/effect_ledger.test.ts supabase/functions/sophia-brain/router/turn_agenda.test.ts supabase/functions/sophia-brain/router/user_turn_snapshot.test.ts supabase/functions/sophia-brain/routers/routers.test.ts supabase/functions/sophia-brain/router/run_product_help_guard.test.ts supabase/functions/sophia-brain/router/run_test.ts`
  : 164 verts;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/runtime_guards_architecture_test.ts`
  : 15 verts;
- `git diff --check -- supabase/functions/sophia-brain/router/run.ts supabase/functions/sophia-brain/router/operation_runtime_response_handler.ts supabase/functions/sophia-brain/router/normal_reply_persistence_pipeline.ts supabase/functions/sophia-brain/router/recommendation_runtime_support.ts supabase/functions/sophia-brain/router/defense_card_win_runtime.ts supabase/functions/sophia-brain/router/turn_context_runtime.ts supabase/functions/sophia-brain/router/plan_targeting_support.ts supabase/functions/sophia-brain/router/adjust_plan_operation_bridge.ts docs/agent-playbook/New/test-material/15-chantiers-log.md`.

Limites :

- `run.ts` reste un orchestrateur très dense : dispatcher/arbitration et
  quelques bridges weekly/safety y sont encore visibles;
- certains imports legacy conversation/one-shot restent nécessaires pour les
  guards transitionnels existants;
- les nouveaux pipelines utilisent encore des contrats larges pour éviter une
  réécriture fonctionnelle du tour complet dans cette passe.

---

### J67 — Suivi QA par familles de bugs et feuilles par run

Couche. QA architecture / anti-patching / documentation operationnelle.

Symptôme :

- les anciens runs et les nouvelles regressions post-contrats etaient analyses
  dans des rapports longs, mais sans registre fin permettant de suivre bug par
  bug la famille, l'owner, le fix et la verification;
- `15-chantiers-log.md` servait a la fois de journal de decisions et de
  substitute de suivi QA detaille, ce qui rendait les corrections difficiles a
  relire;
- sans nomenclature partagee, un agent pouvait encore corriger un tour rouge par
  patch local au lieu de corriger la famille amont.

Fix :

- ajout de `docs/agent-playbook/New/test-material/familly-bugs.md` comme
  document canonique de suivi QA;
- definition de 26 familles coeur + 3 familles transverses `BF-*` couvrant
  routing, agenda, intake, reducer, confirmation, effects, ledger, renderer,
  status, memory, preferences, safety, proactive et tests;
- creation du dossier `docs/agent-playbook/New/test-material/run-bug-sheets/`
  avec `README.md`, `TEMPLATE.md` et une premiere feuille pour
  `global15_20260530_arch_r1`;
- mise a jour de `01-qa-run-report-structure.md` pour exiger une feuille de bugs
  sur les runs red/yellow;
- mise a jour des prompts contractuels pour obliger la classification `BF-*` et
  la mise a jour de la feuille quand la mission part d'un run QA.

Tests / verifications :

- changement documentaire uniquement;
- verification manuelle de coherence avec les rapports QA presents dans
  `docs/agent-playbook/qa-run-global15-*` et les runs historiques dans
  `tests/real-personas/qa-skill/runs/`.

Limites :

- les anciennes salves n'ont pas encore chacune leur feuille retroactive;
- le premier usage operationnel devra mettre a jour le statut des lignes
  `open -> fixed -> verified` au fil des corrections.

---

### J68 — Regroupement du materiel QA dans `test-material`

Couche. Documentation QA / test material / compatibilite prompts.

Symptôme :

- la structure des rapports QA, le chantiers-log, la taxonomie de bugs et les
  feuilles par run etaient disperses entre la racine `agent-playbook/` et
  `qa-operations/`;
- les agents devaient retenir plusieurs emplacements pour un meme cycle de
  travail QA : rapport, bug sheet, suivi tests, entree chantier;
- les anciens chemins restent mentionnes dans beaucoup de prompts et documents.

Fix :

- creation de `docs/agent-playbook/New/test-material/` comme dossier canonique;
- deplacement de `01-qa-run-report-structure.md`, `15-chantiers-log.md`,
  `familly-bugs.md` et `run-bug-sheets/` dans ce dossier;
- ajout d'un `README.md` expliquant les roles respectifs rapport / bug sheet /
  chantiers-log;
- conservation de stubs de compatibilite aux anciens chemins racine;
- mise a jour des references principales dans `runtime-contracts`,
  `contract-prompts`, `14-qa-test-guidelines.md`,
  `11-skill-qa-conversation-runs.md` et les rapports QA recents.

Tests / verifications :

- changement documentaire uniquement;
- verification par `rg` des references encore actives aux anciens chemins.

Limites :

- les references historiques internes au chantiers-log peuvent encore citer
  `15-chantiers-log.md` de maniere courte; elles sont conservees comme archive,
  pas comme consigne active.

---

### J69 — Regroupement des nouveaux dossiers dans `New`

Couche. Documentation agents / organisation playbook.

Symptôme :

- `contract-prompts`, `runtime-contracts` et `test-material` etaient trois
  dossiers racine distincts sous `docs/agent-playbook/`;
- l'utilisateur veut une entree unique pour tout le nouveau systeme documentaire
  afin que les agents distinguent clairement l'ancien playbook des nouvelles
  bases contractuelles.

Fix :

- creation de `docs/agent-playbook/New/`;
- deplacement de `contract-prompts/`, `runtime-contracts/` et `test-material/`
  dans `New/`;
- ajout de `New/README.md`;
- mise a jour des references principales dans les prompts, guidelines, stubs,
  rapports QA et commentaires de code.

Tests / verifications :

- changement documentaire uniquement;
- verification par `rg` des anciens chemins absolus des trois dossiers deplaces
  vers `New/`.

Limites :

- les mentions courtes historiques `runtime-contracts/...` dans le chantiers-log
  restent des references d'archive; les nouveaux prompts doivent utiliser
  `docs/agent-playbook/New/...`.

---

### J70 — Guidelines QA et familles de bugs dans `test-material`

Couche. Documentation QA / organisation playbook.

Symptôme :

- `14-qa-test-guidelines.md` restait a la racine du playbook alors qu'il fait
  partie du materiel de test;
- le document de taxonomie `16-suivi-tests.md` gardait un nom numerote qui ne
  disait pas clairement son role de registre des familles de bugs.

Fix :

- deplacement canonique de `14-qa-test-guidelines.md` dans
  `docs/agent-playbook/New/test-material/`;
- renommage de `16-suivi-tests.md` en `familly-bugs.md` dans
  `docs/agent-playbook/New/test-material/`;
- conservation de stubs racine pour compatibilite;
- mise a jour des references actives vers les nouveaux chemins.

Tests / verifications :

- changement documentaire uniquement;
- verification par `rg` des anciennes references canoniques.

Limites :

- les references courtes historiques dans le chantiers-log peuvent rester comme
  archive lorsqu'elles ne sont pas des consignes actives.

---

### J71 — README racine `New` comme porte d'entree agents

Couche. Documentation agents / process de changement.

Symptôme :

- `New/README.md` listait les trois dossiers mais ne reliait pas encore
  clairement contrats runtime, prompts agents et materiel QA;
- un agent pouvait encore savoir qu'un dossier existe sans comprendre quoi lire
  dans son perimetre, quoi tester et quoi mettre a jour a la fin.

Fix :

- refonte de `docs/agent-playbook/New/README.md` en guide operationnel;
- ajout d'un parcours obligatoire avant modification de code;
- ajout d'une section sur l'usage de `runtime-contracts/`, `contract-prompts/`
  et `test-material/`;
- ajout d'une checklist de sortie pour contrat lu, famille `BF-*`, feuille de
  bugs, chantiers-log, tests et conflits architecturaux;
- ajout de criteres d'escalade quand le code et le contrat divergent.

Tests / verifications :

- changement documentaire uniquement;
- verification `git diff --check`.

Limites :

- les README de sous-dossiers restent les sources detaillees; le README racine
  sert de routage et de process, pas de duplication exhaustive.

---

### J72 — Rapport QA obligatoire avec familles par tour

Couche. Documentation QA / suivi bugs / anti-patching.

Symptôme :

- les rapports QA pouvaient conclure `yellow` ou `red` sans rattacher chaque
  tour problematique a une famille `BF-*`;
- les fixes proposes pouvaient rester trop locaux si le rapport ne forçait pas
  l'analyse de la source amont;
- le README racine ne disait pas explicitement qu'un test QA doit produire un
  rapport exploitable apres execution.

Fix :

- mise a jour de `01-qa-run-report-structure.md` pour exiger un verdict par tour
  et une famille `BF-*` pour chaque tour `yellow` ou `red`;
- ajout d'un bloc d'analyse par tour rouge/jaune : symptome, source amont, owner
  runtime, correction recommandee et justification anti-patch;
- mise a jour de `14-qa-test-guidelines.md` pour rendre le rapport post-test
  obligatoire et encadrer les corrections proposees;
- mise a jour de `New/README.md` pour rendre visible cette obligation dans le
  process general agents.

Tests / verifications :

- changement documentaire uniquement;
- verification `git diff --check`.

Limites :

- les anciens rapports ne sont pas retroactivement convertis; la regle vaut pour
  les nouveaux runs et les reprises de runs.

---

### J73 — Clarification transverse dispatcher et skills conversationnels

Couche. Runtime Sophia Brain / dispatcher / clarification non-mutante.

Symptôme :

- les ambiguïtés hors flow pouvaient être capturées par `product_help` ou par un
  tool skill avant qu'une question discriminante soit posée;
- les primitives `clarification_tool` existaient mais n'étaient pas encore
  branchées dans le runtime réel après production du `TurnFrame`;
- les runs QA réels `clarification-dispatcher-real-20260601-r1/r2` étaient
  rouges sur rappel ponctuel vs récurrent et aide produit vs carte d'attaque.

Fix :

- ajout de `router/clarification_candidate_builder.ts` pour convertir seulement
  des signaux structurés `TurnFrame` en candidats;
- ajout de `router/clarification_arbitrator.ts` après `TurnFrame` et avant les
  handlers exécutables;
- ajout de `orientation_clarification` comme owner runtime non-mutant;
- blocage de `tool_skill_router`, `product_help`, `operation_runtime_pipeline`
  et `direct_effects` quand une clarification est requise;
- stockage temporaire `__clarification_state_v1` sans pending confirmation
  exécutable;
- ajout de `skills/_shared/clarification_adapter.ts` pour les conversation
  skills;
- mise à jour du prompt dispatcher pour conserver les signaux concurrents sans
  trancher l'intention.

Tests / vérifications :

- `deno check` sur le module clarification, l'arbitrator, l'adapter et
  `router/run.ts`;
- tests unitaires `clarification_tool`, builder, arbitrator et adapter;
- tests dispatcher et route replays avec `deno test --allow-read`;
- QA réelle locale à exécuter via `/functions/v1/test-send-message` avec
  `force_full_ai=true` pour fermer les bugs CDR.

Limites :

- les tool skills complexes ne sont pas refondus dans ce lot;
- les skills conversationnels disposent de l'adapter commun, mais leur adoption
  fine reste progressive par domaine.

---

### J74 — `adjust_plan_item` devient un handoff plateforme no-mutation

Couche. Runtime Sophia Brain / tool skill adjust_plan_item / weekly bridge.

Symptome :

- `adjust_plan_item` gardait un terminal operationnel dans le chat :
  confirmation token, draft executable, executor et writer DB plan;
- les suites courtes comme "ok vas-y" pouvaient encore etre interpretees comme
  une autorisation d'appliquer;
- les runs QA full AI montraient un renderer trop pauvre ou une perte de flow
  vers `status_recap` / aide produit.

Fix :

- remplacement du router nominal par un runtime `platform_handoff_skill`;
- ajout du contrat `AdjustPlanHandoffDraft` / `AdjustPlanHandoffState` avec
  `no_chat_mutation=true` et `executable_from_chat=false`;
- renderer proprietaire avec recommandation complete, destination Plan et phrase
  no-mutation;
- protection des suites actives `repeat_handoff`, `revise_handoff` et
  `apply_attempt`;
- retrait de `adjust_plan_item` du chemin executable du pipeline nominal;
- bridge weekly garde le signal d'ajustement mais route vers handoff, pas vers
  patch ou execution;
- contrat documentaire `runtime-contracts/tools/adjust-plan-item.md` aligne sur
  la categorie `platform_handoff_skill`.

Tests / verifications :

- test unitaire handoff runtime : renderer complet, apply_attempt no-execute,
  repeat_handoff, classification des suites, imports structurels interdits;
- verification `rg` : le runtime nominal n'importe plus `executeAdjustPlanItem`,
  `writePlanAdjustmentPatch` ou `createConfirmationToken`;
- QA reelle full AI a executer selon `14-qa-test-guidelines.md` pour fermer le
  chantier.

Limites :

- le code legacy executable reste isole dans `legacy_execution_router.ts` et
  certains tests historiques couvrent encore l'ancien materiel de generation;
- la suppression complete du legacy devra se faire apres migration des tests
  anciens qui validaient explicitement l'application de patchs.

---

### J75 — `prepare_defense_card` handoff robuste sur signaux TurnFrame

Couche. Runtime Sophia Brain / tool skill prepare_defense_card / QA famille
`BF-EFFECT-04`.

Symptome :

- le run QA `defense-ui-fields-r1c` routait correctement vers
  `prepare_defense_card`, mais le skill tombait en `technical_blocked` avec
  `reason_code=invalid_ai_output`;
- le `TurnFrame` contenait deja `target_hint` et `operation_input`
  (`trigger`, `risk_behavior`), mais le router ne les passait pas comme graine
  au skill;
- quand le slot filler signalait un slot manquant sans
  `generated_user_message`, l'intake produisait un fallback technique au lieu
  d'une clarification ciblee.

Fix :

- le router convertit les signaux structures `TurnFrame.tool_skill_intents`
  en `operation_input` de depart sans analyser le texte brut du user;
- l'intake peut amorcer une attache libre et une situation de risque depuis
  cette entree structuree;
- un slot manquant sans phrase IA produit une clarification locale basee sur le
  slot manquant, sans remplir de slot metier par regex;
- le runtime reste `platform_handoff` no-mutation : pas de writer DB, pas de
  confirmation token, pas de `committed_effects`.

Tests / verifications :

- tests unitaires ajoutes pour l'amorcage depuis `TurnFrame` et la
  clarification deterministe quand la phrase IA manque;
- attentes existantes ajustees : une attache plan invalide en demande directe
  clarifie au lieu de bloquer techniquement;
- QA reelle a relancer pour passer le bug sheet `defense-ui-fields-r1c` de
  `fixed` a `verified`.

Limites :

- `slot_filler.ts` reste le proprietaire de la comprehension metier; le router
  ne doit pas extraire de nouveaux slots depuis le texte user;
- une indisponibilite reelle du slot filler reste un blocage technique.

---

### J76 — `prepare_defense_card` devient un handoff field-aware des inputs plateforme

Couche. Runtime Sophia Brain / tool skill prepare_defense_card / handoff
plateforme.

Symptome :

- le handoff defense construisait encore des champs visibles depuis un
  `DefenseCardDraftV1`;
- le renderer affichait une "version a reprendre", des "champs finaux", un
  brouillon implicite et des conseils "a preserver / a eviter";
- le chemin nominal dependait encore du `draft_generator`, alors que le produit
  attendu est d'aider le user a remplir les vrais champs de la plateforme.

Fix :

- ajout de `platform_fields.ts` comme catalogue canonique des champs UI
  defense. Version initiale trop large, corrigée ensuite en J78;
- ajout de `platform_field_filler.ts`, sous-skill IA dedie aux champs UI avec
  statuts `missing`, `proposed`, `locked`;
- `ai_intake.ts` garde l'intake global defense, puis appelle le field filler au
  lieu du draft generator dans le chemin nominal;
- le router construit le handoff depuis les champs verrouilles, avec compat
  legacy pour les anciens drafts pending;
- le renderer affiche uniquement cible, risque, destination plateforme, champs a
  remplir et phrase no-mutation.

Tests / verifications :

- tests unitaires ajoutes pour extraction field-aware, champ manquant non
  infere, valeur vague proposee, correction de champ, route plan item et draft
  generator non appele en nominal;
- tests handoff existants realignes sur le wording field-aware;
- checks Deno du domaine a lancer apres chaque modification.

Limites :

- le legacy `DefenseCardDraftV1` reste supporte pour les pending anciens et
  l'executor hors chemin nominal;
- le field filler reste IA-owned : pas d'extraction regex des champs UI dans le
  router ou `run.ts`.

---

### J77 — Renderer défense compact et run rouge sur utilisateur incertain

Couche. Runtime Sophia Brain / prepare_defense_card / renderer et QA routing.

Symptome :

- le run `defense-field-aware-r1` etait initialement classe vert alors que le
  handoff visible repetait cible, risque, destination, et champs;
- `apply_attempt` reaffichait tout le handoff au lieu de rappeler seulement que
  la creation chat est impossible et ou reprendre les champs;
- le run reel `defense-uncertain-fields-r1` montre un bug plus amont : apres
  une hesitation attaque/defense, Sophia reste en `orientation_clarification`
  puis `normal_reply`, sans jamais selectionner `prepare_defense_card`.

Fix :

- le rapport `defense-field-aware-r1` est reclasse `yellow` avec bug sheet;
- le renderer `prepare_defense_card` affiche maintenant destination + champ UI
  compact, sans resume cible/risque redondant;
- `apply_attempt` a un rendu dedie court, non-mutant, qui rappelle seulement la
  destination plateforme;
- le contrat runtime precise que `apply_attempt` ne doit pas reafficher tout le
  handoff.

Tests / verifications :

- `git diff --check` cible : vert;
- scan renderer des libelles interdits : aucun match;
- `/usr/local/Cellar/deno/2.6.0/bin/deno check` cible : vert;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-read --allow-env`
  sur les tests `prepare_defense_card` : 41 passed;
- run QA reel `defense-uncertain-fields-r1` : `red`, bug sheets ouvertes pour
  la sortie de clarification vers le mauvais owner.

Limites :

- le renderer compact est fixe mais pas encore verifie dans un run reel vert,
  car le nouveau scenario incertain ne route jamais vers le skill;
- prochaine correction : owner `orientation_clarification` / arbitration, pas
  renderer.

---

### J78 — `prepare_defense_card` aligne le handoff sur l'unique champ UI réel

Couche. Runtime Sophia Brain / prepare_defense_card / platform fields.

Symptome :

- le handoff field-aware préparait encore plusieurs pseudo-champs plateforme :
  besoin, moment, signal, geste et plan B;
- l'UI réelle de création d'une carte de défense ne demande qu'une question :
  "Avec quelle situation / contexte / environnement / pulsion as-tu besoin
  d'aide ?";
- afficher moment/signal/geste revenait à produire un brouillon ou un modèle de
  carte, ce qui n'est pas le rôle du chat.

Fix :

- `platform_fields.ts` ne déclare plus qu'un champ nominal `support_need`;
- `platform_field_filler.ts` utilise les slots internes seulement pour formuler
  la réponse à ce champ unique;
- le router construit le handoff depuis `support_need`, y compris pour les
  anciens drafts legacy;
- le renderer affiche `Champ à remplir` au singulier et ignore les anciens
  `questionnaire_answers` multi-champs;
- les tests protègent l'absence de champs visibles `Moment / contexte`,
  `Premier signal`, `Geste de défense`, `Plan B` et `promesse`.

Tests / verifications :

- `/usr/local/Cellar/deno/2.6.0/bin/deno check` cible : vert;
- `/usr/local/Cellar/deno/2.6.0/bin/deno test --allow-read --allow-env`
  sur les tests `prepare_defense_card` : 41 passed.

Limites :

- le bug de routing observe dans `defense-uncertain-fields-r1` reste ouvert :
  après clarification attaque/defense, le systeme peut encore partir en
  `normal_reply` au lieu de `prepare_defense_card`;
- prochaine correction attendue : transfert `orientation_clarification` vers le
  skill défense quand le user choisit explicitement défense.

---

### J79 — Les potions sortent des opportunities implicites et passent par bridge consenti

Couche. Dispatcher / conversation skills / select_state_potion.

Decision :

- `state_potion` ne doit plus être proposé comme `tool_skill_opportunity`
  implicite depuis honte, pression, perte de sens, fatigue émotionnelle ou flou
  d'exécution;
- une potion entre dans le runtime seulement via demande explicite utilisateur,
  suite d'un handoff actif, ou `operation_suggestions` consentie depuis un skill
  conversationnel;
- `demotivation_repair` peut suggérer `clarte`, `courage` ou `rappel` après
  diagnostic local;
- `emotional_repair` peut suggérer `guerison`, `amour` ou `apaisement` après
  stabilisation;
- chaque bridge potion doit transmettre
  `operation_input_hint.context.handoff_summary` pour que le sous-skill potion
  conserve le contexte déjà clarifié.

Raison :

- éviter le croisement entre support conversationnel immédiat et support
  plateforme durable;
- garder le diagnostic émotionnel ou motivationnel dans son owner;
- empêcher le dispatcher de recommander une potion sur un état implicite qui
  relève d'abord d'un repair.

Tests attendus :

- dispatcher : suppression d'une opportunity `state_potion` non explicite et
  maintien d'une demande explicite de potion;
- skills : suggestions potion consenties avec résumé contextuel;
- resolver : conservation du payload `handoff_summary` jusqu'à la
  recommandation runtime.

---

### J80 — `prepare_defense_card` clarifie attaque vs defense avant handoff

Couche. Router / orientation clarification / prepare_defense_card.

Symptome :

- dans le run `defense-single-field-runs-r1`, un user disait explicitement ne
  pas savoir s'il fallait une carte d'attaque ou une carte de defense;
- le `TurnFrame` portait les deux intents structures, mais l'arbitrage partait
  directement vers `prepare_defense_card`;
- Sophia livrait donc un handoff defense premature au lieu de demander le choix
  metier.

Fix :

- ajout d'une detection structuree des intents concurrents
  `prepare_attack_card` + `prepare_defense_card` dans
  `turn_intent_arbitrator`;
- le bypass de clarification explicite refuse maintenant ce cas concurrent;
- le renderer defense a ete ajuste pour afficher le champ UI reel sous forme de
  proposition a reprendre, sans format `Question : valeur`;
- la bug sheet du run precedent passe en `verified` apres QA reel.

Tests / verifications :

- `/usr/local/Cellar/deno/2.6.0/bin/deno check` cible : vert;
- tests defense + arbitrator : 46 passed;
- test `competing attack` dans `run_test.ts` : 1 passed;
- QA reel local `defense-ambiguous-clarification-r2` : green sur 3 tours,
  avec tour 1 en `orientation_clarification`, tour 2 en handoff defense
  mono-champ, tour 3 `active_handoff_apply_attempt`, `executed_tools=[]` et
  `user_defense_cards=0`.

---

### J81 — `select_state_potion` migre vers flow handoff local non-mutant

Couche. Tool skill / active handoff / prompting architecture.

Symptome :

- le flow potion actif restait trop expose a l'arbitrage global et aux anciens
  chemins confirmation/execution;
- le visible pouvait encore rendre des labels legacy comme rappel, reparation
  ou apaisement court;
- les follow-ups apres handoff repetaient trop souvent la ligne no-mutation.

Fix :

- ajout de `subskills/local_flow_dispatcher.ts` comme dispatcher local du flow
  actif;
- neutralisation du `router.ts` executable legacy et suppression du
  `draft_validation.ts` potion;
- `runSelectStatePotionIntake` retourne maintenant `handoff_ready` au lieu de
  `pending_confirmation`;
- labels visibles centralises dans `labels.ts`;
- renderer ajuste pour handoff final, destination plateforme courte,
  `apply_attempt` non-mutant et labels canoniques.

Tests / verifications :

- `/usr/local/bin/deno check` cible select_state_potion : vert;
- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff_test.ts`
  : 32 passed.

---

### J82 — Sous-skills potion: completion de champs vers handoff final commun

Couche. `select_state_potion` / sous-skills locaux / reducer handoff.

Symptome :

- le run reel `state-potion-amour-20260608-r1` montrait que le sous-flow Amour
  restait en `repeat_handoff` / `platform_destination_followup` avec
  `platform_handoff.draft=null`;
- une reponse naturelle comme `je me parle tres durement` n'etait pas toujours
  traitee comme reponse au champ `love_state=dur`;
- le probleme etait transverse aux sous-skills potion locaux, pas limite a
  Amour.

Fix :

- le dispatcher local des sous-skills donne priorite aux reponses de champ
  (`answer_current_field`) avant les followups destination/repeat;
- le reducer commun merge les `field_states` meme si l'action IA est
  `platform_destination_followup` ou `repeat_handoff`;
- quand tous les champs requis d'un sous-skill local sont lockes, le reducer
  produit un `handoff_delivered` avec `StatePotionHandoffDraft`;
- le runtime `handoff.ts` traite `handoff_ready + draft` avant de deleguer vers
  un sous-skill, pour que les intakes deja complets livrent directement le
  renderer contractuel.

Tests / verifications :

- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/state_potion_subskill_flow_test.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/local_runtime_contract_test.ts`
  : 10 passed;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/state_potion_subskill_flow.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/handoff.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/state_potion_subskill_flow_test.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/local_runtime_contract_test.ts`
  : vert;
- `handoff_test.ts` non exploitable dans cet environnement sans cle IA visible
  agent (`OPENAI_API_KEY missing`), apres passage des tests reducer/runtime
  mockes.

---

### J83 — Sous-skills potion: suffisance des champs libres et repeat post-handoff

Couche. `select_state_potion` / sous-skills locaux / dispatcher commun / reducer
handoff.

Symptome :

- le run reel direct `state-potion-amour-direct-20260608-r1` a montre que
  `redis-moi` apres handoff visible correct etait trace en nouveau
  `handoff_delivered` au lieu d'un repeat;
- une valeur libre courte comme `mon echec de vendredi` etait acceptee comme
  finale, alors qu'elle est copiable dans l'UI mais pas assez riche pour guider
  une potion efficace.

Fix :

- ajout de `StatePotionSubskillFieldDetailSufficiency` sur les champs de
  sous-skills potion locaux;
- le dispatcher commun doit renseigner si un champ libre locke est suffisant ou
  demande un creusement;
- le reducer commun bloque le handoff sur un champ libre `needs_more_detail` et
  pose une seule question `ask_deeper`;
- la reponse au creusement marque `followup_answered=true` et permet le handoff,
  sans boucle de questions;
- apres `last_handoff_delivered=true`, un `platform_destination_followup`
  retourne `repeat_handoff` / `destination_short` au lieu de relivrer un nouveau
  `handoff_delivered`.

Tests / verifications :

- `/usr/local/bin/deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/state_potion_subskill_flow_test.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/local_runtime_contract_test.ts`
  : 13 passed;
- `/usr/local/bin/deno check supabase/functions/sophia-brain/tools/operations/select_state_potion/contract.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/state_potion_subskill_flow.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/visible_agents/agent.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/subskills/state_potion_subskill_flow_test.ts supabase/functions/sophia-brain/tools/operations/select_state_potion/local_runtime_contract_test.ts`
  : vert.
