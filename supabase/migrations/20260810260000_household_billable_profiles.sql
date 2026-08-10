-- ============================================================================
-- LE FOYER — LE COMPTE FACTURABLE (lot 7, seconde moitié, part BASE)
--
-- Autorité: docs/keel/CHANTIER-FOYER-PROFILS.md, lot 7. La PREMIÈRE moitié du
-- lot (le plafond de 8, en base, motif `household_full`) est livrée depuis
-- 20260810120000. Celle-ci livre l'autre moitié qui ne dépend d'aucun geste
-- humain: la QUANTITÉ à facturer, calculable en base et testée.
--
-- ── STATUT: AUCUNE INTÉGRATION STRIPE N'EST CRÉÉE ICI ──────────────────────
--
-- Cette migration ne crée ni produit, ni prix, ni abonnement, ni ligne de
-- facture. Elle ne parle même pas à Stripe. Elle définit UN NOMBRE — combien de
-- profils d'un foyer sont réclamés — et c'est tout. C'est le patron exact de
-- `keel_coach_seat_ledger` (20260727235000), dont l'en-tête écrit déjà la même
-- phrase: « No Stripe product/price is created here. Product creation is a
-- HUMAN action ».
--
-- Ce qui manque pour qu'un foyer soit un client payant est NOMMÉ, pas simulé,
-- en fin de fichier (section 4). Rien ici ne donne l'illusion que ça marche.
--
-- ── LE PRIX, ARRÊTÉ LE 2026-08-10 (rappel, pas une décision d'ici) ─────────
--
--   · 12,99 €/mois, FOYER ENTIER, bouches illimitées (plafond technique de 8).
--   · +2 €/mois PAR PROFIL RÉCLAMÉ, porté par une ligne sur l'abonnement DU
--     MAÎTRE — jamais par la carte du réclamant: saisir une carte pour 2 € est
--     disproportionné, et le maître a déjà la sienne.
--
-- ── LES DEUX NOMBRES QUE CE FICHIER REFUSE DE CONFONDRE ────────────────────
--
--   LE PLAFOND (`keel_household_max_mouths`)   — 8 bouches. C'est une garde de
--     COÛT: huit bouches, ce sont huit consignes de service à composer à chaque
--     génération LLM. Il ne facture rien, et il ne bouge pas quand quelqu'un
--     réclame son profil.
--   LE COMPTE FACTURABLE (`keel_household_billable_profiles`) — combien de
--     lignes portent un compte, LE MAÎTRE EXCLU. C'est la quantité de l'article
--     « profil réclamé » sur l'abonnement.
--
-- Un foyer de 8 bouches dont personne n'a réclamé son profil facture 12,99 € et
-- pas un centime de plus. Un foyer de 2 bouches dont l'autre a réclamé facture
-- 14,99 €. Les deux nombres n'ont ni la même cause, ni la même unité, ni le
-- même destinataire — et une facturation qui les confond ne se voit pas en
-- test: elle se voit sur une facture, un mois plus tard.
--
-- ── LE MAÎTRE N'EST PAS UN PROFIL RÉCLAMÉ, ET C'EST L'INVARIANT N°1 ────────
--
-- Le compte maître porte évidemment un `user_id`: c'est lui qui a créé le
-- foyer. Le compter comme « profil réclamé » facturerait 14,99 € à un foyer
-- d'une seule personne — l'erreur la plus chère de ce fichier, et la plus
-- silencieuse, parce qu'elle produit un nombre plausible. `role <> 'owner'` est
-- donc DANS la définition, pas dans l'appelant: un second lecteur (page de
-- facturation, export comptable, job de réconciliation) qui réécrirait le
-- filtre pourrait l'oublier. Il n'y a qu'un seul endroit où l'oublier, et il
-- est testé.
--
-- ── CE QUI NE COMPTE PAS, ET POURQUOI ──────────────────────────────────────
--
--   · UNE BOUCHE SANS COMPTE (`user_id is null`) — c'est le cas nominal du
--     produit depuis le lot 1: l'enfant, le conjoint qui ne veut pas de compte.
--     Elle mange, elle a des allergies, elle a un objectif, et elle ne coûte
--     rien de plus que les 12,99 € du foyer.
--   · UNE INVITATION ÉMISE ET NON RÉCLAMÉE — un lien envoyé n'est pas un accès.
--     `household_invitations` n'est même pas lue ici: seule la ligne membre
--     fait foi, et elle ne porte un compte qu'une fois la réclamation faite.
--   · UNE RÉCLAMATION ANNULÉE — le maître retire la bouche
--     (`keel_household_remove_member`), la ligne disparaît, le compte tombe.
--     ⚠️ QUESTION OUVERTE, à trancher par un humain avant la mise en vente:
--     aujourd'hui « retirer l'accès » n'existe pas comme geste distinct de
--     « retirer la bouche ». Retirer l'accès d'un profil réclamé détruit donc
--     aussi la bouche, ses portions et ses allergies — alors que la personne
--     continue de manger dans ce foyer. Le détachement (`user_id` remis à NULL,
--     la bouche reste) N'EST PAS construit ici: il change ce que le produit
--     promet, et ce n'est pas à une migration de facturation de le décider.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS, DIT POUR QU'ON NE LE LISE PAS DEDANS
--
--   · Aucun jeton de palier (`access_tier`) n'est ajouté. Le foyer n'est gaté
--     par AUCUNE solvabilité aujourd'hui — vérifié: `generate-household-meal-v1`
--     ne lit pas `access_tier`, et `subscriptions_tier_check` n'admet que
--     'coach' et les trois paliers grand public morts. Ajouter un jeton que
--     personne n'écrit ferait une garde désarmée de plus.
--   · Aucune table de période de facturation. Sa forme est dictée par le job
--     qui l'écrit (identifiant d'abonnement, identifiant d'article, quantité
--     poussée, erreur de poussée — voir `coach_billing_periods`), et ce job
--     n'existe pas: la créer maintenant, c'est léguer une table à migrer.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. LE PLAFOND DEVIENT ADRESSABLE
-- ---------------------------------------------------------------------------
--
-- Le 8 était un littéral au milieu d'une RPC. Il le reste — mais nommé, pour
-- qu'un second lecteur (celui qui écrira la facturation, celui qui écrira
-- l'écran) puisse le CITER au lieu de le recopier. Ce dépôt a déjà payé le
-- prix d'une constante dupliquée entre deux runtimes, et le remède retenu est
-- toujours le même: une seule source, et un test qui le prouve.
--
-- `immutable` et pas `stable`: la valeur ne dépend d'aucune ligne.

create or replace function public.keel_household_max_mouths()
returns integer
language sql
immutable
as $function$ select 8 $function$;

comment on function public.keel_household_max_mouths() is
  'Le plafond de bouches d''un foyer. C''est une garde de COÛT (huit bouches = '
  'huit consignes de service à chaque génération LLM), PAS une quantité de '
  'facturation: le foyer entier est à 12,99 €/mois quel que soit ce nombre. '
  'Ne pas confondre avec keel_household_billable_profiles.';

revoke all on function public.keel_household_max_mouths() from public, anon;
grant execute on function public.keel_household_max_mouths()
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. LA RPC D'AJOUT CITE LE PLAFOND AU LIEU DE LE RECOPIER
-- ---------------------------------------------------------------------------
--
-- Corps IDENTIQUE à 20260810120000 à une ligne près: `>= 8` devient
-- `>= public.keel_household_max_mouths()`. Le motif rendu ne change pas —
-- `household_full` est déjà traduit à l'écran (i18n `household.error.*`) et le
-- renommer casserait une copie livrée.

create or replace function public.keel_household_add_member(
  p_first_name text,
  p_birth_date date default null,
  p_goal text default null
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
  v_first text := btrim(coalesce(p_first_name, ''));
  v_count integer;
  v_member uuid;
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
  if char_length(v_first) < 1 or char_length(v_first) > 40 then
    return jsonb_build_object('ok', false, 'reason', 'bad_first_name');
  end if;
  if p_goal is not null and p_goal not in (
    'fat_loss', 'muscle_gain', 'recomposition',
    'performance', 'health', 'maintenance'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'bad_goal');
  end if;
  if p_birth_date is not null and p_birth_date > current_date then
    return jsonb_build_object('ok', false, 'reason', 'bad_birth_date');
  end if;

  -- LE PLAFOND, EN BASE ET PAS À L'ÉCRAN (lot 7). « Une limite d'UI n'est pas
  -- une limite »: il doit tenir face à un appel direct de la RPC. Il compte les
  -- BOUCHES — toutes, comptes ou pas — et n'a rien à voir avec ce qui est
  -- facturé (section 3).
  select count(*) into v_count
  from public.household_members hm
  where hm.household_id = v_household;

  if v_count >= public.keel_household_max_mouths() then
    return jsonb_build_object('ok', false, 'reason', 'household_full');
  end if;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date, goal)
  values
    (v_household, null, 'member', v_first, p_birth_date, p_goal)
  returning member_id into v_member;

  return jsonb_build_object('ok', true, 'member_id', v_member);
end;
$function$;

comment on function public.keel_household_add_member(text, date, text) is
  'Ajoute une bouche SANS COMPTE. Compte maître uniquement, plafond de '
  'keel_household_max_mouths() par foyer. L''âge est facultatif — le flux de '
  'saisie ne se bloque pas — mais sans lui aucune direction d''objectif ne '
  's''applique.';

-- Les privilèges sont ceux de 20260810120000; `create or replace` les conserve.
-- On les rejoue quand même: une réécriture ultérieure qui DROPperait la
-- fonction d'abord les perdrait en silence, et ce fichier est celui qu'on
-- relira pour savoir qui peut ajouter une bouche.
revoke all on function public.keel_household_add_member(text, date, text)
  from public, anon;
grant execute on function public.keel_household_add_member(text, date, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. LE COMPTE FACTURABLE — LA DÉFINITION UNIQUE
-- ---------------------------------------------------------------------------
--
-- Une SEULE fonction, et c'est délibéré: le job de réconciliation, la page de
-- facturation et tout export futur doivent lire le même nombre. `countSeats`
-- côté coach a la même charge, et le commentaire de `keel_coach_seat_ledger`
-- dit pourquoi: « la mettre dans la fonction edge aurait laissé les écrans
-- compter des sièges que Stripe ne facture pas — un écart qui ne se voit qu'à
-- la première facture ».
--
-- `service_role` SEUL, comme `keel_household_roster_for`: la fonction prend un
-- foyer en argument et est `security definer`. Ouverte à `authenticated`, elle
-- rendrait le compte de N'IMPORTE QUEL foyer à qui devine un uuid — une fuite
-- petite mais réelle, et surtout gratuite à éviter. Le jour où un écran doit
-- l'afficher, il lui faut une seconde porte gardée par `auth.uid()`, écrite
-- avec l'écran.
--
-- Une bouche dont le compte a été supprimé ne compte plus non plus, et sans
-- rien de spécial ici: `household_members_user_id_fkey` est
-- `on delete cascade`, donc la LIGNE disparaît avec le compte.
-- ⚠️ Cette cascade est un défaut connu au-delà de la facturation — elle emporte
-- la bouche, ses portions et ses allergies alors que la personne mange encore
-- dans ce foyer. Signalé, pas corrigé ici: le corriger, c'est décider ce que
-- « supprimer son compte » fait au foyer, et ça ne se tranche pas dans une
-- migration de facturation.

create or replace function public.keel_household_billable_profiles(p_household uuid)
returns integer
language sql
stable
security definer
set search_path to ''
as $function$
  select count(*)::integer
  from public.household_members hm
  where hm.household_id = p_household
    -- RÉCLAMÉ = la ligne porte un compte. L'invitation ne compte pas: un lien
    -- envoyé n'est pas un accès, et `household_invitations` n'est pas lue ici.
    and hm.user_id is not null
    -- ET PAS LE MAÎTRE. Son accès est dans les 12,99 € du foyer; le facturer
    -- 2 € de plus produirait 14,99 € pour un foyer d'une personne — un nombre
    -- plausible, donc invisible.
    and hm.role <> 'owner';
$function$;

comment on function public.keel_household_billable_profiles(uuid) is
  'LA QUANTITÉ de l''article « profil réclamé » (+2 €/mois pièce) sur '
  'l''abonnement DU MAÎTRE. Définition unique du dépôt: une ligne membre qui '
  'porte un compte, le maître exclu. Ne compte NI une bouche sans compte, NI '
  'une invitation non réclamée. N''a AUCUN rapport avec '
  'keel_household_max_mouths(), qui est une garde de coût LLM. Aucun appelant '
  'runtime tant que le job de réconciliation du foyer n''est pas écrit — c''est '
  'le geste humain suivant, et il est décrit en tête de cette migration.';

revoke all on function public.keel_household_billable_profiles(uuid)
  from public, anon, authenticated;
grant execute on function public.keel_household_billable_profiles(uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. CE QU'IL RESTE À FAIRE, ET QUI NE PEUT PAS ÊTRE FAIT ICI
-- ---------------------------------------------------------------------------
--
-- Écrit dans le fichier et pas seulement dans un rapport, parce qu'un rapport
-- se perd et qu'une migration se relit. Dans l'ordre:
--
--  1. UN HUMAIN crée DEUX prix Stripe récurrents mensuels:
--       · « Household » — 12,99 €/mois, quantité 1
--       · « Claimed profile » — 2,00 €/mois, quantité réconciliée
--     puis pose leurs identifiants en secrets:
--       STRIPE_PRICE_ID_HOUSEHOLD_MONTHLY
--       STRIPE_PRICE_ID_HOUSEHOLD_PROFILE_MONTHLY
--     (`supabase secrets set` est bloqué pour les agents; c'est un geste
--      humain, comme il l'était pour les sièges coach en W10.1.)
--
--  2. LE PALIER. `subscriptions_tier_check` n'admet aujourd'hui que 'coach' et
--     les trois paliers grand public morts; `profiles_access_tier_check` de
--     même. Vendre un foyer demande un jeton — et surtout de décider ce que
--     reçoit un profil RÉCLAMÉ: un palier hérité, comme 'student' l'est du
--     coach, ou rien. DÉCISION PRODUIT, pas technique.
--
--  3. LE TUNNEL. `stripe-create-checkout-session` a deux formes (grand public
--     legacy, `plan='keel_coach'`); il en faut une troisième,
--     `plan='keel_household'`, avec DEUX articles: le forfait à quantité 1 et
--     le profil réclamé à la quantité rendue par la fonction ci-dessus.
--
--  4. LE JOB. `stripe-reconcile-households`, calqué sur
--     `stripe-reconcile-seats`: il RECOMPUTE (jamais `+1`), écrit la ligne de
--     période AVANT l'appel Stripe, pousse la quantité avec
--     `proration_behavior=none` et une clé d'idempotence, et échoue BRUYAMMENT
--     si le prix n'est pas configuré. Il a besoin d'une table de période — sa
--     forme est celle de `coach_billing_periods`, à écrire avec lui.
--
--  5. LE GATE. Aucun chemin du foyer ne vérifie de solvabilité aujourd'hui
--     (`generate-household-meal-v1` ne lit pas `access_tier`). Tant que ce
--     point n'est pas tranché, le foyer est gratuit quoi qu'il arrive — ce qui
--     est un choix acceptable pendant un pilote, mais un choix, pas un état.

-- ---------------------------------------------------------------------------
-- 5. CONTRÔLE FINAL — ON REJOUE LE COMPTE, PAS LE CATALOGUE
-- ---------------------------------------------------------------------------
--
-- Vérifier que la fonction existe ne prouverait rien. On monte un foyer, on y
-- met une bouche sans compte, on en fait réclamer une par un vrai compte via la
-- vraie chaîne d'invitation, et on regarde le nombre bouger — puis on retire la
-- bouche réclamée et on le regarde redescendre.
--
-- ⚠️ TROIS COMPTES SONT CRÉÉS DANS `auth.users`, puis ANNULÉS: le bloc entier
-- est une sous-transaction qui se termine par un `raise` attrapé.

do $$
declare
  v_owner uuid := 'b111a000-0000-0000-0000-000000000001';
  v_heir  uuid := 'b111a000-0000-0000-0000-000000000002';
  v_house uuid;
  v_lea uuid;
  v_ghost uuid;
  v_res jsonb;
  v_token text;
  v_n integer;
begin
  insert into auth.users (id, email, instance_id, aud, role)
  values
    (v_owner, '__qa_bill_owner@example.invalid',
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (v_heir, '__qa_bill_heir@example.invalid',
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  v_res := public.keel_household_create('__qa_bill__');
  v_house := (v_res->>'household_id')::uuid;

  -- 1. UN FOYER D'UNE SEULE PERSONNE FACTURE ZÉRO PROFIL. Le maître porte un
  --    compte: c'est ICI que la confusion coûterait 2 € par mois et par foyer.
  v_n := public.keel_household_billable_profiles(v_house);
  if v_n <> 0 then
    raise exception
      'billing QA: un foyer d''une personne rend % profil(s) facturable(s) — le '
      'compte MAÎTRE est compté comme un profil réclamé, et tout foyer est '
      'facturé 14,99 € au lieu de 12,99 €', v_n;
  end if;

  -- 2. DEUX BOUCHES SANS COMPTE NE CHANGENT RIEN. C'est la promesse commerciale
  --    « bouches illimitées » rendue vérifiable.
  v_res := public.keel_household_add_member('Lea', (current_date - interval '30 years')::date, null);
  v_lea := (v_res->>'member_id')::uuid;
  v_res := public.keel_household_add_member('Enfant', (current_date - interval '8 years')::date, null);
  v_ghost := (v_res->>'member_id')::uuid;

  v_n := public.keel_household_billable_profiles(v_house);
  if v_n <> 0 then
    raise exception
      'billing QA: % profil(s) facturable(s) pour DEUX bouches sans compte — '
      'une bouche sans compte est facturée alors qu''elle est comprise dans le '
      'forfait', v_n;
  end if;

  -- 3. UNE INVITATION ÉMISE N'EST PAS UN ACCÈS. Le lien part, personne ne l'a
  --    encore réclamé: le compte ne doit pas bouger d'un cran.
  v_res := public.keel_household_invite('__qa_bill_heir@example.invalid', v_lea);
  if (v_res->>'ok')::boolean is not true then
    raise exception 'billing QA: invitation refusée (%)', v_res;
  end if;
  v_token := v_res->>'token';

  v_n := public.keel_household_billable_profiles(v_house);
  if v_n <> 0 then
    raise exception
      'billing QA: % profil(s) facturable(s) sur une invitation NON réclamée — '
      'le maître paie un accès que personne n''a pris', v_n;
  end if;

  -- 4. LA RÉCLAMATION, PAR LA VRAIE RPC. C'est le seul geste qui doit faire
  --    monter le nombre.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_heir, 'role', 'authenticated')::text, true);
  v_res := public.keel_household_join(v_token);
  if (v_res->>'ok')::boolean is not true then
    raise exception 'billing QA: la réclamation a été refusée (%)', v_res;
  end if;

  v_n := public.keel_household_billable_profiles(v_house);
  if v_n <> 1 then
    raise exception
      'billing QA: % profil(s) facturable(s) après UNE réclamation — le +2 € '
      'ne suit pas le geste qui le déclenche', v_n;
  end if;

  -- 5. LE PLAFOND ET LE COMPTE FACTURABLE NE SONT PAS LE MÊME NOMBRE. Trois
  --    bouches, un profil réclamé, un plafond de huit: les trois diffèrent.
  select count(*) into v_n
  from public.household_members where household_id = v_house;
  if v_n <> 3 then
    raise exception 'billing QA: % bouches au lieu de 3', v_n;
  end if;
  if public.keel_household_max_mouths() <> 8 then
    raise exception
      'billing QA: le plafond rend % au lieu de 8 — la RPC d''ajout et ce '
      'contrôle ne parlent plus du même nombre',
      public.keel_household_max_mouths();
  end if;
  if public.keel_household_billable_profiles(v_house)
       = public.keel_household_max_mouths() then
    raise exception
      'billing QA: le compte facturable est égal au plafond — les deux nombres '
      'ont été confondus';
  end if;

  -- 6. LA RÉCLAMATION ANNULÉE REDESCEND. Le maître retire la bouche réclamée
  --    (aujourd'hui le SEUL geste de retrait qui existe, voir l'en-tête).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_res := public.keel_household_remove_member(v_lea);
  if (v_res->>'ok')::boolean is not true then
    raise exception 'billing QA: le retrait a été refusé (%)', v_res;
  end if;

  v_n := public.keel_household_billable_profiles(v_house);
  if v_n <> 0 then
    raise exception
      'billing QA: % profil(s) facturable(s) après retrait — le maître paie '
      'encore un accès qu''il a retiré', v_n;
  end if;

  -- 7. ET LA BOUCHE SANS COMPTE EST TOUJOURS LÀ, non facturée: retirer un
  --    profil réclamé ne vide pas le foyer.
  select count(*) into v_n
  from public.household_members where household_id = v_house;
  if v_n <> 2 then
    raise exception 'billing QA: % bouches après retrait au lieu de 2', v_n;
  end if;
  if v_ghost is null then
    raise exception 'billing QA: la bouche sans compte a perdu son identifiant';
  end if;

  -- 8. LE CLOISONNEMENT. Un foyer inconnu rend 0, jamais le compte du voisin.
  if public.keel_household_billable_profiles(
       '00000000-0000-0000-0000-0000000000ff') <> 0 then
    raise exception 'billing QA: un foyer inexistant rend un compte non nul';
  end if;

  raise notice
    'household_billable_profiles: maître non facturé, bouches sans compte non '
    'facturées, invitation non facturée, réclamation +1, retrait -1, plafond '
    'distinct du compte';
  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;

select set_config('request.jwt.claims', '', true);

commit;
