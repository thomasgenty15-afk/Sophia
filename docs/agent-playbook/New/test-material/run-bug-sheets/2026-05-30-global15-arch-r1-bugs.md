# Run Bug Sheet - global15_20260530_arch_r1

## Metadata

- Date: 2026-05-30
- Run report: `docs/agent-playbook/qa-run-global15-20260530-arch-r1.md`
- Run id: `global15_20260530_arch_r1`
- Persona / scenario: global 15T architecture smoke test
- Verdict run: red high
- Validite QA: valide, chemin IA reel local
- Agent owner: non assigne

## Synthese

- Familles dominantes: `BF-ROUTE-01`, `BF-INTAKE-03`, `BF-STATE-02`,
  `BF-EFFECT-03`, `BF-LEDGER-02`, `BF-STATUS-01`, `BF-STATUS-02`.
- Bug le plus bloquant: les owners locaux ne reprennent pas correctement les
  demandes explicites de creation/confirmation/status apres les nouvelles
  protections ledger/confirmation.
- Fix architectural prioritaire: aligner route owner + pending confirmation +
  renderer local pour attack card, one-shot reminder et status recap, sans
  rajouter de patch L4.
- Rerun requis: oui, meme trajectoire apres correction des familles ouvertes.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ARCH-R1-B01 | T1 | `BF-ROUTE-01` | `execution_breakdown` / `prepare_attack_card` arbitration | owner selection | demande de micro-action routee en carte d'attaque puis echec visible | `route_reason=tool_skill_intent_start`, `tool_execution=failed` | micro-action sans carte doit rester conversation skill, sauf demande explicite de carte | open |  | positif micro-action, paraphrase, anti-FP vraie demande carte |
| ARCH-R1-B02 | T2 | `BF-AGENDA-02` | conversation runtime | interruption/no-card recovery | no-card respecte mais aucune action donnee | `tool_execution=none` | contrainte no-card doit restaurer une reponse actionnable par le bon skill | open |  | no-card + action, no-tool + action, anti-FP no-card status |
| ARCH-R1-B03 | T3 | `BF-STATE-03` | `prepare_attack_card` | draft-only reducer/renderer | `ne cree rien` bloque le tool mais ne rend pas le brouillon | `explicit_no_tool_request_blocks_tool_start` | draft-only doit produire un brouillon non-mutant, sans pending executable | open |  | draft-only, draft-only paraphrase, anti-FP create |
| ARCH-R1-B04 | T4 | `BF-STATE-02` | `prepare_attack_card` + Confirmation Contract | pending confirmation target | creation explicite + confirmation rendue comme texte, aucune carte DB | `central_arbitrator_status_exact_priority`, DB carte absente | confirmation compatible doit revenir au pending local et executor, status ne doit pas capturer | open |  | approve pending attack, status during pending, unrelated confirmation |
| ARCH-R1-B05 | T5 | `BF-STATUS-01` | `status_recap` | DB/effect projection target | question status carte repondue comme clarification de rappel | route `product_help/status`, contenu rappel | status doit cibler l'objet demande et refuser l'affirmation sans source | open |  | status carte absent, status rappel, mixed status |
| ARCH-R1-B06 | T6 | `BF-INTAKE-04` | `one_shot_reminder` | time ambiguity gate | deux horaires explicites, creation directe a 14h20 | DB `scheduled_checkins` pending | ambiguite temporelle doit produire clarification, pas effet durable | open |  | two-times ambiguity, one clear time, anti-FP context time |
| ARCH-R1-B07 | T7-T8 | `BF-STATE-02` | `one_shot_reminder` | replace confirmation reducer | remplacement demande confirmation puis confirmation non appliquee | guard global dit aucun durable effect | confirmation de remplacement doit cibler cancel+create ou clarifier | open |  | replace confirm, replace reject, unrelated yes |
| ARCH-R1-B08 | T10 | `BF-LEDGER-02` | `one_shot_reminder` renderer / final pipeline | committed effect rendering | rappel annule en DB mais reponse visible explique comment annuler | DB status `cancelled`, `tool_execution=success` | commit cancel doit rendre un ack d'annulation, pas product help | open |  | cancel ack with commit, cancel failure wording, product-help where cancel |
| ARCH-R1-B09 | T11 | `BF-STATUS-02` | `status_recap` | historical projection | recap ne restitue pas "cree puis annule" | DB montre scheduled_checkin cancelled | recap historique doit lire DB + ledger/recent effects | open |  | created-then-cancelled, no active reminder, multiple reminders |
| ARCH-R1-B10 | T12 | `BF-INTAKE-06` | `emotional_repair` | domain intake | no-potion respecte mais contexte relationnel perdu | reponse execution/productivite au lieu phrase a la soeur | honte relationnelle + phrase demandee doit rester emotional/relationship repair | open |  | relationship phrase, no-potion relation, anti-FP execution shame |
| ARCH-R1-B11 | T13-T14 | `BF-INTAKE-05` | `update_coach_preferences` | preference canonical mapping | preference limitee a `coach.tone=direct` | DB `coach.tone=direct` seulement | preference UI limitee doit etre honnete sur ce qui est enregistrable et applique runtime | open |  | direct mode, unsupported clause response, status pref |
| ARCH-R1-B12 | T15 | `BF-STATUS-01` | `status_recap` / `update_coach_preferences` arbitration | recap owner + DB projection | recap final capture par preference et contredit la DB | route `coach_preference_request_overrides_active_flow`, DB `coach.tone=direct` | recap doit preempter preference update et lire DB user facts | open |  | recap preferences, update pref explicit, anti-FP correction pref |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-05-30 | Classer ce run comme regression architecture post-contrats, pas comme liste de patchs par phrase. | Les protections ledger/confirmation reduisent les faux succes mais revelent des owners/reducers incomplets. | QA / architecture | `test-material/familly-bugs.md` |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
