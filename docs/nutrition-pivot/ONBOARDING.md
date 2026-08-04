# Les deux parcours d'inscription — audit en conditions réelles

**Date** : 2026-08-03, 16h00–18h40 UTC. **Branche** : `Nutrition`.
**Méthode** : navigateur réel sur `http://localhost:5175` (vite `frontend-alt`), Supabase local,
comptes NEUFS créés de bout en bout. Vérité DB relue par `psql` après chaque étape.

## Avant toute chose : le pistolet a été désarmé

`supabase/.env` contenait `EMAIL_DELIVERY_ENABLED=1` **avec une vraie clé Resend**.
Mis à `0` avant le premier test, et vérifié **dans le conteneur** (pas seulement dans le fichier) :

```bash
docker exec supabase_edge_runtime_Sophia_2 printenv EMAIL_DELIVERY_ENABLED   # -> 0
```

Deux gardes indépendantes couvrent l'envoi : `isEmailDeliveryEnabled()` et `isMegaTestMode()`
(actif car Supabase local). Côté GoTrue, `config.toml` a `enable_confirmations = false` et le SMTP
commenté → inbucket. **Aucun email n'est parti.**

> ⚠️ `supabase/.env` est gitignoré. La remise à `1` est une décision manuelle, pas un `git checkout`.

## Deux avertissements sur la validité de ce rapport

**1. Le dépôt bougeait pendant l'audit.** Une autre session éditait les mêmes fichiers :
deux commits pendant la session (`114b5142` 18h01, `fd6ec993` 18h13 « la landing vend la
masterclasse »), et `JoinPage.tsx` (+510/−134) et `PublicHeader.tsx` non commités à 18h11.
Le `JoinPage.tsx` lu au départ n'est **pas** celui qui tournait.
→ Tout ce qui concerne **`/join`, `PublicHeader`, la landing et `en.ts`** est marqué
🟡 **provisoire** : constaté sur un fichier en cours de réécriture.
Le reste (`Auth.tsx`, `App.tsx`, `postLogin.ts`, `CoachHomePage`, gardes, `/account`) est stable.

**2. Contamination par une QA concurrente.** À 16h16 et 16h17, des fixtures d'une autre session
(`a7.*`, `a8.*`) se sont rattachées à mon coach de test : sa page affiche **17 élèves**.
Ce n'est **pas** un défaut produit — RLS scope correctement (17 lignes sur 60 en base).
Écarté des constats. Les observations faites **avant 16h16** (dont l'état vide du coach à 16h11)
sont propres.

---

# 1. Le parcours coach, étape par étape

Compte créé : `nadia.coach.audit@keeltest.dev` — Nadia Okonkwo, **United Kingdom**.

| # | Écran | Ce qui a été VU |
|---|---|---|
| 1 | `/` landing | Anglais, kit KEEL, sobre. CTA « Start the 14-day trial » → `/auth?role=coach`. **Mais « Sign in » du header → `/auth` nu** (donc français). |
| 2 | `/auth?role=coach` | Titres et champs en anglais. **Mais** : logo yin-yang + « POWERED BY IKIZEN » (identité legacy) ; placeholder `prenom@exemple.com` ; aria-label `Afficher le mot de passe` ; et dans « Preferences » : **« Itinérance »** et **« Suivre automatiquement le fuseau horaire de l'appareil. »** |
| 3 | Soumission | Compte créé, `coach-signup-v1` OK, arrivée directe sur `/coach`. |
| 4 | `/coach` 1ʳᵉ arrivée | Vrai état vide anglais : « Invite your first student — Nothing is generated on its own here… » + [Invite a student] [Import a plan]. **Doctrine n'est pas mentionnée.** |
| 5 | Modale d'invitation | Anglais, un seul champ (email). |
| 6 | Après envoi | La modale se ferme, **aucune confirmation**. Après **rechargement complet**, l'écran affiche encore « Invite your first student ». L'invitation est pourtant `pending` en base. |
| 7 | Header → « Account » | **Tiroir legacy français** : « Compte / Plan / Options / Parrainage », « Téléphone (WhatsApp) », « Niveau : Initié », « Sophia v2.4.0 • Powered by IKIZEN ». |
| 8 | « Sign out » | Renvoie sur `/auth?redirect=/coach` — **sans `role=coach`** → « Ravi de te revoir. / Connecte-toi pour reprendre ta transformation. » |
| 9 | `?role=coach` en mode connexion | **Écran bilingue** : « Welcome back. » + « Sign in to your coach workspace. » + **« Adresse Email »** + « Password » + **« Mot de passe oublié ? »** |
| 10 | Ce lien français | Formulaire de reset **entièrement français** (« Envoyer le lien », « Retour à la connexion ») sous un en-tête anglais. |

Vérité DB après inscription — le chemin coach écrit **tout** ce qu'il doit écrire :

```
keel_role=coach · locale=en-US · country=GB · timezone=Europe/Paris (détecté)
coaches.status=active · phone_number=NULL (voulu)
```

# 2. Le parcours élève, étape par étape

Compte créé : `lea.student.audit@keeltest.dev` — Léa Moreau, élève de Nadia (coach **UK**).

> Le token n'atteint jamais le navigateur du coach (choix explicite de `coach-invite-student-v1`).
> Le lien a donc été frappé serveur-à-serveur avec `x-internal-secret`, seul chemin qui le renvoie.

| # | Écran | Ce qui a été VU |
|---|---|---|
| 1 | `/join?token=…` 🟡 | Longue page de consentement en anglais, prénom du coach interpolé, email pré-rempli depuis l'invitation. Promet WhatsApp **quatre fois** (« answers you in it, every day, on WhatsApp »). |
| 2 | Le formulaire 🟡 | **Nom, email, mot de passe. C'est tout.** Ni téléphone, ni pays, ni fuseau demandé. |
| 3 | Soumission 🟡 | « You are in, with Nadia. » puis **« The rest happens on WhatsApp »** — alors qu'aucun numéro n'a jamais été demandé. |
| 4 | `/app/today` 1ʳᵉ arrivée | Bon état vide, anglais, honnête : « Your plan isn't published yet… Nothing is generated for you in the meantime — an empty space is the honest one ». Squelette BREAKFAST/LUNCH/DINNER. **Aucune étape « lier WhatsApp ».** |
| 5 | Header → « Account » | **Même tiroir legacy français que le coach.** Ironie : c'est le **seul endroit du produit** où un numéro WhatsApp peut être saisi. |
| 6 | Déconnexion / reconnexion | `/auth` nu (français), mais routage **correct** vers `/app/today`. |

Vérité DB — le chemin élève laisse trois champs vides :

```
keel_role=student · locale=en-US · timezone=Europe/Paris (détecté) · tz_follow_device=true
country=NULL · phone_number=NULL · whatsapp_opted_in=false
coach_clients: status=active, seat_state=trial, consent_granted_at renseigné
```

## Les deux ordres, testés tous les deux

- **Ordre A — compte créé depuis `/join`** : ci-dessus. ✅
- **Ordre B — invitation acceptée par un compte déjà connecté** : testé avec un compte **legacy
  français** (`marc.lost.audit`, créé via `/auth` nu, `locale=fr-FR`, `+33…`). Connecté, ouverture
  du lien, « Accept invitation » → « You are in, with Nadia. » ✅
  **Mais** il reste `locale=fr-FR` et `country=NULL` : deux élèves du même coach, deux profils
  différents selon la porte d'entrée.

---

# 3. Verdict sur chaque soupçon

## S1 — La fuite vers le monde legacy — **CONFIRMÉ (a, b)** / **INFIRMÉ (c)**

**(a) Inscription sans contexte → trou noir. CONFIRMÉ, preuve réelle.**
`/auth` nu → « Créer un compte gratuitement » → formulaire **français** avec **Numéro WhatsApp
obligatoire** (`+33`) → après soumission, atterrissage sur **`/dashboard`** :
« Aucun plan actif — Le cycle est peut-être en génération… [Lancer un parcours] ».
Un élève qui a perdu son lien et « s'inscrit quand même » finit là, en français, dans le tunnel B2C.
La seule issue visible est la petite ligne anglaise « Are you a coach? Create a coach account » —
**il n'y a rien pour un élève.**

**(b) Coach dont la ligne `coaches` n'est pas active. CONFIRMÉ.**
`status='suspended'` puis connexion via `/auth` → **`/dashboard`**, sans un mot d'explication.
L'écran juste existe pourtant : en tapant `/coach` à la main, `CoachRoute` affiche « Your coach
account is suspended ». `resolveHomePath` connaît le fait et le jette.

**(c) Élève qui se déconnecte puis se reconnecte. INFIRMÉ.**
Routé correctement vers `/app/today`. Seule la **langue de la porte** est fautive.

> Le fail-safe vers `/dashboard` est une **bonne** décision et n'est pas remis en cause : les
> comptes B2C réels existent. Le correctif proposé (F4) ne touche que le cas où la ligne `coaches`
> **a été lue avec succès** et n'est pas active.

## S2 — La porte unique bilingue — **CONFIRMÉ, six endroits distincts**

Tout est constaté à l'écran, pas déduit :

1. `/auth?role=coach` en mode connexion : **« Adresse Email »** et **« Mot de passe oublié ? »**
   au milieu de « Welcome back. » / « Password » / « Sign in ».
2. Panneau « Preferences » du signup coach : **« Itinérance »**, **« Suivre automatiquement le
   fuseau horaire de l'appareil. »**
3. `aria-label="Afficher le mot de passe"` et placeholder `prenom@exemple.com` (arbre a11y).
4. **Déconnexion du coach** → `/auth?redirect=/coach` sans `role` → écran 100 % français
   (« reprendre ta transformation »), avec « Créer un compte gratuitement » qui mène au tunnel FR.
5. **« Sign in » de la landing anglaise** → `/auth` nu → même écran français.
6. `/email-verified` et `/reset-password` : **entièrement français** (voir S6).

**Non testé en local mais atteignable en production** : l'écran « Vérifie ta boîte mail. » après
inscription (`Auth.tsx:669-765`) n'a **aucune branche coach** — c'est du français intégral.
Localement `enable_confirmations = false`, donc il ne s'affiche pas ; **`supabase/config.prod.toml`
ligne 38 a `enable_confirmations = true`**. C'est donc le premier écran qu'un vrai coach voit
après avoir cliqué « Create my coach account ». 🔴 Drapeau : constat par lecture + config prod,
pas par observation navigateur.

Enfin, `frontend/index.html` : `<html lang="fr">` et `<title>Sophia Coach | Coach IA proactif sur
WhatsApp</title>`. Seul `/auth?role=coach` corrige `lang`/title. Tous les autres écrans KEEL se
déclarent français aux lecteurs d'écran et affichent un titre d'onglet français.

## S3 — Ce que l'inscription élève ne capture pas — **CONFIRMÉ : deux trous, un point OK**

**Le fuseau : OK.** `JoinPage` envoie `Intl.DateTimeFormat().resolvedOptions().timeZone` dans les
metadata, `handle_new_user()` l'écrit. Léa a `timezone=Europe/Paris`, `tz_follow_device=true`.

**Le numéro WhatsApp : ABSENT, et c'est un trou de parcours.**
`phone_number=NULL`, `whatsapp_opted_in=false`. Personne, nulle part, ne le demande à l'élève.
La boucle quotidienne du produit — photo de l'assiette, tap du soir — est **structurellement
injoignable** pour un élève inscrit par la porte normale. La page d'invitation le promet quatre
fois et l'écran de succès dit « The rest happens on WhatsApp ».
Seul contournement existant : le tiroir **legacy français** `/account` → « Modifier mon numéro ».

**Le pays : ABSENT, et la conséquence est mesurable.**
`handle_new_user()` n'écrit **jamais** `country` (colonnes insérées : `id, full_name, avatar_url,
phone_number, email, timezone, locale, tz_follow_device`). Pour un coach, `coach-signup-v1` le
comble ; pour un élève, **rien**.

J'ai vérifié ce que fait le code appelant, comme demandé, plutôt que de le déduire :

```ts
// sophia-brain/agents/sentry.ts:40-44  (idem safety_crisis/reducer.ts:423-427)
const country = input?.country ? input.country
  : input?.locale ? crisisCountryFromLocale(input.locale)
  : LEGACY_FRENCH_BRANCH_COUNTRY;
```

`crisisCountryFromLocale('en-US')` renvoie **`'US'`** (`crisis_resources.ts:219-236` : le segment
région est retenu s'il est dans `['US','GB','FR']`). Or `JoinPage` code en dur `locale: "en-US"`
pour **tout** élève.

> **Conséquence concrète** : Léa, élève d'un coach **britannique**, serait orientée vers
> **988** et **911** au lieu de **116 123** (Samaritans) et **999**.
> Le résolveur ne tombe donc **pas** sur le repli international documenté (`ZZ`) — il déduit un
> pays faux avec assurance. C'est exactement la faute contre laquelle `Auth.tsx:58-66` met en garde
> pour les coachs ; le chemin élève la reproduit.

Ce n'est pas propre à mon test : sur les 85 comptes de la base locale, `country` est NULL pour
la grande majorité.

## S4 — Les premières arrivées — **coach : à corriger / élève : bon, mais amputé**

**Coach.** Ce n'est pas un tableau vide qui ressemble à un produit cassé : l'état vide existe et
est bien écrit. Deux défauts réels :

- **L'ordre est faux.** L'écran pousse « Invite a student » en action primaire. Le modèle dit
  1. enregistrer sa méthode (`/coach/doctrine`), 2. inviter. Inviter avant toute doctrine, c'est
  brancher des élèves sur une Sophia qui n'a **rien** à porter. Doctrine n'apparaît que dans la
  barre de nav, sans hiérarchie.
- **L'invitation envoyée est invisible — structurellement.** Constat à 16h11, après rechargement
  complet : deux invitations envoyées, l'écran affiche toujours « Invite your first student ».
  La cause n'est pas un rafraîchissement manquant :

  | fait | preuve |
  |---|---|
  | `coach-invite-student-v1` ne crée **délibérément** aucune ligne `coach_clients` | en-tête du fichier, l. 11-17 (l'index `one_live_coach_per_student` bloquerait le siège de l'élève) |
  | `loadCoachHome` lit **uniquement** `coach_clients` (+ directory + contact) | `CoachHomePage.tsx:105-122` |
  | la tuile « Invitations pending » compte `status === 'invited'` | `coachCohort.ts:16-20` |
  | **rien n'écrit jamais `status='invited'`** en production | seule occurrence du dépôt : `_shared/keel/tenancy_rls_test.sql:225` |
  | en base, **0** ligne `coach_clients` avec `status='invited'` sur 60 | requête directe |
  | mon coach a **5 invitations `pending`** ; la tuile affiche **0** | requête directe + capture |

  Le coach ne peut donc ni voir, ni relancer, ni révoquer une invitation — et comme le lien ne
  transite que par l'email de l'invité, un email perdu est un cul-de-sac silencieux des deux côtés.

**Élève.** `/app/today` est bon : titre honnête, distinction claire « rien à faire » vs « erreur »,
squelette des trois repas. `/app/plan` est atteignable par « My week » dans la nav.
Le manque n'est pas l'écran, c'est l'absence du raccord WhatsApp (S3).

**États d'erreur ≠ états vides** : correctement séparés partout où j'ai regardé
(`CoachHomePage` l. 49 le dit explicitement, `CoachRoute` distingue `suspended` de `none`).

## S5 — Cohérence visuelle — **CONFIRMÉ, une rupture nette au milieu**

Le chemin réel d'un coach traverse trois identités :

| étape | identité |
|---|---|
| `/` landing | kit KEEL : blanc, titrage serif, pastilles sombres, sobre |
| **`/auth`** | **legacy B2C : logo yin-yang violet, « POWERED BY IKIZEN », icônes lucide, indigo, ombres, `rounded-2xl`** |
| `/coach`, `/app/*` | kit KEEL de nouveau |

La porte d'entrée est donc le seul écran du parcours qui n'appartient pas au produit qu'on vend.
`/account` (S8) ajoute une quatrième identité. Le mode coach de `/auth` peut être rhabillé sans
toucher au rendu FR : toutes les branches sont déjà `coachSignup ? … : …`.

**Mobile (375×812) — deux défauts mesurés, pas d'impression :**

| écran | `scrollWidth` / `clientWidth` | conséquence |
|---|---|---|
| `/app/today` | **528 / 375** | « Account » (bord droit 468) et « Sign out » (529) **hors écran, inatteignables** |
| `/coach` | **574 / 375** | même débordement du header |
| `/join` 🟡 | 375 / 375 | ✅ pas de débordement |
| `/auth?role=coach` | 375 / 375 | ✅ (la carte colle aux bords, cosmétique) |

L'élève est explicitement invité à ouvrir le lien **sur son téléphone** : le débordement est sur
son appareil principal.

## S6 — Les refus et les culs-de-sac — **9 refus provoqués, tous corrects ; 2 culs-de-sac réels**

| refus | provoqué comment | ce qui s'affiche | verdict |
|---|---|---|---|
| `no_token` 🟡 | `/join` nu | « You'll need your coach's link — There is no sign-up here… Ask them for it, and open it on your phone. » | ✅ **infirmé** : c'est exactement ce qu'il fallait |
| `invalid_token` 🟡 | token bidon | « This invitation link is not valid… » | ✅ |
| `expired` 🟡 | `expires_at` reculé en SQL | « This invitation has expired. Ask your coach for a new one. » | ✅ |
| `revoked` 🟡 | `status='revoked'` | « Your coach cancelled this invitation. » | ✅ |
| `already_accepted` (déconnecté) 🟡 | token de Léa rejoué | « …already been used. If that was you, sign in — your space is waiting. » | ✅ |
| `already_accepted` (connecté) 🟡 | idem, session Léa | « **You're already in** — …Nothing else to do here. [Go to my space] » | ✅ pas de fausse alerte au moment du succès |
| `coach_unavailable` 🟡 | coach `suspended` | « This coach's account is not active right now… » | ✅ |
| `self_invitation` 🟡 | Nadia ouvre sa propre invitation | « This invitation was issued by your own coach account. » | ✅ (le *preview* ne le détecte pas : elle lit « Nadia invited you… » avant de cliquer) |
| `already_coached` 🟡 | course reproduite en SQL | « …End that relationship from **your account page** first » | ⚠️ voir ci-dessous |
| email déjà enregistré 🟡 | formulaire `/join` avec l'adresse de Léa | « **You already have an account** — …Sign in and your coach's invitation is applied automatically » | ✅ le défaut observé « dans la nature » est bien réparé |

**Cul-de-sac n°1 — `already_coached` envoie vers une action qui n'existe pas.**
Le soupçon était « cette page est-elle l'écran français `/account` ? ». C'est pire :

- « your account page » n'est **pas un lien** ;
- la seule page de compte du produit est `/account`, **legacy et française** (vérifié) ;
- `revoke_coach_access` **existe en base** mais a **zéro appelant dans le frontend**
  (`grep -rn "revoke_coach_access" frontend/src` → rien), et `Account.tsx` ne contient pas une
  seule occurrence du mot « coach ».

L'élève est donc renvoyé vers une page française pour y faire quelque chose d'**impossible**.
Atténuation : `coach-invite-student-v1` refuse déjà à l'émission (`student_already_coached`),
donc ce refus n'apparaît que si l'élève acquiert un coach **entre** l'émission et l'acceptation.

**Cul-de-sac n°2 — les pages satellites sont françaises.**

- `/email-verified` : « Email confirmé ! / Merci d'avoir pris le temps de confirmer ton adresse. /
  Tu peux maintenant retourner sur l'onglet d'origine pour continuer ton parcours. » — **français**,
  et c'est la page d'atterrissage du lien de vérification pour **tout** le monde, coach compris.
- `/reset-password` : « Réinitialisation / Choisis un nouveau mot de passe… / Mettre à jour le mot
  de passe / Retour à la connexion » — **français**, avec l'en-tête IKIZEN.
- `NotFoundPage` (`/404`) : **anglais**, kit KEEL, bon ton (« Nothing is broken on your side. ») ✅

## S7 — Les données communes — la carte réelle

Qui écrit quoi, selon la porte. `handle_new_user()` insère exactement :
`id, full_name, avatar_url, phone_number, email, timezone, locale, tz_follow_device`.
Ni `country`, ni `keel_role`.

| champ | coach (`/auth?role=coach`) | élève A (compte créé depuis `/join`) | élève B (compte existant qui accepte) |
|---|---|---|---|
| `email` | trigger | trigger | préexistant |
| `full_name` | trigger (champ « Your name ») | trigger (champ « Your name ») | préexistant |
| `phone_number` | **jamais** (voulu : clé omise) | **jamais** 🔴 | préexistant (ici `+33…`) |
| `whatsapp_opted_in` | `false` | `false` 🔴 | selon l'historique (`false` ici) |
| `timezone` | `Auth.tsx` (détecté + sélecteur) | `JoinPage` (détecté) ✅ | préexistant |
| `tz_follow_device` | selon le toggle (`false` ici) | `true` | préexistant |
| `locale` | `en-US` (meta) puis **réécrit** par `coach-signup-v1` | `en-US` **codé en dur** | **inchangé** → `fr-FR` pour un legacy 🔴 |
| `country` | **`coach-signup-v1`**, depuis un sélecteur explicite ✅ | **jamais** 🔴 | **jamais** 🔴 |
| `keel_role` | `coach` (`coach-signup-v1`) | `student` (`accept_coach_invitation_for_user`, **seulement si NULL**) | idem |
| `display_unit_system` | défaut `metric` | défaut `metric` | défaut `metric` |
| `coaches` (ligne) | `coach-signup-v1`, `status='active'` | — | — |
| `coach_clients` | — | `accept_…_for_user`, directement `status='active'` | idem |

**Ce que la carte dit** : les deux portes ne produisent pas le même humain. Un élève a un fuseau
mais pas de numéro ni de pays ; un legacy devenu élève a un numéro et un pays vide, en français.
`country` est le champ que **personne** n'écrit pour un élève, et c'est le premier que lit le
résolveur de crise.

**Le même humain peut-il être coach ET élève ?** Oui, et le comportement est cohérent :
- `resolveHomePath` : le coach gagne (ligne `coaches` active testée en premier) → `/coach` ;
- `accept_coach_invitation_for_user` ne pose `keel_role='student'` **que si `keel_role IS NULL`** :
  un coach qui accepte l'invitation d'un pair n'est jamais rétrogradé ;
- `coach-signup-v1` refuse (409) de promouvoir un `keel_role='student'` en coach ;
- `self_invitation` empêche de devenir son propre élève.
Conséquence assumée : un coach qui est aussi l'élève de quelqu'un n'a **aucun chemin de
navigation** vers `/app/today` — il doit taper l'URL. `CoachRoute` offre d'ailleurs un bouton
« student app » dans son écran de refus, mais ce refus ne s'affiche jamais à un coach actif.

## S8 — Le legacy joignable depuis KEEL — **CONFIRMÉ, et par le chemin le plus court**

| depuis | lien | où ça mène |
|---|---|---|
| header **coach** `/coach` | « Account » → `/account` | tiroir legacy **français** |
| header **élève** `/app/today` | « Account » → `/account` | **le même** |

Les deux espaces partagent le **même composant** : `KeelAppShell.tsx:76`. Une seule ligne fait
donc fuir les deux rôles — ce qui est aussi la bonne nouvelle du correctif F1.

| `/auth` (coach déconnecté) | « Créer un compte gratuitement » | tunnel B2C français → `/dashboard` |
| `resolveHomePath` | défaut | `/dashboard` (voir S1a/S1b) |

Ce n'est pas un lien profond oublié : c'est un **élément de navigation permanent des deux
espaces KEEL**. Un coach britannique et son élève cliquent « Account » et lisent
« Compte / Plan / Options / **Parrainage** », « Niveau : Initié », « Membre depuis 0 jour » —
dont un programme de parrainage que le code déclare supprimé
(`handle_new_user`, commentaire « le programme n'existe plus »).

Aucune route legacy n'a été supprimée. Voir les propositions chiffrées, décision au fondateur.

---

# 4. Trous de PARCOURS (par opposition aux bugs d'écran)

Un bug d'écran se corrige dans un fichier. Un trou de parcours est une étape qui n'existe nulle part.

### H1 — Rien ne capture le WhatsApp de l'élève 🔴 *le plus grave*
Le produit vend une boucle quotidienne sur WhatsApp ; le parcours d'inscription ne demande jamais
le numéro. Sophia ne peut écrire à aucun élève inscrit normalement.
**Proposition** : écran post-acceptation « Link your WhatsApp » (numéro E.164 + pays), puis
`whatsapp-optin` — la mécanique existe déjà pour le chemin FR.
**Coût** : 1 écran + réutilisation de `whatsapp-optin` ≈ 0,5–1 j. Aucune migration.
**Décision requise** : bloquant ou passable-plus-tard ? Le laisser passable crée des élèves muets.

### H2 — Rien ne capture le pays de l'élève 🔴
Conséquence mesurée : hotlines **US** pour l'élève d'un coach UK (S3).
**Proposition** : ajouter un sélecteur `country` au même écran que H1 (les deux vont ensemble),
avec le même argumentaire qu'`Auth.tsx` pour les coachs. À défaut d'écran, hériter du
`country` du coach est **moins faux** que de déduire du locale — mais reste une supposition.
**Coût** : inclus dans H1. **Correctif serveur non fait, documenté** : `handle_new_user()`
n'écrit pas `country` ; le combler côté trigger exigerait une migration → **hors périmètre,
non touché.**

### H3 — Une invitation envoyée n'existe pour personne 🟠
Ni ligne visible, ni relance, ni révocation, ni accusé. Le coach ne peut pas distinguer
« envoyée » de « le bouton n'a rien fait » (S4).
**Proposition** : lire `coach_invitations` dans `loadCoachHome` et rendre une section
« Invitations en attente » (+ révoquer / renvoyer). **Ne pas** créer de ligne `coach_clients`
`invited` — la raison documentée reste valable.
**Coût** : ~0,5 j frontend + une policy de lecture à vérifier. Corrige aussi la tuile morte.

### H4 — Aucun moyen de quitter un coach 🟠
`revoke_coach_access` existe en base, zéro appelant. Le refus `already_coached` y renvoie quand même.
**Proposition** : à traiter avec H5 (une page de compte KEEL est l'endroit naturel).

### H5 — Il n'existe aucune page de compte KEEL 🟠
D'où S8 : les deux espaces pointent vers le legacy faute de mieux.
**Proposition** : `/app/account` et `/coach/account` minimales — nom, email, fuseau, **numéro
WhatsApp (H1)**, **pays (H2)**, **quitter mon coach (H4)**, déconnexion.
**Coût** : 1–2 j. **C'est le correctif qui referme H1, H2, H4 et S8 d'un coup** — recommandé
comme le vrai chantier, avant tout replâtrage des liens.

### H6 — `/auth` sans contexte n'oriente pas l'élève 🟠
Un élève sans lien y arrive et tombe dans le B2C français (S1a).
**Proposition** : sur `/auth` sans `role` ni token, une ligne d'orientation à côté de celle qui
existe déjà pour les coachs : « Élève ? On entre par l'invitation de son coach. »
**Coût** : < 1 h, additif, aucun risque pour le chemin FR.

---

# 5. Correctifs — **listés, non appliqués**

Rien n'a été appliqué : une autre session éditait `JoinPage.tsx`/`PublicHeader.tsx` pendant
l'audit, et committer aurait embarqué son travail en cours (arbitrage pris avec le fondateur).
Le seul fichier commité par cette session est **ce rapport**.

Ligne de base à jour : `frontend/node_modules/.bin/tsc --noEmit -p tsconfig.json` → **exit 0, aucune sortie**.
(`npx tsc` échoue : TypeScript n'est pas résolu par npx dans ce dépôt — utiliser le binaire local.)

Par gravité décroissante. Tous respectent « à côté, jamais tissé » : chaque branche ajoutée est
`coachSignup ? … : …`, le chemin FR exécute les mêmes instructions qu'avant.

| # | Cible | Correctif | Risque | Effort |
|---|---|---|---|---|
| **F1** | **`frontend/src/keel/components/KeelAppShell.tsx:76`** — une seule ligne, partagée par les deux espaces | `<ShellLink to="/account" …>` ne doit plus pointer sur le legacy. **Court terme** : retirer l'entrée. **Bon** : H5. | faible | 10 min / 1-2 j |
| **F2** | `postLogin.ts` | Ligne `coaches` **lue avec succès** mais non active → renvoyer `/coach` (donc l'écran « suspended ») au lieu de `/dashboard`. Le `catch` et le défaut legacy restent inchangés. | faible | 15 min |
| **F3** | `Auth.tsx` | Les 11 chaînes françaises du mode coach (liste ci-dessous). | faible | 1–2 h |
| **F4** | `Auth.tsx:669-765` | Écran « Vérifie ta boîte mail » — ajouter la branche coach. **C'est le premier écran d'un vrai coach en prod.** | faible | 30 min |
| **F5** | landing `PublicHeader` 🟡 | « Sign in » → doit ouvrir la porte coach **en mode connexion**. Attention : `?role=coach` force `isSignUp=true` (`Auth.tsx:191-196`) — il faut un paramètre d'intention (ex. `?role=coach&mode=signin`) sinon le lien « Sign in » affiche un formulaire d'inscription. | moyen | 30 min |
| **F6** | `Auth.tsx` (sign-out coach) | La déconnexion depuis `/coach` renvoie `/auth?redirect=/coach` — ajouter `role=coach` (même réserve que F5). | faible | 15 min |
| **F7** | `CoachHomePage` + `coachCohort` | H3 : lire `coach_invitations`, afficher les invitations en attente, réparer la tuile. | moyen | 0,5 j |
| **F8** | `CoachHomePage` (état vide) | Mettre **Doctrine** en action primaire, « Invite a student » en secondaire. | faible | 30 min |
| **F9** | shells KEEL | Débordement mobile (528 et 574 px pour 375) : header repliable / défilant. | faible | 2–3 h |
| **F10** | `index.html` | `lang="fr"` et titre français par défaut → neutres, chaque espace posant les siens. **Vérifier** que le chemin FR garde son titre. | moyen | 1 h |
| **F11** | `EmailVerified.tsx`, `ResetPassword.tsx` | Bilingue, ou anglais + FR selon `locale`. Ces pages sont partagées : ne pas basculer tout le monde en anglais. | moyen | 2–3 h |
| **F12** | `JoinPage` 🟡 | Refus `already_coached` : ne plus renvoyer vers « your account page » tant que H4 n'existe pas — dire quoi faire réellement (contacter son coach). | faible | 15 min |

**Les 11 chaînes de F3** (`frontend/src/pages/Auth.tsx`) :

| ligne | actuel | quand c'est vu |
|---|---|---|
| 1007 | `Adresse Email` | mode connexion coach |
| 1173 | `Mot de passe oublié ?` | mode connexion coach |
| 1139-1140 | `Itinérance` / `Suivre automatiquement…` | Preferences, signup coach |
| 1046 | aria `Masquer/Afficher le mot de passe` | partout, lecteurs d'écran |
| 863, 941, 1019 | placeholder `prenom@exemple.com` | partout |
| 1194 | `Traitement...` | soumission coach |
| 846-899 | formulaire de reset entier | depuis la porte coach |
| 317 | `Email pas encore vérifié…` | vérification manuelle |
| 660 | `Une erreur est survenue.` | toute erreur coach |
| 493 | `Veuillez accepter les CGU…` | garde (bouton désactivé, donc rare) |
| 199 | message pré-lancement | si le lockdown est réactivé |

**Hors périmètre, non touché, documenté comme demandé** : `handle_new_user()` (migration) devrait
écrire `country` depuis les metadata pour que H2 soit réparable sans écran intermédiaire.
Aucune edge function ni migration n'a été modifiée.

---

# 6. Ce qui reste en décision (fondateur)

1. **H1/H2 bloquants ou non ?** Sans numéro, l'élève est muet ; sans pays, il est américain par
   défaut. Recommandation : **H5 (page de compte KEEL) en premier**, il referme H1, H2, H4 et S8.
2. **Legacy** : aucune route supprimée, aucune proposition de suppression faite ici — seulement
   « ne plus y pointer depuis KEEL » (F1). La suppression de `/dashboard`, `/onboarding-v2`,
   `/upgrade`, `/chat` exige la vérification adversariale indépendante prévue par le dépôt.
3. **F5/F6/F10** touchent des surfaces partagées avec le chemin FR : à faire relire.
4. **Reprendre l'audit de `/join` et de la landing** une fois la session concurrente terminée :
   tous les constats 🟡 portent sur des fichiers réécrits pendant la mesure.

# 7. Doutes explicites

- 🔴 L'écran de confirmation d'email coach n'a **pas** été vu dans un navigateur (confirmations
  désactivées en local). Le constat repose sur la lecture de `Auth.tsx:669-765` (aucune occurrence
  de `coachSignup`) et sur `config.prod.toml:38`. À rejouer en activant les confirmations en local.
- 🟡 Tous les constats `/join`, `PublicHeader`, landing : fichiers en cours de réécriture.
- L'invite renvoie `send_state: "sent"` même quand la livraison est désactivée
  (`coach-invite-student-v1` ne lit pas `out.skipped` pour ce champ) ; `communication_logs.metadata`
  porte bien `skipped: true`. Gêne d'observabilité, pas un bug de parcours. Non investigué plus loin.
- Les 17 élèves affichés chez mon coach viennent d'une QA concurrente, pas du produit (vérifié).
- Le pilote/billing n'a pas été touché, conformément au périmètre.

# 8. Comptes et état laissés en base (local)

`nadia.coach.audit@keeltest.dev` (coach, GB, **remis `active`**),
`lea.student.audit@keeltest.dev` (élève de Nadia),
`marc.lost.audit@keeltest.dev` (créé par la porte FR, puis élève de Nadia — ordre B).
Mot de passe commun : `KeelAudit2026!`.
Invitations de test `case.*@keeltest.dev` laissées dans leurs états (expirée, révoquée, pending).
`coaches.status` de Nadia a été suspendu puis **restauré à `active`** ; la ligne coach temporaire
de Marc a été supprimée et son `keel_role` remis à NULL.
