# QA Run Report — Potion Support bout-en-bout 7 jours (continuité mémorielle) R1

## 1. Contexte Du Test

- Date: 2026-07-17 (soirée)
- Run: `potion_support_7day_e2e_20260717_r1`
- Persona: un compte temporaire `qa-skill` unique (`all_skills_potadm7d20260717`, « Camille », user `f383dbc9-…`), supprimé en fin de run (0 ligne résiduelle sur 9 tables).
- Objectif: valider la continuité mémorielle sur une campagne complète — le contexte d'activation nourrit J1, la conversation du jour N nourrit l'ouverture du jour N+1, les fils ouverts survivent aux jours silencieux, le memorizer nocturne alimente le recall — et observer la fin de vie de la campagne.
- Trajectoire: activation (burn-out, reprise lundi) → J1+conversation → J2+conversation → J3+conversation → J4 silencieux → J5 → J6 + réponse tardive → J7 + conversation finale → sonde de recall.
- Surfaces visees: `activate-potion-v1`, `preparePotionSupportOpening` (extraction/sélection/provenance), ledger cumulatif `user_potion_sessions.metadata.potion_support_v1` (open_threads, message_cursor, opening_history), sas d'admission collant, Présence, `trigger-memorizer-daily` (scopé), recall companion.
- Cadre IA reel: Supabase local, `test-send-message` `force_full_ai=true`, `process-checkins` réel à chaque jour (préflight fleet-wide propre à chaque déclenchement), memorizer TOUJOURS scopé `user_id`.
- Simulation des jours (travail amont assumé): entre chaque jour, décalage temporel uniforme de −22 h de TOUT l'historique du compte (colonnes timestamp + chaînes ISO des blobs JSON : messages, curseur de lecture potion, temp_memory, metadata reminder/session/checkins), puis `whatsapp_last_inbound_at` reposé à −20 h (fenêtre 24 h ouverte, gate calme 2 h satisfaite). L'horloge réelle reste toujours ≥ à l'historique (règle QA horloge). L'ordre relatif et les curseurs sont préservés — vérifié à chaque itération.
- Validite QA: valide. Aucun timeout ni réponse vide ; incidents = décisions métier persistées, documentées ci-dessous.

## 2. Tours De Conversation

Contexte d'activation : `pressure_source` = « Je reprends le travail lundi prochain après six mois d'arrêt pour burn-out, et j'ai peur de replonger dès la première semaine si le rythme repart trop fort », `pressure_state=submerge`.

### Jour 1 — Ouverture J1 (depuis l'activation)

**Verdict du tour:** green

**Sophia (J1)**
> Cette peur de replonger si le rythme repart trop fort à la reprise reste un point important à garder en vue. On peut le prendre au sérieux sans précipiter les choses.

**Trace courte**
- decision=send, anchor = baseline d'activation ; ledger initialisé avec 2 fils `activation_baseline` ; sas `awaiting_first_reply` armé.

### Jour 1 — Conversation (2 tours)

**Verdict du tour:** green

**User (T1)**
> Oui… ce qui me fait le plus peur c'est de ne pas savoir dire non aux sollicitations et de me retrouver à nouveau à faire des semaines de 50 heures. J'ai justement un rendez-vous avec la RH demain matin pour parler d'un retour aménagé.

**Sophia (T1, extrait)**
> Là, le vrai nœud, c'est très clair: ne pas savoir dire non […] Et avec ce rendez-vous RH demain matin pour un retour aménagé, ce n'est pas théorique du tout.

**User (T2)**
> Tu as raison pour le cadre. Je vais noter deux limites à poser demain : pas de réunion après 17h et le mercredi en télétravail. Bon je file, merci.

- T1 `continue_support` → Présence ; T2 `close_session` (campagne intacte). Memorizer scopé : 2 items persistés.

### Jour 2 — Ouverture J2 (reprend la conversation d'hier)

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATUS-03` — temps mal rendu (ancrage relatif hérité)

**Sophia (J2)**
> Hello! Le point de vigilance est devenu plus précis, avec cette difficulté à dire non aux sollicitations et le risque de voir les semaines s'allonger. Tu as aussi déjà posé deux limites concrètes pour demain, ce qui donne une base claire.

**Trace courte**
- Continuité PARFAITE sur le fond : « dire non », « semaines qui s'allongent », « deux limites concrètes » — tout vient de la conversation de la veille (provenance `current_user_segment`).
- Yellow : « pour demain » — le rendez-vous RH, « demain » au moment où l'utilisatrice l'a dit, est devenu AUJOURD'HUI ; l'ancrage relatif est recopié tel quel au lieu d'être réancré.

**Analyse si yellow/red**
- Symptome: expression temporelle relative citée un jour plus tard sans réancrage.
- Source amont probable: le ledger/le composeur d'ouverture stocke et rend le texte des faits avec leurs déictiques d'origine (« demain ») sans normalisation en date absolue à l'extraction.
- Owner runtime: extraction du reducer potion (normalisation temporelle des faits) — même famille que la doctrine « dates dépliées » de P4.
- Meilleure correction selon les guidelines: normaliser les références temporelles relatives en dates absolues au moment de l'extraction (le fait stocké doit dire « au RDV RH de jeudi » pas « demain »), le rendu re-projette ensuite en relatif correct.
- Pourquoi ce n'est pas un patch local: corriger le mot dans le prompt d'ouverture laisserait le ledger porter un fait faux pour tous les autres consommateurs.

### Jour 2 — Conversation (2 tours)

**Verdict du tour:** green

**User (T1)**
> Le rendez-vous RH c'était ce matin en fait, et bonne surprise : ils ont accepté les deux limites […] Par contre mon chef a calé une réunion d'équipe vendredi pour préparer mon retour et rien que d'y penser j'ai le ventre noué.

**User (T2)**
> Oui c'est surtout le moment où tout le monde va me regarder en mode « alors, ce retour ? ». Bref, je voulais te tenir au courant, je m'arrête là pour ce soir.

- T1 `continue_support` (Présence intègre la correction « c'était ce matin » sans accroc) ; T2 `close_session` + accusé chaleureux. Memorizer : 4 items.

### Jour 3 — Ouverture J3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` — preuve → décision proactive (extraction incomplète)

**Sophia (J3)**
> Hello! Tu as déjà obtenu deux appuis concrets pour le retour, et c'est un point solide à partir duquel avancer. On reste sur ces limites simples et nettes, sans en ajouter d'autres pour l'instant.

**Trace courte**
- focus_decision: `kind=progress`, `why="Progres utilisateur frais sans fil frais concurrent"`.
- Ledger au moment de J3 : le fil « réunion d'équipe de vendredi / ventre noué » exprimé la veille n'a JAMAIS été extrait comme open_thread (seuls les fils baseline + « dire non » de J1 y figurent). Le sélecteur serveur a donc correctement appliqué sa politique sur des entrées incomplètes.

**Analyse si yellow/red**
- Symptome: le fil émotionnel le plus vivant de la veille (réunion de vendredi) est absent de l'ouverture, remplacé par un compliment de progrès.
- Source amont probable: extraction du reducer — le message de J2 portait progrès ET nouveau fil dans le même message ; seul le progrès a été extrait (même racine familiale que « progrès et fil ouvert dans le même message » du plan, ici en réel).
- Owner runtime: reducer d'extraction potion (unités structurées).
- Meilleure correction selon les guidelines: renforcer le contrat d'extraction sur les messages composites (progrès + inquiétude nouvelle dans la même phrase = 2 unités), avec test paraphrase dédié ; la politique serveur de priorité est saine et n'est pas à toucher.
- Pourquoi ce n'est pas un patch local: le sélecteur ne peut pas prioriser un fil que l'extraction n'a pas produit.
- Résilience observée: l'utilisatrice re-mentionne la réunion au J3 → le fil entre au ledger et J4 le reprend correctement (auto-guérison si le user re-parle ; perte sinon).

### Jour 3 — Conversation (2 tours)

**Verdict du tour:** green

**User (T1)**
> Franchement les limites c'est acquis, ce n'est plus ça qui m'inquiète. C'est la réunion d'équipe de vendredi qui me travaille : j'ai mal dormi cette nuit […] J'ai essayé la cohérence cardiaque avant de me coucher, ça m'a un peu posée mais ça n'a pas suffi.

- Présence recadre sur le vrai nœud (« le regard des autres ») sans re-vendre les limites. `close_session` en T2. Memorizer : 4 items.

### Jour 4 — Ouverture J4 (fil récupéré) puis silence

**Verdict du tour:** green

**Sophia (J4)**
> Coucou ! Le malaise semble surtout se concentrer sur le regard des autres, plus que sur la réunion elle-même, et c'est un point important à garder au centre. Les limites de reprise sont désormais acquises, ce qui laisse ce sujet-là en arrière-plan.

**Trace courte**
- focus `unresolved_thread` `fresh` = l'appréhension de la réunion de vendredi ; hiérarchie exacte (fil au centre, progrès en arrière-plan) ; aucune répétition des ouvertures précédentes.
- L'utilisatrice ne répond pas ; le sas `awaiting_first_reply` reste armé (design du premier-reply collant).

### Jours 5 et 6 — Créneaux annulés par le sas resté armé

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` — mauvaise transition de flow (garde sans condition de désarmement)

**User**
> Aucun message (l'utilisatrice reste silencieuse).

**Sophia**
> Aucun message envoyé ni J5 ni J6.

**Trace courte**
- J5: `cancelled`, `delivery_last_error=potion_support_preempted_by:potion_support_admission_v1`
- J6: `cancelled`, même raison, alors que 44 h simulées se sont écoulées depuis J4.
- Ces annulations n'apparaissent PAS dans `opening_history` (trou d'observabilité secondaire).

**Analyse si yellow/red**
- Symptome: une seule ouverture ignorée annule silencieusement TOUS les jours suivants. Sans message spontané de l'utilisatrice, la campagne est morte sans être terminalisée, sans trace utilisateur-visible et sans raison terminale.
- Source amont probable: interaction entre deux mécanismes individuellement corrects — (1) le sas d'admission est volontairement exempt de la borne de fraîcheur 4 h pour capter une réponse tardive (test `potion admission keeps exactly the semantic first reply beyond four hours`), (2) la garde scheduler annule tout créneau potion quand un état conversationnel potion est actif (anti-empilement légitime). Ensemble : verrou permanent. Leçon P9 exactement — la garde anti-empilement n'a pas de condition de désarmement.
- Owner runtime: garde de préemption potion dans `process-checkins` + politique de péremption du sas.
- Meilleure correction selon les guidelines: choisir explicitement la sémantique produit — soit (a) une ouverture non répondue se fait REMPLACER par celle du jour suivant (le sas est ré-armé sur le nouveau jour, le créneau du jour part avec un focus qui tient compte du silence), soit (b) le sas expire pour la LIVRAISON au prochain créneau dû (tout en restant collant pour la CONVERSATION). Dans les deux cas, jamais deux jours consécutifs perdus sans décision terminale ni trace.
- Pourquoi ce n'est pas un patch local: allonger/raccourcir arbitrairement un TTL ne règle pas la sémantique ; il faut une règle de remplacement/désarmement explicite et testée.

### Jour 6 — Réponse tardive (récupération du sas collant)

**Verdict du tour:** green

**User**
> Désolée pour le silence, j'avais besoin de couper deux jours. La réunion d'équipe a finalement eu lieu ce matin : le fameux « alors ce retour ? » est venu, et j'ai répondu simplement que je revenais à mon rythme. Ça s'est bien passé, il ne me reste que l'appréhension du vrai premier jour lundi.

**Sophia (extrait)**
> Pas de souci. Tu as coupé deux jours, la réunion a eu lieu ce matin, le « alors ce retour ? » est tombé, et tu y as répondu simplement […] ce que tu redoutais le plus a eu lieu, et tu l'as traversé sans catastrophe.

**Trace courte**
- potion_support_local_dispatch: `action=continue_support`, `phase=first_reply` — la réponse 2 jours après J4 est bien captée par le sas collant (sa raison d'être), promue en Présence, silence accueilli sans reproche, résolution du fil réunion + nouveau fil « lundi » intégrés. `close_session` au tour suivant. Memorizer : 3 items.

### Jour 7 — Ouverture J7 et conversation finale

**Verdict du tour:** green

**Sophia (J7)**
> Coucou ! Le moment redouté a eu lieu, et tu y as répondu simplement. C'est déjà un appui solide pour aborder lundi avec ce point encore ouvert, sans le charger davantage que nécessaire.

**User**
> Oui… je prépare mes affaires pour lundi et bizarrement je me sens plus posée que prévu. La cohérence cardiaque tous les soirs et les limites déjà posées, ça m'a construit un vrai filet. Merci pour cette semaine, sincèrement.

**Sophia**
> Ça se sent : tu arrives à lundi avec quelque chose de solide sous les pieds, pas juste avec du courage improvisé. Le filet que tu décris est réel, et c'est lui qui te permet d'être plus posée que prévu 🙂

**Trace courte**
- J7 `sent`, focus = fil « premier jour lundi » issu de la réponse tardive de la veille. Boucle de continuité complète : activation → J1 → … → J7, chaque ouverture ancrée dans la dernière parole utilisateur.

### Fin de campagne — état terminal

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-03` — lifecycle cassé (campagne épuisée jamais terminalisée)

**Trace courte**
- Après J7 (dernier jour) : reminder toujours `active`, `potion_support_v1.status=active`, 0 créneau restant, aucune raison terminale. Aucun mécanisme de complétion n'existe dans le code (vérifié par recherche).

**Analyse si yellow/red**
- Symptome: une campagne finie reste « active » à vie ; elle continue d'apparaître comme reminder récurrent actif (c'est ce même rendu « mini pause du jour » qui polluait le readout du run R1).
- Source amont probable: la terminalisation n'existe que pour cancel/safety/resolved ; le chemin « tous les jours consommés » n'a pas d'issue.
- Owner runtime: lifecycle de campagne (process-checkins après livraison du dernier jour, ou backstop du scheduler).
- Meilleure correction selon les guidelines: à la clôture du dernier créneau (sent ou cancelled), terminaliser la campagne avec une raison dédiée (`completed_series`), même mécanique vérifiée que les autres raisons terminales.

### Sonde recall (post-campagne)

**Verdict du tour:** green

**User**
> Dis, avant lundi : tu peux me refaire la liste de ce qu'on a mis en place ensemble cette semaine pour tenir la reprise ?

**Sophia**
> Bien sûr. Ce qui tient déjà la reprise, d'après ce qu'on a posé cette semaine : la cohérence cardiaque chaque soir, les limites pro déjà mises, et le fait de te préparer à ton rythme plutôt que de forcer. C'est un filet simple, mais il est réel ✨

**Trace courte**
- Récap exact, zéro confabulation, aligné sur les 13 `memory_items` écrits par les 4 batchs memorizer scopés de la semaine (limites RH, cohérence cardiaque, réunion traversée, préférence « à mon rythme », appréhension lundi).

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- La sensation de « quelqu'un qui suit vraiment » est là : chaque matin reprend précisément la dernière parole de la veille (limites → réunion → regard des autres → lundi), sans jamais rejouer la même ouverture.
- Le silence de 2 jours est accueilli sans culpabilisation, et la réponse tardive est traitée comme une continuité, pas comme un nouveau départ.
- Les clôtures du soir reçoivent des accusés courts et chaleureux ; le récap final est fidèle.

**Problemes**
- Jour 2: « pour demain » au lieu d'aujourd'hui (BF-STATUS-03) — impact faible mais visible. Sévérité: yellow.
- Jour 3: l'ouverture complimente le progrès en ignorant l'angoisse vivante de la veille — le user doit re-dire son inquiétude pour être entendu (BF-PROACTIVE-01). Sévérité: yellow.
- Jours 5-6: deux matins de silence total côté Sophia après un seul jour sans réponse — vécu comme un abandon du dispositif. Sévérité: red (portée système, voir §4).

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Sas → Présence → close_session/exit : 100 % des tours correctement arbitrés par le dispatcher local (8 décisions, zéro erreur de classification après le fix PSA-B01).
- Réponse tardive: le sas collant fait exactement son travail (`first_reply` 2 jours après l'ouverture).

**Memory / Effets durables**
- Chaîne de continuité VALIDÉE de bout en bout : baseline d'activation (J1) → `current_user_segment` (J2, J3, J4, J7) → `carried_user_evidence` (fils portés à travers le jour silencieux) ; curseur de lecture cohérent sous décalage temporel uniforme ; `opening_history` 5 entrées sans répétition.
- Memorizer scopé : 4 batchs, 13 items, tous exacts ; recall final groundé.
- RED : deadlock du jour silencieux (J5+J6 annulés par le sas J4 resté armé) — la campagne ne survit pas à UNE ouverture ignorée sans message spontané du user.
- YELLOW : extraction composite (progrès + fil dans un même message → fil perdu) ; ancrage temporel relatif recopié ; campagne épuisée jamais terminalisée ; annulations absentes d'`opening_history`.

**Problemes**
- Jours 5-6: garde anti-empilement sans condition de désarmement × sas sans péremption de livraison. Famille: `BF-STATE-01`. Impact: mort silencieuse de campagne. Sévérité: red.
- Jour 3: extraction composite incomplète. Famille: `BF-PROACTIVE-01`. Sévérité: yellow.
- Jour 2: déictiques temporels non normalisés. Famille: `BF-STATUS-03`. Sévérité: yellow.
- Fin: pas de terminalisation `completed_series`. Famille: `BF-STATE-03`. Sévérité: yellow.

**Fix propose**
- Source amont: politique de remplacement/désarmement du sas côté scheduler ; contrat d'extraction (unités composites + normalisation temporelle) ; lifecycle de fin de série.
- Correction recommandee: (1) règle explicite « ouverture non répondue = remplacée par le jour suivant » (ré-armement du sas sur le nouveau jour, focus tenant compte du silence) OU péremption de livraison du sas au créneau suivant — jamais deux jours perdus sans décision ; (2) extraction : 2 unités sur message composite + dates absolues dans les faits stockés ; (3) `completed_series` à l'épuisement ; (4) consigner les jours `cancelled` dans `opening_history`.
- Tests d'invariant attendus: jour silencieux → J+1 délivré avec sas ré-armé ; réponse tardive pendant la fenêtre → toujours captée localement ; message composite progrès+fil → fil au focus le lendemain ; « demain » stocké en date absolue ; dernier jour → reminder terminal `completed_series`.

## Verdict Global

- Verdict: red
- Raison principale: le cœur du chantier (continuité mémorielle jour-à-jour, sas, memorizer, recall) est validé sur 7 jours réels simulés, mais un jour sans réponse suffit à tuer silencieusement le reste de la campagne (J5-J6 annulés par le sas resté armé) — inacceptable pour un dispositif de soutien de 7 jours.
- Follow-up prioritaire: acter la sémantique « ouverture non répondue » (remplacement vs péremption de livraison) et l'implémenter avec ses tests ; puis les trois yellows (extraction composite, dates absolues, `completed_series`).

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-17-potion-support-7day-e2e-r1-bugs.md`
