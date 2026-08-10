# FF-048 · Réclamer son profil

| | |
|---|---|
| **Identifiant** | `FF-048-reclamer-son-profil` |
| **Statut** | 🟢 Livrée — commit `193e228a` (2026-08-10). ⚠️ Trois trous nommés en §7 et §11 |
| **Date** | 2026-08-10 |
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
- ❌ **Le chat, et les mesures corporelles, dans cette version.** Ils viendront
  quand quelqu'un les demandera.
- ❌ **Choisir sa ligne au moment de rejoindre.** Ça ferait d'un lien qui fuite
  le droit de se **déclarer n'importe qui** du foyer (R2).
- ❌ **Écraser le prénom avec `profiles.full_name`.** Voir R3.
- ❌ **Créer un compte depuis cet écran.** Trou n°3, décision commerciale, pas
  décision d'écran (§7).
- ❌ **Aucune anticipation des refus côté écran.** La garde de jeton vit en
  base ; la page affiche l'aperçu et laisse la base trancher.

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
| R8 | **Ce que la réclamation donne : la lecture du plan, et SON objectif** | `keel_household_set_member_goal` rendait déjà `not_your_line` aux autres. C'est la **seule** autorité qu'elle accorde. |
| R9 | **Un compte déjà logé ne produit jamais un 500** | Le filet `when unique_violation` couvre la fenêtre entre le test et l'UPDATE. Un échec opaque ici est indiscernable d'un produit cassé pour quelqu'un qui vient de créer son compte. |
| R10 | **L'écran dit ce qu'il ne donne pas** | « Une seule personne gouverne le menu » est **invisible** si on ne l'écrit pas : quelqu'un qui réclame son profil en croyant pouvoir composer découvrirait la vérité par un bouton absent. Le bloc « ce que ça ne donne pas » n'est pas de la prudence juridique, c'est **la moitié de l'offre**. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Jeton inconnu, expiré, déjà servi | Motif nommé, liste fermée à l'écran. Un motif inconnu rend une phrase générique plutôt que d'afficher `already_claimed` à quelqu'un. |
| Adresse du compte ≠ adresse de l'invitation | `email_mismatch`, **avant** tout autre motif d'état. |
| La ligne visée a déjà été réclamée | `already_claimed`. |
| Le compte appartient déjà à un foyer | `already_in_household`, et jamais un 500. |
| **⚠️ La personne n'a pas de compte** | **TROU CONNU n°3.** Elle ne peut pas en créer un depuis ici : l'inscription de `/auth` est fermée hors `?role=coach` (`frontend/src/pages/Auth.tsx:59`) et `/start` attache au **coach maison** — une relation de coaching, pas une place à table. La page le **DIT**, au lieu de mener à un formulaire qui échoue (`JoinHouseholdPage.tsx:42-49`). **C'est le seul endroit où le fil s'arrête.** Ouvrir une porte d'inscription ici est une décision commerciale. |
| **⚠️ Le maître veut retirer l'accès qu'il paie** | **TROU CONNU n°4.** Ce geste n'existe pas. Le seul retrait disponible, `keel_household_remove_member` (`20260810120000:510`), fait `delete from household_members` (`:551`) : il **détruit la bouche** — ses portions, ses allergies, sa place au menu — alors que la personne continue de manger là. Le détachement (`user_id` remis à NULL, la ligne reste) est un **changement de promesse produit**, pas une ligne de SQL. |
| **⚠️ La personne exerce son droit RGPD** | **TROU CONNU n°5.** `household_members.user_id references auth.users(id) **on delete cascade**` (`20260808000000_household_foundation.sql:78`, jamais reposée depuis — `20260810120000:140-141` n'a retiré que le `not null`). Supprimer son compte **supprime sa bouche**. Le foyer maigrit sans que personne l'ait décidé. Même famille de question que le point précédent. |

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
- **Confondre « retirer l'accès » et « retirer la personne ».** C'est le trou
  n°4, et le raccourci coûte les données de quelqu'un qui dîne encore là.

## 10. Ce qu'on mesure

- **La mesure :** part des invitations envoyées qui aboutissent à un `user_id`
  posé. Un écart durable entre les deux chiffres dit que le trou n°3 (pas de
  création de compte possible) est le mur, et pas une hypothèse.
- **La contre-mesure :** part des profils réclamés qui sont **retirés** dans les
  30 jours. Si le retrait d'un profil réclamé devient un geste courant, ce n'est
  pas la facturation qui est à revoir, c'est le modèle : réclamer son profil
  serait devenu une **faveur du maître** et non un droit de la personne.

## 11. Questions ouvertes

1. **« Retirer l'accès » (trou n°4)** et **la cascade RGPD (trou n°5)** sont la
   même question posée deux fois : *que devient une bouche quand le compte qui
   lui est attaché s'en va ?* Y répondre demande de trancher si la ligne survit
   à son compte — ce qui est exactement ce que FF-044 R1 affirme pour tous les
   autres cas.
2. **Créer un compte depuis la page de réclamation (trou n°3).** Décision
   commerciale. Tant qu'elle n'est pas prise, la réclamation ne fonctionne que
   pour qui a **déjà** un compte.
3. **Le chat et les mesures corporelles ne sont pas donnés par la réclamation.**
   Ce qui rend la réclamation réelle aujourd'hui est
   [FF-047](FF-047-le-corps-dans-la-part-du-foyer.md) — et lui seul.
