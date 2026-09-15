# Positionnement — version du 2026-08-18 (révision 2)

> Révision 2, même jour : la tête de pont « allergie » est **retirée du
> positionnement**. Elle reste un cas d'usage, elle n'est plus le cadre. Motif en
> §2.2. Remplace la formulation courte de [PREMIERS-1000.md](PREMIERS-1000.md) §2.
>
> **Règle du document :** aucune proposition de valeur n'est écrite sans le mécanisme
> qui la tient, avec son fichier. Ce qui n'est pas branché est en §6, pas en §3.

---

## 1. Qui on sert, en une phrase

> ### Les foyers avec au moins un enfant, où l'on cuisine le soir, et où tout le monde ne mange pas la même chose — et où une personne porte seule la charge de le faire tenir.

Trois qualifieurs, et ils se posent **dans cet ordre** (§2.3). Le troisième est
notre avantage ; les deux premiers décident simplement s'il y a un usage.

**Aucune limite sur le nombre d'enfants** — le produit tient jusqu'à **8 bouches**
au total, maître compris (`HOUSEHOLD_MAX_MOUTHS`, `onboarding.ts:847`). Plus il y
a d'enfants, plus la divergence est forte, et moins un concurrent sait faire.

Et le créneau, en une phrase :

> **Le batch cooking est résolu pour une personne. La planification familiale est
> résolue pour un foyer qui mange la même chose. Personne ne fait le batch cooking
> d'un foyer dont les membres ne mangent pas la même chose.**

Un foyer plus simple qui veut s'y greffer passe sans effort : servir quatre
contraintes et en servir une, c'est le même moteur avec moins de travail. **L'inverse
est faux**, et c'est tout l'intérêt d'entrer par le haut.

---

## 2. Le qualifieur — un compte, pas une catégorie

### 2.1 Notre avantage n'est pas la rareté d'une contrainte, c'est leur simultanéité

C'est la correction centrale de cette révision.

Une contrainte **seule** se simule : Jow met un filtre « sans gluten », Samsung Food+
met un profil santé, Meal Prep Pro met une cible calorique. Aucun n'a tort, et aucun
n'a besoin de nous.

**Deux ou trois contraintes en même temps**, réconciliées dans **une seule session de
cuisine** puis redéployées en **assiettes différentes** — ça, personne ne le fait. Et
la difficulté n'est pas additive : elle explose, parce que le point dur n'est pas de
respecter chaque contrainte séparément, c'est de trouver la casserole commune qui les
tient toutes sans cuisiner quatre fois.

| Contraintes simultanées dans le foyer | Ce que ça veut dire pour nous |
|---|---|
| **0 à 1** | On n'est pas meilleur que le gratuit. On ne recrute pas là — mais on accueille sans friction |
| **2** | Notre terrain |
| **3 et plus** | Personne d'autre ne sait faire, et le foyer le sait déjà parce qu'il en souffre chaque semaine |

### 2.2 Pourquoi « allergie » n'est plus le cadre

Trois raisons, et la troisième est la vraie.

1. **Le code n'a jamais dit ça.** `SAFETY_CONSTRAINT_KINDS` porte **six** types —
   `allergy`, `intolerance`, `medical`, `religious`, `dislike`, `diet` — et trois
   sévérités (`medical`, `strict`, `preference`). L'allergie est un cas sur six.
2. **L'acquisition est un bourbier.** Trouver des parents d'enfants allergiques
   demande de chasser un trait rare chez des gens qui ne se présentent pas comme tels.
3. **Ça sous-estime le marché d'un ordre de grandeur.** La divergence n'a pas besoin
   d'être médicale pour être réelle : **beaucoup de foyers mangeraient différemment
   s'ils le pouvaient**, et s'alignent uniquement parce qu'aligner est la seule option
   abordable quand on cuisine seul, le soir, pour tout le monde.

> **La contrainte médicale reste notre meilleure cohorte quand elle se présente** —
> elle ne s'abandonne pas, elle vient avec des communautés denses. On la traite comme
> telle. **On ne la chasse plus.**

### 2.3 Le filtre de recrutement — trois questions, dans cet ordre

| | La question | Ce qu'elle écarte | Pourquoi elle est à ce rang |
|---|---|---|---|
| **1** | *« Le soir, vous cuisinez chez vous ? »* | ceux qui commandent ou assemblent | **aucun usage du produit.** Une famille de quatre qui commande trois soirs sur sept n'a que faire d'une session de cuisine, quelles que soient ses contraintes |
| **2** | *« Il y a des enfants à la maison ? »* | les couples d'adultes, les colocations | **l'enfant est le générateur de divergence.** Un couple a négocié sa bouffe pendant des années et s'en arrange. Un enfant ne négocie pas : il refuse, il a d'autres portions, un autre rythme — et il grandit, donc ça bouge tout seul |
| **3** | *« Tout le monde mange la même chose ? Combien de raisons font que non ? »* | ceux qui n'ont qu'une contrainte | c'est là qu'est notre avantage (§2.1) |

**Trente secondes, et on sait si la conversation continue.**

> ### ⚠️ « Tout le monde mange pareil » est un FAUX NÉGATIF
>
> C'est le piège de la question 3 au présent, et il porte sur exactement la
> population qu'on cherche.
>
> Un foyer aplatit sa table **parce que la divergence est trop chère à produire**
> quand on cuisine seul, le soir, pour tout le monde. « Oui, on mange tous
> pareil » veut donc souvent dire **« on a renoncé »** — et la question, posée au
> présent, le compte comme « pas de problème ».
>
> **La formulation qui débloque est le contrefactuel :**
>
> > *« Si chacun mangeait vraiment ce qui lui convient, ce serait le même plat
> > pour tout le monde ? »*
>
> Celui qui a renoncé répond « ah non, clairement pas » — alors qu'il aurait dit
> « oui » à la version au présent.
>
> **Conséquence sur le marché (§7) :** la cible est plus large que le nombre de
> foyers qui divergent *aujourd'hui*, parce qu'une part d'entre eux ne diverge pas
> encore **faute de pouvoir se le permettre**. C'est aussi la meilleure preuve que
> le produit crée de la valeur au lieu de la constater.

### ⚠️ « Trois personnes ou plus » serait un mauvais qualifieur

C'est le nombre de têtes qui est trompeur, pas l'intuition. Le seuil correct est
**la présence d'un enfant**, et la différence n'est pas théorique :

- **Un parent seul avec un enfant, c'est DEUX personnes** — et c'est probablement
  le foyer le plus qualifié du marché : un enfant qui diverge, **personne avec qui
  partager la cuisine**, et la pression de temps maximale. Un seuil à trois
  l'écarterait.
- **Trois adultes en colocation, c'est trois personnes** — et ce n'est pas notre
  cible du tout.

### Et une distinction sur « cuisiner » qui change la cible

Cuisiner, ici, ce n'est pas la gastronomie : le produit porte un réglage de
difficulté et un temps disponible. Quelqu'un qui fait des pâtes et une salade
cuisine.

> **Ce n'est pas le passionné qu'on vise, c'est l'obligé.**
> Celui qui aime cuisiner résiste à un plan qui lui dit quoi faire — on lui retire
> son plaisir. Celui qui cuisine **parce qu'il faut bien**, tous les soirs, depuis
> des années, c'est celui qui achète.

D'où une formulation de la question 1 qui trie mieux que « est-ce que vous
cuisinez ? » :

> *« Le soir, c'est plutôt un moment que vous aimez, ou un truc à expédier ? »*

---

## 3. Les axes réels de divergence, classés par ce qu'ils font au plan

C'est la carte à avoir en tête. Elle est plus riche que « allergies, régimes,
objectifs », et chaque ligne existe déjà en base.

| Ce que ça fait | Les axes | Ce qui en dépend |
|---|---|---|
| **Interdit** — verrou dur, non négociable | allergie · intolérance · régime (végétarien, végane, pescétarien) · religieux ou éthique · condition médicale | la casserole commune suit **le plus strict de la table** |
| **Dimensionne** — même plat, parts différentes | objectif (`fat_loss` · `maintenance` · `muscle_gain`) · niveau d'activité (4 niveaux) · âge et croissance · corps (taille, poids) | l'enveloppe de chacun |
| **Décale** — qui mange quoi, et quand | rythme alimentaire (**6 moments**, par personne) · jours d'absence · horaires | quel repas existe, et pour qui |
| **Refuse** — le goût, traité comme une donnée | `dislike` en sévérité `preference` | ce qu'on ne propose pas, **sans en faire une interdiction** |
| **Borne** — la faisabilité, commune au foyer | budget · jours de cuisine · temps disponible · équipement · difficulté · variété | si le plan est **exécutable** |

### Les trois axes les plus sous-estimés

**Le rythme.** L'ado qui saute le petit-déjeuner, le parent qui déjeune au bureau,
l'enfant qui goûte à 16 h. Ce n'est pas une préférence, c'est une structure de journée
— et deux personnes du même foyer n'ont presque jamais la même. C'est probablement la
divergence la plus universelle qui existe, et elle n'est ni médicale ni idéologique.

**L'âge.** Un enfant n'est pas un petit adulte : il grandit, ses besoins montent, et le
produit le relit à chaque décision plutôt que de le figer. Un foyer avec un enfant de
6 ans et un ado de 16 ans **diverge par construction**, sans que personne n'ait rien
déclaré.

**Le goût, pris au sérieux.** L'enfant qui ne mange rien de vert est la contrainte la
plus fréquente, la plus douloureuse au quotidien, et celle que tout le monde traite
comme un caprice au lieu d'une donnée. Elle a une sévérité à elle (`preference`) :
elle oriente sans interdire.

---

## 4. La douleur

Ce n'est pas « je ne sais pas quoi cuisiner » — résolu, gratuitement, par vingt
applications, pour vingt-deux millions d'utilisateurs. L'attaquer nous met en
concurrence avec du gratuit.

> **La douleur, c'est l'arbitrage.** Il est fait de tête, chaque semaine,
> gratuitement, par une seule personne du foyer, et il est invisible — y compris pour
> elle.

1. tenir N jeux de contraintes en mémoire ;
2. **les réconcilier en une liste de courses et une session de cuisine**, sinon la
   semaine ne tient pas ;
3. **les redéployer en N assiettes différentes** au moment de servir ;
4. **tout recommencer** dès que le mardi soir ne se passe pas comme prévu.

Les étapes 2, 3 et 4 sont exactement là où toutes les applications existantes
s'arrêtent. **L'étape 4 est celle qui les tue toutes.**

---

## 5. Les quatre propositions de valeur, avec leur mécanisme

### ① Une cuisson, des assiettes différentes

**La promesse :** on ne demande à personne de choisir entre « tout le monde mange
pareil » et « je cuisine quatre fois ».

`CookingShape` — `one_dish` | `one_session` | `separate_sessions` — est **calculé** par
`mergeLadder` (`_shared/keel/household_merge.ts`), pas choisi au hasard, et il **change
la consigne envoyée au modèle** (prouvé : `household_merge_test.ts:885`). Un plat dédié
porte l'identité de la bouche à qui il revient (`member_id`).

**Qui ne peut pas suivre.** Meal Prep Pro : tout le foyer mange le même plat. Jow :
compose pour un nombre de couverts, pas pour des personnes.

### ② Chaque membre est une personne, pas un nombre de calories

`keel_household_roster_for` rend par membre `member_id, user_id, first_name,
age_state, role, goal`. Et par tables dédiées : `household_member_allergies`,
`household_member_bodies`, `household_member_habits` (6 moments + note). L'entonnoir
pose **34 étapes**.

> `household_member_habits.updated_by` est en `on delete set null` — *« le maître qui
> supprime son compte ne doit pas effacer ce que sa mère mange le matin »*. Ce que
> quelqu'un a déclaré lui survit.

**Qui ne peut pas suivre.** Meal Prep Pro : un seul champ par personne, kcal/jour. Eat
This Much a essayé et **publie son propre contournement** — caler sur la personne qui
mange le moins, ou additionner et diviser au prorata.

### ③ Le plan survit au mardi soir

`_shared/keel/accident.ts` (FF-057) énonce son propre motif : *« une session de cuisine
sautée fait disparaître trois ou quatre repas du réel, et le plan continue de les
afficher. C'est le mode d'échec structurel de la catégorie. »*

Et il distingue ce que personne ne distingue : **un plat sauté DÉCALE** ; **une session
sautée SUPPRIME en cascade**. Avec quatre refus calculés sur le plan réel —
`perishables_at_risk` (un périssable déjà acheté ne tiendrait pas), `already_cooked`,
`outside_plan_window`, `no_session`.

**Atteignable depuis l'écran depuis le 2026-08-18** : un bouton « je n'ai pas fait
cette cuisson » sur la cuisson du jour. Jusque-là, l'arbre entier n'existait que dans
la conversation.

**Qui ne peut pas suivre.** Personne, à notre connaissance. C'est le moins copiable des
quatre, parce qu'il suppose que le plan soit un objet vivant et pas un PDF hebdomadaire.

### ④ Un adulte garde la main sur ce qu'il mange

`household_members.restriction_consent_at` est **NULL par défaut**, révocable par le
seul intéressé, et la révocation **supprime** les restrictions déjà posées : *« un
produit où un adulte contrôle en silence l'alimentation d'un autre adulte est un outil
de contrôle coercitif »*. Les invitations sont liées à une adresse e-mail.

**Qui ne peut pas suivre.** Meal Prep Pro n'a pas de second compte. Et au-delà de la
fonctionnalité, c'est **une position** sur un marché qui vend « pilote l'alimentation
de ta famille ».

---

## 6. La carte concurrentielle

| | Divergence par personne | Cuisson mutualisée | Le plan se répare |
|---|---|---|---|
| **Jow** (~12 €/mois perçu) | ✗ couverts, pas personnes | ✗ | ✗ |
| **Mealime / Samsung Food+** (2,99–6,99 $) | partielle — profil santé | ✗ | ✗ |
| **Meal Prep Pro** *(leader batch cooking)* | ✗ une cible calorique | ✓ **pour une personne** | ✗ |
| **Eat This Much** | tentée, **échec documenté** | ✗ | ✗ |
| **CookAhead, Cook Smarts, Plan to Eat** | ✗ | ✓ | ✗ |
| **Nous** | ✓ | ✓ **pour un foyer divergent** | ✓ |

**Hors périmètre, volontairement :** le comptage calorique **par photo** — Nutrola, Foodvisor.
Le motif est mesuré, pas esthétique : −26,6 % de biais, systématiquement du côté flatteur
(`PHOTO_QUANTIFICATION.md`), et [LEGAL.md](LEGAL.md) §6.4 bis le maintient interdit.

> ⚠️ **Cette ligne disait « ils mesurent le passé, on organise l'avenir ». C'était faux, et
> c'était un différenciateur qui ne différencie rien.** Le produit mesure le passé lui aussi —
> photos, journal du jour, bande du soir, bilan hebdomadaire, adhérence, couverture de saisie —
> et il **affiche des calories** depuis FF-059. La frontière réelle n'est pas *mesurer ou non* :
> c'est **d'où sort le chiffre**. Calculé sur des quantités que le produit a lui-même écrites
> (MAPE 2,3 %) plutôt que deviné sur une image (−26,6 %). Décision du 2026-08-18, écrite ici le
> 2026-09-01.

**Et le leader est disqualifié structurellement, pas fonctionnellement.** Le conseil de
Jow est financé par les marques — retail media. Un foyer avec une contrainte
non négociable ne peut pas accepter un conseil payé par celui qui vend l'ingrédient.
Notre ligne rouge est écrite : **commission au volume, jamais de placement de marque.**

---

## 7. Ce que la révision change au dimensionnement du marché

⚠️ **`PREMIERS-1000.md` §2.5 chiffre le segment « contrainte médicale non
négociable » : 1 à 1,5 M de foyers en France. Ce chiffre reste juste — il n'est plus
la cible, il en est le PLANCHER.**

Le nouveau qualifieur (≥ 2 contraintes simultanées) n'a **aucune source publique** :
personne ne mesure « part des foyers dont les membres ont deux contraintes alimentaires
différentes ». On ne va donc pas l'inventer.

**Et le qualifieur « au moins un enfant » (§2.3) change la base de calcul.** Ce
n'est plus un plafond arithmétique lointain : c'est la **définition** du segment,
qu'on filtre ensuite deux fois.

| | Chiffre | Statut |
|---|---|---|
| **La base** — familles avec au moins un enfant mineur au domicile | **7,9 M de foyers** | **sourcé** (INSEE 2022) |
| × celles où **on cuisine le soir** | ? | **à mesurer** — question 1 |
| × celles où **≥ 2 contraintes divergent** | ? | **à mesurer** — question 3 |
| *(pour mémoire)* dont contrainte médicale non négociable | 1 à 1,5 M | sourcé — notre meilleure cohorte, plus notre qualifieur |

**Les deux inconnues se mesurent en une matinée, et sans étude de marché** — parce
que **le filtre de recrutement EST l'entonnoir de dimensionnement**. Les trois
questions du §2.3, posées cinquante fois à un marché ou une sortie d'école,
rendent les deux taux qui manquent.

> **À noter pour chaque foyer abordé, même ceux qui refusent la conversation :**
> cuisine-t-il ? a-t-il des enfants ? combien de raisons de divergence ?
> Trois chiffres, gratuits, que personne ne publie.

---

## 8. Ce qui borne la promesse aujourd'hui

**Halal et casher ne sont pas promettables**, et c'est un choix écrit dans
`dietary_regime.ts` : *« la licéité y dépend autant du mode d'abattage et de la
séparation des ustensiles que de l'espèce. Prétendre les couvrir avec une liste
d'aliments exclus produirait une garantie fausse, ce qui est pire que pas de
garantie. »* On tient « pas de porc » de façon fiable. On n'écrit pas « halal » sur une
page de vente.

**Le régime alimentaire : fermé le 2026-08-18.** Il n'était appliqué que sur la voie
foyer ; la voie individuelle n'en lisait que le drapeau de carence. Consigne + vérification
déterministe de sortie sont en place, prouvées par mutation. **Reste à faire :** dix
générations réelles avec régime + allergène déclarés, sorties lues.

**La qualité des plans n'est pas évaluée.** Les verdicts mesurent la conformité, jamais
la qualité. C'est le prérequis au premier foyer.

**Limite mesurée du matcher :** en français, « sans A **ni** B » ne désarme que A.
Faux positif sur le régime, **et probablement faux rejet sur la ceinture allergène**,
qui partage ce matcher. À vérifier séparément.

---

## 9. Ce que ça change pour la page de vente

**Une démonstration, et elle prouve les quatre propositions à la fois :**

> **Un foyer. Une session de cuisine, dimanche. Quatre assiettes qui ne se ressemblent
> pas. Et le mardi, la session saute — le plan se réécrit tout seul.**

**L'ordre du discours, et il n'est pas négociable :**

1. **On accroche sur la charge** — « organiser les repas de la maison » —, parce que
   c'est ce qui se reconnaît en une phrase ;
2. **on distingue sur la réconciliation** — *trois personnes, trois besoins, une seule
   cuisson* —, et surtout pas sur la contrainte elle-même : maintenant que le
   qualifieur est quasi universel, dire « pour les foyers à contraintes » ne
   différencie plus de rien ;
3. **on retient sur la réparation**, parce que c'est ce qui décide de la semaine 2.
