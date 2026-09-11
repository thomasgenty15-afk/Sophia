# Preuves de l’enquête du 11 septembre

Rapport : `docs/keel/ENQUETE-DEUX-DIRECTIONS-2026-09-11.md`.

Ces fichiers portent exclusivement sur les deux fixtures locales PERTE et GAIN. Les données sont exportées en lecture seule. Aucun appel modèle n’a été effectué par l’enquête.

- `preuves.json` : résultats consolidés, rapprochements alimentaires et empreintes du code figé pendant l’enquête.
- `traces.json` : les deux plans enregistrés et les sorties textuelles des six appels, dans l’ordre des événements. Les événements de démarrage ont un texte vide. Ni jeton de connexion ni réponse brute fournisseur.
- `composition.json` : référentiel et alias figés lors de l’enquête. Il ne s’agit pas d’un index historiquement enregistré par le run.
- `consignes.json` : métadonnées des appels et ajouts effectivement envoyés pour les réparations.
- `perte-sizing.json`, `gain-sizing.json` : événements réels de dimensionnement extraits des journaux.
- `rejouer.ts` : rejeu ciblé avec les fonctions du dépôt. Aucun accès réseau, aucune écriture en base.

Depuis la racine du dépôt :

```sh
deno run --cached-only --allow-read --allow-write=scratchpad/2026-09-11-ENQUETE-DEUX-DIRECTIONS scratchpad/2026-09-11-ENQUETE-DEUX-DIRECTIONS/rejouer.ts
```

Il écrit `results.json`, `stages.json`, `diagnostic.json`, `mappings.json` et `fruit-counterfactual.json` dans ce dossier. Les dépendances Deno doivent déjà être en cache.

Le rejeu emploie le parseur, les applicateurs et les mesures de production. Il reproduit les listes d’unités acceptées observées dans les journaux ; il ne réexécute pas toute la décision d’admission, les contrôles de sécurité, la fusion et le stockage HTTP. Les paramètres non alimentaires du parseur sont neutralisés. Ne pas en faire une validation de ces gardes.

Les kcal, masses et densités des 18 parts standards après la deuxième réparation sont confrontées aux journaux archivés. Si le code actuel ne les reproduit plus, le script s’arrête explicitement : examiner les changements avant d’interpréter les nouvelles mesures. Cela peut être attendu après une correction des défauts identifiés.

Les contrefactuels de fruits conservent les quantités enregistrées et changent uniquement les références de raisin/prune vers les références fraîches de cette base. Ils illustrent l’impact du rapprochement ; ils ne sont ni une nouvelle génération ni une mesure d’ingestion réelle. Le sens frais/sec doit être explicitement levé dans le produit.
