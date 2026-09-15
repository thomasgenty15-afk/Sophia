# Bug Sheet - normal-conversation-25t-20260613-r6-flow-pressure

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-13-normal-conversation-25t-r6-flow-pressure.md`

## R6-B01 - Faux positif one-shot reminder en conversation simple

- Bug id: `R6-B01`
- Tours: T6
- Famille: `BF-ROUTE-01` — mauvais owner sélectionné
- Domaine owner: direct-effect arbitrator / one_shot_reminder intake
- Source amont: `direct_effect_lane_message_intake`
- Symptôme visible: Sophia dit "Il me manque le moment exact pour programmer ce rappel" alors que le user demande seulement "parler deux minutes" et "rester simple".
- Preuve système: `direct_effects=["create_one_shot_reminder"]`, `direct_effects_to_run=["create_one_shot_reminder"]`, `tool_execution=blocked`, aucun executed tool.
- Correction attendue: exiger une intention explicite de rappel/notification avant d'admettre `create_one_shot_reminder`. Une durée conversationnelle seule ne suffit pas.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Positif: "crée-moi un rappel pour demain à 10h: relire deux pages" => reminder créé.
  - Anti-faux-positif: "parler deux minutes", "reste simple deux minutes", "attends cinq minutes avec moi" => aucun direct_effect reminder.
  - Intégration: `/functions/v1/test-send-message` avec `force_full_ai=true`, assertion visible sans mention de rappel.

## R6-B02 - Trace/owner incohérent quand normal_reply domine

- Bug id: `R6-B02`
- Tours: T5
- Famille: `BF-TEST-01` — trace/test incohérent ou suite malsaine
- Domaine owner: router / intervention policy / trace mapping
- Source amont: `flow_opportunity_verification` admission ou final route trace
- Symptôme visible: réponse acceptable mais orientée "apaiser ensemble" alors que le user demande une réponse directe.
- Preuve système: `response_owner=tool_skill`, `selected_handler=flow_opportunity_verification`, `route_reason=normal_reply_fit_dominates`.
- Correction attendue: quand la policy conclut que `normal_reply_fit` domine, l'owner final doit être `normal_reply` ou la trace doit distinguer clairement "opportunity checked but blocked" d'un handler réellement sélectionné.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Test router sur opportunité émotionnelle légère avec `normal_reply_fit_score` haut.
  - Test trace: blocked opportunity ne doit pas apparaître comme selected handler final.

## R6-B03 - prepare_attack_card perd la contrainte "carte courte / pas trois questions"

- Bug id: `R6-B03`
- Tours: T19, T22
- Famille: `BF-INTAKE-03` — contrainte explicite perdue
- Domaine owner: `prepare_attack_card`
- Source amont: local dispatcher / reducer / visible task selection
- Symptôme visible: user demande "une carte courte, pas trois questions" puis "donne-moi juste la carte courte avec ce que tu as"; Sophia continue à demander technique puis ton.
- Preuve système: `selected_handler=prepare_attack_card`, `route_reason=active_prepare_attack_card_local_dispatcher`, plusieurs tours de slots après contrainte de brièveté.
- Correction attendue: ajouter une voie structurée compacte (`compact_intake`, `draft_with_defaults` ou équivalent) qui permet de produire un brouillon court ou une validation finale quand cible + piège + contrainte de brièveté sont présents.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Positif: demande explicite de carte courte avec cible + piège => brouillon court ou validation courte.
  - Anti-rigidité: "pas trois questions", "avec ce que tu as", "option la plus rapide" ne doivent pas ouvrir une nouvelle chaîne de slots sauf champ absolument critique.
  - Non-mutation: vérifier qu'aucune carte DB n'est créée sans confirmation/chemin plateforme.

## R6-B04 - prepare_attack_card redemande une cible déjà fournie

- Bug id: `R6-B04`
- Tours: T20
- Famille: `BF-INTAKE-01` — slot fourni mais redemandé
- Domaine owner: `prepare_attack_card`
- Source amont: target_state / slot filler local
- Symptôme visible: après "dossier administratif" répété et confirmé, Sophia demande "quelle action ou quel effort spécifique".
- Preuve système: T18 démarre sur `dossier administratif`; T19 confirme le piège; T20 redemande l'action.
- Correction attendue: stabiliser `target_state` depuis le contexte actif et ne pas redemander un slot déjà fourni sauf ambiguïté réelle. Si le flow veut une formulation plus précise, il doit proposer une valeur candidate plutôt que demander au user de répéter.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Cible fournie au tour d'activation puis piège fourni au tour suivant => pas de redemande de cible.
  - Si la cible est vague, proposer une candidate confirmable au lieu de repartir à zéro.

## R6-B05 - normal_reply parfois trop long après abandon de flow

- Bug id: `R6-B05`
- Tours: T24
- Famille: `BF-PREF-01` — préférence/contrainte de posture non appliquée runtime
- Domaine owner: normal_reply visible prompt / response shaping
- Source amont: post-flow normal_reply posture
- Symptôme visible: après "sans faire de stratégie", Sophia répond longuement avec structure en deux dettes et relance une question.
- Preuve système: `response_owner=normal_reply`, pas de mauvais routing; problème de qualité visible.
- Correction attendue: après abandon explicite d'un flow et demande de discussion normale/sans stratégie, réduire longueur, éviter structure de coaching et éviter question finale sauf besoin clair.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Conversation post-flow: "sans stratégie" => réponse courte, humaine, non cadrante.
  - Contrôle: demande explicite d'analyse => réponse plus développée autorisée.

## R6-W01 - safety low fréquent sur contenu non safety

- Bug id: `R6-W01`
- Tours: T3, T4, T5, T8, T9, T11, T14, T16, T17, T18, T23, T24
- Famille: `BF-SAFETY-01` — priorité ou désescalade safety incorrecte
- Domaine owner: safety pregate / trace calibration
- Source amont: risk band calibration
- Symptôme visible: aucun impact visible direct dans ce run.
- Preuve système: `safety=low` apparaît sur de nombreux tours ordinaires de honte/lecture/status.
- Correction attendue: vérifier si `low` signifie simplement "non bloquant" ou si la calibration est trop sensible. Si c'est attendu, documenter la sémantique pour éviter les faux diagnostics QA.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Matrix de messages ordinaires honte/ennui/status/lecture => no safety ou low documenté sans effet routing.
