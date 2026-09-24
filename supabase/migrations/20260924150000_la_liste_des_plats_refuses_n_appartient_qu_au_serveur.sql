-- ═══════════════════════════════════════════════════════════════════════════
-- LA LISTE DES PLATS REFUSÉS N'APPARTIENT QU'AU SERVEUR — 2026-09-24.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── LE DÉFAUT, TROUVÉ PAR LES TESTS COMPLÉMENTAIRES DE « REMPLACER » ──────
-- `practical_constraints.rejected_dishes` s'écrit par deux fonctions SQL
-- (`keel_append_rejected_dishes_for`, `keel_remove_rejected_dish`), en une
-- fusion atomique. Mais le navigateur réécrit TOUTE la colonne depuis sa copie:
-- `mergePracticalConstraints` pose `{...current, ...patch}`, et
-- `saveUndoneFieldChanges` pose l'objet entier de « Ce que Sophia sait ».
-- Sur `/app/plan`, la copie date de l'ouverture de la page: « Remplacer » range
-- des plats refusés côté serveur, puis le premier enregistrement de la grille
-- « qui mange à la maison » réécrit la colonne SANS eux. Une suite de clics
-- ordinaire, dans un seul onglet. Et « Défaire » dans « Ce que Sophia sait »
-- faisait revenir un plat retiré depuis.
--
-- ── LA RÈGLE ───────────────────────────────────────────────────────────────
-- Une écriture faite sous le rôle du navigateur (`authenticated`, `anon`) ne
-- change JAMAIS `rejected_dishes`: le déclencheur remet la valeur de la ligne.
-- Les deux fonctions de la liste sont `security definer` (elles tournent sous
-- leur propriétaire) et le serveur écrit en `service_role`: eux seuls la
-- changent. Atomique: aucune fenêtre entre une lecture et une écriture.
--
-- ⚠️ CE N'EST PAS LE CORRECTIF DES COPIES PÉRIMÉES EN GÉNÉRAL. Les autres clés
-- écrites par le serveur (`retained_items`, …) restent exposées au même geste;
-- c'est un chantier à part. Cette migration ne garde que la clé de « Remplacer ».
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.keel_student_goals_keep_rejected_dishes()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  -- Le serveur, et les fonctions `security definer` de la liste: libres.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  -- Rien ne bouge dans la liste: rien à faire (y compris une colonne mise à NULL
  -- alors que la liste n'existait pas).
  if (old.practical_constraints -> 'rejected_dishes')
       is not distinct from (new.practical_constraints -> 'rejected_dishes') then
    return new;
  end if;
  if coalesce(old.practical_constraints ? 'rejected_dishes', false) then
    new.practical_constraints := jsonb_set(
      coalesce(new.practical_constraints, '{}'::jsonb),
      array['rejected_dishes'],
      old.practical_constraints -> 'rejected_dishes',
      true
    );
  else
    new.practical_constraints := coalesce(new.practical_constraints, '{}'::jsonb) - 'rejected_dishes';
  end if;
  return new;
end;
$function$;

comment on function public.keel_student_goals_keep_rejected_dishes() is
  '2026-09-24 — une ecriture du navigateur (authenticated, anon) ne change jamais '
  'practical_constraints.rejected_dishes; seuls le serveur et ses deux fonctions la changent.';

revoke all on function public.keel_student_goals_keep_rejected_dishes()
  from public, anon, authenticated, service_role;

drop trigger if exists student_goals_keep_rejected_dishes on public.student_goals;
create trigger student_goals_keep_rejected_dishes
  before update of practical_constraints on public.student_goals
  for each row execute function public.keel_student_goals_keep_rejected_dishes();

-- ---------------------------------------------------------------------------
-- LA PREUVE — jouée sous le rôle du navigateur, puis ANNULÉE (sous-transaction
-- levée exprès): aucune ligne ne garde de trace, `updated_at` compris.
-- ---------------------------------------------------------------------------
do $$
declare
  v_user uuid;
  v_after jsonb;
  v_step text;
begin
  select g.user_id into v_user
    from public.student_goals g
    join auth.users u on u.id = g.user_id
   order by g.created_at
   limit 1;
  if v_user is null then
    raise notice 'student_goals_keep_rejected_dishes: aucune ligne student_goals, preuve sautee';
    return;
  end if;

  begin
    -- La liste, posée par le serveur (ici: le propriétaire de la migration).
    update public.student_goals
       set practical_constraints = jsonb_set(
             coalesce(practical_constraints, '{}'::jsonb) - 'preuve_x',
             array['rejected_dishes'], '[{"key":"preuve"}]'::jsonb, true)
     where user_id = v_user;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    -- (1) Le navigateur réécrit toute la colonne depuis une copie sans la liste.
    v_step := '(1) copie sans la liste';
    update public.student_goals set practical_constraints = '{"preuve_x": 1}'::jsonb
     where user_id = v_user;
    select practical_constraints into v_after from public.student_goals where user_id = v_user;
    if v_after -> 'rejected_dishes' is distinct from '[{"key":"preuve"}]'::jsonb
       or v_after -> 'preuve_x' is distinct from '1'::jsonb then
      raise exception 'rejected_dishes: % (%)', v_step, v_after;
    end if;

    -- (2) Il pose une liste périmée (un plat retiré depuis): la ligne gagne.
    v_step := '(2) liste perimee';
    update public.student_goals
       set practical_constraints = jsonb_set(practical_constraints, array['rejected_dishes'],
             '[{"key":"preuve"},{"key":"revenant"}]'::jsonb, true)
     where user_id = v_user;
    select practical_constraints into v_after from public.student_goals where user_id = v_user;
    if v_after -> 'rejected_dishes' is distinct from '[{"key":"preuve"}]'::jsonb then
      raise exception 'rejected_dishes: % (%)', v_step, v_after;
    end if;

    -- (3) La personne retire un plat par SA fonction: elle, elle passe.
    v_step := '(3) retrait par la fonction';
    perform public.keel_remove_rejected_dish('preuve');
    select practical_constraints into v_after from public.student_goals where user_id = v_user;
    if v_after -> 'rejected_dishes' is distinct from '[]'::jsonb then
      raise exception 'rejected_dishes: % (%)', v_step, v_after;
    end if;

    -- (4) Le cas qui passe: une autre clé s'écrit comme avant.
    v_step := '(4) autre cle';
    update public.student_goals
       set practical_constraints = practical_constraints || '{"preuve_x": 2}'::jsonb
     where user_id = v_user;
    select practical_constraints into v_after from public.student_goals where user_id = v_user;
    if v_after -> 'preuve_x' is distinct from '2'::jsonb then
      raise exception 'rejected_dishes: % (%)', v_step, v_after;
    end if;

    execute 'reset role';
    raise exception 'preuve_ok';
  exception when others then
    if sqlerrm <> 'preuve_ok' then
      raise;
    end if;
  end;
end $$;
