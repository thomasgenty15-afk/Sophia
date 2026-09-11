# Preuves de la revue des deux tirs

- `entrees.json` : deux plans persistés, deux recettes brutes et extraits pertinents des prompts archivés ; aucun secret de connexion.
- `compteurs.json` : journaux déjà produits par ces deux requêtes.
- `referentiel.json` : photographie du référentiel local au moment de la revue, avec le sas de lecture ; pas une preuve d'immuabilité depuis l'exécution.
- `resultats.json` : relecture avec les fonctions de production, alertes de courses détaillées, contrefactuel petit-suisse.
- `versions.json` : SHA-256 des modules de mesure inspectés. Le rejeu importe le code du dépôt ; un code modifié peut légitimement donner d'autres résultats.

Depuis la racine du dépôt :

```sh
deno run --cached-only --allow-read scratchpad/2026-09-11-REVUE-CAMPAGNE/revue.ts scratchpad/2026-09-11-REVUE-CAMPAGNE/entrees.json scratchpad/2026-09-11-REVUE-CAMPAGNE/referentiel.json
```

Le contexte de `finalPlanGate` est réduit pour rejouer les seules alertes de courses ; ce script ne constitue pas un rejeu du handler ni une certification de couverture, sécurité ou protéines. Le contrefactuel ne corrige que l'identité du petit-suisse, à quantités constantes, sans génération ni nouveau dimensionnement. Sa ligne PERTE est un témoin inchangé.
