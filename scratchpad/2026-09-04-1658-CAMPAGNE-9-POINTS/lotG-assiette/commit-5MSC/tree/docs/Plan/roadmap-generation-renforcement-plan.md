# Plan d'implementation - renforcement de la generation de roadmap

## Objectif

Renforcer la generation de plan pour que la roadmap :

- explique beaucoup mieux ce qui se passe vraiment pour l'utilisateur
- fasse emerger ce qu'il doit comprendre pour bien lire sa situation
- rende la metrique principale visible, concrete et progressive
- structure les phases autour d'une vraie logique causale
- affiche une duree claire et credible pour chaque phase
- calibre la duree totale du plan et le nombre de phases via une pre-classification amont

Le but n'est pas seulement d'avoir un plan "propre", mais un plan qui aide le user a comprendre son probleme, a adherer a la logique de progression, et a voir clairement comment il va avancer.

---

## Probleme actuel

Aujourd'hui, la roadmap :

- resume plutot bien le contexte, mais n'explique pas assez finement le mecanisme du probleme
- ne formule pas clairement le declic cognitif central
- n'affiche pas assez fortement une metrique principale globale derivee de la reussite
- fait exister des phases parfois correctes mais pas assez puissantes ni assez causales
- n'explicite pas assez pourquoi la duree des phases est ce qu'elle est
- laisse trop de latitude au prompt de generation sur la duree totale du plan

Consequence :

- la roadmap peut sembler raisonnable mais pas transformatrice
- le user comprend ce qu'il "doit faire", sans toujours comprendre ce qui se joue vraiment
- les phases peuvent manquer d'intensite, de baby steps ou de logique mecanique

---

## Cadrage produit retenu

### 1. Blend avec la roadmap existante

La roadmap actuelle reste la bonne base visuelle.

Le but n'est pas de remplacer la roadmap par un header analytique, mais de blender intelligemment :

- la comprehension globale
- la metrique principale
- la logique de progression
- les phases

Decision produit :

- on garde la roadmap avec ses differentes phases, parce qu'elle donne une comprehension globale du chemin
- on garde visuellement la structure roadmap actuelle si elle fonctionne bien
- on enrichit cette roadmap avec des blocs d'analyse plus puissants
- on ne transforme pas le haut de page en bloc theorique detache des phases

Structure cible retenue :

1. `Le contexte`
2. `Ce qui se passe vraiment`
3. `Ce que tu dois comprendre`
4. `Indicateur de reussite`
5. `Logique de progression`
6. `Feuille de route`

Autrement dit :

- la feuille de route reste centrale
- les blocs analytiques servent a mieux la lire
- ils ne remplacent pas la roadmap, ils l'eclairent

### 2. Bloc "Ce qui se passe vraiment"

But :

- produire une lecture fine du mecanisme du probleme
- expliquer ce qui entretient la situation
- decrire la boucle ou le systeme en jeu

Contraintes :

- pas de psycho vague
- pas de jargon
- pas un resume de symptomes
- 1 paragraphe dense, lisible, specifique au user

### 3. Bloc "Ce que tu dois comprendre"

But :

- formuler le declic cognitif principal
- dire clairement au user ce qu'il lit mal aujourd'hui
- donner la cle de lecture qui change la facon d'aborder le probleme

Contraintes :

- tres court
- tres net
- orienté comprehension utile
- doit expliquer pourquoi la roadmap est construite ainsi

### 4. Indicateur de reussite / metrique principale

La metrique principale doit etre derivee directement de l'objectif de reussite.

Exemple :

- reussite : `S'endormir en moins de 30 minutes a une heure socialement adaptee, avec un esprit calme`
- metrique principale : `Nuits avec endormissement en moins de 30 minutes`

Cette metrique doit :

- etre visible en haut de roadmap
- rester stable sur toute la transformation
- servir de fil rouge a toutes les phases

Dans l'UI, on peut continuer a la presenter comme l'indicateur de reussite, a condition qu'elle soit bien la metrique principale du plan.

### 5. Progression de la metrique principale par phase

Chaque phase doit porter :

- une `cible de phase` sur la metrique principale
- un `heartbeat de phase` qui mesure le levier specifique travaille

Exemple :

- phase 2 : objectif global de phase = `1 nuit/semaine en moins de 30 min`
- phase 3 : objectif global de phase = `3 nuits/semaine en moins de 30 min`
- phase 4 : objectif global de phase = `5 nuits/semaine en moins de 30 min`

Le heartbeat de phase reste distinct :

- phase 2 : `Soirs avec rituel vide-tete effectue`
- phase 3 : `Nuits avec retour au calme sans lutte`
- phase 4 : `Jours avec reveil a heure fixe`

### 6. Baby step obligatoire en phase 2

La phase 1 etant universelle, la phase 2 doit etre :

- le premier vrai palier de la transformation
- tres accessible
- volontairement baby step
- crediblement tenable meme pour un user en difficulte

Règle produit :

- la premiere phase generee par le plan doit toujours rester modeste en ambition
- la cible de la metrique principale doit etre basse mais non nulle
- la phase 2 doit construire de l'adhesion et de la preuve, pas chercher une correction massive

### 7. Duree claire et logique pour chaque phase

Chaque phase doit afficher explicitement une duree du type :

- `1 a 2 semaines`
- `2 a 3 semaines`
- `3 a 5 semaines`

Cette duree doit etre :

- lisible dans l'UI
- justifiee par le type de probleme
- coherente avec l'effort demande
- coherente avec la progression globale du plan

Les durees ne doivent pas sembler arbitraires ou decoratives.

### 8. Contrat de clarte pour chaque phase

Chaque phase doit expliquer, de maniere tres courte et tres claire :

1. `Ce qu'on cherche a tacler dans cette phase`
2. `Pourquoi on veut le tacler maintenant`
3. `Comment on va s'y prendre`

Le but est que chaque phase soit lisible tres vite par le user, sans ambiguite.

Contraintes :

- format court
- formulation concrete
- pas de jargon
- pas de redite inutile
- chaque phrase doit ajouter une information distincte

Le trio attendu par phase devient donc :

- `ce_quon_tacle`
- `pourquoi_maintenant`
- `comment_on_sy_prend`

Exemple de lecture cible pour une phase :

- `Ce qu'on tacle` : le lit comme lieu d'activation mentale
- `Pourquoi maintenant` : tant que le cerveau continue a associer le lit a l'effort mental, l'endormissement reste fragile
- `Comment` : on cree un sas de decharge avant le coucher et on sort les ruminations du lit

Ces trois elements doivent ensuite cohabiter avec :

- le titre de phase
- la duree
- la cible sur la metrique principale
- le heartbeat specifique

---

## Enrichissement du classifieur amont de type de transformation

### Principe

Avant de generer le plan, s'appuyer sur l'appel deja existant `classify-plan-type-v1` et l'enrichir.

Le but n'est pas de creer un deuxieme classifieur parallele, mais d'etendre celui qui existe deja pour qu'il retourne non seulement :

- le type de transformation
- le style de plan
- les metriques recommandees

mais aussi :

- le niveau de longueur attendu
- la fenetre de duree attendue
- une fourchette de nombre de phases
- des indications de calibration liees a l'intensite du user

But :

- mieux borner la generation
- eviter que le prompt parte en vrille
- mieux controler le nombre de phases
- tenir compte du type de transformation et de l'intensite du user
- reutiliser le contexte et la logique deja presents dans `classify-plan-type-v1`

### Appel existant a enrichir

Appel concerne :

- `supabase/functions/classify-plan-type-v1/index.ts`

Aujourd'hui, ce classifieur retourne deja :

- `type_key`
- `confidence`
- `duration_guidance`
- `plan_style`
- `recommended_metrics`
- `framing_to_avoid`
- `first_steps_examples`
- autres champs de cadrage secondaires

Le chantier consiste a enrichir ce contrat plutot qu'a introduire un appel concurrent.

### Niveaux cibles

Proposition retenue :

- `niveau 1` : `1 mois`
- `niveau 2` : `2 mois`
- `niveau 3` : `3 mois`
- `niveau 4` : `4 a 5 mois`
- `niveau 5` : `6 a 8 mois`
- `niveau 6` : `9 a 12 mois`

### Rôle de l'intensite user

L'intensite du user ne change pas necessairement le niveau de transformation, mais elle fait varier :

- la position dans l'intervalle
- le rythme interne
- la densite des phases
- la taille des baby steps

Exemple :

- meme transformation, niveau 4
- user tres mobilise : plutot `4 mois`
- user fragile / surcharge / contexte instable : plutot `5 mois`

### Sortie attendue de cette pre-classification

Le classifieur enrichi doit retourner quelque chose comme :

- `transformation_length_level`
- `expected_duration_min_months`
- `expected_duration_max_months`
- `recommended_phase_count_min`
- `recommended_phase_count_max`
- `intensity_adjustment_reason`
- `sequencing_notes`

Ces champs viennent en plus des champs deja existants du classifieur de type.

Cette sortie enrichie sert ensuite a construire le prompt principal de generation.

---

## Nouveau contrat de generation du plan

### Etape 1. Classification amont enrichie

Reutiliser `classify-plan-type-v1`, mais en enrichissant son prompt et son schema de sortie.

- lit la transformation
- detecte le type de transformation
- estime la longueur attendue
- ajuste selon intensite / contraintes / inertie / complexite

Sortie :

- niveau 1 a 6
- intervalle de duree
- intervalle de nombre de phases
- contraintes de calibration

### Enrichissement du prompt du classifieur

Le prompt de `classify-plan-type-v1` doit etre enrichi pour demander explicitement :

- de quel genre de transformation il s'agit
- quel est son niveau attendu de longueur
- si la transformation releve plutot d'un reset court, d'un reconditionnement progressif, d'une reconstruction, d'une sortie de dependance, d'une stabilisation de fond, etc.
- comment l'intensite du user fait bouger la duree a l'interieur de l'intervalle
- quelle fourchette de nombre de phases est la plus credibile
- s'il faut des phases courtes et denses ou plus longues et progressives

Le classifieur doit donc produire un cadrage utilisable directement par la generation de roadmap, pas seulement une etiquette de type.

### Etape 2. Construction du prompt de generation

Le prompt de generation doit recevoir explicitement :

- le `type_key`
- la `confidence`
- la `duration_guidance` du classifieur
- le `transformation_length_level`
- la longueur attendue
- la fenetre de duree attendue
- la fourchette de nombre de phases
- les `plan_style`
- les `recommended_metrics`
- les `framing_to_avoid`
- les `first_steps_examples`
- les `difficulty_patterns`
- les `sequencing_notes`
- l'`intensity_adjustment_reason`
- la contrainte baby step sur la phase 2
- la necessite de produire :
  - contexte
  - mechanism_analysis
  - key_understanding
  - primary_metric
  - progression_logic
  - phase metric targets
  - phase heartbeat
  - duration_guidance par phase

### Etape 3. Generation de la roadmap

Le plan genere doit :

- expliquer
- mesurer
- sequencer
- calibrer

Pas seulement lister de bonnes pratiques.

### Regle de construction du prompt principal

La generation du plan ne doit plus raisonner dans le vide.

Le prompt principal doit etre construit a partir de deux couches :

1. le contexte transformationnel brut de l'utilisateur
2. le cadrage produit par `classify-plan-type-v1` enrichi

Autrement dit, le classifieur devient une etape de pre-raisonnement qui borne :

- la duree plausible
- le nombre de phases plausible
- le style de progression
- l'intensite des premiers pas
- les erreurs de framing a eviter

Le prompt de generation doit ensuite transformer ce cadrage en roadmap concrete.

---

## Nouveau schema de contenu cible

### Niveau roadmap

Ajouter ou renforcer les champs suivants :

- `situation_context`
- `mechanism_analysis`
- `key_understanding`
- `primary_metric`
  - `label`
  - `unit`
  - `success_target`
  - `measurement_mode`
- `progression_logic`

### Niveau phase

Chaque phase doit avoir :

- `title`
- `rationale`
- `phase_objective`
- `duration_guidance`
- `ce_quon_tacle`
- `pourquoi_maintenant`
- `comment_on_sy_prend`
- `phase_metric_target`
  - exemple : `1 nuit/semaine`
- `heartbeat`
  - mesure le levier specifique
- `maintained_foundation`

### Règles de coherence

- la metrique principale reste la meme tout le long du plan
- les cibles de phase montent progressivement
- les heartbeats changent selon le mecanisme travaille
- la phase 2 reste volontairement baby step
- la duree des phases doit etre compatible avec le niveau global de transformation

---

## Règles de generation a imposer

### Compréhension

Le plan doit toujours expliciter :

- ce qui entretient le probleme
- ce que le user doit comprendre
- pourquoi les leviers choisis sont logiques

### Progression

Le plan doit toujours expliciter :

- pourquoi on commence par cette phase
- ce que cette phase rend possible ensuite
- pourquoi la phase suivante arrive apres

### Mesure

Le plan doit toujours produire :

- une metrique principale globale
- une cible globale pour chaque phase
- un heartbeat specifique pour chaque phase

### Duree

Le plan doit toujours produire :

- une duree totale credibile
- une duree visible pour chaque phase
- une justification implicite de cette duree dans le sequencing

---

## Changements UI a prevoir

### Header roadmap

Remplacer l'ancien bloc strategie par :

- `Le contexte`
- `Ce qui se passe vraiment`
- `Ce que tu dois comprendre`
- `Metrique principale`
- `Logique de progression`

Important :

- la roadmap visuelle avec ses phases reste en place
- ces blocs viennent enrichir le haut de la roadmap
- ils ne remplacent pas la feuille de route

### Affichage de la metrique principale

Afficher clairement :

- le nom de la metrique
- la cible finale
- puis dans chaque phase :
  - la cible de phase sur cette meme metrique

### Affichage des phases

Chaque phase doit montrer de maniere tres visible :

- son titre
- sa duree
- son objectif
- ce qu'on tacle
- pourquoi maintenant
- comment on s'y prend
- sa cible sur la metrique principale
- son heartbeat specifique
- sa rationale si elle reste utile, sinon les trois lignes ci-dessus deviennent prioritaires

---

## Impacts backend

### Classifieur amont existant a enrichir

Enrichir `classify-plan-type-v1` pour qu'il retourne, en plus de son cadrage actuel :

- type de transformation
- inertie estimee
- niveau de difficulte
- variation selon intensite user
- niveau de longueur attendu
- fourchette de phases attendue
- notes de sequencing

Il ne faut pas creer un nouvel appel separe si le classifieur existant peut porter cette logique.

### Prompt principal

Refondre le prompt de generation pour :

- injecter explicitement la sortie enrichie de `classify-plan-type-v1`
- exiger une analyse mecaniste
- exiger un insight central
- exiger une vraie metrique principale
- exiger une progression phase par phase de cette metrique
- exiger une duree credibile par phase

### Validation

Etendre la validation pour verifier :

- presence de `mechanism_analysis`
- presence de `key_understanding`
- presence de `primary_metric`
- presence de `phase_metric_target` par phase
- presence de `duration_guidance` par phase
- progression coherente de la cible de phase

---

## Ordre de mise en oeuvre recommande

### Tranche 1 - schema et cadrage

1. definir le schema roadmap cible
2. ajouter les nouveaux champs de contenu
3. preparer les types frontend/backend

### Tranche 2 - pre-classification amont

1. enrichir `classify-plan-type-v1`
2. definir les 6 niveaux
3. etendre le schema de sortie avec longueur, phases et intensite
4. integrer l'intensite user dans la variation d'intervalle

### Tranche 3 - prompt principal

1. injecter le resultat enrichi de `classify-plan-type-v1` dans le prompt
2. imposer les nouveaux blocs de roadmap
3. imposer la logique metrique globale + cible de phase
4. imposer la contrainte baby step sur la phase 2

### Tranche 4 - validation

1. etendre la validation structurelle
2. verifier la coherence des durees
3. verifier la progression de la metrique globale

### Tranche 5 - UI roadmap

1. afficher la nouvelle lecture de roadmap
2. afficher la metrique principale
3. afficher les cibles globales par phase
4. afficher clairement les durees de phase

### Tranche 6 - tuning

1. tester plusieurs cas de transformations
2. verifier que la phase 2 reste bien baby step
3. verifier que les plans longs restent tenables
4. verifier que les plans courts ne sont pas sur-etales

---

## Definition of done

Le chantier est termine quand :

- la roadmap aide vraiment le user a comprendre ce qui se passe
- elle formule clairement ce qu'il doit comprendre
- une metrique principale globale est visible et stable
- chaque phase a une cible explicite sur cette metrique
- chaque phase garde son propre heartbeat specifique
- la phase 2 est bien un baby step credible
- chaque phase a une duree affichee, claire et logique
- la duree totale du plan est bornee par une pre-classification amont
- le nombre de phases est coherent avec le niveau de transformation

---

## Decision produit retenue

On ne traite plus la roadmap comme un simple resume de strategie.

On la traite comme :

- une lecture fine du probleme
- une explication du mecanisme
- une progression mesurable
- une sequenciation credibile dans le temps

Autrement dit :

- mieux comprendre
- mieux mesurer
- mieux sequencer
- mieux calibrer
