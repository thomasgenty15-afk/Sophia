# QA Run Report — Potion Support J2/J3 Intersession R1

## 1. Contexte Du Test

- Date: 2026-07-15
- Run: `potion_support_j2_j3_intersession_20260715_r1`
- Persona: compte temporaire `qa-skill`, connexion `all_skills_potion_support_j2_j3_intersession_20260715_r1`, user `62d5d48e-59ce-4d84-abd5-0e2ebcf5ea61`.
- Objectif: prolonger une potion d'apaisement de J1 vers J2 et J3, avec des messages intersession web et WhatsApp, puis vérifier le reducer cumulatif et les règles de reprise.
- Trajectoire: activation potion -> J1 -> fermeture locale -> mise à jour intersession web -> clarification de portée -> compression temporelle -> préparation J2.
- Surfaces visees: `activate-potion-v1`, slots dynamiques, `process-checkins`, reducer evidence-gated, curseur cross-channel, Presence, annulation de campagne.
- Cadre IA reel: Supabase local ; tours via `/functions/v1/test-send-message` avec `force_full_ai=true` ; ouverture via le vrai `process-checkins` ; aucun fallback déterministe, aucun correctif de code pendant le run.
- Validite QA: valide et exploitable. Le cron local a consommé J2 avant l'appel manuel, mais l'état durable et la décision du vrai scheduler ont été capturés. Nettoyage ciblé effectué.

## 2. Tours De Conversation

### Ouverture proactive J1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** sans objet

**User**
> Aucun message utilisateur : ouverture planifiée après la fenêtre calme.

**Sophia**
> Ta soutenance de mémoire mardi te met sous pression, et tu crains surtout de perdre le fil au début devant le jury. On peut se concentrer là-dessus, simplement, pour t’aider à garder un peu d’air avant le passage.

**Trace courte**
- http_status: 200
- response_owner: proactif hors dispatcher global
- selected_handler: `process-checkins` -> `potion-support-opening-v1`
- safety: none
- durable_effect: J1 `sent`, Presence armée, campagne active.

### Tour J1-1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** sans objet

**User**
> Oui, c’est vraiment le démarrage. Je sais ce que je veux dire, mais dès que j’imagine les regards du jury j’ai peur que ma première phrase sorte de travers et que tout le reste suive.

**Sophia**
> Sophia répond en Présence, reconnaît la peur du démarrage et propose une phrase d'ouverture simple et réutilisable.

**Trace courte**
- http_status: 200
- response_owner: `presence_conversation`
- selected_handler: `presence_conversation`
- route_reason: `active_presence_conversation`
- durable_effect: aucun effet produit.

### Tour J1-2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** sans objet

**User**
> Merci, cette phrase simple me donne un point de départ. Je vais couper pour ce soir et reprendre demain.

**Sophia**
> Réponse courte de clôture ; le flow local est libéré sans annuler la campagne.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- safety: none
- durable_effect: Presence fermée ; J2-J7 restent planifiés.

### Intersession J1 -> J2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` — mauvais owner sélectionné

**User**
> Petite mise à jour depuis hier : ma collègue a relu mon introduction avec moi. Le début est beaucoup plus clair maintenant, mais je me tends encore dès que je pense aux questions imprévues du jury.

**Sophia**
> Sophia bascule vers `coaching_recommendation` et propose de préparer une carte de défense, alors que le message est une mise à jour personnelle sans demande de feature.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- safety: none
- direct_effects: aucun
- durable_effect: aucun artefact créé.

**Analyse si yellow/red**
- Symptome: une mise à jour intersession est transformée en proposition produit.
- Source amont probable: arbitrage présence/coaching sur un récit de progression.
- Owner runtime: dispatcher et intake `coaching_recommendation`.
- Meilleure correction selon les guidelines: une mise à jour émotionnelle sans demande de levier reste en Présence ; le signal produit doit être explicite ou réellement demandé.
- Pourquoi ce n'est pas un patch local: le défaut concerne la frontière sémantique du domaine, pas cette formulation exacte.

### Clarification intersession

**Verdict du tour:** green au niveau conversationnel

**Famille de bugs si yellow/red:** sans objet sur ce tour ; la phrase révèle toutefois le défaut J2 suivant.

**User**
> Je ne veux pas préparer de carte ni créer quoi que ce soit, je voulais juste te tenir au courant. Je vais simplement faire un essai oral avec ma collègue demain.

**Sophia**
> Sophia respecte la correction, ne crée rien et répond sobrement.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- direct_effects: []
- durable_effect: aucun.

### Préparation proactive J2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-05` — sémantique composite aplatie

**User**
> Aucun nouveau message : le scheduler relit les messages intersession pour préparer J2.

**Sophia**
> Aucun message J2 envoyé.

**Trace courte**
- response_owner: reducer proactif potion
- selected_handler: `preparePotionSupportOpening`
- decision: `skip_user_boundary`
- anchor retenu: « La personne ne veut pas préparer de carte ni créer quoi que ce soit. »
- durable_effect: J2 `cancelled`, campagne archivée `cancelled_user_boundary`, J2-J7 annulés.

**Analyse si yellow/red**
- Symptome: une contrainte visant uniquement la carte proposée par Sophia annule toute la campagne potion.
- Source amont probable: le reducer extrait une boundary sans cible sémantique et l'applique au niveau campagne.
- Owner runtime: `preparePotionSupportOpening` / reducer intersession potion.
- Meilleure correction selon les guidelines: produire une boundary structurée avec une cible (`potion_campaign`, `feature`, `conversation`, `unknown`) ; seule une boundary explicitement ciblée sur la potion peut devenir `skip_user_boundary`.
- Pourquoi ce n'est pas un patch local: une liste de mots interdits recréerait le défaut sur les paraphrases ; la cible doit faire partie du contrat du reducer.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- J1 est contextualisé et la fermeture locale n'annule pas la campagne.
- La correction « je voulais juste te tenir au courant » est respectée sans effet durable.

**Problemes**
- Intersession J1->J2: proposition de carte non demandée. Famille: `BF-ROUTE-01`. Impact: l'utilisateur doit corriger Sophia.
- Préparation J2: la correction de portée devient un opt-out global invisible. Famille: `BF-INTAKE-05`. Impact: les rendez-vous attendus disparaissent.

**Fix propose**
- Source amont: arbitrage présence/coaching puis reducer de boundary potion.
- Correction recommandee: conserver la cible de chaque refus et interdire toute annulation de campagne quand le refus vise une feature ou une action ponctuelle.
- Tests d'invariant attendus: refus de carte, refus de rappel, refus de conseil et vrai opt-out potion, chacun avec paraphrases et anti-faux-positifs.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- J1 et sa fermeture sont corrects.
- La mise à jour intersession est mal ownée par `coaching_recommendation`.

**Skills / Operations / Tools**
- Aucun tool n'est exécuté malgré la proposition de carte ; la garde d'effet tient.
- Le cron local réel a pris J2 ; aucune reconstruction ou simulation de la décision n'a été utilisée.

**Memory / Effets durables**
- Le curseur cross-channel relit bien les messages web et WhatsApp.
- Le reducer capitalise toutefois une contrainte hors scope comme boundary globale, puis archive le reminder et annule tous les slots futurs.

**Problemes**
- J2: transition terminale incorrecte. Famille amont: `BF-INTAKE-05`. Impact système: campagne perdue et J3 impossible dans ce run.

**Fix propose**
- Source amont: schéma de sortie et validation post-LLM du reducer potion.
- Correction recommandee: boundary typée et ciblée, avec default-deny sur `skip_user_boundary` si la cible n'est pas explicitement la campagne.
- Tests d'invariant attendus: tests unitaires reducer + run réel J1/J2 où « ne crée pas de carte » conserve la campagne, et vrai « ne me relance plus pour cette potion » l'annule.

## Verdict Global

- Verdict: red
- Raison principale: J2 est annulé à tort parce qu'un refus de feature est aplati en boundary de campagne.
- Follow-up prioritaire: corriger le contrat de ciblage des boundaries, puis rerun J2/J3 avec messages intersession.
