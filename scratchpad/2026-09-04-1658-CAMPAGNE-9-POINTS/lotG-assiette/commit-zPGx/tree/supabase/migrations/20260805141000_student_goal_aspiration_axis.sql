-- KEEL — L'OBJECTIF QUAND CE N'EST PAS UN CHIFFRE.
--
-- ── LE TROU QUE ÇA BOUCHE ─────────────────────────────────────────────────
-- `student_goals` demandait la DIRECTION (`goal`), les CONTRAINTES
-- (`situation`, `practical_constraints`) et, depuis 20260805130000, une CIBLE
-- chiffrée. Il ne demandait nulle part ce que l'élève VEUT.
--
-- Deux dynamiques sur six n'ont d'ailleurs aucune cible possible: `performance`
-- (aucune tendance de poids ne dit qu'une performance progresse) et `health`
-- (le poids n'est pas le sujet). Elles n'avaient donc AUCUN objectif — le mot
-- « objectif » y désignait une direction, pas un but.
--
--   `aspiration` · ce qu'il veut, en une phrase, POUR LES SIX. « Pouvoir jouer
--                  au foot avec mes gosses sans être mort. » Non structuré
--                  exprès: en cases, il ne reste que les buts qu'on a prévus.
--
--   `focus_axis` · l'axe qu'il veut voir monter, parmi LES SIX DÉJÀ COLLECTÉS
--                  chaque dimanche. « Mon sommeil est à 2, je veux le voir à
--                  4 » est un objectif vrai, mesurable avec ce qu'on a déjà, et
--                  qui ne prétend rien sur le plan clinique. C'est l'objectif
--                  de `health` et `performance`.
--
-- ── CE QU'ON N'A PAS FAIT, ET POURQUOI ────────────────────────────────────
-- Pas de marqueur clinique (cholestérol, HbA1c, tension), même déclaré. En
-- champ libre c'est du contexte que `aspiration` porte très bien; en colonne
-- suivie et affichée, ça ferait de KEEL un produit de santé, avec le cadre
-- réglementaire correspondant. La frontière est celle de LEGAL.md.
--
-- Pas d'échéance non plus. Une date sur un poids transforme la cible en compte
-- à rebours, et `/app/plan` écrit noir sur blanc « nothing counts down ».
--
-- ── LES DEUX ENTRÉES SONT LUES, SINON ELLES NE SERAIENT PAS ICI ───────────
-- `week_plan_generation.ts` les passe toutes les deux au modèle, et trois tests
-- le prouvent (dont la condition de désarmement: sans elles, la consigne le
-- DIT). Une colonne qu'on demande à l'élève et que rien ne lit est décorative,
-- et pire que son absence — elle fait croire que le produit en tient compte.
--
-- ── CONDITION DE DÉSARMEMENT ──────────────────────────────────────────────
-- Deux colonnes nullables, aucune valeur par défaut, aucune ligne réécrite.
-- Toute ligne existante — c'est-à-dire toutes — reste valide, et la génération
-- d'un élève qui ne les remplit jamais est identique à ce qu'elle était.

begin;

alter table public.student_goals
  add column if not exists aspiration text,
  add column if not exists focus_axis text;

comment on column public.student_goals.aspiration is
  'Ce que l''élève veut, dans ses mots. Distinct de `situation`, qui dit ce qui '
  'l''EMPÊCHE. Lu par le générateur de semaine. Jamais structuré.';
comment on column public.student_goals.focus_axis is
  'L''axe du point du dimanche que l''élève veut voir monter. L''objectif des '
  'dynamiques sans cible chiffrée (health, performance).';

-- Le vocabulaire des axes est celui de `WEEKLY_AXES` (`weekly_flow.ts`), et il
-- est fermé: un axe que l'écran proposerait sans que le formulaire du dimanche
-- le collecte serait un objectif qu'on ne peut jamais mesurer.
alter table public.student_goals
  drop constraint if exists student_goals_focus_axis_check;
alter table public.student_goals
  add constraint student_goals_focus_axis_check
  check (focus_axis is null or focus_axis in (
    'energy', 'hunger', 'sleep', 'digestion', 'mood', 'training'
  ));

-- Même ceinture que les cibles chiffrées: l'objectif n'existe que sur la
-- dynamique qui le porte. Un élève qui passe de `health` à `fat_loss` a
-- désormais une cible de poids, pas un axe — et le client vide l'un en posant
-- l'autre.
alter table public.student_goals
  drop constraint if exists student_goals_focus_axis_goal_check;
alter table public.student_goals
  add constraint student_goals_focus_axis_goal_check
  check (focus_axis is null or goal in ('health', 'performance'));

-- ===========================================================================
-- LA PREUVE — les deux sens, dans la transaction
-- ===========================================================================

do $$
declare
  probe uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email)
  values (probe, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'probe-' || probe::text || '@keel.invalid');

  -- Le cas normal.
  insert into public.student_goals (user_id, goal, content_locale, aspiration, focus_axis)
  values (probe, 'health', 'en-GB', 'play football with my kids', 'sleep');

  -- Un axe hors vocabulaire est refusé: il ne serait jamais mesurable.
  begin
    update public.student_goals set focus_axis = 'motivation' where user_id = probe;
    raise exception 'la ceinture est DÉSARMÉE: un axe inconnu a été accepté';
  exception when check_violation then null;
  end;

  -- Un axe sur une dynamique qui a déjà une cible chiffrée est refusé.
  begin
    update public.student_goals set goal = 'fat_loss' where user_id = probe;
    raise exception 'la ceinture est DÉSARMÉE: fat_loss a accepté un axe';
  exception when check_violation then null;
  end;

  -- Désarmement: l'axe vidé, le changement de dynamique passe. Et
  -- l'aspiration, elle, SURVIT — elle vaut pour les six.
  update public.student_goals
     set goal = 'fat_loss', focus_axis = null
   where user_id = probe;
  if not exists (
    select 1 from public.student_goals
    where user_id = probe and aspiration = 'play football with my kids'
  ) then
    raise exception 'l''aspiration devrait survivre à un changement de dynamique';
  end if;

  delete from auth.users where id = probe;
end;
$$;

commit;
