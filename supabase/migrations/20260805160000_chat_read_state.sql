-- LA BULLE APPREND CE QUI A ÉTÉ LU — `profiles.chat_last_read_at`.
--
-- ── LE TROU QUE ÇA REFERME ───────────────────────────────────────────────────
-- Depuis le chantier de-whatsapp, un message proactif est une ligne écrite dans
-- `chat_messages`, et Realtime l'affiche dans l'onglet OUVERT. Rien d'autre.
-- Pas de badge, pas de compteur, pas de notification: un élève qui n'a pas
-- `/app/chat` à l'écran n'apprend jamais qu'on lui a écrit. Sur WhatsApp la
-- notification était gratuite — elle venait du transport. En sortant de
-- WhatsApp, on a gardé le message et perdu l'avertissement, et c'est toute la
-- boucle « remarquer » (PLAN-NUIT §1.3) qui reposait dessus.
--
-- Le compteur de non-lus se calcule ENTIÈREMENT côté client à partir de cette
-- colonne :
--     count(chat_messages where role='assistant' and created_at > chat_last_read_at)
-- La RLS `select_own` fait déjà la frontière sur les deux tables ; il n'y a donc
-- ni RPC ni edge function ici. Une lecture que le client peut faire lui-même ne
-- mérite pas un aller-retour de plus.
--
-- ── LE BACKFILL EST ASYMÉTRIQUE, EXPRÈS ──────────────────────────────────────
-- Même arbitrage — et même raison — que `20260804121000` pour
-- `proactive_muted_at`.
--
--   * profils EXISTANTS  → `now()`. « Ce qui est passé est lu. » Sans ça, le
--     premier chargement après déploiement afficherait un badge à 30 sur une
--     conversation que l'élève a déjà lue en entier, et un compteur qui ment au
--     premier regard n'est plus jamais cru.
--   * profils NEUFS      → `null`, qui se lit « rien n'a été lu ». C'est exact
--     pour un compte neuf (il n'a aucun message), et c'est le seul sens qui
--     reste vrai si le premier message arrive avant la première ouverture.
--
-- La colonne n'est PAS ajoutée à `guard_profiles_privileged_columns` : c'est un
-- état d'affichage que le propriétaire de la ligne écrit lui-même, au même
-- titre que son fuseau. Le contrôle final ci-dessous rejoue précisément ce
-- geste, sous une vraie identité d'élève, plutôt que de le supposer.

alter table public.profiles
  add column if not exists chat_last_read_at timestamptz;

comment on column public.profiles.chat_last_read_at is
  'Dernière ouverture de /app/chat par l''élève. Sert au compteur de non-lus '
  '(messages assistant plus récents). Écrit par le client, jamais privilégié. '
  'NULL = jamais ouvert.';

-- Profils existants: tout est lu. Voir l'asymétrie ci-dessus.
update public.profiles
   set chat_last_read_at = now()
 where chat_last_read_at is null;

-- ---------------------------------------------------------------------------
-- CONTRÔLE FINAL — ON REJOUE LE GESTE SOUS UNE VRAIE IDENTITÉ D'ÉLÈVE.
--
-- `20260804181000` a montré ce que coûte l'inverse: la garde de `profiles` ne
-- s'exécute QUE pour `authenticated`/`anon`, et absolument tout ce qui éprouve
-- ce dépôt écrit en `service_role`. Le chemin cassé est donc exactement celui
-- que rien n'emprunte — sauf un navigateur avec un vrai JWT. Un `set local
-- role authenticated` SEUL ne suffit pas non plus: sans `sub`, `auth.uid()` est
-- NULL, la RLS filtre tout, l'UPDATE touche zéro ligne et le trigger ne tourne
-- même pas. On pose donc aussi les claims, et on annule par sous-transaction.
-- ---------------------------------------------------------------------------
do $$
declare
  v_id   uuid;
  v_rows int := 0;
  v_msg  text;
  -- `set_config('role','none',...)` est `reset role` déguisé: il ne rend pas
  -- l'identité de l'appelant, il retombe sur `session_user`. Le CLI se place
  -- sur un rôle pour appliquer la lignée, et le lui jeter casse tout ce qui
  -- suit dans la même transaction — y compris l'épreuve d'absence en bas de ce
  -- fichier, qui interroge `information_schema` (filtré par privilèges) et
  -- annonçait « colonne absente » pour une colonne présente. On restitue donc
  -- l'identité d'entrée. Voir `20260804181000`, même piège, autre orthographe.
  v_role text := current_user;
begin
  select id into v_id from public.profiles limit 1;
  if v_id is null then
    raise notice 'chat_last_read_at: aucune ligne, contrôle sauté';
    return;
  end if;

  begin
    perform set_config('role', 'authenticated', true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', v_id::text, 'role', 'authenticated')::text,
      true
    );

    -- Les DEUX colonnes de réglage que la bulle écrit depuis le navigateur.
    -- `proactive_muted_at` est incluse alors qu'elle existe déjà: c'est ce
    -- geste-là qui n'avait jamais eu d'écran, donc jamais été rejoué.
    update public.profiles
       set chat_last_read_at   = now(),
           proactive_muted_at  = null
     where id = v_id;
    get diagnostics v_rows = row_count;

    -- Annule l'écriture de sonde: la sous-transaction du bloc `exception`
    -- défait tout ce qui précède.
    raise exception using errcode = 'P0001', message = '__probe_rollback__';
  exception
    when others then
      get stacked diagnostics v_msg = message_text;
      perform set_config('role', v_role, true);
      perform set_config('request.jwt.claims', '', true);
      if v_msg is distinct from '__probe_rollback__' then
        raise exception
          'chat_last_read_at: un élève ne peut pas écrire ses réglages de bulle: %',
          v_msg;
      end if;
  end;

  -- ── POURQUOI 0 LIGNE N'EST PAS UNE EXCEPTION ICI ─────────────────────────
  -- Une migration qui échoue bloque la lignée ENTIÈRE, sur toutes les bases.
  -- Le trigger, lui, a déjà été prouvé: s'il avait refusé l'écriture, on serait
  -- passé par le `raise exception` du bloc ci-dessus. Un `row_count` à 0 ne dit
  -- donc rien du trigger — il dit que la RLS n'a pas reconnu l'identité posée,
  -- ce qui dépend du seed d'auth de la base et pas du code qu'on livre.
  --
  -- Le contrôle le DIT au lieu de faire semblant. Même arbitrage que le
  -- fail-open journalisé ailleurs dans ce dépôt: un contrôle non concluant qui
  -- s'annonce vaut mieux qu'un vert acheté, et infiniment mieux qu'un reset
  -- cassé pour une raison sans rapport avec la migration.
  if v_rows = 1 then
    raise notice
      'chat_last_read_at: écriture des réglages rejouée sous identité élève, 1 ligne';
  else
    raise warning
      'chat_last_read_at: CONTRÔLE NON CONCLUANT — UPDATE sous identité élève a '
      'touché % ligne(s). Le trigger n''a pas refusé (sinon exception ci-dessus), '
      'mais la RLS n''a pas reconnu l''identité posée. À rejouer au navigateur.',
      v_rows;
  end if;
end $$;

-- Épreuve d'absence: la colonne existe et n'est pas gardée.
do $$
begin
  -- `pg_catalog` et non `information_schema`: cette vue-là ne montre que les
  -- colonnes sur lesquelles le rôle courant a un privilège. Sous une identité
  -- amoindrie elle rend zéro ligne, et l'épreuve d'absence se met à affirmer
  -- qu'une colonne présente est absente. Une preuve de présence ne doit pas
  -- dépendre de qui la lit.
  perform 1 from pg_catalog.pg_attribute
   where attrelid = 'public.profiles'::regclass
     and attname  = 'chat_last_read_at'
     and attnum   > 0
     and not attisdropped;
  if not found then
    raise exception 'chat_last_read_at: colonne absente après migration';
  end if;

  if position('chat_last_read_at' in pg_get_functiondef(
       'public.guard_profiles_privileged_columns()'::regprocedure)) > 0 then
    raise exception
      'chat_last_read_at est gardée par guard_profiles_privileged_columns: '
      'le client ne pourra jamais marquer sa conversation comme lue';
  end if;

  raise notice 'chat_last_read_at: présente, non gardée';
end $$;
