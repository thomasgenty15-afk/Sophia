# Prompt — lot 30 : la grille de prix du référentiel, France et États-Unis

## Pourquoi ce lot existe

Le produit laisse une personne poser un **budget**. Aujourd'hui il l'affiche et
**ne peut pas le vérifier** : vérifié le 2026-08-21, il n'existe **aucun prix
d'aliment** dans la base. Les colonnes `cost_*` du schéma sont des coûts
d'infrastructure — LLM, WhatsApp, Stripe.

Le budget est donc exactement là où l'énergie se trouvait avant le référentiel :
une contrainte qu'on montre et qu'on ne sait pas compter.

⚠️ **Et c'est la SEULE porte du produit qui dépend de l'échelle.** Le coût vaut
`Σ q × prix` : il est de degré 1. La densité et la protéine sont des rapports —
elles se jugent sur la composition, avant le dimensionnement. **Le budget se juge
sur les grammes réels, après.**

## Ce qu'il faut produire

Une valeur de **coût moyen pour 100 g** sur les **923 lignes** de
`food_composition_refs`, en **deux colonnes** :

| colonne | marché |
|---|---|
| `price_eur_per_100g_fr` | France |
| `price_usd_per_100g_us` | États-Unis |

## ⛔ POURQUOI DEUX COLONNES, ET PAS UNE À CONVERTIR

**Le prix est la seule valeur de ce référentiel qui dépend du LECTEUR.** La
composition d'un aliment ne change pas d'un pays à l'autre : 100 g de lentilles
crues font 340 kcal à Lille comme à Denver. **Son prix, si** — et pas d'un facteur
de change : les écarts sont **structurels** (subventions agricoles, circuits de
distribution, saisonnalité inversée sur certains produits, taille des
conditionnements).

⛔ **Ne convertis JAMAIS l'une depuis l'autre.** Un taux de change appliqué à un
prix français produit un nombre qui a l'air d'un prix américain et n'en est pas
un. Les deux colonnes se remplissent **séparément, depuis des sources
séparées**.

Poser une colonne unique aujourd'hui obligerait à la redécouper plus tard sur
923 lignes, et personne ne saurait laquelle des deux valeurs y avait été écrite.

## ⛔ LE PIÈGE PRINCIPAL — LE PRIX EST CELUI DE L'ALIMENT **CRU**

`food_composition_refs` porte ses valeurs **pour 100 g CRU**, et la colonne
`yield_class` sert à passer au poids prêt. **Le prix doit suivre la même
convention.**

```
100 g de riz CRU        ->  le prix de 100 g de riz sec en paquet
100 g de riz CUIT       ->  n'existe pas dans cette table, et ne doit pas y entrer
```

Un riz coté au prix du riz cuit apparaîtrait **2,6 fois trop cher** — et rien ne
le dirait, parce que le nombre resterait plausible. Même piège sur les légumes
secs, les pâtes, la semoule, et à l'envers sur les viandes qui perdent du poids.

⚠️ **Vérifie ce piège aliment par aliment sur les groupes concernés**, et dis dans
ton rapport combien de lignes il touchait.

## Les autres pièges, nommés

**① L'écart de prix couvre quatre ordres de grandeur.** Les lentilles sont à
~3 €/kg, le safran à ~30 000 €/kg. **Une bande de plausibilité par
`food_group_ref`** est donc obligatoire : hors bande, on ne écrit pas — on signale.

**② Un prix juste peut être sans intérêt.** Le safran a un prix vrai et une
quantité typique de 0,1 g. Ce qui compte pour un panier, c'est
`prix × quantité typique`. La table `food_composition_refs` porte déjà
`condiment_grams` — **utilise-la pour ta contre-épreuve de plausibilité**, pas
seulement le prix au kilo.

**③ `unit_grams` n'est rempli que sur ~7,6 % des lignes.** C'est une raison de
plus de coter **pour 100 g** et jamais à la pièce : la pièce n'est pas
renseignée.

**④ Le prix a une DATE.** Une grille de 2026 ment en 2028. Chaque valeur porte sa
date de relevé et sa source. Sans ça, personne ne saura quand la rafraîchir.

## ⛔ Les interdits

- ⛔ **N'invente aucun prix.** Si tu n'as pas de base sérieuse pour une ligne,
  laisse `null` et **compte-la**. Une valeur inventée est indiscernable d'une
  valeur relevée, et elle ne sera jamais retrouvée.
- ⛔ **N'écris pas directement dans `food_composition_refs`.** Sas d'abord, revue
  ensuite — même patron que le lot 18.
- ⛔ **Pas de conversion entre les deux colonnes.** Voir plus haut.
- ⛔ **Pas de matcher, pas de rapprochement par ressemblance de texte** pour lier
  un aliment à une source de prix. Ce dépôt l'a mesuré à 12 faux positifs sur 12.

## Les sources

Sers-toi de **moyennes publiées**, pas de relevés d'une enseigne unique :

- **France** — INSEE (indices et prix moyens de détail), FranceAgriMer, relevés
  d'observatoires publics ;
- **États-Unis** — BLS *Average Price Data*, USDA *ERS Food Price* et
  *Food Prices Database*.

Pour ce qui n'est couvert par aucune de ces sources — produits transformés,
préparations, spécialités — dis-le, donne ton estimation **avec un niveau de
confiance explicite**, et laisse la revue trancher.

## Contraintes de ce dépôt

- **Migrations** appliquées par
  `docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f <fichier>`,
  puis enregistrées à la main dans `supabase_migrations.schema_migrations`.
  ⛔ `supabase db reset` et `db push` sont **interdits**, même en local.
- **Toute table neuve** : `revoke all ... from anon, authenticated` **dans la
  même migration**, et **réclamée par le lifecycle RGPD**.
- ⛔ Pas de `functions deploy`, pas de `secrets set`, pas de `link`. Si tu en as
  besoin : **donne la commande, ne la lance pas.**
- ⚠️ **Jamais `unicode_escape` pour insérer du texte accentué** — ce dépôt a déjà
  payé le mojibake que ni `tsc` ni les tests de parité n'attrapent.
- ⚠️ N'exporte pas de variables `SUPABASE_*` dans le shell avant de lancer la
  suite de tests : 114 faux rouges.

## Ce que je veux en sortie

1. **La migration** : deux colonnes de prix + leur date + leur source, `revoke` et
   réclamation RGPD dans le même fichier.
2. **La grille**, en sas, avec par ligne : le slug, les deux prix, l'unité, la
   date, la source, le **niveau de confiance**.
3. **Les bandes de plausibilité par groupe**, calculées et écrites — c'est elles
   qui permettront de vérifier la grille suivante sans te relire.
4. **Le compte, par colonne** : combien de lignes cotées, combien laissées à
   `null`, combien hors bande signalées.
5. **Le rapport du piège cru/cuit** : combien de lignes étaient concernées,
   comment tu les as traitées.
6. **La liste des lignes que tu n'as pas su coter**, groupées par raison.

Nomme ce que tu n'as pas fait, et pourquoi.
