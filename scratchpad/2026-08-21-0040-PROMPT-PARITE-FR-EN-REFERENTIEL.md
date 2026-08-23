# Prompt — lot 19 : le référentiel doit marcher aussi bien en français qu'en anglais

## Ce qui est déjà mesuré — ne le remesure pas, pars de là

Au 2026-08-21, sur la base locale :

| mesure | valeur |
|---|---|
| `food_composition_refs` | **923** |
| `food_composition_aliases` | **2 601** — soit **2,8 formulations par aliment**, ~1,4 par langue |
| alias portant un marqueur français | 709 |
| alias portant un marqueur anglais | 692 |
| références sans **aucun** alias | 15 |

Les libellés sont **en anglais** (import CIQUAL traduit : `Pork tenderloin, lean,
raw`). Tout le français passe par la table d'alias.

⇒ **Les deux langues sont à égalité en volume.** L'hypothèse de départ n'est donc
PAS « le français est mal servi ». C'est **« aucune des deux n'est servie en
profondeur »**. Ton travail est de le confirmer ou de le renverser avec une
mesure sur des données réelles.

## Ce que je veux savoir, et que personne ne sait aujourd'hui

**Quel est le taux de résolution d'un ingrédient réellement écrit par le modèle,
en français et en anglais, séparément ?**

Tout le reste en découle. On connaît le taux au niveau de la JOURNÉE (2,9 % en
solo, 11,7 % en foyer) mais jamais au niveau de l'ingrédient.

## La méthode

1. **Extraire du texte d'ingrédient RÉEL**, jamais inventé. `student_generated_meals`
   porte ~180 lignes ; trouve aussi ce que stocke la lane foyer (portions,
   préparations, plats) — les deux lanes ne stockent pas pareil.
2. **Faire passer ces chaînes par le VRAI résolveur**
   (`supabase/functions/_shared/keel/food_composition.ts`), pas par une
   réimplémentation. Une mesure faite contre un résolveur maison ne mesure rien.
3. **Compter deux fois, et dire laquelle est laquelle** :
   - par chaîne **unique**
   - **pondéré par occurrences**
   Un même « poulet » répété dans 60 plans gonfle le second sans améliorer le
   premier. Les deux chiffres sont utiles, les confondre ne l'est pas.
4. **Déterminer la langue de la CHAÎNE, pas celle de l'utilisateur.**
   ⚠️ Piège réel de ce dépôt : `profiles.locale` vaut `fr-FR` par défaut, et la
   langue de sortie du modèle ne suit pas toujours la locale du compte. Regarde
   le texte, pas la fiche.
5. **Définir « résolu » UNE FOIS, avec son dénominateur, et l'écrire en tête du
   rapport.** Le lot −1 du design le demande déjà et personne ne l'a fait.
6. **Recalculer le taux journée attendu** depuis ton taux ingrédient
   (`p^n`, avec `n` = nombre médian d'ingrédients par journée, que tu mesures
   aussi). S'il ne retombe pas sur les 2,9 % / 11,7 % observés, **dis-le** :
   ça veut dire qu'un autre mécanisme abstient, et il faut le nommer.

## Ensuite seulement : proposer des alias

Cible : passer de **2,8** à **~8 formulations par aliment**, français et anglais.

**Chaque alias proposé doit être vérifié contre la ligne CIQUAL réelle** —
`label`, `ciqual_name`, `ciqual_code`, `food_group_ref` — et tu dois pouvoir dire
pourquoi il désigne bien cet aliment-là. Un alias plausible qui n'a pas été
vérifié est un alias faux qui n'a pas encore été découvert.

Priorise dans cet ordre :
1. les **15 références sans aucun alias**
2. les aliments qui apparaissent réellement dans les plans et qui **ratent**
3. les aliments courants dont la seule formulation est dans l'autre langue

## ⛔ Les trois interdits

**① N'écris pas de matcher.** Pas de distance d'édition, pas de trigrammes, pas
de « ça y ressemble ». Ce dépôt l'a mesuré : `laitue` matchait `lait`,
**12 faux positifs sur 12**. Un matcher ici ne se trompe pas parfois, il se
trompe toujours, et son erreur ressemble à une donnée.

**② N'applique rien tout seul.** Tu produis un **fichier de propositions** avec,
par ligne : l'alias, le slug visé, le libellé CIQUAL, et **la raison**. La
migration est écrite après revue, pas pendant ta passe.

**③ N'invente aucune valeur de composition.** Tu ajoutes des **noms**, jamais des
kcal. Les valeurs viennent de CIQUAL ou du lot 18, pas de toi.

## Signale aussi la qualité des données

L'import CIQUAL n'a pas été relu. Exemple trouvé le 2026-08-21 :

```
slug   : chinese_cabbageor_bok_choi          <- faute dans le slug
label  : Chinese cabbageor bok choï bredes, rods and leafs, steamed,
         from the island La                  <- coupé en plein mot
```

Compte combien de lignes sont dans cet état et liste-les. Un libellé tronqué ne
peut porter aucun alias correct, dans aucune langue.

## Contraintes de ce dépôt

- Lectures libres (`SELECT`, `psql` en lecture).
- ⛔ Pas de `supabase db reset`, `db push`, `functions deploy`, `secrets set`.
  Si une écriture est nécessaire, **donne la commande, ne la lance pas.**
- ⚠️ N'exporte pas de variables `SUPABASE_*` dans le shell avant de lancer la
  suite de tests : ça produit 114 faux rouges (mémoire `qa-env-exports-poison-the-suite`).

## Le rapport que je veux

1. **Le taux de résolution par ingrédient, FR et EN séparément**, en unique et en
   pondéré, avec la définition de « résolu » et son dénominateur écrits en tête.
2. **Le nombre médian d'ingrédients par journée**, et le taux journée recalculé.
3. **La réponse à la question** : le français est-il désavantagé, oui ou non, et
   de combien.
4. **Le top 30 des ingrédients qui ratent le plus souvent**, avec leur langue.
5. **Le fichier de propositions d'alias**, vérifiées une par une.
6. **La liste des lignes CIQUAL abîmées.**
7. Ce que tu n'as pas pu mesurer, et pourquoi.
