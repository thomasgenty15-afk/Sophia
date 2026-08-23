# VAGUE D — LES SIGNATURES

> **Le livrable de la vague D est un document signé, pas du code.**
> Seuil : **31/31 — trente et une signatures, ou trente et un refus écrits.**
> Registre source : `scratchpad/2026-08-21-DESIGN-FOYER-REPARTITION.md:278` *(section 3.3)*.
> Correspondance avec le §⑥ du plan : `scratchpad/2026-08-23-TABLE-CORRESPONDANCE-DECISIONS.md`.

## ÉTAT — **30 signées · 0 en attente · 1 à reprendre**

| | |
|---|---|
| **signées le 2026-08-23** | **24** — les 20 sur recommandation, **plus les 4 de la fourche** |
| **couvertes avant** | **4** — registre `4`, `18`, `26`, `30` *(via §⑥ 15, 6, 16, 9)* |
| **partielles** | **2** — registre `5` et `6` *(le plancher de grossesse existe ; le canal de déclaration pour une bouche SANS COMPTE n'existe pas)* |
| ⛔ **en attente** | **0** |
| ⛔ **à reprendre** | **1** — registre `17`, **déclarée signée à tort** par le plan : elle dépend de `§⑥ 19`, qui est **ouverte** |

---

# LES 20 SIGNÉES — 2026-08-23

> **Signées par le propriétaire**, sur recommandation, en une passe.
> ⚠️ **Trois portent une réserve écrite.** Elles sont signées, pas inconditionnelles.

## 🔴 SÉCURITÉ — 5

| n° | la décision | ce qu'elle interdit désormais |
|---|---|---|
| **1** | **Deux niveaux à la saisie** — « allergie (danger) » / « intolérance, à éviter ». Allergie ⇒ **retrait du plat** ; intolérance ⇒ **consigne + avertissement, jamais 422** | ⛔ traiter toute sensibilité d'une bouche sans compte comme un danger. ⚠️ La colonne s'ajoute avec **DEUX valeurs réellement lues** — un champ à une seule valeur lue est une garde désarmée |
| **2** | **Tout adulte du foyer AJOUTE une allergie ; seul l'`owner` la RETIRE** | ⛔ la symétrie. **Ajouter ne peut que sur-bloquer ; retirer peut tuer** — l'asymétrie est le contenu de la décision, pas un détail |
| **3** | **Confirmation nommée + `retracted_at`**, jamais un `delete`. La lecture du générateur filtre sur `retracted_at is null` | ⛔ un retrait d'allergie silencieux et sans trace |
| **7** | **La porte SQL s'ouvre aux adultes du foyer, avec notification à l'`owner`.** Dans le chat : **renvoi explicite vers la fiche de la bouche** | ⛔ que le chat ÉCRIVE une allergie. Le canal conversationnel oriente, il ne déclare pas |
| **9** | **Une phrase à la saisie d'une allergie `medical`** dit ce que le produit **ne garantit PAS** — les repas hors plan, les courses, la cuisine des autres | ⛔ laisser croire que le produit garde la maison. Il garde **le plan** |

## 🟠 RÉGIME — 4

| n° | la décision | ce qu'elle interdit désormais |
|---|---|---|
| **10** | **Le refus `has_account` est GARDÉ** *(le régime appartient à la personne)* — et le trou devient **visible et réparable** : « Sarah n'a pas dit ce qu'elle mange » + un bouton qui lui pose la question **dans SON app** | ⛔ qu'un régime non déclaré se confonde avec « omnivore » |
| **11** | **Le plan écrit les bouches exclues et pourquoi** *(« Léa n'est pas comptée : absente du 12 au 18 »)*. **La personne décide** de recomposer | ⛔ recomposer automatiquement. **Un plan déjà lu ne bouge pas tout seul** |
| **13** | **Descendre au plus strict RESTE la règle de sécurité** *(une casserole peut donner moins, jamais plus)* — mais quand le plus strict est porté par une **minorité**, la question est **posée à l'écran AVANT de composer** | ⛔ ① descendre en silence ; ⛔ ② deux plats systématiques *(coût de cuisine ×2)* |
| **14** | **Le refus est GARDÉ**, et sa ligne du brief l'écrit : *« Marc has not told us what he eats »* | ⛔ que le maître pose le régime d'un adulte qui a réclamé son compte |

## 🟡 OBJECTIF — 1

| **15** | **La porte d'écriture de l'objectif ENCHAÎNE sur la saisie du corps** ; l'écran marque « objectif posé, taille de part non calculable » | ⛔ ① le facteur 1 silencieux ; ⛔ ② **refuser l'objectif** — ça fermerait un couloir d'entrée |

## 🔵 LOGISTIQUE — 5

| n° | la décision | ce qu'elle interdit désormais |
|---|---|---|
| **19** | **La capacité de cuisine est un fait du FOYER**, pas d'un compte — portée par `households`, écrite par l'`owner`, lue par le générateur. ⚠️ **RÉSERVE** : tant que ce n'est pas fait, **l'écran dit à qui appartiennent ces réglages** | ⛔ que les jours, le temps et le budget d'une table sortent de `student_goals` d'un seul composeur |
| **20** | **Une question par jour de cuisine** *(`household_cook_days.member_id`)*, **+ refus de placer une session un jour où le cuisinier désigné est `away`**, + le prénom écrit sur la session | ⛔ une session sans propriétaire |
| **21** | ⚠️ **B MAINTENANT, A ENSUITE.** On **n'affiche pas** de section vide ; l'écrivain d'apports fixes par `member_id` se branche ensuite | ⛔ **un champ mort.** *« Un champ absent vaut mieux qu'un champ mort »* |
| **22** | **Un état de présence supplémentaire par case** : `guests: {day, slot, count}`, additionné aux portions de **CETTE case seule**, écrit dans le bloc de présence | ⛔ qu'un invité entre dans le dimensionnement d'une bouche |
| **23** | **Deux questions, en TROIS VALEURS** — plus grand récipient *(petit / moyen / grand faitout)*, place de conservation *(peu / normale / large)* | ⛔ **demander des litres.** Personne ne connaît le volume de son faitout |

## 🟣 SOCIAL — 5

| n° | la décision | ce qu'elle interdit désormais |
|---|---|---|
| **25** | **L'envie devient ADDITIVE** — deux phrases concaténées **avec leur auteur**, plafond partagé — et l'écran montre à l'un ce que l'autre avait écrit | ⛔ l'écrasement sans trace |
| **27** | **Les items de sujet `household` appartiennent au foyer** et sont lus quel que soit l'auteur ; **les items de sujet personnel ne s'appliquent qu'à SA part.** ⚠️ **RÉSERVE** : en attendant, afficher au composeur **ce que le plan N'A PAS appliqué** | ⛔ qu'une demande personnelle gouverne la table |
| **28** | **Le plan reste composé dans UNE langue** ; les surfaces **OPÉRATOIRES** d'une bouche sont rendues dans la langue de SON compte — **traduction à l'AFFICHAGE, jamais à la composition** | ⛔ composer deux fois : ça double l'appel modèle et **fait diverger deux plans** |
| **29** | **La méthode devient visible et attribuée** : le plan porte une ligne disant sous quelle méthode il a été composé et de qui elle vient. Un adulte qui a SON coach voit que le plan commun ne suit pas le sien. ⛔ **RÉSERVE FORTE — `P0` peut RENVERSER cette signature** : la même population est celle que le juridique garde, et il peut exiger un **consentement explicite** *(option B)* plutôt qu'une simple information | ⛔ le statu quo, où personne ne sait sous quelle méthode il mange |
| **31** | **Le champ grisé est remplacé par une phrase** *(« Marc gère lui-même ses horaires de repas »)* + le rappel que le maître peut poser les absences — **rendu à l'ENDROIT du geste** | ⛔ un refus dans une bannière lointaine. Cicatrice mesurée **trois fois dans le même écran** : *un refus loin du geste se lit comme un bouton mort* |

---

# ⛔ LES 4 EN ATTENTE — la recommandation était une FOURCHE

> **Elles ne sont pas signées, et les compter comme signées serait exactement
> le défaut que la vague D existe pour empêcher.**

| n° | la question | les branches |
|---|---|---|
| **8** | une allergie ne se relit **jamais** — l'espace alimentaire ne fait que rétrécir | **A** relecture annuelle non destructive *(coût d'écran)* · **B** un bouton « revoir » permanent, sans automatisme *(presque gratuit)* |
| **12** | aucun **régime religieux ou culturel** n'existe | **A** régimes de première classe — ⚠️ ils **cessent d'être ordonnables par `exclusionCount`** · **B** règles de maison, assumé par écrit |
| **16** | les sentinelles s'abstiennent sous 7 jours, la fenêtre va de **1 à 7** | **A** mémoire sur fenêtres consécutives · **B** garder l'abstention et l'écrire · ⛔ **C écarté** *(six faux trous mesurés)* |
| **24** | deux titulaires opposés : **seul celui qui appuie est entendu** | **A** un `speaker` désigné · **B** additif à deux voix |

---

# LES 4 DE LA FOURCHE — tranchées le 2026-08-23

> ⚠️ **Ma recommandation ne les avait PAS tranchées** — elle offrait deux branches.
> Elles sont donc signées **directement**, pas sur recommandation.

| n° | la décision | ce qu'elle emporte |
|---|---|---|
| **8** | ⛔ **Un bouton « revoir » PERMANENT sur la fiche de bouche. Aucun automatisme, aucune relance annuelle.** | ⚠️ **Ce que ça accepte, écrit ici pour que personne ne le redécouvre** : sans relance, **personne ne clique spontanément**. L'espace alimentaire **continuera de rétrécir** chez les foyers qui n'y pensent pas. La décision est que le produit **offre** la relecture sans la **réclamer** — il ne va pas rouvrir de sa propre initiative une allergie que quelqu'un a posée |
| **12** | ⛔ **Les pratiques deviennent des RÉGIMES DE PREMIÈRE CLASSE** — jetons `no_pork`, `no_beef`, `halal`, `kosher`, avec leurs groupes exclus dans `excludedGroupsFor` | ⛔ **CONSÉQUENCE DURE, écrite dans le registre et acceptée** : ils **cessent d'être ordonnables par `exclusionCount`**. La hiérarchie des régimes — « le plus strict gouverne la table » — **ne sait plus comparer** un halal et un végétarien : ils n'excluent pas le même nombre de choses, et **aucun des deux n'est « plus strict »**. ⇒ **la hiérarchie doit être reprise**, c'est un lot à part et il n'existe pas encore. ⚠️ **Et une garde reste à poser** : `halal` et `kosher` portent une **certification** que le produit ne peut pas vérifier sur un ingrédient — le plan compose *sans porc et sans alcool*, il ne **certifie** rien |
| **16** | ⛔ **L'abstention sous 7 jours RESTE, et l'écran l'écrit** — « sur moins de 7 jours, nous ne jugeons pas les apports ». Pas de mémoire sur fenêtres consécutives | ⚠️ **Accepté** : un foyer qui compose **toujours** sur 3 jours n'aura **jamais** de sentinelle nutritionnelle. **Jamais**, pas « plus tard ». ⛔ Baisser le seuil reste **écarté** — six faux trous mesurés sur un plan d'un jour |
| **24** | ⛔ **NI A NI B — une troisième position** : *« il n'y a que le maître de maison qui peut générer le plan pour l'instant ; l'autre en est juste informé »*. **Le porte-parole EST le maître, par construction**, parce que la porte de génération est déjà fermée aux autres | ✅ **VÉRIFIÉ DANS LE CODE, pas déduit** : `generate-household-meal-v1/index.ts:962` rend **403 `not_owner`** à tout membre non-`owner`, avec sa raison écrite — *« laisser n'importe quel membre la déclencher laisserait un colocataire effacer la semaine d'un autre »*. ⇒ **le conflit n° 24 ne mord pas aujourd'hui**, et la décision est de **ne pas ouvrir la porte pour l'instant** |

## ⛔ CE QUE LA SIGNATURE DE `24` RÉVÈLE — `D5` EST FAUX À MOITIÉ

`D5` de la partie 1 du design écrit : *« Le maître génère ; les autres sont informés **et peuvent régénérer** »*, puis s'en sert pour justifier la règle de portée : *« **comme deux personnes peuvent générer**, le plan doit être indépendant de la main sur le bouton »*.

⛔ **Les autres NE PEUVENT PAS régénérer.** La porte est fermée depuis toujours, avec un commentaire qui dit pourquoi. **La prémisse de `D5` ne tient pas**, et il faut la corriger là où elle est écrite.

⚠️ **La règle de portée (n° 27) SURVIT — pour une autre raison, et il faut l'écrire** : ce qui fait diverger le plan n'est pas **qui appuie**, c'est **qui a écrit**. Deux titulaires posent tous les deux une envie et des objectifs *(c'est le conflit n° 25)* ; **un seul appuie**. La règle « sujet `household` ⇒ pour tous, sujet personnel ⇒ pour lui seul » reste donc nécessaire **et sa justification change**.
