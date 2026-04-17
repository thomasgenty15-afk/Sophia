# Plan Generation V2 Audit Guide

STATUT: a jour apres introduction de `requested_pace`, `generation_feedback`, `generation_input_snapshot`, du questionnaire mesurable a 10 questions et du declenchement anticipe de `classify-plan-type-v1`

Structure standard: voir [v2-audit-strategy.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-audit-strategy.md)

## 1. Objectif

Auditer la chaine complete de creation d'un plan onboarding V2/V3, en partant soit:

- d'un user
- d'un cycle recent
- d'un `plan_id` precis

Le but n'est pas de faire un dump brut de toutes les tables du produit. Le but est de reconstruire, de facon lisible, ce qui a effectivement nourri la generation d'un plan donne.

## 2. Principe cle

Pour auditer un plan, la source de verite n'est plus seulement le `raw_intake_text`.

L'ordre de fiabilite est le suivant:

1. `user_plans_v2.generation_input_snapshot`
2. `user_plans_v2.content`
3. `user_transformations.questionnaire_schema`
4. `user_transformations.questionnaire_answers`
5. `user_transformations.handoff_payload.onboarding_v2.plan_type_classification`
6. `user_cycles.validated_structure`
7. `user_cycles.raw_intake_text`

Pourquoi:

- le `raw_intake_text` reste utile pour comprendre l'intention initiale du cycle
- mais si on est a la 2e ou 3e transformation, il n'est plus suffisant pour expliquer un plan precis
- le `generation_input_snapshot` est le meilleur point d'ancrage, car il capture l'etat exact utilise par `generate-plan-v2`
- le `questionnaire_schema` est desormais critique, car il porte `metadata.measurement_hints` qui explique la metrique principale deduite automatiquement

## 3. Ce qui est canonique aujourd'hui

### 3.1 Cycle

Table: `public.user_cycles`

Champs critiques:

- `id`
- `status`
- `raw_intake_text`
- `validated_structure`
- `duration_months`
- `birth_date_snapshot`
- `gender_snapshot`
- `requested_pace`
- `active_transformation_id`

Usage:

- contexte global du cycle
- texte initial
- structure validee du texte
- snapshots bio
- rythme demande par le user

### 3.2 Transformation

Table: `public.user_transformations`

Champs critiques:

- `id`
- `cycle_id`
- `priority_order`
- `status`
- `title`
- `internal_summary`
- `user_summary`
- `success_definition`
- `main_constraint`
- `questionnaire_schema`
- `questionnaire_answers`
- `handoff_payload`

Usage:

- cristallisation du sujet reel travaille
- questionnaire et reponses
- `questionnaire_schema.metadata.measurement_hints` = source canonique de la metrique principale deduite automatiquement
- `questionnaire_answers` contient desormais des valeurs numeriques pour la baseline et la target
- classification de type de plan dans `handoff_payload.onboarding_v2.plan_type_classification`
- priorisation dans le cycle

Questionnaire systeme attendu aujourd'hui:

1. `_system_probable_drivers`
2. `_system_metric_baseline`
3. `_system_metric_target`
4. `custom_1`
5. `custom_2`
6. `custom_3`
7. `_system_main_blocker`
8. `_system_priority_goal_subjective`
9. `_system_struggle_duration`
10. `_system_perceived_difficulty`

Lecture attendue:

- la metrique principale n'est pas choisie par le user
- elle est deduite automatiquement et decrite dans `questionnaire_schema.metadata.measurement_hints`
- le user renseigne ensuite la `valeur de depart` et la `valeur cible`
- le `critere de reussite subjectif` reste distinct de la metrique

### 3.3 Plan

Table: `public.user_plans_v2`

Champs critiques:

- `id`
- `transformation_id`
- `status`
- `version`
- `content`
- `generation_attempts`
- `last_generation_reason`
- `generation_feedback`
- `generation_input_snapshot`

Usage:

- `content`: plan genere
- `generation_feedback`: consigne issue d'une regeneration
- `generation_input_snapshot`: meilleur point d'entree pour auditer la generation d'un plan precis
- `generation_input_snapshot.structured_calibration` doit desormais permettre de reconstruire:
  - la metrique principale
  - la baseline
  - la target
  - le critere subjectif de reussite

### 3.4 Review de plan

Table: `public.user_plan_review_requests`

Champs critiques:

- `plan_id`
- `user_comment`
- `decision`
- `regeneration_feedback`
- `plan_snapshot`

Usage:

- comprendre pourquoi un plan a ete regenere
- relier le feedback user au plan regenere ensuite

## 4. Methode d'audit recommandee

### 4.1 Cas 1: auditer "le parcours recent" d'un user

Bon usage:

- debug produit
- revue d'un onboarding recent
- analyse multi-transformations d'un meme cycle

Methode:

1. partir du `user_id`
2. recuperer les 2 a 3 cycles les plus recents
3. dans chaque cycle, mettre en avant la transformation active
4. pour chaque transformation, remonter les derniers plans
5. lire en priorite `generation_input_snapshot` puis `content`

### 4.2 Cas 2: auditer "ce plan-la precisement"

Bon usage:

- user te montre un plan suspect
- tu as un `plan_id`
- tu veux remonter tout le contexte qui a conduit a ce plan

Methode:

1. partir du `plan_id`
2. retrouver la transformation cible
3. retrouver le cycle du plan
4. charger toutes les transformations du meme cycle pour comprendre la priorisation
5. charger tous les plans lies a ces transformations
6. charger la classification et la strategie de parcours
7. si `journey_strategy.mode = "two_transformations"`, verifier:
   - si la 2e transformation existe deja dans le cycle
   - sinon, lire quand meme `transformation_2_title` et `transformation_2_goal` dans la classification

### 4.3 Ce qu'il ne faut pas faire

- auditer un plan seulement a partir du `raw_intake_text`
- auditer toute la vie du user si le sujet concerne un plan precis
- ignorer les regenerations et leurs feedbacks
- ignorer la classification si le parcours a ete pense en 2 transformations
- lire `questionnaire_answers` sans lire `questionnaire_schema`
- confondre `critere de reussite subjectif` et `metrique principale`

## 5. Ordre de lecture pour analyser un bundle SQL

Quand tu colles le resultat ici, l'ordre d'analyse recommande est:

1. `focus`
2. `generation_input_snapshot`
3. `content`
4. `questionnaire_schema`
5. `questionnaire_answers`
6. `plan_type_classification`
7. `validated_structure`
8. `raw_intake_text`
9. plans precedents et reviews

Questions a se poser:

- Le plan travaille-t-il bien le bon probleme ?
- La metrique deduite automatiquement est-elle pertinente pour cette transformation ?
- La baseline et la target sont-elles coherentes avec le probleme exprime ?
- La `primary_metric` du plan reflete-t-elle bien `measurement_hints + questionnaire_answers` ?
- Le critere subjectif de reussite complete-t-il la metrique sans la contredire ?
- La classification est-elle coherente avec le questionnaire ?
- Le `pace` utilise est-il bien celui voulu ?
- Le feedback de regeneration a-t-il vraiment ete pris en compte ?
- Si le classifier a pense le parcours en 2 transformations, le plan courant couvre-t-il bien seulement la premiere tranche ?

## 5.1 Note de timing sur la classification

`classify-plan-type-v1` doit etre lu comme un enrichissement de fin d'etape 3:

- parcours authentifie: declenche juste apres validation du questionnaire
- parcours invite: declenche au premier instant possible apres auth, juste apres hydration du draft et avant la fin de l'etape profil

Consequences pour l'audit:

- si un plan ou un ecran profile semble manquer de classification, verifier d'abord s'il s'agit d'un moment transitoire
- en cas d'ecart, comparer `questionnaire_answers`, `handoff_payload.onboarding_v2.plan_type_classification` et l'horodatage `updated_at` de la transformation

## 6. Requete SQL recommandee pour un user

Cette requete produit un bundle structure, recentre sur les cycles recents du user.

Remplacer `USER_UUID_HERE` par l'UUID cible.

```sql
with params as (
  select
    'USER_UUID_HERE'::uuid as target_user_id,
    3::int as cycle_limit,
    3::int as plans_per_transformation,
    3::int as reviews_per_transformation
),
profile_data as (
  select
    p.id,
    p.birth_date,
    p.gender,
    p.onboarding_completed
  from public.profiles p
  join params pr on pr.target_user_id = p.id
),
ranked_cycles as (
  select
    c.*,
    row_number() over (
      order by
        case
          when c.status in (
            'active',
            'ready_for_plan',
            'profile_pending',
            'questionnaire_in_progress',
            'prioritized',
            'structured',
            'clarification_needed',
            'draft'
          ) then 0
          else 1
        end,
        c.updated_at desc
    ) as cycle_rank
  from public.user_cycles c
  join params pr on pr.target_user_id = c.user_id
),
selected_cycles as (
  select *
  from ranked_cycles
  where cycle_rank <= (select cycle_limit from params)
),
ranked_transformations as (
  select
    t.*,
    row_number() over (
      partition by t.cycle_id
      order by
        case when t.id = c.active_transformation_id then 0 else 1 end,
        t.priority_order asc,
        t.updated_at desc
    ) as transformation_rank_in_cycle
  from public.user_transformations t
  join selected_cycles c on c.id = t.cycle_id
),
ranked_plans as (
  select
    p.*,
    row_number() over (
      partition by p.transformation_id
      order by
        case
          when p.status = 'active' then 0
          when p.status = 'draft' then 1
          when p.status = 'generated' then 2
          when p.status = 'paused' then 3
          else 4
        end,
        p.version desc,
        p.created_at desc
    ) as plan_rank
  from public.user_plans_v2 p
  join ranked_transformations t on t.id = p.transformation_id
),
ranked_reviews as (
  select
    r.*,
    row_number() over (
      partition by r.transformation_id
      order by r.created_at desc
    ) as review_rank
  from public.user_plan_review_requests r
  join ranked_transformations t on t.id = r.transformation_id
)
select jsonb_pretty(
  jsonb_build_object(
    'extracted_at', now(),
    'target_user_id', (select target_user_id from params),
    'profile',
    coalesce(
      (
        select jsonb_build_object(
          'id', pd.id,
          'birth_date', pd.birth_date,
          'gender', pd.gender,
          'onboarding_completed', pd.onboarding_completed
        )
        from profile_data pd
      ),
      '{}'::jsonb
    ),
    'focus',
    coalesce(
      (
        with focus_cycle as (
          select *
          from selected_cycles
          order by cycle_rank asc, updated_at desc
          limit 1
        ),
        focus_transformation as (
          select t.*
          from ranked_transformations t
          join focus_cycle c on c.id = t.cycle_id
          order by
            case when t.id = c.active_transformation_id then 0 else 1 end,
            t.priority_order asc,
            t.updated_at desc
          limit 1
        ),
        focus_plan as (
          select p.*
          from ranked_plans p
          join focus_transformation t on t.id = p.transformation_id
          order by p.plan_rank asc
          limit 1
        )
        select jsonb_build_object(
          'cycle_id', (select id from focus_cycle),
          'transformation_id', (select id from focus_transformation),
          'plan_id', (select id from focus_plan),
          'analysis_priority', jsonb_build_array(
            'user_plans_v2.generation_input_snapshot',
            'user_plans_v2.content',
            'user_transformations.questionnaire_schema',
            'user_transformations.questionnaire_answers',
            'user_transformations.handoff_payload.onboarding_v2.plan_type_classification',
            'user_cycles.validated_structure',
            'user_cycles.raw_intake_text'
          )
        )
      ),
      '{}'::jsonb
    ),
    'cycles',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'cycle_rank', c.cycle_rank,
            'cycle_id', c.id,
            'status', c.status,
            'created_at', c.created_at,
            'updated_at', c.updated_at,
            'completed_at', c.completed_at,
            'archived_at', c.archived_at,
            'duration_months', c.duration_months,
            'requested_pace', c.requested_pace,
            'birth_date_snapshot', c.birth_date_snapshot,
            'gender_snapshot', c.gender_snapshot,
            'active_transformation_id', c.active_transformation_id,
            'raw_intake_text', c.raw_intake_text,
            'validated_structure', c.validated_structure,
            'transformations',
            coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'transformation_id', t.id,
                    'priority_order', t.priority_order,
                    'status', t.status,
                    'is_active_in_cycle', (t.id = c.active_transformation_id),
                    'title', t.title,
                    'internal_summary', t.internal_summary,
                    'user_summary', t.user_summary,
                    'success_definition', t.success_definition,
                    'main_constraint', t.main_constraint,
                    'questionnaire_schema', t.questionnaire_schema,
                    'questionnaire_answers', t.questionnaire_answers,
                    'onboarding_v2', t.handoff_payload -> 'onboarding_v2',
                    'created_at', t.created_at,
                    'updated_at', t.updated_at,
                    'activated_at', t.activated_at,
                    'completed_at', t.completed_at,
                    'plans',
                    coalesce(
                      (
                        select jsonb_agg(
                          jsonb_build_object(
                            'plan_id', p.id,
                            'status', p.status,
                            'version', p.version,
                            'title', p.title,
                            'generation_attempts', p.generation_attempts,
                            'last_generation_reason', p.last_generation_reason,
                            'generation_feedback', p.generation_feedback,
                            'generation_input_snapshot', p.generation_input_snapshot,
                            'content', p.content,
                            'created_at', p.created_at,
                            'updated_at', p.updated_at,
                            'activated_at', p.activated_at,
                            'completed_at', p.completed_at,
                            'archived_at', p.archived_at
                          )
                          order by p.plan_rank asc
                        )
                        from ranked_plans p
                        where p.transformation_id = t.id
                          and p.plan_rank <= (select plans_per_transformation from params)
                      ),
                      '[]'::jsonb
                    ),
                    'plan_review_requests',
                    coalesce(
                      (
                        select jsonb_agg(
                          jsonb_build_object(
                            'review_id', r.id,
                            'plan_id', r.plan_id,
                            'surface', r.surface,
                            'user_comment', r.user_comment,
                            'review_kind', r.review_kind,
                            'decision', r.decision,
                            'understanding', r.understanding,
                            'impact', r.impact,
                            'proposed_changes', r.proposed_changes,
                            'regeneration_feedback', r.regeneration_feedback,
                            'clarification_question', r.clarification_question,
                            'status', r.status,
                            'created_at', r.created_at,
                            'updated_at', r.updated_at,
                            'applied_at', r.applied_at
                          )
                          order by r.created_at desc
                        )
                        from ranked_reviews r
                        where r.transformation_id = t.id
                          and r.review_rank <= (select reviews_per_transformation from params)
                      ),
                      '[]'::jsonb
                    )
                  )
                  order by
                    case when t.id = c.active_transformation_id then 0 else 1 end,
                    t.priority_order asc
                )
                from ranked_transformations t
                where t.cycle_id = c.id
              ),
              '[]'::jsonb
            )
          )
          order by c.cycle_rank asc, c.updated_at desc
        )
        from selected_cycles c
      ),
      '[]'::jsonb
    )
  )
) as audit_bundle;
```

## 7. Comment utiliser la requete user-centric

Bon reglage par defaut:

- `cycle_limit = 3`
- `plans_per_transformation = 3`
- `reviews_per_transformation = 3`

Si le JSON devient trop gros:

- baisser `cycle_limit`
- garder `generation_input_snapshot` et `content` du plan focus
- reduire les anciens plans

## 8. Requete SQL centree sur un plan precis

Cette requete est la plus utile quand tu veux coller ici tout le contexte d'un plan specifique.

Remplacer `PLAN_UUID_HERE` par le `plan_id`.

Elle remonte:

- le plan cible
- son snapshot d'input
- sa transformation
- le schema de questionnaire et ses `measurement_hints`
- toutes les transformations du meme cycle pour comprendre la priorisation
- tous les plans du meme cycle
- les reviews associees
- la classification qui peut annoncer une 2e transformation meme si elle n'existe pas encore en base
- le texte de depart et la structure validee

```sql
with params as (
  select 'PLAN_UUID_HERE'::uuid as target_plan_id
),
target_plan as (
  select p.*
  from public.user_plans_v2 p
  join params pr on pr.target_plan_id = p.id
),
target_transformation as (
  select t.*
  from public.user_transformations t
  join target_plan p on p.transformation_id = t.id
),
target_cycle as (
  select c.*
  from public.user_cycles c
  join target_plan p on p.cycle_id = c.id
),
cycle_transformations as (
  select
    t.*,
    row_number() over (
      order by
        case when t.id = c.active_transformation_id then 0 else 1 end,
        t.priority_order asc,
        t.updated_at desc
    ) as cycle_order
  from public.user_transformations t
  cross join target_cycle c
  where t.cycle_id = c.id
),
cycle_plans as (
  select
    p.*,
    row_number() over (
      partition by p.transformation_id
      order by
        case
          when p.id = (select id from target_plan) then 0
          when p.status = 'active' then 1
          when p.status = 'draft' then 2
          when p.status = 'generated' then 3
          when p.status = 'paused' then 4
          else 5
        end,
        p.version desc,
        p.created_at desc
    ) as plan_rank
  from public.user_plans_v2 p
  join cycle_transformations t on t.id = p.transformation_id
),
cycle_reviews as (
  select
    r.*,
    row_number() over (
      partition by r.transformation_id
      order by r.created_at desc
    ) as review_rank
  from public.user_plan_review_requests r
  join cycle_transformations t on t.id = r.transformation_id
)
select jsonb_pretty(
  jsonb_build_object(
    'extracted_at', now(),
    'target_plan_id', (select id from target_plan),
    'focus',
    jsonb_build_object(
      'plan_id', (select id from target_plan),
      'transformation_id', (select id from target_transformation),
      'cycle_id', (select id from target_cycle),
      'analysis_priority', jsonb_build_array(
        'target_plan.generation_input_snapshot',
        'target_plan.content',
        'target_transformation.questionnaire_schema',
        'target_transformation.questionnaire_answers',
        'target_transformation.handoff_payload.onboarding_v2.plan_type_classification',
        'target_cycle.validated_structure',
        'target_cycle.raw_intake_text'
      )
    ),
    'target_plan',
    (
      select jsonb_build_object(
        'plan_id', p.id,
        'status', p.status,
        'version', p.version,
        'title', p.title,
        'generation_attempts', p.generation_attempts,
        'last_generation_reason', p.last_generation_reason,
        'generation_feedback', p.generation_feedback,
        'generation_input_snapshot', p.generation_input_snapshot,
        'content', p.content,
        'created_at', p.created_at,
        'updated_at', p.updated_at,
        'activated_at', p.activated_at,
        'completed_at', p.completed_at,
        'archived_at', p.archived_at
      )
      from target_plan p
    ),
    'cycle',
    (
      select jsonb_build_object(
        'cycle_id', c.id,
        'user_id', c.user_id,
        'status', c.status,
        'duration_months', c.duration_months,
        'requested_pace', c.requested_pace,
        'birth_date_snapshot', c.birth_date_snapshot,
        'gender_snapshot', c.gender_snapshot,
        'active_transformation_id', c.active_transformation_id,
        'raw_intake_text', c.raw_intake_text,
        'validated_structure', c.validated_structure,
        'created_at', c.created_at,
        'updated_at', c.updated_at,
        'completed_at', c.completed_at,
        'archived_at', c.archived_at
      )
      from target_cycle c
    ),
    'transformations_in_cycle',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'cycle_order', t.cycle_order,
            'transformation_id', t.id,
            'priority_order', t.priority_order,
            'status', t.status,
            'is_target_transformation', t.id = (select id from target_transformation),
            'is_active_in_cycle', t.id = (select active_transformation_id from target_cycle),
            'title', t.title,
            'internal_summary', t.internal_summary,
            'user_summary', t.user_summary,
            'success_definition', t.success_definition,
            'main_constraint', t.main_constraint,
            'questionnaire_schema', t.questionnaire_schema,
            'questionnaire_answers', t.questionnaire_answers,
            'onboarding_v2', t.handoff_payload -> 'onboarding_v2',
            'journey_strategy', t.handoff_payload -> 'onboarding_v2' -> 'plan_type_classification' -> 'journey_strategy',
            'created_at', t.created_at,
            'updated_at', t.updated_at,
            'activated_at', t.activated_at,
            'completed_at', t.completed_at,
            'plans',
            coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'plan_id', p.id,
                    'status', p.status,
                    'version', p.version,
                    'title', p.title,
                    'generation_attempts', p.generation_attempts,
                    'last_generation_reason', p.last_generation_reason,
                    'generation_feedback', p.generation_feedback,
                    'generation_input_snapshot', p.generation_input_snapshot,
                    'content', p.content,
                    'created_at', p.created_at,
                    'updated_at', p.updated_at,
                    'activated_at', p.activated_at,
                    'completed_at', p.completed_at,
                    'archived_at', p.archived_at
                  )
                  order by
                    case when p.id = (select id from target_plan) then 0 else 1 end,
                    p.plan_rank asc
                )
                from cycle_plans p
                where p.transformation_id = t.id
                  and p.plan_rank <= 4
              ),
              '[]'::jsonb
            ),
            'plan_review_requests',
            coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'review_id', r.id,
                    'plan_id', r.plan_id,
                    'surface', r.surface,
                    'user_comment', r.user_comment,
                    'review_kind', r.review_kind,
                    'decision', r.decision,
                    'understanding', r.understanding,
                    'impact', r.impact,
                    'proposed_changes', r.proposed_changes,
                    'regeneration_feedback', r.regeneration_feedback,
                    'clarification_question', r.clarification_question,
                    'status', r.status,
                    'created_at', r.created_at,
                    'updated_at', r.updated_at,
                    'applied_at', r.applied_at
                  )
                  order by r.created_at desc
                )
                from cycle_reviews r
                where r.transformation_id = t.id
                  and r.review_rank <= 4
              ),
              '[]'::jsonb
            )
          )
          order by t.cycle_order asc
        )
        from cycle_transformations t
      ),
      '[]'::jsonb
    )
  )
) as plan_audit_bundle;
```

## 9. Comment lire la variante `plan_id`

Lecture recommande:

1. `target_plan.generation_input_snapshot`
2. `target_plan.content`
3. `transformations_in_cycle[].questionnaire_schema`
4. `transformations_in_cycle[].questionnaire_answers`
5. `cycle.requested_pace`
6. `transformations_in_cycle[].journey_strategy`
7. `cycle.validated_structure`
8. `cycle.raw_intake_text`

Interpretation du split en 2 transformations:

- si `journey_strategy.mode = "two_transformations"` et qu'une autre transformation existe deja dans le cycle, elle apparaitra dans `transformations_in_cycle`
- si la 2e transformation n'existe pas encore, l'intention du split est quand meme visible dans:
  - `journey_strategy.transformation_1_title`
  - `journey_strategy.transformation_1_goal`
  - `journey_strategy.transformation_2_title`
  - `journey_strategy.transformation_2_goal`
  - `journey_strategy.rationale`

Autrement dit:

- la requete remonte le plan cible
- la priorisation complete du cycle
- le schema questionnaire qui permet de relire la logique de metrique
- l'analyse du texte de depart
- la classification
- l'eventuelle logique de parcours en 2 temps
- les anciens plans et regenerations lies au meme sujet

## 10. Recommandation pratique

Si tu veux me faire analyser un cas:

1. lance d'abord la requete `plan_id` si tu as un `plan_id`
2. sinon lance la requete `user`
3. colle ici le JSON brut
4. si le JSON est trop gros, garde au minimum:
   - `focus`
   - `target_plan` ou le plan focus
   - `transformations_in_cycle`
   - `cycle`

Si tu coupes le bundle, essaie de conserver au minimum:

- `questionnaire_schema.metadata.measurement_hints`
- `questionnaire_answers`
- `generation_input_snapshot.structured_calibration`
- `content.primary_metric`

## 11. Pourquoi cette methode est la bonne

Elle permet d'auditer intelligemment un plan sans tomber dans deux erreurs:

- ne lire que le texte initial, qui devient trop lointain apres plusieurs transformations
- ou a l'inverse, noyer l'analyse dans toute l'historique du user

Le bon niveau de lecture est:

- centrer l'audit sur un plan
- remonter tout ce qui a alimente sa generation
- garder le cycle comme cadre
- garder les autres transformations comme contexte de priorisation
- verifier explicitement la chaine `measurement_hints -> baseline/target -> primary_metric -> plan`
