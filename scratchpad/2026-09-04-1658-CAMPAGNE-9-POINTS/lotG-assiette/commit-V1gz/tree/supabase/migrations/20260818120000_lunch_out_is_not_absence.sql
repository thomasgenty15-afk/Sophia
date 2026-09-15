-- ============================================================================
-- L3 — « DEHORS » N'EST PAS « ABSENT »
--
-- Décidé le 2026-08-18. Autorité:
-- scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md §2.2 et §2.2 bis.
-- Elle prolonge D14 (20260812130000) sans rien lui retirer.
--
-- LE PROBLÈME QU'ON FERME
--   La grille de présence a DEUX états: à table, ou pas. Or « pas » recouvre
--   deux situations qui ne se ressemblent que sur un point:
--
--     À TABLE   le plan compose une part.
--     DEHORS    le plan ne compose rien, MAIS il a le droit de dire un nombre
--               (« au déjeuner, vise autour de 700 »).
--     ABSENT    le plan ne compose rien ET ne dit rien: la personne n'est pas
--               dans sa semaine.
--
--   Les deux derniers produisent la même chose côté casserole (aucune part), ce
--   qui les rend faciles à confondre. CE QUI LES SÉPARE EST CE QUE LE PRODUIT
--   DIT. Les confondre fait l'une des deux fautes: taire le conseil du midi de
--   quelqu'un qui déjeune dehors tous les jours, ou faire apparaître un conseil
--   chiffré au milieu de ses vacances.
--
-- LA FORME (et pourquoi elle n'est ni une colonne ni une table de plus)
--   Une CLÉ `kind` SUR L'ENTRÉE d'absence, dans la colonne qui existe déjà:
--
--     [{"day":"tue","slots":["lunch"],"kind":"eating_out"}]
--
--   · `parseAwayDays` ne lit que `day` et `slots`. Le jeton lui est donc
--     invisible, exactement comme `source` (D14) — le moteur compte la même
--     absence qu'hier, la consigne est identique au caractère près, et ce lot
--     ne touche pas au prompt.
--   · `keel_away_tagged` propage l'entrée ENTIÈRE (`e || {"source":…}`): le
--     jeton traverse le roster sans une ligne de plus, et l'UNION des deux
--     sources reste la concaténation.
--   · Une ligne `away_days` écrite AVANT ce lot n'a pas de jeton, et reste
--     valide: sans jeton on lit `away`, c'est-à-dire le silence — très
--     exactement ce que le produit faisait hier. On ne nettoie rien.
--
-- LA QUESTION HEBDOMADAIRE (§2.2), ET LA RÈGLE QUI GOUVERNE TOUT LE LOT
--   « La semaine, est-ce qu'il/elle mange au bureau ? » → gamelle ou dehors ? →
--   micro-ondes au bureau ? Elle se pose PAR PERSONNE et POUR LES MAJEURS
--   SEULEMENT — l'âge se déduit de la date de naissance, jamais redemandé.
--
--     réponse hebdo ──PRÉ-REMPLIT──► la grille ──DÉCIDE──► la composition
--
--   La réponse décrit une semaine ORDINAIRE; elle ne décide pas de ce mardi-là.
--   Si quelqu'un est marqué présent à table un midi dans la grille, il est
--   présent. Une réponse qui ne se laisserait pas contredire ferait disparaître
--   un repas que quelqu'un vient de déclarer à la main — le défaut le plus
--   frustrant qui soit, parce qu'on a fait le geste et qu'il n'a rien changé.
--
--   D'OÙ LA POSITION DU PRÉ-REMPLISSAGE, et c'est le seul arbitrage technique
--   de cette migration: il est appliqué UNE FOIS, À L'ÉCRITURE DE LA RÉPONSE,
--   dans la même transaction. Il n'est JAMAIS re-dérivé à la lecture. Un
--   pré-remplissage recalculé à chaque affichage remettrait « dehors » sur le
--   midi qu'on vient de décocher, à chaque fois.
--
--   Et il ne touche QUE les midis de semaine marqués « dehors »: une absence
--   marquée à la main n'est jamais retirée par une réponse de formulaire.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS
--   · Aucun chiffre. Ni cible, ni kcal, ni phrase: elle rend la distinction
--     LISIBLE, le conseil appartient à ceux qui savent le calculer.
--   · Aucun changement de prompt.
--   · Aucune nouvelle table — donc rien à réclamer au lifecycle RGPD: la
--     colonne vit sur `household_members`, déjà réclamée.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. LE VOCABULAIRE DU TROISIÈME ÉTAT, TENU EN BASE
-- ---------------------------------------------------------------------------
--
-- ⚠️ UNE SECONDE CONTRAINTE, PAS UNE RÉÉCRITURE DE CELLE DE D14. Celle-ci
-- garde la FORME (tableau, plafond 42) et n'a aucune raison de bouger; ce qu'on
-- ajoute est un VOCABULAIRE. Les séparer rend le refus lisible dans le message
-- d'erreur, et permet d'en retirer un sans toucher à l'autre.
--
-- POURQUOI UN VOCABULAIRE FERMÉ ALORS QUE LE JOUR, LUI, EST TOLÉRÉ.
-- `parseAwayDays` écarte un jour inconnu et garde le reste: une faute de frappe
-- ne doit pas faire tomber une déclaration entière. Un `kind` inconnu, lui, ne
-- fait rien tomber du tout — il est lu `away`, donc la ligne reste une absence.
-- Le laisser passer écrirait en base un jeton que personne ne lit, et la
-- prochaine session le prendrait pour un état supporté. C'est la règle du
-- dépôt: aucune valeur d'énumération sans branche nommée.
-- ⚠️ UNE FONCTION, PARCE QU'UNE CONTRAINTE `check` N'ACCEPTE PAS DE
-- SOUS-REQUÊTE (PostgreSQL le refuse à la création, pas à l'écriture). Le
-- prédicat porte sur CHAQUE entrée d'un tableau; il faut donc le replier dans
-- une fonction IMMUTABLE, et c'est le seul moyen honnête de le faire.
create or replace function public.keel_away_kinds_ok(p_away jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $function$
  select coalesce(
    bool_and(
      jsonb_typeof(e) <> 'object'
      or not (e ? 'kind')
      or (e ->> 'kind') in ('away', 'eating_out')
    ),
    -- UN TABLEAU VIDE EST VALIDE, et c'est le cas nominal: `bool_and` sur zéro
    -- ligne rend NULL, qu'une contrainte `check` lit comme « pas faux » donc
    -- accepte — mais s'en remettre à cette subtilité rendrait la garde
    -- dépendante d'une règle SQL que personne ne relit. On le dit.
    true
  )
  from jsonb_array_elements(
    case when jsonb_typeof(p_away) = 'array' then p_away else '[]'::jsonb end
  ) as e;
$function$;

comment on function public.keel_away_kinds_ok(jsonb) is
  'Vrai quand aucune entrée d''absence ne porte un `kind` hors du vocabulaire '
  'fermé (away | eating_out). L3, 2026-08-18. Une entrée SANS `kind` est '
  'valide: c''est la forme d''avant ce lot, et elle se lit `away`.';

alter table public.household_members
  drop constraint if exists household_members_away_days_kind_check;
alter table public.household_members
  add constraint household_members_away_days_kind_check
  check (public.keel_away_kinds_ok(away_days));

comment on constraint household_members_away_days_kind_check
  on public.household_members is
  'Le jeton `kind` d''une entrée d''absence est FERMÉ: away | eating_out '
  '(L3, 2026-08-18). ABSENT EST PERMIS, et c''est ce qui rend les lignes '
  'd''avant ce lot valides — sans jeton on lit `away`, le silence, qui est ce '
  'que le produit faisait hier. Un jeton inconnu est refusé À L''ÉCRITURE '
  'parce qu''il ne casserait rien à la lecture (il serait lu `away`): il '
  'dormirait en base jusqu''à ce que quelqu''un le prenne pour un état '
  'supporté.';

-- ---------------------------------------------------------------------------
-- 2. LA RÉPONSE HEBDOMADAIRE — UNE COLONNE, PAS UNE TABLE
-- ---------------------------------------------------------------------------
--
-- L'écart avec `household_member_habits` (G1, une table) est assumé et il tient
-- aux trois raisons que G1 nommait, dont AUCUNE ne vaut ici:
--   · pas de texte libre écrit par une personne sur elle-même;
--   · pas d'auteur à retenir (« qui a dit que tu déjeunes dehors » n'est pas
--     une question, contrairement à « qui a écrit ce que je mange »);
--   · le volume n'est pas nul mais il est BORNÉ à un objet de trois clés.
-- Une colonne se retire par `drop column`; c'est le bon prix pour ça.
--
-- `null` = LA QUESTION N'A JAMAIS ÉTÉ POSÉE, et ce n'est pas « non ». Le
-- défaut `'{}'::jsonb` aurait rendu les deux indiscernables, et l'écran ne
-- saurait plus s'il doit poser la question.
alter table public.household_members
  add column if not exists work_lunch jsonb;

-- LA FORME EST TENUE EN BASE, PAS SEULEMENT PAR LE PARSEUR — même raison que
-- D14: `parseWorkLunch` rend `null` pour tout ce qui n'est pas lisible, donc un
-- tableau rangé ici se lirait « jamais demandé ». Quelqu'un aurait répondu, et
-- rien ne se serait passé, sans une erreur nulle part.
alter table public.household_members
  drop constraint if exists household_members_work_lunch_check;
alter table public.household_members
  add constraint household_members_work_lunch_check
  check (
    work_lunch is null
    or (
      jsonb_typeof(work_lunch) = 'object'
      and jsonb_typeof(work_lunch -> 'at_work') = 'boolean'
      and (
        work_lunch -> 'mode' is null
        or (work_lunch ->> 'mode') in ('lunchbox', 'outside')
      )
      and (
        work_lunch -> 'microwave' is null
        or jsonb_typeof(work_lunch -> 'microwave') = 'boolean'
      )
    )
  );

comment on column public.household_members.work_lunch is
  'LA RÉPONSE HEBDOMADAIRE DE §2.2 (L3, 2026-08-18): {"at_work":true,'
  '"mode":"lunchbox|outside","microwave":true|false}. `null` = LA QUESTION '
  'N''A JAMAIS ÉTÉ POSÉE — ce n''est pas « non ». Elle ne se pose qu''aux '
  'MAJEURS, et l''âge se déduit de la date de naissance '
  '(keel_household_member_age), jamais redemandé. '
  'CE QU''ELLE FAIT: elle PRÉ-REMPLIT la grille (les midis de semaine passent '
  'à « dehors » quand mode=outside), elle ne la DÉCIDE pas — la grille gagne '
  'toujours (§2.2 bis). Le pré-remplissage est appliqué UNE FOIS, ici, à '
  'l''écriture; le re-dériver à la lecture remettrait « dehors » sur le midi '
  'qu''on vient de décocher. '
  'CE QU''ELLE NE FAIT PAS: `lunchbox` ne produit AUCUNE absence — le plan '
  'compose ce repas, il doit seulement être transportable, et bon froid quand '
  'microwave vaut false.';

-- ---------------------------------------------------------------------------
-- 3. LE PRÉ-REMPLISSAGE — UNE FONCTION PURE, POUR QU'IL N'AIT QU'UN AUTEUR
-- ---------------------------------------------------------------------------
--
-- ⚠️ ELLE NE RETIRE JAMAIS UNE ABSENCE. Elle ne touche QUE des entrées qui
-- portent EXACTEMENT la forme qu'elle écrit (un midi de semaine, `eating_out`).
-- C'est ce qui fait qu'une vacance marquée à la main survit à un changement de
-- réponse — et c'est la moitié « la grille décide » de la règle.
--
-- ⚠️ ELLE EST IDEMPOTENTE, et ça n'est pas cosmétique: la même réponse
-- réenregistrée deux fois ne doit pas empiler dix entrées vers le plafond de
-- 42. On RETIRE d'abord, on RÉÉCRIT ensuite.
--
-- Les cinq jours sont ceux de `WORK_WEEK_DAYS`
-- (`_shared/keel/household_presence.ts`), et le créneau est `WORK_LUNCH_SLOT`.
-- La description vit là-bas, le geste vit ici: l'écran peut donc dire ce qui va
-- être coché avant de le cocher, sans refaire le calcul.
create or replace function public.keel_away_with_work_lunch(
  p_away jsonb,
  p_mode text
)
returns jsonb
language sql
immutable
set search_path to ''
as $function$
  select
    coalesce(
      (
        select jsonb_agg(e)
        from jsonb_array_elements(
               case when jsonb_typeof(p_away) = 'array'
                    then p_away else '[]'::jsonb end
             ) as e
        where not (
          jsonb_typeof(e) = 'object'
          and (e ->> 'kind') = 'eating_out'
          and (e ->> 'day') in ('mon', 'tue', 'wed', 'thu', 'fri')
          and (e -> 'slots') = '["lunch"]'::jsonb
        )
      ),
      '[]'::jsonb
    )
    ||
    case
      when p_mode = 'outside' then
        '[{"day":"mon","slots":["lunch"],"kind":"eating_out"},
          {"day":"tue","slots":["lunch"],"kind":"eating_out"},
          {"day":"wed","slots":["lunch"],"kind":"eating_out"},
          {"day":"thu","slots":["lunch"],"kind":"eating_out"},
          {"day":"fri","slots":["lunch"],"kind":"eating_out"}]'::jsonb
      -- `lunchbox` ET « pas au bureau » RETOMBENT ICI, ENSEMBLE, et c'est le
      -- point le plus facile à rater du lot: une GAMELLE est un repas COMPOSÉ.
      -- Le marquer « dehors » retirerait cinq déjeuners du plan de quelqu'un
      -- qui compte précisément sur eux pour remplir sa boîte.
      else '[]'::jsonb
    end;
$function$;

comment on function public.keel_away_with_work_lunch(jsonb, text) is
  'Le PRÉ-REMPLISSAGE de la grille par la réponse hebdomadaire (L3, '
  '2026-08-18). Retire les midis de semaine marqués `eating_out`, puis les '
  'réécrit si et seulement si le mode est `outside`. IDEMPOTENTE. Elle ne '
  'touche AUCUNE autre entrée: une absence marquée à la main survit à tout '
  'changement de réponse, parce que la grille décide et que la réponse ne fait '
  'que pré-remplir. `lunchbox` ne produit rien — le plan compose ce repas.';

-- ---------------------------------------------------------------------------
-- 4. LA PORTE D'ÉCRITURE DE LA RÉPONSE
-- ---------------------------------------------------------------------------
--
-- LA RÈGLE D'ACCÈS EST CELLE DE `keel_household_set_member_away`, MOT POUR MOT:
-- le maître vise n'importe quelle bouche de son foyer, y compris une qui a un
-- compte; un membre non-maître ne vise que SA ligne. Il n'y a donc pas de refus
-- `has_account`, et son absence est un choix: où quelqu'un déjeune est un FAIT
-- que deux personnes peuvent connaître, comme une absence — pas une opinion
-- comme un objectif.
--
-- ⚠️ UN REFUS DE PLUS QUE SES SŒURS: `not_adult`. La question ne se pose qu'aux
-- majeurs (§2.2), et l'âge se DÉDUIT de la date de naissance. Un mineur sans
-- date de naissance rend `unknown`, et `unknown` est refusé aussi: on ne pose
-- pas une question d'adulte à quelqu'un dont on ne sait pas s'il en est un.
-- C'est la direction sûre, la même que partout ailleurs sur l'âge dans ce
-- dépôt.
create or replace function public.keel_household_set_member_work_lunch(
  p_member uuid,
  p_work_lunch jsonb
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
  v_target record;
  v_mode text;
  v_next jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  -- `null` EFFACE — « je n'ai finalement rien à dire » doit pouvoir se dire, et
  -- il remet la colonne dans l'état « jamais demandé ». Le pré-remplissage
  -- passe alors par la branche « rien », donc les midis pré-remplis sont
  -- retirés: on ne laisse pas derrière soi des cases dont la cause a disparu.
  if p_work_lunch is not null then
    if jsonb_typeof(p_work_lunch) <> 'object'
       or jsonb_typeof(p_work_lunch -> 'at_work') <> 'boolean' then
      return jsonb_build_object('ok', false, 'reason', 'bad_work_lunch');
    end if;
    if p_work_lunch -> 'mode' is not null
       and (p_work_lunch ->> 'mode') not in ('lunchbox', 'outside') then
      return jsonb_build_object('ok', false, 'reason', 'bad_work_lunch');
    end if;
    if p_work_lunch -> 'microwave' is not null
       and jsonb_typeof(p_work_lunch -> 'microwave') <> 'boolean' then
      return jsonb_build_object('ok', false, 'reason', 'bad_work_lunch');
    end if;
  end if;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  select hm.member_id, hm.user_id, hm.away_days into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  if v_role <> 'owner' and v_target.user_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'reason', 'not_your_line');
  end if;

  if public.keel_household_member_age(p_member) is distinct from 'adult' then
    return jsonb_build_object('ok', false, 'reason', 'not_adult');
  end if;

  -- LE MODE QUI COMPTE EST CELUI D'UNE RÉPONSE COMPLÈTE. « Au bureau » sans
  -- avoir dit gamelle-ou-dehors ne pré-remplit rien: le formulaire se déplie,
  -- et une réponse à moitié descendue ne doit pas décider à la place de la
  -- personne.
  v_mode := case
    when p_work_lunch is not null and (p_work_lunch -> 'at_work') = 'true'::jsonb
      then p_work_lunch ->> 'mode'
  end;

  v_next := public.keel_away_with_work_lunch(v_target.away_days, v_mode);

  -- LE PLAFOND DE D14 EST VÉRIFIÉ ICI, PAS LAISSÉ À LA CONTRAINTE. Une
  -- contrainte violée remonte en erreur SQL brute au navigateur, où elle se
  -- lit « quelque chose a planté » — alors que c'est un refus, et qu'un refus
  -- se nomme.
  if jsonb_array_length(v_next) > 42 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_away');
  end if;

  update public.household_members
     set work_lunch = p_work_lunch,
         away_days = v_next
   where member_id = p_member;

  return jsonb_build_object('ok', true, 'away_days', v_next);
end;
$function$;

comment on function public.keel_household_set_member_work_lunch(uuid, jsonb) is
  'Pose la réponse hebdomadaire « mange-t-il/elle au bureau ? » ET applique '
  'son pré-remplissage à la grille, DANS LA MÊME TRANSACTION (L3, '
  '2026-08-18). Deux écritures séparées laisseraient une réponse sans sa '
  'grille, et personne ne verrait laquelle des deux est vraie. '
  'Motifs: not_authenticated | bad_work_lunch | not_a_member | not_your_line '
  '| not_adult | too_many_away. `not_adult` couvre AUSSI l''âge inconnu: on ne '
  'pose pas une question d''adulte à quelqu''un dont on ne sait pas s''il en '
  'est un. p_work_lunch NULL efface la réponse et retire les midis '
  'pré-remplis.';

-- ---------------------------------------------------------------------------
-- 5. LA LECTURE — LE PATRON DU ROSTER ET DES HABITUDES
-- ---------------------------------------------------------------------------
--
-- ⚠️ PAS DANS LE ROSTER, ET C'EST DÉLIBÉRÉ. Y ajouter une colonne obligerait à
-- DROPPER `keel_household_roster_for` et `keel_household_roster` — donc à
-- réécrire, dans cette migration, une fonction que trois autres lots touchent
-- en ce moment. `keel_household_habits_for` a ouvert ce chemin le 2026-08-14
-- pour la même raison: une lecture par sujet se compose, une signature de
-- roster se casse.
--
-- Deux versions, comme partout: une À ARGUMENT pour le SERVEUR (où `auth.uid()`
-- est NULL sous `service_role` — cicatrice qui a déjà rendu des RPC entièrement
-- mortes), une sans argument pour le navigateur, qui délègue.
create or replace function public.keel_household_work_lunch_for(p_user uuid)
returns table (
  member_id uuid,
  work_lunch jsonb
)
language sql
stable
security definer
set search_path to ''
as $function$
  select hm.member_id, hm.work_lunch
  from public.household_members hm
  where hm.household_id = public.keel_household_of(p_user)
    and hm.work_lunch is not null;
$function$;

create or replace function public.keel_household_work_lunch()
returns table (
  member_id uuid,
  work_lunch jsonb
)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from public.keel_household_work_lunch_for((select auth.uid()));
$function$;

comment on function public.keel_household_work_lunch_for(uuid) is
  'Les réponses hebdomadaires du foyer de p_user, pour les appelants SERVEUR '
  '(service_role), où auth.uid() est NULL. UNE LIGNE PAR BOUCHE À QUI ON A '
  'DEMANDÉ: une bouche absente du résultat n''a jamais été interrogée, ce qui '
  'n''est pas « elle ne mange pas au bureau ». Le lecteur est `parseWorkLunch` '
  '(_shared/keel/household_presence.ts).';

comment on function public.keel_household_work_lunch() is
  'Les réponses hebdomadaires du foyer de l''appelant. Délègue à '
  'keel_household_work_lunch_for; aucune règle n''est écrite ici, exprès — '
  'l''écran et le moteur doivent lire la même réponse.';

-- ---------------------------------------------------------------------------
-- 6. LA PORTE D'ÉCRITURE DE LA GRILLE APPREND LE TROISIÈME ÉTAT
-- ---------------------------------------------------------------------------
--
-- `keel_household_set_member_away` laissait déjà passer n'importe quelle clé
-- supplémentaire (elle écrit `p_away` tel quel). Le jeton `kind` voyagerait
-- donc SANS CE BLOC — mais un jeton inconnu se ferait alors refuser par la
-- contrainte de la section 1, en erreur SQL brute. Ce qu'on ajoute n'est pas le
-- passage, c'est le REFUS NOMMÉ.
--
-- ⚠️ TOUT LE RESTE EST REPRIS MOT POUR MOT DE D14. Cette fonction est la porte
-- de l'absence; en changer un refus au passage serait un second lot caché dans
-- celui-ci.
create or replace function public.keel_household_set_member_away(
  p_member uuid,
  p_away jsonb
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
  v_target record;
  v_entry jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  -- LA FORME EST REFUSÉE ICI, LE CONTENU NE L'EST PAS. Un tableau dont une
  -- entrée nomme un jour inconnu est ACCEPTÉ: `parseAwayDays` l'écartera à la
  -- lecture et gardera les autres (FF-002 §7). Refuser ici ferait tomber une
  -- déclaration entière pour une faute de frappe, ce qui est exactement la
  -- posture que la fiche interdit.
  if p_away is null or jsonb_typeof(p_away) <> 'array'
     or jsonb_array_length(p_away) > 42 then
    return jsonb_build_object('ok', false, 'reason', 'bad_away');
  end if;

  -- LE VOCABULAIRE DU TROISIÈME ÉTAT, LUI, EST FERMÉ (L3, 2026-08-18) — et
  -- l'écart avec le jour au-dessus est le sujet: un jour inconnu FAIT TOMBER
  -- son entrée à la lecture, donc il se voit; un `kind` inconnu est lu `away`,
  -- donc il ne se voit PAS. Ce qui ne se voit pas doit être refusé à
  -- l'écriture, sans quoi le jeton dort en base jusqu'à ce que quelqu'un le
  -- prenne pour un état supporté.
  for v_entry in select * from jsonb_array_elements(p_away) loop
    if jsonb_typeof(v_entry) = 'object'
       and v_entry ? 'kind'
       and (v_entry ->> 'kind') is distinct from 'away'
       and (v_entry ->> 'kind') is distinct from 'eating_out' then
      return jsonb_build_object('ok', false, 'reason', 'bad_away_kind');
    end if;
  end loop;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;

  select hm.member_id, hm.user_id into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  if v_role <> 'owner' and v_target.user_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'reason', 'not_your_line');
  end if;

  update public.household_members
     set away_days = p_away
   where member_id = p_member;

  return jsonb_build_object('ok', true);
end;
$function$;

comment on function public.keel_household_set_member_away(uuid, jsonb) is
  'Marque les moments où une bouche n''est pas là (D14, 2026-08-12), et depuis '
  'L3 (2026-08-18) AVEC QUEL SENS: chaque entrée peut porter '
  '`kind` = away | eating_out. « Dehors » et « absent » retirent tous deux la '
  'part; ce qui les sépare est que le premier garde le droit à un conseil '
  'chiffré et le second non. Un `kind` hors vocabulaire est refusé '
  '(`bad_away_kind`) parce qu''il serait lu `away` sans bruit. Le maître peut '
  'viser N''IMPORTE QUELLE bouche de son foyer, Y COMPRIS une qui a un compte. '
  'Motifs: not_authenticated | bad_away | bad_away_kind | no_household | '
  'not_a_member | not_your_line.';

-- ---------------------------------------------------------------------------
-- 7. LES PRIVILÈGES
-- ---------------------------------------------------------------------------
--
-- Deux cicatrices du dépôt, rejouées: `revoke from public` NE RETIRE PAS
-- `anon`, et toute fonction NEUVE est exécutable par tout le monde par défaut.
--
-- LA COLONNE `work_lunch` N'A BESOIN D'AUCUN GRANT: `household_members` porte
-- `revoke all` + `grant select` au niveau TABLE, donc une colonne neuve est
-- LUE par `authenticated` et jamais écrite par lui. La seule porte d'écriture
-- est la RPC de la section 4.
-- ⚠️ `keel_away_kinds_ok` VIT DANS UNE CONTRAINTE, et on la révoque quand même:
-- la colonne `away_days` n'est écrite QUE par les portes `security definer`
-- ci-dessus, qui s'exécutent sous le propriétaire. `authenticated` n'a aucun
-- `grant update` sur `household_members` — il n'a donc jamais à évaluer cette
-- contrainte, et lui laisser la fonction ne servirait qu'à l'appeler à vide.
revoke all on function public.keel_away_kinds_ok(jsonb) from public, anon;
revoke all on function public.keel_away_with_work_lunch(jsonb, text)
  from public, anon;
revoke all on function public.keel_household_work_lunch() from public, anon;
revoke all on function public.keel_household_work_lunch_for(uuid)
  from public, anon, authenticated;
revoke all on function public.keel_household_set_member_work_lunch(uuid, jsonb)
  from public, anon;
revoke all on function public.keel_household_set_member_away(uuid, jsonb)
  from public, anon;

grant execute on function public.keel_household_work_lunch() to authenticated;
-- Serveur uniquement: c'est tout l'objet de la version à argument.
grant execute on function public.keel_household_work_lunch_for(uuid)
  to service_role;
grant execute on function
  public.keel_household_set_member_work_lunch(uuid, jsonb) to authenticated;
grant execute on function public.keel_household_set_member_away(uuid, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 8. CONTRÔLE FINAL — ON REJOUE LES GESTES, PUIS ON REND LA MAIN
-- ---------------------------------------------------------------------------
--
-- ⚠️ IL SE DONNE UNE IDENTITÉ. Sans `request.jwt.claims`, `auth.uid()` est nul
-- et TOUS les appels rendraient `not_authenticated`: le bloc serait vert en ne
-- prouvant rien. C'est la leçon de la migration des habitudes.
--
-- ⚠️ ET IL PROUVE DES CAS QUI PASSENT. Une garde qu'on n'a vue que refuser est
-- indiscernable d'une garde cassée: l'adulte est accepté pour de bon, la
-- gamelle ne coche rien, et l'absence posée à la main survit.

do $$
declare
  v_user uuid;
  v_house uuid;
  v_owner uuid;
  v_kid uuid;
  v_res jsonb;
  v_away jsonb;
  v_n int;
begin
  -- ⚠️ ON CHERCHE UN COMPTE SANS FOYER, on ne prend pas le premier venu pour
  -- se retirer ensuite. Les migrations de D14 et G1 prennent
  -- `order by created_at limit 1` puis sautent le contrôle si ce compte-là est
  -- déjà dans un foyer — ce qui, sur une base de développement peuplée, saute
  -- le contrôle TOUJOURS. Un bloc de vérification qui ne s'exécute jamais est
  -- vert en ne prouvant rien.
  --
  -- ⚠️ ET IL ÉCARTE LES PROFILS MINEURS. `keel_household_member_birth_date`
  -- fait gagner `profiles.birth_date` sur la fiche (D18): poser 1990 sur la
  -- ligne membre ne suffit pas si le compte choisi porte une date d'enfant, et
  -- le contrôle échouerait sur le refus `not_adult` — en accusant une garde qui
  -- fonctionne. Un profil SANS date utilisable convient: la fiche prend alors
  -- le relais.
  select u.id into v_user
  from auth.users u
  left join public.profiles p on p.id = u.id
  where public.keel_household_of(u.id) is null
    and public.keel_age_state(p.birth_date) <> 'minor'
  order by u.created_at
  limit 1;
  if v_user is null then
    raise notice 'lunch_out: aucun compte majeur sans foyer, contrôle sauté';
    return;
  end if;

  perform set_config(
    'request.jwt.claims', json_build_object('sub', v_user)::text, true
  );

  insert into public.households (name, created_by)
  values ('__qa_lunch_out__', v_user) returning id into v_house;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date)
  values (v_house, v_user, 'owner', 'Owner', '1990-01-01')
  returning member_id into v_owner;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date)
  values (v_house, null, 'member', 'Lea', current_date - interval '8 years')
  returning member_id into v_kid;

  -- 1. LE MINEUR EST REFUSÉ. La question ne se pose qu'aux majeurs, et le
  --    refus est NOMMÉ: une écriture silencieusement ignorée ferait croire à
  --    l'écran qu'il a posé une question à laquelle on a répondu.
  v_res := public.keel_household_set_member_work_lunch(
    v_kid, '{"at_work":true,"mode":"outside"}'::jsonb
  );
  if v_res ->> 'reason' is distinct from 'not_adult' then
    raise exception
      'work_lunch: un MINEUR a été accepté (%) — la question du bureau ne se '
      'pose qu''aux majeurs, et l''âge se déduit de la naissance', v_res::text;
  end if;

  -- 2. LE CAS QUI PASSE, ET IL PRÉ-REMPLIT. Cinq midis de semaine passent à
  --    « dehors », et rien d'autre ne bouge.
  v_res := public.keel_household_set_member_work_lunch(
    v_owner, '{"at_work":true,"mode":"outside"}'::jsonb
  );
  if (v_res ->> 'ok') <> 'true' then
    raise exception 'work_lunch: un ADULTE a été refusé (%)', v_res::text;
  end if;
  select away_days into v_away from public.household_members
   where member_id = v_owner;
  select count(*) into v_n from jsonb_array_elements(v_away) e
   where (e ->> 'kind') = 'eating_out' and (e -> 'slots') = '["lunch"]'::jsonb;
  if v_n <> 5 then
    raise exception
      'work_lunch: « dehors » a coché % midis au lieu de 5 (%) — le '
      'pré-remplissage est la moitié utile de la question', v_n, v_away::text;
  end if;

  -- 3. IDEMPOTENT. La même réponse deux fois ne doit pas empiler des entrées
  --    vers le plafond de 42.
  perform public.keel_household_set_member_work_lunch(
    v_owner, '{"at_work":true,"mode":"outside"}'::jsonb
  );
  select jsonb_array_length(away_days) into v_n from public.household_members
   where member_id = v_owner;
  if v_n <> 5 then
    raise exception
      'work_lunch: deux enregistrements de la MÊME réponse ont laissé % '
      'entrées au lieu de 5 — le pré-remplissage empile', v_n;
  end if;

  -- 4. LA GRILLE DÉCIDE (§2.2 bis). Une absence posée À LA MAIN, sur un jour
  --    que la réponse hebdo couvre, doit SURVIVRE au changement de réponse.
  --    C'est la garde centrale de tout ce lot: sans elle, un geste de la
  --    personne serait effacé par un formulaire.
  v_res := public.keel_household_set_member_away(
    v_owner,
    '[{"day":"mon","slots":["lunch"],"kind":"eating_out"},
      {"day":"tue","slots":["lunch"],"kind":"eating_out"},
      {"day":"wed","slots":["lunch"],"kind":"eating_out"},
      {"day":"thu","slots":["lunch"],"kind":"eating_out"},
      {"day":"fri","slots":["lunch"],"kind":"eating_out"},
      {"day":"sat","kind":"away"}]'::jsonb
  );
  if (v_res ->> 'ok') <> 'true' then
    raise exception 'set_member_away: le troisième état est refusé (%)',
      v_res::text;
  end if;

  -- On repasse à la GAMELLE: le plan compose ces cinq midis, donc les cinq
  -- « dehors » tombent — et le samedi marqué à la main reste.
  v_res := public.keel_household_set_member_work_lunch(
    v_owner, '{"at_work":true,"mode":"lunchbox","microwave":false}'::jsonb
  );
  select away_days into v_away from public.household_members
   where member_id = v_owner;
  if v_away <> '[{"day":"sat","kind":"away"}]'::jsonb then
    raise exception
      'work_lunch: la gamelle a laissé % — soit elle coche des midis qu''elle '
      'compose, soit elle a emporté une absence posée à la main', v_away::text;
  end if;

  -- 5. LE JETON EST FERMÉ. Un `kind` inventé est refusé PAR SON NOM, pas par
  --    une erreur SQL brute — il serait sinon lu `away` sans bruit.
  v_res := public.keel_household_set_member_away(
    v_owner, '[{"day":"mon","slots":["lunch"],"kind":"canteen"}]'::jsonb
  );
  if v_res ->> 'reason' is distinct from 'bad_away_kind' then
    raise exception
      'set_member_away: un `kind` inventé passe (%) — il dormirait en base '
      'jusqu''à ce que quelqu''un le prenne pour un état supporté', v_res::text;
  end if;

  -- 6. LES LIGNES D'AVANT CE LOT RESTENT VALIDES. Aucune entrée sans `kind`
  --    n'est refusée, ni par la contrainte, ni par la porte: on ne nettoie
  --    rien, et une absence écrite hier se lit encore.
  v_res := public.keel_household_set_member_away(
    v_owner, '[{"day":"sun","slots":["dinner"]}]'::jsonb
  );
  if (v_res ->> 'ok') <> 'true' then
    raise exception
      'set_member_away: une entrée SANS `kind` (la forme d''avant ce lot) est '
      'refusée (%) — les lignes déjà écrites deviendraient illisibles',
      v_res::text;
  end if;

  -- 7. LE JETON TRAVERSE LE ROSTER AVEC SA SOURCE. Si `keel_away_tagged`
  --    reconstruisait l'entrée au lieu de la fusionner, le troisième état
  --    n'arriverait jamais au moteur — et rien ne le dirait.
  perform public.keel_household_set_member_away(
    v_owner, '[{"day":"tue","slots":["lunch"],"kind":"eating_out"}]'::jsonb
  );
  select r.away_days into v_away
  from public.keel_household_roster_for(v_user) r where r.member_id = v_owner;
  -- ⚠️ ON CHERCHE L'ENTRÉE, ON NE PREND PAS `-> 0`. Le roster concatène la
  -- déclaration de la personne AVANT la marque du maître: si ce compte a déjà
  -- un « about you » qui porte une absence, l'index 0 est la sienne et le
  -- contrôle échouerait sur une base peuplée en prouvant autre chose.
  if not exists (
    select 1 from jsonb_array_elements(v_away) e
    where (e ->> 'day') = 'tue'
      and (e ->> 'kind') = 'eating_out'
      and (e ->> 'source') = 'household'
  ) then
    raise exception
      'roster: le jeton `kind` ne survit pas à l''étiquetage de source (%) — '
      'le troisième état n''arriverait jamais au moteur', v_away::text;
  end if;

  -- 8. LA LECTURE PAR SUJET REND CE QU'ON A ÉCRIT, et rien pour une bouche à
  --    qui on n'a jamais demandé.
  select count(*) into v_n from public.keel_household_work_lunch_for(v_user);
  if v_n <> 1 then
    raise exception
      'work_lunch_for: % lignes au lieu d''une — une bouche jamais interrogée '
      'ne doit pas se lire comme une bouche qui a répondu « non »', v_n;
  end if;

  raise notice
    'lunch_out: mineur refusé, adulte accepté, 5 midis pré-remplis, '
    'idempotence, la grille survit, jeton fermé, legacy valide, roster et '
    'lecture par sujet — les huit gestes vérifiés';
  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    -- ⚠️ ON REND L'IDENTITÉ AVANT DE SORTIR. `set_config(…, true)` est local à
    -- la TRANSACTION, pas au bloc: la laisser posée ferait passer le reste de
    -- cette migration — et tout ce que le CLI enchaîne dans la même
    -- transaction — pour cet utilisateur-là.
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;

commit;
