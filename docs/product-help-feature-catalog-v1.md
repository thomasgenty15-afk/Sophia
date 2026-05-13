# Product Help Feature Catalog V1

Ce document decrit les fiches produit que `product_help` doit couvrir.

`product_help` n'est pas un outil d'execution. Il sert a expliquer une fonctionnalite Sophia, dire comment l'utiliser, ou elle se trouve, ce qu'elle apporte, et ce qu'elle ne fait pas.

Quand une vraie operation est possible, la fiche peut declarer un `operation_bridge`. Ce bridge ne doit exister que pour les operations conversationnelles explicitement supportees. Toutes les autres fiches restent explicatives.

## Regles Globales

- Pas de fiche `dashboard.navigation` separee.
- La navigation vit dans chaque fiche via `locations`, parce qu'une meme fonctionnalite peut apparaitre a plusieurs endroits.
- Pas d'intent `compare` structure. Si le user compare deux fonctionnalites, `product_help` repond naturellement avec les fiches disponibles.
- Pas de `start_flow` global. Utiliser `operation_bridge` uniquement quand une operation reelle existe.
- Ne pas inclure les outils purement conversationnels qui ne sont pas des surfaces plateforme.
- Ne jamais affirmer qu'une action a ete executee sans retour outil/flow confirme.
- Quand Sophia parle d'elle-meme, elle utilise la premiere personne du singulier (`je`), pas `Sophia`.

## Schema Cible

```ts
type ProductHelpIntent = "explain" | "how_to" | "benefits";

type ProductHelpFeature = {
  id: string;
  label: string;
  aliases: string[];

  explain: string;
  how_to: string;
  benefits: string[];

  locations: Array<{
    surface: string;
    when_visible: string;
    user_can_do: string[];
  }>;

  limits: string[];
  sophia_must_not_claim: string[];

  operation_bridge?: {
    skill_or_operation: string;
    trigger_phrases: string[];
    requires_confirmation: boolean;
  };
};
```

## Bridges Operationnels Autorises

Les noms exacts doivent rester alignes avec la taxonomie runtime, mais le perimetre produit est celui-ci :

```ts
type ProductHelpOperationBridge =
  | "adjust_plan"
  | "prepare_attack_card"
  | "prepare_defense_card"
  | "activate_potion"
  | "create_or_update_initiative"
  | "update_coach_preferences";
```

Une fiche sans bridge peut etre riche, utile et detaillee, mais elle ne doit pas lancer de flow.

## 1. `dashboard.plan`

**Label** : Plan

**Aliases** : plan, dashboard, tableau de bord, parcours, niveau, semaine, progression, bilan, bilans, saisie, ajouter une action, creer une action, suite verrouillee, semaines verrouillees, niveaux verrouilles

**Explain** : Le Plan est l'espace principal d'execution d'une transformation active. Il montre les niveaux du parcours, les semaines, les elements du plan et l'etat d'avancement.

**How to** : Aller dans le dashboard, selectionner une transformation dans la colonne de gauche, puis ouvrir l'onglet Plan. Le user y voit le niveau actif, les semaines, les missions, habitudes, clarifications et elements termines ou a venir. Les bilans hebdomadaires ne se saisissent pas dans le Plan : ils se font par message WhatsApp le dimanche pour faire le point sur la semaine. Il n'existe pas d'endroit pour ajouter librement une action dans le dashboard.

**Benefits**

- Donne une vue claire de ce qui est a faire maintenant.
- Evite de melanger les actions du moment avec toute la transformation.
- Montre les elements deja termines, actifs ou a venir, dont les semaines et niveaux futurs qui peuvent etre verrouilles.

**Locations**

- Surface : `Dashboard > Plan`
  - Visible quand : une transformation active existe.
  - User can do : consulter le niveau actif, ouvrir les semaines, valider certains elements, acceder a l'ajustement du plan.

**Limits**

- Ce n'est pas un journal libre d'actions ou de bilans.
- Il n'existe pas d'endroit pour ajouter librement une action dans le dashboard.
- Les bilans hebdomadaires se font par message WhatsApp le dimanche, pas par saisie libre dans le dashboard.
- Les changements structurels passent par l'ajustement du plan.
- Les verrouillages concernent les semaines ou niveaux a venir du Plan, pas un lancement de prochaine transformation.

**Sophia must not claim**

- Ne pas dire que le dashboard permet de saisir librement des actions ou bilans.
- Ne pas mentionner d'ancien objectif global supprime.
- Ne pas inventer une suite du parcours verrouillee.

## 2. `plan.clarifications`

**Label** : Clarifications

**Aliases** : clarification, exercice, fiche guidee, comprendre, blocage, support

**Explain** : Les clarifications sont des elements guides du plan qui aident a comprendre une situation, poser un repere ou clarifier un blocage avant d'agir.

**How to** : Dans le Plan, ouvrir une carte de type Clarification ou Exercice de clarification. Selon le contenu, le user peut ouvrir une fiche guidee ou un exercice structure.

**Benefits**

- Aide a ne pas executer trop vite quand le probleme est encore flou.
- Transforme une confusion en information exploitable.
- Donne un support plus cadre qu'une simple discussion.

**Locations**

- Surface : `Dashboard > Plan`
  - Visible quand : le plan contient un item de dimension `clarifications` ou `support`.
  - User can do : lire l'objectif, ouvrir la fiche ou l'exercice, sauvegarder puis completer l'element.

**Limits**

- Ne remplace pas un ajustement du plan si la structure globale ne convient plus.
- Ne doit pas etre presente comme une action libre creee par le user. 

**Sophia must not claim**

- Ne pas dire qu'une clarification a ete sauvegardee ou terminee sans confirmation UI/outil.

## 3. `plan.missions`

**Label** : Missions

**Aliases** : mission, action ponctuelle, action du plan, faire une action, action trop grosse, action trop lourde

**Explain** : Une mission est une action ponctuelle prevue par le plan pour faire avancer concretement la transformation.

**How to** : Dans le Plan, ouvrir la semaine ou le niveau actif, trouver la mission, puis utiliser le bouton de validation quand elle est faite.

**Benefits**

- Rend la transformation executable par petits gestes concrets.
- Evite de transformer le plan en reflexion abstraite.
- Permet de suivre l'avancement d'une action prevue.

**Locations**

- Surface : `Dashboard > Plan`
  - Visible quand : le plan contient des items de dimension `missions`.
  - User can do : consulter la mission, voir les ressources liees si elles existent, marquer comme fait.

**Limits**

- Le user ne cree pas ou ne supprime pas directement une mission depuis la carte.
- Si la mission n'est plus adaptee, passer par l'ajustement du plan.
- Si l'action est trop grosse, passer par `Ajuster le plan` et expliquer ce qui ne va pas ou ce qu'il faut modifier. Ne pas dire que le user peut ajuster directement au niveau de la carte action.

**Sophia must not claim**

- Ne pas dire qu'une mission a ete modifiee, supprimee ou remplacee sans flow d'ajustement confirme.

## 4. `plan.habits`

**Label** : Habitudes

**Aliases** : habitude, repetition, occurrence, ancrage, planning de semaine

**Explain** : Une habitude est un element repetitif du plan. Elle sert a installer un changement dans le quotidien au lieu de faire une action une seule fois.

**How to** : Dans le Plan, ouvrir l'habitude. Le user peut valider une occurrence, voir la progression d'ancrage, et acceder au planning de semaine si disponible.

**Benefits**

- Transforme une intention en repetition concrete.
- Suit les occurrences faites, ratees ou reportees.
- Aide a installer la transformation dans le rythme reel du user.

**Locations**

- Surface : `Dashboard > Plan`
  - Visible quand : le plan contient des items de dimension `habits`.
  - User can do : valider une occurrence, ouvrir le planning de semaine, voir l'ancrage.

**Limits**

- Ce n'est pas un tracker libre d'habitudes hors plan.
- Modifier la nature ou le rythme de l'habitude passe par l'ajustement du plan si le planning local ne suffit pas.

**Sophia must not claim**

- Ne pas dire qu'une habitude a ete validee, reportee ou replanifiee sans retour UI/outil.

## 5. `plan.adjustment`

**Label** : Ajustement du plan

**Aliases** : ajuster le plan, modifier le plan, adapter, trop lourd, trop facile, mauvais timing, changer une action, action trop grosse, action trop lourde, action est trop grosse, trop grosse

**Explain** : L'ajustement du plan sert quand le plan actuel ne colle plus : trop lourd, trop leger, mal place dans la semaine, invalide par une nouvelle information, ou plus adapte a la situation.

**How to** : Dans le Plan, utiliser le panneau `Ajuster le plan`. Le user explique ce qui ne va pas ou ce qu'il faut modifier ; j'analyse et je propose une modification du plan. Le changement ne se fait pas directement au niveau de la carte action.

**Benefits**

- Permet de corriger le plan sans repartir de zero.
- Evite les anciennes actions directes sur item comme supprimer/desactiver/signaler blocage.
- Garde une trace claire de la raison de l'ajustement.

**Locations**

- Surface : `Dashboard > Plan`
  - Visible quand : un plan actif V3 est ouvert.
  - User can do : decrire le probleme, demander une analyse, voir une proposition, valider ou continuer a clarifier selon le flow.

**Limits**

- Ne sert pas a simplement executer une action.
- Ne doit pas etre confondu avec une validation d'item.
- Ne pas dire que le user peut ajuster la mission ou l'habitude directement depuis la carte d'action.
- Ne doit pas promettre une modification si la proposition n'a pas ete validee/appliquee.

**Sophia must not claim**

- Ne pas dire que le plan a ete ajuste sans confirmation d'application.

**Operation bridge**

```ts
{
  skill_or_operation: "adjust_plan",
  trigger_phrases: [
    "ajuste mon plan",
    "modifie cette action",
    "ce plan est trop lourd",
    "cette mission ne colle plus",
    "il faut adapter la suite"
  ],
  requires_confirmation: true
}
```

## 6. `resources.overview`

**Label** : Ressources

**Aliases** : ressources, labo, appuis, cartes, potions, outils

**Explain** : Ressources regroupe les appuis concrets autour du plan : cartes de defense, cartes d'attaque, potions, et cartes liees aux missions ou habitudes.

**How to** : Ouvrir l'onglet Ressources depuis le dashboard. Les ressources liees au plan y sont rangees par niveau quand elles existent. Des ressources libres peuvent aussi exister selon les surfaces disponibles.

**Benefits**

- Centralise les appuis utiles au lieu de les disperser dans le chat.
- Permet de retrouver une carte apres sa generation.
- Separe les aides de preparation, de reaction et de regulation d'etat.

**Locations**

- Surface : `Dashboard > Ressources`
  - Visible quand : une transformation active V3 est ouverte.
  - User can do : consulter les cartes, generer certaines ressources, activer certaines potions, modifier/exporter selon le type.

**Limits**

- Ressources n'est pas le lieu pour modifier le plan.
- Toutes les ressources ne sont pas toujours disponibles si elles n'ont pas ete generees.

**Sophia must not claim**

- Ne pas dire qu'une ressource existe si elle n'a pas ete creee.

## 7. `resources.attack_card`

**Label** : Carte d'attaque

**Aliases** : carte d'attaque, attaque, preparation, friction, technique

**Explain** : Une carte d'attaque sert a preparer l'action en amont. Elle aide a rendre le bon geste plus simple, plus naturel et moins couteux au moment de passer a l'action. Elle peut s'appuyer sur 6 techniques : Le texte magique, Mantra de force, Ancre visuelle, Meditation de 5 minutes, Preparer le terrain, Mot de bascule.

**How to** : Depuis une mission ou une habitude, le user peut generer des cartes liees au plan si l'option est disponible. La carte d'attaque se retrouve ensuite dans Ressources, rangee par niveau. Processus : choisir la technique adaptee, repondre a son mini-questionnaire, generer l'objet concret, puis l'utiliser selon son mode d'emploi.

**Benefits**

- Reduit la friction avant l'action.
- Clarifie le premier geste et le mode d'emploi.
- Aide a preparer le terrain avant le moment critique.
- Permet de choisir entre 6 formats selon le besoin : texte de recadrage, mantra, repere visuel, visualisation, environnement prepare, ou mot-cle de bascule.

**Locations**

- Surface : `Dashboard > Plan`
  - Visible quand : une mission ou une habitude a des cartes liees pretes.
  - User can do : voir un apercu de la carte.
- Surface : `Dashboard > Ressources`
  - Visible quand : une carte d'attaque du plan a ete generee.
  - User can do : consulter la carte rangee par niveau.

**Limits**

- Ne remplace pas une carte de defense si le probleme est une impulsion ou un piege au moment meme.
- Ne remplace pas l'ajustement du plan si l'action elle-meme est mauvaise.

**Sophia must not claim**

- Ne pas dire qu'une carte d'attaque a ete creee sans succes outil/flow.

**Operation bridge**

```ts
{
  skill_or_operation: "prepare_attack_card",
  trigger_phrases: [
    "prepare une carte d'attaque",
    "aide-moi a preparer cette action",
    "rends cette mission plus facile a lancer"
  ],
  requires_confirmation: true
}
```

## 8. `resources.defense_card`

**Label** : Carte de defense

**Aliases** : carte de defense, defense, piege, impulsion, plan B, moment difficile

**Explain** : Une carte de defense sert quand quelque chose risque de faire derailler l'action : impulsion, piege, moment de faiblesse, pression, evitement ou reaction automatique.

**How to** : Une carte de defense peut etre generee librement depuis Ressources, ou etre liee au plan depuis une mission ou une habitude si les cartes ont ete generees. Elle se retrouve ensuite dans Ressources, ou elle peut etre consultee, modifiee ou exportee selon la carte. Processus : identifier un moment concret, reperer le piege observable, definir mon geste faisable en moins de 30 secondes, puis prevoir un plan B simple.

**Benefits**

- Donne une reponse simple pour les moments de risque.
- Anticipe les pieges concrets.
- Propose un geste ou un plan B applicable sur le moment.
- Structure la reponse en situation, signal/piege, mon geste et plan B.

**Locations**

- Surface : `Dashboard > Plan`
  - Visible quand : une mission ou habitude a une carte de defense liee.
  - User can do : voir un apercu, ouvrir l'edition dans Ressources.
- Surface : `Dashboard > Ressources`
  - Visible quand : une carte de defense existe, ou quand le user veut creer une carte libre.
  - User can do : creer une carte libre, consulter, modifier, exporter, retirer un declencheur si la carte le permet.

**Limits**

- Ne sert pas a modifier l'action du plan.
- Ne doit pas etre presentee comme une solution globale.

**Sophia must not claim**

- Ne pas dire qu'une carte de defense a ete creee ou modifiee sans succes outil/flow.

**Operation bridge**

```ts
{
  skill_or_operation: "prepare_defense_card",
  trigger_phrases: [
    "prepare une carte de defense",
    "j'ai besoin d'un plan B",
    "aide-moi pour le moment ou je risque de craquer"
  ],
  requires_confirmation: true
}
```

## 9. `resources.plan_cards`

**Label** : Cartes liees au plan

**Aliases** : cartes du plan, cartes liees, cartes de mission, cartes d'habitude, generer les cartes

**Explain** : Les cartes liees au plan sont des cartes d'attaque et de defense creees pour une mission ou une habitude precise. Elles restent attachees a cet element et sont rangees dans Ressources.

**How to** : Dans le Plan, certaines missions ou habitudes proposent de generer des ressources. Une fois generees, les cartes apparaissent sur l'item et dans Ressources par niveau.

**Benefits**

- Relie directement une ressource a une action concrete.
- Evite de chercher une carte hors contexte.
- Donne a la fois une aide de preparation et une aide de reaction.

**Locations**

- Surface : `Dashboard > Plan`
  - Visible quand : l'item de plan supporte des cartes et qu'elles sont generees ou generables.
  - User can do : generer les cartes, voir les apercus.
- Surface : `Dashboard > Ressources`
  - Visible quand : les cartes existent.
  - User can do : retrouver les cartes par niveau.

**Limits**

- Ne concerne pas tous les items du plan.
- Les clarifications ne sont pas le cas principal de generation de cartes.

**Sophia must not claim**

- Ne pas dire que toutes les actions ont automatiquement des cartes.

## 10. `resources.potions`

**Label** : Potions

**Aliases** : potion, etat interieur, reset, reguler, apaiser, confusion, pression, peur, suivi 7 jours, suivi de 7 jours

**Explain** : Une potion est un support court pour traverser un etat interieur quand il prend trop de place. Elle aide a revenir a un etat plus praticable maintenant et cree automatiquement une initiative de suivi sur 7 jours pour soutenir cet etat emotionnel. Types : anti-decrochage quand le user laisse filer, courage quand la peur ou l'evitement bloquent, guerison quand il s'en veut ou se sent blesse, clarte quand tout est flou, amour quand il est dur avec lui-meme, apaisement quand la pression monte.

**How to** : Ouvrir Ressources, choisir une potion disponible, puis l'activer ou la reactiver selon son etat. Certaines potions peuvent aussi avoir un suivi programme si le flow le permet.

**Benefits**

- Aide a redescendre ou se recentrer rapidement.
- Repond a un etat du moment sans refaire tout le plan.
- Cree un suivi de 7 jours via une initiative automatique.
- Peut soutenir une action quand l'etat interieur bloque l'execution.
- Aide a choisir la potion selon l'etat : decrochage, peur, honte/blessure, confusion, durete envers soi, ou stress.

**Locations**

- Surface : `Dashboard > Ressources`
  - Visible quand : les definitions de potions sont disponibles.
  - User can do : activer, reactiver, consulter l'usage, programmer un follow-up si disponible.

**Limits**

- Ce n'est pas une solution globale.
- Ne remplace pas safety si le risque monte.
- Ne remplace pas l'ajustement du plan si le probleme est structurel.
- Le suivi cree est une initiative de soutien sur 7 jours, pas une modification du plan.

**Sophia must not claim**

- Ne pas dire qu'une potion est activee sans succes outil/flow.

**Operation bridge**

```ts
{
  skill_or_operation: "activate_potion",
  trigger_phrases: [
    "active une potion",
    "j'ai besoin d'une potion",
    "aide-moi a changer d'etat maintenant"
  ],
  requires_confirmation: true
}
```

## 11. `inspirations`

**Label** : Inspirations

**Aliases** : inspirations, principes, histoire, recit, pourquoi profond, deep why

**Explain** : Inspirations regroupe des reperes narratifs et des principes lies au parcours. Cet espace aide a retrouver du sens, relire l'histoire du parcours et travailler certaines briques de Phase 1.

**How to** : Ouvrir l'onglet Inspirations depuis le dashboard. Selon l'etat du parcours, le user peut consulter le recit, preparer l'histoire, travailler le pourquoi profond ou relire des principes disponibles.

**Benefits**

- Redonne du contexte quand l'execution devient trop mecanique.
- Relie le plan a l'histoire et aux raisons du user.
- Sert de support de sens, pas de todo operationnelle.

**Locations**

- Surface : `Dashboard > Inspirations`
  - Visible quand : une transformation V3 est active.
  - User can do : consulter les contenus d'inspiration, preparer certaines briques de Phase 1 si disponibles.

**Limits**

- Ce n'est pas l'endroit pour modifier le plan.
- Ce n'est pas une action ou une initiative.

**Sophia must not claim**

- Ne pas renommer cet espace avec un ancien libelle.
- Ne pas dire qu'une inspiration a ete generee ou sauvegardee sans retour outil/UI.

## 12. `initiatives`

**Label** : Initiatives

**Aliases** : initiative, rendez-vous, rappel recurrent, initiative recurrente, message planifie, WhatsApp, relance

**Explain** : Une initiative est un message recurrent planifie que j'envoie. Elle contient une instruction, un contexte, une heure, des jours actifs et une destination : Plan actuel ou Base de vie.

**How to** : Ouvrir l'onglet Initiatives. C'est le seul endroit pour creer une initiative independamment d'une potion. Creer ou modifier une initiative en precisant ce que je dois envoyer, pourquoi c'est important, l'heure et les jours actifs.

**Benefits**

- Installe une presence utile dans le temps.
- Soutient une transformation sans obliger le user a revenir au dashboard.
- Peut vivre dans le plan actif ou hors plan dans la Base de vie.

**Locations**

- Surface : `Dashboard > Initiatives`
  - Visible quand : le user a acces aux fonctionnalites WhatsApp requises.
  - User can do : creer, modifier, activer/desactiver, archiver une initiative recurrente.
- Surface : `Base de vie > Initiatives`
  - Visible quand : l'initiative vit hors plan.
  - User can do : gerer les initiatives libres hors transformation active.

**Limits**

- Une initiative est recurrente, pas un outil conversationnel hors plateforme.
- Une initiative ne se cree pas depuis Habitudes ou depuis le Plan : hors potion, elle se cree dans l'onglet Initiatives.
- Certaines capacites peuvent etre verrouillees selon le plan d'acces.
- Les instructions doivent rester dans les contraintes safety/ethique.

**Sophia must not claim**

- Ne pas dire qu'une initiative a ete programmee sans succes outil/flow.
- Ne pas confondre initiative dashboard et outil conversationnel hors plateforme.

**Operation bridge**

```ts
{
  skill_or_operation: "create_or_update_initiative",
  trigger_phrases: [
    "cree une initiative",
    "programme un rendez-vous recurrent",
    "modifie cette initiative",
    "mets cette relance dans ma base de vie"
  ],
  requires_confirmation: true
}
```

## 13. `coach_preferences`

**Label** : Preferences coach

**Aliases** : preferences, ton, challenge, questions, style, douceur, directif

**Explain** : Les preferences coach permettent de regler ma maniere d'accompagner : ton global, niveau de challenge et tendance a poser des questions.

**How to** : Ouvrir Preferences depuis le dashboard. Modifier les options disponibles puis sauvegarder.

**Benefits**

- Rend l'accompagnement plus adapte au user.
- Clarifie si je dois etre plus douce, plus directe ou plus challengeante.
- Evite de repeter les memes preferences dans chaque conversation.

**Locations**

- Surface : `Dashboard > Preferences`
  - Visible quand : le user ouvre Preferences depuis la sidebar.
  - User can do : modifier le ton, le niveau de challenge, la tendance aux questions.

**Limits**

- Ne modifie pas le contenu du plan.
- Certaines preferences peuvent etre liees a des fonctionnalites verrouillees selon l'acces.

**Sophia must not claim**

- Ne pas dire qu'une preference est sauvegardee sans succes outil/UI.

**Operation bridge**

```ts
{
  skill_or_operation: "update_coach_preferences",
  trigger_phrases: [
    "change ton ton",
    "sois plus directe",
    "pose moins de questions",
    "challenge-moi plus"
  ],
  requires_confirmation: true
}
```

## 14. `base_de_vie`

**Label** : Base de vie

**Aliases** : base de vie, hors plan, transformation terminee, ressources conservees, arsenal, ligne verte, ligne rouge, declics

**Explain** : La Base de vie regroupe ce qui reste utile hors d'une transformation active : transformations terminees, lignes verte et rouge, declics de cloture et initiatives hors plan. Les ressources restent conservees dans l'historique de la transformation ; elles ne sont pas deplacees directement dans la Base de vie.

**How to** : Dans la sidebar du dashboard, choisir Base de vie. Le user peut consulter les transformations terminees et les elements de cloture. Les lignes verte et rouge sont remplies a la fin de chaque plan via le questionnaire de cloture. Les ressources restent dans l'historique de la transformation ; elles ne sont pas rangees directement dans la Base de vie.

**Benefits**

- Evite que tout disparaisse quand une transformation se termine.
- Conserve les lignes verte et rouge et les declics issus du questionnaire de cloture.
- Permet d'avoir des initiatives qui ne dependent pas d'une transformation active.

**Locations**

- Surface : `Dashboard sidebar > Base de vie`
  - Visible quand : le dashboard est accessible.
  - User can do : consulter les transformations terminees, ouvrir les details, gerer certaines informations de cloture.
- Surface : `Base de vie > Initiatives`
  - Visible quand : des initiatives hors plan existent ou peuvent etre creees.
  - User can do : gerer les initiatives libres si l'acces le permet.

**Limits**

- Ce n'est pas un deuxieme plan actif.
- Ce n'est pas l'endroit pour executer les missions du plan courant.
- Les ressources sont conservees dans l'historique de transformation, pas directement dans la Base de vie.

**Sophia must not claim**

- Ne pas dire qu'un element est entre en Base de vie tant que la cloture n'est pas faite.

## 15. `plan.level_completion`

**Label** : Fin de niveau

**Aliases** : terminer ce niveau, bilan de niveau, fin de niveau, passer au niveau suivant

**Explain** : La fin de niveau sert a valider qu'un niveau du plan est pret a etre boucle, puis a collecter un court bilan avant de passer a la suite.

**How to** : Dans le Plan, quand le niveau est pret ou que la fenetre de review est ouverte, utiliser le bloc de bilan de fin de niveau et repondre aux questions.

**Benefits**

- Evite de passer trop vite au niveau suivant.
- Me donne des informations pour ajuster la suite.
- Marque clairement la transition entre deux niveaux.

**Locations**

- Surface : `Dashboard > Plan`
  - Visible quand : le niveau est termine ou que la fenetre de review de fin de niveau est ouverte.
  - User can do : ouvrir le bilan, repondre aux questions, terminer le niveau.

**Limits**

- Ne sert pas a cloturer toute la transformation.
- Ne remplace pas l'ajustement du plan si le niveau n'est pas pret.

**Sophia must not claim**

- Ne pas dire qu'un niveau est termine si le bilan ou la validation n'a pas ete effectue.

## 16. `transformation.closure`

**Label** : Cloture de transformation

**Aliases** : cloturer la transformation, terminer la transformation, ligne rouge, ligne verte, declics, base de vie

**Explain** : La cloture de transformation intervient quand le user a atteint l'objectif global ou termine la transformation. Elle permet de valider les apprentissages importants avant de faire entrer la transformation dans la Base de vie.

**How to** : Dans le Plan, le bloc `Suite du parcours` ouvre le parcours de cloture quand le user a atteint l'objectif global ou termine la transformation. Le questionnaire permet de remplir la Ligne Verte, la Ligne Rouge et les Declics.

**Benefits**

- Donne une fin propre a la transformation.
- Transforme l'experience en reperes conservables.
- Prepare l'entree dans la Base de vie.

**Locations**

- Surface : `Dashboard > Plan`
  - Visible quand : le user a atteint l'objectif global ou termine la transformation.
  - User can do : ouvrir le rituel de cloture, valider les informations, faire entrer la transformation dans la Base de vie.

**Limits**

- Ne doit pas etre propose si l'objectif global n'est pas atteint et que la transformation n'est pas terminee.
- Ne remplace pas le passage au niveau suivant si seuls certains niveaux sont termines.

**Sophia must not claim**

- Ne pas dire qu'une transformation est en Base de vie avant cloture confirmee.

## 17. `transformation.transition`

**Label** : Transition vers la suite

**Aliases** : prochaine transformation, deuxieme transformation, suite du parcours, multi-part, relancer un parcours, ajouter une nouvelle transformation, nouvelle transformation

**Explain** : La transition gere le passage a une nouvelle transformation apres la cloture. Quand une transformation est terminee, le parcours pour mettre en place une nouvelle transformation s'ouvre automatiquement et le user se laisse guider. Le user peut aussi cliquer sur `Ajouter une nouvelle transformation` si besoin.

**How to** : A la fin d'une transformation, suivre le parcours guide qui s'ouvre automatiquement pour mettre en place la nouvelle transformation. Pour ajouter manuellement une autre transformation, cliquer sur `Ajouter une nouvelle transformation`. Le maximum est de 2 transformations actives en meme temps.

**Benefits**

- Permet d'enchainer proprement apres une cloture.
- Permet d'ajouter une autre transformation si un nouveau besoin doit passer devant.
- Garde la limite de 2 transformations actives lisible.

**Locations**

- Surface : `Parcours guide apres cloture / Ajouter une nouvelle transformation`
  - Visible quand : une transformation vient d'etre terminee, ou quand le user veut ajouter une transformation et n'a pas deja 2 transformations actives.
  - User can do : se laisser guider, choisir ou ajouter la prochaine transformation, voir si la limite de 2 transformations actives est atteinte.

**Limits**

- Ne remplace pas la cloture de transformation.
- Les verrouillages concernent seulement les semaines ou niveaux a venir dans le Plan.
- Le bloc `Suite du parcours` sert a la cloture ; il n'est pas le chemin de lancement d'une prochaine transformation.
- Le lancement apres cloture passe par le parcours guide automatique, ou par `Ajouter une nouvelle transformation`.

**Sophia must not claim**

- Ne pas inventer un statut de suite de parcours verrouillee.
- Ne pas dire que le bloc `Suite du parcours` peut etre verrouille.
- Ne pas dire que le chemin est `Dashboard > Plan > Suite du parcours` pour demarrer la prochaine transformation apres cloture.
- Ne pas depasser la limite de 2 transformations actives.
