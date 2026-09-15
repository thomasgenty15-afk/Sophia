-- ============================================================================
-- FF-029 — LA QUESTION DE PRATIQUE ENTRE DANS LE BUDGET DE DEMANDE (T4)
-- ============================================================================
--
-- « Une seule demande par jour, TOUTES SURFACES CONFONDUES » est la règle
-- transverse T4 du domaine conversation, et son compteur est unique
-- (`_shared/keel/daily_ask_budget.ts`, table `meal_precision_questions` — nom
-- historique, le commentaire de table est l'autorité sur son contenu réel).
--
-- ── LE DÉFAUT QUE CETTE MIGRATION FERME ──────────────────────────────────
-- Trois genres y étaient inscrits (précision, invitation photo,
-- recommandation). La question de pratique du soir, elle, ne passait par aucun
-- compteur: un élève pouvait recevoir une question de précision à midi PUIS une
-- question de pratique à 20h30. Deux demandes dans la journée, obtenues en
-- respectant deux fois une règle qui en interdit une — c'est-à-dire exactement
-- l'interrogatoire que T4 décrit, et la raison pour laquelle ce dépôt a UN
-- compteur et pas quatre.
--
-- ── CE QUI N'ENTRE PAS ICI, ET POURQUOI ──────────────────────────────────
-- Le RAPPEL de pratique. Il énonce et n'attend rien: le budget compte des
-- DEMANDES. L'y soumettre ferait taire la voix du coach tous les jours où une
-- question de précision est partie à midi, c'est-à-dire retirerait ce que le
-- message du soir DONNE au motif qu'il a déjà pris ailleurs — l'inverse exact
-- de ce que T4 protège.
--
-- ── `axis` RESTE NULL ────────────────────────────────────────────────────
-- Le CHECK conditionnel `meal_precision_questions_axis_check` exige un axe pour
-- `meal_precision_question` et l'interdit partout ailleurs. Il n'a pas besoin
-- d'être touché: le nouveau genre tombe dans la branche `ELSE`, qui impose
-- `axis IS NULL`. C'est ce qu'on veut — un axe sur une question de pratique
-- serait une valeur inventée dans une colonne que `meal_precision_flow` relit.
-- ============================================================================

alter table public.meal_precision_questions
  drop constraint if exists meal_precision_questions_ask_kind_check;

alter table public.meal_precision_questions
  add constraint meal_precision_questions_ask_kind_check
  check (ask_kind in (
    'meal_precision_question',
    'photo_invitation',
    'daily_recommendation',
    'practice_question'
  ));

comment on column public.meal_precision_questions.ask_kind is
  'LE GENRE DE LA DEMANDE. Liste fermee, miroir de DAILY_ASK_KINDS dans '
  '_shared/keel/daily_ask_budget.ts — un genre ajoute d''un cote sans l''autre '
  'est refuse a l''ecriture. meal_precision_question (FF-017, porte un axe) | '
  'photo_invitation (FF-025) | daily_recommendation (FF-028) | '
  'practice_question (FF-029, la QUESTION du soir seulement: le rappel de '
  'pratique ne demande rien et ne consomme rien). Le budget est de UNE demande '
  'par jour local et par eleve, tous genres confondus (T4).';
