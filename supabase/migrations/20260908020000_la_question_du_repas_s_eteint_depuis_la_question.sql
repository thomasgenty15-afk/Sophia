-- ===========================================================================
-- LOT B.3 — L'INTERRUPTEUR DE LA QUESTION PAR REPAS
--
-- La boucle par repas (C1) va s'étendre aux créneaux que le plan COMPOSE, et
-- à ceux que le rythme déclare sans que le plan les couvre. Elle passe donc de
-- « cinq déjeuners dehors font cinq questions » — rare par construction — à
-- trois à cinq sollicitations par jour, tous les jours, pour qui a un objectif
-- de poids.
--
-- ⛔ CETTE COLONNE ARRIVE AVANT CETTE EXTENSION, ET C'EST UNE CONTRAINTE
-- D'ORDRE, PAS UNE PRÉFÉRENCE. Livrer la multiplication des questions avant
-- l'interrupteur ouvrirait une fenêtre — un déploiement, peut-être une
-- semaine — où le produit demande à chaque repas et où personne ne peut
-- l'arrêter. C'est la forme exacte du tracker que ce produit refuse d'être.
--
-- ── TRI-ÉTAT, ET LE `NULL` N'EST PAS UNE EXTINCTION ───────────────────────
--
--   true   — la personne a ALLUMÉ explicitement.
--   false  — la personne a ÉTEINT explicitement, et ça gagne pour toujours:
--            un changement d'objectif ne rallume pas ce qu'on a coupé.
--   null   — PERSONNE N'A CHOISI. L'objectif décide (`SLOT_MEAL_GOALS`).
--
-- ⚠️ NI DÉFAUT NI `NOT NULL`, ET C'EST LA MOITIÉ QUI TIENT « HORS
-- ONBOARDING ». Un défaut `false` ferait passer pour une extinction une
-- décision que personne n'a prise; un défaut `true` ferait l'inverse. Sans
-- défaut, quelqu'un qui n'a jamais vu l'interrupteur porte `null`, donc il n'y
-- a littéralement RIEN à régler avant d'avoir vécu la chose — la case n'a pas
-- besoin d'être cachée de l'onboarding, elle n'y a simplement pas d'objet.
--
-- C'est le gabarit de `20260901140000_the_direction_opens_the_number.sql`
-- (`profiles.energy_display_enabled`), à ceci près qu'il RELÂCHAIT une colonne
-- existante et devait donc rétro-remplir. Ici la colonne est NEUVE: `null`
-- partout est l'état de départ, et aucun backfill n'est nécessaire ni permis.
--
-- ⛔ LA RÉDUCTION VIT DANS `slot_meal_ask.ts::slotMealAskSwitchFrom`, ET NULLE
-- PART AILLEURS. Un appelant qui écrirait `col === true` refermerait la
-- question pour TOUS ceux que leur objectif devait ouvrir — en silence, sans
-- qu'aucun type ne bronche. C'est mot pour mot l'avertissement de
-- `energy_gate.ts`, et il vaut ici pour la même raison.
--
-- RÉVERSIBILITÉ: `alter table public.profiles drop column slot_meal_ask_enabled;`
-- Aucune donnée dérivée n'en dépend — c'est un réglage, pas un fait.
-- ===========================================================================

begin;

alter table public.profiles
  add column if not exists slot_meal_ask_enabled boolean;

comment on column public.profiles.slot_meal_ask_enabled is
  'TRI-ÉTAT. true = allumé explicitement; false = éteint explicitement (et ça '
  'gagne pour toujours: un changement d''objectif ne rallume pas); NULL = '
  'personne n''a choisi, l''objectif décide (SLOT_MEAL_GOALS). NULL n''est PAS '
  'une extinction. La réduction est slot_meal_ask_enabled -> '
  'slotMealAskSwitchFrom() dans _shared/keel/slot_meal_ask.ts, et nulle part '
  'ailleurs: lire `col === true` referme la question à tous ceux que leur '
  'objectif devait ouvrir, en silence.';

-- ---------------------------------------------------------------------------
-- LE CONTRÔLE — la colonne existe, et elle est bien TRI-ÉTAT
-- ---------------------------------------------------------------------------
--
-- ⚠️ LES TROIS ASSERTIONS SONT NÉCESSAIRES. « La colonne existe » passerait au
-- vert sur une colonne `NOT NULL DEFAULT false`, c'est-à-dire sur exactement
-- l'erreur que ce fichier existe pour ne pas commettre.
do $$
declare
  v_nullable text;
  v_default  text;
  v_type     text;
begin
  select is_nullable, column_default, data_type
    into v_nullable, v_default, v_type
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'profiles'
     and column_name = 'slot_meal_ask_enabled';

  if v_nullable is null then
    raise exception 'B.3: profiles.slot_meal_ask_enabled absente';
  end if;
  if v_type <> 'boolean' then
    raise exception 'B.3: slot_meal_ask_enabled est % au lieu de boolean', v_type;
  end if;
  if v_nullable <> 'YES' then
    raise exception
      'B.3: slot_meal_ask_enabled est NOT NULL — le tri-état est perdu, et '
      '« personne n''a choisi » devient indiscernable de « éteint ».';
  end if;
  if v_default is not null then
    raise exception
      'B.3: slot_meal_ask_enabled porte un défaut (%) — un défaut fait passer '
      'pour un choix une décision que personne n''a prise.', v_default;
  end if;

  raise notice 'B.3: profiles.slot_meal_ask_enabled — boolean, nullable, sans défaut';
end $$;

commit;
