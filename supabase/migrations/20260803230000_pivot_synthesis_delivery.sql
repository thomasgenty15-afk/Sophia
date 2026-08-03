-- ===========================================================================
-- PIVOT NUTRITION — C5 : la synthèse hebdomadaire est LIVRÉE
-- ===========================================================================
--
-- CE QUI MANQUAIT
-- ---------------
-- `coach-synthesis-v1` écrit une ligne dans `coach_syntheses` tous les lundis
-- à 06h00 UTC. `delivered_at` restait NULL, et — vérifié — AUCUN écran du
-- frontend ne référençait la table. La synthèse existait uniquement dans la
-- base : personne ne la lisait jamais.
--
-- POURQUOI UNE FONCTION ET PAS UNE POLITIQUE UPDATE
-- --------------------------------------------------
-- Le coach doit pouvoir marquer sa synthèse comme lue. Une politique RLS
-- `UPDATE` le permettrait — mais RLS ne restreint pas les COLONNES : le même
-- coach pourrait alors réécrire `narrative`, `metrics` et `flagged_students`,
-- c'est-à-dire éditer un constat généré sur ses propres élèves. Un rapport
-- qu'on peut réécrire n'est plus un rapport.
--
-- Cette fonction ne touche que deux colonnes, et seulement sur une ligne qui
-- appartient au coach appelant. C'est la même doctrine que les vues Tier B du
-- dépôt : restreindre par une surface dédiée, pas par une permission large.
--
-- IDEMPOTENTE : `delivered_at` est posé UNE fois. Rouvrir l'écran trois fois
-- ne doit pas déplacer la date de première lecture, sinon la métrique
-- « combien de temps avant que le coach lise » devient un mensonge.
-- ===========================================================================

begin;

create or replace function public.keel_mark_synthesis_delivered(
  p_synthesis_id uuid,
  -- 'in_app' et pas 'app': le CHECK `coach_syntheses_delivery_channel_check`
  -- n'accepte que whatsapp | email | in_app. Trouve en verifiant, pas en lisant.
  p_channel text default 'in_app'
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivered timestamptz;
begin
  update public.coach_syntheses s
  set
    delivered_at = coalesce(s.delivered_at, now()),
    delivery_channel = coalesce(s.delivery_channel, p_channel)
  where s.id = p_synthesis_id
    -- La clause d'appartenance. Sans elle, la fonction marquerait n'importe
    -- quelle synthèse de n'importe quel coach.
    and s.coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  returning s.delivered_at into v_delivered;

  -- NULL = la ligne n'existe pas OU n'appartient pas à l'appelant. On ne
  -- distingue pas les deux pour l'appelant: le dire révélerait l'existence
  -- d'une synthèse d'un autre coach.
  return v_delivered;
end;
$$;

revoke all on function public.keel_mark_synthesis_delivered(uuid, text) from public;
grant execute on function public.keel_mark_synthesis_delivered(uuid, text) to authenticated;

commit;

-- ===========================================================================
-- GARDE
-- ===========================================================================
do $$
declare
  v_fn int;
  v_definer boolean;
  v_pub int;
begin
  select count(*) into v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'keel_mark_synthesis_delivered';

  select p.prosecdef into v_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'keel_mark_synthesis_delivered';

  -- `public` ne doit PAS pouvoir l'exécuter: seul `authenticated`.
  select count(*) into v_pub
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'keel_mark_synthesis_delivered'
    and has_function_privilege('public', p.oid, 'execute');

  if v_fn <> 1 then
    raise exception 'C5 guard: fonction absente (trouve %)', v_fn;
  end if;
  if not v_definer then
    raise exception 'C5 guard: la fonction n''est pas SECURITY DEFINER';
  end if;
  if v_pub <> 0 then
    raise exception 'C5 guard: le role public peut executer la fonction';
  end if;

  raise notice 'C5 OK — livraison de synthese, surface reduite a deux colonnes';
end $$;
