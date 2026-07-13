# Run Bug Sheet - rose-multiflow-reminder-r1 (2026-07-12)

## Metadata

- Date: 2026-07-12
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-12-rose-multiflow-reminder-r1.md`
- Run id: `rose-multiflow-reminder-r1` (scope `qa-rose-multiflow-2026-07-12-r1`)
- Persona / scenario: rose / global 15 multiflow (normal + presence + coaching + one-shot reminder)
- Verdict run: **yellow**
- Validite QA: valide (15/15 HTTP 200, IA reelle, `force_full_ai=true`) ; incident d'environnement isole (E1)
- Agent owner: QA agent (run local Supabase)

## Synthese

- Familles dominantes: `BF-INTAKE-04` / `BF-LEDGER-02` (faux-positif de create + rendu desinformant, T13), `BF-ROUTE-02` (coaching s'eternise, T8), `BF-STATUS-02` (etat rappel non reconfirme, T14).
- Bug le plus bloquant (produit): **RMR-B01** — T13, une reference temporelle a un rappel existant declenche une tentative de `create_one_shot_reminder` avec resolution de date instable, puis un rendu qui desinforme le user ("19h15 est passée aujourd'hui, il faut la remettre"). Bloque `past_time` -> pas de mauvais effet durable, mais friction reelle.
- Incident isole (NON produit): **E1** — un run QA CONCURRENT a purge les `one_shot_reminder` fleet-wide (Alex/Eva/Nina/Rose) pendant le run. Le rappel du T7 etait cree et persiste correctement ; sa disparition est environnementale.
- Fix architectural prioritaire: intake "reference vs demande" + `time_parser` deterministe + rendu source-of-truth DB (RMR-B01) ; cote environnement, serialiser/isoler les runs concurrents (E1).
- Rerun requis: oui, un run Rose **isole** (aucun run concurrent) pour confirmer la persistance du rappel a J+1, + rejeu du tour reference-temporelle apres fix RMR-B01.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `RMR-B01` | T13 | `BF-INTAKE-04` (+ `BF-LEDGER-02`) | intake/reducer one_shot_reminder + `time_parser.ts` + final response guard | reference temporelle a un rappel existant ("quand ton rappel de 19h15 va tomber") traitee comme tentative de create ; "demain 19h15" resolu a la date du jour (passe) ; rendu parle depuis l'effet bloque | Sophia tente un `create` explicite haute-confiance (bloque `past_time`) puis dit "19h15 est passée aujourd'hui, il faut la remettre" — contredit la confirmation du T7 | trace T13: `direct_effects=create_one_shot_reminder`, `UTC_time=2026-07-12T17:15Z` (vs `2026-07-13` au T7), `tool_execution=blocked`, `reason_code=past_time`, `cancelled=0`, `committed_effects=[]` | garde intake "reference a un engagement confirme = non-creatrice" ; ancrage `time_parser` deterministe (jamais resoudre "demain" a une date passee) ; renderer qui parle de l'etat DB du rappel | `fix_applied` (2026-07-12, chantier P0-5) | Triple fix : (1) règle 38 dispatcher — une RÉFÉRENCE TEMPORELLE à un rappel confirmé (« quand ton rappel de 19h15 va tomber ») = intent='status', jamais un create (verbatim du tour ajouté) ; (2) réparation déterministe runtime : UTC_time résolu au PASSÉ alors que le payload porte un « demain » EXPLICITE (`hasExplicitFutureDayHint`, time_parser) → re-résolution parseur à J+1 ; un horaire passé sans futur explicite garde le clarify past_time (anti-FP testé) ; (3) guidance past_time : ne jamais dire « il faut la remettre » sur une simple référence à un rappel confirmé. Tests triplet (`one_shot_reminder_tool_test.ts`) | reference a rappel confirme -> aucun create ; "demain HH:MM" -> toujours date future ; enonce "c'était calé ?" -> reponse alignee DB |
| `RMR-B02` | T8 | `BF-ROUTE-02` | dispatcher local coaching (exit) + composeur | coaching ne sort pas sur accuse de reception apaise ; 3e re-proposition quasi verbatim de la carte de defense (T5/T7/T8) | flow coaching maintenu sur un tour de cloture douce + radotage | trace T8 `active_coaching_recommendation`, direct_effects=[] ; wording carte repete a T5/T7/T8 | elargir l'exit discursive au pivot "accuse de reception / apaisement" + garde anti-repetition inter-tours | `fix_applied` (2026-07-12, couvert par V6-4 pivot doux, valide chantier P1) | Rejeu live 12/07 (probe V6 n°7, scenario apaisement) : pivot « rassure-moi » → soutien sans dispositif, cloture apaisee sans re-pitch (GREEN) | accuse de reception en coaching actif -> exit vers normal ; pas de recommandation identique repetee |
| `RMR-B03` | T14 | `BF-STATUS-02` | status projection / final response | Sophia ne relit pas l'etat DB du rappel pour repondre a "c'était calé, non ?" | reponse floue ("demain soir tu verras au moment où ça arrive"), ni confirme ni corrige | trace T14 `normal_reply`, aucune relecture d'etat visible | pour tout enonce sur un rappel, relire `scheduled_checkins` et parler de l'etat DB courant | `fix_applied` (2026-07-12, couvert par R-1 projection unifiee + regle 38 P0-5, valide chantier P1) | Probe live 12/07 : create 19h15 puis « c'etait bien cale, non ? » → confirmation explicite alignee DB (« oui, c'etait bien cale pour demain a 19h15 »), zero write, zero flou (2 passes GREEN) | enonce "c'était calé ?" -> reponse alignee sur l'etat DB (present/absent) |

## Incidents Environnement (hors taxonomie produit)

| Incident | Tours | Nature | Preuve | Action |
| --- | --- | --- | --- | --- |
| `E1` | apres T7 | Purge concurrente fleet-wide des `one_shot_reminder` par un run QA parallele | trigger d'audit `AFTER DELETE`: `delete from scheduled_checkins where user_id=$1 and event_context like 'one_shot_reminder%' and created_at >= $2` (app_name `deno_postgres`, backends ephemeres) ; cibles = alex12/eva/nina/rose ; alex12 = 8 chat_messages dans les 8 min (run concurrent actif) | Serialiser/isoler les runs QA sur un meme Supabase local (guidelines "Connexions Et Isolation") ; ne pas lancer un batch reset/seed pendant un run. **Pas un bug produit** — chemin Sophia du T7 correct. |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-12 | Incident E1 classe **environnement**, pas bug produit | trigger d'audit prouve une purge fleet-wide (4 personas) par un run concurrent ; le chemin one_shot du run a cree+persiste le rappel (T7 verifie) ; doctrine guidelines §Memoire (batch parallele = incident d'environnement) | QA | rapport §4 Incident E1 |
| 2026-07-12 | T13 classe yellow (pas red) | tentative de create bloquee `past_time` -> aucun mauvais effet durable, pas de doublon, pas de safety ratee ; friction = intake trop large + rendu desinformant | QA | rapport §2 T13 |
| 2026-07-12 | Ne PAS re-ouvrir BF-ROUTE-01/02 pour l'entree coaching/presence | run 2026-07-12 montre entree presence directe (T2/T4), soutien priorise (T10), reassurance propre (T11) — regressions du run N.1 corrigees | QA | comparaison run N.1 (2026-07-10) |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-12 | RMR-B01 | trace T13 | `create` bloque `past_time`, date resolue a J au lieu de J+1, rendu "19h15 passée" | rapport §2 T13 |
| 2026-07-12 | E1 | trigger d'audit `AFTER DELETE` sur `scheduled_checkins` + `chat_messages` recents | purge multi-persona (alex/eva/nina/rose) par backends `deno_postgres` ; run Alex concurrent actif | rapport §4 Incident E1 ; `scratchpad/delete-audit-evidence.txt` |
| 2026-07-12 | T7 (controle) | `scheduled_checkins` juste apres T7 | 1 ligne `pending 2026-07-13T17:15Z id 8e264f5d` (creation correcte, avant purge E1) | rapport §2 T7 |
