# La mémoire — ce que le produit retient d'une personne, et comment

**2026-08-21.** Écrit à côté de
`2026-08-20-1900-DESIGN-CALCUL-ET-COMPOSITION.md`, qui traite du calcul et de la
composition. Celui-ci traite de **ce qu'on retient**, et il propose de **remplacer**
l'architecture actuelle plutôt que de la corriger.

Autorité produit existante : `docs/keel/NOMENCLATURE-MEMOIRE.md`. Ce document la
contredit sur un point central, et le dit en toutes lettres.

---
---

# PARTIE 1 — LA VERSION COURTE

## Ce qui change, en une phrase

> **L'IA cesse de « retenir des choses ». Elle remplit le formulaire que la
> personne aurait rempli.**

Aujourd'hui, une phrase dite dans le chat devient une ligne dans un magasin
parallèle, invisible, sans plafond et sans mort. Demain, elle remplit **un champ
que la personne voit déjà**, ou elle ne fait rien.

## Les cinq règles

### 1. Deux sources de mémoire, pas quatre

Le **retour sur brouillon** et le **bilan de fin de plan**. C'est tout.

Le chat n'écrit plus rien : il **redirige** vers l'endroit où la réponse se pose.

### 2. Trois destinations, et une règle pour choisir

| ce qui est dit | où ça va |
|---|---|
| un fait qui **entre dans un champ existant** | **le champ** — aliments évités, équipement, rythme… |
| un **degré** qui revient — « trop long », « trop compliqué » | **un indice**, qui dérive et se stabilise |
| un **fait singulier** qu'aucun champ ne porte | **le mémo**, visible, cinq lignes maximum |

> **Un fait singulier va au mémo. Un degré va à un indice. Tout le reste va dans
> son champ.**

### 3. L'IA propose, un centre de notifications le dit, la personne défait

Pas de confirmation bloquante — quelqu'un de pressé dit oui à tout, et on
retombe sur de l'opt-out avec des étapes en plus.

À la place : **chaque écriture est notifiée**, avec **la phrase qui l'a
déclenchée**, et un bouton **Défaire**.

### 4. Rien n'est caché

Le mémo se voit. Les indices se voient. Les champs se voient. Les notifications
gardent l'historique.

⇒ **Toute décision du produit peut être expliquée en montrant un écran.**

### 5. La sécurité n'est pas de la mémoire

Une allergie, une intolérance, un régime, une condition médicale ne naissent
**jamais** d'un classement. Elles ont leur table, chargée à chaque tour, sans
ranking, avec consentement.

## Ce que ça supprime

| le problème d'aujourd'hui | pourquoi il disparaît |
|---|---|
| **la boule de neige** | un champ visible ne grossit pas en silence |
| **le dénominateur manquant** | le champ **est** le dénominateur |
| **l'enfermement dans une préférence** | « pourquoi pas de poulet ? » → il est dans ta liste, tu l'enlèves |
| **l'opt-out** | la notification + le champ visible sont deux chances de corriger |
| **la péremption absente** | un champ ne périme pas : il s'entretient |
| **la matrice de droits** | elle se dissout : un champ, un écrivain |

Huit familles × quatre sources × deux portées × une matrice deviennent **des
champs, des indices, et un mémo de cinq lignes.**

---
---

# PARTIE 2 — LE DÉTAIL

## 2.1 Le principe : il n'y a plus de second magasin

Le défaut central d'aujourd'hui n'est **pas** que le modèle classe mal. Il classe
bien. Le défaut est structurel :

> **Deux écrivains sur un seul profil, et un seul des deux peut se corriger.**

`logistics.set` écrit dans `practical_constraints` — **c'est le profil**. Une
phrase de chat et un champ de formulaire atterrissent au même endroit. Et la
règle du dépôt dit *« on ne réécrit jamais ce que quelqu'un a renseigné »* : la
mémoire ne peut donc qu'**ajouter**.

⇒ Un magasin qui ne fait que grandir, alimenté par de l'inférence, alimentant un
prompt sans plafond. C'est ça qui devient ingouvernable — pas la qualité du
classement.

**Le renversement** : l'IA n'écrit plus dans un magasin à elle. Elle écrit dans
les champs qui existent, ceux que la personne voit et édite.

## 2.2 Les deux sources, et ce qui les rend fiables

Ce n'est pas la fiabilité du modèle. C'est **le dénominateur** : la phrase
dit-elle *par rapport à quoi* ?

| dit dans le bilan | dit dans le chat | la différence |
|---|---|---|
| « ce plat, je ne le referais pas » | « j'aime pas trop ça » | le premier nomme **un plat** |
| « les portions, pour **moi**, trop grosses » | « c'était trop » | le premier a **un sujet** |
| « trop épicé — **ce curry** » | « trop épicé » | le premier est **situé** |

**La question du bilan porte la structure. La phrase du chat ne la porte pas.**

⇒ C'est pour ça que le retour sur brouillon et le bilan sont des sources et que
le chat n'en est pas une. Les deux premiers sont **ancrés sur un objet** — ce
brouillon-ci, ce plan-là.

⚠️ **Le retour sur brouillon peut être multiple.** Il y a N notes avant la
validation. Elles sont analysées **une fois, après validation** — pas à chaque
note, sinon on classe des allers-retours.

## 2.3 Ce que le chat fait à la place : il redirige

| ce qui est dit | ce que Sophia répond |
|---|---|
| « je n'aime pas le poulet » | « tu peux l'ajouter à tes aliments évités ici → » |
| « ce plan ne me va pas » | « dis-le dans le bilan de fin de plan, j'en tiendrai compte » |
| « je n'ai pas de four » | « mets à jour ton équipement ici → » |
| **« je suis allergique aux arachides »** | ⛔ voir §2.8 — **c'est le seul cas à part** |

⛔ **ET LA FORMULATION EST UNE GARDE, PAS UN DÉTAIL.** Sophia ne doit **jamais**
laisser croire que c'est enregistré. Pas de « je le note », pas de « j'en tiens
compte », pas de « c'est bon ».

C'est exactement la phrase qui a coûté cher à ce dépôt : `student_safety_constraints`
avait **six lecteurs armés en production et zéro écrivain**, et quelqu'un qui
déclarait une **anaphylaxie** recevait *« Noted, I'll keep it in mind »* pendant
que la base restait vide.

**Un lecteur sans écrivain ressemble trait pour trait à une fonctionnalité qui
marche. Ici, le mensonge était une phrase rassurante.**

## 2.4 Les trois destinations

### ① Les champs — le cas normal

Aliments évités, aliments aimés, équipement, rythme des repas, budget, temps de
cuisine, jours de courses. **Ils existent déjà**, ils ont un écran, et la personne
les édite.

L'IA les **propose**. La notification le dit. La personne défait si elle veut.

### ② Les indices — pour tout ce qui est un DEGRÉ

C'est le mécanisme qui manque le plus aujourd'hui. Détail en §2.6.

### ③ Le mémo — pour le singulier

Cinq lignes, visibles. Détail en §2.7.

## 2.5 Le centre de notifications

**Pourquoi pas une confirmation bloquante** : quelqu'un de pressé clique « oui »
à tout, et on retombe sur de l'opt-out avec des étapes en plus. Une notification
ne demande rien et laisse la trace.

**Ce que chaque notification porte, et les trois sont obligatoires :**

```
Poulet ajouté aux aliments évités
   parce que tu as écrit « trop de poulet cette semaine », le 12 mars
                                                          [ Défaire ]
```

1. **ce qui a changé** — le champ, la valeur, la personne concernée ;
2. ⛔ **la phrase source, citée** — sans elle, « Défaire » est un pari ;
3. **le geste inverse**, en un clic.

⚠️ **Et ça donne la traçabilité gratuitement.** *« Pourquoi il n'y a pas de
poulet ? »* → la notification est dans la liste, datée, avec sa cause. C'est le
cycle de vie du §2.9 qui tombe tout seul.

## 2.6 Les indices — le vrai apport de ce design

### Le défaut qu'ils ferment

Aujourd'hui le système **traduit chaque réponse en un ajustement**. C'est **sans
état** : une mauvaise semaine et les plans deviennent simples pour toujours, ou
la correction se perd au plan suivant.

### Comment ça marche

Chaque personne porte quelques indices, **tous au milieu au départ**. Un retour
les déplace d'un cran. Ils **convergent**.

| indice | ce qu'il gouverne | « trop long / trop dur » | « trop facile » |
|---|---|---|---|
| **rapidité de cuisine** | l'écart entre le temps déclaré et le temps visé | descend | monte |
| **compétence en cuisine** | la complexité des recettes proposées | descend | monte |
| **variété** | la pression de renouvellement | — | — |
| **portions** | le calibrage de l'enveloppe | descend | monte |

**Exemple.** Quelqu'un déclare 1 h 30 de session. Son indice de rapidité est au
milieu : on vise 1 h 30. Il répond deux fois « c'était trop long » : l'indice
descend, on vise **1 h 10** pour la même déclaration. Il finit par se stabiliser
là où ses plans tiennent.

### ⚠️ Ce qui fait qu'un indice ne dérive pas mal

**Des bornes.** Quelqu'un qui dit toujours « trop long » enverrait l'indice au
plancher et les plans deviendraient triviaux. Un bas, un haut, non négociables.

**L'indice se voit.** *« Sophia te pense plutôt rapide en cuisine »* — si c'est
faux, un geste corrige, au lieu d'attendre cinq plans que ça redérive.

**Un indice par PERSONNE, jamais par foyer.** La compétence en cuisine appartient
à qui cuisine, et dans un foyer ce n'est pas forcément qui mange.

### ⟳ `portion.adjust` est DÉJÀ de forme d'indice

Il transporte `{direction, magnitude}` avec **cinq crans**
(`PORTION_ANSWER_ADJUST`), et `PORTION_ADJUST_STEP` en fait une fraction de
bande. Tout est là — **sauf qu'il est appliqué une fois au lieu d'être cumulé
dans une position.**

⇒ Le transformer en indice est un **petit changement**, et il fait **converger**
le calibrage des portions au lieu de le faire osciller.

## 2.7 Le mémo — et ses trois conditions

Pour ce qu'aucun champ ne porte et qu'aucun indice ne mesure. Exemple :

> *« Danse le mardi, donc gros repas pour Mathilde ce jour-là. »*

**Trois conditions cumulatives** pour qu'une ligne y entre :

1. **factuelle** — pas un goût, pas une humeur ;
2. **actionnable** par le générateur ;
3. **inexprimable** dans un champ ou un indice existant.

### ⛔ Et il est VISIBLE, et PLAFONNÉ

Un champ texte **caché**, **sans plafond**, **injecté dans chaque prompt**, c'est
exactement le magasin qu'on supprime, avec un autre chapeau. Et c'est la chose la
plus difficile à déboguer du produit : le jour où un plan part de travers,
personne ne peut dire pourquoi.

- il **se voit** — *« ce que Sophia a retenu d'autre »* ;
- il a **cinq lignes**. À la sixième, il faut en retirer une.

> **Un plafond force une décision. L'absence de plafond force l'accumulation.**

⚠️ **« 100 % sûr » n'est pas un critère utilisable** : c'est un jugement que l'IA
porte sur elle-même, et c'est précisément ce qu'on ne peut pas vérifier. Les
trois conditions ci-dessus sont vérifiables ; « sûr » ne l'est pas.

## 2.8 La sécurité — hors de tout ce document

**Allergie, intolérance, régime, condition médicale ne sont pas de la mémoire.**
Elles vivent dans `student_safety_constraints` :

| | un champ / un indice / le mémo | `student_safety_constraints` |
|---|---|---|
| chargement | avec le reste | **synchrone, à chaque tour, sans cache** |
| ranking, plafond | oui | **aucun** |
| formes d'écriture | non | ✅ cacahuète · peanut · huile d'arachide… |
| **vérifiée sur la SORTIE** | ⛔ **non** | ✅ **oui**, ceinture déterministe |

La dernière ligne est celle qui décide. Une préférence est **une consigne de
prompt sans contrôle en sortie** : si le modèle met de l'huile d'arachide dans un
plat, rien ne l'attrape. La contrainte dure repasse sur les aliments réellement
nommés.

> *« Une allergie rappelée 80 % du temps est une allergie qui tue au 5ᵉ tour. »*
> — `safety_constraints.ts`

### ⛔ Le geste — TRANCHÉ le 2026-08-21

> **Le chat n'écrit JAMAIS. Pas même une allergie. Pas même en un tap.**

Un bouton d'écriture dans la conversation avait été proposé — *« je note une
allergie aux arachides, tu confirmes ? »*. **Écarté**, et pour deux raisons dont
la première est la plus forte :

**① Une règle avec une exception n'est pas une règle que l'utilisateur peut
apprendre.** *« Le chat n'écrit jamais »* se retient en une fois. *« Le chat
n'écrit que pour les allergies »* demande de deviner, à chaque phrase, de quel
côté on est.

**② Un bouton d'écriture n'a aucun point d'arrêt naturel.** S'il peut écrire une
allergie en un tap, pourquoi pas un aliment évité ? Pourquoi pas l'équipement ?
Six mois plus tard le chat écrit tout à nouveau, **un bouton à la fois** — et
comme chaque bouton est un opt-in, personne ne verra qu'on a reconstruit
exactement ce qu'on venait de supprimer.

> **Le chat parle. Les préférences retiennent.**

### La forme retenue : un bouton de NAVIGATION

De la navigation, **pas de l'effet**. Il retire la friction sans déplacer la
frontière — et une navigation ne dérive pas, elle n'a rien à écrire.

```
« Je n'ai pas enregistré ça — c'est important.
  Mets-le dans tes allergies : fruits à coque. »

                                       [ Ouvrir mes allergies ]
```

**Deux conditions, et elles décident si ça marche :**

1. ⛔ **Le bouton atterrit sur LA SECTION**, pas sur la page de réglages. Ce qui
   tue une redirection n'est pas le tap — c'est d'arriver sur un écran de
   préférences et de devoir **chercher où mettre la chose**.
2. **Sophia répète ce qu'elle a entendu**, pour que la personne n'ait pas à le
   reformuler.

⚠️ Et **la règle de formulation du §2.3 s'applique** : jamais laisser croire que
c'est enregistré tant que ça ne l'est pas.

## 2.9 Comment une règle meurt

Trois portes, et elles se suffisent :

**① La notification.** Immédiate, avec « Défaire ». La plupart des erreurs meurent
là, dans la minute.

**② Le champ.** La personne le voit, l'ouvre, retire. C'est l'entretien normal
d'un profil.

**③ La question vaut révocation.**

> **Une exclusion qu'on interroge est une exclusion morte.**

Quand quelqu'un demande *« pourquoi il n'y a jamais de poulet ? »*, il vient de
révoquer sa règle. Le renvoyer vers un écran, c'est lui faire payer deux fois une
préférence qu'il n'a plus. Sophia retrouve la ligne, dit d'où elle vient, et
propose de la lever **là**.

⚠️ **Et il n'y a pas besoin de péremption automatique.** C'était nécessaire quand
le magasin était invisible. Un champ qu'on voit s'entretient tout seul.

## 2.10 Ce que ça coûte, et il faut le dire

**Le chat cesse d'apprendre.** *« Plus jamais de topinambour »* dit en passant
demandera un geste — accepter la proposition, ou aller au champ.

C'est un vrai coût. Il est bon marché : on perd de la **captation passive**, on
gagne **un système dont chaque décision s'explique en montrant un écran**. Sur un
produit qui compose ce que les gens mangent, c'est le bon échange.

⚠️ **Et un cas reste ouvert** : celui de la personne qui dit quelque chose
d'important dans le chat et ne suit jamais la redirection. Elle est aujourd'hui
mieux servie par la captation automatique. **C'est le seul endroit où ce design
recule** — à mesurer avant de conclure.

---
---

# PARTIE 3 — LE TECHNIQUE

## 3.1 L'état mesuré — 2026-08-21

| | valeur |
|---|---|
| `student_goals` | **89** lignes |
| dont `practical_constraints` non vide | **46** |
| dont portant `retained_items` *(le magasin structuré, durable)* | **2** |
| dont portant `retained_next_plan` | **2** |
| dont portant `food_preferences` *(l'ANCIENNE liste plate)* | **10** |
| `meal_plan_feedback` *(le bilan)* | **4** |
| `cooking_session_states` *(« as-tu cuisiné ? »)* | ⛔ **0** |

⚠️ **Le magasin structuré tourne — `routeRetainedItems` est appelé dans les deux
lanes — mais il est presque vide.** L'ancienne liste plate porte **cinq fois plus**
de lignes, et c'est elle qui a produit, en run réel, *« Aime le brocoli s'il est
rôti »* et *« N'aime pas le brocoli »* **dans le même prompt**.

⛔ **Et `cooking_session_states` est à zéro** — le retour le plus important des
quatre *(le seul qui détruit des repas au lieu d'ajuster des préférences)* n'a
jamais été répondu.

## 3.2 Les seuils d'aujourd'hui, et ce qu'ils laissent passer

```
MIN_CONFIDENCE            = 0.7      confiance minimale d'une ligne inférée
PROMOTABLE_STATUSES       = ["active", "candidate"]
MAX_PROMPT_PREFERENCES    = 20       PRIVÉ à l'ancien magasin
le nouveau magasin        = SANS PLAFOND      <- trou nommé dans le code
```

⇒ Une inférence à 0,7, statut `candidate`, part dans le prompt **sans que la
personne confirme**. Elle ne peut qu'écarter **après** — donc après avoir remarqué
qu'un plan a changé et remonté jusqu'à une phrase dite il y a trois semaines.

## 3.3 Ce qui se supprime, ce qui se garde

| | sort | reste |
|---|---|---|
| les **8 familles** | ⛔ `logistics.set`, `rhythm.set`, `craving` *(canal existant : `household_envy_submissions`)* | `food.*`, `method.*` — mais **proposés à un champ**, pas stockés à part |
| les **4 sources** | ⛔ `conversation` — devient une redirection | `draft_note`, `questionnaire`, `written` |
| les **2 portées** | ⛔ `durable` — un champ n'a pas de portée | `next_plan` — utile pour un retour sur brouillon |
| `portion.adjust` | — | ✅ **devient un indice** |
| la **matrice de droits** | ⛔ se dissout | — |
| `student_safety_constraints` | — | ✅ **intouchée**, et c'est structurel |
| `KnownAboutYouCard` · `StudentKnownPage` | — | ✅ **devient le centre de notifications** |

## 3.4 Les points de branchement

| ce qu'il faut toucher | où |
|---|---|
| le classement d'un retour sur brouillon | `draft_note_classify.ts` · `draft_note_classify_io.ts` |
| le bilan → effets | `plan_feedback.ts` *(`effectOf`)* · `plan_feedback_retained.ts` |
| le routage vers les générateurs | `retained_items_routing.ts` |
| le magasin | `student_goals.practical_constraints` *(jsonb)* |
| le calibrage des portions | `PORTION_ANSWER_ADJUST` · `PORTION_ADJUST_STEP` *(`meal_envelope.ts`)* |
| l'outil de sécurité en conversation | `sophia-brain/tools/always_on/declare_safety_constraint/` |
| l'écran de révocation | `KnownAboutYouCard.tsx` · `StudentKnownPage.tsx` · `api/retainedItems.ts` |

## 3.5 Les lots

| # | lot | change une assiette ? | coût |
|---|---|---|---|
| **M1** | **Le chat redirige au lieu d'écrire** — retirer `conversation` des producteurs, et poser les redirections. ⛔ **Règle de formulation** : ne jamais laisser croire que c'est enregistré. | **oui** — en retire | lot |
| **M2** | **Le centre de notifications** — chaque écriture notifiée, avec **la phrase source citée** et un **Défaire**. ⚠️ Sans la citation, « Défaire » est un pari. Réutilise `KnownAboutYouCard`. | non | lot |
| **M3** | **Les indices** — rapidité, compétence, variété, portions. Un par **personne**. ⚠️ **Bornés** et **visibles**. ⟳ `portion.adjust` en est déjà un : il lui manque d'être **cumulé** au lieu d'être appliqué une fois. | **oui** — converge au lieu d'osciller | lot |
| **M4** | **Le mémo** — cinq lignes, **visible**, trois conditions d'entrée. ⛔ Un mémo caché sans plafond est le magasin qu'on supprime, avec un autre chapeau. | **oui** | petit |
| **M5** | **L'IA propose un CHAMP** — le classement d'un brouillon et d'un bilan écrit dans les champs existants, plus dans un magasin à part. | **oui** | lot |
| **M6** | **La question vaut révocation** — retrouver une règle depuis une question du chat, dire d'où elle vient, proposer de la lever **dans le tour**. | **oui** | lot |
| **M7** | ⛔ **Un compteur sur le repli de sécurité** — combien de fois une phrase qui ressemblait à de la sécurité a fini classée en préférence. Sans lui, on ne saura jamais si l'outil est appelé de façon fiable, et **le dépôt a déjà payé ce prix une fois sur cette table**. | non | petit |
| **M8** | ⚠️ **Faire répondre la question de session** — `cooking_session_states` est à **0**. C'est le seul retour qui **détruit** des repas ; sans lui le plan annonce des plats jamais cuisinés. | **oui** | lot |

⚠️ **M8 n'appartient pas vraiment à ce document** — c'est un retour, pas de la
mémoire. Il est ici parce que la mesure l'a trouvé, et parce que c'est le plus
grave des huit.

## 3.6 Les questions encore ouvertes

1. ~~Le geste de sécurité~~ — **tranché le 2026-08-21** *(§2.8)* : le chat
   n'écrit jamais, et un bouton de **navigation** remplace le lien.
2. **Combien d'indices**, et lesquels ? Quatre est une proposition, pas une mesure.
3. **La dérive d'un indice** : un cran par retour, ou pondéré par la force de la
   réponse *(« trop long » vs « vraiment trop long »)* ?
4. **Le cas de la personne qui ne suit jamais la redirection** — le seul endroit
   où ce design recule *(§2.10)*. À mesurer avant de conclure.
5. **Les titres de plats** du bilan (`never_again`, `make_again`) restent
   ambigus : « dhal de lentilles rouges » refusé, c'est les lentilles, le curry,
   la texture, ou juste ce soir-là ?
