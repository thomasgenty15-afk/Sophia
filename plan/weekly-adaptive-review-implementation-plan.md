# Weekly Adaptive Review - Implementation Plan

## Objectif

Mettre en place un weekly adaptatif qui ne se contente pas de compter les actions faites/non faites, mais decide comment faire evoluer la semaine suivante sans casser la logique incrementale du niveau.

La regle centrale est :

> Les habitudes pilotent la progression hebdomadaire. Les missions et clarifications accompagnent cette trajectoire, elles ne la pilotent pas par defaut.

Le weekly doit donc repondre a trois questions :

1. Est-ce que la cible d'habitudes de la semaine est atteinte ou suffisamment tenue ?
2. Est-ce que le user ressent une difference vers l'objectif principal du niveau ?
3. Comment le user ressort de la semaine ?

Depuis la mise en place du daily action review, le weekly ne part plus d'une page blanche. Il doit d'abord exploiter les donnees structurees collectees chaque soir :

- outcome action par action ;
- raison des `partial` / `missed` ;
- action deja faite hors interface ;
- pertinence restante ;
- decision de report ;
- impossibilite de report par manque de place ;
- signaux fatigue, difficulte, oubli, contexte externe, non-pertinence.

Le weekly ne redemande pas ce qui est deja fiable dans ces donnees. Il questionne uniquement les trous restants et les arbitrages de trajectoire.

Puis il produit une proposition structurée :

- avancer a la semaine suivante ;
- repeter la semaine ;
- creer une semaine bridge plus facile ;
- escalader vers une revue du niveau.

Les supports ne sont pas pris en compte dans ce weekly adaptatif. Ils restent geres par leurs flows existants.

## Sources existantes

Le systeme contient deja les briques suivantes :

- `user_habit_week_plans` : planning hebdomadaire confirme ou auto-applique.
- `user_habit_week_occurrences` : occurrences hebdo avec statuts `planned`, `done`, `partial`, `missed`, `rescheduled`.
- `user_plan_item_entries` : logs de progression conversationnels ou dashboard.
- `weekly_progress_review_v2` : bilan factuel de fin de semaine.
- `daily_action_review_v1` dans `user_plan_item_entries.metadata` : donnees causales collectees chaque soir.
- `v2-weekly-bilan-engine.ts` : recalibrage hebdo global existant, mais trop large pour la nouvelle logique.
- `complete-level-v1` / `v2-level-completion.ts` : revue de niveau et transition vers le niveau suivant.

Le nouveau weekly doit reutiliser ces briques, pas les remplacer.

## Perimetre

### Inclus

- Analyse de la semaine terminee.
- Agregation des donnees daily action review.
- Evaluation des habitudes comme signal principal.
- Questions courtes pour clarifier les cas ambigus.
- Decision entre `advance`, `repeat_week`, `bridge_week`, `level_review`.
- Politique automatique pour missions/clarifications selon la decision hebdo.
- JSON de proposition avant application.
- Application uniquement apres confirmation du user.

### Exclus

- Modification libre de l'architecture du niveau.
- Modification de l'objectif du niveau dans le weekly.
- Gestion des supports.
- Choix des jours exacts du planning hebdo : le user valide deja son planning ensuite.
- Replan complet sans passer par une revue de niveau explicite.

## Principe Produit

Le weekly ajuste l'execution.

Le level review ajuste l'architecture du niveau.

Le replan complet ajuste la strategie.

Donc le weekly doit preserver par defaut :

- l'objectif du niveau ;
- l'ordre incrementale des semaines ;
- les dependances du niveau ;
- la semaine suivante deja generee.

Il ne peut escalader vers une revue du niveau que si un signal structurel apparait.

## Arbre De Decision

### Etape 1 - Reconstituer Les Faits

Pour la semaine terminee, Sophia collecte :

- les habitudes prevues ;
- les occurrences d'habitudes faites, partielles, ratees, reportees, sans reponse ;
- les entries issues du daily action review ;
- les missions prevues ;
- les clarifications prevues ;
- les entries conversationnelles qui prouvent qu'un item a ete fait ;
- la semaine suivante deja creee ;
- le contexte du niveau courant ;
- l'objectif principal du niveau ;
- la cible hebdomadaire des habitudes.

Sophia ignore les supports dans cette analyse.

### Etape 1b - Agreger Les Signaux Daily

Sophia construit une couche `daily_evidence` a partir des entries dont `metadata.source = daily_action_review_v1`.

Champs a lire :

- `outcome`
- `entry_kind`
- `value_text`
- `blocker_hint`
- `difficulty_level`
- `metadata.occurrence_id`
- `metadata.dimension`
- `metadata.reason_category`
- `metadata.reason_text`
- `metadata.matched_user_text`
- `metadata.still_relevant`
- `metadata.occurrence_status`
- `metadata.reschedule_decision`
- `metadata.rescheduled_to`
- `metadata.confidence`
- `metadata.outcome_source`

Cette couche sert a produire :

- le score habitudes ;
- les causes dominantes de non-execution ;
- les actions non-habitudes deja resolues ;
- les actions encore pertinentes ;
- les actions a ne surtout pas reporter parce qu'elles sont faites ou plus utiles ;
- les questions restantes a poser au user.

Regle importante :

> Une donnee daily avec confiance `medium` ou `high` doit etre consideree comme une preuve exploitable. Sophia ne la redemande pas au weekly sauf contradiction.

Exemples :

- `missed + reason_category=fatigue` : le weekly sait deja que la cause est fatigue.
- `missed + reschedule_decision=rescheduled_tomorrow` : l'action a deja ete decalee, ne pas la compter comme "disparue".
- `missed + still_relevant=false` : l'item peut etre propose en `drop` sans redemander "est-ce encore utile ?".
- `completed + outcome_source=free_text` : marquer fait si l'interface ne l'avait pas encore reflete.

### Etape 2 - Calculer Le Verdict Habitudes

Le skill produit un `habit_verdict` :

- `validated` : la cible est atteinte ou suffisamment tenue.
- `partial_validatable` : la cible n'est pas completement atteinte mais la traction est reelle.
- `failed` : la cible n'est pas atteinte.
- `no_signal` : aucune donnee fiable.

Le calcul doit tenir compte :

- du nombre de repetitions prevues ;
- du nombre de repetitions faites ;
- des repetitions partielles ;
- des reports ;
- des reponses manquantes ;
- des entries conversationnelles.
- des entries `daily_action_review_v1`.
- du statut final des occurrences apres report.

Les seuils exacts peuvent etre ajustes, mais le MVP peut commencer ainsi :

- `validated` si completion >= 80% ou si toutes les repetitions critiques sont faites.
- `partial_validatable` si completion entre 40% et 80% et le user ressent une progression.
- `failed` si completion < 40%.
- `no_signal` si le systeme n'a pas assez de retours.

Comptage propose :

- `done` / `completed` = 1 point.
- `partial` = 0.5 point.
- `missed` = 0 point.
- `rescheduled` puis `done` avant fin de semaine = 1 point.
- `rescheduled` sans completion avant fin de semaine = 0 point, mais avec signal `still_pending`.
- `not_answered` = inconnu, ne pas assimiler automatiquement a un echec tant que le weekly n'a pas demande.

Les habitudes restent le signal principal, mais le weekly doit distinguer :

- echec reel ;
- donnee manquante ;
- action reportee puis faite ;
- action reportee mais encore ouverte.

### Etape 3 - Poser Les Deux Questions Globales

Sophia doit recuperer deux signaux humains :

1. Difference ressentie vers l'objectif principal :
   - `clear_progress`
   - `slight_progress`
   - `stable`
   - `regression`
   - `unclear`

2. Etat de sortie de semaine :
   - `energized`
   - `stable`
   - `tired_but_ok`
   - `frustrated`
   - `overloaded`
   - `lost`

Ces deux questions peuvent etre posees explicitement, ou deduites si le user les donne spontanement.

Si le daily a deja montre une cause dominante claire, Sophia peut combiner les questions :

> J'ai vu que plusieurs actions ont bloque sur la fatigue. Est-ce que malgre ca tu sens une difference vers l'objectif, et tu ressors comment de la semaine ?

Si le verdict habitudes est clair et les daily reasons sont propres, le weekly ne doit pas refaire l'enquete action par action.

### Etape 4 - Decider La Strategie Hebdo

#### Cas A - Habitudes validees

Decision par defaut : `advance`.

Sophia passe a la semaine suivante.

Les missions et clarifications non faites ne bloquent pas la progression.

Politique non-habitudes :

- si l'item est deja fait hors interface : `mark_completed`;
- si l'item reste utile : `carry_over`;
- si l'item n'est plus utile : `drop`;
- si l'item est central pour la suite malgre les habitudes validees : poser une question courte avant de trancher.

Le daily peut deja fournir ces decisions :

- `completed` => `mark_completed`;
- `missed + still_relevant=true` => `carry_over`;
- `missed + still_relevant=false` => `drop`;
- `missed + reason_category=too_hard` => `split_or_replace` si l'item reste important.

Important : une mission ou clarification non faite ne doit pas forcer un repeat si les habitudes sont validees.

#### Cas B - Habitudes partiellement validables

Sophia regarde les deux signaux globaux.

Si le user ressent une progression et se sent capable :

- decision : `advance_with_caution`;
- les non-habitudes peuvent etre carry-over si utiles.

Si le user ne ressent pas de progression ou sort fatigue :

- decision : `repeat_week` ou `bridge_week` selon la cause.

Question typique :

> L'habitude a pris un peu, mais pas totalement. Tu sens qu'on peut passer a la suite, ou tu preferes consolider une semaine ?

#### Cas C - Habitudes non validees

Decision par defaut : ne pas avancer.

Sophia doit comprendre la cause :

- cause externe / semaine empechee : `repeat_week`;
- difficulte ou charge trop haute : `bridge_week`;
- action/habitude qui ne fait plus sens : `level_review`;
- objectif du niveau qui ne colle plus : `level_review`.

Avant de poser la question, Sophia regarde les causes daily :

- majorite `external` ou `forgot` avec motivation presente : plutot `repeat_week`;
- majorite `fatigue` ou `too_hard` : plutot `bridge_week`;
- `not_relevant` ou `plan_fit_signal poor` : question courte puis potentiellement `level_review`;
- beaucoup de `unclear` : demander la cause globale.

Politique non-habitudes :

- missions et clarifications non faites suivent automatiquement la decision ;
- si `repeat_week`, elles restent dans la semaine repetee ;
- si `bridge_week`, elles sont reportees dans la semaine bridge ou gardees pour la reprise selon leur utilite ;
- exceptions uniquement si le user dit que l'item est fait autrement ou plus utile.

#### Cas D - Rien N'a Ete Fait

C'est un sous-cas de `failed`, mais avec une question prioritaire :

> Est-ce que c'etait une semaine empechee, ou est-ce que le plan lui-meme etait trop dur / pas coherent ?

Ensuite :

- externe : `repeat_week`;
- trop dur : `bridge_week`;
- incoherent : `level_review`.

Si le daily a deja une cause majoritaire fiable, Sophia peut eviter la question ouverte et demander une confirmation :

> J'ai surtout vu fatigue / manque d'energie cette semaine. Tu confirmes que le bon choix est d'alleger une semaine avant de reprendre ?

#### Cas E - Habitudes Validees Mais Aucun Progres Ressenti

C'est un signal d'alerte.

Sophia ne bloque pas automatiquement la suite, mais elle doit verifier :

- est-ce que l'habitude mesure le bon progres ?
- est-ce que l'objectif du niveau reste coherent ?
- est-ce que le user a besoin d'une revue du niveau ?

Decision possible :

- `advance_with_watch`;
- `level_review` si le user confirme que le niveau ne colle plus.

## Regles Par Famille D'Items

### Habitudes

Les habitudes determinent la progression hebdo.

Actions possibles :

- garder la target ;
- repeter la meme semaine ;
- creer une semaine bridge plus facile ;
- escalader vers revue de niveau.

Le weekly ne choisit pas les jours exacts. La validation du planning s'en charge ensuite.

### Missions

Les missions ne bloquent pas la progression si les habitudes sont validees.

Actions possibles :

- `mark_completed` si deja faite ;
- `carry_over` si encore utile ;
- `drop` si plus utile ;
- `split_or_replace` seulement si la mission etait trop grosse et reste importante.

Invariant :

> Une mission deja faite ne doit jamais etre reschedulee.

### Clarifications

Les clarifications ne pilotent pas la progression hebdo.

Actions possibles :

- `mark_completed` si la clarte a ete obtenue autrement ;
- `carry_over` si encore utile ;
- `drop` si plus necessaire ;
- `escalate_level_review` si la clarification revele une incoherence structurelle.

On ne cree pas une "version plus legere" d'une clarification par defaut. Soit elle reste utile, soit elle ne l'est plus, soit elle revele un probleme de niveau.

## Skill Propose

Nom propose : `weekly_adaptive_review`.

Role :

- lire l'etat weekly ;
- lire les signaux du daily action review ;
- detecter les informations manquantes ;
- poser la meilleure question suivante ;
- savoir s'arreter ;
- produire un JSON de proposition.

Le skill ne modifie rien directement.

Il produit soit :

- une question a poser ;
- une proposition prete a confirmer ;
- une escalade vers revue de niveau.

## Contrat JSON Du Skill

```json
{
  "status": "ask_question | ready_for_confirmation | no_change | escalate_level_review",
  "habit_verdict": {
    "status": "validated | partial_validatable | failed | no_signal",
    "completion_rate": 0.0,
    "reason": "string"
  },
  "human_signals": {
    "objective_delta": "clear_progress | slight_progress | stable | regression | unclear | unknown",
    "felt_state": "energized | stable | tired_but_ok | frustrated | overloaded | lost | unknown"
  },
  "daily_evidence_summary": {
    "source": "daily_action_review_v1",
    "coverage": "complete | partial | low | none",
    "dominant_blockers": ["fatigue"],
    "rescheduled_open_count": 0,
    "not_answered_count": 0,
    "confidence": "high | medium | low"
  },
  "week_strategy": {
    "decision": "advance | advance_with_caution | advance_with_watch | repeat_week | bridge_week | level_review",
    "reason": "string",
    "preserve_level_objective": true,
    "preserve_level_architecture": true
  },
  "question": {
    "id": "string",
    "text": "string",
    "reason": "string",
    "blocks_decision": true
  },
  "item_decisions": [
    {
      "plan_item_id": "uuid",
      "family": "habit | mission | clarification",
      "current_week_status": "done | partial | missed | rescheduled | not_answered | unknown",
      "evidence_done": false,
      "daily_evidence": {
        "source": "daily_action_review_v1 | conversation | dashboard | none",
        "reason_category": "fatigue | forgot | external | too_hard | not_relevant | emotional | unclear | none | null",
        "reason_text": "string | null",
        "still_relevant": true,
        "reschedule_decision": "rescheduled_tomorrow | not_rescheduled_no_slot | not_rescheduled_not_relevant | null",
        "confidence": "high | medium | low | none"
      },
      "decision": "keep | mark_completed | carry_over | drop | repeat_with_week | bridge_with_week | split_or_replace | escalate_level_review",
      "reason": "string"
    }
  ],
  "plan_patch": {
    "requires_confirmation": true,
    "operations": [
      {
        "op": "advance_week | repeat_week | insert_bridge_week | mark_item_completed | carry_over_item | drop_item | open_level_review",
        "plan_item_id": "uuid",
        "details": {}
      }
    ]
  },
  "safety": {
    "forbidden_operations": [],
    "warnings": []
  }
}
```

## Invariants Systeme

Ces invariants doivent etre verifies cote systeme, pas seulement dans le prompt.

1. Ne jamais rescheduler une mission ou clarification deja faite.
2. Ne jamais modifier l'objectif du niveau depuis le weekly.
3. Ne jamais modifier librement la semaine suivante si la progression incrementale serait cassee.
4. Ne jamais inclure les supports dans le weekly adaptatif.
5. Si les habitudes sont validees, ne pas bloquer la progression a cause d'une mission/clarification non faite.
6. Si les habitudes ne sont pas validees, ne pas avancer par defaut.
7. Toute operation de modification du plan doit attendre confirmation user.
8. Toute incoherence structurelle doit escalader vers level review, pas bricoler la semaine suivante.
9. Ne jamais reposer au weekly une question deja resolue par une evidence daily fiable.
10. Ne jamais compter une action reportee comme disparue si son occurrence est encore `rescheduled`.
11. Si une action non-habitude a ete reportee automatiquement dans la semaine, le weekly doit regarder son statut final avant de proposer un carry-over.

## Implementation Par Etapes

### Phase 1 - Modele De Lecture Weekly

Ajouter un builder pur qui produit un `WeeklyAdaptiveReviewInput`.

Sources :

- `loadWeeklyProgressReview`
- `user_habit_week_occurrences`
- `user_plan_item_entries`
- entries `daily_action_review_v1`
- runtime du niveau courant
- semaine suivante deja generee

Sortie :

- habitudes de la semaine ;
- missions de la semaine ;
- clarifications de la semaine ;
- preuves de completion hors interface ;
- synthese des raisons daily ;
- reports daily encore ouverts ou resolus ;
- semaine suivante ;
- contexte de niveau.

Livrables :

- types TS ;
- tests unitaires sur cas simples ;
- aucune mutation DB.

### Phase 2 - Habit Verdict Engine

Creer une fonction pure :

- entree : occurrences + entries + daily_evidence + target ;
- sortie : `habit_verdict`.

Cas a tester :

- toutes habitudes faites ;
- partiel haut ;
- partiel bas ;
- aucune reponse ;
- done via conversation ;
- rescheduled puis done ;
- rescheduled sans done.
- missed avec reason fatigue ;
- missed sans raison ;
- action not_answered mais daily absent.

### Phase 3 - Weekly Decision Engine

Creer une fonction pure qui prend :

- `habit_verdict`;
- `objective_delta`;
- `felt_state`;
- cause d'echec si connue ;
- facts missions/clarifications.
- dominant blockers issus du daily.
- couverture daily.

Et produit :

- `week_strategy`;
- `item_decisions`;
- `missing_info`.

Au debut, le moteur peut etre deterministe. Le LLM/skill intervient surtout pour formuler les questions et classer les reponses user.

Regle MVP :

- daily coverage `high` + causes claires => moins de questions.
- daily coverage `low` ou `none` => weekly doit poser les questions de cause.
- contradiction entre occurrence et daily entry => question courte de reconciliation.

### Phase 4 - Skill Conversationnel

Ajouter le skill `weekly_adaptive_review`.

Responsabilites :

- lire le contexte weekly ;
- utiliser `daily_evidence_summary` pour eviter les questions inutiles ;
- utiliser le decision engine ;
- si info manquante, poser une seule question ;
- integrer la reponse du user ;
- s'arreter quand la decision est suffisante ;
- produire le JSON final.

Limite :

- 2 questions par defaut ;
- 3 questions max sauf si le user demande explicitement a creuser.

Ordre des questions :

1. D'abord les deux signaux globaux si absents : progression ressentie + etat de sortie.
2. Ensuite seulement la cause globale si les daily reasons ne suffisent pas.
3. Enfin un arbitrage de trajectoire si plusieurs decisions sont plausibles.

Le skill ne doit pas repasser item par item sauf contradiction ou item central.

### Phase 5 - Plan Patch Draft

Creer un generateur de patch, sans execution directe.

Operations possibles MVP :

- `advance_week`;
- `repeat_week`;
- `insert_bridge_week`;
- `mark_item_completed`;
- `carry_over_item`;
- `drop_item`;
- `open_level_review`.

Regles de generation depuis daily :

- `mark_item_completed` si daily ou conversation prouve completion.
- `carry_over_item` si item non-habitude non fait, utile, et non deja complete apres report.
- `drop_item` si daily indique `still_relevant=false`.
- `split_or_replace` si `reason_category=too_hard` et item encore important.
- aucune operation si l'occurrence a deja ete reportee et reste planifiee dans la semaine suivante immediate.

Chaque operation doit etre explicite et reversible avant confirmation.

### Phase 6 - Executor Apres Confirmation

Executer uniquement apres confirmation user.

L'executor applique :

- status/completion des items ;
- carry-over missions/clarifications ;
- insertion d'une semaine bridge ;
- repetition de semaine ;
- ouverture d'une revue de niveau.

L'executor doit verifier les invariants avant toute ecriture.

### Phase 7 - Integration WhatsApp / Dashboard

Le weekly peut commencer en WhatsApp avec une question courte.

Si la decision implique un patch important, Sophia renvoie vers le dashboard ou demande confirmation claire.

Le dashboard doit pouvoir afficher :

- strategie proposee ;
- raison ;
- items concernes ;
- impact sur la semaine suivante.

### Phase 8 - Observabilite

Logger :

- `habit_verdict`;
- `week_strategy`;
- question posee ;
- reponse user classee ;
- patch propose ;
- patch confirme/applique ;
- escalade level review.

Ces logs permettront d'auditer les decisions et d'ajuster les seuils.

## Tests A Prevoir

### Cas Golden

1. Habitudes reussies, mission ratee, clarification ratee :
   - decision `advance`;
   - non-habitudes en `carry_over` ou `drop`;
   - pas de repeat.

2. Habitudes ratees, missions faites :
   - decision `repeat_week` ou `bridge_week`;
   - ne pas avancer juste parce que missions faites.

3. Rien fait, cause externe :
   - question cause ;
   - decision `repeat_week`.

4. Rien fait, cause difficulte :
   - decision `bridge_week`.

5. Habitudes reussies, user ne ressent aucun progres :
   - question coherence ;
   - `advance_with_watch` ou `level_review`.

6. Mission deja faite mais non cochee :
   - `mark_completed`;
   - jamais `carry_over` ou `reschedule`.

7. Clarification non faite mais clarte obtenue autrement :
   - `mark_completed` ou `drop`.

8. Habitudes partiellement tenues, user motive :
   - `advance_with_caution`.

9. Habitudes partiellement tenues, user fatigue :
   - `repeat_week` ou `bridge_week`.

10. Action centrale impossible / objectif incoherent :
   - `escalate_level_review`.

11. Daily complet, habitudes validees, mission non faite mais encore utile :
   - aucune question action par action ;
   - decision `advance`;
   - mission en `carry_over`.

12. Daily complet, habitudes ratees avec blocker fatigue dominant :
   - question globale courte ou confirmation ;
   - decision preferee `bridge_week`.

13. Daily complet, habitudes ratees avec cause externe dominante :
   - decision preferee `repeat_week`.

14. Mission non faite puis reportee automatiquement et faite le lendemain :
   - `mark_completed`;
   - jamais `carry_over`.

15. Mission non faite, `still_relevant=false` :
   - `drop`;
   - ne pas redemander si evidence daily fiable.

16. Daily incomplet sur plusieurs actions :
   - weekly demande uniquement les trous manquants ;
   - pas de repetition de questions deja resolues.

## Questions Ouvertes

1. Quel seuil exact pour `partial_validatable` ?
2. Est-ce que `advance_with_caution` doit modifier quelque chose, ou seulement influencer le message ?
3. Comment representer techniquement une semaine bridge dans le plan V3 sans casser l'ancrage des semaines ?
4. Est-ce qu'un `carry_over_item` doit dupliquer l'item, deplacer son assignment, ou ajouter une occurrence supplementaire ?
5. Faut-il une confirmation user pour `mark_completed` quand l'evidence vient d'une conversation ambigue ?
6. Est-ce que les missions/clarifications carry-over doivent avoir une limite de report ?
7. Est-ce que `rescheduled_tomorrow` doit etre considere comme resolu si le lendemain tombe dans la semaine suivante ?
8. Quel niveau de confiance daily suffit pour appliquer `drop` sans re-questionner ?
9. Comment afficher au user les raisons daily sans rendre le weekly trop lourd ?

## Definition Of Done MVP

- Le weekly produit un verdict habitudes fiable.
- Le weekly consomme `daily_action_review_v1`.
- Les questions weekly diminuent quand le daily a deja la cause.
- Les supports sont exclus.
- Le skill pose au maximum 2 questions dans les cas standards.
- Les habitudes validees font avancer la semaine par defaut.
- Les habitudes non validees empechent l'avancee par defaut.
- Missions/clarifications suivent la strategie hebdo sauf exception explicite.
- Aucune mission/clarification deja faite n'est reschedulee.
- Les changements sont proposes en JSON et appliques seulement apres confirmation.
- Les cas structurels escaladent vers level review.
