# QA Run - emotional-repair-local-doctrine-r6-invalid

## 1. Contexte Du Test

- Date: 2026-06-10
- Run: `emotional-repair-local-doctrine-r6`
- Persona: tentative de connexion temporaire locale `qa-skill/emotional_repair`.
- Objectif: revalider en conditions reelles le fix de persistance active-flow pour `emotional_repair`.
- Trajectoire visee: entree `emotional_repair` -> phrase courte -> changement de sujet produit.
- Surfaces visees: `emotional_repair`, `operation_runtime_response_handler`, `product_help`, `note_information`, state DB.
- Cadre IA reel attendu: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback.
- Validite QA: invalide. Le run n'a pas pu atteindre `/functions/v1/test-send-message` avec un JWT user valide.

## 2. Tours De Conversation

Aucun tour conversationnel exploitable.

**Incident pre-run**
- Creation de connexion temporaire via `scripts/qa-create-run-connection.sh`: process bloque, interrompu proprement.
- Creation Auth Admin directe: `500`, `Database error checking email`.
- Login password sur la connexion QA existante: `500`, `Database error querying schema`.
- Refresh token sur la connexion QA existante: `500`, `failed to connect to host=supabase_db_Sophia_2 ... no route to host`.

**Famille de bugs si yellow/red:** `BF-TEST-01` - Trace/test incoherent ou suite malsaine

## 3. Analyse De Fluidite Humaine

**Verdict: red**

Le run n'a pas produit de conversation Sophia. Aucun jugement UX possible.

## 4. Analyse Systeme

**Verdict: red**

Le blocage vient de l'environnement local Auth/Supabase: impossible d'obtenir un JWT utilisateur. Les guidelines interdisent `supabase restart`, `supabase stop` ou autres commandes de reboot; aucun fallback direct `processMessage` n'a ete utilise.

## Verdict Global

`red` technique, run invalide.

Le fix `operation_runtime_response_handler` reste non verifie en conditions reelles. Les tests unitaires ciblés passent, mais la revalidation conversationnelle doit attendre un Auth local stable.
