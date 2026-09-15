# Run Bug Sheet - rose-multiflow-reminder-r1

## Metadata

- Date: 2026-07-10
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-10-rose-multiflow-reminder-r1.md`
- Run id: rose-multiflow-reminder-r1
- Persona / scenario: rose, run global 15 tours traversant normal_reply / presence_conversation / coaching_recommendation + pose d'un rappel ponctuel (IA réelle locale, `force_full_ai=true`)
- Verdict run: yellow
- Validite QA: valide (15/15 tours HTTP 200, 0 vide, 0 abort, 0 fallback ; effet durable rappel vérifié en DB)
- Agent owner: Claude (session QA multiflow)

## Synthese

- Familles dominantes: BF-ROUTE-01 (entrée coaching gloutonne sur aveu émotionnel — T2, T11), BF-ROUTE-02 (coaching local ne sort pas sur pivot émotionnel doux — T12, T13), + 1 glitch de composition à classer (token hébreu T9).
- Bug le plus notable: R1-B02 — le dispatcher LOCAL coaching ne sort pas vers le global quand Rose pivote vers un besoin de réassurance/clôture **sans refus d'outil frontal** (T12/T13, `skill_status=continue/complete` mais owner reste coaching). C'est le résiduel du chantier `rose-nav-frontieres` (2026-07-10, même branche) : le fix y traite le refus frontal / dépôt discursif profond (validé ici à T3, exit propre), mais pas le pivot émotionnel doux.
- Positifs à préserver (non-régression): entrée présence sur refus explicite + exit coaching→global (T3) ; grounding plan exact (T10) ; `create_one_shot_reminder` payload/heure/idempotence corrects (T8), effet durable unique en `scheduled_checkins`.
- Rerun requis: recommandé après élargissement du critère d'exit du dispatcher local coaching au pivot émotionnel non frontal (rejouer T11→T13). Aucun fix appliqué dans ce run (interdit pendant la demande de run).

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R1-B01` | T2, T11 | `BF-ROUTE-01` | dispatcher global (doctrine entrée coaching vs présence) | pondération du dispatcher : contenu « moment/mission concret d'échec » l'emporte sur la cue de vulnérabilité (« c'est bizarre d'en parler », « ça me stresse ») → entrée `coaching_recommendation` au lieu de `presence_conversation` | aveu émotionnel sans demande d'aide → carte proposée immédiatement (défense T2, mantra T11) ; user doit recadrer pour être entendu | traces T2/T11 `route_reason_code=coaching_recommendation_signal` sur message à dominante affective ; self-correction T3 (`presence_conversation_entry` + `skill_status=exit`) | renforcer l'anti-faux-positif d'entrée coaching sur aveu émotionnel sans pull d'aide (même axe que nav-frontieres NAV-B03) ; pas de patch de phrase | `fix_applied` (2026-07-12, chantier V6-4) | Règle d'altitude du dispatcher global renforcée : « la cue de VULNÉRABILITÉ prime sur le contenu concret » — un aveu émotionnel qui CONTIENT un moment/mission concret d'échec (« c'est bizarre d'en parler », « ça me stresse d'en parler ») sans pull d'aide n'est PAS coaching_recommendation ; « le user ne doit jamais avoir à recadrer pour être entendu » (`dispatcher.prompts.ts`). Anti-FP ancré : pull explicite (« je suis preneuse ») route coaching. Ancres `dispatcher_prompt_contract_test.ts`. Probe live qa-v6-p9 (rejeu T2) : aveu sans pull → accueil sans dispositif ; pull au tour suivant → coaching servi | anti-faux-positif: aveu émotionnel sans demande → présence/normal ; positif: pull explicite (« je suis preneuse » T6) → coaching — joués en probe qa-v6-p9 |
| `R1-B02` | T12, T13 | `BF-ROUTE-02` | dispatcher local coaching + garde de sortie | critère `exit_to_global_dispatcher` calibré sur le refus d'outil frontal / dépôt discursif profond, pas sur le pivot doux « j'ai juste besoin d'être rassurée / apaisée » ; le flow coaching reste actif | Rose demande de la réassurance (T12) puis signale l'apaisement/clôture (T13) → owner reste `coaching_recommendation`, réponse répète la formule de T12 | traces T12 `skill_status=continue`, T13 `skill_status=complete`, owner coaching sur besoin purement émotionnel ; contraste T3 (exit propre sur refus frontal) | élargir le critère de sortie discursive du dispatcher local coaching au pivot émotionnel non frontal (réassurance / clôture apaisée), en s'appuyant sur la mécanique d'exit-vers-global existante (`run.ts`, cf. NAV-B01) ; pas de patch de phrase | `fix_applied` (2026-07-12, chantier V6-4) | Sortie « PIVOT EMOTIONNEL DOUX » (rose-multiflow B02, eva-g16 B02) : réassurance/apaisement demandé, dépôt de ressenti de fond sans demande d'outil, ou clôture apaisée → exit_to_global (general_support), mêmes invariants que le dépôt discursif profond, avec interdiction explicite de re-servir la formule de soutien d'un tour précédent (anti-répétition T13) (`local_flow.ts`). Ancres `local_flow_test.ts` (dont non-régression dépôt profond/refus frontal). Probe live qa-v6-p7 (rejeu T11→T13) : pull→coaching, pivot doux→presence sans dispositif, clôture→zéro re-pitch | pivot réassurance en coaching actif → exit présence/normal même tour ; anti-répétition inter-tours ; non-régression exit sur refus frontal (T3) — joués en probe qa-v6-p7 |
| `R1-B03` | T9 | `a classifier` (glitch compose / final response) | composeur / renderer de réponse (flow coaching) | fuite multilingue du composeur LLM : contrainte de langue de sortie non verrouillée | token en écriture hébraïque `בדיוק` inséré au milieu d'une phrase française (« il sert בדיוק à ça ») | transcript T9 ; owner/effets corrects par ailleurs (pas d'impact routage ni DB) | verrouiller la langue de sortie du composeur (langue réponse = langue user) et/ou garde de validation de script ; NE PAS filtrer ce caractère précis (ne traiterait pas la classe) ; mesurer la fréquence avant garde déterministe | `open` |  | sortie mono-langue sur échantillon de runs FR ; anti-token étranger dans réponse FR |

## Notes fluidité (non bloquantes)

- T3/T4/T5 : tic de structure répété « et franchement, c'est important / assez fin / plus fort de le voir comme ça » sur 3 tours présence consécutifs. Non classé (mineur), à surveiller si récurrent (anti-gabarit composeur présence).
- T2/T6 : wording de la carte de défense quasi verbatim entre les deux tours. Mineur (tours éloignés, refus intercalé), mais signale un template de recommandation peu varié.

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-10 | Aucune correction appliquée pendant le run | interdiction de corriger le code pendant une demande de run (guidelines §Regles Generales) | Claude | 14-qa-test-guidelines.md |
| 2026-07-10 | R1-B01/B02 rattachés au chantier `rose-nav-frontieres` (BF-ROUTE-01/02) | même axe d'owner (entrée coaching/présence + exit dispatcher local coaching) ; ce run montre le résiduel sur pivot émotionnel *doux* non couvert par le fix frontal | à valider user | 2026-07-10-rose-nav-frontieres-r1/r2 |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-10 | R1-B02 | traces `conversation_turn_traces` T12 (`skill_status=continue`) / T13 (`complete`) : owner coaching sur besoin de réassurance ; comparaison à T3 (exit propre) | confirmé : non-sortie sur pivot doux | rapport §2 T12/T13 |
| 2026-07-10 | rappel (positif) | DB `scheduled_checkins` : 1 ligne `pending`, `scheduled_for=2026-07-11 16:30 UTC` (18h30 Paris), instruction fidèle, pas de doublon ; `memory_items=0` (pas d'intention mémoire) | effet durable correct | rapport §2 T8 / §4 |

## Nettoyage

- Reset DB de fin de run **bloqué par le classifier auto-mode** (destruction locale). Script sanctionné `qa-reset-persona.sh` non applicable à `rose` (whitelist `qa-skill`).
- **À purger par le demandeur** : `scheduled_checkins` id `c8f9644d-564b-4bed-bca2-654ce3fa62e8` (sinon déclenchement 2026-07-11 18h30) + 30 `chat_messages` + `user_chat_states` + 15 `conversation_turn_traces` du run pour Rose (`02dc9ae2-4128-412b-b0be-56712bf775a8`). Commandes fournies dans le message de rendu.
