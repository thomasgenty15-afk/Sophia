# QA Run Report - daily-two-plans-four-actions-long-missed-20260624-r1

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `daily-two-plans-four-actions-long-missed-20260624-r1`
- Persona: Rose, user `02dc9ae2-4128-412b-b0be-56712bf775a8`
- Objectif: tester un daily long avec 2 plans et 4 actions, ou rien n'est fait, mais ou le user repond progressivement: une action, puis une autre, puis seulement ensuite les actions du second plan.
- Trajectoire: pending `daily_action_review` local avec 4 targets -> `whatsapp-webhook` tour par tour -> `daily_action_review_v1` -> `log_daily_action_review` -> verification DB -> retour `normal_reply`.
- Surfaces visees: pending daily, dispatcher local daily, file obligatoire des targets restantes, visible agents daily, reducer/effects daily, `user_plan_item_entries`, statuts occurrences, retour au dispatcher global apres cloture.
- Cadre IA reel: Supabase local, vrai chemin Sophia. Pas de renderer deterministe, pas de fallback direct, pas de staging. Les messages user ont ete choisis apres lecture de la reponse precedente.
- Validite QA: valide pour le flow daily local, avec limite documentee. Pour eviter de modifier un weekly pending sans rapport, le run a utilise une fixture de pending daily creee dynamiquement. Il ne valide donc pas `process-checkins` comme generateur d'ouverture, mais valide bien `whatsapp-webhook -> daily_action_review_v1 -> reducer/effects`.
- Raw states:
  - `tests/real-personas/rose/runs/daily-weekly/daily-two-plans-four-actions-long-missed-20260624-r1.raw.json`
  - `tests/real-personas/rose/runs/daily-weekly/daily-two-plans-four-actions-long-missed-20260624-r1.state.json`
- Cleanup: effectue. Les entries QA ont ete supprimees, les deux occurrences existantes ont ete restaurees, le plan QA temporaire, le scheduled checkin et le pending QA ont ete supprimes.

Targets du run:

- Plan Rose existant: `Journée 100% sans cannabis`
- Plan Rose existant: `Organiser une soirée 'zéro vide'`
- Plan QA temporaire: `Respiration minute avant envie`
- Plan QA temporaire: `Préparer une alternative du soir`

## 2. Tours De Conversation

### Tour 0 - Ouverture daily

**Verdict du tour:** green

**User**
> N/A - ouverture proactive daily depuis le pending QA.

**Sophia**
> Je fais le point sur aujourd’hui : Journée 100% sans cannabis et Organiser une soirée 'zéro vide'.  
> Tu en es où sur ces deux-là ?

**Trace courte**
- http_status: opening fixture OK
- response_owner: pending daily
- selected_handler: `daily_action_review_v1`
- route_reason: pending `chat_capability=daily_action_review`
- safety: none
- direct_effects: none
- operation: pending daily ouvert
- pending_confirmation: pending `b67893e5-8d8b-4a59-93da-333cf75d3cac`
- memory_plan: N/A
- executed_tools: none
- durable_effect: pending contient 4 targets, ouverture configuree sur les 2 premieres

### Tour 1 - Le user repond seulement sur la premiere action

**Verdict du tour:** green

**User**
> Pour la journée sans cannabis, non : j'ai craqué dans l'après-midi. Je n'ai pas encore regardé le reste.

**Sophia**
> Pour la journée 100% sans cannabis, c’est bien manqué. Tu veux que je note aussi si ça reste pertinent pour la suite ?

**Trace courte**
- http_status: 200
- response_owner: `daily_action_review`
- selected_handler: `daily_action_review_v1`
- route_reason: pending daily actif
- safety: none
- direct_effects: none
- operation: clarification daily
- pending_confirmation: pending toujours `pending`
- memory_plan: N/A
- executed_tools: none
- durable_effect: 0 entry creee

### Tour 2 - Le user donne seulement la pertinence de la premiere action

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee

**User**
> Oui, ça reste pertinent pour demain.

**Sophia**
> Sur celle-ci, est-ce que tu l’as faite ou pas faite ?

**Trace courte**
- http_status: 200
- response_owner: `daily_action_review`
- selected_handler: `daily_action_review_v1`
- route_reason: pending daily actif
- safety: none
- direct_effects: none
- operation: clarification daily
- pending_confirmation: pending toujours `pending`
- memory_plan: N/A
- executed_tools: none
- durable_effect: 0 entry creee

**Analyse si yellow/red**
- Symptome: Sophia passe bien a l'action suivante, mais dit "celle-ci" sans nommer l'action. Le user doit deviner qu'elle parle de `Organiser une soirée 'zéro vide'`.
- Source amont probable: projection du focus visible daily apres remplissage du slot `still_relevant`.
- Owner runtime: visible daily / contexte stage targets.
- Meilleure correction selon les guidelines: injecter explicitement la target du prochain stage au visible et imposer le nom de l'action quand on change de target.
- Pourquoi ce n'est pas un patch local: le probleme vient du contrat de contexte du visible agent, pas de la phrase exacte.

### Tour 3 - Le user clarifie l'action 2 et donne la raison

**Verdict du tour:** green

**User**
> Si tu parles de la soirée zéro vide, non plus : un imprévu familial m'a pris la soirée. Ça reste pertinent aussi.

**Sophia**
> Et pour la respiration minute avant envie, tu l’as faite ou pas faite ?

**Trace courte**
- http_status: 200
- response_owner: `daily_action_review`
- selected_handler: `daily_action_review_v1`
- route_reason: pending daily actif
- safety: none
- direct_effects: none
- operation: clarification daily
- pending_confirmation: pending toujours `pending`
- memory_plan: N/A
- executed_tools: none
- durable_effect: 0 entry creee

### Tour 4 - Le user repond sur l'action 3

**Verdict du tour:** green

**User**
> La respiration minute, pas faite non plus : j'ai oublié quand l'envie est montée. Oui, c'est à garder.

**Sophia**
> Et pour préparer une alternative du soir, tu l’as faite ou pas faite ?

**Trace courte**
- http_status: 200
- response_owner: `daily_action_review`
- selected_handler: `daily_action_review_v1`
- route_reason: pending daily actif
- safety: none
- direct_effects: none
- operation: clarification daily
- pending_confirmation: pending toujours `pending`
- memory_plan: N/A
- executed_tools: none
- durable_effect: 0 entry creee

### Tour 5 - Le user repond sur l'action 4 et le daily commit

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee

**User**
> L'alternative du soir non plus, je n'avais plus d'énergie et je n'ai rien préparé. Oui, ça reste pertinent pour demain.

**Sophia**
> C’est noté pour l’alternative du soir.

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
- durable_effect:
  - 4 entries creees avec `outcome=missed`
  - `Journée 100% sans cannabis`: occurrence `missed`, mais `reason_text="ça reste pertinent pour demain"` et `reason_category=null`
  - `Organiser une soirée 'zéro vide'`: `reason_text="un imprévu familial"`, `reason_category=external`, occurrence `rescheduled`
  - `Respiration minute avant envie`: `reason_text="j'ai oublié quand l'envie est montée"`, `reason_category=forgot`, occurrence `missed`
  - `Préparer une alternative du soir`: `reason_text="je n'avais plus d'énergie"`, `reason_category=fatigue`, occurrence `missed`

**Analyse si yellow/red**
- Symptome principal: la raison durable de la premiere action est fausse. Le message initial disait `j'ai craqué dans l'après-midi`, mais la DB a garde `ça reste pertinent pour demain` comme `reason_text`.
- Source amont probable: merge des slots daily sur plusieurs tours; la reponse de pertinence a ecrase ou pollue le slot `reason_text`.
- Owner runtime: reducer/state merge `daily_action_review_v1`.
- Meilleure correction selon les guidelines: separer strictement les slots `reason_text` et `still_relevant`; une reponse de pertinence ne doit jamais remplacer une raison deja collectee.
- Pourquoi ce n'est pas un patch local: c'est une corruption de donnees durable, donc le fix doit etre dans le reducer/merge et couvert par tests invariants.

Second probleme du meme tour:
- Symptome: la confirmation visible finale ne parle que de l'alternative du soir alors que le commit vient de cloturer les 4 actions.
- Source amont probable: contexte visible `commit_success` trop centre sur la derniere target.
- Owner runtime: visible daily commit context.
- Meilleure correction selon les guidelines: au commit final multi-target, le visible doit confirmer la cloture du daily ou le nombre d'actions traitees, pas seulement la derniere action.
- Severite: yellow UX, secondaire face a la corruption de donnee.

### Tour 6 - Verification retour global apres cloture daily

**Verdict du tour:** green

**User**
> Merci, on arrête là pour ce soir.

**Sophia**
> Bien sûr, on s’arrête là pour ce soir 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: global/normal conversation
- route_reason: aucun pending daily restant
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: no-op
- executed_tools: none
- durable_effect: aucun effet durable supplementaire

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia ne force pas le user a tout donner d'un coup: elle suit la file des actions restantes.
- Elle demande la pertinence quand une action est manquee.
- Elle arrive a aller chercher les actions du second plan apres avoir termine les deux premieres.
- La sortie du flow revient bien a la conversation normale.

**Problemes**
- Tour 2: "celle-ci" est trop ambigu au moment ou Sophia change de cible. Famille: BF-PROACTIVE-01. Impact: le user doit corriger lui-meme le referent. Severite: yellow.
- Tour 5: la confirmation finale est trop locale: elle dit seulement que l'alternative du soir est notee, alors que 4 actions viennent d'etre validees. Famille: BF-PROACTIVE-01. Impact: le user ne voit pas clairement que le daily entier est clos. Severite: yellow.

**Fix propose**
- Source amont: contexte stage targets transmis aux visibles daily.
- Correction recommandee:
  - quand le visible change de target, nommer explicitement l'action;
  - au commit final multi-target, construire un contexte de cloture qui expose le nombre d'actions traitees et la fin du daily.
- Tests d'invariant attendus:
  - apres collecte d'une target manquee, la question suivante doit nommer la target suivante;
  - commit final 4 targets doit produire une confirmation de cloture globale, meme si la derniere target vient juste d'etre remplie.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Le pending daily capture correctement tous les tours jusqu'a la cloture.
- Le flow n'a pas bascule a tort vers global, product, safety ou reminder.
- Apres `pending=done`, le message suivant repart correctement en `normal_reply`.

**Skills / Operations / Tools**
- Effet canonique observe: `log_daily_action_review`.
- Aucun `create_one_shot_reminder`, aucun outil hors scope.
- Aucun handoff coaching/product/safety dans ce run, ce qui est conforme au scenario demande.

**Memory / Effets durables**
- 4 entries `daily_action_review_v1` ont ete creees.
- Les 4 actions sont bien traitees comme non faites.
- Le statut d'occurrence est mis a jour, avec un report automatique sur l'action 2.
- Probleme bloquant: la premiere entry contient une raison fausse. La raison initiale `j'ai craqué dans l'après-midi` a ete remplacee par une reponse de pertinence `ça reste pertinent pour demain`.

**Problemes**
- Tour 5: corruption du payload durable pour la premiere action. Famille: BF-PROACTIVE-01. Impact systeme: l'historique daily perd la vraie cause d'echec et stocke une phrase de pertinence a la place. Severite: red.

**Fix propose**
- Source amont: reducer/state merge du daily sur reponses multi-tours.
- Correction recommandee:
  - verrouiller `reason_text` une fois rempli, sauf action explicite de correction/revise;
  - classifier une reponse de type "oui, ça reste pertinent" uniquement dans `still_relevant`;
  - ajouter un invariant qui interdit de remplacer une raison non vide par un texte de pertinence.
- Tests d'invariant attendus:
  - missed avec raison au tour N, puis pertinence au tour N+1: la raison reste intacte;
  - pertinence seule ne doit jamais devenir `reason_text`;
  - cas paraphrases: "oui pour demain", "à garder", "toujours important" doivent setter la pertinence sans ecraser la raison.

## Verdict Global

**red**

Le run est exploitable et le daily suit bien les 4 actions sur 2 plans jusqu'a la cloture. En revanche, le résultat durable est faux sur la premiere action: la raison de non-realisation est ecrasee par la reponse de pertinence. C'est une erreur de reducer/state merge a corriger avant de considerer le flow fiable.
