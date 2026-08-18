# Le persona, les 1000 premiers, et comment savoir si le produit tient

> Étude du 2026-08-18. Elle s'appuie sur l'annexe concurrentielle de
> [PIVOT-FOYER.md](PIVOT-FOYER.md) (recherche du 7 août 2026, plus récente que ma
> connaissance propre) et sur ce qui est **mesurable dans ce dépôt aujourd'hui**.
>
> Tout ce qui est chiffré ici et qui ne vient pas du dépôt est un **ordre de grandeur à
> tester**, pas un fait. C'est signalé à chaque fois.

---

## 1. Une correction avant tout le reste

J'ai dit le 2026-08-18 que « la session de cuisine comme unité » était un différenciateur que
personne ne fait. **C'est faux, et l'annexe le disait déjà :**

> **CookAhead, MealPrepPro, Recipy, Cook Smarts, Plan to Eat.** Détection du recouvrement
> d'ingrédients, séquencement, instructions de conservation, chaînes *cook-once-eat-all-week*.
> → **C'est un critère de comparaison standard en 2026, pas une nouveauté.**

Le batch cooking est un marché servi. La divergence nutritionnelle par personne est un marché
servi (Samsung Food+, Eat This Much). **Ce qui est vide, c'est l'intersection des deux** — et
seulement elle.

Et l'acteur qui s'en approche le plus **documente lui-même son échec** :

> **Eat This Much** : profils nutritionnels multiples, planification famille. *« Le
> contournement est documenté par eux-mêmes : caler sur la personne qui mange le moins, ou
> additionner et diviser au prorata. Ne sait pas gérer des besoins caloriques différents. »*

C'est la meilleure preuve du positionnement qu'on ait : quelqu'un a essayé, a échoué, et l'a
écrit.

---

## 2. Le persona

### 2.1 La séparation qui règle le débat

Deux décisions distinctes, systématiquement confondues :

| | Question | Réponse |
|---|---|---|
| **Le message** | avec quoi j'attaque ? | **La charge d'organisation.** Universelle, reconnue en une phrase. Personne ne se réveille en pensant « j'ai un problème de divergence nutritionnelle » |
| **Le wedge** | pourquoi on me choisit contre le gratuit ? | **La table non uniforme.** C'est le seul endroit où Jow, Mealime et les batch-cookers ne peuvent pas suivre |

Le message ne peut PAS être le wedge : « organiser planning + cuisson + courses » est le
produit de 22 millions d'utilisateurs gratuits. Le wedge ne peut PAS être le message : il est
illisible pour qui n'a pas encore le problème nommé.

### 2.2 Le qualifieur — corrigé DEUX FOIS

**Première correction** (matin du 2026-08-18) : pas « elle a un objectif ». Le maître n'a
besoin d'aucun objectif personnel. Le qualifieur est : **la table n'est pas uniforme.**

**Seconde correction** (soir du 2026-08-18, et c'est la bonne) : ce n'est pas une
*catégorie* de contrainte, c'est un **compte**.

> ### Notre avantage n'est pas la rareté d'une contrainte. C'est leur simultanéité.

Une contrainte **seule** se simule : Jow met un filtre « sans gluten », Samsung Food+ met un
profil santé, Meal Prep Pro met une cible calorique. Aucun n'a tort, et aucun n'a besoin de
nous. **Deux ou trois en même temps**, réconciliées dans une seule session de cuisine puis
redéployées en assiettes différentes — personne ne le fait, et la difficulté n'est pas
additive : le point dur n'est pas de respecter chaque contrainte séparément, c'est de
trouver la casserole commune qui les tient toutes sans cuisiner quatre fois.

| Contraintes simultanées | Ce que ça veut dire |
|---|---|
| **0 à 1** | On n'est pas meilleur que le gratuit. On ne recrute pas là — mais on accueille sans friction |
| **2** | Notre terrain |
| **3 et plus** | Personne d'autre ne sait faire, et le foyer le sait déjà |

**Ce qui compte comme contrainte** — six types en base (`SAFETY_CONSTRAINT_KINDS`), trois
sévérités, et l'allergie est **un cas sur six** :

| Ce que ça fait | Les axes |
|---|---|
| **Interdit** | allergie · intolérance · régime · religieux ou éthique · condition médicale |
| **Dimensionne** | objectif · niveau d'activité · âge et croissance · corps |
| **Décale** | rythme alimentaire (6 moments, par personne) · absences · horaires |
| **Refuse** | le goût, en sévérité `preference` — l'enfant qui ne mange rien de vert |
| **Borne** | budget · jours de cuisine · temps · équipement · difficulté · variété |

> Les deux divergences les plus universelles ne sont **pas médicales du tout** : le
> **rythme** (deux personnes du même foyer n'ont presque jamais la même structure de
> journée) et l'**âge** (un foyer avec un enfant de 6 ans et un ado de 16 diverge par
> construction, sans que personne n'ait rien déclaré).

Détail complet et conséquences : **[POSITIONNEMENT.md](POSITIONNEMENT.md)**, qui est
désormais l'autorité sur ce point.

> ## ⚠️ DÉCISION DU 2026-08-18 — LA TÊTE DE PONT N'EST PLUS L'ALLERGIE
>
> Les §2.3 à §2.5 ci-dessous ont été écrits autour du foyer à **contrainte médicale non
> négociable**. **Cette tête de pont est abandonnée**, décision du propriétaire, deux fois
> réaffirmée. Motif : **l'acquisition**. Trouver ces familles est un bourbier — AFDIAG
> compte ~5 000 familles adhérentes, et à une sortie d'école c'est ~1 famille sur 10, donc
> neuf conversations stériles sur dix. L'acquisition est la contrainte qui lie ; optimiser
> la démontrabilité en rendant le recrutement impossible est un mauvais échange.
>
> **Ce qui est abandonné :** le qualifieur médical.
> **Ce qui est GARDÉ, et c'est l'essentiel :** le coin reste **la divergence** — « des repas
> vraiment personnalisés pour chacun ». C'est ce que ni Jow, ni Mealime, ni les spécialistes
> du batch cooking ne font, et ce sur quoi Eat This Much a publié son échec.
>
> **La question de qualification devient**, à une sortie d'école comme chez un coach :
> > *« Chez vous, est-ce que tout le monde mange la même chose ? »*
> On prend tous les « non » : un enfant qui ne mange rien de vert, un parent qui fait
> attention, quelqu'un qui s'entraîne, un ado végétarien, une intolérance déclarée. Une
> allergie qui se présente reste la **meilleure cohorte** — on la traite comme telle, on ne
> la chasse plus.
>
> **⚠️ CE QUE L'ALLERGIE ACHETAIT, ET QU'IL FAUT REMPLACER.** Elle donnait la
> **démontrabilité avant l'essai** : « l'app gratuite t'a proposé un pesto » se comprend en
> deux secondes. Sans elle, la question « pourquoi 12,99 € quand Mealime est à 2,99 $ »
> **n'a plus de réponse en une phrase**. Elle devient l'inconnue n°1 des 10 premiers foyers,
> et elle doit être répondue par deux choses : **l'artefact de démonstration** (un plan réel,
> montré) et **la recommandation d'un coach**.
>
> **⚠️ ET CE QUE ÇA RENDAIT PLUS URGENT :** le **verrou de régime alimentaire**. En
> abandonnant l'allergie médicale, la divergence s'appuie surtout sur des **régimes** —
> végétarien, végane, pescétarien. Le produit ne les garantissait pas : la voie foyer
> portait la consigne, la voie individuelle ne lisait que le drapeau de carence.
> **✅ Fermé le 2026-08-18** — consigne + vérification déterministe de sortie, prouvées par
> mutation. **Reste à faire :** dix générations réelles avec régime + allergène déclarés,
> sorties lues.
>
> ⛔ **Halal et casher restent non promettables**, et c'est un choix écrit dans
> `dietary_regime.ts` : la licéité dépend du mode d'abattage et de la séparation des
> ustensiles, pas seulement de l'espèce — *« prétendre les couvrir avec une liste
> d'aliments exclus produirait une garantie fausse, ce qui est pire que pas de garantie »*.
>
> Les sections ci-dessous restent lisibles pour leur analyse concurrentielle et leurs
> chiffres de marché, qui ne dépendent pas de cette décision.

### 2.3 Le persona d'attaque — rédigé *(historique : version « contrainte médicale »)*

> **Claire, 38 ans, deux enfants (7 et 4 ans), en couple, cadre, banlieue de Lyon.**
> **Son fils de 4 ans est allergique à l'arachide et aux fruits à coque.** Diagnostic à
> 18 mois, après un passage aux urgences. Trousse d'urgence à l'école, PAI signé.

**Sa semaine, telle qu'elle la vit.**
Elle décide de tous les repas de la maison. Son mari cuisine le week-end, « quand il y a
une recette ». Elle fait une grosse course le samedi et deux dépannages en semaine. Elle
cuisine deux fois : une fois pour la table, et une fois « la version sans » quand le plat
prévu ne passe pas. Elle lit les étiquettes de tout ce qui entre chez elle. Elle a un
carnet mental des marques sûres qu'elle ne partage avec personne parce que personne ne le
demande.

**Ce qu'elle a déjà essayé, et où ça s'est arrêté.**
Un planificateur gratuit, pendant trois semaines : les recettes étaient bien, mais elle a
passé son temps à vérifier les ingrédients un par un, et l'app lui a proposé un pesto deux
fois. Elle a arrêté. Un carnet Notion, six semaines : ça marchait et ça lui prenait
quarante minutes le dimanche soir. Elle a arrêté aussi. Elle est revenue au « je fais au
feeling », avec la charge que ça implique.

**Ce qu'elle dit, et qu'il faut entendre exactement.**
Pas « je ne sais pas quoi cuisiner ». Elle sait cuisiner. Elle dit :

> *« Je fais deux repas, tout le temps. Et le jour où je suis crevée, je fais des pâtes
> pour tout le monde et je m'en veux. »*

**Ce que le produit change pour elle, en une phrase qu'elle comprend sans explication.**
Une cuisson, deux assiettes, l'allergène nulle part — et quand le mardi s'écroule, on lui
dit ce qui se décale au lieu de la laisser recommencer.

**Ce qu'elle achète, en réalité.** Pas un planificateur de repas. **La fin de la double
cuisson**, et la fin de la vigilance permanente. Le prix qu'elle compare n'est pas 12,99 €
contre gratuit — c'est 12,99 € contre quarante minutes de dimanche soir plus un pesto
raté.

**Le déclencheur d'achat.** Elle ne cherche pas une app. Elle tombe sur une réponse à son
problème dans un groupe où elle est déjà — association d'allergiques, groupe de parents.
Ce qui la fait cliquer, c'est **un plan réel, montré**, avec l'allergène absent et la
logistique visible : pas une promesse, un artefact.

**Ce qui la fait partir, et il n'y en a que deux.** Un allergène dans un plan — une seule
fois, et c'est fini, avec la communauté par-dessus. Ou la lassitude vers la sixième
semaine, si le produit se répète.

---

**Le même persona, ses deux variantes proches**, qui comptent pour le même chantier :

- **Le foyer cœliaque.** Contrainte plus lourde encore (contamination croisée), population
  plus âgée — 70 % des diagnostics après 20 ans, donc souvent un **adulte** à une table
  de famille.
- **Le foyer avec un diabétique.** Contrainte permanente, suivie médicalement, et qui
  cohabite avec des enfants qui mangent normalement.

**L'anti-persona — à refuser explicitement pour les 1000 premiers :**

- ❌ **Le foyer uniforme sans contrainte.** C'est le marché de Jow. On y va après.
- ❌ **Le solo en meal prep.** Le gratuit lui suffit ; il n'a rien à nous acheter.
- ❌ **Celui qui veut perdre 5 kg avant l'été.** Contrainte négociable, donc abandon à
  six semaines — le risque de rétention qu'on essaie justement d'éviter.

### 2.4 Pourquoi cette sous-population reste la meilleure COHORTE *(mais plus le qualifieur)*

> ⚠️ **Section conservée, statut changé.** Elle argumentait que la contrainte médicale
> devait être **la cible**. Ce n'est plus vrai — voir §2.2. Ce qui reste vrai, et qui vaut
> d'être lu : quand un tel foyer se présente, **c'est la meilleure cohorte qu'on puisse
> avoir**, pour les trois raisons ci-dessous. On l'accueille, on la sert mieux que
> quiconque, on ne la chasse plus.

Parmi les tables non uniformes, celle-ci est **massivement mieux qualifiée** en rétention et
en démontrabilité, pour trois raisons cumulées :

> **Le foyer où quelqu'un a une contrainte NON NÉGOCIABLE.**
> Allergie sévère, cœliaque, diabète, intolérance médicale.

1. **L'échec du gratuit est déjà vécu, et il est nommé.** Ces gens ont essayé Jow ou Mealime
   et se sont arrêtés à un endroit précis qu'ils peuvent raconter. On n'a pas à créer la
   douleur ni à expliquer la catégorie.
2. **Ils sont déjà regroupés et ils se parlent.** Associations, forums, groupes de parents.
   C'est le seul segment de cette catégorie qui a des **communautés denses préexistantes** —
   donc un CAC potentiellement bas là où le doc dit que le CAC est *le jeu tout entier*.
3. **La contrainte est permanente.** Un régime s'abandonne en six semaines ; une allergie
   non. Ça attaque frontalement le risque n°3 (la rétention, §9).

⚠️ **Ce que ça implique, et ce n'est pas gratuit :** une contrainte médicale non négociable
place le produit à côté de la sécurité alimentaire. Le dépôt a déjà l'appareil pour ça
(`student_safety_constraints`, l'union fail-closed du foyer, le verrou de sortie) et c'est un
avantage réel — mais l'exigence de fiabilité y est plus haute qu'ailleurs. **Un plan qui
propose un allergène une fois coûte le foyer, et probablement la communauté avec.**

### 2.4 Ce qui est déclassé, et pourquoi c'est dit

- **Le solo en meal prep** : meilleur fit structurel, **pire cas de différenciation** — le
  gratuit lui suffit. Chemin d'entrée légitime, pas cible.
- **Le foyer uniforme sans contrainte** : c'est le marché de Jow. On y va après, avec la
  crédibilité acquise ailleurs, jamais en premier.

---

## 2.5 Les chiffres qui disent qu'on a raison d'y aller

*France, sources en fin de section. Ce sont des ordres de grandeur publics, pas des mesures
sur notre produit.*

### Le socle

| | |
|---|---|
| Familles avec au moins un enfant mineur au domicile | **7,9 millions** (INSEE, recensement 2022) |
| Ménages « couple avec enfant(s) » | **7,2 millions**, soit 23,4 % des ménages |
| Ménages avec au moins un mineur | **26 %** — en baisse (35 % en 1990) |

### La contrainte non négociable

| Contrainte | Prévalence | Source |
|---|---|---|
| Allergie alimentaire, enfants | **5 à 10 %** des enfants · **6 à 8 %** des moins de 15 ans | données FR, cohorte ELFE : 5,94 % de diagnostics déclarés par les parents avant 5,5 ans |
| … dont poly-allergiques | **20,5 %** des enfants allergiques (arachide, lait, œuf) | ELFE |
| Maladie cœliaque | **~1 %** de la population, **~700 000 personnes** en France · 1 à 1,6 % en Europe | et **seuls 10 à 20 % sont diagnostiqués** |
| Diabète (tous types) | **3,8 millions** de personnes sous traitement (2023), prévalence **6,48 %** · **7,1 %** des adultes 18-79 le déclarent (2024) | Santé publique France / Fédération des diabétiques |

### Le calcul du segment adressable

L'allergie se compte **par enfant**, pas par foyer. Avec ~1,8 enfant par famille, la
probabilité qu'un foyer ait **au moins un** enfant allergique est supérieure à la prévalence
individuelle :

```
1 − (1 − 0,06)^1,8  ≈  10,5 %      (hypothèse basse : 6 %)
1 − (1 − 0,08)^1,8  ≈  13,8 %      (hypothèse haute : 8 %)
```

**7,9 M familles × ~8 % (prudent, sous la fourchette calculée) ≈ 630 000 foyers** avec au
moins un enfant allergique alimentaire.

Auxquels s'ajoutent, sans double compte exact mais dans le même ordre : les foyers cœliaques
(~700 k personnes, dont une partie vit avec des enfants) et les foyers où un adulte est
diabétique (3,8 M personnes, majoritairement adultes, souvent parents).

> **Segment « table non uniforme avec contrainte non négociable », France : de l'ordre de
> 1 à 1,5 million de foyers.**

### ⚠️ Ce chiffre est le PLANCHER, plus la cible *(révision du 2026-08-18 au soir)*

Depuis que le qualifieur est **un compte de contraintes** et non une catégorie médicale
(§2.2), ce million de foyers n'est plus la cible : c'est **le sol sous la cible**.

| | Chiffre | Statut |
|---|---|---|
| **Plancher** — contrainte médicale non négociable | 1 à 1,5 M de foyers | **sourcé** (INSEE · ELFE · SPF) |
| **Plafond arithmétique** — familles avec ≥ 1 enfant mineur | 7,9 M de foyers | **sourcé** (INSEE 2022) |
| **Cible réelle** — foyers à ≥ 2 contraintes simultanées | entre les deux | **à mesurer** |

**Personne ne publie « part des foyers dont les membres ont deux contraintes alimentaires
différentes ».** On ne va donc pas l'inventer — et surtout, **on n'en a pas besoin** : la
question de recrutement pose déjà le compte.

> **Sur 10 foyers approchés au hasard à une sortie d'école, combien en ont deux ou plus ?**

C'est un chiffre qu'on a **avant la fin du mois**, mesuré sur le terrain, et il vaut mieux
que n'importe quelle estimation de bureau. Il détermine à lui seul si la cible est plus
proche du million ou des huit.

### Le chiffre qui rend le plan crédible

**1000 foyers, c'est 0,1 % du seul PLANCHER. Un foyer sur mille.**

C'est le seul chiffre de cette étude qui compte pour décider : il ne demande ni percée
virale, ni budget d'acquisition, ni conversion exceptionnelle. Il demande d'atteindre
correctement quelques communautés qui existent déjà.

À l'inverse, viser le foyer généraliste, c'est viser 0,013 % de 7,9 M **face à Jow, Mealime
et Samsung Food qui totalisent 22 M d'utilisateurs gratuits**. Même cible numérique, adversité
sans commune mesure.

### Ce que ces chiffres NE disent pas

- ⛔ Ils ne disent **rien de la disposition à payer**. Aucune source ici ne mesure ce qu'un
  foyer allergique paierait. C'est P1, et c'est une hypothèse.
- ⛔ Ils ne disent rien du **CAC réel** sur ces communautés. C'est P2.
- ⛔ La prévalence n'est pas l'accessibilité : 630 k foyers existent, ils ne sont pas tous
  joignables.

**Sources** : [INSEE — Ménages, couples et familles](https://www.insee.fr/fr/statistiques/8612510?sommaire=8612596) · [INED — Structure des familles avec enfants](https://www.ined.fr/fr/tout-savoir-population/chiffres/france/couples-menages-familles/structure-familles-enfants/) · [Prévalence des allergies alimentaires en France, cohorte ELFE](https://www.sciencedirect.com/science/article/abs/pii/S1877032021000749) · [Les allergies alimentaires de l'enfant en 2025](https://www.sciencedirect.com/science/article/abs/pii/S0001407925001426) · [Maladie cœliaque — chiffres France](https://www.regimesansgluten.fr/chiffres-de-la-maladie-coeliaque-en-france-realite-et-impacts) · [Recommandations maladie cœliaque 2025](https://recomedicales.fr/recommandations/maladie-coeliaque/) · [Fédération des diabétiques — chiffres France](https://www.federationdesdiabetiques.org/information/diabete/chiffres-france) · [Santé publique France — données diabète](https://www.santepubliquefrance.fr/en/diabete/data)

---

## 3. Les 1000 premiers

### 3.1 Le cadre : quatre paliers, chacun avec un critère d'arrêt

Un plan d'acquisition sans critère d'arrêt est une liste de vœux. Chaque palier ci-dessous a
une **question à laquelle il répond** et un **signal qui existe déjà dans le produit**.

| Palier | Cible | La question | On continue si |
|---|---|---|---|
| **P0** | **10 foyers**, recrutés à la main, gratuits | Le plan survit-il à la semaine 2 ? | ≥ 6 foyers génèrent un **deuxième** plan sans qu'on le demande |
| **P1** | **50 foyers payants** | Est-ce que quelqu'un paie ? | ≥ 30 % des P0 convertissent au prix plein, sans remise |
| **P2** | **200** via UN canal | Un canal se répète-t-il ? | CAC < 3 mois d'abonnement sur ce canal, mesuré |
| **P3** | **1000** | Ça tient à l'échelle ? | rétention S6 ≥ 40 %, et l'invitation produit ≥ 0,3 foyer par foyer |

**P0 est le seul palier qui compte vraiment.** Les trois autres sont de l'exécution ; celui-là
répond à la seule question qui peut tuer le projet, et il coûte zéro euro.

### 3.2 Les canaux, classés par ce qu'ils prouvent

**① Les communautés de contrainte** — le canal principal de P0 à P2.
Associations d'allergiques, groupes cœliaques, communautés de parents. On n'y arrive **pas**
avec un produit : on y arrive avec **une réponse à leur problème documenté**. Le contenu qui
marche là est un plan réel, pour un foyer réel, avec l'allergène absent et la logistique
visible.

**② L'invitation fonctionnelle** — §7.4, et c'est **une hypothèse, pas un fait** (§10.6).
Elle ne démarre rien : elle multiplie. Elle ne se mesure donc qu'à partir de P2, et son
chiffre (foyers invités par foyer) est le seul qui décide si P3 est atteignable sans budget.

**③ Le canal prescripteur** — diététiciens, nutritionnistes, pédiatres.
§10.4 le traite comme un **canal de distribution, jamais une seconde source de revenus**.
Sa force ici : un diététicien ne veut pas de logiciel, il veut que son patient **arrête
d'échouer à la maison**. C'est exactement notre promesse, et il a la liste.

**④ Le contenu de démonstration** — le seul asset qui se partage tout seul.
« Une cuisson, deux assiettes différentes, la même casserole » est **visuellement
démontrable**. C'est notre unique avantage de contenu contre des concurrents qui ne peuvent
pas faire cette image.

⛔ **Ce qu'on ne fait pas** : de la publicité payée avant P2. Face à des produits gratuits qui
dépensent en acquisition (§10.6), acheter du trafic avant de savoir ce qui convertit est la
façon la plus rapide de brûler la trésorerie sans rien apprendre.

### 3.3 L'arithmétique, honnêtement

Le doc pose le cadre : **7 € par foyer contre 700 € par coach — il faut cent foyers pour
égaler un coach.** À 12,99 €, 1000 foyers font ~13 k€/mois brut. C'est un vrai produit, et ça
ne finance pas une équipe.

Deux conséquences à assumer :

- **Le prix n'est pas à défendre mais il n'est pas à monter non plus** : Samsung Food+ facture
  6,99 $ pour « profil santé + objectifs + plan hebdo ». C'est l'ancre. Au-dessus, il faut
  que la différence se voie **avant** le paiement.
- **Le second revenu (affiliation sur les paniers) n'est pas un bonus, c'est la moitié du
  modèle** (§11) — et la ligne rouge tient : commission au **volume**, jamais de placement de
  marque. C'est ce qui nous distingue de Jow, financé par les industriels, et **disqualifié
  dès qu'il y a un objectif**.

---

## 4. Comment savoir si le produit tient la promesse

**C'est la partie la plus importante de cette étude, et la plus faisable.**

### 4.1 Le trou béant : personne n'a jamais évalué un plan généré

Le produit entier repose sur la qualité d'un artefact — le plan — et **aucun mécanisme du
dépôt ne l'évalue**. Il y a des verdicts d'enveloppe, une couverture de composition, des
gardes de sortie : tout ça mesure la **conformité**, pas la **qualité**. Rien ne répond à
« est-ce que ce plan est bon ? ».

**Avant P0, c'est le lot n°1.** Vingt plans générés, relus à la main contre une grille écrite
(faisable ? appétissant ? varié ? la logistique tient-elle ?), avec un verdict par plan. Sans
cette base, aucun retour d'utilisateur ne sera interprétable : on ne saura pas si le foyer a
lâché à cause du produit ou à cause d'un mauvais plan ce jour-là.

### 4.2 Une promesse, une réfutation, un signal qui existe

Chaque promesse doit avoir la mesure qui la **contredirait**. Toutes celles-ci sont déjà
instrumentées :

| Promesse | Ce qui la réfuterait | Signal disponible |
|---|---|---|
| **Une cuisson nourrit plusieurs jours** | ils ne cuisinent pas le jour de session, ou ne mangent pas le lot | les coches de repas (`meal_tick`), `cook_on` vs coche |
| **Les parts divergent par personne** | les `portion_note` se ressemblent, ou la table dit que les parts étaient fausses | la question `portions` de `plan_feedback` — **c'est LA vérité terrain que le moteur n'a pas** |
| **Les courses arrivent en vagues** | ils achètent tout le premier jour | l'état de vague (`grocery_waves`, `buyOn`) |
| **Ça survit à un imprévu** | après un accident, le plan est abandonné | la procédure accident (FF-057) et la génération suivante |
| **Le plan leur plaît** | `never_again` monte, la polarité positive reste vide | `plan_feedback` — **livré et prouvé en réel le 2026-08-15** |
| **La variété tient** | répétitions rapprochées à partir de S4 | ⚠️ **N'EXISTE PAS.** §9.1 l'exige comme métrique produit ; elle n'est pas construite |

### 4.3 Les trois chiffres qui décident, et rien d'autre

1. **Le deuxième plan.** Le foyer en génère-t-il un sans qu'on lui demande ? C'est le seul
   signal binaire de valeur perçue, et il arrive en une semaine.
2. **La semaine 6.** Le plafond de variété tue la catégorie vers là (§9.1). Si la rétention
   tient à S6, le produit a une chance ; sinon rien d'autre ne compte.
3. **L'invitation.** Combien de foyers un foyer amène-t-il ? C'est ce qui décide si P3 est
   atteignable sans budget d'acquisition.

### 4.4 Ce qu'il ne faut PAS faire

- ⛔ **Demander « est-ce que tu aimes ? »** en face à face. Un beta-testeur recruté à la main
  répond oui. Le deuxième plan, lui, ne ment pas.
- ⛔ **Interpréter un abandon sans savoir si le plan était bon** (§4.1).
- ⛔ **Compter les inscriptions.** À P0, un compte créé qui ne génère pas de deuxième plan est
  un échec déguisé en traction.

---

## 4bis. Les certitudes — ce qui reste vrai si les plans sont bons

*Formulé comme une conditionnelle assumée : **à supposer que les plans conviennent**, voici
ce qui ne dépend plus de la chance. Ce sont des faits vérifiés, pas des espoirs.*

### C1. L'intersection est vide, et le plus avancé a documenté son échec

Ce n'est pas « on n'a pas trouvé de concurrent ». C'est **Eat This Much qui publie son propre
contournement** : caler sur la personne qui mange le moins, ou additionner et diviser au
prorata. Quelqu'un a construit la fonctionnalité, a échoué, et l'a écrit. On ne connaît pas
de meilleure preuve qu'un problème est réel et non résolu.

### C2. Le concurrent dominant est structurellement disqualifié sur ce segment

Le conseil de Jow est **financé par les marques** — retail media, les industriels paient pour
être l'ingrédient. Ce n'est pas un retard de fonctionnalité qu'il pourrait combler : c'est son
**modèle économique**. Un foyer qui a une contrainte médicale ne peut pas accepter un conseil
payé par celui qui vend l'ingrédient. Cette disqualification est **permanente**.

Et notre ligne rouge est déjà écrite (§11 de PIVOT-FOYER) : commission au **volume**, jamais
de placement de marque. Le jour où on l'accepte, il ne reste que Jow avec 9 millions
d'utilisateurs de moins.

### C3. La contrainte ne disparaît pas — donc le risque n°1 de la catégorie est atténué

Le tueur documenté de cette catégorie est l'abandon vers la sixième semaine. Un régime
s'abandonne ; **le fait que les gens d'un même foyer n'aient pas les mêmes besoins, non.**

Deux régimes de permanence, et les deux tiennent :

- **Permanentes** — une allergie, une cœliaquie, un diabète, une conviction religieuse ou
  éthique. Elles ne se négocient pas.
- **Évolutives mais persistantes** — un enfant grandit, un objectif change, un rythme se
  déplace. La contrainte se transforme ; **elle ne s'annule pas**, et le foyer a toujours
  besoin de la réconcilier.

Dans les deux cas, la raison qui a amené le foyer est encore là au troisième mois. C'est
structurel, pas une astuce de rétention — et c'est ce qui nous sépare d'une application de
régime.

### C4. Le segment est déjà regroupé, ce qui répond au seul risque que le doc appelle « le jeu tout entier »

§10.6 dit que le CAC devient tout le jeu et qu'il n'a **jamais été testé**. Ce segment est le
seul de la catégorie qui vient avec des **communautés denses préexistantes** — associations,
groupes de patients, canal médical. Ça ne garantit pas un CAC bas ; ça garantit qu'il existe
un endroit où essayer, ce qui n'est pas le cas du foyer généraliste.

### C5. L'arithmétique ne demande rien d'exceptionnel

**Un foyer sur mille** du segment. Pas de viralité, pas de budget, pas de conversion hors
norme.

### C6. L'architecture traite déjà la contrainte comme un verrou dur, et c'est rare

Ce que ce segment exige avant tout, c'est la **fiabilité**. Le dépôt a le double verrou :
consigne dans le prompt **et** vérification déterministe sur le texte sortant
(`forbidden_matcher.ts`, une seule implémentation, deux appelants). L'allergène est une union
**fail-closed** au niveau du foyer — une allergie d'un seul membre gouverne toute la
casserole, et si la lecture échoue, **la génération s'arrête** au lieu de composer.

C'est exactement l'inverse du réflexe d'un produit qui fait confiance à son modèle, et c'est
ce qui rend ce segment atteignable pour nous et pas pour un planificateur LLM ordinaire.

---

### ⛔ Les deux conditions, et il y en a DEUX — pas une

Tu as dit « sous réserve que les plans conviennent ». Il faut en ajouter une seconde, mesurée
le 2026-08-18 :

1. **Les plans doivent être bons** — et rien ne l'évalue aujourd'hui (§4.1). C'est le lot
   préalable à P0. **❌ TOUJOURS OUVERT.**
2. **Les verrous de sécurité doivent être complets.** Le régime alimentaire n'était appliqué
   que sur la voie foyer ; la voie individuelle n'en lisait que le drapeau de carence — la
   racine étant une **position** : `declaredRegime` était lu ~300 lignes SOUS
   `buildMealPrompt`, donc après la construction du prompt.
   **✅ FERMÉ le 2026-08-18** — consigne (`dietaryRegimePromptLine`, au-dessus de la doctrine
   du coach) + vérification déterministe de sortie (`excludedSurfaceFormsFor` ×
   `findForbiddenMatches`, sur titre + `why` + ingrédients), prouvées par deux mutations.
   **Reste :** dix générations réelles, sorties lues.

**La seconde condition était plus dure que la première sur ce segment.** Un plan médiocre
coûte un foyer. **Un allergène coûte le foyer, la communauté, et la réputation.** Elle est
fermée en code ; elle ne sera close en fait qu'après le run réel.

**Il ne reste donc qu'une condition ouverte, et c'est la première.** C'est le seul endroit
de cette étude où je dirais : ne pas lancer P0 avant que ce soit fait.

---

## 5. Ce qui bloque aujourd'hui, en une liste

| | État au 2026-08-18 |
|---|---|
| Évaluation de la qualité d'un plan | ❌ n'existe pas — **préalable à P0** |
| Métrique de variété (§9.1) | ❌ n'existe pas — préalable à la mesure de S6 |
| Verrou de régime alimentaire | ✅ câblé le 18 (consigne + sortie), ⚠️ **run réel à faire** |
| Porte de la procédure accident à l'écran | ✅ ouverte le 18 (`/app/today`), ⚠️ tap réel non joué |
| Aperçu du plan depuis l'inscription | ✅ livré le 15, ⚠️ **jamais joué en run réel** |
| `member_id` sur un plat dédié | ✅ livré le 15, ⚠️ non mesuré en run réel |
| Questionnaire de fin de plan | ✅ livré **et prouvé en réel** |
| Habitudes par bouche | ✅ livré, lu au runtime |
| Halal / casher | ⛔ **non promettable**, par décision écrite — pas un trou à combler |
| i18n `en.ts` / `fr.ts` | ⚠️ non commité, tenu par une autre session |
| Déploiement | ❌ 200 migrations, rien en production |

**Les deux ❌ du haut sont le vrai chemin critique.** Le reste est de la finition ; ces
deux-là décident de notre capacité à *interpréter* les 10 premiers foyers.
