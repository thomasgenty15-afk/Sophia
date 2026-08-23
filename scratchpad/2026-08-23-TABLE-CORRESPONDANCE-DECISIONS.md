# La table de correspondance — §⑥ *(26 questions)* ↔ registre foyer *(31 décisions produit)*

> **Établie le 2026-08-23**, en lisant les deux documents ligne à ligne.
> ⛔ **Ce n'est PAS la liste du plan recopiée** — elle est vérifiée, et elle la contredit
> sur deux points.

**Les deux sources**
- **§⑥** = `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md:192` — 26 questions de la revue
  du 2026-08-21, triées A/B/C. **19 fermées, 6 ouvertes** *(13 et 26 fermées le 2026-08-21 ;
  27 ouverte le 2026-08-22)*.
- **registre** = `scratchpad/2026-08-21-DESIGN-FOYER-REPARTITION.md:278` — section 3.3,
  **31 décisions produit** extraites de 166 conflits, par famille.

---

## ⛔ LE PIÈGE, MESURÉ

**Les deux numérotations se chevauchent et ne désignent JAMAIS la même chose.**
Sur les 26 numéros communs aux deux registres, **le sujet coïncide 0 fois**.

| n° | **§⑥** | **registre foyer** |
|---|---|---|
| 3 | la bouche protégée ne bouge jamais | retirer une allergie est un `DELETE` définitif |
| 4 | le verrou de lane dégrade toute la table | objectif de perte sur un enfant de 8 ans |
| 12 | le chat fait tout ou rien | aucun régime religieux ou culturel n'existe |
| 14 | conservation = jour de cuisson + 2 | le maître ne peut pas poser le régime d'une bouche réclamée |
| 16 | le gramme quitte `portion_note` | les sentinelles s'abstiennent sous 7 jours |
| 17 | `pepper` — ne jamais deviner un terme ambigu | l'assiette suppose un pain, un fromage, un dessert |
| 18 | audit de `user_profile_facts` | le retour d'une bouche devient une règle permanente |
| 21 | plafond de surplus à 0,5 kg/sem | le shaker d'un enfant n'est saisissable nulle part |
| 25 | `WEIGHT_KG_MAX` = 400 | l'envie d'un titulaire écrase celle de l'autre |
| 26 | portée de la ceinture strict | la boîte à un seul nom dit l'objectif par sa forme |

⛔ **Et le plan est déjà tombé dedans.** Sa vague D écrit :
*« Déjà signées : n° 4 (G4), n° 26 (via G5), **n° 16, n° 17, n° 18**, n° 30 (via `tradeoff`),
n° 5-6 partiellement. »* — **quatre entrées nomment leur mécanisme, trois ne nomment rien.**
Ce sont exactement `16`, `17`, `18`, **et ce sont les numéros du §⑥, pas ceux du registre.**
*(La forme est celle que la campagne a trouvée douze fois : deux objets portant le même
nom, et personne ne s'en aperçoit parce que chacun marche de son côté.)*

---

## ① CE QUI EST RÉELLEMENT COUVERT — **4 certaines, 2 partielles**

| registre | le conflit | couvert par | la décision |
|---|---|---|---|
| **4** SÉCU | objectif de perte de poids sur un enfant de 8 ans | **§⑥ 15** *(porte G4)* | aucun objectif de poids sur un mineur ; le champ part du front. ⚠️ **2 bouches existantes à traiter** |
| **18** GOÛT | le retour d'une bouche devient une règle permanente pour toute la table | **§⑥ 6** | la question existe déjà : `portions`, cinq crans, avec `portions_subject`. **Rien à inventer** |
| **26** SOCI | la boîte à un seul nom dit l'objectif par sa forme | **§⑥ 16** *(porte G5)* | le gramme quitte `portion_note` et vit dans la boîte, qui a un destinataire |
| **30** SOCI | trois bouches, deux avis : aucune notion de majorité | **§⑥ 9** | le champ `tradeoff` a un champ dédié, hors du `why`, avec son compteur |
| **5** SÉCU ⚠️ | grossesse/allaitement indéclarable pour une bouche sans compte | *`L0bis`* | **partielle** — le PLANCHER de grossesse existe ; **le canal de déclaration pour une bouche sans compte, non** |
| **6** SÉCU ⚠️ | condition médicale d'une bouche sans compte n'atteint aucune lane | *`L0bis`* | **partielle** — même table jamais créée ; `detectDeclaredMedicalCondition` reste désarmé sur les tiers |

## ② ⛔ LE CAS QUI CONTREDIT LE PLAN — registre **17**

| registre | le conflit | statut réel |
|---|---|---|
| **17** NUTR | l'assiette suppose un pain, un fromage et un dessert non déclarés | ⛔ **NON SIGNÉE.** Le plan la déclare signée. Or sa règle porte sur `structureState` / `anchorFactorFor` / le repli à **0,42** — **c'est exactement le sujet de `§⑥ 19`, qui est OUVERTE** *(« granularité du facteur d'ancrage — demande de lire ce que `anchorFactorFor` fait aujourd'hui, ce qui n'a pas été fait »)*. **Une décision ne peut pas être signée pendant que la question dont elle dépend est ouverte.** ⚠️ `§⑥ 10` la touche par un REPORT *(« les trois autres s'ajoutent quand leur lecteur existe »)*, ce qui est un ajournement, pas une signature |

---

## ③ LES **24** QUI RESTENT — aucune n'est couverte par le §⑥

### SÉCURITÉ — 6
| n° | le conflit |
|---|---|
| **1** | une bouche sans compte n'a qu'un seul niveau : **tout est `medical`** ⚠️ *nommée par la vague D comme bloquante* |
| **2** | un adulte secondaire ne peut pas déclarer l'allergie de son enfant |
| **3** | retirer une allergie est un `DELETE` définitif, **sans confirmation ni trace** |
| **7** | un parent non-maître ne peut pas déclarer l'allergie de son enfant |
| **8** | une allergie ne se relit jamais : **l'espace alimentaire ne fait que rétrécir** |
| **9** | l'allergène entre par les repas hors plan — ce que le produit **ne garantit pas** n'est écrit nulle part |

### RÉGIME — 5
| n° | le conflit |
|---|---|
| **10** | une bouche avec compte sans régime déclaré fait **servir de la viande à un végane** |
| **11** | la bouche la plus stricte est absente toute la fenêtre, puis rentre plus tôt |
| **12** | **aucun régime religieux ou culturel n'existe** — tous dans le verrou tout-ou-rien |
| **13** | **un seul végane fait manger végane six personnes toute la semaine** ⚠️ *bloquante* |
| **14** | le maître ne peut pas poser le régime d'une bouche qui a réclamé son compte |

### OBJECTIF — 1
| **15** | un objectif posé sur une bouche **sans corps** : facteur 1, c'est-à-dire l'assiette du modèle |

### NUTRITION — 1
| **16** | les sentinelles s'abstiennent sous 7 jours, et la fenêtre du produit va de **1 à 7** |

### LOGISTIQUE — 5
| n° | le conflit |
|---|---|
| **19** | jours de cuisine, temps par session et budget viennent **d'un seul compte** |
| **20** | **personne ne sait qui cuisine** |
| **21** | le shaker d'un enfant n'est saisissable nulle part |
| **22** | **un invité à table n'existe nulle part dans le modèle** |
| **23** | la casserole n'a pas de taille et la maison n'a pas de place |

### SOCIAL — 6
| n° | le conflit |
|---|---|
| **24** | deux titulaires aux objectifs opposés : **seul celui qui appuie sur le bouton est entendu** ⚠️ *bloquante* |
| **25** | l'envie d'un titulaire écrase celle de l'autre **sans trace** |
| **27** | deux titulaires demandent des choses opposées *(portée `household` vs auteur)* |
| **28** | le plan parle **une seule langue** à une table qui en parle deux |
| **29** | ⛔ **tout le foyer mange sous le coach du maître, sans l'avoir choisi et sans le savoir** |
| **31** | le maître ne peut pas corriger le rythme d'un conjoint qui a un compte |

---

## ④ CE QUI EST OUVERT AU §⑥ — **6**, et ce sont d'autres objets

| §⑥ | la question | porte |
|---|---|---|
| **1** | le périmètre juridique | **P0** |
| **2** | un moteur d'ancrage, ou deux | **G7** |
| **5** | régénérer est gratuit ? | — |
| **19** | granularité du facteur d'ancrage ⛔ *bloque registre 17* | — |
| **20** | 1 311 comptes de test sur 1 320 — **y a-t-il de vrais utilisateurs en prod ?** | — |
| **27** | **qui, à cette table, a le droit d'apprendre que son besoin a perdu ?** | **G-disclosure** |

---

## ⑤ LE COMPTE, EN UNE LIGNE

**31 décisions au registre. 4 signées. 2 partielles. 1 déclarée signée à tort. 24 intactes.**
**Et 6 questions du §⑥ restent ouvertes, dont une bloque une 25ᵉ décision du registre.**

⚠️ **Le §⑥ n'est pas un sous-ensemble du registre** : 19 de ses 26 réponses ne correspondent
à aucune des 31 — elles portent sur le moteur, la mémoire, les constantes, le RGPD.
Les deux documents se croisent sur **7 lignes**, dont **6 tiennent**.
