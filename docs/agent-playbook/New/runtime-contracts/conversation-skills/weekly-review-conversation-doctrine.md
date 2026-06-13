# Weekly Review Conversation Doctrine

## Statut

Document de reference produit/runtime pour le flow `weekly_adaptive_review_v1`.

Ce document decrit ce que doit etre un weekly reussi, avant implementation detaillee dans le dispatcher local, le reducer et les prompts visibles.

Il complete la doctrine des dispatchers locaux:

- `docs/agent-playbook/New/runtime-contracts/11-local-dispatcher-doctrine.md`
- `docs/agent-playbook/New/runtime-contracts/09-note-information-contract.md`
- `docs/agent-playbook/New/contract-prompts/anti-patching-qa-charter.md`

## Objectif Du Weekly

Le weekly n'est pas un raccourci vers "modifier le Plan".

Le weekly est un flow parent de bilan et de decision coaching. Son role est de:

- comprendre comment la semaine s'est passee;
- verifier ce qui a ete fait, pas fait, ou partiellement fait;
- combler les gaps utiles quand la DB ou les daily ne suffisent pas;
- comprendre le ressenti d'avancee par rapport a l'objectif global;
- identifier le vrai levier de la semaine suivante;
- proposer des detours outil seulement quand ils servent le diagnostic weekly;
- revenir au weekly apres tout detour;
- produire une synthese claire;
- fermer explicitement le weekly.

Sophia doit leader le weekly. Le user peut amener des solutions, mais Sophia doit verifier si la solution correspond vraiment au probleme avant de lancer un detour.

## Probleme Observe

Le run `weekly-full-r2` a valide la plomberie runtime:

- weekly owner actif;
- global dispatcher bloque;
- product_help inline sans drift vers `prepare_attack_card`;
- handoff local vers `adjust_plan_item`;
- retour weekly et fermeture systeme;
- aucun effet durable depuis le chat.

Mais le flow produit etait trop faible:

- Sophia a laisse le user mener le weekly;
- elle a accepte trop vite "fatigue -> alleger le Plan";
- elle n'a pas mene une vraie verification actions/gaps;
- elle n'a pas assez explore le sentiment d'avancee vers l'objectif global;
- elle n'a pas qualifie si une carte, potion, rappel ou modification Plan etait vraiment pertinente;
- la cloture visible n'etait pas assez claire.

Conclusion: runtime globalement sain, experience weekly insuffisante.

## Principe Central

Le dispatcher weekly doit raisonner comme un coach, pas comme un routeur d'outils.

Une mention de fatigue, blocage, carte, rappel, potion ou Plan n'est pas une raison suffisante pour sortir du weekly.

Le dispatcher doit se demander:

- est-ce que le weekly a assez compris la semaine?
- est-ce que l'action concernee est claire?
- est-ce que le blocage concerne le demarrage, le maintien, le contexte, l'etat emotionnel, la charge, le sens, ou le plan lui-meme?
- est-ce qu'un outil Sophia aide vraiment maintenant?
- est-ce que le user demande explicitement ce detour?
- est-ce que le detour doit revenir au weekly?

## Etapes Saines D'un Weekly Reussi

### 1. Ouverture: comment la semaine s'est passee

But: laisser le user poser son experience humaine de la semaine.

Sophia doit:

- partir du contexte weekly DB/daily deja connu;
- poser une question ouverte mais ciblee;
- ne pas commencer par une solution;
- ne pas refaire tout le bilan action par action si les daily couvrent deja le sujet.

Exemple d'intention:

```txt
Je vois une semaine avec de la traction au debut et une fatigue plus forte ensuite. Comment tu l'as vecue, toi ?
```

### 2. Verification actions et gap filling

Cette etape est obligatoire.

But: stabiliser ce qui est fait, pas fait, partiel, et ce qui manque.

Sophia doit:

- utiliser les daily/DB comme source primaire;
- confirmer rapidement ce qui est clair;
- combler uniquement les gaps utiles;
- distinguer action faite, partielle, manquee, non repondue, ou hors scope;
- ne pas transformer une hypothese en fait;
- ne pas proposer un outil avant d'avoir compris la nature du blocage.

Si tout est fait:

```txt
Je vois que les actions prevues sont tenues. On peut donc plutot regarder ce que ca dit de ton avancee et de ton energie.
```

Si une action est bloquee:

Sophia doit explorer le blocage sur l'action precise:

- est-ce un probleme de demarrage?
- est-ce un probleme de maintien au moment critique?
- est-ce un probleme de contexte?
- est-ce une action trop lourde?
- est-ce un manque de sens?
- est-ce une mauvaise action pour l'objectif?

### 3. Qualification des outils lies a une action

Les cartes d'attaque et de defense sont liees a une action particuliere.

Elles ne doivent pas etre proposees comme solution generique a "je suis fatigue".

#### Carte d'attaque

Pertinente si:

- une action precise est claire;
- le probleme principal est de demarrer, preparer le terrain, reduire la friction, ou rendre le premier geste plus naturel;
- le user veut garder l'action mais a du mal a s'y mettre.

Avant handoff, Sophia doit qualifier:

```txt
Ca ressemble peut-etre a un cas de carte d'attaque, mais je veux verifier: le probleme, c'est surtout de lancer l'action au bon moment, ou plutot de tenir quand quelque chose te fait deriver ?
```

Handoff autorise seulement si:

- l'action cible est claire;
- le fit est plausible;
- le user confirme vouloir preparer la carte;
- ou le user demande explicitement la carte pour cette action.

#### Carte de defense

Pertinente si:

- une action precise est claire;
- le probleme principal est un moment de derapage, impulsion, contexte a risque, fatigue sur le moment, pression, evitement, ou plan B necessaire;
- il faut proteger l'action quand le moment critique arrive.

Avant handoff, Sophia doit qualifier:

```txt
La, ca ressemble plus a une protection du moment critique qu'a un probleme de demarrage. Tu veux qu'on voie si une carte de defense serait adaptee ?
```

Handoff autorise seulement si:

- le moment de risque est suffisamment concret;
- le user confirme;
- ou le user demande explicitement la carte pour cette action.

### 4. Sentiment d'avancee par rapport a l'objectif global

Cette etape est obligatoire.

But: comprendre la dimension coaching/empathie.

Sophia doit demander ou capter:

- est-ce que le user a l'impression d'avancer vers l'objectif global?
- est-ce qu'il se sent aligne, encourage, neutre, inquiet, frustre, deconnecte?
- est-ce que la semaine a donne de la traction ou seulement coute de l'energie?
- qu'est-ce qui doit etre preserve malgre les ajustements?

Si le user l'a deja donne, Sophia ne redemande pas. Elle reformule et approfondit si necessaire.

Exemple:

```txt
Tu dis que tu avances un peu, mais que c'est fragile. Avant de parler solution, je veux verifier: est-ce que cette fragilite vient surtout de la charge, ou du fait que les actions ne te semblent pas assez reliees a l'objectif ?
```

### 5. Qualification des solutions coaching

Les solutions viennent apres diagnostic minimal, pas avant.

#### Ajuster le Plan

`adjust_plan_item` n'est pas une deduction automatique.

Fatigue, surcharge ou blocage ne suffisent pas.

Handoff `adjust_plan_item` autorise seulement si:

- le user demande explicitement de modifier, ajuster, alleger, remplacer, supprimer ou recalibrer le Plan;
- le perimetre est clair ou clarifie;
- la raison du changement est comprise;
- la modification reste un platform handoff, sans mutation chat.

Si le user mentionne fatigue sans demande explicite:

```txt
Je note que la fatigue pese. Avant de parler changement de Plan, je veux comprendre si l'action est trop lourde, ou si c'est surtout ton energie de fin de journee qui a chute.
```

#### State potion

`select_state_potion` peut etre pertinent si:

- le sujet principal est un etat emotionnel ou energetique;
- le user a besoin de revenir a un etat plus disponible;
- le weekly ne doit pas forcer une decision Plan tout de suite.

Avant handoff:

```txt
La, avant de modifier quoi que ce soit, ca ressemble surtout a un besoin de retrouver un etat plus stable. Tu veux qu'on choisisse une potion adaptee ?
```

#### Rappel recurrent

`create_recurring_reminder` peut etre pertinent si:

- le probleme est un rythme, une relance, un rappel de cadre, ou une recurrence;
- le user souhaite une structure externe;
- le besoin n'est pas une modification du Plan lui-meme.

Avant handoff:

```txt
Si le probleme est surtout de remettre ce repere dans ton rythme, un rappel recurrent peut etre plus adapte qu'une modification du Plan. Tu veux qu'on le prepare ?
```

#### Product help / status DB

`product_help` et `status_recap` restent des inline tools temporaires.

Ils ne doivent pas voler le weekly.

- question produit -> `inline_tool_roundtrip` vers product_help, puis retour weekly;
- question statut DB -> `inline_tool_roundtrip` vers status_recap, puis retour weekly.

## Structure Minimale A Stabiliser

Le dispatcher weekly doit suivre des gates conversationnels.

Champs conceptuels a representer dans l'etat local ou la sortie dispatcher:

```json
{
  "week_experience_status": "missing|captured|needs_deeper",
  "action_review_status": "missing|gaps_to_fill|blocker_to_explore|complete",
  "global_progress_status": "missing|captured|needs_deeper",
  "felt_progress_status": "missing|captured|needs_deeper",
  "dominant_blocker_status": "none|hypothesis|confirmed|rejected|ambiguous",
  "preserve_status": "missing|captured|not_needed",
  "detour_candidate": "none|attack_card|defense_card|adjust_plan_item|select_state_potion|create_recurring_reminder|product_help|status_recap",
  "detour_readiness": "not_ready|explore_fit|offer|user_confirmed",
  "weekly_completion_readiness": "not_ready|ready"
}
```

Ces noms sont conceptuels. L'implementation doit partir du contrat JSON reel du dispatcher weekly.

## Regles De Decision

### Ne pas aller trop vite vers les outils

Si le user donne une solution trop tot:

```txt
Je note cette piste. Avant de la preparer, je veux verifier le diagnostic weekly: est-ce que le probleme vient surtout de l'action elle-meme, de ton energie, ou du lien avec l'objectif ?
```

### Ne pas ajuster le Plan sans demande explicite

Interdit:

```txt
User: Je suis fatigue.
Sophia: On va alleger ton Plan.
```

Attendu:

```txt
User: Je suis fatigue.
Sophia: Je note la fatigue. Pour savoir quoi faire, je veux distinguer: est-ce que les actions etaient trop lourdes, ou est-ce que c'est surtout ton energie de fin de journee qui a chute ?
```

### Ne pas proposer carte sans action precise

Interdit:

```txt
User: Je me sens bloque.
Sophia: Faisons une carte d'attaque.
```

Attendu:

```txt
User: Je me sens bloque.
Sophia: Sur quelle action ca s'est vu le plus ? Selon le type de blocage, on verra si une carte d'attaque ou de defense a du sens.
```

### Toujours revenir au weekly apres detour

Tout child flow est un detour au service du weekly.

Apres le detour:

- reprendre la synthese weekly;
- integrer ce qui a ete decide ou prepare;
- fermer clairement.

### Cloture claire

Quand le reducer produit `complete_flow`, le visible agent doit:

- dire que le weekly est termine;
- rappeler la synthese courte;
- ne pas poser une nouvelle question;
- ne pas relancer le Plan ou un outil;
- ne pas dire qu'une modification a ete appliquee.

## Prompts Visibles Necessaires

Le weekly ne doit pas reposer sur un prompt generaliste.

Prompts stage-specific attendus:

- `ask_week_experience`: demander comment la semaine s'est passee.
- `review_action_gaps`: verifier actions faites/manquees/partielles depuis DB + user.
- `explore_action_blocker`: explorer un blocage sur une action precise.
- `qualify_attack_or_defense_fit`: verifier si carte d'attaque ou defense est pertinente.
- `ask_global_progress_feeling`: demander le sentiment d'avancee vers l'objectif global.
- `deepen_global_progress`: approfondir si le ressenti est negatif, ambigu ou contradictoire.
- `qualify_solution_fit`: comparer Plan/potion/rappel/carte sans lancer trop vite.
- `offer_child_detour`: proposer un detour outil avec consentement explicite.
- `handoff_to_child_flow`: transferer au dispatcher local cible avec note_information.
- `return_from_child_flow`: reprendre le weekly apres le detour.
- `weekly_synthesis`: synthese progression + actions + ressenti + decision.
- `weekly_closure`: cloture explicite du weekly.

## Note Information Et Handoffs

Tout changement de dispatcher doit inclure une `note_information`.

Pour un child flow depuis weekly, la note doit contenir:

- source_flow: `weekly_adaptive_review_v1`;
- target_dispatcher;
- handoff_reason;
- user_message_summary;
- active_flow_summary;
- collected_state;
- unresolved_questions;
- confidence;
- evidence;
- recommended_next_focus;
- expected_return_focus: toujours revenir au weekly.

La note n'est pas transmise brute au visible prompt cible.

## Invariants QA

Le weekly est conforme seulement si:

- global dispatcher skipped while weekly active;
- Sophia mene le weekly, le user ne doit pas tout conduire;
- action review/gap filling a lieu avant decision finale;
- sentiment d'avancee vers objectif global est capture ou demande;
- fatigue ne declenche pas automatiquement `adjust_plan_item`;
- outil action-specific seulement si action precise;
- carte d'attaque/defense seulement apres qualification du fit;
- `adjust_plan_item` seulement avec demande explicite et perimetre clair;
- product_help/status sont inline et reviennent au weekly;
- child flow revient au weekly avant cloture;
- no chat mutation depuis weekly;
- platform handoff ne pretend pas appliquer;
- `complete_flow` produit une cloture visible claire, sans nouvelle question;
- cleanup QA scoped si run reel.

## Scenarios QA A Ajouter

### Scenario A: user propose un ajustement trop tot

User donne fatigue + "on devrait alleger".

Attendu:

- weekly ne handoff pas tout de suite;
- Sophia pose une question diagnostic;
- handoff Plan seulement apres demande explicite et scope confirme.

### Scenario B: action bloquee, carte a qualifier

User dit qu'une action precise n'a pas demarre.

Attendu:

- Sophia explore demarrage vs moment critique;
- propose carte d'attaque ou defense seulement apres fit;
- handoff seulement apres consentement.

### Scenario C: ressenti objectif global negatif

User dit que la semaine ne le rapproche pas de l'objectif.

Attendu:

- Sophia approfondit le ressenti;
- ne saute pas au Plan;
- peut qualifier Plan/potion/rappel selon le besoin.

### Scenario D: detour product_help pendant weekly

User demande ou retrouver une ressource.

Attendu:

- `inline_tool_roundtrip` product_help;
- pas de tool flow operationnel;
- retour weekly.

### Scenario E: cloture apres child flow

User confirme synthese apres detour.

Attendu:

- `complete_flow`;
- `validation_unlock_status=available`;
- message de cloture clair;
- aucune question finale.

## Direction D'Implementation

V1 simple:

- renforcer le prompt dispatcher weekly avec les gates ci-dessus;
- ajouter/renommer les visible tasks necessaires;
- bloquer `handoff_to_local_flow` si les gates minimaux ne sont pas satisfaits, sauf demande explicite tres claire;
- ajouter un gate `weekly_synthesis_ready`: le weekly ne peut pas se fermer tant que la synthese n'a pas repris au minimum semaine vecue, actions/gaps, ressenti d'avancee, blocage ou levier principal, decision retenue;
- ajouter un stage visible `weekly_synthesis` obligatoire avant cloture quand un detour child flow a eu lieu ou quand une decision weekly a ete prise;
- specialiser la cloture visible;
- ajouter un gate `weekly_closure_ready`: la cloture n'est autorisee que si la synthese a ete donnee ou acceptee, et si aucun child flow n'est encore actif;
- ajouter un stage visible `weekly_closure` distinct de `weekly_synthesis`: il doit dire clairement que le weekly est termine, sans poser de nouvelle question ni relancer un outil;
- ajouter tests unitaires de reducer/prompt;
- relancer un run QA complet avec user qui propose une solution trop tot.

Ordre de fin attendu:

```txt
diagnostic weekly suffisant
-> decision ou detour qualifie
-> retour weekly si detour
-> weekly_synthesis
-> weekly_closure
-> flow closed
```

La synthese et la cloture ne sont pas optionnelles. Une reponse qui livre un detour Plan, une carte, une potion ou un rappel ne remplace pas la synthese weekly. Une reponse qui resume la decision mais pose une nouvelle question ne compte pas comme cloture.

Ne pas ajouter:

- regex metier;
- routing par mots-cles;
- renderer deterministe;
- template visible fixe;
- nouvelle abstraction transverse inutile.
