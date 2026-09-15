-- KEEL — LE SIXIÈME OBJECTIF : `muscle_gain`.
--
-- ── CE QUE SON ABSENCE COÛTAIT, ET POURQUOI CE N'ÉTAIT PAS COSMÉTIQUE ──────
-- Le vocabulaire fermé des objectifs comptait cinq valeurs. Un élève qui veut
-- prendre de la masse n'en avait aucune :
--
--   * `performance` était la plus ressemblante, et c'est là qu'il atterrissait.
--     Mais `focusFor('performance')` met l'accent sur « fuelling around sessions
--     and recovery meals » — jamais sur le fait de manger assez sur la journée.
--     Pire, `directionIsWorking('performance')` rend `false` EXPRÈS : un élève
--     dont le poids monte, ce qui est très exactement sa victoire, recevait du
--     produit que ses mesures ne disaient rien, et ne déclenchait jamais la
--     branche « ça marche, n'alourdis pas la semaine ».
--
--   * `recomposition` ne le rattrapait pas : sa signature codée est « le tour
--     de taille descend PENDANT QUE le poids ne descend pas », c'est-à-dire un
--     poids qui tient. L'i18n coach l'affichait pourtant sous le libellé
--     « Muscle gain » : un coach qui restreignait une règle à la prise de masse
--     la restreignait en fait aux élèves à poids constant — l'instruction
--     inverse de celle qu'il croyait donner. Le libellé est corrigé dans le
--     même lot que ce jeton.
--
-- ── CINQ ENDROITS, ET LE CINQUIÈME N'EST PAS UNE CONTRAINTE ───────────────
-- Le vocabulaire est répliqué en base à cinq endroits : quatre CHECK et UN
-- CORPS DE FONCTION (`keel_doctrine_goal_scope_ok`). Ce dernier est celui qu'un
-- `grep` sur les contraintes ne trouve pas — ce dépôt a déjà payé une fois le
-- fait qu'un vocabulaire vive aussi dans `pg_proc.prosrc`. Les cinq sont
-- traités ici, dans une seule transaction : un jeton accepté par la table des
-- objectifs mais refusé par la portée d'une doctrine produirait un élève dont
-- l'objectif est inscriptible et à qui aucune conviction ne peut être adressée.
--
-- ── AUCUNE DONNÉE N'EST MIGRÉE, ET C'EST VOULU ────────────────────────────
-- On n'essaie PAS de deviner quels élèves `performance` étaient en réalité en
-- prise de masse. Le produit n'a pas de quoi le savoir, et réécrire l'objectif
-- que quelqu'un a choisi pour lui-même est exactement ce que le modèle refuse
-- (« l'élève décide »). Les élèves existants gardent leur objectif ; le sixième
-- s'offre à eux au prochain passage sur `/app/plan`.
--
-- ── CONDITION DE DÉSARMEMENT ──────────────────────────────────────────────
-- Cette migration ne fait qu'ÉLARGIR cinq vocabulaires. Toute ligne qui passait
-- avant passe après, sans exception : aucune valeur n'est retirée, aucun défaut
-- ne change, aucune ligne n'est réécrite. Elle est donc rejouable et sans effet
-- sur une base déjà à jour.

begin;

-- ===========================================================================
-- 1. L'OBJECTIF DE L'ÉLÈVE — `student_goals.goal`
--    (posé par 20260803160000_pivot_student_week_plan.sql)
-- ===========================================================================

alter table public.student_goals
  drop constraint if exists student_goals_goal_check;
alter table public.student_goals
  add constraint student_goals_goal_check check (goal in (
    'fat_loss', 'muscle_gain', 'recomposition', 'performance', 'health', 'maintenance'
  ));

-- ===========================================================================
-- 2. LA PORTÉE DES RÈGLES DU COACH — `goal_scope`
--    (posé par 20260805100000_coach_protocol_mapping.sql)
--
--    `<@` : tableau VIDE = global, et il le reste. Élargir le vocabulaire
--    n'ouvre aucune règle existante à personne de nouveau — une portée non
--    vide écrite avant aujourd'hui continue de ne viser QUE ce qu'elle nomme,
--    donc elle EXCLUT les élèves `muscle_gain`. C'est la lecture conservatrice
--    et c'est la bonne : on n'adresse pas à un élève une conviction que le
--    coach n'a pas écrite pour lui. Le coach voit ses portées et les rouvre.
-- ===========================================================================

alter table public.coach_food_rules
  drop constraint if exists coach_food_rules_goal_scope_check;
alter table public.coach_food_rules
  add constraint coach_food_rules_goal_scope_check check (goal_scope <@ array[
    'fat_loss', 'muscle_gain', 'recomposition', 'performance', 'health', 'maintenance'
  ]::text[]);

alter table public.coach_timing_rules
  drop constraint if exists coach_timing_rules_goal_scope_check;
alter table public.coach_timing_rules
  add constraint coach_timing_rules_goal_scope_check check (goal_scope <@ array[
    'fat_loss', 'muscle_gain', 'recomposition', 'performance', 'health', 'maintenance'
  ]::text[]);

-- ===========================================================================
-- 3. LA VARIANTE COMPILÉE D'UNE DOCTRINE — `coach_doctrine_compilations.goal`
--    ('default' EST une valeur : l'élève sans objectif, le coach en test, le
--    cron. Elle reste en tête de liste.)
-- ===========================================================================

alter table public.coach_doctrine_compilations
  drop constraint if exists coach_doctrine_compilations_goal_check;
alter table public.coach_doctrine_compilations
  add constraint coach_doctrine_compilations_goal_check check (goal in (
    'default',
    'fat_loss', 'muscle_gain', 'recomposition', 'performance', 'health', 'maintenance'
  ));

-- ===========================================================================
-- 4. LE VOCABULAIRE DANS UN CORPS DE FONCTION — celui qu'on ne voit pas
--
--    `keel_doctrine_goal_scope_ok` valide le `goal_scope` de chaque entrée
--    jsonb de `coach_doctrines.beliefs` / `.arbitrations`. Le corps est recopié
--    à l'identique de 20260805110000, à la liste près : le réécrire de mémoire
--    est le moyen le plus sûr de perdre au passage la tolérance documentée
--    ci-dessous (une valeur non-tableau n'est PAS du ressort de ce check).
--
--    `create or replace` conserve les contraintes qui l'appellent — elles
--    pointent la fonction, pas son corps. Rien à re-attacher.
-- ===========================================================================

create or replace function public.keel_doctrine_goal_scope_ok(entries jsonb)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select case
    -- Une valeur qui n'est pas un tableau n'est pas du ressort de CE check:
    -- le parseur applicatif la traite déjà (liste vide), et faire échouer
    -- l'écriture ici transformerait une tolérance en panne.
    when entries is null or jsonb_typeof(entries) <> 'array' then true
    else not exists (
      select 1
      from jsonb_array_elements(entries) as e
      where jsonb_typeof(e) = 'object'
        and e ? 'goal_scope'
        and (
          -- présent mais pas un tableau
          jsonb_typeof(e->'goal_scope') <> 'array'
          -- ou contenant un jeton hors vocabulaire
          or exists (
            select 1
            from jsonb_array_elements_text(e->'goal_scope') as g
            where g not in (
              'fat_loss', 'muscle_gain', 'recomposition', 'performance',
              'health', 'maintenance'
            )
          )
        )
    )
  end;
$$;

comment on function public.keel_doctrine_goal_scope_ok(jsonb) is
  'Lot doctrine-by-goal: chaque entrée de beliefs/arbitrations peut porter un '
  'goal_scope, qui doit être un tableau de goals connus. Absent = global. '
  '2026-08-05: vocabulaire élargi à muscle_gain.';

-- ===========================================================================
-- 5. LA PREUVE, DANS LA MIGRATION ELLE-MÊME
--
--    Un CHECK oublié ne se voit pas : il ne casse rien, il refuse simplement
--    le nouveau jeton sur UN chemin, et le défaut se découvre chez un élève.
--    On vérifie donc ici que les cinq écritures acceptent `muscle_gain`, et on
--    fait échouer la migration sinon. Le rollback est gratuit — on est dans la
--    transaction.
-- ===========================================================================

do $$
declare
  ok boolean;
  missing text;
begin
  -- 1-3. Les quatre CHECK, relus depuis le catalogue. On lit la DÉFINITION
  -- plutôt que de tenter un insert: un insert exigerait un coach, un élève et
  -- un protocole valides, c'est-à-dire ferait dépendre la preuve d'un jeu de
  -- données qu'une migration n'a pas à fabriquer.
  select string_agg(expected.conname, ', ')
    into missing
  from (values
    ('student_goals_goal_check'),
    ('coach_food_rules_goal_scope_check'),
    ('coach_timing_rules_goal_scope_check'),
    ('coach_doctrine_compilations_goal_check')
  ) as expected(conname)
  left join pg_constraint c
    on c.conname = expected.conname
   and c.contype = 'c'
   and pg_get_constraintdef(c.oid) like '%muscle_gain%'
  where c.conname is null;

  if missing is not null then
    raise exception 'CHECK sans muscle_gain (ou absent): %', missing;
  end if;

  -- 4. La fonction, d'abord: c'est la seule qu'aucun test de contrainte
  -- n'atteindrait par un insert.
  select public.keel_doctrine_goal_scope_ok(
    '[{"claim":"x","goal_scope":["muscle_gain"]}]'::jsonb
  ) into ok;
  if not ok then
    raise exception
      'keel_doctrine_goal_scope_ok refuse muscle_gain — le corps n''a pas été remplacé';
  end if;

  -- Et le contre-factuel: un jeton inventé doit TOUJOURS être refusé. Sans
  -- lui, une fonction qui rendrait `true` pour tout passerait le test ci-dessus
  -- en ayant désarmé la garde.
  select public.keel_doctrine_goal_scope_ok(
    '[{"claim":"x","goal_scope":["not_a_goal"]}]'::jsonb
  ) into ok;
  if ok then
    raise exception
      'keel_doctrine_goal_scope_ok accepte un jeton inconnu — la garde est désarmée';
  end if;
end;
$$;

commit;
