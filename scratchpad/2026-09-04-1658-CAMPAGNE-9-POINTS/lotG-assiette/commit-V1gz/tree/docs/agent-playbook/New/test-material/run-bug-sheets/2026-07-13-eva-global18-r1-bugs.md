# Bug Sheet — eva-global18-r1 (2026-07-13)

Rapport source : `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-13-eva-global18-r1.md`
Run **red** — 1 tour red (T9, multi-intent), 4 tours yellow (T1, T3, T7, T8).
Re-tests **verts** confirmés : ledger exit-de-flow soldé par `superseded_by_dedup` (fix P2-6 du 13/07), pas de capture de flow (BF-ROUTE-02) au pivot, statut rappels exact (BF-STATUS mort sur ce chemin), memorizer hygiène d'objet (fix du wart global17 : états d'outils exclus).
Constat documentaire : **la création de carte in-chat (`prepare_attack_card`/`prepare_defense_card`) n'existe plus dans `sophia-brain`** — la fiche `02-operation-suggestion` est obsolète sur ce point ; le refus honnête de Sophia (T4) est conforme.

## R1-B01 — Multi-intent : rappel non émis quand il cohabite avec un track dans un tour

- Bug id: R1-B01
- Tours: T9
- Famille: `BF-AGENDA-01` (fond) + `BF-LEDGER-02` (rendu)
- Domaine owner: dispatcher (émission des `direct_effects` multi-intent) + frontière intake track/reminder
- Source amont: sur un tour à deux intentions explicites (`track_progress_plan_item=missed` **et** `create_one_shot_reminder`), le dispatcher n'émet **que** le track ; le rappel n'apparaît pas dans `requested_effects` (alors que `turn_frame` mentionne « reminder »). Le tour est classé dans le domaine « report d'action » et la seconde intention (création) est aplatie. Le renderer applique alors au rappel la sémantique du track (« je ne peux pas te le **compter comme posé** »).
- Symptome visible: « C'est marqué comme raté pour hier. Pour le rappel demain à 18h, il n'est pas encore affiché ici comme confirmé, donc je ne peux pas te le compter comme posé. » — le rappel demandé n'est pas créé et la réponse répond à côté ; l'user doit re-demander (T10, où le rappel seul passe parfaitement).
- Preuve systeme: trace T9 `requested_effects=[track_progress_plan_item]` seul, `committed` = 1 track (`logged_progress_id f8da30f1`) ; DB : toujours 1 rappel (le 22h30 du T5), aucun rappel demain 18h. T10 isole : `create_one_shot_reminder` seul → committed `2ae24626`, DB 2 pending.
- Correction attendue: le contrat d'émission des direct effects doit supporter N effets de **types distincts** dans un même tour ; quand deux domaines cohabitent (report + création), chacun produit son effet et le renderer les solde séparément. Ne pas laisser le domaine « track » capturer et écraser une création de rappel.
- Statut: `fix_applied` (2026-07-13, chantier P3-D)
- Fix reference: règle 3d-ter-bis (deux effets de TYPES distincts dans un tour = les DEUX émis, verbatim T9 ; l'aplatissement de la seconde intention nommé comme l'erreur) + test sanitizer (track+create conservés ensemble — le runtime les soldait déjà séparément). Probe live eva T9 : 1 entry missed + 1 pending rappel dans le même tour, 2× GREEN.
- Tests requis: positif (« marque X comme raté **et** rappelle-moi Y demain 18h » → 1 track committed + 1 reminder committed, rendus distincts) ; paraphrase (« note que j'ai zappé Z hier, et mets un rappel demain matin ») ; ordre inversé (rappel d'abord, track ensuite) ; anti-faux-positif (un seul domaine dans le tour → un seul effet, pas d'effet fantôme) ; intégration renderer (aucune sémantique « compter comme posé » sur une création de rappel).

## R1-B02 — Track positif : plage de dates composite aplatie sur une seule date

- Bug id: R1-B02
- Tours: T7
- Famille: `BF-INTAKE-05`
- Domaine owner: intake/reducer du tool `track_progress_plan_item`
- Source amont: expression temporelle composite « hier **et** avant-hier » (11 + 12/07) résolue en un `date_hint` unique `2026-07-12` ; aucun second effet `completed` émis pour la seconde date. Le memorizer (qui lit le message brut) a, lui, correctement extrait « Hier et avant-hier … » → l'info « 2 jours » existe côté extraction, seul l'intake track l'a collapsée.
- Symptome visible: « j'ai bien posé "Poser le téléphone en rentrant" comme fait, pour le 12 juillet » (singulier) ; sous-comptage durable d'un report positif (habitude 7/sem : 1 rep loggé au lieu de 2).
- Preuve systeme: tool_skill_run T7 `date_hint=2026-07-12` unique ; DB : 1 seule `user_plan_item_entries` (`completed`, `2026-07-12`), `current_reps` 0→1 (attendu 2). Item mémoire corroborant : « Hier et avant-hier, la personne a posé son téléphone … ».
- Correction attendue: l'intake track doit reconnaître une plage/liste de dates et émettre un effet `completed` par occurrence, ou demander clarification si ambigu ; ne pas collapser silencieusement sur une date.
- Statut: `fix_applied` (2026-07-13, chantier P3-F, volet prompt)
- Fix reference: règle 3d-bis étendue : plage/liste de jours (« hier et avant-hier », verbatim T7) → jamais collapsée silencieusement sur une date (sous-comptage nommé) — 3f/clarify, ou logger le jour le plus récent en le disant. Limite honnête : le contrat ne porte qu'un effet track par tour ; le multi-entrées reste une évolution de contrat.
- Tests requis: positif (« hier et avant-hier » sur une habitude → 2 entrées ou clarification) ; paraphrases (« ces deux derniers soirs », « lundi et mardi ») ; anti-faux-positif (« hier » seul → 1 entrée) ; borne (plage large « toute la semaine » → clarification, pas 7 entrées muettes).

## R1-B03 — Adéquation technique carte : technique forcée acceptée sans doute + instabilité

- Bug id: R1-B03
- Tours: T1 (acceptation sans doute), T3 (instabilité)
- Famille: `BF-INTAKE-06` (mauvais domaine sémantique : technique mal appariée à la nature de l'action)
- Domaine owner: `coaching_recommendation` (sélection de la `priority_feature`/technique)
- Source amont: au T1, Eva force « mot de bascule » pour une action de **lancement/régulation** (« choisir une activité de soirée ») ; Sophia l'accepte sans réserve et réajuste « Stop » en « couper l'hésitation ». Le doute d'adéquation attendu (guideline op-suggestion Test 1.11 : ne pas forcer `Mot de bascule` sur une action de repérage/régulation) n'arrive qu'au T2, après confrontation. Sur T1→T3, la technique dérive (mot de bascule → « mot d'appui » → texte magique) et la phrase aussi (« Stop » → « Juste un pas ») sans jamais stabiliser ni demander le choix de l'user.
- Symptome visible: T1 « Je partirais sur … mot de bascule : … "Stop" … coupe l'hésitation et lance … ta soirée » ; T3 bascule sur « texte magique : "Juste un pas." ».
- Preuve systeme: T1-T3 `response_owner=coaching_recommendation`, `status=continue`, aucun effet ; le doute correct apparaît seulement au T2 (réactif).
- Correction attendue: garde d'adéquation dans le contrat de recommandation — la **nature de l'action** (lancement/régulation vs rupture/craquage) prime sur le nom de technique cité par l'user ; en cas de tension, exprimer le doute et proposer les 2 options proches **dès le 1er tour** ; stabiliser la technique une fois choisie.
- Statut: `fix_applied` (2026-07-13, chantier P3-F)
- Fix reference: règle « technique_coherence AU PREMIER TOUR + STABILITÉ » (dispatcher local coaching) : le doute d'adéquation s'exprime dès le tour du forçage (T1, pas après confrontation) ; technique et phrase posées sont STABLES — toute dérive s'annonce et se fait choisir (le drift mot de bascule→mot d'appui→texte magique nommé verbatim).
- Tests requis: positif (user force « mot de bascule » sur une action de lancement → doute + 2 options au 1er tour) ; symétrique (besoin de rupture explicite → mot de bascule proposé sans dérive) ; stabilité (technique choisie conservée sur les tours suivants, pas de drift) ; anti-faux-positif (technique réellement adaptée citée par l'user → acceptée sans friction inutile).

## R1-B04 — feature_opportunity : reframe « initiative » sans acter la limite de capacité

- Bug id: R1-B04
- Tours: T8
- Famille: `BF-INTAKE-05` (reframe qui change la demande sans en acter la frontière)
- Domaine owner: `feature_opportunity` (composition)
- Source amont: Eva demande une capacité inexistante (« bloquer automatiquement Instagram/TikTok à 22h, les couper toi-même »). Sophia reframe directement en « initiative » (nudge récurrent 22h) **sans énoncer d'abord qu'elle ne peut pas bloquer/couper les apps ni contrôler le téléphone**. Risque que l'user croie que l'initiative bloquera réellement les apps.
- Symptome visible: « … c'est un bon cas pour une initiative … Dashboard > Initiatives, avec le créneau de 22h et le message d'action … » — aucune mention « je ne peux pas couper tes apps ».
- Preuve systeme: T8 `response_owner=feature_opportunity`, `status=continue` ; contraste avec les refus honnêtes carte (T4) et potion (T6) qui, eux, actent la limite avant de renvoyer.
- Correction attendue: directive de composition « frontière de capacité avant relais » dérivée du contrat de capacités — acter honnêtement l'impossibilité (contrôle OS des apps), puis proposer le relais réel en précisant sa nature (rappel/nudge, pas blocage).
- Statut: `fix_applied` (2026-07-13, chantier P3-F)
- Fix reference: règle « FRONTIÈRE DE CAPACITÉ AVANT RELAIS » (flow feature_opportunity) : capacité inexistante (bloquer/couper des apps, contrôle OS) → l'impossibilité s'acte en une phrase AVANT le relais, dont la nature exacte est nommée (rappel/nudge, pas blocage) — verbatim T8.
- Tests requis: positif (capacité inexistante « coupe mes apps » → limite actée puis relais nommé comme rappel) ; paraphrases (« verrouille mon téléphone », « empêche-moi d'ouvrir X ») ; anti-faux-positif (capacité réellement dispo → pas de disclaimer inutile).

## Re-tests verts (sans ligne de bug — à conserver comme preuve de non-régression)

- **T5 — ledger exit-de-flow soldé** : double émission `requested=2/allowed=2` → `committed=1` + **`superseded_effects=1`** (somme des statuts terminaux = requested). Le fix P2-6 (`superseded_by_dedup`, 2026-07-13) tient sur le chemin `active_coaching_recommendation_with_local_direct_effects`. L'ex-wart BF-TEST-01 de global17 T11 ne se reproduit plus.
- **T5 — pas de capture BF-ROUTE-02** : le flow coaching actif se libère (`skill_run=exit`) au pivot vers un rappel ; l'effet passe.
- **T11 — statut rappels exact** (BF-STATUS-01/03) : 2 pending projetés en heure locale juste.
- **T12 — cancel durable exact** (`cancel_one_shot_reminder`) : bonne cible annulée, l'autre rappel intact.
- **Post-run — memorizer hygiène d'objet** : les états d'outils (rappels, cartes, blocage apps) sont **explicitement exclus** de l'extraction (motifs de rejet DB) ; le fait perso T13 (Miso) est persisté. Fix du wart global17 (fuite de l'état rappel 19h15) confirmé.
