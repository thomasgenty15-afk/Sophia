# FF-067 · Remplacer un plat de l'aperçu — et ne plus le revoir

| | |
|---|---|
| **Identifiant** | `FF-067-remplacer-un-plat-de-l-apercu` |
| **Statut** | 🟠 En cours — code et tests en local le 2026-09-24 ; tir réel et déploiement à faire |
| **Date** | 2026-09-24 |
| **Autorité produit** | décisions du propriétaire du 2026-09-24 (plan `eventual-exploring-treehouse`) · [NOMENCLATURE-MEMOIRE.md](../../keel/NOMENCLATURE-MEMOIRE.md) §2 (encadré du 2026-09-24) · [FF-053](FF-053-l-ecran-du-plan.md) |
| **Dépend de** | la reprise locale (`edit_cells`, `cell_edit.ts`), la reprise par exclusion (`cells_from: "exclusions"`), la lecture de note (`keel-read-note-v1`), le chiffre affiché ([FF-059](FF-059-le-chiffre-affiche.md)) |
| **Effort estimé** | 3 jours |

---

## 1. Le problème

L'aperçu d'un plan empilait toute la semaine avec le détail de chaque plat. À huit personnes, on ne voyait
pas vite ce qui plaisait ou non. Le seul retour possible était une phrase libre, qui recomposait tout le
plan — or deux compositions ne gardent quasiment aucun plat commun (mesuré) : on perdait les plats qu'on
aimait pour en retirer un. Et rien ne retenait qu'un plat avait été refusé : il pouvait revenir la semaine
suivante.

## 2. Job stories

- **Quand** j'ouvre l'aperçu pour huit personnes, **je veux** lire chaque plat en une ligne, **afin de**
  repérer en quelques secondes ce qui ne va pas.
- **Quand** un plat ne me plaît pas, **je veux** le remplacer en disant pourquoi, sans toucher au reste,
  **afin de** ne pas perdre les plats qui me conviennent.
- **Quand** j'ai refusé un plat, **je veux** ne plus le revoir, **afin de** ne pas répéter le même retour
  chaque semaine.

## 3. Ce qui est construit

### Écran (aperçu et `/app/plan`)
- **Tableau de la semaine** en tête des deux écrans (`PlanWeekTable`) : une colonne par jour ; lignes
  Courses (marque), Cuisine (durée des sessions), puis une ligne par personne avec les calories du jour —
  **seulement pour un adulte qui vise une perte ou une prise** (somme de ses boîtes déjà émises,
  `member_days` de `meal-energy-v1`). « — » pour les autres ; aucune ligne de personne tant qu'aucun
  chiffre n'existe ; « * » et une note quand un repas de ce jour est en bac commun.
- « Toute la semaine » est retirée du rail ; les deux écrans ouvrent sur un jour.
- **Aperçu seulement** : une ligne par plat (titre + kcal + « Remplacer »), dépliable vers la carte
  d'avant (`DishCard compact`).

### Le geste « Remplacer »
> ⟳ **2026-09-24 (retour du propriétaire)** — à l'écran, le bouton s'appelle **« Changer »** (et « Pourquoi
> changer ce plat ? », « À changer : … », « N plats à changer ») : « Remplacer mon plan par celui-ci » est un
> autre geste. Pas de rouge : les gris du bouton secondaire (bord `line-strong`, texte `ink-soft`). Les clés
> i18n et le code gardent le nom `replace`. La ligne se voit dépliable : pastille ronde et chevron qui tourne,
> toute la ligne est la cible. Titres de l'aperçu plus petits : jour 16 px gras (la serif de la charte ne
> descend pas sous 20 px), moment 12 px, plat 14 px ; le plan adopté garde ses tailles.
1. « Remplacer » ouvre une couche « Pourquoi ? » ; le texte est obligatoire (280 signes).
2. Le plat est barré avec sa raison, **sur toutes ses occurrences** (même titre, `dishTitleKey`).
   « Garder ce plat » annule. 24 occurrences au plus d'un coup.
3. **L'un ou l'autre** : dès qu'un plat est barré, « Adopter » (fronton et pied) et la zone de commentaire
   disparaissent ; « Ajuster le plan » remplace les plats barrés, et eux seuls.
4. `keel-read-note-v1` (mode `rejections`) retrouve les plats sur le brouillon rangé, **range la liste des
   plats refusés** (avec ceux qui les mangeaient), puis classe chaque raison comme une note (goûts, allergie
   dite, ce que Sophia sait). Les questions de précision s'ouvrent en couche, trois au plus.
5. Le générateur (`edit_cells` + `cells_from: "rejections"`) ne demande au modèle que les cases concernées
   (`cells_only`) et **fusionne par plat** (`mergeRejectionEdit`) : les autres plats de la case restent
   ceux de la base. Il **étend** aux plats qu'une exclusion neuve viderait (la garde elle-même :
   `judgeDishEaters`, `servedExclusionBites`) — sans quoi la garde retirerait la personne de ces plats sans
   rien lui reposer.
6. Si une raison a rangé une **allergie ou un régime**, c'est tout le plan qui est recomposé (une contrainte
   de santé vaut pour toute la semaine).
7. Chaque raison passe **la même garde que la note** (`readDraftNote` : plancher TCA, interdits de doctrine)
   avant d'être citée au modèle ; refusée, elle est tue et le plat est remplacé sans elle. Mesuré : « 800 kcal
   par jour » écrit comme raison partait tel quel au modèle avant ce correctif.
8. Quand les reprises sont épuisées, le pied le dit (« Plus de reprise… ») : sinon « Ajuster » et tous les
   « Remplacer » s'éteignaient sans explication.

### La liste des plats refusés
- `student_goals.practical_constraints.rejected_dishes` : `{key, title, name, household, member_ids,
  reason, at, draft_id}`, fusion atomique en SQL (`keel_append_rejected_dishes_for`, 200 au plus).
- Visible et effaçable dans « Ce que Sophia sait de toi » (`RejectedDishesCard`, `keel_remove_rejected_dish`).
- **Seuls le serveur et ces deux fonctions la changent** : le déclencheur `student_goals_keep_rejected_dishes`
  (migration `20260924150000`) remet la valeur de la ligne à toute écriture du navigateur. Sans lui,
  `mergePracticalConstraints` et « Défaire » réécrivaient la colonne depuis une copie de la page : un
  enregistrement de la grille « qui mange à la maison » juste après « Remplacer » effaçait les plats refusés.
- Lue à chaque composition : une ligne de consigne (`rejectedDishesLine`, prompt v42 / v34), et un compteur
  `generated_from.rejected_dishes` (`served_again` = retours à l'identique, un plancher).

## 4. Ce qui n'est pas fait / limites connues

- **Tir réel non fait** au moment de l'écriture : durée d'un remplacement sur une semaine entière inconnue
  (72–91 s mesurées sur un duo de 2 jours pour `edit_cells`).
- Chaque souvenir rangé depuis les raisons cite la note entière (toutes les raisons, une ligne par plat).
- Un plat refusé **renommé** par le modèle n'est pas reconnu par le code (aucun matcher) : seule la consigne
  l'empêche.
- Le texte de plan donné au modèle (`source_text`) peut dater d'avant une reprise ; la fusion par plat
  protège les plats gardés, pas le contexte du modèle.

## 5. Vérification

- `dish_replace_test.ts`, `rejected_dishes_test.ts`, `rejected_dishes_wiring_test.ts`,
  `served_final_test.ts` (`memberDayEnergy`), `draft_note_classify_test.ts` (contexte des plats barrés).
- `planWeekTable.int.test.ts`, `dishCardCompact.int.test.ts`, `rejectedDishesCard.int.test.ts`,
  `planDraftQuestion.int.test.ts`.
- Migration `20260924120000_un_plat_refuse_ne_revient_pas.sql` : blocs de preuve (fusion, plafond,
  relance exclue).
- Tests complémentaires du 2026-09-24 (demandés) :
  - fusion sur les **10 brouillons locaux réels** : 50 scénarios (nominal, plat oublié par le modèle, titre
    refusé rendu, mauvaise bouche, cibles seules), 975 plats gardés vérifiés à l'identique, 42 casseroles
    dédoublées ; le même banc sur une fusion cassée exprès rend 385 écarts ;
  - fonctions SQL dans une transaction annulée : droits (`anon`, `authenticated`, `service_role`), fusion,
    « tout le foyer », retrait limité à la personne connectée, plafond de 200 ;
  - parcours de l'aperçu dans un navigateur, réponses serveur simulées : 7 scénarios (barrer sur les 7 jours,
    Échap, raison vide refusée, « Garder ce plat », plafond de 24, trois questions au plus, recomposition si
    santé, refus qui garde les plats barrés puis relance, reprises épuisées, canal « commentaire » inchangé) ;
  - `rejected_dishes_prompt_test.ts` : la ligne dans les deux constructeurs (v42, v34), à sa place, et
    l'octet près sans elle ;
  - le compteur `keel.household_meal.rejected_dishes` vu dans de vraies compositions locales d'une autre
    session (liste vide, sans erreur).
- Contrôle à l'écran le 2026-09-24, sur un vrai brouillon local (7 jours, 3 personnes, 50 plats) avec
  des réponses serveur simulées : 375 px, 320 px et bureau, en français et en anglais. Il a trouvé deux
  défauts, corrigés : la couche de `Modal` reprenait le focus au champ de la raison ; « il/ils
  contenaient » selon le nombre de plats refaits en plus.
- `draft_note_belt_wiring_test.ts` : la règle « jamais le magasin seul » ne s'applique plus aux deux
  reprises qui suivent une note déjà rangée (`cells_from: "exclusions"` et `"rejections"`).
