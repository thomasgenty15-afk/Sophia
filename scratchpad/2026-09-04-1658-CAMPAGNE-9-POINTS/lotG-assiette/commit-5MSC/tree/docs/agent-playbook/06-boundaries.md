# Agent Boundaries

## Zones Rouges

Jamais sans confirmation humaine explicite :

- migrations DB : creation, modification, drop
- secrets, env, configuration auth
- contrats : `route_decision.v1.ts`, `turn_frame.v1.ts`
- schemas Memory V2 : `memory_item.ts`, `memory_write_candidate.ts`, `memory_write_candidate.v1.ts`
- schemas SQL `supabase/migrations/*`
- desactiver ou skip un test : `it.skip`, `xit`, `describe.skip`, `vi.mock` sur core
- supprimer un test
- modifier `tests/real-personas/*/persona.md` ou `timeline.md` d'un persona deja en regime nominal

## Zones Jaunes

Autorise en Mode B, mais a signaler dans le rapport :

- modifier plus de 3 fichiers en une session
- ajouter une nouvelle dependance
- introduire un nouveau composant
- ajouter un script qui ecrit en base
- toucher au routing, safety, memory runtime ou confirmation flow

## Zones Vertes

Libre en Mode B si le rapport Mode A valide couvre le scope :

- corriger un bug local dans le scope valide
- ajouter un test de regression
- corriger un type ou un import
- refactor local non comportemental
- ajouter un scenario QA ou un rapport de run

## Regle D'Or

Fouille le repo, ne suppose jamais. Toute affirmation technique doit pointer vers le code avec `path:line`. La documentation aide a comprendre l'intention, mais le code fait foi.
