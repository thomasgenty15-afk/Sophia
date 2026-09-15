-- ============================================================================
-- LE FOYER — LES ENVIES: UNE LIGNE, ÉCRITE PAR LE COMPTE MAÎTRE
--
-- Autorité: docs/keel/CHANTIER-FOYER-PROFILS.md, lot 5.
--
-- ── CE QUI MEURT, ET POURQUOI ──────────────────────────────────────────────
--
-- Le CONSEIL DE FAMILLE — chacun dépose son envie, le produit met en commun,
-- l'écran compte qui s'est tu — est mort le 2026-08-08. Deux raisons, aucune
-- des deux esthétique:
--
--   1. Sophia arbitrant publiquement entre un parent et son enfant est un
--      marécage: le produit n'a aucune autorité pour trancher qui l'emporte à
--      table, et toute réponse qu'il donne est une prise de position dans une
--      famille.
--   2. La récolte PAR MEMBRE demandait à celui qui tient le foyer de courir
--      après tout le monde — exactement la charge mentale que le produit
--      promet de supprimer. Un compteur « 3 personnes n'ont rien dit » se lit
--      « il en reste 3 à relancer », quoi qu'en dise la copie à côté.
--
-- Ce qui survit: UNE LIGNE DE TEXTE, écrite par le compte maître, pour tout le
-- monde — « Léa veut des pâtes, Marc en a marre du poulet ». On garde la
-- variété et le sentiment que chacun compte; on jette la modération et
-- l'arbitrage public.
--
-- ── CE QUI SURVIT, ET POURQUOI CE N'EST PAS UNE COLONNE SUR `households` ───
--
-- La table reste, avec son ancrage `week_start`, et C'EST LE POINT QUI A
-- TRANCHÉ. Sans ancre temporelle, rien ne distingue « Marc en a marre du
-- poulet » écrit ce matin de la même phrase oubliée depuis six semaines — et
-- le générateur la servirait pareil. Une colonne `envy_line text` sur
-- `households` serait une envie éternelle.
--
-- ── DEUX CHANGEMENTS DE FORME, ET LEUR RAISON ─────────────────────────────
--
-- 1. L'UNIQUE PASSE DE (foyer, personne, semaine) À (foyer, semaine).
--    « Une ligne par semaine » est maintenant vrai au sens propre: il n'y a
--    plus qu'un auteur possible. Garder l'ancien unique laisserait deux lignes
--    coexister le jour où la propriété du foyer change de main, et le
--    générateur devrait alors choisir — c'est-à-dire arbitrer en silence.
--    `user_id` RESTE: c'est l'auteur, et savoir QUI a écrit une phrase que
--    tout le foyer lit n'est pas facultatif (même raison que `created_by` sur
--    les règles de maison, §8.5 règle 3).
--
-- 2. `week_start` EST RECALÉE SUR LE LUNDI ISO, PAR LA RPC.
--    La colonne s'appelait `week_start` et acceptait n'importe quelle date:
--    l'écran y écrivait la date DU JOUR. Conséquence mesurable et silencieuse:
--    une envie écrite lundi n'était plus trouvée par une composition lancée
--    mercredi (`where week_start = <jour de départ>`), et le foyer voyait un
--    plan qui ignorait ce qu'il avait demandé — sans une seule erreur nulle
--    part. On recale donc à l'écriture, une fois, du côté qui fait autorité.
--    Le lecteur (`generate-household-meal-v1`) recale de son côté avec la même
--    arithmétique (`weekStartOf`, lundi ISO).
--
-- ── CE QUI NE CHANGE PAS ──────────────────────────────────────────────────
--
-- La lecture reste ouverte à TOUT le foyer (policy `household_envy_member_read`
-- inchangée): « on mange des pâtes cette semaine » n'est pas une donnée
-- sensible. Et toute écriture reste une RPC `security definer` — aucune policy
-- d'écriture n'est ajoutée ici, pour la raison déjà écrite dans
-- `20260808000000`: une policy ne restreint pas les COLONNES.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La forme de la table
-- ---------------------------------------------------------------------------

-- L'ORDRE COMPTE. On retire l'ancien unique AVANT de toucher aux lignes: la
-- normalisation de `week_start` peut faire entrer en collision deux lignes qui
-- ne se voyaient pas (mardi et jeudi de la même semaine), et une migration qui
-- échoue au milieu d'un déploiement est plus chère que trois lignes de SQL.
alter table public.household_envy_submissions
  drop constraint if exists household_envy_submissions_household_id_user_id_week_start_key;

-- LES LIGNES EXISTANTES: zéro dans tous les environnements connus — rien de ce
-- chantier n'est déployé, et `select count(*)` sur la base locale rend 0. Le
-- nettoyage est écrit quand même: une migration qui SUPPOSE une table vide est
-- une bombe à retardement, et ici l'explosion serait un `unique` refusé.

-- 1.a Ce qu'un non-maître a écrit n'a plus d'auteur légitime. On ne le
--     convertit pas en ligne du foyer: ce serait attribuer au maître une
--     phrase qu'il n'a pas écrite, sur un écran où son nom est engagé.
delete from public.household_envy_submissions e
 where not exists (
   select 1 from public.household_members m
    where m.household_id = e.household_id
      and m.user_id = e.user_id
      and m.role = 'owner');

-- 1.b Le lundi ISO. `isodow` vaut 1 le lundi: on retire (isodow - 1) jours.
update public.household_envy_submissions
   set week_start = week_start - (extract(isodow from week_start)::int - 1)
 where extract(isodow from week_start) <> 1;

-- 1.c Une seule ligne par (foyer, semaine): on garde la plus RÉCEMMENT
--     touchée. `id` départage l'égalité parfaite, sinon la suppression serait
--     non déterministe et deux rejeux de la migration ne garderaient pas la
--     même phrase.
delete from public.household_envy_submissions e
 using public.household_envy_submissions k
 where e.household_id = k.household_id
   and e.week_start = k.week_start
   and (e.updated_at, e.id) < (k.updated_at, k.id);

alter table public.household_envy_submissions
  drop constraint if exists household_envy_submissions_household_week_key;
alter table public.household_envy_submissions
  add constraint household_envy_submissions_household_week_key
  unique (household_id, week_start);

comment on table public.household_envy_submissions is
  'UNE LIGNE D''ENVIES PAR FOYER ET PAR SEMAINE, écrite par le compte maître '
  'pour tout le monde (lot 5, 2026-08-10). Le conseil de famille — une '
  'soumission par personne, et un décompte des silencieux — est mort: il '
  'demandait à celui qui tient le foyer de relancer tout le monde, soit '
  'exactement la charge mentale que le produit promet de supprimer. '
  'L''ABSENCE DE LIGNE RESTE UN ÉTAT LÉGITIME: la composition sort quand '
  'même, depuis les profils seuls.';

comment on column public.household_envy_submissions.week_start is
  'LUNDI ISO de la semaine visée, recalé par keel_household_submit_envy. '
  'C''est l''ancre qui empêche de servir une phrase vieille de six semaines '
  'comme si elle était de ce matin — et c''est la raison pour laquelle cette '
  'table existe encore au lieu d''une colonne sur `households`.';

comment on column public.household_envy_submissions.user_id is
  'L''AUTEUR — forcément le compte maître depuis le lot 5. Gardé, et pas '
  'remplacé par `household_id` seul: une phrase que tout le foyer lit doit '
  'rester attribuable, même règle que `created_by` sur les règles de maison.';

-- ---------------------------------------------------------------------------
-- 2. La porte d'écriture
-- ---------------------------------------------------------------------------

create or replace function public.keel_household_submit_envy(
  p_week_start date,
  p_body text
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
  v_body text := btrim(coalesce(p_body, ''));
  v_week date;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_week_start is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_week');
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'bad_body');
  end if;

  -- UNE SEULE LECTURE POUR LE FOYER ET LE RÔLE. `keel_household_of` ne rend
  -- que le foyer: s'en servir puis relire le rôle ferait deux requêtes dont la
  -- seconde pourrait porter sur une autre ligne.
  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;

  -- LE REFUS EST NOMMÉ, et il est ici et pas à l'écran. Une limite d'UI n'est
  -- pas une limite: un membre qui appelle la RPC directement doit se heurter
  -- au même mur que celui qui ne voit pas le champ.
  if v_role <> 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  v_week := p_week_start - (extract(isodow from p_week_start)::int - 1);

  insert into public.household_envy_submissions
    (household_id, user_id, week_start, body)
  values (v_household, v_user, v_week, v_body)
  on conflict (household_id, week_start)
  do update set body = excluded.body,
                user_id = excluded.user_id,
                updated_at = now();

  return jsonb_build_object('ok', true, 'week_start', v_week);
end;
$function$;

comment on function public.keel_household_submit_envy(date, text) is
  'Écrit LA ligne d''envies de la semaine, pour tout le foyer. Compte maître '
  'uniquement (`not_owner` sinon). `p_week_start` est recalée sur le lundi ISO '
  'et rendue dans la réponse: l''appelant écrit un jour, la base range une '
  'semaine, et les deux doivent pouvoir se le dire.';

-- ---------------------------------------------------------------------------
-- 3. Les droits
-- ---------------------------------------------------------------------------
--
-- `create or replace function` conserve l'ACL existante, donc rien ne serait
-- cassé sans ce bloc. On le réécrit quand même: `revoke from public` ne retire
-- PAS `anon`, ce dépôt l'a déjà payé, et une signature qui traverse une
-- migration sans que ses droits soient affirmés au même endroit est une
-- signature dont personne ne sait plus qui l'exécute.

revoke all on function public.keel_household_submit_envy(date, text) from public, anon;
grant execute on function public.keel_household_submit_envy(date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Le contrôle, à voix haute
-- ---------------------------------------------------------------------------
--
-- FAIL LOUD. Une migration qui « a l'air passée » sur une contrainte absente
-- laisse deux lignes d'envies coexister, et le générateur choisirait alors en
-- silence laquelle il sert.

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.household_envy_submissions'::regclass
       and conname = 'household_envy_submissions_household_week_key'
  ) then
    raise exception 'household_envy_submissions: l''unique (foyer, semaine) est absent';
  end if;

  if exists (
    select 1 from public.household_envy_submissions
     where extract(isodow from week_start) <> 1
  ) then
    raise exception 'household_envy_submissions: une ligne n''est pas ancrée sur un lundi';
  end if;
end;
$$;
