# Les huit chantiers du 3 septembre — rapport final

**Branche** `ff-001-quotidien-du-coach` · **Onze lots fusionnés** · **`agent-gate.sh` exit 0**
**Journal complet** : [2026-09-03-1329-ORCHESTRATION-8-CHANTIERS.md](2026-09-03-1329-ORCHESTRATION-8-CHANTIERS.md)
Remplace les deux états intermédiaires ([2230](2026-09-03-2230-ETAT-ET-GESTES-HUMAINS.md), [0500](2026-09-04-0500-ETAT-ET-GESTES-HUMAINS.md)).

---

## 1. Ce qui est livré, en français

**L'entonnoir** ne demande plus combien de temps dure une session de cuisine, et ne fait plus cocher « je cuisine la
veille ». Il demande **comment on veut cuisiner** (trois styles) et **combien de fois on veut faire les courses** (une à
trois). Tout le reste se dérive : le nombre de sessions, les jours de cuisine, les vagues de courses, et la veille
elle-même — avec une coupure à 18 h tranchée **par le serveur**, parce que le navigateur ne connaît pas l'heure de la
personne. La quatrième option d'objectif (l'option vide) a disparu des six sélecteurs, et un mineur ne se voit proposer
que « manger normalement ».

**La page Foyer** porte deux cadres nommés par personne — informations, préférences — les paramètres de la maison
rapatriés de l'entonnoir, et l'accès se demande depuis la ligne de chacun au lieu d'un menu séparé. La carte du déjeuner
en semaine a quitté l'étape 3 pour la fiche de chaque bouche.

**Le membre du foyer existe enfin pour le produit** : il reçoit le message du soir, coche sa propre part du plan,
déclare qu'il n'a pas mangé, et décide du sort de sa boîte — sans jamais déplacer le plan des autres. La cascade
fonctionne : une cuisson déclarée ratée par le maître ampute réellement la bande du membre.

**La page de suivi** remplace une page morte : plans effectués, plans modifiés, total du jour portant sa base, les six
créneaux déclarés, et une courbe de poids. **Retiré** : l'onglet « Idées de repas ».

---

## 2. Ce que les tests en conditions réelles ont trouvé — et eux seuls

Trois défauts qu'aucune vérification statique n'avait vus. **C'est le résultat le plus important de la journée.**

**🔴 L'export de données personnelles partait complet en omettant une table.** Chaque déclaration d'une personne sur sa
propre part — « je n'ai pas mangé », « au congélateur », « jetée » — était **absente de son propre export**. Cause : une
colonne de tri par défaut qui n'existe pas dans cette table ; la base refusait, un filet transformait le refus en
**résultat vide**, et un indicateur d'indisponibilité **que personne ne lit** signalait le problème.
**Trois protections, trois angles morts** : les gardes lisent le code et ce défaut ne se voit qu'à l'exécution ; le test
qui l'aurait vu était **désactivé et n'avait jamais tourné** ; l'indicateur n'a aucun lecteur. **Corrigé, test vert 3/3.**

**🔴 Une consigne au modèle ne partait jamais.** Le générateur du foyer interrogeait une colonne inexistante, un filet
avalait le refus, et le bloc du déjeuner emporté n'atteignait **jamais** le modèle. **Et le test de câblage recopiait la
faute de frappe et la déclarait conforme.** Corrigé, et prouvé en base.

**🔴 Un membre pouvait cocher le plat de l'enfant.** La bande du soir ne filtrait pas par personne — et la cause était
plus profonde que le filtre : **le type serveur ne portait pas l'identifiant de la bouche**, donc aucun lecteur ne
*pouvait* filtrer et aucun contrôle de typage ne pouvait signaler le manque. Corrigé ; le correctif ferme trois lecteurs.

---

## 3. Ce qui reste ouvert, nommé

| # | Ce qui reste | Pourquoi |
|---|---|---|
| 1 | Un plan de **sept jours mangés** n'a pas de veille automatique | l'alphabet des jetons de jour, pas la base ; refus nommé à trois endroits |
| 2 | **« Décrire » n'enregistre aucune valeur d'énergie** | le dépôt n'a aucune fonction qui trouve une quantité **dans** une phrase ; aucun chiffre faux n'en sort |
| 3 | Il reste **deux formulaires de bouche** au lieu d'un | `persistMouth` n'a aucun écrivain pour **retirer** une allergie ; unifier aurait supprimé une capacité de sécurité |
| 4 | **`shift_dish` n'a aucun exécuteur** | l'action existe dans l'espace, rien ne l'exécute ; la prémisse du mandat était fausse |
| 5 | Le **bloc jour du maître** ne rend pas « encore au frigo » | trois surfaces candidates, trois raisons distinctes |
| 6 | **Le tap depuis une vraie bulle de chat** n'a jamais été joué | exige un JWT d'élève ; les mêmes fonctions d'I/O sont prouvées, **le routage et le rendu ne le sont pas** |
| 7 | **87 erreurs de typage** dans douze fichiers de test | tolérées et **nommées** ; dette à réduire, pas plafond acquis |
| 8 | Deux trous sur la **ceinture d'exclusion** (chantier voisin) | un aliment refusé revient deux cycles plus tard ; un aliment en plusieurs mots est tokenisé |

---

## 4. Les gestes humains

### ⚠️ G1 — une décision de configuration, qui dépasse la coordination
**Tant qu'un `node_modules` vit sous `supabase/functions/`, le poste est instable par construction.**
`supabase functions serve` surveille ce dossier, **n'a aucune option d'exclusion** (vérifié, CLI 2.67.1), et **recrée le
conteneur à chaque écriture** — or tout `deno test` ou `deno check` lancé depuis l'arbre servi y écrit son cache.
Mesuré : **32 détections et 9 recréations en quatre minutes**, et **quatre générations perdues**. La discipline du
créneau nommé fonctionne (**quatre générations, quatre 200, zéro recréation** sous gel) mais elle **réduit le nombre
d'écrivains sans supprimer la cause**.

### ⚠️ G2 — une décision : le parcours individuel n'a aucun banc de test
Aucun script du dépôt ne compose sur la lane solo ; tous passent par le foyer. Le vérifier demanderait d'écrire un appel
**portant un mot de passe**, ce qu'aucun agent ne fait sans votre mot. **Deux options** : vous jouez le cas, ou vous
autorisez l'écriture d'un banc solo. En attendant, ce point est **ROUGE avec sa cause**.

### ⚠️ G3 — une session ouverte dans le navigateur
Aucun agent n'entre de mot de passe. **Toutes les preuves d'écran restent ROUGE**, avec leur scénario écrit — sept points
pour la page Foyer, sept pour la page de suivi, plus le parcours de bout en bout. Le geste : ouvrir `localhost:5174`, se
connecter à une fixture, ne rien enregistrer. Fixtures prêtes, mot de passe `1234567` :
`qa1v.foyer@keeltest.dev` · `docs/keel/qa-fixtures/40-foyer-a5.sql` (jouée, idempotente) · `40-tracking-a7.sql` (écrite)
· la fixture `qa0903m` est **vivante en base** avec ses lignes de run.

### ⚠️ G4 — six migrations attendent un `db push`
`20260903120000`, `150000`, `180000` (chantier voisin) · `170000`, `172000`, `190000` (celui-ci). **Toutes appliquées
et vérifiées en local.** ⚠️ L'une compte des **lignes réelles** dans son bloc de contrôle : sur la base distante elle
mesurera les siennes, pas celles d'ici.

### ⚠️ G5 — les décisions produit restantes
Les cinq gestes Stripe de FF-049 · `enable_confirmations` au Dashboard Auth avant la prod.
**Le montant du profil réclamé n'est PAS à trancher** : il est fixé à **1,99 €** depuis le 1er septembre. Sept lignes de
fiche portaient encore 2,00 €, **dont le geste qui dit quoi taper dans Stripe** — corrigé.

---

## 5. Ce que la journée a appris

**Sur la preuve**
- Une **affirmation d'absence** n'est valide que si la recherche **pouvait, en principe, trouver la chose** (un champ
  qui voyage dans un `...spread` est invisible à `grep`).
- **Et cette règle ne vaut que si on l'applique en croyant ne faire que « signaler »** — c'est en **transmettant** qu'on
  baisse la garde. Les neuf erreurs de l'orchestrateur sont toutes de cette forme.
- Un **correctif** se prouve par un test qui **rougit sur le défaut exact** qu'il a laissé passer, pas par un test vert.
- Une **mutation qui ne rougit pas** doit être suspectée **avant** le test qu'elle prétend éprouver.
- Un **test de source qui recopie le code** ne le vérifie pas, il le **photographie** — et un test de câblage est une
  **relecture d'entrée** : il ne peut pas voir que la sortie est vide.
- **Recopier une phrase de document est plus dangereux que recopier du code** : une source documentaire a l'air d'une
  autorité.
- **La cohérence entre documents n'est pas une preuve** : plus un texte est proche du code, plus il est **crédible**,
  sans être plus **vrai**.
- **Une méthode de preuve qui aggrave la condition qu'elle mesure n'est pas une méthode.**

**Sur les gardes**
- Un **champ requis** rougit chez celui qui l'introduit ; un **champ optionnel** ne rougit jamais — et peut **faire
  mentir un instrument de mesure**.
- **Deux compensations qui se recouvrent ne sont pas redondantes** : celle qui a tenu observe une **sortie**, pas une
  **entrée**.
- **Une leçon apprise sur un cas ne se propage pas seule à ses voisins** : il faut les chercher.

**Sur l'outillage partagé**
- **`git commit` valide l'index entier**, et un pathspec protège l'index, **pas l'arbre**.
- **`git revert -m 1`** défait le contenu et laisse les commits **ancêtres** : un rebase les saute ensuite en silence.
  La vérification n'est pas `--is-ancestor`, c'est `git diff <commit>^ <HEAD> -- <ses fichiers>`.
- **`git merge-tree`** vérifie une fusion **sans écrire un octet**.
- **`git status` dit ce qui est modifié ; les horodatages disent si ça bouge encore.**
- **« Arrêté » ne se décrète pas, se mesure** : un agent ne lit un message qu'**entre** deux appels d'outil.
- Un **diagnostic exact** peut rester **inutilisable** s'il s'arrête au mécanisme : chercher **le déclencheur**.
- Et **deux personnes peuvent mesurer deux choses différentes en croyant mesurer la même** — j'ai lu un journal de
  serveur figé en croyant lire la pile vivante.

---

## 6. La passe finale de cohérence (E) — et ce qu'elle a démenti

**Gate final : exit 0.** `5 119` tests serveur / 0 échec · `2 249` tests front, 4 rouges tous en baseline, **0 hors
liste** · **`87 erreurs tolérées pour 87 réelles`** — la tolérance vaut désormais **exactement** le réel, les deux
avertissements « abaisse cette ligne » ont disparu. Les cinq blocs délimités du chantier sont **consolidés** : zéro
délimiteur, tous les motifs gardés (retraits listés, valeurs changées, renversements datés).

**La grille des huit invariants : 28 clauses — 19 prouvées, 6 non prouvées, 3 DÉMENTIES.**

| | verdict |
|---|---|
| **C1** la fenêtre | 2/3 — la branche « veille » a **0 ligne en base** (`lead_days = 0` sur 254/254) |
| **C2** la jointure cuisine | 2/3 — 4 runs, aucune préparation orpheline, aucune consommée avant cuisson |
| **C3** les courses | 3/4 — **« vagues = sessions » DÉMENTI**, retrouvé indépendamment |
| **C4** les personnes | 2/3 — part et coches du réclamé prouvées en SQL sur run réel |
| **C5** les ceintures | 2/4 — deux clauses prouvées **bilingues** ; une n'a **aucun test de rendu** |
| **C6** les deux surfaces | 🔴 **DÉMENTIE** — le cadenas nommé ne lit qu'une des deux |
| **C7** l'entonnoir | **5/5** — réserve : `canGenerate` n'est armée par **aucun test** |
| **C8** le foyer à deux comptes | 3/5 — trois clauses prouvées sur run réel, une démentie |

**Quatre défauts neufs, nommés et non réparés** (les lanes étaient closes) :
- **D-E-1** — `buildSessionQuestion` n'a **pas** de garde « maître seulement », et son **troisième appelant** n'est pas
  gardé : la question de cuisson peut atteindre un membre, ce que D8.6 interdit.
- **D-E-2** — l'invariant C6 : le cadenas censé garantir que l'aperçu et le plan validé rendent la même chose **ne lit
  qu'une des deux surfaces**.
- **D-E-3** — des clés de durée orphelines, sans garde d'absence.
- **D-E-4** — `lint:i18n` rouge à 94, **antérieur mesuré des deux côtés**, hors du gate, **~91 faux positifs**.

**Et deux fois où l'agent s'est trompé puis s'est refermé par la mesure** : un rabotage de fenêtre qu'il croyait
possible (le code refuse, et **son commentaire nommait déjà son raisonnement**), et un compteur à zéro qu'il croyait
mort (la clé n'est demandée que sous régime déclaré).

**Une réserve de poste, déclarée plutôt que tue** : le commit de consolidation i18n **emporte neuf lignes** du lot
« envie » d'une session voisine — **indissociables** d'un commit de ces deux fichiers, puisqu'un pathspec protège
l'index mais pas l'arbre. Déclaré dans le message du commit, au rapport, et à la session concernée.

---

## 7. 🔴 Un défaut hors périmètre, trouvé par une session voisine, à traiter en priorité

**Le verdict nutritionnel se trompe dans deux directions opposées.** Même analyseur, même fixture, même enveloppe qu'au
23 août : une journée servie à **3 571 kcal** est jugée **`within`** sur une enveloppe **2 414-2 668**, et une protéine
à **175 g** est jugée **`under`** sur un plancher à **131 g**.
**Et la sous-nutrition d'août n'a pas été corrigée — elle a été REMPLACÉE par une sur-nutrition de 34 %.**
Second symptôme, même chaîne, même soir : une fenêtre de **3 jours** ne produit que **2 journées** de repas (août :
3/3), à résolution 79/79 — pas un artefact.
⇒ **Une garde qui rend le mauvais verdict est pire qu'une garde absente, parce qu'elle rassure.**

**Ce n'est pas ce chantier, et c'est mesuré** : zéro occurrence de `verdictFor`, `meal_verdict`, `meal_envelope` ou
`portion_scaling` sur les cinq branches ; le seul fichier proche ouvert (`mouth_anchor.ts`) ne porte **aucune ligne
non-commentaire** dans le diff et **`SLOT_DAY_WEIGHT` est inchangé**.

**Une bonne nouvelle du même relevé** : la garde d'allergie **mord**, prouvée par **contrefactuel** — 17 occurrences
d'« egg » et deux plats sans contrainte, **0** avec une allergie médicale, menu entier reconstruit sur la même fixture.
C'est la seule forme de preuve qui distingue une garde qui mord d'une garde qui a de la chance.
