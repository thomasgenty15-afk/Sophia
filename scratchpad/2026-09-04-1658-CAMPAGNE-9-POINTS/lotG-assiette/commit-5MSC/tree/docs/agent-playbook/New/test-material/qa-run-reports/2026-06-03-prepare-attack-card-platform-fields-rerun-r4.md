# Prepare Attack Card Platform Fields - Rerun R4

## 1. Contexte Du Test

- Date: 2026-06-03
- Run: `attack-card-fields-20260603-r4`, `attack-card-fields-20260603-r4b`, `attack-card-fields-20260603-r4c`
- Persona: trois connexions QA temporaires dediees, supprimees apres run
- Objectif: verifier les corrections `prepare_attack_card` sur le field-aware platform handoff
- Trajectoire: slot filling multi-tour, multi-lock en un tour, apply attempt non-mutant, correction multi-champ apres handoff
- Surfaces visees: dispatcher, active handoff arbitration, `prepare_attack_card`, platform field intake, renderer, EffectLedger, DB `user_attack_cards`
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback deterministe, pas de modification de code pendant les runs
- Validite QA: valide. Deux tentatives d'auth initiales ont echoue avec des cles locales obsoletes, puis le run a ete mene via la cle secret locale et JWT utilisateur dedie.

## 2. Tours De Conversation

### Run R4 - Tour 1

**Verdict du tour:** green

**User**
> Prepare-moi une carte d'attaque pour ouvrir mon carnet avant le cafe. Le piege, c'est que je me raconte que je regarderai plus tard. Ne la cree pas depuis le chat : je veux surtout savoir exactement quels champs remplir dans la plateforme.

**Sophia**
> Dans quel etat tu veux te remettre en ecrivant ce texte ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: low
- direct_effects: []
- operation: `status=ask_question`, `missing_slots=["platform_field:desired_reframe_state"]`
- pending_confirmation: null
- executed_tools: []
- durable_effect: none

**Notes**
- `negotiated_action` et `recurring_excuse` sont `locked`.
- Sophia ne redemande pas les champs deja fournis.

### Run R4 - Tour 2

**Verdict du tour:** green

**User**
> Je veux que ca me ramene a un etat direct : ouvrir le carnet sans negocier, meme si je n'ai pas encore envie.

**Sophia**
> Cible/action : ouvrir mon carnet avant le cafe
> Piege a contrer : Le piege, c'est que je me raconte que je regarderai plus tard.
>
> Technique a selectionner : Le texte magique
> ...
> Champs a remplir :
> 1. Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ?
> Reponse : ouvrir mon carnet avant le cafe
> 2. Quelles excuses ou pensees reviennent quand tu sens que tu glisses ?
> Reponse : je me raconte que je regarderai plus tard
> 3. Dans quel etat tu veux te remettre en ecrivant ce texte ?
> Reponse : ouvrir le carnet sans negocier, meme si je n'ai pas encore envie.
>
> Je ne cree pas la carte depuis le chat. Utilise ces reponses pour remplir la carte dans la plateforme.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- operation: `status=handoff_delivered`
- pending_confirmation: null
- committed_effects: []
- executed_tools: []
- durable_effect: ledger `platform_handoff.delivered`, `committed=false`, `no_chat_mutation=true`

**Notes**
- Le bug R3 principal est corrige: les champs lockes au tour 1 survivent au tour 2.
- Pas de `Brouillon de carte`, pas de modele, pas de claim de creation.

### Run R4 - Tour 3

**Verdict du tour:** green

**User**
> Ok cree-la.

**Sophia**
> Je ne cree pas la carte depuis le chat. Utilise ces reponses pour remplir la carte dans la plateforme.
>
> Destination plateforme : Ressources > Attaque > Cartes d'attaque libres
> ...
> Champs a renseigner :
> 1. Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ?
> Reponse : ouvrir mon carnet avant le cafe
> ...

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_handoff_apply_attempt`
- active_handoff_action: `handoff_apply_attempt`
- operation: `status=apply_attempt`
- blocked_effects: `create_attack_card/chat_creation_disabled_platform_handoff`
- committed_effects: []
- executed_tools: []
- durable_effect: no DB write

**Notes**
- Le warning R3-B02 est corrige sur ce run: plus de `active_handoff_turn_unclear`, pas de clarification parasite.

### Run R4b - Tour 1

**Verdict du tour:** green

**User**
> Prepare une carte d'attaque Le texte magique. Action : ouvrir mon carnet avant le cafe. Excuse : je le ferai apres le cafe. Etat voulu : revenir au premier geste sans negocier. Ne la cree pas depuis le chat.

**Sophia**
> Cible/action : ouvrir mon carnet avant le cafe
> Piege a contrer : Excuse : je le ferai apres le cafe
>
> Technique a selectionner : Le texte magique
> ...
> Champs a remplir :
> 1. Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ?
> Reponse : ouvrir mon carnet avant le cafe
> 2. Quelles excuses ou pensees reviennent quand tu sens que tu glisses ?
> Reponse : je le ferai apres le cafe
> 3. Dans quel etat tu veux te remettre en ecrivant ce texte ?
> Reponse : revenir au premier geste sans negocier
>
> Je ne cree pas la carte depuis le chat. Utilise ces reponses pour remplir la carte dans la plateforme.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- operation: `status=handoff_delivered`
- pending_confirmation: null
- committed_effects: []
- executed_tools: []
- durable_effect: ledger `platform_handoff.delivered`, `committed=false`

**Notes**
- Multi-extraction OK: les 3 champs explicites sont lockes en un seul tour.

### Run R4c - Tour 1

**Verdict du tour:** green

**User**
> Prepare une carte d'attaque Le texte magique. Action : lancer la marche de dix minutes. Excuse : je la ferai apres les mails. Etat voulu : demarrer sans debattre. Ne la cree pas depuis le chat.

**Sophia**
> Cible/action : lancer la marche de dix minutes
> ...
> Champs a remplir :
> 1. ...
> Reponse : lancer la marche de dix minutes
> 2. ...
> Reponse : je la ferai apres les mails
> 3. ...
> Reponse : demarrer sans debattre
>
> Je ne cree pas la carte depuis le chat. Utilise ces reponses pour remplir la carte dans la plateforme.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- operation: `status=handoff_delivered`
- pending_confirmation: null
- committed_effects: []
- executed_tools: []
- durable_effect: ledger `platform_handoff.delivered`, `committed=false`

### Run R4c - Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow

**User**
> En fait l'action c'est sortir mes baskets, et l'excuse c'est je le ferai apres les mails. Garde l'etat voulu.

**Sophia**
> Cible/action : lancer la marche de dix minutes
> ...
> Reponse : lancer la marche de dix minutes
> Reponse : je la ferai apres les mails
> Reponse : demarrer sans debattre
>
> Je ne cree pas la carte depuis le chat. Utilise ces reponses pour remplir la carte dans la plateforme.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_handoff_revise_handoff`
- active_handoff_action: `revise_handoff`
- operation: `status=repeat_handoff`
- pending_confirmation: null
- committed_effects: []
- executed_tools: []
- durable_effect: no DB write

**Analyse si yellow/red**
- Symptome: Sophia detecte la correction mais repete l'ancien handoff; `sortir mes baskets` n'apparait pas dans les champs rendus.
- Source amont probable: handler `revise_handoff` de `prepare_attack_card` ne relance pas le field filler ou ne merge pas les corrections dans `platform_handoff.inputs`.
- Owner runtime: `prepare_attack_card` active handoff/revision reducer.
- Meilleure correction selon les guidelines: faire passer `revise_handoff` par la meme couche field-aware que l'intake initial, puis merger les champs corriges avec preservation des champs non corriges.
- Pourquoi ce n'est pas un patch local: l'arbitrage amont est deja correct; le bug est dans la transition d'etat du skill apres handoff.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les questions sont courtes quand un seul champ manque.
- Le handoff final est nettement plus utile: destination, parcours, champs a remplir, pas de brouillon de carte.
- `Ok cree-la` repond correctement et n'entretient pas l'illusion d'une creation chat.

**Problemes**
- Run R4c Tour 2: correction explicite non appliquee. Famille: `BF-STATE-01`. Impact: l'utilisateur pense avoir corrige, mais Sophia lui redonne une version obsolete. Severite: red pour ce sous-scenario.

**Fix propose**
- Source amont: transition `revise_handoff` dans `prepare_attack_card`.
- Correction recommandee: au lieu de mapper une correction post-handoff vers `repeat_handoff`, relancer `platform_field_filler` avec le draft actif, merger les champs explicitement corriges, puis rendre un nouveau handoff.
- Tests d'invariant attendus: correction multi-champ apres handoff; correction d'un seul champ preserve les autres; "redis-moi" reste repeat sans modification; "ok cree-la" reste apply_attempt non-mutant.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Vert sur les trois runs: `prepare_attack_card` reste owner.
- `active_handoff_apply_attempt` est maintenant propre pour `Ok cree-la`.
- `active_handoff_revise_handoff` est bien detecte en R4c Tour 2, donc le dispatcher/arbitrage ne semble pas la source du bug.

**Skills / Operations / Tools**
- Le field-aware intake initial fonctionne en multi-tour et en multi-lock single-turn.
- La revision post-handoff ne consomme pas encore les corrections utilisateur.
- `pending_confirmation=null` sur les handoffs, `committed_effects=[]`, `executed_tools=[]`.

**Effets Durables**
- Verification REST apres runs: `user_attack_cards=[]` pour les trois utilisateurs QA.
- Les trois utilisateurs Auth temporaires ont ete supprimes par cleanup cible.

**Wording**
- Aucun "c'est cree", "j'ai cree", "j'ai ajoute".
- Aucun "Brouillon de carte", "Apercu du resultat attendu", "Surface UI", "Version a reprendre", "A preserver", "A eviter" dans les reponses visibles des runs R4/R4b/R4c.

## Verdict Global

Verdict global: yellow. Les corrections principales sont bonnes: field preservation multi-tour, multi-lock direct, no-mutation et apply_attempt passent. Il reste un bug important sur la revision post-handoff: une correction multi-champ est detectee mais non appliquee.
