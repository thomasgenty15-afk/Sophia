# Les huit chantiers — état au 2026-09-04 05:00, et ce qui attend un geste humain

Remplace [2026-09-03-2230-ETAT-ET-GESTES-HUMAINS.md](2026-09-03-2230-ETAT-ET-GESTES-HUMAINS.md), périmé.
**Journal complet** : [2026-09-03-1329-ORCHESTRATION-8-CHANTIERS.md](2026-09-03-1329-ORCHESTRATION-8-CHANTIERS.md)
**Branche** `ff-001-quotidien-du-coach` · **Les onze lots sont fusionnés. Le gate passe.**

---

## 1. Ce qui a changé depuis la version précédente

**Les tests en conditions réelles ont eu lieu.** Ils étaient annoncés « bloqués par des gestes humains » ; c'était faux,
et l'utilisateur l'a relevé. `supabase migration up` en local était permis depuis le début. Les six migrations sont
appliquées, le serveur de fonctions relancé, et **les runs ont trouvé trois défauts que toute la vérification statique
avait manqués** — dont un qui touche des données personnelles.

---

## 2. Les trois défauts trouvés par les runs, et eux seuls

### 🔴 P0 — l'export RGPD partait COMPLET, avec zéro ligne d'une table
Chaque déclaration d'une personne sur sa propre part — « je n'ai pas mangé », « au congélateur », « jetée » — était
**absente de son propre export**. Cause : la colonne de tri par défaut (`created_at`) n'existe pas dans cette table
(`answered_at`), PostgREST rendait une erreur, un `catch` la transformait en **tableau vide**, et un drapeau
d'indisponibilité **que personne ne lit** signalait le problème. **Corrigé.**
**Trois protections, trois angles morts** : les gardes du lot lisent le code, ce défaut ne se voit qu'à l'exécution ;
le test qui l'aurait vu était **gaté et n'avait jamais tourné** ; le drapeau n'a aucun lecteur.

### 🔴 Une consigne au modèle ne partait JAMAIS
Le générateur du foyer projetait une colonne inexistante ; un `catch` fail-open avalait le refus ; **le bloc du déjeuner
emporté n'atteignait jamais le modèle**. Et **le test de câblage recopiait la faute de frappe et la déclarait conforme**.
**Corrigé.** Ce qui a sauvé le lot est un **compteur** exigé en compensation d'un champ optionnel : le test a menti, le
compteur non.

### 🔴 Un membre pouvait cocher le plat d'un enfant
La bande du soir ne filtrait pas les plats par personne. Cause plus profonde que le filtre manquant : **le type serveur
ne portait pas l'identifiant de la bouche**, donc aucun lecteur ne *pouvait* filtrer et aucun contrôle de typage ne
pouvait signaler le manque. **Corrigé** (en attente de reprise, voir §4).

---

## 3. Les trois gestes humains

### ⚠️ G1 — une décision : le parcours individuel n'a aucun banc de test
Aucun script du dépôt ne compose sur la lane solo (`grep` = 0) ; tous passent par le foyer. Le vérifier demanderait
d'écrire un appel **portant un mot de passe**, ce qu'aucun agent ne fait sans votre mot. **Deux options** : vous jouez le
cas, ou vous autorisez l'écriture d'un banc solo (le dépôt en contient déjà pour le foyer). En attendant, **D6.1 est
consigné ROUGE avec sa cause**.

### ⚠️ G2 — une session ouverte dans le navigateur
Aucun agent n'entre de mot de passe. **Toutes les preuves d'écran restent ROUGE**, avec leur scénario écrit. Le geste :
ouvrir `http://localhost:5174`, se connecter à une fixture, ne rien enregistrer. Fixtures prêtes, mot de passe `1234567` :
`qa1v.foyer@keeltest.dev` · `docs/keel/qa-fixtures/40-foyer-a5.sql` (jouée, idempotente) ·
`40-tracking-a7.sql` (écrite, non jouée) · la fixture `qa0903m` est **vivante en base** avec ses lignes de run.

### ⚠️ G3 — trois décisions produit, inchangées
Les cinq gestes Stripe de FF-049 · `enable_confirmations` au Dashboard Auth avant la prod · et **six migrations
attendent un `db push`** (interdit à un agent) : `20260903120000`, `150000`, `180000`, `170000`, `172000`, `190000`.
⚠️ L'une d'elles compte des **lignes réelles** dans son bloc de contrôle : sur la base distante elle mesurera les
siennes, pas celles d'ici.
**Le montant du profil réclamé n'est PAS à trancher** : il est fixé à **1,99 €** depuis le 1er septembre. Mes fiches
portaient encore 2,00 € à sept endroits, dont le geste qui dit quoi taper dans Stripe — **corrigé**.

---

## 4. Ce qui reste en cours

- **Les runs de la lane cuisine** : R3, R8 et un cas d'A1 sont VERTS ; R6 corrigé mais **non prouvé** ; R1, R2, R4 en
  cours. **R1 n'est délibérément pas signé** : le chiffre mesuré est compatible avec deux configurations.
- **Un correctif en attente de reprise** (le filtre par bouche) : il touche `supabase/functions/`, **gelé** pendant les runs.
- **La vérification du dernier lot** (la page de suivi) tourne.
- **La passe finale de cohérence** attend la fin des runs.

**⛔ Le gel** : `supabase functions serve` **surveille `supabase/functions/` et recrée son conteneur à chaque écriture**.
Quatre runs ont été tués par nos propres commits, corrélation mesurée à la minute. Aucune écriture dans ce dossier
pendant un run.

---

## 5. Les trous connus, nommés plutôt que cachés

1. Un plan de **sept jours mangés** n'a pas de veille automatique (alphabet des jetons de jour). Refus nommé à trois endroits.
2. **« Décrire » n'enregistre aucune valeur d'énergie** : le dépôt n'a aucune fonction qui trouve une quantité **dans**
   une phrase. Aucun chiffre faux n'en sort, aucun total ne baisse.
3. Il reste **deux formulaires de bouche** au lieu d'un : `persistMouth` n'a aucun écrivain pour **retirer** une allergie.
4. **`shift_dish` n'a aucun exécuteur** : l'action existe, rien ne l'exécute.
5. Le **bloc jour du maître** ne rend pas la boîte d'un membre (trois surfaces, trois raisons).
6. **87 erreurs de typage** dans douze fichiers de test, tolérées et **nommées** — dette à réduire, pas plafond acquis.
7. Deux trous mesurés par le chantier voisin, sur la **ceinture d'exclusion** : un aliment refusé revient deux cycles
   plus tard, et un aliment en plusieurs mots est traité comme des mots indépendants.

---

## 6. Ce que la journée a appris

- **Une affirmation d'absence n'est valide que si la recherche pouvait, en principe, trouver la chose.**
- **Et cette règle ne vaut que si on l'applique aussi quand on croit ne faire que « signaler »** — c'est en transmettant
  qu'on baisse la garde. Mes sept erreurs sont toutes de cette forme.
- **Un correctif se prouve par un test qui rougit sur le défaut exact qu'il a laissé passer**, pas par un test vert.
- **Une mutation qui ne rougit pas doit être suspectée avant le test qu'elle prétend éprouver.**
- **Un test de source qui recopie le code ne le vérifie pas, il le photographie.**
- **Vérifier que ça compile ne dit rien de ce que les tests affirment ; vérifier ce qu'ils affirment ne dit rien de leur
  compilation.** Il a fallu payer les deux moitiés.
- **Un champ requis rougit chez celui qui l'introduit ; un champ optionnel ne rougit jamais** — et il peut faire mentir
  un instrument de mesure.
- **Deux compensations qui se recouvrent ne sont pas redondantes : elles ne mentent pas de la même façon.**
- **Un diagnostic exact peut rester inutilisable s'il s'arrête au mécanisme** : chercher le déclencheur, pas seulement
  le comment.
- **Sur un arbre partagé, `git commit` valide l'index entier**, et le pathspec protège l'index, pas l'arbre.
- **`git revert -m 1` défait le contenu et laisse les commits ancêtres** : un rebase les saute ensuite en silence.
  La vérification n'est pas `--is-ancestor`, c'est `git diff <commit>^ <HEAD> -- <ses fichiers>`.
