# LOT 8 · familles ① et ② — ce qui a été lancé, et ce que ça rend

## Les trois fichiers

| Fichier | Cas | Commande | Verdict |
|---|---|---|---|
| `supabase/functions/_shared/keel/lot8_identite_test.sql` | 39 | `docker cp … && psql -v ON_ERROR_STOP=1 -f /tmp/t.sql` | 39/39 |
| `supabase/functions/_shared/keel/lot8_autorisation_test.sql` | 32 | idem | 32/32 |
| `supabase/functions/_shared/keel/lot8_autorisation_test.ts` | 9 | `deno test --allow-read --allow-env <fichier>` | 9/9 |

Commande SQL complète :

```bash
docker cp supabase/functions/_shared/keel/lot8_identite_test.sql \
  supabase_db_Sophia_2:/tmp/t.sql && \
docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f /tmp/t.sql
```

## Preuve que le harnais RLS mesure quelque chose

Deux gardes, dans le fichier lui-même :

- `① sans jeton, la table ne rend RIEN` — si le changement de rôle
  n'avait pas pris, la lecture se ferait en superutilisateur et rendrait toute
  la table. Ce cas est le témoin.
- Mutation contrôlée (hors dépôt) : inverser l'attente d'UN cas
  (`Alice NE LIT PAS le plan PERSONNEL du maître`, `false` → `true`) fait
  rougir le fichier avec `lu=0 attendu=1`. La lecture est donc réelle.

## Ce que ces tests NE prouvent pas

- **La vraie concurrence.** Deux sessions Postgres ne partagent pas une
  transaction non commitée. Le fichier prouve le verrou (position dans
  `prosrc`) et l'index unique (il mord), pas une course.
- **Le comportement HTTP des fonctions edge.** Ni `Deno.serve` ni un handler
  ne sont exportés. Les cas ④ et ⑤ du fichier TypeScript lisent la source, et
  chacun dit ce qu'il mesure : un ORDRE, ou un IMBRIQUEMENT.
- **Le taux empirique de réussite après réparation.** Hors périmètre (§ 10 du
  chantier).

## Observation annexe

`supabase/functions/_shared/keel/draft_adopt.ts` (`adoptDraft`, 503 lignes,
avec sa propre porte par propriétaire) **n'a AUCUN appelant vivant** — seul
`draft_adopt_test.ts` l'importe. L'adoption réelle passe par
`generate-household-meal-v1` (`adoptingDraft`, ligne 1697), donc par
l'admission commune. C'est bien ce que le test ④ mesure. Si quelqu'un rebranche
`adoptDraft` derrière un endpoint à lui, il lui faudra sa propre admission.
