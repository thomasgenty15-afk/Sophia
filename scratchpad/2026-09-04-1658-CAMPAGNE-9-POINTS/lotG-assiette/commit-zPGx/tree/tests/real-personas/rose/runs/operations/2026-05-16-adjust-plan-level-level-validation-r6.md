# QA Run - Rose - Ajustement De Niveau Apres Fix Opus

## 1. Contexte Du Test

- Date: 2026-05-16
- Run: `level-validation-r6`
- Persona: Rose
- Objectif: relancer le test d'ajustement de niveau apres les corrections Opus.
- Trajectoire visee: demande d'allegement du niveau securite -> brouillon -> validation -> execution -> verification durable -> cleanup.
- Surfaces visees: endpoint local `test-send-message`, auth persona locale, routing `adjust_plan_item`, validation de brouillon, materialisation durable.
- Cadre IA reel: tentative locale via `test-send-message`, `force_full_ai=true`, aucun fallback deterministe.
- Validite QA: invalide. Le run n'a pas atteint Sophia: blocage auth local avant tout tour conversationnel exploitable.
- Setup local: le compte Auth Rose avait disparu et les donnees Rose etaient absentes. J'ai recree l'utilisateur Auth local test et rehydrate le plan Rose depuis le dernier snapshot sain, puis pris le snapshot `r6`.
- Cleanup: effectue. Les 4 items Rose ont ete restaures, aucun nouvel item, `0` message et `0` `user_chat_state` sur le scope QA.

Artifacts:

- Raw: `tests/real-personas/rose/runs/operations/2026-05-16-adjust-plan-level-level-validation-r6.raw.json`
- Summary: `tests/real-personas/rose/runs/operations/2026-05-16-adjust-plan-level-level-validation-r6.summary.json`
- Snapshot: `tests/real-personas/rose/runs/operations/2026-05-16-adjust-plan-level-level-validation-r6.snapshot.json`
- Durable: `tests/real-personas/rose/runs/operations/2026-05-16-adjust-plan-level-level-validation-r6.durable.json`
- Cleanup: `tests/real-personas/rose/runs/operations/2026-05-16-adjust-plan-level-level-validation-r6.cleanup.json`

## 2. Tours De Conversation

### Tour 1

**User**
> Je veux alléger le niveau actuel sur la sécurité, pas seulement une action. Cette semaine, garde l'objectif global du couple, mais propose-moi un brouillon plus léger : point positif à 2 jours / semaine, phrase neutre, sans créneau imposé ; signal de pause en 5 minutes pour choisir un mot ou un geste simple. La cartographie des déclencheurs reste inchangée.

**Sophia**
> [réponse vide]

**Trace courte**
- http_status: 401
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: null
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: null
- executed_tools: none
- durable_effect: none
- error: `Unauthorized`

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Aucun side effect applicatif n'a ete produit avant conversation.
- Le scope QA a ete nettoye apres l'echec.

**Problemes**
- Tour 1: Sophia ne repond pas, car l'appel est bloque par l'auth locale. Impact: aucune experience utilisateur testable. Severite: red.

**Fix propose**
- Corriger la configuration auth locale avant de relancer: aujourd'hui, le JWT emis par Auth pour Rose est en `ES256`, tandis que le chemin Edge local rejette ce JWT avec `Invalid JWT`. Un JWT HS256 signe avec le `JWT_SECRET` local passe plus loin, mais `auth.getUser` le rejette ensuite avec `Unauthorized`. Les deux validateurs ne sont donc pas alignes.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Aucun routage Sophia exploitable: l'appel n'atteint pas le router.

**Skills / Operations / Tools**
- `adjust_plan_item` n'est jamais active.
- Aucun brouillon, aucune confirmation, aucun executor.

**Memory / Effets durables**
- Avant cleanup, les items Rose sont restes inchanges:
  - `Partager un point positif`: `3 jours / semaine`, `target_reps=3`, `time_of_day=evening`, description initiale.
  - `Convenir d'un signal de pause`: description initiale.
  - les deux items pending restent inchanges.
- Apres cleanup: 4 items restaures, aucun nouvel item, `0` message, `0` chat state.

**Problemes**
- Auth local incoherent:
  - `scripts/get-jwt.sh rose` emet un JWT Auth `ES256`.
  - `test-send-message` via gateway local renvoie `Invalid JWT` avec ce JWT.
  - Un JWT local HS256 permet de passer le rejet gateway mais echoue ensuite dans `auth.getUser` avec `Unauthorized`.
- Le test ne peut pas valider les fixes Opus tant que l'auth locale n'est pas alignee.

**Fix propose**
- Retablir une configuration Supabase locale coherente entre Auth et Edge/Kong: soit Auth emet des tokens acceptes par le gateway local, soit le chemin `test-send-message` local evite la validation gateway tout en laissant `auth.getUser` valider le vrai JWT user.
- Une fois l'auth reparee, relancer exactement ce scenario en run `r7`.

## Verdict Global

**red**

Run invalide pour juger le fix Opus: le blocage est en amont de Sophia. L'etat Rose a ete restaure et le scope QA nettoye, mais il faut d'abord reparer l'alignement JWT local avant de pouvoir conclure sur le flow d'ajustement de niveau.
