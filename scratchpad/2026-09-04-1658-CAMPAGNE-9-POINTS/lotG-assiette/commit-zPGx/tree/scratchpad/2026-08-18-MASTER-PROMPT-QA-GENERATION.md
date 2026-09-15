# MASTER PROMPT — Éprouver la génération de plan, de bout en bout

**Date** 2026-08-18 · **Branche** `ff-001-quotidien-du-coach`
**Demande de l'utilisateur** : tester « de long en large » toute la partie génération
de plan, en cinq étapes ordonnées, avec un agent d'implémentation **et** un agent
de vérification à chaque étape.

---

## 0. L'ordre, et pourquoi il n'est pas négociable

```
① les informations ARRIVENT-elles au modèle ?          ← sans ça, tout le reste ment
        ↓
② sont-elles DITES dans le bon ordre, avec la bonne force ?   (solo)
        ↓
③ et quand il y a PLUSIEURS bouches ?                          (foyer × 3 modes)
        ↓
④ le plan produit est-il BON ?                                 (solo)
        ↓
⑤ le plan produit est-il bon POUR TOUT LE MONDE ?              (foyer)
```

**On ne juge jamais la qualité d'un plan tant qu'on n'a pas prouvé que les
informations atteignent le modèle.** Un plan médiocre parce qu'un champ n'est
jamais injecté se corrige au branchement, pas au prompt — et ce chantier a déjà
mesuré trois fois ce piège : un champ collecté sans lecteur ressemble
**exactement** à un champ que le modèle ignore.

---

## ⛔ ÉTAPE ZÉRO — RENDRE LE PROMPT OBSERVABLE

**Mesuré le 2026-08-18, et ça bloque l'étape ① telle qu'elle est demandée :**

> `llm_raw_response_events` archive la **réponse** (`output_text`, `raw_response`)
> et **rien du prompt** — ni le système, ni le message utilisateur. Colonnes
> vérifiées : aucune ne porte le prompt envoyé.

Un lot précédent l'avait déjà noté : *« le message utilisateur envoyé au modèle
n'est archivé nulle part ; la preuve du bloc est un écart de `prompt_chars`, pas
une relecture du texte »*. Un autre a dû **reconstituer** le prompt en rejouant
les modules purs sur les entrées réelles — ce qui prouve ce que les modules
**produisent**, jamais ce qui est **envoyé**.

**Le premier agent du chantier a donc une seule mission** : rendre le prompt réel
lisible après coup.

- Forme préférée : un **archivage du prompt** (système **et** message utilisateur)
  à côté de la réponse, activable et **borné** (ces textes font plusieurs dizaines
  de milliers de caractères).
- ⚠️ **Contrainte de sécurité** : le prompt contient des faits corporels et des
  allergies. S'il est archivé, il l'est **sous le même régime que le reste** — pas
  de nouvelle porte de lecture, pas de chiffre corporel exposé à un rôle qui ne
  l'a pas déjà. Le patron `revoke … from public, anon` est obligatoire (deux fuites
  `anon` mesurées aujourd'hui).
- Si l'archivage complet est jugé trop lourd, la **solution de repli acceptable**
  est un mode de capture **explicite** (drapeau de requête ou variable
  d'environnement) qui écrit le prompt dans un fichier du dossier de QA — jamais
  un défaut silencieux en production.

**Tant que cette étape n'est pas verte, les étapes ① à ⑤ ne démarrent pas** :
elles mesureraient toutes une reconstitution, pas la réalité.

---

## 1. Les règles transverses — elles valent pour les douze agents

### 1.1 Ce qui est déjà mesuré et qu'on ne redécouvre pas

| Fait | Conséquence pour toi |
|---|---|
| **La lane foyer expire à 4 min** (`gpt-5.6-sol` timeout, retombe sur un modèle plus petit, requête en 546) | N'alourdis jamais le prompt sans nécessité mesurée. Toute latence se lit avec ça en tête. |
| **La promesse et la clé doivent se toucher** | Un champ dont la *promesse* vit dans le message utilisateur et la *clé* dans le prompt système sort à **0 %**. Mesuré deux fois. Rapprochés + le **nombre attendu** + **l'échappatoire nommée** ⇒ 0→11 plats, 0→38 % de notes. |
| **Un compteur à deux nombres ment** | `{asked, attributed}` rend le même zéro pour « jamais déclaré » et « déclaré puis refusé » — ça a fait conclure faux un vérificateur. Toujours **déclaré / valide / refusé**, et **rendu sur l'aperçu** aussi. |
| **Aucun matcher** sur les titres ou les aliments | 12 faux positifs sur 12 mesurés. Tout est déclaré par le modèle et validé contre une **liste fermée**. |
| **Aucune calorie dans le texte d'un plan** | Les grammes d'**aliment** sont voulus ; les kcal et les chiffres de **corps**, jamais. « Vise 700 » est une consigne ; « il te reste 680 » est la phrase d'un tracker. |
| **Le corps d'un mineur ne s'énonce jamais** | On calcule avec, on ne le dit pas — même depuis que l'objectif lui est ouvert. |

### 1.2 Le poste

`supabase migration up` seulement ; ⛔ jamais `db push`, `db reset`,
`functions deploy`, `secrets`, `config push`, `link`.
**Le runtime edge sert des `_shared` périmés** : après toute modification, sonder
`docker logs --tail 40 --timestamps supabase_edge_runtime_Sophia_2` puis, si seuls
des crons tournent, **exactement** `docker restart supabase_edge_runtime_Sophia_2`,
et **prouver la fraîcheur** par la version de prompt sur le plan produit.
`agent-gate` **ne lance pas vitest** — le lancer soi-même. `tsc -b --force` (2 s ;
l'incrémental invente des erreurs). Personas : mdp `1234567`, jamais un compte
sans mot de passe connu, et **dire** si un compte QA partagé est avancé.
Jamais `git add -A`, jamais `git stash` ; fichier partagé ⇒ index privé +
`git apply --cached` + commit + `git reset -- <chemins>`.

### 1.3 L'itération, telle que l'utilisateur la demande

Chaque agent d'implémentation **itère jusqu'à ce que ce soit bon** — il ne rend
pas un constat, il corrige et recommence. Ce qui l'arrête :
- soit son critère de sortie est atteint (défini à chaque étape) ;
- soit il a mesuré que le modèle **n'obéit pas** malgré un prompt bien construit —
  et c'est alors un **résultat**, consigné avec les octets, jamais maquillé.

⚠️ **Chaque itération est numérotée et gardée.** On veut voir la trajectoire, pas
seulement le dernier état : c'est ce qui permet de dire *pourquoi* une formulation
marche mieux qu'une autre.

---

## 2. Les livrables — une arborescence, pas des rapports épars

```
scratchpad/qa-generation/
  00-observabilite/          RAPPORT.md · comment le prompt est capturé
  01-injection/
    solo/    inputs.json · prompt-system.txt · prompt-user.txt · output.json
             CHECKLIST.md          ← la liste des injectables, cochée
             iterations/01..N/     ← ce qui manquait, ce qui a été corrigé
    foyer/   (idem)
    VERIFICATION.md
  02-ponderation-solo/
    scenario-1..5/  inputs.json · prompt-user.txt · output.json
    RAPPORT.md · VERIFICATION.md
  03-foyer-modes/
    one_dish/ one_session/ separate_sessions/   (les 3 modes)
    RAPPORT.md · VERIFICATION.md
  04-qualite-solo/
    plan-1..N/  inputs.json · prompt-user.txt · output.json · CRITIQUE.md
    RAPPORT.md · VERIFICATION.md
  05-qualite-foyer/
    (idem)
```

**Règle** : à chaque run, les **trois** fichiers — les données d'entrée, le prompt
envoyé, la sortie obtenue. Un run dont on n'a pas les trois n'est pas une mesure.

---

## ÉTAPE ① — TOUT CE QUI EST SAISI ARRIVE-T-IL AU MODÈLE ?

**Trois agents : deux en parallèle (solo, foyer), puis un vérificateur.**

### Agents 1A (solo) et 1B (foyer) — en parallèle

**La méthode, dans cet ordre :**

1. **Construire la checklist des injectables** — et elle se construit **depuis le
   code**, pas de mémoire. Tout ce qu'un humain peut remplir : identité, date de
   naissance, corps (taille, poids, sexe), **niveau d'activité**, direction,
   **poids visé**, **rythme**, allergies, régime, dégoûts, habitudes, **apports
   fixes (shaker, avec protéines et calories)**, moments de repas, absences,
   **déjeuner dehors**, budget, temps de cuisine, **moyens de cuisson**,
   propriétés de jour, envie de la semaine, contraintes libres.
   ⚠️ Pour chaque ligne : **où c'est saisi**, **où c'est stocké**, **quel module
   le lit**, **dans quel bloc du prompt il apparaît**. Une ligne sans les quatre
   est un trou, même si le champ existe.
2. **Remplir VRAIMENT tout** sur un compte réel — pas une fixture SQL : par les
   écrans, comme un utilisateur. C'est le seul moyen de trouver un champ que
   l'écran ne sait pas écrire (mesuré aujourd'hui : le shaker était saisi et jeté).
3. **Lancer une génération réelle**, capturer le prompt (étape zéro), et
   **cocher la checklist ligne à ligne** sur le texte réellement envoyé.
4. **Pour chaque ligne absente** : trouver où la chaîne casse (écran ? écriture ?
   lecture ? prompt ?), corriger, **relancer**, re-cocher. Itérer jusqu'à zéro
   manquant, ou jusqu'à un manquant **motivé et écrit**.

**Critère de sortie** : la checklist est entièrement cochée sur un prompt réel, ou
chaque case non cochée porte sa raison et son coût.

**1A** travaille sur un compte **individuel** (une seule bouche).
**1B** sur un **foyer de deux bouches au moins**, aux profils **différents**
(objectifs opposés, une allergie chez l'un, un dégoût chez l'autre) — sinon on ne
verra pas ce qui distingue les personnes.

⚠️ **Périmètres disjoints obligatoires** : 1A ne touche pas `household_*`, 1B ne
touche pas la lane individuelle. Si un correctif est commun, **il appartient à
1A** et 1B l'attend.

### Agent 1V — le vérificateur

Il **rejoue** les deux checklists sur des runs **à lui**, avec d'autres valeurs.
Il cherche spécifiquement :
- une case cochée à tort (le mot apparaît dans le prompt mais **pour une autre
  raison** — un exemple, un libellé générique) ;
- une information présente mais **inexploitable** (mal nommée, sans unité, dans un
  bloc que la consigne n'utilise pas) ;
- une information injectée **deux fois** avec des valeurs différentes.

---

## ÉTAPE ② — LA PONDÉRATION, EN SOLO

**Deux agents : un qui travaille, un qui vérifie.**

### Agent 2A

**La question** : parmi tout ce qui est injecté, **qu'est-ce qui prime ?** Une
allergie n'a pas le même poids qu'un dégoût ; un dégoût n'a pas le même poids
qu'une envie de la semaine ; une contrainte de temps n'a pas le même poids qu'une
préférence de goût. **Le prompt le dit-il, et le dit-il dans le bon ordre ?**

**Ce qu'il éprouve, sur au moins 5 scénarios** dont les entrées varient
intelligemment (tout rempli · minimum vital · contradictions volontaires ·
contraintes fortes de temps ou de budget · beaucoup d'exclusions) :

- **L'ordre** : le dépôt sait déjà qu'un modèle lit **la contrainte la plus proche
  de la fin comme la plus contraignante** (c'est pour ça que les règles de maison
  sont en dernier, et que l'interdit du « pourquoi » est les **trois dernières
  lignes** du brief de portions). L'ordre actuel sert-il la bonne hiérarchie ?
- **La formulation** : une contrainte dure est-elle dite comme une **obligation**,
  une préférence comme une **préférence** ? Un « may » là où il faut un « must »
  coûte 0 % de déclaration — mesuré aujourd'hui.
- **Le silence** : quand une information manque, le prompt **dit-il** qu'elle
  manque, ou laisse-t-il le modèle supposer ? Supposer produit une cible fausse
  avec l'aplomb d'un tableau.
- **La contradiction** : que se passe-t-il si l'envie de la semaine réclame ce
  qu'une allergie interdit ? **La sécurité doit gagner, visiblement.**

**Il itère** : il modifie l'ordre ou la formulation, relance les 5 scénarios,
compare. ⚠️ **Bump de version à chaque changement de prompt**, avec les tests
byte-identiques pour les populations non concernées.

**Critère de sortie** : sur les 5 scénarios, ce qui doit primer prime, et il peut
le **montrer** — pas l'affirmer.

### Agent 2V

Il relit **les données**, pas les conclusions : les 5 jeux d'entrée, les 5 prompts,
les 5 sorties. Il cherche une conclusion qui ne tient pas aux octets, un scénario
trop favorable, une variation d'entrée qui ne varie rien de décisif.

---

## ÉTAPE ③ — PLUSIEURS BOUCHES, ET LES TROIS MODES

**Deux agents. Ne démarre que si ② est verte.**

### Agent 3A

**La question n'est pas la pondération mais la PRISE EN COMPTE** : les informations
de chaque personne atteignent-elles le plan, et le résultat est-il **équilibré**
entre elles ?

**Les trois modes sont dans le code** (`COOKING_SHAPES`,
`_shared/keel/household_portions.ts:524`) :

| Mode | Ce que l'utilisateur appelle | Ce que ça veut dire |
|---|---|---|
| `one_dish` | simple | un plat, des **parts** qui divergent |
| `one_session` | un peu personnalisé | **deux plats**, une seule session au fourneau |
| `separate_sessions` | très personnalisé | **deux sessions** distinctes |

⚠️ **Fait mesuré à connaître** : aujourd'hui ce choix est un **plafond** — il peut
restreindre, il ne **fabrique** jamais un second plat quand personne ne diverge.
Si l'utilisateur attend que « très personnalisé » **ouvre** vraiment une seconde
cuisson, c'est un changement de nature, à nommer et à décider — pas à supposer.

**Ce qu'il éprouve, sur les trois modes** :
- chaque bouche est-elle **nommée** et servie ? (une part au prénom vide disparaît
  en silence — cicatrice `F5`) ;
- une allergie d'**une** bouche protège-t-elle **toute** la casserole ?
- un dégoût d'une bouche impose-t-il son goût à tout le monde, ou est-il contourné ?
- le résultat est-il **équilibré** — ou une personne obtient-elle systématiquement
  le plat des autres ?
- ⚠️ **Le précédent à ne pas rejouer** : deux fusions réelles sur deux ont ignoré
  le mode demandé, et l'une a servi **un plan de prise de masse à un foyer en
  perte**. Le constat existe (`observeMergeShape`) — utilise-le.

**Critère de sortie** : les trois modes produisent trois résultats **distincts et
conformes**, ou l'écart est mesuré et nommé.

### Agent 3V

Il vérifie sur les fichiers stockés (entrées, prompt, sortie), pas sur le rapport.
Il regarde en particulier si l'équilibre annoncé tient **par bouche** et pas
seulement en moyenne.

---

## ÉTAPE ④ — LA QUALITÉ D'UN PLAN SOLO

**Deux agents. Ne démarre que si ② est verte.**

### Agent 4A — deux casquettes, et il doit porter les deux

**Le diététicien** : sur un plan de **4 jours** — les apports sont-ils cohérents
sur la durée ? La protéine est-elle répartie ou concentrée sur un repas ? Les
légumes existent-ils ailleurs qu'en garniture ? Le plan tient-il compte du fait
que la personne s'entraîne, ou pas ? Y a-t-il une monotonie qui ferait décrocher
(le dépôt a déjà servi **sept petits-déjeuners identiques**) ? Les quantités sont-
elles réalistes — ni 40 g de poulet, ni 400 ?

**L'utilisateur lambda** : est-ce que j'ai envie de manger ça ? Est-ce que je sais
le faire ? Est-ce que ça tient dans le temps de cuisine que j'ai annoncé ? Est-ce
que les courses sont raisonnables ? Est-ce que je comprends ce qu'on me demande de
faire le jour même ? Est-ce qu'un plat me demande un ustensile que je n'ai pas ?

**Il itère** sur le prompt jusqu'à ce que les deux casquettes soient satisfaites,
et il **garde chaque version** avec ce qu'elle a changé.

⚠️ **Il ne juge jamais sur un seul plan** : le modèle varie. Plusieurs runs sur
les **mêmes** entrées, pour distinguer un défaut **systématique** d'un tirage
malheureux.

### Agent 4V

Il relit les plans produits **sans** le rapport de 4A d'abord — pour se faire son
propre avis —, puis compare. Un désaccord entre les deux est une information, pas
un problème : il le documente.

---

## ÉTAPE ⑤ — LA QUALITÉ D'UN PLAN DE FOYER

**Deux agents, mêmes casquettes qu'à ④**, plus ce qui n'existe qu'au foyer :

- Le plan est-il **cuisinable** ? Une session qui demande trois heures un mardi
  soir ne sera pas faite.
- Les **boîtes** sont-elles compréhensibles ? « Boîte Zoé — 520 g » a-t-il un sens
  pour quelqu'un qui n'a pas lu la documentation ?
- La **divergence** est-elle lisible à table, sans humilier personne ? (Une part
  est une instruction, jamais un verdict sur un corps.)
- Un enfant reçoit-il une assiette d'enfant **sans** qu'on parle de son corps ?
- Le plan **tient-il** si une personne mange dehors trois midis ?

---

## 3. Ce qui n'est PAS dans ce chantier

- ❌ Modifier les écrans (sauf si un champ ne s'écrit pas — et c'est alors l'étape ①).
- ❌ Toucher à la garde TCA, aux portes d'énergie, au contrat C1→C9.
- ❌ Changer le modèle de la lane foyer (mesuré : le modèle prévu **expire**).
- ❌ « Réparer » un plan à la main : on corrige le **prompt** et le **branchement**,
  jamais la sortie.
