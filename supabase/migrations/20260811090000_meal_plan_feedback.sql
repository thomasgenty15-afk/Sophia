-- LE RETOUR DE FIN DE PLAN — la vérité terrain que le moteur n'a pas.
--
-- ── CE QUE ÇA FERME ────────────────────────────────────────────────────────
-- Le moteur de composition produit des verdicts SANS vérité terrain. Il sait
-- qu'un plan respectait son enveloppe *sur le papier*; il ignore si la
-- personne a pu le cuisiner, si les portions étaient justes, ou si elle a
-- lâché le mercredi. C'est le seul angle mort du moteur, et aucune autre
-- entrée du produit ne le comble.
--
-- ── LE PRÉCÉDENT QUI GOUVERNE CETTE TABLE ──────────────────────────────────
-- Le point du dimanche (`weekly_reviews.biofeedback`, six axes) a été
-- supprimé: il collectait pour un lecteur qui n'a jamais existé
-- (`coach_synthesis_io.ts` ne l'a jamais lu, `git log -S`: zéro commit).
--
-- Chaque colonne ci-dessous a donc SON LECTEUR NOMMÉ, et il est écrit dans le
-- commentaire de la colonne. Une colonne dont on ne peut pas écrire le lecteur
-- n'entre pas dans cette table.
--
-- ── ON ÉVALUE LE PLAN, JAMAIS LA PERSONNE ──────────────────────────────────
-- Aucune colonne ne porte ce qui a été MANGÉ, ni ce qui a été FAIT en
-- activité, ni un score, ni une adhérence. « Comment ça s'est passé » est à un
-- pas de « as-tu tenu », et ce produit a supprimé les scores exprès.
--
-- ── RÉ-APPLICABLE ──────────────────────────────────────────────────────────
-- `db reset` est interdit sur ce dépôt: tout ici doit repasser sur une base
-- qui a déjà vécu.

begin;

create table if not exists public.meal_plan_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid not null
    references public.student_generated_meals(id) on delete cascade,

  cooked text check (cooked in ('yes', 'partly', 'no')),
  portions text check (portions in ('too_much', 'right', 'not_enough')),
  never_again jsonb not null default '[]'::jsonb,
  axis_question text,
  axis_answer text,

  -- UN REFUS EST UNE RÉPONSE, ET IL SE STOCKE.
  -- Sans cette colonne, l'élève qui ferme le questionnaire se le voit
  -- reproposer à chaque ouverture de l'app: on transformerait un « non merci »
  -- en harcèlement. C'est la colonne la moins spectaculaire de la table et
  -- celle dont l'absence se paierait le plus vite.
  dismissed_at timestamptz,

  content_locale text not null,
  created_at timestamptz not null default now(),

  -- UNE SEULE FOIS PAR FENÊTRE. En base, pas dans un `if` applicatif: deux
  -- surfaces proposent ce questionnaire (ouverture de l'app, avant la
  -- génération suivante) et deux écrivains pour une même intention est le
  -- défaut n°1 de ce dépôt.
  unique (meal_id)
);

comment on table public.meal_plan_feedback is
  'Retour de fin de fenêtre sur UN PLAN. On évalue le plan, jamais la '
  'personne: aucune colonne ne porte ce qui a été mangé, ni un score, ni une '
  'adhérence. Chaque colonne a son lecteur nommé — voir les commentaires.';

comment on column public.meal_plan_feedback.cooked is
  'LECTEUR: student_goals.practical_constraints.cooking_time_min et '
  'recipe_difficulty. « no »/« partly » veut dire qu''ils étaient trop '
  'optimistes; la génération suivante allège.';
comment on column public.meal_plan_feedback.portions is
  'LECTEUR: le ré-ancrage de l''enveloppe de composition. C''est LA vérité '
  'terrain que le moteur n''a pas — il sait ce qu''il a composé, pas ce qui a '
  'suffi. NULL sous restriction_flag: la question n''est alors jamais posée.';
comment on column public.meal_plan_feedback.never_again is
  'LECTEUR: practical_constraints.food_preferences, via '
  'reconcileFoodPreferencesFor (pipeline existant). Tableau de titres de '
  'plats. Le jeton « none » n''y entre JAMAIS: ce n''est pas un plat, et il '
  'créerait un aliment refusé fantôme que le générateur éviterait à vie.';
comment on column public.meal_plan_feedback.axis_question is
  'Le jeton de la 4e question, qui suit l''axe gouvernant la dynamique '
  '(hunger_between_meals, could_finish, enough_variety, '
  'energy_around_sessions). Stocké AVEC la réponse parce que « no » est '
  'ambigu sans elle: « pas eu faim » ou « pas fini ».';
comment on column public.meal_plan_feedback.axis_answer is
  'LECTEUR: l''accent de la génération suivante. Jamais un chiffre.';
comment on column public.meal_plan_feedback.dismissed_at is
  'Le refus. Non nul = l''élève a fermé le questionnaire, et on ne le lui '
  'repropose plus pour ce plan. Un refus est une réponse.';

-- La lecture « ce plan a-t-il déjà son retour » est faite à chaque ouverture.
create index if not exists meal_plan_feedback_user_idx
  on public.meal_plan_feedback (user_id, created_at desc);

-- ===========================================================================
-- PRIVILÈGES — les défauts Supabase donnent TOUT à `authenticated`
-- ===========================================================================
-- Y compris TRUNCATE, qui échappe à RLS. Le revoke n'est donc pas une
-- ceinture de plus, c'est la seule qui tienne.

revoke all on public.meal_plan_feedback from anon, authenticated;

alter table public.meal_plan_feedback enable row level security;

-- L'élève lit SON retour. L'écriture passe par service_role après
-- vérification de propriété, comme le reste du chemin de chat.
drop policy if exists meal_plan_feedback_select_own on public.meal_plan_feedback;
create policy meal_plan_feedback_select_own
  on public.meal_plan_feedback for select
  to authenticated
  using (user_id = auth.uid());

grant select on public.meal_plan_feedback to authenticated;

-- ===========================================================================
-- LA PREUVE
-- ===========================================================================

do $$
declare
  probe uuid := gen_random_uuid();
  probe_meal uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email)
  values (probe, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'probe-' || probe::text || '@keel.invalid');

  insert into public.student_generated_meals
    (user_id, scope, mode, servings, dishes, shopping_list, generated_from,
     content_locale, starts_on, duration_days)
  values (probe, 'day', 'to_shop', 1, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
          'fr-FR', current_date - 10, 7)
  returning id into probe_meal;

  -- Le cas nominal.
  insert into public.meal_plan_feedback
    (user_id, meal_id, cooked, portions, content_locale)
  values (probe, probe_meal, 'partly', 'too_much', 'fr-FR');

  -- UNE SEULE FOIS PAR FENÊTRE.
  begin
    insert into public.meal_plan_feedback
      (user_id, meal_id, cooked, content_locale)
    values (probe, probe_meal, 'yes', 'fr-FR');
    raise exception 'la ceinture est DÉSARMÉE: deux retours pour un plan';
  exception when unique_violation then null;
  end;

  -- Une valeur hors liste est refusée: elle serait inerte au lecteur.
  begin
    insert into public.meal_plan_feedback
      (user_id, meal_id, cooked, content_locale)
    values (probe, gen_random_uuid(), 'maybe', 'fr-FR');
    raise exception 'la ceinture est DÉSARMÉE: « maybe » a été accepté';
  exception when check_violation or foreign_key_violation then null;
  end;

  -- `authenticated` n'a AUCUN droit d'écriture (le revoke a mordu).
  if has_table_privilege('authenticated', 'public.meal_plan_feedback', 'INSERT') then
    raise exception 'authenticated peut écrire — le revoke n''a pas pris';
  end if;
  if has_table_privilege('anon', 'public.meal_plan_feedback', 'SELECT') then
    raise exception 'anon peut lire — le revoke n''a pas pris';
  end if;

  delete from auth.users where id = probe;
end;
$$;

commit;
