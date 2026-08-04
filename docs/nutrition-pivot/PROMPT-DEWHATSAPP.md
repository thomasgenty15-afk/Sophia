# MISSION — Sortir de WhatsApp : la conversation vit dans l'app

> Prompt d'exécution autonome. Tu es un agent de nuit sur le repo `Sophia 2`, branche de
> travail à créer depuis `Nutrition`. Tu ne t'arrêtes pas tant que la mission n'est pas
> accomplie ou que chaque blocage restant est documenté avec un contournement tenté.

---

## 0. LA DÉCISION (contexte, à lire en entier)

Le produit est un compagnon nutrition quotidien 1:N : un coach (nutrition/épigénétique,
50-500 élèves) a une doctrine et un programme ; Sophia fait vivre ce programme chaque jour
auprès de ses élèves — photos de repas analysées, suivi, relances, synthèse hebdo au coach.
Jusqu'ici, le canal élève était WhatsApp Business API.

**Décision du 2026-08-04 : WhatsApp est abandonné comme canal.** Raisons :
1. **Marché US** : la relance proactive (templates marketing) vers les numéros américains
   est morte côté Meta — or la relance proactive EST le produit.
2. **Tarification Meta** : au 1er octobre 2026, chaque message sortant devient payant, y
   compris en fenêtre 24h. Le coût par élève devient une taxe structurelle sur un produit
   facturé au coach par élève actif.
3. **Terre louée** : le mécanisme central (« comment s'est passé ton petit-déj ? » chaque
   jour) dépend d'un classifieur Meta non auditable. Inacceptable comme fondation.

**La cible** : la conversation vit dans NOTRE plateforme — une bulle de chat dans l'app web
(React 19 + Vite, `frontend/`). L'élève a un compte (décision P0.0 : `auth.users` fantôme
par numéro — déjà en place, voir `docs/nutrition-pivot/STATUS-MORNING.md` §1), il se
connecte, il parle à Sophia dans l'app. Les déclinaisons iOS/Android (stores) viendront
APRÈS validation — ce n'est PAS ton chantier. Le web push non plus (interface stub
uniquement). Ton chantier : **zéro dépendance WhatsApp restante dans le code vivant, et un
chat in-app complet, temps réel, testé de bout en bout.**

Autorité produit : `docs/nutrition-pivot/PLAN-NUIT.md` (avec son encadré d'amendements en
tête) + `docs/nutrition-pivot/STATUS-MORNING.md` + `docs/keel/`. Là où ce prompt contredit
PLAN-NUIT (qui suppose WhatsApp), **ce prompt gagne** : la thèse « l'app sert à VOIR,
WhatsApp à SAISIR » est caduque — l'app fait les deux. La thèse PUSH survit par la
proactivité de Sophia (messages entrants dans la bulle), plus tard par le push natif.

---

## 1. LA MÉTHODE GAUNTLET (contraignante)

Aucune affirmation « fait » n'est crue sur parole. Chaque livrable passe **le gantelet** :
une série d'épreuves indépendantes, TOUTES obligatoires, dans cet ordre :

1. **Épreuve de fonctionnement** — tests unitaires/intégration qui ont réellement tourné
   (`deno test`, vitest), sortie collée dans le journal. Un test écrit mais non exécuté
   n'existe pas.
2. **Épreuve adversariale** — une passe d'attaque dédiée qui essaie de CASSER le livrable,
   avec au minimum ces 7 patterns : (a) prémisse fausse (l'état attendu n'existe pas),
   (b) concurrence (deux requêtes simultanées), (c) rejeu/idempotence (même message deux
   fois), (d) langue (FR **et** EN — jamais une seule, cf. l'accident du test FR-only),
   (e) temps (minuit, fuseaux, « demain » à 23h50), (f) état vide/null (élève sans plan,
   sans doctrine, sans historique), (g) désalignement config↔code (env var absente, valeur
   par défaut silencieuse). Chaque pattern → un test ou une preuve d'inapplicabilité.
3. **Épreuve de réel** — le parcours joué dans un vrai navigateur (preview + stack Supabase
   locale), pas seulement en test : envoyer un message dans la bulle, recevoir la réponse,
   recharger la page, retrouver l'historique. Screenshot ou lecture de page à l'appui.
4. **Épreuve d'absence** (pour toute suppression) — règle « verify before delete » : AVANT
   de supprimer, une vérification indépendante prouve que plus rien de vivant ne référence
   la cible (grep + recherche d'appelants runtime + crons + config). APRÈS suppression, la
   suite complète repasse verte.
5. **Épreuve de relecture finale** — en fin de mission, DEUX passes complètes de
   re-vérification à froid : rejouer toutes les suites, rejouer le parcours réel, re-grep.
   La deuxième passe cherche spécifiquement ce que la première aurait raté.

Un livrable qui échoue à une épreuve retourne en chantier. Le journal enregistre chaque
épreuve avec sa preuve. **Verdict binaire : VERT (5/5 épreuves) ou RED (sinon). Pas de
« quasi-vert ».**

---

## 2. RÈGLES D'ENGAGEMENT

1. **Branche** : crée `dewhatsapp` depuis `Nutrition`. Premier geste : commit snapshot du
   WIP existant. Ensuite un commit par phase verte, messages descriptifs.
2. **INTERDIT ABSOLU** (hook bloquant + règle) : `supabase functions deploy`, `db push`,
   `secrets set/unset`, tout ce qui touche le projet distant ou api.supabase.com en
   écriture. Le LOCAL est autorisé, y compris `supabase db reset`.
3. **Migrations** : ne réécris JAMAIS une migration historique (la prod les a appliquées).
   Toute transformation = NOUVELLE migration datée. Les références WhatsApp dans les
   migrations passées sont un fossile acceptable.
4. **`docs/keel/` est l'autorité** de la couche KEEL — tu adaptes ses transports, tu ne
   réécris pas ses invariants (autorité coach, double verrou interdits/allergies, RLS par
   vues, `log_coach_student_access`).
5. **Tu ne refonds pas le billing** (contrat 49$+12$/élève actif existant). Tu ne
   construis ni iOS, ni Android, ni web push (stub d'interface seulement).
6. **Journal** : `docs/nutrition-pivot/PROGRESS-DEWHATSAPP.md`, append-only, horodaté,
   une entrée par épreuve du gantelet. Au matin : `docs/nutrition-pivot/STATUS-DEWHATSAPP.md`
   (état par phase, commandes exactes pour rejouer chaque preuve, restes, décisions prises
   seul avec alternatives).
7. **Règle des 30 minutes** : jamais bloqué plus de 30 min sur le même mur. Documente,
   tente UN contournement, sinon passe au chantier suivant et reviens-y.
8. **Honnêteté** : un doute = un flag dans STATUS, jamais un « ça marche » optimiste.
9. **Pièges connus de la stack locale** (mémoire projet, vérifiés) :
   - Kong peut rendre des 502 sur les tours longs → si un tour semble « perdu », c'est un
     faux positif possible ; vérifie les traces avant de conclure à un bug.
   - `EMAIL_DELIVERY_ENABLED=1` traîne en local : force l'override en QA pour ne JAMAIS
     envoyer un vrai email pendant tes tests.
   - `functions.invoke` n'envoie pas `x-internal-secret` → les appels internes entre
     fonctions doivent passer l'en-tête explicitement (403 sinon).
   - L'admin API auth locale est capricieuse pour créer des comptes → SQL direct si besoin
     (pattern documenté dans les mémoires QA : personas mdp `1234567`).

---

## 3. LA CIBLE ARCHITECTURALE

### 3.1 La bulle de chat in-app

- **Élève** : dans l'espace `/app/*`, une bulle de conversation persistante (nouvelle page
  `/app/chat` OU panneau ancré présent sur `/app/plan` et `/app/progress` — choisis, mais
  la conversation doit être accessible en ≤1 tap depuis tout l'espace élève).
- **Coach — mode test** : le coach parle à SON propre agent (doctrine incluse) via la même
  bulle dans son espace `/coach/*`. C'est le « mode test » du PLAN-NUIT §1 (point 4), et
  il devient trivial : même composant, contexte coach.
- **Fondation existante à généraliser, pas à réécrire** : `frontend/src/pages/ChatPage.tsx`,
  `components/ChatInterface.tsx`, `hooks/useChat.ts` — le simulateur WhatsApp web
  (`VITE_ENABLE_WHATSAPP_WEB_SIM`, `channel:'whatsapp'`, `sendWhatsAppSimButton()`) est
  déjà un chat web branché sur le cerveau. Ta mission le promeut de simulateur à CANAL
  RÉEL : renomme, débarrasse-le de sa sémantique « sim », branche-le proprement.
- **Temps réel** : Supabase Realtime sur `chat_messages` (ou table renommée) pour la
  livraison des messages de Sophia (proactifs inclus) sans refresh. Reconnexion gérée
  (refetch à la resubscription). Fallback polling propre si Realtime échoue.
- **UI minimale mais complète** : historique paginé, indicateur « Sophia écrit », boutons
  de réponse rapide (l'équivalent in-app des quick-reply templates — de simples boutons
  rendus sous le message, payload déterministe), upload photo (voir 3.4), badge non-lus.
  i18n EN (le site est passé en anglais — suis `frontend/src/keel/i18n/`).

### 3.2 Le chemin entrant

- Nouvelle edge function `chat-inbound-v1` (ou généralisation de `whatsapp-sim-inbound`
  renommée) : reçoit `{user, text | button_payload | media_ref}`, authentifiée par le JWT
  utilisateur (plus de webhook Meta, plus de vérification de signature Graph).
- Elle alimente le MÊME moteur de tour (`sophia-brain`) que WhatsApp alimentait. Le moteur
  ne doit pas savoir d'où vient le message : introduis un type `InboundMessage` neutre
  (id, user_id, kind, contenu, reply_to) et adapte l'entrée.
- **L'ordre sacré des gardes survit, adapté** : dedup (par id de message client, remplace
  le wamid) → mute/STOP (devient une préférence de notifications in-app, voir 3.5) →
  safety (inchangé, mais voir 3.6) → contexte armé (voir 3.3) → dispatcher global → flows
  locaux. Ne contourne JAMAIS cet ordre.

### 3.3 Mort des templates, survie du concept « question armée »

La couche templates Meta meurt ENTIÈREMENT : fenêtre 24h, purposes → noms de templates,
locales Meta, `renderWhatsAppTemplate`, fallback `global_reach`, erreur 132001 — tout ça
disparaît. **Mais le concept produit survit** : Sophia pose une question proactive avec
des boutons, et cette question reste « armée » jusqu'à réponse (≤3 tours entrants), un
message plus récent avec boutons la supplante, le classifieur LLM interprète une réponse
libre contre la question posée. Ce mécanisme (`template_context.ts`, le classifieur avec
`question_posee`/`boutons_possibles`) est PRÉCIEUX : renomme-le (`armed_question`),
généralise-le au chat in-app, garde ses tests. Ce qui était « template hors fenêtre 24h »
devient un simple message proactif in-app — il n'y a PLUS de fenêtre, plus de purpose
gating, plus de locale Meta. Les purposes de `whatsapp-send` (checkin, bilan, winback,
plan_activated, birthday, subscription…) deviennent des messages directs composés côté
serveur, écrits dans le ledger, livrés par Realtime.

### 3.4 Médias (photos de repas)

Le pipeline « télécharger le media Graph avant expiration » meurt. À la place : upload
direct du client vers un bucket Storage privé (`meal-photos`), RLS par propriétaire,
le message entrant porte une `media_ref` (path + content-type). Le moteur photo (contrat
v3, 83 tests — voir STATUS-MORNING) consomme le fichier depuis Storage. Adapte
`_shared/whatsapp_media.ts` → `_shared/chat_media.ts`. Limites : taille max, types
acceptés, et un test adversarial « upload d'un non-image ».

### 3.5 Opt-in, STOP, fenêtres, caps — re-fondation produit

- **Opt-in Meta** : mort. L'équivalent = création de compte + consentement notifications
  (une préférence par élève, défaut ON pour la conversation elle-même).
- **STOP/optout** : mort comme obligation Meta, survit comme produit : un élève peut
  couper les relances proactives (réglage + commande conversationnelle comprise par le
  dispatcher, bilingue — cf. l'accident « confirmation codée en dur en français »).
- **Fenêtre 24h** : morte. Le plafond proactif (2/jour hors fenêtre, bilans réservés)
  était une contrainte Meta ; re-décide-le comme choix produit : garde un plafond
  quotidien configurable (défaut 2 relances/jour hors conversation active) pour ne pas
  spammer — mais c'est NOTRE règle maintenant, documente-la comme telle.
- **Identité** : le numéro de téléphone reste la clé d'identité élève (P0.0), mais le
  parcours d'entrée devient : invitation coach → `/join` (token) → création de session
  (OTP téléphone ou magic link email — prends ce qui existe déjà côté auth, ne construis
  pas d'OTP SMS custom cette nuit) → la bulle. `JoinPage.tsx` était marqué
  SUPPRIMER-APRÈS-CUTOVER dans PLAN-NUIT : **annulé, il devient le parcours d'entrée
  canonique.** Le deep-link `wa.me` de `PlanSavedModal` et tout parcours « écris-nous sur
  WhatsApp » meurent.

### 3.6 Safety

Le résolveur de crise déduisait le pays du numéro WhatsApp / de `locale` (bug connu :
`country NULL` → hotline US par défaut). Le chat in-app doit résoudre le pays depuis le
profil élève (champ country, renseigné au join — ajoute-le au parcours si absent). La
mécanique safety elle-même (bandes, verrou turn-level crise, zéro effet durable en crise)
est INTOUCHABLE — tu changes sa source de pays, pas sa logique.

---

## 4. INVENTAIRE DE LA SURFACE À TRAITER (vérifié le 2026-08-04)

Ordre de grandeur mesuré : **8 edge functions `*whatsapp*`, ~30 modules `_shared/`
référencant whatsapp, 55 fichiers dans `sophia-brain/`, 31 fichiers frontend, plus
migrations, crons, config et secrets.** Ton premier chantier (P0) est l'inventaire
exhaustif ligne à ligne — ce qui suit est la carte de départ, pas la liste close.

### 4.1 Edge functions

| Fonction | Sort |
|---|---|
| `whatsapp-webhook` | MEURT — remplacée par `chat-inbound-v1`. C'est le plus gros morceau : le moteur de tour, les handlers (`handlers_optin_bilan`, `handlers_optout`, `handlers_meal_photo`, onboarding local_flow…), `template_context.ts` migrent vers le chemin neutre AVANT la mort du webhook |
| `whatsapp-send` | MEURT — remplacée par un module de livraison in-app (`_shared/chat_delivery.ts` : write ledger + Realtime). Ses gardes vivantes (paywall/lifecycle gating, dedup d'envoi) migrent |
| `whatsapp-optin` | MEURT — le concept opt-in Meta n'existe plus |
| `whatsapp-sim-inbound` / `whatsapp-sim-trigger` | PROMUES — deviennent (ou fusionnent dans) le canal réel `chat-inbound-v1` / trigger de test |
| `process-whatsapp-outbound-retries` | MEURT ou se réduit — la livraison in-app est un write DB (pas de retry Graph) ; si un retry Realtime est utile, c'est un nouveau design minuscule |
| `process-whatsapp-optin-recovery` | MEURT (winback B2C opt-in — déjà marqué à débrancher dans PLAN-NUIT §6) |
| `schedule-whatsapp-v2-checkins` | ADAPTE — la planification des checkins survit, leur livraison devient in-app |
| Crons KEEL (`keel-daily-pulse-v1`, `keel-reengage-v1`, `keel-weekly-flow-v1`, synthèses) | ADAPTENT — même contenu, transport in-app (+ email là où il existait déjà). Attention `x-internal-secret` |

### 4.2 `_shared/` (extraits structurants)

`whatsapp_graph.ts`, `whatsapp_templates.ts` (+tests), `whatsapp_media.ts`,
`whatsapp_winback.ts` (+tests), `whatsapp_outbound_tracking.ts`,
`proactive_template_queue.ts`, `scheduled_checkins.ts`, `account_lifecycle.ts`,
`locale.ts`, `reengagement_episodes.ts`, les modules `keel/*` qui envoient
(`daily_pulse_io`, `reengagement_io`, `weekly_flow`, `slot_reminders`)… Pour chacun :
MEURT (spécifique Graph/Meta) ou MIGRE (concept produit) — décision documentée par module.

### 4.3 Base de données (nouvelles migrations, jamais de réécriture)

- `whatsapp_outbound_messages` → généralise en `outbound_messages` (ledger de livraison
  multi-canal : `delivery_channel` accepte déjà `in_app` — un CHECK l'a prouvé cette nuit).
- `whatsapp_pending_actions` → `pending_actions` (c'est l'état des flows, pas du
  transport ; le renommage traverse beaucoup de code — fais-le tôt).
- `whatsapp_cost_events` → GÈLE (garde la table pour l'historique, plus aucun writer ;
  le coût par élève devient LLM-only via `llm_usage_events`).
- `whatsapp_link_requests`, colonnes `whatsapp_*` de profils/état
  (`pre_deletion_whatsapp_opted_in`, `whatsapp_state`…) : inventorie, puis MEURT ou GÈLE
  avec preuve d'absence de lecteur.
- `chat_messages` : reste le journal ; le canal `whatsapp` n'est plus jamais écrit
  (l'historique reste lisible).
- **RGPD** : l'export (`account-export-v1`) et la purge (`purge-deleted-accounts`)
  référencent des tables WhatsApp par NOM — mets-les à jour avec les renommages, et
  vérifie que les nouvelles tables du chat sont couvertes (mémoire projet : le lifecycle
  RGPD oublie les tables neuves).
- Crons pg_cron : inventorie tout `cron.schedule` touchant l'envoi WhatsApp
  (checkins, optin recovery, retries…) → déprogramme par NOUVELLE migration.

### 4.4 Frontend (31 fichiers)

Le trio `ChatPage/ChatInterface/useChat` (promotion en canal réel), `PlanSavedModal`
(deep-link wa.me → mort), `App.tsx` (routes), `JoinPage` (devient l'entrée canonique),
`LandingPage`/`i18n/en.ts` (le pitch mentionne WhatsApp → réécrire « présence quotidienne
in-app »), `RemindersSection`/`PreferencesSection`/`UserProfile`/`DataPrivacySection`
(mentions opt-in/WhatsApp), pages admin (`AdminUsageDashboard` : colonne coût WA → garde
l'historique, plus de flux), tests d'intégration `edge/whatsapp.int.test.ts` et
`coverage-guard` (réécrire pour le nouveau canal, ne pas supprimer la couverture).

### 4.5 Config & environnement

`supabase/config.toml` (déclarations de fonctions), `deno.json` (tasks), scripts
(`scripts/`), `env.example`, variables `WHATSAPP_*` / `META_*` / templates names & langs :
purge des références dans le code et les exemples. Les SECRETS distants ne sont pas à toi
— liste-les dans STATUS pour que Thomas les retire (avec la commande exacte), n'y touche
pas. Idem la désinscription du webhook côté Meta : checklist du matin, pas une action de
nuit.

---

## 5. PHASES (chaque phase passe le gantelet AVANT la suivante)

**P0 — Inventaire & contrat (pas de suppression ici).**
Grep exhaustif (`whatsapp`, `wa.me`, `wamid`, `graph.facebook`, `META_`, `template`),
classement de CHAQUE hit : MEURT / MIGRE / FOSSILE (migrations, docs). Livrable : table
d'inventaire dans PROGRESS + le type `InboundMessage` neutre + le module
`chat_delivery.ts` (write ledger + Realtime) avec tests. DoD : inventaire complet, contrat
typé, zéro comportement changé, suites existantes vertes.

**P1 — Le chemin entrant in-app, bout en bout.**
`chat-inbound-v1` → moteur de tour → réponse écrite au ledger → Realtime. La bulle élève
minimale dans `/app/*` (envoyer, recevoir, historique, reload). Dedup par id client.
DoD gantelet : conversation réelle au navigateur (texte aller-retour), les 7 patterns
adversariaux sur l'entrée, reload = historique intact.

**P2 — La couche proactive sans templates.**
Migration du mécanisme armé (`armed_question`), du classifieur (avec `question_posee`),
des purposes de `whatsapp-send` en messages directs, du plafond proactif re-décidé,
des crons KEEL (daily pulse, réengagement, weekly flow, synthèses — `delivered_at` doit
enfin se remplir : c'était un P0 de la nuit précédente). DoD gantelet : un checkin
proactif provisionné arrive dans la bulle SANS action de l'élève (Realtime), la réponse
libre est classée contre la question, le 3e tour désarme, un nouveau message armé
supplante l'ancien, mute respecté, cap respecté, EN et FR.

**P3 — Médias.**
Upload photo → Storage → analyse par le moteur photo (contrat v3) → réponse dans la
bulle → correction conversationnelle (le reducer `meal_photo` était non câblé : câble-le
sur le chemin neutre — c'est le moment, le flow local existe côté routeur). DoD gantelet :
photo réelle uploadée au navigateur, analysée, corrigée par un message de suivi, patterns
adversariaux (non-image, double upload, photo sans plan actif).

**P4 — Parcours d'entrée & coach.**
`/join` (token → session → bulle), country au profil (safety), mode test coach (bulle
sur sa propre doctrine), i18n EN complet, mort des deep-links wa.me et des textes
« WhatsApp » dans l'UI. DoD gantelet : parcours complet invitation→conversation joué au
navigateur pour un élève neuf ET le mode test coach ; un élève sans country ne route
jamais vers une hotline du mauvais pays.

**P5 — Démolition.**
Seulement maintenant. Ordre : déprogrammer les crons morts (migration) → supprimer les
fonctions mortes (`whatsapp-webhook`, `whatsapp-send`, `whatsapp-optin`, retries, optin-
recovery) → migrer/geler les tables (renommages, RGPD mis à jour) → purger `_shared/`
morts → purger frontend → purger config/env/scripts. CHAQUE suppression passe l'épreuve
d'absence (verify-before-delete) AVANT, et la suite complète APRÈS. DoD : `grep -ri
whatsapp` sur le code vivant (`supabase/functions`, `frontend/src`, `scripts`, configs)
ne rend QUE des fossiles justifiés (migrations historiques, docs, ce prompt) — chaque
fossile restant listé et justifié dans STATUS.

**P6 — Le gantelet final.**
(1) Toutes les suites (deno + vitest + SQL) vertes, sorties collées. (2) La passe
adversariale des 7 patterns rejouée sur le système ENTIER. (3) La semaine simulée J1→J7
du PLAN-NUIT §7.4 rejouée intégralement VIA LA BULLE (horloge simulée ≥ réel, cleanup
`pending_actions` entre les runs — pièges connus) : provision quotidienne, photos, checkin
proactif, réengagement à 72h, synthèse hebdo au coach livrée ET marquée délivrée.
(4) Les DEUX passes de relecture à froid. (5) STATUS-DEWHATSAPP.md complet avec la
checklist du matin pour Thomas : secrets à retirer (commandes exactes), webhook Meta à
désinscrire, deploy (son script), ce que la nuit ne peut pas prouver.

---

## 6. EDGE CASES À COUVRIR EXPLICITEMENT (minimum — ajoute les tiens)

1. Deux onglets ouverts par le même élève (Realtime double-livraison, dedup d'affichage).
2. Message envoyé pendant une déconnexion Realtime → il apparaît au retour (refetch).
3. L'élève répond à une question armée VIEILLE (scroll-up) alors qu'une plus récente est
   armée → la plus récente gagne (règle existante, à préserver).
4. Rejeu du même POST `chat-inbound-v1` (retry réseau client) → un seul tour de moteur.
5. Élève supprimé/purgé (RGPD) qui poste → 401/410 propre, pas de tour fantôme.
6. Élève muté (STOP) : les proactifs s'arrêtent, la conversation directe MARCHE toujours.
7. Crise safety en cours : zéro effet durable, pays depuis le profil, et la bulle
   n'affiche pas de boutons de flow pendant la crise.
8. Le coach en mode test ne pollue JAMAIS les données d'un élève réel (scoping strict).
9. Fuseau : un élève à Los Angeles reçoit son checkin du matin à SON matin (le placement
   par `time_of_day` existant survit au changement de canal).
10. Un message proactif composé pour un élève dont le plan vient d'être archivé → gate à
    la livraison (règle existante « priorité état à la livraison » — préserve-la).

---

## 7. CE QUE TU NE FAIS PAS

- Pas d'iOS/Android/stores, pas de web push (stub d'interface max), pas de refonte billing,
- pas de deploy/push/secrets distants, pas de réécriture de migrations historiques,
- pas de suppression de la couverture de test au prétexte que le fichier testait WhatsApp
  (la couverture MIGRE avec le concept),
- pas de refonte du moteur de tour, de la mémoire, de la doctrine, du photo v3 — ils sont
  agnostiques au canal par construction : tu changes le TRANSPORT, pas le cerveau,
- pas de « quasi-vert » : une épreuve échouée = RED documenté.

## 8. LIVRABLES AU MATIN

1. Branche `dewhatsapp`, commits par phase.
2. `PROGRESS-DEWHATSAPP.md` — journal des épreuves avec preuves.
3. `STATUS-DEWHATSAPP.md` — état par phase (VERT/RED), commandes de rejeu, fossiles
   justifiés, décisions prises seul + alternatives, checklist du matin (secrets, webhook
   Meta, deploy, smoke test réel).
4. La démo qui compte : les commandes exactes pour lancer la stack et jouer, au
   navigateur, le parcours élève neuf (join → conversation → photo → checkin proactif du
   lendemain via horloge simulée).
