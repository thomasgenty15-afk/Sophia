# Bug Sheet - normal-conversation-15t-20260613-r4-diverse-postfix

## R4-B01 - Flow opportunity verification lance demotivation malgré normal_reply_fit_dominates

- Bug id: `R4-B01`
- Tours: T3, T4
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: flow opportunity verification / global routing admission
- Source amont: admission `flow_opportunity_verification` sur signal conversation skill `demotivation_repair`
- Symptome visible: Sophia propose d'ouvrir une réparation alors que la trace dit que `normal_reply` domine.
- Preuve systeme:
  - T3: `normal_reply_fit_score=0.9`.
  - T3: `skill_signals.entry.demotivation_repair.score=0.65`.
  - T3: `blocked_paths=conversation_skill.demotivation_repair / normal_reply_fit_dominates`.
  - T3: malgré cela, `response_owner=tool_skill`, `selected_handler=flow_opportunity_verification`.
  - T4: `response_owner=tool_skill`, `selected_handler=demotivation_repair`, `route_reason=active_flow_opportunity_verification_local_dispatcher`.
- Correction attendue: si une conversation skill opportunity est bloquée par `normal_reply_fit_dominates`, `flow_opportunity_verification` ne doit pas devenir owner. Appliquer l'économie d'intervention aux opportunities conversationnelles, pas seulement aux tool flow opportunities.
- Statut: `open`
- Fix reference: aucun.
- Tests requis:
  - Positif: détresse/démotivation forte score haut démarre `demotivation_repair`.
  - Paraphrase: "ça me décourage vite mais je veux comprendre doucement" reste normal si normal score domine.
  - Anti-faux-positif: conversation normale avec découragement léger ne lance pas `flow_opportunity_verification`.
  - Integration: mini-run normal -> démotivation légère -> changement de sujet.

## R4-B02 - Normal reply encore trop action-oriented sur "parler simplement"

- Bug id: `R4-B02`
- Tours: T1
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne, variante posture visible
- Domaine owner: companion / normal reply prompt
- Source amont: normal reply visible agent propose une micro-action immédiate alors que le user demande "parler simplement deux minutes".
- Symptome visible: Sophia demande d'ouvrir le dossier sur 30 secondes au lieu de rester en explication/présence.
- Preuve systeme:
  - T1: `response_owner=normal_reply`, `normal_reply_fit_score=0.85`.
  - T1: `flow_opportunity.prepare_attack_card.score=0.55` bloquée.
  - Visible: "Ouvre le dossier...".
- Correction attendue: le prompt normal reply doit traiter "parler simplement", "pas une crise", "juste comprendre" comme posture conversationnelle avant action; micro-action seulement après accord ou demande.
- Statut: `open`
- Fix reference: companion product-thin postfix réduit les cartes mais pas encore tous les réflexes d'action.
- Tests requis:
  - Positif: demande explicite "aide-moi à agir maintenant" peut proposer une micro-action.
  - Paraphrase: "parlons simplement deux minutes" reste sans action immédiate.
  - Anti-faux-positif: mention d'un dossier/action ne suffit pas à pousser une action.

## R4-B03 - Préférence temporaire capturée par update_coach_preferences

- Bug id: `R4-B03`
- Tours: T14, T15
- Famille: `BF-INTAKE-03` - Contrainte explicite perdue
- Domaine owner: dispatcher / `update_coach_preferences` intake
- Source amont: classification tool_skill_intent durable malgré contrainte "pour cette conversation seulement" et "ne change pas mes réglages".
- Symptome visible: réponse correcte, mais mauvais owner et active flow inutile.
- Preuve systeme:
  - T14 user: "Pour la suite de cette conversation seulement... ne change pas mes réglages."
  - T14: `response_owner=tool_skill`, `selected_handler=update_coach_preferences`, `tool_skill_intents=update_coach_preferences:high:explicit:update`.
  - T15: `route_reason=active_update_coach_preferences_local_dispatcher`, global bloqué par active flow.
  - DB check: seulement `system_default` coach preferences; aucune préférence explicite durable créée.
- Correction attendue: les préférences explicitement temporaires/non durables doivent rester normal reply ou contrainte locale du tour, pas ouvrir `update_coach_preferences`.
- Statut: `open`
- Fix reference: aucun.
- Tests requis:
  - Positif: "change mes réglages pour toujours: moins de questions" lance update flow.
  - Paraphrase: "pour cette conversation seulement" ne lance pas update flow.
  - Anti-faux-positif: "ne change pas mes réglages" bloque toute mutation durable.
  - Integration: status check suivant ne reste pas capturé par active update flow.

## R4-B04 - Rappel ponctuel visible au vouvoiement

- Bug id: `R4-B04`
- Tours: T11
- Famille: `BF-PREF-01` - Preference non appliquee runtime
- Domaine owner: one-shot reminder final response renderer
- Source amont: rendu visible de confirmation rappel utilise "je vous rappellerai" au lieu du tutoiement Sophia.
- Symptome visible: rupture de ton dans une conversation tutoyée.
- Preuve systeme:
  - T11 response: "je vous rappellerai".
  - T11 route: `create_one_shot_reminder`, `tool_execution=success`.
- Correction attendue: renderer reminder respecte la politique visible globale de tutoiement.
- Statut: `open`
- Fix reference: aucun.
- Tests requis:
  - Confirmation rappel ponctuel utilise "je te rappellerai".
  - Anti-faux-positif: ne change pas les messages WhatsApp ou contextes explicitement vouvoiement si un canal le demande.

## R4-B05 - `blocked_paths` dupliqués pour flow opportunity

- Bug id: `R4-B05`
- Tours: T1
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: routing diagnostics
- Source amont: diagnostic `flow_opportunity.prepare_attack_card / normal_reply_fit_dominates` ajouté deux fois.
- Symptome visible: aucun.
- Preuve systeme:
  - T1: deux blocked paths identiques `flow_opportunity.prepare_attack_card`.
- Correction attendue: dédupliquer les diagnostics en sortie sans les utiliser comme input comportemental.
- Statut: `open`
- Fix reference: frontière audit-only clarifiée, mais déduplication non faite.
- Tests requis:
  - Une route avec opportunity bloquée ne sort qu'un diagnostic unique par `(path, reason_code)`.
