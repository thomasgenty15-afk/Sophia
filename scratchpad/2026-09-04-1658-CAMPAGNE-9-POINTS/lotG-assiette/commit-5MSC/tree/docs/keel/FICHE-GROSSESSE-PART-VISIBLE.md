# FICHE — la grossesse coerce le gramme INVISIBLE, et laisse la consigne VISIBLE dire l'inverse

**Ouverte le 2026-08-23, par le lot FF-A1 (épreuves de comportement sur les fils de sécurité
de la lane foyer). ⛔ RIEN N'A ÉTÉ RÉPARÉ : FF-A1 ajoute des épreuves, il ne touche aucun
fichier de production.**

---

## Le fait, mesuré

Banc : le vrai handler de `generate-household-meal-v1`, piloté en mémoire, prompt capturé
avant tout appel modèle (aucune génération). Foyer de deux bouches, `Ana` titulaire avec
`goal: fat_loss` et un corps, `Bo` sans compte. Deux runs, **identiques en tout sauf une
ligne `student_safety_constraints` `condition_ref='pregnancy'` sur Ana**.

Les deux prompts sont **rigoureusement identiques hors les blocs de grossesse eux-mêmes**.
Et dans les DEUX, la ligne de part écrite au modèle pour Ana est, mot pour mot :

```
- Ana: generous vegetables, full protein share, smaller starch share [height 168 cm; …]
```

C'est la forme de `fat_loss`. La comparaison le prouve : `Bo`, en `maintenance`, reçoit
`balanced share of every component`. La ligne EST dérivée de l'objectif — et elle n'est
**pas** coercée sous grossesse.

## Ce que ça veut dire

`index.ts:2797` applique bien `goalUnderConditionGate(goal, population)` — mais **seulement à
l'argument de `envelopeFor`**, c'est-à-dire à l'enveloppe d'énergie, qui ne gouverne le
GRAMME qu'**après** la réponse du modèle (pesée, ancrage). La coercition est donc réelle et
invisible.

Pendant ce temps, la **consigne que le modèle lit** dit à un modèle de composer moins
d'amidon pour une femme enceinte. Les deux moitiés du produit disent le contraire l'une de
l'autre, et c'est la moitié visible qui écrit le plat.

## Le second fait, et c'est celui qui a coûté le seuil de FF-A1

**Il n'existe AUCUNE sortie d'avant-génération qui porte la coercition** :

- le prompt : identique (mesuré ci-dessus) ;
- la trace `keel.household_meal.composition` : identique
  (`mode: per_portion`, `deltas: 0`, `residual_gaps_count: 0`) dans les deux runs ;
- aucune autre trace n'expose l'enveloppe.

Conséquence directe : **le fil `W12` ne peut pas être tenu par une épreuve de comportement
d'avant-génération.** Le tenir demande de piloter l'étape d'APRÈS la génération, donc de
fabriquer un plan entier valide qui passe toutes les ceintures. C'est un lot à part.

Tant que ce lot n'existe pas, `goalUnderConditionGate` sur la lane foyer est un
**champ déclaré par le modèle sans compteur** : coupé, il ne change rien qu'on puisse
observer, et un lot désarmé y ressemble exactement à un lot qui marche.

## Ce qu'il ne faut PAS faire

⛔ **Ne pas « réparer » en épinglant la source.** C'est exactement ce que FF-A1 a démontré
faux : `dietary_regime_solo_lane_test.ts:442` et `household_regime_belt_test.ts:673`
cherchent une chaîne dans le texte de `index.ts`, et la coupure `W1` désarme la hiérarchie
de régime **en ne changeant que l'ARGUMENT** — le littéral épinglé reste intact, la suite
reste verte.

## Les deux pistes, à arbitrer (produit, pas technique)

1. **Coercer aussi la ligne visible** — la forme de part écrite au modèle passerait par
   `goalUnderConditionGate` comme l'enveloppe. Cohérent, mais c'est une décision de contenu :
   une femme enceinte lirait alors une consigne différente de celle qu'elle a demandée.
2. **Exposer la coercition dans la trace d'avant-génération** (un compteur nommé, du type
   `condition_gate`), ce qui la rendrait mesurable — et donc gardable par une épreuve de
   comportement, sans rien changer au produit.

La ② est la moins engageante et rend la ① vérifiable. Aucune des deux n'est prise ici.
