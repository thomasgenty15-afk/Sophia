-- ============================================================================
-- AUCUN UTILISATEUR NE POUVAIT PLUS MODIFIER SON PROPRE PROFIL
--
-- LE DÉFAUT, MESURÉ AU NAVIGATEUR (QA WEB L2, 2026-08-04)
-- --------------------------------------------------------
-- Un élève connecté, dans la vraie page, avec sa vraie session :
--
--     supabase.from('profiles').update({ timezone: 'Europe/London' })
--       → { code: '42703',
--           message: 'record "new" has no field "pre_deletion_whatsapp_opted_in"' }
--
-- `guard_profiles_privileged_columns()` — le trigger BEFORE UPDATE qui protège
-- les colonnes de facturation et d'état de suppression — lit
-- `new.pre_deletion_whatsapp_opted_in`. Cette colonne a été RENOMMÉE en
-- `pre_deletion_proactive_muted` par `20260804152000`. Le corps du trigger
-- n'a pas suivi, et PL/pgSQL ne résout ses champs qu'à l'EXÉCUTION : rien
-- n'échoue au `rename`, tout échoue au premier `update`.
--
-- CE QUE ÇA CASSAIT, EXACTEMENT
-- ------------------------------
-- TOUT `update` sur `profiles` par un utilisateur final. Le nom, le fuseau, la
-- langue, `tz_follow_device`, les réglages du compte — chaque enregistrement
-- de `/account`, chaque synchronisation de fuseau. Pas une colonne en
-- particulier : la ligne fautive est évaluée sur chaque UPDATE, quel que soit
-- le champ touché.
--
-- POURQUOI PERSONNE NE L'AVAIT VU, ET C'EST LE VRAI ENSEIGNEMENT
-- ---------------------------------------------------------------
-- La garde est encadrée par `if current_user in ('authenticated','anon')`.
-- Le `service_role` ne l'exécute JAMAIS. Or absolument tout ce qui éprouve ce
-- dépôt — la suite Deno, les crons, les harnais de QA, les fixtures — écrit en
-- `service_role`. Le chemin cassé est donc exactement celui que rien
-- n'emprunte sauf un vrai navigateur avec un vrai JWT d'élève.
--
-- C'est la TROISIÈME fois que ce dépôt paie la même leçon, et la version la
-- plus fine : STATUS-DEWHATSAPP conclut qu'un renommage demande trois épreuves
-- d'absence — le code applicatif, les corps de fonctions SQL, et les vues. Il
-- en manquait une quatrième, plus étroite : les corps de trigger nomment aussi
-- des COLONNES, pas seulement des tables, et un `grep` de noms de tables ne les
-- attrape pas.
--
-- LA VÉRIFICATION FINALE REJOUE LE GESTE plutôt que d'inspecter du texte —
-- même arbitrage que `20260804140000` : un contrôle textuel aurait laissé
-- passer la panne d'origine.
-- ============================================================================

create or replace function public.guard_profiles_privileged_columns()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if current_user in ('authenticated', 'anon') then
    if new.access_tier is distinct from old.access_tier then
      raise exception
        'profiles.access_tier is managed by the billing system and cannot be modified directly'
        using errcode = '42501'; -- insufficient_privilege
    end if;

    if new.trial_end is distinct from old.trial_end then
      raise exception
        'profiles.trial_end is managed by the billing system and cannot be modified directly'
        using errcode = '42501';
    end if;

    if new.stripe_customer_id is distinct from old.stripe_customer_id then
      raise exception
        'profiles.stripe_customer_id is managed by the billing system and cannot be modified directly'
        using errcode = '42501';
    end if;

    if new.account_status is distinct from old.account_status
       or new.purge_at is distinct from old.purge_at
       or new.deletion_requested_at is distinct from old.deletion_requested_at
       -- RENOMMÉE par 20260804152000. C'est la ligne qui rendait tout
       -- `update` d'un utilisateur final impossible.
       or new.pre_deletion_proactive_muted is distinct from old.pre_deletion_proactive_muted then
      raise exception
        'profiles deletion state is managed by the account-deletion functions and cannot be modified directly'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

-- ── CONTRÔLE FINAL : ON REJOUE LE GESTE ────────────────────────────────────
-- Sous l'identité `authenticated`, dans une sous-transaction annulée. Un test
-- qui lirait `pg_proc.prosrc` à la recherche du bon nom de colonne prouverait
-- que le texte a changé, pas que l'UPDATE passe — et c'est précisément la
-- distinction qui a coûté cette panne.
-- `reset role` NE REND PAS le rôle de l'appelant : il retombe sur `session_user`.
-- Le CLI (`supabase db push`) se place sur un rôle avant d'appliquer chaque
-- fichier, puis écrit lui-même dans `supabase_migrations.schema_migrations`.
-- Un `reset role` ici jetait ce rôle par-dessus bord et l'INSERT de
-- comptabilité repartait en `session_user` nu : `permission denied for schema
-- supabase_migrations`. On capture donc l'identité d'entrée et on la restitue.
do $$
declare
  v_id uuid;
  v_msg text;
  v_role text := current_user;
begin
  select id into v_id from public.profiles limit 1;
  if v_id is null then
    raise notice 'guard_profiles_privileged_columns: aucune ligne, contrôle sauté';
    return;
  end if;

  begin
    set local role authenticated;
    -- Un UPDATE anodin, sur une colonne non privilégiée. Il DOIT traverser le
    -- trigger sans 42703. Il peut être refusé par RLS (0 ligne touchée) : ce
    -- n'est pas ce qu'on teste ici — on teste que le trigger COMPILE ses
    -- champs à l'exécution.
    update public.profiles set updated_at = updated_at where id = v_id;
    execute format('set local role %I', v_role);
  exception
    when undefined_column then
      execute format('set local role %I', v_role);
      raise exception
        'guard_profiles_privileged_columns nomme encore une colonne absente: %',
        sqlerrm;
    when insufficient_privilege then
      -- RLS a parlé, pas le trigger. C'est un succès pour ce contrôle.
      execute format('set local role %I', v_role);
    when others then
      get stacked diagnostics v_msg = message_text;
      execute format('set local role %I', v_role);
      if v_msg like '%has no field%' then
        raise exception 'guard_profiles_privileged_columns: %', v_msg;
      end if;
  end;

  raise notice 'guard_profiles_privileged_columns: UPDATE rejoué sous authenticated, aucun 42703';
end $$;
