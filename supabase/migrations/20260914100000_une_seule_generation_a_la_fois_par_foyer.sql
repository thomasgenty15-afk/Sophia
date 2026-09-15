-- ══════════════════════════════════════════════════════════════════════════
-- ⟳ 2026-09-14 · BÊTA LOT 2B — UN FOYER NE COMPOSE QU'UNE FOIS À LA FOIS
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⛔ CE QUI N'EXISTAIT PAS, ET CE QUE ÇA COÛTE. `resolveGenerationAdmission`
-- vérifie QUI a le droit de composer; RIEN ne vérifiait si une composition est
-- déjà en cours. Deux clics, deux onglets, ou une relance après un timeout
-- CLIENT (le serveur, lui, continue) lancent deux générations complètes du même
-- foyer:
--
--   · deux appels fournisseur PAYÉS pour un seul résultat logique;
--   · jusqu'à quatre réparations au lieu de deux (le plafond vit par requête);
--   · deux plans écrits, concurrents, dont le dernier arrivé gagne — et
--     personne ne sait lequel la personne regardait.
--
-- ⛔ ET LE BOUTON DÉSACTIVÉ N'EST PAS UNE PROTECTION. Le plan de bêta l'écrit
-- en toutes lettres: « vérifier la déduplication côté serveur, pas seulement le
-- bouton désactivé ». Un rechargement, un second onglet ou un `curl` passent à
-- côté de l'écran.
--
-- ── POURQUOI UNE TABLE ET PAS UN VERROU CONSULTATIF ────────────────────────
-- `pg_advisory_lock` mourrait avec la connexion, et une fonction edge en ouvre
-- une par requête: le verrou tomberait au premier `await`. Surtout, il ne sait
-- pas DIRE qui le tient — et la moitié utile de cette garde est de rendre le
-- `request_id` en cours, pour que le client retrouve l'issue au lieu de
-- relancer.
--
-- ── LE PÉREMPTION EST PASSÉE, JAMAIS ÉCRITE ICI ───────────────────────────
-- Une fonction edge peut mourir sans rien libérer (546, worker tué, coupure).
-- Sans péremption, un foyer resterait bloqué pour toujours. Le délai vient de
-- l'APPELANT (`PLAN_REQUEST_BUDGET_MS` + sa marge), jamais d'un nombre écrit
-- deux fois: « deux copies d'un même nombre divergent » est une cicatrice de ce
-- dépôt, et c'est la règle de `maxFridgeDays` comme de `p_local_date`.

create table if not exists public.household_generation_lock (
  -- UNE LIGNE PAR FOYER, ET C'EST LA CLÉ DE LA GARDE. La contrainte d'unicité
  -- EST le verrou: on n'y lit pas avant d'écrire, on écrit et on regarde si ça
  -- passe. Une lecture suivie d'une écriture laisse la fenêtre exacte que cette
  -- table existe pour fermer.
  household_id uuid primary key references public.households(id) on delete cascade,
  -- LA DEMANDE EN COURS. Rendue au second appelant pour qu'il puisse RETROUVER
  -- l'issue (le plan écrit porte ce même identifiant) au lieu de relancer.
  request_id uuid not null,
  -- `draft` ou l'intention d'écriture. Compté, jamais gardé: un aperçu et une
  -- activation se bousculent de la même façon.
  intent text not null,
  -- QUI a lancé. Le foyer n'a qu'un maître, mais la trace doit pouvoir le dire
  -- quand deux sessions du même compte se marchent dessus.
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now()
);

comment on table public.household_generation_lock is
  'BÊTA lot 2B (2026-09-14) — la composition EN COURS d''un foyer, une ligne au '
  'plus. Prise par keel_household_claim_generation AVANT tout appel payé, '
  'rendue par keel_household_release_generation. La clé primaire EST le verrou. '
  'Aucun rôle client n''y touche (RLS active, AUCUNE policy): un verrou qu''un '
  'client peut lever n''est pas un verrou.';
comment on column public.household_generation_lock.request_id is
  'La demande en cours. RENDUE au second appelant: c''est ce qui lui permet de '
  'retrouver l''issue au lieu de relancer — « un timeout client n''est pas une '
  'preuve d''arrêt serveur ».';
comment on column public.household_generation_lock.started_at is
  'Quand la prise a eu lieu. La PÉREMPTION est passée par l''appelant '
  '(p_stale_after), jamais écrite ici: deux copies d''un même délai divergent.';

alter table public.household_generation_lock enable row level security;

-- ⛔ AUCUNE POLICY, ET C'EST LA GARDE. Même posture que
-- `household_merge_quota`: RLS active sans policy ⇒ aucun rôle client ne lit ni
-- n'écrit. Les privilèges par défaut de Supabase donnent TOUT à `authenticated`
-- sur toute table neuve (cicatrice `supabase-default-privileges-grant-all`), et
-- `revoke from public` laisse `anon` — les deux sont donc nommés.
revoke all on table public.household_generation_lock from public, anon, authenticated;
grant select, insert, update, delete on table public.household_generation_lock to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- PRENDRE LE VERROU — l'insertion EST la garde
-- ══════════════════════════════════════════════════════════════════════════
create or replace function public.keel_household_claim_generation(
  p_household uuid,
  p_request uuid,
  p_intent text,
  p_actor uuid,
  -- ⚠️ OBLIGATOIRE, SANS DÉFAUT. Un `coalesce(p_stale_after, '10 minutes')`
  -- ferait retomber la péremption sur un nombre écrit ici dès qu'un appelant
  -- l'oublie, et « un paramètre de garde optionnel est une garde désarmée ».
  p_stale_after interval
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_existing public.household_generation_lock%rowtype;
begin
  if p_household is null then
    return jsonb_build_object('ok', false, 'reason', 'household_required');
  end if;
  if p_request is null then
    return jsonb_build_object('ok', false, 'reason', 'request_required');
  end if;
  if p_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'actor_required');
  end if;
  if p_stale_after is null then
    return jsonb_build_object('ok', false, 'reason', 'stale_after_required');
  end if;

  -- ① LA PRISE PÉRIMÉE TOMBE D'ABORD. Une fonction edge tuée par le mur ne
  -- libère rien; sans cette ligne, le foyer resterait verrouillé pour toujours.
  delete from public.household_generation_lock
   where household_id = p_household
     and started_at < now() - p_stale_after;

  -- ② L'INSERTION EST LE VERROU. `on conflict do nothing` puis `not found`:
  -- aucune lecture préalable, donc aucune fenêtre entre le « est-ce libre ? »
  -- et le « je le prends ».
  insert into public.household_generation_lock
    (household_id, request_id, intent, actor_user_id)
  values (p_household, p_request, coalesce(nullif(trim(p_intent), ''), 'unknown'), p_actor)
  on conflict (household_id) do nothing;

  if found then
    return jsonb_build_object('ok', true, 'request_id', p_request);
  end if;

  -- ③ OCCUPÉ — ET ON DIT PAR QUI. C'est la moitié utile: le client peut
  -- retrouver l'issue de CETTE demande-là.
  select * into v_existing
    from public.household_generation_lock
   where household_id = p_household;

  -- ⚠️ LA MÊME DEMANDE QUI REVIENT N'EST PAS UNE COLLISION. Un rejeu du même
  -- `request_id` (une relance réseau du même appel) retrouve son propre verrou:
  -- le refuser ferait échouer une requête qui n'a jamais abouti.
  if v_existing.request_id = p_request then
    return jsonb_build_object('ok', true, 'request_id', p_request, 'reclaimed', true);
  end if;

  return jsonb_build_object(
    'ok', false,
    'reason', 'in_flight',
    'request_id', v_existing.request_id,
    'intent', v_existing.intent,
    'started_at', v_existing.started_at
  );
end;
$function$;

comment on function public.keel_household_claim_generation(uuid, uuid, text, uuid, interval) is
  'BÊTA lot 2B — prend le verrou de composition d''un foyer. L''INSERT est la '
  'garde (clé primaire), jamais une lecture suivie d''une écriture. Rend '
  '{ok:false, reason:"in_flight", request_id} quand une autre demande tourne, '
  'pour que le client RETROUVE l''issue au lieu de relancer. Le même '
  'request_id qui revient reprend son propre verrou.';

-- ══════════════════════════════════════════════════════════════════════════
-- RENDRE LE VERROU — seulement le sien
-- ══════════════════════════════════════════════════════════════════════════
create or replace function public.keel_household_release_generation(
  p_household uuid,
  p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_rows integer;
begin
  if p_household is null or p_request is null then
    return jsonb_build_object('ok', false, 'reason', 'arguments_required');
  end if;

  -- ⛔ `and request_id = p_request` EST LA MOITIÉ QUI COMPTE. Une demande
  -- attardée qui se termine après qu'une autre a pris le verbe ne doit PAS
  -- libérer celui de sa remplaçante — sinon deux compositions tourneraient
  -- quand même, et le verrou ne servirait qu'à retarder la collision.
  delete from public.household_generation_lock
   where household_id = p_household
     and request_id = p_request;
  get diagnostics v_rows = row_count;

  return jsonb_build_object('ok', true, 'released', v_rows);
end;
$function$;

comment on function public.keel_household_release_generation(uuid, uuid) is
  'BÊTA lot 2B — rend le verrou de composition, et SEULEMENT le sien '
  '(`request_id` dans le `where`). `released: 0` veut dire « une autre demande '
  'tient déjà le verrou », jamais « erreur ».';

revoke all on function public.keel_household_claim_generation(uuid, uuid, text, uuid, interval)
  from public, anon, authenticated;
revoke all on function public.keel_household_release_generation(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.keel_household_claim_generation(uuid, uuid, text, uuid, interval)
  to service_role;
grant execute on function public.keel_household_release_generation(uuid, uuid)
  to service_role;
