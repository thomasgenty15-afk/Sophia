# Familly Bugs

## Objectif

Ce document est la base de suivi QA durable de Sophia Brain.

Les rapports de run (`qa-run-*`, `global-run-*`) racontent ce qui s'est passe
pendant une conversation. Les feuilles de bugs par run racontent ce que le run
a revele comme familles de bugs, quel owner doit corriger, comment le fix a ete
fait, et quels tests prouvent que la correction couvre la famille plutot qu'une
phrase exacte.

Le but est d'arreter de patcher dans le noir :

```txt
run QA -> bug family -> owner -> source amont -> fix contractuel -> tests -> statut
```

`test-material/15-chantiers-log.md` reste le journal des grosses decisions et fins de
chantiers. Les feuilles de suivi sont le registre fin, bug par bug.

## Emplacement Des Feuilles

Les feuilles par run vivent dans :

```txt
docs/agent-playbook/New/test-material/run-bug-sheets/
```

Convention de nom :

```txt
YYYY-MM-DD-<run-id>-bugs.md
```

Exemple :

```txt
2026-05-30-global15-arch-r1-bugs.md
```

Chaque nouveau run rouge ou jaune doit avoir une feuille associee. Un run vert
peut aussi avoir une feuille si des warnings faibles restent a suivre.

## Regle De Classification

Un bug ne doit pas etre classe par phrase exacte ou par symptome local du type
"T5 rate". Il doit etre classe par couche qui a failli :

- routing / ownership ;
- agenda / interruption ;
- intake / slots / contraintes ;
- reducer / state / confirmation ;
- effects / executor / ledger ;
- renderer ;
- status / recap / DB projection ;
- memory / preferences ;
- safety / proactive / testability.

Si plusieurs familles semblent possibles, l'agent doit choisir la source amont.
Exemple : une reponse visible fausse peut venir du renderer, mais si le
renderer parle depuis une projection DB incomplete, la famille est `BF-STATUS`.

## Taxonomie Canonique

La taxonomie contient 26 familles coeur et 3 familles transverses. Elle est
volontairement assez precise pour guider le fix, mais pas assez fine pour creer
une categorie par skill.

| Code | Famille | Source amont typique | Exemple reel observe |
| --- | --- | --- | --- |
| `BF-ROUTE-01` | Mauvais owner selectionne | dispatcher, arbitrator, route policy | demande carte capturee par `product_help`; recap capture par `update_coach_preferences` |
| `BF-ROUTE-02` | Ancien flow capture une nouvelle intention | active flow policy, interruption policy | potion active avale une demande de rappel ponctuel |
| `BF-ROUTE-03` | Product/status/tool mal priorises | arbitration product/status/tool | "ou annuler dans l'app" traite comme status ou mutation |
| `BF-ROUTE-04` | Safety ne preempte pas tout | safety pregate, safety router | contexte crise puis tool/reminder relance |
| `BF-AGENDA-01` | Multi-intention incomplete | TurnAgenda, final response pipeline | rappel cree mais sequence 10 min oubliee |
| `BF-AGENDA-02` | Interruption explicite mal restauree | TurnAgenda, owner handoff | "pas de potion" bloque l'effet mais ne redonne pas la bonne reponse |
| `BF-INTAKE-01` | Slot fourni mais redemande | intake, slot filler | heure/date/texte deja donnes, Sophia redemande |
| `BF-INTAKE-02` | Extraction trop large ou polluee | extractor, parser, intake | texte rappel = commande complete au lieu du message utile |
| `BF-INTAKE-03` | Contrainte explicite perdue | intake constraints | "sans creer", "pas de carte", "rien d'autre" ignores |
| `BF-INTAKE-04` | Ambiguite non reconnue | intake confidence, reducer gate | deux horaires possibles, creation directe |
| `BF-INTAKE-05` | Semantique composite aplatie | intake, canonical mapping | "action concrete d'abord" devient "moins de questions" |
| `BF-INTAKE-06` | Mauvais domaine semantique | conversation skill intake | honte relationnelle traitee comme productivite |
| `BF-STATE-01` | Mauvaise transition de flow | reducer local | draft -> create sans confirmation correcte |
| `BF-STATE-02` | Pending confirmation cible perdue | Confirmation Contract + reducer local | "oui" confirme le mauvais pending ou rien du tout |
| `BF-STATE-03` | Draft lifecycle casse | reducer, pending state | brouillon demande, mais creation DB ou pas de brouillon rendu |
| `BF-EFFECT-01` | Effet durable non consenti | effect gate, executor admission | carte creee alors que user dit "sans creer" |
| `BF-EFFECT-02` | Effet attendu absent | executor, writer, route-to-executor | annulation promise mais DB reste pending |
| `BF-EFFECT-03` | Payload durable faux | effect payload compiler | bonne operation, mauvais texte/heure/technique |
| `BF-EFFECT-04` | Executor ou fallback technique fragile | executor, fallback policy | `fallback_dashboard`, `tool_execution=failed` sur demande explicite |
| `BF-LEDGER-01` | Claim sans commit | EffectLedger, final response guard | "c'est fait/noté/programmé" sans effet DB |
| `BF-LEDGER-02` | Commit reel mal rendu | renderer, final response pipeline | rappel annule en DB mais reponse visible parle d'aide produit |
| `BF-STATUS-01` | Projection DB mal lue | status projection | status nie une preference enregistree |
| `BF-STATUS-02` | Historique incomplet | status history, effect trace | recap ne sait pas dire "cree puis annule" |
| `BF-STATUS-03` | Temps/localisation mal rendus | status renderer, timezone projection | UTC affiche au lieu de l'heure locale |
| `BF-MEMORY-01` | Promesse memoire non persistee | memory planner/writer | "garde ce repere" mais `memory_items=0` |
| `BF-PREF-01` | Preference non appliquee runtime | preference runtime policy | DB contient `tone=direct`, reponse garde emojis/questions |
| `BF-SAFETY-01` | Priorite ou desescalade safety incorrecte | safety skill, pregate, reducer | safety non imminent traite par normal/tool |
| `BF-PROACTIVE-01` | Daily/weekly preuve -> decision cassee | daily/weekly evidence/reducer/effects | low evidence applique, action faite reportee, patch sans confirmation |
| `BF-TEST-01` | Trace/test incoherent ou suite malsaine | tests, trace mapping | owner `normal_reply` mais effet tool execute; tests centraux rouges |

## Champs Obligatoires Par Bug

Chaque bug dans une feuille de run doit contenir :

- `Bug id` : stable dans la feuille, par exemple `R1-B03`.
- `Tours` : tours concernes.
- `Famille` : un code `BF-*`.
- `Domaine owner` : skill/tool/runtime qui doit corriger.
- `Source amont` : couche precise a inspecter.
- `Symptome visible` : ce que l'utilisateur voit.
- `Preuve systeme` : trace, DB, EffectLedger, pending, route_reason.
- `Correction attendue` : architecture visee, pas phrase exacte.
- `Statut` : `open`, `in_progress`, `fixed`, `verified`, `wont_fix`.
- `Fix reference` : PR/commit/chantiers-log/test.
- `Tests requis` : positif, paraphrase, anti-faux-positif, integration si utile.

## Lifecycle

```txt
open
  -> in_progress
  -> fixed
  -> verified
```

Definitions :

- `open` : observe en run, pas encore traite.
- `in_progress` : un agent travaille dessus.
- `fixed` : code/doc/tests modifies, mais pas encore reverifie en run reel.
- `verified` : un test cible ou run QA prouve la correction.
- `wont_fix` : decision explicite, avec justification et owner.

Une ligne ne passe pas en `verified` seulement parce qu'un test unitaire passe.
Il faut une preuve adaptee au risque : test contractuel, integration runtime, ou
rerun QA quand le bug etait conversationnel.

## Comment Utiliser Pendant Une Correction

Avant de coder depuis un run rouge :

1. Lire le rapport de run.
2. Ouvrir ou creer la feuille de bugs du run.
3. Classer chaque bug par famille.
4. Identifier l'owner et la source amont.
5. Lire le contrat runtime de l'owner.
6. Corriger au niveau de l'owner.
7. Ajouter les tests requis.
8. Mettre a jour la ligne de bug.
9. Ajouter une entree dans `test-material/15-chantiers-log.md` seulement pour un changement
   significatif ou une decision architecturale.

## Suivi Des Decisions Architecturales

| Date | Decision | Statut | Reference |
| --- | --- | --- | --- |
| 2026-05-30 | Creer une taxonomie canonique des familles de bugs QA et des feuilles de suivi par run. | Active | J67 |
