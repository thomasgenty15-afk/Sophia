# ÉTAT — le document du coach (PDF → doctrine + aliments)

> 2026-08-06. Branche **`dewhatsapp`**.
> **Rien n'est déployé.** Local uniquement — la migration est appliquée sur la
> stack Docker locale, `coach-doctrine-v1` n'est pas redéployée.

---

## En une phrase

Le coach dépose **son** PDF (ebook, manuel de méthode, FAQ) ; il en sort un
**brouillon de doctrine** qu'il relit avant d'enregistrer, et des **propositions
d'aliments** — chacune avec la citation du document — qu'il accepte une par une
sur `/coach/protocol`.

---

## Pourquoi ça existe

L'interview de `/coach/doctrine` demande onze réponses écrites à la main. C'est
le bon chemin pour un coach qui n'a rien ; c'est un mur pour un coach qui a déjà
deux cents pages disant tout ça. Il ne re-rédige pas son ebook dans onze
textareas — donc il ne le fait pas, et son agent reste muet.

---

## Les trois gardes, et ce qu'elles empêchent

| Garde | Ce qu'elle empêche |
|---|---|
| **Le prompt d'interview est IMPORTÉ, pas recopié** (`DOCUMENT_COMPILE_SYSTEM_PROMPT` commence par `DOCTRINE_COMPILE_SYSTEM_PROMPT`) | Deux règles « n'invente rien » qui divergent au premier ajout, sans que rien ne casse : les deux chemins rendent du JSON valide. Test dédié. |
| **`quote` est `not null`** en base et jetée au parseur si absente | Une proposition sans citation est une invention, et une invention est indiscernable d'une lecture une fois affichée à côté des autres. |
| **Rien n'entre dans `coach_food_items`** — les propositions vivent dans `coach_food_proposals` jusqu'à un clic | Une ligne posée par un modèle qui a mal lu une page devient une règle compilée, publiée, lue par le générateur et l'évaluateur, au nom du coach. C'est le défaut de la coche automatique (QA 2026-08-05), déplacé du côté élève au côté coach. |

**Le vocabulaire reste fermé.** Le `food_group_ref` proposé est re-vérifié contre
`food_groups` (parseur) puis contre la FK (base) ; un slug inventé est jeté et
compté dans `issues`, jamais rabattu sur un groupe voisin.

---

## `why_source: 'coach'` sur une citation adoptée — arbitrage

La citation est les mots du coach, qu'il vient de relire et d'adopter. `coach`
est un cliquet : l'écriture IA est conditionnée (`where why_source <> 'coach'`),
donc `draft_why` ne peut pas remplacer sa phrase par une phrase générée. Marquer
`ai` autoriserait exactement ça.

Une quatrième valeur `document` a été envisagée et **écartée** : elle se
comporterait à l'identique de `coach` partout, ce que R6 interdit (pas de valeur
d'enum sans branche nommée qui la lit).

---

## La fusion, et pourquoi elle n'est pas un remplacement

`assertValidVisionMedia` n'accepte **qu'un PDF à la fois**. Sans fusion, déposer
le deuxième document effacerait le premier — en silence, puisque l'écran
afficherait bien quelque chose.

Règle unique : **ce qui est déjà à l'écran gagne, le nouveau ne remplit que les
trous.** Le coach a regardé ce qui est là ; l'arrivant, non. Le corollaire compte
autant : un `instead` absent qui se remplit fait passer un interdit d'un refus
sec à une vraie réponse. Les `surface_forms` sont **unies** (plus de
formulations = un verrou déterministe qui attrape plus, aucun coût).

**Le pluriel ne fusionne pas** (`seed oil` ≠ `seed oils`), délibérément : un
stemming réunirait aussi deux aliments distincts en en faisant disparaître un
sans que le coach le voie. Deux lignes voisines sont visibles et se réparent
d'un clic. Test dédié pour que la décision se relise.

---

## Ce qui marche, et comment on le sait

| Livrable | Preuve |
|---|---|
| Module pur (prompt, parseur, fusion, plafonds) | `doctrine_document_test.ts` — 21/21 |
| Aucune régression sur la doctrine existante | `deno test _shared/keel/` — **938/938** |
| Migration : RLS, `revoke from anon`, CHECK, index partiel | appliquée en local + 5 assertions comportementales en SQL (citation vide refusée, doublon en attente refusé, `accepted` sans `resolved_at` refusé, terme rejouable après résolution) |
| `anon` n'a **aucun** privilège | `has_table_privilege('anon', …)` = `f` sur SELECT et INSERT |
| Chaîne complète, vrai modèle, vraie base | run réel ci-dessous |
| Les refus sont nommés | `document_required`, `document_must_be_pdf`, `document_unreadable`, `document_too_large`, `document_too_long` — les trois premiers vérifiés en curl |
| L'écran | `/coach/doctrine` et `/coach/protocol` pilotés dans un navigateur, captures dans le journal de session |
| RGPD | `coach_food_proposals` réclamée par `account-export-v1` (`propositions_aliments_coach`) ; purge par cascade depuis `coaches`, comme `coach_food_items` |

### Le run réel (2026-08-06, local, `gemini-3.1-pro-preview`)

PDF de 3 pages écrit pour l'occasion : deux convictions, un interdit avec son
`instead`, un mot de vocabulaire, un Q/R, quatre aliments avec position, **et une
page de recette** (riz, tomates, citron, persil) qui ne prend position sur rien.

- **24 s**, HTTP 200, `page_count: 3`, `issues: []`
- doctrine : 2 croyances (claim/rationale correctement séparés), 1 interdit avec
  `instead` verbatim, 1 mot, 1 Q/R, 2 aliments déconseillés avec formulations FR
  **et** EN, `voice: {address: "tu", language: "fr"}`
- aliments : **3 propositions**, chacune avec sa citation — `sardines`
  (`encouraged`, lié au catalogue), `oeufs` (`encouraged`), `huiles de graines`
  (`excluded`)
- **la page de recette n'a rien produit** : la règle « un aliment mentionné ne
  produit rien » tient sur du texte réel
- **second dépôt du même PDF** : `proposals_saved: 0`,
  `already_pending: 3`, et la doctrine fusionnée reste à 2/1/1/1/2 — zéro doublon
- acceptation depuis l'écran : ligne dans `coach_food_items`
  (`food_item_ref: sardines`, `why` = la citation, `why_source: coach`), la
  proposition passe `accepted` avec `resolved_at`, et la posture de groupe
  dérivée apparaît dans l'aperçu (« oily fish — at least 1 serving a day »)

---

## Les plafonds, et lequel est une mesure

| Plafond | Valeur | Statut |
|---|---|---|
| Poids | 6 Mo (8 M caractères base64) | **repris de `plan-import-v1`**, qui porte la même contrainte de corps JSON |
| Pages | 120 | ⚠️ **prudence, pas mesure.** Ce qui mord est l'horloge de la fonction : `plan-import-v1` a été mesuré à 61 s sur un PDF de plan. **À remesurer** sur un vrai ebook : si 200 pages passent en 70 s, le plafond doit monter et le message « découpe ton document » n'a plus lieu d'être. |

Le comptage se fait par `pdf-lib` côté serveur : sans lui un document de quatre
cents pages ne serait pas refusé, il expirerait à 120 s — et le coach lirait
« ça n'a pas marché » là où la vraie réponse est « découpe-le ».

Les deux constantes vivent dans le module Deno et sont **importées** par le
front. Un plafond écrit deux fois finit par différer, toujours dans le même sens
désagréable : le bouton accepte, le serveur rejette, et le coach a attendu
l'aller-retour de six mégaoctets pour l'apprendre.

---

## Ce qui reste ouvert

- **Non déployé.** `supabase functions deploy coach-doctrine-v1` +
  `account-export-v1`, et la migration `20260806100000` sur le distant.
- **Le plafond de pages est à remesurer** (ci-dessus).
- **`food_item_ref` reste `null` sur un terme non anglais** (`oeufs`,
  `huiles de graines`) : le catalogue est libellé en anglais et le rattachement
  se fait sur le libellé replié. Ce n'est pas un défaut — la colonne est
  nullable par construction, et la ligne dégrade exactement comme un ajout
  manuel au « + ». Un rattachement multilingue serait un lot à part.
- **Aucun test d'intégration automatisé** sur `compile_document` : la
  vérification ci-dessus est un run manuel reproductible, pas un filet.
- Le trou connu, antérieur : « Publish to my students » n'a toujours pas de
  `onClick` (voir [[recommended-food-grammar-vs-opinion]]).
