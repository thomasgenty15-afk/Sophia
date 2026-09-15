# Les huit chantiers — état au 2026-09-03 22:30, et ce qui attend un geste humain

**Journal complet** : [2026-09-03-1329-ORCHESTRATION-8-CHANTIERS.md](2026-09-03-1329-ORCHESTRATION-8-CHANTIERS.md)
**Branche** `ff-001-quotidien-du-coach` · **Cinq lanes ont terminé leur code.**

---

## 1. Les trois gestes humains, par ordre de blocage

### ⛔ G1 — Rendre de l'espace disque
`df -h /System/Volumes/Data` : **183 Gi utilisés, ~3 Gi libres sur 228**. Aucun instantané APFS à purger.
Déjà rendu par l'orchestrateur, sans rien perdre : **~4 Gi** (sondes de mesure, worktrees des deux lanes terminées,
second worktree de vérification). Il ne reste rien de sûr à retirer de mon côté : les copies de travail encore en place
portent du travail non fusionné, et `tests/real-personas` (426 Mo par copie) est **du contenu suivi par git**.
Ce qui est à vous : `~/Library/Caches` pèse **12 Go**, et 183 Gi sont occupés par du contenu hors dépôt.
**Pourquoi c'est bloquant** : une vérification en conditions réelles fait écrire un runtime edge, une base Postgres et un
navigateur. Un disque plein en cours de run ne rend pas un échec propre — il rend des résultats faux.

### ⛔ G2 — Ouvrir une session dans le navigateur
Aucun agent n'entre de mot de passe, ne forge de jeton, ne touche `auth.sessions` ni l'API admin d'authentification.
Le classifieur du harnais bloque de son côté la génération de lien magique. **Toute preuve d'écran derrière une garde
est donc consignée ROUGE** dans les six rapports de vérification.
**Le geste** : ouvrir `http://localhost:5174` (arbre principal) et `http://localhost:5209` (vérification), se connecter
avec une fixture, ne rien enregistrer. Les agents pilotent ensuite l'onglet connecté.
Fixtures prêtes, mot de passe `1234567` : `qa1v.foyer@keeltest.dev` (maître existant) ·
`docs/keel/qa-fixtures/40-foyer-a5.sql` — **déjà jouée, idempotente**, foyer `qa0903f` : Claire maître, Léa adulte
invitable, Tom mineur, Nour secondaire réclamé, une invitation vivante · `docs/keel/qa-fixtures/40-tracking-a7.sql`
(tag `qa0903s`, **écrite, non jouée**) : une fixture à objectif, une **sous plancher TCA**, une à 60 pesées.

### ⚠️ G3 — Trois décisions produit qui ne sont pas techniques
- **Le montant de l'accès supplémentaire** : 1,99 € (site) ou 2,00 € (FF-049 §7). Aucun écran ne recopie de montant,
  tous lisent `offer.extra` — mais le chiffre doit être tranché avant les gestes Stripe.
- **`enable_confirmations`** dans le Dashboard Auth, avant la prod (FF-048 §7) : plus de pouvoir au membre réclamé =
  plus de valeur à un lien volé.
- **Les cinq gestes Stripe** de FF-049, hors périmètre de ce chantier.

---

## 2. Où en est chaque lane

| Lane | Code | Fusionné | Vérifié |
|---|---|---|---|
| RAPIDE (A3 objectifs, A4 idées de repas) | ✅ | ✅ | ✅ **VERT** |
| FOYER A6 (le déjeuner quitte l'étape 3) | ✅ | ✅ | ✅ **VERT** |
| FOYER A5 (la page Foyer) | ✅ | ✅ | 🔴 **ROUGE — 2 défauts**, correctif en cours |
| CUISINE A1 (la veille dérivée) | ✅ | ✅ | ⏳ à vérifier |
| CUISINE A2 (style + courses) | ✅ | ⏸ bloqué | ⏳ en cours |
| MEMBRE A8.0 (le membre existe) | ✅ | ✅ | ✅ après correctif |
| MEMBRE A8.1 + A8.2 | ✅ | ✅ | 🔴 **ROUGE — 6 défauts**, tous fermés par A8.3 |
| MEMBRE A8.3 (le câblage d'écran) | ✅ | ⏸ bloqué | ⏳ à vérifier |
| SUIVI A7 (la page de suivi) | ✅ | ⏸ bloqué | ⏳ à vérifier |

**Ce qui bloque les trois fusions** : une session voisine (« la mémoire à trois destinations ») travaille sur le même
arbre et tient une vingtaine de fichiers non commités, dont les deux packs i18n. Son lot C est annoncé imminent.
Aucune urgence artificielle : mieux vaut attendre qu'hériter d'un lot à moitié posé.

---

## 3. Ce qui est livré, en français

**L'entonnoir** ne demande plus la durée d'une session de cuisine ni ne fait cocher « je cuisine la veille ». Il demande
**comment on veut cuisiner** (trois styles) et **combien de fois on veut faire les courses** (une à trois). Le reste se
dérive : le nombre de sessions, les jours de cuisine, les vagues de courses, et la veille elle-même — avec une coupure à
18 h tranchée **par le serveur**, parce que le navigateur ne connaît pas l'heure de la personne.

**La page Foyer** porte deux cadres nommés par personne (informations, préférences), les paramètres de la maison
rapatriés de l'entonnoir, et l'accès se demande depuis la ligne de chacun au lieu d'un menu séparé.

**Le membre à 1,99 €** existe enfin pour le produit : il reçoit le message du soir, coche sa propre part du plan du
foyer, déclare qu'il n'a pas mangé, et décide du sort de sa boîte — sans jamais déplacer le plan des autres.

**La page de suivi** remplace l'ancienne page morte : plans effectués, plans modifiés, total du jour avec sa base, les
six créneaux déclarés, et une courbe de poids.

**Retiré** : l'onglet « Idées de repas », la quatrième option d'objectif (l'option vide), et la carte du déjeuner de
l'étape 3.

---

## 4. Les trous connus, nommés plutôt que cachés

1. **Un plan de sept jours mangés n'a pas de veille automatique** — à cause de la façon dont les jours sont nommés en
   interne, pas de la base. Refus **nommé** à trois endroits, avec un test qui vérifie qu'ils disent la même chose.
   Levée : adresser les sessions par date plutôt que par jeton.
2. **« Décrire » un repas manqué n'enregistre aucune valeur d'énergie** — le dépôt n'a aucune fonction qui trouve une
   quantité **dans** une phrase libre. Refuser d'en inventer une était le bon geste ; le bouton fait moins que promis.
   Aucun chiffre faux n'en sort, aucun total ne baisse.
3. **Il reste deux formulaires de bouche au lieu d'un** : `persistMouth` n'a **aucun écrivain pour retirer une
   allergie**. Unifier aurait supprimé ce retrait, qui alimente les contraintes de sécurité du générateur.
   Le vrai correctif est un écrivain de retrait, hors périmètre.
4. **`shift_dish` n'a aucun exécuteur** dans le dépôt : l'action existe dans l'espace, rien ne l'exécute. « Tout le
   foyer » rend la main à FF-057 plutôt que de fabriquer un second chemin de réparation.
5. **Le bloc jour du maître ne rend pas la boîte d'un membre** : trois surfaces candidates, trois raisons distinctes.
6. **Deux erreurs de type de test** subsistent, antérieures au chantier, tolérées et nommées comme dette.

---

## 5. Ce que la journée a appris, et qui vaut au-delà d'elle

- **Un champ requis ajouté à un type partagé casse des fichiers que le mandat ne nomme pas.** Deux lanes l'ont payé.
- **Un champ optionnel ne désarme pas seulement une garde : il peut faire mentir un instrument de mesure.** Sans le
  champ, la version de prompt affirmerait quand même le nouveau millésime sur une population qui n'a jamais vu le bloc.
- **Vérifier que ça compile ne dit rien de ce que les tests affirment.** `--no-run` a laissé passer sept épinglages.
- **Trois textes concordants ne sont pas une preuve** : un bouton mort a été trouvé en capturant le rendu réel, contre
  l'analyse, le journal du bâtisseur, et le commentaire du fichier lui-même.
- **Une garde peut être « crue tenue »** quand deux gardes se recouvrent : une mutation qui ne rougit pas est un signal.
- **Sur un arbre partagé, `git commit` valide l'index entier** — `git add <chemin>` ne protège de rien.
- **Une migration de ce dépôt porte son propre `begin;`/`commit;`** : la « transaction annulée » l'applique pour de
  vrai, **et son bloc de contrôle passe quand même**. Doublement crédible, donc doublement cher.
- **« Juste mais non prouvé »** est une troisième catégorie, entre juste et faux, où se logent les régressions futures.
