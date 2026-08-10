# le-foyer

Plusieurs personnes, **une** cuisson. Appartenance, identité d'une bouche,
invitation, allergies et règles domestiques, portions qui bifurquent, prix.

`household*.ts` · `generate-household-meal-v1` · `HouseholdPage` ·
`JoinHouseholdPage` · autorités : [PIVOT-FOYER.md](../../keel/PIVOT-FOYER.md)
(⚠️ ses §7, §7.5, §8.1–§8.3 et son modèle d'invitation sont **périmés**) ·
[CHANTIER-FOYER-PROFILS.md](../../keel/CHANTIER-FOYER-PROFILS.md) (l'état réel,
lot par lot)

---

## La direction — arrêtée le 2026-08-10

> ### Une personne gouverne le menu. Une bouche n'a pas besoin d'un compte.
>
> Les deux moitiés se tiennent. Sans la première, le produit devient un arbitre
> public entre un parent et son enfant. Sans la seconde, il ne peut pas
> composer pour un enfant de huit ans — c'est-à-dire pour le cas nominal.

C'est la règle mère de ce domaine. Tout ce dossier en découle, et chaque fiche y
renvoie.

### Ce que le foyer est, et ce qu'il n'est pas

Le foyer **n'est pas un espace partagé**. C'est **une personne qui cuisine pour
plusieurs**, et un produit qui sait enfin qui sont ces plusieurs. La personne
qui tient la maison compose, achète, cuisine ; les autres sont des **bouches** —
elles ont un prénom, un âge, un objectif, des allergies et une part, et rien de
tout ça n'exige qu'elles ouvrent un compte.

Réclamer son profil (FF-048) n'est donc **pas** une entrée dans le produit :
c'est l'attachement d'un compte à une ligne qui existe déjà. Ça donne la lecture
du plan, son propre objectif, et une part qui tient compte de son corps. Ça ne
donne **jamais** le droit de composer, d'ajouter, de retirer ou de restreindre.

**Ce que ça coûte de se tromper.** Un produit qui exige un compte par bouche
demande à un parent d'inscrire ses enfants avant de pouvoir dîner : il ne
franchit jamais la première semaine. Un produit qui donne à chaque bouche le
droit de peser sur le menu met Sophia en arbitre d'un conflit familial — et le
premier arbitrage rendu contre un parent est le dernier repas composé.

### Le circuit d'ensemble

```
   LE COMPTE MAÎTRE                                  UNE BOUCHE
   (une seule personne)                              (compte optionnel)
          │                                                 │
          │ décrit son foyer  (FF-045)                      │
          ├────────────────────────────────────────────────►│
          │  prénom · date de naissance · objectif           member_id
          │  allergies (FF-046) · règles de maison           = son identité,
          │                                                  de bout en bout
          │ écrit l'envie de la semaine  (FF-050)           │
          │                                                 │
          │ invite, si elle veut donner un accès  (FF-048)  │
          ├────────────────────────────────────────────────►│
          │                                    user_id posé sur LA MÊME ligne
          │                                                 │
          ▼                                                 ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  generate-household-meal-v1 — UNE cuisson                     │
  │                                                               │
  │  ENTRÉE           allergies du foyer (union, fail-CLOSED)     │
  │                   règles de maison (verrou qui tait le motif) │
  │                   objectif + état d'âge par bouche  (FF-044)  │
  │                   corps, pour les bouches AVEC compte (FF-047)│
  │                                                               │
  │  SORTIE           un plat pour tout le monde                  │
  │                 + une consigne de SERVICE par personne,       │
  │                   passée par `sanitizePortionNote`            │
  └───────────────────────────┬──────────────────────────────────┘
                              ▼
                   lue À TABLE, à voix haute
```

**Le point qui gouverne le dessin** : *l'entrée gagne des faits, la sortie n'en
gagne aucun.* Tout ce qu'on ajoute au générateur augmente ce qu'il sait ; rien
n'augmente ce qu'il a le droit de dire.

### Les crans d'intake — la frontière est le CORPS, pas le compte

| Cran | Contenu | Compte requis |
|---|---|---|
| **0 — la bouche** | prénom, date de naissance, allergie | **non** |
| **1 — la direction** | un jeton d'objectif parmi six | **non** |
| **2 — le corps** | taille, sexe, date exacte, **série de poids** | **oui** |

Le compte garde le cran 2 pour une raison **technique**, pas commerciale :
`restriction_guard` — le plancher TCA — a besoin d'une **série** de poids pour
décider si l'on peut parler du corps de quelqu'un
(`_shared/keel/restriction_runtime.ts`, appelé par
`_shared/keel/household_bodies.ts:111`). Une bouche sans compte n'a pas de
série. Un corps sans série est une donnée qu'on **ne sait pas protéger** — et le
produit ne collecte pas ce qu'il ne sait pas protéger.

C'est la raison pour laquelle il n'y a pas de « juste ajouter le poids » dans le
formulaire d'ajout. Ce serait un cran 2 sans son plancher.

### Les règles transverses

| # | Règle | Pourquoi |
|---|---|---|
| **F1** | **Une seule personne gouverne le menu** | c'est ce qui évite l'arbitrage entre un parent et son enfant. Aucun canal 1:1, aucune négociation, aucun vote |
| **F2** | **Une bouche n'a pas besoin d'un compte** | l'enfant de huit ans est le cas nominal. Une garde qui exige `user_id` est une garde qui exclut exactement les gens du produit |
| **F3** | `member_id` **est la clé**, `user_id` une propriété | une bouche = UNE ligne, de sa création à sa réclamation. Ses portions, ses contraintes et son historique lui restent attachés |
| **F4** | **Aucun repli d'une clé sur l'autre** | un lecteur qui accepte les deux fait du repli le chemin nominal le jour où l'un des deux cesse d'émettre la bonne. Ce dépôt l'a déjà payé |
| **F5** | **Le prénom vient de la ligne, pour tout le monde** | `household_turn_context.ts` filtre en silence toute portion au prénom vide : un prénom absent **fait disparaître la part**, sans erreur. Une source unique supprime la branche qui produit ce vide |
| **F6** | **L'âge a trois états** — mineur, majeur, **inconnu** — et `unknown` n'applique aucune direction | `coalesce(…, false)` rendait « majeur » pour une date absente. Ce n'était pas une indécision, c'était une décision fausse et muette (`keel_household_member_age`, migration `20260810120000:216`) |
| **F7** | **L'entrée gagne des faits, la sortie n'en gagne aucun** | les consignes de service sont lues **à voix haute, à table**. Ce qui entre dans le prompt sert à dimensionner ; rien ne sert à justifier |
| **F8** | **Une consigne de service est une instruction, jamais un diagnostic** | « une part plus généreuse de légumes » est une instruction ; « pour tes 84 kg » est un verdict sur un corps, prononcé devant la famille. `FORBIDDEN_PORTION_TERMS` (`household_portions.ts:278`) est la ceinture déterministe, **bilingue** |
| **F9** | **Une règle de maison n'est jamais un conseil de santé** | `household_restriction_lock.ts` **efface le pourquoi** du plat, exprès : Sophia ne porte pas une décision parentale comme une recommandation nutritionnelle. Corollaire dur : une **allergie** ne passe jamais par ce chemin — elle a sa propre table et sa propre ceinture (FF-046) |
| **F10** | **Toute garde est testée dans les deux langues** | le produit sort en français par défaut (`profiles.locale`), et une ceinture qui ne connaît que `weight` laisse passer `poids`. Cicatrice `guard-tested-in-one-language-only` |

### Hors périmètre — engageant

- ❌ **Aucun canal 1:1 dans le foyer.** Ni message d'un membre au maître, ni
  demande, ni notification « Léa aimerait des pâtes ». L'envie de la semaine
  (FF-050) est **une ligne, écrite par le maître**, et c'est tout.
- ❌ **Aucun arbitrage entre deux personnes du foyer.** Pas de vote, pas de
  moyenne, pas de « Sophia tranche ». Un désaccord se règle à table.
- ❌ **La colocation.** `households.kind` a été **supprimée** le 2026-08-10, pas
  gardée à une valeur : une colonne à valeur unique invite un lecteur, dans six
  mois, à réactiver un mode sans relire les policies.
- ❌ **Le consentement à se faire restreindre.** Il protégeait un adulte d'un
  autre adulte, dans un monde à plusieurs comptes. La contrepartie n'est pas un
  consentement, c'est la **transparence** : `created_by` reste affiché
  (`restrictionNotice`, rendue par `HouseholdPage`).
- ❌ **Plusieurs foyers par compte.** L'index `household_members_one_per_user`
  rend la résolution du foyer **scalaire** (`keel_household_of`), ce dont
  dépendent toutes les policies. Qui voudra deux foyers réécrira les policies
  d'abord.
- ❌ **Le corps d'un mineur, ou d'une bouche d'âge inconnu, dans le prompt.**
  Même avec un compte. Poser « 152 cm, 41 kg » à côté du prénom d'un enfant rend
  la direction `fat_loss` **dérivable** sans que personne l'ait demandée
  (`meal_body.ts:247`).
- ❌ **Les calories, dans le foyer comme ailleurs.**
  [CONTRACT.md](../../keel/CONTRACT.md) ne bouge pas, et le brief de portions le
  redit en toutes lettres (`household_portions.ts`, `BODY_FACTS_CAVEAT`).
- ❌ **Les surfaces.** Mode cuisine, liste de courses partageable sans compte,
  widget « ce soir », PDF du frigo. Ce sont des surfaces, pas le modèle ; les
  mêler ici fait un chantier qu'on ne finit pas.

---

## ⚠️ Les six trous connus, non refermés

Ils ont été trouvés et nommés pendant le chantier du 2026-08-10. Aucun n'est un
oubli ; tous sont écrits ici parce qu'un document qui les tait serait pire
qu'absent. Chacun a une fiche qui le porte en §7 ou §11.

| # | Le trou | Où | Fiche |
|---|---|---|---|
| 1 | **Le chat ne voit pas les allergies du foyer.** `router/run.ts:1329` charge `student_safety_constraints` du **seul locuteur**. L'allergie d'une bouche sans compte vit dans `household_member_allergies`, dont le seul lecteur serveur est `household_safety.ts:273` → `generate-household-meal-v1`. Un parent qui demande « je cuisine quoi ce soir ? » **dans le chat** n'a pas l'allergie de son enfant armée. *Et à ce jour le fil du générateur lui-même n'est pas commité.* | `sophia-brain/router/run.ts:1329` · `_shared/keel/household_safety.ts:273` | [FF-046](FF-046-l-allergie-d-une-bouche-sans-compte.md) §7 |
| 2 | **L'écho numérique nu n'est mordu par personne.** « pour tes 84 kg », « tu mesures 186 cm ». Le moteur apparie des **mots** ; il ne sait pas exprimer « un nombre suivi d'une unité, rattaché à une personne ». Les unités nues restent hors liste **exprès** (sinon « des morceaux de 3 cm » met quelqu'un en part standard). | `_shared/keel/household_portions.ts:270-277` | [FF-047](FF-047-le-corps-dans-la-part-du-foyer.md) §7 |
| 3 | **Une personne sans compte ne peut pas en créer un.** L'inscription de `/auth` est fermée hors `?role=coach`, et `/start` attache au **coach maison** — une relation de coaching, pas une place à table. La page de réclamation le **dit**, au lieu de mener à un formulaire qui échoue. | `frontend/src/pages/Auth.tsx:59` · `keel/pages/JoinHouseholdPage.tsx:42-49` | [FF-048](FF-048-reclamer-son-profil.md) §7 |
| 4 | **« Retirer l'accès » n'existe pas comme geste.** Le seul retrait disponible, `keel_household_remove_member`, **détruit la bouche** — ses portions, ses allergies, sa place au menu — alors que la personne continue de manger là. Le détachement (`user_id` remis à NULL, la ligne reste) est un changement de promesse produit, pas une ligne de SQL. | migration `20260810120000:510,551` | [FF-048](FF-048-reclamer-son-profil.md) §11 |
| 5 | **Supprimer son compte supprime sa bouche.** `household_members.user_id references auth.users(id) on delete cascade` — héritage du modèle d'avant, où une bouche **était** un compte. Un droit RGPD exercé fait maigrir le foyer sans que personne l'ait décidé. | migration `20260808000000:78` (jamais reposée depuis) | [FF-048](FF-048-reclamer-son-profil.md) §11 |
| 6 | **Le foyer est gratuit.** Aucun chemin du foyer ne lit `access_tier` ; `grep -ric household` sur les cinq fonctions `stripe-*` et sur `_shared/billing-tier.ts` rend **0 partout**. Acceptable en pilote, mais c'est un choix, pas un état. | — | [FF-049](FF-049-le-prix-du-foyer.md) §7 |

---

## Les fiches

| Fiche | Statut | En une phrase |
|---|---|---|
| [FF-043 · La résolution foyer](FF-043-la-resolution-foyer.md) | 🟡 Spécifiée | Une cuisson, des assiettes qui divergent sans que la divergence soit lisible à table. Le tronc se dimensionne sur le MIN, jamais sur le référent, et un seul membre sous plancher fait dégrader toute la lane. |
| [FF-044 · La bouche sans compte](FF-044-la-bouche-sans-compte.md) | 🟢 Livrée | `member_id` est la clé du foyer, le compte est optionnel, l'âge a trois états et l'objectif vit sur la ligne membre. |
| [FF-045 · Décrire son foyer](FF-045-decrire-son-foyer.md) | 🟢 Livrée | Le maître se décrit en premier, puis les bouches s'ajoutent d'affilée. Plafond de 8, en base et pas à l'écran. |
| [FF-046 · L'allergie d'une bouche sans compte](FF-046-l-allergie-d-une-bouche-sans-compte.md) | 🟠 En cours | Une table à part, un slug dérivé à la lecture, la même union fail-closed — mais le fil du générateur n'est pas commité, et le chat ne la voit pas. |
| [FF-047 · Le corps dans la part du foyer](FF-047-le-corps-dans-la-part-du-foyer.md) | 🟢 Livrée | Réclamer son profil change vraiment l'assiette : le générateur du foyer lit enfin taille, âge, sexe et mesures — et la ceinture a été rearmée sur ce que ça rend dicible. |
| [FF-048 · Réclamer son profil](FF-048-reclamer-son-profil.md) | 🟢 Livrée | Rejoindre un foyer **attache** un compte à une ligne existante ; ça n'en crée pas une. Lecture du plan et son propre objectif, rien d'autre. |
| [FF-049 · Le prix du foyer](FF-049-le-prix-du-foyer.md) | 🟠 En cours | La définition de ce qu'on facture existe en base ; rien ne facture, et le commentaire de la fonction le dit. |
| [FF-050 · L'envie de la semaine](FF-050-l-envie-de-la-semaine.md) | 🟠 En cours | Une ligne de texte que le maître écrit pour tout le monde, ancrée au lundi ISO. Remplace la récolte par membre. **Livrée sur le disque, non commitée.** |

On écrit une fiche **quand on retouche** une fonctionnalité de ce domaine —
écrire des fiches rétroactives produirait des documents que personne n'a
vérifiés. Les fiches FF-044 à FF-050 ont été écrites **après** la livraison des
lots qu'elles décrivent, et chacune cite `fichier:ligne`.

## Identifiants réservés puis libérés

Un identifiant ne se réutilise **jamais**, y compris quand il n'a jamais porté
de fiche.

| ID | Sort |
|---|---|
| `FF-032` · `FF-033` · `FF-034` · `FF-035` · `FF-036` | **réservés le 2026-08-10** par [CHANTIER-FOYER-PROFILS.md](../../keel/CHANTIER-FOYER-PROFILS.md) pour les cinq fiches de ce chantier, puis **jamais attribués** : deux autres sessions écrivaient en parallèle et le chantier a livré sous `FF-044` → `FF-050`, avec un découpage différent (sept fiches, pas cinq). **Ne pas réattribuer.** |

## L'ordre de lecture

1. **FF-044** — le modèle. Tout le reste en dépend.
2. **FF-045** puis **FF-046** — la surface qui remplit le modèle, et la
   contrainte de sécurité qu'elle collecte.
3. **FF-047** puis **FF-048** — ce que le corps change, et le geste qui l'ouvre.
   Dans cet ordre : la réclamation ne vaut que par ce que FF-047 lui donne.
4. **FF-049** — ce qu'on facturera, quand on facturera.
5. **FF-050** et **FF-043** — indépendants du reste.
