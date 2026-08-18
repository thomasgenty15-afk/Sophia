# La doctrine maison de Sophia — le raisonnement, les sources, et ce qui reste ouvert

> Établi le 2026-08-13. Livrable associé : `doctrine-maison.json`.
> Les clés de camp, les 30 groupes et les gabarits de fréquence ont été relus
> dans le code le même jour (`doctrine_starter.ts`, `tokens.ts`, `food_items.ts`).

---

## 1. Ce qui est livré

| | |
|---|---|
| Débats tranchés | **10 / 10** — 9 camps pris, **1 `no_rule`** (`portions`) |
| Répartition des grades | **A** ×1 · **B** ×6 · **C** ×3 · **D** ×0 |
| Groupes alimentaires | **30 / 30** — 21 `encouraged`, 9 `discouraged`, **0 `excluded`** |
| Règles de fréquence | **3** seulement : `non_starchy_veg`, `red_meat`, `fatty_fish` |
| Lignes rouges | **9** en partie 3, qui s'ajoutent aux **5** semées par les camps choisis → 14 interdits actifs |
| Références distinctes | **46**, toutes avec DOI ou URL — vérifiées pièce par pièce, aucune source sans lien |

Aucune position ne porte le grade D, et c'était la condition : le prompt dit
qu'un camp choisi sur du grade D est pire qu'une absence de règle. Là où la
preuve ne départageait pas les camps, la case est passée en `no_rule` avec
l'explication — une seule fois, sur les portions.

### Ce qui a été vérifié mécaniquement, et pas seulement relu

Trois contrôles ont tourné contre le code réel du dépôt, pas contre une idée du
code. Ils sont reproductibles en une commande chacun :

1. **Conformité au contrat.** Chaque clé de camp existe dans `STARTER_FORKS`,
   les 30 groupes correspondent exactement à `FOOD_GROUP_REFS`, chaque `stance`
   est dans `Stance`, chaque `frequency` respecte un gabarit de `FrequencyRule`,
   chaque `token` est en ASCII snake_case, unique, et n'entre en collision avec
   aucun jeton semé par un camp choisi. **Zéro erreur.**
2. **Les formes de surface mordent en français accentué.** Le matcher
   (`forbidden_matcher.ts`) normalise en NFD et retire les diacritiques des deux
   côtés : les formes écrites sans accents attrapent bien « accélérer le
   métabolisme », « brûleur de graisse », « saute le dîner », « tu as été sage ».
   **13 phrases accentuées testées, 13 mordent.** Toutes les formes de surface
   du fichier mordent aussi en version brute.
3. **Aucun texte de repli ne se mord lui-même.** C'est le piège qui compte :
   `instead` est injecté dans le prompt *et* renvoyé tel quel quand le verrou
   remplace une réponse. Un `instead` qui contiendrait une forme interdite ferait
   mordre le verrou sur sa propre issue de secours. **Les 14 `instead` actifs ont
   été passés dans le matcher contre l'ensemble des 14 interdits : aucun
   déclenchement.**

---

## 2. La méthode

**Où j'ai cherché.** PubMed, les sites des revues (BMJ, Lancet, JAMA, AJCN,
Cell Metabolism, Cochrane Library, Circulation, Obesity, Nutrition Reviews,
IJBNPA, JMIR), et les guides d'institutions (OMS, WCRF/AICR, AHA). Chaque
référence a été ouverte ou vérifiée dans une notice indépendante avant d'entrer
dans le fichier : auteurs, année, revue, volume, pages, DOI. Trois citations que
j'avais d'abord écrites de mémoire se sont révélées fausses sur les auteurs ou
le DOI et ont été corrigées après vérification — c'est exactement le risque que
ce protocole existe pour attraper.

**La hiérarchie appliquée.** Méta-analyses d'essais randomisés > essais
randomisés isolés > revues parapluie et méta-analyses de cohortes > consensus
d'institution. Une cohorte ne bat jamais un essai sur la même question : c'est
la raison pour laquelle le petit-déjeuner sort en `breakfast_optional` malgré
vingt ans de cohortes qui disent l'inverse.

**Comment le grade est attribué.** Sur la preuve qui soutient *l'affirmation
exacte du camp*, pas sur le volume de littérature autour du sujet. Le débat
`eating_out` en est l'exemple : la charge calorique d'un repas de restaurant est
mesurée (grade A si c'était la question), mais la consigne « cherche d'abord la
protéine et les légumes » n'a jamais été testée — donc **C**.

**Ce que j'ai refusé d'écrire.** Aucune allégation de traitement, aucune cible
chiffrée sur un corps, aucune règle visant un mineur, aucune liste « aliments
recommandés », et pas une seule affirmation sans sa source. Là où je ne trouvais
pas de source citable, la case ne s'est pas remplie « au mieux ».

---

## 3. Les dix débats, en une page

| Débat | Camp retenu | Grade | Ce qui le porte |
|---|---|---|---|
| `meal_frequency` | `frequency_is_theirs` | B | Deux méta-analyses d'essais : aucun rythme ne bat l'autre |
| `breakfast` | `breakfast_optional` | **A** | BMJ 2019, méta-analyse d'ECR : ajouter un petit-déjeuner ne fait pas maigrir |
| `hunger` | `hunger_is_information` | B | La composition du repas décide de l'heure de la faim (Weigle, Hall) |
| `portions` | **`no_rule`** | C | La preuve ne départage pas la main de la balance |
| `counting` | `no_counting` | B | Suivi simplifié = même perte, adhérence 97 % vs 49 % |
| `the_scale` | `scale_is_noise` | B | La pesée seule n'a pas de preuve, et un coût mesuré |
| `evening` | `no_cutoff` | B | L'heure limite a été testée (TREAT) : aucun bénéfice |
| `off_plan_meals` | `no_cheat_meal` | C | Le contrôle rigide va avec la désinhibition |
| `eating_out` | `restaurant_anchor` | C | ~1 000 kcal par plat mesurés ; la consigne, elle, est déduite |
| `quick_fixes` | `no_detox` | B | Revue critique : aucun essai valable, et 315 essais nuls sur les compléments |

### Le seul `no_rule`, et pourquoi il est là

`portions` est laissé vide **délibérément**. Les deux camps ont chacun un
argument réel et aucun ne bat l'autre :

- La main gagne sur la charge — partout où un suivi simplifié a été comparé à un
  suivi détaillé, le simplifié tient mieux dans le temps pour la même perte.
- La balance gagne sur la mesure — l'auto-surveillance alimentaire est
  constamment associée à de meilleurs résultats.
- Le seul travail publié sur la main mesure la **largeur des doigts comme une
  règle** (Gibson 2016) : précis à ±25 % sur les aliments de forme géométrique,
  et **mauvais précisément sur les pièces irrégulières** — filet de poisson,
  steak — c'est-à-dire sur la protéine que la paume est censée doser. Il ne
  valide pas le système paume/poing/main en creux ; il en est voisin.

Et surtout : choisir le camp de la main sème l'interdit `weigh_every_meal`, qui
interdirait la balance de cuisine. **Interdire une pratique qui a des données
favorables, au nom d'une méthode qui n'en a pas, est exactement le geste que ce
document doit éviter.** Conséquence assumée : la doctrine ne dit rien sur
l'instrument, et ce n'est pas un trou — le produit compose déjà les parts.

---

## 4. Les trois positions dont je suis le moins sûr

### 4.1 `eating_out` → `restaurant_anchor` (la moins assurée des dix)

Les ingrédients sont prouvés — les plats de restaurant les plus commandés pèsent
en moyenne ~1 000 kcal (Roberts 2018, mesure calorimétrique, cinq pays), et ce
qui est servi plus grand est mangé plus (Cochrane, 72 ECR). La consigne, elle,
est une **déduction** : aucun essai n'a testé « cherche la protéine et les
légumes d'abord » en situation de restaurant. Je l'ai retenue parce que l'autre
camp (`restaurant_no_rules`, « le restaurant n'est pas un problème à résoudre »)
est la seule position de tout le document qu'une mesure directe contredit.

**Ce qu'il faudrait pour trancher :** un essai randomisé en restaurant réel
comparant la consigne d'ancrage à l'absence de consigne, sur l'énergie
effectivement consommée. À ma connaissance il n'existe pas.

### 4.2 `hunger` → `hunger_is_information`

Le lien composition → satiété est solide (Weigle 2005 : −441 kcal/j spontanés en
passant à 30 % de protéines ; Hall 2019 : +500 kcal/j sur un régime
ultra-transformé à composition affichée identique). **Le saut vers « donc le
repas d'avant était mal construit » ne l'est pas**, et la revue de Leidy concède
elle-même que l'effet de satiété des protéines est modeste et ne réduit pas de
façon fiable l'apport au repas suivant. L'arbitrage attaché — « mange quelque
chose de protéiné puis va te coucher » — n'a jamais été comparé à l'autre
réponse.

**Ce qu'il faudrait pour trancher :** un essai comparant les deux réponses à la
faim tardive sur l'apport du lendemain et sur l'abandon à trois mois. Le choix
actuel penche par prudence : apprendre à ignorer un signal de faim est le
mécanisme que la littérature sur la restriction rigide associe à la
désinhibition qui suit.

### 4.3 `evening` → `no_cutoff`

L'heure limite en tant que telle est réfutée par un essai direct : TREAT
(Lowe 2020) n'a trouvé aucun avantage à la fenêtre de 8 h contre trois repas
ordinaires. **Mais la phrase « l'heure ne compte pas » est trop forte.** La
méta-analyse de 2024 trouve un petit avantage (~−1,75 kg) à distribuer les
calories plus tôt, et l'essai croisé de Vujović 2022 montre qu'à apports,
sommeil et activité identiques, manger tard augmente la faim et diminue la
dépense énergétique. Les auteurs eux-mêmes qualifient ces effets de petits et
d'importance clinique incertaine.

Il y a une seconde raison, non scientifique, de ne pas fermer la cuisine : **ça
contredirait la position retenue sur la faim.** `hunger_is_information` dit à
l'élève de manger quelque chose de protéiné s'il a vraiment faim à 22 h. Un camp
`kitchen_closes` publierait dans la même doctrine une croyance qui l'interdit.
**Qui changera l'un des deux devra rouvrir l'autre.**

**Ce qu'il faudrait pour trancher :** un essai en vie libre, assez long, isolant
la distribution horaire de l'apport total — les données actuelles sont soit
courtes et très contrôlées (n=16), soit longues et confondues.

---

## 5. Là où la littérature contredit la pratique des salles

C'est la section à faire lire au gérant avant qu'il publie. Sur sept points, sa
propre salle dit aujourd'hui le contraire de ce qu'il va signer — et un adhérent
informé le lui dira.

| Ce que la salle dit | Ce que la doctrine dit | Solidité |
|---|---|---|
| « Le petit-déjeuner est le repas le plus important » | Seulement si tu as faim | **A** — méta-analyse d'ECR, BMJ |
| « Six petits repas pour relancer le métabolisme » | Le métabolisme suit la quantité, pas la fréquence | **B** — deux méta-analyses + revue physiologique |
| « Rien après 20 h » | Il n'y a pas d'horloge sur la cuisine | **B** — l'heure limite a été testée directement |
| « Ton cheat meal du samedi » | Il n'y a rien à tricher | **C** — le vocabulaire, pas le repas |
| « Compte tes calories / prends l'appli » | On ne compte pas ici | **B** — deux ECR, même perte, adhérence doublée |
| « Des abdos pour perdre du ventre » | La perte localisée n'existe pas | **B** — ECR de 6 semaines, alimentation constante |
| Détox, brûleurs, coupe-faim vendus à l'accueil | Rien de tout ça n'a de preuve | **B** — 315 essais passés en revue |

**Et un point où c'est l'inverse : la balance.** Sur ce débat, la littérature
est plutôt du côté de la salle qui fait peser tous les jours — dans un essai de
perte de poids, les personnes qui se pesaient quotidiennement ont perdu 6,1 kg
de plus (Steinberg 2015). La doctrine retient quand même `scale_is_noise`, pour
deux raisons qu'il faut pouvoir énoncer : la méta-analyse la plus stricte conclut
qu'il n'existe **aucune preuve** que conseiller la pesée *sans rien d'autre
autour* soit efficace (Madigan 2015), et un essai randomisé a mesuré chez de
jeunes femmes une plus grande instabilité émotionnelle négative, plus de stress
lié au poids et moins de satisfaction corporelle (Pacanowski 2023, d = 0,73–0,84).
Pour un défaut adopté par une salle qui ne connaît pas l'historique de ses
adhérents, ce risque ne se prend pas à leur place. **C'est le seul endroit où la
doctrine est plus prudente que la preuve, et le gérant doit savoir que c'est un
choix, pas une lecture.**

---

## 6. Trois décisions de forme que le prompt ne prévoyait pas

### 6.1 Il n'existe pas de valeur « neutre » pour un groupe alimentaire

Le prompt impose une posture parmi trois pour les 30 groupes, et le code est
d'accord : `Stance = "encouraged" | "discouraged" | "excluded"`. Mais la
sémantique réelle du produit est écrite dans `food_items.ts` — **« NEUTRE =
ABSENCE DE LIGNE »**. Un groupe sans opinion ne porte pas une posture faible : il
ne porte pas de ligne du tout.

Conséquence : **quatre groupes portent dans le fichier une posture plus tranchée
que ma confiance réelle**, uniquement parce qu'il fallait remplir la case.

| Groupe | Posture écrite | Ce que je pense vraiment |
|---|---|---|
| `dairy_cheese` | `discouraged` | Aucun signal défavorable dans les cohortes. Écarté sur la densité énergétique et le sel, pas sur un risque. Le `why` le dit franchement. |
| `sauce_dressing` | `discouraged` | Grade C. Énergie et sel invisibles ; raisonnement solide, mesure directe absente. |
| `coffee_tea` | `encouraged` | « Rien à redire » serait plus juste qu'« encouragé ». |
| `starchy_veg` | `encouraged` | Repose sur un indice de satiété de 1995 et sur la séparation d'avec `fried_food`. |

**Recommandation au chargeur :** si le produit gagne un jour une valeur neutre,
ce sont ces quatre-là qu'il faut y basculer en premier — et non les 26 autres.

### 6.2 `instead` est écrit en **français**, et c'est un trou connu

Les `surfaceForms` sont bilingues, comme demandé. Mais `instead` est **une seule
chaîne**, et c'est le texte qui part tel quel à l'utilisateur quand le verrou
mord. Il est écrit en français : le produit défaut sur `fr-FR`, et le document
entier l'est. **Un élève anglophone recevra donc du français.**

Ce n'est pas réparable dans le fichier — il faudrait un second champ, ou un
`instead` par langue. À traiter avant tout chargement destiné à une cohorte
mixte. C'est la même faille de fond que la réponse qui sort en anglais sur une
doctrine `fr-FR`.

### 6.3 La partie 3 s'ajoute aux interdits des camps, elle ne les remplace pas

Les camps retenus sèment 5 interdits par `applyStarterChoices` :
`must_eat_breakfast`, `count_calories`, `no_eating_after_hour`, `cheat_meal`,
`detox_cleanse`. Les 9 lignes rouges du fichier s'y ajoutent → **14 interdits
actifs**. Aucune collision de jeton (vérifié). Un seul chevauchement de surface
subsiste, bénin : `cheat_meal` porte déjà « make up for it » / « burn it off » en
anglais, et `compensate_with_exercise` porte « work it off at the gym ». Les deux
peuvent mordre sur la même phrase ; l'effet est le même, seul le `instead`
diffère.

À noter aussi : `portions` étant en `no_rule`, **l'interdit `weigh_every_meal`
n'est pas semé**. La doctrine n'interdit pas la balance de cuisine, et c'est
voulu (§3).

---

## 7. Ce que je n'ai **pas** pu établir

- **Aucun essai sur les heuristiques de restaurant.** La consigne d'ancrage est
  une déduction à partir de deux faits prouvés. Je n'ai trouvé aucune évaluation
  directe.
- **Aucune validation du système paume / poing / main en creux.** Le seul travail
  publié teste la largeur des doigts comme règle de mesure, et échoue justement
  sur les pièces irrégulières. Le système enseigné dans les salles n'a, à ma
  connaissance, jamais été validé contre pesée.
- **Aucune donnée sur la durée du « compte deux semaines puis arrête ».** Le
  camp `count_briefly` est plausible et intestable en l'état : rien ne compare
  un comptage borné à un comptage continu ni à une absence de comptage.
- **Aucune quantité citable** pour l'eau (pas d'apport quotidien établi), les
  sauces, le fromage, ni pour l'alcool sous une forme utilisable — les plafonds
  nationaux divergent trop pour un produit bilingue, et le seul énoncé
  international disponible dit « zéro », ce qui ne se met pas dans un gabarit
  `at_most`. C'est pourquoi **27 des 30 groupes n'ont aucune règle de
  fréquence**, et c'est le cas normal.
- **Aucune preuve pour distinguer les crucifères des autres légumes** au niveau
  où le produit travaille. La séparation existe dans le vocabulaire du code, pas
  dans la littérature dose-réponse, qui les agrège.
- **Aucune littérature francophone mobilisée.** Tout ce qui est cité est
  anglophone. Les repères français (PNNS, ANSES) n'ont pas été intégrés : ils
  n'auraient rien changé aux positions, mais un gérant français les connaît, et
  pouvoir dire « c'est aussi ce que dit le PNNS » vaut cher devant un adhérent.
  À ajouter si le document sert en France.
- **Aucun chiffre de résultat, et il n'y en aura pas.** Personne n'a testé
  « adopter ce bloc » contre témoin. Le produit n'a aucune mesure de rétention
  contre groupe contrôle et s'interdit d'en inventer une — donc rien dans ce
  document ne promet un pourcentage.

---

## 8. Avant de charger

1. **Trancher la langue de `instead`** (§6.2). C'est le seul point qui casse une
   promesse visible par l'utilisateur.
2. **Décider du sort des quatre postures d'arrondi** (§6.1) — les garder telles
   quelles, ou attendre une valeur neutre.
3. **Faire lire le §5 au professionnel qui adopte.** Sept de ses habitudes de
   discours vont devenir des interdits de son propre agent ; il vaut mieux qu'il
   l'apprenne ici que par un adhérent.
4. **Ne pas publier ce bloc intact sous le nom de dix salles différentes.** Le
   compteur `countUntouchedStarter` existe exactement pour ça, et l'argument de
   `doctrine_starter.ts` tient toujours : dix agents qui sortent les mêmes
   phrases, c'est le premier professionnel qui reconnaît son `instead` chez un
   concurrent et arrête de payer. Cette doctrine est un **point de départ
   défendable**, pas une identité.
