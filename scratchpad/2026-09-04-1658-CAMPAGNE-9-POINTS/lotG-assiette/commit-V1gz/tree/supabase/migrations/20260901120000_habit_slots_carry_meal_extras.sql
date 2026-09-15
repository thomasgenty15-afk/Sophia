-- ═══════════════════════════════════════════════════════════════════════════
-- CE QU'UNE BOUCHE PREND À CÔTÉ DU PLAT, MOMENT PAR MOMENT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⛔ AUCUNE COLONNE NEUVE, ET C'EST LE POINT. `household_member_habits.slots`
-- est DÉJÀ clé par (bouche, moment) et déjà bornée. Une colonne jumelle aurait
-- fait deux endroits où lire « ce qui se passe à ce moment-là », et ce dépôt
-- paie en boucle le second endroit qu'on oublie de mettre à jour.
--
-- La forme devient:
--   [{"slot":"lunch","kind":"own_usual","usual":"une salade",
--     "extras":["bread","cheese"]}]
--
-- ── POURQUOI CETTE DONNÉE EXISTE ─────────────────────────────────────────
-- Le plan ne compose QUE le plat au déjeuner et au dîner; le pain, le fromage,
-- le yaourt, le fruit et le dessert sont à côté. Leur énergie est retranchée de
-- la cible du repas (`mouth_anchor.ts`), sans quoi on sert 1,2 kg de poulet à
-- quelqu'un qui prend aussi un yaourt.
--
-- Avant le 2026-09-01, la même question vivait dans TROIS BOOLÉENS PAR PERSONNE
-- (`household_members.takes_dessert / takes_cheese / takes_bread`), et son ratio
-- s'appliquait à la journée entière — petit-déjeuner compris, que le plan
-- compose pourtant en totalité.
--
-- ⚠️ LES TROIS COLONNES RESTENT, ET ELLES CESSENT D'ÊTRE LUES PAR L'ANCRAGE.
-- Les supprimer est une migration à part: tant que la fiche n'écrit pas ses
-- extras par moment, la lane les REPORTE (midi et soir) pour ne pas faire
-- retomber sur la convention quelqu'un qui a répondu. Une colonne encore
-- écrite mais plus lue est un statut orphelin — elle est nommée ici pour que
-- personne ne la découvre par surprise.
--
-- ⚠️ CETTE MIGRATION N'ÉCRIT AUCUNE DONNÉE. Elle ne fait qu'autoriser et borner
-- une clé. Aucune ligne existante ne porte `extras`, et l'absence de la clé est
-- une réponse distincte du tableau vide — voir la contrainte.

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- LA FORME EST TENUE EN BASE, PAS SEULEMENT PAR LE PARSEUR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ MÊME RAISON QUE LA CONTRAINTE D'ORIGINE: `parseMemberExtras` ÉCARTE ce
-- qu'il ne reconnaît pas, en silence et par conception. Un `extras` mal formé
-- se lirait donc « ce moment n'a pas été renseigné » — c'est-à-dire que
-- quelqu'un aurait coché ses extras et que rien ne se serait passé, sans une
-- erreur nulle part. Le refus doit arriver à L'ÉCRITURE.
--
-- ⛔ LA CLÉ ABSENTE RESTE LÉGALE, et c'est une RÉPONSE: « ce moment n'a pas été
-- renseigné », qui retombe sur la convention. Le tableau VIDE en est une autre:
-- « renseigné, rien à côté du plat ». Les confondre ferait dire à une fiche
-- muette qu'elle ne prend rien — le plat porterait alors 100 % du repas, soit
-- deux fois et demie la part d'aujourd'hui.
--
-- LE PLAFOND EST 5 = LE NOMBRE D'EXTRAS (`MEAL_EXTRAS`). Une personne ne prend
-- pas deux fois du pain au même déjeuner; au-delà, ce n'est plus une
-- déclaration, c'est un bourrage. Le lecteur dédoublonne de toute façon.
-- ⛔ UNE FONCTION, PARCE QU'UNE CONTRAINTE `check` N'ACCEPTE PAS DE
-- SOUS-REQUÊTE. Postgres refuse `check (not exists (select …))` à la création:
-- valider CHAQUE JETON d'un tableau imbriqué demande donc de passer par une
-- fonction `immutable`, appelée depuis la contrainte. Son voisin
-- `household_member_habits_slots_check` s'en passe parce qu'il ne regarde que
-- le type et la longueur du tableau du dessus.
create or replace function public.keel_habit_extras_ok(p_slots jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  -- ⚠️ UN `slots` QUI N'EST PAS UN TABLEAU REND `true` ICI, ET CE N'EST PAS UN
  -- TROU: `household_member_habits_slots_check` le refuse déjà, et l'ordre
  -- d'évaluation de deux contraintes n'est pas garanti. Rendre un verdict sur
  -- une forme dont une autre contrainte est propriétaire ferait deux erreurs
  -- pour un seul défaut — ou, pire, une exception `cannot extract elements`
  -- au lieu d'un refus lisible.
  select case
    when jsonb_typeof(p_slots) <> 'array' then true
    else coalesce(
      (
        select bool_and(
          jsonb_typeof(entry -> 'extras') = 'array'
          and jsonb_array_length(entry -> 'extras') <= 5
          and not exists (
            select 1
            from pg_catalog.jsonb_array_elements_text(entry -> 'extras') as token
            where token not in ('bread', 'cheese', 'yoghurt', 'fruit', 'dessert')
          )
        )
        from pg_catalog.jsonb_array_elements(p_slots) as entry
        -- ⚠️ `jsonb_typeof(entry) = 'object'` D'ABORD, ET CE N'EST PAS CE
        -- FILTRE QUI TIENT LE VERDICT. Sur une entrée qui est la CHAÎNE
        -- "extras", l'opérateur `?` rend vrai et `-> 'extras'` rend NULL —
        -- mais `bool_and` IGNORE les NULL, donc la ligne passerait de toute
        -- façon. Ce que le filtre achète est de ne pas faire dépendre le
        -- résultat d'une propriété d'agrégat que personne ne relit.
        --
        -- ⛔ ET UNE ENTRÉE NON-OBJET RESTE DONC ACCEPTÉE ICI. C'est voulu:
        -- `parseMemberExtras` l'écarte, et elle ne porte AUCUNE réponse à
        -- perdre. Le refus à l'écriture existe pour ce que quelqu'un a
        -- réellement déclaré, pas pour du bruit de forme — dont
        -- `household_member_habits_slots_check` est déjà propriétaire.
        where jsonb_typeof(entry) = 'object' and entry ? 'extras'
      ),
      -- ⚠️ AUCUNE ENTRÉE NE PORTE LA CLÉ ⇒ `true`. C'est le cas de TOUTE la
      -- base d'avant ce lot: `bool_and` sur zéro ligne rend NULL, et une
      -- contrainte qui rend NULL passe — mais par accident. On le dit.
      true
    )
  end;
$$;

comment on function public.keel_habit_extras_ok(jsonb) is
  '2026-09-01 — valide la clé `extras` des entrées de '
  '`household_member_habits.slots`. Existe UNIQUEMENT parce qu''une contrainte '
  '`check` n''accepte pas de sous-requête; ne pas l''appeler ailleurs.';

alter table public.household_member_habits
  drop constraint if exists household_member_habits_extras_check;
alter table public.household_member_habits
  add constraint household_member_habits_extras_check
  check (public.keel_habit_extras_ok(slots));

comment on constraint household_member_habits_extras_check
  on public.household_member_habits is
  '2026-09-01 — `extras` est facultatif sur une entrée de moment, et sa clé '
  'ABSENTE n''est pas son tableau VIDE: absente = « ce moment n''a pas été '
  'renseigné » (repli sur la convention), vide = « rien à côté du plat » (le '
  'plat porte tout son repas). Les cinq jetons sont ceux de `MEAL_EXTRAS` '
  '(`_shared/keel/meal_extras.ts`); le plafond de 5 est leur nombre.';

commit;
