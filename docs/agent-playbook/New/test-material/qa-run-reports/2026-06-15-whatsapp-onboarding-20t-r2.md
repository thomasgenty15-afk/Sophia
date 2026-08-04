# 2026-06-15 - WhatsApp Onboarding 20T R2

## 1. Contexte Du Test

- Date: 2026-06-15
- Run: `onboarding-20t-20260615-r2`
- Persona: user QA local temporaire `qa-wa-onb-onboarding-20t-20260615-r2-1781531582215@example.com`
- Objectif: tester un onboarding WhatsApp depuis l'arrivee initiale, puis une conversation normale autour du plan actif, avec attention particuliere au forcing de flow.
- Trajectoire: entree WhatsApp sans plan pret -> plan active par fixture QA apres T1 -> preferences onboarding -> passage au plan -> discussion normale -> suivi progression -> rappel ponctuel -> recap statut -> sortie statut -> demande simple finale.
- Surfaces visees: webhook WhatsApp reel local, local flow onboarding, preferences coach, plan progress, status recap/projection, one-shot reminder, economie d'intervention flow/tool, normal reply.
- Cadre IA reel: Supabase local, endpoint reel `/functions/v1/whatsapp-webhook`, transport loopback `x-sophia-wa-transport: loopback`, aucun renderer deterministe appele comme resultat QA, aucun fallback direct `processMessage`.
- Validite QA: valide. Un premier essai `onboarding-20t-20260615-r1` a ete arrete avant conversation exploitable a cause d'un boot error du simulateur `/whatsapp-sim-inbound`; le run final R2 utilise le webhook reel local et contient 20 tours.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Salut Sophia, je viens d'arriver sur WhatsApp, on commence ?

**Sophia**
> Salut ! Bienvenue sur WhatsApp. 😊 Pour qu'on puisse commencer, il faut d'abord que tu generes ton plan sur le site. Je t'attends ici des que c'est fait !

**Trace courte**
- http_status: 200
- response_owner: `whatsapp_onboarding`
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_plan_not_ready`
- operation: none
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Ok, j'ai genere le plan sur le site, je crois que c'est pret maintenant.

**Sophia**
> Top, j'ai bien recu ton plan pour tes contacts pro ! Avant de commencer, dis-moi : tu preferes que je sois plutot douce, directe, ou un mix des deux dans nos echanges ?

**Trace courte**
- http_status: 200
- response_owner: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_plan_ready_resume_preferences`
- next_whatsapp_state: `onboarding_pref_tone`
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Un mix, mais plutot direct quand je commence a tourner autour du pot.

**Sophia**
> C'est bien note pour le ton, je saurai etre directe quand il le faudra ! 😉 Derniere petite question : quand tu decroches un peu, comment tu veux que je te challenge ? Plutot leger, equilibre, ou plus direct ?

**Trace courte**
- response_owner: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_preference_saved`
- next_whatsapp_state: `onboarding_pref_challenge`
- durable_effect: `coach.tone=warm_direct`

### Tour 4

**Verdict du tour:** green

**User**
> Equilibre au debut, mais si j'esquive vraiment tu peux me recadrer clairement.

**Sophia**
> C'est entendu pour le dosage : equilibre, mais je te recadrerai clairement si tu esquives. 😉 Dernier point : tu preferes que je pose peu de questions, que je creuse un peu, ou que je te questionne franchement quand ca peut aider ?

**Trace courte**
- response_owner: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_preference_saved`
- next_whatsapp_state: `onboarding_pref_questions`
- durable_effect: `coach.challenge_level=balanced`

### Tour 5

**Verdict du tour:** green

**User**
> Pose plutot peu de questions, sauf quand il manque vraiment une info pour avancer.

**Sophia**
> C'est bien note, je limiterai mes questions au strict necessaire. Ton plan "Routine contacts pro" est pret : qu'as-tu pense de sa creation et est-ce que le resultat te convient ?

**Trace courte**
- response_owner: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_preference_saved`
- next_whatsapp_state: `onboarding_plan_creation_feedback`
- durable_effect: `coach.question_tendency=low`

### Tour 6

**Verdict du tour:** green

**User**
> Oui le resultat me convient. La creation etait un peu longue, mais le plan est clair et pas trop lourd.

**Sophia**
> Top, ravie que ca te plaise ! Desolee pour le delai de creation, on va s'ameliorer la-dessus. On attaque ton plan "Routine contacts pro" ou tu preferes parler d'autre chose de plus urgent ?

**Trace courte**
- response_owner: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_plan_feedback_received`
- next_whatsapp_state: `onboarding_topic_choice`
- durable_effect: none

### Tour 7

**Verdict du tour:** green

**User**
> On attaque le plan, mais tranquillement. Je veux juste comprendre par quoi commencer.

**Sophia**
> C'est parti ! On va se concentrer sur ta routine de contacts pro pour relancer ton reseau en douceur, comme tu le souhaites. Le programme est simple : 1. Lister cinq contacts prioritaires. 2. Envoyer un message court a l'un d'entre eux. Est-ce que tu as deja une idee de la premiere personne que tu aimerais recontacter ?

**Trace courte**
- response_owner: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_complete_to_plan`
- next_whatsapp_state: null
- durable_effect: onboarding termine, pas d'entry de progression

### Tour 8

**Verdict du tour:** green

**User**
> J'ai pense a Nadia, mais j'hesite parce qu'on ne s'est pas parle depuis longtemps.

**Sophia**
> Je te comprends : quand ca fait longtemps, c'est normal de se demander "est-ce que je derange ?" ou "est-ce que ca sonne bizarre ?" 😅 L'hesitation n'est pas un mauvais signe : ca veut souvent juste dire que Nadia compte un minimum pour toi et que tu veux etre clean dans ton approche. Si tu veux rester simple, tu peux partir sur un message tres leger du style "Hey Nadia, je repense a toi / j'espere que tu vas bien - je reprends contact suite a X".

**Trace courte**
- response_owner: default WhatsApp brain reply
- selected_handler: non expose dans metadata
- durable_effect: none

### Tour 9

**Verdict du tour:** green

**User**
> Oui, fais plus court stp, juste une phrase que je pourrais envoyer.

**Sophia**
> Carrement 🙂 Tu peux envoyer : « Salut [Prenom], tu as 10 minutes cette semaine pour en discuter ? »

**Trace courte**
- response_owner: default WhatsApp brain reply
- durable_effect: none

### Tour 10

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-01 - mauvais owner selectionne

**User**
> Je l'ai prepare dans ma tete mais je ne l'ai pas encore envoye. Ca compte ou pas ?

**Sophia**
> Tu veux que je le note vraiment ?

**Trace courte**
- response_owner: default WhatsApp brain reply
- selected_handler: non expose dans metadata
- direct_effects: none
- durable_effect: none

**Analyse si yellow/red**
- Symptome: Sophia transforme une question humaine/conceptuelle en clarification de tracking.
- Source amont probable: economie d'intervention du chemin WhatsApp default brain / progress opportunity trop proche de la reponse visible.
- Owner runtime: arbitrage WhatsApp companion + plan progress opportunity.
- Meilleure correction selon les guidelines: faire passer ce type de question par normal reply sauf intention explicite de noter/valider une action.
- Pourquoi ce n'est pas un patch local: il faut arbitrer la famille "question humaine sur le progres" contre "commit de progression", pas reconnaitre cette phrase exacte.

### Tour 11

**Verdict du tour:** green

**User**
> Non, ne note rien. Je voulais juste savoir humainement si preparer le message compte un peu.

**Sophia**
> Oui, clairement. Humainement, preparer le message compte beaucoup : ca veut dire que tu t'es "decide", que tu as clarifie ce que tu voulais dire, et que tu reduis la friction au moment d'envoyer. C'est deja de l'elan, meme si l'envoi n'a pas suivi juste apres 🙂 Le seul point a garder en tete : si tu prepares mais que tu repousses, l'energie peut retomber... mais si tu es dans une logique "je m'apprete et j'envoie", la ca contribue vraiment. ✅

**Trace courte**
- response_owner: default WhatsApp brain reply
- durable_effect: none

### Tour 12

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-LEDGER-02 - commit reel mal rendu

**User**
> Ok je viens de l'envoyer a Nadia.

**Sophia**
> Note pour Envoyer un message simple a une personne: fait.

**Trace courte**
- response_owner: default WhatsApp brain reply
- direct_effects: plan progress entry creee
- durable_effect: `user_plan_item_entries` contient 1 entry `checkin` pour `Envoyer un message simple a une personne`

**Analyse si yellow/red**
- Symptome: effet durable correct, confirmation visible mecanique et peu humaine.
- Source amont probable: confirmation de commit progression dans le chemin WhatsApp, pas assez blend dans l'agent conversationnel final.
- Owner runtime: final response pipeline / plan progress confirmation visible.
- Meilleure correction selon les guidelines: transmettre le commit comme instruction de confirmation au visible agent final, avec style conversationnel et sans phrase template.
- Pourquoi ce n'est pas un patch local: le probleme vaut pour toute confirmation de commit progression, pas pour ce libelle precis.

### Tour 13

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATUS-02 - historique incomplet ou pollue

**User**
> Ok, qu'est-ce qui a ete note exactement depuis le debut ?

**Sophia**
> Depuis le debut, j'ai surtout note tes preferences pour nos echanges et le suivi d'une action. Pour ton coaching, j'ai enregistre un ton bienveillant et direct, un niveau de challenge equilibre et peu de questions de ma part. J'ai egalement valide le suivi d'une action dans ton parcours, meme si une autre tentative de saisie n'a pas pu aboutir.

**Trace courte**
- response_owner: default WhatsApp brain reply
- entries_count: 1
- durable_effect: preferences coach + entry progression

**Analyse si yellow/red**
- Symptome: recap globalement utile, mais "une autre tentative de saisie n'a pas pu aboutir" expose une logique interne de tentative bloquee.
- Source amont probable: projection/status history inclut un effet refuse ou un blocked opportunity comme evenement a restituer.
- Owner runtime: status recap / effect history projection du chemin WhatsApp.
- Meilleure correction selon les guidelines: garder les blocked/failed attempts en trace systeme, pas en restitution user sauf demande technique explicite.
- Pourquoi ce n'est pas un patch local: ce n'est pas le wording exact qu'il faut corriger, mais la projection de ce qui est communicable.

### Tour 14

**Verdict du tour:** green

**User**
> Ok, hors recap maintenant : est-ce que je dois attendre sa reponse ou relancer quelqu'un d'autre ?

**Sophia**
> Je te conseillerais d'orienter en mode "attente courte + pas de blocage" 🙂: attends un delai raisonnable (disons 24h) la reponse de Nadia, mais dans la foulee, avance en parallele avec quelqu'un d'autre si tu as des interlocuteurs prioritaires - comme ca tu ne perds pas d'elan. Tu as deja une idee du delai que tu lui avais "implicitement" laisse ?

**Trace courte**
- response_owner: default WhatsApp brain reply
- durable_effect: none
- status stickiness: non observee

### Tour 15

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-LEDGER-01 - claim sans commit

**User**
> 24h ca me va. Ne me fais pas de rappel, je veux juste garder ca en tete.

**Sophia**
> Ok, 24h ca marche 🙂 et je te note : tu veux juste garder ca en tete, sans rappel. Tu veux que ton message reste plutot "check-in leger" ou "je te propose un creneau" ?

**Trace courte**
- response_owner: default WhatsApp brain reply
- scheduled_checkins: aucun rappel cree a ce stade
- durable_effect: none observe

**Analyse si yellow/red**
- Symptome: "je te note" suggere un enregistrement alors que l'utilisateur demande seulement de garder en tete et refuse le rappel.
- Source amont probable: final response claims "noter" sans ledger/effect ou sans intention durable explicite.
- Owner runtime: final response guard / normal reply wording.
- Meilleure correction selon les guidelines: interdire les claims de type "je note" quand aucun effet durable n'est engage ou quand le user demande explicitement de ne pas creer de rappel.
- Pourquoi ce n'est pas un patch local: la regle doit proteger toute reponse qui parle d'enregistrement, pas seulement ce tour.

### Tour 16

**Verdict du tour:** green

**User**
> Check-in leger. Et pas besoin de me poser trop de questions, propose-moi juste une formulation simple.

**Sophia**
> Je suis la 🙂 Et oui : le check-in "leger" compte deja, parce que tu passes a l'acte mentalement (tu te mets en mouvement). Formulation simple a envoyer : « Salut [Prenom], tu as 10 minutes cette semaine pour en parler ? » 😊

**Trace courte**
- response_owner: default WhatsApp brain reply
- durable_effect: none

### Tour 17

**Verdict du tour:** green

**User**
> Par contre la oui, programme-moi un rappel demain a 9h pour verifier si Nadia a repondu.

**Sophia**
> C'est programme pour mardi 16 juin a 09:00: je te ferai un rappel pour verifier si Nadia a repondu.

**Trace courte**
- response_owner: default WhatsApp brain reply
- direct_effects: one-shot reminder cree
- durable_effect: `scheduled_checkins.status=pending`, `scheduled_for=2026-06-16T07:00:00+00:00`, `message_payload.reminder_instruction=verifier si Nadia a repondu`

### Tour 18

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATUS-02 - historique incomplet ou pollue

**User**
> Qu'est-ce qui a ete cree ou note exactement maintenant ? Reponds juste factuel.

**Sophia**
> Voici ce qui a ete enregistre a l'instant : un rappel pour demain a 9h00 pour verifier si Nadia a repondu. J'ai aussi note tes preferences pour un ton bienveillant et direct, un challenge equilibre et peu de questions. Enfin, un suivi de progression a ete valide, mais un autre a ete bloque car ton intention n'etait pas assez explicite.

**Trace courte**
- response_owner: default WhatsApp brain reply
- durable_effect: rappel pending + preferences + 1 entry progression
- projection issue: mention d'un blocage interne

**Analyse si yellow/red**
- Symptome: la reponse melange "a l'instant" avec des preferences plus anciennes et expose un blocage interne.
- Source amont probable: scope de recap recent/current mal contraint dans le chemin WhatsApp et projection de blocked attempts comme effet user-facing.
- Owner runtime: status recap / effect history projection / final visible recap.
- Meilleure correction selon les guidelines: respecter le scope temporel demande et restituer uniquement les effets user-facing crees/notes, pas les opportunities bloquees.
- Pourquoi ce n'est pas un patch local: c'est une politique de projection d'historique, pas une phrase a bannir.

### Tour 19

**Verdict du tour:** green

**User**
> Ok, hors statut maintenant. Je me sens un peu bete d'avoir eu besoin de tout ca pour envoyer un message.

**Sophia**
> Oh non, arrete 😅 Tu n'as rien "besoin de tout ca" pour etre "bete" : tu t'es juste appuye sur une structure au bon moment, et c'est exactement comme ca qu'on evite les erreurs et qu'on avance. Si tu veux te juger, juge plutot le fait que tu as fait le message malgre la gene. C'est un vrai signe d'efficacite, pas d'incompetence. 🙏

**Trace courte**
- response_owner: default WhatsApp brain reply
- durable_effect: none
- status stickiness: non observee

### Tour 20

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 - mauvais owner selectionne

**User**
> Merci. Pour finir, donne-moi juste une phrase simple a me repeter si je bloque encore demain.

**Sophia**
> Pour t'aider a envoyer un message simple a une personne sans te sentir bete ou bloquer sur l'envoi, le Mantra de force est ideal pour te donner une phrase a te repeter. Est-ce que ca te convient, ou tu preferes utiliser Le texte magique ?

**Trace courte**
- response_owner: default WhatsApp brain reply
- active_flow_state: `__active_attack_card_handoff.status=collecting`
- operation: no chat mutation, but active `prepare_attack_card` handoff created
- durable_effect: no card created, but temp_memory active flow set

**Analyse si yellow/red**
- Symptome: l'utilisateur demande explicitement "juste une phrase simple", Sophia propose un choix de technique/carte au lieu de donner la phrase.
- Source amont probable: admission de flow `prepare_attack_card` trop eager dans le chemin WhatsApp/default brain, sans appliquer assez fortement l'economie normal reply / simple answer.
- Owner runtime: global dispatcher / flow opportunity admission / WhatsApp companion active-flow write.
- Meilleure correction selon les guidelines: une demande de phrase simple doit etre satisfaite directement par normal reply; l'opportunite `prepare_attack_card` peut etre gardee en trace, mais ne doit pas activer un flow sans demande explicite de carte/outil.
- Pourquoi ce n'est pas un patch local: il faut corriger l'admission de famille "support phrase/mantra simple" vs "creation/preparation de carte", sans regex sur "phrase simple".

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- L'onboarding WhatsApp est fluide: Sophia detecte l'absence de plan, reprend quand le plan est pret, collecte les preferences, puis sort correctement vers la discussion de plan.
- Les preferences explicites sont comprises et persistees: ton direct/bienveillant, challenge equilibre, peu de questions.
- Les sorties de recap/statut sont meilleures qu'avant: apres T13 et T18, Sophia revient bien a une discussion normale aux T14 et T19.
- Le rappel ponctuel explicite T17 est cree avec une confirmation tutoyee et naturelle.

**Problemes**
- Tour 10: Sophia veut "noter" alors que l'utilisateur demande humainement si la preparation compte. Famille: BF-ROUTE-01. Impact: la conversation devient operationnelle trop tot. Severite: yellow.
- Tour 12: confirmation de progression trop mecanique. Famille: BF-LEDGER-02. Impact: le commit est bon mais l'experience sonne systeme. Severite: yellow.
- Tours 13 et 18: recap expose une tentative bloquee interne. Famille: BF-STATUS-02. Impact: l'utilisateur voit une logique de routing qui devrait rester trace systeme. Severite: yellow.
- Tour 15: "je te note" sans effet durable clair apres un refus de rappel. Famille: BF-LEDGER-01. Impact: ambiguite sur ce qui est vraiment enregistre. Severite: yellow.
- Tour 20: forcing de flow carte d'attaque sur une demande de phrase simple. Famille: BF-ROUTE-01. Impact: Sophia devient lourde exactement au moment ou le user demande une reponse simple. Severite: red.

**Fix propose**
- Source amont: admission des opportunities plan progress / prepare_attack_card dans le chemin WhatsApp default brain, final response claims, et projection status.
- Correction recommandee: appliquer la meme economie d'intervention que le chemin brain principal au webhook WhatsApp: normal/simple answer doit battre les opportunities implicites; seules les demandes explicites de tool/flow doivent activer un flow.
- Tests d'invariant attendus:
  - "Ca compte ou pas ?" apres preparation mentale -> reponse humaine, pas demande de notation.
  - "Je viens de l'envoyer" -> entry creee + confirmation conversationnelle.
  - "Qu'est-ce qui a ete cree/note ?" -> uniquement effets user-facing, pas blocked opportunities.
  - "Donne-moi juste une phrase simple" -> phrase directe, pas activation `prepare_attack_card`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Le local flow onboarding est bon de T1 a T7. Les transitions `awaiting_plan_finalization -> onboarding_pref_* -> onboarding_topic_choice -> companion` sont propres.
- Apres onboarding, le chemin WhatsApp expose peu de metadata de routing dans `chat_messages.metadata`, ce qui rend le diagnostic moins precis que `/test-send-message`.
- Le bug principal est une admission de flow trop eager en fin de run: T20 pose `__active_attack_card_handoff.status=collecting` alors que le user demande une phrase simple.

**Skills / Operations / Tools**
- Preferences coach: trois preferences explicites sont persistees correctement (`coach.tone`, `coach.challenge_level`, `coach.question_tendency`).
- Plan progress: une entry `user_plan_item_entries.entry_kind=checkin` est creee au T12 pour `Envoyer un message simple a une personne`. Warning: `current_reps` du plan item reste a 0 dans la verification finale, a confirmer selon le contrat attendu du tracking.
- One-shot reminder: T17 cree bien un `scheduled_checkins` pending pour `2026-06-16T07:00:00+00:00`, soit mardi 16 juin 2026 a 09:00 Europe/Paris. Le libelle stocke est propre: `verifier si Nadia a repondu`.
- Status recap: les effets reels sont globalement retrouves, mais la projection inclut un blocage interne et gere mal le scope "a l'instant".

**Effets durables observes**
- `scheduled_checkins`: 1 rappel pending cree au T17.
- `user_plan_item_entries`: 1 entry `checkin` creee au T12.
- `user_profile_facts`: preferences onboarding persistees + defaults existants.
- `temp_memory`: T20 a cree un etat actif `__active_attack_card_handoff` mal admis.

**Incident technique hors run final**
- R1 invalide: `/functions/v1/whatsapp-sim-inbound` a renvoye `503 BOOT_ERROR`.
- Cause observee: `deno check supabase/functions/whatsapp-sim-inbound/index.ts` signale un import manquant `tools/operations/update_coach_preferences/intake.ts`.
- Resolution QA: abandon de cette tentative non conversationnelle, puis run R2 via webhook WhatsApp reel local avec transport loopback.

**Nettoyage**
- Nettoyage cible effectue apres le run sur le user QA, ses messages WhatsApp, facts, state, scheduled checkins, plan fixture, entries, auth user.
- Aucun `supabase db reset`, aucune suppression large hors perimetre du run.

## Verdict Global

Verdict produit: **red**.

Le debut d'onboarding est solide et le rappel explicite est correct. Le run ne va pas au vert parce que le chemin WhatsApp continue a activer une opportunity/flow implicite dans une conversation simple, visible au T20 avec `prepare_attack_card`, et parce que les recaps exposent encore des blocked/failed attempts internes.
