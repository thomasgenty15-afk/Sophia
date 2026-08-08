-- ============================================================================
-- FF-028 — LA RECOMMANDATION QUOTIDIENNE (V1)
--
-- CE QUE CETTE MIGRATION POSE, ET CE QU'ELLE REFUSE DE POSER
-- ---------------------------------------------------------
-- Elle pose UNE table de propositions et UNE fonction d'application. Elle ne
-- pose AUCUN compteur, AUCUN trait durable sur l'élève, AUCUNE table de
-- « directive ». Trois absences délibérées:
--
--   * pas de compteur de refus: la série se DÉRIVE des lignes d'état
--     (`declined` consécutifs depuis la dernière acceptation). Un compteur
--     stocké est le trait durable que FF-027 R4 interdit, et il divergerait de
--     sa fenêtre au premier jour qui sort;
--   * pas de table « directive durable »: la directive EST le rythme de
--     l'élève (`student_goals.practical_constraints.eating_rhythm`), qui a déjà
--     un lecteur au runtime (`generate-meal-v1`, `generate-household-meal-v1`,
--     via `parseEatingRhythm`). Une seconde table aurait été une donnée sans
--     consommateur — c'est-à-dire exactement ce que la règle mère du domaine
--     interdit, dans la fiche qui la cite;
--   * pas de cooldown stocké: il se dérive de `state='declined'` + `local_date`.
--
-- L'EMPREINTE DU PLAN EST CE QUI REND LA PROPOSITION PÉRISSABLE (fiche §5)
-- -----------------------------------------------------------------------
-- Elle est calculée sur ce dont l'ACTION dépend, et sur rien d'autre: le rythme
-- alimentaire effectif au moment de la proposition, et la version de doctrine
-- qui a filtré l'espace d'action. Le CONTENU du plan de la semaine (les plats
-- composés) n'y entre PAS, et c'est une décision: il change plusieurs fois par
-- semaine, l'y mettre ferait de « la proposition a expiré » le cas nominal, et
-- une garde qui mord toujours est une garde qu'on débranche dans la semaine.
--
-- L'UNICITÉ (user_id, local_date) EST L'ARBITRE, PAS UNE DISCIPLINE
-- ----------------------------------------------------------------
-- Deux ticks du cron dans la même heure locale, ou deux instances du job
-- lancées en parallèle, lisent tous les deux « aucune proposition aujourd'hui »
-- avant qu'aucun n'écrive. C'est l'index unique qui tranche — même mécanique
-- que `(user_id, asked_for_message_id)` dans le budget de demande.
-- ============================================================================

begin;

create table if not exists public.student_daily_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- La journée LOCALE de l'élève, résolue par l'appelant. Jamais la date du
  -- serveur: la famille de bugs nocturnes déjà payée par ce dépôt.
  local_date date not null,
  -- L'ACTION, prise dans l'espace fermé de la V1. Le CHECK est aligné sur
  -- `RECOMMENDATION_ACTION_IDS` côté code; une action ajoutée d'un seul côté
  -- casse `daily_recommendation_contract_test`.
  action_id text not null check (action_id in (
    'add_breakfast',        -- famille « rythme des repas »
    'add_afternoon_snack'   -- famille « collation de structure »
  )),
  state text not null default 'proposed' check (state in (
    'proposed', 'accepted', 'declined', 'expired'
  )),
  -- L'empreinte, en clair et relisible: « rhythm=lunch,dinner|doctrine=3 ».
  -- Un hash aurait été plus court et illisible en incident.
  plan_fingerprint text not null,
  -- Le texte EXACT parti. C'est ce qui rend l'audit possible, comme sur le
  -- budget de demande.
  proposed_text text not null,
  -- La bulle qui porte les deux boutons. `null` tant que la livraison n'a pas
  -- rendu son identifiant.
  chat_message_id uuid,
  responded_at timestamptz,
  -- ⚠️ `applied_at` N'EST POSÉ QU'APRÈS RELECTURE de `eating_rhythm`.
  -- `state='accepted'` dit « l'élève a tapé Oui »; `applied_at` dit « la ligne
  -- existe et je l'ai relue ». Les confondre est l'accusé fantôme, le défaut le
  -- plus cher du dépôt.
  applied_at timestamptz,
  -- Pourquoi la proposition est morte sans réponse. Liste fermée.
  expiry_reason text check (expiry_reason is null or expiry_reason in (
    'plan_changed',   -- l'empreinte ne correspond plus au tap
    'undelivered',    -- la livraison a été refusée (plafond, mute, suppression)
    -- 🔴 AJOUTÉ APRÈS UNE MESURE. Une proposition restée SANS RÉPONSE était
    -- re-proposée chaque soir: 3 soirs, 3 bulles, 3 lignes, sur des données
    -- inchangées. « Le silence n'est pas une demande de rappel » est la règle
    -- que le tap du soir porte déjà (`already_sent_today`); elle vaut ici aussi,
    -- et c'est de la sollicitation avec des boutons sans elle.
    'unanswered'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- R2 / T4: au plus UNE proposition par élève et par journée locale.
  constraint student_daily_recommendations_one_per_day
    unique (user_id, local_date)
);

-- Le cooldown et la série de refus se lisent par (élève, action, récence).
create index if not exists student_daily_recommendations_user_action_idx
  on public.student_daily_recommendations (user_id, action_id, local_date desc);

-- La reprise d'une proposition ouverte au moment du tap.
create index if not exists student_daily_recommendations_user_state_idx
  on public.student_daily_recommendations (user_id, state);

drop trigger if exists student_daily_recommendations_set_updated_at
  on public.student_daily_recommendations;
create trigger student_daily_recommendations_set_updated_at
  before update on public.student_daily_recommendations
  for each row execute function public.tg_set_updated_at();

comment on table public.student_daily_recommendations is
  'FF-028 — les recommandations PROPOSÉES à un élève et leur sort. Une ligne '
  'par proposition réellement partie (au plus une par journée locale). Aucun '
  'compteur: la série de refus et le cooldown se DÉRIVENT de ces lignes. La '
  'directive acceptée, elle, ne vit pas ici — elle vit dans '
  'student_goals.practical_constraints.eating_rhythm, qui a déjà un lecteur au '
  'runtime. Accès unique: _shared/keel/daily_recommendation_io.ts.';

comment on column public.student_daily_recommendations.plan_fingerprint is
  'L''état sur lequel l''action a été calculée: rythme alimentaire effectif + '
  'version de doctrine. Le tap ne s''applique QUE si l''empreinte est encore '
  'vraie — une recommandation calculée sur un état disparu est un bug, pas une '
  'commodité (fiche §5).';

comment on column public.student_daily_recommendations.applied_at is
  'Posé UNIQUEMENT après relecture de eating_rhythm en base. state=accepted dit '
  'que l''élève a tapé Oui; applied_at dit que la ligne existe et a été relue.';

-- ---------------------------------------------------------------------------
-- LA GARDE DE PRIVILÈGES — les default privileges de Supabase accordent TOUT à
-- `authenticated` sur toute table neuve. Une proposition est de la matière de
-- coaching: personne d'autre que le service ne la touche.
-- ---------------------------------------------------------------------------
alter table public.student_daily_recommendations enable row level security;
revoke all on public.student_daily_recommendations from public;
revoke all on public.student_daily_recommendations from anon;
revoke all on public.student_daily_recommendations from authenticated;
grant all on public.student_daily_recommendations to service_role;

-- ---------------------------------------------------------------------------
-- L'APPLICATION DE LA DIRECTIVE — ATOMIQUE, EN SQL, ET PAS EN LECTURE-MODIF-
-- ÉCRITURE CÔTÉ EDGE.
--
-- `practical_constraints` a DEUX écrivains: la carte de `/app/plan` et
-- désormais ce chemin. Un read-modify-write complet côté TypeScript ferait
-- gagner le dernier — et effacerait, par exemple, le temps de cuisine que
-- l'élève venait de régler sur l'écran. Le `for update` + l'opérateur `||`
-- fusionnent la SEULE clé concernée, sous verrou de ligne.
--
-- ELLE EST IDEMPOTENTE: un moment déjà présent n'est pas ajouté deux fois, et
-- sa TAILLE éventuelle est préservée. Deux taps sur le même bouton produisent
-- donc exactement le même rythme.
--
-- ELLE REFUSE D'AGIR SUR UN RYTHME VIDE, et c'est une garde, pas une
-- précaution: `eating_rhythm` absent ou vide veut dire « cet élève reçoit le
-- rythme par défaut » (petit-déjeuner, déjeuner, dîner). Y écrire un seul
-- moment REMPLACERAIT la journée entière par ce moment-là — un élève qui
-- accepte une collation se retrouverait avec une collation et rien d'autre.
-- ---------------------------------------------------------------------------
create or replace function public.keel_add_eating_rhythm_slot(
  p_user_id uuid,
  p_slot text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_rhythm jsonb;
  v_found boolean := false;
  v_has_slot boolean;
  v_merged jsonb;
begin
  if p_slot is null or p_slot not in (
    'breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner', 'before_bed'
  ) then
    raise exception 'keel_add_eating_rhythm_slot: slot % hors vocabulaire', p_slot;
  end if;

  select true, coalesce(practical_constraints -> 'eating_rhythm', '[]'::jsonb)
    into v_found, v_rhythm
  from public.student_goals
  where user_id = p_user_id
  for update;

  -- Pas de ligne d'objectifs, ou rythme non déclaré: on ne touche à rien. Le
  -- `null` rendu est une DÉCLARATION d'échec que l'appelant doit lire — il ne
  -- doit surtout pas accuser réception.
  if not coalesce(v_found, false) then
    return null;
  end if;
  if jsonb_typeof(v_rhythm) <> 'array' or jsonb_array_length(v_rhythm) = 0 then
    return null;
  end if;

  select exists (
    select 1
    from jsonb_array_elements(v_rhythm) e
    where (jsonb_typeof(e) = 'string' and e #>> '{}' = p_slot)
       or (jsonb_typeof(e) = 'object' and e ->> 'slot' = p_slot)
  ) into v_has_slot;

  if v_has_slot then
    v_merged := v_rhythm;
  else
    -- La TAILLE reste nulle: personne n'a dit si ce moment est gros ou petit,
    -- et une précision inventée, le moteur la traite comme une contrainte.
    v_merged := v_rhythm || jsonb_build_array(
      jsonb_build_object('slot', p_slot, 'size', null)
    );
  end if;

  update public.student_goals
     set practical_constraints =
           practical_constraints || jsonb_build_object('eating_rhythm', v_merged)
   where user_id = p_user_id;

  return v_merged;
end;
$$;

revoke all on function public.keel_add_eating_rhythm_slot(uuid, text) from public;
revoke all on function public.keel_add_eating_rhythm_slot(uuid, text) from anon;
revoke all on function public.keel_add_eating_rhythm_slot(uuid, text) from authenticated;
grant execute on function public.keel_add_eating_rhythm_slot(uuid, text) to service_role;

comment on function public.keel_add_eating_rhythm_slot(uuid, text) is
  'FF-028 — ajoute UN moment au rythme alimentaire d''un élève, sous verrou de '
  'ligne et sans écraser les autres contraintes pratiques. Idempotente. Rend le '
  'rythme résultant, ou NULL quand il n''y a rien à modifier (pas de ligne '
  'student_goals, ou rythme non déclaré — auquel cas l''élève reçoit le rythme '
  'par défaut et y écrire un seul moment effacerait sa journée).';

commit;

-- ===========================================================================
-- CONTRÔLE FINAL — on rejoue les GESTES, on n'inspecte pas du texte.
-- ===========================================================================
do $$
declare
  probe_user uuid;
  probe_goal uuid;
  got jsonb;
begin
  select id into probe_user from auth.users limit 1;
  if probe_user is null then
    raise notice 'ff028: aucun utilisateur, contrôles de geste sautés';
    return;
  end if;

  -- (1) deux propositions le même jour local pour le même élève: refusé.
  insert into public.student_daily_recommendations
    (user_id, local_date, action_id, plan_fingerprint, proposed_text)
  values (probe_user, date '1999-01-02', 'add_breakfast', 'probe', 'probe');
  begin
    insert into public.student_daily_recommendations
      (user_id, local_date, action_id, plan_fingerprint, proposed_text)
    values (probe_user, date '1999-01-02', 'add_afternoon_snack', 'probe', 'probe');
    raise exception 'ff028: deux propositions le même jour ont été acceptées';
  exception when unique_violation then
    null;
  end;

  -- (2) une action hors espace: refusée.
  begin
    insert into public.student_daily_recommendations
      (user_id, local_date, action_id, plan_fingerprint, proposed_text)
    values (probe_user, date '1999-01-03', 'breathing_routine', 'probe', 'probe');
    raise exception 'ff028: une action hors espace a été acceptée';
  exception when check_violation then
    null;
  end;

  delete from public.student_daily_recommendations
   where user_id = probe_user and local_date between date '1999-01-01' and date '1999-01-09';

  -- (3) la fonction refuse d'agir sur un élève sans rythme déclaré.
  select id into probe_goal from public.student_goals where user_id = probe_user;
  if probe_goal is null then
    got := public.keel_add_eating_rhythm_slot(probe_user, 'snack_pm');
    if got is not null then
      raise exception 'ff028: la fonction a écrit sur un élève sans student_goals';
    end if;
  end if;

  -- (4) un slot hors vocabulaire lève.
  begin
    perform public.keel_add_eating_rhythm_slot(probe_user, 'brunch');
    raise exception 'ff028: un slot hors vocabulaire a été accepté';
  exception when others then
    if sqlerrm not like '%hors vocabulaire%' then raise; end if;
  end;

  -- (5) `anon` et `authenticated` n'ont rien sur la table neuve.
  if has_table_privilege('anon', 'public.student_daily_recommendations', 'SELECT') then
    raise exception 'ff028: anon a un SELECT sur student_daily_recommendations';
  end if;
  if has_table_privilege('authenticated', 'public.student_daily_recommendations', 'SELECT') then
    raise exception 'ff028: authenticated a un SELECT sur student_daily_recommendations';
  end if;
  if has_function_privilege('authenticated',
      'public.keel_add_eating_rhythm_slot(uuid, text)', 'EXECUTE') then
    raise exception 'ff028: authenticated peut exécuter keel_add_eating_rhythm_slot';
  end if;
end $$;
