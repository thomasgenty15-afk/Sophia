# QA Product Help Dashboard - 2026-05-07 - dashhelp5

## Setup

- Mode: product_help dashboard action probe
- Conversations: 5
- Endpoint: http://127.0.0.1:54321
- Chemin: `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`
- Secrets/JWT: non affiches
- User QA: connexions temporaires isolees via `qa-create-run-connection.sh`

## Synthese

- Verdict final: **JAUNE**
- Tours totaux: 40
- HTTP non-200 / empty / abort / trace_error: 0
- Reponses avec ancien vocabulaire interdit (North Star / Etoile / Boussole): 0

## Matrice Conversations

| Conversation | Verdict | Product turns | Features observees | Manques | Notes |
|---|---:|---:|---|---|---|
| Plan, actions et ajustement | JAUNE | 7/8 | dashboard.plan, plan.missions, plan.habits | plan.adjustment | 1 tour route execution_breakdown, reponse correcte |
| Ressources, cartes libres et cartes liees au plan | VERT | 8/8 | resources.defense_card, resources.plan_cards, resources.attack_card, resources.overview, dashboard.plan | - | OK systeme |
| Potions et initiative automatique | JAUNE | 8/8 | resources.potions, dashboard.plan, inspirations, plan.clarifications | initiatives | Reponses correctes, retrieval feature parfois trop generique |
| Initiatives, preferences et Base de vie | VERT | 8/8 | initiatives, base_de_vie, coach_preferences | - | OK systeme |
| Inspirations, fin de niveau, cloture et transition | VERT | 8/8 | inspirations, plan.adjustment, plan.level_completion, dashboard.plan, transformation.closure, transformation.transition | - | OK systeme |

## Conversations Completes

### Plan, actions et ajustement (plan-overview) - JAUNE

#### T01 - 200 - owner product_help / handler product_help - feature dashboard.plan

User: dans mon espace Sophia, le plan sert a quoi exactement quand j'ai deja une transformation ?

Sophia: Ton Plan, c’est l’espace “exécution” de la transformation. Même si tu as déjà une transformation, le Plan sert à éviter le flou : tu sais exactement ce qui est actif maintenant, sur quelle semaine, et quoi faire concrètement. 😊

Concrètement, dans le dashboard :
- Tu sélectionnes la transformation (colonne de gauche)
- Puis tu ouvres l’onglet Plan
- Tu vois le niveau actif, les semaines, et les missions/habitudes associées pour avancer

Ça aide surtout à ne pas mélanger “tout le parcours” avec “ce que tu fais maintenant”, et à avoir une vue claire de l’avancement. ✅

Tu veux comprendre le Plan pour mieux démarrer ta prochaine étape, ou pour suivre ce que tu as déjà fait ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=explain; tools=[]; direct_effects=[]

#### T02 - 200 - owner product_help / handler product_help - feature dashboard.plan

User: ok, et dans le tableau de bord action, je peux rentrer mes propres bilans ou actions ?

Sophia: Oui, je te cadre ça clairement 🙂 Le “Plan” du dashboard n’est pas un journal libre pour rentrer des bilans ou créer des actions à ta sauce.

Selon l’info produit que j’ai ici :
- Plan (Dashboard > Plan) sert à consulter ce qui est actif (niveau, semaines, missions/habitudes, clarifications, éléments à venir).
- Limite importante : ce n’est pas un espace pour saisir librement des bilans ou pour créer/ajouter des actions depuis cette vue.

Du coup pour tes bilans/ta saisie, ça dépend de l’endroit exact dans le dashboard (pas le Plan). Tu veux parler plutôt de bilans “quand tu fais le point”, ou d’actions “que tu ajoutes au quotidien” ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T03 - 200 - owner product_help / handler product_help - feature plan.missions

User: si une mission du plan ne colle plus, je dois la supprimer ou passer par autre chose ?

Sophia: Bonne question 🙂 Si une mission du Plan ne colle plus, le réflexe à garder c’est: ne pas la “supprimer” directement depuis sa carte.

D’après le fonctionnement des Missions :
- Tu repasses par l’ajustement du plan si la mission n’est plus adaptée (pour que ce soit le plan qui reflète ton moment, pas un bricolage).
- Tu peux ensuite consulter/valider ce qui reste pertinent via Dashboard > Plan.

L’idée: ajuster le plan plutôt que manipuler une mission au cas par cas.  

Tu veux l’ajuster parce que ton rythme a changé, ou parce que tu t’es rendu compte que l’objectif n’est plus le bon ? 🎯

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T04 - 200 - owner product_help / handler product_help - feature dashboard.plan

User: imagine que l'action est trop grosse cette semaine, tu m'orientes vers quelle partie precise ?

Sophia: Si l’action te paraît trop grosse, le bon réflexe c’est de la repasser côté exécution, donc dans Dashboard > Plan, et surtout via la carte de l’élément concerné (la mission/habitude) pour la rendre ajustable à la bonne semaine/état actif. 😊

Concrètement tu vas dans :
1) Dashboard > Plan
2) Tu sélectionnes la transformation à gauche
3) Tu repères la carte de la mission (ou de l’habitude) qui est trop lourde
4) Tu l’ajustes pour qu’elle colle à “maintenant” (au lieu de tenter de gérer ça ailleurs)

Tu sais si c’est plutôt une mission (travail ponctuel) ou une habitude (répétitive) qui te paraît trop grosse ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=explain; tools=[]; direct_effects=[]

#### T05 - 200 - owner product_help / handler product_help - feature plan.habits

User: et une habitude, je la valide comment sans inventer un bilan libre ?

Sophia: C'est très simple : pour valider une habitude sans faire de long discours, tu vas dans ton Dashboard, section Plan.

Là, tu cherches ta carte d'habitude. Tu peux valider chaque occurrence directement dessus. Ça te permet de voir ta progression d'ancrage sans avoir à rédiger quoi que ce soit. 📈

Si tu as besoin de voir ton planning de la semaine, c'est aussi là que ça se passe.

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T06 - 200 - owner product_help / handler product_help - feature plan.missions

User: donne-moi la difference simple entre valider une mission et ajuster le plan.

Sophia: Ok 🙂 différence simple :

Valider une mission = tu confirmes “c’est fait” pour une action ponctuelle prévue par le plan (tu passes en statut fait sur la carte de la mission). ✅

Ajuster le plan = tu modifies ce qui est prévu, parce que ça ne colle plus à ta réalité de la semaine (plus petit, autre timing, pas le bon niveau actif, etc.). 🔧

Donc : validation = exécution. Ajustement = changement. 🚀

Tu parles d’une mission qui est trop grosse cette semaine, ou plutôt qui ne correspond plus du tout ? 😊

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=explain; tools=[]; direct_effects=[]

#### T07 - 200 - owner conversation_handler / handler execution_breakdown - feature -

User: si je suis perdu dans les semaines et niveaux, tu me dis de regarder quoi en premier ?

Sophia: Si t’es perdu dans les semaines et niveaux, commence par le plus simple : le niveau actif, puis ta semaine en cours. 🎯

Concrètement, dans Dashboard :
1) Va sur Plan
2) Repère ce qui est “actif” (le niveau actuellement en cours)
3) Ensuite seulement, regarde la semaine correspondante pour voir les missions/habitudes du moment

Et si tu vois une carte qui te parle pas, c’est elle le point à clarifier/ajuster, pas toute la structure. 🙂

Tu es perdu surtout sur les semaines (quoi faire maintenant) ou sur les niveaux (quel “niveau” est censé tourner) ?

Trace: empty=false; aborted=false; reason=skill_entry_signal; skill=execution_breakdown; intent=target_resolution; tools=[]; direct_effects=[]

#### T08 - 200 - owner product_help / handler product_help - feature dashboard.plan

User: recap en trois points sur ce que je dois faire dans le Plan.

Sophia: Ok, recap en 3 points dans Plan 🎯

1) Sélectionne ta transformation (à gauche), pour être sur le bon contexte.  
2) Regarde le niveau actif + la semaine en cours, pour savoir ce qui compte maintenant.  
3) Exécute en suivant les cartes missions/habitudes (valider quand c’est fait, ajuster si ça ne colle plus). 😊

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=explain; tools=[]; direct_effects=[]


### Ressources, cartes libres et cartes liees au plan (resources-cards) - VERT

#### T01 - 200 - owner product_help / handler product_help - feature resources.defense_card

User: dans l'espace Ressources, c'est quoi la difference entre carte d'attaque et carte de defense ?

Sophia: Bonne question 🙂 Voilà la différence, simplement :

Carte de defense : c’est ton plan “anti-crainte / anti-craquage”. Elle sert à te protéger quand ça monte, et à te remettre sur des rails. Elle peut être générée librement depuis Ressources, ou liée à une mission/habitude (dans ce cas tu la retrouves aussi ensuite dans Ressources).

Carte d’attaque : c’est plutôt la version “action”. Elle te sert quand tu veux avancer activement (agresser le problème de face), en déclenchant une stratégie pour passer à l’action au moment où tu pourrais procrastiner ou te dérober.

Tu veux que je te dise quelle carte est la plus adaptée pour ton contexte du moment (plutôt “ça me submerge” ou plutôt “je sais quoi faire mais j’ai du mal à le lancer”) ? 😊

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T02 - 200 - owner product_help / handler product_help - feature resources.defense_card

User: une carte de defense je peux la creer librement ou seulement depuis une action du plan ?

Sophia: Tu peux la créer librement depuis Dashboard > Ressources. 🙂  
Et si une carte de defense est liée à une mission ou une habitude du plan, tu la retrouveras aussi ensuite dans Ressources (via le plan), mais ce n’est pas obligatoire pour la faire.

Tu veux plutôt la carte “pour quand ça monte” (libre), ou la carte liée à une habitude/moment précis ? 🙂

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T03 - 200 - owner product_help / handler product_help - feature resources.plan_cards

User: et si elle est liee a une mission, je la retrouve ou apres generation ?

Sophia: Si la carte de défense est liée à une mission, tu la retrouves ensuite dans Ressources, parce qu’une fois générée (ou générable) elle apparaît à la fois sur l’item du plan et dans Ressources, par niveau. 🙂  
Elle n’est pas “uniquement” sur la mission.

Tu parles d’une carte de défense déjà générée, ou d’une carte que tu veux générer et associer à une mission ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T04 - 200 - owner product_help / handler product_help - feature resources.attack_card

User: pour une carte d'attaque, je la vois aussi dans le Plan ou seulement dans Ressources ?

Sophia: Pour une carte d’attaque, tu la retrouves dans Ressources (rangée par niveau) quand elle est générée via le plan. 🙂  
Dans le Plan, tu l’as surtout si elle est rattachée à une mission ou une habitude (et donc qu’elle est prévue pour ce point-là).

Tu parles d’une carte d’attaque déjà générée, ou d’une que tu vas créer maintenant ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T05 - 200 - owner product_help / handler product_help - feature resources.overview

User: si je veux preparer une action avant de la faire, quelle carte tu m'expliques ?

Sophia: Pour préparer une action avant de la faire, c’est la carte d’attaque que tu vises. ⚔️🙂

Elle sert à te mettre en mode “exécution” sur le moment, avec ce que tu vas faire concrètement pour avancer.

Si au lieu de ça tu veux te protéger parce que tu sens que ça peut te bloquer (stress, crainte, envie d’abandonner), là c’est plutôt la carte de défense.

Tu cherches à préparer quoi exactement : lancer l’action, ou éviter de te faire freiner ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=explain; tools=[]; direct_effects=[]

#### T06 - 200 - owner product_help / handler product_help - feature resources.defense_card

User: si mon probleme c'est plutot un piege au moment ou je deraille, tu m'orientes vers quoi ?

Sophia: Si ton souci, c’est vraiment “au moment où je deraille”, tu t’orientes vers la carte de defense 🙂🛡️

Elle est faite pour te rattraper quand ça monte: te donner un plan B concret pour redescendre et reprendre, sans essayer de “forcer la volonté” à chaud.

Tu sais à peu près ce qui te fait dérayer: stress, fatigue, solitude, envie d’abandonner, ou autre ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T07 - 200 - owner product_help / handler product_help - feature dashboard.plan

User: est-ce que ces cartes modifient mon plan ou c'est juste un appui ?

Sophia: Elles sont surtout un appui, pas un “remplacement” de ton plan 🙂🛡️

En pratique :
- Carte d’attaque: elle sert quand tu veux préparer/faire l’action, souvent liée à une mission/habitude du plan.
- Carte de défense: elle sert de plan anti-crainte pour quand ça monte, et même quand elle est liée à un élément du plan, elle reste pensée comme support “au moment où ça déraille”, pas comme une modification en profondeur de tes semaines.

Si tu me dis : “ta carte est déjà liée à une mission/habitude” ou “tu l’as faite libre”, je te dis exactement ce que ça implique pour ton plan.

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T08 - 200 - owner product_help / handler product_help - feature dashboard.plan

User: recap clair: ou creer, ou retrouver, et quoi utiliser selon le cas.

Sophia: Ok, recap clair ⚔️🛡️

1) Carte d’attaque (pour préparer/faire l’action)
- Où créer : depuis le Plan (tu sélectionnes la transformation à gauche, puis tu ouvres l’onglet Plan).
- Où retrouver : dans Ressources (rangée par niveau) une fois qu’elle est générée via le plan.
- Quand l’utiliser : quand tu veux passer en mode exécution et avancer.

2) Carte de défense (pour “quand ça monte”, plan anti-crainte)
- Où créer : dans Ressources.
- Où retrouver si elle est liée à une mission/habitude : ensuite tu peux la voir dans Ressources aussi (elle apparaît via le plan), pas seulement sur l’item du plan.
- Quand l’utiliser : quand tu sens que tu vas “dérayer” (stress, fatigue, envie d’abandonner, etc.).

En une phrase : Plan = pour préparer l’action (attaque), Ressources = pour te rattraper quand ça dérape (défense). 🙂

Tu veux que je te fasse un mini guide “si/donc” selon ton cas typique (dérapage vs exécution) ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]


### Potions et initiative automatique (potions-initiatives) - JAUNE

#### T01 - 200 - owner product_help / handler product_help - feature resources.potions

User: a quoi sert une potion dans Sophia ?

Sophia: Une potion, c’est un support court pour traverser un état intérieur quand il prend trop de place. Elle sert à te redescendre / te recentrer vite sans devoir “refaire tout le plan”. 🧃

Concrètement, quand tu actives une potion, ça crée aussi automatiquement une initiative de suivi pendant 7 jours pour soutenir cet état.

Tu la trouveras dans Dashboard > Ressources (et si tu veux vraiment la lancer/reactiver, il faut passer par l’activation avec confirmation). 😊

Tu veux l’utiliser pour calmer un rush émotionnel, ou plutôt pour te donner un coup de recentrage sur une journée précise ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=benefits; tools=[]; direct_effects=[]

#### T02 - 200 - owner product_help / handler product_help - feature dashboard.plan

User: quand je l'active, est-ce qu'elle fait juste une reponse maintenant ou autre chose apres ?

Sophia: Quand tu actives une potion, ce n’est pas juste “une réponse maintenant” 🙂  
En plus du support immédiat pour te recentrer, ça déclenche automatiquement un suivi sur 7 jours pour soutenir l’état que tu essayes de traverser.

Donc tu as :
1) l’aide tout de suite
2) puis une continuité pendant une semaine

Tu veux l’activer pour calmer un pic émotionnel, ou plutôt pour relancer une action que tu remets en place ? 🧃

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[{"effect_type":"track_progress_plan_item","explicitness":"explicit","payload_hint":{"status_hint":"completed","target_title":null},"target_status":"missing","confidence_band":"high"}]

#### T03 - 200 - owner product_help / handler product_help - feature inspirations

User: tu peux me dire clairement cette histoire de suivi 7 jours ?

Sophia: Oui 🙂 Quand tu actives une potion, tu as deux niveaux de support :

1) Tout de suite : le contenu de la potion te recentre/apporte une réponse immédiate.
2) Ensuite : ça lance automatiquement un suivi pendant 7 jours pour garder ce même état “tenu” au fil des jours, pas juste sur le moment.

En gros, c’est “je te soulève maintenant” + “je t’accompagne encore un peu derrière”, histoire que ça ne retombe pas dès que l’émotion redescend.

Tu veux que ça s’applique plutôt à une émotion/urgence, ou à quelque chose que tu veux relancer durablement ? 🧃

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T04 - 200 - owner product_help / handler product_help - feature dashboard.plan

User: ce suivi c'est une modification du plan ou une initiative ?

Sophia: Bonne question 🙂 Le suivi déclenché par la potion, c’est une initiative de suivi sur 7 jours (donc un support qui continue après le “tout de suite”), pas une modification manuelle de ton plan.

En clair :
- Potion = réponse immédiate + initiative/soutien qui dure 7 jours
- Plan (dans Dashboard > Plan) = là où tu consultes/vois le niveau actif, semaines, missions, habitudes, etc.

Tu veux que je t’aide à repérer où regarder dans le Dashboard selon ce que tu cherches : le suivi ou le plan ? 🙂

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T05 - 200 - owner product_help / handler product_help - feature plan.clarifications

User: je la retrouve ou ensuite si je veux comprendre ce qui est programme ?

Sophia: Bonne question 🙂 Si tu veux comprendre ce qui est “programmé” ensuite, le suivi déclenché par la potion se voit côté initiative de suivi, et le repère le plus direct c’est dans Dashboard > Plan (tu y retrouveras l’item de type Clarification/Exercice de clarification quand c’est lié à ce genre de support).

Où tu es censé regarder :
- Dashboard > Plan : ouvre la carte correspondant au suivi/au support lancé, puis lis l’objectif et les étapes.

Tu veux comprendre “où cliquer” pour voir le suivi exact, ou tu veux juste savoir “quoi regarder” dans l’item ? 😊

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T06 - 200 - owner product_help / handler product_help - feature resources.potions

User: si mon etat est vraiment lourd, est-ce que potion remplace la securite ou pas ?

Sophia: Non 🙂 une potion ne remplace pas la sécurité.

Si ton état est “vraiment lourd”, la potion peut aider à te recentrer tout de suite et te soutenir pendant 7 jours, mais c’est un support, pas une réponse de safety.

Là où tu t’en sers :
- pour redescendre / stabiliser
- pour gagner du temps et retrouver un peu de marge
- sans lâcher les mesures de sécurité si le risque monte

Si tu me dis juste ce que tu appelles “lourd” (stress intense, pensées noires, crise, etc.), je te dis quoi privilégier en premier. 🫶

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T07 - 200 - owner product_help / handler product_help - feature resources.potions

User: et si je veux une initiative recurrente sans potion, je vais ou ?

Sophia: Tu peux la faire soit via une initiative “classique” dans ton plan, soit via une habitude récurrente. 🙂  
Le plus direct, c’est d’aller dans Dashboard, puis de regarder la section Habitudes (si tu veux que ça se répète régulièrement), ou dans le Plan si tu veux une initiative structurée.

Tu veux plutôt A) une habitude quotidienne/hebdo ou B) une initiative récurrente (avec un suivi cadré) ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T08 - 200 - owner product_help / handler product_help - feature resources.potions

User: recap sobre: potion maintenant, suivi apres, et limites.

Sophia: Ok, recap sobre 🧃

1) Potion maintenant: un support court pour t’aider à traverser/redescendre un état intérieur sur le moment (sans avoir à “reprendre tout le plan”).
2) Après: quand tu l’active, ça déclenche aussi une initiative de suivi pendant 7 jours pour soutenir cet état.
3) Limites: ça n’est pas une sécurité/safety. Si ton état devient vraiment “lourd” côté risque, tu t’appuies aussi sur les mesures de sécurité adaptées, et la potion sert de soutien pour te recentrer et tenir un peu de marge.

Tu veux que je te formule une mini phrase “quand j’active une potion, je cherche quoi exactement” ? 🙂

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=explain; tools=[]; direct_effects=[]


### Initiatives, preferences et Base de vie (initiatives-preferences-base) - VERT

#### T01 - 200 - owner product_help / handler product_help - feature initiatives

User: les initiatives dans le dashboard, c'est quoi exactement ?

Sophia: Une “initiative” dans le dashboard, c’est un message récurrent planifié avec Sophia. 😊  
En gros, tu crées un rendez-vous automatisé dans le temps qui contient :

1) une instruction (ce que Sophia doit te dire / te demander)  
2) le contexte (pourquoi c’est important, dans quel esprit)  
3) une heure  
4) des jours actifs (quand ça se déclenche)  
5) la destination : Plan actuel ou Base de vie

Le but : installer une présence utile dans le temps sans que tu aies à revenir te rappeler tout seul.

Tu veux une initiative pour quoi exactement : te remettre en mouvement, un rappel discipline, ou plutôt du soutien plus “identité” ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=explain; tools=[]; direct_effects=[]

#### T02 - 200 - owner product_help / handler product_help - feature base_de_vie

User: je peux les mettre dans le plan actuel ou dans la base de vie ?

Sophia: Oui, tu peux les envoyer vers les deux, mais pas pour la même raison 😊

Plan actuel: c’est pour ce qui s’intègre vraiment à ton déroulé du moment (les missions / habitudes du plan).
Base de vie: c’est plutôt “hors plan” ou des éléments à garder/organiser ailleurs (pas un deuxième plan actif, et pas l’endroit pour exécuter les missions du plan courant).

Tu veux les utiliser comme un truc “pendant la période du plan” ou plutôt comme un suivi/rappel en parallèle ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T03 - 200 - owner product_help / handler product_help - feature initiatives

User: quelles infos je dois remplir pour une initiative ?

Sophia: Pour une initiative, tu vas surtout remplir 4 blocs d’infos, et c’est ça qui fait que ça se déclenche bien. 😊

1) Ce que tu veux que Sophia fasse / te dise
Une instruction claire (le message ou la consigne exacte).

2) Le contexte
Pourquoi c’est important, et le ton / l’esprit à garder.

3) Quand ça part
L’heure.

4) Les jours actifs
Les jours où l’initiative se répète (récurrence).

Optionnel selon ton cas : la destination
Tu peux la mettre soit dans le plan actuel, soit dans la base de vie (pas pour la même raison).

Tu veux le faire plutôt pour un rappel “dans la période du plan” ou pour un truc “hors plan” ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T04 - 200 - owner product_help / handler product_help - feature coach_preferences

User: et les preferences coach, ca change quoi concretement ?

Sophia: Les “Preferences coach”, concrètement, ça change surtout comment Sophia t’accompagne au quotidien, pas ton objectif. 😊

1) Le ton global (plus doux vs plus direct)
- Par exemple, elle va formuler plus “bienveillante et ferme” ou plus “très soft”, selon ce que tu choisis.

2) Le niveau de challenge
- Équilibré, plus challengeant, ou plus rassurant: ça influence la façon dont elle te pousse à agir (sans forcément changer le fond).

3) Le style de feedback
- Plutôt “positif puis amélioration” vs “plus direct / plus cadrant”, donc le ratio encouragements ↔ correction.

Tu veux que je t’aide à choisir quoi mettre selon ton cas (A: plus direct pour passer à l’action, B: plus doux pour mieux tenir le rythme) ? 🙂

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=explain; tools=[]; direct_effects=[]

#### T05 - 200 - owner product_help / handler product_help - feature coach_preferences

User: si je veux que Sophia pose moins de questions, c'est dans quelle partie ?

Sophia: Ça se règle dans “Preferences coach” (Dashboard > Preferences) 😊  
Là tu peux ajuster le paramètre “tendance à poser des questions” + le ton général, et du coup Sophia devient moins inquisitrice.

Tu veux plutôt qu’elle soit moins “interrogatoire”, mais quand même challengeante, ou plus douce ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=explain; tools=[]; direct_effects=[]

#### T06 - 200 - owner product_help / handler product_help - feature base_de_vie

User: la Base de vie sert a quoi quand une transformation est finie ?

Sophia: Bonne question 😊 La Base de vie sert justement à garder de côté ce qui reste utile une fois la transformation terminée, sans tout “noyer” dans le plan actuel.

Concrètement, une fois que ta transformation est finie :
- elle évite que les éléments importants disparaissent (ressources conservées, lignes de clôture, déclics)
- tu peux retrouver plus facilement ce qui t’a servi, même hors période de transformation
- ça te laisse un endroit “hors plan” pour organiser et ressortir ces ressources au moment où tu en as besoin

Tu veux que je te dise comment choisir entre Plan actuel et Base de vie pour un cas précis que tu as en tête ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=explain; tools=[]; direct_effects=[]

#### T07 - 200 - owner product_help / handler product_help - feature base_de_vie

User: est-ce que la Base de vie est un deuxieme plan actif ?

Sophia: Non 😊 La Base de vie, c’est pas un deuxième plan actif.

L’idée, c’est de regrouper ce qui reste utile une fois une transformation terminée: transformations close, ressources conservées, “lignes et déclics de clôture”, et initiatives hors plan. Comme ça, tu retrouves facilement ce qui t’a servi, sans mélanger avec l’exécution du plan courant.

Tu veux la Base de vie plutôt pour “ranger” ce qui se termine, ou pour y déposer des initiatives à part du plan ? 

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=explain; tools=[]; direct_effects=[]

#### T08 - 200 - owner product_help / handler product_help - feature base_de_vie

User: recap: initiatives, preferences, base de vie, sans mélanger.

Sophia: OK 😊 Voilà le recap clair, sans mélanger :

Initiatives
- Ce sont des messages planifiés/récurrents avec Sophia.
- Tu choisis l’heure et les jours, et tu cibles où ça s’envoie : Plan actuel ou Base de vie.
- But : te rappeler / te guider à un moment précis, de façon régulière.

Preferences coach
- Ça ne change pas ton objectif.
- Ça change la façon dont Sophia t’accompagne : ton (plus doux ou plus direct) et le niveau de questionnement/challenge.

Base de vie
- Non, ce n’est pas un deuxième plan actif.
- C’est pour garder utile après une transformation : transformations terminées, ressources conservées, lignes/déclics de clôture, et initiatives “hors plan”.

Tu veux que je te fasse un mini exemple concret “quoi envoyer où” (A/B) ? 🙂

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=explain; tools=[]; direct_effects=[]


### Inspirations, fin de niveau, cloture et transition (inspirations-completion-transition) - VERT

#### T01 - 200 - owner product_help / handler product_help - feature inspirations

User: l'onglet Inspirations sert a quoi dans le dashboard action ?

Sophia: L’onglet Inspirations, c’est pour te redonner du sens quand tu as l’impression que tout devient trop mécanique. 📌

Concrètement, ça sert à :
- retrouver des repères narratifs et des principes liés à ton parcours
- relire l’histoire de ton chemin (le pourquoi profond, ce qui te guide)
- refaire le lien entre ton plan d’action et ce que tu veux vraiment derrière

Où aller : Dashboard > Inspirations.  

Tu veux t’en servir plutôt pour relire ton “pourquoi”, ou pour redonner du contexte quand tu décroches ? 😊

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=explain; tools=[]; direct_effects=[]

#### T02 - 200 - owner product_help / handler product_help - feature plan.adjustment

User: ce n'est pas la partie pour modifier le plan, on est d'accord ?

Sophia: Oui, on est d’accord. 🙂 L’onglet Inspirations sert à te redonner du sens, pas à modifier concrètement ton plan.

Si ton objectif c’est vraiment d’ajuster la suite, ça se fait via le panneau Ajuster le plan dans Dashboard > Plan (quand un plan actif est ouvert).  

Tu veux clarifier quoi exactement : “redonner du sens” ou “alléger / adapter” ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T03 - 200 - owner product_help / handler product_help - feature plan.level_completion

User: quand je finis un niveau, Sophia attend quoi de moi ?

Sophia: Bonne question 🙂 Quand tu finis un niveau, Sophia attend surtout que tu fasses une micro-validation du “prochain niveau” via le bloc de validation du prochain niveau dans Dashboard > Plan, une fois la fenêtre de review ouverte.

En gros, c’est un court bilan pour calibrer la suite (éviter de passer trop vite) : tu réponds aux questions proposées, et ça sert à ajuster la progression après. ✅

Tu finis “le niveau” dans quel sens pour toi : tu as terminé les missions du moment, ou juste l’étape/objectif d’un module ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=explain; tools=[]; direct_effects=[]

#### T04 - 200 - owner product_help / handler product_help - feature dashboard.plan

User: quelle difference entre finir un niveau et cloturer toute la transformation ?

Sophia: Bonne question 🙂 Les deux notions se ressemblent, mais c’est pas le même “niveau de fermeture”.

Finir un niveau:
- c’est la fin d’une étape de progression (un bloc de travail).
- tu fais une review rapide pour calibrer le prochain niveau (et éviter de passer trop vite).
- l’objectif, c’est d’ajuster la suite, pas de tout arrêter.

Clôturer toute la transformation:
- là tu fermes le parcours complet.
- tu valides que la transformation est terminée (donc plus de niveaux à enchaîner dans ce même cadre).
- en général, c’est plus “bilan + passage à autre chose” que “préparer le prochain palier”.

Si tu veux, je te dis exactement ce que ça implique concrètement pour toi: la transformation, tu la sens plutôt “en cours mais encore loin”, ou “ok c’est bon j’ai fait le tour” ? 🙂

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T05 - 200 - owner product_help / handler product_help - feature transformation.closure

User: la cloture avec ligne rouge et declics, ca va ou apres ?

Sophia: Oui, tu peux le faire une fois que la transformation est “prête” pour la clôture 🙂📌

Concrètement, dans le dashboard :
- Dashboard > Plan
- tu passes par le bloc de clôture
- tu valides Ligne Rouge et Déclics (ce sont des éléments de fermeture)
- ensuite la transformation passe dans la Base de vie

Attention : la clôture ne doit pas être proposée si tu n’as pas fini la transformation (sinon ça remplace pas juste “un niveau”, ça ferme tout).  

Tu es à quelle étape là : tu sens que c’est terminé ou il te manque encore un déclic/l’info ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T06 - 200 - owner product_help / handler product_help - feature transformation.transition

User: et la transition vers une prochaine transformation, je la vois ou ?

Sophia: Tu la vois dans le Dashboard, au niveau de la suite du parcours 🙂📌

Où aller :
Dashboard > Plan > Suite du parcours

Quand une suite existe, tu peux ouvrir la transition via ce bloc. Et petit point important : ça ne remplace pas la clôture de transformation ; c’est juste pour passer à la suite quand c’est prêt.

Tu la vois déjà dans “Suite du parcours”, ou tu ne vois aucun bloc/aucune transition ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T07 - 200 - owner product_help / handler product_help - feature dashboard.plan

User: si la suite est verrouillee, qu'est-ce que Sophia doit m'expliquer ?

Sophia: Si la “suite du parcours” est verrouillée, Sophia doit surtout t’expliquer le pourquoi du verrouillage et ce qu’il te manque pour la débloquer 🙂📌

Concrètement, dans Dashboard > Plan > Suite du parcours, tu devrais voir :
- le statut (verrouillée)
- et les éléments nécessaires / conditions à remplir (ce qui explique le blocage)
- puis quoi faire une fois que c’est rempli

Tu vois un message du style “verrouillée car…” ou une liste de conditions dans Suite du parcours ?

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=how_to; tools=[]; direct_effects=[]

#### T08 - 200 - owner product_help / handler product_help - feature inspirations

User: recap en separant Inspirations, fin de niveau, cloture, transition.

Sophia: Bien sûr 🙂 Voilà le recap séparé :

Inspirations
- À quoi ça sert : te redonner du sens quand tu sens que ça devient trop mécanique.
- Ce que tu y fais : relire les repères narratifs et les principes liés à ton parcours, pour retrouver le pourquoi profond.
- Où : Dashboard > Inspirations.
- Important : ce n’est pas pour modifier le plan.

Fin de niveau
- À quoi ça sert : clôturer une étape de travail (pas toute la transformation).
- Ce que Sophia attend : une petite validation du prochain niveau via le bloc de review/validation du prochain niveau (quand la fenêtre s’ouvre).
- Objectif : calibrer la suite, éviter de passer trop vite.

Clôture (toute la transformation)
- À quoi ça sert : fermer le parcours complet, avec des éléments de “ligne rouge”/déclics.
- Où : Dashboard > Plan, via le bloc de clôture.
- Important : à faire une fois que la transformation est vraiment prête (sinon ça remplace pas juste une fin de niveau).

Transition vers une prochaine transformation
- À quoi ça sert : passer à la suite du parcours quand c’est prêt.
- Où : Dashboard > Plan > Suite du parcours.
- Si c’est verrouillé : la priorité c’est comprendre pourquoi c’est verrouillé et ce qu’il manque pour débloquer.

Tu veux que je te le reformule en “checklist” ultra courte ? 📌

Trace: empty=false; aborted=false; reason=product_signal; skill=product_help; intent=explain; tools=[]; direct_effects=[]

## Assertions

| Assertion | Resultat |
|---|---:|
| all_turns_http_200_or_expected_status | pass |
| no_empty_response | pass |
| no_unexpected_abort | pass |
| no_forbidden_old_product_terms | pass |
| product_help_observed | pass |
| no_unrequested_tool_execution | pass |
| operation_bridge_not_executed_by_product_help | pass |

## Rapport Fluidite Humaine

- Couleur: **JAUNE**
- Evaluation: les conversations testent des questions produit plausibles sur Plan, Ressources, Potions, Initiatives, Preferences, Base de vie, Inspirations et transitions.
- A verifier manuellement: precision des formulations et absence de promesses d'action quand Sophia explique un bridge operationnel.

## Rapport Systeme

- Couleur: **VERT**
- Le run utilise le chemin endpoint local, avec traces de routing quand disponibles.
- Aucun secret ni JWT n'est stocke dans ce rapport.

## Verdict

**JAUNE**

## Follow-ups

- Relire les reponses JAUNE pour decider si les aliases/retrieval doivent etre renforces.
- Si une feature attendue manque dans une conversation, ajouter un alias ou une formulation plus specifique dans `knowledge.ts`.
