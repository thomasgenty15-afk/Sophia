-- ============================================================================
-- UNE RÉTRACTATION D'ALLERGIE N'A JAMAIS PU S'ÉCRIRE
--
-- LE DÉFAUT, MESURÉ (QA WEB, seconde relecture à froid, 2026-08-04)
-- ------------------------------------------------------------------
-- ÉLÈVE  : « actually I was wrong, I'm not allergic to peanuts at all — my
--           allergy test came back negative »
-- SOPHIA : « Understood — I won't treat peanuts as a constraint from this turn. »
-- BASE   : ["peanut|active", "peanut|active"]   ← inchangé
-- TOUR SUIVANT : « Sure — two peanut-free snack ideas: … »
--
-- Sophia annonçait avoir levé une contrainte qui restait en vigueur, et se
-- contredisait au tour d'après. C'est le symétrique exact de l'accusé fantôme.
--
-- LA CAUSE, ISOLÉE PAR SONDE DIRECTE
-- -----------------------------------
--     select rpc('retract_student_safety_constraint', {id de la ligne active})
--       sous service_role  →  null,  et la ligne reste 'active'
--
-- `retract_student_safety_constraint` porte `and user_id = (select auth.uid())`.
-- Le moteur de tour (`sophia-brain`) écrit avec le client **service_role**, pour
-- lequel `auth.uid()` vaut **NULL** — l'UPDATE ne matche donc AUCUNE ligne, la
-- fonction rend `null`, et `db.ts` traduit ça en `nothing_to_retract`.
--
-- L'ironie est complète: le commentaire au-dessus de l'appel dit
-- « Un UPDATE direct touchait zéro ligne — le mode d'échec exact rencontré en
-- run réel », et la RPC censée le corriger a réintroduit la même condition sous
-- une autre forme. `SECURITY DEFINER` change le RÔLE d'exécution, pas la valeur
-- de `auth.uid()`.
--
-- CE QUE CETTE MIGRATION AJOUTE
-- ------------------------------
-- 1. `retract_student_safety_constraints_for_user(p_user_id, p_refs[], p_reason)`
--    — l'identité est un PARAMÈTRE, comme `accept_coach_invitation_for_user`.
--    C'est le motif que ce dépôt utilise déjà partout où un job serveur agit
--    au nom d'un utilisateur.
--
-- 2. Elle retire **TOUTES** les lignes actives portant la référence, pas la
--    première. La QA a mesuré que deux déclarations de la même allergie créent
--    deux lignes `active` (l'index unique porte sur
--    `(user_id, source_message_id)`, donc par MESSAGE et pas par allergène).
--    Un `.find()` qui n'en ferme qu'une laissait l'élève contraint après avoir
--    été explicitement libéré — l'exact inverse de ce qu'il a demandé.
--    « Je ne suis pas allergique aux arachides » veut dire toutes.
--
-- CE QUI NE CHANGE PAS
-- ---------------------
-- L'ancienne fonction reste, à l'identique, pour un appelant client porteur
-- d'un JWT. Aucune policy UPDATE n'est ajoutée sur la table: c'est le
-- raisonnement de `20260803160000` (un élève ne doit pas pouvoir réécrire
-- `severity`), et il tient toujours.
-- ============================================================================

create or replace function public.retract_student_safety_constraints_for_user(
  p_user_id uuid,
  p_refs text[],
  p_reason text default null
)
returns setof uuid
language sql
security definer
set search_path to ''
as $function$
  update public.student_safety_constraints
     set status = 'retracted',
         retracted_at = now(),
         retracted_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_at = now()
   where user_id = p_user_id
     and status = 'active'
     and (
       lower(coalesce(allergen_ref, ''))     = any (select lower(r) from unnest(p_refs) r)
       or lower(coalesce(substance_ref, ''))    = any (select lower(r) from unnest(p_refs) r)
       or lower(coalesce(medication_class, '')) = any (select lower(r) from unnest(p_refs) r)
     )
  returning id;
$function$;

revoke all on function public.retract_student_safety_constraints_for_user(uuid, text[], text) from public;
revoke all on function public.retract_student_safety_constraints_for_user(uuid, text[], text) from anon;
revoke all on function public.retract_student_safety_constraints_for_user(uuid, text[], text) from authenticated;
grant execute on function public.retract_student_safety_constraints_for_user(uuid, text[], text) to service_role;

comment on function public.retract_student_safety_constraints_for_user(uuid, text[], text) is
  'Retire TOUTES les contraintes actives d''un élève portant l''une des '
  'références données. L''identité est un paramètre parce que le moteur de tour '
  'écrit en service_role, pour qui auth.uid() est NULL — la variante à '
  'auth.uid() ne matchait donc aucune ligne et la rétractation était un '
  'accusé fantôme. Réservée au service_role: aucun client ne l''appelle.';

-- ── CONTRÔLE FINAL : ON REJOUE LE GESTE ────────────────────────────────────
-- Deux lignes actives pour le même allergène, une rétractation, zéro active.
-- Inspecter le texte de la fonction prouverait qu'elle a changé, pas qu'une
-- contrainte tombe — et c'est exactement la distinction qui a coûté ce défaut.
do $$
declare
  v_user uuid;
  v_active int;
begin
  select id into v_user from public.profiles where keel_role = 'student' limit 1;
  if v_user is null then
    raise notice 'retract_for_user: aucun élève, contrôle sauté';
    return;
  end if;

  insert into public.student_safety_constraints
    (user_id, kind, allergen_ref, severity, status, declared_by, content_locale, source_message_id)
  values
    (v_user, 'allergy', 'qa_probe_nut', 'medical', 'active', 'student', 'en-GB', 'qa-probe-1'),
    (v_user, 'allergy', 'qa_probe_nut', 'medical', 'active', 'student', 'en-GB', 'qa-probe-2');

  perform public.retract_student_safety_constraints_for_user(
    v_user, array['qa_probe_nut'], 'absence proof'
  );

  select count(*) into v_active
    from public.student_safety_constraints
   where user_id = v_user and allergen_ref = 'qa_probe_nut' and status = 'active';

  if v_active <> 0 then
    raise exception 'retract_for_user: % ligne(s) restée(s) active(s) sur 2', v_active;
  end if;

  delete from public.student_safety_constraints
   where user_id = v_user and allergen_ref = 'qa_probe_nut';

  raise notice 'retract_for_user: 2 lignes actives retirées par un seul appel';
end $$;
