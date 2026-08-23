# Éprouver la génération de plan — rapport

**Nuit du 18 au 19 août 2026** · branche `ff-001-quotidien-du-coach`
14 agents, 5 étapes, 24 livrables. Ce document est le seul qu'il faut lire en entier.

---

## 1. En une page

Le chantier devait répondre à cinq questions dans l'ordre. Il a répondu aux trois
premières, en a fait naître une sixième que personne n'avait posée, et a buté sur
une panne de crédit pour les deux dernières.

**Ce qui compte le plus, s'il ne faut retenir qu'une chose :** un enfant de 7 ans
et un adulte de 79 kg recevaient **exactement la même assiette**. Ce n'était ni un
oubli de saisie ni un défaut de modèle — la donnée était en base, le moteur savait
la lire, et une garde de sécurité mal branchée fermait le calcul sur précisément
les bouches qui en avaient le plus besoin. C'est corrigé, mesuré, et la part suit
maintenant le corps à 1 % près.

**Le motif qui revient, six fois en vingt-quatre heures :** *une chose collectée,
écrite, documentée, testée — et débranchée.* Un champ sans lecteur. Une liste
d'exceptions sans lecteur, dont le commentaire nommait pourtant le run réel qui
l'avait motivée. Une lane sans appelant. Une ceinture de régime sans appelant. Un
compteur qui nomme la mauvaise cause. Une ceinture qui annonce un contrôle réussi
sans avoir rien contrôlé. À chaque fois, **le vert ressemble exactement à la
preuve**.

**Et le chantier a été rattrapé par son propre sujet, trois fois** : un prompt
archivé qui était un brouillon périmé, un `grep` tronqué par un `head -20` qui a
fait conclure une absence, et trois de mes propres requêtes SQL qui ont rendu un
sous-ensemble plus ancien, cohérent et faux. **Personne n'est au-dessus de ce
défaut, pas même l'outil qui le cherche.**

---

## 2. Ce qui a été livré

### ⓪ Rendre le prompt observable — la porte d'entrée

Avant ce chantier, on ne pouvait pas relire ce qui était envoyé au modèle :
`llm_raw_response_events` archivait la **réponse** et rien du prompt. Les lots
précédents en étaient réduits à *reconstituer* le prompt en rejouant les modules —
ce qui prouve ce que les modules produisent, jamais ce qui est envoyé.

Désormais le prompt système et le message utilisateur sont archivés à côté de la
réponse, avec leur longueur d'avant bornage — donc « bloc absent » et « bloc
coupé » se distinguent. Un script de vidage produit les trois fichiers d'un run.

**Deux acquis inattendus :**

- **Une fuite `anon` fermée.** La table portait déjà du texte d'élève, et le rôle
  `anon` y avait `DELETE, INSERT, SELECT, TRUNCATE, UPDATE` — les privilèges par
  défaut de Supabase, jamais révoqués. `TRUNCATE` échappe à la RLS. Vérifié après
  correction : `anon` et `public` n'ont plus rien, `authenticated` a `SELECT` seul.
- **La capture précède l'appel HTTP.** Un run qui échoue en 429 archive quand même
  son prompt entier. C'est ce qui a permis de continuer à travailler pendant deux
  pannes de crédit.

**Vérifié adversarialement** par un second agent, avec un vrai serveur HTTP local
qui enregistre les octets lus sur la socket : le repli de modèle **ne réécrit pas**
le prompt (empreintes SHA-256 identiques entre l'appel qui expire et celui qui
produit, y compris d'un fournisseur à l'autre). L'instrument est fiable.

**Une réserve, mesurée :** le mode JSON réécrit le prompt **après** la capture
quand le mot « json » manque. Écart nul sur les lanes de génération aujourd'hui,
mais **rien ne le garde**. `dispatcher-v2-llm` diverge déjà de 25 caractères.

### ① Les saisies arrivent-elles au modèle ?

Checklists construites depuis le code puis cochées sur des prompts réels :
**51 lignes en solo, 46 au foyer**. Un vérificateur les a rejouées avec ses propres
valeurs et a infirmé plusieurs conclusions — c'est ce qui a évité trois erreurs.

Défauts trouvés et corrigés en cours d'étape :

| Défaut | Ce qu'il coûtait |
|---|---|
| 3 directions sur 6 impossibles à enregistrer | l'écran proposait 6 objectifs, la base en acceptait 3 ; cliquer les trois autres déréférençait `undefined` |
| Moyens de cuisson jamais injectés | un élève **sans four** recevait « roast potatoes » |
| Le prénom du maître de foyer perdu | « Sacha » tapé, `Student` servi au modèle **six fois** |
| `mode='outside'` inécrivable | trois branches sur quatre rendaient « We could not read that answer » |
| La fenêtre du plan inéditable au clavier | vider le champ de date une fraction de seconde faisait tomber toute la page |

### ② La pondération, en solo

**La hiérarchie n'était écrite nulle part.** Sur les 14 382 caractères du prompt
système, `grep -c -i allerg` rend **0** : le prompt ne nomme jamais une allergie,
et sa seule phrase parlant de « limites dures » désigne **le coach**. Aucune
formule de priorité nulle part. L'envie de la semaine était servie trois lignes
avant la fin — la place que le modèle lit comme la plus contraignante.

Le modèle tranchait pourtant juste **8 fois sur 8**. Il devinait bien ; rien ne le
garantissait.

⚠️ **Le vérificateur a montré que ce 8/8 ne prouve rien** : le bloc de doctrine est
byte-identique dans les cinq scénarios et **ne nomme aucun aliment**. La collision
coach ↔ sécurité — celle pour laquelle le correctif est écrit — était **impossible
par construction**. Le correctif est *non prouvé*, pas infirmé.

**Et un défaut qui inverse l'intuition :** quand le modèle refuse correctement un
allergène et l'explique, le plan meurt en `422`. Le verrou mordait **sur la phrase
de refus**, jamais sur un ingrédient — et trois phrases du prompt ordonnaient ce
geste. *Plus le modèle obéissait, plus sûrement son plan mourait.*

### ③ Plusieurs bouches, et les trois modes

**Il n'y a pas trois modes, il y en a deux.** Huit vidages, **deux empreintes
seulement** : `one_session` et `separate_sessions` envoient un prompt
**byte-identique**. La cause est arithmétique — la composition ne calcule jamais
que `one_dish` ou `one_session`, donc le troisième mode est toujours refusé comme
« au-delà du calcul ». Le barreau ③ est inatteignable hors fusion.

Et le mode « très personnalisé » déclenche une phrase de plan **fausse** :
*« Nobody at this table needs one this week: there is a single cook »* — servie à
un foyer où **trois bouches sur quatre divergent**.

**Le tableau par bouche — et il fallait le lire par personne, jamais en moyenne :**

| bouche | `one_dish` | `one_session` | `separate_sessions` |
|---|---|---|---|
| Aurèle (maître) | pas de plat propre | **2 plats** | **2 · 2** |
| Marceline | — | 1 puis **0** | **0 · 0** |
| Solveig | — | 1 puis **0** | **0 · 0** |
| Théodule (végane, 9 a.) | plat commun végane ✅ | ⛔ **bœuf 207 g + poulet 248 g** | ⛔ **poulet 165 g** |

`{demandé: 6, déclaré: 2, attribué: 2}`, **cinq fois de suite**. Six plats promis,
deux livrés, **toujours à la même personne**. Plus on demande « personnalisé »,
moins les autres reçoivent.

**Ce qui tient :** le nommage (24/24, la cicatrice `F5` est fermée) et surtout
**l'allergie** — toute la casserole est protégée, attribution vivante, zéro
aliment de la famille sur huit plans. Le correctif de la nuit a fait son travail.

**Ce qui ne tient pas :** le dégoût est imposé à **toute la table**, et aucun
compteur ne distingue « retiré de sa part » de « retiré de la casserole ».

**Et le défaut le plus grave du chantier :** `scanDietaryRegime` n'a **aucun
appelant** sur la lane foyer. La seule lane où plusieurs régimes se rencontrent
autour d'une casserole n'a pas de ceinture de régime. Résultat mesuré, dans la
phrase lue à voix haute au dîner :

```
Theodule (végane, 9 ans) — Rich Smoky Beef Stew 207 g · Smoky Roast Chicken 248 g
```

⚠️ **Nuance qui compte, et je m'étais d'abord trompé :** `attachSizedQuantities`
filtre bien par appartenance à la boîte. L'enfant **est** réellement affecté à la
boîte du bœuf — l'erreur préexistait. Notre correctif de la nuit ne l'a pas créée,
il l'a **rendue visible** : ce qui n'était qu'une donnée fausse silencieuse est
devenu une **instruction explicite**. C'est ce qui rend la correction urgente.

📌 Le défaut n'apparaît **pas** en `one_dish`, où le plat commun est végane. Il
naît quand le modèle **dédouble** les préparations : plus on personnalise, plus
l'enfant est mal servi.

### ③ vérifiée — deux affirmations tombent, une injustice apparaît

Le vérificateur n'a lancé **aucun run** : tout est établi sur les archives, la
base, et le code exécuté directement.

**Confirmé et non périmé :** les trois modes ne font que deux consignes (deuxième
preuve indépendante, sur des runs *postérieurs* aux correctifs) ; l'allergie
protège toute la casserole sur 11 plans ; la phrase fausse « there is a single
cook » n'a **aucune prémisse** dans l'entrée ; le budget de plats reste ouvert
(7 jours × 3 divergents ⇒ 56 demandés, 28 au budget).

**Infirmé :**
- `dish_owners` **a un quatrième nombre, escamoté** : `refused: 0`. La perte
  n'est donc pas à l'attribution mais **au plafond, en amont** — le modèle avait
  bien déclaré 6 plats. Et un sixième plan, exclu du dénominateur, dit `{6,0,3,3}` :
  Marceline et Solveig **ont eu** leur plat. « Systématique » vaut 3 fois sur 4.
- Le dégoût : résultat vrai, mais l'inférence est faible (n=2, P ≈ 0,11) et le
  modèle avait en fait composé **deux plats dédiés** justifiés « avoids sweet
  potato » — jetés ensuite par le plafond. **Le plan paraît propre par accident.**
- ⛔ **Ma propre affirmation était fausse.** J'avais écrit que le facteur
  rapportait chaque bouche à la *moyenne de la table* et ne rendait donc pas les
  écarts justes. Diviser par une constante **conserve les rapports** : la chaîne
  du corps donne 1,000 / 0,902 / 0,840 / 0,714, soit 40 % d'amplitude. Elle suit
  bien le corps.

**Les deux écarts qui semblaient suspects se défendent**, une fois décomposés :
18 kg d'écart pour 0,3 % de part, c'est un homme sédentaire **qui maigrit**
(2273 kcal) contre une femme debout toute la journée **à l'entretien**
(2279 kcal). Et l'enfant est à 71 % de l'*entretien* d'Aurèle, pas à 85 % — les
85 % le comparaient à un adulte au régime.

**🔴 Mais un troisième écart, lui, ne se défend pas.** La même déclaration
`muscle_gain` est lue par deux sous-systèmes qui répondent l'inverse :

| Sous-système | Ce qu'il lit | Sa réponse |
|---|---|---|
| `servingConflicts` — « a-t-elle besoin de son plat ? » | la **direction** seule | oui, elle diverge |
| `mouthTargetFactor` — « combien lui sert-on ? » | exige un **rythme** | sans lui : facteur **1,000**, motif `no_pace` |

**Assez de direction pour coûter un plat, pas assez pour peser un gramme.** Ce
n'est ni un champ sans écrivain ni un défaut muet — c'est une asymétrie de modèle
produit, et le chemin par défaut y mène seul, puisque la RPC d'ajout d'un membre
prend un objectif et **pas** de rythme.

### ⑤ La qualité d'un plan de foyer — **non** aux deux casquettes

⚠️ **Réserve en tête, pas en note de bas de page :** `gemini-3-flash-preview` sur
**100 %** des runs, le modèle nominal étant à sec. Tout jugement sur ce que le
modèle *écrit* — monotonie, choix d'aliments, prose — ne vaut pas pour la
production. Ce qui tient quel que soit le fournisseur : le prompt et son plafond,
le dimensionnement, le recollage des grammes, les ceintures — tous mesurés sur
les octets.

**Le diététicien refuse de signer :**
- **Celui qui s'entraîne est celui qui mange le moins.** Ivar (88 kg,
  `trains_hard`) obtient **1 plat propre sur 8 demandés** ; la maîtresse du foyer
  en obtient **15 sur 16**. Deux runs sur quatre lui servent **moins de 10 g de
  protéine** par repas maison — pendant que 750 à 900 g de poulet sont achetés,
  cuits et pesés **à son nom**.
- **Rien ne borne la variance** : à octets identiques, la protéine d'une même
  bouche va de 16 g à 75 g sur deux jours.
- **Monotonie** : 14 couples (run, bouche) sur 16 ne mangent qu'une seule
  combinaison — dans un foyer qui a coché « varié ».

**L'utilisateur lambda non plus :** la phrase lue à table promet des plats que le
plan ne sert pas (3 runs sur 4) ; les 50 minutes annoncées supposent trois feux
qu'il a écrit ne pas avoir ; et la seule explication de la divergence servie à
table est celle qui **sort la liste médicale d'une adulte devant l'enfant**.

**🔴 Un trou dans notre propre correctif des portions.** Quand le modèle met
plusieurs bouches dans une même boîte, le moteur **refuse de la couper** (choix
écrit) — donc le facteur ne s'applique pas. Mesuré et vérifié par moi :

```
Roxane, adulte 61 kg → Steamed Herbed Quinoa 102 g
Zoe,    7 ans, 23 kg → Steamed Herbed Quinoa 130 g
Lubna                → Steamed Herbed Quinoa 130 g   ← mêmes grammes = boîte non coupée
```

**L'enfant reçoit plus que l'adulte**, et **100 % de ce qu'elle mange sort de
boîtes non dimensionnées**. La part suit le corps *quand la boîte est propre à une
bouche* ; sinon elle ne suit rien.

**Deux autres défauts systématiques :**
- **`attachSizedQuantities` ne consulte jamais `dishes[]`** : un plat jeté par le
  plafond laisse sa boîte derrière lui, et le gramme reste dans la phrase. C'est
  le **jumeau** de la brèche du régime, pris par l'autre bout — la phrase de table
  est décidément la surface que rien ne garde.
- **La croyance `goal_scope` du coach n'atteint jamais le prompt** : la doctrine
  est compilée sur l'objectif du **titulaire du compte**, pas sur celui de la
  bouche.

**Les trois correctifs de la nuit tiennent, sans régression** : facteur identique
à trois décimales sur 5 plans, contrainte attachée 4/4 avec 0 gluten servi,
ceinture de régime armée partout (`refused: 0` — elle n'a pas eu à mordre).

### ⑤ vérifiée — le verdict tient, deux de ses raisons tombent

Le vérificateur a écrit son propre jugement **avant** de lire celui de 5A, sans
lancer un seul run. Il conclut **non** aux deux casquettes, comme lui, mais avec
des chiffres plus durs : Ivar plafonne à **0,31 g de protéine par kg et par jour**
dans son meilleur run et n'a **aucune part allouée dans 3 runs sur 5** ; Lubna
tombe à 0,06. **La seule bouche correctement servie est l'enfant.**

**Il retire deux des raisons de 5A, et c'est ce qui renforce le verdict :**
- **La monotonie ne compte pas** : fenêtre de 2 jours, **un seul jour de cuisson**
  dedans, et le prompt réclame lui-même le batch. Manger quatre fois le même lot
  est la consigne **exécutée**, pas un défaut.
- **« La croyance du coach n'atteint jamais le prompt » est mal dit** : le champ
  est bien vivant (84 occurrences, filtre en place). ⚠️ Le vérificateur s'est
  d'abord trompé en tronquant son `grep` par un `head -20` sur 84 lignes — *le
  sous-ensemble plausible et faux, en version grep.* **La conséquence, elle,
  tient** : la doctrine est compilée sur l'objectif du **titulaire du compte**,
  donc la croyance du coach sur la prise de masse est absente des **6 prompts sur
  6** alors que l'athlète est à table. C'est une décision produit, pas un
  branchement mort.

**La fraction hors boîtes dimensionnées — le chiffre qui manquait :**

| | |
|---|---|
| en grammes servis | **33,8 %** (5 040 / 14 919) |
| en **boîtes** | 6,7 % — *le dénominateur qui ment* |
| réparti | **bimodal** : 0 % sur trois plans, **63 %** et **74 %** sur deux |
| pour l'enfant et la végane, dans les runs touchés | **100 %** |
| pour la titulaire du compte | 0 à 22 % |

Autrement dit : le correctif des portions tient **entièrement** sur trois plans et
**pas du tout** sur deux — et quand il lâche, il lâche exactement sur les deux
bouches qu'il visait.

**Là où les deux agents divergent, et c'est instructif :** 5A crédite Ivar d'une
part du pot commun sans boîte à son nom (40/16/75/19 g) ; le vérificateur ne
compte que l'**alloué** (47/0/0/0). Le run à 75 g de 5A **masque** que le défaut
est présent 3 runs sur 4. Je ne tranche pas : les deux comptes disent une chose
vraie et différente.

**Deux auto-corrections du vérificateur**, qui changent une conclusion :
sa première sonde rendait `clean` sur tout parce qu'elle passait la contrainte en
`snake_case`. Rejouée correctement, **le verrou est armé et mord** sur une mention
nue, et tolère la forme niée par décision documentée. **Le trou de la
confidentialité n'est donc pas une ceinture désarmée** : c'est qu'elle repose sur
**une seule ligne de prompt**, et que le modèle désobéit **5 fois sur 5**.

**Un défaut neuf, vérifié par moi :** en plan-4, **trois** justifications de plat
attribuent l'évitement du gluten à **Roxane**, qui n'a aucune allergie — c'est
Lubna qui l'a. Le prompt attribue pourtant correctement. Le correctif de la nuit a
réparé l'entrée et les boîtes ; **la prose du modèle continue de se tromper de
personne.** Inoffensif ici, mais c'est la même faiblesse qui, en version
dangereuse, mettait l'allergène dans la boîte de l'allergique.

**Aucune régression sur les trois correctifs**, contrôlée sur les compteurs en
base par les deux agents indépendamment.

---

## 3. Les corrections livrées cette nuit

### La part suit enfin le corps

Deux gardes jetaient le corps collecté. `householdBodyFacts` sortait à la première
ligne pour tout mineur ; et `memberTargetFactor` fermait sur
`member.body?.restrictionFlag ?? true` — le corps du **compte**, `null` pour toute
bouche sans compte, donc plancher levé avant tout calcul. **La porte du moteur se
fermait sur exactement la population que le prompt ne voyait pas.**

Le compteur aggravait le tout : il nommait la **première porte fermée**, donc il
rapportait « plancher alimentaire » pour des bouches qui n'avaient qu'un compte
manquant.

**Mesuré après correction**, mêmes entrées, même foyer :

| | poulet | riz | légumes |
|---|---|---|---|
| Odalric, 79 kg | 200 g | 341 | 273 |
| Casimir, 16 a / 70 kg | 198 g | 339 | 271 |
| Wilfrid, 7 a / 23 kg | 108 g | 184 | 147 |
| Peregrine, 47 kg | 98 g | 167 | 134 |

Rapport servi Casimir/Peregrine : **2,02**. Rapport de leurs corps : **2,03**.

⚠️ Ce lot a demandé **trois passes**, et chaque reprise venait d'un critère de
sortie trop étroit d'un cran — d'abord la boîte, puis la phrase lue à table, puis
la **cohérence interne** de la phrase : le modèle écrivait « a larger share » à
l'adulte de 47 kg qui recevait la plus petite part. **25 phrases sur 32 portaient
un mot de taille ; il en reste 0 sur 8.**

### L'allergie retrouve sa bouche

Les contraintes dures arrivaient **détachées** de la personne, sous un en-tête au
singulier pour une tablée. Le contraste était dans le même prompt : les dégoûts,
eux, s'écrivaient `- Peregrine: never serve fennel` et étaient respectés 4 fois
sur 4.

Mesuré **avant** : 4 runs sur 5 en `422 empty_meal`, et sur l'un d'eux
`pistachio butter` en titre, en méthode, dans trois plats **et dans la liste de
courses** — l'allergène était cuisiné et acheté.

Mesuré **après** : 4 runs, 4 × HTTP 200, plan écrit, **0 morsure** au rejeu champ
par champ, et l'avertissement sur **la bonne assiette**.

Le bloc nomme désormais chaque bouche, et un paragraphe indissociable du prénom
empêche l'effet pervers : nommer la personne, sans lui, *autoriserait* le « je le
sers seulement à l'autre ». Une seule bouche rend le bloc d'avant octet pour
octet.

**Deux causes de `422` ont été séparées sur les octets** — et on les confondait :

| | Ce qui mord | Le vrai défaut |
|---|---|---|
| **A** | l'aliment est dans le plan (ingrédients, courses) | l'attribution |
| **B** | la **phrase** qui explique le retrait, toujours dans `dishes[].why` | la consigne, qui ordonnait de nommer l'allergène |

⚠️ Le verrou n'a **pas** été desserré : un run réel sous le nouveau prompt produit
toujours `422 blocked_medical_constraint` quand le modèle nomme un jeton médical,
et la mutation qui désarme la ceinture fait tomber 4 tests.

📌 Geste de jugement notable : l'agent avait écrit sa propre version de la règle
anti-refus, puis l'a **retirée** en voyant un run où le modèle recopiait mot pour
mot l'échappatoire du lot voisin. Deux formulations de la même règle à dix lignes
d'écart sont un générateur de divergence.

### 🔴 Le catalogue d'allergènes est incomplet

Découvert en vérifiant la réserve du lot précédent. `allergen_catalog.ts` ne porte
que **13 jetons** : alcohol, dairy, egg, fish, gluten, mollusc, peanut, pork,
sesame, shellfish, soy, tree_nut, wheat.

Il manque au moins **céleri, moutarde, lupin, sulfites** — quatre des quatorze
allergènes majeurs réglementaires. Une allergie non catalogée reste du **texte
libre apparié littéralement** : la contrainte dit `celeriac`, le plan écrit
`celery`, et la ceinture ne bronche pas. Mesuré sur un run réel.

⛔ La correction n'est **pas** un appariement plus malin — la règle du dépôt
interdit tout matcher maison. Elle passe par l'extension de la liste fermée et de
ses formes de surface, ce qui touche les écrans, les lignes déjà en base et la
ceinture. **C'est un lot à part, et il est signalé comme tel.**

### Trois correctifs sans crédit

- **Une ceinture qui annonçait un contrôle réussi.** Faute d'avoir pu lire les
  contraintes, le verrou rendait `clean` — pas « désarmé », *propre*. Troisième
  verdict ajouté aux deux portes qui mentaient, sans rien desserrer ni durcir.
- **Le compteur de régime accusait des sorties justes.** La cause : `isPlantAnalogue`
  — liste fermée, écrite à la main, testée, dont le commentaire nomme le run réel
  qui l'a motivée — **n'avait aucun lecteur en production**. 18 faux positifs → 3.
- **L'instrument de référence portait trois `undefined`.** Le typage ne l'a pas
  attrapé pour trois raisons cumulées, dont la plus instructive : `deno check`
  était **déjà rouge** sur ce fichier. Un fichier qu'on ne peut pas vérifier est un
  fichier que personne ne vérifie.

### Le retrait de `generate-week-plan-v1`

Lane sans aucun appelant vivant, **245 des 246 plans sur des comptes de test**,
zéro utilisateur réel. Retirée avec ses enveloppes mortes, ses tests propres, et
les documents d'autorité mis à jour.

L'agent a trouvé **quatre affirmations de vente** que le dossier n'avait pas
listées, dont une garantie — « une semaine qui viserait un enfant est refusée là
où elle se fabrique » — dont le refus vivait **uniquement** dans la lane
supprimée. Elle a été remplacée par la porte qui existe réellement, pas par une
promesse neuve.

⛔ **La table `student_week_plans` n'a pas été touchée** : c'est le seul geste
irréversible de la liste. Migration écrite et prête, non appliquée.

---

## 4. Ce qui t'attend — les arbitrages

Aucun n'est un bug à corriger : ce sont des choix de produit, ou des lots à part
entière. Classés par ce qu'ils coûtent à quelqu'un.

### Ce qui touche la sécurité

1. **🔴 Le catalogue d'allergènes est amputé.** 13 jetons, et il manque **céleri,
   moutarde, lupin, sulfites** — quatre des quatorze allergènes majeurs
   réglementaires. Une allergie non catalogée reste du texte libre apparié
   littéralement : la contrainte dit `celeriac`, le plan écrit `celery`, la
   ceinture ne bronche pas. *Une tâche séparée est déjà posée.*
2. **🔴 La phrase lue à table n'est gardée par aucun verrou.** `applyKeelOutputLocks`
   ne reçoit que les plats et les courses — **0 titre de préparation, 0
   `portion_note`**. Sur un plan réel, un contact croisé déclaré (« l'autre moitié
   du plateau à poulet ») vit dans une surface que rien ne lit. ⚠️ L'étendre
   demande de **porter explicitement la tolérance des négations**, sinon « Ensure
   no sesame is present » ferait mourir la semaine.
3. **Faut-il bloquer un texte non vérifié ?** Les deux moitiés du double verrou
   tombent par le même `catch` muet. Trois options posées, aucune implémentée.
4. **Le régime et la contrainte médicale sortent en clair devant la table**
   (5 plans sur 5), et un commentaire d'écran promet une garantie que le
   nettoyage n'arme pas — il ne filtre qu'un vocabulaire de **corps**.

### Ce qui touche l'équité entre les bouches

5. **🔴 « Assez de direction pour coûter un plat, pas assez pour peser un
   gramme. »** La même déclaration `muscle_gain` ouvre un plat dédié (lu sur la
   direction seule) mais ne change aucun gramme (le facteur exige un rythme).
   Le chemin par défaut y mène seul : la RPC d'ajout d'un membre prend un
   objectif et **pas** de rythme.
6. **🔴 Les boîtes partagées ne sont pas dimensionnées** — le moteur refuse de les
   couper. Conséquence mesurée : un enfant de 23 kg reçoit **130 g** de quinoa
   quand une adulte de 61 kg en reçoit **102**, et l'enfant mange **entièrement**
   de ces boîtes-là.
7. **Le budget de plats promet 8 et n'en ouvre que 4** — toujours au détriment des
   deux mêmes personnes. Le prompt se contredit à 130 lignes d'écart.
8. **La porte doctrine ferme le dimensionnement par le corps.** Une doctrine « on
   ne compte pas », ou illisible, referme aussi le calcul : l'enfant retrouve la
   boîte de l'adulte. Conservateur, compté, non tranché.
9. **La croyance `goal_scope` du coach n'atteint jamais le prompt** : la doctrine
   est compilée sur l'objectif du **titulaire du compte**, pas sur celui de la
   bouche.

15. **La confidentialité du régime à table ne tient qu'à une ligne de prompt** —
    et le modèle désobéit **5 fois sur 5**. Le verrou, lui, est bien armé.
16. **La prose du modèle se trompe encore de personne** : trois justifications
    attribuent l'évitement du gluten à quelqu'un qui n'a pas l'allergie, alors que
    le prompt attribue correctement. Inoffensif ici — dangereux dans sa version
    précédente.
17. **Le plafond de plats évince toujours la même personne** : l'éviction est
    **déterministe** et tombe sur la 3ᵉ assiette d'une case, c'est-à-dire toujours
    sur le 3ᵉ mangeur.

### Ce qui touche le produit

10. **Le textarea d'envie**, visible côté foyer et jamais transmis — sa
    justification écrite dans le code est fausse.
11. **La table `student_week_plans`** : la garder, ou lancer la migration prête.
12. **La ligne de vente retirée** : la promesse mérite-t-elle d'être *tenue*
    plutôt que réécrite ?
13. **Le rythme, le poids visé, les séances d'activité** : collectés, sans lecteur.
14. **Le résidu du compteur de régime** : homonymes et marqueurs végétaux dans un
    titre. La correction honnête demande un groupe alimentaire déclaré par le
    modèle.

## 5. Ce qui est bloqué, et pourquoi

**Le compte OpenAI est à sec** (`credit_balance_exhausted`). Vérifié hors
application, deux fois.

Fait structurel découvert au passage : **la lane solo ne peut replier chez aucun
autre fournisseur** — sa chaîne est `gpt-5.6-sol → gpt-5.4-mini → gpt-5.4-nano`,
trois OpenAI. La lane foyer, elle, replie sur Gemini et a continué de tourner
toute la nuit.

Conséquence : l'étape ④ (qualité d'un plan solo) est **suspendue**. Les étapes ③
et ⑤ ont tourné sur le modèle de repli, et chaque jugement porte cette réserve
écrite.

---

## 5bis. Ce qui reste à faire, et qui est prêt

| | |
|---|---|
| **④ Qualité d'un plan solo** | non lancée — la lane solo n'a **aucun repli** hors OpenAI |
| **Garde du mode JSON** | non armée — demande un redémarrage du runtime, qu'une session voisine utilisait |
| **Fenêtre du plan au navigateur** | corrigée et prouvée par tests + typage, **jamais exercée dans une page** |
| **Migration `student_week_plans`** | écrite, non appliquée, avec un filet `raise exception` si un compte non-test apparaît |
| **Une semaine complète au foyer** | non mesurable sur le repli (expirations à 60 s) — la cohérence sur 7 jours et le petit-déjeuner restent inconnus |

## 6. Les leçons de méthode

1. **Un critère de sortie trop étroit fabrique un correctif à moitié posé qui
   ressemble à un correctif complet.** Trois passes sur le même lot, trois fois de
   ma faute.
2. **Un résultat vert ne prouve rien si la collision qu'il devait tester était
   impossible par construction.**
3. **Un vidage vide n'est pas une preuve d'absence** — l'instrument a été mort
   pendant une fenêtre, refusant 52 écritures sans un signal.
4. **Le piège des `_shared` périmés a mordu à l'intérieur du chantier qui l'avait
   écrit en tête de son propre briefing** : un prompt archivé était un brouillon,
   72 caractères plus court que celui réellement envoyé.
5. **Une garde qu'on n'a pas vue tomber n'est pas une garde.** 30+ mutations sur la
   nuit ; une a survécu, et la branche inutile a été supprimée plutôt que couverte
   par un test fabriqué.

---

## 7. Réserves honnêtes

- ⚠️ **TROIS fois dans la nuit, une de mes requêtes SQL a rendu un sous-ensemble
  plus ancien que la réalité** — sur deux tables différentes, sans cause que j'aie
  pu isoler. Les deux fois, le résultat faux était **cohérent et plausible** :
  c'est précisément la forme de défaut que ce chantier traque, et elle a visé mes
  propres vérifications. Toutes les conclusions concernées ont été re-mesurées
  autrement. **Règle adoptée depuis :** jamais un filtre de temps seul, toujours
  une contre-épreuve `count(*) + max(created_at)` sur le même prédicat.
  **Deux explications rassurantes ont été ÉLIMINÉES par test** : ce ne sont pas
  des lignes manquantes (la trace n'a aucun trou — 807 lignes à 23 h, 689 à 00 h,
  339 à 01 h, 251 à 02 h), et ce n'est pas un index périmé (`ORDER BY` avec et
  sans parcours d'index rendent le même résultat quand on les compare). Le défaut
  ne se reproduit pas à la demande et **reste inexpliqué**.
  Recommandation pour la suite : traiter toute lecture de base comme une mesure à
  corroborer par une seconde requête de forme différente, jamais comme une source
  d'autorité. C'est la conclusion la plus inconfortable de la nuit, parce qu'elle
  porte sur l'outil avec lequel tout le reste a été vérifié.
- Un `git rm --cached` a brièvement indexé une suppression dans un index partagé
  par d'autres sessions, annulé aussitôt.
- La fenêtre du plan corrigée est prouvée par tests et typage, **pas exercée dans
  un navigateur** — le panneau était occupé par des agents toute la nuit.
