# Run Bug Sheet - eva-multiflow-cpr-2026-07-12-r1

## Metadata

- Date: 2026-07-12
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-12-eva-multiflow-coaching-presence-reminder-r1.md`
- Run id: `eva-multiflow-cpr-2026-07-12-r1`
- Persona / scenario: Eva — multiflow coaching / presence / normal + one-shot reminder (15 tours)
- Verdict run: yellow
- Validite QA: valide (15 tours IA reels, `force_full_ai=true`, trace lue en direct par tour, transcript exact `chat_messages`). Incident env: runs QA concurrents sur le meme Supabase local + suppression post-hoc de lignes Eva-scoped (rappel T6 + traces T1/T2/T3/T12) — verification appuyee sur lectures live.
- Agent owner: QA agent (Claude)

## Synthese

- Familles dominantes: `BF-ROUTE-02` (flow coaching collant capte les tours emotionnels), `BF-INTAKE-03` (contrainte « pas de technique » non tenue au tour suivant).
- Bug le plus bloquant: `EVA-CPR-B01` — coaching_recommendation ne relache pas vers presence sur pivot emotionnel (T10/T11); technique repoussee sur un tour vulnerable apres « pas envie de parler technique ».
- Fix architectural prioritaire: gate de handoff coaching→presence dans `active_flow_arbitration` sur altitude affective + contrainte anti-technique; non-repetition de la meme carte tant que l'action n'est pas rouverte.
- Rerun requis: oui apres fix (variante N.2 avec pivot emotionnel implicite, sans refus explicite type-test, pour valider le handoff).

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `EVA-CPR-B01` | T10, T11 | `BF-ROUTE-02` | dispatcher / active_flow_arbitration (presence handoff) | coaching persistence `continue_active` ne pondere pas le signal emotionnel; presence (« poubelle du coaching actif ») ne preempte pas | Owner reste `active_coaching_recommendation` sur pivot emotionnel; T11 repousse la potion « anti-decrochage » + un geste technique sur une divulgation vulnerable (solitude, auto-jugement) apres « pas envie de parler technique » (T10) | `response_owner=coaching_recommendation` / `route_reason=active_coaching_recommendation` aux T10 et T11 (traces lues en direct) | Handoff coaching→presence au tour meme du pivot emotionnel; aucune re-proposition de carte au(x) tour(s) suivant(s) sans reouverture de l'action | `fix_applied` (2026-07-12, couvert par V6-4 pivot doux, valide chantier P1) | Probe live 12/07 (rejeu du scenario) : pivot vulnerable apres pull coaching → owner `presence_conversation` au tour meme, soutien pur sans dispositif, tenue au tour suivant (2 passes GREEN) | positif (pivot emotionnel implicite → presence) + paraphrase + anti-FP (demande d'action concrete reste en coaching) |
| `EVA-CPR-B02` | T9 | `BF-ROUTE-02` | active_flow_arbitration / coaching altitude | relance coaching privilegiee sur un tour majoritairement affectif (« je me sens moins nulle ») | Meme potion « anti-decrochage » re-recommandee (2ᵉ occ.) + « prochain pas » pousse, note emotionnelle sous-recue | trace `active_coaching_recommendation` T9 | Recevoir le signal affectif sans re-proposer; anti-repetition d'une meme carte | `fix_applied` (2026-07-12, couvert par V6-4 + P1-2, valide chantier P1) | Probe live 12/07 : tours affectifs post-pull sans re-proposition de dispositif (potion/carte exclus verifies sur 2 tours, 2 passes GREEN) | positif + anti-repetition carte + anti-FP |
| `EVA-CPR-B03` | T10, T11 | `BF-INTAKE-03` | intake constraints propagation | contrainte « pas envie de parler technique » (T10) non propagee au tour suivant | T11 propose quand meme un « geste de retour » technique | traces T10/T11 | Tenir la contrainte anti-technique jusqu'a reouverture explicite par la user | `fix_applied` (2026-07-12, chantier P1-2) | La contrainte (« pas envie de parler technique ») est capturee par `session_style_commitment_hint` (champ racine TurnFrame, quel que soit l'owner) et installee en `__session_style_commitments` — bloc prompt PRIME sur tous les composeurs, presence comprise. Probe live 12/07 : contrainte tenue au tour N+1 (zero geste technique/dispositif, 2 passes GREEN) | positif (contrainte tenue N tours) + anti-FP |

## Watch-points (non-bug ferme ce run)

| Id | Tours | Famille candidate | Observation | Suivi |
| --- | --- | --- | --- | --- |
| `EVA-CPR-W01` | T15 (vs T6) | `BF-EFFECT-01?` (dedup) | Le slug `event_context` du rappel derive du wording d'instruction (`poser_mon…` T6 vs `poser_le…` T15) → pas de dedup entre deux formulations de la meme intention/heure. Si le T6 avait persiste, 2 `scheduled_checkins` pour 21:00. Une seule ligne au final ce run. | Ajouter dedup par intention+heure locale, independant du wording |
| `EVA-CPR-W02` | tout le run | environnement | Runs QA concurrents sur le meme Supabase local + suppression post-hoc de lignes Eva-scoped (rappel T6, traces T1/T2/T3/T12) alors que `chat_messages` intacts. Compromet la verification DB post-hoc (pas le routage). | Isolation par connexion temporaire / DB dediee par run; verifier qu'aucun cleanup concurrent ne cible des rows recentes |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-12 | T6 non classe bug malgre ligne DB disparue | Effet prouve cree (committed id + payload 21:00 correct) et re-persiste au T15; disparition = incident env concurrent | QA agent | report §1, §Tour 6 |
| 2026-07-12 | T1 track_progress bloque = comportement attendu | Recit « hier j'ai scrolle » sans report explicite d'action → `target_not_evidenced` legitime, pas de faux side-effect | QA agent | report §Tour 1 |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-12 | EVA-CPR-B01 | Lecture live owner/route T10,T11 | Confirme (`active_coaching_recommendation` sur pivot emotionnel) | traces live run |
| 2026-07-12 | (rappel) | Persistance `scheduled_checkins` T15 | Confirme (`pending`, 2026-07-12T19:00:00Z, instruction correcte) puis nettoye en fin de run | DB local |
