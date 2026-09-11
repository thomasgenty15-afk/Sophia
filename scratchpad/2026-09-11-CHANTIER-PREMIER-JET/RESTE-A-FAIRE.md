# Ce que ce chantier laisse ouvert — liste tenue à jour

## ⛔ Demandé par le propriétaire le 2026-09-11 au matin

### R0 · Découper `generate-household-meal-v1/index.ts`

**15 714 lignes dans un seul fichier.** C'est le plus gros frein du dépôt, et il se paie à
chaque lot :

- le lot E ne peut pas tourner **en même temps** que les autres — un seul agent peut écrire
  dans ce fichier, donc tout ce qui le touche se met en file ;
- `plan_repair_loop.ts` est écrit, éprouvé, et **n'est branché qu'à moitié** ; son propre
  commentaire de tête dit pourquoi : « une refonte du corps du générateur, pas un
  rebranchement » ;
- la pesée a dû être « remontée au-dessus des rattrapages » par un déplacement de ~1 700 lignes
  (2026-09-11, lot 6) — un ordre d'exécution dans un fichier tenait lieu d'architecture ;
- `PLAN_REPAIR_RESERVED_AFTER` accordait des slots de rattrapage « dans l'ordre d'exécution du
  fichier » : déplacer un bloc rendait la table fausse **en silence**.

Ce n'est donc pas une question de goût : la taille du fichier **produit** des défauts mesurés.

**À faire dans un lot à part, après ce chantier**, et surtout pas pendant — découper pendant
qu'on change le comportement rendrait impossible de dire lequel des deux a cassé quoi.

Pistes de découpe, à valider : admission et contexte · construction du brief · appel modèle et
repli · parsing et gardes de sécurité · pesée et dimensionnement · boucle de réparation ·
application, boîtes et courses · écriture et réponse HTTP.

**Mesuré le 2026-09-11 06:18, et c'est pire que « un gros fichier » :** le fichier ne contient
que 14 déclarations de premier niveau. Les ~730 premières lignes sont des imports et des
constantes, une poignée d'aides suivent, puis **une seule fonction** :

```
1207:Deno.serve(async (req) => {
```

… qui va jusqu'à la fin. **Le corps de ce handler fait à lui seul ~14 500 lignes.** Il n'y a
donc rien à « ranger » : il faut extraire des fonctions d'un bloc unique, ce qui veut dire
nommer ses états intermédiaires — c'est le vrai travail, et c'est pour ça qu'il mérite son
propre lot.

## R1 · Le banc d'intégration à réponses contrôlées n'existe pas encore

Le §4 du chantier demande : « réponses fournisseur contrôlées passant par les vrais handlers
jusqu'au payload persisté ».

**Ce qui existe** (`_shared/gemini.ts:421-436`) : `MEGA_TEST_MODE=1` — actif **implicitement**
dès que la pile est locale — rend un texte bidon `MEGA_TEST_STUB: <200 premiers caractères de
la demande>`. C'est un stub de disponibilité, pas une réponse **contrôlée** : le parseur le
rejette, donc rien n'atteint le payload persisté.

**Ce qui manque** : pouvoir donner une réponse JSON précise (par exemple les six réponses déjà
archivées) à la place de l'appel fournisseur, par `source` et dans l'ordre — pour scripter
« génération, puis réparation 1, puis réparation 2 » sans payer un jeton.

**Contrainte** : l'isolat edge tourne dans Docker ; il ne lit que sous l'arbre des fonctions. La
réponse en conserve devrait donc vivre sous `supabase/functions/**`, et **être écrite avant** le
départ du run (écrire pendant tue le run — mémoire
`editing-functions-tree-kills-inflight-edge-runs`).

**Garde obligatoire si on le construit** : la branche ne doit exister QUE sous `MEGA_TEST_MODE`
déjà actif, et refuser tout runtime qui n'est pas la pile locale. Un chemin capable de servir
une réponse en conserve en production serait pire que l'absence de banc.

Tant que ce banc n'existe pas, « jusqu'au payload persisté » se prouve **soit** par un vrai
appel payant, **soit** par le rejeu hors ligne de `scratchpad/2026-09-11-ENQUETE-DEUX-DIRECTIONS/`
— qui s'arrête avant la fusion, les gardes de sécurité et l'écriture HTTP, et le dit.
