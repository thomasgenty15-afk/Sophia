# DESIGN — partir de l'habitude, pas du besoin

**2026-08-20** · issu du brainstorming avec le propriétaire, après la nuit du grammage.
⚠️ **Rien n'est implémenté.** Ce document est une décision de conception, pas un état du code.

## La règle qui gouverne tout le reste

> **Le produit ne change pas ce qu'on mange. Il fait gagner du temps sur la
> planification et la préparation, et rééquilibre à la marge.**

Aujourd'hui l'algorithme part du BESOIN : calculer → générer → ajuster les
quantités. Le repas est *déduit* d'un chiffre.

Il doit partir de l'HABITUDE : observer ce qu'ils mangent → le garder → corriger
à la marge. Le repas devient une *donnée*.

⚠️ **Ce renversement dissout la moitié des défauts de la nuit du 19-20.** Si on
sait que Christèle mange un plat de ~220 g suivi d'un fromage et d'un dessert, il
n'y a plus rien à dériver : ni Mifflin, ni PAL sur-déclaré, ni convention à 42 %,
ni curseur d'appétit. On observe, et on corrige de 10 % vers l'objectif.

### Les trois règles du générateur qui en découlent

1. **On change les quantités AVANT les aliments.**
2. **Une seule substitution à la fois.** Pas trois.
3. **Un plat nouveau par semaine au maximum.** Jamais un plan entier neuf.

Un plan qui remplace le poulet-purée par un bowl quinoa-edamame est
nutritionnellement meilleur et ne sera pas cuisiné.

---

## Les cinq choses qu'on collecte

| # | Nom | Portée | Forme |
|---|---|---|---|
| ① | **La structure du repas** | par personne | 3 cases : dessert / fromage / pain |
| ② | **L'activité, reformulée** | par personne | 2 faits : heures de sport / semaine, travail assis ou debout |
| ③ | **Les jours de tradition** | **foyer** | 2-3 cases : « dimanche rôti », « vendredi poisson », « samedi on commande » |
| ④ | **Le répertoire** | foyer | 3 plats saisis + 20 à cocher |
| ⑤ | **L'appétit** | par personne | 3 crans : petit / moyen / gros (±10 %) |

### ① La structure du repas — ce qui remplace la convention à 42 %
Le plan ne compose que le plat principal (9 plats sur 9, mesuré). Un vrai repas
porte aussi du pain, du fromage, un dessert. Aujourd'hui le moteur suppose que
le plat vaut 42 % du repas — **une moyenne française**, qui se trompe dans les
deux sens à la fois : trop peu pour qui ne prend jamais de dessert, trop pour qui
prend fromage *et* dessert.

Trois cases remplacent la moyenne par un fait.

### ② L'activité — une reformulation, pas une question de plus
« Sédentaire / debout / s'entraîne un peu / s'entraîne dur » demande aux gens de
se ranger dans une catégorie flatteuse. **La sur-déclaration d'activité est le
biais le mieux documenté de la nutrition appliquée.**

Le coût mesuré sur Christèle : entre `sedentary` (PAL 1,45) et `trains_some`
(1,80) il y a **420 kcal/jour** — plus que tout ce que le curseur d'appétit
corrigera jamais (±215 kcal).

Personne ne se sur-évalue sur un nombre d'heures. Deux faits, et le PAL se
dérive.

### ③ Les jours de tradition — le meilleur rapport valeur/coût
Casser « le dimanche c'est rôti » fait fermer l'app — pas parce que le plat est
mauvais, parce qu'il est **déplacé**. Trois cases, une fois, et ça verrouille des
cases que le générateur n'a plus le droit de toucher.

### ④ Le répertoire — la plus grosse valeur, le plus gros coût
⛔ **« Ce qu'il aime » est une mauvaise question.** Les gens répondent en idéal
(« j'aime le poisson »), pas en réalité (une fois par mois).

La bonne question est le **répertoire** : les 10-15 plats qu'un foyer sait faire
et refait en boucle. Tout le monde en a un, et il est court. Le connaître donne
quatre choses d'un coup :

- de quoi composer **sans rien inventer** — donc sans rejet ;
- les **vraies portions**, observées et non dérivées ;
- la **structure réelle du repas** ;
- un **débit de nouveauté contrôlé**.

⚠️ **Ne pas demander de se RAPPELER 15 plats** — c'est épuisant et les gens en
trouvent 4. Demander **3 plats saisis**, puis en proposer **20 courants à
cocher**. La reconnaissance coûte infiniment moins cher que le rappel.

### ⑤ L'appétit — l'a priori du premier jour, rien de plus
±10 % autour de l'estimation : c'est la variation réelle documentée autour d'une
équation de prédiction. Bornée, symétrique, et le plancher TCA reste dessous —
impossible de s'en servir pour se sous-alimenter.

⚠️ **Il est destiné à être remplacé** par la boucle de poids (voir plus bas). Ce
n'est pas une vérité permanente, c'est une valeur de départ qu'on oublie.

---

## Où ça se place dans l'onboarding

```
ÉTAPE 3  (début)   ③ les jours de tradition        <- fiche FOYER, dilué ici
                   ④ le répertoire                  <- fiche FOYER

FICHE DE CHAQUE BOUCHE
                   ① la structure du repas
                   ② l'activité (REMPLACE la question actuelle)
                   ⑤ l'appétit
```

Les jours de tradition et le répertoire sont des faits **de foyer** : ils
supposent une fiche de préférences au niveau du foyer, et le début de l'étape 3
est le bon endroit pour les diluer. Le reste appartient à chaque personne.

⚠️ **② est un REMPLACEMENT.** La question d'activité existe déjà : la reformuler
ne coûte pas un écran de plus.

---

## ⛔ TOUT EST OPTIONNEL — et ça se conçoit, ça ne se subit pas

Chaque champ doit avoir un **comportement défini quand il est vide**, écrit, et
qui ne ressemble pas à une réponse.

| champ vide | comportement |
|---|---|
| ① structure du repas | la moyenne à 42 % reprend la main |
| ② activité | inchangé : l'hypothèse actuelle, nommée |
| ③ jours de tradition | aucune contrainte, comportement d'aujourd'hui |
| ④ répertoire | le modèle compose librement, comme aujourd'hui |
| ⑤ appétit | `moyen` = ×1,00 — un neutre vrai, pas un défaut déguisé |

⚠️ **Cicatrice connue du dépôt : « paramètre de garde optionnel = garde
désarmée ».** Un champ facultatif qui se replie en silence sur une valeur
plausible est un champ dont personne ne sait s'il a été rempli. Chaque repli
ci-dessus doit être **compté** dans `generated_from`, pour qu'on puisse lire
« combien de foyers n'ont pas répondu » plutôt que de le supposer.

---

## Ce qui ne se demande pas — les deux boucles

### La boucle de poids — elle finit par tout remplacer
Si quelqu'un est **stable** à 58 kg, alors ce qu'il mange **est** sa
maintenance, par définition. Les 2 205 kcal de Mifflin sont une *estimation* ; sa
stabilité est une *mesure*. La mesure gagne toujours.

Le dépôt a déjà les deux briques (série de pesées datées, moteur de divergence).
Ce qui manque est la boucle : *si le poids ne bouge pas alors qu'on sert X, alors
la maintenance est X — corrige l'estimation.*

Propriété que rien d'autre n'a : **ça s'auto-corrige et ça ne demande rien.**
Défaut : ça met des semaines. D'où ⑤ pour le premier jour.

### La boucle de retour sur le plan — elle construit le répertoire toute seule
« Tu l'as fait ? » et « tu changerais quoi ? » n'existent pas aujourd'hui.

⚠️ Il y a bien un module de signal de faim dans le dépôt (fenêtre glissante,
aucun trait « gros mangeur » écrit sur personne, consigne de silence pour que le
chiffre ne ressorte jamais) — **mais il ne marche que dans un sens** : il sait
qu'on a eu faim, pas qu'on a laissé la moitié. Pour Christèle, c'est précisément
le sens qui manque.

---

## L'ordre d'implémentation

| ordre | lot | pourquoi ici |
|---|---|---|
| **1** | ② l'activité reformulée | **le plus gros écart** (420 kcal/j), et c'est un REMPLACEMENT — zéro coût d'onboarding |
| **2** | ① la structure du repas | remplace une moyenne par un fait, 3 cases, corrige le grammage servi aujourd'hui |
| **3** | ③ les jours de tradition | le moins cher, et il protège l'adhésion |
| **4** | ⑤ l'appétit | l'a priori du jour 1 ; utile tant que la boucle de poids n'existe pas |
| **5** | ④ le répertoire | la plus grosse valeur, mais un vrai chantier (saisie + catalogue + composition depuis le répertoire) |
| **6** | boucle de retour | « tu l'as fait ? » — c'est elle qui fait vivre ④ sans le demander |
| **7** | boucle de poids | remplace ⑤, et à terme rend l'estimation secondaire |

⚠️ **1 à 3 sont petits et se font vite.** Ils suffisent probablement à amener
Christèle de 421 g à ~250 g sans rien demander de nouveau à personne — puisque
② est une reformulation et ① trois cases.

## La question laissée ouverte

**Le répertoire se saisit-il à l'inscription, ou se construit-il tout seul en
observant les plans acceptés ?**

- saisi : plus juste tout de suite, coûte de la conversion ;
- appris : gratuit, met un mois ;
- mixte : trois plats à l'inscription pour amorcer, le reste appris — c'est le
  chemin qui me paraît le bon, mais il n'est pas tranché.

⚠️ **Un onboarding long tue la conversion.** Quelqu'un qui arrive veut son
premier plan, pas un questionnaire. La question de design n'est pas « qu'est-ce
qu'on aimerait savoir » mais **« quel est le minimum pour que le plan n°1 soit
familier ? »**

## Une piste à vérifier avant de construire ④

Il existe déjà un pont mémoire → générateur pour les préférences alimentaires
dans ce dépôt, mais il est **étroit** (quelques clés de domaine). Vérifier s'il
peut porter un répertoire **avant** d'en créer un second à côté.
