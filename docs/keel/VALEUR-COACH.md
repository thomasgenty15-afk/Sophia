# Ce que Sophia apporte au coach

> Document de référence produit/commercial. Chaque affirmation ci-dessous correspond
> à du code vérifié dans ce dépôt. Ce qui n'est pas construit est listé en fin de
> document, à part — un support de vente qui promet ce qui n'existe pas se paie une
> seule fois, mais il se paie cher.

---

## En une phrase

**Le coach enregistre sa méthode une fois. Elle répond à ses élèves tous les jours,
dans ses mots, avec une garantie déterministe qu'elle ne le contredira pas.**

Et le lundi, il lit une page calculée sur des faits — jamais rédigée par un modèle.

---

## 1. La proposition économique

Un coach qui vend une formation encaisse **une fois**. Le travail de l'élève, lui,
dure un an. Sophia transforme ce qui se vendait une fois en quelque chose qui vaut
un abonnement mensuel.

| | Sans Sophia | Avec Sophia |
|---|---|---|
| Formation | 500 € encaissés une fois | 500 € |
| Suite | rien | 15 €/mois pendant 12-24 mois |
| **Valeur vie client** | **500 €** | **~1 220 €** |

Le coût pour le coach suit strictement l'usage : il paie par élève, il revend plus
cher, sa marge est positive dès le premier élève et il ne fournit aucun travail
supplémentaire.

**Pour une communauté existante** (Skool, Discord, Circle), la mécanique est encore
plus simple : Sophia devient le palier au-dessus. La communauté reste à son prix,
un palier « coaché » s'ajoute par-dessus, et seul ce palier consomme un siège.

---

## 2. Ce que le coach met dedans — et ce que ça lui coûte en temps

### La doctrine (une fois, ~45 minutes)

Un entretien de neuf questions, dans son vocabulaire de praticien, pas en langage
de prompt :

- ce qu'il croit et que ses confrères contesteraient ;
- ce que son agent ne doit **jamais** dire ;
- **et ce qu'il dit à la place, mot pour mot** ;
- ses mots à lui et ce qu'ils veulent dire exactement ;
- les aliments qu'il écarte, avec toutes les formulations qui les désignent ;
- ses réponses aux trois cas durs (« j'ai craqué », « j'ai faim à 22h », « c'est
  trop de nourriture ») ;
- à qui s'applique quoi, selon l'objectif de l'élève.

Il relit ce que la machine a compris, puis publie. Chaque version est un instantané
immuable : il peut réviser quand il veut — **une modification s'applique au message
suivant** — et revenir à n'importe quelle version antérieure sans perdre l'historique
de ce que ses élèves ont réellement reçu.

### Le protocole (une fois, ~15 minutes)

Une posture par groupe d'aliments — trente pastilles à un tap — plus quelques règles
temporelles à gabarits fermés. C'est contre cette structure que l'analyse photo se
compare et que la semaine se construit.

### La bibliothèque de recettes (optionnel, continu)

Ses plats, ses aliments, ses formulations.

### La note par élève (optionnel, mode 1:1)

1 500 caractères sur **un** élève — le travail de nuit, le genou en rééducation, le
dimanche qu'il saute toujours. Elle atteint ses trois surfaces : la conversation, le
plan de semaine, les repas générés.

**Optionnelle au sens fort** : vide, elle n'existe pas dans le prompt — pas même une
ligne disant qu'elle est vide. Aucun écran ne la réclame. C'est la seule forme sous
laquelle un champ par élève ne redevient pas une corvée par élève.

> **Total : environ une heure, une fois.** Après ça, le coach ne produit plus rien.

---

## 3. La garantie — le double verrou

C'est la partie qui répond à la seule vraie objection : *« une IA qui parle en mon
nom peut me faire dire une bêtise. »*

Un prompt est une instruction, pas une garantie. On peut dire à n'importe quel modèle
« ne recommande jamais de grignotage » : il obéira presque toujours. Et *presque
toujours* est le mauvais chiffre quand une seule contradiction publique est ce que
l'élève retiendra.

Les interdits sont donc appliqués **deux fois, par deux mécanismes qui échouent
différemment** :

| | |
|---|---|
| **Verrou 1 — injecté** | la méthode entre dans le prompt, à chaque message |
| **Verrou 2 — vérifié** | chaque message sortant est scanné contre les interdits, **de façon déterministe, sans modèle dans la boucle** |

Le second est celui qui garantit. Il partage son moteur avec le verrou médical des
allergènes — ce n'est pas une commodité d'implémentation, c'est une exigence de
justesse.

**Et l'élève ne reçoit jamais un refus.** Quand le verrou mord, ce qui part à sa
place est le texte que le coach a écrit lui-même à la question « qu'est-ce que tu dis
à la place ». Jamais « demande à ton coach » — dans une masterclasse, cette phrase
désigne une porte qui n'existe pas.

**Nuance importante :** l'agent reste capable de dire *« ton coach ne fait pas six
petits repas »*. Cette phrase-là, c'est la doctrine qui fonctionne. Le verrou vise
la recommandation, pas le mot.

---

## 4. Ce que le coach lit — la page du lundi

**Les chiffres sont calculés, jamais rédigés par un modèle.** Un coach qui attrape
un seul chiffre inventé cesse de croire tous les autres, et cette page est la
surface du produit.

| Bloc | Contenu |
|---|---|
| **Qui parle encore** | en contact (≤2 j) · en train de décrocher (2-5 j) · silencieux (5 j+) |
| **Comment la semaine a été vécue** | tient le coup · sous tension · en difficulté |
| **Ce qu'ils se sont fixé** | combien ont composé leur semaine à partir de sa méthode |

### Les trois règles qui rendent cette page lisible

1. **Personne n'est noté.** Pas de score d'adhérence, pas de pourcentage, pas de
   série, pas de classement. On n'évalue pas quelqu'un contre un plan qu'il n'a
   jamais signé. La semaine enregistre ce qui s'est passé ; le jugement reste au
   coach.

2. **Chaque ligne nomme la conviction dont elle vient.** Quand un élève compose sa
   semaine, chaque ligne alimentaire dit à quelle conviction du coach elle
   s'applique — **et la base refuse une ligne qui n'en nomme aucune**. C'est une
   contrainte, pas une convention.

3. **Le silence n'est jamais arrondi vers le haut.** Un élève qui a répondu deux
   fois n'a pas donné une semaine. Il revient comme *« pas assez de points »*,
   jamais comme *« ça va »*. Ça coûte une page plus flatteuse, et c'est la seule
   raison pour laquelle elle mérite d'être lue.

---

## 5. La donnée — ce qui se collecte, et pourquoi elle est bonne

C'est un volet que le coach sous-estime avant de l'avoir vu : **Sophia produit un
matériau que ni une formation ni une communauté ne produisent.**

### Ce qui se collecte

| Source | Fréquence | Nature |
|---|---|---|
| Le tap du soir | quotidien | 3 niveaux ; si ça va mal, **un** axe — énergie, faim ou sommeil |
| Le point hebdomadaire | hebdomadaire | 1-5 sur six axes |
| Les photos d'assiette | à chaque repas déclaré | groupes d'aliments + volume (petite / moyenne / grande) |
| La semaine composée | hebdomadaire | ce que l'élève s'est fixé, ligne par ligne, tracée à une conviction |
| Les mesures | libre | poids et mesures corporelles |
| Les contraintes | déclaré par l'élève | allergies, intolérances, médicaments |
| Les préférences | apprises en conversation | ce qu'il aime, ce qu'il refuse, son rythme |

### Pourquoi cette donnée vaut mieux que celle d'un tracker

**Elle est vérifiable.** Sophia ne compte pas les calories, et c'est un refus mesuré :
sur 85 analyses réelles notées contre les références USDA, l'estimation calorique à
partir d'une photo sous-évaluait de **26,6% en moyenne**, avec un biais qui s'aggrave
à mesure que l'assiette se remplit. Pire, quand le modèle propose sa propre marge
d'erreur, la vérité tombe dedans à peine plus d'une fois sur deux.

Ce qui est gardé — **quoi, quand, quelle taille** — l'élève peut le vérifier d'un
coup d'œil, et une erreur se corrige en un message. Un filtre déterministe retire
toute cible chiffrée que le modèle produirait quand même, et le journalise.

**Et c'est la moitié qui porte le résultat** : la *fréquence* à laquelle un élève
déclare est le meilleur prédicteur d'issue connu ; la *précision*, elle, ne prédit
rien.

**Elle est fréquente sans être pesante.** Trois niveaux tous les jours, six axes une
fois par semaine. La granularité est mise là où le budget d'effort existe. Un 0-10
quotidien se masse sur 7-8 : il a l'air précis et ne transporte presque rien.

**Elle ne ment jamais par omission.** Une donnée absente reste absente ; elle n'est
jamais estimée ni complétée.

### Ce que le coach en tire

- **Il voit sa méthode à l'échelle** — sur quels axes ses élèves décrochent, quelles
  convictions produisent réellement des semaines, à quel moment de l'année les
  cohortes s'essoufflent. Aucune formation ne lui a jamais dit ça.
- **Il voit qui décroche avant que ce soit fini** — l'élève « en train de décrocher »
  est encore récupérable.
- **Il peut faire évoluer sa méthode sur des faits**, et la version d'après part au
  message suivant.

### Et ce que l'élève y gagne

- Il relit sa propre régularité, ses journées, ses assiettes — un miroir qu'il n'a
  nulle part ailleurs.
- Chaque ligne de sa semaine porte la conviction dont elle vient : il peut juger
  lui-même si c'est une lecture fidèle de son coach.
- Il n'est **jamais noté**.

---

## 6. Le respect de l'élève — ce que le coach ne voit pas

Ce n'est pas une contrainte subie, c'est ce qui rend l'élève franc. Un élève qui sait
que son coach lit ses mots ne déclare plus rien de vrai.

- Le coach voit **qu'un fait existe et ce qu'il mesure** — jamais les mots de
  l'élève, ni ses notes sur un repas, ni ses photos, ni ses conversations.
- **Chaque ouverture de la fiche d'un élève est enregistrée et visible par lui.**
- La note du coach sur un élève fait partie des données personnelles de cet élève :
  elle lui est remise s'il demande son export, et l'écran le dit au coach avant
  qu'il n'écrive.
- L'agent utilise cette note, il ne la cite **jamais** : l'élève ne lit jamais
  « ton coach a noté que… ».

---

## 7. Le mode 1:1 — sans boîte de réception

Le coach n'a **aucune** file de messages à traiter. Il n'existe pas de canal
un-à-un vers lui. La note par élève est une annotation, pas un fil : personne n'y
répond, elle ne revient jamais chez lui.

C'est ce qui permet de dire les deux choses en même temps : *« tes élèves ont un
accompagnement individuel »* et *« tu n'as rien à suivre »*.

---

## 8. La sécurité

- L'élève déclare ses allergies, intolérances et médicaments ; ils arment un verrou
  déterministe qui passe **avant** la doctrine du coach — quand les deux se
  rencontrent, la contrainte gagne.
- La note du coach ne peut jamais débloquer un aliment qu'une contrainte exclut.
- Ressources de crise localisées par pays.
- Export et suppression de compte conformes RGPD, des deux côtés.

---

## Ce qui n'est pas encore construit

À jour au 6 août 2026. À lire avant de promettre quoi que ce soit en rendez-vous.

| | État |
|---|---|
| Paiement par l'élève dans Sophia | **absent** — le coach facture ses élèves avec ses propres outils |
| Annuaire de coachs / choix d'un coach par l'élève | **absent** |
| Protocole hors nutrition (suppléments, sommeil, exposition, mesures) | le schéma le porte, **la saisie coach ne l'expose pas** |
| Désactivation d'un siège par le coach | construit, **non déployé** |
| Facturation à l'abonné plutôt qu'à l'élève actif | **décidée, non appliquée** |
| Preuve d'engagement élève sur cohorte réelle | **non mesurée** — c'est la première chose à instrumenter |
