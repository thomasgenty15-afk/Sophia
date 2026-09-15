# Nina Current Plan

Source : base locale Supabase, `generate-plan-v2`.

## Identifiants

- user_id : `e5630c78-447e-452c-b7d6-e4b475cd22fd`
- cycle_id : `8db01557-6c1c-43bc-a2b9-31940eeeae20`
- transformation_id : `1c07c144-a799-46c1-94e7-5cb6c4f5869c`
- plan_id : `cdbf9d59-aba8-4097-ae54-98bfde3b90fd`
- status : `active`
- plan genere / active : 2026-05-06
- duree cycle : 4 mois

## Intake

Texte initial :

> Je suis en surpoid depuis 5 ans, j'ai besoin de perdre du poid parce que je sens que c'est compliqué au quotidien, j'ai beaucoup de travail donc j'ai pas nécéssairement le temps de faire attention à ça

## Transformation Active

**Titre** : Retrouver un poids de forme pour plus de confort au quotidien

**Objectif global** : enclencher une perte de poids durable, a un rythme realiste, pour retrouver plus d'aisance corporelle au quotidien.

**Definition de succes** : atteindre 82 kg sur la balance avec une reduction nette des envies de sucre et de produits transformes entre les repas.

**Situation de depart** :

- poids de depart capture dans le questionnaire : 90 kg
- cible de cette transformation : 82 kg
- cible parcours long terme : 70 kg, dans une deuxieme transformation
- sujet present depuis : plus de 3 ans
- difficulte percue : difficile
- freins cites : motivation sur la duree, fatigue physique ou mentale, manque de connaissances nutrition
- inconforts cites : souffle, douleurs/inconfort physique, vetements devenus trop etroits

**Contrainte produit importante** : ne pas demarrer par une restriction brutale ou du sport intensif. Le plan commence par reduire les produits transformes et le grignotage pour reprendre de l'energie.

## Niveau Actuel

**Titre** : Reprendre le controle sur le grignotage

**Objectif du niveau** : casser la boucle du grignotage automatique et reduire la presence des produits transformes.

**Pourquoi maintenant** : parce que c'est la source principale de calories superflues et de baisse d'energie.

**Logique systeme** : on traite d'abord l'environnement et le grignotage pour stopper la prise de poids et regagner de l'energie, avant d'introduire du mouvement puis de revoir les repas.

**Heartbeat** :

- titre : Jours avec collation brute ou sans grignotage
- cible : 6 jours / semaine
- unite : jours/semaine
- mode : inferred

## Items Actifs Et A Venir

### 1. Nettoyer ton environnement direct

- id : `a751731a-3832-4bea-a707-c72170fd15a0`
- dimension : `missions`
- kind : `task`
- status : `active`
- time_of_day : `anytime`
- tracking_type : `boolean`
- cards_status : `not_started`
- description : faire le tour des placards et de l'espace de travail, retirer ou cacher les produits transformes qui tentent le plus en cas de stress.

### 2. Faire le choix du brut

- id : `eb9df535-b6e9-40d9-af57-effafdc2f662`
- dimension : `habits`
- kind : `habit`
- status : `active`
- target_reps : 6
- current_reps : 0
- cadence : 6 jours / semaine
- time_of_day : `anytime`
- tracking_type : `boolean`
- cards_status : `not_started`
- description : si Nina a faim entre les repas, choisir un aliment brut comme un fruit ou une poignee d'amandes au lieu d'un produit transforme. Si elle n'a pas faim, ne rien prendre.

### 3. Decoder ton envie de grignoter

- id : `7ed21c74-e2ad-4ffb-85d9-5d204d72bbcf`
- dimension : `clarifications`
- kind : `framework`
- status : `pending`
- unlock : apres completion de `Nettoyer ton environnement direct`
- cards_status : `not_required`
- description : prendre 2 minutes lors d'une forte envie de sucre ou de gras pour identifier ce qui se joue vraiment : stress, fatigue, ennui.
- questions :
  - Que ressens-tu juste avant cette envie ?
  - De quoi as-tu reellement besoin a cet instant ?

### 4. Preparer tes alternatives d'avance

- id : `23f34398-87ae-4388-80b4-786989faac97`
- dimension : `missions`
- kind : `task`
- status : `pending`
- unlock : apres 4 completions de `Faire le choix du brut`
- time_of_day : `anytime`
- tracking_type : `boolean`
- cards_status : `not_started`
- description : acheter et preparer des collations saines pour qu'elles soient plus faciles a attraper que les produits industriels.

## Transformations A Venir

### 2. Atteindre le poids cible et stabiliser

- transformation_id : `0fa6384b-e8e4-4dd8-b2bd-e6ca8e58b08b`
- status : `pending`
- objectif : poursuivre jusqu'a 70 kg et ancrer durablement le nouveau mode de vie.

### 3. Degager du temps face a une charge de travail importante

- transformation_id : `ad03a105-3539-43ee-bb8b-12ee421afe74`
- status : `pending`
- objectif : liberer des moments dedies aux projets personnels sans surcharger Nina.

## Points QA Operations

- Blocage ponctuel attendu : Nina n'arrive pas a vider ses placards ou a choisir une collation brute aujourd'hui. Sophia doit clarifier la cible puis proposer `prepare_attack_card`, pas `adjust_plan_item`.
- Risque recurrent attendu : Nina decrit le meme pattern apres le travail, stress puis grignotage sucre. Sophia doit proposer `prepare_defense_card` si disponible.
- Ajustement plan legitime : Nina dit explicitement que l'action est trop dure durablement, qu'elle veut la remplacer, la reduire, la mettre en pause ou changer son rythme.
- Ambiguite : si Nina dit juste "tu peux me faire un truc pour ca ?", Sophia doit clarifier avant toute operation.
- Reponse visible : toujours nommer l'action cible et l'effet exact avant/apres execution.
