-- ============================================================================
-- S5 ① — LA PORTE QUI PERMET D'ÉNUMÉRER, PARCE QUE LA LISTE À LA MAIN NE
--        ROUGIT JAMAIS
--
-- ── LE DÉFAUT, MESURÉ LE 2026-08-22 ────────────────────────────────────────
--
-- `supabase/functions/keel_gdpr_lifecycle_test.ts` est le seul filet du dépôt
-- qui réclame une table au cycle de vie RGPD. Il est écrit À LA MAIN:
-- 608 lignes, `{ table: "student_goals", owner: "user_id", … }`, et AUCUNE
-- énumération du catalogue. Conséquence exacte, et elle est structurelle:
--
--     UNE TABLE ABSENTE DE LA LISTE NE ROUGIT JAMAIS.
--
-- Mesuré: **126** tables dans `public`, **15** citées par ce fichier, donc
-- **111** hors de tout contrôle — dont `household_member_allergies` (8 lignes)
-- et `household_food_restrictions` (6), qui portent des données de SANTÉ, y
-- compris de mineurs, y compris de bouches qui n'ont jamais eu de compte.
--
-- Et le même défaut se rejoue UN CRAN PLUS BAS: `account-export-v1` lit chaque
-- table par une LISTE DE COLONNES écrite à la main. Mesuré le même jour:
-- **145** colonnes, sur **35** des 38 tables lues, sont hors de l'allowlist —
-- dont `student_generated_meals.composition_unknowns` et
-- `composition_energy_sources`, alors que la migration du lot 18 affirme en
-- commentaire que « la table est déjà exportée en entier ». C'est faux.
--
-- ── CE QUE CETTE MIGRATION AJOUTE, ET RIEN D'AUTRE ─────────────────────────
--
-- Une seule fonction de LECTURE: l'inventaire du schéma `public`, table par
-- table, colonne par colonne. Elle n'existe que pour qu'un test puisse
-- ÉNUMÉRER au lieu de relire une liste — PostgREST n'expose pas
-- `information_schema`, et sans porte le test n'a aucun moyen de savoir ce
-- qu'il ne sait pas.
--
-- ⚠️ ELLE EST RÉSERVÉE AU SERVEUR. L'inventaire du schéma est de la
-- reconnaissance: il nomme chaque table et chaque colonne du produit. Un
-- `authenticated` qui pourrait l'appeler saurait exactement où frapper. Le
-- dépôt vient de mesurer (`S6`) que `revoke` par LISTE NOMMÉE laisse derrière
-- lui ce qu'il ne connaît pas — `MAINTAIN` en l'occurrence — donc le retrait
-- est `revoke all privileges`, jamais une énumération.
-- ============================================================================

begin;

create or replace function public.keel_gdpr_public_inventory()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    jsonb_object_agg(x.table_name, x.columns),
    '{}'::jsonb
  )
  from (
    select
      c.table_name,
      jsonb_agg(c.column_name order by c.ordinal_position) as columns
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
     and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
    group by c.table_name
  ) x;
$function$;

comment on function public.keel_gdpr_public_inventory() is
  'L''inventaire du schéma public — {table: [colonnes]}. Elle n''existe que '
  'pour que le filet RGPD ÉNUMÈRE au lieu de relire une liste écrite à la '
  'main: une table absente d''une liste ne rougit jamais, et le dépôt en a '
  'mesuré 111 hors contrôle le 2026-08-22. RÉSERVÉE AU SERVEUR: nommer chaque '
  'table et chaque colonne du produit est de la reconnaissance.';

revoke all privileges on function public.keel_gdpr_public_inventory()
  from public, anon, authenticated;
grant execute on function public.keel_gdpr_public_inventory() to service_role;

-- ---------------------------------------------------------------------------
-- LE CONTRÔLE — on rejoue le geste, on n'inspecte pas le catalogue
-- ---------------------------------------------------------------------------
--
-- Vérifier que la fonction existe prouverait qu'elle a été créée, pas qu'elle
-- rend l'inventaire ni que les deux rôles clients en sont exclus. Les trois
-- sont assertés.

do $$
declare
  v_inv jsonb;
begin
  v_inv := public.keel_gdpr_public_inventory();

  if jsonb_typeof(v_inv) <> 'object' then
    raise exception 'inventaire: la fonction ne rend pas un objet (%)',
      jsonb_typeof(v_inv);
  end if;

  -- Le nombre de clés doit être le nombre de tables de base. Un inventaire qui
  -- rendrait les VUES ferait rougir le filet sur des objets qui n'ont pas de
  -- lignes à purger.
  if (select count(*) from jsonb_object_keys(v_inv))
     <> (select count(*) from information_schema.tables
          where table_schema = 'public' and table_type = 'BASE TABLE') then
    raise exception
      'inventaire: % clés pour % tables de base — la fonction compte autre '
      'chose que ce que le filet doit garder',
      (select count(*) from jsonb_object_keys(v_inv)),
      (select count(*) from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE');
  end if;

  -- Les deux tables du lot, nommément: c'est sur elles que le filet doit
  -- mordre, et un inventaire qui les oublierait le rendrait vert.
  if not (v_inv ? 'household_member_allergies')
     or not (v_inv ? 'household_food_restrictions') then
    raise exception
      'inventaire: les deux tables de santé du foyer ne sont pas énumérées';
  end if;

  if v_inv -> 'household_member_allergies' is null
     or jsonb_array_length(v_inv -> 'household_member_allergies') < 5 then
    raise exception 'inventaire: les colonnes ne sont pas rendues';
  end if;

  -- ET LES DEUX RÔLES CLIENTS N'Y ONT PAS ACCÈS. Écrire un `revoke` sans
  -- l'asserter est le défaut que ce dépôt vient de payer huit fois.
  if has_function_privilege('anon',
       'public.keel_gdpr_public_inventory()', 'execute') then
    raise exception 'inventaire: anon peut énumérer le schéma';
  end if;
  if has_function_privilege('authenticated',
       'public.keel_gdpr_public_inventory()', 'execute') then
    raise exception 'inventaire: authenticated peut énumérer le schéma';
  end if;
  if not has_function_privilege('service_role',
       'public.keel_gdpr_public_inventory()', 'execute') then
    raise exception 'inventaire: le serveur ne peut PAS l''appeler — la porte '
      'est fermée des deux côtés, et le filet ne peut plus énumérer';
  end if;

  raise notice
    'keel_gdpr_public_inventory: % tables énumérées, anon et authenticated '
    'exclus, service_role admis',
    (select count(*) from jsonb_object_keys(v_inv));
end $$;

commit;
