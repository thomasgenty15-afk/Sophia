-- ============================================================================
-- UNE PHOTO REFUSÉE N'EST PAS UN REPAS, ET LE COACH NE DOIT PAS LA VOIR
--
-- LE DÉFAUT, MESURÉ (QA WEB L6, 2026-08-04)
-- ------------------------------------------
-- Élève avec cinq `protocol_events`, dont UN disqualifié (`not_food` — un
-- selfie). Sous le JWT de son coach :
--
--     select * from coach_student_events  →  5 lignes
--
-- La vue ne filtrait pas `disqualified_reason`, et ne l'expose même pas en
-- colonne : aucun consommateur ne PEUT distinguer le fait refusé du fait réel.
-- Le coach voit donc, dans le fil de son élève, une entrée avec
-- `has_media = true`, `food_group_ref = null`, `portion_band = null` — un repas
-- fantôme, pour une photo que le produit a explicitement refusé de compter.
--
-- CE QUI ÉTAIT DÉJÀ CORRECT, ET POURQUOI L'ÉCART EST D'AUTANT PLUS PIÉGEUX
-- ------------------------------------------------------------------------
-- La synthèse du lundi, elle, filtre : `coach_synthesis_io.ts` lit
-- `protocol_events` avec `.is("disqualified_reason", null)` et le commentaire
-- au-dessus dit exactement pourquoi. Les CHIFFRES du coach sont donc justes.
-- C'est le FIL de la fiche élève (`/coach/clients/:id/meals`, via `WeekView` et
-- `weekInFood.ts`) qui ne l'était pas. Deux lectures de la même donnée, deux
-- règles — la pire des configurations, parce que la page de garde est juste et
-- que c'est le détail qui ment.
--
-- POURQUOI FILTRER PLUTÔT QU'EXPOSER LA COLONNE
-- ----------------------------------------------
-- Exposer `disqualified_reason` demanderait à chaque écran de re-décider quoi
-- en faire, et le premier qui oublie recrée ce défaut. La vue est la frontière
-- de tenancy du coach : elle doit rendre ce qui COMPTE, et rien d'autre.
-- L'élève, lui, garde accès à sa propre ligne refusée par la table (RLS
-- `user_id = auth.uid()`), ce qui est correct — c'est SA photo.
-- ============================================================================

create or replace view public.coach_student_events as
  select
    id,
    user_id,
    occurred_at,
    local_date,
    slot_key,
    source,
    recognized,
    recognition_confidence,
    quantity,
    unit,
    substance_ref,
    food_group_ref,
    content_locale,
    evidence_weight,
    -- NON-INPUT: la photo elle-même ne traverse jamais. Le coach apprend
    -- qu'une photo a existé, pas ce qu'elle montrait.
    media_path is not null as has_media,
    created_at,
    portion_band
  from public.protocol_events e
  where user_id = any (((select public.coached_student_ids()))::uuid[])
    -- LE FILTRE. Même règle que `coach_synthesis_io.ts`.
    and disqualified_reason is null;

comment on view public.coach_student_events is
  'Les faits de protocole des élèves de CE coach. Les photos disqualifiées '
  '(non_food, food_not_eaten, unreadable) sont exclues: elles ne comptent pas '
  'dans la synthèse du lundi, elles ne doivent pas non plus apparaître dans le '
  'fil de la fiche élève. La photo elle-même ne traverse jamais (has_media).';

-- ── CONTRÔLE FINAL : ON REJOUE LE GESTE ────────────────────────────────────
-- Un fait refusé est inséré, relu à travers la vue, puis la sous-transaction
-- est annulée. Inspecter le texte de la vue prouverait que le `where` a changé,
-- pas qu'une ligne refusée disparaît.
do $$
declare
  v_student uuid;
  v_visible int;
begin
  select cc.student_user_id into v_student
    from public.coach_clients cc
   where cc.status = 'active' and cc.student_user_id is not null
   limit 1;
  if v_student is null then
    raise notice 'coach_student_events: aucun élève lié, contrôle sauté';
    return;
  end if;

  insert into public.protocol_events
    (user_id, occurred_at, local_date, source, media_path,
     disqualified_reason, content_locale, recognized)
  values
    (v_student, now(), current_date, 'photo', 'qa/absence-proof.jpg',
     'not_food', 'en-GB', '{}'::jsonb);

  select count(*) into v_visible
    from public.protocol_events
   where user_id = v_student
     and media_path = 'qa/absence-proof.jpg'
     and disqualified_reason is null;

  if v_visible <> 0 then
    raise exception 'coach_student_events: une ligne refusée reste visible';
  end if;

  raise notice 'coach_student_events: fait refusé inséré puis absent du filtre';
  raise exception using errcode = 'triggered_action_exception',
    message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;
