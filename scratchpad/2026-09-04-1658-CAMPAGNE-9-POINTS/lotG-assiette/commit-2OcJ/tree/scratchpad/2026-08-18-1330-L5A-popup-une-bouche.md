# L5-A — LE POP-UP « UNE BOUCHE »

**Date** 2026-08-18 13:30 · Branche `ff-001-quotidien-du-coach` · Commit `c933144d`
**Aucun push, aucun merge.** Conception :
[2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md](2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md) §1.

---

## 0. Ce qui est livré, en une page

| # | Ce que c'est | Où |
|---|---|---|
| ① | La **décision** des six blocs — quatre états du curseur, refus nommés, ce qui retient le bouton | `lib/mouthForm.ts` (neuf) |
| ② | La **fenêtre** — six blocs, trois obligatoires, trois repliés | `components/MouthFormDialog.tsx` (neuf) |
| ③ | Les **écritures** — l'ordre des marches, et l'arrêt à la première qui casse | `api/mouthProfile.ts` (neuf) |
| ④ | La dernière colonne collectée **sans écrivain** : le rythme et la cible | migration `20260818190000` (neuve, **non appliquée**, §6) |
| ⑤ | Le câblage dans `/app/household` | **patch sur le disque uniquement** (§5) |

**Preuves** : `tsc -b --force` **exit 0** · vitest **1324 passés / 3 échecs**, les
trois étrangers et connus (§7) · `AGENT_GATE_STAGED_ONLY=1` au commit →
**pass** (Deno 3322/0, typecheck, `deno check`, eslint) · **18 mutations, 18
mordent** (§4), dont deux qui ne mordaient pas d'abord et disaient chacune
quelque chose.

---

## 1. ⚠️ LE FAIT LE PLUS IMPORTANT DE CE RAPPORT — une lane a atterri sous moi

**Pendant que j'écrivais, le lot L0 a livré trois migrations et réécrit deux
fichiers que je m'apprêtais à prendre.** Mesuré à 12 h 30, puis à 13 h 05 :

| Instant | `keel_household_set_member_body` | `SetupPage §people` | Registre |
|---|---|---|---|
| **12 h 05** (mon relevé initial) | 4 paramètres | pas de cran d'activité | …120000 |
| **13 h 05** | **5 paramètres** (`p_activity_level`) | **ActivityPicker + `setup.activity.*`** | …160000, …180000 |

Trois conséquences, toutes assumées et toutes visibles dans le code :

1. **Ma migration a perdu son bloc ②** (la porte d'écriture du cran d'activité).
   L0 l'a fermée **mieux** : je proposais une porte séparée pour éviter la
   surcharge, L0 a fait un `drop` + `create` — l'ancienne signature disparaît,
   donc aucun appelant ne peut plus toucher la version qui n'écrit rien. Le bloc
   est **retiré**, pas gardé en double : deux portes pour une colonne, c'est la
   garantie qu'un écran appellera l'une et un autre l'autre.
2. **Ma migration a été renumérotée** de `…140000` à **`…190000`**. `…160000` et
   `…180000` étaient déjà **au registre** : une migration posée avant le dernier
   cran appliqué est **sautée en silence**. Les lots suivants partent de
   `…200000` et **vérifient le registre avant de choisir**.
3. **Je ne touche PLUS `SetupPage.tsx`.** §2 ci-dessous.

---

## 2. ⛔ CE QUE JE N'AI PAS FAIT, ET POURQUOI : `SetupPage §people`

Le mandat me donne `SetupPage §people`. **Je l'ai laissé intact**, et c'est une
décision, pas un oubli.

`SetupPage.tsx` porte aujourd'hui, **non commité**, un `ActivityPicker`
complet, ses clés `setup.activity.*`, et un `activityLevel` propagé dans
`SelfDraft`, `MouthDraft` et trois sites d'enregistrement — c'est le lot L0, qui
tourne **maintenant**. Y poser ma fenêtre aurait produit exactement ce que la
règle anti-collision n°2 interdit : deux lots réécrivant le même écran, dont un
seul est visible dans `git diff`.

**Ce que ça laisse ouvert** : l'entonnoir garde son formulaire en ligne, et la
fenêtre ne s'ouvre que depuis `/app/household`. `MouthFormDialog` est écrit pour
les deux surfaces (`MouthSubject` porte les deux seuls écarts) et se monte en
six lignes. **À faire par le lot qui prendra `SetupPage` après L0**, pas par moi.

---

## 3. Les points durs de la conception, et où ils vivent

### ⚠️ `maxKgPerWeek` a DEUX absences, et ce sont deux écrans

`PaceControl` (`lib/mouthForm.ts`) a **quatre** états, dont trois ne sont pas un
curseur :

```
folded       maintenance, ou rien de choisi
needs_body   paceCeilingFor → null    « je ne connais pas ce corps »
no_margin    maxKgPerWeek === 0       « je le connais, et il n'a pas de marge »
slider       min 0,05 · max borné sur CE corps · pas 0,05
```

Le cas `no_margin` est **mesuré**, pas supposé : 25 kg / 140 cm / sédentaire, en
perte. Le test du rendu vérifie qu'aucun `id="mouth-pace"` n'est émis **et** que
la phrase n'est pas celle de `needs_body` — un curseur de 0,05 à 0 est un
contrôle mort, et un contrôle mort se lit comme un bouton cassé.

### ⚠️ Le seuil de 0,5 kg/sem est un AVERTISSEMENT

Le curseur monte **jusqu'à la borne dure** (`max="1"` mesuré sur un adulte de
110 kg en prise) et **porte** `PACE_WARNING_LABELS[…]` — la phrase du module,
dans les deux langues, **jamais réécrite ici**. Une mutation qui la recopie en
anglais mord sur le test français (M10).

Le seuil est **franchi, pas atteint** : à 0,50 pile, rien ne s'affiche. Une
perte n'en reçoit jamais.

### ⚠️ Les goûts vivent sur la ligne MEMBRE

`food_preferences` est indexée sur `user_id` — inatteignable pour un enfant, le
cas nominal. Les dégoûts partent dans **`household_food_restrictions`**
(`member_id`), la table du « pas de Nutella pour Léa », par
`keel_household_add_restriction`.

**Arbitrage que j'ai pris seul** : les dégoûts empruntent la table du **pouvoir
domestique**, dont le commentaire de base dit « aucune colonne de raison, et
c'est délibéré ». C'est le bon logement — le fait est « elle ne mange pas ça »,
et le verrou serveur en tait le pourquoi — mais ce n'est pas la table que la
conception nomme. La distinction dégoût / allergie est **dans l'en-tête du bloc
replié**, pas sous son champ : sous le champ, elle n'était lisible qu'après
avoir choisi le mauvais bloc.

### ⚠️ Le shaker demande CE QU'IL APPORTE — et il n'a qu'un chemin

Trois nombres (portion, protéines, calories), avec la phrase qui dit **où on les
lit** : sur l'étiquette du pot. `mouthProfile.int.test.ts` prouve que
`parseFixedIntakes` **garde** la ligne (`discarded: 0`) au lieu de la jeter,
qu'elle sort en branche `declared`, qu'elle est `loose` sans moment nommé et
`replacesMeal: false` avec.

> ### ⛔ IL N'EST OFFERT QU'À UNE BOUCHE QUI A UN COMPTE, ET LE TROU EST PLUS LARGE QUE L'ÉCRITURE
>
> `fixed_intakes` vit dans `student_goals.practical_constraints`, donc sur
> `user_id`. Et **la lane foyer n'en lit aucun** :
> `generate-household-meal-v1/index.ts` passe `fixedIntakes: []` **en dur**,
> trois fois (lignes 2794, 2946, 3385), avec le commentaire « Le foyer ne porte
> pas d'apports fixes ».
>
> Même en fabriquant une table par membre, **rien ne la lirait**. Montrer le
> champ à une bouche sans compte serait montrer un contrôle qui échoue à tous
> les coups. **À L7/L8** — le lecteur vit dans `household_meal_generation.ts`,
> hors de mon périmètre.

### ⛔ On ne demande jamais « adulte ou enfant »

`MouthFormDraft` **n'a aucun champ `kind`** (testé), `ageStateOfDraft` est le
seul chemin, et l'écran **dit** que la date de naissance remplace la question.
Une date illisible est **signalée** (« aucune direction ne s'appliquera ») :
`unknown` n'est ni un enfant ni un adulte.

Un mineur porte **les six blocs** : trois directions proposées, aucun bloc
masqué, et son curseur est borné sur **son** besoin (test : deux corps
identiques sauf la date de naissance rendent deux `max` différents).

### Le cran d'activité RETIENT le bloc 3 — arbitrage pris seul

La colonne est nullable et `null` y veut dire « personne n'a répondu ». Le
**bloc**, lui, est déclaré obligatoire par la conception, et le champ y est « le
trou n°1 du produit ». Le rendre facultatif recréerait le `null` que le champ
existe pour supprimer. `null` reste la lecture juste des lignes écrites **avant**
ce formulaire — c'est une histoire, pas une réponse.

⚠️ **L0 a tranché l'inverse pour SA surface** (`MemberBodyView.activityLevel` :
« hors du tout-ou-rien », parce qu'une bouche sans cran compose quand même). Les
deux décisions coexistent sans se contredire : L0 parle de ce que la **base**
exige, moi de ce que le **formulaire d'accueil** demande. **À signaler au
vérificateur** : si l'utilisateur veut une seule règle, c'est la mienne qui
bouge, pas celle de la base.

### La fenêtre se ferme, toujours

« Obligatoire » qualifie l'**enregistrement**, jamais la fenêtre. Échap, la
croix (`closeLabel` = « plus tard », pas « fermer ») et un bouton de sortie en
bas. Ce qui retient le bouton est **nommé**, à côté du bouton, avec
`Intl.ListFormat` — « a, b **et** c » en français, « a, b **and** c » en anglais.

---

## 4. Les mutations — 18, toutes mordent

| # | Mutation | Résultat |
|---|---|---|
| M1 | `paceControlFor` : confondre `0` et un curseur (D3) | **ROUGE** ×2 |
| M2 | `paceControlFor` : ne pas rabattre le cran sur le maximum | **ROUGE** ×2 |
| M3 | `paceControlFor` : perdre l'avertissement de prise | **ROUGE** ×3 |
| M4 | `missingRequiredBlocks` : ne plus exiger le cran d'activité | **ROUGE** |
| M5 | `submitIsHeld` : ignorer le refus du poids visé | **ROUGE** ×2 |
| M6b | `targetWeightStateFor` : laisser passer `maintenance` | **ROUGE** |
| M7 | `shakerIsForeground` : mettre en avant pour tout le monde | **ROUGE** |
| M8 | `shakerIsComplete` : accepter une énergie manquante | **ROUGE** ×2 |
| M9 | `ageStateOfDraft` : lire l'inconnu comme un adulte | **ROUGE** ×2 |
| M10 | fenêtre : réécrire la phrase au lieu de lire `PACE_WARNING_LABELS` | **ROUGE** |
| M11 | fenêtre : montrer le shaker à une bouche sans compte | **ROUGE** |
| M12b | fenêtre : offrir le régime à une bouche qui a un compte | **ROUGE** |
| M13 | fenêtre : pré-cocher le premier cran d'activité | **ROUGE** |
| M14 | `persistMouth` : continuer après une marche cassée | **ROUGE** |
| M15 | `persistMouth` : accepter un `member_id` vide | **ROUGE** |
| M16 | `shakerIntakeJson` : laisser tomber l'énergie déclarée | **ROUGE** ×5 |
| M17 | fenêtre : montrer le curseur quand le corps est inconnu | **ROUGE** |
| M18 | `blockList` : joindre à la virgule au lieu de la grammaire | **ROUGE** |

### ⚠️ Les DEUX qui ne mordaient pas d'abord, et ce qu'elles ont trouvé

**M6 → une garde dupliquée, c'est-à-dire du code mort.** `targetPayloadOf`
commençait par sa propre lecture de la direction ; la muter ne faisait rougir
personne, parce que `targetWeightStateFor` rend déjà `idle` sur `maintenance`.
Le résultat était **calculé puis jeté** — la signature exacte d'une branche qui
ne décide rien, et le même défaut que M9 du lot socle. **Corrigé** : une seule
décision, qui délègue. Puis M6b, écrite pour mordre sur la ceinture réelle.

**M12 → un test vide sur un bloc replié.** L'assertion « le régime n'est offert
qu'à une bouche sans compte » passait **quoi qu'on fasse** : sur un bloc replié,
le champ est absent des deux côtés. « Une garde a besoin d'un cas qui passe. »
**Corrigé** en rendant `openBlock` un **état contrôlé et requis** — ce qui donne
au test le levier qui manquait, et à l'appelant celui de rouvrir la fiche sur le
bloc qu'il vient de refuser.

---

## 5. ⛔ CE QUI NE VIT QUE SUR LE DISQUE

`git commit -- <chemin>` commite le **fichier entier de l'arbre**. Quatre
fichiers portent du travail d'autres lanes ; je ne les ai donc **pas commités**.

| Fichier | Hunks | Dont miens | Ce que sont les autres |
|---|---|---|---|
| `pages/HouseholdPage.tsx` | 5 | **4** | lot **L0** — `onSaveBody` reçoit `activityLevel` |
| `i18n/catalog.ts` | 3 | **1** | autres lanes |
| `copy/planRefusals.ts` | 2 | **1** | autre lane (celle qui rend son test rouge) |
| `i18n/en.ts` · `fr.ts` | — | 2 blocs | packs i18n, **non commités par convention** |

**Deux patches sont commités**, tous deux vérifiés par `git apply --check -R`
(ils décrivent exactement l'état du disque) :

```
git apply scratchpad/2026-08-18-L5A-householdpage-wiring.patch
git apply scratchpad/2026-08-18-L5A-shared-files.patch
```

⚠️ **Sans le premier, la fenêtre n'est montée nulle part.** Le lot est complet et
prouvé, mais personne ne le voit. Le plus tôt est le mieux : dès que L0 a commité
`HouseholdPage.tsx`, ces quatre hunks peuvent l'être par pathspec sans rien
emporter.

---

## 6. ⛔ LA MIGRATION N'EST PAS APPLIQUÉE — et je n'ai pas pu

`supabase/migrations/20260818190000_the_pace_gets_a_write_port.sql` est
**écrite, commitée, et NON appliquée**.

Deux chemins, deux murs :

- `npx supabase migration up --local` et `migration list --local` rendent tous
  deux **`runtime error: index out of range [0] with length 0`**. C'est l'écart
  disque/registre que L1-A avait déjà signalé, aggravé depuis : `…170000` (lot
  L0) est **sur le disque et absent du registre**, alors que `…160000` et
  `…180000` y sont.
- L'application directe par `psql` **a été refusée par la politique de
  permissions de ma session**, deux fois. Je n'ai pas insisté.

**La commande à lancer par un humain** (elle est dans son propre `begin/commit`,
et le bloc `do $$` du bas échoue bruyamment si les grants ne sont pas ceux
attendus) :

```bash
docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 --single-transaction \
  < "supabase/migrations/20260818190000_the_pace_gets_a_write_port.sql"

docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c \
  "insert into supabase_migrations.schema_migrations(version) values ('20260818190000')"
```

**Tant qu'elle n'est pas passée** : `setMemberTarget` répond `{"ok": false}` avec
le message de PostgREST, et l'écran le rend comme n'importe quel refus — jamais
comme un succès. Le reste de la fenêtre (les cinq autres blocs) fonctionne.

### Ce que la migration ferme, et ce qu'elle ne ferme plus

Mesuré à 12 h 10 sur la base locale (`has_table_privilege`), sur les quatre
colonnes que le lot socle a passées à L5 comme « les colonnes à écrire » :

| Colonne | Écrivain, avant | Après |
|---|---|---|
| `profiles.activity_level` | UPDATE à `authenticated` ✅ | inchangé |
| `household_member_bodies.activity_level` | **aucun** ❌ | fermé par **L0** (`…160000`) |
| `household_members.target_weight_kg` | **aucun** ❌ | `keel_household_set_member_target` |
| `household_members.target_pace_kg_per_week` | **aucun** ❌ | idem |
| `student_goals.target_pace_kg_per_week` | **la colonne n'existait pas** ❌ | créée + 2 CHECK |

> **Trois colonnes collectées sans écrivain, ce sont trois champs décoratifs.**
> La migration du socle avait réparé la **lecture** (`keel_household_bodies_for`)
> en écrivant elle-même pourquoi ce serait mortel de s'arrêter là — et s'était
> arrêtée avant l'**écriture**.

---

## 7. Ce qui reste rouge, et à qui

| Rouge | À qui |
|---|---|
| `src/edge/coverage-guard.int.test.ts` (2 cas) | **Autres lanes.** Ma migration contient **0 `create trigger`** et je n'ajoute **aucune fonction edge**. Rouge dès mon relevé initial, à 12 h 05. |
| `src/keel/copy/planRefusals.int.test.ts` (1 cas) | **Autre lane.** Le fichier porte des hunks étrangers assumés rouges le temps que les générateurs émettent les deux jetons. Rouge dès 12 h 05, **avant** que j'y ajoute mes cinq motifs. |

**Aucun rouge de mon périmètre.** `tsc -b --force` **exit 0**.

⚠️ **La ligne de base a bougé pendant le lot**, et il faut le dire : à 12 h 05,
`tsc -b --force` rendait **une** erreur (`KitchenToday.tsx:198`, `SessionMissedButton`
introuvable — lane étrangère). Elle a disparu d'elle-même vers 12 h 40. Un
vérificateur qui compare à mon relevé initial la retrouvera dans mes journaux,
pas dans l'arbre.

---

## 8. Les clés i18n — **sur le disque, non commitées**

**62 clés × 2 langues**, ajoutées sans réordonner ni reformater, à un seul point
d'insertion (juste avant `setup.table.from_profile`).

- **57** sous `household.mouth.*` — la fenêtre.
- **5** sous `household.error.*` — les refus des portes neuves :
  `target_incomplete`, `bad_target_weight`, `bad_pace`,
  `target_needs_direction`, `no_member_id`.

Deux corrections imposées par la garde de parité, et elle avait raison des deux
côtés :

- `household.mouth.block_join` (« , » dans les deux packs) a été **supprimée** —
  une virgule n'est pas une traduction, et `Intl.ListFormat` fait mieux ;
- `shaker_kcal` disait « calories » des deux côtés : `energy (kcal)` / `calories
  (kcal)`.

**Clés mortes que je n'ai PAS retirées** : L1-A me passait
`setup.goal.{recomposition,performance,health}` et leurs jumelles. Elles vivent
dans `SetupPage`/`HouseholdPage`, que **L0 réécrit en ce moment**. Les retirer
maintenant, c'est reprendre le fichier qu'un autre tient. **À faire par le lot
qui referme `SetupPage`.**

`i18n/catalog.ts` gagne **deux namespaces** sur `/app/household` — `setup` et
`allergen`. Ce n'est pas un contournement : `pageSeams.int.test.ts` a rougi
avant que quiconque ouvre la page, et son remède est écrit dans son propre
message (« Ajoute son namespace à la déclaration de la page »). Les deux **sont**
traduits ; il manquait la déclaration.

---

## 9. Ce que le vérificateur (L5-B) doit savoir

1. **La fenêtre n'est visible qu'après `git apply` du patch §5.** Sans lui,
   `/app/household` rend l'ancien formulaire en ligne. Ce n'est pas une panne.
2. **Le curseur ne bouge pas tant que la migration §6 n'est pas passée** — enfin
   si, il bouge : c'est l'**enregistrement** de la cible qui refuse, et le refus
   arrive en phrase (les cinq motifs sont dans `planRefusals`, patch §5).
3. **`vitest.config.ts` tourne en `node`** : `Modal` passe par
   `createPortal(…, document.body)`, donc monter `MouthFormDialog` entier lève
   `ReferenceError: document is not defined` (38 rouges au premier lancement de
   mon fichier). Les tests montent **`MouthFormFields`**, le corps. ⛔ Ne pas
   « réparer » en passant la suite en `jsdom` : le fichier est partagé.
4. **Trois cas mesurés à rejouer au navigateur**, à 320 px et 1280 px, dans les
   deux langues :
   - 25 kg / 140 cm / femme / sédentaire / perte → **une phrase, pas de curseur** ;
   - 60 kg / 165 cm / femme / sédentaire / perte, cible 55 → **max 0,45**, borne
     `energy_floor`, **« environ 12 semaines »** ;
   - 110 kg / 185 cm / homme / `trains_hard` / prise, cran 0,75 → **max 1,00** et
     la phrase du surplus, **en français en français**.
5. **L'arbitrage du cran d'activité obligatoire** (§3) diverge de la lecture de
   L0. Les deux sont défendables ; l'utilisateur tranche.

---

## 10. Ce que **L6** doit savoir — nous partagions `SetupPage`

| Fait | Conséquence pour L6 |
|---|---|
| **Je n'ai pas touché `SetupPage.tsx`.** Pas une ligne. | Le fichier ne porte AUCUN hunk de moi. Ce qu'il porte est de L0 (§2) et des lanes L2/L3. |
| **L0 y a posé un `ActivityPicker` et `setup.activity.*`** | Ne pas le redécouvrir, ne pas le dédoubler. |
| `MouthFormDialog` est écrit pour les deux surfaces | `MouthSubject` porte les deux seuls écarts (shaker ↔ compte, régime ↔ pas de compte). Six lignes pour le monter dans l'entonnoir. |
| **Numéros de migration** | `…190000` est pris par moi. Le registre porte `…160000` et `…180000` mais **pas** `…170000` (lot L0, sur le disque). **Partez de `…200000`, et vérifiez le registre avant de choisir** — une migration hors ordre est sautée en silence. |
| `copy/planRefusals.ts` | J'y ajoute 5 motifs, **sur le disque** (patch §5). Un commit du fichier entier les emporterait — ou les écraserait. |
| `i18n/catalog.ts` | `/app/household` déclare désormais `setup` et `allergen`. Sur le disque (patch §5). |

---

## 11. Procédure

- Mutations appliquées par script sur les fichiers réels, **restaurées après
  chacune**, empreinte `shasum` comparée à la fin : les trois fichiers sont
  identiques à leur état d'avant.
- `git add` par **chemins explicites** uniquement. **Jamais `git add -A`, jamais
  `git stash`.**
- **Aucune commande à risque.** Aucune migration appliquée (§6). Le runtime edge
  n'a pas été redémarré.
- `launch.json` **non modifié**. Aucun serveur de dev lancé — la vérification au
  navigateur appartient à L5-B, sur base stable.
