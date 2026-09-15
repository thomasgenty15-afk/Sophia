-- ============================================================================
-- L'ÉLÈVE PEUT RETIRER CE QU'IL A DÉCLARÉ
--
-- `student_safety_constraints` porte déjà tout ce qu'il faut pour une
-- rétractation — `status`, `retracted_at`, `retracted_reason`, et une contrainte
-- CHECK qui interdit `status='retracted'` sans horodatage. Le chemin
-- conversationnel s'en sert.
--
-- Mais côté client il n'existait que `owner_read` et `owner_insert`: **aucune
-- policy UPDATE**. Un élève pouvait donc déclarer une allergie et jamais la
-- retirer. Tant que la seule surface était la conversation, ça ne se voyait pas;
-- dès qu'un écran les liste, une contrainte périmée qu'on ne peut pas enlever
-- est un produit qui enferme.
--
-- POURQUOI UN TRIGGER EN PLUS DE LA POLICY
-- ----------------------------------------
-- Une policy RLS s'exprime sur des LIGNES, pas sur des COLONNES: un
-- `for update using (user_id = auth.uid())` laisserait l'élève réécrire
-- n'importe quel champ de sa ligne. Trois de ces champs ne lui appartiennent
-- pas:
--
--   * `declared_by` — un élève qui le passe à 'coach' fabrique une contrainte
--     que le coach n'a jamais écrite. C'est de la falsification d'autorité, sur
--     la table la plus sensible du produit;
--   * `user_id` — déplacer sa ligne chez un autre élève;
--   * `kind` / `allergen_ref` / `substance_ref` / `medication_class` — réécrire
--     l'identité d'un fait au lieu d'en déclarer un nouveau. Le modèle a une
--     supersession (`superseded_by_constraint_id`) précisément pour ça: on
--     n'édite pas une déclaration, on en pose une autre et on retire l'ancienne.
--
-- Le trigger dit donc ce que la policy ne sait pas dire: on ne peut que
-- RETIRER, et seulement ce qui est actif.
--
-- CE QUI N'EST PAS FAIT, ET C'EST UNE DÉCISION
-- --------------------------------------------
-- Aucune notification au coach sur une rétractation (arbitrage produit du
-- 2026-08-04). Le coach VOIT l'état courant sur sa page élève; il n'est pas
-- alerté du retrait. `retracted_at` et `retracted_reason` gardent la trace, donc
-- l'information existe pour qui la cherche — elle ne va simplement pas la
-- chercher toute seule.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. LA POLICY — l'élève, sur ses lignes, et rien d'autre
-- ----------------------------------------------------------------------------

drop policy if exists student_safety_constraints_owner_retract
  on public.student_safety_constraints;

create policy student_safety_constraints_owner_retract
  on public.student_safety_constraints
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on policy student_safety_constraints_owner_retract
  on public.student_safety_constraints is
  'L''élève retire ses propres contraintes. Le PÉRIMÈTRE de la modification est '
  'tenu par le trigger student_safety_constraints_retraction_only, pas ici: une '
  'policy porte sur des lignes, pas sur des colonnes.';

-- ----------------------------------------------------------------------------
-- 2. LE TRIGGER — on ne peut que retirer
--
-- `session_user`/`current_setting` ne servent à rien ici: le service role passe
-- outre RLS mais PAS les triggers. C'est voulu — le chemin conversationnel
-- (`declare_safety_constraint`) écrit une rétractation avec exactement la même
-- forme (status + retracted_at), donc la règle vaut pour lui aussi, et une
-- future lane qui voudrait « corriger » une allergie en place sera arrêtée ici
-- plutôt que de le faire en silence.
-- ----------------------------------------------------------------------------

create or replace function public.student_safety_constraints_retraction_only()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- L'identité de la ligne et de son auteur ne se réécrit jamais.
  if new.user_id is distinct from old.user_id then
    raise exception 'student_safety_constraints: user_id is immutable';
  end if;
  if new.declared_by is distinct from old.declared_by then
    raise exception
      'student_safety_constraints: declared_by is immutable (a declaration '
      'cannot change author)';
  end if;
  if new.kind is distinct from old.kind
     or new.allergen_ref is distinct from old.allergen_ref
     or new.substance_ref is distinct from old.substance_ref
     or new.medication_class is distinct from old.medication_class
  then
    raise exception
      'student_safety_constraints: a declaration is superseded, never rewritten '
      '(declare a new one and retract this one)';
  end if;

  -- Le seul changement d'état autorisé: active -> retracted.
  if new.status is distinct from old.status then
    if not (old.status = 'active' and new.status = 'retracted') then
      raise exception
        'student_safety_constraints: only active -> retracted is allowed (got % -> %)',
        old.status, new.status;
    end if;
    -- La CHECK de la table exige déjà `retracted_at`; on le pose plutôt que de
    -- faire échouer un client qui l'aurait oublié. Une rétractation refusée
    -- pour une raison de plomberie laisserait l'élève enfermé.
    if new.retracted_at is null then
      new.retracted_at := now();
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists student_safety_constraints_retraction_only
  on public.student_safety_constraints;

create trigger student_safety_constraints_retraction_only
  before update on public.student_safety_constraints
  for each row
  execute function public.student_safety_constraints_retraction_only();

-- ----------------------------------------------------------------------------
-- 3. CONTRÔLE FINAL — on rejoue les gestes, on n'inspecte pas du texte
--
-- La leçon de `20260804140000`: une épreuve d'absence textuelle laisse passer
-- une panne réelle. Ici on tente vraiment chaque écriture interdite, dans une
-- sous-transaction annulée.
-- ----------------------------------------------------------------------------

do $$
declare
  probe_user uuid;
  probe_id uuid;
  blocked int := 0;
begin
  select id into probe_user from auth.users limit 1;
  if probe_user is null then
    raise notice 'safety_constraint_retraction: aucun utilisateur, contrôle sauté';
    return;
  end if;

  insert into public.student_safety_constraints
    (user_id, kind, allergen_ref, severity, declared_by, content_locale)
  values (probe_user, 'allergy', 'probe_allergen', 'medical', 'student', 'en-GB')
  returning id into probe_id;

  -- (a) falsifier l'auteur
  begin
    update public.student_safety_constraints
       set declared_by = 'coach' where id = probe_id;
    raise exception 'safety_constraint_retraction: declared_by A PU être réécrit';
  exception when others then
    if sqlerrm like '%declared_by is immutable%' then blocked := blocked + 1;
    else raise; end if;
  end;

  -- (b) réécrire l'allergène au lieu de le remplacer
  begin
    update public.student_safety_constraints
       set allergen_ref = 'other_allergen' where id = probe_id;
    raise exception 'safety_constraint_retraction: allergen_ref A PU être réécrit';
  exception when others then
    if sqlerrm like '%superseded, never rewritten%' then blocked := blocked + 1;
    else raise; end if;
  end;

  -- (c) la rétractation, elle, doit passer — et poser son horodatage seule
  update public.student_safety_constraints
     set status = 'retracted', retracted_reason = 'probe'
   where id = probe_id;
  if (select retracted_at from public.student_safety_constraints where id = probe_id)
     is null then
    raise exception 'safety_constraint_retraction: retracted_at n''a pas été posé';
  end if;

  -- (d) ressusciter une contrainte retirée
  begin
    update public.student_safety_constraints
       set status = 'active' where id = probe_id;
    raise exception 'safety_constraint_retraction: une rétractation A PU être annulée';
  exception when others then
    if sqlerrm like '%only active -> retracted%' then blocked := blocked + 1;
    else raise; end if;
  end;

  delete from public.student_safety_constraints where id = probe_id;

  if blocked <> 3 then
    raise exception
      'safety_constraint_retraction: % écritures interdites bloquées sur 3', blocked;
  end if;
  raise notice
    'safety_constraint_retraction: 3 écritures interdites bloquées, rétractation OK';
end $$;
