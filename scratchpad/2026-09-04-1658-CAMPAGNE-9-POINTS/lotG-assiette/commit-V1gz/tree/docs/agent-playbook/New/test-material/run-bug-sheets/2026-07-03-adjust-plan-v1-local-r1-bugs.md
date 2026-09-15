# Bug Sheet — 2026-07-03 adjust-plan-v1 local (r2, remplace r1)

Rapport source : `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-03-adjust-plan-v1-local-r1.md`

Résultat du run r2 (invocation directe, persona Nina) : **green 28/28** — les entrées
ci-dessous sont soit latentes (découvertes pendant la 1re campagne sur Rose),
soit hors scope du chantier (routage conversationnel).

## Bugs du domaine testé

| Passe | Famille | Owner runtime | Source amont probable | Correction recommandée | Tests d'invariant attendus | Statut |
| --- | --- | --- | --- | --- | --- | --- |
| Campagne r1 / Rose, preview (latent) | BF-EFFECT-04 | persistance plans (`adjust-plan-v1`, logique héritée de `generate-plan-v2`) + `_shared/error-log.ts` | `computeNextGenerationAttempt` = max(version, attempts)+1 écrit dans LES DEUX colonnes ; or la DB borne `generation_attempts <= 50` (CHECK 23514) et `version` n'est pas bornée. Chaque preview d'ajustement consommant une version, le compteur attempts suit la version et finira par crever le plafond (~50 régénérations cumulées), 500 générique. Déclencheur immédiat chez Rose : stub QA injecté à la main le 2026-06-12 (`version=101`, `attempts=0`, contenu vide). | **FAIT** : `buildPlanRow` découple les deux colonnes — `version` = ordre unique non borné (inchangé), `generation_attempts` = nombre d'essais LLM réels de cette génération (1-3), clampé défensivement à [1,50]. `generateValidatedPlanWithLlm` remonte le compte d'essais. Fix appliqué à `adjust-plan-v1` uniquement : `generate-plan-v2` n'est plus exposée (les ajustements — seuls à accumuler des versions — passent par la copie ; la génération initiale n'atteint jamais 50). | Fait : test deno `buildPlanRow decouples version from generation_attempts` (version 102 → attempts 1, clamp 999→50 / 0→1). Preuve E2E locale : preview Rose (v101 résiduel) → HTTP 200, ligne `version=102, generation_attempts=1` (était 500) | **FIXÉ** (commit à suivre) |
| Campagne r1 / Rose, scope plan (mineur, non reproduit en r2) | BF-EFFECT-04 (mineur) | prompt d'ajustement scope plan (copie `adjust-plan-v1` uniquement) | Tentative LLM 1 rejetée : temp_ids `gen-p2-*` conservés sur une phase renumérotée `phase_order=1` → retry automatique (latence doublée) | Dans le cadre d'ajustement du prompt (copie) : « si tu renumérotes les phases, les `temp_id` suivent le nouvel ordre `gen-p{ordre}-` » | Régénération scope plan avec renumérotation → tentative 1 valide | open (mineur) |

## Observations hors scope du chantier (routage conversationnel, campagne r1)

| Tour r1 | Famille | Owner runtime | Constat | Statut |
| --- | --- | --- | --- | --- |
| T1 | BF-ROUTE-01 | dispatcher global (`dispatcher.prompts.ts`) | Message de dérive du niveau (échec répété de l'habitude cœur + « je lâche le niveau ») classé `coaching_recommendation`, aucun signal `plan_realignment` émis | open — à traiter dans un chantier dispatcher, pas ici |
| T2 | BF-ROUTE-02 | active flow policy (`router/run.ts`, `active_flow_state`) | Flow coaching actif conserve la main sur un pivot explicite vers le réalignement (dispatcher global skippé) ; le texte pivote et l'orientation produit finale est correcte, mais `plan_realignment` n'est jamais owner | open — idem |

## Incidents d'environnement (pas des bugs produit)

- `supabase functions serve` en watch recrée le conteneur edge à chaque modification de fichier sous `supabase/functions/` → toute passe QA en vol est tuée (502 à ~7-10 s). Règle opérationnelle : ne pas éditer les fonctions pendant un run, ou couper le watcher pendant les campagnes QA.
- Stub `user_plans_v2` v101 (Rose, 2026-06-12) toujours présent en local — suppression recommandée (déchet de test, contenu vide, archivé).
