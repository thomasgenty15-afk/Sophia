-- ===========================================================================
-- LOT A — LE RÉFÉRENTIEL DIT CE QU'IL VAUT, ET LE FRANÇAIS PARLE AVANT LE SLUG
--
-- Chantier: `scratchpad/2026-09-11-CHANTIER-PREMIER-JET/CHANTIER.md` § Lot A.
-- Preuves:  `scratchpad/2026-09-11-CHANTIER-PREMIER-JET/lotA-audit.json`
--           (produit par `lotA-02-audit.ts`, hors ligne, sur les 943 lignes).
-- Enquête:  `docs/keel/ENQUETE-DEUX-DIRECTIONS-2026-09-11.md` § 2.
--
-- ── LE DÉFAUT, MESURÉ ─────────────────────────────────────────────────────
-- Le référentiel rendait des chiffres JUSTES pour le MAUVAIS aliment, et rien
-- ne pouvait le voir: « zéro ingrédient non résolu » était vrai, et faux en
-- même temps.
--
--   `pear`  portait le code **20039** et le nom **« Poireau, cru »**, avec les
--           CINQ macronutriments du poireau à la décimale près, et sa sentinelle
--           `folate_source`. 96 occurrences de `poire`/`poires` dans les plans
--           de cette base se calculaient donc en poireau (32,3 kcal/100 g).
--   `raisin` et `prune` écrits en FRANÇAIS tombaient sur les slugs ANGLAIS du
--           fruit SEC (321 et 229 kcal) au lieu du fruit frais (68,9 et 46).
--           Quatre petits-déjeuners en portaient l'effet: 614→388, 613→356,
--           728→427, 728→475 kcal.
--
-- ── CE QUE CETTE MIGRATION FAIT, ET DANS QUEL ORDRE ───────────────────────
--   ① Trois colonnes de VALIDATION sur `food_composition_refs`.
--   ② Une table de FAUX AMIS, avec sa langue.
--   ③ La ligne `pear`, décrochée du poireau.
--   ④ Les alias qui lèvent frais/sec en français.
--   ⑤ Les cinq exceptions de validation trouvées par l'audit.
--   ⑥ Les quatre faux amis français.
--
-- ⛔ CE QU'ELLE NE FAIT PAS. Elle ne réécrit AUCUN plan déjà servi (lot 5 du
-- chantier: « préserver les grammes des plans historiques »). Elle ne renomme
-- aucun slug — un renommage demande les trois épreuves d'absence (code,
-- `prosrc`, vues) et c'est un autre lot. Elle ne touche à aucune migration
-- historique.
--
-- IDEMPOTENTE: `if not exists` partout, `on conflict do nothing` sur les
-- insertions, et chaque `update` de données est GARDÉ par la valeur fautive
-- qu'il corrige — un second passage après une correction humaine ne l'écrase
-- pas.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- ① LA VALIDATION — trois colonnes, pas une table à part
--
-- ⚠️ POURQUOI DES COLONNES ET PAS UNE TABLE. Trois raisons, toutes mesurables:
--   ① Elles voyagent dans le `select` que `loadCompositionIndex` fait DÉJÀ.
--      Une table à part coûterait une troisième requête paginée pour ~5 lignes.
--   ② Une exception ne peut pas SURVIVRE à la ligne qu'elle qualifie, ni
--      pointer vers un slug disparu: il n'y a pas de jointure à tenir.
--   ③ Le `check` ci-dessous rend impossible « un état sans sa raison ». Dans
--      une table à part, la même garantie demanderait le même `check` PLUS une
--      FK PLUS un `on delete cascade`.
-- La VERSION, elle, n'est pas dans la table: c'est ce fichier de migration.
-- On sait quand chaque exception a été posée et pourquoi, en clair, en base.
--
-- ⛔ ET LE SEUL CHAMP `source = 'ciqual'` NE DONNE PAS `verifie`. Mesuré le
-- 2026-09-11: 881 lignes disent `ciqual` et **689 n'ont AUCUN `ciqual_code`**.
-- Exiger un code supprimerait les trois quarts du référentiel. Ces 689 lignes
-- ne sont pas fausses, elles sont NON TRAÇABLES — et la règle qui décide est
-- dans `food_reference_manifest.ts`, pas dans cette colonne: la colonne ne
-- porte que les EXCEPTIONS.
-- ---------------------------------------------------------------------------
alter table public.food_composition_refs
  add column if not exists validation_state text,
  add column if not exists validation_reason text,
  add column if not exists validation_decided_on date;

alter table public.food_composition_refs
  drop constraint if exists food_composition_refs_validation_state_check;
alter table public.food_composition_refs
  add constraint food_composition_refs_validation_state_check
  check (validation_state is null
         or validation_state in ('verifie', 'a_verifier', 'rejete'));

-- Un état sans sa raison ni sa date est une décision que personne ne peut
-- relire — donc une décision qu'on réappliquera à l'aveugle dans six mois.
alter table public.food_composition_refs
  drop constraint if exists food_composition_refs_validation_is_justified_check;
alter table public.food_composition_refs
  add constraint food_composition_refs_validation_is_justified_check
  check ((validation_state is null
          and validation_reason is null
          and validation_decided_on is null)
         or (validation_state is not null
             and length(btrim(validation_reason)) >= 10
             and validation_decided_on is not null));

comment on column public.food_composition_refs.validation_state is
  'LOT A: l''EXCEPTION de validation de cette ligne (verifie/a_verifier/rejete). '
  'NULL = aucune exception, donc la règle par provenance de validationOf() '
  '(food_reference_manifest.ts). Le seul champ source=''ciqual'' ne donne PAS '
  'verifie, et l''absence de ciqual_code ne le retire pas: 689 lignes sur 881 '
  'n''ont pas de code et ne sont pas fausses pour autant.';
comment on column public.food_composition_refs.validation_reason is
  'LOT A: pourquoi cet état. Obligatoire dès qu''un état est posé.';
comment on column public.food_composition_refs.validation_decided_on is
  'LOT A: quand. Obligatoire dès qu''un état est posé.';

-- ---------------------------------------------------------------------------
-- ② LES FAUX AMIS — la seule chose qui passe devant le slug nu
--
-- `resolveIngredient` consulte `bySlug` AVANT `byAlias`, et c'est un bon
-- contrat: un alias ne doit jamais MASQUER une entrée du référentiel. Mais un
-- mot français qui EST un slug anglais valide devient alors incorrigible —
-- aucun alias ne peut se déclencher sur lui.
--
-- ⛔ ON N'INVERSE PAS L'ORDRE GÉNÉRAL. Mesuré le 2026-09-11 sur les 2 600
-- alias: 191 sont capturés par un slug, et AUCUN n'est contradictoire. Inverser
-- serait donc un no-op aujourd'hui, et une bombe demain — la migration
-- `20260822113000` l'a écrit noir sur blanc en retirant 19 alias
-- contradictoires. On nomme les quatre mots au lieu d'ouvrir la porte.
--
-- ⚠️ ET LA LANGUE EST DANS LA LIGNE. `raisins` en français, ce sont des raisins
-- FRAIS; en anglais, des raisins SECS. Une table sans langue dirait donc une
-- chose fausse pour la moitié des lecteurs. Le chargeur ne retient que les
-- lignes de la langue du plan; un index anglais n'a aucun faux ami et se
-- comporte exactement comme avant ce lot.
-- ---------------------------------------------------------------------------
create table if not exists public.food_composition_false_friends (
  -- La forme telle qu'elle sera NORMALISÉE par `normalizeTerm` (minuscules,
  -- sans accent, sans ponctuation). Écrire « raisin », pas « Raisin ».
  term text not null,
  -- La langue DANS LAQUELLE ce mot est un faux ami. Fermée à deux valeurs:
  -- ce sont les deux langues de contenu du produit.
  lang text not null,
  -- Ce que le mot désigne DANS CETTE LANGUE.
  slug text not null references public.food_composition_refs (slug) on delete cascade,
  reason text not null,
  decided_on date not null,
  primary key (term, lang),
  constraint food_composition_false_friends_lang_check check (lang in ('fr', 'en')),
  constraint food_composition_false_friends_term_check
    check (term = lower(btrim(term)) and length(term) >= 2),
  constraint food_composition_false_friends_reason_check
    check (length(btrim(reason)) >= 10)
);

comment on table public.food_composition_false_friends is
  'LOT A (2026-09-11): les formes où le lexique d''une LANGUE parle avant le slug '
  'nu. Liste FERMÉE, nominative, posée par migration. C''est la seule exception '
  'à « égalité exacte d''abord, alias ensuite » — voir resolveIngredient() et '
  'la migration 20260822113000 pour ce que coûterait une inversion générale.';

-- Les grants: service-role et rien d'autre, comme les deux tables voisines.
-- Supabase accorde TOUT à `authenticated` sur toute table neuve, TRUNCATE
-- compris, et TRUNCATE échappe à RLS. `revoke ... from public` ne retire pas
-- les privilèges d'`anon`. Les deux cicatrices, retirées nommément.
revoke all on table public.food_composition_false_friends from anon, authenticated;
alter table public.food_composition_false_friends enable row level security;

-- Aucune donnée d'utilisateur: pas de `user_id`, pas de FK vers `auth.users`.
-- Cette table n'entre ni dans `account-export-v1` ni dans la cascade de
-- suppression, et elle le DIT — la cicatrice du dépôt est l'inverse (neuf
-- tables neuves jamais réclamées par le lifecycle RGPD).

-- ---------------------------------------------------------------------------
-- ③ LA POIRE — décrochée du poireau
--
-- ⛔ LE CODE ANSES EST RETIRÉ, PAS REMPLACÉ. La ligne ANSES générique de la
-- poire (« Poire, pulpe et peau, crue ») n'est établissable depuis AUCUNE
-- source présente dans ce dépôt: les classeurs CIQUAL de
-- `scratchpad/build_ciqual_migration.py` vivaient dans `/tmp` et n'y sont plus,
-- et l'import de masse `20260812090000` n'a pas importé la colonne `ciqual_code`
-- (c'est très exactement l'origine des 689 lignes non traçables). Inventer un
-- code plausible serait le pire résultat possible: il aurait l'air d'une
-- traçabilité. `pear` rejoint donc les 689, et le dit.
--
-- ⚠️ LES VALEURS SONT CITÉES, PAS INVENTÉES. Elles sont celles de
-- `pear_var_conference_pulp` — « Pear, var. Conférence, pulp, raw » — une ligne
-- ANSES DÉJÀ PRÉSENTE dans cette base, importée par `20260812090000`. La
-- variété Williams, l'autre ligne de poire de cette base, donne 54,1 kcal: un
-- écart de 1,0 kcal/100 g. Ce n'est pas la ligne générique, et c'est pourquoi
-- la ligne repart en `a_verifier` (§⑤): un humain doit confirmer la générique.
--
-- ⚠️ `folate_source` AUSSI. La sentinelle « source de folates » est celle du
-- POIREAU; les deux lignes de poire de cette base la portent à `false`. La
-- copie allait jusque-là.
--
-- ⛔ `unit_grams` N'EST PAS TOUCHÉ: 150 g pour `pear`, 100 g pour `leek` — ce
-- champ-là n'a jamais été copié.
--
-- Le `where` nomme la valeur fautive: après une correction humaine, un second
-- passage de cette migration ne touche plus rien.
-- ---------------------------------------------------------------------------
update public.food_composition_refs
set ciqual_code = null,
    ciqual_name = null,
    energy_kcal = 53.1,
    protein_g = 0.5,
    carbs_g = 11.4,
    fat_g = 0.5,
    fiber_g = 3.1,
    folate_source = false
where slug = 'pear'
  and ciqual_code = '20039';

-- ---------------------------------------------------------------------------
-- ④ LES ALIAS QUI LÈVENT FRAIS / SEC
--
-- ⛔ CES ALIAS NE SONT PAS UN CONFORT, ILS SONT LA MOITIÉ DU CORRECTIF. `sec`,
-- `seche`, `sechees`, `dried`, `frais`, `fraiche` sont tous des MODIFICATEURS
-- de `candidateForms`: ils TOMBENT. « prunes séchées » se réduit donc à
-- « prunes » — et « prunes » est désormais un faux ami qui rend la prune
-- FRAÎCHE. Sans l'alias de la forme complète, le correctif transformerait un
-- fruit sec en fruit frais, c'est-à-dire exactement le défaut inverse.
--
-- La forme COMPLÈTE est essayée avant toute réduction (c'est le contrat de
-- `candidateForms`), donc l'alias gagne toujours sur la réduction.
-- ---------------------------------------------------------------------------
insert into public.food_composition_aliases (alias, slug, note) values
  -- Le SEC, nommé sans ambiguïté. Il doit rester atteignable.
  ('pruneau', 'prune', 'LOT A 2026-09-11: le pruneau est la prune SECHEE (229 kcal)'),
  ('pruneaux', 'prune', 'LOT A 2026-09-11: pluriel de pruneau'),
  ('prune sechee', 'prune', 'LOT A 2026-09-11: la reduction tomberait sur prune = plum (frais)'),
  ('prunes sechees', 'prune', 'LOT A 2026-09-11: la reduction tomberait sur prunes = plum (frais)'),
  ('prune seche', 'prune', 'LOT A 2026-09-11: variante orthographique'),
  ('prunes seches', 'prune', 'LOT A 2026-09-11: variante orthographique'),
  ('dried plum', 'prune', 'LOT A 2026-09-11: le nom anglais non ambigu du fruit sec'),
  ('dried plums', 'prune', 'LOT A 2026-09-11: pluriel'),
  ('raisins frais', 'grapes', 'LOT A 2026-09-11: pendant pluriel de raisin frais'),
  ('raisin de table', 'grapes', 'LOT A 2026-09-11: le raisin frais, nomme sans ambiguite'),
  -- Le FRAIS, nommé sans ambiguïté.
  ('prune fraiche', 'plum', 'LOT A 2026-09-11: la prune FRAICHE (46 kcal)'),
  ('prunes fraiches', 'plum', 'LOT A 2026-09-11: pluriel'),
  ('fresh plum', 'plum', 'LOT A 2026-09-11: nom anglais non ambigu du fruit frais'),
  ('fresh plums', 'plum', 'LOT A 2026-09-11: pluriel')
on conflict (alias) do nothing;

-- ⚠️ UN ALIAS EXISTANT QUI POINTAIT SUR LA LIGNE REJETÉE. « raisin sec »
-- désignait `raisin` — la ligne SANS code CIQUAL, doublon de fait de `raisins`
-- (13046, « Raisin, sec »), aux cinq macronutriments identiques. Le terme non
-- ambigu doit atteindre la ligne TRAÇABLE.
update public.food_composition_aliases
set slug = 'raisins',
    note = 'LOT A 2026-09-11: repointe de `raisin` (doublon sans code) vers `raisins` (13046)'
where alias = 'raisin sec'
  and slug = 'raisin';

-- ---------------------------------------------------------------------------
-- ⑤ LES EXCEPTIONS DE VALIDATION — cinq lignes, nommées une par une
--
-- Toutes sortent de `lotA-audit.json`. Aucune n'est une opinion: chacune cite
-- le fait qui la justifie.
--
-- ⚠️ LES 18 LIGNES `sas` NE SONT PAS ICI, ET C'EST VOULU. Elles sont
-- `a_verifier` par la RÈGLE (`defaultValidationFor`), pas par une exception:
-- les inscrire une par une ferait croire que la règle ne les couvre pas, et la
-- 19ᵉ ligne promue demain passerait au travers. Deux d'entre elles sont
-- d'ailleurs fautives — `lentilles_mijotees` (116 kcal en `legume_absorbs`) et
-- `pois_chiches_cuits_egouttes` (164) portent une énergie d'aliment CUIT sur
-- une classe qui déclare du CRU, donc ÷2,4 — et la règle les attrape déjà.
-- ---------------------------------------------------------------------------
update public.food_composition_refs as r
set validation_state = v.state,
    validation_reason = v.reason,
    validation_decided_on = date '2026-09-11'
from (values
  -- La poire, corrigée au §③ mais pas rétablie: la ligne ANSES générique reste
  -- à confirmer par un humain, avec son code.
  ('pear', 'a_verifier',
   'LOT A 2026-09-11: portait le code 20039 et « Poireau, cru » avec les 5 macros du poireau. '
   'Valeurs reprises de pear_var_conference_pulp (ANSES, deja en base, 53.1 kcal). '
   'A CONFIRMER: la ligne ANSES generique « Poire, pulpe et peau, crue » et son code.'),
  -- Le doublon français de `raisins`.
  ('raisin', 'rejete',
   'LOT A 2026-09-11: doublon de fait de `raisins` (13046, « Raisin, sec ») — 5 macros '
   'identiques — SANS ciqual_code, et dont le slug est le mot francais du raisin FRAIS. '
   'Rien ne doit composer avec cette ligne: `raisins` porte la meme mesure, tracee.'),
  -- Le fruit sec dont le nom ne le dit pas.
  ('prune', 'a_verifier',
   'LOT A 2026-09-11: le libelle « Prune » n''avoue pas le fruit SEC (229 kcal) et le slug '
   'capture le mot francais de la prune FRAICHE (plum, 46). Atteignable par `pruneau`. '
   'A DECIDER: renommer le slug en dried_prune (trois epreuves d''absence) ou relibeller.'),
  -- L'avocat classé légume.
  ('avocado_pulp', 'a_verifier',
   'LOT A 2026-09-11: doublon de fait de `avocado` (13004) — 205 kcal, 20.6 g de lipides — '
   'mais classe `non_starchy_veg`. Un aliment a 205 kcal traite comme un legume fausse '
   'toutes les regles de groupe. A DECIDER: corriger le groupe ou retirer la ligne.'),
  -- Le non-aliment.
  ('paraffin_oil', 'rejete',
   'LOT A 2026-09-11: l''huile de paraffine est un laxatif, pas un aliment. 0 kcal, groupe '
   'other_added_fat, atteignable par l''alias « huile de paraffine ». Deja signale par '
   'scratchpad/2026-08-21-0111-LOT19-CIQUAL-LIGNES-ABIMEES.md § F.')
) as v (slug, state, reason)
where r.slug = v.slug
  -- Une décision humaine POSTÉRIEURE n'est pas écrasée par un second passage.
  and r.validation_state is null;

-- ---------------------------------------------------------------------------
-- ⑥ LES QUATRE FAUX AMIS FRANÇAIS
--
-- Comptés le 2026-09-11 sur TOUS les plans de la base locale, par
-- `content_locale`:
--
--     fr-FR   prunes 78 · raisin 65 · raisins 40 · prune 12  →  195 occurrences
--     en-GB   raisins 1                                      →    1 occurrence
--
-- ⛔ `pate` N'EST PAS DANS CETTE LISTE, ET C'EST UNE DÉCISION. Le slug `pate`
-- (charcuterie, 325 kcal, `red_meat`) capture bien le mot français « pâte »,
-- mais `normalizeTerm` retire les accents: « pâte » et « pâté » deviennent la
-- MÊME chaîne. Aucune ligne de cette table ne peut donc les départager, et
-- rendre l'un juste rendrait l'autre faux. Ce chantier n'a aucune mesure pour
-- arbitrer — il faudrait un renommage de slug. On laisse le défaut en place
-- plutôt que d'en poser un autre à côté.
-- ---------------------------------------------------------------------------
insert into public.food_composition_false_friends (term, lang, slug, reason, decided_on) values
  ('raisin', 'fr', 'grapes',
   'En francais le raisin est le fruit FRAIS (grapes, 68.9). Le slug anglais `raisin` porte '
   'le fruit SEC (321) et le capturait: 65 occurrences fr-FR, aucune en-GB.',
   date '2026-09-11'),
  ('raisins', 'fr', 'grapes',
   'Meme mot au pluriel: 40 occurrences fr-FR. Le fruit sec reste atteignable par '
   '« raisins secs » et « raisin sec » (alias, forme complete essayee avant reduction).',
   date '2026-09-11'),
  ('prune', 'fr', 'plum',
   'En francais la prune est le fruit FRAIS (plum, 46). Le slug anglais `prune` porte le '
   'fruit SEC (229) et le capturait: 12 occurrences fr-FR, aucune en-GB.',
   date '2026-09-11'),
  ('prunes', 'fr', 'plum',
   'Meme mot au pluriel: 78 occurrences fr-FR, le terme le plus frequent des quatre. Le '
   'pruneau reste atteignable par « pruneau », « pruneaux », « prunes sechees ».',
   date '2026-09-11')
on conflict (term, lang) do nothing;

commit;
