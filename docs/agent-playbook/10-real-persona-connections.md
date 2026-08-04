# Real Persona Connections

## Regle

Par defaut, utiliser un `connection.json` par persona.

Pour la QA des skills conversationnels, utiliser un user par skill cible quand on
veut isoler les traces, la memoire et les resets entre skills.

Exemples :

- `tests/real-personas/qa-skill/connections/emotional_repair.json` : compte test dedie aux scenarios QA qui ciblent `emotional_repair`.
- `tests/real-personas/qa-skill/connections/execution_breakdown.json` : compte test dedie aux scenarios QA qui ciblent `execution_breakdown`.
- `tests/real-personas/qa-skill/connection.json` : fallback historique si aucun `connection_name` n'est fourni.
- `tests/real-personas/alex/connection.json` : compte separe pour le persona Alex.

## Pourquoi

- Les scripts prennent un `PERSONA` et acceptent un `connection_name` optionnel : `bash scripts/get-jwt.sh qa-skill emotional_repair`.
- Le routing/skill cible reste porte par le scenario.
- Le user par skill evite qu'un scenario `safety_crisis` pollue les traces ou la memoire d'un scenario `emotional_repair`.
- L'isolation entre scenarios d'un meme skill se fait encore par reset quand `requires_reset : true`.

## Contrat du fichier local

Chaque persona qui execute des appels reels doit avoir un fichier local non versionne.
Format fallback :

```json
{
  "user_id": "<uuid>",
  "email": "<persona>@example.com",
  "refresh_token": "<refresh-token>"
}
```

Format QA par skill :

```text
tests/real-personas/qa-skill/connections/<skill_id>.json
```

Contraintes :

- Ne jamais commit `connection.json` ou `connections/*.json`.
- Ne pas utiliser `connection.example.json` pour un run reel : il contient des placeholders.
- Le user Auth doit etre marque `is_test_persona = true`.
- Avant un scenario avec `requires_reset : true`, lancer le reset whiteliste du persona.

## Commandes attendues pour qa-skill par skill

```bash
bash scripts/qa-reset-persona.sh qa-skill emotional_repair
JWT=$(bash scripts/get-jwt.sh qa-skill emotional_repair)
bash scripts/qa-run.sh qa-skill S010 emotional_repair
```

Le meme fichier `connections/<skill_id>.json` sert a tous les scenarios qui ciblent ce skill.

## Skills QA MVP

Connexions attendues :

- `safety_crisis`
- `emotional_repair`
- `demotivation_repair`
- `execution_breakdown`
- `product_help`

Connexion optionnelle pour probes transversaux :

- `all_skills` : compte test dedie aux conversations longues qui naviguent entre
  plusieurs skills. A utiliser quand le but est de tester les handoffs systeme
  entre les 5 skills, pas la qualite isolee d'un skill.

## Connexions Isolees Par Run

Pour les probes longs, transversaux, ou susceptibles d'etre lances en parallele,
ne pas reutiliser directement une connexion stable comme `all_skills`.

Utiliser une connexion temporaire par run :

```bash
CONNECTION_NAME="$(bash scripts/qa-create-run-connection.sh qa-skill all_skills <run-id> | awk -F= '/^connection_name=/{print $2}')"
bash scripts/qa-reset-persona.sh qa-skill "$CONNECTION_NAME"
JWT="$(bash scripts/get-jwt.sh qa-skill "$CONNECTION_NAME")"
```

Le script cree un user Auth local dedie au run, marque :

```text
is_test_persona = true
temporary_qa_connection = true
```

et ecrit un fichier local non versionne :

```text
tests/real-personas/qa-skill/connections/<base_connection>_<run-id>.json
```

Pourquoi :

- eviter qu'un reset d'un run efface les traces ou la memoire d'un autre run ;
- eviter les collisions dans `user_chat_states.temp_memory` ;
- garder des traces DB avec un `user_id` unique par probe long ;
- permettre les runs paralleles sans melange de contexte.

Apres analyse et sauvegarde des artefacts, nettoyer si le run n'a plus besoin du
compte local :

```bash
bash scripts/qa-cleanup-run-connection.sh qa-skill "$CONNECTION_NAME"
```

Le cleanup refuse les connexions non temporaires et les users non marques
`is_test_persona=true`.

Emails locaux recommandes :

- `qa-skill-safety-crisis@example.com`
- `qa-skill-emotional-repair@example.com`
- `qa-skill-demotivation-repair@example.com`
- `qa-skill-execution-breakdown@example.com`
- `qa-skill-product-help@example.com`
- `qa-skill-all-skills@example.com`
