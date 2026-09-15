# `/gyms` — rapport de la refonte « par la douleur » du 2026-08-13

> Constructeur 5. Page `frontend/src/keel/pages/GymsLandingPage.tsx`, namespace
> `gyms`, brouillons `frontend/src/keel/i18n/drafts/gyms.{en,fr}.ts`.
> **Rien n'est commité.**

---

## 0. Le fait qui gouverne tout le reste : l'acheteur a changé

La page vendait à **une salle qui coache**. Son héros disait *« you coach three
hours a week, they eat twenty-one meals without you »*, et sa section `Fit`
disait *« it only works if the method is YOURS »*. Les deux supposaient que la
salle a une méthode et l'enseigne.

La grille tranche l'inverse, et c'est le **titre** de sa section : *« Salles —
PAS un coach. Une salle indépendante. Elle vend une salle, pas une méthode — et
ses clients n'ont, pour la plupart, aucun coach. »* Le mécanisme
« accompagner un client de salle après ses trois heures » a d'ailleurs été
**retiré du plan** pour cette raison exacte (grille, dernière section).

Conséquences appliquées :

- **Le héros est tombé.** Il parle maintenant de ce que le **client** fait — il
  s'entraîne, il mange — jamais de ce que la salle coache.
- **`Fit` n'a pas été réécrite, elle a été RETOURNÉE** en `House` (bande 3) :
  la salle n'a pas de méthode à prêter, elle **délègue**.
- **Vocabulaire : des clients**, jamais des élèves. Vérifié : zéro occurrence de
  « élève » / « student » dans les deux packs. Zéro « votre équipe » /
  « your team ». Zéro « suivi personnalisé ».
- L'en-tête de commentaire de `GymsLandingPage.tsx` **ouvre désormais sur ce
  recadrage, en majuscules**, pour que le prochain lecteur ne « répare » pas la
  page en y remettant un coach.

---

## 1. Le poids — avant / après

| | avant | après | delta |
|---|---|---|---|
| clés du namespace | 110 | **76** | −31 % |
| **mots rendus (EN)** | **1 609** | **1 002** | **−38 %** |
| mots rendus (FR) | — | 1 120 | — |
| sections | 8 | **4** | −50 % |
| figures | 5 | **4** | −1 |
| lignes du `.tsx` | 492 | 527 | +35 (commentaires d'ancrage) |

Décomposition des 1 002 mots anglais :

| poste | mots |
|---|---|
| copie **visible** de la page | **785** |
| `<title>`/`<desc>` des 4 figures (lecteur d'écran, invisible) | 155 |
| `seo_title` + `seo_description` (hors page) | 62 |

Parité vérifiée par script : **76 clés EN, 76 clés FR, 76 utilisées par la page,
zéro orpheline, zéro doublon.**

---

## 2. La forme livrée — quatre bandes

```
BANDE 1  Pain    (bg-paper)    douleur 01 — ils s'entraînent, ils mangent au hasard
                               ├─ hero + FigWeek
                               ├─ « tenu chaque jour »   (ancienne section Daily, repliée)
                               ├─ « vous le vendez »     (ancienne section Money, repliée) + FigMoney
                               └─ la réserve B31, verbatim
BANDE 2  Monday  (bg-paper-2)  douleur 02 — je les perds sans les voir partir + FigMonday
BANDE 3  House   (bg-fig-950)  douleur 03 — je n'ai pas de méthode à prêter + FigHouse  ← LE BLOC SOMBRE
BANDE 4  Offer   (bg-paper)    le prix ET la clôture, fusionnés. CTA /auth?role=coach
```

Un seul `<h1>`, cinq `<h2>`, aucun saut de niveau. Le CTA apparaît **deux fois**,
même cible, même libellé, sans offre concurrente à côté.

**Le bloc sombre est dépensé sur la bande 3** et pas ailleurs : c'est le seul
argument neuf de la page, et sa figure est un **concept** — une maquette de
produit n'a jamais le droit d'être sur du sombre (CHARTE §5), un concept si.

---

## 3. Ce que j'ai coupé, section par section

| section morte | pourquoi |
|---|---|
| **`Fit`** (« It only works if the method is yours ») | **Inversée par la grille.** Une salle n'a pas de méthode à prêter. La section ne pouvait pas être réécrite, elle devait devenir son contraire : c'est `House`. Sa seule ligne à sauver, B20 (« un compte, une méthode »), est reprise dans `House` en `gyms.house.one_*` — et elle y sert encore mieux, puisque c'est **la signature** qui est unique. |
| **`Lock`** (le double verrou) + **`FigTrace`** | La grille **ne l'a pas donnée à `/gyms`** : elle appartient à `/coaches` (douleur 03) et au hall `/pro` (ligne 03). Et une salle qui délègue à la doctrine de la maison **n'a aucune ligne rouge à elle** — la section aurait contredit la bande 3 à deux écrans d'intervalle. Remplacée par une **réserve d'une ligne** dans `gyms.house.reserve`, comme le prompt l'autorise. |
| **`Daily`** comme section | Repliée dans la bande 1. « Il est réveillé à neuf heures un mardi soir » n'est pas un argument séparé : c'est ce que « tenu chaque jour » **veut dire**. Le titre est gardé mot pour mot, en `h2` de sous-bloc. |
| **`Money`** comme section | Repliée dans la bande 1. Le revenu n'est pas une douleur ; c'est ce qui rend la réponse à la douleur 01 **achetable**. Le prix comme **offre** vit en bande 4. |
| **`FigThread`** (le fil du soir, 14 clés) | Deux raisons. (1) La bande 1 se retrouvait avec **trois** figures. (2) Le tap du soir posé sur une page de vente **ressemble à du suivi** — c'est précisément le reproche que la grille fait à `/pro` (« deux fonctionnalités écartées du hall… le tap du soir »), et sur une page dont l'interdit permanent est « suivi personnalisé », le risque n'était pas payant. Avec elle sont parties les qualifications B22/B23/B24 qu'elle obligeait à écrire. |
| **`gyms.hero.note`** (« il n'y a rien à connecter ») | **S4.** « Rien à installer / rien à connecter », sous quelque forme que ce soit, ne revient pas. Trois brouillons ont déjà buté là-dessus. |
| **`Closing`** comme section | Fusionnée dans la bande 4, réduite à une seule ligne d'affichage (`gyms.close.line`) sous un filet, après le CTA. |

---

## 4. Mes claims, et leur identifiant d'audit

Chaque claim porte son ancre **en commentaire JSX** dans la page.

| bande | claim | id | ancre |
|---|---|---|---|
| 1 | 21 repas / 3 séances | — | arithmétique du monde (3 × 7), **aucun chiffre du dépôt engagé** ; dit dans le commentaire |
| 1 | essai 14 jours / 3 clients | **B5** | `20260727235000_keel_billing_seats.sql:110-136` |
| 1 | la méthode répond dans le chat, la semaine et chaque repas | **B10** | `run.ts:1441,2503` · `generate-week-plan-v1:338,541` · `generate-meal-v1:576,1038` · `generate-household-meal-v1:1602,2249` — **trois des quatre points nommés**, jamais « chaque message » (B7/B8) |
| 1 | 7 €/client, le siège est le seul poste | **B1** | `stripe-create-checkout-session:120-125` |
| 1 | on cesse de payer au siège éteint | **B4** | `stripe-reconcile-seats:18-35` (recalcul depuis le registre, jamais un incrément) |
| 1 | 37 × 25 € − 259 € = 666 €/mois, **étiqueté « exemple »** | **B30** | arithmétique juste, arrondi vers le bas ; l'étiquette est dans le libellé de la figure ET dans la légende |
| 1 | « nous n'avons pas de chiffre de rétention à vous vendre, et nous n'allons pas en inventer un » | **B31** | **VERBATIM, EN et FR.** Rien dans le dépôt ne mesure le churn contre un témoin |
| 2 | page hebdo calculée, rendue par gabarit, **jamais narrée par un modèle** | **B11** | cron `'0 6 * * 1'` (`20260803090000_pivot_nutrition_crons.sql:90-116`) · `renderSynthesisText` pure (`coach_synthesis.ts:12-19,516-641`) |
| 2 | 2 jours → décroche, 5 jours → silencieux, **sur le dernier entrant** | **B14** | `coach_synthesis.ts:64-65` (`CONTACT_SLIPPING_AFTER_HOURS = 48`, `CONTACT_SILENT_AFTER_HOURS = 120`) |
| 2 | une salle ne voit que ses propres clients | **B17** | `coach_synthesis_io.ts:171-187` |
| 2 | figure = libellés d'écran mot pour mot | **S10** | `coach.weekly.title` / `.flagged_title` / `.no_number` · `coach.flag.slipping_contact` / `.silent_5d` / `.coverage_below_gate` — **les six relus dans `en.ts` un par un** |
| 3 | la salle délègue ; l'agent signe « Sophia », jamais le nom de la salle | — | `coaches.doctrine_source = 'house'`, migration `20260806230000_doctrine_delegation.sql` · `_shared/keel/doctrine_delegation.ts` |
| 3 | un seul nom, aux **deux** endroits qui signent | — | `resolveDoctrineOwner` appelée par `doctrine_loader.ts:362` **et** `keel-coach-broadcast-v1:111`. Le module écrit lui-même le mode d'échec évité : « un agent signant *Sophia* en conversation et *Marc* sur sa diffusion hebdomadaire — le même élève, deux identités, la même semaine » |
| 3 | ça se défait, et rien n'est supprimé pendant ce temps | — | `coach-doctrine-v1` action `set_doctrine_source` (écran : `DoctrineStartDialog.tsx`) ; `decideDoctrineOwner` — la doctrine publiée avant **dort**, elle n'est pas touchée |
| 3 | une salle à trois coachs = **un** compte | **B20** | tenancy `coach → coach_clients → student` : ni entité salle, ni roster |
| 3 | ⏳ **la méthode de la maison est en cours d'écriture** | — | réserve obligatoire, `gyms.house.reserve` |
| 4 | 6 € pour un **siège** payé à l'année | **B3** | même ancre que B1, formulation correcte — **c'est la correction du claim FAUX B2** |
| 4 | s'abonner demande au moins un client rattaché | **B6** | `no_billable_seat`, `stripe-create-checkout-session:443-449` |
| 4 | vous facturez vos clients vous-même | **S12** | aucun SKU client dans `stripe-create-checkout-session` |

---

## 5. Ce que j'ai REFUSÉ d'écrire

1. **Les trois claims retirés** — aucun n'est revenu, sous aucune forme :
   « 6 € quand votre membre a payé son année » (**B2**, faux : l'intervalle est
   celui du coach) · « quelles convictions vos clients tiennent ou lâchent »
   (**B16**, rien ne le calcule) · « c'est votre nom sur les messages »
   (**B18**). Sur ce dernier, la page dit maintenant **l'exact contraire**, et
   c'est vérifiable : l'agent signe « Sophia ». ⛔ Aucun white-label (**B19**).
2. **Aucune citation de la synthèse du lundi.** B12 est verbatim et
   disponible, mais sa phrase dit *« 34 students »*, et je ne pouvais ni la
   déformer (§8 n°12, la violation nommée B13) ni la citer telle quelle sur une
   page dont le vocabulaire est « clients ». Alors **je ne cite pas**. Ce qui
   est cité l'est dans la figure, et uniquement des libellés d'écran.
3. **Aucune bande de risque, aucune tuile « on track », aucun score
   d'adhérence** (**S9**, **B15**). Le seul « chiffre » de la figure du lundi
   est son **absence** — `no number to show`, mot pour mot.
4. **Aucun chiffre de rétention, de churn, ou de « X % de membres restent »**
   (**S8**). C'est l'endroit du site où un tel chiffre se vendrait le mieux ;
   c'est exactement pourquoi B31 est là.
5. **Aucun « rien à installer / rien à connecter »** (**S4**).
6. **Aucun « rien n'arrive la nuit »** (**S5**) — et comme la section du tap du
   soir est partie, la phrase n'a même plus de trou où repousser.
7. **Aucun « jamais de calories »** (**C15**, §8 n°2).
8. **Aucune photo d'assiette, aucune couleur d'état en décor.** La fausse photo
   peinte en `emerald-300`/`amber-200` retirée de cette page n'est pas revenue
   sous une autre forme : les quatre figures n'emploient que les cinq jetons.
9. **Aucune démonstration interactive.** Ce n'est pas ma page.
10. **Aucun « votre équipe »**, aucun « suivi personnalisé », aucun « élève ».

---

## 6. Les figures — quatre, dont une neuve

| # | figure | statut | note |
|---|---|---|---|
| 1 | `FigWeek` — la semaine d'un **client** | **gardée, relibellée** | La rangée du haut est ce que le client fait DANS la salle, plus « ce que la salle coache ». Marques **comptables**, non proportionnelles. |
| 2 | `FigMoney` — l'exemple chiffré | gardée | « membres » → « clients ». Document vu de face, pas une maquette : aucun écran ne rend cette addition. |
| 3 | `FigMonday` — la page du lundi | gardée | Maquette, chaînes verbatim. Pastilles d'état en **contour sourd**, jamais dans leur couleur. |
| 4 | **`FigHouse` — la délégation et la signature** | **NEUVE** | Concept sur fond sombre, 480×220. Une carte **vide** (« VOTRE SALLE / rien d'écrit »), une fourche, et les **deux** surfaces où un client rencontre un nom — la conversation et le message de la semaine — **toutes deux signées « — Sophia »**. |
| — | `FigThread` | **supprimée** | voir §3 |
| — | `FigTrace` | **supprimée** | partie avec `Lock` |

`FigHouse` respecte la contrainte du fond sombre : `--ill-ink` y est inutilisable
(invisible), donc le contour d'une chose réelle est `PAPER` à l'épaisseur 2 ; les
annotations sont en `SOFT`, que `.on-dark` remonte à `fig-300` (8,06:1). La
flèche est **dessinée**, jamais U+2192. La fourche entière est **un seul
`<path>`** — la pièce chaude reste un objet, pas six.

---

## 7. Ce que j'ai vu au navigateur

Serveur `frontend-alt5` (port 5179). Quatre passes, plus des mesures.

| contrôle | 320 px | 1280 px |
|---|---|---|
| **EN** — `documentElement.scrollWidth <= innerWidth` | **320 ≤ 320 ✓** | 1280 ≤ 1280 ✓ |
| **FR** — idem | **320 ≤ 320 ✓** | 1280 ≤ 1280 ✓ |
| les 4 figures défilent dans **leur** conteneur, jamais la page | ✓ | ✓ |
| aucun texte de figure hors de la grille de 480, **en français** | ✓ mesuré | ✓ |
| console : aucune clé `t()` inconnue sur `/gyms` | ✓ | ✓ |

**Mesures de figures en français** (le français est la langue longue) : le pire
cas est `LE MESSAGE DE LA SEMAINE` dans `FigHouse`, qui s'arrête à **423** pour
un bord de carte à **456** — 33 unités de marge. Dans `FigMoney`, les libellés
s'arrêtent à 209 et les valeurs, ancrées à droite, commencent à 377 : aucune
collision. Dans `FigMonday`, les motifs s'arrêtent à 258 et la pastille commence
à 286.

**Deux défauts de mise en page trouvés au rendu et corrigés :**

1. **500 px de blanc mort** sous la colonne courte de la bande 1 : deux colonnes
   de texte à égalité dont l'une portait une figure. Réparé en empilant les deux
   moitiés de la réponse dans la colonne de texte et en laissant la figure tenir
   l'autre — la bande est passée de 1 494 à 1 397 px de haut.
2. **L'équerre flottait seule** sur `gyms.monday.scope` : `.eq::before` se pose à
   `top: 0.18em` de la **boîte**, donc un `pt-6` sur le même élément la décale de
   24 px au-dessus de son mot. Le filet est maintenant sur l'**enveloppe**. Une
   équerre sans mot à sa droite est un défaut, pas une décoration (CHARTE §4) —
   **et le motif `eq` + `border-t` + `pt-*` sur un même élément est reproductible
   ailleurs sur le site.**
3. Mineur : `PriceCard` porte `h-full`, donc sans `lg:items-start` sur la grille
   du prix la carte s'étirait à la hauteur de sa voisine (~150 px de vide sous
   son dernier mot). Corrigé localement.

---

## 8. Typecheck

`cd frontend && npx tsc -b` : **aucune erreur ne cite `GymsLandingPage.tsx` ni
`drafts/gyms.*`**. La totalité des erreurs restantes est `TS2783` (« specified
more than once ») — c'est le **mécanisme des brouillons lui-même** : le draft
redéclare des clés que l'ancien bloc d'`en.ts`/`fr.ts` porte encore. Elle
disparaîtra quand l'orchestrateur supprimera l'ancien bloc en phase 2. Tous les
agents la produisent. **Je n'ai réparé l'erreur d'aucun autre.**

*(Note d'ambiance : `CoachesPage.tsx` renvoie 500 en HMR chez un autre
constructeur pendant tout mon run. Sans effet sur `/gyms`.)*

---

## 9. À l'attention de l'orchestrateur

1. **Aucune clé `public.*` ne me manque.** La page n'en crée aucune.
2. ⚠️ **Le pied de page TUTOIE sur une page qui VOUVOIE.** `public.footer.*`
   rend « Ta méthode, qui répond en ton absence. » sous `/gyms`, alors que six
   des huit pages vouvoient. C'est du `public.*`, donc hors de mon périmètre —
   mais c'est une couture de registre visible sur six pages sur huit.
3. **Repli en phase 2** : supprimer **tout** le bloc `gyms.` d'`en.ts`
   (l. ~3172-3410) et de `fr.ts` (l. ~861-…), et recopier mes deux brouillons à
   leur place. **34 clés disparaissent** ; aucune n'est lue ailleurs (vérifié :
   la page est le seul lecteur du namespace).
4. **Hors périmètre, déjà signalé par l'audit §12 mais qui mord ici :**
   `CoachBillingPage.tsx:93-94` porte encore le claim FAUX **B2** (« 6 € quand
   votre élève a payé son année ») **dans le produit payant**. Je viens de le
   retirer de la vitrine pour la deuxième fois ; il reste vrai que le gérant qui
   s'abonne le relira à l'écran de facturation.
5. **Décision prise seule, à signaler** : la grille dit que la doctrine de la
   maison est « en cours d'établissement ». J'ai vérifié le code — le **chemin**
   est complet et câblé aux deux endroits qui signent, avec écran, tests et
   réversibilité. C'est bien le **contenu** qui manque. La page vend donc la
   délégation en le disant, et `gyms.house.reserve` ne doit pas être retirée
   tant que ce n'est pas faux.
