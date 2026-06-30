# QA Run Report - daily-two-plans-four-actions-20260624-r1

## 1. Contexte Du Test

- Date: 2026-06-24
- Runs:
  - `daily-two-plans-four-actions-success-20260624-r1`
  - `daily-two-plans-four-actions-missed-20260624-r1`
- Persona: Rose, user `02dc9ae2-4128-412b-b0be-56712bf775a8`
- Objectif: tester `daily_action_review_v1` avec 4 actions reparties sur 2 plans differents: un run ou tout est fait, puis un run ou rien n'est fait.
- Trajectoire: 2 actions du plan actif Rose + 2 actions d'un plan QA temporaire -> `scheduled_checkins.action_evening_review_v2` -> `process-checkins` -> pending `daily_action_review` -> `whatsapp-webhook` local -> verification DB -> cleanup.
- Surfaces visees: `process-checkins`, `whatsapp_pending_actions`, `daily_action_review_v1`, visible daily, reducer/effects daily, `user_plan_item_entries`, statuts occurrences, retour `normal_reply`.
- Cadre IA reel: Supabase local, vrai chemin Sophia. Pas de renderer deterministe, pas de fallback direct, pas de staging. Les tours daily passent par `whatsapp-webhook`; le post-daily du second run passe par `/functions/v1/test-send-message` avec `force_full_ai=true`.
- Validite QA: valide, avec incident documente. Rose n'avait qu'un plan actif, donc un plan QA temporaire a ete cree puis supprime pour rendre possible le cas 2 plans x 2 actions.
- Raw states:
  - `tests/real-personas/rose/runs/daily-weekly/daily-two-plans-four-actions-success-20260624-r1.raw.json`
  - `tests/real-personas/rose/runs/daily-weekly/daily-two-plans-four-actions-missed-20260624-r1.raw.json`

Note de preparation: le second run a ete retarde par le trigger local `scheduled_checkins_enforce_min_gap_1h`, qui a repousse le checkin QA a `14:16:01Z`. Le test a attendu l'heure due et a relance `process-checkins`, au lieu de creer un pending a la main.

## 2. Tours De Conversation

### Run A - Tout s'est bien passe

### Tour A0 - Ouverture daily

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee

**User**
> N/A - ouverture proactive `process-checkins`.

**Sophia**
> Je fais le point avec toi sur aujourd’hui : journée 100% sans cannabis et soirée “zéro vide”.  
> Tu me confirmes ce que tu gardes comme bilan final pour ces deux actions ?

**Trace courte**
- http_status: `process-checkins` OK
- response_owner: scheduled daily pending
- selected_handler: `daily_action_review_v1`
- route_reason: pending `chat_capability=daily_action_review`
- safety: none
- direct_effects: none
- operation: scheduled checkin `f6317ad2-2d0e-48ed-b42f-e43694feed47`
- pending_confirmation: pending `edc54b03-bc9c-463b-b301-1b46c26b0651`
- memory_plan: N/A
- executed_tools: none
- durable_effect: pending cree avec 4 targets

**Analyse si yellow/red**
- Symptome: l'ouverture visible cite seulement 2 actions alors que le pending contient 4 targets.
- Source amont probable: focus initial / ouverture proactive daily limitee a 2 actions.
- Owner runtime: `process-checkins` + `daily_action_review` opening/focus queue.
- Meilleure correction selon les guidelines: le visible peut n'ouvrir que sur 2 actions, mais il doit signaler qu'il y en a d'autres a verifier ensuite, ou le runtime doit rendre cette strategie explicite.
- Pourquoi ce n'est pas un patch local: le probleme vient du contrat d'ouverture multi-target, pas d'une phrase precise.

### Tour A1 - Les 4 actions sont faites

**Verdict du tour:** green

**User**
> Oui, tout s'est bien passé pour les quatre. La journée sans cannabis est tenue jusqu'au coucher, la soirée zéro vide était organisée, j'ai fait la respiration minute avant l'envie, et j'ai aussi préparé l'alternative du soir.

**Sophia**
> C’est noté pour les 4 : journée sans cannabis, soirée zéro vide, respiration minute avant envie, et alternative du soir.

**Trace courte**
- http_status: 200
- response_owner: `daily_action_review`
- selected_handler: `daily_action_review_v1`
- route_reason: pending daily actif
- safety: none
- direct_effects: `log_daily_action_review x4`
- operation: daily commit
- pending_confirmation: pending passe a `done`
- memory_plan: N/A
- executed_tools: none
- durable_effect: 4 entries `completed`, `reason_category=none`, 4 occurrences `done`

### Run B - Rien ne s'est bien passe

### Tour B0 - Ouverture daily

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee

**User**
> N/A - ouverture proactive `process-checkins`.

**Sophia**
> Je fais le point sur aujourd’hui : journée 100% sans cannabis et soirée “zéro vide”.  
> Tu en es où sur ces deux-là là, au final ?

**Trace courte**
- http_status: `process-checkins` OK apres attente min-gap
- response_owner: scheduled daily pending
- selected_handler: `daily_action_review_v1`
- route_reason: pending `chat_capability=daily_action_review`
- safety: none
- direct_effects: none
- operation: scheduled checkin `aa448dba-0150-461d-9240-258be8cdf375`
- pending_confirmation: pending `6f2ca184-5d51-4609-97fb-0245f0b2e58e`
- memory_plan: N/A
- executed_tools: none
- durable_effect: pending cree avec 4 targets

**Analyse si yellow/red**
- Symptome: meme friction que Run A, l'ouverture ne montre que 2 actions alors que le pending en contient 4.
- Source amont probable: focus initial / ouverture proactive daily.
- Owner runtime: `process-checkins` + `daily_action_review` opening/focus queue.
- Meilleure correction selon les guidelines: expliciter la file restante ou generer une ouverture qui annonce "on commence par ces deux".
- Pourquoi ce n'est pas un patch local: la decision appartient au contrat multi-target du daily.

### Tour B1 - Les 4 actions sont manquees

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-LEDGER-02 - Commit reel mal rendu; BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee

**User**
> Rien ne s'est bien passé pour les quatre. La journée sans cannabis est manquée parce que j'ai craqué dans l'après-midi; la soirée zéro vide n'a pas été organisée parce qu'un imprévu m'a pris la soirée; la respiration minute n'a pas été faite parce que j'ai oublié; et l'alternative du soir non plus parce que j'étais trop fatiguée. Les quatre restent pertinentes pour demain.

**Sophia**
> Aucune reponse visible persistée. Le webhook a retourne `502 {"message":"An invalid response was received from the upstream server"}`.

**Trace courte**
- http_status: 502
- response_owner: `daily_action_review` a traite le pending avant l'erreur HTTP
- selected_handler: `daily_action_review_v1`
- route_reason: pending daily actif
- safety: none
- direct_effects: `log_daily_action_review x4`
- operation: daily commit
- pending_confirmation: pending passe a `done`
- memory_plan: N/A
- executed_tools: none
- durable_effect:
  - 4 entries `missed`
  - `imprévu` -> `reason_category=external`
  - `oublié` -> `reason_category=forgot`
  - `trop fatiguée` -> `reason_category=fatigue`
  - `j'ai craqué dans l'après-midi` -> `reason_category=null`

**Analyse si yellow/red**
- Symptome: le user n'aurait recu aucune confirmation visible alors que les 4 effets ont ete commits.
- Source amont probable: pipeline de reponse WhatsApp apres commit daily, gestion des erreurs upstream.
- Owner runtime: `whatsapp-webhook` / final response delivery daily.
- Meilleure correction selon les guidelines: si le commit DB reussit mais l'envoi visible echoue, la trace doit exposer l'erreur et le runtime doit avoir une strategie de retry idempotente ou de pending visible non duplique.
- Pourquoi ce n'est pas un patch local: le probleme est entre commit et livraison visible, pas dans une formulation de l'agent.

Second probleme du meme tour:
- Symptome: `reason_text="j'ai craqué dans l'après-midi"` reste avec `reason_category=null`.
- Source amont probable: mapping canonique `reason_text -> reason_category` incomplet.
- Owner runtime: `daily_action_review` reducer/effects.
- Meilleure correction selon les guidelines: ajouter une categorie canonique ou un mapping robuste pour les formulations de craquage/rechute, avec tests paraphrase.
- Pourquoi ce n'est pas un patch local: la valeur durable doit etre normalisee au reducer, pas corrigee dans le visible.

### Tour B2 - Verification post-daily

**Verdict du tour:** green

**User**
> Merci, on arrête là pour ce soir.

**Sophia**
> Bien sûr. On s’arrête là pour ce soir 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: global minimal / companion
- route_reason: pending daily deja `done`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: closure/no action
- executed_tools: none
- durable_effect: aucun pending restant

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Le dispatcher daily comprend une reponse globale qui couvre les 4 actions, meme si l'ouverture visible ne cite que 2 actions.
- Le run reussite est fluide: une reponse utilisateur naturelle suffit pour committer les 4 actions.
- Le post-daily revient bien en conversation normale.

**Problemes**
- Tours A0/B0: l'ouverture parle de "ces deux actions" alors que le daily contient 4 targets. Famille: BF-PROACTIVE-01. Impact: le user peut croire qu'il ne doit repondre que sur 2 actions. Severite: yellow.
- Tour B1: apres commit des 4 actions manquees, aucune confirmation visible n'est recue a cause du 502. Famille: BF-LEDGER-02. Impact: experience cassée et risque que le user repete le message alors que les effets sont deja commits. Severite: red.

**Fix propose**
- Source amont: opening multi-target daily et pipeline de livraison visible apres commit.
- Correction recommandee:
  - faire dire a l'ouverture qu'elle commence par 2 actions quand une file de 4 existe;
  - rendre idempotente/observable la livraison visible apres commit daily quand WhatsApp retourne 502.
- Tests d'invariant attendus:
  - daily 4 targets / 2 plans, ouverture ne doit pas faire croire que seules 2 actions existent;
  - commit daily reussi + erreur delivery doit produire une trace exploitable et une strategie de retry sans double commit.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Les deux runs atteignent bien le pending `daily_action_review`.
- Le dispatcher daily remplit correctement 4 items depuis une seule reponse explicite.
- Apres cloture, le message post-daily repart en `normal_reply`.

**Skills / Operations / Tools**
- Effet canonique observe: `log_daily_action_review`.
- Aucun `create_one_shot_reminder`, aucun outil hors scope.
- Aucun handoff coaching/product/safety dans ces runs.

**Memory / Effets durables**
- Run A: 4 entries `completed`, 4 occurrences `done`.
- Run B: 4 entries `missed`, pending `done`.
- Mapping des raisons Run B:
  - `imprévu` -> `external`: OK.
  - `oublié` -> `forgot`: OK.
  - `trop fatiguée` -> `fatigue`: OK.
  - `craqué` -> `null`: KO.
- Cleanup cible effectue sur les deux runs:
  - entries supprimees;
  - pending/checkins supprimes;
  - plans QA temporaires supprimes;
  - occurrences reelles restaurees en `planned`.

**Problemes**
- Tours A0/B0: ouverture 2 actions alors que target_count=4. Famille: BF-PROACTIVE-01. Impact systeme: mauvaise projection visible de la file daily. Severite: yellow.
- Tour B1: 502 apres commit, pas de message assistant persisté. Famille: BF-LEDGER-02. Impact systeme: commit durable sans rendu visible. Severite: red.
- Tour B1: `reason_category=null` pour `j'ai craqué`. Famille: BF-PROACTIVE-01. Impact systeme: metadata daily incomplete pour une raison courante. Severite: yellow.

**Fix propose**
- Source amont:
  - `process-checkins` / opening daily multi-target;
  - `whatsapp-webhook` delivery apres commit;
  - `daily_action_review` reducer reason mapping.
- Correction recommandee:
  - rendre l'ouverture honnete sur la file restante;
  - ajouter retry/idempotence ou trace structurée pour les erreurs upstream apres commit;
  - mapper les formulations de craquage/rechute vers une categorie canonique, probablement `emotional` ou `other` selon la doctrine produit.
- Tests d'invariant attendus:
  - 4 targets sur 2 plans, user dit tout fait -> 4 completed;
  - 4 targets sur 2 plans, user dit tout manque avec raisons -> 4 missed avec categories non nulles quand le texte est classable;
  - injection d'erreur delivery apres commit -> pas de double commit et incident visible/observable.

## Verdict Global

red - Le daily sait traiter 4 actions sur 2 plans en une seule reponse, et les commits metier sont globalement bons. Mais le second run expose un commit sans confirmation visible a cause d'un 502, et une raison courante `j'ai craqué` reste sans `reason_category`.
