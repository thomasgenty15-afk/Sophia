# Spec — les habitudes de chaque bouche, et le temps qui décide la forme

> Ouverte le **2026-08-14** après un plan réel qui a servi des œufs brouillés
> sept matins d'affilée à une femme qui mange une pomme.

## Le constat, vérifié dans le code

| # | Ce qui cloche | Où |
|---|---|---|
| ① | **Le plat unique est une constante, pas un réglage.** L'échelle à trois barreaux existe et son paramètre est REQUIS — mais `ladder` vaut `null` hors fusion, donc la composition ordinaire est clouée au barreau ① : *« Cook ONE set of preparations for everyone. Do NOT propose separate dishes. »* | `household_portions.ts:417-452` · `generate-household-meal-v1/index.ts:2237` |
| ② | **Une bouche sans compte n'a aucun endroit où dire ce qu'elle mange.** `food_preferences` est clé sur `user_id`. Le produit sait d'elle : prénom, naissance, objectif, absences, moments, allergies, corps. **Rien sur ce qu'elle mange.** | `household_voices.ts` |
| ③ | **Les apports fixes sont morts sur la lane foyer** — `fixedIntakes: []` codé en dur, trois sites, commentaire « Le foyer ne porte pas d'apports fixes ». | `generate-household-meal-v1/index.ts:2400, 2552, 2881` |
| ④ | **Le temps de cuisine n'est relié à rien.** `cook_days.length × cooking_time_min` est calculable et personne ne le calcule. Mesuré sur le foyer de l'utilisateur : 2 × 90 = **3 h/semaine**, et plat unique quand même. | — |

**Le plan n'a pas ignoré l'habitude de cette femme : personne ne la lui a
demandée, et il n'existe aucun champ pour la ranger.**

## Les trois arbitrages, pris par l'utilisateur le 2026-08-14

| # | Décision |
|---|---|
| **B1** | **Le temps PLAFONNE, la divergence DÉCLENCHE.** Le budget hebdomadaire fixe le barreau maximum atteignable ; un second plat n'apparaît que là où deux directions ne peuvent pas sortir de la même casserole. Le temps ne fabrique pas de plats inutiles ; la divergence ne promet pas ce qu'on n'a pas le temps de cuire. |
| **B2** | **Les habitudes vivent sur la fiche de la bouche**, dans le foyer. Le maître remplit pour les bouches sans compte ; un compte réclamé remplit la sienne. Ce qu'on mange le matin est une propriété **durable de la personne**, pas de la semaine. |
| **B3** | **Un champ libre, UNE ligne, durable, par bouche.** Relu à chaque composition. |

## ⛔ Ce que cette spec NE fait PAS

- **Elle ne passe pas les habitudes par `fixed_intakes`.** Cette forme exige un
  `food_ref` résolu contre `food_composition_refs` **et** une quantité
  (`amount` + `unit`). « Une pomme le matin » n'a ni l'un ni l'autre, et lui en
  inventer écrirait un fait que personne n'a pesé — la cicatrice
  *auto-tick-writes-undeniable-false-facts*. Les deux répondent à deux
  questions : `fixed_intakes` dit **une quantité qui remplace un repas**, une
  habitude dit **une tendance que la composition contourne**.
- **Elle ne débloque pas le ③ de l'échelle** (session séparée, jour propre) sur
  la composition ordinaire. Un budget de temps permet un second plat **dans la
  même session** ; il ne permet pas une seconde session. ③ reste réservé à la
  fusion, où il a été mesuré.
- **Elle ne réveille pas `fixedIntakes` sur la lane foyer.** Défaut réel (③
  ci-dessus), lot voisin, **nommé et laissé ouvert** — un lot, un travail.

---

## LOT G — le moteur (backend seul)

**Possède** : `_shared/keel/household_habits.ts` (**NEUF**) + son test,
`_shared/keel/household_portions.ts`, `_shared/keel/plan_rationale.ts`,
`generate-household-meal-v1/index.ts`, la migration.

### G1 · La table

```sql
create table if not exists public.household_member_habits (
  member_id    uuid primary key references public.household_members(member_id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  slots        jsonb not null default '[]'::jsonb,
  note         text,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);
```

`slots` — une entrée par moment où la personne **ne mange pas le plat de la
maison** :

```jsonc
[{ "slot": "breakfast", "kind": "own_usual", "usual": "une pomme" }]
```

`kind` est une liste **fermée** : `household_dish` (le défaut — rien à dire, et
la ligne n'est alors PAS écrite) · `own_usual` (elle mange autre chose, dit en
toutes lettres).

⚠️ **Discipline de table neuve, non négociable dans ce dépôt** :
`revoke all on public.household_member_habits from anon, authenticated;`
(les privilèges par défaut donnent **TOUT** à `authenticated`), écriture par une
RPC gatée `auth.uid()`, cascade RGPD sur `auth.users`, et la table **nommée**
dans `account-export-v1`.

⚠️ **Migration appliquée par
`docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f <fichier>`
puis inscrite à la main dans `supabase_migrations.schema_migrations`. JAMAIS
`db reset` — la base locale est partagée.** Idempotente : `if not exists`,
`drop … if exists` avant `add`.

### G2 · La RPC

`keel_household_set_member_habits(p_member uuid, p_slots jsonb, p_note text)`.

Refus **nommés**, en littéral (⚠️ `planRefusals.int.test.ts` **ne lit que les
littéraux** — un ternaire rend un motif orphelin en silence) :
`not_authenticated` · `not_a_member` · `bad_slots` · `bad_note` (1..280) ·
`not_your_line`.

**Qui écrit** : le maître pour **toute** bouche de son foyer ; un compte réclamé
pour **la sienne seulement**. C'est la règle de `keel_household_set_member_away`
— relis-la et suis-la, ne l'invente pas.

### G3 · La garde du texte — RÉUTILISÉE, jamais réécrite

`usual` et `note` passent par **`_shared/keel/plan_draft_note.ts`**, déjà livré
et testé : pas de cible chiffrée, pas de vocabulaire de restriction, on refuse
**la clause, pas le texte**, et la même phrase de refus pour tout le monde.
Une seconde garde divergerait.

### G4 · Le bloc de prompt

Sur la ligne de la bouche, dans `buildPortionBrief`, à côté du
`— eats at X only` qui existe déjà :

```
- Christèle: balanced share of every component — has her own at breakfast: une pomme
```

Et, **seulement si au moins une bouche en porte une** (même discipline que
`anyBodyFacts` / `anyRhythm` — on n'énonce pas une contrainte que personne n'a
posée), la conséquence, dite une fois :

> When a person "has their own" at a moment, do NOT serve them the table's dish
> then. Cook for the others as usual, and count their own thing in the shopping
> list.

La ligne `note` va dans le bloc des voix, plafonnée, sous la garde de
non-divulgation déjà en place.

### G5 · Le temps décide le barreau (B1)

```
weeklyCookingMinutes = cookDays.length × cookingTimeMin
SEPARATE_DISH_MIN_WEEKLY_MINUTES = 90            // 1 h 30, décidé par l'utilisateur
```

- **En dessous du seuil** ⇒ `one_dish` **forcé**, et `plan_rationale` **le dit** :
  *« Avec 1 h par semaine en cuisine, tout le monde mange le même plat — c'est
  ce que le temps permet. »* Un fait, jamais un reproche.
- **Au seuil ou au-dessus** ⇒ le barreau **②** devient atteignable, et il ne se
  lève que si une direction de service **ne peut pas** sortir de la casserole
  commune. Le critère existe et il est **vérifiable** : `readServingDemands`,
  trois axes, cinq niveaux, et la règle en une phrase — *une casserole déjà
  composée peut toujours en donner moins, jamais plus qu'elle n'en contient*.
  Une demande à `balanced` ou en dessous est **toujours** servable.

⚠️ **`COOKING_SHAPE_LINES[one_session]` dit aujourd'hui « ONE person below ».**
C'est vrai d'une fusion, faux d'une composition où deux personnes peuvent
diverger. Généralise la formulation **sans toucher au chemin de fusion** : un
test doit tenir qu'une fusion rend un prompt **byte-identique** à celui
d'aujourd'hui.

⚠️ **`cookingTimeMin` est par SESSION.** Vérifie-le avant de multiplier — si
c'est faux, tout le seuil l'est.

### G6 · Les versions de prompt

Bump `HOUSEHOLD_PROMPT_VERSION`. Règle du dépôt : « quelle population voit une
consigne différente ». Un test d'**égalité de chaîne** doit tenir qu'un foyer
sans habitude et sous le seuil rend un prompt **byte-identique** à celui d'avant
le lot.

---

## LOT H — l'écran (frontend seul)

**Possède** : `frontend/src/keel/components/HouseholdHabitsCard.tsx` (**NEUF**),
`frontend/src/keel/api/householdHabits.ts` (**NEUF**) + son test,
`frontend/src/keel/pages/HouseholdPage.tsx` (site de montage).

⛔ **`frontend/src/keel/api/household.ts` n'est PAS à toi** — importe, ne modifie pas.
⛔ **Ne commite JAMAIS `en.ts` / `fr.ts` / `catalog.ts` / `planRefusals.ts`.**
`fr.ts` **n'existe pas dans HEAD** : 5017 lignes du chantier non commité d'une
autre session. Tes clés vont **sur le disque**.

### H1 · Sur la fiche de chaque bouche

Une carte par bouche, dans `MembersCard`, repliée par défaut :

- une ligne par moment que la personne prend (lu sur **son** `eating_rhythm`,
  pas une liste de six) — deux états : *elle mange ce que la maison cuisine* /
  *elle a son habitude à elle* + un champ court ;
- **UN** champ libre durable, ≤ 280 signes ;
- le refus du serveur rendu **comme une phrase**, jamais en jeton brut. Lot C a
  mesuré ce défaut exact au navigateur.

### H2 · Trois pièges nommés

1. **Rien n'est pré-coché.** `null` veut dire « personne n'a rien dit », jamais
   « elle mange comme tout le monde ». Cicatrice
   *auto-tick-writes-undeniable-false-facts* : une coche automatique écrit un
   fait faux que l'utilisateur ne peut pas démentir.
2. **Aucun décompte de qui a rempli.** « 2 personnes n'ont rien dit » se lit
   « il en reste 2 à relancer » — c'est la faute qui a fait supprimer le
   « conseil de famille » (FF-050 §1).
3. **Le formulaire attend sa lecture.** Un formulaire figé au montage sur un
   état vide affiche du vide non lu **puis l'écrase au Save** — cicatrice
   *mount-snapshot-forms-need-a-loading-gate*.

### H3 · Vérification

**Pilote le navigateur** — le harnais est écrit dans
`scratchpad/HARNAIS-SESSION-NAVIGATEUR-20260813.md` : on ouvre une session par
l'API et on injecte le jeton, on ne tape rien dans un formulaire. Maître de test :
`laneb-owner-17865234810164f22eb@test.dev`, mot de passe `1234567`.
**Prends un port que personne n'utilise** dans `.claude/launch.json` — le
navigateur partage son profil entre agents.

À 320 px : **mesure** `document.scrollWidth == 320`, ne l'estime pas à l'œil.
