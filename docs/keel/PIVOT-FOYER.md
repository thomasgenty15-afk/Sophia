# Le pivot foyer — la valeur, les fonctionnalités, l'horizon

> Document de référence issu de la session du 7 août 2026. Il décrit **où va le produit**,
> pas ce qui est construit. Ce qui est construit est décrit par [MODEL.md](MODEL.md) et
> [VALEUR-COACH.md](VALEUR-COACH.md), qui restent vrais tant que ce pivot n'est pas livré.

> ### 🧭 Une partie de ce document a été dépassée par la livraison
>
> Le chantier du 2026-08-10 a construit le foyer. **Ce document n'est plus
> l'autorité sur les sections suivantes :**
>
> | Section | État | Autorité en vigueur |
> |---|---|---|
> | §7, §7.5 | périmées (décisions du 2026-08-08) | [CHANTIER-FOYER-PROFILS.md](CHANTIER-FOYER-PROFILS.md) |
> | §8.1 → §8.3 (la récolte par membre) | **périmées** — voir le bandeau du §8 | [FF-050](../fonctionnalites/le-foyer/FF-050-l-envie-de-la-semaine.md) |
> | §8.4, §8.5 | **en vigueur**, inchangées | ce document |
> | le modèle d'invitation | périmé — rejoindre **attache**, ça n'insère pas | [FF-048](../fonctionnalites/le-foyer/FF-048-reclamer-son-profil.md) |
> | §11 (le modèle économique) | le code existe **en entier** (job, table de période, `free_until`, gel) ; **rien ne facture** tant que les prix Stripe ne sont pas posés | [FF-049](../fonctionnalites/le-foyer/FF-049-le-prix-du-foyer.md) |
>
> **La direction du domaine, telle qu'elle est appliquée aujourd'hui, vit dans
> [docs/fonctionnalites/le-foyer/README.md](../fonctionnalites/le-foyer/README.md)** —
> avec ses règles transverses et ses trous connus — **ouverts et refermés**,
> chacun avec le commit qui l'a fermé.

**Les deux décisions que ce document porte**, pour qui n'en lirait rien d'autre :

1. **L'unité planifiée est la session de cuisine, pas le plat** — N jours pour M personnes,
   une cuisson, des portions qui bifurquent selon l'objectif de chacun (§3).
2. **B2C d'abord, coachs ensuite** — pour une raison de dépendance, pas d'enthousiasme :
   un coach n'achète pas « sa méthode injectée », il achète un socle que ses élèves
   utilisent (§10).

## Sommaire

| | |
|---|---|
| [1. La douleur](#1-la-douleur) | Ce qu'on soigne vraiment |
| [2. La proposition](#2-la-proposition) | Une phrase |
| [3. La décision structurante](#3-la-décision-structurante--lunité-nest-pas-le-plat-cest-la-session) | L'unité = la session de cuisine |
| [4. Ce que l'utilisateur gagne](#4-ce-que-lutilisateur-gagne) | Le tableau des gains |
| [5. L'entrée est à 1](#5-lentrée-est-à-1--la-famille-est-lupgrade-jamais-le-ticket-dentrée) | Activation et prix — **pas** la cible. **§5.1 : le persona prioritaire** |
| [6. Les fonctionnalités](#6-les-fonctionnalités-dans-lordre-où-on-les-vit) | Dans l'ordre où on les vit |
| [7. Les arguments de valeur](#7-les-arguments-de-valeur-classés-par-solidité) | Classés par solidité, dont la douve |
| [8. Le conseil de famille](#8--le-conseil-de-famille) | Le rituel, et les deux autorités |
| [9. Les deux leviers de rétention](#9-les-deux-leviers-de-rétention) | Variété mesurée, swap |
| [10. L'ordre décidé](#10-lordre-décidé--b2c-dabord-coachs-ensuite) | B2C → distribution → marketplace |
| [11. Le modèle économique](#11-le-modèle-économique) | Et la ligne rouge |
| [12. Ce qui disparaît](#12-ce-qui-disparaît) | |
| [13. Mises en garde](#13-mises-en-garde) | |
| [14. Le fil à ne pas oublier](#14-le-fil-à-ne-pas-oublier) | |
| [Annexe — paysage concurrentiel](#annexe--paysage-concurrentiel-recherche-du-7-août-2026) | Recherche du 7 août 2026 |

---

## 1. La douleur

Pas « je ne sais pas quoi manger ce soir ». Ça, c'est le symptôme.

La douleur, c'est **la charge mentale de nourrir un foyer**, et dans les faits elle est portée
par **une seule personne**. Décider chaque jour, tenir compte de ce que chacun aime, veut, ne
digère pas, viser des objectifs qui divergent, acheter au bon moment, et cuisiner. Sept fois
par semaine, sans fin, sans reconnaissance.

Le mode d'échec de toute la catégorie est documenté et il est toujours le même : les apps
existantes s'attaquent à **un seul maillon** et **ajoutent du travail administratif** au lieu
d'en retirer. Elles demandent de saisir, de logger, de photographier. Elles transforment le
dîner en projet.

### 1.1 ⚠️ « Il n'existe rien » est FAUX, et le dire nous décrédibilise

Des solutions existent pour la moitié **planning + courses**, et elles ont des millions
d'utilisateurs (Jow 9 M, Samsung Food 6 M, Mealime 7 M — annexe). Affirmer qu'il n'y a rien
se réfute en trois secondes, et on perd l'argument entier avec.

Ce qui n'existe **nulle part**, ce sont les deux autres moitiés :

1. **Une seule cuisson qui serve des besoins DIVERGENTS.** C'est l'intersection vide de
   §7.1, vérifiée.
2. **La re-planification.** Le mardi où rien ne se passe comme prévu. Aucun de ces produits
   ne sait quoi faire d'un repas sauté, d'une session ratée, de courses non faites. Or **la
   charge mentale est là** — pas dans « quoi manger jeudi », mais dans « tout est décalé, je
   recommence ».

La formulation défendable est donc étroite, et c'est sa force :

> **« Je porte l'alimentation de plusieurs personnes qui n'ont pas les mêmes besoins, et
> tout se casse dès qu'un imprévu arrive. »**

### 1.2 POURQUOI CETTE PLACE EST LIBRE — et c'est ça qui la rend défendable

Un espace inoccupé est un piège s'il est vide faute de demande. Il est une position s'il est
vide pour une raison **structurelle**. Ici la raison est structurelle :

Jow, Mealime et Samsung Food vivent d'**affiliation et de marge retail**. Leur métier est de
faire acheter un panier. Servir des besoins nutritionnels divergents demande un **moteur de
nutrition** — coûteux, et qui ne vend pas un gramme de courses en plus. Ils ne le
construiront pas parce que ça ne sert pas leur modèle, pas parce qu'ils n'y ont pas pensé.

⚠️ Ça ne prouve pas la demande. Une intersection vide est une affirmation de
**différenciation**, jamais de **marché** — et la première hypothèse de §10.6 reste entière :
un foyer réel qui paie.

---

## 2. La proposition

> **Une session de cuisine, trois jours de repas, des portions qui divergent selon
> l'objectif de chacun — selon une méthode, avec les courses déjà dans le panier.**

**« Selon une méthode » ne veut pas dire « il faut un coach ».** La méthode est un *angle de
composition*, choisi ou délégué. Sans coach, l'angle par défaut est **la méthode de la
maison** — le mécanisme existe déjà et il est câblé (`_shared/keel/doctrine_delegation.ts`,
coach `coach_kind='house'`) : l'agent sert cette méthode et **signe du nom de la maison**,
jamais de celui d'un coach que le foyer n'a pas choisi. Toute la phase 1 (§10) tourne
là-dessus.

---

## 3. LA DÉCISION STRUCTURANTE : l'unité n'est pas le plat, c'est la session

Tout le reste en découle, et c'est ce qui sépare ce produit de ses concurrents.

Les apps de repas planifient **des plats** : 21 repas indépendants, à cuisiner un par un.
Les apps de batch cooking planifient **une session** mais depuis un catalogue de recettes,
sans aucun modèle nutritionnel par personne.

Ici, l'objet planifié est **la session de cuisine** :

- elle couvre **N jours pour M personnes** ;
- elle produit une base commune, cuisinée une fois ;
- chaque repas suivant demande **un temps de préparation minimal** — assembler, réchauffer,
  dresser, pas cuisiner ;
- et la chaîne **bifurque** : mêmes casseroles, portions et accompagnements différents selon
  l'objectif de chaque personne du foyer.

C'est là qu'est l'intersection vide du marché (§7.1). Ce n'est pas « du batch cooking » —
le batch cooking existe partout. C'est **du batch cooking sous contrainte nutritionnelle
divergente**, et les deux familles de produits existantes n'ont chacune qu'une moitié du
problème.

### Conséquence directe : la cadence de courses est une SORTIE du plan

Si l'unité est la session, alors le calendrier d'achat n'est plus « une fois par semaine,
le samedi ». Il se **déduit** :

- la viande et le poisson du milieu de semaine ne s'achètent pas le lundi ;
- un plan de 7 jours implique donc **deux vagues** — le frais tardif attend sa vague ;
- le produit dit **quoi acheter, et quand**, parce qu'il connaît la date de la cuisson qui
  le consomme et la durée de conservation de l'ingrédient.

Personne ne planifie la *cadence* des courses. Tout le monde produit une liste unique.

C'est une fonctionnalité honnête qui se trouve aussi être économiquement favorable : deux
paniers routés au lieu d'un (§11), et la raison en est la fraîcheur, pas la vente.

---

## 4. Ce que l'utilisateur gagne

| | Concrètement |
|---|---|
| **La décision** | Elle est prise. Plus de « qu'est-ce qu'on mange ». |
| **Le temps de cuisson** | Des sessions groupées. Les repas suivants sont des assemblages. |
| **Les courses** | Liste agrégée → panier → livraison ou drive. Au bon moment, sans saisie. |
| **L'argent** | Recouvrement d'ingrédients, moins de gâchis, moins de capitulation en livraison. |
| **Le résultat** | Chacun atteint *son* objectif sans qu'on cuisine trois repas. |
| **La charge mentale** | C'est la vraie livraison. Le foyer cesse d'être un projet à gérer. |

---

## 5. L'ENTRÉE EST À 1 — la famille est l'upgrade, jamais le ticket d'entrée

*Principe fondateur, pas un horizon. Il gouverne l'activation et la tarification.*

> ### ⛔ CE QUE CETTE SECTION NE GOUVERNE PAS — précision du 2026-08-18
>
> **Elle parle d'ACTIVATION et de PRIX, pas de CIBLE.** Elle a été citée pour freiner des
> chantiers foyer; c'est un contresens, et il faut le fermer ici.
>
> La cible prioritaire est le **foyer** (§5.1). Le produit reste entier pour qui arrive
> seul — c'est une contrainte de mécanique, pas un ordre de priorité commerciale. On parle
> aux gens qui cuisinent pour plusieurs; on ne casse rien pour celui qui cuisine pour un.
>
> **Et la tension entre les deux est un faux problème**, pour une raison qui vaut mieux que
> la formulation d'origine : le mode famille ne sert pas *seulement* les autres. Il sert
> **la personne elle-même** — celle qui veut changer son alimentation **sans arrêter de
> nourrir tout le monde**. Ce n'est donc pas « d'abord une personne, la famille en
> extension » : c'est **la même personne**, qui a un objectif à elle et une table à tenir.
>
> Le mode famille est ce qui lui permet, à *elle*, de tenir son objectif.

Le produit doit livrer **sa valeur entière à une seule personne dès le premier jour** :
sessions de cuisine, portions selon son objectif, courses en vagues, explication des choix.

Le conseil de famille (§8) apparaît **quand un deuxième profil existe**. C'est une découverte,
pas un prérequis. Un produit qui exige trois profils pour devenir bon meurt à l'activation.

Conséquence tarifaire directe : le compte maître seul est un **produit complet**, pas une
version amputée. Les sous-comptes sont un ajout, et ils se paient parce qu'ils ouvrent le
rituel — pas parce qu'ils débloquent le produit.

### 5.1 LE PERSONA PRIORITAIRE — arrêté le 2026-08-18

> **La personne qui a un objectif à elle ET une table à tenir.**

Concrètement : elle porte les courses, la cuisson et le planning du foyer ; elle a son propre
objectif nutritionnel (reperdre du poids, se remettre en forme, une contrainte de santé) ;
et **aujourd'hui elle doit choisir entre les deux**. Alors soit elle abandonne son objectif,
soit elle cuisine deux fois.

C'est ce double bind que le produit dénoue, et c'est *tout* le produit : une session de
cuisine, des parts qui divergent.

**Pourquoi c'est le meilleur persona B2C, et pas seulement le plus sympathique :**

| | |
|---|---|
| **La douleur est double et simultanée** | Les concurrents résolvent un côté (le planning familial) ou l'autre (mon régime), jamais les deux à la fois. §7.1 rendu personnel |
| **Elle décide et elle paie** | Une personne tranche pour plusieurs : pas d'achat de groupe à organiser, valeur par acquisition élevée |
| **La douve se construit vite chez elle** | Elle décrit trois ou quatre personnes; le graphe de §7.8 s'accumule à cette vitesse-là, pas à celle d'un compte solo |
| **L'invitation a un motif** | Elle a une raison fonctionnelle d'ajouter son conjoint — son objectif diverge. C'est l'hypothèse d'acquisition de §7.4, chez la personne qui peut la valider |

**Ce que ça déclasse, et il faut le dire.** Le solo qui fait déjà du meal prep était classé
premier pour son **fit structurel** — son comportement actuel *est* l'unité de planification
du produit. Mais c'est le **pire cas de différenciation** : pour lui, les produits gratuits
existants marchent très bien. Il reste un chemin d'entrée légitime; il n'est plus la cible.

**✅ La conséquence technique qu'on craignait est DÉJÀ FERMÉE — revérifié le 2026-08-18.**

Le 14 août, une bouche sans compte n'avait aucun canal d'habitudes :
`household_voices_io.ts` ne charge les préférences que par `.in("user_id", …)` sur
`student_goals`, et une bouche sans compte n'a pas cette ligne. Dans une famille de quatre
sans profil réclamé, seules les habitudes du maître atteignaient le plan.

**Ça n'est plus vrai.** `household_member_habits` existe (`slots` jsonb + `note`, clée sur
`member_id`), avec ses trois RPC (`keel_household_habits`, `_for`, `set_member_habits`), elle
est écrite depuis l'entonnoir (`SetupPage.tsx` via `api/householdHabits.ts`), elle passe une
garde de texte (`_shared/keel/household_habits.ts :: gateMemberHabits`), et surtout **elle
est LUE au runtime** : `generate-household-meal-v1:1042-1048` la charge et
`:1530-1531` l'injecte dans le roster (`habits`, `habitNote`). Elle est aussi dans l'export
RGPD.

Donc chaque bouche a désormais : prénom, âge, objectif, corps, allergies, absences **et
habitudes**. Le canal qui manquait au persona de §5.1 est complet.

⚠️ **Leçon de méthode, pas seulement de contenu.** Cette section a d'abord porté
l'affirmation inverse, écrite depuis une lecture de quatre jours plus tôt. Dans un dépôt où
plusieurs sessions livrent en parallèle, **une affirmation d'absence se re-vérifie avant
d'être citée** — la précédente aurait fait reprioriser un chantier déjà fait.

---

## 6. Les fonctionnalités, dans l'ordre où on les vit

1. **Profils du foyer** — un par personne : objectif, contraintes médicales, intolérances,
   allergies, goûts, dégoûts, niveau en cuisine, temps disponible.
2. **Le conseil de famille** — le rituel du week-end. Chacun dit ce dont il a envie, le
   produit met en commun et compose. Voir §8 : c'est le cœur du produit, pas une option.
3. **La validation** — collective ou individuelle, au choix du foyer. Quand un choix ne va
   pas dans la direction que la personne s'est fixée, **on explique pourquoi**. On n'interdit
   pas.
4. **Le plan de la semaine** — composé *sous contraintes*, jamais piqué dans un catalogue.
   L'angle est donné par la méthode choisie.
5. **Les sessions de cuisine** — regroupées, séquencées, et **qui bifurquent** en portions
   et accompagnements par objectif.
6. **La liste de courses, en vagues** — agrégée, par rayon, tenant compte des placards,
   **datée par la conservation** des produits.
7. **Le panier** — routé vers l'enseigne choisie, avec substitution automatique si un produit
   manque, et **réadaptation de la recette** quand la substitution change la donne.
8. **L'échange de repas en cours de semaine** — « pas envie du poulet ce soir » : le produit
   propose une alternative **avec ce qui est déjà acheté**. Filet de sécurité, pas le rituel.
   Voir §9.2 : c'est le point de rétention le plus sensible de toute la catégorie.
9. **La coche** — « cuisiné comme prévu ? ». Un geste. Exacte, parce que la recette est connue.
10. **Le chat** — une question, une réponse, dans la voix de la méthode. **Disponible pour
    tout le monde**, pas seulement pour les élèves d'un coach : sans coach, c'est la voix de
    la maison qui répond. Sur demande, jamais imposé.
11. **L'invitation** — on fait entrer les autres membres du foyer.

---

## 7. Les arguments de valeur, classés par solidité

### 7.1 ⭐ L'intersection vide : cuisson × divergence nutritionnelle

*Le plus solide. Vérifié.*

- Les apps de **batch cooking** (CookAhead, MealPrepPro, Recipy, Cook Smarts, Plan to Eat)
  optimisent la session, le recouvrement d'ingrédients et le séquencement — mais n'ont
  **aucun modèle nutritionnel par personne**. La chaîne est uniforme : tout le monde mange
  le même poulet.
- Les apps **nutritionnelles** ont le modèle par personne, et mal : Eat This Much documente
  lui-même des *contournements* pour un couple — caler les cibles sur la personne qui mange
  le moins, ou additionner les calories et diviser au prorata. Leur propre revue le dit :
  l'app ne sait pas gérer automatiquement des besoins caloriques différents, et ne rend
  l'information que pour une portion.

Le père en sèche et le fils en prise de masse dans la même casserole : **ça n'existe nulle
part**, parce que le problème tombe pile entre les deux familles de produits.

Détail des acteurs et de ce qui leur manque : [annexe](#annexe--paysage-concurrentiel-recherche-du-7-août-2026).

### 7.2 ⭐ Un plan qui a un avis

*Le plus défendable dans la durée.*

Tous les concurrents génèrent depuis un optimiseur nutritionnel neutre ou une base de recettes
curée. D'où le mode d'échec n°1 de la catégorie : **la variété plafonne**, les gens revoient
les mêmes plats vers la sixième semaine, ils partent. Et le constat général sur les « apps IA »
est sévère : beaucoup ont collé un chatbot sur une base de recettes — *ce n'est pas un
planificateur, c'est une app de recettes avec une barre de recherche*.

Un plan qui **compose sous contraintes** depuis une philosophie que le système a interdiction
de contredire est structurellement différent : cohérent *et* non répétitif, parce qu'il ne
pioche pas dans un stock fini.

C'est aussi ce qui rend la créativité du modèle exploitable : les axes de variation
(cuisine, texture, saison, technique, temps disponible, budget, contrainte du moment) sont
des **entrées du générateur**, pas des étiquettes de filtre sur un catalogue.

Et « une philosophie » ne présuppose pas un coach : sans coach, c'est celle de la maison
(§2).

### 7.3 Le conseil n'est pas acheté

Le modèle dominant est financé par l'aval : Jow est gratuit et vit de la commission
d'affiliation **et du retail media**, où les industriels paient pour que **leur produit soit
l'ingrédient de la recette** — sur une app qui revendique influencer jusqu'à 70 % du panier.

Pour « qu'est-ce qu'on mange », personne ne s'en émeut. Pour quelqu'un qui a un objectif,
une intolérance ou une pathologie, c'est disqualifiant.

> **« Tu paies. Donc personne d'autre ne paie pour orienter ce que tu manges. »**

### 7.4 ⭐ L'invitation est fonctionnelle, pas promotionnelle

*Le meilleur argument économique.*

On n'invite pas son conjoint pour un mois gratuit. On l'invite parce que **sans son profil,
le plan est faux**. C'est le seul endroit où l'on peut acquérir moins cher que des apps
gratuites à 6–9 millions d'utilisateurs.

### 7.5 Le renversement : conseil, pas surveillance

Une app de tracking est **asymétrique** — l'utilisateur fournit le travail, l'app rend un
jugement. Une app de plan est **symétrique** : l'app travaille, l'utilisateur mange.

Ça élimine la photo de chaque plat — coûteuse en friction, imprécise (~26 % d'erreur sur les
calories, la raison pour laquelle le produit refuse déjà de les afficher) — et remplace
« as-tu loggé ? » par « as-tu cuisiné ce qui était prévu ? ».

### 7.6 La chaîne va jusqu'au bout

Plan → liste → panier → livraison ou drive, avec substitution. **À louer, pas à construire** :
l'Instacart Developer Platform est publique et gratuite, et Pepesto expose 27 enseignes
européennes dans 13 pays en API, substitution comprise.

C'est une ligne du produit, **jamais le titre** : Carrefour est dans ChatGPT depuis mars 2026,
et l'assistant agentique d'Instacart construit déjà des paniers à la voix pour des millions
de gens. Ce terrain est occupé par des acteurs qu'on ne bat pas de front.

### 7.7 ⭐ Le foyer décide ensemble

*Le plus difficile à copier.* Développé en §8, parce que ce n'en est pas un argument parmi
d'autres : c'est le rituel autour duquel le produit s'organise. Toutes les apps de repas sont
solitaires ; celle-ci est construite pour plusieurs personnes dès le départ, et ça ne
s'ajoute pas après coup à un catalogue de recettes.

### 7.8 ⭐⭐ LA DOUVE : le graphe du foyer

*Le plus fort à long terme — et la seule chose ici qui devient plus solide avec le temps
au lieu de s'éroder.*

Les sept arguments précédents décrivent une **avance**. Une avance se rattrape. Celui-ci
décrit un **actif qui s'accumule**, et c'est autre chose.

Ce qui s'accumule, semaine après semaine :

- quatre profils, avec leurs objectifs qui bougent ;
- un an de goûts et de dégoûts, affinés par correction plutôt que par déclaration ;
- **ce qui a réellement été cuisiné** — pas ce qui a été planifié, ce qui a été coché ;
- ce qui a été sauté, et à quel moment de la semaine ;
- les envies exprimées chaque samedi, par chaque membre, dans ses mots.

Deux propriétés en découlent, et ce sont elles qui comptent :

**Chaque semaine d'usage rend le plan meilleur et le départ plus douloureux.** C'est la
définition d'un coût de sortie qui se construit tout seul, sans que le produit ait à
retenir personne.

**Ça ne s'exporte pas et ça ne se copie pas.** Un concurrent qui arrive **avec le même
moteur** repart de zéro : il peut cloner la fonctionnalité, il ne peut pas cloner l'année.

C'est la douve que le produit coach **n'avait pas** : la doctrine d'un coach tient dans une
page — elle se lit, se résume, se réécrit ailleurs en une soirée. Le graphe d'un foyer après
un an, non.

C'est aussi ce qui rend la marketplace (§10.5) possible : elle n'est rien d'autre que ce
graphe, lu à l'échelle de milliers de foyers.

---

## 8. ⭐ LE CONSEIL DE FAMILLE

> ⚠️ **§8.1 à §8.3 SONT PÉRIMÉS depuis le 2026-08-08 — décision, pas oubli.**
> La récolte par membre (« chacun dit ce dont il a envie ») est morte, et avec
> elle le décompte des silencieux : elle demandait à celui qui tient le foyer de
> courir après tout le monde, soit exactement la charge mentale que le produit
> promet de supprimer — et elle mettait Sophia en arbitre public entre un parent
> et son enfant. Ce qui la remplace, **livré au lot 5** : **une ligne de texte**
> que le compte maître écrit pour tout le monde, ancrée à la semaine.
> Autorité en vigueur : [CHANTIER-FOYER-PROFILS.md § Lot 5](CHANTIER-FOYER-PROFILS.md).
>
> **§8.4 (les trois contraintes non négociables) et §8.5 (les deux autorités)
> RESTENT EN VIGUEUR** : le plan sort quand même quand personne n'a rien écrit,
> le produit ne répond jamais « impossible », et une règle de maison n'est
> jamais présentée comme une raison nutritionnelle.

*La meilleure idée du pivot. Ce n'est pas une fonctionnalité, c'est le rituel autour duquel
tout le produit s'organise.*

### 8.1 Ce que c'est

Le week-end, **chacun dit ce dont il a envie** pour la semaine qui vient. Le produit met en
commun, confronte ces envies aux directions que chacun s'est fixées, et compose.

Puis on valide — **collectivement** si le foyer décide ensemble, **individuellement** si
chacun choisit ce qu'il mange.

### 8.2 Pourquoi c'est fort — quatre raisons distinctes

**a. Toutes les apps de repas sont solitaires.** Une seule personne planifie, les autres
subissent. Faire du plan un **moment du foyer** est un mécanisme de rétention qu'aucun
concurrent n'a, et il est très difficile à copier : ça ne s'ajoute pas à un catalogue de
recettes, il faut que le produit soit construit autour de plusieurs personnes dès le départ.

**b. Ça attaque la charge mentale à la racine, pas au symptôme.** Le problème n'est pas
seulement « décider quoi manger ». C'est **être celui qui décide pour les autres** et qui
encaisse les plaintes. Ici les envies sont exprimées *avant* le plan : le plan devient
co-signé, et plus personne n'a à être l'arbitre. C'est une livraison émotionnelle, pas
fonctionnelle — et c'est la vraie.

**c. Ça donne une raison d'être dans l'app aux autres membres.** Sans conseil de famille, un
sous-compte est une ligne de contraintes dans le profil de quelqu'un d'autre — il ne se
connecte jamais et il churne. Avec, chacun a un rendez-vous hebdomadaire. **C'est ce qui rend
le modèle multi-comptes (§11) réellement facturable** au lieu d'être une réduction déguisée.

**d. C'est le seul endroit où le verrou de doctrine travaille à pleine valeur.** Voir §8.3.

### 8.3 La vertu éducative : expliquer, jamais interdire

Quand quelqu'un choisit un plat qui ne va pas dans la direction qu'il s'est fixée, le produit
**explique pourquoi**. Il ne refuse pas, il ne barre pas, il n'affiche pas d'alerte rouge.

Trois choses en découlent :

**Ça sort le parent du rôle de gendarme.** Ce n'est plus papa ou maman qui dit non — c'est une
explication neutre, adressée à la personne, sur ce qu'elle a elle-même dit vouloir. Dans un
foyer, ce déplacement vaut de l'or.

**Ça éduque au lieu de contraindre.** Un enfant qui lit, semaine après semaine, *pourquoi* tel
plat va ou ne va pas avec ce qu'il veut, apprend à lire son alimentation. C'est la seule
fonctionnalité du produit dont la valeur **augmente avec le temps d'usage**.

**C'est là que la méthode devient irremplaçable.** Un optimiseur nutritionnel neutre ne sait
dire qu'une platitude — « trop de calories ». Une méthode a un *avis* et donc une vraie
réponse à « pourquoi ». Et le verrou garantit que l'explication ne contredit jamais la
doctrine que le foyer a choisie : c'est un professeur cohérent, pas un moralisateur
génératif.

### 8.4 ⛔ Les trois contraintes non négociables

**Avec un mineur, le registre est éducatif — jamais correctif sur le corps.** Expliquer à un
enfant que son choix « ne va pas » est à une phrase de distance d'un dégât réel. Aucune
mention de poids, de silhouette, de restriction. On parle de ce que l'aliment *apporte*, pas
de ce qu'il fait grossir. C'est ici que la machinerie de sécurité du dépôt gagne son salaire,
et c'est une contrainte de produit, pas une politesse.

> ~~**Conséquence structurelle** : un membre mineur du foyer n'a **jamais d'objectif
> nutritionnel individuel**. Il est un mangeur — allergies, goûts, restrictions parentales,
> portions adaptées à l'âge — jamais une cible.~~
>
> **Tranché le 2026-08-13, décision humaine : un enfant PEUT porter une direction.** La
> règle ci-dessus était **plus large que sa propre raison**. Le paragraphe qui la justifie
> ne dit pas « pas de direction », il dit « jamais **correctif sur le corps** : aucune
> mention de poids, de silhouette, de restriction ; on parle de ce que l'aliment
> **apporte** ». « Manger mieux » et « mieux s'entraîner » sont exactement ce que l'aliment
> apporte — les interdire ne protégeait personne, et privait un adolescent qui s'entraîne
> d'une composition qui tient compte de ce qu'il fait.
>
> **Ce qui reste inconstructible, et c'est la moitié qui compte** : `fat_loss` et
> `recomposition`, les deux directions du registre qui **retire**. Elles sont refusées
> **à l'écriture** sur les deux portes (`keel_household_set_member_goal`,
> `keel_household_add_member` → `goal_not_for_minor`, migration `20260813180000`) et
> **à la lecture** (`goalApplies` / `MINOR_FORBIDDEN_GOALS`, `_shared/keel/household.ts`).
> Deux ceintures, parce qu'une ligne écrite avant ce jour-là existe encore : une garde qui
> dépendrait d'un nettoyage de données n'est pas une garde.
>
> **Ce qui n'a pas bougé du tout** : un mineur ne reçoit toujours **aucun fait corporel**
> dans le prompt (FF-047). Une direction dit ce qu'on **ajoute** ; une taille et une pesée
> posées à côté du prénom d'un enfant rendent `fat_loss` **dérivable** sans qu'on l'ait
> demandé. Et un **âge inconnu** ne reçoit aucune direction, pas même celles qu'un enfant
> peut porter : « je ne sais pas » n'est pas « c'est un enfant ».

**Le conseil ne rend jamais « impossible ».** Quatre personnes, des envies contradictoires,
des objectifs divergents : il sort toujours un plan, et il **dit ce qu'il a arbitré**. Un
générateur qui renvoie une erreur à une famille le samedi soir est un produit mort.

**Une validation absente ne bloque pas le foyer.** Il faut une règle de quorum et un défaut :
qui n'a pas répondu ne retient pas les autres. Sinon un ado silencieux gèle les courses de
toute la maison.

### 8.5 LES DEUX AUTORITÉS — et pourquoi il ne faut jamais les confondre

Il y a dans ce produit deux pouvoirs de nature différente. Les mélanger casse les deux.

| | **Sophia** | **Le compte maître** |
|---|---|---|
| Nature | Épistémique | Domestique / parentale |
| Pouvoir | Explique | Restreint |
| Peut bloquer ? | **Jamais. Dans aucun mode.** | Oui, sous conditions (ci-dessous) |
| Légitimité | Ce que la personne a dit vouloir | Le fait d'être le parent |

**Sophia ne bloque jamais rien.** Elle explique pourquoi un choix ne va pas dans la direction
que la personne s'est fixée, et laisse valider ou non. Un système qui interdit se fait
désinstaller ; un système qui explique se fait écouter. C'est vrai pour les enfants comme pour
les adultes.

**Le parent, lui, a le droit d'interdire les nuggets et le Nutella.** C'est son foyer. Un
produit qui refuse ça est inutilisable pour un parent d'enfant de huit ans.

Les deux sont vrais en même temps **parce que ce sont deux acteurs distincts**.

#### Les quatre règles qui en découlent

**1. La restriction est réservée au mode « famille », et elle est par membre.**
Hors mode famille — couple, colocation, deux adultes — **aucun verrouillage du compte maître
n'est possible**. Et même en mode famille, le réglage se fait **membre par membre**, pas au
niveau du foyer : on restreint l'enfant de huit ans, pas son conjoint.

> ⚠️ Un produit où un adulte peut contrôler en silence l'alimentation d'un autre adulte est
> un outil de contrôle coercitif. Ce n'est pas une hypothèse théorique. Le défaut doit être
> **restriction impossible sur un majeur**, et l'exception doit demander l'accord explicite
> du majeur concerné — révocable par lui seul, à tout moment. Une révocation retire les
> restrictions **déjà posées**, pas seulement les futures : sinon le retrait du consentement
> ne retire rien.

**2. L'accord se donne à l'entrée, en clair.**
« Rejoindre la famille » doit dire ce que ça engage : *dans ce foyer, X peut restreindre
certains aliments pour toi.* Une phrase lisible au moment de rejoindre, pas une clause. Ça
vaut pour les enfants **et pour le père qui rejoint**.

**3. La personne restreinte voit qu'elle l'est, et par qui.**
Un aliment qui disparaît sans explication produit un produit mystérieusement mauvais. Il faut
dire : *« pas disponible dans ce foyer »* — ce qui attribue la décision au parent, à sa place.

**4. Sophia ne se cache jamais derrière le parent, et le parent jamais derrière Sophia.**
C'est la règle la plus importante des quatre, et la plus facile à violer par inadvertance dans
une copie d'écran.

- « Ton objectif dit ceci » → c'est Sophia. Vérifiable, discutable, éducatif.
- « Ton parent a choisi cela » → c'est le foyer. Non discutable ici, et ça n'a pas à l'être.

**Faire passer une restriction parentale pour une vérité nutritionnelle est un mensonge**, et
ça détruit exactement ce qui fait la valeur du §8.3 : si l'enfant découvre une fois que
« ce n'est pas bon pour toi » voulait dire « ton père n'en veut pas », plus rien de ce que dit
Sophia n'a de poids.

#### Ce qui reste ouvert

- **Le drapeau « famille » gouverne plus que le blocage.** Il décide aussi de **qui voit quoi** :
  qu'un parent voie les choix d'un enfant de sept ans est normal ; qu'un colocataire voie ceux
  de l'autre est intrusif. Une seule bascule, deux conséquences.
- **Les enfants grandissent.** Une restriction posée à neuf ans ne doit pas survivre telle
  quelle à seize. Prévoir une revue, ou une extinction liée à l'âge.

### 8.6 Le rituel et la logistique tombent au même endroit

Envies le samedi → plan le samedi soir → première vague de courses le dimanche → seconde vague
en milieu de semaine (§3). Le moment social et la cadence d'achat s'alignent naturellement.
C'est rare, et il ne faut pas le casser en déplaçant l'un des deux.

---

## 9. Les deux leviers de rétention

*La rétention est le risque n°3 du pivot (§10.6) et le tueur documenté de la catégorie.
Ces deux leviers sont ce qui se construit contre lui — ce ne sont pas des horizons.*

### 9.1 La variété comme fonctionnalité mesurée

Le plafond de variété est ce qui tue les apps de cette catégorie vers la sixième semaine.
Il doit donc être **une métrique produit**, pas une propriété espérée du générateur : ce qui
a été servi, à quelle fréquence, avec quelle distance entre deux répétitions.

« L'IA est créative » n'est pas une garantie tant que personne ne mesure cette distance.

### 9.2 Le swap en cours de semaine est le levier de rétention n°1

Distinct du conseil de famille : c'est le filet quand la vie ne suit pas le plan.

Documenté sur toute la catégorie : si échanger un repas demande plus d'un ou deux gestes, ou
si l'échange **ne met pas à jour la liste de courses**, les gens décrochent du plan.

Et la version naïve — **régénérer le plan** — détruit la valeur : les courses sont déjà
achetées, et « la décision est prise » redevient « il faut redécider ». La bonne version est
plus dure et vaut davantage : **substituer à l'intérieur de ce qui est déjà dans le frigo**,
en laissant le reste de la semaine cohérent.

---

## 10. L'ORDRE DÉCIDÉ : B2C d'abord, coachs ensuite

*Décision du 7 août 2026. Elle renverse l'ordre envisagé plus tôt dans la même session, et
elle est mieux fondée — pour une raison de dépendance, pas d'enthousiasme.*

**Un coach n'achète pas « sa méthode injectée ». Il achète un produit que ses élèves vont
réellement utiliser.** Si le socle est faible, la couche coach ne vend rien. L'inverse est
faux : un socle qui marche se décline en méthode en peu de travail.

Donc : construire et affûter le socle en B2C, **puis** le livrer aux coachs.

### 10.1 Les deux conditions qui rendent cet ordre gagnant

**a. Phase 1 = tester, pas lancer.** Tester avec son propre foyer coûte zéro. Acquérir des
inconnus coûte cher (App Store, CAC, concurrents gratuits à 6–9 M d'utilisateurs). Ces deux
choses ne sont pas la même phase et ne doivent pas être confondues — c'est là qu'on peut
brûler six mois sans s'en apercevoir.

**b. Les coachs chauds sont un signal périssable.** Deux coachs ont dit en avoir besoin.
Une intention tiède ne survit pas à quatre mois de silence. Les garder au chaud coûte un
message par mois — et un coach qui a une famille est aussi un utilisateur du socle, donc
il peut être partenaire de conception sans attendre sa propre couche.

### 10.2 Le piège du dogfooding

Son propre foyer est un **signal de conception**, excellent : la friction se voit en temps
réel, gratuitement, tous les jours.

Ce n'en est **pas un signal de marché** : n=1, mêmes goûts, même budget, même niveau en
cuisine, même pays, et un utilisateur qui aime déjà le produit parce qu'il l'a imaginé.

Antidote : trois à cinq foyers **différents du sien**, tôt. Idéalement une personne seule,
un foyer avec un adolescent, et un foyer où personne n'aime cuisiner.

### 10.3 La UX la plus risquée du produit

Ce n'est pas le plan, ni les sessions, ni les courses. C'est **le moment où l'on récolte les
envies**.

Faire que quatre personnes expriment chacune ce qu'elles veulent, de façon asynchrone, sur un
week-end, **sans que celui qui tient le foyer doive courir après tout le monde**. Si le parent
doit relancer chacun pour que le plan sorte, on a **recréé la charge mentale qu'on promettait
de supprimer** — et le produit se retourne contre sa propre promesse.

La règle de survie est déjà écrite en §8.4 : **le silence est une réponse valide**. Qui n'a
pas répondu est composé depuis son profil, le plan sort quand même, et on dit à qui n'a rien
dit ce qui a été choisi pour lui. Jamais de blocage, jamais de relance à la charge d'un humain.

### 10.4 Le B2B revient — comme CANAL, pas comme seconde source

Le risque n°1 du pivot est le CAC : se battre contre des produits gratuits à 6–9 M
d'utilisateurs, sans canal éprouvé. Coachs et salles de sport **sont** la réponse à ce risque.

Une salle avec 800 adhérents, c'est **800 foyers acquis en une conversation**. Un coach avec
une cohorte de 150, c'est 150 foyers. Le coût d'acquisition s'effondre d'un facteur qu'aucune
campagne App Store n'atteindra jamais.

Donc l'échelle complète est :

1. **Socle** — construit et affûté en B2C, prouvé sur des foyers réels (§10.1–10.2)
2. **Distribution** — vendu *à travers* coachs et salles, qui apportent les foyers en gros
3. **Marketplace** — §10.5

Chaque barreau finance le suivant, et le B2B n'arrive pas *malgré* le B2C : il arrive **parce
que** le socle est devenu assez bon pour qu'un coach accepte d'y mettre son nom.

> ⚠️ **Ce canal n'est PAS un désert.** Member Kitchens vend aujourd'hui de la planification
> de repas en marque blanche aux créateurs, coachs santé et nutritionnistes ; EatLove
> distribue ses plans personnalisés via diététiciens et salles de sport. Arriver en disant
> « personne ne fait ça pour les coachs » serait faux et se verrait au premier rendez-vous.
> Ce qui n'existe **pas** chez eux, et qui est la différenciation à nommer : le **verrou
> déterministe** (leur méthode ne peut pas être contredite, pas seulement affichée), le
> **foyer** (leurs plans sont individuels), et la **session de cuisine** (§3).

#### La question à ne pas trancher trop vite : QUI paie

Deux modèles, économies et cycles de vente totalement différents :

- **(a) le foyer paie** le socle, plus un supplément pour la méthode ; le coach touche une part.
- **(b) l'établissement paie** par adhérent ; le foyer ne paie rien.

Les salles fonctionnent culturellement en (b) — elles achètent des services pour leurs
adhérents. Les coachs à cohorte en ligne sont plutôt en (a). Ne pas présumer l'un des deux, et
ne pas construire la facturation avant de savoir lequel on vend.

> ⚠️ La salle de sport est un bon canal, **pas un canal rapide** : cycles longs, faible
> maturité technique, et la salle elle-même churne. À traiter comme du volume différé, jamais
> comme de la trésorerie.

#### Pourquoi ça ne cannibalise rien

Le socle seul est un **produit complet** (§5). La méthode est un **ajout** qui apporte une
valeur nommable : un angle assumé sur la composition, et des réponses dans cette voix-là.
Prix différent pour valeur différente — il n'y a pas de cannibalisation, il y a un palier.

### 10.5 La marketplace de méthodes — l'endgame, et sa mine

Un jour : vendre les méthodes qui marchent le mieux.

**Pourquoi c'est puissant** — ce serait le seul acteur capable de **mesurer** quelle méthode
tient : des milliers de foyers, sur le même produit, exécutant des méthodes différentes, avec
l'adhérence observée. Personne d'autre n'a « méthode A contre méthode B, conditions réelles,
mesuré ». C'est le graphe du foyer (§7.8) lu à l'échelle, et ça transforme l'app en plateforme.

**⛔ La mine : classer sur le RÉSULTAT est une allégation de santé.**

- Classer sur **l'adhérence** — « les foyers tiennent cette méthode trois fois plus
  longtemps » — est un fait observé sur le produit, et c'est défendable.
- Classer sur le **résultat** — « cette méthode fait perdre X kg » — est une allégation de
  santé, réglementée en Europe, et pousse le produit vers une qualification qu'on ne veut pas.

Respecter cette distinction coûte zéro aujourd'hui et très cher à rattraper après.

Deux effets pervers à prévoir dès la conception du classement : des coachs qui optimisent
**pour la métrique** plutôt que pour la personne — donc ne jamais classer sur une grandeur
que rendre la méthode plus extrême améliore — et le biais de sélection, une méthode choisie
par des gens motivés paraissant toujours meilleure qu'elle n'est.

### 10.6 Ce que le pivot change de NATURE — et les trois hypothèses à prouver

Le marché est plus grand de trois ordres de grandeur : quelques dizaines de milliers de
coachs atteignables un par un, contre les foyers qui cuisinent — Jow 9 M d'utilisateurs,
Samsung Food 6 M, Mealime 7 M, et ces trois-là ne saturent rien.

Mais **trois choses deviennent plus dures**, et les ignorer serait la façon la plus simple
de perdre :

**a. La valeur par relation s'effondre.** Un coach à 100 élèves, c'est 700 €/mois issus
d'**une** conversation. En B2C, 7 €, c'est un foyer. Il en faut cent pour égaler ce coach.
Le marché est mille fois plus grand, mais chaque euro coûte beaucoup plus d'effort.

**b. Le CAC devient le jeu tout entier** — et c'est ce qui n'a jamais été testé. En B2B il
y avait un canal éprouvé. Ici, en face, des produits **gratuits** qui dépensent en
acquisition. L'invitation fonctionnelle (§7.4) est la bonne réponse, mais c'est une
**hypothèse, pas un fait**.

**c. La porte n'est pas verrouillée.** L'ancien marché était étroit *avec une intersection
vide* — plus rare et plus précieux qu'un grand marché encombré. Ici l'intersection est vide
aussi, mais **vide à l'intérieur d'une pièce pleine** : Jow ou Samsung *pourraient* ajouter
la divergence nutritionnelle au sein du foyer. Ils ne le feront probablement pas vite — c'est
un vrai problème d'ingénierie et c'est orthogonal à leur monétisation, ils vendent du panier,
pas du résultat. Mais ce n'est pas le verrou qu'était le 1:N coach. Ce qui verrouille
vraiment, à terme, c'est §7.8.

#### Les trois hypothèses, chacune avec son test

| # | Hypothèse | État | Test |
|---|---|---|---|
| 1 | Les foyers paient pour de la planification de repas | **À moitié prouvée par procuration** — Samsung Food+ facture 6,99 $/mois pour ce périmètre exact | Un prix affiché, une conversion observée |
| 2 | L'invitation part toute seule | **Non prouvée** — c'est le seul avantage de CAC contre des gratuits | **Test n°1, avant tout le reste** : un foyer réel, combien de membres entrent sans relance humaine |
| 3 | Ça tient après six semaines | **Non prouvée** — le tueur documenté de la catégorie ; la parade (composer sous contraintes, §7.2, §9.1) est structurelle mais théorique | Un foyer qui passe la barre des six semaines sans baisse de composition |

---

## 11. Le modèle économique

- **Compte maître** plus cher, **sous-comptes** moins chers. Chacun évolue individuellement,
  les plans se mélangent.
- **Deux revenus** : l'abonnement **plus** la commission d'affiliation sur les paniers routés.
  Les gratuits n'ont que le second — les unit economics finissent donc au-dessus des leurs.
- **Le prix n'est pas à défendre** : Samsung Food+ facture 6,99 $/mois pour exactement
  « profil santé + objectifs + plan hebdomadaire personnalisé ». Le tarif de ~7 € est
  le prix du marché, fixé par Samsung.

### ⛔ La ligne rouge

**Prendre la commission au volume** — payée par l'enseigne, elle ne change pas le conseil.
**Refuser le placement de marque** — payé précisément pour le changer.

Le jour où le second est accepté, l'argument §7.3 s'effondre et il ne reste que Jow avec
9 millions d'utilisateurs de moins.

---

## 12. Ce qui disparaît

- La photo de chaque plat.
- Le compteur de calories comme produit.
- Le message quotidien qui demande des comptes.
- Le suivi comme raison d'ouvrir l'app.

**Ce qui reste** : on ouvre l'app parce que la semaine est prête et que les courses sont faites.

---

## 13. Mises en garde

- **Le batch cooking seul est un champ de bataille encombré.** Le recouvrement d'ingrédients
  et le séquencement sont des critères de comparaison standards en 2026. La différenciation
  est dans l'intersection (§7.1), jamais dans le batch.
- **Les colocs sont un mauvais premier segment** : churn annuel intégré au segment. Et
  « gagner sur le panier en achetant en gros » serait de l'achat-revente alimentaire —
  capitalistique, à marges faibles, un autre métier. La commission oui, l'achat groupé non.
- **La couche courses n'est pas une douve.** Elle est publique, documentée et bon marché.
  Elle se loue en semaines. Elle ne différencie de personne.
- **Le canal coach/salle n'est pas vide** — voir l'encadré du §10.4.
- **Le risque réel n'est pas le code, c'est l'attention.** Foyer + sessions + courses + agent
  + méthode font cinq produits. L'ordre compte plus que l'ambition.

---

## 14. Le fil à ne pas oublier

L'artefact que le coach paie pour lire s'alimente aujourd'hui du suivi quotidien. Si le
tracking disparaît (§7.5), cette entrée disparaît avec lui — et doit être remplacée par
**l'adhérence au plan**, qui est un meilleur signal : « 6 dîners sur 7 cuisinés comme prévu »
vaut infiniment plus qu'une pile de photos.

C'est exactement la famille de défauts que ce dépôt connaît déjà : *un morceau construit,
testé et déployé dont personne ne rebranche le fil après un pivot.*

---

## Annexe — paysage concurrentiel (recherche du 7 août 2026)

> Instantané daté. Les chiffres de traction viennent des communications des acteurs eux-mêmes
> ou de la presse ; les chiffres de revenu de Jow viennent de sites de synthèse de second
> rang et sont à traiter comme des ordres de grandeur, pas comme des faits. **La forme des
> modèles économiques, elle, est confirmée par plusieurs sources.**

### Les planificateurs grand public

| Acteur | Traction | Ce qu'ils ont | **Ce qui leur manque** |
|---|---|---|---|
| **Jow** (FR) | 9 M utilisateurs FR+US, 33 M€ levés, ~15 M$ ARR | Recettes selon goûts/régimes/ustensiles → panier commandé chez Carrefour, Auchan, Intermarché, Leclerc, Monoprix, Chronodrive, Courses U + Instacart/H-E-B/Hy-Vee. Revendique influencer jusqu'à 70 % du panier | **Aucun modèle nutritionnel par personne.** Et le conseil est **financé par les marques** (retail media : les industriels paient pour être l'ingrédient) — disqualifiant dès qu'il y a un objectif |
| **Samsung Food** (ex-Whisk) | 6 M+ utilisateurs | Gratuit + Food+ à 6,99 $/mois ou 59,99 $/an (profil santé, objectifs, plan hebdo). 180 k recettes notées, « Personalise Recipe » par IA, sync électroménager | **Pas de foyer divergent.** Et l'app n'a pas à être rentable : c'est un produit d'écosystème (SmartThings, 500 M d'appareils) — donc **notre ancre de prix**, pas notre concurrent économique |
| **Mealime** | 7 M utilisateurs | Un profil par personne qu'on nourrit (goûts, dégoûts, allergies), listes triées par rayon, filtres par temps de préparation | Profils = préférences, **pas de cibles nutritionnelles** par personne |
| **Eat This Much** | — | Profils nutritionnels multiples, planification couple/famille | **Le contournement est documenté par eux-mêmes** : caler sur la personne qui mange le moins, ou additionner et diviser au prorata. Ne sait pas gérer des besoins caloriques différents ; ne rend l'info que pour une portion |

### Les spécialistes du batch cooking

**CookAhead, MealPrepPro, Recipy, Cook Smarts, Plan to Eat.** Détection du recouvrement
d'ingrédients, séquencement de la préparation, instructions de conservation, chaînes
*cook-once-eat-all-week*, planification calendaire et ordonnancement des restes.
→ **C'est un critère de comparaison standard en 2026, pas une nouveauté.**
**Ce qui leur manque** : aucun modèle nutritionnel par personne. La chaîne est uniforme.

### Le canal coach / salle — occupé

| Acteur | Ce qu'ils font | Ce qui leur manque |
|---|---|---|
| **Member Kitchens** | App de planification de repas **en marque blanche** pour créateurs food, coachs santé, nutritionnistes. Le coach publie une fois, ses membres personnalisent | La méthode est **affichée**, pas **tenue** : aucun verrou déterministe. Pas de foyer, pas de session de cuisine |
| **EatLove** | Plans sur biométrie + objectifs + 30 pathologies, distribués via diététiciens, salles et employeurs | Plans **individuels**. Pas de foyer divergent, pas de rituel collectif |

### La couche courses — à louer, jamais à construire

- **Instacart Developer Platform** — publique et **gratuite**, explicitement destinée aux
  apps de planification, nutrition personnalisée et weight management. Partenaires déjà
  listés : Jow, eMeals, EatLove, Foodsmart, Innit, Relish, Maple, Jupiter…
- **Instacart, assistant agentique** — déployé à des millions d'utilisateurs : « plan my
  weeknight dinners under $200 and order what I need », substitutions gérées.
- **Carrefour dans ChatGPT** — depuis mars 2026, en France : recettes, disponibilité,
  panier, livraison, paiement sur leur e-commerce.
- **Pepesto** — API + serveur MCP : recette (URL, texte ou photo) → panier de vrais produits
  avec prix en direct sur **27 enseignes européennes dans 13 pays**, substitution si indispo
  ou hors budget.

**Conclusion opérationnelle** : trois semaines de travail, aucune différenciation. C'est une
ligne du produit (§7.6), jamais le titre.
