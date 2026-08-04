# RAPPORT AGENT 15 — Onboarding & liaison compte ↔ WhatsApp

**Verdict global : RED.**

Le chemin d'entrée se sépare en deux moitiés qui n'ont pas le même âge. La
moitié **web** est neuve, en anglais, et elle marche : l'invitation, le
`/join`, la création de compte et le lien coach↔élève franchissent toutes les
cases, y compris les refus. La moitié **WhatsApp** n'a jamais été écrite pour
KEEL : elle est encore intégralement le produit B2C français, et elle capte
100 % des élèves KEEL au premier message.

Le trou central n'est pas un bug, c'est une **absence** : rien dans le produit
ne demande jamais son numéro à l'élève, et rien ne peut lui écrire avant qu'il
n'écrive lui-même. Le rituel quotidien (le tap du soir) est donc structurellement
indélivrable pour tout élève réel tant que ces deux choses restent vraies.

**Environnement**

- Base locale `supabase_db_Sophia_2`, migrations à jour (`20260804090000`).
- `EMAIL_DELIVERY_ENABLED=0`, `WHATSAPP_DELIVERY_ENABLED=0`, adresses en
  `@example.com` (famille refusée par `isEphemeralTestEmail`). **Aucun envoi
  sortant** : `communication_logs` ne porte aucune ligne pour la cohorte
  `a15.*`.
- Fixtures : [agent-15-fixtures.sql](docs/nutrition-pivot/qa/agent-15-fixtures.sql).
- Tours WhatsApp joués en `MEGA_TEST_MODE=1` (routage) **puis rejoués en
  `MEGA_TEST_MODE=0`** (vrai LLM) pour juger la langue des réponses.
- ⚠️ **Isolation forcée.** Les 5 slots de dev-server étaient tenus par d'autres
  agents, et le runtime edge partagé est tombé puis a été repris par un
  `supabase functions serve` d'un autre run. Je me suis isolé : origine
  navigateur dédiée (`a15.localhost` / `a15b.localhost` → localStorage séparé
  du profil partagé, cf. mémoire *QA browser profil partagé*), et **mon propre
  `whatsapp-webhook` sur le port 8015** (shim `serve_webhook_a15.ts`, module
  importé verbatim). Conséquence honnête : `coach-invite-student-v1` n'a pu être
  appelée qu'une fois avant la chute du runtime ; les invitations suivantes ont
  été posées en SQL, après avoir vérifié que `coach_invite_token_hash()` et
  `shasum -a 256` donnent le même hash.

---

## Tableau des scénarios

| # | Scénario | Attendu | Observé | Verdict |
|---|---|---|---|---|
| 1 | invite → compte → `coach_clients` | lien actif, `keel_role`, cohorte | lien actif + `keel_role='student'` ✅ ; **cohorte jamais rattachée** | 🟡 |
| 2 | `/join` navigateur + erreurs | 6 états lisibles | 6/6 en anglais, aucun écran blanc | 🟢 |
| 3 | Liaison du numéro | un chemin produit | **aucun chemin KEEL** ; seul `/account` en français | 🔴 **P0-1** |
| 4 | 1er entrant d'un numéro lié | réponse en-GB | **flow B2C français, piège permanent** | 🔴 **P0-2** |
| 5 | Entrant d'un numéro inconnu | réponse sobre, rien d'écrit | rien d'écrit ✅ ; **réponse française « Sophia »** | 🔴 P1-3 |
| 6 | Changement de numéro | ancien mort, zéro orphelin | ancien mort ✅, zéro orphelin ✅ ; **proactif éteint en silence** | 🟡 |
| 7 | Handoff site → WhatsApp | un geste | **rien du tout** | 🔴 P1-4 |
| 8 | Opt-in / templates | dépendance documentée | **0 template KEEL** ; élève silencieux = invisible | 🔴 **P0-5** |
| 9 | Appareil/numéro partagé | jamais de mélange | dossiers non mélangés ✅ ; **inscription sans consentement** | 🔴 **P0-6** |

---

## P0-1 — Aucun chemin produit ne relie un numéro WhatsApp à un élève KEEL

**Les seuls écrivains de `profiles.phone_number` dans tout le dépôt :**

| Écrivain | Atteignable par un élève KEEL ? |
|---|---|
| `handle_new_user()` (métadonnée `phone` du signup) | **Non** — `JoinPage.signUp` n'envoie pas de `phone` ([JoinPage.tsx:224](frontend/src/keel/pages/JoinPage.tsx:224)) |
| [UserProfile.tsx:227](frontend/src/components/UserProfile.tsx:227) — l'écran `/account` | Oui, mais c'est l'écran B2C français |
| `transfer_verified_phone_to_user()` via `LINK:<token>` | Seulement au bout du parcours e-mail français de `handlers_unlinked` |
| `handlers_wrong_number.ts` / `purge-deleted-accounts` | Effacement seulement |

Mesuré : l'élève créé par le vrai parcours naît avec `phone_number = NULL`,
`whatsapp_opted_in = false`. Aucune des cinq pages de son espace
(`/app/today`, `/app/plan`, `/app/meals`, `/app/progress`, `/app/cards`) ne
mentionne son numéro. `grep -i whatsapp frontend/src/keel/i18n/en.ts` ne rend
que de la prose descriptive — **aucune clé d'action.**

Le seul chemin réel est un clic sur « Account » dans le shell KEEL
([KeelAppShell.tsx:76](frontend/src/keel/components/KeelAppShell.tsx:76)), qui
ouvre le panneau B2C intégral : *Compte / Plan / Options / **Parrainage***,
*« Téléphone (WhatsApp) »*, *« Niveau : Initié — Membre depuis 0 jour »*,
*« Sophia v2.4.0 • Powered by IKIZEN »*. Un badge de niveau, sur un produit dont
la page d'accueil promet en toutes lettres *« No score, no streak, no
percentage »*. Le parrainage a été supprimé du produit — `handle_new_user()` le
dit lui-même (« le programme n'existe plus ») — mais son onglet est toujours là.

*Note : `/account` n'est PAS bloqué par le paywall legacy —
[RouteGuards.tsx:59](frontend/src/security/RouteGuards.tsx:59) l'autorise
explicitement. Le problème n'est pas l'accès, c'est ce qu'on y trouve.*

**Et quand il est utilisé, il échoue en silence.** L'écriture du numéro
déclenche `whatsapp-optin` en *best-effort* ([UserProfile.tsx:275](frontend/src/components/UserProfile.tsx:275)) :
dans mon run l'appel a échoué, l'UI a affiché **« Numéro modifié avec succès. »**,
et la base porte `whatsapp_optin_sent_at = NULL`. Or le job de rattrapage
`process-whatsapp-optin-recovery` filtre sur
`.not("whatsapp_optin_sent_at", "is", null)`
([index.ts:249](supabase/functions/process-whatsapp-optin-recovery/index.ts:249)) :
**le seul cas qu'il devrait rattraper est exactement celui qu'il ne voit pas.**

**Geste minimal proposé** — un écran KEEL « Connect WhatsApp » dans le shell
élève, monté juste après l'acceptation de l'invitation : un champ numéro, un
appel serveur qui écrit le numéro *et* envoie le template dans la même
transaction, et un état visible (`linked` / `pending` / `failed`) que l'échec ne
peut pas maquiller en succès.

---

## P0-2 — Le flow B2C français capte 100 % des élèves KEEL au premier message

C'est le MUST du lot, et il est violé de façon déterministe.

Le verrou [index.ts:1189](supabase/functions/whatsapp-webhook/index.ts:1189) :

```js
if (!profile.whatsapp_state && !profile.onboarding_completed) {
  const runtime = await getActiveTransformationRuntime(admin, profile.id);
  if (!String(runtime.plan?.title ?? "").trim()) {
    // -> whatsapp_state = 'awaiting_plan_finalization' + flow local français
```

Un élève KEEL a **toujours** `onboarding_completed = false` (défaut de colonne,
que le chemin KEEL ne met jamais à jour) et **jamais** de `transformations`
legacy. Les deux conditions sont donc structurellement vraies pour chacun d'eux.

Run réel (`+447700900915`, élève de Nadia, 4 messages) :

| Tour | Message de l'élève | Réponse envoyée |
|---|---|---|
| 1 | *Hi Nadia said Id find you here* | « Je suis en attente de la version finale du plan. Dès que tu me l'envoies ici, je m'en occupe. » |
| 2 | *I dont have a plan, my coach writes it* | « Je t'attends encore le temps que le plan soit finalisé. » |
| 3 | *what should I do* | « Je suis encore en attente de la finalisation/synchronisation du plan. » |
| 4 | (après expiration 12 h, forcée) | « Je t'attends juste le temps que le plan soit finalisé. » |

Français, et **sémantiquement inversé** : on demande à l'élève d'envoyer son
plan, alors que dans KEEL c'est le coach qui l'écrit et le publie. Le tour 4 est
le point important : les 12 h de `WHATSAPP_ONBOARDING_MAX_AGE_MS` effacent
l'état, puis le message suivant le **réarme aussitôt**. Il n'y a pas de sortie.

**Un second mur attend derrière.** En neutralisant le premier
(`onboarding_completed = true`) et en poussant `trial_end` d'un jour dans le
passé — l'état de tout élève au **J+15** du pilote :

> « Hello Amara — ton essai est terminé et l'accès au coaching sur WhatsApp n'est
> pas actif sur ton plan actuel. Pour activer WhatsApp, tu peux prendre le plan
> Alliance ici : …/upgrade »

`metadata.tier = "student"`, refusé par l'allow-list `alliance|architecte`
([index.ts:1297](supabase/functions/whatsapp-webhook/index.ts:1297)). On demande
à l'élève d'un coach payant de s'abonner au B2C. `profiles.trial_end` vaut
`now() + 14 days` par défaut : **le pilote a une mèche de 14 jours.**

**Bonne nouvelle, et elle est nette :** une fois les deux murs franchis, le
cerveau répond en anglais et reste grounded. Tour réel, vrai LLM :

> *« You don't have a published plan line for today, so I can't tell you a
> specific meal to eat. If your coach has written it elsewhere, send that line
> and I'll read it with you. »*

Le dommage est **entièrement** dans les portes pré-cerveau.

**Geste minimal** — les deux verrous doivent lire `keel_role`. Un élève
`keel_role='student'` ne doit traverser ni le flow d'onboarding legacy ni le
paywall B2C ; sa facturation est celle du siège de son coach, pas un tier
d'abonné.

---

## P0-5 — Avant que l'élève n'écrive, on ne peut lui envoyer *rien*

`_shared/whatsapp_templates.ts` contient 22 templates. **Aucun n'est KEEL, aucun
n'est en anglais** : `sophia_*`, `morning_light_v*`, `end_trial_v1`,
`plan_activated_v1`… tous le produit français.

Et les surfaces KEEL n'envoient pas de template du tout :

- `keel-daily-pulse-v1` → `type: "interactive_buttons"`
  ([index.ts:188](supabase/functions/keel-daily-pulse-v1/index.ts:188)) ;
- `keel-weekly-flow-v1` → `type: "interactive_flow"`.

Ce sont des messages **libres**, que Meta n'accepte que dans la fenêtre de 24 h
ouverte par un entrant. Un élève qui n'a jamais écrit n'a pas de fenêtre.

En pratique il n'est même pas tenté : la décision d'envoi calcule
`optedOut = whatsapp_opted_in === false`, donc il est **skippé en silence, tous
les soirs, indéfiniment**. Le tap du soir — le rituel central du produit — est
indélivrable pour tout élève réel tant que P0-1 tient.

**Et le coach ne peut pas le voir.** Sa seule fenêtre est
`coach_student_contact`, qui n'expose que `last_inbound_at` et
`inbound_count_7d`. « Jamais connecté WhatsApp » et « me fantôme depuis une
semaine » lui rendent la même valeur : `NULL`. C'est précisément la distinction
dont il aurait besoin pour agir.

**Dépendance dure pour le J1 réel** : au moins un template approuvé par Meta, en
anglais, au nom du produit, envoyé à l'acceptation de l'invitation. Sans lui,
aucun chemin proactif ne peut démarrer — quelle que soit la qualité du reste.

---

## P0-6 — Un appareil partagé inscrit quelqu'un chez un coach sans son consentement

`JoinPage` stocke le token dès le montage, avant toute décision
([JoinPage.tsx:150](frontend/src/keel/pages/JoinPage.tsx:150)), et
`consumePendingCoachInvitation()` le rejoue à **toute** authentification réussie
([Auth.tsx:636](frontend/src/pages/Auth.tsx:636)).

Run réel, origine vierge :

1. visiteur non connecté ouvre `/join?token=…` (invitation destinée à
   `a15.thirdparty@example.com`), **ne clique rien**, quitte ;
2. une autre personne se connecte sur le même navigateur
   (`a15.existing@example.com`, `keel_role = NULL`, 0 lien) ;
3. résultat en base, sans un seul écran de consentement :

```
email                    | keel_role | status |       invited_email        |    consent_granted_at
a15.existing@example.com | student   | active | a15.thirdparty@example.com | 2026-08-03 17:13:36+00
```

Elle atterrit directement sur `/app/today` — l'espace d'un programme qu'elle n'a
pas demandé. Et le dégât est symétrique : l'invitation est brûlée
(`status='accepted'`), donc **le lien du vrai invité est mort** ; son siège
`one_live_coach_per_student` est pris, ce qui bloque tout autre coach ; et le
coach est facturé un siège pour quelqu'un qui n'est pas son client.

`consent_granted_at` porte un horodatage qui **atteste un acte qui n'a pas eu
lieu**. La migration dit « accepter l'invitation EST l'acte de consentement »
([20260727200000:33](supabase/migrations/20260727200000_keel_invitation_rpcs.sql:33)) ;
ici l'acte de consentement a été « se connecter sur un téléphone partagé ».

**Geste minimal** — ne rejouer un token stocké que si l'identité qui
s'authentifie correspond à l'e-mail invité, ou n'accepter que par un clic
explicite sur `/join` une fois connecté. Le rejeu silencieux est la faille.

*Découvert accidentellement, et c'est la meilleure preuve de sa réalité : au
premier chargement de `/join` sur le port partagé, mon token s'est écrit dans le
localStorage d'un **coach d'un autre run QA** (`b11.coach.echo`), armé pour être
consommé à sa prochaine connexion. Je l'ai retiré.*

---

## P1-3 / P1-4 / P1-5 — résidus B2C sur la route de l'élève

**Numéro inconnu** ([handlers_unlinked.ts:263](supabase/functions/whatsapp-webhook/handlers_unlinked.ts:263)).
Rien n'est écrit chez personne (`user_id NULL`, 0 message dans un dossier) —
seulement `whatsapp_unlinked_inbound_messages` et `whatsapp_link_requests`, de
la télémétrie support. Aucun crash, aucune fuite. Mais la réponse est :

> « Bonjour ! Je suis Sophia, enchantée. Je ne retrouve pas ton numéro dans mon
> système. Peux-tu m'envoyer l'email de ton compte Sophia ?
> (Si tu n'as pas encore de compte: … ) »

Française, marquée « Sophia », elle invite à **créer un compte** — quand
`/join` dit noir sur blanc *« There is no sign-up here »* — et demande une
adresse e-mail sur un canal non authentifié. À noter pour l'arbitrage UK : le
texte brut d'un inconnu est conservé sans durée dans
`whatsapp_unlinked_inbound_messages`.

**Handoff site → WhatsApp : il n'existe pas.** L'écran de succès de `/join` dit
*« The rest happens on WhatsApp »* — le **où**, jamais le **comment**. Adopter
son plan (`« This is my week »`,
[StudentWeekPlanPage.tsx:211](frontend/src/keel/pages/StudentWeekPlanPage.tsx:211))
est un simple flip de statut : aucun message, aucun rappel de lier son numéro.
C'est le trou site→WA documenté du B2C (mémoire *plan-activation-whatsapp-handoff*),
sauf que le correctif B2C vit dans `generate-plan-v2`, que KEEL n'utilise pas.

**La porte de connexion est française.** Le lien « Sign in and accept from
there » de `/join` mène à `/auth` : logo yin-yang violet, « Sophia — POWERED BY
IKIZEN », « Ravi de te revoir. Connecte-toi pour reprendre ta transformation »,
« Créer un compte gratuitement ». Deuxième pas de l'élève hors de l'invitation,
déjà hors langue et hors produit.

---

## Ce qui marche (et mérite d'être dit)

**Scénario 1 — les transitions en base sont propres.** Un seul appel à
`coach-invite-student-v1` (chemin interne, `send_state: skipped_ephemeral`),
puis le vrai formulaire dans le navigateur :

```
coach_invitations : pending -> accepted (accepted_at posé)
coach_clients     : ligne CRÉÉE active, consent_granted_at + started_at posés, seat_state=trial
profiles          : keel_role NULL -> 'student', locale='en-US', timezone depuis l'appareil
```

Aucune ligne `coach_clients` au moment de l'invitation — l'arbitrage 1 de la
migration tient. **Mais `cohort_id` reste `NULL`**, et c'est structurel : aucun
code du dépôt n'écrit jamais `coach_clients.cohort_id`. La colonne existe,
`cohorts` existe, l'écran coach parle de cohortes — rien ne rattache un élève à
une. Le « cohorte rattachée » du scénario n'a pas de chemin produit.

**Scénario 2 — `/join` ne montre jamais d'écran blanc.** Six états vérifiés en
navigateur réel, tous en anglais : valide (e-mail pré-rempli par le RPC), expiré,
révoqué, déjà accepté + connecté (« You're already in »), token invalide, sans
token. La page est excellente. Un détail : `preview_coach_invitation` ne brûle
pas une invitation expirée (seul `accept_*` le fait), donc le chemin réaliste —
l'élève ouvre, lit « expirée », abandonne — laisse `pending` sur l'écran du
coach indéfiniment.

**Scénario 6 — pas d'orphelin, et c'est structurel.** Après changement de
numéro : l'ancien ne résout plus (→ handler inconnu), le nouveau résout vers le
bon `user_id` et répond en anglais, `student_daily_checkins` et les 14
`chat_messages` restent intacts. Seules trois tables du schéma portent un
numéro (`whatsapp_link_requests`, `whatsapp_outbound_messages`,
`whatsapp_unlinked_inbound_messages`) ; tout le substantiel est clé `user_id`.
Réserve : le changement remet `whatsapp_opted_in = false` — **tout le proactif
s'éteint en silence**, et le rattrapage est le même best-effort cassé qu'en P0-1.

**Scénario 9a — numéro partagé, aucun mélange.** Deux profils sur
`+447700900916`, aucun vérifié : le webhook refuse de deviner, n'écrit **rien**
dans aucun des deux dossiers (0 `chat_messages` pour ce `wamid`), et répond le
prompt ambigu. La logique est juste. Conséquence à connaître : les deux élèves
sont alors muets, et la seule sortie est le parcours e-mail français.

---

## Deux constats mineurs, notés au passage

- **L'e-mail invité n'est pas contrôlé à la redemption.** Un token émis pour
  `a15.self@example.com` a été consommé par `a15.second@example.com` :
  `accepted: true`. Défendable pour un token porteur, mais
  `coach_clients.invited_email` enregistre alors une adresse qui n'est pas celle
  de l'élève — la liste du coach affiche un faux. Une invitation transférée
  inscrit le destinataire et consomme le siège.
- **`profile.content_locale` n'existe pas.** [index.ts:876](supabase/functions/whatsapp-webhook/index.ts:876)
  lit `profile.content_locale ?? "en-GB"` ; la colonne n'est pas dans
  `KEEL_PROFILE_COLUMNS` et n'existe pas sur `profiles` (elle vit sur
  `cohorts`). Le fallback donne le bon résultat aujourd'hui, mais le code
  prétend lire une locale par élève qui n'existe nulle part.

---

## Ordre de réparation proposé

1. **P0-2** — verrouiller les deux portes legacy sur `keel_role`. Un patch, et
   les élèves cessent d'être capturés *et* d'avoir une mèche de 14 jours.
2. **P0-6** — supprimer le rejeu silencieux du token. Un patch, et personne
   n'est plus inscrit sans consentement.
3. **P0-1 + P0-5** — l'écran « Connect WhatsApp » et le template anglais. C'est
   le même chantier : sans les deux, aucun chemin proactif ne démarre au J1.
4. **P1-3/4/5** — traduire/remplacer les sorties `whatsapp_unlinked`, ajouter le
   geste de handoff après adoption, sortir `/auth` et `/account` du français.
