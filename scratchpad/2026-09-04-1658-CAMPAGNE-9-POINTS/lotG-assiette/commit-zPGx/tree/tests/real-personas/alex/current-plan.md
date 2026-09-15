# Alex Current Plan

Source : base locale Supabase, `generate-plan-v2`.

## Identifiants

- user_id : `9e165f02-6314-403b-8f01-27c0485c4aa2`
- cycle_id : `14c636ab-a639-47f6-afa1-a8733a80f625`
- transformation_id : `a6834947-a5f8-4621-80f6-be11b5eb377e`
- plan_id : `6947a352-42e6-44a6-9d9f-2d82bf096fce`
- status : `active`
- plan genere / active : 2026-05-06

## Transformation Active

**Titre** : Apaiser son esprit pour s'endormir sereinement

**Objectif global** : s'endormir regulierement en moins de 20 minutes sans ressentir le besoin d'etre physiquement epuise.

**Situation de depart** :

- temps d'endormissement estime : 90 minutes
- cible : 20 minutes
- probleme principal : cerveau qui ne s'arrete pas au coucher
- moteurs probables : idees creatives, ecrans, organisation, listes de choses a faire
- obstacle principal : peur de rater quelque chose ou d'oublier

**Contrainte produit importante** : ne jamais forcer le sommeil en restant frustre dans le lit, et ne pas imposer un rythme rigide trop vite.

## Niveau Actuel

**Titre** : Installer un sas de dechargement mental

**Objectif du niveau** : creer une rupture claire entre la journee active et la nuit en vidant la tete sur papier.

**Pourquoi maintenant** : tant que le cerveau d'Alex a peur d'oublier des choses, il lutte contre le sommeil. Le premier verrou est donc d'externaliser les pensees avant d'aller au lit.

**Heartbeat** :

- titre : Soirs avec sas de dechargement
- cible : 6 soirs / semaine
- unite : soirs/semaine
- mode : inferred

## Items Actifs Et A Venir

### 1. Préparer ta zone de déchargement

- id : `a6da07a3-55f0-463c-8ed0-c1d5a7f7961e`
- dimension : `missions`
- kind : `task`
- status : `active`
- time_of_day : `evening`
- description : choisir un carnet physique et un stylo, les poser hors de la chambre ou loin du lit, fixer une heure de coupure idealement 45 minutes avant l'heure visee de sommeil.

### 2. Faire le sas de déchargement

- id : `dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`
- dimension : `habits`
- kind : `habit`
- status : `active`
- target_reps : 6
- current_reps : 0
- cadence : 6 soirs / semaine
- time_of_day : `evening`
- description : a l'heure de coupure, arreter les ecrans stimulants, prendre 5 minutes avec le carnet, noter to-do du lendemain, idees de projets et choses a ne pas oublier.

### 3. Repérer les pièges de l'hypervigilance

- id : `8d321c6c-ce4b-440f-b7b1-69e1a17ff835`
- dimension : `clarifications`
- kind : `exercise`
- status : `pending`
- unlock : apres 3 completions du sas de dechargement
- but : identifier les pensees ou envies qui poussent Alex a rallumer un ecran ou retravailler apres le sas.

### 4. Bilan et ajustement du sas

- id : `793bdd4a-c2fb-40fa-b972-e58b8659658f`
- dimension : `missions`
- kind : `task`
- status : `pending`
- unlock : apres 8 completions du sas de dechargement
- but : verifier si l'heure de coupure est realiste et si le carnet suffit a rassurer Alex.

## Points De Verification Quotidiens

- Matin : Sophia demande-t-elle comment s'est passe le sas ou le coucher sans culpabiliser ?
- Tracking : ce check-in doit etre identifiable comme `event_context=action_morning_followup_v2`, `origin=action_followup`, `message_payload.checkin_kind=action_morning_followup`.
- Matin : Sophia relie-t-elle le feedback a l'action active ou reste-t-elle generique ?
- Soir : Sophia aide-t-elle a lancer le carnet / la coupure ecrans ?
- Soir : Sophia propose-t-elle une version minimale si Alex est fatigue ?
- Apres plusieurs jours : les clarifications restent-elles verrouillees tant que le sas n'a pas assez de completions ?
- Memoire : les faits de sommeil restent-ils contextualises, sans figer Alex en "insomniaque" identitaire ?
