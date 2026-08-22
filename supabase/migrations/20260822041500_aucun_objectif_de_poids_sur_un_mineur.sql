-- ════════════════════════════════════════════════════════════════════════════
-- S4 — AUCUN OBJECTIF DE POIDS SUR UN MINEUR : LES QUATRE PORTES D'ÉCRITURE
-- ════════════════════════════════════════════════════════════════════════════
--
-- Décision humaine du 2026-08-21 (plan de mise en œuvre, §⑥ n° 15) :
--
--     « Aucun objectif de poids sur un mineur. »
--
-- ⛔ CE FICHIER NE REFERME PAS UNE BRÈCHE : IL POSE LA GARDE, ET POUR LA
--    PREMIÈRE FOIS SUR LES QUATRE PORTES. C'est mesuré, pas déduit.
--    Le 2026-08-22 à 03:54:17 CEST, en transaction `rollback`, sous le jeton
--    d'un maître de foyer, les quatre ordres ont rendu `{"ok": true}` :
--
--      A. add_member('SondeA-S4', 2011-05-20, 'fat_loss')            → ok
--         (date de mineur ET objectif dans le MÊME appel — c'est
--          littéralement ce que `SetupPage.tsx:1592` envoie)
--      B. add_member(sans date, 'fat_loss') puis
--         set_member_birth_date(2011-05-20)                          → ok
--      C. set_member_goal('fat_loss') sur une bouche déjà datée mineure → ok
--      D. set_member_target(45 kg, 0,2 kg/sem) sur une enfant de 15 ans → ok
--      E. C puis D dans le MÊME TOUR, sur la MÊME enfant           → ok + ok
--
--    Le harnais est archivé : `scratchpad/2026-08-22-S4-quatre-surfaces.sql`.
--
-- ⚠️ ET LE LITTÉRAL QU'ON CROYAIT MAINTENIR N'EXISTAIT PAS.
--    `target_not_for_minor` : **0 occurrence** dans `supabase/migrations/`,
--    dans `frontend/src/` et dans `pg_proc`. `goal_not_for_minor`, lui, rend
--    deux occurrences dans `pg_proc` — ce sont **deux COMMENTAIRES**, pas deux
--    gardes (« PLUS DE goal_not_for_minor ICI NON PLUS », « a existé du 13/08
--    au 18/08 »). Le mot était là, la garde ne l'était pas. Ce fichier remet
--    le mot À SA PLACE, sous la forme d'un refus.
--
--
-- ════════════════════════════════════════════════════════════════════════════
-- ⛔ CE FICHIER RENVERSE UNE DÉCISION ÉCRITE, ET LA MIGRATION RENVERSÉE
--    AVAIT POSÉ SA CONDITION : « Ne pas remettre un refus ici sans renverser
--    ces trois-là d'abord. »  (20260818100000, §③, l. 129-150)
--    Les voici, nommées une par une. Aucune n'est enjambée.
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── RAISON 1 — « L'ÉNERGIE RESTE FERMÉE » ─────────────────────────────────
--    Elle disait : `childEnvelopeFromBody` ne prend AUCUN paramètre `goal`,
--    donc un mineur reste en maintenance calculée sur son âge, quoi qu'il y
--    ait dans sa colonne.
--
--    ⚠️ ELLE EST TOUJOURS VRAIE, ET ELLE N'EST PAS RÉFUTÉE ICI. Elle est
--    renversée comme JUSTIFICATION, pas comme fait : elle répond à « qu'est-ce
--    que le moteur FAIT de la colonne », quand la décision n° 15 porte sur
--    « qu'est-ce que le produit DEMANDE et ÉCRIT ». L'énergie fermée
--    n'empêche pas la ligne d'exister, ni d'être LUE ailleurs :
--    `goalApplies` rend `true` pour un mineur depuis le 2026-08-18, et
--    `servingDirectionFor` prononce alors `SERVING_DIRECTION.fat_loss` à
--    table, à la place de `CHILD_DIRECTION`. Un enfant reçoit toujours sa
--    bande de maintenance — et s'entend dire que sa part suit une perte de
--    poids. La bande était la seule chose que la raison 1 protégeait.
--
-- ── RAISON 2 — « LE PLAFOND DU RYTHME EST CALCULÉ SUR SON ÂGE » ───────────
--    Elle disait : `weight_pace.ts` borne l'écart quotidien d'un mineur à 10 %
--    de son besoin estimé (≈ 0,16 kg/sem) au lieu des 500 kcal de l'adulte.
--
--    ⚠️ VRAIE AUSSI, ET ELLE BORNE LE RYTHME EXÉCUTÉ — jamais le rythme ÉCRIT.
--    `keel_household_set_member_target` accepte jusqu'à 1,0 kg/semaine
--    (`household_members_target_pace_range_check`), et 0,2 comme 0,5 ont été
--    acceptés sur une enfant de 15 ans, mesuré ci-dessus. Ce qui est stocké et
--    RELU À L'ÉCRAN n'a jamais traversé ce plafond.
--    ⛔ Et le plafond est conditionné à une donnée que la raison 3 décourage
--    précisément d'avoir : `executedPaceFor` rend `null` sans `body.weightKg`.
--    Mesuré le 2026-08-22 : **30 bouches mineures en base, 9 avec un poids**.
--    Pour les 21 autres, le plafond de la raison 2 ne s'engage JAMAIS — et
--    `set_member_target` écrivait quand même la cible.
--
-- ── RAISON 3 — « LE CORPS D'UN ENFANT N'EST JAMAIS ÉNONCÉ » (FF-047) ──────
--    ⛔ CELLE-LÀ N'EST PAS RENVERSÉE : C'EST ELLE QUI EXIGE CE FICHIER.
--    20260818100000 écrivait d'elle : « Cette garde-là ne bouge pas d'un
--    millimètre » — et laissait ouverte, dans le même commit, la porte qui
--    ÉCRIT un corps d'enfant. `set_member_target(45, 0.2)` inscrit « 45 kg »
--    sur la ligne d'une enfant de 15 ans, dans la colonne
--    `household_members.target_weight_kg`, relisible par tout co-membre du
--    foyer. Une cible de poids EST un énoncé du corps — c'est même le seul
--    énoncé qui compte, puisqu'il dit à la fois où le corps est et où on
--    voudrait qu'il aille. La raison 3 interdisait de le DIRE ; la 4ᵉ porte le
--    STOCKAIT. S4 ne l'affaiblit pas : il l'étend là où elle manquait.
--
-- ⚠️ ET LA QUESTION LAISSÉE OUVERTE LE 2026-08-18 N'EST PAS CELLE-CI. Elle
--    demandait s'il fallait « EN PLUS un accord explicite du maître » pour
--    poser un objectif sur un enfant — une porte de consentement. La décision
--    n° 15 répond à une autre question, et elle la ferme : pas d'objectif de
--    poids du tout. Aucune porte de consentement n'est inventée ici.
--
--
-- ════════════════════════════════════════════════════════════════════════════
-- LES TROIS ARBITRAGES DE CE FICHIER (registre §⑨ n° 60, 61, 62)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ① `maintenance` RESTE OUVERT SUR UN MINEUR. Le refus porte sur les deux
--    objectifs DIRECTIONNELS (`fat_loss`, `muscle_gain`) et sur eux seuls.
--    Trois raisons : (a) c'est la définition que la base donne déjà d'une
--    direction — `household_members_target_needs_direction_check` nomme
--    exactement ces deux-là, et en écrire une seconde serait le doublon de
--    constante que ce dépôt passe son temps à réparer ; (b) l'énergie d'un
--    mineur EST une maintenance calculée sur son âge, donc écrire
--    `maintenance` sur sa ligne n'ajoute rien à ce qui se passe déjà ;
--    (c) une garde qui refuse l'inoffensif se fait retirer. La `mesure AVANT`
--    du lot compte d'ailleurs `fat_loss`/`muscle_gain`, pas `maintenance`.
--
-- ② LA PORTE `B` REFUSE, ELLE N'EFFACE PAS. La fiche autorisait « refus ou
--    effacement nommé ». On refuse, et le critère est celui du §⑨ : la
--    réversibilité. Un refus ne perd rien — le maître retire l'objectif, puis
--    pose la date (chemin vérifié, sonde `P5`). Un effacement écrase une
--    valeur déclarée, et une valeur écrasée ne se défait pas.
--    ⚠️ ET LE REFUS NE PIÈGE PERSONNE : il ne ferme qu'UN sens. Poser une date
--    d'adulte reste ouvert (`P6`), retirer la date reste ouvert, retirer
--    l'objectif reste ouvert. Le seul geste refusé est « cette bouche est en
--    fait une enfant » PENDANT qu'une direction est posée sur elle — et il est
--    refusé avec le mot qui désigne son remède.
--    ⚠️ Le pire cas d'un maître qui abandonne est une bouche SANS date : l'âge
--    vaut alors `unknown`, `goalApplies` rend `false`, et l'enfant reçoit une
--    part standard. La garde échoue du bon côté.
--
-- ③ AUCUN `CHECK` DE TABLE N'EST AJOUTÉ, ET C'EST MESURÉ, PAS PRUDENT.
--    Un `check` « pas de cible sur un mineur » échouerait sur une ligne réelle
--    déjà en base (`Tom`, mineur, `fat_loss`, 32 kg à 0,3 kg/sem) ; en `not
--    valid` il transformerait la moindre correction de prénom sur cette ligne
--    en violation de contrainte. Et il n'est pas nécessaire : mesuré le
--    2026-08-22, le rôle `authenticated` n'a que **SELECT** sur
--    `public.household_members` — aucune policy `update`, aucun `grant`
--    d'écriture. Les quatre fonctions `security definer` ci-dessous sont
--    LA TOTALITÉ des portes d'écriture ouvertes à qui est connecté.
--    ⇒ ⚠️ CE FICHIER NE TOUCHE AUCUNE CONTRAINTE — ni
--    `household_members_target_pace_range_check`, ni
--    `household_members_target_needs_direction_check`. **Le lot `L37`
--    (vague 4) réécrit le premier ; il n'y a donc AUCUN chevauchement entre
--    les deux migrations**, et `L37` peut resserrer la plage du rythme sans
--    relire une ligne de S4. Le seul point de contact est le miroir applicatif
--    de la plage dans `keel_household_set_member_target` (`p_pace > 1`) : si
--    `L37` change la borne, il change LES DEUX, comme aujourd'hui.
--
--
-- ════════════════════════════════════════════════════════════════════════════
-- ⛔ CE FICHIER NE CORRIGE PAS LES LIGNES EXISTANTES, ET C'EST VOULU
-- ════════════════════════════════════════════════════════════════════════════
--
-- Mesuré le 2026-08-22 : **3 bouches mineures portent un objectif
-- directionnel.** Deux appartiennent à des personnes (`Lea`, 2018-04-02,
-- `fat_loss` ; `Tom`, 2014-09-15, `fat_loss`, cible 32 kg à 0,3 kg/sem — même
-- foyer, `4123e479-…`). La troisième est la **fixture `V0-C`** (`Anouk`,
-- 2011-05-20, `muscle_gain`, foyer `b1959752-…`) — pas une personne.
--
-- Un objectif déclaré appartient à la personne qui l'a déclaré. Le retirer
-- d'office serait écrire sur la ligne de quelqu'un pour rendre le passé
-- conforme à une décision d'aujourd'hui — exactement le geste que le §⑨ du
-- plan retire de la délégation. La garde vaut donc pour tout ce qui s'écrit à
-- partir de maintenant, et les trois lignes survivent.
--
-- ⚠️ CONSÉQUENCE À CONNAÎTRE : ces trois lignes restent lues par
-- `goalApplies` et par `servingDirectionFor`. La garde ferme l'ENTRÉE, elle ne
-- nettoie pas le stock.
--
-- ── LA COMMANDE, SI LE PROPRIÉTAIRE VEUT LA LANCER — ⛔ NON LANCÉE ────────
-- Elle n'est PAS exécutée par cette migration. Elle est ici pour être lue,
-- décidée, puis copiée-collée par un humain :
--
--   -- ① VOIR d'abord (aucune écriture) :
--   -- select member_id, first_name, birth_date, goal,
--   --        target_weight_kg, target_pace_kg_per_week, household_id
--   --   from public.household_members
--   --  where public.keel_age_state(birth_date) = 'minor'
--   --    and goal in ('fat_loss','muscle_gain');
--   --
--   -- ② PUIS, et seulement si c'est décidé, la cible AVANT l'objectif —
--   --    l'ordre inverse violerait `..._target_needs_direction_check` :
--   -- begin;
--   -- update public.household_members
--   --    set target_weight_kg = null, target_pace_kg_per_week = null
--   --  where public.keel_age_state(birth_date) = 'minor'
--   --    and goal in ('fat_loss','muscle_gain');
--   -- update public.household_members
--   --    set goal = null
--   --  where public.keel_age_state(birth_date) = 'minor'
--   --    and goal in ('fat_loss','muscle_gain');
--   -- commit;
--
-- ⚠️ Et la 3ᵉ ligne (`Anouk`) n'est PAS dans le même cas : c'est une fixture
-- de banc. Le script qui la rebâtit est traité à part
-- (`scripts/2026-08-21-2300-fixture-v0c-foyer-pluriel.ts`), et il ÉCHOUE
-- BRUYAMMENT depuis ce lot au lieu de poser une ligne que la base refuse.
-- ⛔ AUCUNE EXCEPTION POUR LA FIXTURE N'EST ÉCRITE ICI : une garde à exception
-- n'est pas une garde.
--
--
-- ── L'ÂGE VIENT D'UN SEUL ENDROIT ────────────────────────────────────────
-- `public.keel_age_state` reste la seule borne des dix-huit ans du dépôt.
-- Aucun `current_date - interval '18 years'` n'est réécrit ici : une seconde
-- définition de la minorité divergerait au premier ajustement.
-- ⚠️ Et `unknown` NE SUIT PAS `minor`. Une bouche sans date, ou avec une date
-- aberrante, n'est PAS refusée : « je ne sais pas » et « c'est un enfant » ne
-- sont pas la même phrase, et `goalApplies` rend déjà `false` pour la
-- première. Refuser sur `unknown` fermerait l'objectif de tout adulte dont on
-- n'a pas encore la date — c'est-à-dire le cas courant de l'entonnoir.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ══════════════════════════════════════════════════════════════════════════
-- ① LA PORTE `A` — L'AJOUT. Date et objectif dans le même appel.
-- ══════════════════════════════════════════════════════════════════════════
create or replace function public.keel_household_add_member(
  p_first_name text,
  p_birth_date date default null,
  p_goal text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $fn$
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
  if p_goal is not null and p_goal not in ('fat_loss', 'maintenance', 'muscle_gain') then
    return jsonb_build_object('ok', false, 'reason', 'bad_goal');
  end if;
  if p_birth_date is not null and p_birth_date > current_date then
    return jsonb_build_object('ok', false, 'reason', 'bad_birth_date');
  end if;

  -- ── S4, 2026-08-21 (§⑥ n° 15) — LA GARDE REVIENT, ET ELLE EST NEUVE ────
  -- Elle a existé du 13/08 au 18/08 sur cette porte, puis a été RETIRÉE avec
  -- trois raisons écrites. L'en-tête de CE fichier les nomme et dit pourquoi
  -- elles ne tiennent plus le geste qu'on ferme ici — la plus courte est que
  -- la raison 3 (« le corps d'un enfant n'est jamais énoncé ») exige ce refus
  -- au lieu de s'y opposer.
  --
  -- ⚠️ C'EST LA PORTE QUE L'ÉCRAN UTILISE, ET EN UN SEUL APPEL. Une garde
  -- posée seulement sur `set_member_goal` aurait laissé passer le geste réel
  -- de l'entonnoir (`SetupPage.tsx:1592`) et aurait PARU armée.
  if p_goal in ('fat_loss', 'muscle_gain')
     and public.keel_age_state(p_birth_date) = 'minor' then
    return jsonb_build_object('ok', false, 'reason', 'goal_not_for_minor');
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
$fn$;

-- ══════════════════════════════════════════════════════════════════════════
-- ② LA PORTE `C` — L'OBJECTIF POSÉ SUR UNE BOUCHE QUI EXISTE DÉJÀ.
-- ══════════════════════════════════════════════════════════════════════════
create or replace function public.keel_household_set_member_goal(
  p_member uuid,
  p_goal text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_role text;
  v_target record;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  -- TROIS VALEURS DEPUIS LE 2026-08-18. Un client plus vieux qui enverrait
  -- encore `health` reçoit `bad_goal` — un refus NOMMÉ, jamais un repli muet:
  -- replier ici écrirait `maintenance` sur quelqu'un qui a cliqué « santé »
  -- sans que personne le lui dise. Le repli est le geste d'UNE migration, pas
  -- celui d'une porte d'écriture.
  if p_goal is not null and p_goal not in ('fat_loss', 'maintenance', 'muscle_gain') then
    return jsonb_build_object('ok', false, 'reason', 'bad_goal');
  end if;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;

  -- ⚠️ `birth_date` ENTRE DANS LA LECTURE (S4). Elle n'y était pas: la porte
  -- n'avait aucun moyen de savoir l'âge de la ligne qu'elle écrivait.
  select hm.member_id, hm.user_id, hm.birth_date into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  -- L'ORDRE DES DEUX REFUS EST LA RÈGLE. `not_your_line` d'abord: un secondaire
  -- qui vise la ligne d'un enfant doit s'entendre dire qu'il n'est pas chez lui,
  -- pas qu'il faudrait passer par un « about you » que l'enfant n'a pas.
  if v_role <> 'owner' and v_target.user_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'reason', 'not_your_line');
  end if;

  -- D1. La bouche a un compte: son objectif vit dans SON « about you ».
  if v_target.user_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'has_account');
  end if;

  -- ── S4, 2026-08-21 (§⑥ n° 15) — LE REFUS D'ÂGE REVIENT ICI AUSSI ───────
  -- ⚠️ ET IL REVIENT SUR LES DEUX PORTES DANS LE MÊME COMMIT, exactement pour
  -- la raison que la migration du 18/08 donnait de les OUVRIR ensemble: « une
  -- garde levée sur une seule laisserait l'autre fermée, et c'est toujours
  -- celle qu'on n'a pas regardée qui sert. » La phrase vaut dans les deux sens.
  --
  -- `p_goal = null` PASSE — retirer un objectif d'un enfant est le remède que
  -- ce refus désigne, et le fermer rendrait la garde inhabitable.
  -- `maintenance` PASSE aussi: voir l'arbitrage ① de l'en-tête.
  if p_goal in ('fat_loss', 'muscle_gain')
     and public.keel_age_state(v_target.birth_date) = 'minor' then
    return jsonb_build_object('ok', false, 'reason', 'goal_not_for_minor');
  end if;

  update public.household_members
     set goal = p_goal
   where member_id = p_member;

  return jsonb_build_object('ok', true);
end;
$fn$;

-- ══════════════════════════════════════════════════════════════════════════
-- ③ LA PORTE `B` — LA DATE POSÉE APRÈS L'OBJECTIF. LE DÉTOUR TEMPOREL.
-- ══════════════════════════════════════════════════════════════════════════
create or replace function public.keel_household_set_member_birth_date(
  p_member uuid,
  p_birth_date date
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_role text;
  v_target record;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  -- La même garde qu'à l'ajout: une date future est un lapsus de saisie, pas
  -- une bouche. La refuser ici évite qu'elle devienne un `unknown` silencieux.
  if p_birth_date is not null and p_birth_date > current_date then
    return jsonb_build_object('ok', false, 'reason', 'bad_birth_date');
  end if;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;

  -- ⚠️ `goal` ENTRE DANS LA LECTURE (S4). Sans lui, cette porte écrivait un
  -- âge sans jamais savoir ce qu'il rendait applicable.
  select hm.member_id, hm.user_id, hm.goal into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;
  if v_role <> 'owner' and v_target.user_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'reason', 'not_your_line');
  end if;

  -- ── S4, 2026-08-21 (§⑥ n° 15) — LA GARDE DE L'ORDRE ────────────────────
  -- ⛔ C'EST CELLE-CI QUI ARME LES TROIS AUTRES. Sans elle, la garde entière
  -- se contourne en deux appels — objectif d'abord, date ensuite — et
  -- RESSEMBLE à une garde qui marche.
  --
  -- ⚠️ ON REFUSE, ON N'EFFACE PAS (arbitrage ② de l'en-tête). Le refus perd
  -- zéro donnée et nomme son remède: retirer l'objectif, puis reposer la date.
  -- Il ne ferme qu'un sens — poser une date d'ADULTE, ou retirer la date,
  -- restent ouverts sur une bouche qui porte une direction.
  if public.keel_age_state(p_birth_date) = 'minor'
     and v_target.goal in ('fat_loss', 'muscle_gain') then
    return jsonb_build_object('ok', false, 'reason', 'goal_not_for_minor');
  end if;

  update public.household_members
     set birth_date = p_birth_date
   where member_id = p_member;

  return jsonb_build_object('ok', true);
end;
$fn$;

-- ══════════════════════════════════════════════════════════════════════════
-- ④ LA PORTE `D` — LA CIBLE CHIFFRÉE. ⛔ CELLE QUE LE PLAN NE NOMMAIT NULLE
--    PART, ET LA SEULE QUI ÉCRIVE UN CORPS D'ENFANT.
-- ══════════════════════════════════════════════════════════════════════════
create or replace function public.keel_household_set_member_target(
  p_member uuid,
  p_target_weight_kg numeric,
  p_pace_kg_per_week numeric
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_role text;
  v_target_member uuid;
  v_goal text;
  v_birth date;
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
  -- COMPTE MAÎTRE SEUL, comme le corps. Le poids visé de quelqu'un qui a un
  -- compte vit dans SA ligne `student_goals`, et un secondaire n'a rien à
  -- poser sur la ligne d'un enfant.
  if v_role <> 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  -- ⚠️ `birth_date` ENTRE DANS LA LECTURE (S4).
  select hm.member_id, hm.goal, hm.birth_date
    into v_target_member, v_goal, v_birth
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target_member is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  -- LES DEUX, OU AUCUN.
  if (p_target_weight_kg is null) <> (p_pace_kg_per_week is null) then
    return jsonb_build_object('ok', false, 'reason', 'target_incomplete');
  end if;

  if p_target_weight_kg is not null then
    -- ── S4, 2026-08-21 (§⑥ n° 15) — `target_not_for_minor` NAÎT ICI ──────
    -- ⛔ ET ELLE N'EST PAS REDONDANTE AVEC LES TROIS AUTRES, mesuré: les
    -- gardes d'objectif ferment l'AVENIR, elles ne nettoient pas le stock.
    -- Les 2 lignes réelles déjà en base portent une direction; sans ce test
    -- d'âge, `target_needs_direction` les laisserait passer et une cible
    -- chiffrée s'écrirait encore sur une enfant. C'est exactement le 5ᵉ ordre
    -- mesuré (`C` puis `D`, même tour, `ok` + `ok`) — le seul garde-fou de
    -- cette porte était une direction que la porte d'à côté fournissait.
    --
    -- ⚠️ LE TEST EST DANS LE BLOC `not null`, EXPRÈS. Effacer une cible
    -- (`null, null`) sur un mineur reste OUVERT — c'est le geste qui répare
    -- les lignes existantes, et le fermer rendrait le stock inaltérable.
    --
    -- ⚠️ ET IL PASSE DEVANT LES BORNES DE PLAGE: à une enfant, on ne répond
    -- pas « ce poids est hors bornes », qui suggère qu'un autre chiffre
    -- passerait. Aucun ne passe.
    if public.keel_age_state(v_birth) = 'minor' then
      return jsonb_build_object('ok', false, 'reason', 'target_not_for_minor');
    end if;

    if p_target_weight_kg < 25 or p_target_weight_kg > 400 then
      return jsonb_build_object('ok', false, 'reason', 'bad_target_weight');
    end if;
    -- ⚠️ MIROIR APPLICATIF DE `household_members_target_pace_range_check`. Le
    -- lot `L37` (vague 4) réécrit ce CHECK: il doit changer LES DEUX, ici et
    -- dans la contrainte. S4 ne touche pas la contrainte.
    if p_pace_kg_per_week <= 0 or p_pace_kg_per_week > 1 then
      return jsonb_build_object('ok', false, 'reason', 'bad_pace');
    end if;
    -- MIROIR DU CHECK, ET REFUS NOMMÉ PLUTÔT QUE VIOLATION DE CONTRAINTE. Sans
    -- ce test, `household_members_target_needs_direction_check` remonterait une
    -- erreur PostgreSQL brute à l'écran; ici l'écran reçoit un jeton qu'il sait
    -- traduire, et il peut le dire À CÔTÉ du champ.
    if v_goal is null or v_goal not in ('fat_loss', 'muscle_gain') then
      return jsonb_build_object('ok', false, 'reason', 'target_needs_direction');
    end if;
  end if;

  update public.household_members
     set target_weight_kg = p_target_weight_kg,
         target_pace_kg_per_week = p_pace_kg_per_week
   where member_id = p_member;

  return jsonb_build_object('ok', true, 'member_id', p_member);
end;
$fn$;

-- ══════════════════════════════════════════════════════════════════════════
-- ⑤ LES DROITS, RÉAFFIRMÉS — ⛔ `revoke all`, PAS UNE LISTE NOMMÉE.
-- ══════════════════════════════════════════════════════════════════════════
--
-- `create or replace function` conserve l'ACL existante ; on ne s'en remet pas
-- à ça. `S6` vient de mesurer (2026-08-22) qu'une liste NOMMÉE de privilèges
-- laisse `MAINTAIN` derrière elle : on révoque TOUT, puis on redonne les deux
-- exécutions que le produit utilise réellement. État mesuré avant ce fichier
-- et reconduit à l'identique : `anon` n'a AUCUN `execute` sur les quatre.
revoke all on function public.keel_household_add_member(text, date, text) from public, anon;
revoke all on function public.keel_household_set_member_goal(uuid, text) from public, anon;
revoke all on function public.keel_household_set_member_birth_date(uuid, date) from public, anon;
revoke all on function public.keel_household_set_member_target(uuid, numeric, numeric) from public, anon;

grant execute on function public.keel_household_add_member(text, date, text) to authenticated, service_role;
grant execute on function public.keel_household_set_member_goal(uuid, text) to authenticated, service_role;
grant execute on function public.keel_household_set_member_birth_date(uuid, date) to authenticated, service_role;
grant execute on function public.keel_household_set_member_target(uuid, numeric, numeric) to authenticated, service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- ⑥ LES COMMENTAIRES — ⛔ TROIS D'ENTRE EUX DEVIENDRAIENT FAUX SANS CE BLOC.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ CE DÉPÔT A DÉJÀ PAYÉ CE DÉFAUT DANS L'AUTRE SENS : « une contrainte
-- documentée survit à sa cause ». Ici c'est une ABSENCE documentée qui
-- survivrait à sa cause. `20260819140000` a écrit, en toutes lettres, sur
-- `keel_household_add_member` :
--
--     « ⚠️ `goal_not_for_minor` N'EXISTE PLUS depuis le 2026-08-18 »
--
-- et `keel_household_set_member_goal` porte « le refus `goal_not_for_minor`
-- du 2026-08-13 est LEVÉ ». Laisser ces deux phrases en place produirait
-- exactement le piège que la fiche `S4` signale : un `\df+` ou un grep de
-- `prosrc` rendrait le mot, et le lecteur conclurait le contraire de la
-- vérité. La quatrième porte, elle, n'avait AUCUN commentaire — elle en a un
-- maintenant, parce qu'elle porte désormais un refus.

comment on function public.keel_household_add_member(text, date, text) is
  'Ajoute une bouche SANS COMPTE au foyer du maître. Refuse `not_owner`, '
  '`household_full` (plafond en base), `bad_first_name`, `bad_birth_date`, '
  '`bad_goal` et `goal_not_for_minor`. '
  '⛔ `goal_not_for_minor` EST DE RETOUR DEPUIS LE 2026-08-22 (lot `S4`), '
  'après avoir existé du 13/08 au 18/08 puis été levé. Il refuse `fat_loss` '
  'et `muscle_gain` — jamais `maintenance`, jamais `null` — quand '
  '`keel_age_state(p_birth_date)` vaut `minor`. ⚠️ CETTE PORTE EST CELLE QUE '
  'L''ÉCRAN UTILISE, ET EN UN SEUL APPEL (`SetupPage.tsx`): une garde posée '
  'seulement sur `keel_household_set_member_goal` aurait laissé passer le '
  'geste réel de l''entonnoir en PARAISSANT armée. Les trois raisons du '
  'renversement du 18/08 sont nommées une par une dans l''en-tête de '
  '`20260822041500`; la plus courte est que FF-047 (« le corps d''un enfant '
  'n''est jamais énoncé ») EXIGE ce refus au lieu de s''y opposer. '
  '⛔ ELLE NE PREND PAS DE RYTHME, ET C''EST DÉLIBÉRÉ DEPUIS LE 2026-08-19. '
  'Une direction posée ici sans cran est dimensionnée par le MOTEUR, qui '
  'dérive `DEFAULT_PACE_KG_PER_WEEK` à la lecture et le dit '
  '(`box_sizing.mouths.sized_default_pace`). N''écris JAMAIS un cran par '
  'défaut dans `target_pace_kg_per_week`: il deviendrait indiscernable d''un '
  'cran choisi, `keel_household_set_member_target(_, null, null)` l''effacerait '
  'comme un retrait volontaire, et il serait posé sans le corps sur lequel le '
  'plafond réel se calcule (`paceCeilingFor`).';

comment on function public.keel_household_set_member_goal(uuid, text) is
  'Pose la direction nutritionnelle d''une bouche SANS COMPTE. Le maître écrit '
  'celle de n''importe laquelle de son foyer; une bouche qui a réclamé son '
  'profil passe par son « about you » (refus `has_account`). '
  '⛔ UN MINEUR NE PORTE PLUS `fat_loss` NI `muscle_gain` DEPUIS LE 2026-08-22 '
  '(lot `S4`, décision §⑥ n° 15): refus `goal_not_for_minor`. `maintenance` et '
  '`null` PASSENT — l''énergie d''un mineur EST une maintenance calculée sur '
  'son âge, et retirer un objectif est le remède que le refus de '
  '`keel_household_set_member_birth_date` désigne. '
  '⚠️ HISTOIRE, PARCE QU''ELLE SE RELIT MAL: refus posé le 13/08, LEVÉ le '
  '18/08 avec trois raisons écrites, REPOSÉ le 22/08 après que les quatre '
  'portes ont été mesurées ouvertes en transaction `rollback`. Les trois '
  'raisons sont renversées NOMMÉMENT dans l''en-tête de `20260822041500`. '
  'Le vocabulaire est à trois valeurs; un jeton retiré est refusé `bad_goal`, '
  'jamais replié en silence.';

comment on function public.keel_household_set_member_birth_date(uuid, date) is
  'Pose (ou retire) la date de naissance d''une bouche du foyer. Le maître '
  'écrit celle de n''importe laquelle; un secondaire, la sienne seulement '
  '(`not_your_line`). Une date FUTURE est refusée `bad_birth_date`. '
  '⛔ ET DEPUIS LE 2026-08-22 (lot `S4`), UNE DATE DE MINEUR EST REFUSÉE '
  '`goal_not_for_minor` QUAND LA LIGNE PORTE DÉJÀ `fat_loss` OU `muscle_gain`. '
  'C''EST CETTE GARDE-LÀ QUI ARME LES TROIS AUTRES: sans elle, l''interdit se '
  'contourne en deux appels — objectif d''abord, date ensuite — et RESSEMBLE à '
  'une garde qui marche. '
  '⚠️ ON REFUSE, ON N''EFFACE PAS: un refus ne perd aucune donnée déclarée, et '
  'il nomme son remède (retirer l''objectif, puis reposer la date). Il ne '
  'ferme qu''UN sens — poser une date d''ADULTE, ou retirer la date, restent '
  'ouverts sur une bouche qui porte une direction. '
  '⚠️ `null` remet l''âge à `unknown`, donc RETIRE l''application de '
  'l''objectif (`goalApplies`) sans toucher la colonne `goal`.';

comment on function public.keel_household_set_member_target(uuid, numeric, numeric) is
  'Le poids visé ET le rythme d''une bouche SANS COMPTE — les deux ensemble, '
  'ou les deux à NULL (ce qui EFFACE, et c''est nécessaire: repasser en '
  '`maintenance` rend la ligne inécrivable tant que la cible est là). '
  '⛔ `target_not_for_minor` DEPUIS LE 2026-08-22 (lot `S4`): aucune cible '
  'chiffrée sur une bouche dont `keel_age_state` vaut `minor`. Une cible de '
  'poids EST un énoncé du corps, et FF-047 interdit d''énoncer celui d''un '
  'enfant. ⚠️ CE TEST N''EST PAS REDONDANT AVEC LES GARDES D''OBJECTIF: '
  'elles ferment l''avenir, elles ne nettoient pas le stock — les lignes '
  'mineures déjà porteuses d''une direction passeraient `target_needs_direction` '
  'sans lui. Il est DANS le bloc `not null`, exprès: effacer une cible sur un '
  'mineur reste ouvert, sinon le stock serait inaltérable. Et il passe DEVANT '
  'les bornes de plage: à une enfant on ne répond pas « ce poids est hors '
  'bornes », qui suggère qu''un autre chiffre passerait. '
  '`target_needs_direction` est le miroir NOMMÉ du CHECK: sans lui, une cible '
  'posée sur `maintenance` remonterait une violation de contrainte PostgreSQL '
  'au milieu d''un entonnoir d''accueil. Le plafond ADAPTÉ à la personne (le '
  'plus petit des trois nombres de `weight_pace.ts`) ne peut pas s''écrire ici '
  '— il dépend d''un corps que cette porte ne lit pas; c''est `paceCeilingFor` '
  'qui décide du cran affiché, et ce plafond-ci est la borne grossière qui '
  'tient face à un appel direct.';

comment on column public.household_members.target_weight_kg is
  'Le poids visé d''une bouche SANS COMPTE, DÉCLARÉ — jamais dérivé. N''existe '
  'que pour `fat_loss` et `muscle_gain`: sur `maintenance` la balance ne bouge '
  'pas, et sur une bouche sans direction il n''y a rien à viser. '
  '⛔ ET PLUS JAMAIS SUR UN MINEUR depuis le 2026-08-22 (lot `S4`, refus '
  '`target_not_for_minor` de `keel_household_set_member_target`). ⚠️ LA '
  'MIGRATION N''A PAS CORRIGÉ L''EXISTANT: des lignes mineures antérieures '
  'peuvent encore porter une cible, et ce sont des DÉCLARATIONS qui '
  'appartiennent à qui les a faites. Le refus d''une cible sous le plancher '
  'd''énergie est NOMMÉ et vit dans `weight_pace.ts` (`below_energy_floor`), '
  'pas ici: il demande un corps qu''un CHECK ne peut pas lire.';

commit;
