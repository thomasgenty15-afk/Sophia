# Le calcul des besoins et la composition des repas — synthèse

**2026-08-20.** Remplace `2026-08-20-1651-DESIGN-CALCULATEUR-DE-BESOINS.md`, qui
partait du besoin, et se compose avec `2026-08-20-0200-DESIGN-habitudes-et-signaux.md`,
qui part de l'habitude. La §2.1 dit comment les deux se réconcilient.

⚠️ **Rien n'est implémenté.** Ce document est une décision de conception.

⚠️ **Cinq propositions ont été TUÉES par la vérification.** Elles sont gardées au
§4 avec la mesure qui les a tuées — un lecteur qui ne les trouve plus les
reconstruirait.

⚠️ **RÉVISÉ LE 2026-08-20 À 21 H 30** contre
[`2026-08-20-2130-ETAT-DE-LART-NUTRITION.md`](2026-08-20-2130-ETAT-DE-LART-NUTRITION.md)
— revue de littérature, 42 conclusions contre-vérifiées. **Ce document est
l'aval : quand les deux divergent, la revue fait foi sur la science, celui-ci
sur le produit.** Les sections révisées portent la marque ⟳.

---
---

# PARTIE 1 — LA VERSION COURTE

## Ce qu'on fait

On calcule ce dont une personne a besoin. On regarde ce qu'elle mange déjà. On
compose des repas qui remplissent l'écart. **On ne lui montre jamais un chiffre.**

## Les six règles

### 1. Trois choses à calculer, et elles ne bougent pas pareil

| | ça dépend de | ça change quand on perd 3 kg ? |
|---|---|---|
| **Calories** | poids, taille, âge, sexe, activité | **oui** |
| **Protéines** | poids — ⚠️ **plafonné à l'IMC 30** (§2.2) | **oui, jusque-là** |
| **Vitamines, minéraux** | sexe, âge — ⚠️ **avec des exceptions nommées** : B6, fer chez la femme, zinc × phytates (§2.2) | **non** |

### 2. Le moteur calcule. Le modèle cuisine.

**Décidé** : toute l'arithmétique est faite par du code — vérifiable et
rejouable. Le modèle reçoit **ce qui reste à remplir**, déjà calculé, et ne fait
jamais de soustraction.

⚠️ **Aujourd'hui le code ne calcule que 3 à 12 % des journées** (§3.1). L'amener
à 60 % est **le préalable de tout le reste**.

**Pourquoi :** une erreur de calcul d'un modèle a l'air juste. Ici, ça veut dire
que quelqu'un mange faux pendant trois jours sans que personne ne le sache. Et ce
n'est pas théorique — le modèle fait **déjà** une addition que personne ne
vérifie : la liste de courses.

### 3. L'IA lit, elle ne compte pas

Quelqu'un écrit *« tartine pain beurre + chocolat chaud à 16h30 »*. Un appel
modèle le traduit **une seule fois** en lignes d'aliments. C'est stocké. Le
modèle n'est plus rappelé ensuite.

Traduire du texte, c'est une tâche de langue : le modèle est bon. Faire une
soustraction à chaque plan, c'est une tâche de maths, invisible et jamais
recontrôlée.

### 4. On envoie une structure, pas des grammes

On ne dit pas au modèle « 120 g de volaille ». On lui dit « une protéine, un
légume, un féculent, une matière grasse ». **Il nomme l'aliment précis, et c'est
le moteur qui calcule à partir de cet aliment-là.**

**Pourquoi :** un groupe d'aliments ne prédit pas ce qu'il contient. Mesuré dans
notre propre base : le groupe « viande rouge » va de **81 à 744 kcal** pour
100 g. Dire « 80 g de viande » ne veut rien dire.

> ### ⚠️ Alors d'où vient la dose, si on n'envoie pas de grammes ?
>
> **La structure ne fixe pas la dose. Elle fait en sorte que la dose soit
> ATTEIGNABLE.** La dose, elle, vient d'un calcul qui tourne APRÈS que le modèle
> a écrit son plat, et où le corps entre **au numérateur** — jamais dans le
> prompt. Détail complet en **§2.6**, et c'est le point que ce document avait
> laissé implicite.

### 5. On vise une densité énergétique basse — le levier le plus puissant

Baisser la densité d'un plat (kcal par gramme) fait manger **moins d'énergie pour
le même poids d'aliment**. Mesuré sur 38 essais : **−223 kcal** par repas, sans
que personne ne mange moins. C'est **deux fois plus puissant que réduire la
portion**, et ça ne demande de se priver de rien.

⚠️ **Corollaire qui va contre notre intuition : « on varie tes repas » fait manger
PLUS** (30 études). La variété doit être **dirigée vers les légumes** — là elle
ajoute 48 g de légumes sans ajouter d'énergie — et **pas ailleurs**.

### 6. Les vitamines se garantissent en fréquence

Pas en milligrammes. On vise *« du poisson deux fois cette semaine »*, jamais
*« 16 mg de fer »*.

**Pourquoi :** ⟳ ce qui gouverne l'absorption du fer, c'est **le stock de fer de
la personne** — que le produit ne connaît pas — et non ce qu'il y a dans
l'assiette : le terme individuel écrase le terme alimentaire d'un ordre de
grandeur. Un milligramme dans une assiette n'est donc pas une grandeur qu'on peut
décider.

⚠️ **Et cette garantie N'EST PAS IMPLÉMENTÉE** : un nutriment est coché couvert
dès qu'**un** aliment porte le drapeau, sans quantité ni compte d'occasions
(§2.4 ③). C'est le **dernier lot** du plan.

⚠️ **Mais ce n'est pas une garantie complète, et il ne faut pas le promettre.**
Voir §3.5 : l'organisme qui a construit ces repères a dû relâcher la vitamine D,
les fibres et le fer pour que son calcul aboutisse.

## Les deux cas

**Une personne seule :** on calcule son besoin, on retire ses habitudes fixes, on
compose le reste.

**Un foyer :** on ne cherche **pas** un menu qui satisfait plusieurs cibles à la
fois — ce serait impossible à résoudre. On fait :

1. **UN menu**, sous l'union des **interdits** de tout le monde (allergies,
   régimes, interdits médicaux) — des exclusions, pas des cibles
3. **N portions**, chacune calculée contre son propre corps, sans regarder les autres
4. **UNE casserole**, dimensionnée par la somme des appétits

Et **seule une personne qui a posé un objectif de poids reçoit une boîte pesée.**
Tout le monde d'autre mange dans le plat commun, sans nom et sans gramme.

## Le trou le plus grave, aujourd'hui

| | personne seule | foyer |
|---|---|---|
| vérification de ce que le modèle a composé | ✅ | ❌ **rien** |
| mesure de ce qu'on a su lire | ✅ | ❌ **rien** |
| deuxième essai quand c'est raté | ✅ | ❌ **rien** |

**Le cas le plus compliqué du produit est celui qui n'est pas vérifié du tout.**

---
---

# PARTIE 2 — LA VERSION LONGUE, EN MOTS

## 2.1 D'où on part : deux documents qui se contredisaient

Le 2026-08-20 à 2 h du matin, un design a posé :

> **Le produit ne change pas ce qu'on mange. Il fait gagner du temps sur la
> planification et la préparation, et rééquilibre à la marge.**
> Aujourd'hui l'algorithme part du BESOIN. Il doit partir de l'HABITUDE.

Le même jour à 16 h, un autre design perfectionnait la dérivation du besoin.
Livrer les deux, c'est livrer **deux moteurs qui se disputent le même volant**.

### La réconciliation, et elle a été corrigée deux fois

**Première formulation, fausse :** *« l'habitude donne le niveau, le calcul donne
l'écart »*. Trois vérifications indépendantes l'ont tuée (§4.1). En résumé : ce
que les gens déclarent manger est sous-estimé de **20 à 35 %**, et le biais est
**maximal exactement chez la personne qui veut maigrir**. Fixer la cible sur le
déclaré, puis retirer 10 %, fait atterrir le plan au niveau du métabolisme de
repos.

**Formulation retenue :**

> **L'estimation donne le niveau. L'habitude est une PINCE qui le resserre, et
> une ALARME quand les deux ne se rejoignent pas.**

Concrètement :
- la cible reste dérivée de l'équation (avec son plancher d'énergie) ;
- ce que la personne déclare manger **ne remplace jamais** cette cible ;
- **quand le déclaré est très en dessous du plancher, on n'ouvre aucun déficit**
  — c'est le signal le plus précoce d'une restriction en cours, et il n'existe
  nulle part aujourd'hui.

## 2.2 Les besoins : ce qu'on calcule et ce qu'on lit dans une table

### Les calories

On garde **Mifflin-St Jeor** (1990), l'équation déjà en place. Ce n'est pas de
l'inertie : les alternatives plus précises (Katch-McArdle, Cunningham) demandent
une **composition corporelle** que ce produit n'a pas et s'interdit de collecter.
Changer d'équation pour une donnée qu'on ne peut pas remplir est un progrès de
papier.

⚠️ **Ce qu'il faut savoir de sa précision, et le dire :** la revue systématique
de l'American Dietetic Association (Frankenfield 2005) la classe première parmi
les équations courantes, avec **70 % des personnes obèses à ±10 %** de la mesure
réelle. Elle prévient elle-même que des erreurs notables existent à l'échelle
individuelle, et qu'elle n'a pas été testée hors population caucasienne.
**Restriction à maintenir explicitement : adulte non sportif de haut niveau.**

Une fois le facteur d'activité deviné empilé par-dessus, **la cible d'une journée
porte de l'ordre de ±20 à 30 %.** C'est le chiffre qui gouverne tout le reste de
ce document : il rend absurde toute prétention de précision au gramme près.

⟳ **ET LE CHIFFRE EXACT EST PIRE QUE ÇA.** À l'échelle de la dépense **TOTALE**
(pas du repos), les meilleures équations testées contre l'eau doublement marquée
gardent un **RMSE d'environ 20 %** et ne placent que **43 à 54 % des individus à
±10 %** (Prado-Nóvoa, *Sci Rep* 2024).

⛔ **Conséquence à écrire noir sur blanc : notre erreur d'estimation (~±580 kcal/j)
est PLUS GRANDE que notre plafond de déficit (500 kcal/j).** Ça ne rend pas le
calcul inutile — il donne la bonne direction et le bon ordre de grandeur — mais
ça **interdit définitivement toute promesse de calendrier**. La date d'arrivée
(`weeksToTarget`) doit disparaître de l'écran, ou devenir une fourchette large.

⟳ **CE QUI MANQUE AU CALCUL : LE POIDS DÉJÀ PERDU.** À l'équilibre, chaque kilo
perdu abaisse l'entretien d'environ **22 à 24 kcal/j** (Hall, *Lancet* 2011 —
règle de population, pas prédiction individuelle). Mifflin × PAL n'en capture
qu'environ **65 %** (le terme `10 × poids` de Mifflin, multiplié par le PAL, rend
14 à 16 kcal/j/kg).

⇒ **Il manque un terme de −6 à **10** kcal/j par kilo déjà perdu.** Sans lui, plus la
personne perd, plus la cible dérive à la hausse, et **le produit ralentit
lui-même la perte qu'il pilote, en silence** — puisqu'aucun chiffre n'est
affiché. ⚠️ Ça suppose de stocker le **poids de DÉPART** à côté du poids courant :
à vérifier dans le modèle de données.

⟳ **LA RÈGLE DES 7 700 kcal/kg EST INNOCENTE À NOTRE ÉCHELLE.** Elle surestime la
perte de ~27 % sur 1 à 3 mois (Thomas, *Int J Obes* 2013, n = 103) — mais ces
essais appliquaient un déficit moyen de **1 439 kcal/j, près du triple de notre
plafond**. Sur une fenêtre de **1 à 7 jours**, l'erreur cumulée est négligeable
devant l'incertitude d'estimation. **Ce qui est interdit, c'est de la PROJETER.**

⟳ **ET DEUX CHOSES QU'ON NE CODE PAS**, parce que la mesure ne les soutient pas :
- **aucun terme d'adaptation métabolique** — 50 à 110 kcal/j en bilan négatif,
  **non significatif** au poids stabilisé (−18 ± 134 kcal/j à 1 an, p = 0,38 ;
  Martins, *AJCN* 2020, n = 171), et **ne prédisant pas la reprise**. Le
  −500 kcal/j du *Biggest Loser* est n = 14, un jeu télévisé ;
- **aucune correction de « dépense contrainte »** — la dépense totale augmente
  avec l'activité **de façon additive et linéaire, sans plateau** (Howard,
  *PNAS* 2025, n = 75 ; Yegian, *J Physiol* 2026 : +250 kcal/j d'activité →
  +272 kcal/j de dépense). **Notre facteur multiplicatif est justifié.**

### Les protéines

Le plancher est en grammes par kilo de poids corporel : 2,0 en perte, 1,6 en
maintien et en prise, 1,2 après 60 ans, 1,0 chez l'enfant.

⚠️ **Le défaut du dénominateur.** Le 2,0 descend de Helms 2014, qui parle en
**masse maigre**, pas en poids total. La même règle donne 2,35 g par kilo de masse
maigre à quelqu'un de mince (le plancher de la source) et **3,33 à quelqu'un de
corpulent** (au-dessus de son plafond). **Un chiffre unique en poids total ne peut
pas être juste sur toute la plage d'adiposité.**

⟳ **ET IL SE RÉDUIT DES TROIS QUARTS SANS MESURER LA COMPOSITION CORPORELLE.**
J'avais écrit qu'on ne pouvait que documenter le biais. C'est faux :

> **On plafonne le POIDS DE RÉFÉRENCE à celui d'un IMC de 30** (variante 27,5) —
> Weijs 2025, *Curr Opin Clin Nutr Metab Care*.

Une personne de 1,70 m et 110 kg calcule sa protéine sur **87 kg**, pas 110. C'est
**une ligne de code**, et c'est le correctif au meilleur rapport de tout le
dossier.

⚠️ **Il REFERME ~72 % du biais, il ne l'annule pas.** Sur ce même corps (~40 % de
masse grasse, masse maigre ≈ 66 kg) : 220 g → 173 g, soit **3,33 → 2,62 g/kg de
masse maigre**, contre 2,35 au plancher de la source. Le résidu reste documenté. ⟳ ⚠️ **CORRECTION : la bande d'âge haute EXISTE et elle est ARMÉE.** Je
confondais deux types : `MemberAgeState` (`minor`/`unknown`/adulte, la garde des
chiffres) et `AgeBand` (`18_29`/`30_44`/`45_59`/**`60_plus`**), qui existe depuis
`student_age.ts` et porte **déjà** le relèvement protéique du senior. Le seul trou
d'âge réel est **en bas** (pédiatrique).

⛔ **Mais un arbitrage s'ouvre, et il faut le trancher :** appliqué à un senior
corpulent, le plafond **FAIT DESCENDRE** sa cible. 1,60 m / 90 kg, ≥ 60 ans :
`1,2 × 90 = 108 g` sans plafond ; poids à IMC 30 = 76,8 kg ⇒ `1,2 × 76,8 = 92 g`.
**−16 g/j sur la population même pour laquelle la source recommande le plafond**,
et dont §2.11 dit que le plancher ne doit jamais descendre. Deux réponses se
défendent — « le coefficient ne descend pas mais le poids de référence est
plafonné, et on assume les −16 g » ou « sur `60_plus`, pas de plafond ». **Seul
le silence ne se défend pas.** À trancher dans le lot 1.

⟳ **LA PROMESSE RÉTRÉCIT, ET IL FAUT LE CHIFFRER.**

> **Sans entraînement en résistance**, l'effet protecteur d'un apport protéique
> élevé sur la masse maigre en déficit vaut environ **0,43 kg** (Wycherley 2012).
> C'est LE chiffre honnête pour ce produit, qui ne fait faire aucun sport.

Et le seuil de Morton 2018 lui-même : **1,6 g/kg est un point estimé** (IC
1,03-2,20) pour un effet total de **0,30 kg** de masse maigre. **C'est un repère,
pas une frontière.**

⛔ **LA RECOMPOSITION SANS ENTRAÎNEMENT EST RÉFUTÉE**, à toute ampleur, dans
toute population. Longland 2016 est surexploité : **l'ingrédient actif était
l'entraînement**, pas la protéine, et l'essai porte un confondant lipidique non
écarté. La revue la plus récente (Refalo/Trexler/Helms 2025) porte sur 29 études
**toutes avec entraînement**, résultats exploratoires, IC du coefficient principal
**traversant zéro**.

⇒ **Le repli de `recomposition` sur `maintenance` (2026-08-18) est la position
JUSTE, pas un archaïsme.** À rouvrir seulement le jour où on saura que la
personne s'entraîne — ce que les deux axes d'activité collectent déjà.

⟳ **L'EFFET DE LEVIER PROTÉIQUE EST SOUTENU** (manger moins de protéines fait
manger plus de tout) : +12 ± 4,5 % d'apport en passant de 15 % à 10 % de
protéines (Gosby 2011) ; 38 essais analysés concluant à un soutien fort (Gosby,
*Obes Rev* 2014) ; cinq confirmations 2022-2026 dont une cohorte norvégienne de
11 152 personnes. **C'est une raison de plus de tenir le plancher — pas de le
dépasser.**

### Les vitamines et les minéraux

**Ce sont les seules valeurs qu'on ne calcule pas : on les lit dans une table par
sexe et par tranche d'âge.**

⚠️ **Formulation exacte, parce que la version simple est fausse.** On ne peut pas
écrire « ces besoins ne dépendent pas du poids ». Ce qui est vrai : **les
référentiels européens ne publient pas ces valeurs indexées sur le poids.** Ils
le disent eux-mêmes : c'est un choix de cadrage, sur une corpulence de référence,
sans ajustement pour l'obésité.

Et il y a des exceptions qui comptent :

| exception | ce que ça fait |
|---|---|
| **le fer chez la femme** | l'ANSES donne **11 mg** (pertes faibles à modérées) ou **16 mg** (pertes élevées). Deux femmes du même âge et du même poids n'ont pas la même valeur. |
| **la vitamine B6** | sa référence est **par gramme de protéine mangée**. Comme on fixe la protéine au poids, ce besoin-là dépend du poids **par construction**. |
| **le zinc** | varie d'un facteur 1,7 selon les phytates du régime. Un régime riche en céréales complètes et légumineuses déplace la cible. |
| **la grossesse, l'allaitement** | plusieurs valeurs changent fortement. **Le produit n'a aucun état pour ça.** |
| **le régime végétalien** | la B12 alimentaire est nulle, le fer non héminique demande environ 1,8× l'apport. |

⚠️ **Conséquence de conception, et elle est nette : on ne construit pas de table
de milligrammes.** Elle serait fausse pour ces cas-là, **dans le sens dangereux**,
et le §2.4 explique qu'elle n'aurait de toute façon aucun lecteur.

## 2.3 Les habitudes : trois choses différentes qu'on appelle du même mot

C'est la source de confusion n°1 du sujet. Trois faits, trois rôles.

| | exemple | ce que ça fait au calcul |
|---|---|---|
| **① un apport pesé** | le shaker, 60 g d'avoine | **retire des calories** de la journée |
| **② un à-côté du plat** | pain, fromage, dessert, entrée | **change la part** que le plat composé porte |
| **③ une tendance** | « elle mange une pomme le matin » | **change le choix** des aliments, jamais le budget |

**Et un quatrième, qui n'est pas une habitude :** le rituel (« la pizza du
vendredi »). Là, **on ne compose rien du tout** et on ne compense pas ailleurs.
Le support existe (`household_traditions`) et il n'a **pas d'écran** — personne ne
peut le déclarer aujourd'hui.

### La décision : le plan compose TOUT ce qu'il peut

⟳ **L'état du code a changé le 2026-08-20 et cette section le décrivait périmé.**
La part du plat est **déjà calculée par bouche** depuis trois cases déclarées ;
**42 % est le repli des fiches muettes**, et un compteur dit combien de bouches y
sont. Ce qui reste à décider n'est donc plus « tuer la convention » — c'est
**(a)** l'ENTRÉE/la soupe, seul composant de la décomposition d'origine que la
fiche ne demande pas, et **(b)** si le plan **COMPOSE** ces à-côtés au lieu de
seulement les compter.

⚠️ **Ce que ça coûte, et il faut le savoir :**
1. **Ça prescrit.** Aujourd'hui les cases « lisent ce que la personne prend
   déjà ». Si le plan compose le dessert, il le **recommande**. C'est une ligne
   produit qu'on franchit, pas une conséquence technique.
2. **Le plan double de volume**, sur une lane dont le timeout est de **cinq minutes** (`PLAN_HTTP_TIMEOUT_MS = 300_000`), sous un worker qui coupe à 400 s.
3. **Un défaut silencieux se réveille** : la clé de répartition de la journée ne
   connaît que trois moments sur six. Une habitude composée à 16h30 apporterait
   de l'énergie réelle en comptant pour zéro — **le facteur sortirait trop petit,
   toujours, dans le sens qui sous-nourrit.** Les six moments doivent recevoir un
   poids **dans le même lot**.
4. ⟳ ⛔ **ÇA AUGMENTE LA VARIÉTÉ INTRA-REPAS — le seul coût qui soit MESURÉ.**
   Composer entrée + plat + pain + fromage + dessert, c'est ajouter de la variété
   sensorielle **à l'intérieur d'un repas**, sur les classes exactes que §2.10
   nomme comme la pompe à calories (g de Hedges = 0,405).

> **La règle qui réconcilie les deux :** le plan **COMPOSE** ces composants — pour
> que le budget cesse de mentir — mais **NE LES VARIE PAS**. Même pain, même
> fromage, même dessert dans un repas et à travers la fenêtre ; varié seulement
> d'un jour à l'autre. Et il n'en **AJOUTE jamais un que la personne n'a pas
> déclaré**.

⚠️ **Et ça se mesure** : si composer le dessert fait monter l'énergie de la
journée, la décision se rouvre.

### Comment on transforme une phrase en lignes d'aliments

1. **On propose une douzaine de goûters courants, déjà résolus**, à cocher
   (tartine beurre, croissant, yaourt, fruit, café au lait…). Cocher est
   instantané et exact.
2. **Une ligne de texte libre** pour tout le reste.
3. **Un appel modèle la traduit** en aliments, matchés contre le référentiel.
4. ⛔ **On remontre les ALIMENTS, jamais les grammes** (§4.4). La personne ajuste
   avec *small / moderate / large*.
6. **C'est stocké résolu.** Le modèle n'est plus rappelé — zéro latence ajoutée à
   la génération du plan.

**Si la traduction rate :** l'habitude reste du texte. Elle atteint quand même le
prompt (le plan ne compose donc rien à ce moment-là), elle **ne retire rien**, et
elle est **comptée**. Jamais un zéro silencieux.

### Pourquoi la précision n'a pas d'importance ici

Une tartine + un chocolat chaud, c'est entre 250 et 350 kcal.

| | erreur sur une journée à 2 000 kcal |
|---|---|
| on la compte à 300 alors qu'elle fait 350 | **2,5 %** |
| **on ne la compte pas du tout (aujourd'hui)** | **15 %** |
| l'incertitude de la cible elle-même | **20-30 %** |

**L'alternative à un compte approximatif n'est pas un compte exact — c'est zéro.**
Et zéro est six fois plus faux.

⚠️ **Mais l'erreur va dans les DEUX sens, et une seule est comptée.** Une
habitude non résolue ne retire rien ⇒ on sur-sert (et c'est compté). Une habitude
**sur**-résolue (250 ml de chocolat quand la personne en boit 150) retire trop ⇒
on sous-sert, **en silence**. Il faut un compteur des deux côtés.

## 2.4 Les vitamines : comment on garantit, et ce qu'on ne garantit pas

### Le principe

On ne compte pas de milligrammes. On vise les **repères de consommation** — du
poisson deux fois par semaine, des légumes secs deux fois, des céréales
complètes chaque jour — qui sont la traduction en aliments des références
nutritionnelles.

### ⚠️ Trois choses à ne PAS promettre

**① « Respecter les repères garantit la couverture » est faux**, et c'est
l'organisme qui les a construits qui le dit. Pour que son optimisation aboutisse,
l'ANSES a dû **relâcher la vitamine D, les fibres chez les femmes, et le fer chez
les femmes à besoin élevé**. La formulation défendable est : *« les repères sont
dérivés des références par optimisation sous contrainte, et en couvrent la
plupart, avec des exceptions nommées. »*

**② « Jamais de milligrammes » est faux — le milligramme est déjà là.** Les
drapeaux du référentiel (`iron_source`, `b12Source`…) sont le seuil réglementaire
« source de » : **15 % de la valeur nutritionnelle de référence pour 100 g**.
C'est un milligramme, avec un dénominateur figé à 100 g, et personne ne peut
l'auditer. La règle honnête est : **aucun milligramme MONTRÉ, aucun milligramme
ADDITIONNÉ** — et le seuil des drapeaux est nommé pour ce qu'il est.

**③ La garantie de fréquence n'est pas implémentée.** Aujourd'hui un nutriment est
marqué couvert dès qu'**un** aliment résolu porte le drapeau, sans quantité et
sans compter les occasions : **20 g de saumon fumé éteignent l'oméga-3 marin pour
toute la fenêtre**. Et les fenêtres font 1 à 7 jours, alors qu'on refuse déjà de
juger une sentinelle sous 7 jours. **Il n'existe aucun registre d'une fenêtre à
la suivante.** Une vraie garantie de fréquence est un lot à part entière.

### ⟳ ⛔ « PILOTER LA MATRICE » — ÉCARTÉ, ET C'ÉTAIT MON IDÉE

J'avais écrit qu'un fer variant d'un facteur 3 selon le repas était un argument
pour **piloter la matrice** (« mets un agrume avec les lentilles, pas de thé au
repas riche en fer »). **La contre-épreuve l'écarte.**

> Sur un repas-test **isolé, à jeun**, une boisson peut faire varier l'absorption
> du fer non héminique d'un facteur 5 à 20. **Ces chiffres décrivent une
> expérience de laboratoire, pas un dîner.** Sur un régime complet, l'effet de
> chaque composant pris isolément est nettement plus faible — sans être nul : le
> profil général du régime reste un facteur 2 à 3 (Hurrell & Egli 2010).

Et surtout : **ce qui décide de l'absorption, c'est le STOCK DE FER de la
personne, pas la composition de l'assiette.** Le terme individuel écrase le terme
alimentaire **d'un ordre de grandeur** — et ce stock, on ne le connaît pas.

**Ce qui tombe :**
- ⛔ « pas de laitage au repas riche en fer » — inhibition aiguë réelle, **aucune
  dégradation du statut en fer à long terme** ;
- ⛔ le décalage thé/café d'une heure — un seul essai, **12 personnes**.

**Ce qui survit, et c'est tout :**
- ✅ **zinc × phytates**, le seul effet de matrice assez grand pour être encodé —
  et comme un **décalage de la cible journalière**, jamais comme une règle de
  repas. Le zinc varie d'un facteur 1,7 selon les phytates, et il n'y a **pas de
  sauvetage par adaptation**.

⚠️ **Ça rend une semaine « à dominante légumineuses et céréales complètes » plus
coûteuse qu'elle n'en a l'air** : elle monte le zinc requis en même temps qu'elle
baisse le zinc absorbé.

### Ce que l'assiette ne peut PAS garantir, et qu'il faut nommer

- **La vitamine D** : la référence suppose une exposition au soleil ; par
  l'alimentation seule elle est hors d'atteinte. C'est un drapeau, pas une cible.
- **La B12 en régime végétalien** : l'alimentation n'en apporte pas. Un
  supplément, ou rien.
- **Le fer chez une femme à pertes élevées** : l'optimisation officielle
  elle-même n'y arrive pas.

## 2.5 ⟳ Les trous que personne ne regarde

**Le sel.** 9 à 10 g/jour en France contre moins de 5 recommandés. Ce produit
compose des mijotés, des sauces et des bouillons, et il n'a ni contrainte, ni
compteur, ni mention. ⟳ **Pire que je ne le pensais : `sodium_mg` n'existe même
pas dans le référentiel.** Ni `sugars_g`. Les deux sont dans CIQUAL et
s'importent. C'est le seul nutriment où le produit fait activement du mal sans le
voir.

**L'alcool.** Il est **dans le référentiel** (bière, vin, groupe `alcohol` dédié,
alias) et il n'est **jamais demandé**. C'est le poste le plus sous-déclaré après
le grignotage, le deuxième plus dense après l'huile — « un verre de vin le soir »
non résolu, c'est 500 à 900 kcal par semaine invisibles. ⟳ Et c'est le **premier
candidat d'explication** que le détecteur de divergence de poids devrait proposer
quand le poids ne suit pas ; aujourd'hui il pose une question ouverte.

⟳ **Les fibres montent trop vite.** Nos deux recommandations prioritaires
(baisser la densité par le volume de légumes, une semaine à dominante
légumineuses) poussent les fibres **fort et d'un coup** : d'environ 20 à 35 g/j.
Les symptômes digestifs qui suivent se lisent « **le plan ne me va pas** » —
c'est-à-dire une attaque directe sur l'adhérence, la seule métrique qui compte.
**Il faut une rampe sur deux ou trois plans**, et poser la question du côlon
irritable au même endroit que les allergies.

⟳ **Les fréquences n'ont qu'un plancher, jamais de plafond.** « Du poisson gras
≥ 2×/semaine » sans borne haute est une pompe à sens unique, et le mercure a une
limite officielle. Le plafond doit vivre **dans le même objet** que le plancher,
sinon les deux divergeront.

⟳ **Aliment × médicament.** Le dépôt connaît déjà « vitamine K antagonise la
warfarine » — pour une **gélule** de K2 prescrite par un coach. Il ne l'applique
pas à 300 g d'épinards. Or notre levier n°1 (§2.9) est précisément d'augmenter le
volume de légumes verts. **Deux issues honnêtes seulement** : soit on demande les
anticoagulants oraux et on tient **STABLE** ce contre quoi la warfarine est
titrée, soit on déclare que le produit ne traite pas l'interaction aliment ×
médicament — et on l'écrit dans `MODEL.md`.

⛔ ⟳ **ET LA GRANDEUR N'EST PAS LES GRAMMES DE VERT — CE SONT LES µg DE
VITAMINE K.** À masse constante, changer d'espèce fait varier K de **deux ordres
de grandeur** : épinard ≈ 480 µg/100 g, kale ≈ 700, brocoli ≈ 140, courgette ≈ 5,
tomate ≈ 8. **200 g d'épinard ≈ 960 µg ; 200 g de courgette ≈ 10 µg.** Donc §2.10
(« varier les légumes ») **défait la garde sans changer un seul gramme.**

⇒ La garde exige **une colonne vitamine K au référentiel** (à poser avec l'import
CIQUAL du lot 5), ou une liste fermée d'aliments à K élevé tenue à fréquence
fixe. Et sur cette lane, `lower_density` doit servir des volumineux à **K bas**
(courgette, tomate, concombre, bouillon) — ou être désactivé.

## 2.6 D'où vient la dose — la question que la règle 4 laissait ouverte

Si on n'envoie aucun gramme au modèle, qu'est-ce qui fait que les quantités
correspondent à l'objectif, au corps, à l'âge de cette personne-là ?

### La chaîne, et où chaque entrée entre

```
poids, taille, âge, sexe   ->  Mifflin              ->  entretien kcal/j
activité, appétit          ->  x facteur            ->  entretien ajusté
objectif + rythme visé     ->  executedPaceFor      ->  +/- l'écart   [portes TCA / mineur / coach]
quels repas elle déclare   ->  dayCoverageOf        ->  part de la journée que le plan porte
ce qu'elle prend à côté    ->  composedDishShare    ->  part du repas que le plat porte
                           =  LA CIBLE DE CE PLAT, POUR CETTE BOUCHE

LA CIBLE  /  ce que le plat LIVRE  =  facteur  ->  grammes
                    ^
                    calculé sur les aliments que le modèle a NOMMÉS, via le référentiel
```

⛔ **UNE RÈGLE À ÉCRIRE AVANT LE LOT 10, SINON IL ARME UN DOUBLE COMPTAGE.**

> **Une occasion couverte par une habitude résolue SORT DU DÉNOMINATEUR de
> `dayCoverageOf` et NE SE SOUSTRAIT PAS EN PLUS.**

Sans ça, un goûter résolu à 16h30 est retiré **deux fois** du budget : une fois
comme soustraction de ses kcal (§2.3 ①), une fois parce que son occasion quitte
la part que le plan porte. La soustraction ① est **réservée aux apports situés à
l'INTÉRIEUR d'une occasion que le plan compose** — le shaker au petit-déjeuner.
Les lots 2 et 10 sont donc **une seule porte**, avec une mesure avant/après.

**Tout est au numérateur. Rien n'atteint le modèle.** Ce n'est pas seulement un
choix de conception : les portions sont lisibles par **tout le foyer**, donc
aucun fait de corps ne peut y transiter.

### Ce que la structure fait, et qu'un facteur ne sait pas faire

**① Un facteur ne crée pas ce qui n'est pas là.** Multiplier par 1,7 un plat sans
protéine rend un plat sans protéine, en plus gros.

**② Un facteur est BORNÉ, et les bornes mordent.** `ANCHOR_FACTOR_MAX = 3,00`,
plus un plafond physique de `MEAL_MAX_GRAMS_PER_KG = 8` g d'aliment prêt par kilo
de corps et par repas.

⚠️ **Mesuré sur un run réel** : les trois bouches-jours ancrées sortaient **toutes
les trois exactement au plafond** (×1,600 à l'époque). Deux cibles très
différentes rendaient le même facteur, donc les mêmes grammes — le défaut que ce
chantier existe pour corriger, **reproduit par sa propre ceinture**. Le plafond a
dû être relevé à 3,00. *Une borne qui mord sur la population entière n'est plus
une borne, c'est le calcul.*

**③ La DENSITÉ décide si la cible est atteignable.** Un plat mixte pèse 1,3 à
1,6 kcal/g ; une soupe de légumes 0,4. Pour une même cible de 800 kcal :

| ce que le modèle a composé | grammes nécessaires |
|---|---|
| plat structuré (protéine + féculent + légume + gras) | **~550 g** — le facteur atterrit près de 1 |
| soupe de légumes | **~2 000 g** — inatteignable, le plafond mord |

⇒ **La structure met le plat dans la zone de densité où un facteur raisonnable
suffit.** Sans elle, le facteur travaille CONTRE la composition au lieu de
l'ajuster.

### Quand le plafond mord quand même

C'est prévu et voulu : **on ne sert pas un volume que personne ne finit.** L'écart
est compté, et la réparation est de **composer plus dense**, jamais de gonfler
l'assiette. La masse d'une assiette n'est pas la variable d'ajustement de
l'énergie.

### ⛔ Et pourquoi on ne peut PAS soulager le facteur en envoyant une taille

Essayé et mesuré **deux fois** :
- le modèle découpait par CLASSE et le moteur multipliait par-dessus — double
  comptage : l'ado dont le corps demande **2,03×** la part de l'adulte en
  recevait **1,02×** ;
- sur un autre run, il a recopié le facteur dans le texte visible :
  *« Zoé : 0,85 de la part de Marc »*, lu à voix haute à table.

C'est pourquoi la consigne actuelle ORDONNE l'uniformité (« the SAME ordinary
figure — one plate's worth »). Elle ne tombera que le jour où le moteur cessera
de multiplier.

### ⚠️ Le point faible, nommé

La correction fait **tout** le travail, et elle force. Le vrai levier n'est pas
d'envoyer plus de nombres : c'est de faire monter le **taux de journées
calculables** (§3.1 : 11,7 % en foyer, 2,9 % en solo). Tant qu'il est là, le
facteur s'abstient huit fois sur neuf et c'est le « one plate's worth » du modèle
qui gouverne — c'est-à-dire le 450 g pour tout le monde.

## 2.7 La méthode donnée au modèle

Aujourd'hui le prompt est **19 sections de règles et zéro procédure**. Rien ne dit
« d'abord ça, ensuite ça ».

⚠️ **Mais « chaque étape doit être vérifiable » est insatisfiable pour la moitié
d'entre elles.** Le modèle rend **un** objet JSON : le moteur voit le résultat,
jamais le déroulé. « Regarde ce qui est verrouillé » ne laisse aucune trace.

**Règle corrigée : on n'écrit que les étapes qui laissent une trace dans le
résultat.** Une étape non falsifiable donne l'illusion d'un contrôle et allonge un
prompt qui expire déjà.

## 2.8 Le foyer : le diagnostic est juste, l'ordre était faux

La lane foyer n'a aucun verdict, aucune mesure, aucune correction. **Mais elle n'a
pas encore d'ENTRÉE à vérifier** : sur les plans de foyer vivants en base, **aucun
ne porte de boîte**. Sans boîte, on ne sait pas quel plat nourrit quelle bouche,
donc tout le calcul par personne s'abstient.

⇒ **On fait d'abord exister la boîte. On la vérifie ensuite.**

⚠️ **Et vérifier ne veut pas dire corriger.** Le module de verdict porte en titre
*« ce que le moteur pense d'une assiette, et qu'il ne dit à personne »*. Poser une
boucle de correction dans un dîner de famille demande de trancher, **avant** :
qui voit le verdict, et est-ce qu'une personne protégée peut voir sa portion
bouger à cause de la cible de quelqu'un d'autre.

---
---

## 2.9 ⟳⟳ LA DENSITÉ ÉNERGÉTIQUE — et le dispositif qui décide de qui en profite

**Réécrit une seconde fois le 2026-08-20 après la contre-épreuve de cohérence,
qui a trouvé une erreur de raisonnement dans la première version.**

### La mesure

> Sur 38 ECR (Klos, *Eur J Nutr* 2023), passer une densité de ~1,5 à ~1,1 kcal/g
> réduit l'apport de **223 kcal** (IC95 % −186 à −260) pour un poids d'aliment
> **inchangé** (+20 g). Deux fois plus puissant que la portion dans la seule
> étude qui met les deux en concurrence (Rolls, *AJCN* 2006). Sur un an :
> **1,5 kg** de perte supplémentaire (Ello-Martin 2007).

### ⛔ ET LE DISPOSITIF S'INVERSE CHEZ NOUS — C'ÉTAIT MON ERREUR

Klos mesure **en ad libitum** : c'est la personne qui fixe le **poids** qu'elle
mange, et l'**énergie** est la sortie qui baisse.

**Notre moteur fait l'inverse exact** (§2.6) : l'**énergie est épinglée** (la
cible du plat), et le **poids est la variable libre** (`grammes = cible ÷ densité
livrée`).

⇒ **Dans notre chaîne, baisser la densité ne retire pas une seule kcal à une
bouche boîtée. Elle fait monter les grammes jusqu'à ce que la même cible soit
atteinte.** J'avais écrit « on mange autant, en poids » : chez nous c'est
**on mange autant en ÉNERGIE, et davantage en POIDS**.

**Et j'avais désigné `fat_loss` comme première bénéficiaire** — c'est-à-dire
très exactement **la seule bouche qui reçoive une boîte pesée**, donc la seule
où l'effet est structurellement annulé.

### Ce que la densité achète, par bouche

| | dispositif | ce que la densité fait |
|---|---|---|
| **bouche BOÎTÉE** (`fat_loss`, `muscle_gain`) | énergie épinglée | ⛔ **pas 223 kcal.** Elle achète du **VOLUME à énergie constante** — donc de la satiété, et moins de reprise ailleurs dans la journée. Bénéfice réel, mais **indirect et non mesuré chez nous.** |
| **bouches du PLAT COMMUN** | **ad libitum** — ni cible, ni boîte | ✅ **C'est là, et là seulement, que l'effet de Klos s'applique tel qu'il est mesuré.** |

⚠️ **C'est un renversement produit, pas un détail.** Le levier le mieux prouvé du
dossier sert **la majorité du foyer** — les gens qui n'ont posé aucun objectif et
pour qui le produit n'avait, jusqu'ici, **aucun mécanisme**. C'était un trou
ouvert du design ; la densité le referme.

### ⛔ ET LA CIBLE DE DENSITÉ SE HEURTE AU PLAFOND DE MASSE

Le plafond physique mord quand `masse = E/D > 8 × poids`, c'est-à-dire quand
`D < E / (8 × poids)`. **L'inégalité de faisabilité est donc :**

```
D  ≥  E / (8 × W)
```

Chiffré à `D = 1,3` (le plafond `fat_loss` actuel) :

| plat | poids minimum de la bouche pour que ce soit faisable |
|---|---|
| 800 kcal | **≥ 77 kg** |
| 600 kcal | ≥ 58 kg |
| 500 kcal | ≥ 48 kg |

**Sous cette ligne, respecter la densité fait franchir le plafond de masse** — et
§2.6 prescrit alors littéralement l'inverse (« la réparation est de composer
plus dense »). **Deux réparations opposées du même événement, sur la même lane.**

**Tranché :** le **plafond physique gagne** (on ne sert pas un volume que
personne ne finit). La cible de densité se dégrade en

```
D_visée = max( 1,1 ;  E / (8 × W) )
```

et **l'abstention est COMPTÉE** — compteur absent du §3.4, à ajouter. Et la
phrase « composer plus dense » de §2.6 est **restreinte aux lanes non-`fat_loss`**.

⚠️ **La cible n'est pas 1,3.** `DENSITY_CEILING_FAT_LOSS = 1,3` reste un
**plafond** ; la valeur mesurée par Klos comme bras d'intervention est **1,1**.
`DENSITY_CEILING_DEFAULT = 1,8` reste un plafond et **ne devient jamais une
cible**.

### ⚠️ Et l'état du code n'est pas celui que j'ai décrit

La densité **est déjà** un axe de verdict et un jeton de correction **actionné**,
et sa phrase est déjà la bonne. Ce qui manque est plus étroit :
(a) qu'elle soit **visée à la composition** et pas seulement rattrapée en
relance ; (b) qu'elle passe **devant la protéine** sur une lane `fat_loss` — ce
qui exige de **renverser une hiérarchie écrite et argumentée**, et ne se fait pas
en passant.

### L'ordre des quatre gestes, et il n'est pas commutatif

1. **poser les questions du corps** (anticoagulant, côlon irritable) — §2.5 ;
2. **rampe fibres** sur deux ou trois plans ;
3. **baisser la densité** par le volume végétal ;
5. **varier les légumes** (§2.10) — ⚠️ étape **neutre en masse** : elle remplace
   un légume par trois, elle n'en ajoute pas un quatrième.

⛔ **Les gains de 3 et 4 ne s'additionnent pas** : le +48 g de variété est une
partie du volume de l'étape 3, pas un supplément. Les compter deux fois calibre
la rampe fibres trop bas.

## 2.10 ⟳ LA VARIÉTÉ EST DIRIGÉE — et « on varie tes repas » est un risque

> À l'échelle d'un repas, servir plus de variété **AUGMENTE** la consommation, en
> poids comme en énergie : g de Hedges = **0,405** (IC95 % 0,259-0,552), sur
> 30 études expérimentales (Embling, *AJCN* 2021). Mécanisme admis : le
> rassasiement sensoriel spécifique.

> **Sauf pour les légumes.** Servir plusieurs légumes sensoriellement distincts
> plutôt qu'un seul augmente la consommation de légumes de **48 ± 6 g** par repas
> — plus d'une demi-portion — et l'écart tient **même face au légume préféré du
> convive** (+25 ± 8 g ; p = 0,002). Dans cette étude, la consommation de légumes
> n'était pas liée à l'énergie du repas (Meengs, Roe & Rolls, *JAND* 2012, n = 66).

⛔ **La variété cesse d'être une promesse générale et devient une contrainte
DIRIGÉE :**

| | consigne |
|---|---|
| **légumes** | varier **activement**, plusieurs légumes distincts par plat principal |
| **féculents, sauces, matières grasses, desserts dans un même repas** | ⛔ **ne pas varier pour varier** — c'est une pompe à calories mesurée |
| **d'un jour à l'autre** | la variété sert l'adhérence et la couverture sentinelle, pas l'appétit — elle reste bienvenue |

⚠️ **À vérifier dans la copy produit et dans le prompt** : toute phrase qui promet
« des repas variés » comme un bénéfice en soi est à réécrire. Ce n'est pas une
question de marketing, c'est un effet mesuré à g = 0,405.

## 2.11 ⟳ LES TROIS PORTES QUI MANQUENT — et l'une rend malade

Ajouté après la revue. Ce ne sont pas des raffinements : ce sont des **états que
le produit ne sait pas représenter**, et pour lesquels il produit aujourd'hui une
sortie fausse **sans le savoir**.

### ⛔ ① La sécurité alimentaire du batch cooking

**C'est le modèle CENTRAL du produit, et le seul sujet du moteur où une erreur ne
fait pas un plan médiocre : elle rend malade.**

```ts
// meal_generation.ts:1760
export const MAX_FRIDGE_DAYS = 3;
// appliqué en `> 3` ⇒ cuit dimanche, mangé mercredi : ÇA PASSE
```

Trois défauts :
1. **3 jours contre les 48 h de la FSA britannique** — on est à 1,5× la borne
   officielle, sans conformité par juridiction ;
2. **ce n'est pas un refus, c'est un constat** — le code pousse une `issue`, il
   ne jette pas le plat. C'est la seule garde du moteur dont la violation est
   **physique**, et c'est la plus molle ;
3. **rien sur le refroidissement, rien sur « on ne réchauffe qu'une fois »** —
   ⟳ et la **congélation est dans le PROMPT, donc non garantie**, comme le riz et
   les produits de la mer. **Le sujet n'est pas l'absence de consigne : c'est
   qu'aucune consigne n'est VÉRIFIÉE.**

⛔ ⟳ **ET UN REFUS DUR À 48 H CHANGERAIT L'UNITÉ DE VALEUR DU PRODUIT.** Il
plafonnerait chaque session de cuisine à **deux jours de repas** — trois à quatre
sessions par semaine au lieu d'une ou deux — c'est-à-dire qu'il détruirait le
temps gagné, qui est ce que le produit vend. **La pièce qui réconcilie une
horloge de 48 h avec une cuisson hebdomadaire est la CONGÉLATION** : elle doit
donc entrer dans le lot 0, qui n'est plus « petit ». Et **la juridiction se
tranche** : 48 h (FSA) contre 72 h ailleurs, ce n'est pas la même borne.

✅ **Et le correctif est déjà à moitié écrit** : le **portionnement au
refroidissement** — la casserole répartie en contenants individuels **le jour de
la cuisson**, chacun réchauffé une seule fois — c'est **exactement notre protocole
de boîtes**. Il faut l'imposer et le dire, pas l'inventer.

### ⛔ ② La grossesse et l'allaitement n'existent pas

⟳ ⚠️ **CORRECTION, et elle change la nature du lot.** `pregnancy` **est un jeton
déjà reconnu, persisté et injecté au prompt** (`medical_condition_floor.ts:181`).
Ce qui manque n'est donc **pas une question à créer** — c'est un **LECTEUR à
brancher** : `conditionRef` n'est lu par **aucun calcul d'énergie**. Le geste est
plus petit et plus sûr que je ne l'avais écrit.

Trois défauts empilés qui ne se rattrapent pas :

1. **Le plafond de déficit « non débrayable » vaut 500 kcal/j — mais le bon
   chiffre en grossesse est ZÉRO.** Un plafond n'est pas un interdit. **Une femme
   enceinte qui déclare un objectif de perte reçoit aujourd'hui une boîte pesée
   en déficit.**
2. **Listeria** : le référentiel contient du saumon fumé, et le batch cooking est
   précisément le mode de conservation à risque.
3. Fer, folates et iode changent fortement — et la table sexe × âge (§2.2) ne le
   sait pas. **C'est l'exception qui rend cette table fausse dans le sens
   dangereux.**

**Le geste :** une question, par bouche. Si enceinte ou allaitante — déficit
**ANNULÉ** (pas plafonné), aucune boîte pesée, retrait du poisson fumé à froid,
des charcuteries crues et des fromages à pâte molle non cuits **pour cette bouche
seulement**.

### ⛔ ③ Les GLP-1

Zéro occurrence de `GLP-1|sémaglutide|tirzépatide`. **C'est aujourd'hui l'une des
plus grandes populations en perte de poids des pays visés**, et elle casse trois
hypothèses du moteur d'un coup :

- l'appétit réel est **très en dessous** de ce que notre cran à trois valeurs sait
  exprimer — l'estimateur reçoit une entrée hors de sa plage ;
- **le rythme est piloté par un prescripteur**, pas par notre curseur ;
- **la perte de masse maigre est le risque principal** — donc le plancher
  protéique devrait **MONTER**, pas rester où il est.

**Le geste minimal : une case qui fait TROIS choses**, pas une — sinon elle en
contredit deux autres du document :

1. **désactiver le rythme** en kg/semaine (le prescripteur pilote) ;
2. **exempter de `observed_below_floor`** (§2.1) — un apport très bas sous GLP-1
   est l'effet attendu du traitement, pas un signal de restriction ;
3. **SUSPENDRE le plafond IMC 30** sur la référence protéique (§2.2) — ici la
   perte de masse maigre est le risque principal, donc le plancher doit
   **monter**, et le plafond le ferait descendre.

⚠️ **Et ce domaine mérite sa propre revue**, avec les mêmes contre-épreuves que
les sept autres. C'est le manque le plus lourd en volume de population.

### ⟳ Une seule bande d'âge absente, et elle est EN BAS

⚠️ **Correction** : `AgeBand` porte bien `60_plus`, armé. Le trou est
**pédiatrique** — `MemberAgeState` ne connaît que `minor`, donc **un enfant de
8 mois est la même chose qu'un ado de 17 ans** pour le moteur, alors que les
bornes de plausibilité **admettent explicitement un nourrisson** (50 cm / 3 kg,
et le commentaire le dit). Et la garde « mineur » ne porte que sur les
**chiffres**, jamais sur les **aliments** : ni miel avant un an, ni formes à
risque d'étouffement.

# PARTIE 3 — LA PARTIE TECHNIQUE

## 3.1 L'état du code, mesuré

| | lane solo | lane foyer |
|---|---|---|
| taille | 3 145 l. | 6 385 l. |
| constructeur de prompt | **partagé** — `buildMealPrompt`, prompt système identique (14 734 car.) | idem + 2 suffixes, 15 blocs |
| corps → composition | ✅ `body: studentBody` | ❌ `body: null` (écrit, justifié) — le corps entre **par membre** dans le brief de portions |
| boîtes | ❌ jamais | ✅ mais `shares[]`, **pas** `items[]` |
| `verdictFor` / `assessCoverage` / `correctionPlanFor` | ✅ les trois | ❌ **aucun import** |
| relances modèle | 2 | 1 |
| modèle appelé | identique — `keelGenerationModel()`, timeout 300 s | idem |

**Chiffres de couverture, mesurés sur la base vivante** (résolveur slug+alias,
après pliage des préparations) :

```
plats calculables    foyer 107/239 = 44,8 %     solo  25/173 = 14,5 %
JOURS complets       foyer   9/77  = 11,7 %     solo   2/68  =  2,9 %
```

⛔ **La garde d'ancrage est au niveau du JOUR.** Elle ne peut donc s'armer que
sur ~12 % des journées de foyer et ~3 % des journées solo. **Tout design qui
suppose « le moteur calcule » doit d'abord relever ce chiffre.**

## 3.2 Le référentiel

- **923 lignes**, 2 601 alias, 30 groupes tous représentés, zéro alias orphelin.
- **7 drapeaux booléens**, aucune vitamine nommée : `omega3_marine` (35 lignes),
  `iron_source` (199), `calcium_source` (66), `iodine_source` (60),
  `zinc_source` (276), `b12_source` (284), `folate_source` (219).
- **Distribution brutale** : `red_meat` 288 lignes (31 % de la table),
  `non_starchy_veg` 94, `poultry` 73 — et à l'autre bout **`olive_oil` 1**,
  `water` 1, `lean_protein` 3, `alcohol` 2.
- **Bande interne large** : `red_meat` 81,5 → 744 kcal/100 g (p25 138, p75 271) ;
  `sauce_dressing` 0 → 693 ; `eggs` 48 → 660.
- `unit_grams` sur **70 lignes sur 923 (7,6 %)**. Un aliment connu sans masse
  d'usage **éteint le calcul du plat entier**.
- Chargé **en entier à chaque génération**, aucun cache.

⇒ **Le groupe ne prédit pas la densité.** Toute bande de grammes par groupe est
morte (§4.2).

## 3.3 Les points de branchement, avec leurs obstacles

### ① La correction des grammes

```ts
// household_portions.ts:2756
sizeBoxesFromTarget(
  meals: readonly SizableMeal[],
  preparations: readonly SizablePreparation[],
  factors: ReadonlyMap<string, number>,   // UN facteur par bouche
  sumToleranceRatio: number,
): BoxSizingResult
```

```ts
SizableShare = { memberId: string; grams: number }      // deux champs
SizableMeal  = { boxId, shares[], uses[] }
```

⛔ **Aucun de ces types ne porte d'ingrédient.** À ce moment-là, une boîte est un
scalaire de grammes. Le rôle n'existe nulle part.

**Quatre obstacles à une correction par rôle :**
1. Le rôle vient du référentiel, donc **uniquement sur les ingrédients résolus**
   (55 % des plats foyer et 85 % des plats solo en ont au moins un qui ne l'est pas).
   ⚠️ `DishIngredient.group` déclaré par le modèle **ne sert pas** : il n'est
   demandé que si un régime est déclaré, donc `null` sur la population nominale.
2. **La matière est dans la casserole**, partagée entre plusieurs jours et
   plusieurs bouches. Corriger une part touche la casserole de tout le monde.
3. L'étape 4 de la fonction **rabote toute la boîte au même ratio** pour préserver
   le rapport entre parts. Un facteur par rôle casserait cet invariant.
4. **La granularité n'est pas tranchée** : l'ancrage produit un facteur par jour,
   `sizeBoxesFromTarget` en prend un par plan (« on retient le plus proche de 1 »).

✅ **Bonne nouvelle** : au seul site d'appel, `CompositionIndex` et
`meal.preparations[].ingredients` sont **dans la portée**. Le rôle est calculable
là, sans nouvelle lecture.

⚠️ **Et il faut recoller les grammes à DEUX endroits** : sur l'objet interne, puis
sur le payload déjà sérialisé.

### ② Le verdict côté foyer

La chaîne solo, à rejouer :

```
foldPreparationsIntoDishes({dishes, preparations})
  → verdictFor({dishes, envelope, index, daysCovered, friedMethod, uncoverableSentinels})
  → assessCoverage({...})
  → correctionPlanFor({verdict, envelope, declarations, coverageFloorHit, offAxes})
  → insert meal_composition_verdicts
```

**Déjà là côté foyer :** `loadCompositionIndex`, et `mouthDayEnergy` qui appelle
`foldPreparationsIntoDishes` **avec exactement la même projection**. Le pliage et
le prorata sont donc déjà faits.

**Les cinq entrées manquantes, nommées :**
1. `envelope` — existe par bouche mais **n'est pas conservée** ; à capturer avant
   `resolveHousehold`
2. `uncoverableSentinels` — `strictestRegime` est calculé, `uncoverableSentinelsFor`
   n'est jamais appelé
3. `fixedIntakeInputs` — chargés mais pas projetés
4. `offAxes` — `offAxesFor(steering)` pas importé
5. `friedMethod` — `isFriedMethod` pas importé

**L'obstacle de schéma :** `meal_composition_verdicts` porte `user_id + meal_id`,
**sans `member_id`**. N lignes sont insérables mais rien ne dirait de quelle
bouche chacune parle. Migration, ou encapsulation dans le jsonb.

**Le coût :** une relance de correction est un second appel modèle de plusieurs
minutes, sur une lane dont le timeout est de cinq minutes (300 s), sous un worker à 400 s — ⟳ la marge est donc plus large que cet argument ne le supposait, et ce n'est plus le timeout qui interdit une seconde relance. C'est l'argument écrit qui a fait
choisir une seule relance côté foyer.

### ③ La résolution d'une habitude

`FixedIntake` a déjà **deux branches** :

```ts
| { nutrition?: "referential" }   // se résout contre food_composition_refs
| { nutrition: "declared";        // la personne lit son étiquette
    servingGrams: number;
    proteinGPerServing: number;
    energyKcalPerServing: number; }
```

Et `augmentedIndexFor(base, intakes)` **injecte les déclarés dans l'index**, donc
toute la chaîne (`resolveIngredient → gramsRawOf → nutrientsOf → verdictFor`)
marche sans changer un octet.

⛔ **Le défaut à corriger d'abord** : un apport déclaré est forcé dans
`foodGroupRef: "lean_protein"`. Le commentaire le dit lui-même :

> *« le jour où des apports déclarés NON protéiques apparaissent, ce champ doit
> venir de la déclaration, pas d'ici. »*

Une tartine ou un dessert, c'est ce jour-là. **Une Danette comptée comme protéine
maigre fausse l'ancre protéique du plan.**

**Précédents de résolution par modèle à réutiliser** : `food_fill.ts`
(`parseFillSelection` — le modèle propose, le catalogue valide, les rejets sont
comptés), `keepExcludedWithEvidence` (on ne garde que ce qui est traçable).
**Aucun matcher maison.**

### ④ Le recalcul quand une mesure change

⛔ **Il n'existe pas.** Vérifié : aucun trigger sur `student_body_measures`,
aucune fonction SQL ne recalcule une cible, **et aucun écrivain ne propage une
pesée vers `household_member_bodies.weight_kg`**. Les seuls écrivains de cette
table sont les upserts de `keel_household_set_member_body`.

⚠️ **Et l'ordre est à trancher** : une pesée déclenche à la fois le recalcul de
la cible et l'évaluation du plancher TCA. **Si la cible est recalculée en
premier, une perte rapide produit une cible plus basse avant que la garde
« perte rapide » ne s'arme.** Le plancher doit passer devant.

### ⑤ Le bloc de méthode dans le prompt

Deux invariants de fin à ne pas casser :
- `PRECEDENCE_BLOCK` (hiérarchie d'arbitrage 1→5) **en queue du message utilisateur**
- **le suffixe foyer reste le dernier** — « la contrainte la plus proche de la fin
  est lue comme la plus contraignante »

⇒ Un bloc de méthode se place **avant** les deux, jamais après.

## 3.4 Les compteurs

**Le canal réel est `console.log({tag: "keel...."})`** — 13 tags côté solo, 31
côté foyer — plus `generated_from` (jsonb sans schéma, 31 clés à la racine côté
solo, plus un bloc `household{}` côté foyer).

**Le patron à suivre** (`ANCHOR_REASONS`) : **toutes** les populations sont
comptées, y compris celles qui passent. Un compteur qui ne nomme que les refus ne
distingue pas « la porte a laissé passer » de « la porte n'a pas tourné ».

**Les compteurs à poser avant de construire :**

| compteur | dénominateur |
|---|---|
| plats dont **tous** les ingrédients portent un rôle | plats composés |
| habitudes résolues | habitudes déclarées |
| habitudes **sur**-résolues (§2.3) | habitudes résolues |
| corrections appliquées par rôle | parts corrigées |
| journées calculables | journées composées |
| `observed_below_floor` | bouches avec un déclaré **et** un corps |

⚠️ **Trois pièges de mesure, déjà payés :** jamais `grams_raw` en base (figé à la
génération) ; toujours **après pliage** (le taux DESCEND : 37,8 % → 28,6 %) ;
`coverage` et non `resolved.length` (96 % contre 69 % sur la même assiette).

⚠️ **Et la mesure par LANGUE n'a jamais été faite.** Le produit compose en anglais
et la base porte des plats français. Un design qui fait dépendre toute
l'arithmétique de la résolution doit connaître ce taux **dans les deux langues**
avant de s'armer.

## 3.5 Les valeurs de référence, avec leurs sources

⚠️ **Ne jamais confondre trois types de valeur.** Le **BNM/AR** couvre 50 % de la
population, la **RNP/PRI** 97,5 %, et un **AS/AI** n'est pas un besoin — c'est un
apport observé jugé satisfaisant. Sur les neuf nutriments ci-dessous, **quatre
sont des AS** : on ne peut donc pas écrire « vous êtes en dessous de votre
besoin » pour ceux-là.

| nutriment | valeur adulte | type | source | à savoir |
|---|---|---|---|---|
| fer, homme | 11 mg/j | RNP | EFSA 2017 · ANSES 2021 | NNR 2023 dit 9 |
| fer, femme réglée | **11 ou 16 mg/j** | RNP | ANSES 2021 | l'ANSES a **refusé** la valeur unique EFSA (16) : la distribution des pertes est exponentielle. Aucun critère objectif fourni pour trancher. |
| fer, femme ménopausée | 11 mg/j | RNP | EFSA · ANSES | déclencheur **physiologique**, pas un anniversaire |
| calcium 18-24 ans | 1 000 mg/j | RNP | EFSA · ANSES · NNR | **seule coupure d'âge intra-adulte**, et elle est à 25 ans |
| calcium ≥ 25 ans | 950 mg/j | RNP | idem | **aucune valeur senior** — ne pas la relever après 60 ans |
| vitamine B12 | 4 µg/j | **AS** | EFSA · ANSES · NNR | pas de distribution du besoin |
| vitamine C, homme | 110 mg/j | RNP | EFSA · ANSES | — |
| vitamine C, femme | **95 (EFSA) ou 110 (ANSES)** | RNP | — | l'ANSES ne différencie **pas** par sexe, l'EFSA si |
| vitamine D | 15 µg/j | **AS** | EFSA · ANSES | suppose une synthèse cutanée ; avec du soleil le besoin alimentaire peut être **nul** |
| zinc | 9,4-16,3 (H) · 7,5-12,7 (F) | RNP | EFSA | **varie selon les phytates**, facteur 1,7 |

**Repères de consommation** (Santé publique France 2019, dérivés par l'ANSES 2016) :
fruits et légumes ≥ 5/j (OMS : **≥ 400 g/j, hors pommes de terre**) · légumes secs
≥ 2×/sem · poisson 2×/sem dont un gras · céréales complètes chaque jour · fruits
à coque une petite poignée/j · viande rouge ≤ 500 g/sem · charcuterie ≤ 150 g/sem.

⚠️ **Périmètre officiel : hommes 18-64 ans, femmes 18-54 ans, en bonne santé.**
Hors périmètre : femmes ménopausées, enceintes, allaitantes, enfants, adolescents,
personnes âgées. **Chez le senior la direction s'inverse** — le repère
viande/poisson/œuf devient un **plancher**, pas un plafond.

⚠️ **Et ce sont des outils de POPULATION.** L'ANSES est explicite : « en aucun cas
des menus types à suivre à titre individuel ». Conclure d'un écart aux repères
qu'une personne est carencée est une erreur de raisonnement.

## 3.6 ⟳⟳ L'ordre des lots — révisé deux fois

⚠️ **Réordonné après la contre-épreuve de cohérence**, qui a trouvé cinq défauts
dans la version précédente : une porte manquante en tête, un lot inconstructible
placé avant sa dépendance, un numéro utilisé deux fois, une garde promise
« avant » puis planifiée « avec », et une affirmation fausse sur trois lignes.

### Les portes — elles ne sont pas des lots, elles précèdent tout

| | porte | pourquoi elle passe devant |
|---|---|---|
| **P0** | ⛔ **Qualification juridique** : on calcule un déficit **nominatif** et une prescription de portions pour des **tiers sans compte** (les bouches d'un foyer), en France. | **Le seul trou qui peut annuler le produit entier** plutôt que d'en dégrader une partie. C'est un coût de conseil, pas un lot. **Elle garde le lot 6**, qui fait précisément exister la boîte nominative. |
| **P1** | **Les questions du corps** : anticoagulants oraux, côlon irritable, grossesse/allaitement, GLP-1. | Quatre gardes du document sont écrites « à poser AVANT » leur lot. Sans cette porte, le lot 8 les recevrait « avec », ce qui est le contraire. |

### Les lots

| # | lot | change une assiette ? | coût |
|---|---|---|---|
| **−1** | ⛔ **Remplir `unit_grams`** sur les lignes qui apparaissent réellement dans les plans vivants, puis **remesurer le taux de journées calculables DANS LES DEUX LANGUES**, et **définir « journée calculable » une fois avec son dénominateur**. | non | mesure |
| **0** | ⛔ **La conservation devient un REFUS** + portionnement au refroidissement + **branche congélation** (§2.11 ①) + trancher la juridiction. | **oui — en retire** | moyen |
| **0 bis** | **Brancher `pregnancy`** (le jeton existe, le lecteur manque) : déficit ANNULÉ, éviction listeria. **GLP-1** : la case qui fait ses **trois** choses. | **oui — en retire** | petit |
| **1** | **Plafond du poids de référence protéique à l'IMC 30**, ⚠️ **et trancher le cas `60_plus`** (§2.2). | **oui** — protéine à la baisse chez le corpulent | une ligne |
| **2** | Les **6 moments** dans la clé de répartition. | **oui** — part du plan à la baisse | petit |
| **3** | **Retirer la date d'arrivée** ou la mettre en fourchette. | non | un écran |
| **4** | Le **groupe déclaré** sur un apport (`lean_protein` forcé). | **oui** — ancre protéique corrigée | petit |
| **5** | **`sodium_mg`, `sugars_g` et `vitamin_k_ug`** importés de CIQUAL. | non | import |
| **6** | ⚠️ *(gardé par P0)* Faire **exister la boîte** côté foyer (`items[]`). | non | lot |
| **7** | **Propagation d'une pesée** vers `household_member_bodies`, **et l'ordre plancher-TCA-avant-recalcul**. | non | lot |
| **8** | **Verdict foyer en OBSERVATION** — écrit, jamais actionné. | non | lot |
| **9** | **La densité devient une CIBLE** (§2.9), avec `D = max(1,1 ; E/(8W))` et son compteur d'abstention. ⚠️ Suppose P1 livrée. | **oui** | lot |
| **10** | **La variété dirigée** (§2.10) — ⚠️ **consigne ET un réglage persistant** : le cliquet `practical_constraints.variety` pousse la variété générale vers le haut et doit être **routé vers le volume végétal**. | **oui** | consigne + réglage |
| **11** | **Habitudes composées** — ⚠️ **une seule porte avec le lot 2** : une occasion couverte par une habitude résolue sort du dénominateur **et ne se soustrait pas en plus** (§2.6). | **oui** | lot |
| **12** | **Terme de perte cumulée** (−6 à 10 kcal/j/kg). ⚠️ **Exige le lot 7** *et* un **plancher ABSOLU** : le terme fait descendre l'estimation, donc le plancher relatif descend avec elle. | **oui** | solo : une requête · foyer : exige 7 |
| **13** | **Correction par rôle**, granularité tranchée (plan / jour / plat×bouche). | **oui** | lot |
| **14** | **Bloc de méthode**, étapes falsifiables seulement. | non | consigne |
| **15** | **Fréquence sentinelle** : occasions, registre inter-plans, **et plafonds**. | **oui** | lot |

⚠️ **Correction d'une affirmation fausse de la version précédente.** J'avais écrit
« les lots 0 à 7 ne changent aucune assiette ». **C'est faux pour 0, 0 bis, 1, 2
et 4** — et dans chaque cas c'est **l'effet recherché**. La formulation juste :

> **Les lots −1 à 8 ne changent aucune RÈGLE PRODUIT** — rien de nouveau n'est
> prescrit. Mais cinq d'entre eux changent les grammes, et chacun exige une
> **mesure avant/après sur les plans vivants, avec la direction attendue nommée.**

⚠️ Le sujet **`alcool`** (§2.5) n'est pas dans cette liste : il appartient à
l'entonnoir, pas au moteur. *(Il n'a pas de numéro — la version précédente lui en
donnait un déjà pris.)*

---
---

# PARTIE 4 — CE QUE LA VÉRIFICATION A TUÉ

Gardé ici pour que personne ne le reconstruise en croyant corriger un oubli.

## 4.1 ⛔ « L'habitude donne le niveau »

**Tué par trois mesures indépendantes.**

1. **Le déclaré est biaisé de −20 à −35 %** (OPEN/Subar 2003, eau doublement
   marquée ; Lichtman 1992 : −47 %), et Heitmann & Lissner 1995 montre que **le
   biais croît avec l'IMC et avec la préoccupation du poids**. Il est donc
   maximal **exactement sur la bouche `fat_loss`**. Cible = déclaré × 0,9 fait
   atterrir le plan au métabolisme de repos.
2. **Ça débranche le plancher d'énergie OPÉRANT.** ⟳ Correction : un plancher
   **absolu** existe bien (`ENERGY_FLOOR_KCAL` = 1 500 H / 1 200 F / 1 350 kcal/j,
   armé) — **mais il ne garde que le POIDS VISÉ à la saisie, jamais la cible
   quotidienne d'un plan déjà accepté.** Celui qui garde la cible est
   `energyFloorKcal = maintenance − 500`, **relatif**, qui n'existe que parce que
   la cible dérive de l'estimation. La proposition reste tuée, pour ce motif-là.
3. **Il n'y a pas de source d'observation.** La photo interdit toute kcal et tout
   gramme ; le tic de repas pèse 0,4 en preuve. Ce que décrivait le §2.3 est du
   **déclaré**, pas de l'observé.

**Ce qui le remplace :** l'estimation garde le niveau ; le déclaré est une pince
et une alarme (`observed_below_floor`).

## 4.2 ⛔ Les fourchettes de grammes par groupe envoyées au modèle

**Tué par la distribution du référentiel** : `red_meat` va de 81 à 744 kcal/100 g,
`olive_oil` n'a qu'une seule référence, `lean_protein` trois. **Le groupe ne
prédit pas la densité.** Une bande calculée dessus serait du bruit présenté comme
une contrainte.

## 4.3 ⛔ La correction en quatre facteurs (protéine / légume / féculent / gras)

**Tué par l'algèbre**, et ⟳ **le motif est corrigé depuis que §2.9 ajoute la
densité comme troisième cible.**

**① Le compte : 4 inconnues, 3 équations** (énergie, plancher protéique,
densité). **Toujours sous-déterminé.** La conclusion tient.

**② ⛔ ET LA DENSITÉ N'AJOUTE EN RÉALITÉ AUCUNE ÉQUATION — elle est invariante
d'échelle.** C'est la réponse mathématique à la question posée : si on multiplie
toutes les lignes d'un plat par le même facteur `f`, l'énergie est multipliée par
`f`, la masse aussi, donc

```
D = E / M   →   (f·E) / (f·M) = D      ← inchangée
```

**La densité est de degré 0** : elle ne contraint pas le dimensionnement, elle
contraint **la composition**. Elle se pose **en amont** (le choix des aliments,
le jeton `lower_density`), jamais dans le facteur.

⇒ **C'est exactement ce que §2.6 ③ disait déjà** : *« la structure met le plat
dans la zone de densité où un facteur raisonnable suffit »*. La densité et le
facteur travaillent à deux étages différents et ne se rencontrent jamais.

La fonction existante rend deux facteurs, et ce n'est pas un manque d'ambition.

**Ce qui le remplace :** deux facteurs maximum, et la correction se fait **là où
la matière est** (la casserole), pas sur le scalaire de la boîte.

## 4.4 ⛔ Remontrer les habitudes en aliments **et en grammes**

**Tué par la revue TCA.** Ça crée un **journal alimentaire chiffré** qui échappe à
toutes les gardes existantes, **par construction** : la liste des surfaces
protégées est une **liste de refus**, pas une liste d'autorisations — une surface
neuve n'y est donc pas. Et la garde d'énergie ne garde que le chiffre de kcal,
pas le gramme d'aliment.

**Aggravant :** l'artefact est **persistant**. Il survit à la levée du plancher
TCA et continue d'alimenter le calcul.

**Ce qui le remplace :** on remontre les **aliments**, avec *petite / normale /
grande*. ⚠️ Et ce vocabulaire **existe déjà** sous un autre nom (la bande de
portion de l'analyse photo : small / normal / large / unclear) — **le réutiliser**,
deux vocabulaires pour la même grandeur divergeraient.

## 4.5 ⛔ « Chaque étape de la méthode doit être vérifiable »

**Tué par la forme de la sortie** : le modèle rend **un** objet JSON. Le moteur
voit l'artefact, jamais le processus. Trois des six étapes ne laissent aucune
trace distinguable.

**Ce qui le remplace :** on n'écrit que les étapes qui laissent une trace.

---

## Les questions encore ouvertes

0. ⛔ **Le périmètre juridique.** On calcule un déficit énergétique **nominatif**,
   un rythme en kg/semaine et une date d'arrivée pour des personnes **qui n'ont
   pas de compte** — les bouches d'un foyer, dont le corps est saisi par le
   maître. Est-ce du conseil diététique réservé en France ? Le dossier de
   sécurité (plancher TCA, plafond 500 kcal/j, planchers 1500/1200) suffit-il ?
   **À faire qualifier avant le pilote payant** ; c'est la porte P0 du §3.6.
1. **Qui possède ce design ?** Les deux lanes portent **deux implémentations**
   de `cible/livré` qui ne partagent rien. On unifie, ou on assume deux moteurs ?
2. **Le conflit de casserole** : une bouche à objectif partage un plat avec une
   bouche protégée. Faire grossir la casserole change la part de la seconde. Qui
   gagne, et voit-elle sa portion bouger à cause de la cible d'un autre ?
3. **Ce que voit une personne quand son plancher se lève** : une boîte qui
   disparaît d'une table où celles des autres restent est **une soustraction
   lisible à table**.
4. **Régénérer est gratuit** : aucun plafond sur la composition. Avec une
   correction plus fine, régénérer jusqu'à obtenir la plus petite assiette
   devient productif.
5. **Le critère d'acceptation côté utilisateur.** Le produit n'affiche aucun
   chiffre : la seule preuve visible d'un bon dimensionnement est **une part que
   la personne reconnaît comme la sienne**. Rien ne mesure ça.
7. **RNP ou BNM ?** Un plan se compare à la RNP ; l'adéquation d'un individu se
   juge au BNM. Le choix change tous les verdicts de couverture.

---
---

# PARTIE 5 — SESSION DU 2026-08-21

Écrit après avoir déroulé la chaîne entière, à la main, sur un cas unique : homme,
28 ans, 1,86 m, 73 kg, journées assises, 3 à 4 séances de sport, **sans objectif**,
trois repas. Tout ce qui suit vient de ce déroulé ou d'une mesure sur la base
vivante — rien n'est raisonné à vide.

**Le détail technique et les lots sont en §5.4, tout en bas.** Ce qui suit est en
mots simples, exprès.

## 5.1 Ce qu'on a décidé — deux choses

### ① L'activité : même sans sport, la journée compte

Assis toute la journée, debout en mouvement, ou métier physique — **ça change le
besoin de 700 kcal par jour, avec zéro séance de sport.**

Les deux questions se combinent : la journée donne une base, chaque séance
hebdomadaire ajoute un cran. C'est déjà construit et dérivé de FAO/WHO/UNU 2004 ;
ce qui manque, c'est de s'assurer que **rien ne retombe sur une valeur devinée**
quand quelqu'un n'a pas répondu.

### ② Un aliment inconnu ne jette plus la journée

Aujourd'hui, un seul mot non reconnu — un yuzu, trois kilocalories — rend la
journée entière incalculable, parce que la cible d'un plat se calcule contre
l'énergie livrée sur **toute** la journée.

Demain : on ramasse tous les inconnus d'un plan, **un seul appel court** à un
petit modèle rapide, le calcul se fait, le plan continue, et la réponse **remplit
la table toute seule** pour la prochaine fois.

⛔ **La seule règle dure de ce système :** il crée un aliment **neuf**, jamais un
alias vers un aliment existant. Deux lignes `yuzu` en double sont inoffensives ;
un `laitue → lait` remplace un aliment par un autre, pour tout le monde,
définitivement — et ça ne ressemble pas à un bug, ça ressemble à une donnée.

## 5.2 Ce qu'on a trouvé de cassé — trois choses

### ① La règle « pas plus de 8 g par kilo » est trop serrée, et elle est à l'envers

Un grand gabarit a besoin de beaucoup de nourriture, et deux règles du design s'y
opposent : « fais des plats légers » et « ne sers pas plus de 8 g par kilo de
corps et par repas ». **Pour lui, les deux ne peuvent pas tenir ensemble.**

Et le plafond suit le **poids total** : une personne de 110 kg a droit à 880 g par
repas, une personne mince de 73 kg à 584 g. L'estomac ne grossit pas avec la masse
grasse. **La règle est la plus permissive exactement là où on voudrait qu'elle
serre.**

**DÉCIDÉ le 2026-08-21 — on retire le plafond de masse et on met un plancher de
densité à la place** : « pas moins de 0,8 kcal par gramme ». Les deux kilos de
soupe sont toujours refusés — c'est le cas pour lequel la ceinture existe — mais
un grand corps n'est plus puni.

⛔ **Ce qui a été ÉCARTÉ, pour que personne ne le repropose** : garder le plafond
et faire monter la densité à la place (`D = max(1,1 ; E/(8W))`). C'est
arithmétiquement correct et ça tient debout — mais ça prescrit 1,72 kcal/g au
grand gabarit, c'est-à-dire **moins de légumes à celui qui mange le plus**, ce
qui contredit frontalement la règle 5 du §1 et le repère des 400 g/jour.
Le défaut n'est pas la valeur du plafond, c'est **son indexation** : une ceinture
de satiété ne peut pas être proportionnelle à la masse grasse.

### ② Le répertoire est trop pauvre : 2,8 façons de nommer chaque aliment

Ce n'est **pas** un problème de langue : le français et l'anglais sont à égalité.
C'est qu'il n'existe qu'une ou deux façons de dire chaque chose, et que le modèle
écrit autrement.

**C'est ça qui fait que 97 % des journées ne se calculent pas.** Pas une couverture
d'aliments manquante — une pauvreté de formulations.

### ③ Une vieille règle coupe encore le besoin presque en deux

Tant que `composedDishShare` tourne, le moteur croit que l'assiette ne porte que
42 % du repas : **1 100 kcal au lieu de 2 600** sur la journée du cas travaillé.
Sa suppression est déjà actée dans ce document ; elle n'est pas faite, et tant
qu'elle vit **elle domine tous les autres réglages**.

## 5.3 Trois choses à ne pas oublier

**Le poids d'une assiette dépend de ce qu'il y a dedans.** À énergie égale : 387 g
sans légumes, 545 g avec. Un chiffre en grammes tout seul ne veut donc rien dire —
il faut le détail par composant. *(C'est la vraie raison de `items[]` plutôt qu'un
total, et ce document ne la donnait pas.)*

**Cru ou cuit : il faut toujours le préciser.** 110 g de riz cru font 286 g dans
l'assiette. Sans cette mention, un repas normal a l'air énorme — et on « répare »
un calcul qui était juste.

**Le modèle ne décide pas les quantités.** Il décide les **proportions** — combien
de poulet par rapport au riz — et le moteur écrase tout le reste ensuite. S'il
écrit deux fois moins, le facteur double et l'assiette finale est identique.
C'est pour ça qu'on ne lui envoie jamais de grammes, et cette section existe pour
que personne ne réessaie.

---

## 5.4 ⚙️ Le détail technique — ce que dit le code aujourd'hui, et ce qu'il faut faire

### Les mesures

| mesure | valeur | où |
|---|---|---|
| `food_composition_refs` | **923** | base locale, 2026-08-21 |
| `food_composition_aliases` | **2 601** ⇒ **2,8 formulations/aliment**, ~1,4 par langue | idem |
| alias à marqueur français / anglais | **709 / 692** — à égalité | idem |
| références sans aucun alias | **15** | idem |
| taux de résolution par ingrédient | ≈ **86 %**, *déduit* de `p²⁵ = 0,029` | jamais mesuré directement |
| journées calculables | 2,9 % solo · 11,7 % foyer | §3.1 |

⚠️ **Qualité de l'import CIQUAL** : `chinese_cabbageor_bok_choi` porte une faute
dans son slug, et son label est coupé en plein mot (« …from the island La »).
Un libellé tronqué ne peut porter aucun alias correct, dans aucune langue.

⚠️ **La puissance 25 est le vrai obstacle.** 86 % par ingrédient a l'air correct
isolément ; élevé à la puissance 25, ça donne 3 %. Atteindre 60 % de journées
demanderait **98 % par ingrédient** — sauf si l'abstention pesée et
l'auto-remplissage sont livrés, auquel cas ce seuil s'effondre et cesse d'être le
préalable de tout le reste.

### Le facteur d'activité, chiffré

`crossedActivityFactor(day, sport)` = `DAY_ACTIVITY_BASE[day] + 0,05 × séances`,
dérivé de FAO/WHO/UNU 2004 (`meal_envelope.ts`).

|  | pas de sport | 1 à 2 | 3 à 4 | 5 ou plus |
|---|---|---|---|---|
| `seated` | 1,45 | 1,53 | 1,63 | 1,73 |
| `on_feet` | 1,65 | 1,73 | 1,83 | 1,93 |
| `physical_job` | 1,85 | 1,93 | 2,03 | 2,13 |

⛔ **Le repli `ACTIVITY_FACTOR = 1,5` (source `assumed`) se trompe vers le BAS**,
pas vers le haut : **+3 %** sur un sédentaire (1,45), **−42 %** sur un métier
physique à 5 séances (2,13). Corriger « vers le bas » aggraverait le seul cas qui
casse.

⛔ **Deux estimateurs d'entretien coexistent et se contredisent selon le CORPS.**
`estimatedMaintenanceKcal` (Mifflin × PAL) porte un terme de **taille** et d'**âge** ;
`ACTIVITY_KCAL_PER_KG` (26-36, `energy_target.ts`) n'en porte aucun.

- 1,86 m / 73 kg / 28 ans, assis sans sport : **2 548** contre **1 898-2 117**.
  L'échelle kcal/kg lui attribue un **PAL de 1,08 à 1,20**, sous le plancher FAO
  de **1,40** que le rapport déclare non soutenable pour une vie libre.
- 1,65 m / 90 kg / 45 ans : 28,5 kcal/kg — les deux échelles **s'accordent**.

⇒ **Toute constante « par kilo » diverge de Mifflin d'autant plus que la personne
est grande, jeune et mince.** Avant de « corriger » l'une d'elles, vérifier le PAL
implicite qu'elle produit (`valeur × poids ÷ BMR`). Sous 1,40, c'est la constante
qui est fausse, pas le corps.

### Le plafond de masse, chiffré

La cible de densité (1,1-1,3 kcal/g) et `MEAL_MAX_GRAMS_PER_KG = 8` sur trois
repas (24 g/kg/jour) **ne coexistent que sous 31,2 kcal/kg/jour**. Le cas travaillé
est à **39,2**, et sa valeur la plus sédentaire possible est déjà **34,9** :
aucune réponse aux deux axes d'activité ne le fait rentrer.

#### ⚙️ Ce qui tourne AUJOURD'HUI — à lire avant d'implémenter

⚠️ **Ne pas lire ce lot comme « ajouter une protection ». Elle existe déjà.**
`MEAL_MAX_GRAMS_PER_KG` est **armé** dans `anchorFactorFor`. Ce que le lot change,
c'est de cesser de sanctionner **en même temps** le déjeuner légitime de 820 g.
Les deux tombent ensemble parce qu'une seule borne les juge, et qu'elle est en
grammes.

⛔ **ET LA BORNE ACTUELLE NE REFUSE PAS : ELLE RABOTE.** `physicalMax` plafonne le
FACTEUR, il ne rejette pas le plat :

```ts
const physicalMax = weightKg > 0 && day.maxMealGrams > 0
  ? (MEAL_MAX_GRAMS_PER_KG * weightKg) / day.maxMealGrams : Infinity;
```

Conséquence : la soupe de 2 508 g n'est pas renvoyée au modèle — elle est servie
**plus petite, sous la cible**. La personne est sous-nourrie, en silence. Le §2.6
écrit que « la réparation est de composer plus dense » : c'est l'intention, ce
n'est pas ce que fait ce code. **Le plancher de densité doit donc être un REFUS
avec recomposition, pas un second rabot** — sinon on aura changé la formule sans
changer le comportement.

⚠️ **Et le deuxième essai n'existe qu'en solo.** §3.1 : côté foyer, il n'y a ni
vérification, ni mesure, ni nouvel essai. Un refus côté foyer n'a aujourd'hui
personne pour le rattraper.

⚠️ **Les deux ceintures ne s'activent que sur une journée CALCULABLE** — 2,9 % en
solo, 11,7 % en foyer. Sur tout le reste, ni plafond ni plancher ne regardent quoi
que ce soit. **Livrer le lot 9 bis seul ne changerait le comportement que de 3 %
des journées** ; sa portée vient des lots 17 et 18.

⚠️ **Sans poids, aucune borne du tout.** `physicalMax` retombe sur `Infinity`
quand `weightKg` vaut 0 — cohérent, on ne borne pas ce qu'on ne mesure pas, mais
une fiche incomplète n'est alors tenue par rien. **Le plancher de densité n'a
besoin d'aucune donnée de corps** : il ferme ce trou au passage, et c'est un
argument de plus pour la bascule.

⇒ **Le lot 9 est à réécrire, pas seulement à rouvrir.** Sa formule
`D = max(1,1 ; E/(8W))` fait dépendre la densité prescrite du poids de la
personne — c'est la branche écartée en §5.2 ①. La forme décidée est l'inverse :
`MEAL_MAX_GRAMS_PER_KG` **disparaît**, et une seule borne la remplace,
`D >= 0,8 kcal/g`, identique pour tout le monde et indépendante du corps.

⚠️ **À vérifier avant de retirer la constante** : `mouth_anchor.ts` s'en sert
aussi pour calculer `physicalMax` dans `anchorFactorFor`
(`(MEAL_MAX_GRAMS_PER_KG × weightKg) / day.maxMealGrams`). Retirer le plafond
sans remplacer ce terme laisserait le facteur sans borne physique — la borne
`ANCHOR_FACTOR_MAX = 3,00` resterait seule, et §2.6 documente déjà qu'une borne
qui mord sur la population entière **devient le calcul** au lieu de le garder.

### L'abstention doit peser, pas compter

> **On s'abstient quand l'énergie NON RÉSOLUE dépasse une part de la cible (~5 %).
> Jamais parce qu'un ingrédient manque.**

Le groupe déclaré donne une **borne** même sur un aliment inconnu : 12 g de
« légume » vaut 1 à 12 kcal (0,4 % d'une journée) ; 130 g de « viande » vaut 105 à
962 kcal (jusqu'à 34 %). Le premier ne mérite pas qu'on jette la journée.

⚠️ **Ça ne contredit pas la règle 4 du §1.** La réfutation (`red_meat` 81-744
kcal/100 g) porte sur la **prédiction** d'une valeur, pas sur l'**encadrement**
d'une inconnue. Borner n'est pas estimer.

Déjà à moitié connu du dépôt : « la porte s'abstenait sur du sel », 69 % → 96 %.

### L'auto-remplissage — la forme exacte

```
plat écrit  ->  résolution contre refs + alias        -> [source: table]
            ->  les non résolus ramassés ENSEMBLE
            ->  UN appel court (Haiku 4.5), liste + groupe déclaré
            ->  { kcal_100g, protein_g, carbs_g, fat_g, fiber_g,
                  food_group_ref, yield_class }        -> [source: model]
            ->  le calcul se fait, le plan CONTINUE
            ->  la ligne part au SAS, avec un compteur d'occurrences
```

1. **Un seul appel par plan.** Un appel par ingrédient est un défaut de conception.
2. **Il ne peut jamais faire tomber le plan.** S'il rate, l'ingrédient part avec la
   borne de son groupe et le résidu est noté. Sinon on a déplacé le point de
   rupture d'un cran.
3. ⛔ **Aliment neuf, jamais un alias vers un existant.** Mode d'échec mesuré du
   dépôt : `laitue` → `lait`, **12 faux positifs sur 12**.
4. **Sas, pas écriture vivante.** Promotion sous condition : vu ≥ 3 fois, valeurs
   dans la bande mesurée de son groupe.

**Quatre compteurs obligatoires** — part de l'énergie venant de la table / du
modèle / d'une ligne promue, et **nombre d'inconnus par plan**. Ce dernier doit
baisser semaine après semaine ; sinon la table ne se remplit pas et on paie un
appel de plus pour rien.

*(Vérifié le 2026-08-21 : la ceinture allergènes tourne sur `allergen_catalog.ts`
et ses formes de surface, **pas** sur `food_composition_refs`. Un mauvais alias
fausse l'énergie ; il ne sert pas un allergène. Le risque est réel, il n'est pas
de sécurité.)*

### Ce que le modèle décide vraiment

Le niveau de la « part ordinaire » **s'annule exactement** — `facteur = cible ÷
livré`. Ce qui survit, ce sont **les proportions**, et rien d'autre. Deux endroits
où l'annulation cesse :

- **la borne** — il fallait ×3,15, `ANCHOR_FACTOR_MAX` est à 3,00, l'assiette sort
  54 kcal sous la cible ;
- **les proportions** — 44 g de protéines au lieu de 62 à énergie identique, quand
  le modèle met du riz là où il y avait du poulet. Aucun facteur ne répare ça.

⚠️ **Et aujourd'hui le modèle ne rend AUCUNE calorie, ni ne connaît la cible.** Il
ne vise rien. La proposition d'auto-remplissage ci-dessus est la première chose
qui lui fait produire une valeur — par ligne, jamais un total.

### ⛔ Ce que le cas 02 a révélé — trois trous, tous du même genre

*(Cas 02 = le cas 01 plus une allergie, un dégoût, un apport fixe, des habitudes
du soir, un appétit et un déjeuner pris à l'extérieur. Déroulé complet dans
`scratchpad/2026-08-21-CAS-01-SOLO-JOURNEE-3-REPAS.md` et sa suite.)*

#### ① Rien ne pilote la protéine

Le moteur ne corrige **qu'une seule grandeur** : les calories. `anchorFactorFor`
multiplie jusqu'à ce que l'énergie tombe juste ; la protéine, les fibres et le
reste **tombent où ils tombent**.

Mesuré sur le cas 02 : le plan livre 103 g de protéines là où sa part était 70 g.
Ça passe. Mais le **même dîner, à énergie identique**, avec plus de pommes de terre
et moins de poulet, atterrirait vers 60 g — et **rien dans la chaîne ne le
verrait**.

⚠️ **Et tout compte protéique est faux tant que les apports fixes sont invisibles.**
Le shaker de 15 g n'entre nulle part (voir ③). Un contrôle qui ne les voit pas se
trompe de 15 g dans le sens qui refuse à tort.

**⟳ MAIS « PILOTER LA PROTÉINE » EST IMPOSSIBLE, ET §4.3 LE DÉMONTRAIT DÉJÀ POUR
LA DENSITÉ.** Le rapport protéine ÷ énergie est **invariant d'échelle**, exactement
comme `D = E/M` : multiplier toutes les lignes par `f` ne le déplace pas. Et comme
l'énergie est déjà épinglée par la cible :

```
protéine livrée  =  cible d'énergie  ×  (protéine ÷ énergie de la COMPOSITION)
```

Le premier terme est donné. **La protéine est donc entièrement décidée par la
composition, avant tout facteur.** Un scalaire ne peut pas la corriger — ni
maintenant, ni avec deux facteurs, ni avec quatre. Ce n'est pas un manque du
design : c'est de l'algèbre, et c'est la même que celle du §4.3.

⇒ **LE CRITÈRE EST UN RAPPORT, PAS UN TOTAL**, et il tient en un nombre par
personne :

```
117 g ÷ 3 152 kcal  =  37,1 g de protéines pour 1 000 kcal
```

Vérifiable **sur la part ordinaire du modèle, avant toute arithmétique**, puisque
le rapport ne bouge pas à l'échelle. Sur le dîner du cas 02 : `67 ÷ 1 104` =
**60,7 g/1 000 kcal**, large. Sur la variante « plus de pommes de terre, moins de
poulet » à énergie identique : **36,2 ⇒ refusée** — exactement le cas que rien ne
voyait.

⚠️ **Le critère est aussi invariant à la COUVERTURE.** Dans le cas 02 la part du
plan est 70 g sur 1 891 kcal, soit `0,0371` à nouveau. Le même nombre, que le plan
porte la journée entière ou 60 % d'elle. Il n'y a donc **rien à renormaliser**.

⛔ **MAIS JUGÉ SUR LA JOURNÉE, LE VERDICT NE PEUT PAS SE FERMER À LA GÉNÉRATION.**
Dès qu'une occasion **estimée** existe dans le jour, sa protéine est inconnue tant
que le scan n'est pas arrivé. La porte a donc **deux moments** :

- **provisoire**, à la génération — sur les occasions composées, résolues et
  forfaitaires ;
- **définitif**, quand le scan referme l'occasion estimée.

⚠️ Sans ça, la porte rend un verdict le matin et **ne le reprend jamais** — un vert
qui ne veut rien dire.

⇒ **LES LOTS 20 ET 9 bis SONT LE MÊME LOT.** Densité et protéine sont deux
rapports, tous deux de degré 0, tous deux jugés sur la composition, tous deux
réparés par une **recomposition** et jamais par un facteur. Une seule porte les
porte, avec deux critères.

**⟳ ET LEUR GRANULARITÉ N'EST PAS LA MÊME — tranché le 2026-08-21 :**

| critère | jugé sur | pourquoi |
|---|---|---|
| **densité** `>= 0,8 kcal/g` | **chaque repas** | une assiette de 2,5 kg ne se rattrape pas le lendemain — elle est servie, ou elle ne l'est pas |
| **protéine** `>= 37 g / 1 000 kcal` | **la journée** | un petit-déjeuner sucré tombe toujours sous le seuil, et un dîner riche le rattrape largement. Juger par repas refuserait des petits-déjeuners parfaitement normaux |

⚠️ **Une porte, deux critères, deux portées.** Écrire « la porte juge le repas »
armerait le second au mauvais étage et produirait des refus que personne ne
comprendrait.

⇒ Ce qui reste propre au comptage est donc **petit** : faire entrer les apports
fixes dans le total *(sinon le rapport est faux)*, et **mesurer si
`protein_anchor.ts` mord** ou s'il est un lecteur sans écrivain. Personne ne l'a
mesuré.

#### ② Un dégoût qui porte un apport n'est PAS une préférence

`SPEC-REGIME-PAR-BOUCHE-20260814.md` porte déjà le bon geste sous **R5** — *« la
personne au régime différent reçoit son plat à elle »*. Mais **R3** de la même
spec écrit *« un régime n'est PAS une préférence »*, et un dégoût **est** une
préférence. Il ne déclenche donc aucune divergence : il retire l'aliment **pour
tout le monde**, ou il ne fait rien.

Les deux issues sont mauvaises. Retirer le poisson du plat commun prive six
personnes pour une ; ne rien faire sert du poisson à quelqu'un qui n'en mangera
pas. **Et dans les deux cas, l'apport que le poisson portait disparaît en silence.**

> **RÈGLE À AJOUTER : un dégoût est une préférence — SAUF quand l'aliment refusé
> porte un apport que rien d'autre dans le plan ne porte. Alors il déclenche une
> divergence de portion, exactement comme un régime (R5).**

⚠️ **Le test est MÉCANIQUE, pas une opinion.** `food_composition_refs` porte sept
drapeaux par aliment : `omega3_marine`, `iron_source`, `calcium_source`,
`iodine_source`, `zinc_source`, `b12_source`, `folate_source`. Retirer un aliment
retire ses drapeaux. **Si un drapeau tombe à zéro sur le plan entier, la divergence
est obligatoire.**

Trois issues, **dans cet ordre** :

1. **substituer** — un aliment accepté qui porte les mêmes drapeaux ;
2. sinon **diverger** — une portion à part pour cette bouche seulement ;
3. sinon **marquer INATTEIGNABLE**, et le compter.

**⛔ ET LA SUBSTITUTION SE DÉCIDE AVANT LE MODÈLE, PAS APRÈS.** C'est la
correction du 2026-08-21, et elle change l'étage :

> **Retirer un aliment, c'est retirer ses drapeaux. Une exclusion ne voyage donc
> JAMAIS seule — elle voyage avec l'ordre de remplacer ce qu'elle enlève.**

Le moteur, **avant** d'appeler le modèle : relève les drapeaux de l'aliment
refusé, interroge le référentiel pour savoir **qui d'autre les porte** parmi ce
que cette personne accepte, et pose une **exigence POSITIVE** dans le prompt —
« pas de poisson, **et** l'oméga-3 marin doit être porté ; candidats : huile
d'algue, œufs enrichis ».

⚠️ **C'est le même patron que la résolution d'un aliment inconnu (§5.3)** : le
moteur cherche en base et tend une **liste courte** ; le modèle choisit. Le moteur
ne désigne jamais l'aliment — il nomme toujours l'exigence. Deux problèmes
différents, une seule forme, et c'est la seule qui évite une table de substituts
maintenue à la main.

⇒ **La porte de sortie VÉRIFIE, elle ne RÉPARE pas.** Réparer après coup coûte
une régénération entière ; une exigence posée avant tombe juste du premier coup.
Écrire ce lot comme une correction a posteriori est le défaut à éviter.

#### ④ Tout ce qu'on compte n'est pas tout ce qu'on compose

⟳ **Corrigé le 2026-08-21, et ça renverse une décision du 2026-08-20.** La
décision « le plan compose TOUTES les habitudes » était trop large. On ne cuisine
ni le fromage ni le dessert : ils se prennent, ils ne se préparent pas.

| habitude | traitement | pourquoi |
|---|---|---|
| **pain** | **composé** | il fait partie de ce qu'on sert, il a un grammage |
| **fromage**, **dessert** | **forfait moyen**, retiré de la cible du repas | on ne les cuisine pas — on tient compte de ce que ça coûte |

⇒ **Un quatrième état d'occasion apparaît** : à côté de *composée*, *estimée* et
*inconnue*, il y a **forfaitaire** — connue par une convention, pas par une mesure
ni par un scan.

⚠️ **Bénéfice de bord, et il n'est pas petit** : la décision précédente
**prescrivait un dessert** à quelqu'un qui avait seulement dit qu'il en mangeait.
La mémoire du 2026-08-20 le notait comme « ligne produit franchie ». Le forfait la
referme — le produit **tient compte** du dessert au lieu de **l'ordonner**.

⚠️ **Les valeurs du forfait sont des DÉCISIONS, pas des mesures**, et elles doivent
porter leur source. Un « fromage » à 110 kcal et un « dessert » à 150 kcal sont des
conventions ; elles seront fausses pour qui mange 60 g de comté. **À rendre
révisable par personne** le jour où quelqu'un dit qu'il en mange beaucoup — sans
quoi on aura remplacé une prescription par une moyenne également silencieuse.

⚠️ **Et la porte de densité ne juge QUE ce qu'on sert.** Le fromage et le dessert
n'entrent pas dans le calcul `E/M` du plat : ils ne sont pas dans l'assiette qu'on
compose. Les y faire entrer fausserait la densité dans le sens qui laisse passer
des plats trop dilués.

⛔ **Le troisième état n'existe pas aujourd'hui, et c'est lui qui manque le plus.**
Un nutriment est « couvert » ou « pas couvert ». Il faut un troisième état —
**« impossible à couvrir dans ce que cette personne accepte »** — parce que
« pas encore » et « jamais » rendent aujourd'hui exactement le même silence.

⚠️ **Et « re-router sur des noix » est FAUX** — l'erreur a été commise pendant
cette session. La colonne s'appelle `omega3_marine` et le mot compte : le poisson
porte EPA/DHA, les noix et le colza portent de l'**ALA**, une autre molécule que
le corps convertit en EPA à ~5 % et en DHA à **moins de 1 %**. Le seul vrai
substitut alimentaire est **l'huile d'algue**. Un substitut doit porter le
**même drapeau**, pas un drapeau qui lui ressemble.

#### ③ Les six moments doivent tous compter, et porter leur NATURE

`EATING_OCCASIONS` en porte **six** ; `SLOT_DAY_WEIGHT` n'en pèse que **trois**.
Un apport réel placé sur un des trois autres — un shaker l'après-midi — apporte
de l'énergie sans peser dans la couverture, donc rend un facteur **trop petit,
systématiquement, dans le sens qui sous-nourrit**.

⚠️ **Rattacher le shaker à un moment ne suffit PAS.** Même rattaché à
l'après-midi il compterait zéro. **L'ordre est contraignant : peser les six
moments d'abord, rattacher les apports fixes ensuite.** Dans l'autre sens, le
rattachement ne fait rien et **ressemble à un lot qui marche**.

**La forme décidée — deux choses par moment, un POIDS et une NATURE :**

| moment | poids de base | nature |
|---|---|---|
| petit-déjeuner | 0,22 | repas |
| milieu de matinée | 0,06 | en-cas |
| déjeuner | 0,32 | repas |
| après-midi | 0,08 | en-cas |
| dîner | 0,28 | repas |
| avant le coucher | 0,04 | en-cas léger |

**Seuls les moments DÉCLARÉS sont gardés, et leurs poids sont ramenés à 1.**
Quelqu'un qui mange deux fois et quelqu'un qui mange cinq fois ne découpent pas la
même journée.

⚠️ **Propriété de non-régression, à tester** : le cas à trois moments retombe sur
les valeurs actuelles. `0,22/0,82 = 0,268` · `0,32/0,82 = 0,390` · `0,28/0,82 =
0,341`, contre 0,25 / 0,40 / 0,35 aujourd'hui. **Le changement ne déplace
quasiment rien pour la majorité** — c'est ce qui le rend livrable.

⚠️ **La NATURE contraint la composition, et elle est aussi importante que le
poids.** Un en-cas de l'après-midi n'est pas une assiette. Le modèle doit recevoir
**la nature du moment**, pas seulement son nom — sans quoi il composera des choux
de Bruxelles à 16 h, et le grammage aura beau être juste, personne ne le mangera.

⚠️ **Le double comptage est déjà réglé** par la règle du §2.6 : une occasion
couverte par une habitude résolue **sort du dénominateur** au lieu de se
soustraire en plus. Appliquée au shaker : l'après-midi sort, le reste se
renormalise, et rien n'est compté deux fois.

#### ⑤ La divergence est une VARIANTE du même plat — et le dénominateur doit suivre

Quand une bouche refuse un aliment qui porte un drapeau (§ ci-dessus ②), elle
reçoit sa propre version. **Pas un second plat : une variante.** La base est
partagée, un élément diffère.

**Ce que ça coûte dépend d'OÙ le drapeau se trouve dans le plat :**

| le porteur du drapeau est… | coût |
|---|---|
| **ajouté au dressage** *(l'huile d'algue versée sur sa portion)* | une casserole, un geste en plus — **quasi nul** |
| **le composant principal** *(remplacer le poisson lui-même)* | une **vraie seconde préparation** — et R5 dit que le temps de cuisine arbitre |

⛔ **ET L'ÉCHANGE N'EST PAS NEUTRE EN ÉNERGIE.**

```
retiré    saumon 130 g          260 kcal · 26 g de protéines
ajouté    poulet 120 g          198 kcal · 28 g
        + huile d'algue 3 g      27 kcal ·  0 g
                                ---------------
                                225 kcal · 28 g    ->  −35 kcal, +2 g
```

Sa version **livre 35 kcal de moins**. Sa portion doit donc être un peu plus
grosse — et `cible ÷ livré` le fait déjà, puisque **le facteur est calculé par
bouche**. Aucune règle nouvelle.

⚠️ **CE QUI EST NOUVEAU : le « livré » doit se calculer PAR VARIANTE.** Le moteur
le calcule aujourd'hui **une fois par plat**. Si les deux versions partagent le
même dénominateur, **celle qui diverge sort fausse** — et faux dans le sens qui
sous-nourrit exactement la bouche qu'on cherchait à protéger.

⛔ **ET LA FORME ACTUELLE NE PEUT MÊME PAS L'EXPRIMER.** Dans
`household_portions.ts`, une part est :

```ts
SizableShare = { memberId: string; grams: number }
```

**Un identifiant et un scalaire. Aucun ingrédient, aucun groupe.** Une part n'est
qu'un facteur posé sur un plat commun : il n'y a nulle part où écrire « la version
de cette bouche contient autre chose ».

⇒ **La v4 de la boîte est ce qui débloque ça** (`docs/keel/BOITES-PAR-REPAS.md`) :
`boxes[]` au pluriel, chacune avec ses `items[]` et ses `member_ids[]`. Une
variante devient **une boîte dont les items diffèrent**. La divergence n'est donc
pas un lot indépendant — elle **attend la v4**, et sans elle il n'y a pas de place
pour la porter.

#### ⑥ La capacité d'un appareil — la SEULE porte qui tourne APRÈS le facteur

Trouvé sur le cas 03 (équipement + plat de tradition, une journée).

Le modèle écrit une part ordinaire : **200 g de cuisses + 150 g de pommes
dauphine = 350 g**. Ça tient dans un panier d'air fryer en une couche, et le
modèle le sait — il compose des plats faisables.

Puis le moteur multiplie par **1,39**, parce que cette personne mange plus.
**487 g.** Ça ne tient plus.

Personne ne le voit :
- le modèle a vérifié la faisabilité — **mais sur 350 g, avant la multiplication** ;
- le moteur ne vérifie que l'énergie. Il ne sait pas ce qu'est un panier.

⇒ **La recette annonce « air fryer, 20 min ». La vraie cuisson en demande deux,
soit 40.** Sur un produit qui vend du **temps gagné**, annoncer la moitié du temps
réel est un mensonge sur exactement ce qu'on vend.

**⛔ ET ÇA COMPLÈTE UNE DISTINCTION QUE CE DOCUMENT N'AVAIT QU'À MOITIÉ :**

| contrainte | invariante d'échelle ? | jugée |
|---|---|---|
| **densité** `E/M` | **oui** — §4.3 | **avant** le facteur, sur la composition |
| **protéine** `P/E` | **oui** — même algèbre | **avant** le facteur, sur la composition |
| **capacité d'un appareil** | ⛔ **NON** — elle porte sur des grammes réels | ⛔ **après** le facteur |

C'est la **première et seule** porte qui doit tourner après le dimensionnement.
Posée avant, elle ne verrait jamais le problème.

⚠️ **ET CE N'EST PAS UNE PORTE DE REFUS.** Un plat qui ne tient pas dans le panier
n'est pas mal composé — il est **plus long à cuire**. Elle ne renvoie donc rien au
modèle : elle **corrige le mode d'emploi et le temps annoncé**.

> *« deux passages à l'air fryer : les cuisses d'abord, les pommes dauphine
> ensuite — 40 min au total »*

⚠️ **Ce qu'elle réclamerait** : une **capacité par appareil** et une estimation du
**volume d'un plat**. Le référentiel porte des grammes, pas des litres.

**⛔ ÉCARTÉE LE 2026-08-21 — DÉCISION DU PROPRIÉTAIRE.** On ne modélise **pas** la
capacité des appareils. On part du principe que **la quantité est proportionnelle
au nombre de bouches, et que la façon de la cuire est un problème que la personne
résout dans sa cuisine** — pas un problème du produit. Modéliser chaque appareil
est un puits sans fond pour un gain que celui qui cuisine obtient gratuitement en
regardant son plan de travail.

⚠️ **LE COÛT ACCEPTÉ, ET IL FAUT L'ÉCRIRE.** Sans cette porte, **le temps de
cuisson annoncé est faux dès qu'un appareil à panier entre en jeu, et il est faux
d'un facteur qui croît avec le nombre de portions** — un facteur 4 sur le cas 04.
Sur un produit qui vend du temps gagné, c'est le seul endroit où on ment sur ce
qu'on vend.

⇒ **CE QUI SURVIT DU LOT, ET QUI EST PETIT : ne pas annoncer un temps qu'on n'a
pas vérifié.** Soit le temps est présenté **pour une portion**, avec le nombre de
portions à côté, soit il n'est pas présenté. Un « 20 min » affiché pour une cuisson
de 80 est pire que pas de chiffre du tout.

#### ⑧ Les jours de cuisine sont DÉRIVÉS, jamais choisis

⚠️ **L'écran demande aujourd'hui « les jours où tu cuisines », et cette question
n'a pas de réponse libre.**

- il faut **toujours** cuisiner le **premier jour du plan** — rien n'est prêt avant ;
- et il faut **re-cuisiner dès que la conservation expire** — ce n'est pas un
  souhait, c'est une contrainte physique.

⇒ **Les jours de cuisine se CALCULENT** à partir de la fenêtre demandée et de la
règle de conservation. Les présenter comme un choix propose à quelqu'un de décider
d'une conséquence.

⚠️ **Ce qui reste légitime, c'est l'inverse** : « je **ne peux pas** cuisiner le
mercredi ». Ça, ce n'est pas un choix de jour de cuisine — c'est une **contrainte
qui déforme le plan** (son jour de départ, sa longueur, le nombre de sessions).
La question doit être posée dans ce sens-là, ou pas du tout.

#### ⑨ Ce que « 3 jours de conservation » veut dire — TRANCHÉ

Les deux lectures de `MAX_FRIDGE_DAYS = 3` donnaient des plans différents et rien
ne les départageait.

> **DÉCIDÉ le 2026-08-21 : jour de cuisson + 2.** Un plat cuisiné vendredi se mange
> **vendredi, samedi, dimanche**. Lundi est trop tard.

⇒ Sur une fenêtre de 5 jours : **deux sessions**, aux jours 1 et 4.

⚠️ **Et la fenêtre ne s'applique qu'aux occasions CUISINÉES À L'AVANCE.** Le
petit-déjeuner est **assemblé le matin même**, le shaker se prend tel quel, le
fromage et le dessert sont un forfait. Sur cinq jours, **5 des 15 occasions sortent
entièrement du problème** — il en reste 10 à faire tenir dans la fenêtre.

⇒ **Une occasion porte donc un CINQUIÈME attribut**, à côté de composée / estimée /
résolue / forfaitaire : **cuisinée à l'avance**, ou **assemblée sur le moment**.

#### ⑦ La tradition dit QUOI, l'équipement dit COMMENT

Un plat de tradition entre comme une **contrainte**, jamais comme une proposition :
le modèle ne le choisit pas, il le reçoit, et il adapte le reste de la journée
autour.

> **Les portes de SÉCURITÉ mordent. Les portes NUTRITIONNELLES ne le refusent
> pas — elles s'adaptent autour.**

Un couscous contenant de l'arachide est refusé. Un couscous pauvre en oméga-3 ne
l'est pas : **il n'appartient pas au produit de dire à quelqu'un que son plat de
famille est mal composé.**

⚠️ **Et quand la tradition et l'équipement se contredisent, c'est TOUJOURS le
COMMENT qui plie.** « Poulet rôti » sans four ne devient pas un autre plat : il
devient des cuisses à l'air fryer. Une seule des deux contraintes est négociable,
et c'est toujours la même.

⚠️ **La porte des drapeaux vit au niveau du PLAN, pas du jour** — sans quoi elle
refuserait ce couscous pour l'oméga-3 qu'il ne porte pas, alors qu'un autre soir
de la semaine le portera. **Une porte au mauvais niveau refuse ce qui est
légitime**, et c'est le troisième exemple de ce document après la protéine
(journée, pas repas) et la densité (repas, pas journée).

#### ⑩ Le budget — la seule porte qui dépend de l'échelle, et elle est incalculable

Trouvé sur le cas 05 (date, durée de session, budget — une journée).

**Le coût est de degré 1**, pas 0 : `coût = Σ q·prix`. Multiplier le plat par `f`
multiplie la note par `f`. Contrairement à la densité et à la protéine, **il ne se
juge donc PAS sur la composition — il se juge sur les grammes réels, après le
facteur.** La capacité ayant été écartée (§ ⑥), **le budget est la seule porte
post-facteur qui reste au produit.**

⛔ **ET IL N'EXISTE AUCUN PRIX D'ALIMENT DANS LA BASE.** Vérifié le 2026-08-21 :
les colonnes `cost_*` du schéma sont des coûts d'**infrastructure** — LLM,
WhatsApp, Stripe. `food_composition_refs` n'a **pas de colonne prix**. Le budget
est exactement là où l'énergie se trouvait avant le référentiel : **une contrainte
qu'on affiche et qu'on ne peut pas vérifier.**

⚠️ **Et un prix n'est pas une constante.** Il change par **pays**, par **enseigne**,
par **saison**. Une colonne ne suffit pas : il faut une **source et une fraîcheur**.
C'est un chantier de la taille du référentiel lui-même, pas une migration.

**⛔ SON PÉRIMÈTRE, ET IL EST ÉTROIT — décidé le 2026-08-21.**

> **Le budget couvre le PANIER DU PLAN, pas les courses de la personne.**

Sortent donc du compte : le **shaker**, le **pain**, le **fromage** et le
**dessert**. Ce sont ses achats à lui, récurrents et déjà faits ; les compter dans
un plafond que le plan doit respecter reviendrait à lui facturer deux fois ses
propres habitudes.

⚠️ **Ça change le chiffre du cas 05** : **6,68 € pour 2 705 kcal**, soit
**2,47 € / 1 000 kcal** — et non 8,61 € comme d'abord écrit.

**LA TENSION EXISTE, ET ELLE NE SE RÉSOUT PAS :**

> **Les calories les moins chères sont les plus denses — pain, pâtes, huile —
> exactement celles que la cible de densité cherche à éviter.**

À 4 €/jour il faudrait descendre à **1,48 € / 1 000 kcal** contre 2,47 ici. Ce
n'est pas un défaut d'implémentation, c'est le prix de la nourriture, et **aucun
moteur ne le renversera**.

⇒ **Le travail du produit n'est donc pas de résoudre cette tension : c'est de
faire au mieux avec les moyens disponibles, et de DIRE ce qu'il a sacrifié
(§ ⑮).** Un compromis nommé est un service ; un compromis silencieux est une
faute qui retombe sur l'utilisateur.

**⇒ COMMENT LES PRIX ENTRENT — décidé le 2026-08-21.** Un **agent** remplit une
**grille de coût moyen pour 100 g** sur tout le référentiel — même patron que le
lot 19 sur les alias, et pour la même raison : c'est une tâche de connaissance,
pas de calcul.

⚠️ **DEUX COLONNES DE PRIX, PAS UNE : la FRANCE et les ÉTATS-UNIS**, pour
commencer. Le prix est la seule valeur du référentiel qui **dépend du lecteur** —
la composition d'un aliment ne change pas d'un pays à l'autre, son prix si. Poser
une colonne unique obligerait à la redécouper plus tard, sur 923 lignes.

⚠️ Et la **fraîcheur** reste due : une grille de 2026 ment en 2028. À dater, et à
rafraîchir par le même agent.

⚠️ **Deux conséquences plus fines, mesurées sur le même cas :**
- **Une exclusion a un PRIX.** L'huile d'algue coûte **100 €/kg** — quarante fois
  les légumes — et elle n'est là ni pour un besoin propre ni pour un goût : elle
  vient d'un **dégoût** (§ ②). Personne ne compte ce coût aujourd'hui.
- **Le plat de tradition est le poste le plus cher et il est IMPOSÉ** — 44 % du
  budget pour 38 % des calories. Le moteur ne peut pas arbitrer dessus : un budget
  serré ne se rattrape que sur les autres repas.

#### ⑪ La durée d'une session est un CHEMIN CRITIQUE, pas une somme

Mesuré sur le cas 05 : **45 minutes tenues, 113 si tout était fait à la suite.**

```
préparation                                            10 min
FOUR     poulet 35 min  ||  pommes dauphine à T+15
PLAQUE   dhal 25 min    ||  riz 15 min  ||  haricots 8 min
chemin critique                                        45 min
```

⇒ **La différence entre 45 et 113, c'est la parallélisation four/plaque.**

**⛔ ET ON N'EN FAIT RIEN — DÉCISION DU 2026-08-21.** On ne modélise ni la
parallélisation, ni la simultanéité des appareils, ni le temps réel.

**La raison est empirique, pas technique** : le temps qu'une personne met à
cuisiner dépend de son expérience, de son organisation, d'une plaque qui chauffe
mal, d'un enfant qui appelle. **La dispersion réelle écrase de très loin ce
qu'un modèle de parallélisation gagnerait.** Optimiser une estimation dont
l'erreur dominante est ailleurs est du travail perdu.

⇒ La durée déclarée reste une **entrée** — un plafond envoyé au modèle pour qu'il
ne propose pas trois heures de cuisine à quelqu'un qui en a quarante-cinq
minutes. Elle n'est **jamais** un chiffre qu'on vérifie ni qu'on promet.

⚠️ **MAIS LE TEMPS EST DÉJÀ À MOITIÉ CONSTRUIT, et il faut le savoir avant de
rouvrir le sujet.** `timeAllowsASecondDish(minutes)` existe dans
`household_portions.ts` et **gate déjà la divergence R5** : le temps de cuisine
décide si une bouche peut recevoir son propre plat. Ce n'est donc pas un champ
neuf — c'est un champ dont un seul lecteur existe.

#### ⑫ La date porte la SAISON, et personne ne la lit

La date d'un plan fixe trois choses, pas une :
- la **fenêtre** — début et longueur ;
- le **jour de la semaine** — un plat de tradition tombe ou ne tombe pas ;
- ⛔ la **saison** — quels légumes existent, et à quel prix.

Les deux premières sont utilisées. **La troisième n'est lue nulle part**, et elle
gouverne à la fois la disponibilité et le coût du poste le plus variable du panier.

#### ⑬ « Comment tu cuisines cette semaine » n'a de sens qu'à partir de DEUX bouches

⚠️ **Consigne d'écran, décidée le 2026-08-21.** Cette section arbitre entre des
manières de répartir la cuisine **entre plusieurs personnes**. Servie à quelqu'un
qui vit seul, elle pose une question dont il est la seule réponse possible.

⇒ **Conditionner son affichage à la présence d'au moins 2 bouches dans le foyer.**
Même famille de défaut que les jours de cuisine (§ ⑧) : un écran qui demande de
choisir là où il n'y a rien à choisir.

#### ⑭ ⛔ Sans congélateur, les 3 jours portent AUSSI sur les COURSES

⟳ **Corrige une affirmation fausse du cas 04**, où j'avais écrit qu'un seul
passage aux courses suffisait pour un plan de 5 jours à deux sessions. **C'est vrai
pour les légumes et faux pour la viande** — c'est-à-dire faux pour l'ingrédient qui
décide.

**Il y a DEUX fenêtres de conservation, pas une, et elles se CHAÎNENT :**

```
achat  --[ fenêtre CRUE ]-->  cuisson  --[ fenêtre CUITE ]-->  dernière portion
```

`MAX_FRIDGE_DAYS = 3` ne couvre que la **seconde**. La première n'a **aucune
constante, aucune colonne et aucun lecteur.**

**Mesuré sur le plan du cas 04** — courses vendredi, session 2 le lundi, dernière
portion le mardi :

| | |
|---|---|
| le poulet de la session 2 attend **cru** | vendredi → lundi = **3 jours** |
| puis il attend **cuit** | lundi → mardi = **1 jour** |
| total depuis l'achat | **4 jours** |

⛔ **Or une volaille fraîche tient 1 à 2 jours au réfrigérateur, pas 3.** Le plan
était déclaré valide et il ne l'est pas.

**⇒ LA RÈGLE : sans congélateur, la liste de courses se SCINDE.**

| ce qu'on achète | quand |
|---|---|
| secs, conserves, œufs, légumes durs, surgelés du commerce | **un seul passage**, au début du plan |
| **viande, poisson, frais** | **un passage par session**, juste avant la cuisson |

⚠️ **Ce n'est pas une contrainte de confort, c'est une porte de SÉCURITÉ** — même
famille que la conservation du cuit (§2.11 ①), donc **fail-closed** comme elle.

⛔ **Et la durée de conservation crue n'existe pas en base** — `food_composition_refs`
n'a pas de colonne. Mais **contrairement au prix (§ ⑩), elle est bon marché** :
elle ne dépend ni du pays, ni de l'enseigne, ni de la saison, et la décision
qu'elle sert est **binaire** — « ça survit jusqu'à la session suivante, ou non ».

⇒ **Une valeur PAR GROUPE suffit**, et les groupes séparent proprement :
poisson ~1 j · volaille et viande hachée ~2 j · viande en pièce ~3 j · légumes
frais ~7 j · œufs, secs et conserves ~très long. **Ne pas viser l'aliment : le
groupe est la bonne granularité, et c'est la même leçon que la règle 4 du §1** —
un groupe ne prédit pas une valeur, mais il **borne** parfaitement.

#### ⑮ ⛔ Le plan doit DIRE ce qu'il n'a pas respecté — et le module existe déjà

Quelqu'un écrit *« je veux du foie gras »* et pose **30 € pour deux jours**. Les
deux ne tiennent pas ensemble. Le produit doit trancher — et **le dire**.

**⟳ CORRIGÉ LE 2026-08-21 — « ce n'est pas au modèle d'expliquer » était trop
large.** `plan_rationale.ts` porte bien cette doctrine :

> *« Une jolie phrase inventée par le modèle peut être fausse, et une explication
> fausse est PIRE que pas d'explication : elle apprend à l'élève que le texte sous
> son plan ne décrit pas son plan. »*

⚠️ **Mais relis le défaut qu'elle corrige : on demandait au modèle d'expliquer le
JEUDI AJOUTÉ par `meal_generation.ts`, branche `tooLate`** — une décision qu'il
n'avait pas prise et dont il n'avait pas les données. **C'est là que l'invention
arrive**, et nulle part ailleurs.

> ### LA RÈGLE JUSTE : personne n'explique la décision d'un autre.

| qui a décidé | qui explique | pourquoi lui |
|---|---|---|
| **le moteur** — fenêtre coupée, jour ajouté, budget dépassé de X €, cible protéique manquée, drapeau inatteignable | **le moteur**, déterministe | il tient les nombres ; le modèle ne les voit **même pas** |
| **le modèle** — pourquoi ce plat, ce remplacement, ce sacrifice, ce qu'il a écarté du souhait | **le modèle**, dans un champ dédié | le moteur ne voit que la **sortie** ; il ne peut pas reconstruire un arbitrage |

⇒ **Le modèle connaît ses propres contraintes et ses propres arbitrages mieux que
le code ne les devinera jamais.** Lui interdire de les dire, c'est perdre la seule
explication qui existe — et laisser le compromis silencieux, ce que §⑩ nomme comme
la faute qui retombe sur l'utilisateur.

**⛔ DEUX GARDES SUR LA MOITIÉ DU MODÈLE, et elles suffisent :**

**① La phrase doit être FALSIFIABLE contre le plan.** S'il écrit « j'ai remplacé le
foie gras par du canard », le moteur vérifie que le foie gras est absent et le
canard présent. **Une affirmation qu'on ne peut pas confronter au JSON ne
s'affiche pas.** C'est exactement la règle du §2.7 — *on n'écrit que les étapes qui
laissent une trace dans le résultat*.

**② Aucun nombre qui vise une personne.** Le dépôt a déjà mesuré la fuite : sur un
run réel, le modèle a recopié un facteur dans le texte visible — *« Zoé : 0,85 de
la part de Marc »*, lu à voix haute à table. La frontière du §2.6 tient ici comme
partout : ni corps, ni kcal, ni ratio de portion dans une phrase visible.

Le module est **déterministe**, assemblé **backend**, rend des **phrases finies**,
et **chaque phrase est armée par une prémisse** — `addedCookDays: []` ne produit
pas « aucun jour ajouté », il ne produit **rien**. Il porte déjà une ligne
permanente, même quand tout va bien.

⛔ **MAIS SON VOCABULAIRE NE COUVRE QUE LE CALENDRIER.** Il explique les jours de
cuisine ajoutés, la fenêtre coupée, un midi sauté. **Il ne sait rien dire de :**

| ce qui n'est pas dit | alors que le moteur le SAIT |
|---|---|
| un **souhait écarté** — le foie gras | le souhait est déclaré, le dépassement est calculé |
| un **budget dépassé**, et de combien | `Σ q·prix` après le facteur |
| une **cible nutritionnelle manquée** | la porte protéique a son verdict |
| un **drapeau inatteignable** | § ② rend déjà ce troisième état |
| un **plat de tradition adapté** — rôti devenu air fryer | le moteur a posé la contrainte de méthode |

⇒ **Côté moteur, c'est une extension de vocabulaire, pas un module neuf.** La
machinerie, la langue, les gardes et l'assemblage backend existent. Ce qui manque,
ce sont **les gabarits de phrase et les prémisses qui les arment**.

⇒ **Côté modèle, c'est un champ de sortie de plus** — et il tombe sous la même
règle que tout champ déclaré par le modèle : **un compteur obligatoire**, sinon un
lot désarmé ressemble à un lot qui marche.

⚠️ **Et ça vaut mieux qu'une explication : c'est la seule façon honnête de servir
un petit budget.** Le §⑩ montre que la tension prix/santé ne se résout pas. Un
plan qui fait au mieux **et nomme son compromis** rend un service. Le même plan,
muet, ressemble à un produit qui compose mal.

#### ⑯ La grille de présence décide qui COMPOSE, pas qui MANGE

Deux écrans arrivent ensemble et on les confond facilement : **« le déjeuner en
semaine »** (bureau, gamelle, micro-ondes) et **« qui est là, jour par jour »**.

> ### DÉCIDÉ le 2026-08-21 — LA RÈGLE À DEUX AXES
> **La grille jour par jour décide la PRÉSENCE. Le déjeuner en semaine décide la
> FORME. La seconde ne crée jamais une occasion et n'en retire jamais une.**

| il déclare | la grille dit | ce qui se passe |
|---|---|---|
| bureau + gamelle | midi **non coché** | ⛔ **on ne compose pas** |
| mange dehors | midi **coché** | **on compose** |

⇒ La réponse d'habitude ne fait que **qualifier** ce que la grille a laissé
debout : transportable · se réchauffe · **mangeable froid** quand il n'y a pas de
micro-ondes — cette dernière exclut une grande partie des plats.

⚠️ **Et elle touche même le plat de tradition.** Un poulet rôti aux pommes
dauphine n'est pas une gamelle. La tradition n'est pas retirée : **sa forme plie**,
comme devant l'absence de four (§ ⑦). Mais le compromis doit être **dit** (§ ⑮).

**⛔ ET UN REPAS DÉCOCHÉ N'EST PAS UN REPAS SAUTÉ.**

> **Décoché veut dire « le plan ne le prépare pas ». Pas « il ne mange pas ».**
> Tout le monde déjeune. **Son énergie compte toujours dans la journée**, en
> occasion **estimée**.

⇒ **Il n'existe donc PAS d'état « absente ».** Les quatre états suffisent :
composée · estimée · résolue · forfaitaire. Et **la question de la redistribution
ne se pose jamais** — rien ne disparaît, donc rien ne se reporte. *(Sans cette
règle, un midi retiré et redistribué produisait un petit-déjeuner à 1 468 kcal :
une absurdité polie.)*

⚠️ **Un vrai « je ne mange pas » vit un étage plus haut**, dans les **moments
déclarés** (§ ③). Quelqu'un qui ne petit-déjeune jamais ne déclare pas le moment.
La grille ne parle que de **préparation**, sur une semaine donnée.

**⛔ LA COPIE DE L'ÉCRAN DEMANDE LA MAUVAISE CHOSE.** Elle dit aujourd'hui
« décoche les repas que quelqu'un va vraiment **sauter** ». Ce n'est pas ce dont le
moteur a besoin : c'est **« décoche les repas que le plan ne doit pas préparer »**.
Le mot « sauter » induit une autre réponse — quelqu'un qui déjeune dehors tous les
midis ne saute rien et laisserait **toutes ses cases cochées**.

⚠️ **ET L'HYPOTHÈSE PORTE UNE DIRECTION DE RISQUE.** Supposer qu'il a mangé alors
qu'il a réellement sauté revient à lui donner **moins** sur le reste de la journée.
Sans danger en prise de poids et en maintien. ⛔ **En PERTE, c'est le sens qui
creuse** : un déficit non compté qui s'ajoute au plafond de `MAX_DAILY_DEFICIT_KCAL`
sans que rien ne le voie. **À armer avant le premier cas avec objectif de perte.**

#### ⑰ ⛔ Le plafond de surplus est plus PETIT que l'erreur qu'il corrige

Trouvé le 2026-08-21 en essayant de faire choisir 0,35 kg/semaine à quelqu'un dont
le plafond en autorise 0,29.

```
l'ajusteur d'APPÉTIT              ± 10 %   ->  ± 315 kcal/j
le SURPLUS autorisé               + 10 %   ->  + 315 kcal/j     MAX_SURPLUS_FRACTION
l'erreur d'estimation de l'entretien       ->  ± 580 kcal/j     (§2.2, Prado-Nóvoa 2024)
```

> **Le surplus prescrit fait exactement la taille d'un des boutons de réglage, et
> la MOITIÉ de la barre d'erreur.**

⇒ **On ne peut pas prescrire un surplus plus petit que sa propre incertitude et
prétendre qu'il fait quelque chose.** Avant même d'ajouter les 315 kcal, on ne sait
pas à 580 près si cette personne est déjà en surplus ou en déficit.

**⛔ ET CE QUE LE PLAFOND PROTÈGE, LA BALANCE LE CORRIGE.** Le produit **mesure le
poids** (`bodyMeasures`, `body_measure_series`). Le rythme réellement observé est
la vérité de terrain, et il rattrape l'erreur d'estimation en deux ou trois
semaines. **Un plafond posé pour protéger une estimation protège la mauvaise
chose.**

**⛔ LE VRAI RISQUE EST AILLEURS, ET IL EST DÉJÀ GARDÉ.** Ce qu'il faut surveiller
en prise de poids, ce n'est pas la taille du surplus : c'est **ce que devient le
gain**. `PACE_WARNINGS.surplus_becomes_fat` le dit déjà :

> *« Au-delà d'environ **0,5 kg par semaine**, le surplus part surtout en gras. »*

⚠️ **Il y a donc DEUX gardes pour la même chose, et la plus stricte est celle qui
protège le moins bien** : le plafond bloque à **0,29** pendant que l'avertissement
— celui qui dit quelque chose de vrai — n'arrive qu'à **0,5**. Le produit interdit
**42 % en dessous de sa propre ligne de danger**, et quelqu'un qui lit les deux ne
comprend pas.

> ### DÉCIDÉ le 2026-08-21
> **Le plafond descend au niveau de l'avertissement : `0,5 kg/semaine`.**
> L'avertissement se déclenche en approchant. 0,35 devient un choix normal.

⚠️ **Contre-épreuve** : 0,5 kg/sem = 550 kcal/j = **+17,4 %** de l'entretien de ce
cas. La fourchette couramment retenue pour une prise de masse propre est **+10 à
+20 %**. On reste dedans — le nouveau plafond n'est pas laxiste, il est *au bord
haut du raisonnable*, ce qui est exactement le rôle d'un plafond.

⛔ **ET L'ASYMÉTRIE AVEC LA PERTE EST JUSTIFIÉE — NE PAS LA « CORRIGER » PAR
SYMÉTRIE.** `MAX_DAILY_DEFICIT_KCAL = 500` **reste**. Trop manger et pas assez
manger ne portent pas le même risque : le plancher TCA n'a pas de miroir. Un
futur lecteur trouvera les deux constantes côte à côte et voudra les aligner —
**c'est la faute à ne pas commettre.**

⚠️ **Rien à changer côté écran.** `paceControlFor` prend déjà
`max: ceiling.maxKgPerWeek` et rabat la valeur dessus. **Relever le plafond suffit**
— le curseur suit, et le `household_members_target_pace_range_check` en base aussi.

⚠️ **Et deux ajusteurs de +10 % s'empilent** — appétit puis surplus, soit **+21 %**
sur l'entretien de base. Ils décrivent deux choses différentes, donc ça se défend.
Mais **rien ne borne leur produit**, et personne ne l'a écrit.

⚠️ **Une erreur de catégorie à surveiller, séparément.** `muscle_gain` porte une
limite d'**accrétion musculaire** — légitime, le muscle ne se construit pas plus
vite qu'environ 0,5 kg/mois. Mais quelqu'un en **sous-poids** qui doit reprendre de
la masse, n'importe laquelle, n'est pas dans ce cas. Lui appliquer un plafond de
construction musculaire est une erreur de catégorie. **Deux objectifs vivent
aujourd'hui sous un seul jeton.**

#### ⑱ ⛔ La cible de densité est à l'ENVERS pour une prise de poids

Trouvé sur le cas 06 — même personne, objectif de **prise** à 0,35 kg/semaine.

Sa journée pèse **2 577 g de nourriture composée**, dont **1,1 kg au déjeuner**,
dans une gamelle. Ce n'est pas un défaut de composition : prendre du poids, c'est
manger beaucoup. Mais ça révèle un défaut du design.

> **La cible de densité basse (1,1-1,3 kcal/g) a été posée pour la PERTE. Appliquée
> à une prise, elle travaille CONTRE l'objectif.**

**Le mécanisme, et le §2.9 le démontrait déjà à moitié.** Le levier de Klos agit en
*ad libitum* : le poids d'assiette est fixe, l'énergie est la **sortie**. **Notre
moteur fait l'inverse — il épingle l'énergie et libère le poids.** Pour une bouche
à objectif, une densité basse **ne retire donc aucune kcal** : le facteur les remet
toutes. Elle rend seulement le volume plus dur à avaler.

Or **ce qui empêche les gens de prendre du poids, c'est presque toujours qu'ils
n'arrivent pas à manger assez.**

| densité | ce que 3 537 kcal pèsent |
|---|---|
| 1,24 kcal/g *(le plan du cas 06)* | **2 852 g/jour** |
| 1,8 kcal/g *(`DENSITY_CEILING_DEFAULT`)* | **1 965 g/jour** |

**900 g d'écart pour la même énergie** — le volume d'un repas entier en plus, sans
une calorie de plus.

> ### DÉCIDÉ le 2026-08-21 — LA CIBLE SUIT L'OBJECTIF
>
> | objectif | densité visée |
> |---|---|
> | **perte** | **basse** — le levier fonctionne, c'est le §1 règle 5 |
> | **maintien** | neutre |
> | **prise** | ⛔ **haute** — le volume est la contrainte qui mord |

⚠️ **Le produit porte déjà DEUX PLAFONDS par objectif** — `DENSITY_CEILING_FAT_LOSS
= 1,3` et `DENSITY_CEILING_DEFAULT = 1,8`. **Il lui manque la cible, et son sens
s'inverse.** Un nombre unique devient trois.

⛔ **NE PAS CONFONDRE AVEC LE PLANCHER DU LOT 9 bis.** Ce sont deux objets
différents et ils ne fusionnent pas :

| | rôle | dépend de l'objectif ? |
|---|---|---|
| **plancher** `D >= 0,80` *(lot 9 bis)* | **refuser** les 2 kg de soupe | **non** — il vaut pour tout le monde |
| **cible** *(ce lot)* | **orienter** la composition | **oui** — il s'inverse |

⚠️ Et la règle 5 du §1 — *« on vise une densité énergétique basse, le levier le
plus puissant »* — **doit gagner sa condition** : elle est vraie **en perte**, et
elle est fausse en prise. Laissée sans condition, elle sera relue comme
universelle.

### ⛔ Le troisième type d'occasion — ESTIMÉE

Le cas 02 fait manger cette personne **à l'extérieur le midi**, et la couverture
tombe à 0,60. **40 % de sa journée disparaît du calcul**, et avec elle toute
garantie à l'échelle du jour.

Ce n'est pas une fatalité : le produit scanne approximativement ce qui a été mangé.
L'arithmétique peut donc se refermer — mais pas avec les deux seuls états
d'aujourd'hui.

**Il faut TROIS types d'occasion, pas deux :**

| type | ce que le moteur en sait | effet sur le calcul |
|---|---|---|
| **composée** | chaque gramme, écrit par le plan | pleine |
| **estimée** | un nombre approché, déclaré ou scanné | **la journée se referme** |
| **inconnue** | rien | la journée ne se referme pas |

⚠️ **Et une seule valeur de couverture ne peut plus l'exprimer.** Il en faut
**trois qui somment à 1** — `partComposée`, `partEstimée`, `partInconnue` — parce
que « ce que le plan écrit » et « ce que le jour porte » cessent d'être la même
chose. Le calcul du jour ne se referme que si `partInconnue = 0`.

#### ⚠️ Le sens du temps, et il est contraignant

**Un scan est rétrospectif ; un plan est prospectif.** L'occasion estimée travaille
donc dans les deux sens, et les deux ne se ressemblent pas :

- **avant** — le plan émet une **recommandation** en kcal pour ce repas ;
- **après** — le scan dit ce qui a réellement été mangé, et l'écart corrige la
  suite.

⛔ **L'écart ne peut corriger QUE les occasions encore à venir.** En batch cooking,
un repas déjà composé est **déjà cuisiné et déjà en boîte** : le rattraper serait
demander de rouvrir un bac. L'écart agit sur le reste du même jour, ou sur le
lendemain — jamais sur ce qui est au frigo.

#### ⛔ La règle d'affichage — DÉCIDÉE le 2026-08-21

> **Le nombre existe toujours. Il ne s'AFFICHE que si la personne a posé un
> objectif de poids.**

Sans objectif, la recommandation reste **interne** : elle sert à refermer
l'arithmétique du jour, et elle ne sort jamais à l'écran.

⚠️ **C'est exactement la règle de la boîte pesée (v4), appliquée à une autre
surface.** Chez la bouche à objectif le gramme est une **prescription** ; chez les
autres c'est une **quantité de récipient**. Ici : chez la bouche à objectif la kcal
est une **cible** ; chez les autres elle n'est rien du tout, donc elle ne s'écrit
pas. Une seule règle, deux endroits — et c'est ce qui la rend tenable.

⚠️ **C'est la SEULE exception à « on ne lui montre jamais un chiffre », et elle
doit être nommée comme telle.** Afficher une cible calorique à quelqu'un qui n'a
jamais demandé à changer de poids transforme le produit en application de comptage
pour des gens qui n'en voulaient pas. Elle passe donc le **plancher TCA** comme
tout le reste, et un refus de la porte la retire — pas seulement l'objectif.

⚠️ **À vérifier avant de construire** : `meal_declaration_floor.ts` *(plancher
déterministe de la déclaration de repas)* et `photo_invitation*.ts` existent déjà,
et `photo_invitation_attach.ts` lit `food_composition_refs`. **Une partie du
chemin d'estimation est donc là.** Ce qui n'est pas établi, c'est si l'un des deux
produit une **valeur énergétique exploitable** par la chaîne, ou seulement un
enregistrement. À mesurer avant d'écrire quoi que ce soit.

### Les lots que ça ajoute

| # | lot | change une assiette ? | coût |
|---|---|---|---|
| **9 bis** | **Retirer `MEAL_MAX_GRAMS_PER_KG`** au profit d'un **plancher de densité `D >= 0,8 kcal/g`** *(décidé, §5.2 ①)*. **Deux gestes, pas un** : ① remplacer le terme `physicalMax` d'`anchorFactorFor` ; ② faire du plancher un **REFUS avec recomposition**, pas un second rabot — aujourd'hui la borne rabote en silence. ⚠️ Côté foyer, il n'existe aucun deuxième essai pour rattraper un refus (§3.1). **Réécrit le lot 9. Sa portée dépend des lots 17-18.** | **oui** | lot |
| **16** | **Repli d'activité** : `assumed = 1,5` ne peut plus être un point unique. Mesurer d'abord la répartition `crossed` / `legacy` / `assumed` sur les fiches. | **oui** | petit |
| **17** | **Abstention pesée** — borne par groupe, seuil ~5 %, résidu compté. | **oui** — journées calculables à la hausse | lot |
| **18** | **Auto-remplissage** — sas, promotion conditionnelle, 4 compteurs. ⚠️ Dépend du 17 pour le repli quand l'appel rate. | **oui** | lot |
| **19** | **Profondeur d'alias** — de 2,8 à ~8 formulations par aliment, FR et EN, chacune vérifiée contre sa ligne CIQUAL. ⛔ **Jamais un matcher.** | **oui** | agent + revue |
| **20** | ⚠️ **À FUSIONNER AVEC LE 9 bis** — la protéine est un **rapport invariant d'échelle**, comme la densité : aucun facteur ne peut la corriger. La porte du 9 bis juge donc **deux** critères, `D >= 0,8 kcal/g` et `>= 37 g de protéines / 1 000 kcal`, sur la composition et avant l'arithmétique. Restent en propre : ① faire entrer les apports fixes dans le total ; ② **mesurer si `protein_anchor.ts` mord**. | **oui** | fusionné |
| **21** | **Le dégoût qui porte un apport déclenche une divergence** *(§ ci-dessus ②)* — test mécanique par les **7 drapeaux**. ⛔ **La substitution se décide AVANT le modèle** : le moteur pose une **exigence positive** + une liste de candidats tirée du référentiel ; la porte de sortie **vérifie**, elle ne répare pas. ⚠️ Exige le **3ᵉ état** d'un nutriment, qui n'existe pas. | **oui** | lot |
| **22** | **Les six moments comptent, avec leur nature** — poids de base normalisés sur les moments déclarés, + une `nature` par moment envoyée au modèle. ⚠️ **Remplace le lot 2**, et doit précéder tout rattachement d'apport fixe. | **oui** | lot |
| **23** | **L'occasion ESTIMÉE** — trois types au lieu de deux, et `partComposée / partEstimée / partInconnue` qui somment à 1. Recommandation **avant**, scan **après**. ⚠️ L'écart ne corrige que les occasions **à venir** — jamais un bac déjà cuisiné. ⚠️ Mesurer d'abord ce que rendent `meal_declaration_floor.ts` et `photo_invitation_attach.ts`. | **oui** — la journée se referme | lot |
| **24** | **La règle d'affichage du nombre** — la recommandation en kcal ne **sort à l'écran** que pour une bouche **à objectif** ; sinon elle reste interne. Même règle que la boîte pesée v4. ⚠️ **Seule exception à « jamais un chiffre »** : elle passe le plancher TCA, et un refus de la porte la retire. | non — surface seulement | petit |
| **25** | **Le forfait — fromage et dessert ne se composent pas** *(§ ci-dessus ④)*. ⟳ **Renverse la décision du 2026-08-20** « le plan compose toutes les habitudes » : le pain reste composé, le fromage et le dessert deviennent un **forfait moyen** retiré de la cible du repas. ⚠️ Valeurs à sourcer et à rendre révisables. ⚠️ Elles n'entrent PAS dans le calcul de densité. | **oui** | petit |
| **26** | **La variante de plat par bouche** *(§ ci-dessus ⑤)* — ⛔ **le « livré » se calcule par VARIANTE**, pas une fois par plat, sinon la version divergente sort fausse dans le sens qui sous-nourrit. ⚠️ **Bloqué par la v4 de la boîte** : `SizableShare = {memberId, grams}` ne porte aucun ingrédient — il n'y a nulle part où écrire la variante. ⚠️ Noter le coût selon que le porteur du drapeau s'ajoute **au dressage** ou est **cuit dans la base**. | **oui** | lot · dépend de la v4 |
| **27** | ⛔ **ÉCARTÉ** — on ne modélise pas la capacité des appareils *(décision 2026-08-21, § ⑥)*. **Ce qui survit** : ne pas afficher un temps de cuisson non vérifié — soit **pour une portion**, avec le nombre de portions à côté, soit rien. ⚠️ Coût accepté : le temps annoncé est faux dès qu'un appareil à panier entre en jeu, d'un facteur qui croît avec les portions. | non | une consigne d'écran |
| **28** | **Les jours de cuisine se DÉRIVENT** *(§ ⑧)* — jour 1 obligatoire, puis dès expiration de la conservation. ⚠️ Retourner la question de l'écran : « je ne peux pas cuisiner le mercredi » **déforme le plan**, ce n'est pas un choix de jour. | non | un écran |
| **29** | **`MAX_FRIDGE_DAYS` = jour de cuisson + 2** *(§ ⑨)*, écrit dans le code et testé. ⚠️ **Et la fenêtre ne s'applique qu'aux occasions CUISINÉES À L'AVANCE** — l'occasion gagne un attribut *cuisinée / assemblée*, sans lequel on compte 15 occasions au lieu de 10. | **oui** — change le nombre de sessions | petit |
| **30** | **Le BUDGET** *(§ ⑩)* — ⛔ aucun prix en base. **Un agent remplit une grille de coût moyen /100 g**, avec **DEUX colonnes : France et États-Unis** *(le prix est la seule valeur du référentiel qui dépend du lecteur)*, datée et rafraîchie. ⚠️ Périmètre : **le panier du plan seulement** — shaker, pain, fromage et dessert dehors. ⚠️ **Seule porte post-facteur** du produit. | **oui** | chantier |
| **31** | **La durée de session** *(§ ⑪)* — envoyée comme **plafond**, ⛔ **jamais vérifiée ni promise**. La parallélisation est **écartée exprès** : la dispersion réelle *(expérience, organisation, matériel)* écrase ce qu'un modèle gagnerait. ⚠️ `timeAllowsASecondDish` existe déjà et gate la divergence R5. | non | consigne |
| **32** | ⚠️ **La saison n'est lue nulle part** *(§ ⑫)* — la date la porte, et elle gouverne disponibilité **et** prix du poste le plus variable du panier. Bloqué par le lot 30. | **oui** | lot |
| **33** | **Conditionner « comment tu cuisines cette semaine » à ≥ 2 bouches** *(§ ⑬)*. | non | un écran |
| **34** | ⛔ **La fenêtre de conservation CRUE** *(§ ⑭)* — la contrainte de 3 jours porte aussi sur les **courses**, et les deux fenêtres se **chaînent**. **La liste se scinde** : ce qui se garde en un passage, la viande et le frais **par session**. ⚠️ Porte de **sécurité**, fail-closed. ⚠️ Une durée **par GROUPE** suffit — bien moins cher que le lot 30. | **oui** — change le nombre de passages aux courses | lot |
| **35** | ⛔ **Le plan DIT ce qu'il n'a pas respecté** *(§ ⑮)* — **DEUX moitiés** : ① le **moteur** explique ses décisions *(budget dépassé, cible manquée, drapeau inatteignable, calendrier)* — extension de vocabulaire de `plan_rationale.ts` ; ② le **modèle** explique ses arbitrages *(souhait écarté, remplacement, sacrifice)* — champ de sortie dédié, **falsifiable contre le plan**, **sans aucun nombre visant une personne**, et **avec son compteur**. | non — mais rend le petit budget servable | lot |
| **36** | **La grille décide qui COMPOSE, pas qui MANGE** *(§ ⑯)* — ① séparer les **deux axes** *(présence / forme)* ; ② un repas décoché reste une occasion **estimée**, jamais absente — **pas de redistribution** ; ③ **réécrire la copie** : « que le plan ne doit pas préparer », pas « que quelqu'un va sauter ». ⛔ ④ **En perte, armer le cas du repas réellement sauté** — c'est le sens qui creuse. | **oui** | lot + un écran |
| **37** | ⛔ **Le plafond de surplus descend à l'avertissement** *(§ ⑰)* — `MAX_SURPLUS_FRACTION` bloque à 0,29 kg/sem quand `surplus_becomes_fat` n'alerte qu'à **0,5** : deux gardes, la plus stricte protège le moins bien. ⚠️ **Rien à changer côté écran** — `paceControlFor` suit le plafond. ⛔ **Ne PAS aligner `MAX_DAILY_DEFICIT_KCAL` par symétrie** : le plancher TCA n'a pas de miroir. ⚠️ Séparer `muscle_gain` de « reprendre de la masse » — deux objectifs sous un jeton. | **oui** | une constante |
| **38** | ⛔ **La cible de densité suit l'OBJECTIF** *(§ ⑱)* — basse en perte, neutre en maintien, **haute en prise**. Mesuré : **900 g/jour d'écart** à énergie égale. ⛔ **Ne pas confondre avec le plancher du lot 9 bis** — l'un refuse, l'autre oriente ; l'un est universel, l'autre s'inverse. ⚠️ **Conditionner la règle 5 du §1**, aujourd'hui écrite comme universelle. | **oui** | petit |

⚠️ Le lot **11** (habitudes composées) porte déjà la suppression de
`composedDishShare`. Tant qu'il n'est pas livré, **le facteur 0,42 domine tous les
réglages décrits ici** — c'est le premier à faire, avant toute mesure d'un autre.

Les deux prompts d'implémentation sont écrits :
`scratchpad/2026-08-21-0040-PROMPT-AUTOREMPLISSAGE-REFERENTIEL.md` (lot 18) et
`scratchpad/2026-08-21-0040-PROMPT-PARITE-FR-EN-REFERENTIEL.md` (lot 19).
