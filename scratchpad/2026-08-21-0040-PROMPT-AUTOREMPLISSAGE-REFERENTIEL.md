# Prompt — lot 18 : l'ingrédient inconnu ne condamne plus la journée

## Le problème, mesuré

`food_composition_refs` contient **923 aliments** et `food_composition_aliases`
**2 601 alias** — soit **2,8 façons de nommer un aliment**, ~1,4 par langue. Le
modèle écrit du texte libre. Il tombe donc régulièrement à côté.

Aujourd'hui, **un seul ingrédient non résolu rend la journée entière
incalculable** : la cible d'un plat se calcule contre l'énergie livrée sur toute
la journée, donc il suffit d'un raté sur trois repas pour que le facteur
d'ancrage s'abstienne et que l'assiette parte non corrigée.

Résultat mesuré sur la base vivante : **2,9 % de journées calculables en solo,
11,7 % en foyer**. Le taux par ingrédient qui produit ça est d'environ **86 %**
(`0,86^25 ≈ 0,03`) — un chiffre qui a l'air correct isolément, et que la
puissance 25 détruit.

**Ce lot supprime l'abstention tout-ou-rien.**

## Le flux à construire

```
plat écrit par le modèle
   -> le moteur résout chaque ingrédient contre refs + alias
   -> les résolus prennent leur valeur de la table          [source: table]
   -> les NON résolus sont ramassés ENSEMBLE
   -> UN SEUL appel court, petit modèle rapide (Haiku 4.5)
      entrée : la liste des textes inconnus + le groupe déclaré de chacun
      sortie : { kcal_100g, protein_g, carbs_g, fat_g, fiber_g,
                 food_group_ref, yield_class } par ligne
   -> ces valeurs servent au calcul                          [source: model]
   -> le plan CONTINUE
   -> chaque ligne inconnue part dans un SAS, avec un compteur d'occurrences
```

## Les quatre règles, et la troisième est dure

**1. Un seul appel par plan.** On ramasse tous les non-résolus et on envoie la
liste d'un coup. Un appel par ingrédient est un défaut de conception, pas une
optimisation manquée.

**2. Cet appel ne peut JAMAIS faire tomber le plan.** Timeout court, et en cas
d'échec l'ingrédient part avec la **borne de son groupe déclaré** (lot 17) :
un « légume » de 12 g vaut 1 à 12 kcal, on prend le milieu et on note le résidu.
Si cet appel devient un point de rupture, le lot a échoué — on aura seulement
déplacé le problème d'un cran.

**3. ⛔ IL CRÉE UN ALIMENT NEUF. JAMAIS UN ALIAS VERS UN ALIMENT EXISTANT.**
C'est la seule règle non négociable. Deux lignes `yuzu` en double sont
inoffensives — elles portent toutes deux des valeurs à peu près justes. Un alias
`laitue -> lait` remplace un aliment par un autre, pour tout le monde,
définitivement, et **ne ressemble pas à un bug : il ressemble à une donnée**.
Le dépôt a déjà mesuré ce mode d'échec à **12 faux positifs sur 12** (mémoire
`never-hand-roll-a-matcher-here`).

**4. Sas, pas écriture vivante.** La ligne va dans une table d'attente. La
promotion vers `food_composition_refs` est conditionnée :
- vu **≥ 3 fois** dans des plans distincts
- valeurs **à l'intérieur de la bande mesurée de son `food_group_ref`**
  (à calculer depuis la table existante, pas à inventer)
- toute ligne hors bande reste en sas et attend une revue humaine

## Les compteurs — obligatoires, pas optionnels

Un champ que rien ne compte est un lot désarmé qui ressemble à un lot qui marche
(mémoire `model-declared-fields-need-a-counter`). Quatre compteurs :

1. part de l'énergie d'un plan venant de la **table**
2. part venant du **modèle** (appel de secours)
3. part venant d'une **ligne promue** depuis le sas
4. **nombre d'inconnus par plan** — doit BAISSER semaine après semaine

Si (4) ne baisse pas, la table ne se remplit pas et on paie un appel de plus pour
rien. C'est le seul chiffre qui dit si le lot a réussi.

## Où ça se branche

- lecteur du référentiel : `supabase/functions/_shared/keel/food_composition.ts`
- énergie d'un plan : `supabase/functions/_shared/keel/plan_energy.ts`
- mise à l'échelle : `supabase/functions/_shared/keel/portion_scaling.ts`
- l'ancrage et ses raisons d'abstention : `supabase/functions/_shared/keel/mouth_anchor.ts`
- les deux lanes appelantes : `generate-meal-v1`, `generate-household-meal-v1`

⚠️ Les deux lanes partagent `buildMealPrompt` mais portent **deux
implémentations de `cible ÷ livré` qui ne partagent rien**. Regarde les deux
avant de décider où poser le repli, et dis laquelle tu as câblée.

## Contraintes de ce dépôt — à respecter, elles sont vérifiées

- **Migrations** : appliquées par
  `docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f <fichier>`,
  puis enregistrées à la main dans `supabase_migrations.schema_migrations`.
  ⛔ `supabase db reset` et `supabase db push` sont **interdits**, même en local.
- **Toute table neuve** : `revoke all ... from anon, authenticated` **dans la même
  migration** — les privilèges par défaut donnent TOUT à `authenticated`.
- **Toute table neuve** doit être réclamée par le **lifecycle RGPD** (export +
  suppression). Neuf tables y échappent déjà ; n'en ajoute pas une dixième.
- ⛔ Pas de `supabase functions deploy`, pas de `secrets set`, pas de `link`.
  Si tu en as besoin, **arrête-toi et donne la commande à copier-coller.**
- ⚠️ Le runtime edge sert un **cache périmé** des modules `_shared` : un fichier
  MODIFIÉ n'est pas rechargé. Redémarre `functions serve` avant tout run réel.
- ⚠️ `agent-gate` **ne lance pas vitest**. Si tu touches au front, lance
  `tsc -b --force` et les tests toi-même.

## Ce qu'il ne faut PAS faire

- ⛔ **écrire un matcher par ressemblance de texte** — c'est le mode d'échec
  documenté du dépôt, mesuré à 12/12 ;
- ⛔ **prendre la moyenne d'un groupe comme valeur** — `red_meat` va de 81 à
  744 kcal/100 g. Borner est permis (lot 17), estimer ne l'est pas ;
- ⛔ **demander un TOTAL au modèle**. Il donne une valeur par ligne ; le moteur
  additionne. Un total faux a l'air juste et personne ne le recontrôle ;
- ⛔ **écrire directement dans `food_composition_refs`** depuis le chemin chaud.

## Ce que je veux en sortie

1. La migration (sas + colonnes de compteurs), avec `revoke` et la réclamation
   RGPD dans le même fichier.
2. Le module de résolution, **pur et testé** : entrée liste de textes + groupes,
   sortie valeurs + `source` par ligne.
3. Le câblage dans la ou les lanes, avec le repli qui ne peut pas échouer.
4. Les quatre compteurs, écrits ET lus quelque part.
5. Des tests Deno qui couvrent : tout résolu · un inconnu · appel qui échoue ·
   appel qui rend une valeur hors bande · promotion à la 3e occurrence.
6. **Une mesure avant/après du taux de journées calculables** sur les plans déjà
   en base, avec la direction attendue nommée d'avance.

Nomme ce que tu n'as pas fait, et pourquoi.
