-- ═══════════════════════════════════════════════════════════════════════════
-- LOT B ① — UNE DIRECTION DÉCLARÉE PÈSE SUR LES GRAMMES, ET LE CRAN PAR DÉFAUT
--           NE S'ÉCRIT PAS ICI.
--
-- ⚠️ CETTE MIGRATION NE CHANGE AUCUNE DONNÉE, AUCUN PRIVILÈGE, AUCUNE
-- SIGNATURE, AUCUN `CHECK`. Elle réécrit DEUX COMMENTAIRES de fonction, et
-- c'est tout ce qu'elle fait. Elle existe pour une raison précise: la
-- correction du 2026-08-19 vit dans le MOTEUR, et l'endroit où la prochaine
-- session ira « réparer » le même défaut est ICI.
--
-- ── LE DÉFAUT, TEL QU'IL A ÉTÉ MESURÉ ─────────────────────────────────────
-- « Assez de direction pour coûter un plat, pas assez pour peser un gramme. »
-- La MÊME déclaration `muscle_gain`, posée par `keel_household_add_member`,
-- était lue par deux sous-systèmes qui répondaient l'inverse:
--
--   · `servingDemandsFor` — « cette bouche a-t-elle besoin de son propre
--     plat ? » — lit LA DIRECTION SEULE. Deux bouches divergeaient, et ça leur
--     ouvrait un plat dédié, archivé dans SIX plans (`cooking.diverging`);
--   · `mouthTargetFactor` — « combien lui sert-on ? » — EXIGEAIT un rythme.
--     Sans lui: facteur 1,000, motif `no_pace`, c'est-à-dire la part de
--     quelqu'un qui n'a rien demandé. Archivé: `box_sizing.mouths` =
--     {"sized": 1, "no_pace": 2, "minor": 1} sur un foyer de quatre.
--
-- Et le chemin par défaut du produit y menait tout seul: cette RPC-ci prend un
-- OBJECTIF et PAS de rythme, donc toute bouche ajoutée était dans cet état tant
-- que personne n'ouvrait son formulaire.
--
-- ── L'ARBITRAGE, ET POURQUOI IL N'A PAS ÉTÉ PRIS ICI ──────────────────────
-- ⛔ LA MAUVAISE RÉPARATION EST D'ÉCRIRE UN CRAN PAR DÉFAUT DANS
--    `household_members.target_pace_kg_per_week` À L'AJOUT D'UNE BOUCHE.
--    Elle est tentante — une ligne, dans la RPC qui manque le champ — et elle
--    casse trois choses d'un coup:
--
--      ① UN CRAN DÉRIVÉ DEVIENDRAIT INDISCERNABLE D'UN CRAN CHOISI. L'écran
--         l'afficherait comme la réponse de la personne, et plus personne ne
--         pourrait compter qui attend encore qu'on lui pose la question.
--      ② `keel_household_set_member_target(member, null, null)` EFFACE, c'est
--         écrit et c'est voulu (repasser en `maintenance` rend la ligne
--         inécrivable tant que la cible est là). Un défaut posé en base
--         serait donc retiré par un geste d'écran, et le grammage changerait
--         sans que personne n'ait rien demandé.
--      ③ LE PLAFOND RÉEL D'UN RYTHME SE CALCULE SUR LE CORPS (`paceCeilingFor`,
--         le plus petit de trois nombres). Une valeur en dur ici serait posée
--         SANS le corps — sur une bouche dont la fiche n'a peut-être ni poids
--         ni taille — et le `CHECK` grossier (0 < p ≤ 1) ne le verrait pas.
--
-- ⛔ CE QUI A ÉTÉ FAIT À LA PLACE, ET OÙ ÇA VIT: la dérivation est faite À LA
--    LECTURE, dans `mouthTargetFactor` (`_shared/keel/household_portions.ts`),
--    par `DEFAULT_PACE_KG_PER_WEEK` (0,25 kg/semaine). Elle porte son propre
--    motif — `sized_default_pace`, distinct de `sized` — donc l'archive d'un
--    plan dit toujours lequel des deux a servi. Et elle traverse
--    `executedPaceFor` comme n'importe quel cran choisi: le plancher d'énergie
--    du corps, le plafond A1 (500 kcal/j) et la fraction du mineur mordent
--    exactement pareil.
--
-- ⛔ AUCUNE GARDE N'EST DESSERRÉE. Le plancher TCA reste la PREMIÈRE porte, la
--    ceinture du mineur ferme avant toute direction, et un âge inconnu ferme.
--    Un mineur ne reçoit AUCUN cran par défaut — un test le tient par le chemin
--    réel (`memberTargetFactor`), pas par la porte pure.
-- ═══════════════════════════════════════════════════════════════════════════

comment on function public.keel_household_add_member(text, date, text) is
  'Ajoute une bouche SANS COMPTE au foyer du maître. Refuse `not_owner`, '
  '`household_full` (plafond en base), `bad_first_name`, `bad_birth_date` et '
  '`bad_goal`. ⚠️ `goal_not_for_minor` N''EXISTE PLUS depuis le 2026-08-18 — '
  'même renversement que `keel_household_set_member_goal`, dans le même '
  'commit, parce que deux portes qui écrivent la même colonne ne peuvent pas '
  'porter deux règles. '
  '⛔ ELLE NE PREND PAS DE RYTHME, ET C''EST DÉLIBÉRÉ DEPUIS LE 2026-08-19. '
  'Une direction posée ici sans cran est dimensionnée par le MOTEUR, qui '
  'dérive `DEFAULT_PACE_KG_PER_WEEK` à la lecture et le dit '
  '(`box_sizing.mouths.sized_default_pace`). N''écris JAMAIS un cran par '
  'défaut dans `target_pace_kg_per_week`: il deviendrait indiscernable d''un '
  'cran choisi, `keel_household_set_member_target(_, null, null)` l''effacerait '
  'comme un retrait volontaire, et il serait posé sans le corps sur lequel le '
  'plafond réel se calcule (`paceCeilingFor`).';

comment on column public.household_members.target_pace_kg_per_week is
  'Le rythme RÉGLÉ AU CURSEUR par le maître pour une bouche sans compte, en '
  'kg/semaine. Jumeau de `student_goals.target_pace_kg_per_week`. '
  '⛔ `null` VEUT DIRE « PERSONNE N''A RÉGLÉ », JAMAIS « aucun rythme ne '
  's''applique »: depuis le 2026-08-19, une bouche qui porte une DIRECTION '
  '(`fat_loss` / `muscle_gain`) et pas de cran est dimensionnée sur '
  '`DEFAULT_PACE_KG_PER_WEEK`, dérivé à la lecture par `mouthTargetFactor` et '
  'rendu sous le motif `sized_default_pace`. Cette colonne reste donc le '
  'témoin de ce qu''un HUMAIN a choisi — c''est le seul moyen de compter les '
  'bouches à qui la question n''a pas encore été posée. Le plafond du CHECK '
  'est la borne grossière; le plafond réel se calcule sur le corps '
  '(`paceCeilingFor`).';

-- ── LA PRÉMISSE DE CETTE MIGRATION, VÉRIFIÉE PLUTÔT QUE SUPPOSÉE ──────────
-- Un `comment on` sur une signature qui n'existe pas ÉCHOUE bruyamment, donc
-- les deux blocs ci-dessus sont déjà leur propre garde. Ce qui ne se voit pas
-- tout seul, c'est l'affirmation que porte le texte: cette porte n'écrit
-- toujours AUCUN rythme. Si un lot futur lui ajoute un paramètre de cran, ce
-- commentaire devient faux le même jour — et c'est ce que ce bloc refuse.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'keel_household_add_member'
      and pg_get_functiondef(p.oid) ilike '%target_pace_kg_per_week%'
  ) then
    raise exception
      'MIGRATION 20260819140000: keel_household_add_member touche desormais '
      'target_pace_kg_per_week — relis l''arbitrage en tete de ce fichier '
      'avant de poser un cran par defaut en base';
  end if;
end;
$$;
