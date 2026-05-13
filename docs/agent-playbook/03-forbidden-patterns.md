# Forbidden Patterns

| Pattern | Bad | Good |
|---|---|---|
| Skip test | `it.skip(...)`, `xit(...)`, `describe.skip(...)` | Garder le test actif ou deplacer le scope explicitement dans un rapport Mode A. |
| Type escape | `as any` | Ajouter un type local, un schema, ou une fonction de narrowing. |
| Suppression TS | `@ts-ignore`, `@ts-expect-error` | Corriger le type ou isoler une declaration shim documentee. |
| Debug log | `console.log(...)` dans le diff | Utiliser l'observability existante ou un logger structure deja present. |
| Mock core | Nouveau `vi.mock(...)` ou `jest.mock(...)` sur router, memory, safety, contracts | Tester via fixtures, fakes locaux ou harness existant. |
| Dette vague | `// TODO` sans contexte actionnable | Traiter maintenant, ou documenter un follow-up dans le rapport QA avec severite et prochaine action. Utiliser le decision log seulement pour une decision durable. |
| Contrat contourne | Mutation directe de `RouteDecision`, `TurnFrame`, Memory V2 schemas | Lire le contrat et ajouter un adapter local hors schema. |
| SQL libre | Requete destructive ad hoc dans un script agent | Utiliser un script whiteliste avec garde-fous `is_test_persona`. |

## Regle

Un agent ne desactive pas un signal de regression pour faire passer un check. Si le check est faux positif, il ecrit un rapport Mode A avec preuve code et propose une correction du check.
