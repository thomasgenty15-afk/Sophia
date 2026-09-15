-- ============================================================================
-- LE CORPUS D'UN DOCUMENT DU COACH — assertions comportementales.
-- Couvre `20260806140000_coach_document_corpus.sql`.
--
-- MANUAL. Se lance à la main contre la base LOCALE:
--
--   docker cp supabase/functions/_shared/keel/coach_document_corpus_test.sql \
--     supabase_db_Sophia_2:/tmp/coach_document_corpus_test.sql
--   docker exec supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f /tmp/coach_document_corpus_test.sql
--
-- Script psql et pas un test deno: l'objet sous test est le moteur de
-- contraintes de Postgres (CHECK, index uniques, policies RLS). Un client qui
-- contourne `set local role` ne testerait rien.
--
-- Tout tourne dans UNE transaction qui finit par ROLLBACK.
--
-- CE QUI EST ASSERTÉ, et chaque ligne est un invariant produit:
--
--   §1  Les 3 tables existent, RLS ACTIVÉE sur les 3.
--   §2  `anon` n'a AUCUN privilège (revoke from public laisse anon debout).
--   §3  Un état qui MENT sur son contenu est refusé: `extracted` sans chunk,
--       et `no_text_layer` avec des chunks. Sans ce CHECK, « on a le texte »
--       et « on n'a rien » deviennent indiscernables à la lecture.
--   §4  Le MÊME document déposé deux fois ne fait qu'une ligne (index unique
--       sur (coach_id, content_sha256)) -> pas de corpus en double, pas de
--       « d'où vient cette citation » ambigu entre deux copies.
--   §5  Deux documents DIFFÉRENTS coexistent chez le même coach (l'index ne
--       doit pas empêcher de déposer l'ebook ET la FAQ).
--   §6  Un chunk sans page est refusé, et deux chunks ne partagent pas un
--       ordinal dans un document.
--   §7  Une citation ancrée SANS page est refusée: « retrouvée quelque part »
--       n'est pas une localisation.
--   §8  Une citation NON ancrée est acceptée: c'est le cas normal d'un PDF
--       scanné, pas une anomalie.
--   §9  Un document ne cite qu'une fois la même entrée (unique (document_id,
--       entry_kind, entry_key)), mais DEUX documents peuvent citer la même.
--   §10 RLS: le coach A ne voit RIEN du corpus du coach B — ni document, ni
--       chunk, ni citation. C'est la promesse produit entière.
--   §11 Supprimer le document emporte ses chunks ET ses citations (cascade);
--       supprimer un CHUNK laisse la citation debout, désancrée.
-- ============================================================================

begin;

create or replace function pg_temp.assert_eq(label text, got bigint, want bigint)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL % : got %, want %', label, got, want;
  end if;
  raise notice 'PASS % (%)', label, got;
end;
$$;

create or replace function pg_temp.assert_true(label text, got boolean)
returns void language plpgsql as $$
begin
  if got is not true then
    raise exception 'FAIL % : got %, want true', label, coalesce(got::text, 'null');
  end if;
  raise notice 'PASS %', label;
end;
$$;

create or replace function pg_temp.assert_rejects(label text, stmt text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'PASS % (rejected: %)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL % : the write SUCCEEDED but should have been rejected', label;
end;
$$;

create or replace function pg_temp.become(who uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', who, 'role', 'authenticated')::text,
                     true);
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.become_service()
returns void language plpgsql as $$
begin
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures. Préfixe `d0` pour ne PAS collisionner avec `f1…`
-- (pivot_nutrition_tables_test.sql) ni `aaaaaaaa-…` (tenancy_rls_test.sql),
-- qui sont les deux aimants à collision du dépôt.
-- ---------------------------------------------------------------------------
delete from public.coaches where user_id in (
  'd0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('d0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','corpus.coach.a@example.com','x', now(), now(), now(), '{}', '{}'),
  ('d0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','corpus.coach.b@example.com','x', now(), now(), now(), '{}', '{}')
on conflict (id) do nothing;

insert into public.coaches (id, user_id, display_name, status)
values
  ('d0000000-0000-0000-0000-0000000000c1','d0000000-0000-0000-0000-000000000001','Marlow','active'),
  ('d0000000-0000-0000-0000-0000000000c2','d0000000-0000-0000-0000-000000000002','Other','active');

-- ---------------------------------------------------------------------------
-- §1 — les tables, et RLS activée
-- ---------------------------------------------------------------------------
select pg_temp.assert_eq('§1 les 3 tables existent',
  (select count(*) from pg_tables
   where schemaname = 'public'
     and tablename in ('coach_documents','coach_document_chunks','coach_document_citations')),
  3);

select pg_temp.assert_eq('§1 RLS activée sur les 3',
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('coach_documents','coach_document_chunks','coach_document_citations')
     and c.relrowsecurity),
  3);

-- ---------------------------------------------------------------------------
-- §2 — `anon` n'a rien. On interroge 'anon', jamais 'public': les default
-- privileges Supabase accordent à anon sur toute table neuve, et un
-- `revoke from public` laisse anon debout.
-- ---------------------------------------------------------------------------
select pg_temp.assert_true('§2 anon n''a pas SELECT sur coach_documents',
  not has_table_privilege('anon', 'public.coach_documents', 'select'));
select pg_temp.assert_true('§2 anon n''a pas INSERT sur coach_document_chunks',
  not has_table_privilege('anon', 'public.coach_document_chunks', 'insert'));
select pg_temp.assert_true('§2 anon n''a pas SELECT sur coach_document_citations',
  not has_table_privilege('anon', 'public.coach_document_citations', 'select'));

-- ---------------------------------------------------------------------------
-- §3 — un état ne ment pas sur son propre contenu
-- ---------------------------------------------------------------------------
select pg_temp.assert_rejects('§3 `extracted` sans chunk est refusé', $$
  insert into public.coach_documents
    (coach_id, byte_size, page_count, content_locale, content_sha256, text_status,
     text_chars, chunk_count)
  values ('d0000000-0000-0000-0000-0000000000c1', 1000, 10, 'en',
     repeat('a', 64), 'extracted', 0, 0);
$$);

select pg_temp.assert_rejects('§3 `no_text_layer` AVEC des chunks est refusé', $$
  insert into public.coach_documents
    (coach_id, byte_size, page_count, content_locale, content_sha256, text_status,
     text_chars, chunk_count)
  values ('d0000000-0000-0000-0000-0000000000c1', 1000, 10, 'en',
     repeat('b', 64), 'no_text_layer', 500, 3);
$$);

select pg_temp.assert_rejects('§3 une empreinte qui n''est pas un sha256 est refusée', $$
  insert into public.coach_documents
    (coach_id, byte_size, page_count, content_locale, content_sha256, text_status)
  values ('d0000000-0000-0000-0000-0000000000c1', 1000, 10, 'en',
     'pas-une-empreinte', 'no_text_layer');
$$);

-- Le document de référence, celui qui sert au reste du fichier.
insert into public.coach_documents
  (id, coach_id, filename, byte_size, page_count, content_locale, content_sha256,
   storage_path, text_status, text_chars, chunk_count)
values
  ('d0000000-0000-0000-0000-0000000000d1','d0000000-0000-0000-0000-0000000000c1',
   'methode.pdf', 120000, 12, 'fr', repeat('c', 64),
   'd0000000-0000-0000-0000-000000000001/doctrine/d0000000-0000-0000-0000-0000000000d1.pdf',
   'extracted', 2400, 2);

-- ---------------------------------------------------------------------------
-- §4/§5 — l'idempotence du re-dépôt, et la coexistence de deux documents
-- ---------------------------------------------------------------------------
select pg_temp.assert_rejects('§4 le MÊME contenu redéposé est refusé', $$
  insert into public.coach_documents
    (coach_id, byte_size, page_count, content_locale, content_sha256, text_status,
     text_chars, chunk_count)
  values ('d0000000-0000-0000-0000-0000000000c1', 120000, 12, 'fr', repeat('c', 64),
     'extracted', 2400, 2);
$$);

insert into public.coach_documents
  (id, coach_id, byte_size, page_count, content_locale, content_sha256, text_status)
values
  ('d0000000-0000-0000-0000-0000000000d2','d0000000-0000-0000-0000-0000000000c1',
   9000, 3, 'fr', repeat('d', 64), 'no_text_layer');
select pg_temp.assert_eq('§5 deux documents différents coexistent',
  (select count(*) from public.coach_documents
   where coach_id = 'd0000000-0000-0000-0000-0000000000c1'), 2);

-- Le même contenu chez un AUTRE coach est un autre document: l'unicité est
-- par coach, pas globale. Deux coachs peuvent avoir lu le même livre.
insert into public.coach_documents
  (coach_id, byte_size, page_count, content_locale, content_sha256, text_status)
values ('d0000000-0000-0000-0000-0000000000c2', 120000, 12, 'fr', repeat('c', 64), 'no_text_layer');
select pg_temp.assert_eq('§5 le même contenu chez un autre coach est accepté',
  (select count(*) from public.coach_documents where content_sha256 = repeat('c', 64)), 2);

-- ---------------------------------------------------------------------------
-- §6 — les chunks
-- ---------------------------------------------------------------------------
insert into public.coach_document_chunks
  (id, document_id, coach_id, ordinal, page_number, text, char_count)
values
  ('d0000000-0000-0000-0000-0000000000e1','d0000000-0000-0000-0000-0000000000d1',
   'd0000000-0000-0000-0000-0000000000c1', 0, 1, 'Je ne compte jamais les calories.', 32),
  ('d0000000-0000-0000-0000-0000000000e2','d0000000-0000-0000-0000-0000000000d1',
   'd0000000-0000-0000-0000-0000000000c1', 1, 4, 'Je construis l''assiette.', 24);

select pg_temp.assert_rejects('§6 un chunk en page 0 est refusé', $$
  insert into public.coach_document_chunks
    (document_id, coach_id, ordinal, page_number, text, char_count)
  values ('d0000000-0000-0000-0000-0000000000d1','d0000000-0000-0000-0000-0000000000c1',
     9, 0, 'du texte', 8);
$$);

select pg_temp.assert_rejects('§6 deux chunks ne partagent pas un ordinal', $$
  insert into public.coach_document_chunks
    (document_id, coach_id, ordinal, page_number, text, char_count)
  values ('d0000000-0000-0000-0000-0000000000d1','d0000000-0000-0000-0000-0000000000c1',
     0, 7, 'du texte', 8);
$$);

select pg_temp.assert_rejects('§6 un chunk vide est refusé', $$
  insert into public.coach_document_chunks
    (document_id, coach_id, ordinal, page_number, text, char_count)
  values ('d0000000-0000-0000-0000-0000000000d1','d0000000-0000-0000-0000-0000000000c1',
     11, 1, '   ', 3);
$$);

-- ---------------------------------------------------------------------------
-- §7/§8/§9 — les citations
-- ---------------------------------------------------------------------------
select pg_temp.assert_rejects('§7 une citation ancrée SANS page est refusée', $$
  insert into public.coach_document_citations
    (coach_id, document_id, chunk_id, entry_kind, entry_key, quote, page_number)
  values ('d0000000-0000-0000-0000-0000000000c1','d0000000-0000-0000-0000-0000000000d1',
     'd0000000-0000-0000-0000-0000000000e1', 'belief', 'je ne compte jamais les calories',
     'Je ne compte jamais les calories.', null);
$$);

-- Le cas normal d'un PDF scanné: la citation existe, elle n'est ancrée nulle
-- part, et ce n'est PAS une anomalie — `text_status` porte la raison.
insert into public.coach_document_citations
  (coach_id, document_id, chunk_id, entry_kind, entry_key, quote, page_number)
values ('d0000000-0000-0000-0000-0000000000c1','d0000000-0000-0000-0000-0000000000d2',
   null, 'belief', 'la faim est une information',
   'La faim est une information, jamais une faiblesse.', null);
select pg_temp.assert_eq('§8 une citation non ancrée est acceptée',
  (select count(*) from public.coach_document_citations where chunk_id is null), 1);

insert into public.coach_document_citations
  (coach_id, document_id, chunk_id, entry_kind, entry_key, quote, page_number)
values ('d0000000-0000-0000-0000-0000000000c1','d0000000-0000-0000-0000-0000000000d1',
   'd0000000-0000-0000-0000-0000000000e1', 'belief', 'je ne compte jamais les calories',
   'Je ne compte jamais les calories.', 1);

select pg_temp.assert_rejects('§9 un document ne cite pas deux fois la même entrée', $$
  insert into public.coach_document_citations
    (coach_id, document_id, entry_kind, entry_key, quote)
  values ('d0000000-0000-0000-0000-0000000000c1','d0000000-0000-0000-0000-0000000000d1',
     'belief', 'je ne compte jamais les calories', 'Une autre phrase du meme document.');
$$);

-- Mais DEUX documents peuvent citer la même conviction — c'est même le signal
-- qu'elle est centrale chez ce coach.
insert into public.coach_document_citations
  (coach_id, document_id, entry_kind, entry_key, quote)
values ('d0000000-0000-0000-0000-0000000000c1','d0000000-0000-0000-0000-0000000000d2',
   'belief', 'je ne compte jamais les calories', 'Je le redis ici: pas de calories.');
select pg_temp.assert_eq('§9 deux documents citent la même entrée',
  (select count(*) from public.coach_document_citations
   where entry_key = 'je ne compte jamais les calories'), 2);

select pg_temp.assert_rejects('§9 un entry_kind hors vocabulaire est refusé', $$
  insert into public.coach_document_citations
    (coach_id, document_id, entry_kind, entry_key, quote)
  values ('d0000000-0000-0000-0000-0000000000c1','d0000000-0000-0000-0000-0000000000d1',
     'recette', 'quelque chose', 'une phrase');
$$);

-- ---------------------------------------------------------------------------
-- §10 — RLS: la méthode d'un coach ne remonte JAMAIS chez un autre
-- ---------------------------------------------------------------------------
select pg_temp.become('d0000000-0000-0000-0000-000000000001');
select pg_temp.assert_eq('§10 le coach A voit ses 2 documents',
  (select count(*) from public.coach_documents), 2);
select pg_temp.assert_eq('§10 le coach A voit ses 2 chunks',
  (select count(*) from public.coach_document_chunks), 2);
select pg_temp.assert_eq('§10 le coach A voit ses 3 citations',
  (select count(*) from public.coach_document_citations), 3);

select pg_temp.become('d0000000-0000-0000-0000-000000000002');
select pg_temp.assert_eq('§10 le coach B ne voit AUCUN chunk du coach A',
  (select count(*) from public.coach_document_chunks), 0);
select pg_temp.assert_eq('§10 le coach B ne voit AUCUNE citation du coach A',
  (select count(*) from public.coach_document_citations), 0);
select pg_temp.assert_eq('§10 le coach B ne voit que SON document',
  (select count(*) from public.coach_documents), 1);

-- Et il ne peut pas s'en écrire un chez le coach A.
select pg_temp.assert_rejects('§10 le coach B ne peut pas écrire chez le coach A', $$
  insert into public.coach_document_chunks
    (document_id, coach_id, ordinal, page_number, text, char_count)
  values ('d0000000-0000-0000-0000-0000000000d1','d0000000-0000-0000-0000-0000000000c1',
     50, 1, 'injection', 9);
$$);

select pg_temp.become_service();

-- ---------------------------------------------------------------------------
-- §11 — les cascades
-- ---------------------------------------------------------------------------
delete from public.coach_document_chunks where id = 'd0000000-0000-0000-0000-0000000000e1';
select pg_temp.assert_eq('§11 supprimer un chunk DÉSANCRE la citation, ne la tue pas',
  (select count(*) from public.coach_document_citations
   where document_id = 'd0000000-0000-0000-0000-0000000000d1'), 1);
select pg_temp.assert_true('§11 ... et son chunk_id est passé à null',
  (select chunk_id is null from public.coach_document_citations
   where document_id = 'd0000000-0000-0000-0000-0000000000d1'));

delete from public.coach_documents where id = 'd0000000-0000-0000-0000-0000000000d1';
select pg_temp.assert_eq('§11 supprimer le document emporte ses chunks',
  (select count(*) from public.coach_document_chunks
   where document_id = 'd0000000-0000-0000-0000-0000000000d1'), 0);
select pg_temp.assert_eq('§11 supprimer le document emporte ses citations',
  (select count(*) from public.coach_document_citations
   where document_id = 'd0000000-0000-0000-0000-0000000000d1'), 0);

-- RGPD: le corpus meurt avec le coach, qui meurt avec l'utilisateur auth.
delete from public.coaches where id = 'd0000000-0000-0000-0000-0000000000c1';
select pg_temp.assert_eq('§11 supprimer le coach emporte tout son corpus',
  (select count(*) from public.coach_documents
   where coach_id = 'd0000000-0000-0000-0000-0000000000c1'), 0);

rollback;
