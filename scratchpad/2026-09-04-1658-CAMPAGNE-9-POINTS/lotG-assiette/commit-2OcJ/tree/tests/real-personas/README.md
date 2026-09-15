# Real Personas Test Dossiers

Ce dossier contient les personas realistes utilises pour tester Sophia sur des
plans, conversations et operations proches d'un vrai usage.

## Etat Actuel

Alex et Nina sont globalement bien structures :

- `persona.md` decrit l'identite de test, le profil, la facon de parler, le
  mecanisme central et les comportements a tester.
- `current-plan.md` donne le plan actif, les ids utiles, les items actifs et
  les points QA.
- `observations.md` sert de journal d'analyse : bugs, decisions, corrections,
  choses a retester.
- `timeline.md` garde les faits importants et corrections utilisateur.
- `daily-log/` peut recevoir les traces quotidiennes courtes.
- `runs/` peut recevoir les rapports de runs dedies a cette persona.

Differences a connaitre :

- Alex a un `connection.json` local non versionne.
- Nina a seulement `connection.example.json` versionne. Le vrai
  `connection.json`, s'il existe, doit rester local.
- Alex a un script specifique `relaunch-whatsapp-onboarding.sh`, qui n'est pas
  une obligation pour les nouvelles personas.

## Structure Canonique

Pour ajouter une nouvelle persona, utiliser cette forme :

```text
tests/real-personas/<persona-id>/
  persona.md
  current-plan.md
  observations.md
  timeline.md
  connection.example.json
  connection.json              # local seulement, gitignore
  daily-log/
  runs/
```

`<persona-id>` doit etre court, stable, en minuscules, sans espace.
Exemples : `alex`, `nina`, `samir`, `lea`.

## Role Des Fichiers

### persona.md

Contient ce que l'agent QA doit savoir pour parler comme une vraie personne :

- identite de test ;
- langue, timezone, canal principal ;
- profil humain ;
- facon de parler ;
- mecanisme central ;
- points que Sophia doit garder en tete ;
- comportements a tester.

Ne pas y mettre de mot de passe, token, refresh token ou JWT.

### current-plan.md

Contient le plan actif attendu en base locale :

- `user_id`, `cycle_id`, `transformation_id`, `plan_id` si disponibles ;
- transformation active ;
- niveau actuel ;
- items actifs et a venir ;
- ids des plan items utiles pour les operations ;
- points de verification QA.

Ce fichier sert a verifier que Sophia reste groundee sur le bon plan et ne
reinvente pas une action.

### observations.md

Journal de pilotage du lab :

- contexte du run ou de l'observation ;
- attendu ;
- observe ;
- preuve : trace, run, effet DB, message ;
- statut : `a retester`, `bug probable`, `corrige`, `decision`.

Les observations peuvent inclure des choses hors scope si elles sont utiles
pour la suite, mais elles doivent rester actionnables.

### timeline.md

Journal append-only des faits explicitement dits, des corrections importantes
et des evenements qui changent le contexte.

Ne pas transformer une emotion passagere en fait durable. Exemple : une phrase
de honte ou de fatigue ne devient pas une identite stable.

### connection.example.json

Modele versionne, sans secret reel :

```json
{
  "user_id": "USER_ID_LOCAL",
  "email": "persona@example.com",
  "password": "DO_NOT_COMMIT_REAL_PASSWORD",
  "channel": "web",
  "scope": "qa-<persona-id>-YYYY-MM-DD-run-id"
}
```

### connection.json

Fichier local seulement. Il peut contenir les vraies informations de connexion
du compte local, mais il ne doit jamais etre versionne.

`scripts/get-jwt.sh` accepte deux formats :

- `refresh_token` present : utilise le refresh token ;
- sinon `email` + `password` presents : fait un login local par mot de passe.

Le `.gitignore` couvre deja :

- `tests/real-personas/*/connection.json`
- `tests/real-personas/*/connections/*.json`
- `tests/real-personas/*/connections/**/*.json`

### daily-log/

Dossier pour des notes quotidiennes courtes : check-in matin, soir, relance,
effet observe, incident local.

### runs/

Dossier pour les rapports de runs lies a cette persona. Utiliser des
sous-dossiers quand une famille de tests devient identifiable :

```text
runs/operations/
runs/memory/
runs/whatsapp/
runs/all_skills/
```

## Regle Pour Les Nouveaux Tests

Avant de lancer un run sur une persona, charger au minimum :

1. `persona.md`
2. `current-plan.md`
3. `observations.md`
4. `timeline.md`
5. le rapport de run precedent pertinent s'il existe

Le rapport doit indiquer clairement :

- persona conversationnelle utilisee ;
- compte technique utilise ;
- fichiers de contexte lus ;
- scope du run ;
- si le run a touche un compte reel ou une connexion temporaire QA.
