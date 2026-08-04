# La page d'entrée de l'élève — `/join`

> Périmètre touché : `frontend/src/keel/pages/JoinPage.tsx`,
> `frontend/src/keel/i18n/en.ts`, `frontend/src/keel/components/PublicHeader.tsx`,
> `.claude/launch.json` (un port de dev libre, les trois premiers étant pris par
> d'autres sessions). **Aucune RPC d'invitation, aucune migration, aucun deploy.**

---

## 1. Ce que la page est devenue, et pourquoi dans cet ordre

L'ancienne page était un formulaire dans une carte de 512 px. Elle était juste
et elle ne disait rien. Le nouvel écran garde **exactement le même moteur** et
change ce qu'il y a autour.

**Deux surfaces pleines, une frame compacte.**

| Surface | Quand | Ce qu'elle contient |
|---|---|---|
| **Pleine, avec formulaire** | token valide | ouverture → explication → formulaire |
| **Pleine, sans formulaire** | pas de token, ou refus | l'énoncé de la situation → **la même explication** |
| **Compacte (carte)** | `accepted`, `check_email`, `already_in`, `existing_account`, `loading`, `accepting` | une réponse et une sortie, pas une visite guidée |

La règle de partage : quelqu'un qui vient de réussir, ou qui attend un mail, n'a
pas besoin d'un argumentaire — il a besoin du bouton suivant. Quelqu'un dont le
lien est périmé, lui, **veut toujours entrer** : il lit l'explication, puis il
sait pour quoi il relance son coach.

**L'ordre de la surface pleine, et le raisonnement de chaque bloc :**

1. **Qui a invité, et ce qu'est Sophia.** Le titre reste `invite.accept_title`
   (le prénom vient de la RPC ; `headline()` gère déjà le `null`).
2. **« What this actually looks like »** — trois moments. L'exergue de chaque
   moment est **la surface** (`On WhatsApp` / `On WhatsApp` / `In this app`),
   pas un numéro. C'est une information vraie : deux tiers de la vie du produit
   se passent là où l'élève tape déjà, et « 01 / 02 / 03 » n'aurait dit que
   qu'il y en a trois. Les moments restent génériques (« in the evening »), les
   fenêtres exactes sont de l'implémentation.
3. **« Nobody is grading you »** — le seul fond sombre de la page. La landing
   coach dépense son bloc sombre sur le double verrou, parce que c'est
   l'argument qu'un coach achète ; celle-ci le dépense sur l'absence de note,
   parce que c'est celui pour lequel un élève reste.
4. **« What {coach} sees, and what they don't »** — le registre, § 2. Le seul
   bloc qui a demandé de lire la base plutôt que le brief.
5. **« There is no direct line to {coach} »** — la limite, énoncée juste avant
   le formulaire. C'est la dernière chose lue avant un mot de passe.
6. **Le formulaire.** L'ordre EST le consentement : personne ne tape son mot de
   passe avant d'avoir lu ce qui traverse.

**Pas de lien de saut vers le formulaire.** Il aurait coûté trois lignes et
aurait défait le point 6. Le prix payé est réel et je l'assume : quelqu'un qui
revient sur la page après avoir abandonné doit re-dérouler ~5 écrans de
téléphone.

**Direction visuelle.** Le kit `keel/components/ui/` fait autorité : aucun
composant neuf, aucune teinte neuve. Colonne unique à toutes les largeurs
(`max-w-xl`, ~65 caractères) — un élève ouvre ce lien sur son téléphone, et une
grille à deux colonnes qui n'existe qu'au-dessus de 1024 px est une mise en page
écrite pour le relecteur. Les sections sont séparées par des filets, jamais par
des fonds qui alternent : les deux seuls changements de fond de la page (le bloc
sombre, le gris de la moitié « stays with you ») **encodent un registre**. La
chaleur demandée passe par l'échelle typographique, le blanc et les mots — pas
par une couleur d'accent, parce que dans ce produit toute couleur saturée est un
**état** (c'est écrit en tête de `LandingPage.tsx`), et une teinte de marque sur
la page dont l'argument est « rien ici ne te note » aurait été de la décoration
déguisée en sens.

L'audace unique est le **registre** : les deux listes vivent dans un seul objet
avec une couture visible, parce que la couture est ce que le bloc décrit. Pas de
coches vertes ni de croix rouges : une coche verte en face de « what crosses
over » aurait noté la liste, sur la page qui vient de promettre de ne rien noter.

---

## 2. Le registre, ligne par ligne, avec sa preuve

Vérifié en base locale (`docker exec supabase_db_Sophia_2 psql`), pas sur
l'intention. **Ce bloc est la partie de la page qu'une migration de quelqu'un
d'autre peut transformer en mensonge.**

### « What crosses over »

| Ligne à l'écran | Colonne qui la prouve |
|---|---|
| Your name, and the time zone you live in | `coach_student_directory` → `full_name`, `avatar_url`, `timezone`, `locale` |
| When you last wrote, and how many times in the past week | `coach_student_contact` → `last_inbound_at` = `max(created_at) FILTER (role='user')` ; `inbound_count_7d` = `count(*) FILTER (role='user' AND created_at >= now()-7d)` |
| What you logged and when — **including the food groups read off a plate** — and whether a photo came with it | `coach_student_events` → `occurred_at`, `local_date`, `slot_key`, `source`, `recognized`, `recognition_confidence`, `quantity`, `unit`, `substance_ref`, `food_group_ref`, `evidence_weight`, `has_media` |
| How the week went: good / so-so / rough, et l'axe dominant | `coach_student_pulse` → `days_good`, `days_mixed`, `days_hard`, `dominant_axis` (sur `student_daily_checkins`, CHECK `overall IN ('good','mixed','hard')`, `axis IN ('energy','hunger','sleep')`) |
| Every time they open your space | `coach_access_events` (`coach_id`, `student_user_id`, `surface`, `occurred_at`), écrit par `log_coach_student_access` **avant** toute lecture ; relisible par l'élève via la politique `coach_access_events_student_select`, et inclus dans `account-export-v1` ([index.ts:516](supabase/functions/account-export-v1/index.ts:516)) |

> **La troisième ligne a été corrigée après un premier jet.** J'avais écrit
> « that you logged something » — c'était **sous-vendre**. La vue porte
> `recognized`, `food_group_ref` et `quantity` : les groupes d'aliments lus sur
> une assiette **traversent**. Sous-dire est ici la même malhonnêteté que
> sur-dire, une page avant un mot de passe.
>
> **La cinquième pointe l'export, pas un écran.** La donnée est bien accessible à
> l'élève, mais **aucune interface ne la lui montre**. La copie dit donc « it
> comes back to you if you ask for your data », et pas « you can read it ».

### « What stays with you »

| Ligne à l'écran | L'absence qui la prouve |
|---|---|
| What you write. Their window has two columns: when, and how often. There is no column holding the words. | `chat_messages` : RLS activée, **7 politiques, toutes `auth.uid() = user_id`. Aucune politique coach.** Le seul objet coach au-dessus, `coach_student_contact`, ne SELECT que `max(created_at)` et `count(*)` — **il n'existe aucune colonne portant le texte.** C'est l'argument le plus fort de la page, et il est structurel. |
| Your photos. They reach Sophia and stop there. | `coach_student_events` expose `media_path IS NOT NULL AS has_media` ; **`media_path` est absent de la vue**. Bucket `meal-photos` : `public = f`. `storage.objects` : RLS activée, **zéro politique** → aucun compte `authenticated` ne lit l'objet. |
| Anything you add in your own words alongside a meal | `protocol_events.student_note` **existe** et est **absent** de `coach_student_events` (comme `source_message_id`) |
| A calorie count or a macro figure — there is no such number anywhere in here | **Aucune colonne** énergie/macro sur `protocol_events`. CONTRACT NON-INPUT #4. Et `week_plan_generation.ts::findNumericTarget` retire les lignes portant une cible chiffrée d'énergie ou de macro (4 motifs nommés, testés séparément). |

### 🔴 L'exception — trouvée en lisant le code, et écrite sur la page

**« Ton coach ne lit jamais un mot de ce que tu écris » est FAUX.** Je l'avais
écrit avant de vérifier ; la vérification l'a démenti.

Quand la garde de restriction se lève, [`router/run.ts:5450`](supabase/functions/sophia-brain/router/run.ts:5450)
passe `studentWords: userMessage.trim()` à `escalateRestrictionSignal`, qui
écrit `contract_change_requests.student_words` — décrit en tête de
`plan_question/escalation.ts` comme *« the verbatim question, citable, never
paraphrased away »*. Et la table porte `contract_change_requests_select_coach`
(`user_id = ANY(coached_student_ids())`). Deux autres appelants passent aussi le
message : `disordered_eating_guard/skill.ts:93`, `plan_question/skill.ts:163`.

La page énonce donc le trou, sans vocabulaire clinique, sous un filet épais
plutôt que sous une teinte d'alarme :

> *If something you write suggests your relationship with food is turning
> against you, that sentence goes to {coach} the same day, marked urgent.
> Software should not be the only thing holding that.*

C'est ce qui rend le reste croyable. Une page qui aurait promis l'absolu se
serait fait démentir par le premier élève concerné.

---

## 3. États vus dans un vrai navigateur

Serveur `frontend-alt3` (port 5177), Chrome intégré, **largeur mobile 375×812
d'abord**, puis 1280×900. Fixtures fabriquées en SQL local, supprimées à la fin.

| État | Fabriqué par | Ce qui s'est affiché |
|---|---|---|
| **Token valide, coach nommé** | invitation `pending`, coach `Nadia` actif | « Nadia invited you to their coaching program », prénom interpolé aux 6 endroits, email pré-rempli, formulaire en bas |
| **Token valide, coach sans prénom** | `coaches.display_name = null` + `profiles.full_name = null` (RPC → `coach_first_name: null`) | « **Your** coach invited you… » en tête, et « **your coach**'s method » / « What **your coach** sees » en milieu de phrase. Aucun `{coach}` nu, aucune minuscule en tête de phrase |
| **Sans token** | `/join` nu | « You'll need your coach's link » + « There is no sign-up here… Ask them for it » + lien *Sign in*, **puis la même explication**. Aucun formulaire |
| **Expiré** | `expires_at = now() - 1 day` | « This invitation cannot be used » + `t("invite.expired")` **verbatim** + *Sign in to an existing account* |
| **Révoqué** | `status = 'revoked'` | copie `revoked` verbatim |
| **Déjà utilisé** (déconnecté) | `status = 'accepted'` | copie `already_accepted` verbatim |
| **Déjà utilisé** (connecté) | même token, session ouverte | « You're already in » + *Go to my space* — l'écran qui évite le faux négatif au moment du succès |
| **Déjà suivi** (`already_coached`) | **2ᵉ coach** créé (`Marc Delisle`) invitant un compte déjà lié à Nadia | copie `already_coached` verbatim : « …End that relationship from your account page first » |
| **Coach inactif** | `coaches.status = 'suspended'` | copie `coach_unavailable` verbatim |
| **Email déjà pris** | invitation pointée sur `a9.quiet@keeltest.dev` | l'écran `existing_account` — **pas** le message brut de Supabase sous le bouton (le défaut observé en vrai que ce garde attrape) |
| **Lien invalide** | token inexistant | copie `invalid_token` verbatim |

**Le parcours complet, une fois, de bout en bout** — sur le token valide :
formulaire → compte créé → `/app/today` atteint, connecté, avec la nav élève.
Vérifié **en base**, pas à l'écran :

```
auth.users        → 8a17ddbf…  qa-join-valid@test.dev  Lena Fischer  Europe/Paris
coach_clients     → student 8a17ddbf… ↔ coach 1d470c4f…  status=active
coach_invitations → qa-join-valid@test.dev  status=accepted  accepted_at≠null
```

**Autres contrôles :** `scrollWidth == clientWidth == 375` (aucun débordement
horizontal en mobile) ; `document.title = "Your coach's invitation | Sophia
Coach"`, `lang="en"`, `robots="noindex,nofollow"` ; zéro erreur console ;
`t()` lève sur clé inconnue en DEV, donc l'absence d'exception vaut preuve que
toutes les clés existent. `tsc --noEmit` (projet solution **et**
`tsconfig.app.json`) : **0 erreur**. `scripts/ci/token-lint.mjs` : **OK**.

**`EMAIL_DELIVERY_ENABLED=0` vérifié dans `supabase/.env` AVANT le premier
test d'inscription** (ligne 39). En complément, `enable_confirmations = false`
en local : le signup rend une session directement, et Inbucket capte de toute
façon le courrier d'auth.

---

## 4. Ce que j'ai laissé de côté, et pourquoi

- **`self_invitation` non joué au navigateur.** Il faut être authentifié comme le
  coach émetteur, donc saisir un mot de passe dans un formulaire
  d'authentification — je ne le fais pas. Sa copie est **inchangée** et son
  chemin (`ACCEPT_REFUSALS`) n'a pas été touché.
- **Les deux maps de refus restent en dur dans le fichier.** Je n'ai déplacé vers
  `en.ts` que les chaînes que ce passage a écrites ou réécrites. Transcrire un
  refus est précisément la façon dont un refus s'affaiblit ; la dette d'i18n
  inline est **documentée et non aggravée**, pas résorbée.
- **Le poids** : `/app/progress` l'affiche, mais la landing coach reste
  délibérément muette dessus (chemins d'écriture et de lecture en désaccord).
  La page élève l'est aussi.
- **Le point hebdo par formulaire WhatsApp** : interdit par la mission, et
  l'objet Flow n'existe pas chez Meta.
- **Commentaires de code en anglais.** La consigne dit « en français, comme le
  repo » ; or dans `keel/pages/`, le repo est mixte — `JoinPage.tsx` (le fichier
  réécrit), `LandingPage.tsx` et `CoachStudentPage.tsx` sont **entièrement en
  anglais**, `StudentProgressPage.tsx` et `StudentWeekPlanPage.tsx` en français.
  J'ai continué la langue du fichier plutôt que d'y introduire un mélange. **À
  trancher par toi** si tu veux l'inverse.

---

## 5. Les drapeaux — à lire avant de montrer la page à un élève

### 🔴 1. `/app/today` contredit la page, une seconde après l'inscription

C'est le plus grave, et je l'ai vu en faisant le parcours complet. Ma page dit :

> *Sophia drafts a week from {coach}'s method and from what your life actually
> allows, and it is not yours until you say it is.*

`/app/today`, l'écran d'atterrissage, dit **le modèle d'avant C1** :

> *Your plan isn't published yet. Your coach is putting it together… **Your coach
> writes each line.** When they publish, your day fills in here, slot by slot.*

Un élève qui s'inscrit aujourd'hui lit ma page, clique, et tombe sur l'inverse.
`TodayPage.tsx` est **hors de mon périmètre** ; c'est un écran à reprendre, et
tant qu'il ne l'est pas, la porte d'entrée ouvre sur une autre pièce.

### 🟠 2. `weekly_reviews` est lisible par le coach **colonne large**

`weekly_reviews_select_coach` est une politique SELECT sans restriction de
colonnes (RLS ne restreint pas les colonnes) : un coach peut donc demander
`student_narrative` et `lapse_context` par l'API, même si `CoachStudentPage` ne
les sélectionne pas. Aujourd'hui `student_narrative` **n'est écrit par personne**
(`keel-weekly-flow-v1` n'écrit que `biofeedback`), donc la colonne est vide —
mais c'est un fait d'aujourd'hui, pas une garantie de structure.

**Conséquence tenue sur la page :** la promesse est bornée à *ce que tu écris
dans la conversation*, jamais à « ton coach ne lit rien de ce que tu produis ».
Si un jour `student_narrative` se remplit, **cette page ne devient pas fausse** —
mais elle deviendra incomplète, et la ligne à ajouter est celle-là.

### 🟠 3. La promesse photo n'a jamais été prouvée de bout en bout

La page dit « tu envoies une photo, tu reçois une réponse dans la méthode de ton
coach ». Le contrat photo v3 est écrit, filtré, testé (83 tests) et **n'a jamais
lu une image** contre un vrai modèle de vision (STATUS-MORNING §2). Je l'écris
quand même parce que c'est ce que la landing coach promet déjà et ce que la
mission demande — mais c'est **la seule promesse de la page qui ne repose sur
aucune exécution réelle**. Le smoke test téléphone de la checklist du matin est
son préalable honnête.

### 🟡 4. Une autre session a committé une partie de ce travail en cours de route

Trois commits sont apparus pendant que j'écrivais (`fd6ec993`, `1f8514dd`,
`b01419e2`). L'un d'eux a emporté **57 de mes clés `join.*`** dans `en.ts` alors
qu'elles étaient encore en cours de rédaction : elles sont maintenant dans un
commit qui parle d'autre chose. Rien n'est perdu ni abîmé — l'arbre de travail
porte les 64 clés finales, et mes 7 dernières corrections (dont `sees_3`,
`sees_5` et le `join.lead` corrigé) sont **non commitées**. Mais si tu relis
l'historique, la paternité de ce lot est mélangée. **Je n'ai rien commité
moi-même.**

### 🟡 5. La base locale est partagée avec d'autres sessions

Pendant ce travail, `coaches` est passé de **1 à 19 lignes** et `coach_clients`
à **58**, sans action de ma part : d'autres sessions écrivent dans la même base
(les ports 5174/5175/5176 étaient déjà pris). Mes fixtures ont été supprimées
**nominativement** (7 invitations `qa-join-*`, le compte `qa-join-valid@test.dev`
en CASCADE, la ligne `coaches` du 2ᵉ coach), et `Nadia Okonkwo` a été restaurée
après le test « coach sans prénom ». Vérifié : `0` ligne `qa-join-*` restante.
Si un chiffre de cohorte te surprend demain, ce n'est pas moi — mais je ne peux
pas prouver que personne n'a lu mes fixtures pendant qu'elles existaient.

### 🟡 6. Ce que je n'ai pas pu juger

Le clic de souris synthétique du navigateur intégré n'atteignait pas le bouton
de soumission (le volet était masqué pendant la session) ; les envois de
formulaire ont donc été déclenchés par `form.requestSubmit()`, qui passe par le
**même** `onSubmit` React et le même appel Supabase. Le chemin applicatif est
exercé ; **le clic physique sur ce bouton précis, lui, n'a pas été rejoué à la
souris.** Les champs, eux, ont bien été remplis au clavier réel.

Et l'appréciation esthétique reste la tienne : je peux affirmer que la page
s'affiche sans débordement à 375 px et que chaque phrase est adossée à une
colonne, pas qu'elle est belle.
