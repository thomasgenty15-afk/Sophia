# L'algorithme JWT de la pile locale — ne le changez pas

> **Si vous êtes un agent et que vous venez de rencontrer un 401 `Invalid JWT` :
> arrêtez-vous et lisez cette page en entier avant de modifier quoi que ce soit.**
> Le geste que vous êtes sur le point de faire a déjà été fait plusieurs fois, il
> ne répare rien, et il coûte une journée à chaque fois.

## Le symptôme, et pourquoi il trompe

Toute fonction edge déclarée `verify_jwt = true` rend `401 {"msg":"Invalid JWT"}`
avec un vrai jeton utilisateur. **Pendant ce temps, PostgREST répond
normalement**, les fonctions en `verify_jwt = false` marchent, et l'app a l'air
globalement vivante.

C'est ce contraste qui égare : on conclut que l'écran qui échoue a un bug. Il
n'en a pas. Le défaut est dans la pile, une couche plus bas, et il frappe
exactement les fonctions qui passent par le portail JWT du runtime edge.

## Le contrôle, en 5 secondes

```bash
./scripts/check-local-jwt-alg.sh
```

Il inspecte le dépôt **et** la pile qui tourne, et il dit lequel des deux est en
faute. Lancez-le avant toute autre hypothèse.

## La cause

Le CLI Supabase, laissé à lui-même, **fabrique une clé EC neuve à chaque
`supabase start`** et la donne à GoTrue (`GOTRUE_JWT_KEYS`). GoTrue signe alors
les jetons utilisateur en **ES256**.

Le gateway du runtime edge, lui, ne reçoit que le secret **symétrique**
(`SUPABASE_INTERNAL_JWT_SECRET`). Sa bibliothèque `jose` refuse net :

```
TypeError: Key for the ES256 algorithm must be of type CryptoKey.
           Received an instance of Uint8Array
```

Les deux moitiés de la pile ne parlent pas le même algorithme. Rien dans le
message d'erreur rendu au client (`Invalid JWT`) ne le dit.

## La cure, et pourquoi elle a cette forme bizarre

`supabase/config.toml` porte :

```toml
signing_keys_path = "./signing_keys.local.json"
```

et le fichier pointé contient **exactement** :

```json
[]
```

**Le fichier vide n'est pas un oubli. C'est le correctif.**

On ne peut pas y écrire la bonne clé : le CLI refuse les clés symétriques.

```
failed to decode signing keys: failed to parse response body: must be one of [RS256 ES256]
```

Le jeu de clés vide est donc la **seule** façon d'exprimer « signe avec le secret
symétrique » : le CLI transmet `GOTRUE_JWT_KEYS=[]`, GoTrue n'a alors aucune clé
à préférer et retombe sur `GOTRUE_JWT_SECRET` — c'est-à-dire le même secret que
`PGRST_JWT_SECRET` et `SUPABASE_INTERNAL_JWT_SECRET`.

**Une seule clé, HS256, pour toute la pile.** GoTrue signe, PostgREST vérifie, le
gateway edge vérifie — tous les trois avec la même.

Vérifié le 2026-08-11 sur CLI 2.67.1 : jeton réel `grant_type=password` en
`alg: HS256`, `chat-inbound-v1` (en `verify_jwt = true`) qui répond 400 depuis sa
propre validation au lieu de 401 depuis le portail, PostgREST 200, `/auth/v1/user`
200.

## Les trois fausses réparations — toutes déjà tentées

1. **Passer la fonction en `verify_jwt = false`.** Ça fait disparaître le 401 et
   ça déplace un défaut de poste de dev dans un fichier qui part en production.
   Le gate de commit refuse ce geste quand il est justifié par l'algorithme.
2. **Remplir `signing_keys.local.json` avec une clé.** Toute clé acceptée par le
   CLI est asymétrique, donc rallume exactement le bug.
3. **Supprimer le fichier ou recommenter `signing_keys_path`.** Le CLI se remet à
   fabriquer une clé EC au démarrage suivant. Retour à la case départ.

## Si c'est cassé chez vous

Le plus souvent, votre conteneur `auth` est plus vieux que le correctif :

```bash
supabase stop && supabase start
```

Les données survivent (elles sont dans un volume Docker). Relancez ensuite
`./scripts/check-local-jwt-alg.sh`.

⚠️ Après réalignement, **déconnectez-vous et reconnectez-vous dans l'app**. Un
rechargement de page ne suffit pas : la session en cours garde son ancien jeton
dans le `localStorage` et `supabase-js` le réutilise jusqu'à expiration
(`jwt_expiry = 3600`).

## Ce qui garde le correctif

| Garde | Où | Ce qu'elle refuse |
|---|---|---|
| Contrôle statique | `scripts/agent-gate.sh` → `check_forbidden_patterns` | tout commit qui laisse l'alignement rompu |
| Règle de motif | `scripts/agent-gate.sh` | un `verify_jwt = false` ajouté en invoquant ES256/HS256 |
| Commentaire en tête | `supabase/config.toml` | (documentaire) |
| Hook de commande | `.claude/hooks/block-risky-commands.sh` | `supabase config push`, qui pousserait ce réglage local en production |

Les deux gardes du gate ont été vérifiées par mutation : elles passent au vert
sur l'état correct et rouge sur chacune des fausses réparations.

## La vraie sortie, un jour

Monter le CLI (2.113.0 au moment où ces lignes sont écrites) : un runtime edge
récent sait vérifier l'ES256, et alors tout ceci devient inutile. Ça se fait avec
un `supabase stop && supabase start` et une relecture de cette page — pas au
milieu d'un chantier.
