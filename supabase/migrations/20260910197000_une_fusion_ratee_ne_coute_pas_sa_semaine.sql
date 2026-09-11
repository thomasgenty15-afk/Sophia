-- ============================================================================
-- LOT 2 · UNE FUSION QUI ÉCHOUE NE COÛTE PAS L'UNITÉ QU'ELLE A RÉCLAMÉE.
--
-- `keel_household_claim_merge_quota` incrémente `used` JUSTE AVANT l'appel
-- modèle — exprès: `household_merge_quota_test` épingle qu'aucune porte de
-- sortie ne s'intercale entre la réclamation et la dépense, pour qu'un refus
-- ne consomme jamais une fusion. Mais APRÈS l'appel, il reste des refus
-- légitimes (plat impossible à lire, bouche non nourrie, règle de maison
-- violée, écriture refusée). Chacun mangeait une fusion de la semaine sans
-- rien rendre — et le compteur ne dit pas ce qu'il a payé.
--
-- ⛔ CE N'EST PAS UN CRÉDIT: on ne peut que défaire une réclamation faite
-- dans la MÊME semaine ISO, et jamais descendre sous zéro. Une libération
-- appelée deux fois sur le même échec rendrait une fusion gratuite; le
-- plancher à zéro borne le dégât, et l'appelant n'appelle qu'une fois par
-- sortie.
--
-- ⚠️ CE QUE ÇA NE RATTRAPE PAS, ET IL FAUT LE SAVOIR: un worker edge tué par
-- la limite CPU (546) n'exécute plus rien. Aucune libération n'est possible
-- dans ce cas — il faudrait réclamer après le modèle, ce que la position de la
-- réclamation interdit exprès.
-- ============================================================================

create or replace function public.keel_household_release_merge_quota(
  p_household uuid,
  p_local_date date
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_week date;
  v_used integer;
begin
  if p_household is null then
    return jsonb_build_object('ok', false, 'reason', 'household_required');
  end if;
  -- ⚠️ MÊME EXIGENCE QUE LA RÉCLAMATION: pas de défaut sur le jour local. Un
  -- `coalesce(..., current_date)` libérerait la semaine du SERVEUR, pas celle
  -- où l'unité a été prise — donc parfois aucune, en silence.
  if p_local_date is null then
    return jsonb_build_object('ok', false, 'reason', 'local_date_required');
  end if;

  v_week := public.keel_iso_week_start(p_local_date);

  -- LE `where` EST LA GARDE: pas de ligne, ou un compteur déjà à zéro, et il
  -- ne se passe rien. Aucune ligne n'est créée par une libération.
  update public.household_merge_quota q
     set used = q.used - 1,
         updated_at = now()
   where q.household_id = p_household
     and q.iso_week_start = v_week
     and q.used > 0
  returning q.used into v_used;

  if v_used is null then
    return jsonb_build_object(
      'ok', true, 'released', false, 'week_start', v_week
    );
  end if;
  return jsonb_build_object(
    'ok', true, 'released', true, 'week_start', v_week, 'used', v_used
  );
end;
$function$;

comment on function public.keel_household_release_merge_quota(uuid, date) is
  'Défait UNE réclamation de fusion de la semaine ISO du jour local donné. '
  'Jamais sous zéro, ne crée aucune ligne. Appelée par '
  'generate-household-meal-v1 sur les refus qui suivent l''appel modèle.';

-- ⛔ SERVICE_ROLE SEULEMENT. Un compte qui pourrait appeler ça se rendrait des
-- fusions à volonté. Le défaut de Supabase donne TOUT à `authenticated` sur
-- une fonction neuve — cicatrice payée par ce dépôt.
revoke all on function public.keel_household_release_merge_quota(uuid, date) from public;
revoke all on function public.keel_household_release_merge_quota(uuid, date) from anon;
revoke all on function public.keel_household_release_merge_quota(uuid, date) from authenticated;
grant execute on function public.keel_household_release_merge_quota(uuid, date) to service_role;
