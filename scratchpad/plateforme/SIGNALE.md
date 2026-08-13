# Signalé, pas réparé — le registre de l'orchestrateur

> Ce que ce chantier a trouvé sans avoir le droit de le corriger : c'est de la
> **logique**, du **produit**, de la **copie**, ou c'est **hors périmètre**.
> Chaque entrée dit *où*, *ce que c'est*, et *pourquoi je n'y touche pas*.
> Les familles ajoutent les leurs dans leurs rapports ; celles-ci sont les
> miennes, trouvées en intégrant.

---

## 1. ⛔ PRODUIT — la copie de `/coach` contredit le modèle du dépôt

**`CoachHomePage`, état vide, vu rendu :**
> « Nothing is generated on its own here. **You write the plan, you publish it,
> and your student's app starts following it.** »

`CLAUDE.md` ouvre sur l'inverse, en gras, comme la chose « la plus souvent
violée » :
> « Le coach ne produit RIEN de personnel pour un élève. Pas de plan […] Il écrit
> une **doctrine** et un **programme** pour toute sa cohorte ; c'est **l'élève**
> qui compose sa semaine à partir de ça. Il n'existe **aucun canal 1:1**. »

« You write the plan, you publish it » est la langue de la prescription
individuelle — le mode 1:1, qui existe encore dans le code (`plan_versions`,
`/coach/import`) mais **n'est pas le modèle**. Un coach qui lit ça sur son écran
d'accueil attend un éditeur de plan par élève.

**Pourquoi je n'y touche pas :** c'est de la **copie produit**, elle est traduite
dans les deux packs, et la changer demande de trancher ce que le coach *croit*
faire. Ça n'appartient pas à un lot visuel.

## 2. ⚠️ CHARTE — la vitrine viole son propre plancher de 20 px sur Young Serif

La charte §3 : « **Young Serif ne descend jamais sous 20 px.** En dessous, c'est
Public Sans. »

- `PublicHeader.tsx:182` — le nom de marque en `font-display text-lg` = **18 px**.
- `PublicHeader.tsx:370` — le nom, dans le pied, en `font-display text-sm` = **14 px**.

**Ce que j'en ai fait :** le shell de l'app **recopie les 18 px** plutôt que de
les corriger, et le commentaire dit pourquoi — un logotype n'est pas du texte
courant, et aligner l'app sur la vitrine vaut mieux que gagner 2 px sur la seule
couture que ce chantier existe pour effacer. **Le 14 px du pied, lui, est un
vrai défaut** : c'est la taille où les traits fins de Young Serif disparaissent.
Les huit pages publiques sont déclarées « déjà faites, ne pas rouvrir » → hors
périmètre, mais il survivra au chantier si personne ne le note.

## 3. ⚠️ ACCESSIBILITÉ — trois défauts qui ne sont pas des couleurs

1. **`Button size="md"` fait ~36 px de haut** — sous la cible tactile de 44 px.
   Le corriger déplace la mise en page de **seize écrans** : c'est un lot à lui.
   (La barre d'onglets du téléphone, elle, est à 49,5 px — mesuré, conforme.)
2. **Le paragraphe d'erreur de `Field` n'a pas de `role="alert"`** : il apparaît
   après un clic, donc il n'est **pas annoncé** aux lecteurs d'écran. Non ajouté
   volontairement : 77 sites d'appel, et plusieurs enveloppent déjà le champ dans
   une région annoncée — deux `alert` imbriqués lisent le message deux fois.
   C'est un audit, pas une classe.
3. **La bordure de `Button variant="danger"` (`red-200`) est à 1,37:1**, sous le
   3:1 de WCAG 1.4.11. Gardée **exprès** : la bordure n'est pas le seul indice —
   le libellé rouge est à 6,13:1, et c'est un état qui doit rester reconnaissable.
   À revoir si `danger` gagne un jour un usage sans libellé.

## 4. ⚠️ RELIQUATS hors des seize écrans — ils survivront au chantier

- **« Powered by IKIZEN »** dans `components/Footer.tsx:15` et
  `pages/ResetPassword.tsx:111`, tous deux en `text-slate-400`. Ce sont des
  écrans **rendus** (`/installer-app`, `/reset-password`), mais hors des seize.
  La bonne forme existe déjà : `pages/Auth.tsx` déclare l'entité légale **en un
  lien vers `/legal`**, depuis `lib/legalEntity.ts`.
- **`PublicHeader.tsx`** rend encore `gray-200` / `gray-900` dans son sélecteur
  de langue — sur les pages publiques « déjà faites ».

## 5. MORT — vérifié hors commentaires, non supprimé

- **`components/YinYangLoader.tsx`** (l'ancien logo) — **zéro importeur**.
  Suppression sûre, mais c'est un geste de purge, pas de style.
- **`keel/pages/ProgressPage.tsx`** (393 lignes) — **zéro importeur**, et
  `catalog.ts` / `en.ts` / `fr.ts` le disent déjà en quatre endroits tout en
  gardant **36 clés `progress.*` orphelines** pour lui. Ni stylé, ni supprimé :
  le supprimer touche `fr.ts`, où un autre chantier écrivait pendant le mien.
- **`.sophia-action-skin` / `.sophia-violet-surface` / `.sophia-mobile-type`** —
  131 lignes d'`index.css`. **Celles-là, je les ai supprimées** (phase 2) : elles
  étaient dans un fichier partagé dont je suis le seul écrivain, et vérifiées
  mortes des deux côtés.

## 6. TRADUCTION — l'état réel au 2026-08-13

- **`/app/plan` (2 030 lignes) et `/app/progress` (888) n'ont pas un seul `t()`.**
- **`/coach/weekly` et `/coach/import`** : leurs namespaces **sont** traduits,
  mais leur corps est rendu en anglais par une fonction edge — les déclarer
  rendrait une coquille française autour du seul texte qui compte.
- **Aucun agent de ce chantier n'a traduit quoi que ce soit**, et c'était la
  bonne consigne : le chantier de traduction a committé pendant le mien
  (« huit agents dans un `en.ts` se seraient écrasés »), et a fait passer `tsc`
  de 60 à 568 erreurs puis à zéro en une heure. Deux sessions dans `fr.ts` en
  parallèle, c'était le conflit garanti.

## 7. HORS PÉRIMÈTRE — le refactor d'autrui

**`keel/pages/mealPlan/StudentMealPlanPage.tsx`** (124 lignes) : `App.tsx:51-56`
le dit lui-même — réparation transitoire non committée d'un **autre chantier en
cours**, qui a supprimé les composants `mealPlan/` en `staged` sans retirer la
route. Route `/app/meals` vivante, et pourtant l'écran est une coque. **Ni stylé,
ni touché** : à eux de décider ce qui prend la place.

## 8. ⚠️ NOM INTERNE dans une copie élève

`/app/today` affiche **« KEEL discovery program »** en `h1`. « KEEL » est le nom
**interne** du pivot — le dépôt a déjà retiré cette fuite d'un `start.seo_title`
(« Try KEEL »), précisément parce qu'un nom interne dans un onglet de navigateur
ou un titre d'écran est vu par le client. Ici il vient probablement d'un nom de
programme en base, pas d'une chaîne codée en dur : à vérifier côté données.
De la copie, donc pas mon lot.

## 9. LOGIQUE — le motif du formulaire figé au montage

À confirmer par les familles A et D sur `SetupPage` et `HouseholdPage` : un
formulaire dont l'état est figé au montage **sans garde de chargement** affiche
du vide non lu, puis **l'écrase à l'enregistrement**. Signalé dans leurs briefs
avec consigne de ne pas réparer — c'est de la logique.
