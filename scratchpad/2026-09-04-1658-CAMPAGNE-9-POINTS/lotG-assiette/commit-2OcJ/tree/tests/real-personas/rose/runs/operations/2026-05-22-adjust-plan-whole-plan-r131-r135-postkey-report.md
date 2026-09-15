# QA Run Report - Adjust Plan Whole Plan r131-r135

## 1. Contexte Du Test

- Date: 2026-05-22
- Runs: r131-r135
- Persona: Rose
- Objectif: relancer les runs whole-plan apres changement de cle Gemini et verifier le flow de bout en bout, du routing a la validation puis a la separation v1/v2 du plan.
- Trajectoire: ajustement whole plan sur deux familles de demandes peu mecaniques: ajout d'une marche de reconnexion apres dispute, puis reorientation du plan vers chaleur/fiabilite/reparation rapide sans ajouter d'actions.
- Surfaces visees: dispatcher, `adjust_plan_item`, whole-plan intake, coach guidance, draft review, validation, regeneration plan, cleanup QA.
- Cadre IA reel: Supabase local, persona Rose, `force_full_ai=true`, `enable_adjust_plan_coach_guidance=true`, aucun fallback deterministe utilise comme resultat QA.
- Validite QA: valide pour r134 et r135. r131-r133 sont documentes comme tentatives de stabilisation, non retenues comme verdict final.

## 2. Tours De Conversation

### Incidents r131-r133

- r131: le run repond en 200 mais classifie mal la demande "se retrouver apres une dispute" comme separation de sujets sensibles. Cleanup OK.
- r132: la premiere correction route mieux, mais une nuance user est reprise avec du bruit de commande. Cleanup OK.
- r133: meme famille de bug, fuite residuelle du mot "encore". Cleanup OK.
- Resolution: durcissement du signal "repair reconnection step", formulation moins templatee, nettoyage des wrappers de commande dans les nuances.

### Run r134 - Repair Step / Missing Bridge

#### Tour 1

**User**
> J'ai relu la suite du plan et je trouve qu'il manque une marche. On passe trop vite vers comprendre les tensions, alors que j'aimerais d'abord apprendre à se retrouver après une dispute.

**Sophia**
> Oui, je vois mieux la marche à ajouter. Je ne la formulerais pas comme un bloc abstrait.
>
> Je formulerais l'ajustement comme une courte étape de réparation: Une étape explicite en deux temps: reconnaître brièvement la tension, puis proposer un petit geste de retour au contact.
>
> L'objectif global reste stable, et les actions de soutien ne changent pas sauf si la régénération montre qu'il faut les reformuler.
>
> Si tu valides, je régénère une nouvelle version du plan avec ce feedback. Rien n'est encore appliqué.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- operation: draft_review
- direct_effects: aucun
- durable_effect: aucun

#### Tour 2

**User**
> Avant de valider, confirme-moi que ça ne rajoute pas trois nouvelles actions : c'est juste une petite étape dans le plan, avec reconnaître la tension puis revenir au contact ?

**Sophia**
> Oui. Le brouillon change surtout l'axe du plan, sans ajouter plus d'actions.
>
> Je n'applique rien tant que tu ne me le confirmes pas clairement.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- operation: draft_review_details
- direct_effects: aucun
- durable_effect: aucun

#### Tour 3

**User**
> Ok, ajoute juste au brouillon que cette étape doit rester légère : une phrase de reconnaissance suffit, pas une longue discussion. Ne valide pas encore.

**Sophia**
> C'est corrigé dans le brouillon: Nuance intégrée: cette étape doit rester légère : une phrase de reconnaissance suffit, pas une longue discussion. Je n'applique rien tant que tu ne me le confirmes pas clairement.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- operation: draft_review_updated
- direct_effects: aucun
- durable_effect: aucun

#### Tour 4

**User**
> Et si on ajoute cette marche, est-ce qu'on garde quand même l'idée de progression ? Je ne veux pas que le plan devienne juste un truc flou au feeling.

**Sophia**
> Je n'ai encore rien applique. Le brouillon porte sur la trajectoire du plan, pas seulement sur deux actions.
>
> Avant: La suite du plan pouvait passer trop vite de la tension à l'analyse, sans sécuriser le retour au lien.
>
> Apres: Le plan ajoute un passage court après dispute: reconnaître ce qui s'est passé, puis revenir au contact avant d'analyser le fond.
>
> Nuance intégrée: cette étape doit rester légère : une phrase de reconnaissance suffit, pas une longue discussion.
>
> Etape ajoutee: Une étape explicite en deux temps: reconnaître brièvement la tension, puis proposer un petit geste de retour au contact.
>
> Ce qui reste stable: L'objectif global du plan reste stable, sauf demande explicite de le changer.
>
> Pourquoi ca aide: Le user demande une étape concrète de réparation relationnelle, pas un niveau abstrait ni une analyse supplémentaire.
>
> Reperes du plan utilises pour ancrer ce changement: Convenir d'un signal de pause, Faire le point sur le signal de pause.
>
> Si ca te va, dis-moi clairement de l'appliquer. Sinon, dis-moi ce que tu veux modifier dans ce brouillon.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- operation: draft_review_details
- direct_effects: aucun
- durable_effect: aucun

#### Tour 5

**User**
> Ok, valide et applique cet ajustement du plan global.

**Sophia**
> C'est fait: j'ai ajusté la trajectoire du plan.
>
> Le plan ajoute un passage court après dispute: reconnaître ce qui s'est passé, puis revenir au contact avant d'analyser le fond.
>
> Nuance intégrée: cette étape doit rester légère : une phrase de reconnaissance suffit, pas une longue discussion.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- response_tool_execution: success
- executed_tools: adjust_plan_item
- direct_effects: success
- durable_effect: ancien plan archive v1, nouveau plan actif v2 cree avec `last_generation_reason=plan_adjustment`

**Effet durable inspecte**
- Nouveau plan actif v2: `Retrouver l'harmonie dans mon couple`
- Items actifs/pending regeneres: `Préparer le geste de retour au contact`, `Partager un point positif`, `Observer l'effet de la réparation`, `Ajuster le geste de réparation`
- Cleanup: 4 items crees supprimes, 1 plan cree supprime, messages scope supprimes, 7 lignes restaurees, Rose revenue a 1 plan actif v1 et 4 items.

### Run r135 - Value Preference / Warmth

#### Tour 1

**User**
> Je veux ajuster le plan global : il me donne une impression de performance, comme si je devais cocher des cases. Je veux garder l'objectif de couple, mais réorienter le cap vers chaleur, fiabilité et réparation rapide, sans ajouter d'actions.

**Sophia**
> Je peux préparer cet ajustement du plan global sans changer l'objectif de fond.
>
> Je garderais les actions, mais je demanderais au plan régénéré de les relire autrement: une lecture moins performative des actions existantes: elles servent la chaleur, la fiabilité et la réparation rapide, sans ajouter de nouvelles actions.
>
> L'objectif global et les actions existantes restent là. Le changement porte sur l'intention: moins de performance, plus de chaleur et de fiabilité.
>
> Si tu valides, je régénère une nouvelle version du plan avec ce feedback. Rien n'est encore appliqué.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- operation: draft_review
- direct_effects: aucun
- durable_effect: aucun

#### Tour 2

**User**
> Avant de valider, confirme-moi que ça ne veut pas dire faire au feeling : je veux garder une progression, juste pas une logique de performance.

**Sophia**
> Non: l'idée n'est pas de rendre le plan flou ou de fonctionner au feeling. Le brouillon garde une progression, mais il change le critère de lecture: on cherche des signes concrets de chaleur, de fiabilité et de réparation rapide, pas une exécution parfaite des actions. Si tu valides, je régénère le plan dans ce sens. Rien n'est appliqué tant que tu ne confirmes pas clairement.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- operation: draft_review_details
- direct_effects: aucun
- durable_effect: aucun

#### Tour 3

**User**
> Ajoute au brouillon que le progrès principal, c'est de réparer vite après une maladresse plutôt que réussir parfaitement chaque action. Ne valide pas encore.

**Sophia**
> C'est corrigé dans le brouillon: Nuance intégrée: le signe de progrès principal est de réparer vite après une maladresse, pas de réussir à tout faire parfaitement. Je n'applique rien tant que tu ne me le confirmes pas clairement.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- operation: draft_review_updated
- direct_effects: aucun
- durable_effect: aucun

#### Tour 4

**User**
> Ok, valide et applique cet ajustement du plan global.

**Sophia**
> C'est fait: j'ai ajusté la trajectoire du plan.
>
> Le plan garde les mêmes appuis, mais leur rôle devient plus clair: soutenir la présence fiable, les petits moments positifs et la réparation après maladresse.
>
> Nuance intégrée: le signe de progrès principal est de réparer vite après une maladresse, pas de réussir à tout faire parfaitement.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- response_tool_execution: success
- executed_tools: adjust_plan_item
- direct_effects: success
- durable_effect: ancien plan archive v1, nouveau plan actif v2 cree avec `last_generation_reason=plan_adjustment`

**Effet durable inspecte**
- Nouveau plan actif v2: `Retrouver l'harmonie dans mon couple`
- Items actifs/pending regeneres: `Convenir d'un signal de pause bienveillant`, `Nourrir ou réparer le lien`, `Observer ce qui facilite vos réparations`, `Faire le point sur vos réparations`
- Feedback de regeneration: conserve l'objectif, relit les actions comme appuis de chaleur/fiabilite/reparation, ajoute la nuance "reparer vite apres maladresse".
- Cleanup: 4 items crees supprimes, 1 plan cree supprime, messages scope supprimes, 7 lignes restaurees, Rose revenue a 1 plan actif v1 et 4 items.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow/green**

**Ce qui marche**
- Sophia ne replonge plus dans le modele repetitif "niveau intermediaire avec un niveau intermediaire".
- La demande "se retrouver apres une dispute" est comprise comme une marche de reparation/reconnexion, pas comme une separation de sujets sensibles.
- La demande "pas de logique de performance" est traitee comme une reorientation globale du sens du plan, sans ajout d'actions.
- La question "est-ce que ca devient flou/au feeling ?" recoit une vraie reponse coaching sur la progression, surtout dans r135.

**Problemes**
- r134 Tour 2: "le brouillon change surtout l'axe du plan" est correct mais trop vague. Impact: le user demandait une confirmation concrete sur "pas trois nouvelles actions". Severite: yellow.
- r134 Tour 4: la reponse est utile mais trop recapitulatoire et moins naturelle qu'une reponse de coaching. Impact: experience un peu lourde avant validation. Severite: yellow.

**Fix propose**
- En draft review details whole-plan, privilegier une reponse courte orientee question user quand la question est qualitative, puis une seule phrase de recap du brouillon.
- Pour les confirmations "pas X actions", repondre explicitement "non, pas trois nouvelles actions" avant de parler de trajectoire.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- r134: route vers `tool_skill` / `adjust_plan_item` des le tour 1, scope whole-plan correct.
- r135: route vers `tool_skill` / `adjust_plan_item`, scope whole-plan correct, famille `value_preference_conflict` coherente.
- Les tours de clarification restent en review et ne declenchent aucun side effect.
- La validation finale execute `adjust_plan_item` uniquement apres confirmation explicite.

**Skills / Operations / Tools**
- Le sous-skill whole-plan materialise une trajectoire, pas seulement deux changed_items.
- Le coach guidance est present et utile dans les traces: observation, recommendation, warnings, preserve/avoid.
- Aucun 502 observe sur r134/r135 apres changement de cle Gemini.

**Memory / Effets durables**
- r134 et r135 archivent le plan v1 et creent un plan v2 actif.
- `last_generation_reason=plan_adjustment` est present sur le nouveau plan.
- Les items du nouveau plan changent bien dans le sens demande.
- Les cleanups scoped ont restaure Rose: aucun message de scope restant, aucun plan/item cree restant, plan v1 actif restaure.

**Problemes**
- Les tentatives r131-r133 prouvent que les nouvelles familles de demande peuvent encore exposer des trous de taxonomie. Impact systeme: quand le pattern n'est pas reconnu, Sophia peut repartir vers une famille proche mais fausse. Severite: yellow.
- La trace durable montre encore une formulation interne "Le plan global n'est plus assez tenable" parfois trop generique dans `decision_basis`. Impact user nul direct, mais peut influencer la regeneration. Severite: yellow.

**Fix propose**
- Continuer a renforcer la taxonomie whole-plan par familles de demande, avec tests unitaires par famille.
- Ajouter un test de non-regression sur la reponse details r134 Tour 2/Tour 4 pour eviter les recaps lourds.

## Verdict Global

**yellow/green**

Le flow whole-plan est de nouveau exploitable de bout en bout apres changement de cle: routing correct, brouillon coherent, validation explicite respectee, regeneration plan v2 effective, cleanup OK. Les derniers points ne sont plus des rouges systeme mais des frictions de qualite conversationnelle sur certaines reponses de detail.
