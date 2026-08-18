# Chantier — Un plan par personne, et le geste relié à sa session

> **Mission.** Deux surfaces à construire, une à retirer. Toutes les trois
> portent le même constat: **ce dépôt calcule beaucoup plus qu'il n'affiche.**
> Chaque lot sort une donnée qui existe déjà, ou enlève une question qui ne
> repose sur rien.
>
> **Aucun lot n'appelle un modèle, n'ajoute une colonne, ni ne touche une
> migration.**

> ⚠️ **CE CHANTIER EST LA SUITE DE `PROMPT-RETRAIT-BLOCS-FOYER.md`**, qui est
> **déjà lancé** et retire trois blocs (fusion, « ce que tu cuisines »,
> « à table ») et affiche le geste du soir. Ne refais pas son travail. Si tu
> trouves ces blocs encore en place, c'est que l'autre agent n'a pas fini:
> **attends-le ou signale-le**, ne le double pas.

---

## 0. Règles opératoires — non négociables

1. **Branche `ff-001-quotidien-du-coach`.** Pas de `push`, pas de merge.
2. **`git add -A` est INTERDIT.** Plusieurs agents écrivent dans ce dépôt en ce
   moment, dont un sur les mêmes écrans. Chaque commit liste **explicitement**
   ses chemins, et tu vérifies avant de stager que le diff d'un fichier ne
   contient QUE ton travail (`git diff -- <chemin>`).
3. ⚠️ **`frontend/src/keel/i18n/en.ts` peut être TENU par une autre session**
   (3126 insertions non commitées au 2026-08-14). Le type `MessageKey` en
   dérive, donc toute clé neuve y passe. **Vérifie son état avant d'écrire**
   (`git status --porcelain -- frontend/src/keel/i18n/en.ts`). S'il est tenu:
   tu poses les clés sur le disque pour que ça compile, tu **ne les commites
   pas**, et tu le dis dans ton rapport.
4. **Typecheck** : `cd frontend && npx tsc -b` (`tsconfig.json` a `files: []`
   et ne vérifie **rien**). Tests : `npx vitest --config vitest.config.ts run`.
5. **Commandes à risque : jamais seul** (`db push`, `db reset`,
   `functions deploy`, `secrets`, `link`). Tu les écris dans ton rapport.
6. **Une décision bloquante se prend, elle ne s'attend pas.** Tranche,
   applique, documente: la décision, les options rejetées, pourquoi.

---

## 1. Retrait — le membre de référence

### Ce que ça donne à l'écran

> **ILi et Christèle ne mangent pas de la même façon — le plat commun ne peut
> suivre qu'une des deux.**
> Quand deux adultes suivent ici des méthodes différentes, le plat commun ne
> peut en suivre qu'une. Choisis laquelle. Ça change ce qu'on cuisine, jamais
> la quantité que chacun reçoit […]
> `[ ILi ▾ ]`  *Enregistré.*

Verdict du propriétaire, 2026-08-14 : *« Je comprends vraiment pas ce que ça
fait, pour moi c'est inutile, faut le supprimer. »*

Et le fond lui donne raison: on demande d'arbitrer entre deux méthodes en
annonçant que ça change « ce qu'on cuisine », **sans jamais montrer l'autre
version**. Personne ne peut choisir entre deux plans dont un seul existe.

### ⚠️ LA CARTE PART, LE MOTEUR RESTE — et il a déjà son repli

`households.reference_member_id` décide quelle **doctrine** gouverne le tronc
commun. Le moteur la lit (`generate-household-meal-v1:1719`,
`household_composition.ts::referenceMemberId`), et la résolution est **une
cascade déjà écrite**, documentée dans `api/household.ts` :

> `null` = retour au défaut, **le membre qui compose la session**.

Retirer l'écran laisse donc la colonne à `NULL`, et le moteur retombe sur le
composeur — le maître, qui est le cas courant et le bon défaut. **Rien ne
casse, et c'est ce qui rend ce retrait sûr.**

- ✅ **Retirer** : `frontend/src/keel/components/plan/ReferenceMemberCard.tsx`,
  son import et son montage dans `StudentWeekPlanPage.tsx:13`, et
  `setReferenceMember` dans `api/household.ts` s'il n'a plus d'appelant.
  L'audit d'appelants se fait **commentaires retirés** — un grep naïf compte
  des morts comme des vivants.
- ❌ **NE PAS TOUCHER** : la colonne, la RPC
  `keel_household_set_reference_member`, `referenceMemberId()` et la cascade.

**Preuve** : un foyer sans référent déclaré compose exactement comme avant
(test, pas raisonnement).

---

## 2. Ajout — un plan par personne, et une vue qui les met côte à côte

### Ce qui ne va pas

La grille « Ta semaine d'un coup d'œil » montre **un** plan: petit-déjeuner,
déjeuner, après-midi, dîner, sept jours. Dans un foyer de deux, elle ne dit
**pas qui mange quoi**.

> « Normalement il devrait y avoir autant de vues que de personnes dans le
> foyer. Là on sait pas qui mange quoi. Chacun doit savoir ce qu'il mange
> séparément, et il faut une vue qui combine tout — voir ce que chacun mange
> en parallèle. Une ligne par personne. Il doit y avoir la notion d'un plan
> chacun. »

### ✅ LA DONNÉE EXISTE DÉJÀ, POUR CHAQUE BOUCHE

L'en-tête de `frontend/src/keel/components/plan/MyShareCard.tsx` :

> *« Quand le maître crée le plan, ça crée automatiquement le plan pour le
> compte réclamé en prenant ses datas » — c'est déjà le cas, et depuis
> toujours. `member_portions` porte un objet PAR BOUCHE, calculé sur SES
> données (corps, objectif résolu, allergies, rythme). Il n'y avait rien à
> calculer: il n'y avait qu'un écran manquant. **Zéro appel modèle passe par
> cette carte, sur aucun chemin.***

`MyShareCard` rend déjà cette part — **seulement pour un titulaire qui regarde
la sienne**. Aucune vue ne met les bouches côte à côte, et une bouche sans
compte n'a aucun écran du tout.

### Le travail

> ⛔ **LIS LE §3 « CE QUE ÇA VEUT DIRE POUR LA VUE DU §2 » AVANT D'ÉCRIRE UNE
> LIGNE ICI.** Il porte le fait qui décide si cette vue a de la valeur ou si
> elle rendra deux lignes jumelles. Le découvrir après avoir dessiné coûte le
> dessin.

1. **La vue parallèle** — la grille gagne une ligne (ou un groupe de lignes)
   **par bouche**, lisant `member_portions`. Le plat commun reste le plat
   commun; ce qui change d'une ligne à l'autre est la part et ce qui la borne.
2. **La vue individuelle** — chacun lit SA semaine seule. Pour un titulaire,
   `MyShareCard` est le point de départ. Pour une bouche sans compte, c'est le
   maître qui la lit à sa place: la vue existe, l'accès non.
3. **Le défaut d'affichage se décide et se documente** : parallèle d'abord, ou
   individuel d'abord ? Tranche, et dis pourquoi.

### Les gardes — non négociables

- ⛔ **Aucun objectif, aucun poids, aucune calorie, aucun « pourquoi » de
  part.** `portion_note` est une INSTRUCTION DE SERVICE, garantie sans motif ni
  vocabulaire de corps par `sanitizePortionNote` côté serveur — c'est
  précisément ce qui permet de l'afficher devant toute la table.
  **L'instruction est publique, le motif qui la produit ne l'est pas.**
  ⚠️ Cette règle est écrite dans l'en-tête de `TableCard.tsx`, que le chantier
  voisin **supprime**. Recopie-la dans le nouveau composant: une règle dont le
  seul porteur disparaît est une règle qu'on redécouvrira par un incident.
- ⛔ **Un mineur n'a jamais d'objectif affiché.** Ceinture structurelle.
- **320 px.** Une grille à N lignes par jour est le pire cas de ce dépôt sur
  téléphone: elle se conçoit là, pas au bureau. `flex-1` ne rétrécit pas un
  élément (`min-width: auto`), et le screenshot du panneau ne repeint qu'à
  `scroll 0`.

### Le lien avec le chantier voisin

« À table » y est retirée parce qu'elle listait des parts loin du plat.
**Cette vue est ce qui la remplace** : les mêmes parts, dans la grille, à côté
du plat qu'elles servent. Dis-le dans ton rapport — ce n'est pas une perte,
c'est un déplacement.

---

## 3. Ajout — la préparation reliée à sa session

> « Pour chaque plat: la préparation + la session de cuisine reliée, à partir
> d'un tout petit bouton à côté du plat. »

Le chantier voisin (lot D) affiche déjà **la préparation du soir**
(`dish.method`, aujourd'hui masqué sur les plats `leftover` par
`DishCard.tsx:189`). Ce lot ajoute **le lien vers la session**.

### Le travail

- **Un petit bouton à côté de chaque plat**, qui ouvre les deux ensemble: le
  geste du soir, et **la session de cuisine dont ce plat tire son lot**.
- Le chemin existe entièrement dans la donnée, et n'est nulle part à l'écran:
  `dish.uses[].preparation_id` → la session qui contient cette préparation, via
  `cooking_sessions[].preparation_ids`.
- **Discret par défaut.** Le planning se lit d'un coup d'œil; il ne doit pas
  devenir une liste de recettes dépliées.

### ⛔ La préparation est attachée AU PLAT, jamais À LA PERSONNE

C'est la formulation exacte, et elle règle les deux cas d'un coup :

- **Même plat, deux personnes** ⇒ **UNE** préparation. On réchauffe une fois,
  on tranche une fois. Ce qui diffère est la **part** (`member_portions`), pas
  le geste. Écrire « réchauffe 10 min » deux fois avec deux quantités
  transformerait une cuisine en service à la carte — le contraire du produit,
  dont l'unité est la session de cuisson partagée.
- **Deux plats différents** ⇒ deux préparations, **mécaniquement**, parce qu'il
  y a deux plats. Ce n'est pas une individualisation: c'est un plat qui porte
  son geste, comme tous les autres.

### Et ce qui est COMMUN reste en amont

Si les deux plats tirent du même poulet, le poulet est une `preparation`
cuisinée dans une `cooking_session`, et chaque plat la nomme par
`uses[].preparation_id`. **C'est déjà la structure du moteur** — batch en
amont, assemblage au plat. Le bouton ne fait que rendre ce lien visible.

### ⚠️ CE QUE ÇA VEUT DIRE POUR LA VUE DU §2, ET IL FAUT LE SAVOIR AVANT

**Aujourd'hui, deux bouches sans profil réclamé mangent LE MÊME PLAT.** La
divergence est dans la PART, pas dans le plat. Un plat dédié n'existe que par
l'échelle de fusion (`household_merge.ts::mergeLadder`, formes `one_session` et
`separate_sessions`, `asksForASecondDish`) — et la fusion exige un titulaire
qui avait pris la main.

Donc dans le cas courant, les deux lignes de la vue parallèle porteront **le
même intitulé de plat**, et ne différeront que par la `portion_note`.

➡️ **La valeur de cette vue dépend entièrement de ce que
`household_portions.ts` produit.** Si les notes sont génériques, les deux
lignes seront visuellement identiques et la vue paraîtra inutile — alors même
qu'elle est correcte. Le chantier voisin mesure exactement ça (`PROMPT-RETRAIT-
BLOCS-FOYER.md` §3.1). **Lis son rapport avant de dessiner cette vue**, et si
les notes sont vides, dis-le au lieu de livrer deux lignes jumelles.

### Garde

**Aucune durée inventée.** Si le modèle ne dit pas combien de temps, l'écran ne
l'estime pas. `active_minutes` existe sur les PRÉPARATIONS, pas sur les plats:
le reprendre pour un plat donnerait à un assemblage le temps d'une cuisson.

---

## 4. Les preuves à produire

1. **Foyer de 2 bouches** : capture de la vue parallèle, une ligne par
   personne, à **320 px et 1280 px**, dans les deux langues.
2. **La vue individuelle** d'une bouche sans compte, lue par le maître.
3. **Une capture où l'on voit qu'aucun objectif, poids ou calorie** n'apparaît
   sur ces vues — c'est la garde, elle se montre.
4. **Le petit bouton** ouvert sur un plat `leftover`: le geste du soir ET la
   session reliée, avec le `preparation_id` qui a fait le lien.
5. **Foyer sans référent déclaré** : la composition est inchangée après le
   retrait (sortie de test).
6. `npx tsc -b` exit 0 · `npx vitest run` vert · suite Deno verte.
7. **L'audit d'appelants**, commentaires retirés, pour chaque symbole supprimé.

---

## 5. Hors périmètre — exprès

- ❌ Tout ce que couvre `PROMPT-RETRAIT-BLOCS-FOYER.md` (fusion, « ce que tu
  cuisines », « à table », l'affichage de `dish.method`).
- ❌ `household_portions.ts` — le chantier voisin en fait le constat, et la
  décision appartient à l'humain.
- ❌ Le moteur de référence (colonne, RPC, cascade).
- ❌ Toute migration, toute fonction edge, tout déploiement.

---

## 6. Le rapport

`scratchpad/PLAN-PAR-PERSONNE-RAPPORT.md` : ce qui est livré avec sa preuve,
les décisions du §2.3 avec leurs options rejetées, les clés i18n laissées non
commitées si `en.ts` était tenu, et ce que tu n'as pas pu vérifier.

**Un échec ne se masque pas.**
