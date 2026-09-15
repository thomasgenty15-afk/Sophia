-- ============================================================================
-- UNE CONTRAINTE ACTIVE PAR DANGER, ET PAS DEUX
--
-- Mesuré dans le navigateur, sur la page `/app/health` qui vient d'être posée:
-- deux clics sur « Add » écrivent DEUX allergies à l'arachide actives pour le
-- même élève. Rien ne les distingue, rien ne les fusionne, et le coach lit une
-- liste où le même danger apparaît deux fois.
--
-- POURQUOI CE N'ÉTAIT PAS UN PROBLÈME AVANT
-- -----------------------------------------
-- La seule surface d'écriture était la conversation, et elle porte
-- `source_message_id` avec son index unique partiel: un message = une
-- contrainte, donc un rejeu ne doublait rien. Un FORMULAIRE n'a pas de message.
-- L'idempotence du chemin conversationnel ne couvre pas le nouveau chemin —
-- c'est exactement la classe de trou qu'on trouve en ajoutant une deuxième
-- entrée sur une écriture qui n'en avait qu'une.
--
-- LA CLÉ: (élève, type, danger), SUR LES SEULES LIGNES ACTIVES
-- ------------------------------------------------------------
-- Partiel sur `status = 'active'`, et c'est ce qui rend la règle utilisable:
-- un élève qui retire une allergie puis la redéclare doit pouvoir le faire, et
-- l'historique des deux doit rester. Un index total interdirait la deuxième
-- déclaration au motif qu'une ligne retirée existe — c'est-à-dire enfermer un
-- élève dans une rétractation.
--
-- `kind` fait partie de la clé: « allergie aux œufs » et « je n'aime pas les
-- œufs » sont deux faits différents pour le coach, et le second ne doit pas
-- empêcher le premier.
--
-- ATOMIQUE, pas « je regarde puis j'écris ». Deux onglets ouverts sur la même
-- page sont exactement le check-then-act qui court contre lui-même
-- (`subscription-confirmation-messages`). C'est Postgres qui arbitre.
-- ============================================================================

-- Les doublons déjà en base doivent partir avant l'index, sinon la création
-- échoue. On garde la PLUS ANCIENNE — c'est la déclaration d'origine, et ses
-- éventuels `notes` sont ceux que l'élève a écrits en premier. Les autres sont
-- RETIRÉES, pas supprimées: la table est une histoire, pas un état.
with ranked as (
  select id,
         row_number() over (
           partition by user_id, kind,
                        coalesce(allergen_ref, ''), coalesce(substance_ref, ''),
                        coalesce(medication_class, '')
           order by created_at, id
         ) as rank
    from public.student_safety_constraints
   where status = 'active'
)
update public.student_safety_constraints c
   set status = 'retracted',
       retracted_at = now(),
       retracted_reason = 'superseded_duplicate_20260804200000'
  from ranked
 where ranked.id = c.id
   and ranked.rank > 1;

create unique index if not exists student_safety_constraints_active_unique_idx
  on public.student_safety_constraints (
    user_id,
    kind,
    coalesce(allergen_ref, ''),
    coalesce(substance_ref, ''),
    coalesce(medication_class, '')
  )
  where status = 'active';

comment on index public.student_safety_constraints_active_unique_idx is
  'Un même danger ne peut être ACTIF qu''une fois par élève et par type. '
  'Partiel sur active: retirer puis redéclarer reste possible, et les deux '
  'lignes restent dans l''histoire.';

-- ----------------------------------------------------------------------------
-- CONTRÔLE FINAL — on rejoue le double clic.
-- ----------------------------------------------------------------------------

do $$
declare
  probe_user uuid;
  first_id uuid;
  violated boolean := false;
begin
  select id into probe_user from auth.users limit 1;
  if probe_user is null then
    raise notice 'safety_constraint_no_duplicate: aucun utilisateur, contrôle sauté';
    return;
  end if;

  insert into public.student_safety_constraints
    (user_id, kind, allergen_ref, severity, declared_by, content_locale)
  values (probe_user, 'allergy', 'probe_dupe', 'medical', 'student', 'en-GB')
  returning id into first_id;

  -- LE DOUBLE CLIC.
  begin
    insert into public.student_safety_constraints
      (user_id, kind, allergen_ref, severity, declared_by, content_locale)
    values (probe_user, 'allergy', 'probe_dupe', 'medical', 'student', 'en-GB');
    raise exception
      'safety_constraint_no_duplicate: un second « Add » A PU écrire le même '
      'danger une deuxième fois';
  exception when unique_violation then
    violated := true;
  end;

  -- ... et retirer puis redéclarer doit rester POSSIBLE.
  update public.student_safety_constraints
     set status = 'retracted', retracted_at = now() where id = first_id;
  insert into public.student_safety_constraints
    (user_id, kind, allergen_ref, severity, declared_by, content_locale)
  values (probe_user, 'allergy', 'probe_dupe', 'medical', 'student', 'en-GB');

  delete from public.student_safety_constraints
   where user_id = probe_user and allergen_ref = 'probe_dupe';

  if not violated then
    raise exception 'safety_constraint_no_duplicate: contrôle non concluant';
  end if;
  raise notice
    'safety_constraint_no_duplicate: doublon actif bloqué, redéclaration après '
    'rétractation autorisée';
end $$;
