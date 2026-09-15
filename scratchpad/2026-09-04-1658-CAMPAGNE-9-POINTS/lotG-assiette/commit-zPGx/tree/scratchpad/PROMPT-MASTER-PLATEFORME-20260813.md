# MASTER — La plateforme passe à la charte : de l'inscription au réglage du compte

> **Mission en une phrase.** La vitrine est refaite et porte la charte « la fiche ».
> **L'app ne la porte pas** : seize écrans, ~18 000 lignes, encore en `gray-*`,
> avec des reliquats du produit grand public supprimé. Ce chantier fait passer
> **tout le produit connecté** à la charte — le parcours d'entrée, les écrans
> foyer, la conversation, l'espace du pro, et les réglages du compte — sans
> toucher à ce que la couleur veut **dire**.

Tu es l'agent **orchestrateur**. Tu ne réécris pas les seize écrans toi-même : tu
lances des sous-agents, tu intègres, tu fais tourner les reviews, tu produis le
rapport. Ce document est ta seule autorité.

---

## 0. Règles opératoires — non négociables

1. **Branche `ff-001-quotidien-du-coach`**, aucune autre. Pas de push, pas de merge.
2. **`git add -A` interdit.** D'autres sessions écrivent dans ce dépôt en même
   temps. Chaque commit liste explicitement ses chemins. Un commit par phase.
3. **Commandes à risque : jamais seul** (`supabase db push/reset`,
   `functions deploy`, `secrets`, `link`). Ce chantier est frontend. Si un besoin
   apparaît, c'est le signal que tu sors du périmètre — arrête-toi et demande.
4. **Vérification** : `npx tsc -b` (c'est `tsconfig.app.json` qui vérifie ;
   `tsconfig.json` est un solution file qui ne vérifie **rien**) et
   `npx vitest --config vitest.config.ts run`. Le hook de commit typecheck tout
   le frontend : si le rouge vient d'un fichier d'une autre session, **ne le
   répare pas** — consigne-le, commite tes chemins.
5. **⭐ LANCE LES AGENTS EN PARALLÈLE — ET ÇA VEUT DIRE QUELQUE CHOSE DE PRÉCIS.**
   Une phase marquée « parallèle » n'est pas une intention : **tu envoies tous
   les appels `Agent` de cette phase dans UN SEUL message**, plusieurs appels
   d'outil côte à côte. Un appel par message les met en **série**, et sept
   familles d'écrans en série, c'est sept fois le temps pour le même résultat.
   **Ce qui reste en SÉRIE, et il faut le respecter :** le kit (phase 1) avant le
   shell (phase 2) avant les écrans (phase 3). Ces trois-là ont une vraie
   dépendance — une page retouchée avant le kit sera retouchée deux fois.
   **À l'intérieur de la phase 3, les sept familles sont indépendantes** : elles
   écrivent seize fichiers distincts et aucun fichier partagé. Elles partent
   ensemble.
   Pendant qu'ils tournent : tu ne restes pas inactif et tu ne refais pas leur
   travail. Tu parcours les écrans déjà livrés, tu prépares la review.
6. **Collisions.** Les constructeurs n'écrivent **jamais** dans un fichier
   partagé (`ui/*`, `KeelAppShell.tsx`, `en.ts`, `fr.ts`, `App.tsx`,
   `tokens.css`). **Toi seul** touches aux fichiers partagés, en série, entre
   les phases.
7. **Navigateur** : `preview_start` (`.claude/launch.json` existe, plusieurs ports).
   Le panneau **ne repeint qu'à scroll 0** — pour juger un bas d'écran, décale le
   contenu ou mesure en JavaScript, ne scrolle pas. Teste à **320 px et 1280 px**.
   ⚠️ Le profil navigateur est **partagé avec d'autres sessions** : ne vide pas
   `localStorage`, ne déconnecte personne, ne ferme pas les onglets des autres.
8. **Une décision bloquante se prend, elle ne s'attend pas.** Tranche, applique,
   documente (décision, options rejetées, pourquoi).

---

## 1. L'état mesuré — 2026-08-13

### 1.1 Les seize écrans

| Surface | Fichier | Lignes |
|---|---|---|
| **Parcours d'entrée** | `keel/pages/SetupPage.tsx` | 1 709 |
| Aujourd'hui | `keel/pages/TodayPage.tsx` | 1 421 |
| **La conversation** | `keel/pages/ChatPage.tsx` | 871 |
| La semaine | `keel/pages/StudentWeekPlanPage.tsx` | 1 963 |
| Les progrès | `keel/pages/StudentProgressPage.tsx` | 812 |
| La santé | `keel/pages/StudentHealthPage.tsx` | 425 |
| **Le foyer** | `keel/pages/HouseholdPage.tsx` | 1 862 |
| Accueil pro | `keel/pages/CoachHomePage.tsx` | 778 |
| **La doctrine** | `keel/pages/CoachDoctrinePage.tsx` | 1 837 |
| Le lundi | `keel/pages/CoachWeeklyPage.tsx` | 313 |
| Le protocole | `keel/pages/CoachProtocolPage.tsx` | 1 699 |
| Les repas | `keel/pages/CoachMealsPage.tsx` | 506 |
| Un client | `keel/pages/CoachStudentPage.tsx` | 611 |
| La facturation | `keel/pages/CoachBillingPage.tsx` | 541 |
| Les gabarits | `keel/pages/TemplatesPage.tsx` | 1 005 |
| L'import | `keel/pages/PlanImportPage.tsx` | 1 436 |
| **Le compte** | `pages/Account.tsx` (38) + `pages/UpgradePlan.tsx` (548) | 586 |

### 1.2 Le levier — le kit, pas les pages

`keel/components/ui/` : `Badge` · `Button` · `Card` · `Field` · `Marketing` ·
`Modal` · `Page` · `SetupSection`. **Huit primitives gouvernent seize écrans.**

Le chrome : **`keel/components/KeelAppShell.tsx`**, le seul shell.

> **C'est l'ordre du chantier, et il n'est pas négociable : le kit d'abord, le
> shell ensuite, les pages en dernier.** Une page retouchée avant le kit sera
> retouchée deux fois, et les seconds passages se contredisent. Après le kit,
> la plupart des pages ne demanderont qu'un balayage de classes locales.

### 1.3 Ce qui est DÉJÀ à la charte, et qu'on ne refait pas

`frontend/src/tokens.css` est **posé et importé** ; les deux polices sont
servies localement ; `bg-paper text-ink` est appliqué au corps. Les huit pages
publiques, `/auth` et `/start` sont faits. **Ne les rouvre pas.**

---

## 2. ⛔ CE QUE LA CHARTE AUTORISE ET INTERDIT DANS L'APP

**Lis [`docs/keel/CHARTE-VITRINE.md`](../docs/keel/CHARTE-VITRINE.md) en entier
avant tout.** C'est la charte **telle que construite** — quand elle contredit
`scratchpad/site/design/CHARTE.md`, c'est elle qui a raison.

Son §8 dit : *« l'app authentifiée est hors périmètre — elle y entrera par un
chantier à elle, et le premier arbitrage y sera que la couleur saturée appartient
au sens »*. **Ce chantier EST celui-là.** Voici l'arbitrage, il est rendu :

### La règle de couleur de l'app

> **La teinte de marque marque la NAVIGATION et l'ACTION.
> Les couleurs d'état marquent les FAITS.
> Elles ne se croisent jamais.**

Concrètement :

| Ce qui passe à la figue | Ce qui n'y touche **JAMAIS** |
|---|---|
| Les liens et le lien actif du shell | Une pastille `Badge` — **quelle qu'elle soit** |
| L'anneau de focus (`fig-600`) | Un état : ok, attention, échec, info |
| **Une** action principale par écran | Un chiffre, une mesure, un verdict |
| Les traits de figure (`--ill-fig`) | Une bordure de champ en erreur (rouge) |
| L'équerre, là où elle a un mot à sa droite | Un graphique de progression |

**Les quatre familles d'état ne bougent pas d'un pixel** : émeraude = ok, ambre =
attention, rouge = échec, **bleu = info** (`info` occupe le bleu dans
`ui/Badge.tsx` — quatre familles, pas trois). Elles vivent dans `Badge.tsx` et
elles y restent.

**La garde qui rend tout ça vérifiable, et qui est une forme, pas une couleur :**
un état est **toujours une pastille**, et **la figue n'entre jamais dans une
pastille**. Si tu ne sais pas trancher un cas, applique cette règle-là.

### Les neutres, eux, passent partout

C'est **l'essentiel du changement visuel** et c'est sans risque :
`gray-50` → `paper` · `gray-100/200` → `line` · `gray-300` → `line-strong`
(pour une bordure de **contrôle**) · `gray-500/600` → `ink-soft` ·
`gray-900` → `ink`.

⚠️ **`line` est à 1,30:1 : décoratif seulement.** Il ne borde jamais un champ,
une case ni un bouton — WCAG 1.4.11 exige 3:1 pour un composant d'interface.
Pour ça, `line-strong`.

### Typographie dans l'app

Young Serif **uniquement** en display, jamais sous 20 px, une seule graisse (pas
de `font-bold` : le navigateur simulerait). Public Sans partout ailleurs.

⚠️ **L'APP EST BILINGUE, ET LE CHANTIER DE TRADUCTION EST EN COURS PENDANT LE
TIEN.** Relevé dans `catalog.ts` au 2026-08-13 : le couloir d'entrée est traduit,
ainsi que **cinq des sept** écrans élève et **sept des neuf** écrans coach.
Restent en anglais `/app/plan` et `/app/progress` (1 963 et 812 lignes sans un
seul `t()`), plus `/coach/weekly` et `/coach/import` — ces deux-là pour une
raison différente : leurs namespaces **sont** traduits, mais leur corps est écrit
en anglais par une fonction edge, donc les déclarer rendrait une coquille
française autour du seul texte qui compte.

**Ce que ça t'impose :** ton lot est visuel. Tu ne traduis rien, tu ne déclares
aucun namespace, tu **signales**. Et une chaîne en dur que tu croises dans un
écran déjà traduit est un **défaut** — signale-la aussi. Voir §5 des pièges.

---

## 3. Les phases

```
Phase 0      Phase 1        Phase 2         Phase 3        Phase 4
AUDIT   →    LE KIT    →    LE SHELL   →    LES ÉCRANS →   REVIEWS
(toi)        (1 agent)      (toi)           (parallèle)    + PREUVES
             + ton          + parcours
             intégration                    + ton intégration
```

### Phase 0 — L'audit (toi)

Produis `scratchpad/plateforme/AUDIT-APP.md` :

1. **Le comptage des classes mortes.** Par écran : combien de `gray-*`, combien
   de couleurs saturées **hors** `Badge`, combien de `rounded-*` divergents.
   C'est la baseline que la refonte doit écraser, et c'est ce qui dira à chaque
   agent l'ampleur de son écran.
2. **Les couleurs saturées employées EN DÉCOR** — c'est-à-dire les vraies fautes.
   Une a déjà été trouvée et retirée sur `/gyms` : une fausse photo d'assiette
   peinte en `emerald-300` / `amber-200`. Cherche les autres : ce sont des états
   qui ne disent rien, et elles rendent les vrais états illisibles.
3. **Les reliquats du produit grand public supprimé** : violet `#7c3aed` et sa
   famille, l'ancien logo yin-yang, « POWERED BY IKIZEN », tout `indigo-*`.
4. **L'inventaire des primitives locales** — chaque page qui a redéfini son
   propre bouton, sa propre carte, son propre champ au lieu d'utiliser le kit.
   Chacune est une divergence à supprimer, pas à re-styler.

### Phase 1 — Le kit (1 agent, puis toi)

**Brief** — à copier dans son prompt :

> **Invoque le skill `frontend-design:frontend-design` avant d'écrire.**
>
> Tu fais passer les huit primitives de `frontend/src/keel/components/ui/` à la
> charte : `Badge` · `Button` · `Card` · `Field` · `Marketing` · `Modal` ·
> `Page` · `SetupSection`. Lis `docs/keel/CHARTE-VITRINE.md` en entier, et le §2
> du master ci-dessus.
>
> **C'est le fichier le plus dangereux du chantier** : huit primitives rendues
> par seize écrans. Une régression ici est une régression partout, et elle ne se
> voit pas sur l'écran que tu regardes.
>
> ⛔ **`Badge.tsx` ne change pas de couleurs.** Il porte les quatre familles
> d'état, et elles sont le VOCABULAIRE du produit. Tu peux en ajuster le rayon,
> la graisse, l'espacement — **jamais les teintes**.
>
> ⛔ **`Button.tsx` : `variant="brand"` existe et reste réservée aux huit pages
> publiques.** Ne l'étends pas à l'app. `primary` est ce que l'app rend : décide
> ce qu'elle devient, en respectant la règle du §2.
>
> ⚠️ **`Field.tsx` porte un défaut mesuré** : son `inputClass` était en `text-sm`,
> ce qui contourne la règle des 16 px sous `lg` — Safari iOS zoome alors au focus
> et **ne dézoome pas**. Corrige-le à la source ici.
> ⚠️ Et `flex-1` ne rétrécit pas un champ (`min-width: auto`) : teste à 320 px.
>
> Livre aussi une **planche de comparaison** (HTML statique dans le scratchpad,
> pas dans l'app) montrant chaque primitive dans tous ses états, avant/après.
> C'est ce que l'orchestrateur jugera.

**Toi, à la réception** : intègre, puis **parcours les seize écrans au navigateur
sans en modifier aucun**. Le kit seul doit déjà transformer la majorité. Note ce
qui reste laid : c'est la liste de travail de la phase 3.

### Phase 2 — Le shell et le parcours (toi)

`KeelAppShell.tsx` — la nav, le lien actif, la barre d'onglets élève.

⚠️ **Hérite des mesures mobiles existantes, ne les refais pas** : le shell a deux
états coupés à `lg`, une barre d'onglets côté élève, et une réserve de padding
pour elle. Ces valeurs ont été mesurées ; lis les commentaires avant de toucher.

**Et corrige le trou du parcours d'entrée, qui est un vrai défaut produit :**
`/app/setup` **n'est jamais atteint** après une inscription. L'état `joined` de
`StartPage` navigue en dur vers `/app/chat`, `emailRedirectTo` aussi, et aucune
garde de route ne rejoue `resolveHomePath` — qui sait pourtant router un compte
sans objectifs vers le parcours d'entrée (`api/postLogin.ts`). Un inscrit ne voit
donc le parcours qu'à une visite ultérieure de `/` ou à une reconnexion.
Le correctif est court, mais **c'est de la logique** : vérifie-le au navigateur,
sur un compte neuf, de bout en bout.

### Phase 3 — Les écrans + ton intégration

> ⭐ **LES SEPT FAMILLES PARTENT DANS UN SEUL MESSAGE.** Sept appels `Agent`
> côte à côte. Elles sont indépendantes par construction: seize fichiers
> distincts, aucun fichier partagé — c'est précisément pourquoi le kit et le
> shell passent AVANT.

Lance les agents par **famille**, jamais un par fichier — les écrans d'une même
famille partagent des composants locaux.

| Agent | Écrans | Note |
|---|---|---|
| **A — Le parcours d'entrée** | `SetupPage` | 1 709 lignes, c'est la première impression du produit |
| **B — Le quotidien** | `TodayPage` · `ChatPage` | ⚠️ La conversation est la surface la plus vue du produit |
| **C — La semaine et le suivi** | `StudentWeekPlanPage` · `StudentProgressPage` · `StudentHealthPage` | ⚠️ Beaucoup de chiffres et d'états : la règle du §2 mord ici |
| **D — Le foyer** | `HouseholdPage` | 1 862 lignes ; c'est l'écran du produit B2C |
| **E — L'espace pro** | `CoachHomePage` · `CoachWeeklyPage` · `CoachStudentPage` · `CoachBillingPage` | |
| **F — La méthode** | `CoachDoctrinePage` · `CoachProtocolPage` · `CoachMealsPage` · `TemplatesPage` · `PlanImportPage` | La plus grosse famille |
| **G — Le compte** | `pages/Account.tsx` · `pages/UpgradePlan.tsx` | ⚠️ Reliquats du produit supprimé |

**Le socle commun des sept** — à copier dans chaque prompt :

> **Invoque le skill `frontend-design:frontend-design` avant d'écrire.**
>
> Tes lectures : `docs/keel/CHARTE-VITRINE.md` (la charte telle que construite),
> le §2 du master (la règle de couleur de l'app), et
> `scratchpad/plateforme/AUDIT-APP.md` (ce qui a été compté sur tes écrans).
>
> **Le kit est déjà passé à la charte.** Ton travail n'est donc PAS de re-styler
> chaque bouton : c'est de retirer les classes locales qui contredisent le kit,
> de remplacer les primitives locales par celles du kit, et de reprendre la mise
> en page là où elle ne tient pas.
>
> **Ce que tu ne fais pas :**
> - ⚠️ **L'APP EST BILINGUE DEPUIS LE 2026-08-13** — français **et** anglais.
>   Ce n'est plus « anglais par choix » : un autre chantier a étendu la
>   traduction à tout le produit connecté (`PublicMessages` est devenu
>   `TranslatedMessages`, les packs sont `en.ts` et `fr.ts`).
>   **Conséquence pour toi :** toute chaîne que tu ajoutes ou modifies existe
>   **dans les deux packs**, avec les mêmes trous d'interpolation. Une chaîne
>   en dur dans un écran est désormais un défaut, plus une convention.
>   Tu ne touches pas à `catalog.ts` — c'est l'orchestrateur qui intègre.
>   ⚠️ Et tu ne PROFITES pas de ce chantier pour traduire ce qui ne l'est pas
>   encore : ton lot est visuel. Si tu croises une chaîne non traduite,
>   **signale-la**, ne la traduis pas — deux sessions qui écrivent dans `fr.ts`
>   en parallèle, c'est le conflit assuré.
> - ⛔ **Aucun changement de logique** : ni requête, ni garde, ni route, ni appel
>   d'API. Si un écran a un défaut fonctionnel, **signale-le, ne le répare pas** —
>   sauf si l'orchestrateur te l'a demandé explicitement.
> - ⛔ **Ne touche à aucun fichier de `ui/`**, ni au shell, ni à `tokens.css`,
>   ni à `App.tsx`. Six autres agents travaillent en parallèle.
> - ⛔ **Ne change pas les couleurs d'état.** Voir §2 du master.
>
> **Mobile d'abord** : compose à 320 px, élargis ensuite. Un seul `h1` par écran,
> focus visible, `aria-label` sur les contrôles sans texte.
>
> **Vérifie au navigateur, sur un écran RENDU** — pas en relisant ton TSX. Les
> défauts de ce chantier sont des défauts de mise en page : ils ne se voient
> qu'au rendu, aux deux largeurs.
>
> Livre : tes fichiers, et `scratchpad/plateforme/<famille>/RAPPORT.md` — ce que
> tu as retiré, ce que tu as remplacé par le kit, ce qui restait laid et que tu
> n'as pas pu régler sans toucher à la logique.

### Phase 4 — Reviews et preuves (toi)

Trois lentilles, par des agents frais qui n'ont **pas** construit ce qu'ils jugent.

1. **La cohérence** (1 agent) — les seize écrans côte à côte, aux deux largeurs.
   Est-ce **un** produit ? Palette, rayons, espacements, densité. Et le passage
   vitrine → app : le visiteur qui s'inscrit reconnaît-il l'endroit ?
2. **La règle de couleur** (1 agent, le plus important) — parcourir chaque
   couleur saturée rendue et répondre : est-ce un **état** ou de la **décoration** ?
   Toute saturée qui n'est pas un état est un bloqueur. Vérifier aussi qu'aucune
   figue n'est entrée dans une pastille.
3. **L'accessibilité** (1 agent) — contrastes **réels des écrans rendus** (pas de
   la charte), ordre des titres, `alt` des figures, navigation clavier du shell,
   et la taille de texte des champs sous `lg` (les 16 px).

Puis : `tsc` + vitest verts, parcours navigateur des seize écrans × 2 largeurs,
commit final et `scratchpad/plateforme/RAPPORT-FINAL.md` avec l'avant/après
mesuré et les décisions prises seul.

---

## 4. Hors périmètre — exprès

- ❌ Les huit pages publiques, `/auth`, `/start` : **déjà faits**, ne pas rouvrir.
- ❌ `/legal` : c'est une crédential, elle a ses propres contraintes.
- ❌ Le mode sombre.
- ❌ Toute traduction : l'app reste anglaise.
- ❌ Toute promesse produit nouvelle : ce chantier change la **forme**.
- ❌ Photos stock, fonts CDN, scripts externes : tout est bundlé, tout est SVG.

---

## 5. Les pièges du dépôt qui vont mordre ici

1. **L'app est devenue BILINGUE le 2026-08-13, et le dépôt le dit encore à
   l'envers par endroits.** Pendant des mois, `catalog.ts` déclarait une
   frontière — la vitrine parle deux langues, l'app est anglaise par choix — et
   des commentaires partout dans le code la répètent. **C'est périmé** :
   `TRANSLATED_NAMESPACES` couvre désormais le produit connecté, et le pack
   français est `fr.ts`.
   Deux conséquences : un agent qui lit un vieux commentaire va croire qu'il ne
   doit pas traduire, et un agent zélé va traduire ce qu'un autre chantier est
   en train d'écrire. **La règle est : ton lot est visuel, tu ne traduis rien,
   tu signales.** Et si tu croises un commentaire qui affirme encore que l'app
   est anglaise, **réécris-le** — une contrainte documentée survit à sa cause,
   et le dépôt a déjà payé ça deux fois (la teinte de marque, le mot « client »).
2. **Un formulaire figé au montage sans garde de chargement** affiche du vide non
   lu, puis l'écrase à l'enregistrement. `SetupPage` et `HouseholdPage` sont les
   candidats. Si tu vois ce motif, **signale-le** — c'est de la logique.
3. **`create or replace view` perd `security_invoker`** — sans rapport avec le
   style, mais si un agent dérive vers du SQL, arrête-le : ce chantier est
   frontend.
4. **Le runtime edge sert des `_shared` périmés** : un fichier modifié n'est pas
   rechargé. Sans objet ici, sauf si quelqu'un lance un run réel.
5. **`git stash` sur ce dépôt emporte les fichiers des autres sessions.** Ne
   l'utilise jamais. Pour comparer, `git show HEAD~1:<chemin>`.

---

## 6. La barre de qualité — ce que « fini » veut dire

1. **Zéro `gray-*` restant** dans les seize écrans et le kit.
2. **Zéro couleur saturée en décor.** Chaque saturée rendue est un état, et
   chaque état est une pastille.
3. **Zéro reliquat** du produit grand public : violet, indigo, ancien logo,
   « POWERED BY IKIZEN ».
4. **320 px et 1280 px propres** sur les seize écrans, shell compris.
5. **Les champs à 16 px sous `lg`** — vérifié au calcul, pas à l'œil.
6. **Un compte neuf voit le parcours d'entrée**, vérifié de bout en bout.
7. tsc + vitest verts, un commit par phase, rapport final complet.
