# Run Bug Sheet - eva-global16-r1

## Metadata

- Date: 2026-07-10
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-10-eva-global16-r1.md`
- Run id: `eva-global16-r1` (scope `qa-eva-global16`)
- Persona / scenario: Eva — run 15 tours traversant coaching_recommendation + presence + normal_reply, avec rappel one-shot (N.1)
- Verdict run: **red**
- Validite QA: valide (IA réelle locale, `force_full_ai=true`, effets durables vérifiés DB, état reset)
- Agent owner: QA (run conversationnel)

## Synthese

- Familles dominantes: BF-EFFECT-03 (durable faux, bloquant), BF-ROUTE-02, BF-PREF-01, BF-INTAKE-02 (contributif).
- Bug le plus bloquant: **B01 (T13)** — reschedule de rappel → create dupliqué + perte d'instruction (deux `scheduled_checkins` pending).
- Fix architectural prioritaire: intake `one_shot_reminder` — résolution de référence vers le rappel pending existant + classification intent create-vs-reschedule + anti-doublon.
- Rerun requis: oui, après fix B01 (revalider un cycle create→reschedule sur la même conversation → 1 seule ligne updatée).

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `EVA-G16-R1-B01` | T13 | `BF-EFFECT-03` (+ `BF-INTAKE-02`) | dispatcher direct-effect + `sophia-brain/tools/always_on/one_shot_reminder` (intake/executor) | référence « le rappel de tout à l'heure » non résolue vers le `scheduled_checkins` pending; intent classé `create` au lieu de `reschedule`; payload d'instruction dégradé | « mets le rappel à 23h » crée un 2e rappel (23:00) au lieu de déplacer celui de 22:30 → 2 pending; instruction du nouveau = « le rappel évoqué tout à l'heure » | ledger `one_shot_reminder.create` committed=1 sans cancel/supersede; DB: `7a9c6c72…` 22:30 + `d2a101bc…` 23:00 (`event_context=one_shot_reminder:le_rappel_evoque_tout_a_l_heure`) | résoudre la cible vers le pending existant, router branche reschedule (update `scheduled_for`, conserver l'instruction d'origine), interdire un 2e create si pending compatible | `fix_applied` (2026-07-11, chantier R) | Triple étage: RÈGLE DU PRONOM (« mets-LE à 23h » → intent='reschedule' bloqué honnête proposant « annule-le et remets-le à X ») + lane REPLACE explicite (cancel ciblé + create atomique, jamais 2 pending, clarify si ambigu, `router.ts`) + FILET runtime: create nu avec instruction IDENTIQUE à un pending à une autre heure → `same_instruction_pending` needs_clarify (déplacer ou ajouter ?), zéro write (`executor.ts`). L'anti-FP demandé tient: « ajoute un autre rappel à 23h » avec instruction différente crée bien un 2e rappel (testé unitairement). Validé harness S2 (rejeu exact), rounds verts consécutifs | positif (reschedule → 1 ligne updatée, instruction conservée) + paraphrase (« repousse mon rappel du soir à 23h ») + anti-FP (« ajoute un autre rappel à 23h » → 2 rappels légitimes) |
| `EVA-G16-R1-B02` | T4 | `BF-ROUTE-02` | active flow policy / router (coaching↔presence) | flow coaching actif collant; gate d'interruption ne reconnaît pas « partage émotionnel sans demande d'outil » comme hand-off presence | sur un dépôt émotionnel (solitude/vide), Sophia pousse une potion (amour) au lieu d'écouter; Eva doit refuser explicitement (T5) pour obtenir la présence | T4 `response_owner=coaching_recommendation`; T5 seulement `presence_conversation_entry` (`deep_personal_discussion_no_tool_request`) | préemption douce presence quand l'user dépose un ressenti de fond sans demander de levier (anti-poussée, offre sur pull) | `fix_applied` (2026-07-12, chantier V6-4) | Sortie « PIVOT EMOTIONNEL DOUX » du dispatcher local coaching : la sortie discursive n'exige plus NI refus frontal NI dépôt long — dépôt d'un ressenti de fond (solitude, vide) sans demande d'outil, demande de réassurance, ou clôture apaisée → exit_to_global (general_support), jamais un pitch de potion (`local_flow.ts`, mêmes invariants que le dépôt discursif). Anti-FP : demande de méthode / continuation de carte reste coaching. Ancres `local_flow_test.ts`. Probe live qa-v6-p7 : pivot doux en flow coaching → owner presence, zéro dispositif ; clôture apaisée → zéro re-pitch | positif (dépôt émotionnel pendant coaching actif → presence) + anti-FP (demande d'action explicite garde coaching) — joué en probe qa-v6-p7 |
| `EVA-G16-R1-B03` | T11, T12 | `BF-EFFECT-03` (étage recommandation) / `a classifier` | coaching_recommendation (sélection de technique) | technique choisie d'après le mot-clé user (« attaque ») plutôt que la nature de l'action; pas de garde « doute + expliquer + options proches »; incohérence interne (T12) | flip défense→attaque sur le verbe d'Eva; au T12 la définition « défense » matche le cas mais la conclusion reste « attaque » | traces T11/T12 `coaching_recommendation`, aucun doute émis; contradiction explication/conclusion | dériver la technique de la nature structurée de l'action; sur incohérence wording/nature, émettre un doute et proposer les deux cartes proches | `fix_applied` (2026-07-12, chantier V6-5) | Le contrat `technique_coherence` (V3-4/rose-r7 B02, levier-agnostique) couvre explicitement les CARTES : « attaque » forcé sur un moment défensif (même moment qui revient, tenir/se protéger) → `forced_mismatch` requested=attack_card / suggested=defense_card, « le mot-clé user ne choisit JAMAIS la carte, la nature de l'action choisit » (`local_flow.ts`) + invariant visible « cohérence définition↔conclusion » : INTERDIT de décrire un cas défense et de conclure attaque (`shared.ts`). Ancres `local_flow_test.ts`. Probe live qa-v6-p8 (rejeu T11) : doute exprimé, défense proposée, pas de flip | positif (moment défensif → carte défense ou ambiguïté explicitée) + anti-FP (vrai moment de démarrage → attaque, ancré « fenêtre de rupture… sans doute ») + cohérence (définition énoncée == reco) — joué en probe qa-v6-p8 |
| `EVA-G16-R1-B04` | T10 | `BF-PREF-01` (facette résiduelle) | response_style_policy / normal_reply compose | demande de ton **durable** non distinguée d'une demande ponctuelle; disclaimer d'honnêteté + renvoi Préférences absents | « garde ce ton pour toutes nos prochaines discussions » → « je garde ce ton… pour la suite » = promesse de persistance non tenue (rien persisté) | pas d'écriture `user_relation_preferences` (attendu, WON'T-FIX); réponse promet la durabilité | 3 volets actés: appliquer en session + honnêteté « pas encore persistable depuis le chat » + renvoi Préférences; sans ouvrir par la limitation ni citer de clés | `open` |  | positif (demande durable → 3 volets) + anti-FP (demande ponctuelle → application simple sans disclaimer) + garde (jamais de clé interne, jamais « je fais ça sur cette conversation » en 1re phrase) |

Note: la facette « absence d'écriture DB » de BF-PREF-01 est **WON'T-FIX** (arbitrage 08/07, V5). B04 ne concerne que la facette résiduelle (promesse de persistance / honnêteté / renvoi Préférences).

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-10 | B01 priorisé (bloquant) | seul effet durable faux du run (doublon + perte de contenu) | QA | report T13 |
| 2026-07-10 | T3 (répétition) et T15 (emoji) non ledgerisés | frictions fluidité sans famille système canonique / sévérité mineure | QA | report §3 |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-10 | B01 | `select` `scheduled_checkins` après T13 | 2 lignes pending (22:30 + 23:00) → doublon confirmé | report T13 |
| 2026-07-10 | (T8 nominal) | `select` `scheduled_checkins` après T8 | 1 ligne 22:30, instruction correcte, committed | report T8 |
| 2026-07-10 | hygiène | `memory_items` créés pendant run | 0 (aucun batch parallèle) | report §4 |
| 2026-07-10 | cleanup | delete rappels + chat_messages + user_chat_states du scope | 0/0/0 après reset | run log |
