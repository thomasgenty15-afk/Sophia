-- DE-WHATSAPP — P0 : le plafond quotidien devient un VERROU, pas une opinion.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LE DÉFAUT, MESURÉ AVANT D'ÊTRE CORRIGÉ
--
-- `delivery.ts` comptait les envois du jour, comparait au plafond, puis
-- écrivait. Un read-then-write. La passe adversariale (pattern (b),
-- concurrence) de `delivery_int_test.ts` a lancé six livraisons simultanées à
-- un élève dont le plafond est 2 :
--
--     [info] concurrence: 6/6 livrés (plafond 2, read-then-write assumé)
--
-- SIX SUR SIX. Les six lectures ont vu « 0 envoyé » avant que la première
-- écriture n'atterrisse. Le plafond n'était pas « approximatif à un message
-- près » comme je l'avais écrit dans le test : il était INEXISTANT dès qu'il y
-- avait de la concurrence. Et la concurrence est le mode normal d'un fan-out de
-- cron.
--
-- Ce plafond est la seule chose qui empêche le produit de spammer. Un plafond
-- qui ne tient pas sous fan-out ne protège personne — il rassure juste celui
-- qui lit le code.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE QUE CETTE FONCTION FAIT, ET CE QU'ELLE NE FAIT PAS
--
-- ELLE FAIT : compter et insérer dans LA MÊME transaction, derrière un verrou
-- consultatif porté par l'élève. Deux livraisons simultanées au même élève se
-- sérialisent ; deux élèves différents ne se bloquent jamais.
--
-- ELLE NE FAIT PAS : décider. Aucune règle produit ici — ni purpose garanti, ni
-- mute, ni état composé. Tout ça vit dans `delivery_policy.ts`, en TypeScript,
-- pur et testable. La leçon est celle de `reengagement_io.ts` : dupliquer
-- l'ordre des gardes en SQL crée une seconde implémentation qui divergera.
-- SQL ne reçoit ici qu'un booléen déjà décidé (`p_enforce_cap`) et un nombre.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI LE JOUR EST UNE CHAÎNE ET PAS UN INTERVALLE
--
-- `p_local_date` est la date locale de l'élève, calculée UNE fois côté TS par
-- `localDateFor`. La fonction ne fait que l'égalité de chaînes.
--
-- L'alternative — passer deux `timestamptz` et compter entre — obligerait à
-- résoudre le décalage horaire du jour concerné des DEUX côtés. Se tromper
-- d'une heure deux fois par an sur un plafond quotidien est exactement le
-- genre de défaut que personne ne trouve. Une seule source de vérité pour
-- « quel jour est-il pour cet élève », et c'est `localDateFor` : c'est déjà la
-- leçon écrite en tête de `reengagement_io.ts`, où deux calculs divergents ont
-- fait qu'une clé `(user_id, local_date)` ne se rejoignait jamais.

create or replace function public.claim_in_app_outbound(
  p_user_id uuid,
  p_request_id text,
  p_message_type text,
  p_content_preview text,
  p_status text,
  p_metadata jsonb,
  p_last_error_code text,
  p_enforce_cap boolean,
  p_cap integer,
  p_local_date text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer;
begin
  if p_enforce_cap then
    -- Le verrou est pris DANS la transaction qui insère. C'est toute la
    -- différence avec l'ancien compte : ici, le comptage et l'écriture ne
    -- peuvent pas être séparés par une autre livraison.
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

    select count(*) into v_count
      from public.outbound_messages
     where user_id = p_user_id
       and delivery_channel = 'in_app'
       and status = 'sent'
       and metadata->>'counts_as_unsolicited' = 'true'
       and metadata->>'local_date' = p_local_date;

    if v_count >= p_cap then
      -- Refus. L'appelant écrira sa propre ligne `skipped` avec le motif: une
      -- ligne de refus n'a pas besoin du verrou et ne doit pas le retenir.
      return null;
    end if;
  end if;

  insert into public.outbound_messages (
    request_id, user_id, to_e164, delivery_channel, message_type,
    content_preview, graph_payload, status, last_error_code,
    last_error_message, metadata, updated_at
  ) values (
    p_request_id, p_user_id, null, 'in_app', p_message_type,
    left(coalesce(p_content_preview, ''), 500), '{}'::jsonb, p_status,
    p_last_error_code, p_last_error_code, coalesce(p_metadata, '{}'::jsonb), now()
  ) returning id into v_id;

  return v_id;
end $$;

revoke all on function public.claim_in_app_outbound(
  uuid, text, text, text, text, jsonb, text, boolean, integer, text
) from public;
revoke all on function public.claim_in_app_outbound(
  uuid, text, text, text, text, jsonb, text, boolean, integer, text
) from anon;
revoke all on function public.claim_in_app_outbound(
  uuid, text, text, text, text, jsonb, text, boolean, integer, text
) from authenticated;
grant execute on function public.claim_in_app_outbound(
  uuid, text, text, text, text, jsonb, text, boolean, integer, text
) to service_role;

comment on function public.claim_in_app_outbound(
  uuid, text, text, text, text, jsonb, text, boolean, integer, text
) is
  'Réserve ET écrit une livraison in-app en une transaction, sous verrou par '
  'élève. Ne décide rien: la politique vit dans delivery_policy.ts.';

-- L'index qui rend le compte sous verrou bon marché. Partiel: seules les
-- livraisons in-app RÉUSSIES et COMPTABILISÉES sont comptées.
create index if not exists outbound_messages_unsolicited_day_idx
  on public.outbound_messages (
    user_id,
    (metadata->>'local_date'),
    (metadata->>'counts_as_unsolicited')
  )
  where delivery_channel = 'in_app' and status = 'sent';

-- ── FAIL LOUD (R7) ──────────────────────────────────────────────────────────
do $$
begin
  perform 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'claim_in_app_outbound';
  if not found then
    raise exception 'dewhatsapp: claim_in_app_outbound absente';
  end if;

  -- SECURITY DEFINER: la fonction écrit dans une table que `authenticated` ne
  -- doit pas toucher directement. Si quelqu'un la repasse en INVOKER un jour,
  -- ce test tombe avant que le silence ne s'installe.
  perform 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'claim_in_app_outbound'
     and p.prosecdef;
  if not found then
    raise exception 'dewhatsapp: claim_in_app_outbound n''est pas SECURITY DEFINER';
  end if;

  -- Et surtout: personne d'autre que service_role ne l'exécute. Une fonction
  -- SECURITY DEFINER exécutable par `authenticated` serait une porte pour
  -- écrire n'importe quoi dans le ledger de n'importe qui.
  if has_function_privilege('authenticated',
       'public.claim_in_app_outbound(uuid, text, text, text, text, jsonb, text, boolean, integer, text)',
       'EXECUTE') then
    raise exception 'dewhatsapp: authenticated peut exécuter claim_in_app_outbound';
  end if;
  if has_function_privilege('anon',
       'public.claim_in_app_outbound(uuid, text, text, text, text, jsonb, text, boolean, integer, text)',
       'EXECUTE') then
    raise exception 'dewhatsapp: anon peut exécuter claim_in_app_outbound';
  end if;

  raise notice 'dewhatsapp: plafond quotidien atomique en place';
end $$;
