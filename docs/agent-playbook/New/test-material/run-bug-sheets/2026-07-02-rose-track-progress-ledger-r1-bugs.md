# Run Bug Sheet - rose-track-progress-ledger-r1

## Metadata

- Date: 2026-07-02
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-02-rose-track-progress-ledger-r1.md`
- Run id: `rose-track-progress-ledger-r1`
- Persona / scenario: Rose (`02dc9ae2-4128-412b-b0be-56712bf775a8`), run 15 tours multi-flow (track progress, status/recap, product_help, plan_realignment, reminders, coaching_recommendation, feature_opportunity, safety medium)
- Verdict run: red
- Validite QA: valide (IA reelle, `force_full_ai=true`, Supabase local, traces + DB verifiees a chaque effet)
- Agent owner: a assigner (domaine `track_progress_plan_item` + `EffectLedger`/`final_response_guards`)

## Synthese

- Familles dominantes: `BF-LEDGER-01` (claim sans commit, 3 occurrences), `BF-EFFECT-02` (effet attendu absent, 1 occurrence), `BF-INTAKE-01` (slot fourni mais non consomme, 1 occurrence).
- Bug le plus bloquant: T15 — `direct_effect` correctement forme (`status_hint=done`) mais bloque `reason_code=status_missing`, puis la reponse affirme quand meme "c'est noté ✅" dans le meme message. Seul domaine du run ou 3 tentatives utilisateur successives (recit passe, imperatif direct, imperatif cible) n'aboutissent a aucun commit.
- Fix architectural prioritaire: (1) fiabiliser l'intake `track_progress_plan_item` — detection de signal sur recit passe/imperatif, normalisation `status_hint` ("done" -> `completed`) avant le gate ; (2) etendre le garde-fou anti-claim (`router/final_response_guards.ts` / `router/effect_ledger.ts`) au domaine progress cote `normal_reply` et cote recap, sur le meme modele que le fix deja applique aux rappels (`BF-LEDGER-02`, voir `2026-07-02-global20-r2.md`).
- Rerun requis: oui — rerun cible sur le seul domaine `track_progress_plan_item` (recit passe, imperatif direct, imperatif cible, statut question, intention future) une fois le fix livre.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `rose-track-progress-ledger-r1-B01` | T1 | `BF-EFFECT-02` | dispatcher / `track_progress_plan_item/intake.ts` | Detection de signal insuffisante sur recit de completion passee, ton conversationnel | "Bravo, tu as tenu le sas..." sans aucune trace de progres cree | `turn_frame.direct_effects=[]`, `executed_tools=[]`, `user_plan_item_entries`=0 apres le tour | Le dispatcher doit produire un `direct_effect track_progress_plan_item` sur un recit de completion passee explicite, meme sans imperatif | `fix_applied` (rerun requis) | Regles 3b/3c/3d du prompt dispatcher (`dispatcher.prompts.ts`) : recit passe et imperatif de log produisent le direct effect transverse, payload canonique documente ; exemple doctrinal ajoute ; tests `dispatcher_prompt_contract_test.ts` | positif (recit passe varie) + paraphrase + anti-FP (statut question, intention future) |
| `rose-track-progress-ledger-r1-B02` | T2 | `BF-LEDGER-01` | dispatcher (non-detection) + `router/final_response_guards.ts` | Meme non-detection qu'en T1 malgre imperatif "note-le direct" ; garde-fou anti-claim absent pour ce domaine | "C'est noté ✅ / Tu viens de valider un sas sans fumer" sans effet | `direct_effects=[]`, `effect_ledger` sans entree (`requested=0`), DB inchangee | Detection dispatcher sur imperatif direct de log + garde-fou qui bloque tout wording "note/valide/marque" sans `committed_effects` | `fix_applied` (rerun requis) | Regle 3b dispatcher (imperatif de log = track_progress, pas memorisation) + frontiere de l'accuse memorisation dans `agents/companion.ts` (fait personnel uniquement ; action du plan = pas de "note" sans effet commis prouve) ; le wording "c'est note, je le garde en tete" de T2 venait de la regle memorisation du companion | positif + paraphrase ("note ça", "enregistre", "log-le") + anti-FP |
| `rose-track-progress-ledger-r1-B03` | T3 | `BF-LEDGER-01` (propagation) | status/recap projection | Recap construit depuis l'historique conversationnel plutot que depuis une preuve DB/ledger pour le domaine progress | "tu as déjà validé ton sas de décompression sans fumer hier soir" repete dans le recap | Aucun `logged_progress_id` en DB au moment du recap | Le recap doit citer un progres uniquement s'il existe un commit DB reel, meme fix pattern que `BF-LEDGER-02` deja applique aux rappels | `fix_applied` partiel (rerun requis) | Propagation traitee a la source : T2 ne produit plus de faux "c'est note" (cf. B02) donc le recap n'a plus de fausse memoire a propager ; regle companion renforcee ("sans effet commis prouve par le contexte, dis honnetement que ce n'est pas encore enregistre"). Si le rerun montre encore un recap de progres non prouve, le fix residuel sera un bloc canonique progress structurel pour le renderer (pattern one_shot_reminder_prompt_contract) | recap positif (progres reellement commit) vs recap negatif (progres jamais commit, ne doit rien affirmer) |
| `rose-track-progress-ledger-r1-B04` | T15 | `BF-INTAKE-01` + `BF-LEDGER-01` | `track_progress_plan_item/intake.ts` (normalisation statut) + `router/final_response_guards.ts` | `status_hint="done"` non normalise vers un statut reconnu avant le gate ; garde-fou anti-claim absent meme apres un blocage explicite dans le meme message | "Je peux pas le marquer... Par contre... c'est noté pour le suivi visible ✅" — auto-contradiction | `direct_effects[0].payload_hint.status_hint="done"`, mais `effect_ledger` entree `status=blocked`, `reason_code=status_missing` ; DB inchangee | Normaliser les synonymes de completion ("fait", "done", "termine", "fini") avant le gate ; interdire tout wording de confirmation dans la meme reponse qu'un effet `blocked` | `fix_applied` (rerun requis) | Cause racine identifiee : desaccord de contrat — les exemples doctrinaux du prompt dispatcher enseignaient `status_hint:"done"` alors que l'intake ne validait que `completed/missed/partial`. Fix des deux cotes : exemples corriges vers l'enum canonique (`dispatcher.prompts.ts`) + alias structurels toleres a l'intake (`done`→`completed`, `plan_item_id`→`target_item_id`) dans `track_progress_plan_item/intake.ts` ; tests intake ajoutes (`track_progress_plan_item_tool_test.ts`) | positif ("marque comme fait X", "X est fini", "j'ai fini X") + verification qu'aucun wording de confirmation n'accompagne un effet bloque |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-02 | Ne pas corriger le code pendant le run QA | Consigne explicite `14-qa-test-guidelines.md` ("Tu n'as pas le droit de corriger le code pendant la demande de run") | Agent QA | `14-qa-test-guidelines.md` |
| 2026-07-02 | T9 (mot de bascule sans handoff `select_state_potion`) et T13 (side effect bloque sous safety sans faux claim) classes comme comportement correct, pas comme bug | Conformes aux contrats `select-state-potion.md` (`platform_handoff` non-mutant) et a l'invariant "side effects bloques pendant safety actif" | Agent QA | run report §2 T9, T13 |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-02 | B01-B04 | Verification DB directe (`user_plan_item_entries` avant/apres, `scheduled_checkins` avant/apres) + lecture `conversation_turn_trace.effect_ledger` par tour | Confirme : aucun commit progress sur tout le run malgre 3 tentatives ; DB restauree en fin de run (suppression de `scheduled_checkins` `53557a1d` cree en T6) | run report, section grounding + tours 1/2/3/15 |
