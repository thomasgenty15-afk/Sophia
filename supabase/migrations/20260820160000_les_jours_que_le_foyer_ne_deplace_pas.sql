-- KEEL — ③ LES JOURS DE TRADITION (2026-08-20).
--
-- Chantier: `scratchpad/2026-08-20-0200-DESIGN-habitudes-et-signaux.md`.
-- Module: `supabase/functions/_shared/keel/household_traditions.ts`.
--
-- ══════════════════════════════════════════════════════════════════════════
-- CE QUE ÇA FERME
-- ══════════════════════════════════════════════════════════════════════════
--
-- « Le dimanche c'est rôti », « vendredi poisson ». Casser un de ces jours fait
-- fermer l'app — **pas parce que le plat est mauvais, parce qu'il est
-- déplacé**. Et il n'existait AUCUN support: `households` porte `id, name,
-- created_by, reference_member_id, free_until`, et rien d'autre.
--
-- ⚠️ `household_envy_submissions` EXISTE, ET CE N'EST PAS LE BON SUPPORT. Elle
-- est clavetée `(household_id, week_start)`: c'est une envie DE LA SEMAINE. Une
-- tradition est un fait PERMANENT, et l'écrire dans une table hebdomadaire
-- obligerait à la recopier chaque lundi — c'est-à-dire à la perdre le premier
-- lundi où personne ne passe.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ⛔ CE QUE CETTE MIGRATION NE FAIT PAS — « SAMEDI SOIR ON COMMANDE »
-- ══════════════════════════════════════════════════════════════════════════
--
-- Le cadre citait trois exemples. Le troisième n'est pas ici parce qu'il
-- EXISTE DÉJÀ: `away_days` porte `kind: 'eating_out'` depuis le 2026-08-18,
-- claveté sur un JOUR DE SEMAINE (`mon`…`sun`) et des moments, et le prompt
-- porte déjà `eatingOutBlock` avec ses gardes (ne pas compenser ailleurs, ne
-- pas déplacer, ne pas mentionner). Une seconde colonne qui dirait « ne compose
-- pas cette case » ferait deux magasins pour un même fait, et c'est celui qu'on
-- regarde le moins qui garderait l'ancienne valeur.
--
-- Limite nommée et NON réparée ici: `away_days` est PAR BOUCHE. Un foyer qui
-- commande le samedi doit le marquer sur chacune. C'est un raccourci d'écran
-- qui manque, pas un support — et il appartient à la présence.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ① LA TABLE
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ `weekday` ET PAS UNE DATE. C'est ce qui fait de la tradition un fait
-- permanent plutôt qu'une envie datée, et c'est la MÊME clé que `away_days`
-- (`AwayDay.day` vaut `mon`…`sun`) — donc les deux se lisent dans la même
-- fenêtre sans conversion.
--
-- ⛔ AUCUN GRANT À `authenticated`, comme `household_member_bodies`. La policy
-- de lecture de `household_members` est household-wide; une table de foyer
-- lisible en clair par tout co-membre ayant un compte finit par montrer à
-- quelqu'un ce qu'un autre a écrit sur lui. Ici l'enjeu est plus faible qu'un
-- poids, mais la porte est la même, et deux régimes de porte dans la même
-- famille de tables sont deux régimes à tenir d'accord.

create table if not exists public.household_traditions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null
    references public.households(id) on delete cascade,
  weekday text not null,
  slot text not null,
  label text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_traditions_weekday_check
    check (weekday in ('mon','tue','wed','thu','fri','sat','sun')),
  constraint household_traditions_slot_check
    check (slot in ('breakfast','snack_am','lunch','snack_pm','dinner','before_bed')),
  -- ⛔ UN LIBELLÉ VIDE N'EST PAS UNE TRADITION. Le module le refuse aussi
  -- (`parseTraditions`), et les deux existent parce qu'un motif de recherche
  -- construit sur une chaîne vide matche TOUT — c'est-à-dire honorerait
  -- n'importe quel plat. C'est la garde « un libellé vide ne devient pas un
  -- terme de verrou », déjà écrite pour les règles de maison.
  constraint household_traditions_label_check
    check (char_length(btrim(label)) between 1 and 60),
  -- UNE SEULE TRADITION PAR CASE. Deux mots pour un même dîner demanderaient
  -- au modèle deux plats sur une case qui n'en porte qu'un.
  constraint household_traditions_cell_key unique (household_id, weekday, slot)
);

create index if not exists household_traditions_household_idx
  on public.household_traditions (household_id);

comment on table public.household_traditions is
  'Les jours que le foyer NE DÉPLACE PAS (③, 2026-08-20). Un fait PERMANENT, '
  'claveté sur un jour de SEMAINE et un moment — pas une envie datée '
  '(`household_envy_submissions`, clavetée sur `week_start`, n''est pas le bon '
  'support). ⛔ Ne porte QUE la forme positive (« dimanche rôti »): « samedi on '
  'commande » existe déjà comme `away_days kind=eating_out`, et en faire une '
  'seconde écriture donnerait deux magasins pour un même fait. '
  'Aucun grant à `authenticated`: la lecture passe par une RPC, comme pour les '
  'corps.';

comment on column public.household_traditions.weekday is
  'mon…sun. Un JOUR DE SEMAINE, jamais une date: c''est ce qui fait la '
  'permanence, et c''est la même clé que `away_days`.';
comment on column public.household_traditions.label is
  'Les mots du FOYER, tels quels (« rôti », « poisson »). Ils partent dans le '
  'prompt et servent de terme au vérificateur déterministe '
  '(`traditionHonoured`). ⛔ Jamais un slug: on ne demande pas à quelqu''un de '
  'traduire son dimanche dans notre vocabulaire.';

-- ══════════════════════════════════════════════════════════════════════════
-- ② LE PLAFOND — TROIS, ET IL EST EN BASE
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ CE N'EST PAS UNE BORNE TECHNIQUE, C'EST LA RÈGLE PRODUIT. « Deux ou trois
-- cases, une seule fois. » Un foyer qui en poserait dix aurait verrouillé sa
-- semaine, et le produit ne ferait plus rien pour lui — il lui rendrait son
-- propre menu. Un plafond d'écran n'est pas un plafond; celui-ci est un
-- trigger, parce qu'un CHECK ne peut pas compter les lignes voisines.
--
-- Le module porte le MÊME nombre (`MAX_TRADITIONS`) et le réapplique à la
-- lecture: une ligne écrite par un chemin de service ne doit pas pouvoir
-- verrouiller la semaine en aval.

create or replace function public.keel_household_traditions_cap()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.household_traditions t
  where t.household_id = new.household_id
    and t.id <> new.id;
  if v_count >= 3 then
    raise exception 'household_traditions: cap of 3 reached for this household'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

drop trigger if exists household_traditions_cap on public.household_traditions;
create trigger household_traditions_cap
  before insert or update of household_id on public.household_traditions
  for each row execute function public.keel_household_traditions_cap();

comment on function public.keel_household_traditions_cap() is
  'Le plafond de TROIS traditions par foyer, en base. C''est la règle produit '
  '(« deux ou trois cases »), pas une borne technique: au-delà, le foyer a '
  'verrouillé sa semaine et le produit ne fait plus rien pour lui.';

-- ══════════════════════════════════════════════════════════════════════════
-- ③ LA PORTE D'ÉCRITURE — compte maître seul, refus NOMMÉS
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ LES REFUS SONT NOMMÉS PLUTÔT QUE LAISSÉS AUX CHECK. Les contraintes
-- suffiraient à protéger la base, mais elles remonteraient une violation
-- PostgreSQL en toutes lettres au milieu d'un écran d'accueil. Même patron que
-- `keel_household_set_member_body`.

create or replace function public.keel_household_set_tradition(
  p_weekday text,
  p_slot text,
  p_label text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_role text;
  v_label text := btrim(coalesce(p_label, ''));
  v_count int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;
  if v_role <> 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;
  if p_weekday not in ('mon','tue','wed','thu','fri','sat','sun') then
    return jsonb_build_object('ok', false, 'reason', 'bad_weekday');
  end if;
  if p_slot not in ('breakfast','snack_am','lunch','snack_pm','dinner','before_bed') then
    return jsonb_build_object('ok', false, 'reason', 'bad_slot');
  end if;
  if v_label = '' then
    return jsonb_build_object('ok', false, 'reason', 'empty_label');
  end if;
  if char_length(v_label) > 60 then
    return jsonb_build_object('ok', false, 'reason', 'label_too_long');
  end if;

  -- LE PLAFOND, NOMMÉ AVANT QUE LE TRIGGER NE LÈVE. Le trigger reste la garde
  -- (un écran grisé n'est pas une garde); ce test-ci existe pour que le refus
  -- arrive en mot plutôt qu'en `check_violation`.
  select count(*) into v_count
  from public.household_traditions t
  where t.household_id = v_household
    and not (t.weekday = p_weekday and t.slot = p_slot);
  if v_count >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_traditions');
  end if;

  insert into public.household_traditions as t
    (household_id, weekday, slot, label, created_by)
  values (v_household, p_weekday, p_slot, v_label, v_user)
  on conflict (household_id, weekday, slot) do update
    set label = excluded.label,
        updated_at = now()
    where t.household_id = excluded.household_id;

  return jsonb_build_object('ok', true);
end;
$function$;

comment on function public.keel_household_set_tradition(text, text, text) is
  'Pose ou remplace LA tradition d''une case (jour de semaine x moment). Compte '
  'maître seul. Refus nommés: not_owner, bad_weekday, bad_slot, empty_label, '
  'label_too_long, too_many_traditions.';

revoke all on function public.keel_household_set_tradition(text, text, text)
  from public, anon;
grant execute on function public.keel_household_set_tradition(text, text, text)
  to authenticated;

-- ── LA SUPPRESSION, ET ELLE EST OBLIGATOIRE ────────────────────────────────
-- Une tradition sans porte de retrait est une tradition qu'on ne peut pas
-- avoir posée par erreur. Le foyer qui a tapé « poisson » un vendredi où il
-- n'en mange plus verrouillerait ce vendredi pour toujours.

create or replace function public.keel_household_remove_tradition(
  p_weekday text,
  p_slot text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_role text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;
  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;
  if v_role <> 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  delete from public.household_traditions t
  where t.household_id = v_household
    and t.weekday = p_weekday
    and t.slot = p_slot;

  -- ⚠️ `ok` MÊME SI RIEN N'A ÉTÉ SUPPRIMÉ. Le geste est « cette case n'a plus
  -- de tradition », et il a réussi. Rendre un refus sur une case déjà vide
  -- ferait afficher une erreur à quelqu'un qui vient d'obtenir ce qu'il
  -- voulait — et c'est la cicatrice « refus loin du geste = bouton mort », par
  -- l'autre bout.
  return jsonb_build_object('ok', true);
end;
$function$;

comment on function public.keel_household_remove_tradition(text, text) is
  'Retire la tradition d''une case. Compte maître seul. Rend `ok` même sur une '
  'case déjà vide: le geste demandé est obtenu.';

revoke all on function public.keel_household_remove_tradition(text, text)
  from public, anon;
grant execute on function public.keel_household_remove_tradition(text, text)
  to authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- ④ LES DEUX PORTES DE LECTURE
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⛔ DEUX, ET PAS UNE, POUR LA MÊME RAISON QUE LES CORPS. Le NAVIGATEUR lit
-- avec `auth.uid()` (compte maître seul); le SERVEUR lit sous la clé de
-- service, où `auth.uid()` est NULL — une RPC gatée dessus y serait morte, et
-- c'est une cicatrice écrite de ce dépôt.
--
-- ⚠️ UN NON-MAÎTRE REÇOIT ZÉRO LIGNE, pas une erreur: une erreur dirait déjà
-- qu'il y a quelque chose là.

create or replace function public.keel_household_traditions()
returns table (weekday text, slot text, label text)
language sql
stable
security definer
set search_path to ''
as $function$
  select t.weekday, t.slot, t.label
  from public.household_traditions t
  join public.household_members me
    on me.user_id = (select auth.uid())
   and me.role = 'owner'
   and me.household_id = t.household_id
  order by t.weekday, t.slot;
$function$;

comment on function public.keel_household_traditions() is
  'Les traditions du foyer, POUR SON COMPTE MAÎTRE SEUL. Un non-maître reçoit '
  'zéro ligne. Seul chemin de lecture ouvert à un navigateur: la table n''a '
  'aucun grant à `authenticated`.';

revoke all on function public.keel_household_traditions() from public, anon;
grant execute on function public.keel_household_traditions() to authenticated;

create or replace function public.keel_household_traditions_for(p_household uuid)
returns table (weekday text, slot text, label text)
language sql
stable
security definer
set search_path to ''
as $function$
  select t.weekday, t.slot, t.label
  from public.household_traditions t
  -- Un `p_household` nul rend zéro ligne: `= null` n'est jamais vrai.
  where t.household_id = p_household
  order by t.weekday, t.slot;
$function$;

comment on function public.keel_household_traditions_for(uuid) is
  'Les traditions d''un foyer, POUR LE SERVEUR. Prend le foyer en argument '
  'parce que `auth.uid()` est NULL sous la clé de service.';

revoke all on function public.keel_household_traditions_for(uuid) from public, anon;
grant execute on function public.keel_household_traditions_for(uuid) to service_role;
