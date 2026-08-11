# FF-044 · La bouche sans compte

| | |
|---|---|
| **Identifiant** | `FF-044-la-bouche-sans-compte` |
| **Statut** | 🟢 Livrée — commit `9dc442d2` (2026-08-10) |
| **Date** | 2026-08-10 |
| **Autorité produit** | [le-foyer/README.md](README.md) (règle mère, F1–F10) · [MODEL.md](../../keel/MODEL.md) · [CHANTIER-FOYER-PROFILS.md](../../keel/CHANTIER-FOYER-PROFILS.md) lots 1+2+3 |
| **Dépend de** | migration `20260808000000_household_foundation.sql` (le foyer d'avant) |
| **Effort estimé** | livré — 1 jour de conception, 1 jour d'exécution |

---

## 1. Le problème

Une famille ouvre le produit. Il y a un parent, deux enfants de six et huit ans,
et un conjoint qui n'a aucune envie d'installer quoi que ce soit.

Le foyer, tel qu'il était construit, ne savait pas les représenter. Sa table de
membres était clée `(household_id, user_id)` avec `user_id not null references
auth.users` (`20260808000000_household_foundation.sql:76-88`) : **exister au
foyer, c'était avoir un compte**. Le prénom venait de `profiles`, la date de
naissance aussi, l'objectif venait de `student_goals` — trois tables qui exigent
toutes un compte.

Et ce n'était pas seulement un manque : les gardes écrites pour l'ancien monde
**pointaient dans la mauvaise direction**. `keel_household_is_minor` faisait
`coalesce(…, false)` — profil absent ⇒ *traité comme majeur*. Combiné au mur du
consentement (`if not is_minor and consent is null → adult_without_consent`),
une bouche sans compte — **enfant de six ans compris** — aurait été refusée à la
restriction avec le motif « adulte sans consentement ». Ce n'était pas une
indécision : c'était une décision fausse, rendue en silence.

**Ce que ça coûte de ne rien faire.** Le produit demande à un parent d'inscrire
ses enfants avant de pouvoir dîner. Personne ne le fait. Et la fonctionnalité
qui est la douve — les portions qui bifurquent — reste **muette pour exactement
les gens qu'on veut ajouter**.

## 2. Job stories

> **Quand** j'ajoute mes deux enfants au foyer, **je veux** qu'ils existent avec
> leur prénom et leur âge, **pour que** le plan tienne compte d'eux sans que
> j'aie à leur créer une adresse mail.

> **Quand** mon conjoint finit par vouloir son accès six mois plus tard, **je
> veux** qu'il retrouve sa place telle quelle, **pour que** ses interdits et ses
> portions ne repartent pas de zéro.

> **Quand** je n'ai pas saisi la date de naissance de quelqu'un, **je veux** que
> le produit s'abstienne, **pour qu'**il ne le traite pas comme un adulte au
> hasard.

## 3. Périmètre

### Dans le périmètre
- `member_id` devient **la clé** du graphe du foyer. `user_id` devient une
  propriété optionnelle de la ligne.
- **Prénom** et **date de naissance** descendent sur la ligne membre, **pour
  tout le monde** — y compris le compte maître.
- Un **objectif** sur la ligne membre, vocabulaire fermé aux six jetons.
- L'**âge à trois états** : `minor` · `adult` · `unknown`.
- Le retrait du consentement, de `households.kind` et de la colocation.
- Les quatre fonctions TypeScript devenues sans objet.

### Hors périmètre — engageant
- ❌ **Aucun repli de `member_id` sur `user_id`.** Un lecteur qui accepte les
  deux clés fait du repli le chemin nominal le jour où l'un des deux cesse
  d'émettre la bonne. Les lignes `member_portions` écrites en local deviennent
  illisibles : assumé, il n'y a aucun utilisateur réel.
- ❌ **Aucun repli « le profil si la ligne est vide ».** Ça rouvrirait très
  exactement le bug du prénom vide qui efface une portion (R2).
- ❌ **La colocation.** `households.kind` est **supprimée**, pas gardée à une
  valeur (`20260810120000:204-207`).
- ❌ **Le consentement à se faire restreindre.** Supprimé
  (`20260810120000:187-191`), contrepartie écrite : `created_by` reste affiché.
- ❌ **Plusieurs foyers par compte.** `household_members_one_per_user` reste tel
  quel : Postgres traite les NULL comme distincts, donc autant de bouches sans
  compte qu'on veut, et toujours **un seul foyer par compte**.
- ❌ **Un objectif appliqué sans âge.** Voir R4.

## 4. Le circuit

```
   AVANT                                  APRÈS
   ─────                                  ─────
   auth.users                             household_members
       │  (FK not null)                       member_id  ← LA CLÉ
       ▼                                      user_id    ← optionnel
   household_members                          first_name ← sur la ligne
       │                                      birth_date ← sur la ligne
       ├─ profiles.full_name  (prénom)        goal       ← sur la ligne
       ├─ profiles.birth_date (minorité)          │
       └─ student_goals.goal  (objectif)          │
                                                  ▼
                                   keel_household_roster_for(p_user)
                                     rend prénom, age_state, goal
                                     SANS JOINDRE profiles
                                                  │
             ┌────────────────────────────────────┴───────────────┐
             ▼                                                    ▼
   generate-household-meal-v1                     household_turn_context.ts
   buildPortionBrief(members)                     (le bloc foyer du chat)
   → une consigne par member_id                   → visibleById clé member_id
```

**Le point où deux chemins se rejoignent** : le roster. Il n'a plus **aucune
branche conditionnelle** entre une bouche avec compte et une sans, parce que le
prénom vient de la ligne pour tout le monde. C'est ce qui rend l'invariant
vérifiable d'un coup d'œil.

## 5. Modèle de données

| Champ | Où | Origine | Note |
|---|---|---|---|
| `member_id` | `household_members` | **généré** (`gen_random_uuid()`) | La PK, depuis `20260810120000:136-137`. Ne change **jamais**, y compris à la réclamation d'un profil. |
| `user_id` | `household_members` | posé à la création (maître) ou à la réclamation | `not null` **retiré** (`:140-141`). NULL = bouche sans compte. |
| `first_name` | `household_members` | **saisi** | Obligatoire, `CHECK` de longueur. Recopié **une fois** depuis `profiles` à la création du foyer pour le maître, puis indépendant. |
| `birth_date` | `household_members` | **saisi**, facultatif | Ne sort **jamais** du roster : la corriger passe par une RPC dédiée (voir [FF-045](FF-045-decrire-son-foyer.md) R4). |
| `goal` | `household_members` | **saisi**, facultatif | Six jetons (`MEMBER_GOALS`). NULL = part standard. |
| `age_state` | *dérivé* | `keel_household_member_age(member_id)` (`:216-234`) | **Jamais stocké.** Relu à chaque appel — un enfant grandit, et un booléen figé au jour de l'entrée survivrait à ses dix-huit ans. |

**Supprimés** : `households.kind`, `household_members.restriction_consent_at`,
`keel_household_is_minor`, `keel_household_grant_consent`,
`keel_household_revoke_consent`, et côté TypeScript `canRestrict`, `canInvite`,
`memberVisibility`, `canSeeGoalOf`.

`household_food_restrictions.member_user_id` devient `member_id`, avec une FK
vers `household_members` au lieu d'`auth.users` (`:252-282`).

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | **Une bouche = UNE ligne**, de sa création à sa réclamation | Ses portions, ses contraintes et son historique lui restent attachés. Sinon la personne recommence à zéro le jour où elle gagne un accès, et la douve du produit fuit par la porte qu'on vient d'ouvrir. |
| R2 | **Le prénom vient de la ligne, pour tout le monde** | `household_turn_context.ts` filtre en silence toute portion au prénom vide : un prénom absent **fait disparaître la part**, sans erreur. Une source unique supprime la branche qui produit ce vide. Conséquence assumée : le maître qui renomme son profil ne renomme pas sa ligne au foyer. |
| R3 | **Les lecteurs ne connaissent que `member_id`** — prompt, `member_portions`, contexte de chat | Un lecteur qui accepte les deux clés fait du repli le chemin nominal le jour où l'un des deux cesse d'émettre la bonne (règle transverse F4). |
| R4 | **`unknown` n'applique AUCUNE direction d'objectif** | « Inconnu » et « majeur » doivent produire des résultats **opposés**. Le `coalesce(…, false)` disparaît au lieu d'être inversé — un défaut inversé reste un défaut qui dépend d'un signe. Vérifiable : `meal_body.ts:247` refuse tout fait corporel hors `adult`. |
| R5 | **Une date future ou aberrante vaut `unknown`, pas `adult`** | `20260810120000:227-228`. Une faute de frappe ne doit pas ouvrir une porte que l'absence de donnée ferme. |
| R6 | **L'objectif vient de la ligne pour une bouche SANS compte, et de son « about you » dès qu'elle en a un** | ⚠️ **Règle corrigée le 2026-08-11 (D1).** Elle disait « plus jamais de `student_goals` », et c'était juste tant que les bouches n'avaient pas de compte : `student_goals` exige un compte, donc la bifurcation des portions était muette pour exactement les gens qu'on voulait ajouter. Mais dès qu'une bouche **a** un compte, l'objectif pouvait vivre à deux endroits qui divergent. L'arbitrage : `student_goals` fait autorité pour tout titulaire, `household_members.goal` ne vaut plus que pour les bouches sans compte. La résolution est faite **une seule fois**, dans `keel_household_roster_for` (`20260811070000`), pour qu'aucun lecteur ne puisse l'oublier. Voir [FF-045](FF-045-decrire-son-foyer.md) R9 et [FF-048](FF-048-reclamer-son-profil.md) R8. |
| R7 | **Un jeton d'objectif ne porte aucun chiffre** | `fat_loss` ne produit qu'une consigne d'assiette (`household_portions.ts`, `SERVING_DIRECTION`) : *« generous vegetables, full protein share, smaller starch share »*. L'agressivité vit dans `student_goals.target_weight` et dans les mesures, **tous deux clés sur un compte**. Une ligne membre qui ne porte qu'un jeton est bornée par construction. |
| R8 | **Le plafond de 8 vit en base**, pas à l'écran | Une limite d'UI n'est pas une limite. Détail et motif : [FF-045](FF-045-decrire-son-foyer.md) R6. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Une bouche sans date de naissance | `age_state = unknown` ⇒ **part standard**, aucune direction appliquée, aucun fait corporel. Le flux de saisie n'est pas bloqué pour autant. |
| Une bouche sans objectif | Part standard. C'est le défaut, pas un échec. |
| Un prénom vide arrive quand même en base | Impossible : `CHECK` de longueur sur `first_name`. C'est la garde qui remplace le filtre silencieux d'avant. |
| Le compte maître renomme son profil | Son prénom au foyer **ne suit pas**. Assumé (R2) : il le change au foyer. |
| Un membre est retiré | `keel_household_remove_member` **détruit la ligne**. Depuis `e2899897` (trou n°4 **refermé**), ce n'est plus le seul retrait : `keel_household_detach_member` remet `user_id` à NULL et **garde la bouche**. Deux gestes, deux libellés — voir [FF-048](FF-048-reclamer-son-profil.md) §4. |
| Le compte attaché à une bouche est **supprimé** | La bouche **survit**, `user_id` repasse à NULL (FK en `ON DELETE SET NULL` depuis `e2899897`). Sauf geste explicite `departs_with_account`, coché à T0 et honoré à J+7. Avant ce commit, la cascade emportait la ligne entière : le foyer maigrissait sans que personne l'ait décidé. |
| Deux bouches portent le même prénom | Rien ne l'interdit, et c'est volontaire (deux Léa existent). Le brief de portions les distingue par leur ligne, l'écran par sa liste ; le texte lu à table, lui, sera ambigu. **Non traité.** |

## 8. Critères d'acceptation

```gherkin
Étant donné un foyer où le compte maître ajoute « Léa », 8 ans, sans compte
Quand il pose une allergie et un objectif sur elle
Alors les deux sont acceptés
Et aucune erreur « adulte sans consentement » n'est rendue
```

```gherkin
Étant donné une bouche sans date de naissance et avec l'objectif "fat_loss"
Quand le foyer génère un repas
Alors cette personne reçoit une part STANDARD
Et aucune direction de perte n'apparaît dans sa consigne de service
```

```gherkin
Étant donné une bouche qui porte des portions et des interdits
Quand elle réclame son profil plus tard
Alors son member_id est le même avant et après
Et ses portions et ses interdits lui restent attachés
```

```gherkin
Étant donné un foyer de trois personnes dont deux sans compte
Quand le chat rend le bloc foyer du tour
Alors la part nommée de chacune des trois apparaît
```

## 9. Rabbit holes

- **Le repli qui semble gratuit.** « Si `member_id` est absent, essayons
  `user_id` » coûte trois lignes et rend le défaut invisible pendant six mois.
  C'est la faute que ce dépôt paie le plus souvent.
- **Inverser le `coalesce` au lieu de le supprimer.** `coalesce(…, true)`
  aurait donné « inconnu ⇒ mineur », ce qui est faux dans l'autre sens et
  produit une part enfant pour un adulte non renseigné. Le booléen était le
  problème, pas son signe.
- **L'ordre des `drop` en SQL.** `keel_household_roster` et
  `keel_household_roster_for` sont `language sql` : Postgres enregistre une
  dépendance sur chaque colonne citée, dont `restriction_consent_at`. Dropper la
  colonne avant les fonctions échoue (`20260810120000:168-176`).
- **Le typecheck ne voit pas le SQL.** Un défaut réel a été trouvé **par la
  base** et pas par le compilateur : `keel_household_join` insérait sans
  `first_name`, devenu `NOT NULL`. Rejoindre un foyer levait une violation de
  contrainte sur un chemin qui vit entièrement en SQL — typecheck vert, front
  compilé, invitation morte.

## 10. Ce qu'on mesure

- **La mesure :** part des foyers qui portent **au moins deux bouches** à J+7.
  C'est la seule qui dise si le modèle a levé le mur du compte.
- **La contre-mesure :** part des générations où **toutes** les bouches
  reçoivent une part standard. Si elle reste haute, le réservoir a été construit
  et personne ne le remplit — donc la douve est théorique.

## 11. Questions ouvertes

1. **La part d'autrui est désormais visible dans la conversation.** FF-010 R3
   cachait délibérément la part des autres en colocation ; la distinction
   disparaît avec `households.kind`. Un profil réclamé qui demande « c'est quoi
   la part de Marc ? » l'obtiendra. Cohérent avec « le repas est partagé, le
   corps est à soi » — mais c'est un vrai changement de comportement, pas une
   simplification neutre.
2. **Deux prénoms identiques dans un foyer.** Rien ne les distingue dans une
   phrase lue à table. Non traité, et probablement fréquent.
3. **La preuve d'acceptation en run réel n'a pas été faite.** Les quatre
   critères du §8 sont prouvés au niveau où ils se décident (1750 tests deno,
   514 vitest, 36 assertions `household_rls_test.sql` sur la base réelle) ;
   aucun run avec appel Gemini n'a été exécuté. Le défaut FF-010 était vert sur
   une fixture qui mentait — ce précédent recommande la prudence.
