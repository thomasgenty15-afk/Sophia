# Playbook refonte conversationnelle WhatsApp

## Objectif

Ce document sert de base de travail pour refondre le systeme conversationnel WhatsApp de Sophia autour du nouveau front, de la nouvelle structure data et du nouveau parcours client.

Il ne decrit pas encore toute l'implementation. Il fixe le vocabulaire, les choix d'architecture et les premieres decisions pour eviter de melanger tools, skills, appels DB, analyses et proactivite.

## Principe central

Sophia WhatsApp ne doit pas devenir un gros agent monolithique avec tous les tools et toutes les skills disponibles a chaque tour.

Le systeme cible doit fonctionner par orchestration :

```text
Evenement ou message user
  -> pre-analyse legere
  -> selection du contexte utile
  -> choix eventuel d'une skill
  -> tools LLM limites et explicites
  -> update memoire / trace / DB
```

## Distinction des briques

### Tools LLM

Un tool LLM est une action que Sophia peut declencher pendant une conversation.

Ces tools doivent etre peu nombreux, bien bornes, et principalement relies a des intentions explicites ou semi-explicites du user.

Tools LLM retenus a ce stade :

- `validate_action_occurrence`
  - Le user indique qu'une action a ete faite.
  - Exemples : "fait", "je l'ai fait", "done", reponse template positive.

- `mark_action_missed`
  - Le user indique qu'une action n'a pas ete faite.
  - Exemples : "pas fait", "j'ai rate", reponse template negative.

- `mark_action_partial`
  - Le user indique qu'une action a ete faite partiellement.
  - Exemples : "a moitie", "j'ai commence mais pas fini".

- `create_sophia_rendezvous` ou equivalent existant
  - Le user demande a Sophia de revenir vers lui a un moment donne.
  - Le nom exact doit etre aligne avec l'outil deja existant.
  - Ce n'est pas un rendez-vous au sens calendrier humain, mais une demande de contact proactif planifie.

Point ouvert :

- `set_cheerleader_mode`
  - Potentiellement utile, mais le mode cheerleader doit d'abord etre defini precisement avant d'en faire un tool.

### Appels DB

Les appels DB ne sont pas forcement des tools LLM.

Ils servent a recuperer les faits necessaires avant une proactive, avant une reponse, avant une skill, ou avant l'execution d'un tool.

Exemples de contextes a recuperer :

- actions du jour ;
- actions non validees ;
- planning de semaine ;
- detail d'une action ;
- historique de validations / rates ;
- cartes liees a une action ;
- potions utilisees ;
- pourquoi profond / histoire ;
- trace de conversation focus ;
- preferences user.

Decision actuelle :

Ces appels doivent etre pilotes par le backend, le scheduler, le dispatcher ou la skill active. Ils ne doivent pas etre tous exposes au modele comme tools disponibles a chaque tour.

### Analyses sans IA

Les analyses sans IA sont des calculs deterministes sur la DB.

Exemples :

- action due aujourd'hui ;
- action non validee le soir ;
- streak courant ;
- missed streak ;
- contact eligibility ;
- cooldown anti-spam ;
- progression de semaine ;
- fin de niveau ;
- etat d'engagement simple.

Decision actuelle :

Ces analyses doivent rester testables et predictibles. Elles ne doivent pas dependre d'un LLM quand une regle claire suffit.

### Analyses avec IA

Les analyses avec IA doivent etre reservees aux cas qualitatifs ou ambigus.

Exemples :

- classifier pourquoi une action n'a pas ete faite ;
- mettre a jour une trace de discussion focus ;
- detecter un changement de sujet ;
- choisir entre plusieurs recommandations possibles ;
- formuler un message personnalise ;
- preparer un pre-remplissage de carte.

Decision actuelle :

Ces appels IA ne doivent pas ecrire directement en DB. Ils produisent une sortie structuree, puis le systeme decide quoi enregistrer ou proposer.

### Skills

Une skill est un playbook conversationnel ou proactif.

Elle ne doit pas etre confondue avec un tool. Une skill peut utiliser des appels DB, des analyses, et parfois des tools LLM.

Skills prioritaires a discuter :

- `morning_action_encouragement`
- `evening_action_check`
- `missed_action_diagnostic`
- `missed_streak_recovery`
- `dashboard_feature_router`

Decision actuelle :

Les skills doivent etre activees par le systeme selon le contexte, pas exposees comme commandes visibles au user. Le user controle surtout le consentement : continuer, pause, changer de sujet, arreter, activer plus de presence.

## Proactivite cible

La proactivite doit etre centree sur les actions datees et l'avancement reel du user.

Premiers cas cibles :

- Matin : si une action est prevue aujourd'hui, Sophia envoie un encouragement court.
- Soir : si une action prevue aujourd'hui n'est pas validee, Sophia fait un check rapide et fun.
- Dimanche : Sophia aide a valider la semaine a venir.
- Dimanche soir : Sophia peut envoyer le planning de la semaine.
- Apres modification du planning : Sophia peut renvoyer le planning mis a jour.
- Missed streak : Sophia passe d'un simple check a une logique de diagnostic ou de recuperation.

## Ce qu'on garde de l'infra existante

Principes a conserver :

- webhook WhatsApp ;
- gestion opt-in / opt-out ;
- pending actions ;
- scheduled checkins ;
- watcher ;
- memorizer ;
- winback ;
- validation d'action depuis le chat ;
- outil de rappel / contact planifie existant.

## Ce qu'on veut retirer ou remplacer

Elements a supprimer ou refondre :

- bilans quotidiens ;
- bilan de fin de semaine tel qu'il existe aujourd'hui ;
- memory echo ;
- morning nudge actuel si celui-ci fait doublon avec les encouragements bases sur les actions datees.

## Points ouverts

- Definition precise du mode cheerleader.
- Nom et contrat exact du tool existant de rappel / contact planifie.
- Regles de matching quand le user dit "fait" hors template et qu'il y a plusieurs actions possibles aujourd'hui.
- Gestion de deux plans en parallele.
- Definition exacte des traces de discussion focus.
- Niveau de complexite acceptable pour `missed_action_diagnostic`.
- Quand proposer carte de defense, carte d'attaque ou potion.
- Comment renvoyer vers le dashboard sans creer de boucles conversationnelles.

