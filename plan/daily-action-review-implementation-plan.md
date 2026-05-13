# Daily Action Review - Implementation Plan

## Objectif

Remplacer le check du soir a choix multiples par un mini-dialogue conversationnel capable de comprendre une reponse naturelle du user, action par action, puis de produire une donnee structuree exploitable par le weekly adaptatif.

Le but n'est pas seulement de savoir si une action est faite. Le but est de savoir :

- ce qui a ete fait ;
- ce qui est partiel ;
- ce qui n'a pas ete fait ;
- pourquoi ;
- si l'action reste utile ;
- si elle doit etre reportee ;
- si le report est possible selon la densite de la semaine ;
- quels signaux doivent remonter au weekly.

Ce daily review devient donc la source principale de donnees causales pour le weekly.

## Probleme Actuel

Aujourd'hui, le check du soir `action_evening_review_v2` fonctionne avec trois boutons :

- `Fait`
- `Partiel`
- `Pas fait`

Ce systeme marche pour une action simple, mais il devient limite des qu'il y a :

- plusieurs actions le meme soir ;
- plusieurs plans / transformations actifs ;
- une reponse mixte ;
- une explication utile ;
- un besoin de reporter une action ;
- une action faite hors interface ;
- une action non faite pour une raison importante pour le weekly.

Exemple que les boutons gerent mal :

> J'ai fait la marche, pas fait la clarification parce que j'etais creve, et la mission je la fais demain matin.

Le nouveau systeme doit parser cette phrase et produire une decision par action.

## Principe Produit

Le daily review collecte la donnee causale.

Le weekly review decide la trajectoire de la semaine suivante.

Le level review intervient seulement si les donnees daily/weekly montrent que la structure du niveau ne tient plus.

Le daily review ne doit donc pas faire de replan. Il doit :

- enregistrer correctement ;
- reporter si la policy l'autorise ;
- poser une relance courte si une information critique manque ;
- s'arreter vite.

## Changement UX

### Avant

Sophia envoie :

> Petit check du soir: pour "X", tu en es ou ?

Avec boutons.

### Apres

Sophia envoie un message libre :

> Petit check du soir. Aujourd'hui tu avais :
> 1. Marcher 20 minutes
> 2. Clarifier ce qui bloque le soir
> 3. Preparer le sac
>
> Dis-moi simplement ce qui est fait, partiel ou pas fait, et ce qui a aide ou bloque.

Le user peut repondre naturellement :

> J'ai marche, pas fait la clarification parce que j'etais vide, et le sac je le fais demain matin.

Sophia repond :

> Ok, je note : marche faite, clarification non faite a cause de la fatigue, sac reporte a demain matin. Je garde ces signaux pour le point de fin de semaine.

Si une information critique manque :

> J'ai bien note la marche et la clarification. Pour "preparer le sac", je n'ai pas compris : fait, partiel ou pas fait ?

## Skill Propose

Nom propose : `daily_action_review`.

Role :

- recevoir la liste des actions attendues aujourd'hui ;
- comprendre une reponse libre ;
- mapper chaque fragment de reponse au bon item ;
- remplir un JSON a trous ;
- poser une relance uniquement si necessaire ;
- produire des logs structurés ;
- appliquer ou proposer le report selon la policy.

Le skill doit etre capable de gerer :

- une action ;
- plusieurs actions du meme plan ;
- plusieurs plans actifs ;
- une reponse globale ;
- une reponse partielle ;
- une reponse ambiguë ;
- un user qui ne veut pas detailler ;
- un signal safety ou emotionnel fort.

## JSON A Trous

Le skill maintient un etat par action.

Champs obligatoires :

- `occurrence_id`
- `plan_item_id`
- `title`
- `family`: `habit | mission | clarification`
- `outcome`: `done | partial | missed | unclear`
- `confidence`

Champs obligatoires si `partial` ou `missed` :

- `reason_category`
- `reason_text`
- `still_relevant` si ambigu
- `reschedule_preference` si l'action peut etre reportee

Champs optionnels utiles au weekly :

- `difficulty_signal`
- `energy_signal`
- `external_context_signal`
- `forgotten_signal`
- `not_needed_signal`
- `done_elsewhere_signal`
- `weekly_note`

Le skill ne doit pas chercher a remplir tous les champs optionnels. Il s'arrete quand les champs necessaires au weekly sont suffisants.

## Contrat JSON

```json
{
  "status": "ask_question | ready_to_apply | applied | no_action | safety_stop",
  "review_context": {
    "local_date": "YYYY-MM-DD",
    "week_start_date": "YYYY-MM-DD",
    "timezone": "Europe/Paris",
    "active_plan_count": 1
  },
  "actions": [
    {
      "occurrence_id": "uuid",
      "plan_item_id": "uuid",
      "title": "string",
      "family": "habit | mission | clarification",
      "matched_user_text": "string",
      "outcome": "done | partial | missed | unclear",
      "confidence": "low | medium | high",
      "reason_category": "helped | external | fatigue | forgot | too_hard | too_big | not_needed | unclear | emotional | other | none",
      "reason_text": "string | null",
      "still_relevant": "yes | no | unknown",
      "done_elsewhere": false,
      "weekly_signals": {
        "counts_for_habit_verdict": true,
        "difficulty_signal": "none | light | high",
        "energy_signal": "none | tired | overloaded",
        "plan_fit_signal": "good | uncertain | poor | unknown"
      },
      "reschedule": {
        "eligible": true,
        "decision": "not_needed | no_space | auto_report | user_requested_report | ask_user | forbidden",
        "target_day": "mon | tue | wed | thu | fri | sat | sun | null",
        "reason": "string"
      }
    }
  ],
  "missing_info": [
    {
      "plan_item_id": "uuid",
      "field": "outcome | reason_category | still_relevant | reschedule_preference",
      "question": "string"
    }
  ],
  "assistant_reply": "string",
  "write_plan": {
    "requires_confirmation": false,
    "operations": [
      {
        "op": "update_occurrence | insert_plan_item_entry | reschedule_occurrence | mark_no_reschedule",
        "occurrence_id": "uuid",
        "plan_item_id": "uuid",
        "payload": {}
      }
    ]
  }
}
```

## Regles De Conversation

### Regle 1 - Une reponse naturelle peut couvrir plusieurs actions

Le skill doit mapper les morceaux de phrase aux actions.

Exemple :

> J'ai fait X, pas Y parce que fatigue, Z demain.

Doit produire trois decisions distinctes.

### Regle 2 - Relancer seulement les trous critiques

Si le user donne assez d'information, Sophia confirme et s'arrete.

Si une action reste ambigue, Sophia pose une seule question ciblee.

Exemple :

> Pour "preparer le sac", tu veux que je note fait, partiel ou pas fait ?

### Regle 3 - Partiel / Pas fait doivent chercher une cause

Si le user dit seulement :

> Pas fait.

Sophia relance :

> Ok. C'etait plutot manque de temps, fatigue, oubli, trop dur, ou plus vraiment utile ?

Si le user ne veut pas detailler, Sophia note `reason_category = unclear` et s'arrete.

### Regle 4 - Fait peut rester simple

Si le user dit `fait`, Sophia loggue sans creuser.

Exception possible : si le user ajoute spontanement ce qui a aide, on le garde.

### Regle 5 - Stop explicite

Si le user dit qu'il ne veut pas en parler, Sophia arrete et loggue seulement le minimum.

### Regle 6 - Safety

Si la reponse contient un signal de crise, le skill sort du flow action review et passe la main au flow safety.

## Policy De Densite Journaliere

Le report automatique doit respecter une policy centrale, partagee par :

- planning hebdo ;
- daily action review ;
- weekly adaptive review ;
- dashboard.

### Regle MVP

Pour un user donne et une date locale donnee :

- maximum 1 action `habit` ;
- maximum 1 action non-habitude (`mission` ou `clarification`) ;
- donc maximum 2 actions planifiees sur la meme journee ;
- une habitude peut cohabiter avec une mission ;
- une habitude peut cohabiter avec une clarification ;
- une mission et une clarification ne cohabitent pas par defaut ;
- habit + mission + clarification est interdit ;
- deux habitudes le meme jour sont interdites ;
- deux missions le meme jour sont interdites ;
- deux clarifications le meme jour sont interdites.

Cette regle doit s'appliquer tous plans actifs confondus, pas seulement dans un plan. Si le user active un second plan, la capacite de la journee est partagee.

### Exceptions

Les exceptions doivent etre explicites et rares :

- user force manuellement depuis dashboard ;
- action marquee comme tres legere ;
- contexte produit futur.

Pour le MVP, ne pas gerer d'exception automatique.

## Policy De Report

### Entrees

La policy recoit :

- l'action ratee ;
- sa famille ;
- son jour actuel ;
- la semaine courante ;
- les occurrences deja planifiees ;
- les entries deja logguees ;
- les jours restants de la semaine ;
- la capacite journaliere selon la density policy ;
- la preference user si elle existe.

### Sorties

- `rescheduled`
- `not_rescheduled_no_space`
- `not_rescheduled_done_elsewhere`
- `not_rescheduled_not_relevant`
- `ask_user`
- `forbidden`

### Regles

1. Ne jamais reporter une action deja faite.
2. Ne jamais reporter une action non pertinente.
3. Ne reporter que dans la meme semaine pour le daily review.
4. Chercher le prochain jour disponible apres aujourd'hui.
5. Respecter la capacite journaliere tous plans actifs confondus.
6. Ne pas ecraser une occurrence deja `done` ou `partial`.
7. Si aucun jour disponible, logguer `missed` et laisser le weekly decider.
8. Pour une mission ou clarification, reporter seulement si elle reste utile.
9. Pour une habitude ratee, reporter si cela aide a atteindre la target hebdo et si une place existe.
10. Si le user demande un jour precis, accepter seulement si la policy le permet.

### Message User

Le skill doit expliquer le resultat simplement.

Si report :

> Je te le reporte a demain, il y a encore une place dans le planning.

Si pas de place :

> Je ne le reporte pas automatiquement : les prochains jours sont deja remplis. On le prendra en compte au point de fin de semaine.

Si pas pertinent :

> Je note que ce n'est plus utile, donc je ne le reporte pas.

## Changements Techniques

### Phase 1 - Remplacer Le Check Du Soir Boutons Par Un Check Conversationnel

Modifier le scheduling `action_evening_review_v2` :

- ne plus envoyer `interactive_buttons` ;
- envoyer un message texte listant les actions du jour ;
- passer `chat_capability = daily_action_review`;
- conserver dans le payload tous les targets avec occurrence/item/plan/transformation/family.

Livrable :

- le check du soir arrive comme une question ouverte ;
- le pending action reste actif jusqu'a reponse ou expiration.

### Phase 2 - Ajouter Le Skill `daily_action_review`

Le skill doit recevoir :

- message user ;
- pending action review ;
- liste des targets ;
- contexte de semaine ;
- density policy snapshot ;
- historique recent de cette action si utile.

Il produit :

- JSON a trous ;
- question suivante ou write plan ;
- reponse assistant.

### Phase 3 - Handler Des Reponses Libres

Modifier `whatsapp-webhook` / pending actions :

- detecter un pending `action_evening_review_v2`;
- envoyer la reponse user au skill ;
- ne pas se limiter aux `interactive_id`;
- permettre plusieurs tours tant que `status = ask_question`;
- terminer quand `ready_to_apply` ou `applied`.

### Phase 4 - Tables / Metadata

MVP possible sans nouvelle table :

- continuer a ecrire dans `user_plan_item_entries`;
- enrichir `metadata` avec :
  - `source = daily_action_review`;
  - `reason_category`;
  - `reason_text`;
  - `still_relevant`;
  - `reschedule_decision`;
  - `rescheduled_to`;
  - `matched_user_text`;
  - `confidence`;
  - `pending_action_id`;
  - `scheduled_checkin_id`.

Option plus propre :

- creer `user_daily_action_reviews`;
- creer `user_daily_action_review_items`;
- garder les entries comme surface de compatibilite.

Recommendation MVP :

- commencer par metadata enrichie dans `user_plan_item_entries`;
- ajouter une table dediee seulement si l'audit ou les queries weekly deviennent lourdes.

### Phase 5 - Centraliser La Density Policy

Creer une fonction pure partageable :

- entree : actions planifiees par jour ;
- sortie : capacite par jour + violations.

Elle doit etre utilisee par :

- report daily ;
- validation planning dashboard ;
- tests du weekly bridge/repeat plus tard.

### Phase 6 - Adapter `habit-week-planning-v1`

Aujourd'hui, le report automatique regarde surtout les occurrences de l'item / de la semaine.

Il faut l'adapter pour :

- verifier la densite globale de la journee ;
- tenir compte des autres plans actifs ;
- refuser un report si le jour cible est plein ;
- exposer une raison lisible au skill.

Le report ne doit plus etre une logique locale cachee. Il doit etre une policy explicite.

### Phase 7 - Integration Weekly

Le weekly adaptive review doit consommer les metadata du daily review :

- cause des missed/partial ;
- fatigue recurrente ;
- oubli recurrent ;
- trop dur ;
- pas utile ;
- fait autrement ;
- reports successifs ;
- absence de place pour reporter.

Ainsi, le weekly pose moins de questions.

Exemple :

Si mardi et jeudi les habitudes sont ratees avec `reason_category = fatigue`, dimanche Sophia n'a pas besoin de demander "pourquoi". Elle peut demander directement :

> La fatigue ressort deux fois cette semaine. Tu veux qu'on refasse la semaine telle quelle, ou qu'on fasse une semaine bridge plus legere ?

## Invariants Systeme

1. Une action deja faite n'est jamais reportee.
2. Une action `partial` n'est pas ecrasee par un report sans confirmation.
3. Le report daily reste dans la semaine courante.
4. Le report respecte la densite journaliere tous plans actifs confondus.
5. Le skill peut gerer plusieurs plans dans une seule reponse.
6. Les supports restent hors scope.
7. Le skill ne replanifie pas le niveau.
8. Le weekly reste l'endroit ou l'on decide repeat/bridge/advance.
9. Le daily peut seulement logguer, reporter dans la semaine, ou noter qu'il n'y a pas de place.
10. Tout signal structurel est stocke pour le weekly, pas applique immediatement.

## Tests A Prevoir

### Parsing Conversationnel

1. Une action faite.
2. Une action pas faite avec fatigue.
3. Une action partielle avec manque de temps.
4. Trois actions dans une phrase : une faite, une ratee, une reportee.
5. Deux plans actifs, reponse mixte.
6. Reponse ambigue qui necessite une relance.
7. User refuse de detailler.
8. Signal safety.

### Report

1. Habit ratee, lendemain libre : report.
2. Habit ratee, lendemain a deja une habit : pas de report.
3. Mission ratee, jour avec habit libre de non-habit : report.
4. Mission ratee, jour avec clarification : pas de report.
5. Clarification ratee, jour avec habit libre de non-habit : report.
6. Action deja done : jamais report.
7. Action partielle : pas de report automatique sans intention claire.
8. Plusieurs plans actifs saturent une journee.

### Weekly Consumption

1. Weekly lit `reason_category = fatigue`.
2. Weekly lit `reason_category = external`.
3. Weekly lit `not_needed`.
4. Weekly lit reports successifs.
5. Weekly reduit ses questions grace aux daily reviews.

## Migration Progressive

### Etape 1

Garder les boutons en fallback, mais ajouter le skill en mode texte pour un flag interne.

### Etape 2

Activer le check conversationnel pour un groupe test.

### Etape 3

Comparer :

- taux de reponse ;
- richesse des metadata ;
- nombre de questions weekly economisees ;
- erreurs de mapping action/reponse.

### Etape 4

Supprimer les boutons WhatsApp du check du soir si les resultats sont meilleurs.

## Definition Of Done MVP

- Le check du soir n'est plus limite aux boutons.
- Une reponse libre peut logger plusieurs actions.
- Les `partial` / `missed` recuperent une cause structuree.
- Le report automatique respecte une policy de densite explicite.
- Les reports sont expliques au user.
- Les metadata sont exploitables par le weekly adaptive review.
- Le skill sait relancer une seule question ciblee si un trou critique manque.
- Plusieurs plans actifs sont geres dans un seul check.
