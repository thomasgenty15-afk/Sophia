-- ============================================================================
-- FF-041 · LE PILOTAGE DE LA MAISON — publié comme celui d'un coach
--
-- Fiche: docs/fonctionnalites/composition-des-repas/FF-041-la-methode-du-coach-executable.md
-- Design d'origine: scratchpad/DESIGN-UNITES-DE-COMPOSITION.md §3, arbitrage A2
--
-- POURQUOI CETTE MIGRATION N'AJOUTE NI TABLE NI COLONNE
-- -----------------------------------------------------
-- Parce que LE COACH MAISON EST UN COACH (`coaches.coach_kind = 'house'`), et
-- c'est toute l'astuce du produit — la même que FF-029 a jouée pour les
-- pratiques quotidiennes. La philosophie de Sophia n'est PAS un chemin de code
-- parallèle: elle est une doctrine, publiée au même format, lue par le même
-- parseur, versionnée dans le même `generated_from`.
--
-- Un second chemin « défauts maison » aurait sa propre sélection, sa propre
-- validation et ses propres ceintures — trois occasions de diverger de celui
-- qui compte, et la divergence se paierait du seul côté qui a un visage.
--
-- ⚠️ ARBITRAGE A2 — CE QUE CETTE LIGNE GOUVERNE, ET CE QU'ELLE NE GOUVERNE PAS
-- ---------------------------------------------------------------------------
-- Elle gouverne les élèves DU COACH MAISON. Elle ne gouverne PAS la cohorte
-- d'un coach qui s'est tu: quand un coach existe, sa doctrine REMPLACE
-- intégralement celle de la maison, elle ne fusionne jamais avec.
--
-- Ce qui s'applique partout, en revanche, c'est la DÉTECTION SENTINELLE — zéro
-- occurrence d'un groupe sur la semaine = trou. Elle est un MÉCANISME PRODUIT
-- (`meal_verdict.ts`, `sentinelCarriersOf`), pas du contenu doctrinal, et elle
-- ne passe pas par cette ligne. La frontière mécanisme/contenu est donc lisible
-- dans le code: deux structures distinctes, jamais un drapeau sur une même
-- table. C'est la contrainte que A2 impose, écrite ici pour qu'on la relise.
--
-- CE QUE LA MAISON DIT, ET POURQUOI SI PEU
-- ----------------------------------------
-- Une seule entrée, sans portée d'objectif. Elle ordonne — protéine d'abord,
-- puis satiété, puis couverture — et elle n'éteint RIEN. C'est l'ordre
-- mécanique de la hiérarchie du design (§1), pas une opinion de plus:
-- l'inscrit libre reçoit le moteur dans son ordre par défaut, ce qui est
-- exactement ce qu'il recevait avant ce lot.
--
-- `belief_key` est NULL, et c'est un choix: le moteur exécute, le chat
-- n'invente rien. Donner une conviction citable à la maison demanderait
-- d'écrire une phrase que personne n'a signée — « SILENCE IS NOT A POSITION ».
-- ============================================================================

do $$
declare
  v_coach_id uuid;
  v_rows     integer;
begin
  -- RÉSOLU PAR `coach_kind`, JAMAIS PAR UN UUID EN DUR — même règle que
  -- 20260808190000. Un second UUID recopié serait le premier à diverger.
  select id into v_coach_id from public.coaches where coach_kind = 'house' limit 1;
  if v_coach_id is null then
    raise notice 'FF-041: pas de coach maison sur cette base, rien a ecrire';
    return;
  end if;

  update public.coach_doctrines
  set composition_steering = jsonb_build_array(
    jsonb_build_object(
      'goal_scope', null,
      'priorities', jsonb_build_array('protein', 'satiety_density', 'micro_coverage'),
      'off', jsonb_build_array(),
      'belief_key', null,
      'protein_range', 'standard',
      'surplus_style', 'standard',
      'deficit_style', 'standard',
      'maintenance_weeks', 'auto',
      'recalibration', 'observed_trend',
      'carb_timing', 'off'
    )
  )
  where coach_id = v_coach_id
    and published_at is not null
    -- IDEMPOTENTE: relancer ne réécrit pas une ligne déjà pilotée. Ce chantier
    -- n'a pas de filet de reset, et une migration qui ne passe qu'une fois est
    -- une migration cassée.
    and composition_steering = '[]'::jsonb;

  get diagnostics v_rows = row_count;
  raise notice 'FF-041: pilotage maison ecrit sur % doctrine(s) publiee(s)', v_rows;
end;
$$;
