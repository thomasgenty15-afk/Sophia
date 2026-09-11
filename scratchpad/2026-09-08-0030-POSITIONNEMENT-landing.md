# SOPHIA — positionnement, contenu de landing et brief de reprise pour Claude

**Mis à jour le 8 septembre 2026 après lecture de la landing par le propriétaire.**

Ce document rassemble le contenu de la première landing réalisée, les corrections
produit données par le propriétaire et les consignes pour la prochaine version.
**Les corrections du propriétaire ci-dessous font autorité sur le prototype et sur
l’ancien brief.** Une phrase présente sur la page n’est pas, à elle seule, une
fonctionnalité validée.

Le propriétaire demande cette mise à jour documentaire pour confier la reprise à
Claude. La page n’a pas été corrigée à l’occasion de cette mise à jour : elle
contient encore les formulations et la démonstration signalées comme à remplacer.

Sources :
- Contenu du prototype : `frontend/src/landing/SophiaLanding.tsx`.
- Styles et animation : `frontend/src/landing/sophia-landing.css`, `TableScene.tsx`.
- Charte existante : `frontend/src/tokens.css`, `docs/keel/CHARTE-VITRINE.md`.
- Tarifs : `frontend/src/keel/i18n/prices.ts`.
- Retours explicites du propriétaire dans cette conversation.
- Ancien brief conservé dans `2026-09-08-0030-POSITIONNEMENT-landing.v1-archive.md`.
- Contexte de recherche : `2026-09-07-2130-ETUDE-DE-MARCHE-decision.md` et
  `2026-09-07-2100-ETUDE-MARCHE-notes-orchestrateur.md`.

## 1. Les décisions et corrections à prendre en compte

| Sujet | Statut / consigne pour la reprise |
|---|---|
| Sections 04 et 05 | Jugées plutôt bonnes par le propriétaire. Garder leur direction et leur structure ; compléter l’explication de l’offre. |
| « Les calculs sont servis » | Formulation rejetée. La remplacer par un intitulé direct. |
| Démonstration du planning | À refaire : le prototype ne ressemble pas suffisamment au plan de la plateforme et n’expose pas les courses et les sessions de cuisine. |
| Ordre du fonctionnement | **Courses → cuisine → repas.** Ce n’est pas repas → courses → cuisine. |
| Préparations de la veille | Ne pas en faire une promesse : transformer des restes ou réinventer une préparation le lendemain n’est pas l’ADN du produit. |
| Imprévu | Décrire le plat ou le prendre en photo pour qu’il soit comptabilisé. **Le plan existant n’est pas réorganisé en réaction à cet imprévu.** |
| Accès personnel supplémentaire | Expliquer à qui il sert et ce qu’il permet : le membre du foyer qui veut suivre son propre objectif, déclarer ses repas imprévus et mettre son poids à jour. |
| Poids et génération | Les données actualisées du membre alimentent la génération de plan pour lui. Ne pas confondre cette actualisation avec une réécriture automatique du planning déjà organisé. |
| Animation actuelle | Le propriétaire n’est pas convaincu ; il demande d’utiliser Higgsfield pour explorer une meilleure animation. |
| Couleurs | Le propriétaire questionne le changement radical. Le jaune/vert est une exploration, **pas une nouvelle charte validée**, ni une palette démontrée plus performante. |

## 2. Positionnement et arguments

### La proposition de valeur

> **Des repas pour ton objectif. Les calculs sont déjà faits.**

Explication concrète :

> Sophia traduit ton objectif en repas : quoi manger, en quelles quantités, et
> comment organiser les courses et les sessions de cuisine pour les préparer.

L’entrée retenue pour la proposition de page est la personne avec un objectif
individuel : perte de poids ou prise de muscle. Le foyer est un avantage concret
pour rendre cet objectif compatible avec la vie de la maison.

Cette entrée reste une hypothèse de positionnement à tester. Les avis et les
volumes de notes d’autres applications ne démontrent ni la conversion de Sophia,
ni son consentement à payer, ni l’absence de demande autour du foyer. Ne pas
reprendre les conclusions catégoriques de l’ancienne étude comme des preuves
commerciales sur la page.

### Trois arguments distincts

1. **Tu sais quoi manger pour ton objectif.** Des repas concrets, avec les quantités
   prévues pour toi, selon ton activité, tes préférences et tes habitudes.
2. **Les calculs sont faits avant de passer à table.** Les recettes prévues ont
   déjà leurs quantités et leurs apports ; pas de ressaisie de chaque ingrédient.
3. **Les repas de la maison sont organisés ensemble.** Les besoins individuels sont
   pris en compte dans une organisation commune des courses et de la cuisine.

« Pas de journal à remplir pour chaque repas prévu » et « une photo lors d’un
imprévu » sont deux aspects du même mécanisme. Ils ne doivent pas occuper à eux
seuls deux des trois arguments principaux.

### Le mécanisme à expliquer correctement

- Sophia part des données de chaque personne : objectif, activité, poids et
  autres informations pertinentes, préférences et habitudes alimentaires.
- Le plan relie les **courses**, les **sessions de cuisine** et les **repas**.
- Les apports du prévu sont calculés à partir des recettes et des quantités.
- Pour un repas non prévu, la personne peut décrire son plat ou envoyer une photo
  afin de le faire comptabiliser dans son suivi.
- Déclarer cet imprévu ne recalcule pas les courses, ne déplace pas les sessions et
  ne transforme pas automatiquement les repas suivants.
- Actualiser son poids met à jour les informations sur lesquelles la génération
  de plan s’appuie. C’est un autre mécanisme que la déclaration d’un imprévu.
- Pour le foyer, on mutualise l’organisation et les préparations lorsque c’est
  possible. Cela peut donner le même plat ou des plats différents selon les
  besoins ; ce n’est pas seulement une multiplication des portions.

## 3. Charte de couleur et direction visuelle

### Ce qui existe déjà

La charte de Sophia est construite autour de la **figue**, de neutres légèrement
teintés et d’une typographie Public Sans / Young Serif.

| Usage | Jeton existant | Couleur |
|---|---|---|
| Fond principal | `paper` | `#FBF8FA` |
| Fond secondaire | `paper-2` | `#F4EFF2` |
| Texte principal | `ink` | `#23191F` |
| Texte secondaire | `ink-soft` | `#6A5A64` |
| Accent, liens et boutons | `fig-700` | `#632C4C` |
| Survol des boutons | `fig-800` | `#4A2039` |
| Lavis / surfaces légères | `fig-100` | `#EFE0E9` |
| Bloc sombre | `fig-950` | `#24101E` |
| Bordure de contrôle | `line-strong` | `#8E7886` |
| Focus sur fond clair | `fig-600` | `#7E3C61` |

Lire les règles complètes dans la charte et les valeurs dans `tokens.css` ; ne pas
utiliser un séparateur décoratif comme bordure d’un contrôle interactif.

### Ce que le prototype a changé

Le prototype emploie un jaune citron `#DFFF00`, un vert profond `#113B29`, une encre
verte `#153C2C` et un fond `#FAFBF7`. Ce changement était volontaire pour donner
une présence visuelle plus énergique et gourmande. Les deux familles de polices
existantes ont été réutilisées.

**Ce choix n’a pas été testé contre la charte d’origine.** Il n’existe ici aucune
preuve qu’il améliore la conversion. Il modifie fortement la perception de marque
et la continuité avec les pages existantes.

**Recommandation de Codex, à distinguer d’une décision du propriétaire :** repartir
de la palette figue, avec de grandes compositions, une hiérarchie plus expressive,
des visuels culinaires et un mouvement mieux dirigé. L’impact ne nécessite pas de
changer la couleur de marque. Si une nouvelle palette est conservée, elle doit
être choisie explicitement, et non héritée du prototype par défaut.

### Une expérience visuelle, avec un parcours de conversion lisible

Le propriétaire veut une landing qui « claque », qui se parcourt comme une
aventure et qui convertisse. Il a cité Three.js / React Three Fiber / Drei,
shaders GLSL, Spline, Rive, GSAP / ScrollTrigger / Lenis et la profondeur CSS comme
possibilités. Ce n’est pas une obligation d’empiler toutes ces technologies.

Le prototype a utilisé une scène Three.js / React Three Fiber / Drei avec un
plateau texturé, des anneaux et objets décoratifs, une matière en shader, du
mouvement au pointeur et au scroll, ainsi que des cartes en perspective.
**Cette animation n’a pas convaincu le propriétaire. Ne pas la conserver comme
une direction validée simplement parce qu’elle fonctionne techniquement.**

La piste Higgsfield proposée est un plan culinaire plus naturel : matière du plat,
lumière, profondeur et mouvement de caméra discret. Cette piste est à réaliser et
à juger, pas à présenter comme un résultat déjà obtenu.

État réel : les deux images du prototype ont été produites avec ImageGen. Aucune
vidéo Higgsfield n’a été générée. Le plugin est installé ; l’accès via navigateur
a demandé une authentification, puis la préparation du brouillon a été refusée
par le contrôle automatique pour limite d’utilisation atteinte.

Le nouveau brief autorise l’exploration de visuels culinaires malgré l’ancienne
règle « aucune photographie » de la charte. Il faut toutefois distinguer une
illustration culinaire d’une preuve du produit : **le planning montré doit être
fidèle à la plateforme**, et une photographie générée ne prouve pas la qualité
réelle d’un plan.

Conserver : contenu lisible avant l’animation, actions accessibles, version
mobile soignée, contrôle pause, respect de la réduction des animations et image
de remplacement si la vidéo ou la 3D ne fonctionne pas. Ne pas imposer de traverser
une longue animation pour comprendre le produit ou accéder à l’offre.

## 4. Contenu de la page, section par section

Les textes non signalés comme validés sont des **bases de travail issues du
prototype**, pas une validation mot à mot du propriétaire.

### En-tête

- Marque : **sophia.**
- Navigation : **L’expérience · À plusieurs · L’abonnement**.
- Connexion et bouton **Commencer**.
- En mobile : menu donnant accès aux mêmes sections et à la connexion.
- Le chemin de conversion actuel est `/start?lang=fr` ; préserver le bon parcours
  d’inscription du foyer, et non un parcours professionnel.

### Ouverture / hero

Sur-titre actuel :

> TON OBJECTIF. ÇA COMMENCE À TABLE.

Titre actuel :

> **Mange pour ton objectif. Vis pour tout le reste.**

Texte actuel :

> Des repas pour toi. Les quantités déjà calculées.
> Les courses et la cuisine qui vont avec.

Actions :
- **Découvrir mon programme** → inscription.
- **Voir comment ça marche** → démonstration.
- Réassurance : **7 jours d’essai · Puis 12,99 €/mois · Sans engagement**.

Textes accompagnant le visuel :
- « Le plaisir fait partie du plan ».
- « Au menu — Ton objectif, en recettes. »
- « Déjà calculé. Vraiment cuisiné. »
- « Suggestion de présentation » : préciser le statut illustratif du visuel.

Le prototype ajoute « La suite se savoure » vers la section suivante et un
contrôle « Pause animations » / « Activer les animations ».

Bandeau des trois bénéfices :

> DES REPAS POUR TON OBJECTIF · LES CALCULS DÉJÀ FAITS · UNE ORGANISATION POUR LA MAISON

### Section 01 — l’objectif

Sur-titre actuel : **UN CAP. DES REPAS.**

Titre :

> **Tu connais ton objectif. Voici le menu.**

Texte :

> Perdre du poids, prendre du muscle : entre ce que tu veux et ce que tu mets dans
> ton assiette, il y a beaucoup de décisions.
>
> Sophia les transforme en repas concrets. Quoi manger, en quelles quantités, et
> comment les préparer.

Deux sélections illustratives : **Perdre du poids** / **Prendre du muscle**.

- Poids : « Des repas organisés autour de ton objectif, en tenant compte de ton
  activité et de tes préférences. »
- Muscle : « Des quantités et des apports en protéines pris en compte dans les
  recettes de ton planning. »

Dans le prototype, ce choix modifie seulement le texte d’explication. Il ne
calcule pas les besoins du visiteur et ne génère pas un plan personnel. Ne pas
faire croire le contraire.

### Section 02 — les calculs et la démonstration du plan

**À retirer : « LES CALCULS SONT SERVIS. »** Le propriétaire n’aime pas la formule.

Proposition de remplacement : **TES REPAS, DÉJÀ CALCULÉS.**

Titre actuel, base à retravailler si nécessaire :

> **Plus de goût. Moins de calculs.**

Texte :

> Les quantités et les apports des repas prévus sont déjà calculés. Tu n’as pas à
> ressaisir chaque ingrédient après avoir mangé.

La photo actuelle de saumon porte « De vrais repas » / « Le plaisir fait partie du
plan » / « Et ça se voit ». Ce sont des éléments éditoriaux illustratifs, pas des
résultats d’un client ou d’une génération réelle.

#### La démonstration à reconstruire — point prioritaire

**Le prototype actuel est insuffisant.** Il montre un petit calendrier avec midi
et soir et une note « Côté cuisine ». On n’y comprend pas les courses, les sessions
de cuisine ni leurs liens avec les repas. Son apparence et son fonctionnement ne
sont pas suffisamment proches du plan réel de la plateforme.

La prochaine version doit :

1. Partir d’un plan réellement représentable par les composants du produit.
2. Montrer les **courses** : quand elles sont prévues et ce qu’elles permettent de
   préparer, conformément aux informations réellement présentes dans le plan.
3. Montrer les **sessions de cuisine** : les préparations de la session et les
   repas qu’elles servent, selon la représentation du produit.
4. Montrer les **repas** issus de cette organisation, avec les informations
   réellement affichées dans l’application.
5. Permettre de lire les liens **courses → cuisine → repas** au premier regard.
6. Utiliser les vrais libellés, regroupements et interactions utiles du produit.
   Une simplification pour la landing est possible ; inventer une autre interface
   ou un autre fonctionnement ne l’est pas.
7. Garder un jeu de données fictif/anonymisé ou un exemple autorisé. Une maquette
   utilisant les vrais composants reste un exemple, pas le résultat du visiteur.

Points d’entrée à lire avant de dessiner la démo :
- `frontend/src/keel/pages/StudentWeekPlanPage.tsx` ;
- `frontend/src/keel/components/plan/PlanResult.tsx`, `PlanGrid.tsx`,
  `PlanDayBlock.tsx`, `PlanByPerson.tsx` et `BoxTable.tsx` ;
- `frontend/src/keel/components/CookingSessions.tsx` et `WeekView.tsx`.

Ce sont des références à examiner, pas une prescription de réutiliser tous ces
composants. Identifier ceux qui portent effectivement le plan actuel.

#### Ce qui ne doit pas être repris comme ADN

Supprimer :

> « Côté cuisine — Les préparations de la veille trouvent une nouvelle assiette. »

Ne pas transformer Sophia en produit qui réinvente les restes le lendemain.
Montrer l’organisation prévue des sessions, leurs préparations et leurs repas.

Autres notes fictives du prototype à remplacer par des informations réelles du
plan : « Une fournée de légumes. Deux repas bien partis. » et « Un assemblage
rapide pour le déjeuner. Du végétal le soir. »

Pour mémoire, les exemples de menus inventés étaient :

| Jour | Midi | Soir |
|---|---|---|
| Lundi | Bowl de poulet, patate douce & avocat | Saumon rôti, pommes de terre & légumes verts |
| Mardi | Couscous perlé aux légumes rôtis | Poulet citronné & haricots verts |
| Mercredi | Salade de pommes de terre & saumon | Bowl de pois chiches, avocat & crudités |

Ils sont consignés pour documenter la page existante, **pas pour servir de plan de
référence à la nouvelle démonstration**.

Libellés actuels de la maquette : « Exemple de planning », « Ta semaine prend
forme », « C’est prévu », « Midi », « Soir », « Les ingrédients et les quantités,
au même endroit », « Une recette à suivre, sans refaire les calculs ». À reprendre
uniquement s’ils conviennent à la véritable représentation du produit.

Mention utile à conserver :

> Exemple illustratif. Ton planning dépend de tes besoins et de tes préférences.

### Section 03 — le fonctionnement, dans le bon ordre

Sur-titre proposé : **DES COURSES AUX REPAS.**

Titre actuel conservable :

> **Tout se suit. À toi de cuisiner.**

Texte actuel :

> Un planning utile, c’est un planning que tu peux mettre dans ton assiette.

**Ordre demandé explicitement :**

#### 01 — Tes courses

> Tu sais quand faire les courses et quoi acheter pour les préparations prévues.

#### 02 — Ta cuisine

> Tes sessions de cuisine regroupent les préparations selon tes jours disponibles
> et le temps que tu peux y consacrer.

#### 03 — Tes repas

> Tu retrouves les repas prévus pour chacun, avec les quantités calculées selon
> les besoins et les objectifs renseignés.

Ne pas inverser cet ordre au motif que le système calcule d’abord un menu. Cette
section explique le déroulement concret vécu par l’utilisateur.

### Section 04 — le foyer : direction appréciée, à conserver

Sur-titre : **IL Y A DE LA PLACE POUR LES AUTRES.**

Titre :

> **Ton objectif. Leur appétit. La même table.**

Texte :

> Tu cuisines aussi pour d’autres personnes ? Sophia tient compte des besoins et
> des préférences de chacun.
>
> Des préparations communes quand c’est possible. Des plats différents quand
> c’est nécessaire. Et des courses rassemblées.

Action : **Faire une place à tout le monde** → offre.

Démonstration actuelle :
- **Toi** — Ton objectif, tes quantités.
- **Alex** — Plus de sport. D’autres besoins.
- **Lou** — Végétarienne. Son assiette aussi.
- Conclusion : **Une liste de courses commune**.
- Mention : « Exemple de foyer. Les repas s’adaptent aux profils renseignés. »

Ces personnes sont fictives. Préserver l’idée de personnes distinctes et d’une
organisation commune. Ne pas écrire « personne ne mange autre chose », ni réduire
la promesse au même plat multiplié par des portions différentes. Ne pas garantir
qu’une divergence de contraintes n’ajoute jamais de travail de cuisine.

### Bloc imprévus — correction produit impérative

Sur-titre actuel conservable : **ET QUAND LA VIE S’INVITE ?**

**À remplacer :**

> Un resto. Un imprévu. Tu restes aux commandes.
>
> Le planning te donne un cadre. Tu peux signaler un changement et faire part de
> ce qui te convient. Ton quotidien a sa place dans la conversation.

Cette formulation reste trop vague et peut suggérer une adaptation du planning.

**Proposition de nouvelle rédaction :**

> **Un repas imprévu ? Il compte aussi.**
>
> Un resto, un plat différent de ce qui était prévu : décris ce que tu as mangé ou
> prends-le en photo. Sophia le comptabilise dans ton suivi.

Dans la FAQ, expliciter si nécessaire :

> La déclaration complète ton suivi. Elle ne réorganise pas ton planning.

Action possible : **Comment déclarer un repas ?** → démonstration du geste ou
question correspondante dans la FAQ. Ne pas créer un lien sans destination utile.

La preuve attendue est le parcours **description ou photo → prise en compte dans
le suivi**, et non une animation qui déplace les autres repas. Ne pas afficher un
résultat d’analyse photographique comme une mesure exacte au gramme.

### Section 05 — l’offre : direction appréciée, à compléter

Sur-titre : **ON PASSE À TABLE ?**

Titre :

> **Ta prochaine semaine commence par un repas.**

Texte actuel, légèrement remis dans l’ordre du parcours :

> Découvre ce que ça change de savoir quoi acheter, quoi préparer et quoi manger.

Réassurance :
- **7 jours pour découvrir Sophia**.
- **Sans engagement**.

Carte d’offre :
- Nom : **Sophia, au quotidien.**
- Bandeau : **7 JOURS D’ESSAI**.
- Base : **12,99 €/mois**.
- Explication : **Pour le foyer, avec ton accès personnel.**
- Inclus : menus selon objectifs et préférences ; quantités et apports calculés ;
  organisation des courses et des sessions de cuisine ; besoins de la maison
  pris en compte.
- Action : **Commencer mes 7 jours d’essai**.

#### Expliquer les accès supplémentaires avant de les faire compter

Le libellé actuel « Accès personnels en plus » et le prix seuls ne suffisent pas.

**Ce que le propriétaire veut rendre clair :** l’option s’adresse aux membres du
foyer qui ont leur propre objectif et veulent le suivre eux-mêmes. Ils disposent
de leur espace pour déclarer un imprévu, par exemple en envoyant une photo, et
mettre régulièrement leur poids à jour afin que la génération de plan tienne
compte de leur évolution.

**Proposition de rédaction :**

> **Quelqu’un d’autre veut suivre son objectif ?**
>
> Pour **1,99 €/mois en plus**, cette personne dispose de son propre accès Sophia.
> Elle peut décrire ou photographier un repas imprévu pour le comptabiliser dans
> son suivi, et mettre son poids à jour pour que les plans générés tiennent compte
> de son évolution.

Libellé du sélecteur : **Accès individuels supplémentaires**.

Texte d’aide :

> Pour les membres qui souhaitent gérer leur propre suivi. Ton accès est déjà
> inclus dans l’abonnement.

Distinguer explicitement :
- prendre en compte une personne dans l’organisation des repas du foyer ;
- lui donner un accès personnel pour agir elle-même sur son suivi.

**Ne pas vendre 1,99 € comme le prix de chaque personne qui mange à table**, ni
comme le simple prix de création d’un profil. Cela contredirait le sens de
`PRICES.claimedProfile` et la clarification du propriétaire.

Le calculateur existant affiche `12,99 € + nombre d’accès supplémentaires × 1,99 €`.
Exemples : aucun accès supplémentaire = **12,99 €** ; un = **14,98 €** ; deux =
**16,97 €**. Le prototype propose de 0 à 7 accès supplémentaires ; garder cette
borne seulement si elle correspond à l’offre et à la limite du produit.

La sélection du prototype est une estimation : elle ne configure pas l’abonnement
et ne préremplit pas le parcours d’inscription. Sa note actuelle est :

> Estimation mensuelle. Configuration et conditions à l’inscription.

Éviter « le plan se met à jour en temps réel » seul. Cela pourrait se lire comme
une modification continue des courses et sessions déjà prévues. Dire que **les
données actualisées du membre sont prises en compte lors de la génération**.

### FAQ — contenu à livrer, aligné avec les corrections

**Est-ce que je dois compter mes calories ?**

> Les quantités et les apports des recettes prévues sont déjà calculés. Tu n’as
> pas à ressaisir chaque ingrédient dans un compteur. Si tu manges autre chose,
> tu peux décrire ton plat ou le prendre en photo pour le comptabiliser.

**Et si je ne mange pas le repas prévu ?**

> Décris ce que tu as mangé ou envoie une photo pour l’ajouter à ton suivi. Cette
> déclaration ne réorganise pas ton planning.

Cette question remplace avantageusement « Est-ce que je dois suivre le menu à la
lettre ? » et sa réponse vague sur le fait de « faire part de ses préférences ».

**Et si je cuisine pour d’autres personnes ?**

> Sophia prend en compte les besoins, les préférences et les habitudes des membres
> de la maison. Les courses et les préparations sont regroupées quand c’est
> possible. Selon les contraintes, les plats peuvent aussi être différents.

**À quoi sert l’accès individuel supplémentaire ?**

> Il permet à un autre membre du foyer de suivre son propre objectif depuis son
> accès. Il peut déclarer ses repas imprévus, notamment par photo, et mettre son
> poids à jour. Ses informations actualisées sont utilisées pour générer les plans.
> L’accès supplémentaire coûte 1,99 €/mois ; ton accès est inclus dans l’offre.

**Le plan change-t-il quand je mets mon poids à jour ?**

> Ton poids actualisé fait partie des informations utilisées pour la génération
> des plans. Il ne faut pas confondre cette prise en compte avec une
> réorganisation automatique du planning existant après un repas imprévu.

Formulation explicative à raccourcir au besoin ; conserver la distinction produit.

**Faut-il être à l’aise en cuisine ?**

> Tu renseignes ton temps disponible, ton équipement et ton niveau en cuisine.
> Sophia s’appuie dessus pour organiser les préparations. Il faut prévoir de
> cuisiner : les courses et les repas ne sont pas livrés.

**Comment fonctionne l’essai ?**

> Tu disposes de 7 jours d’essai. L’abonnement est ensuite de 12,99 € par mois pour
> le foyer, sans engagement. Un accès individuel supplémentaire coûte 1,99 € par
> mois. Les conditions sont présentées avant la souscription.

Habillage actuel : **AVANT DE SE LANCER** / **On te garde une réponse.**
La dernière formule reste une proposition éditoriale du prototype, pas une exigence.

### Pied de page et métadonnées

Signature : **Ton objectif, à table. Et le reste de ta vie autour.**

Liens : retour en haut ; mentions légales et confidentialité ; nous écrire
(`sophia@sophia-coach.ai`) ; connexion ; version anglaise (`/en`).

Signature juridique affichée : **© 2026 Sophia · IKIZEN** ; l’année est dynamique.

Métadonnées de l’accueil français intégré :
- Titre : **Ton objectif, à table | Sophia**.
- Description : **Des repas pour ton objectif, les quantités déjà calculées.
  Sophia organise tes menus, tes courses et tes préparations. Découvre 7 jours
  d’essai.**
- Préserver l’alignement entre le catalogue français, le HTML statique et les
  métadonnées au rendu ; le dépôt possède des tests pour cette cohérence.
- L’entrée d’aperçu `frontend/landing.html` est en `noindex,nofollow` et porte
  « Sophia — Ton objectif, à table. ». Ne pas transposer ce `noindex` par accident
  à l’accueil public du produit.

## 5. Ce qu’on ne promet pas

- Pas de réorganisation automatique du plan à la suite d’un resto, d’une photo ou
  d’un changement de repas déclaré.
- Pas de compensation automatique sur les repas suivants.
- Pas de « chiffre juste » garanti : un plan calculé ne constitue pas une mesure
  exacte de tout ce qui a réellement été mangé.
- Pas d’absence totale d’effort : les courses et la cuisine restent à effectuer,
  et les repas imprévus à déclarer.
- Pas de promesse que tout le foyer mangera toujours le même plat.
- Pas de transformation des restes en nouvelles recettes comme fonctionnement
  central ou garanti.
- Pas de performance commerciale attribuée à une palette sans mesure comparative.
- Pas de témoignages, résultats clients, économies ou durées de cuisine inventés.
- Pas de promesse de perte de poids chiffrée dans un délai ou de mise en scène de
  restriction agressive. Préserver les garde-fous existants pour les mineurs et
  les situations sensibles ; ne pas présenter Sophia comme un acte médical.

Préférer une preuve produit lisible à des attaques chiffrées sur les compteurs
concurrents. Les chiffres scientifiques et concurrentiels de la V1 ne sont pas
revalidés par cette révision et ne doivent pas être réintroduits sur cette seule base.

## 6. Vérifications produit à transmettre sans les confondre avec le wording

Le propriétaire vient de préciser le fonctionnement à présenter : photo ou
description d’un imprévu comptabilisée ; poids actualisé utilisé pour la génération.
Ce brief ne constitue pas un nouvel audit de leur implémentation.

La V1 contenait deux alertes techniques datées du 7 septembre :
- un plan servi à 2 697 kcal pour une cible de 3 080 kcal, malgré une tentative de
  rattrapage ;
- une lecture des événements d’écart qui manquait alors dans `meal-energy-v1`.

**Ces constats sont historiques.** Ne pas les déclarer corrigés ni toujours
reproductibles sans contrôle de la version actuelle. Avant de montrer une preuve
réelle ou de lancer la communication commerciale, vérifier le parcours utilisé.
Ne pas résoudre un écart entre le texte et le produit en promettant une nouvelle
fonction que le propriétaire vient précisément d’exclure.

Le contexte d’acquisition de la V1 (salles de sport, proposition de commission et
comptes coachs) reste disponible dans l’archive. Il n’est pas remis en décision
par cette reprise de landing et n’a pas à apparaître dans la page B2C.

## 7. Reprise attendue de Claude

1. Lire les corrections prioritaires (§1), le fonctionnement (§2) et la charte (§3).
2. Préserver la direction des sections 04 et 05 appréciée par le propriétaire.
3. Refaire la démonstration à partir de la vraie représentation du plan ; rendre
   visibles les courses, les sessions de cuisine et les repas qui en résultent.
4. Remettre le fonctionnement dans l’ordre **courses → cuisine → repas**.
5. Remplacer le sur-titre de la section 02 et les phrases qui suggèrent une
   réutilisation créative des préparations de la veille.
6. Réécrire le bloc imprévus et la FAQ autour de **décrire / photographier →
   comptabiliser**, sans adaptation du plan existant.
7. Expliquer les accès individuels par leurs utilisateurs et leurs gestes réels,
   avant le sélecteur du nombre d’accès.
8. Retravailler l’animation avec la piste Higgsfield demandée ; ne pas réutiliser
   le jaune/vert comme si ce changement de charte était validé.
9. Garder une conversion claire et les éléments de réassurance au bon endroit.
10. Contrôler la cohérence de tous les textes, du tarif, des liens et des
    métadonnées avec la version finale et la réalité du produit.

La surface de référence intégrée au projet est `frontend/src/landing/`, appelée
par l’accueil français dans `frontend/src/keel/pages/HomePage.tsx`. Le répertoire
`sites/sophia-landing/` est une copie séparée utilisée pour la publication privée ;
modifier seulement cette copie ne mettrait pas à jour l’accueil de l’application.
