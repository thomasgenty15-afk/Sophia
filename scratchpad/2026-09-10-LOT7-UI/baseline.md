# Rouges AVANT toute modification (2026-09-10)

`cd frontend && npm exec -- vitest --config vitest.config.ts run`
→ Test Files 4 failed | 150 passed | 5 skipped (159)
→ Tests 5 failed | 2505 passed | 20 skipped (2530)

1. src/edge/coverage-guard.int.test.ts > all DB triggers are in the known list
2. src/keel/i18n/energyBasis.int.test.ts > l'inventaire des clés qui écrivent un kcal est CLOS
3. src/keel/copy/planRefusals.int.test.ts > couvre chaque jeton que les deux générateurs peuvent rendre
4. src/keel/copy/planRefusals.int.test.ts > n'invente aucun jeton que le serveur ne rend pas
5. src/keel/api/mouthProfileReaders.int.test.ts > `/app/progress` monte bien la carte des séances

Les 4 fichiers lisent `supabase/**` ou des inventaires que la session edge modifie
en ce moment. `scripts/.vitest-red-baseline` est VIDE (aucun rouge toléré déclaré).
