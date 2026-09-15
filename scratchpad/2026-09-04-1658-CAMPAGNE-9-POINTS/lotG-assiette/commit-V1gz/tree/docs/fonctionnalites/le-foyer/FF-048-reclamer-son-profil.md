# FF-048 · Réclamer son profil

| | |
|---|---|
| **Identifiant** | `FF-048-reclamer-son-profil` |
| **Statut** | 🟢 Livrée — commit `193e228a` (2026-08-10). Ses trois trous d'origine (n°3, n°4, n°5) sont **refermés** par `ac38a53a` et `e2899897` ; trois **autres** sont nommés depuis (n°9, n°10, n°11 — §7 et §11) |
| **Date** | 2026-08-11 |
| **Autorité produit** | [le-foyer/README.md](README.md) (F1, F3) · [MODEL.md](../../keel/MODEL.md) · [CHANTIER-FOYER-PROFILS.md](../../keel/CHANTIER-FOYER-PROFILS.md) lot 6 |
| **Dépend de** | [FF-044](FF-044-la-bouche-sans-compte.md) (la ligne existe **avant** le compte) · [FF-047](FF-047-le-corps-dans-la-part-du-foyer.md) (ce qui rend la réclamation réelle) |
| **Effort estimé** | livré — 1 jour |

---

## 1. Le problème

`keel_household_join` **INSÉRAIT** une ligne. C'est le geste d'un monde où il
fallait un compte pour exister dans un foyer.

Depuis [FF-044](FF-044-la-bouche-sans-compte.md), la bouche existe **déjà** :
elle porte son prénom, son âge, son objectif, ses contraintes et ses portions.
Insérer une seconde ligne au moment où quelqu'un gagne un accès signifie que la
personne **recommence à zéro** le jour même où elle entre — et que la douve du
produit fuit par la porte qu'on vient d'ouvrir.

Il y avait pire, et c'était silencieux : `keel_household_join` insérait **sans
`first_name`**, devenu `NOT NULL` au lot précédent. Rejoindre un foyer levait
une violation de contrainte sur un chemin qui vit entièrement en SQL. Le
typecheck était vert, le front compilait, et l'invitation était **morte**.

**Ce que ça coûte de ne rien faire.** Un adulte du foyer qui veut son accès
perd ses interdits, ses portions et son objectif au moment précis où il
s'engage. C'est l'inverse d'un déblocage : c'est une punition.

## 2. Job stories

> **Quand** mon conjoint décide enfin d'avoir son accès, **je veux** qu'il
> retrouve exactement sa place à table, **pour que** je n'aie pas à ressaisir
> ses allergies.

> **Quand** je reçois le lien, **je veux** voir de quel foyer et de quelle
> place il s'agit avant de créer quoi que ce soit, **pour ne pas** cliquer à
> l'aveugle.

> **Quand** j'ai réclamé mon profil, **je veux** savoir tout de suite ce que ça
> me donne et ce que ça ne me donne pas, **pour ne pas** chercher un bouton qui
> n'existe pas.

## 3. Périmètre

### Dans le périmètre
- L'**attachement** : `user_id` posé sur une ligne existante, `member_id`
  inchangé.
- La **cible sur l'invitation** : `household_invitations.member_id`, choisie par
  le maître.
- Un **aperçu** avant authentification (`keel_household_preview_invitation`),
  exécutable par `anon`.
- Ce que la réclamation **donne** : la lecture du plan, et le droit de poser
  **son** objectif.
- L'écran `/join-household?token=…`, qui dit aussi ce qu'elle **ne donne pas**.

### Hors périmètre — engageant
- ❌ **Composer, ajouter, retirer, restreindre.** Une seule personne gouverne le
  menu (F1). Les quatre refus sont prouvés.
- ~~❌ **Le chat, et les mesures corporelles, dans cette version.**~~
  ⟳ **RENVERSÉ le 2026-09-03 pour le chat (chantier P8, lot A8.0, décision
  D8.1)** — et c'est un renversement écrit ici parce que c'est ici que la
  phrase inverse vivait. Un profil réclamé reçoit désormais **son** message
  du soir dans `/app/chat` : la bande ③ des repas, bâtie depuis le plan
  `household` de **son** foyer, et jamais ① les courses ni ② la cuisson, qui
  restent au maître (FF-058 R10, FF-061 R9). Le cron `keel-daily-pulse-v1` le
  sert par une **seconde requête d'audience** (`household_members.role =
  'member' and user_id is not null`), **après** les maîtres du même tick, et
  sans jamais lui écrire `keel_role` (R14 tient). Ce chat est **Sophia → la
  personne** ; il n'ouvre **aucun** canal membre ↔ maître — « aucun canal 1:1
  dans le foyer » (README) reste vrai. Les mesures corporelles restent hors
  périmètre de cette fiche (FF-047).
- ❌ **Choisir sa ligne au moment de rejoindre.** Ça ferait d'un lien qui fuite
  le droit de se **déclarer n'importe qui** du foyer (R2).
- ❌ **Écraser le prénom avec `profiles.full_name`.** Voir R3.
- ❌ **Aucune anticipation des refus côté écran.** La garde de jeton vit en
  base ; la page affiche l'aperçu et laisse la base trancher.
- ❌ **Réclamer dans le TRIGGER de signup**, contrairement au patron coach.
  L'aperçu `anon` rend l'**adresse invitée** : un voleur de lien s'inscrirait à
  cette adresse et raflerait la place sans jamais ouvrir la boîte mail. La
  réclamation **exige une session**. Voir R12.
- ❌ **Un selecteur de pays qui naît à « US ».** Les deux autres portes le font ;
  celle-ci naît **vide**, et `''` est refusé. Un défaut qui a déjà servi une
  hotline de crise américaine à quelqu'un en France ne se rouvre pas par
  commodité d'UI.

## 4. Le circuit

```
   LE MAÎTRE                                    LA PERSONNE INVITÉE
       │
       │ keel_household_invite(email, MEMBER_ID)
       │   ↑ la CIBLE est choisie ici, pas au moment de rejoindre
       │   refus: not_owner · bad_email · not_a_member ·
       │          already_claimed · rate_limited
       ▼
   household_invitations
     (household_id, member_id, email, token_hash, expires_at)
       │
       │  … le lien voyage …
       ▼                                              ┌──────────────────┐
   /join-household?token=…  ──────────────────────────► APERÇU (anon)   │
                                                       │ nom du foyer   │
   keel_household_preview_invitation(p_token)          │ prénom de la   │
     rend 3 champs déjà entre les mains du porteur     │   bouche       │
     NE CONSOMME PAS le jeton                          │ adresse invitée│
     jeton bidon → {valid:false, unknown_token}        └────────┬───────┘
                                                                │ se connecte
                                                                ▼
   keel_household_join(p_token)
     ┌───────────────────────────────────────────────────────┐
     │ ORDRE DES REFUS — l'ADRESSE avant l'ÉTAT DU COMPTE    │
     │  not_authenticated → unknown_token → expired          │
     │  → EMAIL_MISMATCH → already_used                      │
     │  → already_in_household → already_claimed             │
     └───────────────────────────────────────────────────────┘
              │
              ▼
     update household_members
        set user_id = auth.uid()
      where member_id = <celui de l'invitation>
        and user_id is null      ← CE `where` rend la réclamation non rejouable
              │
              ▼   member_id INCHANGÉ. portions, allergies, objectif: intacts
       consumed_at = now()
```

### Le geste inverse — DÉTACHER (`e2899897`, décision D2)

```
   LE MAÎTRE
       │  keel_household_detach_member(p_member)   (20260811040000:213)
       │
       │  QUATRE REFUS NOMMÉS, ET L'ORDRE EST UNE GARDE:
       │    not_owner            l'appelant ne gouverne pas ce foyer
       │    not_a_member         cible inconnue OU du foyer d'à côté —
       │                         INDISCERNABLES de l'extérieur, sinon la RPC
       │                         devient un moyen de tester un identifiant
       │    cannot_detach_owner  AVANT not_claimed: un maître détaché par une
       │                         purge porte déjà user_id NULL, et « rien à
       │                         détacher » décrirait l'ÉTAT au lieu de la RÈGLE
       │    not_claimed          pas de compte: rien à retirer, et rendre `ok`
       │                         ferait croire à un accès révoqué
       ▼
   update household_members
      set user_id = null, departs_with_account = false
    where member_id = …
       │
       ▼   UNE SEULE COLONNE UTILE ÉCRITE. member_id, prénom, date, objectif,
           portions, allergies: rien ne bouge. LA PERSONNE CONTINUE D'Y MANGER.
       │
       ▼   le profil REDEVIENT RÉCLAMABLE: le maître peut réémettre une
           invitation pour cette bouche.
```

**Ce que ce geste change dans la promesse, et il faut l'écrire** : *réclamer son
profil devient **révocable par le maître**.* C'est le prix assumé du choix « le
maître paie les 2 €/mois » — qui paie l'accès peut le retirer. Voir R11, et la
contre-mesure de §10 qui existe précisément pour dire si ce prix est trop cher.

## 5. Modèle de données

| Champ | Où | Origine | Note |
|---|---|---|---|
| `member_id` | `household_invitations` | **choisi par le maître** | Colonne ajoutée par `20260810200000:97`, backfillée puis `not null` (`:121`), FK vers `household_members` (`:131`). Les invitations orphelines sont **supprimées** (`:118`) — il n'y avait aucun utilisateur réel. |
| `user_id` | `household_members` | **écrit une fois**, par le join | NULL → valeur. Seule colonne modifiée par la réclamation. |
| `consumed_at` | `household_invitations` | posé après l'attachement | |

Aucune ligne n'est créée par la réclamation. C'est l'invariant de la fiche.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | **Réclamer ATTACHE, ça n'insère jamais** | Le `member_id` est le même avant et après. Sinon la personne recommence à zéro le jour où elle gagne un accès. |
| R2 | **La cible vit sur l'invitation, pas sur le join** | Le maître désigne **qui** il invite. L'alternative — choisir la ligne au moment de rejoindre — ferait d'un lien qui fuite le droit de se déclarer n'importe qui du foyer. |
| R3 | **Le prénom n'est JAMAIS écrasé** | Une réclamation qui renommerait « Léa » avec `profiles.full_name` changerait le repas de quelqu'un **en silence** : le prénom est ce que le générateur met dans la consigne de service, et un prénom vide fait **disparaître la part** (F5). Ni `first_name` ni `birth_date` ne sont touchés. |
| R4 | **`and user_id is null` dans l'UPDATE**, et pas seulement un test avant | Entre l'émission du jeton et son usage il peut s'être passé des jours, et deux jetons peuvent viser la même bouche. C'est **ce `where`** qui rend la réclamation non rejouable, pas le test qui le précède. |
| R5 | **L'adresse est vérifiée AVANT l'état du compte** | Défaut réel corrigé : un voleur de jeton qui avait déjà son propre foyer recevait `already_in_household` — un motif qui **ne parle pas du vol**. Le test « jeton volé » ne passait qu'au prix d'une fixture qui sortait l'intrus de son foyer. |
| R6 | **L'aperçu ne consomme pas le jeton, et ne rend que ce que le porteur a déjà** | Trois champs : nom du foyer, prénom de la bouche, adresse invitée. Même patron que `preview_coach_invitation`. Un jeton bidon rend `{valid:false, reason:unknown_token}`. |
| R7 | **`anon` peut exécuter l'aperçu, et rien d'autre** | La personne qui ouvre le lien n'a pas encore de compte. `revoke all … from public` **d'abord**, puis `grant … to anon, authenticated` : accorder sans révoquer laisserait l'`execute` implicite de `public` couvrir tout rôle futur (`:439-441`). |
| R8 | **Ce que la réclamation donne : la lecture du plan, et son objectif — désormais par son « about you »** | ⚠️ **Corrigée le 2026-08-11 (D1).** Elle disait que `keel_household_set_member_goal` était la seule autorité accordée. Ce n'est plus le chemin : cette RPC refuse maintenant `has_account`, et l'objectif d'un titulaire vit dans sa propre ligne `student_goals`. L'autorité accordée est donc la même — il règle son objectif, celui de personne d'autre — mais elle passe par son profil, qui le suit partout, et plus par sa ligne de foyer. Le corollaire à dire à l'écran : **un titulaire qui ne remplit jamais son « about you » n'a aucun objectif**, pas un objectif de repli ; son assiette est celle de qui n'a rien déclaré. Voir [FF-045](FF-045-decrire-son-foyer.md) R9. |
| R9 | **Un compte déjà logé ne produit jamais un 500** | Le filet `when unique_violation` couvre la fenêtre entre le test et l'UPDATE. Un échec opaque ici est indiscernable d'un produit cassé pour quelqu'un qui vient de créer son compte. |
| R10 | **L'écran dit ce qu'il ne donne pas** | « Une seule personne gouverne le menu » est **invisible** si on ne l'écrit pas : quelqu'un qui réclame son profil en croyant pouvoir composer découvrirait la vérité par un bouton absent. Le bloc « ce que ça ne donne pas » n'est pas de la prudence juridique, c'est **la moitié de l'offre**. |
| R11 | **La réclamation est RÉVOCABLE par le maître, et détacher ≠ retirer** | Conséquence directe de D2, et elle doit être **dite** : qui paie l'accès peut le retirer. `keel_household_detach_member` remet `user_id` à NULL et **la ligne reste** ; `keel_household_remove_member` **détruit la bouche**. Deux gestes, deux libellés à l'écran, jamais un seul bouton ambigu — le raccourci coûte les données de quelqu'un qui dîne encore là. Le maître, lui, ne se détache pas lui-même (`cannot_detach_owner`) : un foyer dont le compte maître n'a plus d'accès n'a plus personne pour composer, **par construction**. |
| R12 | **Créer un compte ici EXIGE le pays, et la réclamation exige une SESSION** | Deux gardes à deux moments, parce qu'une seule laisse un contournement. À la **création** : sans pays bien formé, `handle_new_user()` **lève** et annule la transaction de signup (`20260811060000:397`) — vérifié en HTTP réel, `POST /auth/v1/signup` rend 500 et `auth.users` reste à zéro ligne. À la **réclamation** : `country_required` (`:157`), et c'est celle-là qui ferme « je crée un compte par une autre porte, puis je viens réclamer ». La réclamation n'est **pas** faite dans le trigger de signup : l'aperçu `anon` rend l'adresse invitée, donc un voleur de lien s'inscrirait à cette adresse et raflerait la place sans jamais ouvrir la boîte mail. |
| R13 | **Deux arités sont deux fonctions** | `keel_household_join(text)` est **droppée** (`20260811060000:77`), pas laissée à côté de sa remplaçante `(p_token, p_country)` (`:79`). Garder la première laisserait une porte **sans pays** juste à côté de la porte gardée — le trou le plus invisible qui soit. |
| R14 | **Le palier posé à l'arrivée est `household_member`, jamais `student`** | `student` décrit une relation avec un coach qui n'existe pas ici, et ouvre `/app/today` (le mode 1:1, les repas composés par la personne) : un écran vide pour qui ne compose pas. Le lot 6 avait déjà posé `KeelHouseholdRoute` pour cette raison. ⟳ **Depuis le 2026-09-03 (A8.0)**, `/app/chat` et `/app/progress` sont eux aussi sous `KeelHouseholdRoute` : ce qui s'est élargi est la **porte**, pas le rôle — `keel_role` reste NULL, et `routeGuards.int.test.ts` tient les deux moitiés (les deux écrans ouverts au foyer, `/app/today` toujours élève). |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Jeton inconnu, expiré, déjà servi | Motif nommé, liste fermée à l'écran. Un motif inconnu rend une phrase générique plutôt que d'afficher `already_claimed` à quelqu'un. |
| Adresse du compte ≠ adresse de l'invitation | `email_mismatch`, **avant** tout autre motif d'état. |
| La ligne visée a déjà été réclamée | `already_claimed`. |
| Le compte appartient déjà à un foyer | `already_in_household`, et jamais un 500. |
| ~~**La personne n'a pas de compte**~~ | ✅ **TROU n°3 — REFERMÉ (`ac38a53a`, chantier 4, décision D1).** Elle crée son compte depuis cette page, et la porte **EXIGE LE PAYS** : `handle_new_user()` refuse le compte quand l'intention `household_member` arrive sans pays (migration `20260811060000` §2), et `keel_household_join(p_token, p_country)` refuse `country_required` quand le compte appelant n'en a pas. Deux gardes, parce que la première protège la porte et la seconde protège l'**invariant** — personne n'occupe une place dans un foyer sans pays déclaré, quelle que soit la porte empruntée. L'inscription de `/auth` **n'a pas rouvert** ; le rôle posé est `household_member`, jamais `student`. ⚠️ **La réclamation reste interdite sans session** : la faire dans le trigger de signup ferait de l'adresse invitée — que l'aperçu rend publiquement — une clé suffisante pour un voleur de lien. |
| ~~**⚠️ Le maître veut retirer l'accès qu'il paie**~~ | ✅ **TROU n°4 — REFERMÉ (`e2899897`, D2).** `keel_household_detach_member(p_member uuid)` (`20260811040000:213`) remet `user_id` à NULL ; **la ligne reste**, avec ses portions, ses allergies et son `member_id`. Quatre refus nommés, dans un ordre qui est lui-même une garde (§4). Câblé à l'écran (`frontend/src/keel/api/household.ts:403`), et distinct de « retirer du foyer » (`keel_household_remove_member`, `20260810120000:510,551`) qui, lui, **détruit la bouche**. Conséquence à assumer : la réclamation devient révocable (R11). |
| ~~**⚠️ La personne exerce son droit RGPD**~~ | ✅ **TROU n°5 — REFERMÉ (`e2899897`, D3), et ce n'était pas le pire.** La FK passe en `ON DELETE SET NULL` (`20260811040000:120-124`) : supprimer son compte **détache**, la bouche survit — sauf geste **explicite** `departs_with_account` (`:187`), une **intention** cochée à T0 et honorée à J+7, qu'`account-restore-v1` efface. Retirer la ligne au clic aurait mis un effet **irréversible** au milieu d'un geste réversible. **Le défaut trouvé en sondant est plus grave que celui qu'on cherchait** : voir le pavé ci-dessous. |
| **⚠️ Le verrou pré-lancement et `/start`** | **TROU CONNU n°9, NON REFERMÉ.** Cette porte-ci **lit** le verrou (`keel/api/householdSignup.ts:161`, `JoinHouseholdPage.tsx:448`) — une surface de création de compte qui l'ignore est un trou **invisible**, puisque personne ne rejoue la porte verrou armé. `/start` (`frontend/src/App.tsx:329` → `StartPage.tsx`) ne porte **aucune** occurrence de `prelaunch`. Asymétrie relevée pendant le chantier 4, non corrigée : c'est une autre porte. |
| **⚠️ `enable_confirmations = false`** | La garde « la réclamation exige une session » (R12) vaut ce que vaut la confirmation d'e-mail, à `false` dans `config.toml`. En prod, cela rendrait le **vol de lien** exploitable. C'est un **geste humain** côté Dashboard Auth, pas du code — et `emailRedirectTo` pointe sur `/join-household?token=…`, qui n'est peut-être pas dans `additional_redirect_urls` en prod. |

### Le défaut trouvé en sondant, et il est plus grave que celui qu'on cherchait

On cherchait la cascade qui efface une bouche. La sonde, jouée en transaction
annulée avant d'écrire la migration et recopiée en tête de celle-ci
(`20260811040000:10-15`), a rendu autre chose :

```
PROBE A: purge du maître ÉCHOUE → 23503 violates households_created_by_fkey
```

**Le droit à l'effacement était INAPPLICABLE pour tout maître de foyer.**
Quatre colonnes `created_by`/`invited_by` étaient en `NO ACTION` **et**
`NOT NULL` — `households.created_by`
(`20260808000000_household_foundation.sql:58`),
`household_invitations.invited_by` (`:115`),
`household_food_restrictions.created_by` (`:141`),
`household_member_allergies.created_by`
(`20260810170000_household_member_allergies.sql:114`). `purge-deleted-accounts`
levait, journalisait, et **rejouait le même échec chaque jour**, depuis la
fondation. Ce n'était pas une donnée mal supprimée : c'était une **suppression
impossible**, en silence.

Les cinq FK sont reposées en `SET NULL` (`20260811040000:120-156`) ;
`household_envy_submissions` reste en `CASCADE`, seule dont la clé était déjà
juste — une envie est une **phrase écrite par une personne pour une semaine**,
pas un fait du foyer sur une bouche. `purge-deleted-accounts` appelle
`keel_household_purge_user` (`20260811040000:356`) **avant** `purge_auth_user`
(`purge-deleted-accounts/index.ts:285`) et **n'avale pas** son erreur (`:288`) :
sur une pile sans la migration, la FK vaut encore `CASCADE` et la purge lèvera
bruyamment. C'est voulu — avaler rendrait une purge « réussie » qui a détruit la
bouche en silence.

**Un piège créé puis fermé dans le même lot.** `created_by` devenu nullable
rendait `restrictionNotice` **menteur** : `members.find(m => m.userId === null)`
attribue la règle à la première bouche sans compte, c'est-à-dire **à l'enfant
qu'elle restreint**. Corrigé, deux tests, mutation vérifiée.

## 8. Critères d'acceptation

```gherkin
Étant donné une bouche sans compte portant un objectif, une règle de maison et une allergie
Quand elle réclame son profil par la vraie RPC
Alors son member_id est inchangé
Et son objectif, sa règle de maison et son allergie sont inchangés
Et seule la colonne user_id a bougé
```

```gherkin
Étant donné un jeton volé, entre les mains d'un compte qui a déjà son propre foyer
Quand ce compte tente de rejoindre
Alors le motif rendu est email_mismatch
Et non pas already_in_household
```

```gherkin
Étant donné un profil déjà réclamé
Quand le même jeton est rejoué
Alors le motif rendu est already_claimed
Et aucune ligne n'est modifiée
```

```gherkin
Étant donné un profil réclamé
Quand il tente de composer, d'ajouter, de retirer ou de restreindre
Alors les quatre gestes sont refusés
```

```gherkin
Étant donné un profil réclamé
Quand le maître appelle keel_household_detach_member sur cette bouche
Alors user_id repasse à NULL
Et sa portion, ses allergies et son historique sont INCHANGÉS
Et son member_id ne change pas
Et le profil redevient réclamable
```

```gherkin
Étant donné le maître d'un foyer qui supprime son compte
Quand purge-deleted-accounts s'exécute
Alors la purge ABOUTIT
Et le foyer survit
Et households.created_by est NULL
```

```gherkin
Étant donné une suppression de compte SANS la case « retirer ma place »
Quand la purge s'exécute
Alors la ligne du foyer se détache et ne perd rien
Et avec la case, la ligne part
```

```gherkin
Étant donné un signup par /join-household SANS pays
Quand POST /auth/v1/signup est appelé
Alors la réponse est 500
Et auth.users reste à ZÉRO ligne
```

## 9. Rabbit holes

- **La fixture qui ment.** Les assertions « bouche d'un AUTRE foyer » lisaient
  le `member_id` du voisin sous le JWT du maître, à qui RLS ne rend rien. Le
  sous-select rendait `NULL`, et le test prouvait qu'un `NULL` est refusé — pas
  qu'un identifiant étranger l'est. Corrigé au passage.
- **Le test avant l'UPDATE au lieu du `where` dans l'UPDATE.** Il paraît
  suffisant et laisse une fenêtre de rejeu.
- **Inspecter le catalogue pour se rassurer.** Prouver que la colonne existe ne
  prouve pas qu'une bouche garde ses affaires. Le bloc de contrôle final de la
  migration monte un foyer, y met une bouche sans compte avec objectif, règle de
  maison et allergie, la réclame par la vraie RPC, et vérifie que rien n'a bougé
  sauf `user_id`.
- **Confondre « retirer l'accès » et « retirer la personne ».** C'était le trou
  n°4 ; le raccourci coûte les données de quelqu'un qui dîne encore là. Refermé
  par deux gestes et deux libellés (R11), pas par un bouton qu'on renomme.
- **Un `select` d'embed qui devient ambigu sans que rien ne le dise.**
  `select("role, households(name)")` s'est mis à rendre `PGRST201 ambiguous
  embedding` le jour où `households.reference_member_id` est apparu (chantier
  1) — deux chemins de jointure, PostgREST refuse de choisir. Comme la fonction
  retombait sur « pas de foyer » en cas d'erreur, la case ne se serait
  **jamais** affichée : un repli qui avale l'erreur transforme une régression
  de schéma en fonctionnalité muette. Corrigé en **nommant** la clé, vérifié
  contre PostgREST avec des données réelles (`e2899897`).
- **Poser un effet irréversible au milieu d'un geste réversible.** Retirer la
  ligne au moment du clic « retirer aussi ma place » ferait revenir celui qui
  annule à un compte **sans foyer**, sans que rien ne le lui dise. L'intention
  est cochée à T0, honorée à J+7, et effacée par `account-restore-v1`.

## 10. Ce qu'on mesure

- **La mesure :** part des invitations envoyées qui aboutissent à un `user_id`
  posé. Elle avait un mur connu — le trou n°3, pas de création de compte
  possible — refermé depuis `ac38a53a` : c'est **maintenant** que le chiffre
  devient interprétable.
- **La contre-mesure :** part des profils réclamés qui sont **détachés** dans
  les 30 jours. Elle n'était pas mesurable avant D2, puisque le geste n'existait
  pas ; elle l'est désormais. Si le détachement devient courant, ce n'est pas la
  facturation qui est à revoir, c'est le modèle : réclamer son profil serait
  devenu une **faveur du maître** (R11) et non un droit de la personne.

## 11. Questions ouvertes

1. ✅ **« Retirer l'accès » (n°4) et la cascade RGPD (n°5) — TRANCHÉES
   ensemble (`e2899897`).** C'était bien la même question posée deux fois :
   *que devient une bouche quand le compte qui lui est attaché s'en va ?*
   Réponse : **la ligne survit à son compte**, ce que FF-044 R1 affirmait déjà
   pour tous les autres cas.
2. ✅ **Créer un compte depuis la page de réclamation (n°3) — TRANCHÉ
   (`ac38a53a`).** La porte existe, et elle **exige le pays** (R12).
3. **⚠️ LE FOYER ORPHELIN — décision produit NON TRANCHÉE.** Quand le maître
   supprime son compte, sa ligne se détache et `created_by` passe à NULL : le
   foyer survit avec ses bouches et **personne ne le gouverne**. Il n'existe ni
   suppression de foyer ni transfert de propriété, et `cannot_remove_owner`
   comme `cannot_detach_owner` interdisent de retirer la ligne du maître. Le
   comportement le plus **étroit** a été implémenté (la case de départ est
   refusée au maître) et le cas est nommé dans la migration
   (`20260811040000:60-68`) — nommé, pas résolu.
4. **⚠️ Les six tables du foyer sont hors de l'export RGPD (trou n°10)** — sept
   avec `household_billing_periods`, qui n'a pas de `user_id`.
   `grep -ci household supabase/functions/account-export-v1/index.ts` rend
   **0**, à `HEAD` comme sur le disque, et `_shared/account_lifecycle.ts` ne les
   nomme pas non plus. La **purge** les réclame depuis le chantier 2 ;
   l'**archive**, non. Le fichier appartenait à une autre session au moment du
   lot ; le trou est nommé en tête de `20260811040000:98-103`, à fermer dans un
   lot qui possède ce fichier.
   ⚠️ Et elles ne sont **pas** ajoutées à `PIVOT_TABLES` : son contrat affirme
   « 0 ligne après purge », ce qui est désormais **délibérément faux** pour
   `household_members`. L'y mettre aurait rendu le lot rouge — ou pire, aurait
   forcé à rendre la ligne effaçable pour faire passer le test. La réclamation
   vit dans `household_rls_test.sql` (46t-46bb).
5. **⚠️ Les invitations expirées ne sont jamais purgées (trou n°11)**, et elles
   portent une **adresse e-mail de tiers**. Aucun chemin ne supprime
   `household_invitations` sur `expires_at` : le seul `delete` du dépôt est le
   nettoyage **ponctuel** des orphelines (`20260810200000:118`). Question de
   **rétention**, nommée en tête de `20260811040000:92-94`.
6. **La qualification juridique de la ligne « bouche »** comme donnée du
   **foyer** plutôt que dossier de la **personne** reste à faire confirmer. Ce
   que ces documents décrivent est l'ingénierie d'une décision produit, pas un
   avis juridique.
7. **Le chat et les mesures corporelles ne sont pas donnés par la réclamation.**
   Ce qui rend la réclamation réelle aujourd'hui est
   [FF-047](FF-047-le-corps-dans-la-part-du-foyer.md) — et lui seul.
8. **Aucun run réel avec appel Gemini, aucune vérification navigateur.** Le
   chantier 4 a eu un run **HTTP et base** (signup sans pays → 500 et zéro
   compte ; avec pays → `country=FR, access_tier=household_member` ; les quatre
   refus rejoués), jamais un run de modèle ni un écran ouvert.
