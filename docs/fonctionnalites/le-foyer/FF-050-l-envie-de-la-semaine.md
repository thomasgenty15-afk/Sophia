# FF-050 · L'envie de la semaine

| | |
|---|---|
| **Identifiant** | `FF-050-l-envie-de-la-semaine` |
| **Statut** | 🟠 **En cours** — livrée **sur le disque et verte**, **non commitée** au 2026-08-10 (§11 n°1) |
| **Date** | 2026-08-10 |
| **Autorité produit** | [le-foyer/README.md](README.md) (F1) · [PIVOT-FOYER.md](../../keel/PIVOT-FOYER.md) §8.4 et §8.5 — ⚠️ **ses §8.1 à §8.3 sont périmés par cette fiche** · [CHANTIER-FOYER-PROFILS.md](../../keel/CHANTIER-FOYER-PROFILS.md) lot 5 |
| **Dépend de** | [FF-044](FF-044-la-bouche-sans-compte.md) (le rôle `owner` sur la ligne membre) |
| **Effort estimé** | livré — 0,5 jour |

---

## 1. Le problème

Le « conseil de famille » demandait à **chaque membre** de déposer son envie de
la semaine, et affichait qui avait parlé et qui s'était tu.

Deux fautes, et aucune n'est esthétique :

1. **La récolte par membre remet la charge mentale.** Un décompte « 3 personnes
   n'ont rien dit » se lit « il en reste 3 à relancer », quoi qu'en dise la copie
   à côté. On avait recréé, dans le produit, exactement la corvée qu'il promet
   de supprimer.
2. **Sophia arbitrant publiquement entre un parent et son enfant est un
   marécage.** Le produit n'a aucune autorité pour trancher qui l'emporte à
   table.

Et un troisième défaut, silencieux celui-là, a été trouvé à la livraison : la
colonne s'appelait `week_start` mais **acceptait n'importe quelle date**, et
l'écran y écrivait la date **du jour**. Une envie déposée lundi n'était donc
plus trouvée par une composition lancée mercredi (`where week_start = <jour de
départ>`). Le foyer recevait un plan qui **ignorait sa demande**, sans une seule
erreur nulle part. L'unique, lui, portait `(foyer, personne, semaine)` : « une
ligne par semaine » n'était vrai qu'en commentaire.

**Ce que ça coûte de ne rien faire.** Un foyer à qui l'on retire son envie sans
un mot cesse d'en déposer. Le canal se ferme, et avec lui la seule entrée par
laquelle la vie réelle du foyer atteint le plan.

## 2. Job stories

> **Quand** je prépare la semaine, **je veux** écrire en une phrase ce que les
> miens réclament, **pour que** le plan ressemble à ma maison sans que j'aie à
> interroger quatre personnes.

> **Quand** personne n'a rien demandé, **je veux** que le plan sorte quand même,
> **pour que** l'absence de réponse ne bloque pas le dîner.

> **Quand** j'écris mon envie lundi, **je veux** qu'elle serve encore si je
> compose mercredi, **pour que** la semaine soit la semaine.

## 3. Périmètre

### Dans le périmètre
- **Une** ligne de texte par foyer et par semaine, écrite par le compte maître.
- L'ancrage au **lundi ISO**, recalé par la RPC, à l'écriture comme à la
  lecture.
- Le bloc de prompt correspondant, **facultatif** : pas de ligne, pas de bloc.
- Le retrait de `mergeEnvies`, du décompte « qui a parlé / qui s'est tu », et de
  la consigne au modèle sur la façon de traiter le silence.

### Hors périmètre — engageant
- ❌ **Aucune récolte par membre.** C'est le sujet de la fiche.
- ❌ **Aucun décompte de silencieux.** Voir §1 point 1.
- ❌ **Aucun arbitrage en code.** Une seule phrase peut se contredire
  elle-même (« du poisson, mais pas de poisson jeudi ») ou contredire les règles
  de maison. On **ne tranche pas** dans le module : trancher en code produirait
  un arbitrage muet.
- ❌ **Aucun chemin qui lève.** Un générateur qui renvoie une erreur à une
  famille le samedi soir est un produit mort (PIVOT-FOYER §8.4).
- ❌ **Le produit ne répond jamais « impossible ».** §8.4 reste en vigueur.
- ❌ **La table ne devient pas une colonne sur `households`.** L'ancrage
  hebdomadaire est **la raison d'être** de la table : sans lui, rien ne
  distingue « Marc en a marre du poulet » écrit ce matin de la même phrase
  oubliée depuis six semaines, et le générateur la servirait pareil.

## 4. Le circuit

```
   LE COMPTE MAÎTRE
        │  « Léa veut des pâtes, Marc en a marre du poulet »
        ▼
   keel_household_submit_envy(p_week_start, p_body)
        refus nommés: not_authenticated · bad_week · bad_body (1..500)
                      no_household · NOT_OWNER
        │
        │  v_week := p_week_start − (isodow(p_week_start) − 1)   ← LUNDI ISO
        ▼
   insert … on conflict (household_id, week_start) do update
        │   l'unique est (foyer, SEMAINE) — plus (foyer, personne, semaine)
        ▼
   household_envy_submissions   (household_id, user_id, week_start, body)
        │                                  ↑ l'auteur reste attribuable
        │
        ▼   generate-household-meal-v1 lit LA ligne de la semaine
   buildEnvyBlock(line)
        line vide ou null  →  ""      ← pas de ligne, PAS DE BLOC
        sinon              →  un bloc, texte borné à MAX_ENVY_CHARS
        │
        ▼
   buildHouseholdPromptBlocks({members, envyLine, restrictions})
        rend `envyLineUsed: boolean`  ← pour la TRACE, pas pour l'écran
```

**Le point qui gouverne le dessin** : le silence n'a plus besoin d'être expliqué
au modèle. L'ancien bloc devait **dire** au modèle que l'absence de réponse est
un état légitime, parce qu'il listait des noms suivis de « n'a rien dit » — et
un modèle à qui l'on montre une case vide la remplit ou l'attend. Ici, pas de
ligne ⇒ pas de bloc : il n'y a rien à attendre, donc rien à expliquer. La règle
de survie est devenue **structurelle** au lieu d'être une consigne.

## 5. Modèle de données

`household_envy_submissions` **survit**, avec trois changements
(`20260810210000_household_envy_master_line.sql`) :

| Élément | Avant | Après |
|---|---|---|
| Unique | `(household_id, user_id, week_start)` | **`(household_id, week_start)`** |
| `week_start` | n'importe quelle date | **lundi ISO**, recalé par la RPC |
| Écrivain | n'importe quel membre | **le compte maître seul** (`not_owner`) |

`user_id` est **gardé** et non remplacé par `household_id` seul : une phrase que
tout le foyer lit doit rester attribuable — même règle que `created_by` sur les
règles de maison.

**L'ordre des opérations de la migration est une contrainte** : l'ancien unique
est retiré **avant** la normalisation, parce que recaler `week_start` peut faire
entrer en collision deux lignes qui coexistaient légalement.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | **Une ligne par foyer et par semaine, écrite par le maître** | Une seule personne gouverne le menu (F1). C'est ce qui supprime à la fois la relance et l'arbitrage public. |
| R2 | **`week_start` est recalée sur le lundi ISO, à l'écriture ET à la lecture** | Sans ça, une envie déposée lundi disparaît d'une composition lancée mercredi — sans erreur, sans trace, sans que personne comprenne pourquoi le plan ignore la demande. |
| R3 | **La RPC rend la semaine qu'elle a rangée** | L'appelant écrit un jour, la base range une semaine, et les deux doivent pouvoir se le dire. |
| R4 | **Le refus `not_owner` vit en base, pas à l'écran** | Une limite d'UI n'est pas une limite : un membre qui appelle la RPC directement doit se heurter au même mur que celui qui ne voit pas le champ. |
| R5 | **Pas de ligne, pas de bloc** | Un bloc vide invite le modèle à commenter une absence. |
| R6 | **La borne de longueur existe des DEUX côtés** | La base pose `household_envy_body_check` (500) ; `MAX_ENVY_CHARS` la reflète côté prompt parce que ce module peut être appelé avec du texte qui n'est pas passé par la RPC (un import, un test, un chemin futur). Un prompt de 20 Ko est un défaut que ce dépôt a déjà payé sur le composeur. |
| R7 | **`envyLineUsed` est une trace, pas un affichage** | « Pourquoi ce plan ne ressemble-t-il pas à ce que j'ai demandé ? » n'a pas de réponse trois jours plus tard si on ne sait pas si la demande a seulement été **lue**. Il remplace `spoken`/`silent`, partis avec le conseil de famille. |
| R8 | **Aucun chemin de ce module ne lève** | §8.4. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Personne n'a rien écrit | Le plan sort quand même, depuis les profils seuls. **L'absence de ligne est un état légitime**, pas une erreur. |
| Le maître écrit deux fois la même semaine | La seconde écriture **remplace** la première (`on conflict … do update`). Pas de doublon, pas d'accumulation. |
| Une envie vieille de six semaines | Jamais servie : la lecture est ancrée à la semaine en cours. C'est la raison d'être de la table. |
| La ligne se contredit elle-même | **Non traité en code, délibérément.** L'arbitrage reste au générateur, et il doit le **dire** — un foyer à qui l'on retire son envie sans un mot cesse d'en déposer. |
| La ligne contredit une règle de maison | Idem : la règle de maison gagne (elle passe par son verrou), et l'arbitrage doit rester explicable. |
| Un membre non-maître appelle la RPC | `not_owner`. |
| Un membre ouvre l'écran | Il **ne voit pas** la ligne, même en lecture seule. La policy `for select` de tout le foyer reste ouverte : c'est l'écran qui ne rend rien. Voir §11 n°2. |

## 8. Critères d'acceptation

```gherkin
Étant donné un compte maître qui écrit son envie un mercredi
Quand la RPC est appelée avec la date du mercredi
Alors la ligne est rangée au lundi ISO de cette semaine
Et la réponse contient cette date de lundi
```

```gherkin
Étant donné une envie écrite lundi
Quand la composition est lancée le mercredi de la même semaine
Alors le bloc d'envies entre dans le prompt
```

```gherkin
Étant donné un foyer où personne n'a écrit d'envie
Quand la composition est lancée
Alors aucun bloc d'envies n'entre dans le prompt
Et la composition aboutit
```

```gherkin
Étant donné un membre qui n'est pas le compte maître
Quand il appelle keel_household_submit_envy directement
Alors le motif rendu est not_owner
```

## 9. Rabbit holes

- **Le décompte des silencieux qui « informe ».** Il n'informe pas : il assigne
  une tâche. C'est la faute d'origine.
- **Une colonne sur `households` au lieu d'une table.** Elle perd l'ancrage
  hebdomadaire, donc elle sert une phrase de janvier en mars.
- **Trancher la contradiction en code.** Un arbitrage muet coûte le canal.
- **Le retrait d'un chemin VIVANT.** Contrairement aux quatre fonctions mortes
  du lot 2, `mergeEnvies` était **appelée pour de vrai**
  (`household_meal_generation.ts`). Ce lot retire du code d'un chemin vivant,
  et c'est une catégorie de risque différente.
- **Renommer `week_start` sans recaler les données.** L'ordre de la migration
  (retirer l'unique, puis normaliser) est ce qui évite un `unique` refusé au
  milieu d'un `update`.

## 10. Ce qu'on mesure

- **La mesure :** part des semaines où un foyer dépose une ligne. C'est la
  santé du canal.
- **La contre-mesure :** part des plans où `envyLineUsed = true` **et** où le
  foyer relance une génération dans les 24 h. Une envie lue puis ignorée est
  pire qu'une envie jamais demandée.

## 11. Questions ouvertes

1. **⚠️ CE LOT N'EST PAS COMMITÉ** (2026-08-10). Il est terminé sur le disque et
   vert. Il change l'interface `envies → envyLine`, donc il **exige**
   `generate-household-meal-v1/index.ts` dans le même commit — et ce fichier
   importe `food_composition.ts`, non suivi, d'une session qui écrit **en ce
   moment**. Committer un chantier en vol serait pire que d'attendre. Tant que
   ce commit n'est pas fait, `HEAD` porte encore `mergeEnvies` et la récolte par
   membre.
2. **La ligne devrait-elle être visible en lecture seule par tout le foyer ?**
   Faisable sans toucher à la base : la policy `for select` est déjà ouverte à
   tout le foyer, c'est l'écran qui ne rend rien. **Question ouverte, pas
   décision fermée.**
3. **PIVOT-FOYER §8.1 à §8.3 sont périmés** par cette fiche. Le bandeau y a été
   posé ; §8.4 (les trois contraintes non négociables) et §8.5 (les deux
   autorités) **restent en vigueur**.
