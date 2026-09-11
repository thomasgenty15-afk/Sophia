# Journal nutritionnel V1 — livraison

La migration est additive. Le contrat historique de `keel-tracking-v1` reste
disponible quand le corps de requête ne contient pas `version: 2`, ce qui permet
de livrer le serveur avant le frontend et de remettre l’ancien frontend si
nécessaire.

## Avant la livraison

Depuis la racine du dépôt :

```sh
deno test --allow-read \
  supabase/functions/_shared/keel/tracking_v2_test.ts \
  supabase/functions/_shared/keel/tracking_window_test.ts \
  supabase/functions/_shared/keel/tracking_window_io_test.ts

deno check \
  supabase/functions/_shared/keel/tracking_v2_io.ts \
  supabase/functions/_shared/keel/tracking_mutations_io.ts \
  supabase/functions/keel-tracking-v1/index.ts \
  supabase/functions/meal-photo-upload-v1/index.ts \
  supabase/functions/meal-energy-v1/index.ts \
  supabase/functions/keel-proactive-v1/index.ts

cd frontend
npx tsc -b --force --pretty false
npx vitest --config vitest.config.ts run \
  src/keel/pages/trackingPage.int.test.ts \
  src/keel/components/trackingDescribeDialog.int.test.ts \
  src/keel/i18n/parity.int.test.ts \
  src/keel/i18n/pageFrontier.int.test.ts
npm run build
```

Le build exige Node 20.19 ou 22.12 au minimum.

## Ordre de déploiement

Les règles de sécurité du dépôt imposent qu’un humain exécute lui-même les
commandes Supabase suivantes.

1. Appliquer la migration additive :

   ```sh
   supabase db push
   ```

2. Déployer les quatre fonctions qui lisent ou écrivent le nouveau contrat :

   ```sh
   supabase functions deploy meal-energy-v1
   supabase functions deploy keel-tracking-v1
   supabase functions deploy meal-photo-upload-v1
   supabase functions deploy keel-proactive-v1
   ```

3. Vérifier le serveur avec un compte de test avant de publier le frontend :

   - `version: 2` renvoie sept jours, la cible et l’historique du poids ;
   - une requête sans `version` renvoie toujours le contrat précédent ;
   - une description et une photo au même `meal_id` restent un seul repas ;
   - un jour sans plan ne contient aucun repas manquant ;
   - un repas extérieur passé expose les actions photo, description et repas sauté.

4. Publier le frontend avec la procédure habituelle du projet.

## Contrôles après livraison

Tester en français et en anglais, sur téléphone et ordinateur :

- navigation semaine précédente, suivante et retour à aujourd’hui ;
- repas prévu non confirmé, repas extérieur, repas sauté et saisie libre ;
- photo ou description datée d’un jour passé dans la limite de 14 jours ;
- correction de date, moment et relation au plan ;
- calories masquées et garde de restriction ;
- foyer avec portions individuelles ;
- courbe de poids sur une période supérieure à 30 jours ;
- question proactive absente quand la journée n’a pas de plan ou que le repas est déjà couvert.

## Retour arrière

Remettre d’abord l’ancien frontend. Il utilisera le contrat historique conservé
par `keel-tracking-v1`. Les colonnes et la fonction SQL ajoutées peuvent rester
en place : elles sont nullables, additives et ignorées par l’ancien lecteur.
Les fonctions Edge précédentes peuvent ensuite être redéployées si nécessaire.
