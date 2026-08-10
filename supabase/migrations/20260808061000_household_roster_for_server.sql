-- ============================================================================
-- FF-010 — LE ROSTER DU FOYER, LISIBLE DEPUIS LE SERVEUR
--
-- 🔴 LE DÉFAUT, TROUVÉ EN RUN RÉEL (2026-08-08, stack locale, vrai modèle)
-- -------------------------------------------------------------------------
-- élève, membre d'un foyer avec un plat composé pour aujourd'hui :
--     « on mange quoi ce soir ? »
-- réponse : les lignes du plan du COACH, pas le plat du foyer.
--
-- `loadHouseholdTurnContext` appelait `keel_household_roster()` depuis
-- `sophia-brain`, et cet appel ne pouvait PAS aboutir, pour deux raisons
-- indépendantes :
--
--   1. LA GARDE EST `auth.uid()`. Le corps filtre sur
--      `keel_household_of((select auth.uid()))`. Le cerveau appelle avec la
--      clé `service_role`, où `auth.uid()` est NULL — la cicatrice
--      `auth-uid-null-under-service-role` de ce dépôt, mot pour mot : « toute
--      RPC gatée dessus est morte » côté serveur.
--
--   2. LE GRANT NE COUVRE PAS LE SERVEUR. `revoke all … from public, anon`
--      puis `grant execute … to authenticated` : `service_role` n'a jamais eu
--      le droit d'exécuter cette fonction.
--
-- Le chargeur avalait l'échec (par conception : une panne ne doit pas faire
-- dire « rien de prévu »), donc le symptôme était un agent qui parle du plan du
-- coach à quelqu'un qui demande ce qu'on mange ce soir. Aucune erreur nulle
-- part.
--
-- ── POURQUOI UNE SECONDE PORTE, ET PAS UNE POLICY SUR `profiles` ───────────
-- La raison d'être de cette RPC ne change pas : une policy RLS ne restreint
-- pas les COLONNES, et ouvrir `profiles` aux co-membres livrerait téléphone,
-- e-mail et identifiant Stripe pour afficher un prénom. On garde donc le
-- rétrécissement de colonnes, et on ajoute UNE porte au serveur.
--
-- ── ET POURQUOI LE CORPS N'EST PAS RECOPIÉ ────────────────────────────────
-- Deux copies du même SELECT divergeraient au premier ajustement, et la
-- divergence serait silencieuse : le navigateur verrait une colonne que le
-- serveur ne voit pas, ou l'inverse. La fonction à argument porte LE corps ; la
-- fonction historique devient un appel d'une ligne qui lui passe `auth.uid()`.
-- Une requête, deux gardes.
--
-- ⚠️ CE QUE ÇA N'OUVRE PAS. `keel_household_roster_for` n'est exécutable que
-- par `service_role`. Un porteur de cette clé lit déjà toute la base ; la
-- fonction ne lui donne rien de neuf, elle lui donne la MÊME lecture étroite
-- que le navigateur, ce qui est exactement le but.
-- ============================================================================

create or replace function public.keel_household_roster_for(p_user uuid)
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
    -- l'appelant remplace par son propre libellé — jamais l'e-mail en repli,
    -- qui divulguerait une adresse à tout le foyer.
    coalesce(nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''), '') as first_name,
    -- DÉRIVÉ, jamais la date. Le foyer a besoin de savoir qu'il y a un enfant
    -- à table; il n'a pas besoin de sa date de naissance.
    public.keel_household_is_minor(hm.user_id) as is_minor,
    hm.role,
    hm.restriction_consent_at
  from public.household_members hm
  left join public.profiles p on p.id = hm.user_id
  -- LA GARDE, portée par l'ARGUMENT ici. Un `p_user` nul rend zéro ligne:
  -- `keel_household_of(null)` est nul, et `= null` n'est jamais vrai. Pas
  -- besoin d'un `if` — c'est le moteur qui ferme.
  where hm.household_id = public.keel_household_of(p_user)
  order by (hm.role = 'owner') desc, hm.joined_at;
$function$;

comment on function public.keel_household_roster_for(uuid) is
  'Le roster du foyer de p_user, pour les appelants SERVEUR (service_role), '
  'où auth.uid() est NULL. Même rétrécissement de colonnes que la version '
  'sans argument, qui délègue à celle-ci: une seule requête, deux gardes.';

revoke all on function public.keel_household_roster_for(uuid) from public, anon, authenticated;
grant execute on function public.keel_household_roster_for(uuid) to service_role;

-- La fonction historique devient un appel d'une ligne. Sa garde ne change pas:
-- c'est toujours `auth.uid()` qui décide de ce que le navigateur voit.
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
  select * from public.keel_household_roster_for((select auth.uid()));
$function$;

revoke all on function public.keel_household_roster() from public, anon;
grant execute on function public.keel_household_roster() to authenticated;

-- ── CONTRÔLE FINAL — ON REJOUE LE GESTE ────────────────────────────────────
-- Inspecter le texte prouverait que la fonction existe, pas qu'elle rend des
-- lignes. On construit un foyer, on l'interroge PAR L'ARGUMENT, et on annule.
do $$
declare
  v_a uuid;
  v_b uuid;
  v_house uuid;
  v_rows int;
begin
  select id into v_a from auth.users order by created_at limit 1;
  select id into v_b from auth.users order by created_at desc limit 1;
  if v_a is null or v_b is null or v_a = v_b then
    raise notice 'household_roster_for: pas assez d''utilisateurs, contrôle sauté';
    return;
  end if;

  insert into public.households (kind, name, created_by)
  values ('family', '__qa_roster__', v_a)
  returning id into v_house;

  -- La contrainte « un foyer par personne » peut refuser un membre déjà
  -- rattaché ailleurs: on ne pose que ce qui passe, et on interroge ce qui est.
  begin
    insert into public.household_members (household_id, user_id, role)
    values (v_house, v_a, 'owner');
  exception when unique_violation then
    raise notice 'household_roster_for: %, déjà dans un foyer, contrôle sauté', v_a;
    raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
  end;

  select count(*) into v_rows from public.keel_household_roster_for(v_a);
  if v_rows < 1 then
    raise exception
      'household_roster_for: la RPC rend % ligne(s) pour un membre qui EXISTE — '
      'la garde par argument ne fonctionne pas, et le serveur resterait aveugle '
      'au foyer', v_rows;
  end if;

  -- Et la contre-épreuve: un utilisateur SANS foyer ne rend rien.
  select count(*) into v_rows
    from public.keel_household_roster_for('00000000-0000-0000-0000-000000000000'::uuid);
  if v_rows <> 0 then
    raise exception
      'household_roster_for: un uuid sans foyer rend % ligne(s) — la garde fuit',
      v_rows;
  end if;

  raise notice 'household_roster_for: lecture par argument vérifiée dans les deux sens';
  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;
