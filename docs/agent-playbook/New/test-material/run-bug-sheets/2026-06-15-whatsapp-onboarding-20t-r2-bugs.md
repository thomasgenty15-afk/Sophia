# Bug Sheet - 2026-06-15 WhatsApp Onboarding 20T R2

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-15-whatsapp-onboarding-20t-r2.md`

## R2-B01 - Question humaine capturee comme opportunite de tracking

- Bug id: `R2-B01`
- Tours: T10
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: WhatsApp default brain / plan progress opportunity
- Source amont: arbitrage entre normal reply et operation de progression apres onboarding
- Symptome visible: a "Ca compte ou pas ?", Sophia repond "Tu veux que je le note vraiment ?" au lieu d'expliquer humainement si la preparation compte.
- Preuve systeme: aucun effet durable, mais reponse visible orientee commit/tracking.
- Correction attendue: les questions conceptuelles sur le progres doivent rester en normal reply sauf demande explicite de noter, valider, enregistrer ou cocher.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Positif: "je l'ai prepare mais pas envoye, ca compte ?" -> reponse humaine sans pending/commit.
  - Paraphrase: "mentalement je l'ai fait, c'est deja un pas ?" -> normal reply.
  - Anti-faux-positif: "note que j'ai envoye le message" -> entry progression admise.
  - Integration: run WhatsApp post-onboarding avec active plan item.

## R2-B02 - Confirmation de progression trop mecanique

- Bug id: `R2-B02`
- Tours: T12
- Famille: `BF-LEDGER-02` - Commit reel mal rendu
- Domaine owner: plan progress confirmation / final response pipeline WhatsApp
- Source amont: restitution visible d'un commit progression
- Symptome visible: "Note pour Envoyer un message simple a une personne: fait."
- Preuve systeme: `user_plan_item_entries` contient bien une entry `checkin`; la mutation est correcte mais le message sonne template.
- Correction attendue: transmettre le commit au visible agent final comme instruction a integrer naturellement, par exemple confirmer que le message a ete marque comme envoye, sans renderer dedie ni formule fixe.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Positif: "je viens de l'envoyer" -> entry creee + confirmation conversationnelle.
  - Paraphrase: "c'est bon, c'est parti" -> meme comportement si l'intention est claire.
  - Anti-faux-positif: "je vais l'envoyer" -> pas de commit.
  - Integration: verifier DB entry + contenu assistant.

## R2-B03 - Recap expose une tentative bloquee interne

- Bug id: `R2-B03`
- Tours: T13, T18
- Famille: `BF-STATUS-02` - Historique incomplet ou pollue
- Domaine owner: status recap / effect history projection WhatsApp
- Source amont: projection des events internes dans la restitution user-facing
- Symptome visible: Sophia mentionne "une autre tentative de saisie n'a pas pu aboutir" puis "un autre a ete bloque car ton intention n'etait pas assez explicite".
- Preuve systeme: un blocked/failed opportunity semble restitue comme evenement utilisateur alors qu'il devrait rester dans les traces.
- Correction attendue: separer strictement `blocked_paths` / attempts internes de l'historique restituable. Les recaps doivent lister seulement les effets crees, annules, modifies, ou explicitement refuses par l'utilisateur si pertinent.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Positif: apres une opportunity bloquee puis un commit reel, recap -> seulement commit reel + preferences si scope demande.
  - Paraphrase: "qu'est-ce qui a vraiment ete cree ?" -> pas d'interne.
  - Anti-faux-positif: si le user demande "qu'est-ce qui n'a pas marche techniquement ?" -> possible mention technique adaptee.
  - Integration: run WhatsApp status recap apres blocked opportunity.

## R2-B04 - Claim "je te note" sans effet durable clair

- Bug id: `R2-B04`
- Tours: T15
- Famille: `BF-LEDGER-01` - Claim sans commit
- Domaine owner: final response guard / normal reply WhatsApp
- Source amont: langage d'enregistrement dans une reponse sans ledger/effect
- Symptome visible: apres "Ne me fais pas de rappel, je veux juste garder ca en tete", Sophia dit "je te note".
- Preuve systeme: aucun rappel cree a ce tour; aucun effet durable specifique observe pour "garder ca en tete".
- Correction attendue: ne pas utiliser "je note/j'enregistre/c'est note" si aucun effet durable n'est applique ou si l'utilisateur refuse explicitement une creation. Preferer une formulation conversationnelle non engageante.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Positif: refus de rappel + "garder en tete" -> acknowledgement sans claim durable.
  - Paraphrase: "pas besoin de le sauvegarder" -> pas de claim "note".
  - Anti-faux-positif: "note-moi que je veux attendre 24h" -> effet durable admissible si le systeme le supporte, sinon clarifier.
  - Integration: verification absence scheduled_checkins.

## R2-B05 - Flow prepare_attack_card admis sur demande de phrase simple

- Bug id: `R2-B05`
- Tours: T20
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: global dispatcher / flow opportunity admission / WhatsApp companion active-flow write
- Source amont: economie d'intervention non appliquee ou pas assez forte dans le chemin WhatsApp pour `prepare_attack_card`
- Symptome visible: au lieu de donner une phrase simple, Sophia propose "Mantra de force" vs "Le texte magique".
- Preuve systeme: `user_chat_states.temp_memory.__active_attack_card_handoff.status=collecting`, `skill_id=prepare_attack_card`, `no_chat_mutation=true`.
- Correction attendue: une demande directe de formulation/mantra simple doit etre satisfaite par normal reply. `prepare_attack_card` ne doit s'activer que si le user demande explicitement une carte, une preparation de carte, ou accepte une proposition de flow.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Positif: "donne-moi juste une phrase simple a me repeter" -> phrase directe, pas active flow.
  - Paraphrase: "une phrase courte pour demain" -> normal reply.
  - Anti-faux-positif: "prepare-moi une carte d'attaque avec un mantra" -> flow admis.
  - Integration: verification `temp_memory` sans `__active_attack_card_handoff` apres demande simple.

## R2-B06 - Trace WhatsApp post-onboarding trop pauvre

- Bug id: `R2-B06`
- Tours: T8-T20
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: WhatsApp webhook metadata / trace mapping
- Source amont: metadata assistant apres onboarding
- Symptome visible: les tours default brain n'exposent pas `selected_handler`, `route_reason`, ni les blocked/admitted opportunities dans `chat_messages.metadata`.
- Preuve systeme: metadata utile presente sur T1-T7, puis mostly null sur T8-T20 alors que des effets et active flows existent.
- Correction attendue: exposer une trace courte stable pour le chemin WhatsApp, au moins owner/route_reason/admitted_tools/admitted_flows/blocked_paths/direct_effects.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Positif: run WhatsApp post-onboarding -> metadata contient route courte.
  - Anti-faux-positif: ne pas exposer prompt interne ou donnees sensibles.
  - Integration: rapport QA peut classifier sans lire `temp_memory` brut.

## R2-W01 - Progress entry creee mais compteur item non incremente

- Bug id: `R2-W01`
- Tours: T12
- Famille: `BF-EFFECT-03` - Payload durable faux
- Domaine owner: plan progress executor / writer
- Source amont: coherence entre `user_plan_item_entries` et `user_plan_items.current_reps`
- Symptome visible: pas visible user dans ce run.
- Preuve systeme: verification finale: 1 entry `checkin`, mais `user_plan_items.current_reps=0` pour l'item correspondant.
- Correction attendue: verifier le contrat attendu. Si `current_reps` doit reflechir les entries boolean/checkin, le writer doit l'incrementer ou un reducer doit le recalculer.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Positif: commit progression boolean -> entry + compteur coherent.
  - Anti-faux-positif: draft ou preparation mentale -> pas d'entry, pas de compteur.
  - Integration: DB assertion apres webhook WhatsApp.
