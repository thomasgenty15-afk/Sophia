-- KEEL — LA CIBLE DE L'ÉLÈVE, ET SEULEMENT QUAND ELLE A UN SENS.
--
-- ── POURQUOI DEUX COLONNES ET PAS UNE ─────────────────────────────────────
-- Un `target_weight_kg` unique servi aux six dynamiques serait faux pour la
-- moitié d'entre elles :
--
--   fat_loss / muscle_gain · un poids à atteindre. La colonne poids.
--   maintenance            · un poids de RÉFÉRENCE, centre d'une bande ±2 kg.
--                            Même colonne, lecture différente: on n'y va pas,
--                            on y reste.
--   recomposition          · la signature de cet objectif est « le poids ne
--                            bouge pas ». Lui proposer un poids CIBLE serait
--                            lui donner une cible contre sa propre direction.
--                            C'est le tour de taille qui porte, donc l'autre
--                            colonne.
--   performance / health   · aucune cible. `directionIsWorking` rend `false`
--                            pour performance parce qu'aucune tendance de
--                            poids ne dit qu'une performance progresse, et le
--                            poids n'est pas le sujet de health.
--
-- ── CE QUE LE PRODUIT S'INTERDIT TOUJOURS ─────────────────────────────────
-- Une cible SAISIE PAR L'ÉLÈVE est une déclaration sur son propre corps, du
-- même ordre que le poids qu'il entre au point du dimanche — §3.3 du chantier
-- PLAN-INPUTS l'autorise explicitement. Ce qui reste interdit, et qu'aucune de
-- ces colonnes ne permet, c'est de DÉRIVER quoi que ce soit: pas de besoin
-- énergétique, pas de poids « idéal » calculé, pas d'IMC. On rend ce que
-- l'élève a déclaré; on ne recatégorise pas sa déclaration en verdict.
--
-- ── LA CEINTURE, ET SA CONDITION DE DÉSARMEMENT ───────────────────────────
-- Les deux CHECK ci-dessous refusent une cible sur une dynamique qui n'en a
-- pas. Ils MORDENT sur un bug d'écriture (le client oublie de vider la cible
-- quand l'élève change de direction), et ils ne mordent JAMAIS sur un usage
-- normal, parce que l'écran envoie `null` dès que `indicatorFor(goal).target`
-- ne correspond pas. Le désarmement est donc: cible nulle => tout objectif
-- passe, ce qui est le cas de 100 % des lignes existantes.
--
-- ⚠️ Un septième objectif devra décider s'il a une cible, ICI ET dans
-- `indicatorFor` (frontend/src/keel/api/bodyMeasures.ts). Les deux listes sont
-- volontairement explicites plutôt que dérivées: en SQL il n'y a rien à
-- dériver, et une liste muette serait pire qu'une liste à tenir.

begin;

alter table public.student_goals
  add column if not exists target_weight_kg numeric,
  add column if not exists target_waist_cm numeric;

comment on column public.student_goals.target_weight_kg is
  'Cible DÉCLARÉE par l''élève. fat_loss/muscle_gain: à atteindre. '
  'maintenance: référence, centre d''une bande. Jamais dérivée, jamais calculée.';
comment on column public.student_goals.target_waist_cm is
  'Cible de tour de taille, DÉCLARÉE. Recomposition uniquement: c''est la '
  'mesure qui porte cet objectif, le poids y est constant par définition.';

-- Bornes de plausibilité, alignées sur le formulaire du dimanche
-- (`weekly_flow.ts`, `weeklyCheckIn.ts`). Larges à dessein: il ne s'agit pas de
-- juger un corps mais d'attraper une faute de frappe.
alter table public.student_goals
  drop constraint if exists student_goals_target_weight_range_check;
alter table public.student_goals
  add constraint student_goals_target_weight_range_check
  check (target_weight_kg is null or (target_weight_kg >= 25 and target_weight_kg <= 400));

alter table public.student_goals
  drop constraint if exists student_goals_target_waist_range_check;
alter table public.student_goals
  add constraint student_goals_target_waist_range_check
  check (target_waist_cm is null or (target_waist_cm >= 30 and target_waist_cm <= 250));

-- La cible n'existe que pour la dynamique qui la porte.
alter table public.student_goals
  drop constraint if exists student_goals_target_weight_goal_check;
alter table public.student_goals
  add constraint student_goals_target_weight_goal_check
  check (
    target_weight_kg is null
    or goal in ('fat_loss', 'muscle_gain', 'maintenance')
  );

alter table public.student_goals
  drop constraint if exists student_goals_target_waist_goal_check;
alter table public.student_goals
  add constraint student_goals_target_waist_goal_check
  check (target_waist_cm is null or goal = 'recomposition');

-- ===========================================================================
-- LA PREUVE, DANS LA MIGRATION
--
-- Une ceinture posée et jamais éprouvée est une ceinture qu'on croit armée.
-- On vérifie les deux sens sur une ligne jetable, dans la transaction.
-- ===========================================================================

do $$
declare
  probe uuid := gen_random_uuid();
  bit boolean;
begin
  -- Un utilisateur jetable: `student_goals.user_id` référence `auth.users`.
  insert into auth.users (id, instance_id, aud, role, email)
  values (probe, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'probe-' || probe::text || '@keel.invalid');

  -- Le cas normal: fat_loss porte une cible de poids.
  insert into public.student_goals (user_id, goal, content_locale, target_weight_kg)
  values (probe, 'fat_loss', 'en-GB', 72);

  -- La ceinture mord: health ne porte pas de cible de poids.
  begin
    update public.student_goals set goal = 'health' where user_id = probe;
    raise exception 'la ceinture est DÉSARMÉE: health a accepté une cible de poids';
  exception
    when check_violation then null;  -- attendu
  end;

  -- Et sa condition de désarmement: cible vidée, le changement passe.
  update public.student_goals
     set goal = 'health', target_weight_kg = null
   where user_id = probe;
  select goal = 'health' into bit from public.student_goals where user_id = probe;
  if not bit then
    raise exception 'changement de dynamique bloqué alors que la cible est vide';
  end if;

  -- La cible de taille n'appartient qu'à la recomposition.
  begin
    update public.student_goals
       set goal = 'fat_loss', target_waist_cm = 88
     where user_id = probe;
    raise exception 'la ceinture est DÉSARMÉE: fat_loss a accepté une cible de taille';
  exception
    when check_violation then null;  -- attendu
  end;

  delete from auth.users where id = probe;
end;
$$;

commit;
