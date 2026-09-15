# QA Run — Nina — untested-surfaces15 r1 — 2026-07-12

## 1. Contexte Du Test

- Date: 2026-07-12 (tours joués 23:15 → 23:26 heure de Paris)
- Run: `nina-untested-surfaces15-r1`
- Persona: Nina (`nina@gmail.com`, user_id `e5630c78-447e-452c-b7d6-e4b475cd22fd`), connexion locale `tests/real-personas/nina/connection.json`
- Objectif: couvrir en mode difficile les surfaces jamais exercées dans les rapports des 10–12/07 : multi-intentions dans un même tour, track positif committé, `needs_research`, rappel récurrent depuis le chat, annulation explicite isolée d'un rappel, potion demandée frontalement, exécution/frontière `adjust_plan_item`, statut unifié post-annulation, memory recall actif après batch memorizer, récap groundé de fin de session.
- Trajectoire: track multi-intent (T1–T4) → recherche web (T5) → rappels récurrent/one-shot (T6–T7) → potion vs carte (T8–T9) → ajustement plan (T10) → multi-intent cancel+mémoire (T11) → statut (T12) → ambiguïté (T13) → track habit en flow coaching (T14) → memorizer déclenché → recall + récap (T15)
- Surfaces visées: dispatcher V2, tool skills always-on (`track_progress_plan_item`, `create_one_shot_reminder`, `cancel_one_shot_reminder`), `product_help`, `feature_opportunity`, `plan_realignment`, `coaching_recommendation` (flow collant + exit), `needs_research` (grounding Gemini), memorizer nocturne + recall runtime, effect ledger, projections statut.
- Cadre IA reel: Supabase local, `POST /functions/v1/test-send-message` avec `force_full_ai=true`, `x-user-authorization` JWT Nina (login password, vérifié via `/auth/v1/user` 200), messages user choisis tour par tour après lecture des réponses. Aucun renderer déterministe, aucun fallback.
- Grounding: le `current-plan.md` de Nina est périmé (persona reseedée) ; grounding DB fait avant T1 — plan actif `ca529096-801a-4f41-aa65-349aaedd6850`, 4 items : « Prendre un petit-déjeuner posé » (habit, 5/sem), « Boire un grand verre d'eau avant de grignoter » (habit, 7/sem), « Préparer une option saine à portée » (task), « Planifier deux dîners de la semaine » (task).
- Validite QA: **valide** (15/15 tours HTTP 200, IA réelle, aucune réponse vide, hygiène temp_memory vérifiée avant T1, état restauré au baseline en fin de run).

Incidents environnement (hors verdict produit) :

- **E1 — batch memorizer externe pendant le run** : deux exécutions `trigger-memorizer-daily` avec `hours=30` non déclenchées par le run (21:25:14 et 21:28:53 UTC, extraction run `4ae3ecb1`) ont tourné entre T14 et T15. Le cron pg_cron local de `trigger-memorizer-daily` est à `0 0 * * *`, donc l'appelant est inconnu (à auditer : `trigger-synthesizer-batch` ou autre processus local). Conséquence : le batch délibéré du run (`hours=3`, 21:27:30) n'a trouvé que 3 messages non traités. Les 4 memory_items utilisés au T15 viennent du batch externe — le contenu reste celui du run, le test recall reste exploitable.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-AGENDA-01 — multi-intention incomplète

**User**
> hello sophia ! bon ça y est, j'ai enfin préparé mes trucs sains hier soir : des amandes en petits sachets et des pommes posées sur le bureau, donc ça c'est fait tu peux le noter. et au fait question, je peux recevoir mes rappels sur whatsapp plutôt que sur l'appli ?

**Sophia**
> Je ne peux pas te confirmer ici un envoi des rappels sur WhatsApp plutôt que dans l'appli. Ce que je peux te dire, c'est que les rappels ponctuels se gèrent dans Dashboard > Initiatives.

**Trace courte**
- http_status: 200
- response_owner: product_help
- selected_handler: product_help
- route_reason: product_help_signal
- safety: none
- direct_effects: `direct_effects_to_run: []`
- tool_skill_run: null (aucun effet track demandé)
- durable_effect: **aucun** — `user_plan_item_entries = 0` vérifié en DB
- note frame: `memory_plan.response_intent = "product_help_question_with_track_progress_note"` — le frame a VU l'intention track, mais aucun effet n'a été émis

**Analyse**
- Symptome: le « ça c'est fait tu peux le noter » (avec preuve détaillée) est avalé en silence : ni écriture, ni accusé de réception, ni report honnête. La réponse ne traite que la question WhatsApp — et de façon évasive (le produit A un canal WhatsApp ; « les rappels ponctuels se gèrent dans Initiatives » est en plus faux : les ponctuels se gèrent dans le chat, Initiatives couvre le récurrent).
- Source amont probable: agenda de tour / lane always-on — quand le dispatcher route `product_help`, la lane `track_progress_plan_item` n'émet rien (contraste : aux T6–T7 et T11, les tool skills tournent bien en parallèle de `feature_opportunity`/`normal_reply` ; au T1 `tool_skill_run` est null).
- Owner runtime: dispatcher V2 / TurnAgenda.
- Meilleure correction selon les guidelines: garantir contractuellement que la détection d'un report de progression (déjà notée par le frame dans `response_intent`) émet un effet track ou une ligne d'agenda avec restitution visible (« je note X » ou question de clarification), quel que soit le `response_owner` du tour. Test d'invariant : message bi-intentionnel product_help + track → soit un `requested_effect` track dans la trace, soit une phrase de suivi explicite ; jamais zéro des deux.
- Pourquoi ce n'est pas un patch local: le symptôme n'est pas une phrase manquante mais une intention perdue entre frame et agenda ; corriger le prompt du composeur product_help ne réémettrait pas l'effet.

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-LEDGER-02 — outcome tool-skill mal rendu (question de clarification supprimée par le composeur)

**User**
> attends, et ma préparation de collations alors ? je te dis que c'est fait, c'était une de mes actions de la semaine, tu peux le cocher non ?

**Sophia**
> Tu parles de "préparer une option saine à portée", et oui, c'est bien une action de la semaine, mais je ne peux pas la cocher sur ta seule annonce ici : dans ce fil, elle reste seulement signalée, pas confirmée comme enregistrée.

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- tool_skill_run: `track_progress_plan_item`, status `needs_clarify`, reason `target_not_evidenced`
- requested_effects: track completed sur la BONNE cible (`74783025… Préparer une option saine à portée`)
- durable_effect: aucun (bloqué)

**Analyse**
- Symptome: le router a produit la question de clarification prévue par le contrat (« Tu parles de quelle action exactement ? Je pensais à "X" mais je préfère que tu me la nommes avant de la noter ») — la réponse visible la remplace par du jargon produit (« signalée, pas confirmée comme enregistrée ») SANS poser de question. Le user ne peut pas savoir quoi répondre ; la boucle 3g (`pending_direct_effect_clarification`) est cassée à la racine.
- Source amont probable: composeur/final response pipeline qui réécrit le `reply` d'un outcome `needs_clarify` au lieu de le porter.
- Owner runtime: companion/composeur + contrat O (la question part au composeur).
- Meilleure correction selon les guidelines: invariant de rendu — un outcome `needs_clarify` d'un tool skill DOIT produire une question dans la réponse visible (la question du router peut être reformulée mais pas supprimée). Test d'invariant : tout tour avec `status=needs_clarify` contient un `?` adressant le slot manquant.
- Pourquoi ce n'est pas un patch local: c'est le contrat de couture router→composeur qui est violé ; une regex sur la phrase ne protège pas les autres reason_codes.

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-01 — cible/preuve déjà fournies, re-blocage (conséquence directe du T2)

**User**
> bah si je te confirme : hier soir j'ai rempli 5 petits sachets d'amandes et j'ai mis des pommes sur mon bureau au boulot. l'action est faite à 100%, note-la comme faite s'il te plait.

**Sophia**
> Tu me donnes bien la cible, et le geste est clair : préparer une option saine à portée. Je ne peux pas le marquer comme fait ici sans confirmation enregistrée côté suivi, donc pour l'instant je le garde comme annoncé, pas validé.

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- tool_skill_run: `track_progress_plan_item`, status `needs_clarify`, reason `target_not_evidenced` (2e blocage consécutif)
- requested_effects: bonne cible, `date_hint: 2026-07-11` correctement extrait
- durable_effect: aucun (bloqué)

**Analyse**
- Symptome: la réponse dit textuellement « tu me donnes bien la cible, le geste est clair » puis refuse quand même d'écrire, avec un motif inventé (« confirmation enregistrée côté suivi » ne correspond à aucun mécanisme produit). Le user a confirmé deux fois avec preuve ; il faudra qu'il cite le titre exact entre guillemets (T4) pour que la garde s'ouvre — parler « comme un test ».
- Source amont probable: double étage — (a) la question de clarification jamais posée au T2 n'a pas armé/exploité la boucle 3g ; (b) la garde G1 `trackTargetEvidenceVerified` exige le nommage verbatim titre/alias même quand le user CONFIRME la cible que Sophia vient elle-même de nommer (« Tu parles de "préparer une option saine à portée" » → « bah si je te confirme » devrait valoir target_evidence).
- Owner runtime: `tools/always_on/track_progress_plan_item/router.ts` (G1) + dispatcher 3g.
- Meilleure correction selon les guidelines: au niveau du contrat 3g — une confirmation affirmative du user portant sur la cible que Sophia a nommée au tour précédent vaut evidence pour un track POSITIF (la tolérance stricte reste légitime pour `missed`, cf. P1-1). Tests d'invariant : (1) séquence « annonce descriptive → Sophia nomme la cible → user confirme » = commit ; (2) anti-faux-positif : confirmation vague sans nommage préalable par Sophia = toujours clarify.
- Pourquoi ce n'est pas un patch local: assouplir la regex d'alias diluerait la protection P1-1 des tracks négatifs ; le bon niveau est la sémantique de confirmation dans la boucle 3g.

### Tour 4

**Verdict du tour:** green

**User**
> je te parle de l'action "préparer une option saine à portée" de mon plan. c'est elle que j'ai faite hier soir avec mes sachets d'amandes. tu peux la noter faite maintenant ?

**Sophia**
> Oui — "Préparer une option saine à portée" est bien noté comme fait, avec la date du 11/07.

**Trace courte**
- tool_skill_run: `track_progress_plan_item` status `logged` ; committed `logged_progress_id 1dd5a16a…`, `item_patch_applied: true`
- durable_effect: **vérifié DB** — `user_plan_item_entries` : outcome `completed`, effective_at 2026-07-11 ; item passé `status=completed`
- Confirmation sobre avec cible nommée et date. Exactement le contrat.

### Tour 5

**Verdict du tour:** green

**User**
> dis-moi, une collègue me tanne avec le jeûne intermittent 16/8. est-ce que ça marche vraiment mieux qu'autre chose pour perdre du poids ? tu peux me dire ce que disent les études récentes, genre 2025-2026 ?

**Sophia**
> En bref : non, le 16/8 ne fait pas mieux que la restriction calorique classique pour perdre du poids. Les études récentes 2025-2026 disent surtout que la perte de poids est en moyenne comparable, et que l'avantage du 16/8 vient surtout du fait qu'il peut être plus simple à tenir pour certains. […] perte de poids similaire […] vigilance sur la masse maigre si l'apport en protéines est insuffisant […] Donc si ta collègue présente le 16/8 comme "meilleur", la réponse honnête c'est : pas vraiment supérieur, plutôt une autre façon d'atteindre un déficit énergétique 🙂

**Trace courte**
- turn_frame.needs_research: `detected: true`, confidence 0.97, domain_hint `sante.alimentation`
- llm_usage_events: appel `research_grounding` (gemini-3-flash-preview) AVANT le composeur — vrai grounding web, pas un claim
- response_owner: normal_reply
- Réponse groundée, nuancée, respectueuse du persona (pas de discours nutritionnel culpabilisant).

### Tour 6

**Verdict du tour:** green

**User**
> ok merci c'est clair. bon sinon pour m'aider à tenir : tu peux me rappeler tous les soirs à 21h30 de préparer ma collation du lendemain ? sinon je vais zapper

**Sophia**
> Pour ce besoin récurrent à 21h30, la bonne surface c'est les initiatives. Rien n'a été créé en rappel ponctuel ici, parce qu'un rythme tous les soirs se règle dans Initiatives. Va dans Dashboard > Initiatives et configure quoi dire, à quelle heure, et tous les jours actifs. Si tu veux, je peux t'aider à formuler le message exact.

**Trace courte**
- response_owner: feature_opportunity
- tool_skill_run: `create_one_shot_reminder` status `blocked`, reason `recurring_not_supported`
- durable_effect: **aucune ligne fantôme** — `user_recurring_reminders = 0`, `scheduled_checkins = 0` vérifiés
- Frontière récurrent-depuis-le-chat tenue honnêtement : garde déterministe + handoff précis + offre d'aide. Première couverture QA de cette garde.

### Tour 7

**Verdict du tour:** green

**User**
> ok j'irai voir les initiatives. mais en attendant fais-moi au moins un rappel demain soir 21h30 pour préparer ma collation de mardi, comme ça je teste

**Sophia**
> C'est fait : demain soir à 21h30, je te rappelle de préparer ta collation de mardi.
> Pour ton besoin régulier tous les soirs, la bonne surface reste les initiatives. […]

**Trace courte**
- tool_skill_run: `create_one_shot_reminder` status `success` ; committed id `4fac2900…`, `2026-07-13T19:30Z` (= 21:30 Paris, résolution de date correcte un dimanche soir)
- durable_effect: **vérifié DB** — `scheduled_checkins` pending, origin `rendez_vous`, `one_shot_reminder:preparer_ma_collation_de_mardi`
- Write-through P0 respecté (committed = ligne DB) ; pas de BF-EFFECT-02 reproduit sur ce chemin.

### Tour 8

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-AGENDA-01 — objet demandé (potion) non adressé, substitution silencieuse

**User**
> au fait j'ai vu passer un truc sur les potions dans l'appli. le soir vers 22h je craque souvent sur du sucré devant la télé... tu peux m'activer une potion pour ça directement ?

**Sophia**
> Je partirais sur une carte de défense libre : là, le vrai risque c'est le moment où tu es devant la télé et où l'envie monte. Elle te sert à repérer le moment critique, voir le piège qui t'embarque, prévoir un geste de retour en moins de 30 secondes et garder un plan B simple. Si tu veux, je peux t'aider à la formuler en une phrase très naturelle.

**Trace courte**
- response_owner: coaching_recommendation (flow collant ouvert, skill_run `continue`)
- durable_effect: aucun (correct — `user_potion_sessions = 0`)

**Analyse**
- Symptome: le mot « potion » et la question directe (« tu peux m'activer une potion ? ») disparaissent : ni réponse à la question posée, ni explication du choix carte-plutôt-que-potion. La doctrine cartes exige : garder un doute, expliquer simplement la différence, proposer les options proches. La technique choisie (carte de défense sur moment critique récurrent) est par ailleurs pertinente.
- Source amont probable: dispatcher local coaching / composeur reco qui ne porte pas l'objet explicitement demandé par le user dans sa réponse.
- Owner runtime: coaching_recommendation (intake + composeur).
- Meilleure correction selon les guidelines: contrat reco — quand le user demande un outil nommé et que la reco en choisit un autre, la réponse doit accuser réception de l'outil demandé et motiver la différence (le T9 montre que le skill sait le faire quand on insiste).
- Pourquoi ce n'est pas un patch local: c'est une règle de complétude d'agenda (objet demandé ≠ objet recommandé), pas une phrase.

### Tour 9

**Verdict du tour:** green

**User**
> attends mais ma question c'était les potions. c'est quoi la différence avec ta carte là ? et concrètement tu peux m'en activer une toi ou pas ?

**Sophia**
> La différence, c'est simple :
> - une potion aide quand l'état global prend trop de place sur plusieurs jours […]
> - une carte aide quand il y a un moment précis qui déraille, comme le craquage devant la télé à 22h
> Dans ton cas, c'est plutôt la carte qui colle […]
> Et non, je ne peux pas t'en activer une directement depuis ici. Par contre, je peux t'aider à la préparer en version très simple, pour que tu la crées ensuite dans Ressources.

**Trace courte**
- response_owner: coaching_recommendation (continue)
- Récupération complète : distinction potion/carte juste, honnêteté sur la frontière chat/produit (pas d'activation depuis le chat), handoff Ressources. Aucun claim fantôme.

### Tour 10

**Verdict du tour:** green

**User**
> ok je verrai pour la carte. autre chose de plus important : le grand verre d'eau avant de grignoter, 7 jours sur 7 c'est trop pour moi, je m'en sors pas. je veux passer à 4 fois par semaine, durablement, pas juste cette semaine.

**Sophia**
> Je vois surtout que le rythme actuel est devenu trop lourd pour tenir dans la durée, et que tu veux revenir à quelque chose de réaliste: 4 fois par semaine plutôt que 7 sur 7.
> Ouvre Dashboard > Plan > Ajuster mon plan, puis décris dans le cadre ce qui ne tient plus, ce que tu veux garder, et le rythme qui te paraît soutenable sur la durée.

**Trace courte**
- response_owner: plan_realignment ; skill_run `complete` (le flow coaching de T8–T9 a été correctement quitté)
- durable_effect: aucun — **vérifié** `target_reps` reste 7 (le chat n'écrit pas le plan, conforme au design adjust-plan-v1)
- Demande explicite durable → reconnaissance du besoin + handoff exact vers la surface légitime. Frontière adjust tenue dans le sens « pas de modification sauvage », sortie de flow propre.

### Tour 11

**Verdict du tour:** green

**User**
> bon finalement annule le rappel de demain 21h30, ma soeur passe à la maison je vais pas le faire. par contre retiens bien un truc important : je suis allergique aux noix de cajou, donc les collations avec des cajou c'est mort.

**Sophia**
> Le rappel de demain 21h30 est annulé.
> Et c'est noté pour l'allergie aux noix de cajou : je n'utiliserai pas ça dans tes collations 🙂

**Trace courte**
- tool_skill_run: `cancel_one_shot_reminder` status `success` ; committed ids `["4fac2900…"]`, bonne cible
- durable_effect: **vérifié DB** — checkin `4fac2900` passé `cancelled` ; `memory_items = 0` in-turn (attendu : write nocturne memorizer)
- Multi-intent DANS le même tour correctement traité cette fois : annulation committée + accusé mémoire honnête. Première couverture QA du cancel explicite isolé — contraste instructif avec le T1.

### Tour 12

**Verdict du tour:** green

**User**
> du coup pour être sûre, il me reste quoi comme rappels actifs là ? rien d'autre qui traîne ?

**Sophia**
> Actifs, il ne te reste rien côté rappels.
> Il y a juste un rappel ponctuel annulé récemment qui traîne dans l'historique : demain 21h30 pour préparer ta collation de mardi, mais il est annulé donc il ne partira pas.

**Trace courte**
- response_owner: normal_reply, aucun tool
- Projection statut exacte : zéro actif, l'annulé restitué comme historique avec son contenu réel (« créé puis annulé » = exactement l'invariant BF-STATUS-02). Aucun rappel halluciné, aucun récurrent fantôme. Valide le chantier statut post-P0 sur le chemin cancel.

### Tour 13

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-04 — ambiguïté non reconnue (+ répétition de pitch, à suivre)

**User**
> nickel. dis, tu pourrais me faire un truc pour le week-end prochain ? c'est toujours là que je dérape

**Sophia**
> Oui, je partirais sur une carte de défense libre : tu veux protéger un moment qui revient toujours le week-end, quand tu sens que ça dérape. Ici, le bon angle c'est de repérer le moment critique, ce qui t'embarque, le geste de retour rapide et un plan B simple. Si tu veux, je peux t'aider à la poser en une phrase claire.

**Trace courte**
- response_owner: coaching_recommendation (flow rouvert, skill_run `continue`)
- durable_effect: aucun (correct)

**Analyse**
- Symptome: « me faire un truc » + « je dérape » sans cible nommée = le cas d'ambiguïté canonique de la fiche persona (« Sophia doit clarifier avant toute opération »). Sophia infère grignotage-week-end sans le confirmer et re-pitch la carte de défense avec la MÊME structure en 4 temps qu'au T8 (moment critique / piège qui embarque / geste de retour / plan B) — deuxième récitation quasi verbatim dans la session (pattern déjà vu chez Eva 07-10 T3).
- Source amont probable: intake coaching (pas de gate de confiance sur la cible) + absence de mémoire courte anti-répétition intra-session du composeur reco.
- Owner runtime: coaching_recommendation.
- Meilleure correction selon les guidelines: gate d'ambiguïté au niveau intake (cible non nommée + signal faible → une question de cadrage avant reco) + contrainte de variation du composeur reco sur ré-explication d'une même technique (l'anti-répétition intra-flow est déjà un follow-up ouvert d'Eva 07-10).
- Pourquoi ce n'est pas un patch local: sans gate, toute formulation floue « fais-moi un truc » déclenchera la reco par défaut ; la severité reste yellow car aucune opération n'a été exécutée.

### Tour 14

**Verdict du tour:** green

**User**
> on verra la carte plus tard. par contre note un truc : ce matin j'ai bien fait mon action "prendre un petit-déjeuner posé", tranquille avant que ma soeur arrive. tu me le comptes ?

**Sophia**
> Ce matin, ton petit-déjeuner posé est bien compté comme fait. Et le fait que ce soit tranquille avant l'arrivée de ta sœur, c'est exactement le bon contexte 🙂

**Trace courte**
- skill_run: **`exit`** — le flow coaching relâche proprement sur intention track (couture flow→tool skill correcte)
- tool_skill_run: `track_progress_plan_item` `logged` ; committed `202d032d…`, item habit `501e541b…`, date 2026-07-12
- durable_effect: **vérifié DB** — entry `completed` effective 12/07, `current_reps` 0→1 ; occurrences de la semaine (lun–ven) laissées intactes : la complétion d'un dimanche non planifié est comptée au niveau item sans corrompre la grille hebdo (cohérent avec la doctrine weekly)
- Track habit (vs task au T4) committé du premier coup quand la cible est nommée.

### Tour 15

**Verdict du tour:** green

**User**
> bon je vais me coucher. juste avant : tu te rappelles ce que je t'ai dit côté allergie ? et fais-moi un mini récap de ce qu'on a fait ensemble ce soir, ce qui est noté et ce qui reste à faire de mon côté

**Sophia**
> Oui : tu m'as dit que tu es allergique aux noix de cajou, donc on les évite dans tes collations.
> Mini récap de ce soir :
> - noté/fait : ton petit-déjeuner posé de ce matin, tranquille avant l'arrivée de ta sœur
> - noté/fait : le rappel de demain 21h30 pour la collation de mardi a été annulé
> - noté : l'allergie aux noix de cajou
> - en tête : ton passage de 7/7 à 4 fois par semaine pour le grand verre d'eau avant de grignoter
> - reste à faire de ton côté : si tu veux avancer sur le week-end qui dérape, la carte de défense est toujours à formuler dans l'appli

**Trace courte**
- Contexte : `trigger-memorizer-daily` déclenché délibérément entre T14 et T15 (aucun autre run en parallèle) ; 4 `memory_items` actifs dont « Il est allergique aux noix de cajou »
- response_owner: normal_reply
- Recall correct de l'allergie ; récap fidèle : rien d'inventé, l'annulation restituée comme annulation, l'ajustement 7/7→4 correctement présenté comme NON appliqué (« en tête »), la carte comme restant à créer côté produit.
- Réserves mineures (non bloquantes) : le track du T4 (« préparer une option saine ») et le renvoi Initiatives/Ajuster mon plan manquent dans le « reste à faire » ; et le test recall est méthodologiquement faible car même session (l'allergie était aussi dans l'historique de conversation) — un vrai test cross-session reste à faire.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- À partir du T4, la conversation est naturelle et dense : réponses courtes, cibles nommées, dates locales justes, aucun claim fantôme, honnêteté systématique sur les frontières chat/produit (T6, T9, T10).
- La réponse recherche (T5) est exactement le bon registre pour Nina : réponse d'abord, nuances ensuite, zéro culpabilisation.
- Le multi-intent du T11 (annulation + mémoire) est traité en deux lignes propres — la meilleure réponse du run.
- Le récap final (T15) est fidèle et hiérarchisé, y compris sur ce qui n'a PAS été fait.

**Problemes**
- Tours 1–3: pour faire noter une action terminée, Nina a dû s'y reprendre à QUATRE fois et finir par citer le titre exact entre guillemets — parler « comme un test », le critère explicite de la fiche fluidité. Aggravé par deux réponses au jargon opaque (« signalée, pas confirmée comme enregistrée », « confirmation enregistrée côté suivi ») qui ne posent aucune question. Familles: BF-AGENDA-01, BF-LEDGER-02, BF-INTAKE-01. Impact: découragement immédiat sur LE geste central du produit (reporter un progrès). Severite: red sur la séquence.
- Tour 8: la question potion est ignorée sans un mot — le user doit re-poser sa question. Famille: BF-AGENDA-01. Severite: yellow.
- Tour 13: pitch carte de défense récité deux fois quasi à l'identique dans la même session ; demande floue jamais clarifiée. Famille: BF-INTAKE-04. Severite: yellow.

**Fix propose**
- Source amont: agenda de tour (intentions secondaires) + contrat de rendu des outcomes `needs_clarify` + gate d'ambiguïté coaching.
- Correction recommandee: voir tours 1, 2, 3, 8, 13 — trois corrections contractuelles (agenda, rendu clarify, évidence-par-confirmation), pas de réécriture de phrases.
- Tests d'invariant attendus: bi-intention → jamais zéro trace de la 2e intention ; `needs_clarify` → question visible ; « annonce → Sophia nomme → user confirme » → commit.

La note globale reste yellow (pas red) parce que la friction est concentrée sur une séquence en début de run, avec récupération complète, et que les 11 autres tours sont d'un très bon niveau conversationnel.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Dispatcher globalement juste : product_help (T1), normal_reply+tool lane (T2–T4, T11–T12, T14), feature_opportunity (T6–T7), coaching_recommendation (T8–T9, T13), plan_realignment (T10). Sorties de flow coaching propres aux T10 (`complete`) et T14 (`exit`).
- `needs_research` détecté (0.97) et CONSOMMÉ (appel `research_grounding` Gemini réel avant composition) — revalidation du chantier V4.

**Skills / Operations / Tools**
- `track_progress_plan_item` : cible toujours correctement résolue, mais la garde G1 + la boucle 3g cassée par le composeur bloquent deux tours de suite un track positif légitime (T2–T3) ; commits impeccables quand le titre est nommé (T4, T14), y compris patch d'item et grille hebdo intacte.
- `create_one_shot_reminder` : garde `recurring_not_supported` correcte (T6), création committée et persistée (T7), annulation ciblée committée (T11) — le sous-système rappel, point rouge des runs des 10–12/07, est VERT sur ce run (chemins create/cancel/status hors flow).
- Potions / cartes / plan : aucune écriture sauvage, frontières produit toutes honnêtes (T8–T10). La demande frontale de potion n'est pas adressée verbalement au T8 (yellow).
- Aucun executor appelé directement, aucun effet pendant un signal safety (aucun signal safety sur ce run).

**Memory / Effets durables**
- Effets durables tous vérifiés en DB après chaque tour ; zéro ligne fantôme, zéro claim sans commit sur les 15 tours.
- Memorizer : l'accusé « c'est noté » in-turn sans write est conforme ; le batch a persisté le fait d'allergie. **Mais les 4 memory_items genrent Nina au masculin** (« Il est allergique », « il a préparé ») — défaut d'extraction à corriger avant que ces items ne soient réinjectés dans des réponses.
- Incident E1 (batch memorizer externe mid-run, appelant inconnu, cron quotidien hors de cause) : environnement, pas produit — mais à auditer, c'est la 3e occurrence de la famille « batch concurrent » (cf. Eva global15 r1, Rose 07-12 E1).

**Problemes**
- Tour 1: intention track avalée sans trace ni restitution. Famille: BF-AGENDA-01. Impact systeme: effet durable attendu absent, silencieusement. Severite: red.
- Tours 2–3: outcome `needs_clarify` rendu sans question → boucle de clarification 3g inopérante → double blocage d'un write légitime. Familles: BF-LEDGER-02, BF-INTAKE-01. Severite: red (confirmation mal traitée).
- Tour 1 (secondaire): réponse product_help erronée sur la surface des rappels ponctuels (« se gèrent dans Initiatives »). Famille: BF-STATUS-01 (projection produit imprécise). Severite: yellow.
- Memorizer: genre du sujet faux dans 4/4 items. Famille: a classifier (extraction memorizer — attribution de genre ; aucune famille BF-MEMORY ne couvre la qualité d'extraction). Severite: yellow.

**Fix propose**
- Source amont: TurnAgenda/dispatcher (émission des intentions secondaires), contrat router→composeur sur `needs_clarify`, sémantique de confirmation dans 3g, prompt d'extraction memorizer (profil/genre du user).
- Correction recommandee: détaillée tour par tour ci-dessus.
- Tests d'invariant attendus: cf. tours 1–3 ; pour le memorizer, invariant « les items sont rédigés au genre du profil ou en style neutre (2e personne) ».

## Verdict Global

- Verdict: **red**
- Raison principale: la chaîne track positif (T1–T3) — intention explicite avalée puis double blocage d'un write légitime avec une question de clarification jamais posée ; le geste produit le plus basique (dire « c'est fait ») exige de citer le titre exact de l'action.
- Follow-up prioritaire: (1) contrat d'agenda multi-intentions (aucune intention d'effet détectée ne meurt sans trace ni restitution) ; (2) invariant de rendu `needs_clarify` = question visible + confirmation-de-la-cible-nommée vaut evidence en 3g ; (3) audit de l'appelant memorizer local mid-run (E1) ; (4) corriger le genre dans l'extraction memorizer ; (5) re-tester le recall en session séparée (le test de ce run était intra-session).

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-12-nina-untested-surfaces15-r1-bugs.md`
