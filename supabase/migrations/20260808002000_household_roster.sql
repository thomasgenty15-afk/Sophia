-- ============================================================================
-- LA LISTE DES MEMBRES D'UN FOYER — et pourquoi elle ne peut pas être une policy
-- ============================================================================
-- Autorité produit: docs/keel/PIVOT-FOYER.md §8.
--
-- ── LE DÉFAUT, VU AU NAVIGATEUR ─────────────────────────────────────────
-- L'écran du foyer listait ses membres en lisant `profiles` avec un
-- `in (ids)`. RLS sur `profiles` ne laisse lire QUE sa propre ligne: tous les
-- autres membres s'affichaient donc « — », sans nom, sans étiquette « enfant »,
-- et le sélecteur de restriction proposait deux tirets. Aucune erreur, aucun
-- log — juste un écran où le foyer n'a qu'un seul habitant.
--
-- ── POURQUOI PAS UNE POLICY SUR `profiles` ──────────────────────────────
-- Parce qu'**une policy RLS ne restreint pas les COLONNES**. Ouvrir la lecture
-- de `profiles` aux co-membres d'un foyer donnerait du même geste le numéro de
-- téléphone, l'adresse e-mail, l'identifiant client Stripe, l'état WhatsApp et
-- les dates de purge. Pour afficher un prénom.
--
-- C'est le raisonnement exact de `20260806160000` sur `coach_clients`: quand
-- la donnée voulue est une colonne et pas une ligne, la porte étroite est une
-- RPC, pas une policy.
--
-- ── CE QU'ELLE REND, ET RIEN D'AUTRE ────────────────────────────────────
-- Le PRÉNOM (pas le nom complet: il s'affiche sur un écran que tout le foyer
-- regarde, et le nom entier d'un enfant n'a rien à y faire), un booléen mineur
-- DÉRIVÉ (jamais la date de naissance elle-même), le rôle, et l'instant de
-- consentement. Quatre champs choisis un par un.
-- ============================================================================

create or replace function public.keel_household_roster()
returns table (
  user_id uuid,
  first_name text,
  is_minor boolean,
  role text,
  restriction_consent_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    hm.user_id,
    -- Le prénom seul. `split_part` sur l'espace, et un nom vide rend '' que
    -- l'écran remplace par son propre libellé — jamais l'e-mail en repli, qui
    -- divulguerait une adresse à tout le foyer.
    coalesce(nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''), '') as first_name,
    -- DÉRIVÉ, jamais la date. Le foyer a besoin de savoir qu'il y a un enfant
    -- à table; il n'a pas besoin de sa date de naissance.
    public.keel_household_is_minor(hm.user_id) as is_minor,
    hm.role,
    hm.restriction_consent_at
  from public.household_members hm
  left join public.profiles p on p.id = hm.user_id
  -- LA GARDE: on ne rend que le foyer de l'appelant. `keel_household_of` est
  -- déjà `security definer` et scalaire.
  where hm.household_id = public.keel_household_of((select auth.uid()))
  order by (hm.role = 'owner') desc, hm.joined_at;
$function$;

comment on function public.keel_household_roster() is
  'Les membres du foyer de l''appelant: prénom, mineur (DÉRIVÉ), rôle, '
  'consentement. Une RPC et pas une policy sur profiles, parce qu''une policy '
  'RLS ne restreint pas les colonnes et exposerait téléphone, e-mail et '
  'identifiant Stripe pour afficher un prénom.';

revoke all on function public.keel_household_roster() from public, anon;
grant execute on function public.keel_household_roster() to authenticated;
