# FICHE — la brèche de régime est écrite, comptable en SQL, et AUCUN écran ne la regarde

**Ouverte le 2026-08-23, par le lot FF-A2 (épreuves de comportement sur les fils de
sécurité de la lane solo et du chat). ⛔ RIEN N'A ÉTÉ RÉPARÉ : FF-A2 ajoute des
épreuves, il ne touche aucun fichier de production.**

---

## Le fait, mesuré

La ceinture de régime de `generate-meal-v1` détecte une brèche (`W6c`), la compte dans sa
trace, et la pousse dans `issues` (`W6b`). **Les deux fils tiennent** — c'est exactement ce
que le lot vient de prouver par exécution, et une coupure de l'un ou de l'autre rougit
désormais.

`issues` a **deux destinations, toutes deux vivantes** :

| destination | ligne | vivante ? |
|---|---|---|
| la ligne en base, `student_generated_meals.generated_from.issues` | `generate-meal-v1/index.ts:3114` → `:3179` | ✅ écrite |
| le corps de la réponse HTTP | `generate-meal-v1/index.ts:3461` | ✅ renvoyé |

Et **aucun écran ne lit ni l'une ni l'autre** :

| module front | `grep -c issues` | ce qu'il en fait |
|---|---|---|
| `frontend/src/keel/api/mealGeneration.ts` — **lane solo**, documenté `:902` comme *« le SEUL chemin vers `GeneratedDish[]` »* | **0** | le champ ne traverse même pas la frontière de l'API |
| `frontend/src/keel/api/household.ts` — **lane foyer** | > 0 | il le **parse** (`HouseholdMealResult.issues`, `:1497` et `:1636`) |
| `frontend/src/keel/components/MealBuilder.tsx` — l'**unique** appelant de `generateHouseholdMeal` (`:789`) et de `generateMeal` (`:841`) | **0 occurrence de `.issues`** | il lit `result.ok` et `result.mealId`, jamais `result.issues` |

⚠️ **Le mandat de FF-A2 disait « la lane foyer les lit ». C'est vrai d'un cran seulement.**
La lane foyer les lit **jusqu'au module d'API** et s'arrête là : son seul consommateur ne
touche pas le champ. **Sur les DEUX lanes, aucune surface d'élève ne voit une brèche de
régime.**

## Ce que ça veut dire

Le contrôle existe, il mord, et il est **comptable en SQL** — c'est ce qui le sépare d'un
lot mort, et c'est déjà mieux que l'état d'avant (`:3174-3179` raconte que les `issues`
mouraient avec la réponse HTTP). Mais **personne n'est prévenu au moment où ça compte** :
un plan qui contient un plat en brèche de régime est composé, écrit, affiché — et l'élève
végane le lit sans un mot.

La conséquence est asymétrique et c'est ce qui la rend décidable : la brèche n'est pas
BLOQUANTE (elle n'annule pas le plan), donc son seul effet possible est **de se dire**. Un
diagnostic qui ne se dit nulle part n'a pas de moitié utile.

## Ce qu'il ne faut PAS faire

⛔ **Ne pas ajouter un lecteur « par symétrie ».** `issues` est un sac fourre-tout : il
porte aussi bien `dietary_regime_breach: …` que des plafonds silencieux volontaires
(`index.ts:318` : *« le plafond est SILENCIEUX pour l'élève mais COMPTÉ dans `issues` »*).
**Rendre le sac entier visible ferait sortir à l'écran des lignes que le produit a
délibérément tues.** C'est le geste qui transforme un diagnostic en bruit, après quoi on
apprend à ne plus le lire.

⛔ **Ne pas « réparer » en épinglant la source.** FF-A1 et FF-A2 ont mesuré le même défaut :
une épingle de chaîne (`assertStringIncludes` sur le texte de la lane) reste **verte** quand
la coupure ne change que l'ARGUMENT d'un appel.

## Les deux pistes, à arbitrer (produit, pas technique)

1. **Un canal séparé pour ce qui doit se dire.** Les brèches de sécurité (régime, allergène)
   sortent sous une clé à elles — pas dans `issues` —, et le front n'a qu'un lecteur, sans
   avoir à trier le sac. Coût : une clé de plus dans la réponse et sur la ligne.
2. **Un filtre au préfixe côté front**, qui ne rend que `dietary_regime_breach:` et laisse
   le reste muet. Moins cher, mais il fait vivre la politique d'affichage dans l'écran, là
   où personne ne la relira le jour où un troisième préfixe naîtra.

La ① est la seule qui survit à un préfixe de plus. Aucune des deux n'est prise ici : **ce
qui s'affiche à un élève en brèche de régime est une décision de produit**, pas un
correctif.

## Ce qui garde le fil en attendant

`supabase/functions/_shared/keel/safety_wiring_executed_test.ts` — les brèches sont
détectées (`W6c`) et écrites dans `issues` (`W6b`), prouvé **par exécution de la région
réelle**, avec un cas qui passe de chaque côté. La garde s'arrête à la sortie de la
fonction edge, et elle le dit dans son propre en-tête.
