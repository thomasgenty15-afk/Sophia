# Bug Sheet - 2026-06-15 WhatsApp Onboarding 20T R3

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-15-whatsapp-onboarding-20t-r3-post-runtime-fixes.md`

## R3-B01 - Normal reply perd l'objet conversationnel lors d'une demande de raccourcir

- Bug id: `R3-B01`
- Tours: T9
- Famille: `a classifier` - normal reply context grounding / short-term context carry
- Domaine owner: normal reply prompt/context assembly
- Source amont: grounding du dernier objet conversationnel actif quand le user demande une reformulation courte.
- Symptome visible: apres une proposition de message a Nadia, "Fais plus court" produit "C'est pret, je lance ca maintenant", phrase hors domaine.
- Preuve systeme: `response_owner=normal_reply`, `selected_handler=null`, aucun effet durable; le probleme est dans la qualite visible, pas le routing.
- Correction attendue: quand le user demande de raccourcir, reformuler ou "juste une phrase", normal reply doit conserver le referent conversationnel immediat et ne pas inventer un nouveau contexte.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Positif: proposition message a un contact -> "fais plus court" -> phrase courte pour ce contact.
  - Paraphrase: "version plus simple" / "une seule phrase" -> meme referent.
  - Anti-faux-positif: si le user change explicitement de sujet, ne pas garder l'ancien referent.
  - Integration: run post-onboarding avec short-term context et preferences.

## R3-B02 - Preference "peu de questions" insuffisamment appliquee en normal reply

- Bug id: `R3-B02`
- Tours: T8, T14
- Famille: `BF-PREF-01` - Preference non appliquee runtime
- Domaine owner: normal reply style policy
- Source amont: injection/application des preferences coach explicites dans le visible agent.
- Symptome visible: Sophia pose des questions optionnelles alors que le user a explicitement choisi "pose peu de questions, sauf si une info manque vraiment".
- Preuve systeme: `user_profile_facts.coach.question_tendency=low`; T8 et T14 restent en normal reply et finissent par des questions non strictement necessaires.
- Correction attendue: transformer les follow-ups optionnels en proposition directe ou cloture douce quand `question_tendency=low`.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Positif: preference low + demande simple -> pas de question finale inutile.
  - Paraphrase: "pas besoin de question" -> reponse directe.
  - Anti-faux-positif: si un slot requis manque pour un tool explicite, poser la question necessaire.
  - Integration: onboarding WhatsApp -> normal reply post-onboarding.

## R3-B03 - Status recap reste trop generique sur les effets durables

- Bug id: `R3-B03`
- Tours: T12, T17
- Famille: `BF-STATUS-02` - Historique incomplet
- Domaine owner: `status_recap`
- Source amont: projection des effets durables et facts explicites selon le scope demande.
- Symptome visible: T12 ne mentionne pas les preferences coach notees depuis le debut; T17 dit seulement "un rappel" et "ton progres" sans horaire, libelle ni item.
- Preuve systeme: DB avant nettoyage contenait `coach.tone`, `coach.challenge_level`, `coach.question_tendency`, 1 `user_plan_item_entries`, 1 `scheduled_checkins` avec instruction et horaire.
- Correction attendue: pour "cree ou note exactement/vraiment", restituer les details stables des effets confirmes; pour "depuis le debut", inclure aussi les preferences explicitement notees.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Positif: apres preference + progression + rappel -> recap detaille avec libelles et horaires.
  - Paraphrase: "qu'est-ce qui a ete enregistre ?" -> meme projection.
  - Anti-faux-positif: ne pas inclure blocked paths ou tentatives internes.
  - Integration: verifier DB et reponse visible.

## R3-B04 - Flow opportunity materialise malgre normal_reply_fit_dominates

- Bug id: `R3-B04`
- Tours: T18, T19
- Famille: `BF-ROUTE-02` - Ancien flow capture une nouvelle intention
- Domaine owner: flow opportunity admission / active local flow policy
- Source amont: materialisation runtime de `flow_opportunity_verification` apres arbitrage normal reply.
- Symptome visible: T18 est acceptable, T19 aussi, mais l'ownership passe par `flow_opportunity_verification` puis `emotional_repair` alors que les demandes sont conversationnelles.
- Preuve systeme: T18 `route_decision.response_owner=normal_reply`, `reason_code=normal_reply_fit_dominates`, mais metadata finale `response_owner=tool_skill`, `selected_handler=flow_opportunity_verification`, `tool_skill_run.status=waiting_confirmation`; T19 `route_reason=active_flow_opportunity_verification_local_dispatcher`.
- Correction attendue: une opportunity bloquee par normal reply ne doit pas creer de `tool_skill_run`, pas d'active local ownership, pas de `selected_handler` final; seulement `blocked_paths`.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Positif: emotion legere + `normal_reply_fit_score` haut -> normal reply, `tool_skill_run=null`.
  - Paraphrase: demande de soutien simple -> pas d'active opportunity.
  - Anti-faux-positif: demande explicite "propose-moi un outil/flow" -> opportunity/flow admissible.
  - Integration: deux tours consecutifs; le second ne doit pas etre capture par l'ancien flow.

## R3-W01 - Progress entry creee mais compteur item potentiellement non verifie

- Bug id: `R3-W01`
- Tours: T11
- Famille: `BF-EFFECT-03` - Payload durable faux
- Domaine owner: plan progress writer / reducer
- Source amont: coherence entre `user_plan_item_entries` et compteur/reducer `user_plan_items`.
- Symptome visible: aucun symptome visible dans ce run.
- Preuve systeme: R2 avait observe 1 entry mais `current_reps=0`; R3 confirme l'entry, mais le controle final n'a pas revalide le compteur item avant nettoyage.
- Correction attendue: verifier le contrat attendu. Si le compteur doit suivre les entries, ajouter une assertion integration et corriger writer/reducer si besoin.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Positif: commit progression clair -> entry + compteur coherent si requis.
  - Anti-faux-positif: preparation mentale -> pas d'entry ni compteur.
  - Integration: controle DB complet apres webhook WhatsApp.
