# QA Run Report - Adjust Plan Whole Plan r125-r129

## 1. Contexte Du Test

- Date: 2026-05-21
- Runs: r125-value-warmth-e2e2, r126-direction-repair-retry, r127-runtime-health-probe, r128-level4-direction-e2e, r129-repair-step-e2e
- Persona: Rose
- Objectif: reprendre les tests whole-plan apres le patch initial, verifier le routage, la phase pre-validation, les corrections de brouillon, la validation et l'effet durable.
- Trajectoire: demandes whole-plan autour de l'esprit du plan, de la chaleur/fiabilite, puis d'une etape structurelle de reparation apres dispute.
- Surfaces visees: `sophia-brain` router, `adjust_plan_item`, coaching guidance, draft review, pending validation, generation whole-plan, cleanup DB.
- Cadre IA reel: Supabase local, `test-send-message`, `force_full_ai=true`, pas de renderer direct comme resultat QA.
- Validite QA: partielle. r125 et r128 sont exploitables jusqu'au point observe. r126 et r129 sont invalides conversationnellement a cause de `502`. r127 confirme que le runtime general repond encore.

## 2. Tours De Conversation

### Run r125 - Value Preference / Warmth

#### Tour 1

**User**
> Je veux ajuster le plan global : il me donne une impression de performance, comme si je devais cocher des cases. Je veux garder l'objectif de couple, mais reorienter le cap vers chaleur et fiabilite, sans ajouter d'actions.

**Sophia**
> Je peux te proposer un ajustement du plan global, sans changer l'objectif de fond. Ce qui changerait: je reoriente l'esprit du plan, avec une lecture moins performative des actions existantes: elles servent la chaleur, la fiabilite et la reparation rapide, sans ajouter de nouvelles actions. [...] Rien n'est encore applique tant que tu ne valides pas clairement.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- operation: draft_review
- durable_effect: aucun

#### Tour 2

**User**
> Avant de valider, confirme-moi juste un truc : tu ne rajoutes vraiment aucune action, tu changes seulement la facon de comprendre celles qui existent ?

**Sophia**
> Oui. Le brouillon prevoit bien: Le plan garde les memes appuis, mais leur role devient plus clair: soutenir la presence fiable, les petits moments positifs et la reparation apres maladresse. Je n'applique rien tant que tu ne me le confirmes pas clairement.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- operation: draft_review_details
- durable_effect: aucun

#### Tour 3

**User**
> Ajoute au brouillon que le progres principal, pour moi, c'est reparer vite apres une maladresse plutot que reussir parfaitement chaque action. Ne valide pas encore.

**Sophia**
> C'est corrige dans le brouillon: Nuance integree: le signe de progres principal est de reparer vite apres une maladresse, pas de reussir a tout faire parfaitement. Je n'applique rien tant que tu ne me le confirmes pas clairement.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- operation: draft_review_updated
- durable_effect: aucun

#### Tour 4

**User**
> Et si ca devient trop mou, est-ce que ca veut dire que je perds l'idee de progression du plan ? Je veux eviter de juste faire au feeling.

**Sophia**
> Oui. Le brouillon prevoit bien: Le plan garde les memes appuis, mais leur role devient plus clair: soutenir la presence fiable, les petits moments positifs et la reparation apres maladresse. Nuance integree: le signe de progres principal est de reparer vite apres une maladresse, pas de reussir a tout faire parfaitement. Je n'applique rien tant que tu ne me le confirmes pas clairement.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: product_help
- operation: draft_review_details
- durable_effect: aucun
- note: mauvaise reponse qualitative a une question coaching.

#### Tour 5

**User**
> Ok, valide et applique cet ajustement du plan global.

**Sophia**
> Reponse vide.

**Trace courte**
- http_status: 502
- error: An invalid response was received from the upstream server
- durable_effect: aucun changement de plan observe apres inspect
- cleanup: scope supprime, aucun plan/item cree restant, 7 lignes restaurees

### Run r126 - Retry Direction Repair

#### Tour 1

**User**
> Je crois que le plan global part trop vers 'faire les exercices'. Je veux qu'il garde la meme ambition, mais qu'il soit davantage oriente reparation concrete apres tension et presence fiable au quotidien, sans rajouter de nouvelle etape.

**Sophia**
> Reponse vide.

**Trace courte**
- http_status: 502
- durable_effect: aucun changement de plan observe
- cleanup: scope supprime, aucun plan/item cree restant, 7 lignes restaurees

### Run r127 - Runtime Health Probe

#### Tour 1

**User**
> Salut Sophia, tu m'entends ? Reponds juste normalement, sans toucher au plan.

**Sophia**
> Je t'entends. Tu veux que je reponde en mode normal plutot court, ou tu preferes une reponse un peu plus posee ?

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- durable_effect: aucun changement de plan
- cleanup: scope supprime, 1 runtime snapshot supprime, aucun plan/item cree restant

### Run r128 - Future Direction / Repair Step

#### Tour 1

**User**
> J'ai relu la derniere partie du plan et je ne suis pas convaincue. La suite me semble trop centree sur analyser les tensions, alors que je pense qu'on devrait plutot apprendre a relancer un moment de lien apres une dispute. Tu peux m'aider a ajuster la direction globale ?

**Sophia**
> Oui, carrement. [...] On peut ajuster la direction globale vers quelque chose de plus action-oriented [...] Pour que je te propose un ajustement propre: quand tu dis "relancer apres une dispute", tu penses plutot a quel type de moment ? A) apres un froid / silence B) apres une dispute avec tension verbale encore presente C) apres qu'un des deux s'est emporte [...]

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- durable_effect: aucun
- note: bonne posture coaching et bonne clarification.

#### Tour 2

**User**
> Plutot C, quand l'un de nous s'est emporte. Je veux que le plan aide a revenir au contact sans faire semblant que rien ne s'est passe.

**Sophia**
> Je peux l'orienter, mais il me manque le type d'ajustement : tu veux surtout changer l'accent du plan pour qu'il parle de retour au contact, ou ajouter une etape explicite pour reconnaitre ce qui s'est passe avant de reparler ?

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- operation: ask_question
- durable_effect: aucun

#### Tour 3

**User**
> Je prefere ajouter une etape explicite, mais pas un truc lourd : reconnaitre brievement ce qui s'est passe, puis proposer un petit geste de retour au contact.

**Sophia**
> Je peux te proposer un ajustement du plan global [...] Ce qui changerait: j'insere un niveau intermediaire, avec un niveau intermediaire avec un role clair, un contenu limite et un critere de passage explicite. [...]

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: adjust_plan_item
- operation: draft_review
- durable_effect: aucun
- note: bug UX/systeme, brouillon trop generique et duplication "niveau intermediaire".

#### Tour 4

**User**
> La c'est trop generique. Dans le brouillon, je veux que l'etape dise clairement : d'abord reconnaitre la tension, ensuite faire un petit geste de retour au contact. Pas juste 'niveau intermediaire'.

**Sophia**
> Je peux te proposer un ajustement du plan global [...] Ce qui changerait: j'insere un niveau intermediaire, avec un niveau intermediaire avec un role clair, un contenu limite et un critere de passage explicite. [...]

**Trace courte**
- http_status: 200
- operation: draft_review_updated
- durable_effect: aucun
- note: correction utilisateur non integree.

#### Tour 5

**User**
> Je ne valide pas tant que ce n'est pas repris explicitement. Est-ce que le brouillon contient bien les deux temps : reconnaitre la tension, puis proposer un geste de retour au contact ?

**Sophia**
> Oui. Le brouillon prevoit bien: Le plan garde son objectif, mais ajoute un niveau intermediaire avant de monter d'un cran. Je n'applique rien tant que tu ne me le confirmes pas clairement.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- selected_handler: product_help
- operation: draft_review_details
- durable_effect: aucun
- note: affirmation incorrecte par rapport au contenu demande.
- cleanup: scope supprime, 1 runtime snapshot supprime, aucun plan/item cree restant, 7 lignes restaurees

### Run r129 - Post-Fix Real Rerun

#### Tour 1

**User**
> J'ai regarde la fin du plan et je trouve qu'il manque une marche. On passe trop vite vers comprendre les tensions, alors que moi j'aimerais une vraie etape pour se retrouver apres une dispute.

**Sophia**
> Reponse vide.

**Trace courte**
- http_status: 502
- durable_effect: aucun
- cleanup: scope supprime, aucun plan/item cree restant, 7 lignes restaurees

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- r125 T1-T3: tres bon comportement pour une demande "changer l'esprit du plan sans ajouter d'actions".
- r128 T1-T2: Sophia garde une posture de coach, reformule le risque "trop d'analyse", puis pose une clarification utile.

**Problemes**
- r125 T4: Sophia ne repond pas vraiment a la question "est-ce que je perds la progression ?", elle relit le brouillon. Impact: le user ne recoit pas le raisonnement coaching attendu. Severite: yellow.
- r128 T3-T5: le brouillon reste abstrait malgre une demande concrete, puis Sophia affirme que le brouillon contient la precision alors que ce n'est pas le cas. Impact: perte de confiance avant validation. Severite: red.
- r125 T5, r126 T1, r129 T1: `502` avec reponse vide. Impact: run de validation impossible. Severite: red.

**Fix applique**
- Ajout d'un signal whole-plan pour "reconnaitre la tension -> petit geste de retour au contact".
- Ajout d'une contrainte `insert_phase_kind:repair_reconnection_after_tension`.
- Ajout d'un rendu de brouillon concret: "reconnaitre brievement la tension, puis proposer un petit geste de retour au contact".
- Ajout d'un test de regression ciblé.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- r125 T1-T3: bon routage vers `adjust_plan_item`.
- r128 T1-T2: bon routage vers `adjust_plan_item`, bonne clarification.
- r125 T4 et r128 T5: `selected_handler=product_help` mais `response_owner=tool_skill` avec `draft_review_details`; le systeme priorise le draft review mais produit une reponse trop mecanique.

**Skills / Operations / Tools**
- Le flow sait maintenant distinguer `value_preference_conflict` et evite d'ajouter un niveau quand le user dit "sans ajouter d'actions".
- Avant fix, le cas "ajouter une etape de reparation apres dispute" tombait dans le fallback generique `missing_bridge_or_level`, d'ou la duplication "niveau intermediaire".
- Apres fix, les tests unitaires confirment la materialisation concrete de l'etape de reparation.

**Memory / Effets durables**
- Aucun changement durable non voulu n'a ete observe.
- Tous les runs ont ete nettoyes/restaures:
  - r125: 0 message restant, aucun plan/item cree restant, 7 lignes restaurees.
  - r126: 0 message restant, aucun plan/item cree restant, 7 lignes restaurees.
  - r127: 0 message restant, aucun plan/item cree restant, 7 lignes restaurees.
  - r128: 0 message restant, aucun plan/item cree restant, 7 lignes restaurees.
  - r129: 0 message restant, aucun plan/item cree restant, 7 lignes restaurees.

**Problemes**
- Validation whole-plan non verifiee aujourd'hui: r125 T5 echoue en `502` avant effet durable.
- Rerun reel post-fix bloque: r129 T1 echoue en `502` avant conversation exploitable.
- Aucun `system_error_logs` local trouve pour ces `502`; le probe normal r127 prouve que l'Edge Function repond encore hors chemin adjust-plan.

**Fix propose**
- P1: diagnostiquer le `502` adjust-plan dans le runtime Edge local avec logs runtime/serve dedie, car le chemin normal repond.
- P1: ajouter un test routeur/integration pour la question pre-validation coaching ("est-ce que ca devient trop mou ?") afin que le systeme reponde qualitativement au lieu de relire le brouillon.
- P2: une fois le runtime stabilise, relancer r129 puis deux autres variantes whole-plan jusqu'a validation et separation v1/v2.

## Verdict Global

**red**

Le patch met bien en place une amelioration 20/80 pour le cas "etape de reparation apres tension" et les tests unitaires passent. En revanche, les runs reels ne peuvent pas etre conclus green: r128 a revele un bug conversationnel avant fix, et r129 post-fix est bloque par un `502` sur le chemin adjust-plan local. L'etat DB de Rose a ete restaure apres chaque run.

