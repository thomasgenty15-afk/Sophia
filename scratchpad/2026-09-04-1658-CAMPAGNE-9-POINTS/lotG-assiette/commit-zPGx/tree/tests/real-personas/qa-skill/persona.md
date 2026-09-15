# qa-skill

Persona QA minimal pour scenarios scriptes. Il sert a tester routing, safety, skills, operations et Memory V2 sans bruit narratif.

## Contraintes

- Memoire resettable.
- Tous les runs doivent utiliser un compte marque `is_test_persona = true`.
- Les messages scenario sont envoyes dans l'ordre exact.
- Les assertions priment sur la qualite litteraire de la reponse.

## Connection

Creer `tests/real-personas/qa-skill/connection.json` localement, non versionne :

```json
{
  "user_id": "<uuid>",
  "email": "qa-skill@example.com",
  "refresh_token": "<refresh-token>"
}
```
