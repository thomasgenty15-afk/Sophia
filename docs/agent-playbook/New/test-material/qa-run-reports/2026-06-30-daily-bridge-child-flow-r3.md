# QA Run Report - daily-bridge-child-flow-20260630-r3

## 1. Contexte Du Test

- Date: 2026-06-30
- Run: `daily-bridge-child-flow-20260630-r3`
- Persona: Rose, Supabase local
- Objectif: verifier apres fix visible daily que le flow daily + bridge reste correct, sans wording `partiel/en partie/faisable`, avec transition humaine apres action manquee.
- Trajectoire: pending daily 2 plans / 4 actions -> webhook WhatsApp local -> daily -> 2 demandes explicites d'aide -> `daily_action_coaching_recommendation_v1` -> retour daily -> commit.
- Surfaces visees: pending daily, visible daily `explain_target/clarify_outcome`, child flow daily action coaching, note retour parent, `log_daily_action_review`, entries DB.
- Cadre IA reel: Supabase local, vrai webhook WhatsApp local, IA reelle, aucun `test-send-message`, aucun fallback deterministe.
- Validite QA: valide. Raw: `tests/real-personas/rose/runs/daily-weekly/daily-bridge-child-flow-20260630-r3.raw.json`. Cleanup OK.

## 2. Tours De Conversation

### Tour 0 - Ouverture daily

**Verdict du tour:** green

**User**
> N/A - ouverture proactive daily.

**Sophia**
> Je reviens sur tes deux actions du jour : 5 minutes de respiration calme et la journée sans fumer.  
> Même si ça a été imparfait, ça compte aussi.  
> Qu’est-ce qui s’est passé pour toi aujourd’hui sur ces deux points ?

**Trace courte**
- response_owner: `scheduled_checkin`
- selected_handler: `daily_action_review_v1`
- pending_confirmation: `pending`
- durable_effect: pending ouvert avec 4 targets

### Tour 1

**Verdict du tour:** green

**User**
> Oui, vas-y pour le bilan.

**Sophia**
> Je reviens sur tes deux actions du jour : 5 minutes de respiration calme et la journée sans fumer.  
> Même si ça a été imparfait, ça compte aussi.  
> Qu’est-ce qui s’est passé pour toi aujourd’hui sur ces deux points ?

**Trace courte**
- http_status: `200`
- response_owner: `scheduled_checkin`
- selected_handler: `daily_action_review_v1`
- durable_effect: entries_count=`0`

### Tour 2

**Verdict du tour:** green

**User**
> Je ne me souviens plus : « Journée sans fumer », ça devait faire quoi exactement ?

**Sophia**
> « Journée sans fumer », c’était tenir la journée sans fumer de joint, en restant attentif au moment où l’envie de craquer arrive. Est-ce que tu l’as faite aujourd’hui ?

**Trace courte**
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- wording_check: no `partiel`, no `en partie`, no `faisable`

### Tour 3

**Verdict du tour:** green

**User**
> Ok, alors pas faite : j’ai fumé après une contrariété en fin d’après-midi. Oui, ça reste à garder.

**Sophia**
> Je vois, merci de me le dire. Du coup, pour « Respiration cinq minutes », est-ce que tu l’as faite aujourd’hui ?

**Trace courte**
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- visible_transition: acknowledgement before next target
- durable_effect: state daily only, no DB commit yet

### Tour 4

**Verdict du tour:** green

**User**
> Et « Respiration cinq minutes », je ne vois plus trop ce que ça devait m’apporter. Tu peux me rappeler ?

**Sophia**
> « Respiration cinq minutes », c’est une pause de cinq minutes pour respirer calmement et laisser passer une envie sans fumer.  
> Est-ce que tu l’as faite aujourd’hui ?

**Trace courte**
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- wording_check: binary outcome

### Tour 5

**Verdict du tour:** green

**User**
> Pas faite non plus : j’oublie à chaque fois quand l’envie monte. Je n’y arrive pas, tu peux m’aider à trouver le bon levier Sophia pour réussir celle-là ?

**Sophia**
> Je partirais sur une carte de défense : ton point faible, c’est le moment où l’envie monte et où tu décroches. Ici, l’idée est de prévoir un réflexe très simple pour ce moment-là, afin de revenir vite à l’action sans te laisser embarquer.
>
> Du coup, pour « Ranger deux papiers administratifs », est-ce que tu l’as faite aujourd’hui ?

**Trace courte**
- response_owner: `daily_action_coaching_recommendation`
- selected_handler: `daily_action_review_v1`
- return_note.bridge_kind: `daily_action_coaching_to_parent`
- recommended_feature.primary: `defense_card`
- active_skill_state after turn: `null`

### Tour 6

**Verdict du tour:** green

**User**
> Pour « Ranger deux papiers administratifs », j’ai oublié l’idée. Ça servait à quoi déjà ?

**Sophia**
> Ça servait à trier deux courriers, puis à les ranger ou les jeter. Du coup, est-ce que tu l’as faite aujourd’hui ?

**Trace courte**
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- wording_check: binary outcome, no partial wording

### Tour 7

**Verdict du tour:** green

**User**
> Non, pas fait : je bloque complètement et je repousse dès que je vois les papiers. Aide-moi à trouver quoi faire pour y arriver.

**Sophia**
> Je partirais sur une carte d’attaque, technique texte magique : ici, le blocage vient surtout de la pensée qui coupe l’élan dès que tu vois les papiers, donc il faut une phrase courte pour recadrer le démarrage. Tu l’ouvres depuis l’action « Ranger deux papiers administratifs » dans le Plan.
>
> Du coup, pour « Préparer la pochette documents », est-ce que tu l’as faite aujourd’hui ?

**Trace courte**
- response_owner: `daily_action_coaching_recommendation`
- selected_handler: `daily_action_review_v1`
- return_note.bridge_kind: `daily_action_coaching_to_parent`
- recommended_feature.primary: `attack_card`
- active_skill_state after turn: `null`

### Tour 8

**Verdict du tour:** green

**User**
> Et la pochette documents, pareil, je ne sais plus ce que c’était censé régler. Tu m’expliques ?

**Sophia**
> Ça servait à regrouper tes documents utiles dans une seule pochette visible, pour les retrouver plus vite et éviter de les éparpiller. Est-ce que tu l’as faite aujourd’hui ?

**Trace courte**
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- wording_check: binary outcome

### Tour 9

**Verdict du tour:** green

**User**
> Pas faite : un imprévu familial m’a pris le créneau. Je veux la garder pour demain.

**Sophia**
> C’est noté pour les 4 actions. On clôt la revue du jour.

**Trace courte**
- response_owner: `daily_action_review`
- selected_handler: `daily_action_review_v1`
- pending_confirmation: `done`
- review_status: `complete`
- direct_effects: `log_daily_action_review x4`
- active_skill_state final: `null`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le passage apres une action manquee est plus humain: “Je vois, merci de me le dire. Du coup...”.
- Les questions sont binaires et naturelles: “Est-ce que tu l’as faite aujourd’hui ?”.
- Plus aucun `partiel`, `partiellement`, `en partie` ou `faisable`.
- Les retours depuis coaching ne cassent pas le fil daily.

**Problemes**
- Aucun probleme bloquant observe. Le mot `imparfait` apparait dans l’ouverture, mais il ne cree pas une troisieme categorie de reponse et ne reapparait pas dans les questions de collecte.

**Fix propose**
- Source amont: n/a.
- Correction recommandee: conserver les invariants visibles ajoutes.
- Tests d'invariant attendus: regression daily visible sans partial wording.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tous les tours passent par le pending WhatsApp.
- Les tours d'aide sont owned par `daily_action_coaching_recommendation`, pas par le dispatcher global.
- `selected_handler` reste `daily_action_review_v1`.
- `active_skill_state` est nettoye apres retour parent et en final.

**Skills / Operations / Tools**
- Child flow specialise observe deux fois: `daily_action_coaching_recommendation_v1`.
- Aucun `create_one_shot_reminder`.
- Aucun `normal_reply` ne capture le daily.

**Memory / Effets durables**
- Pending final: `done`.
- Review state final: `complete`.
- Entries finales:
  - `Journée sans fumer`: outcome=`missed`, reason_category=`emotional`
  - `Respiration cinq minutes`: outcome=`missed`, reason_category=`forgot`
  - `Ranger deux papiers administratifs`: outcome=`missed`, reason_category=`too_hard`
  - `Préparer la pochette documents`: outcome=`missed`, reason_category=`external`
- Cleanup final: OK.

**Problemes**
- Aucun probleme systeme observe.

**Fix propose**
- Source amont: n/a.
- Correction recommandee: garder ce run comme regression bridge + visible daily.
- Tests d'invariant attendus: rerun daily bridge apres toute modification du pending handler ou des visibles daily.

## Verdict Global

- Verdict: green
- Raison principale: le bridge reste correct et le wording visible daily est maintenant binaire, plus humain, sans wording partial.
- Follow-up prioritaire: aucun pour ce run.
