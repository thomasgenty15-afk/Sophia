# MASTER PROMPT — ① la structure du repas · ② l'activité en deux axes

**2026-08-20** · branche `ff-001-quotidien-du-coach`
**Cadre produit** : `scratchpad/2026-08-20-0200-DESIGN-habitudes-et-signaux.md`
**Nuit qui précède** : `scratchpad/2026-08-20-0100-RUN-REEL-grammage-par-personne.md`

Deux lots. Ils remplacent les deux endroits où le moteur **devine** au lieu de
**savoir**. Aucun des deux n'allonge l'inscription d'un écran.

---

## 0. CE QUI EST DÉJÀ VRAI, ET QU'ON NE REDÉCOUVRE PAS

Le foyer de référence est `5600347f-f0a4-448c-b355-c5f1d3b35d95` :

```
iku        187 cm · 73 kg · 28 ans · homme  · trains_hard · muscle_gain 0,35 kg/sem
           compte iku@gmail.com · mot de passe 12345678
Christèle  169 cm · 58 kg · 56 ans · femme  · trains_some · maintenance
           SANS compte · déclare lunch + dinner seulement
```

État servi à l'écran après la nuit du 19-20 : **iku 475 g · Christèle 421 g**.
La chaîne complète tourne (`anchored`), le français résout, le dimensionnement
atteint la réponse. **Ce qui reste faux, ce sont les deux entrées ci-dessous.**

---

# LOT ② — L'ACTIVITÉ, EN DEUX AXES

## ⛔ LE DÉFAUT, ET IL N'EST PAS CELUI QU'ON CROIT

Les quatre libellés sont **déjà factuels** — ce n'est PAS un problème de
catégorie flatteuse :

```
[ JOURNÉE ]  x1,45   « Assis toute la journée, peu de marche »
[ JOURNÉE ]  x1,65   « Debout ou en mouvement une bonne partie du jour »
[ SPORT   ]  x1,80   « Sport 2 à 3 fois par semaine »
[ SPORT   ]  x2,00   « Sport 4 fois ou plus, ou métier physique »
```

**Les deux premières décrivent la JOURNÉE. Les deux dernières décrivent le
SPORT. Ce sont deux axes indépendants, et le formulaire force à n'en cocher
qu'UN.**

Christèle est assise la journée **et** fait du sport 2-3 fois par semaine. Elle
ne peut pas dire les deux : elle coche « Sport 2 à 3 fois » et hérite de
**1,80**, alors qu'une journée assise plus deux ou trois séances vaut ~1,60.

**239 kcal/jour fabriqués par la forme de la question.** C'est le plus gros
levier restant de toute la chaîne.

## LA CORRECTION

Deux questions au lieu d'une, et le cran se DÉRIVE :

```
Ta journée ?        assis  ·  debout / en mouvement  ·  métier physique
Du sport ?          non  ·  1-2 fois  ·  3-4 fois  ·  5 fois ou plus
```

Le croisement rend le PAL. La table de croisement est la seule chose à écrire,
et elle doit être **dérivée des bandes FAO/WHO/UNU 2004** déjà citées dans
`meal_envelope.ts:130-155` (sédentaire 1,40-1,69 · modéré 1,70-1,99 · vigoureux
2,00-2,40), pas inventée. Écris la dérivation au-dessus de la table, comme le
fait déjà `ACTIVITY_FACTORS`.

⚠️ **UN ORDRE DE GRANDEUR À RESPECTER** : journée assise + 2-3 séances doit
tomber vers **1,60**, pas 1,80. C'est le cas qui a motivé le lot, et c'est le
seul chiffre que ce document impose.

## LES POINTS D'ANCRAGE

| quoi | où |
|---|---|
| le vocabulaire fermé | `_shared/keel/tokens.ts:702` (`ACTIVITY_LEVELS`) |
| les multiplicateurs + leur dérivation FAO | `_shared/keel/meal_envelope.ts:156` (`ACTIVITY_FACTORS`) |
| la question à l'écran | `frontend/src/keel/components/MouthFormDialog.tsx:641` |
| les libellés | `frontend/src/keel/i18n/fr.ts:2344-2347` (+ `en.ts`) |
| la colonne, bouche sans compte | `household_member_bodies.activity_level` |
| la colonne, bouche avec compte | `profiles.activity_level` |

⚠️ **IL EXISTE DEUX `ACTIVITY_LEVELS` DANS LE DÉPÔT** :
`tokens.ts` (`sedentary/on_feet/trains_some/trains_hard`) et `activity_floor.ts:55`
(`sedentary/lightly_active/active/very_active`). **Vérifie lequel tu touches** et
ne les fusionne pas sans mesurer qui lit l'autre.

## ⛔ LA COMPATIBILITÉ ASCENDANTE EST OBLIGATOIRE

Des fiches portent déjà un cran de l'ancien vocabulaire. Deux façons de faire, et
**la seconde est préférée** :

- migrer les valeurs — irréversible, et « assis + sport 2-3× » n'est pas
  reconstructible depuis `trains_some` : l'information n'a jamais été saisie ;
- **garder l'ancien cran comme repli nommé** : une fiche qui n'a pas répondu aux
  deux nouvelles questions continue d'utiliser son cran d'avant, et le compteur
  dit combien de fiches sont dans ce cas.

⛔ **NE FABRIQUE PAS une journée et un sport à partir d'un ancien cran.** Ce
serait inventer une réponse que personne n'a donnée — la faute exacte que ce
dépôt documente sous « paramètre de garde optionnel = garde désarmée ».

---

# LOT ① — LA STRUCTURE DU REPAS

## ⛔ LE DÉFAUT

Le plan ne compose **que le plat** (mesuré : 9 plats sur 9, aucun dessert, aucun
fromage, aucun pain). La nuit du 19-20 a posé une constante,
`COMPOSED_DISH_MEAL_SHARE = 0,42` dans `_shared/keel/mouth_anchor.ts`, pour que
le plat ne porte pas l'énergie du repas entier — sans quoi le moteur servait
**1 232 g dans une boîte de dîner**.

**C'est une moyenne française, et elle se trompe dans les deux sens à la fois :**

```
Christèle : plat 300 + pain 80 + fromage 120 + dessert 120 = 620   -> plat = 48 %
iku       : plat 300 + pain 40                             = 340   -> plat = 88 %
```

Le moteur applique **42 % aux deux**. Christèle est à peu près juste par
accident. **iku reçoit environ la moitié de ce qu'il lui faut** — et c'est lui
qui prépare et qui mange exactement ce que le plan a composé.

## LA CORRECTION

Trois cases sur la fiche de chaque bouche :

```
Tu prends un dessert ?    Du fromage ?    Du pain ?
```

La part du plat se **calcule** au lieu d'être supposée. La table des poids
(dessert ~120 kcal, fromage ~120, pain ~80, plat ~300) est une convention :
écris-la comme telle, avec ses valeurs, au même endroit que la constante qu'elle
remplace.

## ⛔ CE QUI DOIT SURVIVRE, ET C'EST ÉCRIT DANS LE CODE ACTUEL

`COMPOSED_DISH_MEAL_SHARE` porte **sa propre date de péremption** :

> « Elle n'existe que parce que le plan ne compose QUE le plat. Le jour où il
> composera le repas entier, cette constante doit passer à `1` — et non être
> "ajustée". »

Ton lot ne supprime pas cette phrase : il la **déplace**. La moyenne devient le
repli des fiches muettes, et le calcul par personne prend la main quand les cases
sont cochées. Le jour où le plan composera les desserts, **les deux** disparaissent.

---

# CE QUI VAUT POUR LES DEUX LOTS

## ⛔ TOUT EST OPTIONNEL — et ça se conçoit

| champ vide | comportement, et il doit être ÉCRIT |
|---|---|
| ② journée / sport | l'ancien cran de la fiche reprend la main, nommé |
| ② les deux vides et aucun ancien cran | inchangé : l'hypothèse actuelle, nommée |
| ① les trois cases | la moyenne à 0,42 reprend la main |

⚠️ **CHAQUE REPLI SE COMPTE DANS `generated_from`.** Cicatrice du dépôt :
« paramètre de garde optionnel = garde désarmée ». Un repli silencieux rend un
produit dont personne ne sait s'il a été renseigné. On doit pouvoir lire
« combien de bouches n'ont pas répondu », jamais le supposer.

⛔ **Et le compteur doit distinguer trois états, pas deux** : *répondu* /
*pas répondu* / *pas posé* (fiche créée avant le lot). Deux nombres pour trois
états, c'est le zéro ambigu que ce chantier paie en boucle.

## LE POSTE

- `supabase migration up` **uniquement**. ⛔ `db reset`, `db push`,
  `functions deploy`, `secrets`, `config push`, `link` sont bloqués et exigent
  l'utilisateur. Vérifie la lignée : `ls supabase/migrations | sed 's/_.*//' |
  sort | uniq -d` doit être vide, et disque == `supabase_migrations.schema_migrations`.
- **Le runtime edge sert des `_shared` périmés.** Après TOUTE modification :
  `docker restart supabase_edge_runtime_Sophia_2`, puis attendre ~7 s. Sans ça
  tu mesureras le code d'avant — ça a coûté trois runs cette nuit.
- `deno test --allow-all supabase/functions/_shared/keel/` doit rester
  entièrement vert (**3 887 passés** au moment où tu es lancé).
- Front : `npx tsc -b --force tsconfig.app.json` (⚠️ `tsconfig.json` ne vérifie
  rien) et `npx vitest run`. **`agent-gate` ne lance PAS vitest.** Il y a
  **4 rouges antérieurs et étrangers** (`coverage-guard` ×2, `household.int.test`
  ×2) — ne les compte pas pour toi, ne les répare pas.
- ⚠️ N'exporte **aucune** variable `SUPABASE_*` : 114 faux rouges mesurés.
- ⛔ Jamais `git stash` — plusieurs sessions travaillent sur ce dépôt. Ne commite
  rien.
- ⚠️ `frontend/src/keel/i18n/{en,fr}.ts` portent du travail non commité d'autres
  sessions. Livre tes clés **sur le disque**, ne les `git add` jamais, et dis-le
  dans ton rapport.

---

# ⛔ LA VÉRIFICATION EN SITUATION RÉELLE — ELLE N'EST PAS OPTIONNELLE

Les tests unitaires ne prouvent rien ici : les deux lots changent un **nombre
servi à un humain**. Il faut le voir sortir.

## L'outillage existe et il marche — copie-le

Dans `/private/tmp/claude-502/-Users-ahmedamara-Dev-Sophia-2/d6c9ff1f-ab2c-4b73-98e1-f0c60f4e98a9/scratchpad/` :

| script | ce qu'il fait |
|---|---|
| `run.sh <sortie.json>` | se connecte en `iku@gmail.com` et génère un plan de 3 jours |
| `diag.ts <plan.json>` | cibles, livré par bouche et par jour, facteurs d'ancrage |
| `bloq.ts <plan.json>` | quel terme éteint quel plat |
| `appar.ts` | l'appariement terme → slug du corpus entier (photo avant/après) |

⚠️ Ils lisent `refs.json` / `aliases.json` / `plans.json` dans le même dossier.
**Regénère ces dumps si tu touches à la base** (les commandes `psql` sont dans
l'historique de `run.sh`).

## Le protocole, run par run

1. **Photo AVANT.** `run.sh /tmp/avant.json`, puis note les grammes par bouche
   et `generated_from.box_sizing`.
2. Implémente. Redémarre le runtime.
3. **Renseigne les fiches pour de vrai** — en base ou par l'écran, mais
   renseigne-les : un lot qui ajoute un champ et le laisse vide ne prouve rien.
   Pour Christèle : journée `assis`, sport `1-2 fois`, dessert ✓ fromage ✓
   pain ✓. Pour iku : journée `assis`, sport `5 fois ou plus`, pain ✓ seulement.
4. **Photo APRÈS.** Même commande.
5. **Rends les deux photos côte à côte**, et le `box_sizing` des deux.

## Les trois nombres qui disent si ça a du sens

```
Christèle   ~250-300 g de plat au dîner      (elle est à 421 g aujourd'hui)
iku          il MONTE, il ne descend pas     (il est sous-servi par le 42 %)
aucune part  ne dépasse MEAL_MAX_GRAMS_PER_KG x son poids
```

⚠️ **SI `iku` DESCEND, TU AS UNE ERREUR DE SIGNE** quelque part : sa structure de
repas (pain seul) doit lui donner une part de plat PLUS GRANDE que la moyenne à
42 %, donc plus de grammes.

## ⛔ ET LA CONTRE-ÉPREUVE

Refais un run avec **les fiches vides** (aucune des nouvelles cases remplie). Les
grammes doivent être **identiques à la photo AVANT**, à l'octet près. Si ça
bouge, ton repli n'est pas neutre — et un repli qui déplace le produit pour ceux
qui n'ont rien répondu est pire que le défaut qu'il corrige.

---

# TON RAPPORT

Dans `scratchpad/`, **horodaté** (`2026-08-20-HHMM-LOTS12-<sujet>.md`) :

1. Les deux photos avant/après, en grammes, par bouche et par repas.
2. La table de croisement journée × sport, avec sa dérivation FAO.
3. La table des poids de composants (dessert/fromage/pain), écrite comme une
   convention.
4. Le résultat de la contre-épreuve « fiches vides ».
5. Les compteurs de repli, et ce qu'ils disent des fiches existantes.
6. **Ce que tu laisses ouvert.** Un lot qui ne déclare aucune limite n'a pas été
   relu.

⚠️ **Si un des deux lots te paraît faux en le construisant, arrête-toi et
rapporte plutôt que de le forcer.** Ce chantier a corrigé son propre plan quatre
fois en une nuit, à chaque fois parce qu'une mesure contredisait une intention.
C'est le comportement attendu, pas un échec.
