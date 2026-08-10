# FF-005 · Une course ou deux — l'élève choisit

| | |
|---|---|
| **Identifiant** | `FF-005-strategie-de-courses` |
| **Statut** | 🟡 Spécifiée — arbitrée le 2026-08-07, **révisée le 2026-08-10** (le jumeau front n'existe plus) |
| **Date** | 2026-08-10 |
| **Autorité produit** | [MODEL.md](../../keel/MODEL.md) · [PIVOT-FOYER.md](../../keel/PIVOT-FOYER.md) |
| **Dépend de** | `_shared/keel/grocery_waves.ts` (**la seule définition**) · `frontend/src/keel/api/groceryWaves.ts` (réexport + adaptateur de types, aucune règle) · `ShoppingListPanel` · [FF-004](FF-004-conservation-et-decongelation.md) |
| **Effort estimé** | 2 jours |

> ⚠️ **CE QUI A CHANGÉ SOUS CETTE FICHE, LE 2026-08-10.** Elle a été écrite dans
> un monde où la règle des vagues était écrite **deux fois** — une copie serveur
> et une copie écran, chacune avec son `MAX_FRIDGE_DAYS = 3`. Le lot 8 du
> [chantier foyer](../../keel/CHANTIER-FOYER-PROFILS.md) a supprimé le jumeau :
> `frontend/src/keel/api/groceryWaves.ts` importe désormais le module serveur et
> ne fait que réexporter (72 lignes, contre 248). `MAX_FRIDGE_DAYS` n'a plus
> qu'une définition, `meal_generation.ts:594`. Les passages qui parlaient du
> jumeau comme d'un fait acquis ont été corrigés ; **R6 a changé de sens** et
> n'est plus une contrainte de synchronisation mais une contrainte de test.

---

## 1. Le problème

Le produit a **une** stratégie de courses, et elle est bonne : les vagues.
Ce qui est périssable et cuisiné tard attend sa vague ; on fait deux courses, et
rien ne pourrit. `_shared/keel/grocery_waves.ts` l'implémente — **une seule
fois**, depuis le 2026-08-10 : l'écran importe ce module au lieu d'en recopier
l'algorithme.

Elle suppose une chose qui n'est pas vraie de tout le monde : **qu'une seconde
course en milieu de semaine est possible.** Pour qui habite loin, travaille en
horaires décalés, ou fait ses courses en voiture une fois par semaine, la
deuxième vague n'aura simplement pas lieu — et la moitié du plan tombe avec
elle, sans que rien ne l'ait annoncé.

Il existe une autre stratégie, tout aussi légitime : **une seule course, et on
congèle ce qui doit l'être.**

**Ce que ça coûte.** Aujourd'hui le produit impose une organisation de vie. Pour
la moitié des gens à qui il l'impose, c'est la mauvaise, et l'échec est
silencieux : ils ne diront pas « votre stratégie de courses ne me va pas », ils
arrêteront de suivre le plan à partir de mercredi.

## 2. Job stories

> **Quand** je fais mes courses le samedi en voiture pour toute la semaine, **je
> veux** une seule liste, **pour que** je n'aie pas à y retourner mercredi pour
> trois articles.

> **Quand** j'ai une supérette en bas de chez moi, **je veux** acheter le frais
> au dernier moment, **pour que** mes légumes soient encore bons vendredi.

> **Quand** je change d'avis, **je veux** basculer d'un mode à l'autre sans
> régénérer ma semaine, **pour que** ce choix ne me coûte pas mes repas.

## 3. Périmètre

### Dans le périmètre
- **Deux stratégies**, dont **les vagues restent le défaut** :
  - `waves` — l'existant, inchangé ;
  - `single_run` — une seule course, la conservation prise en charge par
    [FF-004](FF-004-conservation-et-decongelation.md).
- Le choix vit **avec l'élève**, pas avec le plan : c'est une propriété de sa
  vie, comme le rythme et la capacité de cuisine.
- Le basculement d'un mode à l'autre **sans régénération**.
- La stratégie `single_run` **contraint la composition** : elle exige des
  préparations congelables, ce qui n'est pas neutre pour le générateur.

### Hors périmètre — engageant
- ❌ **On ne supprime pas les vagues.** Décision du 2026-08-07, contre
  l'alternative « une course partout ». `grocery_waves.ts` est construit, testé
  et correct ; le jeter pour une stratégie qui n'a pas encore tourné en vrai
  contredirait la règle du dépôt : on ne mute pas ce qui marche.
- ❌ **On ne réécrit pas la règle côté écran.** `single_run` s'implémente dans
  `_shared/keel/grocery_waves.ts`, jamais dans `api/groceryWaves.ts` — ce
  fichier est un réexport depuis le 2026-08-10, et y remettre une règle
  reconstruirait exactement le jumeau qu'on vient de supprimer. Son en-tête le
  dit en toutes lettres : *« si tu ajoutes une règle ici, tu as recréé le
  jumeau »*.
- ❌ **La stratégie n'est pas déduite du contexte.** Ni du congélateur, ni de la
  distance des courses, ni de la durée du plan. Une déduction ici est invisible
  et invérifiable, et l'élève n'aurait rien à lire pour comprendre pourquoi sa
  liste a changé de forme. Il choisit, ou il garde le défaut.
- ❌ **Pas de troisième stratégie.** Pas de « livraison », pas de « drive », pas
  de « au jour le jour ». Deux modes, c'est déjà deux chemins à tester partout.
- ❌ **Aucun prix, aucun magasin, aucune enseigne.** La liste dit des articles
  et des rayons ; elle ne fait pas de commerce.

## 4. Le circuit

```
  CookingCapacityCard (ou carte voisine)
      │  « Comment tu fais tes courses ? »
      │    ○ Deux fois — le frais au dernier moment   ← défaut
      │    ○ Une seule fois — je congèle
      ↓
  student_goals.practical_constraints.grocery_strategy
      ↓
  ┌───────────────────────────────────────────────────┐
  │  À LA GÉNÉRATION                                  │
  │  single_run ⇒ la consigne exige des préparations  │
  │  qui SE CONGÈLENT sur les jours lointains         │
  │  waves      ⇒ consigne inchangée                  │
  └───────────────────────┬───────────────────────────┘
                          ↓
  Plan écrit — preparations[].keeps posé par FF-004
                          ↓
  ┌───────────────────────────────────────────────────┐
  │  À L'AFFICHAGE — ShoppingListPanel                │
  │  waves      → planGroceryWaves() (inchangé)       │
  │  single_run → une liste, avec la colonne          │
  │               « au congélateur en rentrant »      │
  └───────────────────────────────────────────────────┘
```

**Deux points d'application, et c'est le piège.** La stratégie touche la
**composition** (un plat non congelable ne peut pas être cuisiné dimanche pour
jeudi) *et* l'**affichage**. Un basculement après génération ne peut donc
changer que le second — voir R3 et §9.

## 5. Modèle de données

| Champ | Où | Origine | Note |
|---|---|---|---|
| `grocery_strategy` | `student_goals.practical_constraints` | **saisi** | `"waves"` (défaut) \| `"single_run"`. Absent ⇒ `waves`, ce qui rend le chantier additif. |
| `preparations[].keeps` | ligne du plan | dérivé — voir [FF-004](FF-004-conservation-et-decongelation.md) | C'est lui qui porte la conséquence réelle de `single_run`. |

Aucune colonne neuve, aucune table neuve. La stratégie n'est **pas** copiée sur
la ligne du plan : elle est relue à l'affichage, ce qui est précisément ce qui
rend le basculement sans régénération possible.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | Stratégie absente ⇒ `waves`, comportement identique à aujourd'hui | Additif. Personne ne voit son plan changer parce qu'on a livré ce chantier. |
| R2 | La stratégie est relue **à l'affichage**, jamais figée sur la ligne du plan | C'est ce qui permet de basculer sans régénérer. Une valeur recopiée sur le plan divergerait de la carte au premier changement d'avis. |
| R3 | Basculer vers `single_run` sur un plan **déjà composé** change la liste, **pas** les plats | Honnête : le produit ne peut pas rendre congelable un plat composé pour être mangé frais. L'écran doit le dire, et proposer la régénération comme un choix. |
| R4 | En `single_run`, une préparation dont l'écart de cuisson dépasse `MAX_FRIDGE_DAYS` **doit** être congelable | Sans ça, `single_run` est un mode qui promet une course et en exige deux. |
| R5 | `freezer` dans `equipment_out` ⇒ `single_run` est **indisponible**, et l'écran dit pourquoi | Proposer un mode infaisable est pire que ne pas le proposer. |
| R6 | La règle des deux stratégies s'écrit **une seule fois**, dans `_shared/keel/grocery_waves.ts`, et les deux portent les mêmes tests | ⚠️ **Cette règle a changé de sens le 2026-08-10.** Elle exigeait avant « les mêmes tests des deux côtés du jumeau » — une discipline qui ne survit qu'à la vigilance. Le lot 8 a supprimé le jumeau et l'a prouvé par mutation : `MAX_FRIDGE_DAYS` 3→4 rend 4 tests deno **et** 3 vitest rouges, là où l'ancien jumeau sous la même mutation laissait 16/16 vitest verts — l'écran serait resté à 3 jours pendant que le générateur planifie à 4. Une règle unique remplace une discipline par une impossibilité. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| `grocery_strategy` porte une valeur inconnue | Repli sur `waves`, **et une trace serveur**. Le silence ici ferait passer une faute de frappe pour un choix. |
| `single_run` mais le plan tient dans `MAX_FRIDGE_DAYS` | Une seule liste, aucune congélation. Les deux modes coïncident, et c'est normal : `wavesAreMeaningful` dit déjà quand la question ne se pose pas. |
| Basculement après génération | R3 : la liste change, les plats non. L'écran l'annonce **avant** le basculement, pas après. |
| `single_run` demandé, aucune préparation congelable produite | La génération n'échoue pas — elle **raccourcit les écarts** de cuisson. Un plan faisable en deux sessions vaut mieux qu'un refus. |
| L'élève n'a pas de congélateur et choisissait `single_run` avant de le déclarer | R5 : le mode redevient `waves`, l'écran le dit à la prochaine ouverture. Jamais un basculement muet. |

## 8. Critères d'acceptation

```gherkin
Étant donné un élève qui n'a jamais touché à la stratégie de courses
Quand il génère une semaine
Alors sa liste est découpée en vagues, exactement comme avant ce chantier
```

```gherkin
Étant donné un élève en mode "une seule course"
Et une semaine de sept jours qui demande de la viande fraîche jeudi
Quand il génère
Alors la liste de courses est unique
Et la viande de jeudi est marquée à mettre au congélateur en rentrant
```

```gherkin
Étant donné un plan déjà composé en mode vagues
Quand l'élève bascule en "une seule course"
Alors la liste devient unique sans régénération
Et l'écran l'avertit que les plats, eux, n'ont pas changé
```

```gherkin
Étant donné un élève qui a déclaré ne pas avoir de congélateur
Quand il ouvre le choix de stratégie
Alors "une seule course" est indisponible
Et l'écran dit que c'est parce qu'il n'a pas de congélateur
```

## 9. Rabbit holes

- **Deux stratégies, c'est deux fois la surface de test.** Chaque cas de courses
  se rejoue deux fois. C'est le coût assumé de l'arbitrage — mais il faut le
  porter dès le premier jour, pas après. *(Il ne double plus une troisième fois
  : depuis le 2026-08-10 il n'y a plus de jumeau front à tester séparément.)*
- **La tentation de rebrancher un calcul sur l'écran.** `api/groceryWaves.ts`
  est le fichier qu'on ouvre quand on veut « juste » adapter l'affichage à
  `single_run`. C'est là que le jumeau est né la première fois.
- **La stratégie contamine la composition.** C'est ce qui la distingue d'un
  simple réglage d'affichage, et c'est ce qu'on oublie en la câblant : on la
  branche sur `ShoppingListPanel`, tout marche, et on découvre trois semaines
  plus tard que `single_run` propose du poisson frais pour vendredi.
- **`wavesAreMeaningful` existe déjà** et dit quand le découpage n'apporte rien.
  Ne pas construire un second test de la même chose ; s'en servir.
- **Le foyer.** Une stratégie de courses est une propriété du **foyer**, pas de
  l'individu : deux personnes sous le même toit ne font pas leurs courses
  séparément. La fiche la range dans `student_goals`, ce qui est individuel.
  C'est la question ouverte n°1, et elle n'est pas cosmétique.

## 10. Ce qu'on mesure

- **La mesure :** part des repas cochés sur les **trois derniers jours** d'un
  plan, par stratégie. C'est le seul chiffre qui dise si la fin de semaine tient,
  et c'est exactement là que la deuxième vague manquante fait mal.
- **La contre-mesure :** part des élèves qui basculent de mode plus d'une fois
  par mois. Un va-et-vient dit que ni l'un ni l'autre ne leur convient, donc que
  le choix qu'on leur donne n'est pas le bon — et qu'on a construit deux
  chemins pour rien.

## 11. Questions ouvertes

1. **La stratégie est-elle individuelle ou du foyer ?** La fiche la range dans
   `student_goals`, donc individuelle. Pour un foyer, c'est probablement faux.
   À trancher avant de câbler, parce que déplacer la clé après coup demande une
   migration de données.
2. **Où se pose la question à l'élève ?** `CookingCapacityCard` est déjà chargée
   (jours, temps, difficulté, variété, budget). Une sixième question peut être
   celle de trop sur un écran qu'il vient voir pour composer.
3. **`single_run` doit-il apparaître avant le premier plan, ou seulement une fois
   que l'élève a vu ce que sont les vagues ?** Proposer un choix avant d'avoir
   montré ce qu'il change fait choisir au hasard.
