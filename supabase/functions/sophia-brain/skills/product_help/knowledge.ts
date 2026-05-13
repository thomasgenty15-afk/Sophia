export type ProductHelpIntent = "explain" | "how_to" | "benefits";

export type ProductHelpLocation = {
  surface: string;
  when_visible: string;
  user_can_do: string[];
};

export type ProductHelpOperationBridge = {
  skill_or_operation:
    | "adjust_plan"
    | "prepare_attack_card"
    | "prepare_defense_card"
    | "activate_potion"
    | "create_or_update_initiative"
    | "update_coach_preferences";
  trigger_phrases: string[];
  requires_confirmation: boolean;
};

export type ProductHelpFeature = {
  id: string;
  label: string;
  aliases: string[];
  explain: string;
  how_to: string;
  benefits: string[];
  locations: ProductHelpLocation[];
  limits: string[];
  sophia_must_not_claim: string[];
  operation_bridge?: ProductHelpOperationBridge;
};

export const PRODUCT_HELP_FEATURES: ProductHelpFeature[] = [
  {
    id: "dashboard.plan",
    label: "Plan",
    aliases: [
      "plan",
      "dashboard",
      "tableau de bord",
      "espace",
      "mon espace",
      "espace sophia",
      "parcours",
      "niveau",
      "semaine",
      "progression",
      "bilan",
      "bilans",
      "saisie",
      "ajouter une action",
      "creer une action",
      "suite verrouillee",
      "suite verrouillée",
      "semaines verrouillees",
      "niveaux verrouilles",
    ],
    explain:
      "Le Plan est l'espace principal d'execution d'une transformation active. Il montre les niveaux, les semaines, les elements du plan et l'avancement.",
    how_to:
      "Dans le dashboard, selectionne une transformation dans la colonne de gauche puis ouvre l'onglet Plan. Tu y vois le niveau actif, les semaines, les missions, habitudes, clarifications et elements a venir. Les bilans hebdomadaires ne se saisissent pas dans le Plan: ils se font par message WhatsApp le dimanche pour faire le point sur la semaine. Il n'existe pas d'endroit pour ajouter librement une action dans le dashboard.",
    benefits: [
      "Donne une vue claire de ce qui est a faire maintenant.",
      "Evite de melanger les actions du moment avec toute la transformation.",
      "Montre ce qui est termine, actif ou a venir, dont les semaines et niveaux futurs qui peuvent etre verrouilles.",
    ],
    locations: [{
      surface: "Dashboard > Plan",
      when_visible: "Quand une transformation active existe.",
      user_can_do: [
        "consulter le niveau actif",
        "ouvrir les semaines",
        "valider certains elements",
        "acceder a l'ajustement du plan",
      ],
    }],
    limits: [
      "Ce n'est pas un journal libre d'actions ou de bilans.",
      "Il n'existe pas d'endroit pour ajouter librement une action dans le dashboard.",
      "Les bilans hebdomadaires se font par message WhatsApp le dimanche, pas par saisie libre dans le dashboard.",
      "Les changements structurels passent par l'ajustement du plan.",
      "Les verrouillages concernent les semaines ou niveaux a venir du Plan, pas un lancement de prochaine transformation.",
    ],
    sophia_must_not_claim: [
      "Ne pas dire que le dashboard permet de saisir librement des actions ou bilans.",
      "Ne pas mentionner d'ancien objectif global supprime.",
      "Ne pas inventer une suite du parcours verrouillee.",
    ],
  },
  {
    id: "plan.clarifications",
    label: "Clarifications",
    aliases: [
      "clarification",
      "clarifications",
      "exercice",
      "fiche guidee",
      "comprendre",
      "blocage",
      "support",
    ],
    explain:
      "Les clarifications sont des elements guides du plan pour comprendre une situation, poser un repere ou clarifier un blocage avant d'agir.",
    how_to:
      "Dans le Plan, ouvre une carte de type Clarification ou Exercice de clarification. Selon l'item, tu peux ouvrir une fiche guidee ou un exercice structure.",
    benefits: [
      "Aide a ne pas executer trop vite quand le probleme est encore flou.",
      "Transforme une confusion en information exploitable.",
      "Donne un support plus cadre qu'une simple discussion.",
    ],
    locations: [{
      surface: "Dashboard > Plan",
      when_visible:
        "Quand le plan contient un item de dimension clarifications ou support.",
      user_can_do: [
        "lire l'objectif",
        "ouvrir la fiche ou l'exercice",
        "sauvegarder puis completer l'element",
      ],
    }],
    limits: [
      "Ne remplace pas un ajustement du plan si la structure globale ne convient plus.",
      "Ne doit pas etre presente comme une action libre creee par le user.",
    ],
    sophia_must_not_claim: [
      "Ne pas dire qu'une clarification a ete sauvegardee ou terminee sans confirmation UI ou outil.",
    ],
  },
  {
    id: "plan.missions",
    label: "Missions",
    aliases: [
      "mission",
      "missions",
      "action ponctuelle",
      "action du plan",
      "faire une action",
      "action trop grosse",
      "action trop lourde",
    ],
    explain:
      "Une mission est une action ponctuelle prevue par le plan pour faire avancer concretement la transformation.",
    how_to:
      "Dans le Plan, ouvre la semaine ou le niveau actif, trouve la mission, puis valide-la quand elle est faite.",
    benefits: [
      "Rend la transformation executable par petits gestes concrets.",
      "Evite de transformer le plan en reflexion abstraite.",
      "Permet de suivre l'avancement d'une action prevue.",
    ],
    locations: [{
      surface: "Dashboard > Plan",
      when_visible: "Quand le plan contient des items de dimension missions.",
      user_can_do: [
        "consulter la mission",
        "voir les ressources liees si elles existent",
        "marquer comme fait",
      ],
    }],
    limits: [
      "Le user ne cree pas ou ne supprime pas directement une mission depuis la carte.",
      "Si la mission n'est plus adaptee, passer par l'ajustement du plan.",
      "Si l'action est trop grosse, il faut passer par Ajuster le plan et expliquer ce qui ne va pas ou ce qu'il faut modifier; ne pas dire que le user peut ajuster directement au niveau de la carte action.",
    ],
    sophia_must_not_claim: [
      "Ne pas dire qu'une mission a ete modifiee, supprimee ou remplacee sans flow d'ajustement confirme.",
    ],
  },
  {
    id: "plan.habits",
    label: "Habitudes",
    aliases: [
      "habitude",
      "habitudes",
      "repetition",
      "occurrence",
      "ancrage",
      "planning de semaine",
    ],
    explain:
      "Une habitude est un element repetitif du plan. Elle sert a installer un changement dans le quotidien au lieu de faire une action une seule fois.",
    how_to:
      "Dans le Plan, ouvre l'habitude. Tu peux valider une occurrence, voir la progression d'ancrage et acceder au planning de semaine si disponible.",
    benefits: [
      "Transforme une intention en repetition concrete.",
      "Suit les occurrences faites, ratees ou reportees.",
      "Aide a installer la transformation dans le rythme reel du user.",
    ],
    locations: [{
      surface: "Dashboard > Plan",
      when_visible: "Quand le plan contient des items de dimension habits.",
      user_can_do: [
        "valider une occurrence",
        "ouvrir le planning de semaine",
        "voir l'ancrage",
      ],
    }],
    limits: [
      "Ce n'est pas un tracker libre d'habitudes hors plan.",
      "Modifier la nature ou le rythme de l'habitude passe par l'ajustement du plan si le planning local ne suffit pas.",
    ],
    sophia_must_not_claim: [
      "Ne pas dire qu'une habitude a ete validee, reportee ou replanifiee sans retour UI ou outil.",
    ],
  },
  {
    id: "plan.adjustment",
    label: "Ajustement du plan",
    aliases: [
      "ajuster",
      "ajustement",
      "modifier le plan",
      "adapter",
      "trop lourd",
      "trop facile",
      "mauvais timing",
      "changer une action",
      "action trop grosse",
      "action trop lourde",
      "action est trop grosse",
      "trop grosse",
    ],
    explain:
      "L'ajustement du plan sert quand le plan ne colle plus: trop lourd, trop leger, mal place, invalide par une nouvelle information ou plus adapte.",
    how_to:
      "Dans le Plan, utilise le panneau Ajuster le plan. Le user explique ce qui ne va pas ou ce qu'il faut modifier; j'analyse puis je propose une modification du plan. Le changement ne se fait pas directement au niveau de la carte action.",
    benefits: [
      "Corrige le plan sans repartir de zero.",
      "Remplace les anciennes actions directes sur item comme supprimer, desactiver ou signaler blocage.",
      "Garde une raison claire pour l'ajustement.",
    ],
    locations: [{
      surface: "Dashboard > Plan",
      when_visible: "Quand un plan actif V3 est ouvert.",
      user_can_do: [
        "decrire le probleme",
        "demander une analyse",
        "voir une proposition",
        "valider ou clarifier selon le flow",
      ],
    }],
    limits: [
      "Ne sert pas a simplement executer une action.",
      "Ne doit pas etre confondu avec une validation d'item.",
      "Ne pas dire que le user peut ajuster la mission ou l'habitude directement depuis la carte d'action.",
      "Ne doit pas promettre une modification si la proposition n'a pas ete validee ou appliquee.",
    ],
    sophia_must_not_claim: [
      "Ne pas dire que le plan a ete ajuste sans confirmation d'application.",
    ],
    operation_bridge: {
      skill_or_operation: "adjust_plan",
      trigger_phrases: [
        "ajuste mon plan",
        "modifie cette action",
        "ce plan est trop lourd",
        "cette mission ne colle plus",
        "il faut adapter la suite",
      ],
      requires_confirmation: true,
    },
  },
  {
    id: "resources.overview",
    label: "Ressources",
    aliases: ["ressources", "labo", "appuis", "cartes", "potions", "outils"],
    explain:
      "Ressources regroupe les appuis concrets autour du plan: cartes de defense, cartes d'attaque, potions et cartes liees aux missions ou habitudes.",
    how_to:
      "Ouvre l'onglet Ressources depuis le dashboard. Les ressources liees au plan y sont rangees par niveau quand elles existent.",
    benefits: [
      "Centralise les appuis utiles au lieu de les disperser dans le chat.",
      "Permet de retrouver une carte apres sa generation.",
      "Separe les aides de preparation, de reaction et de regulation d'etat.",
    ],
    locations: [{
      surface: "Dashboard > Ressources",
      when_visible: "Quand une transformation active V3 est ouverte.",
      user_can_do: [
        "consulter les cartes",
        "generer certaines ressources",
        "activer certaines potions",
        "exporter certains elements selon le type",
      ],
    }],
    limits: [
      "Ressources n'est pas le lieu pour modifier le plan.",
      "Toutes les ressources ne sont pas toujours disponibles si elles n'ont pas ete generees.",
    ],
    sophia_must_not_claim: [
      "Ne pas dire qu'une ressource existe si elle n'a pas ete creee.",
    ],
  },
  {
    id: "resources.attack_card",
    label: "Carte d'attaque",
    aliases: [
      "carte d'attaque",
      "attaque",
      "preparation",
      "friction",
      "technique",
    ],
    explain:
      "Une carte d'attaque sert a preparer l'action en amont. Elle rend le bon geste plus simple, plus naturel et moins couteux au moment de passer a l'action. Elle peut s'appuyer sur 6 techniques: Le texte magique, Mantra de force, Ancre visuelle, Meditation de 5 minutes, Preparer le terrain, Mot de bascule.",
    how_to:
      "Depuis une mission ou une habitude, tu peux generer des cartes liees au plan si l'option est disponible. La carte d'attaque se retrouve ensuite dans Ressources, rangee par niveau. Processus: choisir la technique adaptee, repondre a son mini-questionnaire, generer l'objet concret, puis l'utiliser selon son mode d'emploi.",
    benefits: [
      "Reduit la friction avant l'action.",
      "Clarifie le premier geste et le mode d'emploi.",
      "Aide a preparer le terrain avant le moment critique.",
      "Permet de choisir entre 6 formats selon le besoin: texte de recadrage, mantra, repere visuel, visualisation, environnement prepare, ou mot-cle de bascule.",
    ],
    locations: [
      {
        surface: "Dashboard > Plan",
        when_visible:
          "Quand une mission ou une habitude a des cartes liees pretes.",
        user_can_do: ["voir un apercu de la carte"],
      },
      {
        surface: "Dashboard > Ressources",
        when_visible: "Quand une carte d'attaque du plan a ete generee.",
        user_can_do: [
          "consulter la carte rangee par niveau",
          "gerer les cartes libres si disponible",
        ],
      },
    ],
    limits: [
      "Ne remplace pas une carte de defense si le probleme est une impulsion ou un piege au moment meme.",
      "Ne remplace pas l'ajustement du plan si l'action elle-meme est mauvaise.",
      "Une carte d'attaque generee ne se modifie pas librement; seul le mot d'une carte Mot de bascule peut etre remplace depuis Ressources. Si le contexte, la technique ou le contenu ne convient plus, il faut preparer une nouvelle version apres confirmation.",
    ],
    sophia_must_not_claim: [
      "Ne pas dire qu'une carte d'attaque a ete creee sans succes outil ou flow.",
      "Ne pas dire qu'une carte d'attaque peut etre modifiee librement.",
    ],
    operation_bridge: {
      skill_or_operation: "prepare_attack_card",
      trigger_phrases: [
        "prepare une carte d'attaque",
        "aide-moi a preparer cette action",
        "rends cette mission plus facile a lancer",
      ],
      requires_confirmation: true,
    },
  },
  {
    id: "resources.defense_card",
    label: "Carte de defense",
    aliases: [
      "carte de defense",
      "defense",
      "piege",
      "impulsion",
      "plan b",
      "moment difficile",
    ],
    explain:
      "Une carte de defense sert quand quelque chose risque de faire derailler l'action: impulsion, piege, pression, evitement ou reaction automatique.",
    how_to:
      "Une carte de defense peut etre generee librement depuis Ressources, ou etre liee au plan depuis une mission ou une habitude. Elle se retrouve ensuite dans Ressources, ou elle peut etre consultee et utilisee. Processus: identifier un moment concret, reperer le piege observable, definir mon geste faisable en moins de 30 secondes, puis prevoir un plan B simple.",
    benefits: [
      "Donne une reponse simple pour les moments de risque.",
      "Anticipe les pieges concrets.",
      "Propose un geste ou un plan B applicable sur le moment.",
      "Structure la reponse en situation, signal/piege, mon geste et plan B.",
    ],
    locations: [
      {
        surface: "Dashboard > Plan",
        when_visible:
          "Quand une mission ou habitude a une carte de defense liee.",
        user_can_do: ["voir un apercu", "retrouver la carte dans Ressources"],
      },
      {
        surface: "Dashboard > Ressources",
        when_visible:
          "Quand une carte de defense existe, ou quand le user veut creer une carte libre.",
        user_can_do: [
          "creer une carte libre",
          "consulter",
          "exporter",
          "ajuster la carte depuis la plateforme quand l'option est disponible",
          "retirer un declencheur si la carte le permet",
        ],
      },
    ],
    limits: [
      "Ne sert pas a modifier l'action du plan.",
      "Ne doit pas etre presentee comme une solution globale.",
      "Une carte de defense peut etre ajustee depuis la plateforme/Ressources quand l'option est disponible. Depuis le chat, Sophia ne modifie pas une carte existante; si son contenu ne convient plus, il faut en preparer une nouvelle version apres confirmation.",
    ],
    sophia_must_not_claim: [
      "Ne pas dire qu'une carte de defense a ete creee ou modifiee sans succes outil ou flow.",
      "Ne pas dire qu'une carte de defense peut etre modifiee directement depuis le chat.",
    ],
    operation_bridge: {
      skill_or_operation: "prepare_defense_card",
      trigger_phrases: [
        "prepare une carte de defense",
        "j'ai besoin d'un plan b",
        "aide-moi pour le moment ou je risque de craquer",
      ],
      requires_confirmation: true,
    },
  },
  {
    id: "resources.plan_cards",
    label: "Cartes liees au plan",
    aliases: [
      "cartes du plan",
      "cartes liees",
      "carte liee",
      "liee a une mission",
      "liee au plan",
      "apres generation",
      "apres la generation",
      "cartes de mission",
      "cartes d'habitude",
      "generer les cartes",
    ],
    explain:
      "Les cartes liees au plan sont des cartes d'attaque et de defense creees pour une mission ou une habitude precise.",
    how_to:
      "Dans le Plan, certaines missions ou habitudes proposent de generer des ressources. Une fois generees, les cartes apparaissent sur l'item et dans Ressources par niveau.",
    benefits: [
      "Relie directement une ressource a une action concrete.",
      "Evite de chercher une carte hors contexte.",
      "Donne a la fois une aide de preparation et une aide de reaction.",
    ],
    locations: [
      {
        surface: "Dashboard > Plan",
        when_visible:
          "Quand l'item de plan supporte des cartes et qu'elles sont generees ou generables.",
        user_can_do: ["generer les cartes", "voir les apercus"],
      },
      {
        surface: "Dashboard > Ressources",
        when_visible: "Quand les cartes existent.",
        user_can_do: ["retrouver les cartes par niveau"],
      },
    ],
    limits: [
      "Ne concerne pas tous les items du plan.",
      "Les clarifications ne sont pas le cas principal de generation de cartes.",
    ],
    sophia_must_not_claim: [
      "Ne pas dire que toutes les actions ont automatiquement des cartes.",
    ],
  },
  {
    id: "resources.potions",
    label: "Potions",
    aliases: [
      "potion",
      "potions",
      "etat interieur",
      "suivi 7 jours",
      "suivi de 7 jours",
      "reset",
      "reguler",
      "apaiser",
      "confusion",
      "pression",
      "peur",
    ],
    explain:
      "Une potion est un support court pour traverser un etat interieur quand il prend trop de place. Elle cree automatiquement une initiative de suivi sur 7 jours pour soutenir cet etat emotionnel. Types: anti-decrochage quand le user laisse filer, courage quand la peur ou l'evitement bloquent, guerison quand il s'en veut ou se sent blesse, clarte quand tout est flou, amour quand il est dur avec lui-meme, apaisement quand la pression monte.",
    how_to:
      "Ouvre Ressources, choisis une potion disponible, puis active-la ou reactive-la selon son etat. L'activation cree aussi le suivi de 7 jours.",
    benefits: [
      "Aide a redescendre ou se recentrer rapidement.",
      "Repond a un etat du moment sans refaire tout le plan.",
      "Cree un suivi de 7 jours via une initiative automatique.",
      "Peut soutenir une action quand l'etat interieur bloque l'execution.",
      "Aide a choisir la potion selon l'etat: decrochage, peur, honte/blessure, confusion, durete envers soi, ou stress.",
    ],
    locations: [{
      surface: "Dashboard > Ressources",
      when_visible: "Quand les definitions de potions sont disponibles.",
      user_can_do: [
        "activer",
        "reactiver",
        "consulter l'usage",
        "programmer ou recevoir le suivi si disponible",
      ],
    }],
    limits: [
      "Ce n'est pas une solution globale.",
      "Ne remplace pas safety si le risque monte.",
      "Ne remplace pas l'ajustement du plan si le probleme est structurel.",
      "Le suivi cree est une initiative de soutien sur 7 jours, pas une modification du plan.",
    ],
    sophia_must_not_claim: [
      "Ne pas dire qu'une potion est activee sans succes outil ou flow.",
    ],
    operation_bridge: {
      skill_or_operation: "activate_potion",
      trigger_phrases: [
        "active une potion",
        "j'ai besoin d'une potion",
        "aide-moi a changer d'etat maintenant",
      ],
      requires_confirmation: true,
    },
  },
  {
    id: "inspirations",
    label: "Inspirations",
    aliases: [
      "inspiration",
      "inspirations",
      "principes",
      "histoire",
      "recit",
      "pourquoi profond",
      "deep why",
    ],
    explain:
      "Inspirations regroupe des reperes narratifs et des principes lies au parcours. Cet espace aide a retrouver du sens et relire l'histoire du parcours.",
    how_to:
      "Ouvre l'onglet Inspirations depuis le dashboard. Selon l'etat du parcours, tu peux consulter le recit, preparer l'histoire, travailler le pourquoi profond ou relire des principes.",
    benefits: [
      "Redonne du contexte quand l'execution devient trop mecanique.",
      "Relie le plan a l'histoire et aux raisons du user.",
      "Sert de support de sens, pas de todo operationnelle.",
    ],
    locations: [{
      surface: "Dashboard > Inspirations",
      when_visible: "Quand une transformation V3 est active.",
      user_can_do: [
        "consulter les contenus d'inspiration",
        "preparer certaines briques de Phase 1 si disponibles",
      ],
    }],
    limits: [
      "Ce n'est pas l'endroit pour modifier le plan.",
      "Ce n'est pas une action ou une initiative.",
    ],
    sophia_must_not_claim: [
      "Ne pas renommer cet espace avec un ancien libelle.",
      "Ne pas dire qu'une inspiration a ete generee ou sauvegardee sans retour outil ou UI.",
    ],
  },
  {
    id: "initiatives",
    label: "Initiatives",
    aliases: [
      "initiative",
      "initiatives",
      "rendez-vous",
      "rendez vous",
      "rappel",
      "rappels",
      "rappel recurrent",
      "initiative recurrente",
      "initiative récurrente",
      "message planifie",
      "whatsapp",
      "relance",
    ],
    explain:
      "Une initiative est un message recurrent planifie que j'envoie. Elle contient une instruction, un contexte, une heure, des jours actifs et une destination: Plan actuel ou Base de vie.",
    how_to:
      "Ouvre l'onglet Initiatives. C'est le seul endroit pour creer une initiative independamment d'une potion. Cree ou modifie une initiative en precisant ce que je dois envoyer, pourquoi c'est important, l'heure et les jours actifs.",
    benefits: [
      "Installe une presence utile dans le temps.",
      "Soutient une transformation sans obliger le user a revenir au dashboard.",
      "Peut vivre dans le plan actif ou hors plan dans la Base de vie.",
    ],
    locations: [
      {
        surface: "Dashboard > Initiatives",
        when_visible:
          "Quand le user a acces aux fonctionnalites WhatsApp requises.",
        user_can_do: [
          "creer",
          "modifier",
          "activer ou desactiver",
          "archiver une initiative recurrente",
        ],
      },
      {
        surface: "Base de vie > Initiatives",
        when_visible: "Quand l'initiative vit hors plan.",
        user_can_do: [
          "gerer les initiatives libres hors transformation active",
        ],
      },
    ],
    limits: [
      "Une initiative est recurrente, pas un outil conversationnel hors plateforme.",
      "Une initiative ne se cree pas depuis Habitudes ou depuis le Plan: hors potion, elle se cree dans l'onglet Initiatives.",
      "Certaines capacites peuvent etre verrouillees selon le plan d'acces.",
      "Les instructions doivent rester dans les contraintes safety et ethique.",
    ],
    sophia_must_not_claim: [
      "Ne pas dire qu'une initiative a ete programmee sans succes outil ou flow.",
      "Ne pas confondre initiative dashboard et outil conversationnel hors plateforme.",
    ],
    operation_bridge: {
      skill_or_operation: "create_or_update_initiative",
      trigger_phrases: [
        "cree une initiative",
        "programme un rendez-vous recurrent",
        "modifie cette initiative",
        "mets cette relance dans ma base de vie",
      ],
      requires_confirmation: true,
    },
  },
  {
    id: "coach_preferences",
    label: "Preferences coach",
    aliases: [
      "preferences",
      "preference",
      "ton",
      "challenge",
      "questions",
      "style",
      "douceur",
      "directif",
    ],
    explain:
      "Les preferences coach reglent ma maniere d'accompagner: ton global, niveau de challenge et tendance a poser des questions.",
    how_to:
      "Ouvre Preferences depuis le dashboard, modifie les options disponibles puis sauvegarde.",
    benefits: [
      "Rend l'accompagnement plus adapte au user.",
      "Clarifie si je dois etre plus douce, directe ou challengeante.",
      "Evite de repeter les memes preferences dans chaque conversation.",
    ],
    locations: [{
      surface: "Dashboard > Preferences",
      when_visible: "Quand le user ouvre Preferences depuis la sidebar.",
      user_can_do: [
        "modifier le ton",
        "modifier le niveau de challenge",
        "modifier la tendance aux questions",
      ],
    }],
    limits: [
      "Ne modifie pas le contenu du plan.",
      "Certaines preferences peuvent etre liees a des fonctionnalites verrouillees selon l'acces.",
    ],
    sophia_must_not_claim: [
      "Ne pas dire qu'une preference est sauvegardee sans succes outil ou UI.",
    ],
    operation_bridge: {
      skill_or_operation: "update_coach_preferences",
      trigger_phrases: [
        "change ton ton",
        "sois plus directe",
        "pose moins de questions",
        "challenge-moi plus",
      ],
      requires_confirmation: true,
    },
  },
  {
    id: "base_de_vie",
    label: "Base de vie",
    aliases: [
      "base de vie",
      "hors plan",
      "transformation terminee",
      "ressources conservees",
      "arsenal",
      "ligne verte",
      "ligne rouge",
      "declics",
    ],
    explain:
      "La Base de vie regroupe ce qui reste utile hors d'une transformation active: transformations terminees, lignes verte et rouge, declics de cloture et initiatives hors plan. Les ressources restent conservees dans l'historique de la transformation; elles ne sont pas deplacees directement dans la Base de vie.",
    how_to:
      "Dans la sidebar du dashboard, choisis Base de vie. Tu peux consulter les transformations terminees et les elements de cloture. Les lignes verte et rouge sont remplies a la fin de chaque plan via le questionnaire de cloture. Les ressources restent dans l'historique de la transformation; elles ne sont pas rangees directement dans la Base de vie.",
    benefits: [
      "Evite que tout disparaisse quand une transformation se termine.",
      "Conserve les lignes verte et rouge et les declics issus du questionnaire de cloture.",
      "Permet d'avoir des initiatives qui ne dependent pas d'une transformation active.",
    ],
    locations: [
      {
        surface: "Dashboard sidebar > Base de vie",
        when_visible: "Quand le dashboard est accessible.",
        user_can_do: [
          "consulter les transformations terminees",
          "ouvrir les details",
          "gerer certaines informations de cloture",
        ],
      },
      {
        surface: "Base de vie > Initiatives",
        when_visible:
          "Quand des initiatives hors plan existent ou peuvent etre creees.",
        user_can_do: ["gerer les initiatives libres si l'acces le permet"],
      },
    ],
    limits: [
      "Ce n'est pas un deuxieme plan actif.",
      "Ce n'est pas l'endroit pour executer les missions du plan courant.",
      "Les ressources sont conservees dans l'historique de transformation, pas directement dans la Base de vie.",
    ],
    sophia_must_not_claim: [
      "Ne pas dire qu'un element est entre en Base de vie tant que la cloture n'est pas faite.",
    ],
  },
  {
    id: "plan.level_completion",
    label: "Validation du prochain niveau",
    aliases: [
      "valider le prochain niveau",
      "bilan de niveau",
      "fin de niveau",
      "finis un niveau",
      "termine un niveau",
      "quand je finis un niveau",
      "passer au niveau suivant",
    ],
    explain:
      "La validation du prochain niveau collecte un court bilan pour calibrer la suite sans regenerer toute la roadmap.",
    how_to:
      "Dans le Plan, quand la fenetre de review est ouverte, utilise le bloc de validation du prochain niveau et reponds aux questions.",
    benefits: [
      "Evite de passer trop vite au niveau suivant.",
      "Me donne des informations pour ajuster la suite.",
      "Marque clairement la transition entre deux niveaux.",
    ],
    locations: [{
      surface: "Dashboard > Plan",
      when_visible:
        "Deux jours avant la fin du niveau, ou quand les actions du niveau sont terminees.",
      user_can_do: [
        "ouvrir le bilan",
        "repondre aux questions",
        "valider le prochain niveau",
      ],
    }],
    limits: [
      "Ne sert pas a cloturer toute la transformation.",
      "Ne remplace pas l'ajustement du plan si le niveau n'est pas pret.",
    ],
    sophia_must_not_claim: [
      "Ne pas dire que l'utilisateur a valide le prochain niveau si la validation a ete faite automatiquement.",
    ],
  },
  {
    id: "transformation.closure",
    label: "Cloture de transformation",
    aliases: [
      "cloturer la transformation",
      "terminer la transformation",
      "ligne rouge",
      "ligne verte",
      "ligne rouge",
      "declics",
      "base de vie",
    ],
    explain:
      "La cloture de transformation intervient quand le user a atteint l'objectif global ou termine la transformation. Elle permet de valider les apprentissages avant l'entree dans la Base de vie.",
    how_to:
      "Dans le Plan, le bloc Suite du parcours ouvre le parcours de cloture quand le user a atteint l'objectif global ou termine la transformation. Le questionnaire permet de remplir la Ligne Verte, la Ligne Rouge et les Declics.",
    benefits: [
      "Donne une fin propre a la transformation.",
      "Transforme l'experience en reperes conservables.",
      "Prepare l'entree dans la Base de vie.",
    ],
    locations: [{
      surface: "Dashboard > Plan",
      when_visible:
        "Quand le user a atteint l'objectif global ou termine la transformation.",
      user_can_do: [
        "ouvrir le rituel de cloture",
        "valider les informations",
        "faire entrer la transformation dans la Base de vie",
      ],
    }],
    limits: [
      "Ne doit pas etre propose si l'objectif global n'est pas atteint et que la transformation n'est pas terminee.",
      "Ne remplace pas le passage au niveau suivant si seuls certains niveaux sont termines.",
    ],
    sophia_must_not_claim: [
      "Ne pas dire qu'une transformation est en Base de vie avant cloture confirmee.",
    ],
  },
  {
    id: "transformation.transition",
    label: "Transition vers la suite",
    aliases: [
      "prochaine transformation",
      "deuxieme transformation",
      "suite du parcours",
      "multi-part",
      "relancer un parcours",
      "ajouter une nouvelle transformation",
      "nouvelle transformation",
    ],
    explain:
      "La transition gere le passage a une nouvelle transformation apres la cloture. Quand une transformation est terminee, le parcours pour mettre en place une nouvelle transformation s'ouvre automatiquement et le user se laisse guider. Le user peut aussi cliquer sur Ajouter une nouvelle transformation si besoin.",
    how_to:
      "A la fin d'une transformation, suivre le parcours guide qui s'ouvre automatiquement pour mettre en place la nouvelle transformation. Pour ajouter manuellement une autre transformation, cliquer sur Ajouter une nouvelle transformation. Le maximum est de 2 transformations actives en meme temps.",
    benefits: [
      "Permet d'enchainer proprement apres une cloture.",
      "Permet d'ajouter une autre transformation si un nouveau besoin doit passer devant.",
      "Garde la limite de 2 transformations actives lisible.",
    ],
    locations: [{
      surface:
        "Parcours guide apres cloture / Ajouter une nouvelle transformation",
      when_visible:
        "Quand une transformation vient d'etre terminee, ou quand le user veut ajouter une transformation et n'a pas deja 2 transformations actives.",
      user_can_do: [
        "se laisser guider",
        "choisir ou ajouter la prochaine transformation",
        "voir si la limite de 2 transformations actives est atteinte",
      ],
    }],
    limits: [
      "Ne remplace pas la cloture de transformation.",
      "Les verrouillages concernent seulement les semaines ou niveaux a venir dans le Plan.",
      "Le bloc Suite du parcours sert a la cloture; il n'est pas le chemin de lancement d'une prochaine transformation.",
      "Le lancement apres cloture passe par le parcours guide automatique, ou par Ajouter une nouvelle transformation.",
    ],
    sophia_must_not_claim: [
      "Ne pas inventer un statut de suite de parcours verrouillee.",
      "Ne pas dire que le bloc Suite du parcours peut etre verrouille.",
      "Ne pas dire que le chemin est Dashboard > Plan > Suite du parcours pour demarrer la prochaine transformation apres cloture.",
      "Ne pas depasser la limite de 2 transformations actives.",
    ],
  },
];
