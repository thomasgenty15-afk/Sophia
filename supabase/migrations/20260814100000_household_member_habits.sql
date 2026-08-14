-- ============================================================================
-- G1 — CE QUE CHAQUE BOUCHE MANGE QUAND ELLE NE MANGE PAS LE PLAT DE LA MAISON
--
-- Ouverte le 2026-08-14, après un plan réel qui a servi des ŒUFS BROUILLÉS
-- SEPT MATINS D'AFFILÉE à une femme qui mange une pomme.
-- Autorité: scratchpad/SPEC-HABITUDES-ET-FORME-DE-CUISSON-20260814.md §G1-G2.
--
-- LE PROBLÈME QU'ON FERME
--   Le produit savait d'elle: prénom, naissance, objectif, absences, moments,
--   allergies, corps. RIEN sur ce qu'elle mange. `food_preferences` existe mais
--   est clé sur `user_id` — donc inatteignable pour une bouche SANS COMPTE,
--   c'est-à-dire très exactement pour elle.
--
--   Le plan n'a pas ignoré son habitude: PERSONNE NE LA LUI A DEMANDÉE, et il
--   n'existait aucun champ pour la ranger.
--
-- LA FORME (arbitrages B2 et B3, pris par l'utilisateur le 2026-08-14)
--   Les habitudes vivent sur la FICHE DE LA BOUCHE, dans le foyer: le maître
--   remplit pour les bouches sans compte, un compte réclamé remplit la sienne.
--   Ce qu'on mange le matin est une propriété DURABLE de la personne, pas de la
--   semaine — donc relue à chaque composition, jamais redemandée.
--
-- UNE TABLE, ET PAS UNE COLONNE — L'ÉCART ASSUMÉ AVEC D14
--   `away_days` et `eating_rhythm` sont des COLONNES de `household_members`, et
--   la migration de présence écrit pourquoi: « une colonne se RETIRE et une
--   table se MIGRE ». Ici on prend l'autre branche, pour trois raisons qui ne
--   valaient pas pour elles:
--
--     · CE N'EST PAS LA MÊME LIGNE QUI ÉCRIT. `household_members` porte
--       `revoke all` + `grant select` à `authenticated`: tout le foyer LIT la
--       ligne d'une bouche. Une habitude porte du TEXTE LIBRE écrit par une
--       personne sur elle-même, et on veut pouvoir en refuser la lecture
--       séparément un jour sans toucher au roster.
--     · IL Y A UN AUTEUR. `updated_by` répond à « qui a écrit ça sur moi »,
--       question qui n'a pas de sens pour un jour d'absence et qui en a une
--       pour « elle mange une pomme ». Une colonne aurait exigé une seconde
--       colonne d'auteur sur une table qui n'en a pas.
--     · LE VOLUME EST NUL DANS LE CAS NOMINAL. La ligne N'EST PAS ÉCRITE quand
--       la bouche mange le plat de la maison (`household_dish`, le défaut). Une
--       colonne aurait porté `'[]'` sur toutes les bouches du produit.
--
--   Le prix est nommé: le retour arrière est un `drop table` et non un
--   `drop column`, et la cascade RGPD doit être RÉCLAMÉE (section 5) — ce dépôt
--   a déjà mesuré neuf tables neuves hors export.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. LA TABLE
-- ---------------------------------------------------------------------------

create table if not exists public.household_member_habits (
  member_id    uuid primary key
               references public.household_members(member_id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  slots        jsonb not null default '[]'::jsonb,
  note         text,
  -- L'AUTEUR, ET IL SURVIT À SON COMPTE. `set null` plutôt que `cascade`: le
  -- maître qui supprime son compte ne doit pas effacer ce que sa mère mange le
  -- matin. La trace de QUI l'a écrit se perd, la donnée reste — l'inverse
  -- effacerait la ligne d'une personne qui n'a rien demandé.
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);

-- LA FORME EST TENUE EN BASE, PAS SEULEMENT PAR LE PARSEUR.
--
-- ⚠️ MÊME RAISON QUE D14: `parseMemberHabits` rend `[]` pour tout ce qui n'est
-- pas un tableau. Un objet rangé ici se lirait donc « aucune habitude » —
-- c'est-à-dire que quelqu'un aurait déclaré ce qu'il mange et que rien ne se
-- serait passé, sans une erreur nulle part. Le refus doit arriver à l'écriture.
--
-- LE PLAFOND EST 6 = LE NOMBRE DE MOMENTS, et il est SERRÉ, contrairement aux
-- 42 de l'absence. Une personne n'a pas deux habitudes au même petit-déjeuner:
-- au-delà de six entrées, ce n'est plus une déclaration, c'est un bourrage de
-- prompt. Le lecteur garde le PREMIER d'un moment répété, donc les suivantes
-- ne seraient de toute façon lues par personne.
alter table public.household_member_habits
  drop constraint if exists household_member_habits_slots_check;
alter table public.household_member_habits
  add constraint household_member_habits_slots_check
  check (
    jsonb_typeof(slots) = 'array'
    and jsonb_array_length(slots) <= 6
  );

-- LE TEXTE LIBRE EST BORNÉ ICI AUSSI, et le nombre a UNE source.
--
-- 280 est `DRAFT_NOTE_MAX_CHARS` (`_shared/keel/plan_draft_note.ts`), le même
-- plafond que la note de reprise de plan, et le module d'habitudes le
-- RÉEXPORTE plutôt que de le redéclarer (`HABIT_TEXT_MAX_CHARS`). Cette
-- contrainte-ci est la troisième lecture du même nombre; elle le cite pour que
-- le déplacer soit une chasse courte.
alter table public.household_member_habits
  drop constraint if exists household_member_habits_note_check;
alter table public.household_member_habits
  add constraint household_member_habits_note_check
  check (note is null or (length(btrim(note)) between 1 and 280));

comment on table public.household_member_habits is
  'G1 (2026-08-14) — ce qu''une bouche mange quand elle ne mange PAS le plat '
  'de la maison. UNE LIGNE PAR BOUCHE QUI A QUELQUE CHOSE À DIRE: le défaut '
  '(`household_dish`) ne s''écrit PAS, donc l''absence de ligne est la réponse '
  'majoritaire et pas un manque. `slots` = '
  '[{"slot":"breakfast","kind":"own_usual","usual":"une pomme"}]. Ce n''est '
  'PAS `fixed_intakes`: cette forme-là exige un food_ref résolu ET une '
  'quantité, et « une pomme » n''a ni l''un ni l''autre — lui en inventer '
  'écrirait un fait que personne n''a pesé.';

comment on column public.household_member_habits.slots is
  'Une entrée par moment où la personne ne mange pas le plat de la maison. '
  '`kind` est fermé: household_dish (le défaut, jamais écrit) | own_usual. '
  'Le lecteur (`parseMemberHabits`) ÉCARTE une entrée dont le moment est '
  'inconnu ou dont `usual` est vide, et garde les autres.';

comment on column public.household_member_habits.updated_by is
  'QUI a écrit ça. `on delete set null`: le maître qui supprime son compte ne '
  'doit pas effacer ce que sa mère mange le matin.';

-- ---------------------------------------------------------------------------
-- 2. LES PRIVILÈGES — LA TABLE EST FERMÉE, LES PORTES SONT NOMMÉES
-- ---------------------------------------------------------------------------
--
-- ⚠️ DEUX CICATRICES DU DÉPÔT, REJOUÉES ICI:
--   · les privilèges par défaut de Supabase donnent TOUT à `authenticated` sur
--     toute table NEUVE — y compris `truncate`, qui échappe à RLS;
--   · `revoke ... from public` NE RETIRE PAS `anon`, qui doit être nommé.
--
-- La table n'est donc atteignable NI en lecture NI en écriture depuis le
-- navigateur. Les deux seules portes sont les fonctions de la section 3, et
-- c'est ce qui rend la règle « qui écrit quoi » vérifiable en un seul endroit.

revoke all on public.household_member_habits from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. LES PORTES
-- ---------------------------------------------------------------------------
--
-- LA LECTURE SUIT LE PATRON DU ROSTER (D14): une version À ARGUMENT pour le
-- SERVEUR, où `auth.uid()` est NULL sous `service_role` — cicatrice
-- `auth-uid-null-under-service-role`, qui a déjà rendu des RPC entièrement
-- mortes — et une version sans argument pour le navigateur, qui délègue à la
-- première. Aucune règle n'est écrite deux fois: l'écran et le moteur doivent
-- lire les MÊMES habitudes, sinon l'un montre ce que l'autre ne sert pas.

create or replace function public.keel_household_habits_for(p_user uuid)
returns table (
  member_id uuid,
  slots jsonb,
  note text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select h.member_id, h.slots, h.note
  from public.household_member_habits h
  -- LA GARDE EST PORTÉE PAR L'ARGUMENT, comme dans le roster: un `p_user` nul
  -- rend zéro ligne parce que `keel_household_of(null)` est nul et que
  -- `= null` n'est jamais vrai.
  where h.household_id = public.keel_household_of(p_user);
$function$;

create or replace function public.keel_household_habits()
returns table (
  member_id uuid,
  slots jsonb,
  note text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from public.keel_household_habits_for((select auth.uid()));
$function$;

comment on function public.keel_household_habits_for(uuid) is
  'Les habitudes du foyer de p_user, pour les appelants SERVEUR '
  '(service_role), où auth.uid() est NULL. Une ligne par bouche QUI A QUELQUE '
  'CHOSE À DIRE: une bouche absente du résultat mange le plat de la maison, ce '
  'qui est le défaut du produit et pas un manque.';

comment on function public.keel_household_habits() is
  'Les habitudes du foyer de l''appelant. Délègue à keel_household_habits_for; '
  'aucune règle n''est écrite ici, exprès — l''écran et le moteur doivent lire '
  'les mêmes habitudes.';

-- L'ÉCRITURE — LE PATRON EST `keel_household_set_member_away`, ET LA RÈGLE
-- D'ACCÈS EST LA SIENNE, MOT POUR MOT: le maître vise N'IMPORTE QUELLE bouche
-- de son foyer, y compris une qui a un compte; un membre non-maître ne vise que
-- SA propre ligne.
--
-- ⚠️ IL N'Y A DONC PAS DE REFUS `has_account` ICI, et son absence est un CHOIX,
-- pas un oubli. `keel_household_set_member_rhythm` en porte un, parce qu'un
-- rythme déclaré par une personne vit dans SON « about you » et qu'il y aurait
-- deux écritures pour un seul fait. Une habitude n'a pas de second domicile: la
-- fiche de la bouche est le seul endroit où elle existe, pour un compte comme
-- pour une bouche sans compte. Le recopier « par symétrie » rendrait la moitié
-- du foyer inscriptible par personne.
--
-- ⚠️ IL N'Y A PAS NON PLUS DE REFUS `no_household`, et c'est aussi un choix. Un
-- appelant sans foyer ne trouve pas la bouche visée (`= null` n'est jamais
-- vrai), et s'entend donc dire `not_a_member` — ce qui est exact et ne lui
-- apprend rien sur un foyer qui n'est pas le sien. Les cinq motifs de la spec
-- sont les cinq motifs rendus, sans un sixième que personne n'a nommé.

create or replace function public.keel_household_set_member_habits(
  p_member uuid,
  p_slots jsonb,
  p_note text
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

  -- LA FORME EST REFUSÉE ICI. Le VOCABULAIRE aussi, et c'est l'écart avec
  -- l'absence: `parseAwayDays` écarte un jour inconnu et garde le reste (une
  -- faute de frappe ne doit pas faire tomber une déclaration entière), mais un
  -- MOMENT inconnu ou un `kind` inconnu ne laissent RIEN derrière eux — l'entrée
  -- entière devient muette. Une écriture acceptée qui ne dit rien est une ligne
  -- dont personne ne voit qu'elle est vide, et c'est le défaut d'origine de ce
  -- lot vu par l'autre bout.
  if p_slots is null or jsonb_typeof(p_slots) <> 'array'
     or jsonb_array_length(p_slots) > 6 then
    return jsonb_build_object('ok', false, 'reason', 'bad_slots');
  end if;

  for v_entry in select * from jsonb_array_elements(p_slots) loop
    if jsonb_typeof(v_entry) <> 'object'
       or (v_entry ->> 'slot') is null
       or (v_entry ->> 'slot') not in (
         'breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner', 'before_bed'
       )
       or (v_entry ->> 'kind') is null
       or (v_entry ->> 'kind') not in ('household_dish', 'own_usual') then
      return jsonb_build_object('ok', false, 'reason', 'bad_slots');
    end if;
    -- « ELLE MANGE AUTRE CHOSE » SANS DIRE QUOI EST REFUSÉ, et c'est la
    -- contrainte la plus importante de cette fonction. Gardée, elle produirait
    -- la ligne de brief « has their own at breakfast: » — un modèle à qui on
    -- dit qu'une personne mange autre chose sans dire quoi INVENTE ce qu'elle
    -- mange. C'est un fait faux, sur la personne, que personne n'a écrit: la
    -- forme exacte du défaut que ce lot répare.
    if (v_entry ->> 'kind') = 'own_usual'
       and (
         (v_entry ->> 'usual') is null
         or length(btrim(v_entry ->> 'usual')) < 1
         or length(btrim(v_entry ->> 'usual')) > 280
       ) then
      return jsonb_build_object('ok', false, 'reason', 'bad_slots');
    end if;
  end loop;

  -- `null` EFFACE, une chaîne vide NON. Deux gestes différents: « je n'ai rien
  -- à ajouter » et « j'ai effacé ce que j'avais écrit » arrivent tous deux
  -- comme `null`; une chaîne de blancs est une saisie qui n'a rien dit, et la
  -- refuser vaut mieux que de l'écrire.
  if p_note is not null and (
       length(btrim(p_note)) < 1 or length(btrim(p_note)) > 280
     ) then
    return jsonb_build_object('ok', false, 'reason', 'bad_note');
  end if;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  select hm.member_id, hm.user_id into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target.member_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  if v_role <> 'owner' and v_target.user_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'reason', 'not_your_line');
  end if;

  insert into public.household_member_habits
    (member_id, household_id, slots, note, updated_by, updated_at)
  values
    (p_member, v_household, p_slots, btrim(p_note), v_user, now())
  on conflict (member_id) do update
    set slots = excluded.slots,
        note = excluded.note,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  return jsonb_build_object('ok', true);
end;
$function$;

comment on function public.keel_household_set_member_habits(uuid, jsonb, text) is
  'Pose ce qu''une bouche mange quand elle ne mange pas le plat de la maison '
  '(G1, 2026-08-14). MÊME RÈGLE D''ACCÈS QUE keel_household_set_member_away: '
  'le maître vise n''importe quelle bouche de son foyer, y compris une qui a '
  'un compte; un membre non-maître ne vise que SA ligne. Pas de refus '
  '`has_account` — une habitude n''a pas de second domicile, contrairement au '
  'rythme. Motifs: not_authenticated | not_a_member | bad_slots | bad_note | '
  'not_your_line. Une entrée `own_usual` SANS TEXTE est refusée: elle ferait '
  'inventer au modèle ce que la personne mange.';

revoke all on function public.keel_household_habits() from public, anon;
revoke all on function public.keel_household_habits_for(uuid)
  from public, anon, authenticated;
revoke all on function public.keel_household_set_member_habits(uuid, jsonb, text)
  from public, anon;

grant execute on function public.keel_household_habits() to authenticated;
-- Serveur uniquement: c'est tout l'objet de la version à argument.
grant execute on function public.keel_household_habits_for(uuid) to service_role;
grant execute on function
  public.keel_household_set_member_habits(uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RGPD — LA TABLE EST RÉCLAMÉE, PAS SEULEMENT CRÉÉE
-- ---------------------------------------------------------------------------
--
-- ⚠️ CICATRICE NOMMÉE: « le lifecycle RGPD ne réclame pas les tables neuves »,
-- neuf tables mesurées hors export dans ce dépôt. Une table qui porte du texte
-- écrit par une personne sur elle-même DOIT partir avec elle.
--
-- LA SUPPRESSION EST DÉJÀ TENUE PAR LES CLÉS: `member_id` cascade depuis
-- `household_members`, `household_id` cascade depuis `households`, et
-- `household_members` cascade déjà depuis `auth.users`. Supprimer un compte
-- emporte donc ses lignes sans un mot de plus — ce qui se VÉRIFIE en section 5
-- plutôt que de se supposer.
--
-- L'EXPORT, LUI, N'EST PAS TENU PAR UNE CLÉ: il se nomme, dans
-- `supabase/functions/account-export-v1/index.ts`, à côté de
-- `household_members`. C'est la moitié qu'on oublie.

-- ---------------------------------------------------------------------------
-- 5. CONTRÔLE FINAL — ON REJOUE LES GESTES
-- ---------------------------------------------------------------------------
--
-- Inspecter le catalogue prouverait que la table existe, pas que la règle
-- d'accès fonctionne. On monte un foyer, on écrit une habitude sur une bouche
-- SANS COMPTE, on la relit par la porte du serveur, on essaie deux refus, et on
-- annule tout.
--
-- ⚠️ UNE GARDE A BESOIN D'UN CAS QUI PASSE. Une règle qu'on n'a vue que refuser
-- est indiscernable d'une garde cassée qui refuse tout — ce dépôt l'a déjà payé.
-- Le cas passant est donc vérifié EN PREMIER, et c'est lui qui compte.

do $$
declare
  v_user uuid;
  v_house uuid;
  v_owner uuid;
  v_kid uuid;
  v_rows int;
begin
  -- ⚠️ ON EMPRUNTE UN COMPTE EXISTANT, ON N'EN CRÉE PAS. Écrire dans
  -- `auth.users` depuis une migration est un geste que la pile locale accepte
  -- et que la prod refuse, et il rendrait ce contrôle vert ici et rouge là-bas.
  -- Même patron que la migration de présence, à la ligne près.
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise notice 'household_member_habits: aucun utilisateur, contrôle sauté';
    return;
  end if;
  if public.keel_household_of(v_user) is not null then
    raise notice 'household_member_habits: % déjà dans un foyer, contrôle sauté', v_user;
    return;
  end if;

  insert into public.households (name, created_by)
  values ('__qa_habits__', v_user) returning id into v_house;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date)
  values (v_house, v_user, 'owner', 'Owner', '1990-01-01')
  returning member_id into v_owner;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date)
  values (v_house, null, 'member', 'Mere', '1958-01-01')
  returning member_id into v_kid;

  -- ⚠️ ON SE DONNE UNE IDENTITÉ, PARCE QUE `auth.uid()` EST NULL EN PSQL.
  -- Sans cette ligne, TOUS les appels ci-dessous rendraient `not_authenticated`
  -- et le contrôle serait vert en ne prouvant rien — la migration de présence
  -- contourne le problème en écrivant dans la COLONNE plutôt qu'en appelant sa
  -- RPC, ce qui laisse la règle d'accès non vérifiée. Ici on teste la vraie
  -- porte. `is_local = true`: le réglage meurt avec la transaction.
  -- (Cicatrice `auth-uid-null-under-service-role`, prise par l'autre bout.)
  perform set_config(
    'request.jwt.claims', json_build_object('sub', v_user)::text, true
  );

  -- ── ① LE CAS QUI PASSE, ET C'EST TRÈS EXACTEMENT LE CAS DE L'UTILISATEUR ──
  -- Le maître écrit sur une bouche SANS COMPTE. Avant cette migration, ce
  -- geste n'avait aucun endroit où s'écrire — et c'est pour ça qu'une femme
  -- qui mange une pomme a reçu sept plats d'œufs brouillés.
  if public.keel_household_set_member_habits(
       v_kid,
       '[{"slot":"breakfast","kind":"own_usual","usual":"une pomme"}]'::jsonb,
       'Elle prend son cafe avant.'
     ) ->> 'ok' <> 'true' then
    raise exception
      'habits: le maître ne peut pas écrire sur une bouche sans compte — le '
      'geste que toute cette migration existe pour permettre';
  end if;

  select count(*) into v_rows
  from public.keel_household_habits_for(v_user)
  where member_id = v_kid and slots -> 0 ->> 'usual' = 'une pomme';
  if v_rows <> 1 then
    raise exception
      'habits: la porte SERVEUR ne rend pas l''habitude écrite (% ligne(s)) — '
      'sans elle le moteur compose comme avant et la table ne sert à rien', v_rows;
  end if;

  -- ② UNE BOUCHE SANS LIGNE EST ABSENTE DU RÉSULTAT, pas rendue avec `[]`.
  --    C'est le cas majoritaire du produit, et il doit être GRATUIT.
  select count(*) into v_rows
  from public.keel_household_habits_for(v_user) where member_id = v_owner;
  if v_rows <> 0 then
    raise exception 'habits: une bouche sans habitude est rendue quand même (%)', v_rows;
  end if;

  -- ③ LA PORTE SERVEUR NE FUIT PAS D'UN FOYER À L'AUTRE.
  select count(*) into v_rows from public.keel_household_habits_for(gen_random_uuid());
  if v_rows <> 0 then
    raise exception 'habits: keel_household_habits_for rend un foyer étranger (%)', v_rows;
  end if;

  -- ④ « ELLE MANGE AUTRE CHOSE » SANS DIRE QUOI EST REFUSÉ. Le refus le plus
  --    important de la fonction: accepté, il ferait INVENTER au modèle ce
  --    qu'elle mange.
  if public.keel_household_set_member_habits(
       v_kid, '[{"slot":"breakfast","kind":"own_usual"}]'::jsonb, null
     ) ->> 'reason' <> 'bad_slots' then
    raise exception
      'habits: une habitude « autre chose » SANS TEXTE est acceptée — le modèle '
      'inventerait ce que la personne mange';
  end if;

  -- ⑤ UN MOMENT HORS VOCABULAIRE NE S'ÉCRIT PAS. Le lecteur l'écarterait en
  --    silence, et la ligne serait alors une déclaration que personne ne lit.
  if public.keel_household_set_member_habits(
       v_kid, '[{"slot":"brunch","kind":"own_usual","usual":"un oeuf"}]'::jsonb, null
     ) ->> 'reason' <> 'bad_slots' then
    raise exception 'habits: un moment hors vocabulaire est accepté';
  end if;

  -- ⑥ LA NOTE EST BORNÉE, ET LE MOTIF EST LE SIEN — pas `bad_slots`.
  if public.keel_household_set_member_habits(v_kid, '[]'::jsonb, repeat('x', 281))
       ->> 'reason' <> 'bad_note' then
    raise exception 'habits: une note de 281 signes passe, ou rend le mauvais motif';
  end if;

  -- ⑦ UNE BOUCHE D'UN AUTRE FOYER N'EST PAS UNE BOUCHE. `not_a_member`
  --    absorbe aussi « l'appelant n'a pas de foyer »: `= null` n'est jamais vrai.
  if public.keel_household_set_member_habits(gen_random_uuid(), '[]'::jsonb, null)
       ->> 'reason' <> 'not_a_member' then
    raise exception 'habits: une bouche hors foyer n''est pas refusée `not_a_member`';
  end if;

  -- ⑧ LA CASCADE — la table part avec le foyer. C'est la moitié RGPD que les
  --    clés tiennent; l'autre (l'export) se nomme dans account-export-v1.
  delete from public.households where id = v_house;
  select count(*) into v_rows
  from public.household_member_habits where household_id = v_house;
  if v_rows <> 0 then
    raise exception
      'habits: % ligne(s) survivent à la suppression du foyer — la cascade RGPD '
      'ne tient pas', v_rows;
  end if;

  raise notice
    'household_member_habits: écriture du maître, relecture serveur, cloison '
    'entre foyers, trois refus nommés et cascade — vérifiés';
  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;

commit;
