# Chantier foyer — la suite

> Ce qui reste après les neuf commits du chantier `CHANTIER-FOYER-PROFILS.md`.
> Quatre décisions produit prises le 2026-08-11, plus la seconde moitié du lot 7.

| | |
|---|---|
| **Date** | 2026-08-11 |
| **Branche** | `ff-001-quotidien-du-coach` |
| **Point de départ** | `8064f94d` |
| **Autorités** | [CHANTIER-FOYER-PROFILS.md](CHANTIER-FOYER-PROFILS.md) · [MODEL.md](MODEL.md) · [CONTRACT.md](CONTRACT.md) · [le-foyer/README.md](../fonctionnalites/le-foyer/README.md) |

---

## Les quatre décisions, arrêtées

Elles ne se re-litigent pas.

**D1 — Une troisième porte d'inscription.** « Je rejoins un foyer » devient un
chemin de création de compte, **sans rouvrir** celle qui a été fermée pour
raison de sécurité (l'inscription élève a été retirée parce qu'un compte sans
pays route vers la mauvaise hotline de crise — `Auth.tsx:55-61`).

**D2 — Le détachement existe.** Retirer l'accès de quelqu'un remet son `user_id`
à `NULL` ; **la ligne reste**, la personne continue de manger là. Conséquence
assumée et à écrire : réclamer son profil devient révocable par le maître. C'est
le prix du choix « le maître paie ».

**D3 — Supprimer son compte détache, ça n'efface pas la bouche.**
`household_members_user_id_fkey` passe de `ON DELETE CASCADE` à
`ON DELETE SET NULL`. Motif : la ligne « bouche » n'est pas le dossier de la
personne, c'est ce que le maître a saisi pour cuisiner — et c'est le cas nominal
du produit (un enfant de huit ans est une bouche sans compte).
**En contrepartie**, la suppression de compte porte un geste explicite :
« retirer aussi ma place dans ce foyer ? ». Aucune rétention, aucun délai.

⚠️ La qualification juridique de la ligne « bouche » comme donnée du foyer
plutôt que dossier de la personne **reste à faire confirmer**. Ce document
décrit l'ingénierie, pas l'avis juridique.

**D4 — Un foyer impayé est GELÉ, jamais effacé.** Plus de génération, plus de
recommandation quotidienne ; le plan courant reste lisible, les données dorment.
Le graphe du foyer *est* la douve : l'effacer à l'impayé détruirait la seule
chose qui fait revenir. L'effacement réel reste au lifecycle RGPD, sur son
propre calendrier.

**D4bis — Les foyers créés avant Stripe passent en essai daté**, 30 jours **à
compter du branchement**, pas de leur création. Ni grandfather (il crée une
classe d'utilisateurs dont le retour est biaisé pour toujours, et ce sont les
plus engagés), ni coupe (elle détruit ce que D4 vient de protéger). Pendant
l'essai, **les profils réclamés sont gratuits aussi** — un seul abonnement, un
seul état.

⚠️ **Réserve.** Si des foyers ont été créés par des pilotes recrutés
personnellement, ce n'est plus la même question : c'est une promesse faite à des
personnes, elle se règle à la main sur une liste nommée, hors règle produit.

---

## Chantier 0 — Débloquer le fichier partagé

**Prérequis, et il ferme un trou de sécurité.**

`generate-household-meal-v1/index.ts` porte trois travaux non commités : le
câblage des allergies (lot 4), la ligne d'envies (lot 5), et le chantier
FF-043 d'une autre session. Il importe quatre modules non suivis
(`food_composition`, `food_composition_io`, `household_composition`,
`meal_envelope`).

**Conséquence mesurée** : à `HEAD`, `household_safety.ts` **n'a aucun
importeur**. L'écran écrit l'allergie d'un enfant sans compte, et personne ne la
lit à la génération.

**Le geste.** Deux commits, comme pour FF-037 : le chantier voisin d'abord
(ses modules, ses migrations, ses tests — sans le fichier partagé), puis le
fichier partagé avec le lot 5. Chaque commit compile.

**Preuve d'acceptation.**
- `node scripts/ci/wiring-check.mjs` ne signale plus `household_safety.ts` ;
- `git grep -c "loadHouseholdAllergies\|envyLine" HEAD -- supabase/functions/generate-household-meal-v1/index.ts` rend deux compteurs non nuls ;
- suite deno et vitest aux baselines, hors les rouges connus.

**Condition.** Le fichier doit être **stable** (aucune écriture depuis ≥ 30 min)
au moment du commit. Vérifier par `stat`, pas par supposition.

---

## Chantier 1 — Finir le lot 7 (la facturation)

Le compte facturable est déjà défini en base
(`keel_household_billable_profiles`, `20260810260000`). Il n'a **aucun
appelant**, et c'est voulu : le job qui l'appellera n'existait pas.

### 1.1 Le palier — **une décision à confirmer avant de coder**

Le vocabulaire vit à **quatre endroits qui bougent ensemble** :

| Site | Ce qu'il porte aujourd'hui |
|---|---|
| `profiles_access_tier_check` (SQL) | les paliers autorisés sur un profil |
| `subscriptions_tier_check` (SQL) | `coach` + trois paliers grand public morts |
| `_shared/billing-tier.ts:14-17` | `PaidTier`, `KeelTier = coach\|student`, `SellableTier`, `EffectiveTier` |
| `frontend/src/lib/entitlements.ts:13-17` | les mêmes + `AccessTierValue` qui porte déjà `"trial"` |

**Recommandation : deux jetons, pas un.**
`household` pour le compte maître, `household_member` pour un profil réclamé.

Motif : dériver l'accès d'un profil réclamé de l'état du foyer plutôt que d'un
jeton propre obligerait `getEffectiveTierForUser` à interroger le foyer — une
seconde source de vérité sur l'accès, et c'est exactement la classe de défaut
que ce dépôt collectionne. Deux jetons explicites se lisent, se testent et se
grep.

### 1.2 Ce qui se construit **sans** Stripe

- **`households.free_until date`** — l'essai de D4bis, **posé sur la ligne**,
  jamais déduit de `created_at`. Une règle qu'on recalcule à la volée devient
  irreproductible en six mois ; ce dépôt en a l'histoire.
- **`household_billing_periods`** — sur le patron de `coach_billing_periods` :
  `active_profile_count` (ce qu'on a calculé) et `pushed_quantity` (ce que
  Stripe a accepté) **jamais fusionnées**, pour que l'écart soit lisible.
- **`stripe-reconcile-households`** — sur le patron exact de
  `stripe-reconcile-seats` : recompute et n'incrémente jamais, écrit en base
  **avant** l'appel Stripe, `proration_behavior=none`, clé d'idempotence, et
  **échoue bruyamment** si le prix n'est pas configuré.
- **Le tunnel** `plan='keel_household'` dans `stripe-create-checkout-session` :
  deux articles, forfait quantité 1 + profils réclamés quantité N.

Tout ça se code, se teste et **échoue proprement** sans les prix — c'est le
comportement de `stripe-reconcile-seats` aujourd'hui, il ne s'invente pas.

### 1.3 Les gestes humains, dans l'ordre

Aucun n'est faisable par un agent (hook de blocage).

1. Créer deux prix Stripe récurrents mensuels : **12,99 € foyer** (quantité 1) et
   **2,00 € profil réclamé** (quantité réconciliée).
2. `supabase secrets set STRIPE_PRICE_ID_HOUSEHOLD_MONTHLY=price_… STRIPE_PRICE_ID_HOUSEHOLD_PROFILE_MONTHLY=price_…`
3. `supabase db push`
4. `supabase functions deploy stripe-create-checkout-session stripe-reconcile-households`
5. Poser `free_until` sur les foyers existants, **le jour du branchement**.

### Preuve d'acceptation

- Le compte facturable et le plafond de 8 restent **deux choses différentes** —
  l'assertion existante le prouve déjà côte à côte (foyer plein à 8, 4 profils
  facturables).
- `stripe-reconcile-households` refuse de tourner sans prix, et le dit.
- Un foyer en essai n'est **pas** facturé, profils réclamés compris.

---

## Chantier 2 — Le détachement (D2 + D3)

Les deux décisions se livrent ensemble : elles partagent le même mécanisme.

### Le travail

- **`alter table household_members drop constraint household_members_user_id_fkey`**
  puis la reposer en `on delete set null`. ⚠️ Vérifié : la contrainte est
  aujourd'hui `ON DELETE CASCADE`, héritage d'avant le lot 1 — le lot 1 a rendu
  `user_id` nullable mais **n'a jamais reposé la FK**.
- **`keel_household_detach_member(p_member uuid)`** — compte maître seul, remet
  `user_id` à `NULL`. Refus nommés : `not_owner`, `not_a_member`,
  `not_claimed` (rien à détacher), `cannot_detach_owner`.
- **Le geste à la suppression de compte.** `account-deletion-v1` : une case
  « retirer aussi ma place dans ce foyer ». Cochée ⇒ la ligne part. Non cochée
  ⇒ elle se détache et survit.
  ⚠️ Vérifié : `_shared/account_lifecycle.ts` **ne mentionne pas le foyer** —
  aucune des six tables du foyer n'est réclamée par le lifecycle RGPD. Ce
  chantier est l'occasion de les y faire entrer, ou de dire pourquoi non.
- **L'écran** : le maître voit « retirer l'accès » (détache) distinct de
  « retirer du foyer » (supprime). Deux gestes, deux libellés, jamais un seul
  bouton ambigu.

### Preuve d'acceptation

1. Une personne détachée **garde** sa portion, ses allergies et son historique ;
   son `member_id` ne change pas.
2. Une suppression de compte **sans** la case cochée détache et ne détruit rien.
3. Avec la case, tout part.
4. Un profil détaché **redevient réclamable** (le lien d'invitation refonctionne).
5. `household_rls_test.sql` passe, assertions neuves comprises.

---

## Chantier 3 — Le gel à l'impayé (D4)

### Le travail

- **Un état lisible** : le foyer est gelé quand ni l'abonnement ni `free_until`
  ne le couvrent. Une fonction SQL, `service_role`, **une seule définition**.
- **Les portes qui se ferment** : `generate-household-meal-v1` (refus nommé,
  pas un 500), et le cron `keel-daily-recommendation` (vérifié : il tourne à
  `5 * * * *`) qui saute les foyers gelés.
- **Ce qui reste ouvert** : la lecture du plan courant, le chat, l'écran du
  foyer. On gèle la **production**, pas la consultation.
- **Un écran qui le dit** : « ton foyer est en pause », avec le geste pour
  reprendre. Un refus muet se lit comme une panne.

### Preuve d'acceptation

Un foyer gelé : la génération refuse avec un motif nommé, le cron le saute, le
plan de la semaine reste lisible, **et aucune donnée n'a bougé**.

---

## Chantier 4 — La porte d'inscription foyer (D1)

**C'est le chantier le plus sensible des cinq**, et il touche une garde de
sécurité.

### Ce qu'il faut savoir avant d'y toucher

L'inscription élève a été retirée de `/auth` parce qu'un compte **sans pays**
route vers la mauvaise hotline de crise — un défaut réel, fermé par
`20260804180000`. Rouvrir une porte sans résoudre le pays **rouvrirait ce
défaut**.

`JoinHouseholdPage.tsx:42-49` porte déjà le trou nommé à l'écran : la page dit
qu'on ne peut pas créer de compte ici, au lieu de mener à un formulaire qui
échoue.

### Le travail

- Une porte `/join-household` qui crée un compte **en exigeant le pays**, comme
  la porte coach.
- Le rôle et le palier à l'arrivée : `household_member` (chantier 1.1), pas
  `student` — `student` ouvre `/app/today`, `/app/chat` et `/app/progress`,
  trois écrans vides pour qui n'a ni coach ni plan. Le lot 6 a déjà posé
  `KeelHouseholdRoute` pour cette raison.
- Le verrou pré-lancement : décider s'il s'applique à cette porte.

### Preuve d'acceptation

Un compte créé par cette porte a un pays, atterrit sur son foyer, et **ne peut
pas** composer, ajouter, retirer ni restreindre. Les quatre refus sont déjà
prouvés par le lot 6 — ils doivent le rester.

---

## Chantier 5 — Le trou du chat

Distinct du chantier 0, et il survivra à son déblocage.

`sophia-brain/router/run.ts:1329` charge `loadStudentSafetyConstraints` du
**seul locuteur**. Le foyer a désormais ses propres allergies
(`household_member_allergies`, lot 4), lues par `household_safety.ts` — mais
uniquement par le générateur.

**Conséquence** : un parent qui demande « je cuisine quoi ce soir ? » n'a pas
l'allergie de son enfant armée dans la conversation.

**Le travail** : l'union des contraintes du foyer entre dans le contexte du
tour, avec le même fail-closed que le générateur. Attention au périmètre : ça
touche `run.ts`, qui est le chemin de TOUTES les conversations — pas seulement
celles d'un foyer.

---

## L'ordre, et pourquoi

```
Chantier 0    débloquer            ← ferme un trou de sécurité, 2 commits
Chantier 1    finir le lot 7       ← demandé en premier; 1.1 à confirmer avant de coder
Chantier 2    le détachement       ← D2 + D3 ensemble, même mécanisme
Chantier 3    le gel               ← dépend de 1.2 (`free_until`) et de 2 (l'état)
Chantier 4    la porte             ← le plus sensible; touche une garde de crise
Chantier 5    le chat              ← indépendant, peut se glisser où on veut
```

Le chantier 3 **dépend** du 1 : geler suppose de savoir qui paie. Le 4 est
volontairement en avant-dernier — il touche la garde qui route les appels de
crise, et il ne doit pas être fait dans la foulée d'autre chose.

---

## Ce qui reste hors de tout ça

- **Les runs réels** (appel Gemini, vérification navigateur) — décidés après.
  Aucun lot du chantier précédent n'en a eu.
- **L'écho numérique nu** (« pour tes 84 kg ») qu'aucune ceinture ne mord :
  décision produit, seconde ceinture regex ou faux positifs des unités nues.
- **`FF-040` attribué deux fois** et **`FF-043` avec trois liens morts** :
  ménage d'une autre session.

---

## Les règles opérationnelles (inchangées)

1. **Jamais seul** : `supabase db push`, `db reset`, `functions deploy`,
   `secrets set/unset`, `link`.
2. En local, `migration up` est permis. **Relancer `uniq -d` juste avant**, pas
   seulement à la création : trois collisions de version ont eu lieu le
   2026-08-10, toutes vues à l'application.
3. Tests Deno avec l'environnement purgé :
   `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY deno test --allow-read --allow-env --no-check <cibles>`
4. Typecheck frontend : `cd frontend && npx tsc -b`.
5. Code edge modifié → `docker restart supabase_edge_runtime_Sophia_2`.
6. `node scripts/ci/wiring-check.mjs` est le juge de « le fil est rebranché ».
7. Branche `ff-001-quotidien-du-coach`, aucune autre, aucun push.
8. **Deux rouges préexistent** et ne sont à personne ici :
   `_shared/chat/recent_history_test.ts` (2) et
   `frontend/src/edge/coverage-guard.int.test.ts` (2, FF-028).
