# STATUS — la mémoire alimentaire dans le temps

*2026-08-06. Question posée : la carte « What you have told me about your eating »
(haut de `/app/plan`) garde des habitudes, contraintes et préférences. **Que
deviennent-elles quand l'élève revient dessus trois jours après, la semaine
suivante ?** Est-ce que ça sert vraiment la génération, et est-ce que ça tient
jusqu'à ce que ça change ?*

Méthode : `docs/nutrition-pivot/qa-web/N1_food_memory_over_time.ts` — coach avec
doctrine publiée, élève avec plan publié, conversation réelle étalée sur trois
semaines simulées (messages rétrodatés, vrai memorizer scopé sur l'élève à
chaque étape, vraie génération de semaine). Aucun mock. Cinq runs.

---

## VERDICT EN UNE PHRASE

Le stockage marchait ; **le temps, non** — une préférence gardée était une chaîne
détachée de son souvenir, donc éternelle, et le premier jour d'un élève
n'atteignait jamais sa première semaine.

---

## CE QUE LE PREMIER RUN A MESURÉ

| # | Défaut | Preuve |
|---|---|---|
| **1** | **La contradiction s'empile et rien ne la retire** | État final S3 servi au générateur : `["Aime le brocoli s'il est rôti.", …, "N'aime pas le brocoli."]`. Le memorizer avait pourtant fait son travail (`superseded` + `superseded_by_item_id` remplis) — `practical_constraints` n'en savait rien. |
| **2** | **Le premier jour d'un élève est invisible** | S1 : 2 souvenirs alimentaires, tous deux `candidate` → **0 proposition**. La déclaration la plus importante (« je déteste le brocoli ») n'atteignait pas la semaine 1 — la seule sur laquelle l'élève juge le produit. |
| **3** | **Le modèle ne peut pas départager** | Les préférences partaient comme un SAC de chaînes sans date. Deux lignes `active` que le memorizer n'a pas reliées (« pas le temps de cuisiner le soir » / « je recuisine ») sont indépartageables : rien ne dit laquelle est récente. |
| **4** | ~~**Langue**~~ | **RETIRÉ — c'était un défaut du DÉCOR, pas du produit.** Voir ci-dessous. |

### Pourquoi le #2 arrivait, exactement

`candidate` ne voulait pas dire « on doute du contenu ». Confiance propre de
l'item : **0,95**. Ce qui était faible, c'est le **lien vers le sujet** :

| jour | lien | statut |
|---|---|---|
| 2026-07-06 (1er lot) | **0,62** | `candidate` |
| 2026-07-09 | 0,88 | `active` |

Le sujet de mémoire est créé dans le même lot que les premiers souvenirs, donc
le lien est faible **par construction**. Et le cron d'entretien archive ces
items à J+14 faute de réaffirmation : la préférence ne devenait jamais
proposable, elle mourait.

---

## CE QUI A ÉTÉ FAIT

Tout vit dans `supabase/functions/_shared/keel/food_preference_promotion.ts`
(pur) et son `_io.ts` (branchement), avec un miroir front dans
`frontend/src/keel/api/foodPreferences.ts`.

1. **`food_preferences_origin`** — `texte normalisé → { item, at }`. C'est le
   fil qui relie une ligne gardée à son souvenir, et sa date. Jamais servi au
   modèle. Les deux formes sont lues (l'ancienne, id nu, reste valide).

2. **`reconcileFoodPreferences`** — retire du plan ce que la mémoire a démenti
   (`superseded`, `invalidated`, `archived`, `hidden_by_user`,
   `deleted_by_user`). **La mémoire décide de la péremption ; on n'invente
   aucun TTL maison** — ce serait une seconde source de vérité en concurrence
   avec celle qui est mieux informée.

3. **Branchée aux DEUX générateurs**, avant tout lecteur du jsonb, et elle
   **persiste** — un élève qui revient sur ce qu'il a dit le fait dans la
   conversation, rien ne l'oblige à rouvrir `/app/plan`.

4. **Le revirement remplace, il ne s'ajoute pas** — la carte affiche
   « *Theo déteste le brocoli* — replaces ~~Theo accepte le brocoli rôti~~ »
   avec un bouton **Update**, et le clic retire l'ancienne dans la même
   écriture.

5. **`candidate` de haute confiance est proposable** — le premier jour compte.
   Les vraies gardes restent le plancher de confiance (0,7) et la ligne
   médicale. Proposer n'est pas garder : le clic de l'élève **promeut** le
   souvenir (`explicit_confirmation`, le signal que la mémoire définit
   elle-même).

6. **`foodPreferencesForPrompt`** — les préférences partent **datées, la plus
   récente d'abord**, plafonnées à 20 (coupe par le plus ancien : derrière les
   préférences il y a la doctrine du coach, et le budget tronque par la queue).
   C'est ce qui permet au modèle de trancher une contradiction que le memorizer
   n'a pas reliée.

7. **La ceinture porte sa condition** — voir ci-dessous.

8. **Ce que la réconciliation ne peut pas trancher, la carte le DEMANDE** —
   `preferencesWorthRechecking`. Une ligne ancienne qu'une ligne plus récente
   recoupe (mot porteur partagé, dates différentes) reçoit un rappel discret :
   *« You came back to this on 2026-07-20 — still right? »*. Elle n'affirme
   PAS que la ligne est fausse — on n'en sait rien — seulement que l'élève est
   revenu sur le sujet. Trois abstentions : pas de date des deux côtés, même
   date (dit dans le même souffle), et seule la plus ancienne est signalée.

9. **`food_preferences_dismissed` est plafonné** (200, coupe par le plus
   ancien). Cette liste n'avait que des `push`, sur une ligne relue à chaque
   génération de semaine ET de repas. Les ids anciens portent en majorité des
   souvenirs déjà archivés — donc plus proposables, donc l'id ne servait plus à
   rien.

---

## LE DÉFAUT QUE SEUL LE RUN RÉEL POUVAIT TROUVER

Au 4e run, le memorizer a rattaché « Theo déteste le brocoli. » à **trois**
items, dont :

```
b5371d7d  superseded → 42fe8552   « Theo n'aime pas du tout le porridge au petit-déjeuner. »
```

Une supersession **fausse**. La réconciliation, qui croyait le statut sur
parole, a donc supprimé une préférence vraie et sans rapport — silencieusement,
dans une carte que l'élève ouvre rarement.

**Correctif** : `supersessionIsPlausible` — une supersession n'emporte une
préférence que si le remplaçant partage un mot porteur avec elle. Sinon on
garde, et on journalise (`supersession_not_plausible`).

L'arbitrage, écrit dans le code : garder une ligne périmée et supprimer une
ligne vraie coûtent la même chose au plan, **mais pas à l'élève** — la périmée
reste affichée dans « In your plan », donc visible et corrigeable ; la
supprimée disparaît sans trace. À incertitude égale on choisit l'erreur que
l'élève peut voir, et la vue datée sait déjà départager deux lignes qui se
contredisent.

Deux pièges de cette ceinture, tous deux couverts par un test :
- **le prénom** — le memorizer préfixe chaque résumé du prénom de l'élève, donc
  *toutes* ses paires partagent au moins ce mot. Sans `ignoreTokens`, le
  contrôle était vert **en étant mort** ;
- **le remplaçant non chargé** — l'`_io` doit lire les cibles de
  `superseded_by_item_id`, sinon le contrôle retombe sur « rien à comparer » et
  ne retire plus jamais rien.

Un autre défaut est sorti du même run, attrapé par le filet fail-soft du module :
`invalid input syntax for type uuid: "[object Object]"` — l'appelant serveur
fabriquait ses ids avec `Object.values(origin).map(String)`. La lecture de cette
table n'a plus qu'un propriétaire (`originIdsOf`).

---

## AVANT / APRÈS, MÊME SCÉNARIO

| | Run 1 (avant) | Run 5 (après) |
|---|---|---|
| S1 · préférences atteignant la semaine 1 | **0** | **4** |
| S3 · état final | 4 lignes, **contradiction directe** sur le brocoli | 6 lignes, **cohérentes** |
| Vue du modèle | sac non ordonné, sans date | daté, plus récent d'abord |
| Revirement | empilé à côté | retiré, une ligne remplacée |

Le plan S3 du run 5, généré à partir de ça :

> *« You do not do well on porridge or coffee alone, so breakfast needs to
> actually hold you. »*

— il a lu la ligne porridge (2026-07-13) **et** la ligne café noir (2026-07-06)
et a composé avec les deux.

**Vérifié au navigateur** : la carte affiche le remplacement, le clic sur
`Update` retire l'ancienne ligne et pose la nouvelle à sa place, l'origine
périmée est nettoyée, aucune erreur console.

---

## LE FAUX DÉFAUT — et ce qu'il enseigne

Les cinq premiers runs ont produit une mémoire **entièrement française** pour un
élève annoncé `en-GB`, et le rapport a d'abord conclu à un défaut de langue du
memorizer, à traiter comme son propre lot. **C'était faux.**

Le prompt d'extraction porte déjà la règle, nommément :

> `content_text`, `normalized_summary` et `topic_hint` sont écrits dans **la
> langue du user**, donnée par `user_profile.locale` […] Si `user_profile.locale`
> est absent, écris en **ANGLAIS**.

Et le chargeur de profil est vivant depuis le 2026-08-03 (`full_name`, `gender`,
`locale`). Le memorizer a donc **obéi** — il a lu `fr-FR` et écrit en français.

D'où venait `fr-FR` ? De `profiles.locale`, dont le **DÉFAUT en base est
`'fr-FR'`** — un reste du produit grand public. Les trois chemins réels qui font
de quelqu'un un élève KEEL écrivent tous `en-US` :

| chemin | |
|---|---|
| `keel_attach_student_to_coach` | `20260804180000_join_sets_student_locale_and_country.sql:198` |
| `free_signup_attach_engine` | `20260805091000:196` |
| `house_discovery_plan_version` | `20260805093000:360` |
| `JoinPage.tsx:260` | `locale: "en-US"` |

Le seul chemin qui ne l'écrivait pas était **`makeStudent` du harnais**, qui
insère `coach_clients` en direct et court-circuite la RPC. Corrigé : le harnais
naît `en-US` comme la production, avec le pourquoi écrit au-dessus de la ligne.

**Run 6, même scénario, élève né comme en production :**

```
Theo has a strong physical aversion to eating porridge for breakfast.
Theo has more free time in the evening and is cooking again.
Theo hates broccoli and says the roasted version was only a one-time exception.
```

**La leçon** : un décor qui ment sur le produit fabrique des défauts qui
n'existent pas, et ça coûte aussi cher que d'en cacher un — ici, un lot entier
« corriger la langue du memorizer » aurait été ouvert contre du code correct.
Avant de déclarer un défaut de comportement, vérifier que la fixture reproduit
le chemin d'inscription **réel**.

---

## LES TROIS COUCHES, ET POURQUOI IL EN FAUT TROIS

La supersession du memorizer est **non déterministe** : au run 6 il n'a PAS
relié « roasted broccoli was fine » (07-09) à « hates broccoli » (07-20), alors
que le même scénario en français avait posé le lien. Aucune couche seule ne
suffit donc :

| couche | ce qu'elle couvre | quand elle ne peut rien |
|---|---|---|
| **Réconciliation** (serveur, persistée) | ce que le memorizer a EXPLICITEMENT démenti | il n'a rien relié |
| **Vue datée** (prompt) | le modèle lit la plus récente en premier | l'écran, lui, accumule |
| **Rappel « still right? »** (carte) | ce que l'élève seul peut trancher | il n'ouvre jamais la carte |

Chacune rattrape l'angle mort de la précédente, et aucune ne décide à la place
de l'élève.

**Vérifié à l'écran** sur le cas exact que la réconciliation ne peut pas
traiter (deux lignes, même sujet, dates différentes, aucun lien en mémoire) :
le rappel s'affiche sur les deux lignes anciennes et **seulement** sur elles —
les quatre autres lignes de la carte restent muettes. Ambre 12 px, aucun
débordement horizontal à 320 px.

---

## CE QUI RESTE OUVERT

**Le transitoire.** Une contrainte à durée de vie (« gros projet pendant deux
semaines ») reste gardée après sa fin. La ligne fraîche passe **au-dessus**, le
modèle tranche, et le rappel de la carte la signale à l'élève ; aucune
péremption automatique n'a été inventée pour autant.

**Non déployé.** Tout est local. Aucune migration : les deux clés vivent dans le
jsonb `practical_constraints` existant.

---

## FICHIERS

| Fichier | |
|---|---|
| `supabase/functions/_shared/keel/food_preference_promotion.ts` | le module pur (origine, réconciliation, vue datée, plausibilité) |
| `supabase/functions/_shared/keel/food_preference_promotion_io.ts` | **nouveau** — la réconciliation branchée et persistée |
| `supabase/functions/generate-week-plan-v1/index.ts` | réconcilie avant tout lecteur du jsonb |
| `supabase/functions/generate-meal-v1/index.ts` | idem + lit la vue datée partagée |
| `frontend/src/keel/api/foodPreferences.ts` | miroir écran ; ne tranche PAS `superseded` (le jugement vit côté serveur) |
| `frontend/src/keel/components/FoodPreferencesCard.tsx` | remplacement visible, `Update`, promotion du candidat |
| `docs/nutrition-pivot/qa-web/N1_food_memory_over_time.ts` | le run réel 3 semaines, rejouable |
| `docs/nutrition-pivot/qa-web/harness.ts` | `makeStudent` naît `en-US`, comme les trois chemins produits |

47 tests sur le module pur + 8 sur le branchement
(`food_preference_promotion_io_test.ts`), suite KEEL **1131/1131**.

### Les tests du branchement mordent — vérifié par mutation

Les deux défauts de ce chantier vivaient dans l'`_io`, pas dans le module pur,
et tous deux étaient **silencieux**. Les tests ont été validés en réintroduisant
chaque bug :

| mutant | résultat |
|---|---|
| ids refaits à la main (`Object.values(origin).map(String)`) | **3 tests rouges** |
| remplaçants non passés à la réconciliation | **2 tests rouges** |

Un test de branchement qui reste vert sur le bug qu'il prétend couvrir ne vaut
rien ; ceux-ci ont été mesurés.
