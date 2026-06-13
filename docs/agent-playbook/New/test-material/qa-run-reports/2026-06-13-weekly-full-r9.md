# QA Run Report - Weekly Full R9

## 1. Contexte Du Test

- Date: 2026-06-13
- Run: `weekly-full-20260613-r9-rose`
- Persona: Rose, connexion locale `tests/real-personas/rose/connection.json`
- Objectif: verifier le weekly complet apres patch d'ordre des etapes, statuts partiels, retour child flow et contraintes no-chat-mutation.
- Trajectoire: opening weekly -> experience de semaine -> review actions/gaps -> progression objectif global -> qualification solution -> handoff `prepare_defense_card` -> revision -> retour weekly -> synthese -> cloture.
- Surfaces visees: `weekly_adaptive_review_v1`, `prepare_defense_card`, retour parent apres child flow, durable weekly, cleanup QA.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, hors sandbox, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide. 11 tours reels, http `200` a chaque tour, cleanup cible effectue, `remaining_scope_messages=0`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Ok, je suis prête pour faire mon point weekly.

**Sophia**
> C'est parti pour ton bilan de la semaine. Globalement, comment as-tu vécu ces derniers jours ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- visible_task: `ask_week_experience`
- safety: `none`
- committed_effects: `[]`

### Tour 2

**Verdict du tour:** green

**User**
> Mitigé. Il y a eu des moments où j'étais contente de tenir, mais aussi pas mal de fatigue. Le rangement du matériel, je l'ai fait lundi, mardi et mercredi, puis j'ai relâché. Le joint réflexe, j'ai réussi à le voir venir une ou deux fois, mais c'était flou. Et le sas de décompression, vendredi je n'ai pas réussi.

**Sophia**
> C'est compris pour le rangement en début de semaine et le sas de décompression mis de côté à cause de la fatigue. Pour le joint réflexe, qui est aussi resté partiel cette semaine, qu'est-ce qui a fait obstacle ?

**Trace courte**
- http_status: `200`
- selected_handler: `weekly_adaptive_review_v1`
- visible_task: `review_action_gaps`
- route_reason: `active_weekly_review_local_dispatcher`
- durable_effect: `user_corrected_action_statuses[0].corrected_status=partial`
- committed_effects: `[]`

### Tour 3

**Verdict du tour:** green

**User**
> Pour le joint réflexe, le souci c'est surtout après le boulot. Je rentre un peu vidée, je me dis que je vais juste me poser, et là je repars en pilote automatique. Quand j'ai réussi à le voir venir, c'est parce que j'avais posé mes clés ailleurs et ça m'a fait un mini stop.

**Sophia**
> Malgré la fatigue et le pilote automatique qui ont repris le dessus en fin de semaine, as-tu le sentiment d'avoir fait un pas de plus vers ton objectif global ?

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- visible_task: `ask_global_progress_feeling`
- committed_effects: `[]`

### Tour 4

**Verdict du tour:** green

**User**
> Oui, un petit pas, mais pas un grand. Je vois mieux le moment où je décroche, donc je me sens moins complètement nulle. Par contre je suis frustrée parce que j'ai encore l'impression que l'objectif global reste loin.

**Sophia**
> C'est tout à fait compréhensible de ressentir cette frustration : quand on avance par petits pas, l'objectif final peut sembler encore très loin, surtout avec la fatigue accumulée. Selon toi, qu'est-ce qui pèse le plus dans ce sentiment de distance aujourd'hui ?

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- visible_task: `deepen_global_progress`
- safety: `none`
- committed_effects: `[]`

### Tour 5

**Verdict du tour:** green

**User**
> Ce qui pèse le plus, c'est le retour du boulot. C'est là que tout se joue. Je ne sais pas s'il faut alléger le plan ou juste prévoir un truc très concret pour ce moment-là. J'ai peur que si c'est trop ambitieux je lâche encore.

**Sophia**
> C'est un arbitrage important entre simplifier tes objectifs pour réduire la pression ou utiliser un outil spécifique pour sécuriser ce moment critique du retour du travail. Quelle approche te semble la plus efficace pour ne pas lâcher ?

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- visible_task: `qualify_solution_fit`
- committed_effects: `[]`
- pending_confirmation: `null`

### Tour 6

**Verdict du tour:** green

**User**
> Je pense que le plus utile serait de sécuriser le retour du travail. Pas forcément changer tout le plan maintenant. Il me faudrait plutôt une défense simple pour ne pas partir direct vers le joint quand je passe la porte.

**Sophia**
> C’est une super idée d’utiliser un mini-stop comme le déplacement des clés pour casser ce pilote automatique en rentrant du travail. Pour que ce soit vraiment efficace, qu’est-ce que tu aimerais faire ou te dire juste après ce geste pour ne pas basculer vers le joint ?

**Trace courte**
- selected_handler: `prepare_defense_card`
- route_reason: `weekly_adaptive_review_v1_handoff_to_prepare_defense_card`
- status: `collecting`
- committed_effects: `[]`

### Tour 7

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-03 - Contrainte explicite perdue

**User**
> Juste après le geste, je veux poser mes clés dans la salle de bain et lancer une douche de cinq minutes. La phrase pourrait être : je passe d'abord par l'eau, après je déciderai.

**Sophia**
> On a bien avancé sur ta stratégie pour casser ce réflexe en rentrant. Pour finaliser ta carte, rends-toi dans l'action concernée du Plan, section Cartes de défense. Comme je ne peux pas la créer à ta place depuis ici, tu n'auras qu'à recopier cette phrase dans le champ : Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?
>
> Voici la formulation : Le moment où je passe la porte après le boulot, quand je suis vidée et que le pilote automatique me pousse vers le joint réflexe.

**Trace courte**
- selected_handler: `prepare_defense_card`
- status: `handoff_delivered`
- operation: `platform_handoff`
- no_chat_mutation: `true`
- platform_destination: `dans l'action concernée du Plan, section Cartes de défense`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: le handoff defense respecte la frontiere no-chat-mutation, mais la restitution ne conserve pas les elements concrets donnes par le user: cles dans la salle de bain, douche 5 minutes, phrase rituelle.
- Source amont probable: intake/reducer `prepare_defense_card` verrouille surtout `support_need` et perd les champs de parade concrete.
- Owner runtime: `prepare_defense_card.local_flow` / visible handoff.
- Meilleure correction selon les guidelines: enrichir le contrat local defense pour distinguer contexte/pulsion et response plan utilisateur, puis l'exposer dans le platform handoff.
- Pourquoi ce n'est pas un patch local: le probleme est une perte de champ structure, pas une phrase a remplacer.

### Tour 8

**Verdict du tour:** green

**User**
> Oui mais garde aussi l'idée importante : clés dans la salle de bain, douche cinq minutes, et la phrase 'je passe d'abord par l'eau, après je déciderai'. Après ça on peut revenir au weekly.

**Sophia**
> C'est noté pour les étapes de ta carte : les clés dans la salle de bain, la douche de 5 minutes et ta phrase rituelle. J'ai préparé ces points pour que tu puisses les saisir dans ton Plan, au sein de l'action concernée (section Cartes de défense). On reprend maintenant le fil du bilan pour terminer la synthèse de ta semaine ?

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- visible_task: `return_from_child_flow`
- reason_code: `weekly_review_gate_order_requires_return_from_child_flow`
- child_flow.result_details.revision_summary: present
- committed_effects: `[]`

### Tour 9

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Oui, faisons la synthèse.

**Sophia**
> C'est entendu. Les éléments de ta carte de défense — les clés dans la salle de bain, la douche et ta phrase rituelle — sont préparés pour que tu puisses les saisir dans ton Plan sur la plateforme. On peut maintenant passer à la synthèse de ta semaine : malgré la fatigue et un rythme plus difficile sur la fin, l'effort a été bien présent les premiers jours. On termine avec le bilan global ?

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- visible_task: `return_from_child_flow`
- reason_code: `weekly_review_gate_order_requires_return_from_child_flow`
- blocked_effects: `weekly_review_gate_order_requires_return_from_child_flow`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: apres un retour child-flow deja effectue au T8, le reducer force encore `return_from_child_flow` au lieu de passer directement a `weekly_synthesis`.
- Source amont probable: le parent weekly ne marque pas explicitement le retour child-flow comme acknowledge avant la synthese.
- Owner runtime: `weekly_adaptive_review_v1.local_flow`.
- Meilleure correction selon guidelines: ajouter un etat local minimal `child_flow_return_acknowledged` ou equivalent, mis a jour quand `visible_task=return_from_child_flow`, puis laisser `weekly_synthesis` passer au tour suivant.
- Pourquoi ce n'est pas un patch local: il faut corriger la transition d'etat du reducer, pas forcer une phrase de synthese dans le prompt.

### Tour 10

**Verdict du tour:** green

**User**
> Oui, termine avec le bilan global et la clôture du weekly.

**Sophia**
> Cette semaine a été marquée par une fatigue persistante, ce qui explique ton sentiment de frustration malgré une légère avancée globale. Côté actions, tu as réussi à ranger ton matériel jusqu'à mercredi avant de relâcher, et le ciblage du joint réflexe est resté partiel. Le sas de décompression a été mis de côté en fin de semaine. Pour la suite, j'ai préparé les étapes d'une carte de défense (clés dans la salle de bain, douche de 5 minutes et phrase clé) pour que tu puisses les saisir dans ton Plan, section Cartes de défense. Est-ce que ce bilan te convient pour terminer ce point hebdomadaire ?

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- visible_task: `weekly_synthesis`
- reason_code: `weekly_review_local_confirm_weekly_diagnostic`
- committed_effects: `[]`
- status: `answered`

### Tour 11

**Verdict du tour:** green

**User**
> Oui, ça me convient. On peut clôturer le weekly.

**Sophia**
> Le point hebdomadaire est terminé. Les détails de ta carte de défense pour le retour du travail sont prêts pour que tu les saisisses dans ton Plan. Prends le temps de souffler pour récupérer de la fatigue. Bonne continuation dans tes avancées.

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- status: `closed`
- reason_code: `weekly_review_local_complete_flow`
- visible_task: `weekly_closure`
- durable: `status=completed`, `validation_unlock.status=available`, `closure_status=complete`
- committed_effects: `[]`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- L'ordre sain du weekly est beaucoup plus solide: experience de semaine, actions/gaps, progression objectif global, approfondissement emotionnel, solution, detour, synthese, cloture.
- Sophia ne saute plus directement vers l'objectif global au premier tour.
- Le bilan action reste strict: le rangement est conserve comme partiel, le joint reflexe reste partiel, le sas est manque/mis de cote.
- La discussion solution est plus fluide: Sophia arbitre entre plan et defense sans appliquer de plan change.
- Le retour apres child flow reprend la revision user et rappelle que la saisie se fait dans le Plan.

**Problemes**
- Tour 7: la carte de defense preparee perd la parade concrete donnee par le user. Famille: BF-INTAKE-03. Impact: le user doit corriger Sophia. Severite: yellow.
- Tour 9: repetition de transition apres retour child-flow. Famille: BF-STATE-01. Impact: un tour inutile et impression de boucle. Severite: yellow.

**Fix propose**
- Source amont: `prepare_defense_card` intake/reducer; `weekly_adaptive_review_v1` reducer parent.
- Correction recommandee: structurer les champs defense `situation` + `action_defense` + `phrase_rituelle`; ajouter un ack durable du retour child-flow avant synthese.
- Tests d'invariant attendus: defense conserve une parade concrete fournie dans le meme message; apres `return_from_child_flow`, le tour suivant peut produire `weekly_synthesis`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tous les tours weekly actifs passent par `response_owner=tool_skill`.
- Le dispatcher global normal ne reprend jamais pendant le flow actif.
- Le handoff vers `prepare_defense_card` se fait au bon moment, apres qualification solution et consentement suffisamment clair.
- Safety reste `none`, coherent avec le contenu.

**Skills / Operations / Tools**
- `weekly_adaptive_review_v1` gere correctement les gates principales et la cloture durable.
- `prepare_defense_card` fonctionne en `platform_handoff`, sans mutation chat ni commit DB.
- Aucun executor engageant n'est appele directement.

**Memory / Effets durables**
- Durable final: `status=completed`, `validation_unlock.status=available`.
- `weekly_gates`: tous `complete` en fin de run.
- `user_corrected_action_statuses`: rangement conserve en `partial`.
- `child_flow.result_details`: `created=false`, `available=false`, `no_chat_mutation=true`, `user_must_create=true`, `committed_effect_count=0`.
- `weekly_adaptive_review` ne contient pas de `plan_patch` legacy.
- Cleanup: scope QA supprime, `remaining_scope_messages=0`.

**Problemes**
- Tour 7: payload handoff defense incomplet. Famille: BF-INTAKE-03. Impact systeme: le draft platform ne porte pas toute la decision utilisateur.
- Tour 9: gate order guard reforce `return_from_child_flow` une seconde fois. Famille: BF-STATE-01. Impact systeme: transition parent/child mal acknowledgee.

**Fix propose**
- Source amont: contrats locaux `prepare_defense_card` et `weekly_adaptive_review_v1`.
- Correction recommandee: ajouter les slots concrets de defense au contrat et au reducer; introduire une marque d'acknowledgement de retour child-flow.
- Tests d'invariant attendus: run IA reel avec correction post-child-flow; test reducer qui autorise `weekly_synthesis` apres un retour child-flow deja rendu.

## Verdict Global

`yellow` — Le weekly fonctionne de bout en bout et respecte les grands invariants locaux, mais deux frictions restent a corriger avant de le considerer vraiment vert: perte de contenu concret dans le child flow defense et repetition de transition avant synthese.
