# L19b — comment rejouer la mesure

Tous les scripts importent le résolveur **de production**
(`supabase/functions/_shared/keel/food_composition.ts`) — jamais une copie.

## 1. Le décor : trois fichiers, extraits de la base locale

```bash
W=/tmp/l19b && mkdir -p "$W"
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc \
  "select coalesce(json_agg(r)::text,'[]') from (select slug, food_group_ref, label, source,
     ciqual_code, energy_kcal, protein_g, carbs_g, fat_g, fiber_g, omega3_marine, iron_source,
     calcium_source, iodine_source, zinc_source, b12_source, folate_source, yield_class,
     atwater_discount, energy_dense, unit_grams, condiment_grams
   from food_composition_refs order by slug) r" > "$W/refs.json"
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc \
  "select coalesce(json_agg(a)::text,'[]') from (select alias, slug from food_composition_aliases order by alias) a" > "$W/aliases.json"
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc \
  "select coalesce(json_agg(m)::text,'[]') from (select id, plan_kind, content_locale, dishes,
     preparations, shopping_list, pantry from student_generated_meals order by created_at) m" > "$W/meals.json"
deno run --allow-read --allow-write 01-extract.ts "$W"     # écrit terms.json
```

## 2. Les mesures

```bash
deno run --allow-read 06-nom-nu.ts "$W"            # les 150 paires FR/EN — LE SEUIL DU LOT
deno run --allow-read 07-modificateurs.ts "$W"     # ⚠️ à lancer DEPUIS CE RÉPERTOIRE (chemin relatif codé en dur)
deno run --allow-read 12-alias-morts.ts "$W"       # les alias que bySlug capture
deno run --allow-read 13-carte-de-resolution.ts "$W" > carte.txt   # à diffÉRER entre deux états
deno run --allow-read 11-sonde-termes.ts "$W" "pain complet grille" "wrap"
```

## 3. Les cinq épreuves d'une proposition d'alias

```bash
deno run --allow-read --allow-write 09-verifier-propositions.ts "$W"   # lit propositions.tsv
deno run --allow-read --allow-write 10-verifier-corrections.ts "$W"    # lit corrections.tsv
```

## 4. Les gardes livrées

```bash
deno test --allow-read --allow-env supabase/functions/_shared/keel/lot19b_complet_test.ts
docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - \
  < supabase/functions/_shared/keel/lot19b_aliases_test.sql
```

⛔ **`lot19b_complet_test.ts` est ROUGE à `HEAD`, exprès** : le volet ① vit dans
l'arbre de travail, pas dans un commit. Voir l'en-tête du fichier et la fiche `L19b`.
