-- ============================================================================
-- LOT 18 · LE PLAN PORTE SES COMPTEURS DE COMPOSITION.
--
-- `write_student_meal_plan` est le SEUL point d'écriture d'un plan (les deux
-- lanes passent par lui). Les deux colonnes ajoutées par 20260821030000 y
-- entrent donc ici, et nulle part ailleurs.
--
-- ⚠️ LE CORPS EST CELUI D'AUJOURD'HUI, REPRIS TEL QUEL, plus DEUX colonnes et
-- DEUX valeurs. Il a été extrait par `pg_get_functiondef` puis patché — pas
-- recopié à la main: cette fonction porte le verrou d'avance, le raccourcissement
-- des plans qui chevauchent et le refus de `plan_kind`, et une transcription
-- approximative de l'un des trois se paierait sur la fenêtre de quelqu'un.
-- ============================================================================

begin;

CREATE OR REPLACE FUNCTION public.write_student_meal_plan(p_user_id uuid, p_intent text, p_starts_on date, p_duration_days smallint, p_payload jsonb, p_replaces uuid DEFAULT NULL::uuid)
 RETURNS TABLE(meal_id uuid, retired_plan_id uuid, truncated_plan_id uuid, truncated_from smallint, truncated_to smallint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_new_id uuid;
  v_retired uuid;
  v_trunc_id uuid;
  v_trunc_from smallint;
  v_trunc_to smallint;
  v_clash record;
  v_kind text;
  v_household uuid;
  v_mode text;
begin
  if p_user_id is null then
    raise exception 'user_required';
  end if;
  -- R6: pas de branche par défaut. Une intention inconnue s'arrête ici plutôt
  -- que de retomber sur le comportement d'une autre.
  if p_intent not in ('replace_current', 'prepare_next') then
    raise exception 'unknown_intent: %', p_intent;
  end if;
  if p_duration_days is null or p_duration_days not between 1 and 7 then
    raise exception 'bad_duration: %', p_duration_days;
  end if;
  if p_starts_on is null then
    raise exception 'starts_on_required';
  end if;

  v_household := nullif(p_payload ->> 'household_id', '')::uuid;
  v_kind := nullif(p_payload ->> 'plan_kind', '');

  -- LA NATURE EST EXIGÉE DÈS QU'IL Y A UN FOYER, et c'est le point de tout ce
  -- fichier. Un plan sans foyer ne peut être que personnel, donc le défaut y
  -- est sûr. Mais dès qu'un foyer est en jeu, les deux natures sont possibles
  -- et le défaut choisirait en silence — un plan commun rangé comme personnel
  -- écraserait la fenêtre du maître au lieu de vivre à côté.
  if v_household is not null and v_kind is null then
    raise exception 'plan_kind_required';
  end if;
  v_kind := coalesce(v_kind, 'personal');
  if v_kind not in ('personal', 'household') then
    raise exception 'unknown_plan_kind: %', v_kind;
  end if;

  -- `mode` ÉTAIT LE SEUL PARAMÈTRE SANS REFUS NOMMÉ, au milieu de neuf qui en
  -- ont un. La colonne est NOT NULL sans défaut ET porte un CHECK: un payload
  -- sans `mode`, ou avec un mode inventé, remontait une erreur Postgres brute
  -- exposant le SQL interne, là où tout le reste rend un motif lisible.
  v_mode := nullif(p_payload ->> 'mode', '');
  if v_mode is null then
    raise exception 'mode_required';
  end if;
  if v_mode not in ('from_pantry', 'to_shop') then
    raise exception 'unknown_mode: %', v_mode;
  end if;

  -- Sérialise les écritures d'un même élève. Deux onglets qui génèrent en même
  -- temps se disputent la même fenêtre, et l'un des deux doit voir l'état que
  -- l'autre a laissé — pas l'état d'avant. Volontairement PAR ÉLÈVE et non par
  -- (élève, nature): plus strict que nécessaire ne coûte qu'une attente, alors
  -- qu'un verrou trop fin laisserait passer deux écritures concurrentes.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- ── LA LIGNE EXPLICITEMENT REMPLACÉE ──────────────────────────────────
  if p_intent = 'replace_current' then
    if p_replaces is null then
      raise exception 'replaces_required';
    end if;
    update public.student_generated_meals
       set retired_at = now()
     where id = p_replaces
       and user_id = p_user_id
       -- La nature aussi: remplacer son plan perso ne doit pas pouvoir viser
       -- le plan commun, ni l'inverse.
       and plan_kind = v_kind
       -- Le prédicat EST la garde de concurrence: deux remplacements qui
       -- courent sur la même ligne, un seul la déplace.
       and retired_at is null
    returning id into v_retired;
    if v_retired is null then
      raise exception 'plan_not_replaceable: %', p_replaces;
    end if;
  end if;

  -- ── CE QUI RESTE ET QUI CHEVAUCHE ─────────────────────────────────────
  -- Un plan vivant qui commence AVANT la nouvelle fenêtre est raccourci: c'est
  -- la vérité littérale, l'élève vient de dire que ces jours-là appartiennent
  -- au nouveau plan.
  --
  -- Un plan vivant qui commence LE MÊME JOUR ou APRÈS ne peut pas être
  -- raccourci vers une fenêtre positive. Le tronquer à zéro le ferait
  -- disparaître en silence — on refuse, en le nommant, pour que l'appelant le
  -- retire explicitement.
  for v_clash in
    select id, starts_on, duration_days
      from public.student_generated_meals
     where user_id = p_user_id
       -- LA NATURE SÉPARE LES FENÊTRES. C'est ce qui permet au maître de tenir
       -- son plan perso ET le plan commun sur la même semaine.
       and plan_kind = v_kind
       and retired_at is null
       -- Non qualifie: daterange vit dans pg_catalog, qui reste implicitement
       -- dans le chemin meme avec un search_path vide. Le prefixer public. le
       -- rend introuvable.
       and daterange(starts_on, (starts_on + duration_days))
           && daterange(p_starts_on, (p_starts_on + p_duration_days))
     order by starts_on
  loop
    if v_clash.starts_on >= p_starts_on then
      raise exception 'plan_overlaps_existing: %', v_clash.id;
    end if;

    -- LE CAS « CONTIENT » — mesuré le 2026-08-11, il perdait des jours en
    -- SILENCE. Plan vivant [06/09, 13/09), nouvelle fenêtre INTÉRIEURE
    -- [08/09, 10/09): l'ancien était tronqué à sa tête, et 10/09 → 12/09 ne
    -- se retrouvaient couverts par AUCUN plan. La trace annonçait en plus
    -- `days_taken: 5` quand le nouveau plan n'en prend que 2.
    --
    -- C'est exactement ce que le refus juste au-dessus existe pour empêcher:
    -- « le tronquer le ferait disparaître en silence — on refuse, en le
    -- nommant, pour que l'appelant le retire explicitement ». Le cas
    -- « commence avant ET finit après » violait la même règle sans être nommé.
    if v_clash.starts_on + v_clash.duration_days
       > p_starts_on + p_duration_days then
      raise exception 'plan_overlaps_existing: %', v_clash.id;
    end if;

    v_trunc_id := v_clash.id;
    v_trunc_from := v_clash.duration_days;
    v_trunc_to := (p_starts_on - v_clash.starts_on)::smallint;

    update public.student_generated_meals
       set duration_days = v_trunc_to,
           -- Tracé sur la ligne, comme `generated_from.issues`: lisible en SQL,
           -- trois jours plus tard, par quelqu'un qui n'a pas fait l'appel.
           generated_from = coalesce(generated_from, '{}'::jsonb)
             || jsonb_build_object('truncated_by', jsonb_build_object(
                  'from_duration_days', v_trunc_from,
                  'to_duration_days', v_trunc_to,
                  'at', now()
                ))
     where id = v_clash.id;
  end loop;

  -- ── LE PLAN NEUF ──────────────────────────────────────────────────────
  -- `scope` est DÉRIVÉ ici et n'est plus une entrée: une ligne `scope='day'`
  -- portant une fenêtre de sept jours était possible, et ne l'est plus.
  insert into public.student_generated_meals (
    user_id, starts_on, duration_days, scope, mode, meal_slot, servings,
    context, preferences, pantry, dishes, preparations, cooking_sessions,
    shopping_list, generated_from, content_locale,
    household_id, member_portions, plan_kind,
    -- LOT 18 — LES QUATRE COMPTEURS DE LA COMPOSITION, ÉCRITS SUR CHAQUE PLAN.
    -- Ils ne vivent PAS dans `generated_from`: ce champ ne sort que pour un
    -- `intent` autre que `draft`, et toute vérification en situation réelle se
    -- fait en `draft`. Un compteur rangé là serait aveugle très exactement
    -- pendant qu'on le regarde.
    composition_unknowns, composition_energy_sources
  )
  values (
    p_user_id,
    p_starts_on,
    p_duration_days,
    case when p_duration_days = 1 then 'day' else 'several_days' end,
    v_mode,
    nullif(p_payload ->> 'meal_slot', ''),
    coalesce((p_payload ->> 'servings')::int, 1),
    nullif(p_payload ->> 'context', ''),
    nullif(p_payload ->> 'preferences', ''),
    coalesce(p_payload -> 'pantry', '[]'::jsonb),
    coalesce(p_payload -> 'dishes', '[]'::jsonb),
    coalesce(p_payload -> 'preparations', '[]'::jsonb),
    coalesce(p_payload -> 'cooking_sessions', '[]'::jsonb),
    coalesce(p_payload -> 'shopping_list', '[]'::jsonb),
    coalesce(p_payload -> 'generated_from', '{}'::jsonb)
      || case when v_trunc_id is null then '{}'::jsonb
              else jsonb_build_object('truncates', jsonb_build_object(
                     'plan_id', v_trunc_id, 'days_taken', v_trunc_from - v_trunc_to))
         end,
    coalesce(p_payload ->> 'content_locale', 'en'),
    v_household,
    coalesce(p_payload -> 'member_portions', '[]'::jsonb),
    v_kind,
    -- ⚠️ `greatest(0, ...)` ET PAS UN CAST NU: la colonne porte un CHECK >= 0,
    -- et un appelant qui enverrait -1 ferait ÉCHOUER l'écriture du plan pour un
    -- compteur. Aucun instrument de mesure ne doit pouvoir coûter un dîner.
    greatest(0, coalesce((p_payload ->> 'composition_unknowns')::int, 0)),
    coalesce(p_payload -> 'composition_energy_sources', '{}'::jsonb)
  )
  returning id into v_new_id;

  return query select v_new_id, v_retired, v_trunc_id, v_trunc_from, v_trunc_to;
end;
$function$;

commit;
