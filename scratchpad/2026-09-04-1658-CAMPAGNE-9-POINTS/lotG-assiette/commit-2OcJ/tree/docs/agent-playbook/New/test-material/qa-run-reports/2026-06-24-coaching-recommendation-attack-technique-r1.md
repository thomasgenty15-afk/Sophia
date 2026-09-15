# QA Run - Coaching Recommendation Attack Technique R1

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `coachingrec-attack-technique-20260624-r1`
- Persona: user QA temporaire `qa-normal-coachingrec-attack-technique-20260624-r1-1782314486121@example.com`
- Objectif: verifier qu'une recommandation de carte d'attaque nomme toujours une technique et stabilise l'etat actif.
- Trajectoire: action du plan avec peur d'oublier un papier, clarification novice, guidance produit, comparaison technique mentale vs concrete, switch vers action hors plan.
- Surfaces visees: `coaching_recommendation`, visible agents action plan/no-plan, post-traitement technique carte d'attaque, active flow ownership, target switch, absence de direct effect/tool.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de fallback deterministe, pas de reboot Supabase.
- Validite QA: valide. Run IA reel exploitable, 5 tours, state DB et traces courtes verifies. Cleanup run-scope effectue; `user_memories` a retourne 404 au cleanup, les autres tables et `auth.users` ont ete nettoyes.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Dans mon plan, j'ai l'action Préparer le dossier mutuelle. Je bloque parce que je me dis que je vais forcément oublier un papier et je repousse. Dans Sophia, tu me conseillerais quoi ?

**Sophia**
> Je partirais sur une carte d’attaque, technique Le texte magique : une phrase courte du style “Je rassemble juste ce que j’ai, le reste viendra après”, pour casser la peur d’oublier et te remettre en mouvement.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `plan_action`, active skill `coaching_recommendation`
- executed_tools: `[]`
- durable_effect: none
- diagnostic utile: `last_visible_decision.variant=texte_magique`, `current_recommendation.feature=attack_card`

### Tour 2

**Verdict du tour:** green

**User**
> Ok, c'est quoi exactement Le texte magique dans ce cas ? Je ne connais pas trop les cartes.

**Sophia**
> Le texte magique, c’est une phrase courte pour recadrer ta pensée au moment où tu bloques. Là, au lieu de rester sur “je vais forcément oublier un papier”, tu te donnes une phrase qui te remet dans l’action, par exemple: “Je commence avec ce que j’ai, le reste viendra ensuite.”
>
> Je partirais sur une carte d’attaque, technique texte magique : elle répond bien à ton blocage parce que c’est surtout la peur d’oublier qui te fait repousser le démarrage.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `plan_action`, active skill `coaching_recommendation`
- executed_tools: `[]`
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Si je veux la préparer moi-même dans Sophia, je vais où ? Ne la crée pas depuis le chat.

**Sophia**
> Je partirais sur une carte d'attaque, technique Le texte magique : Tu peux la préparer dans Dashboard > Plan, en ouvrant l’action « Préparer le dossier mutuelle », puis en lançant une carte d’attaque. Ici, je partirais sur la technique texte magique, parce que le blocage vient surtout de la pensée « je vais forcément oublier un papier » : une phrase courte peut recadrer cette idée et t’aider à démarrer.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `plan_action`, active skill `coaching_recommendation`
- executed_tools: `[]`
- durable_effect: none

### Tour 4

**Verdict du tour:** green

**User**
> Autre nuance sur le même dossier : si le souci c'est surtout que je n'ai pas les papiers au même endroit et que je perds du temps à tout chercher, là tu garderais Le texte magique ?

**Sophia**
> Non, là je ne garderais pas Le texte magique. Si le souci, c’est surtout que les papiers sont dispersés et que tu perds du temps à les chercher, la bonne technique est plutôt une carte d’attaque, technique Préparer le terrain : tu ranges les documents, tu poses les pièces nécessaires au même endroit, et tu enlèves la friction concrète avant de démarrer.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `plan_action`, active skill `coaching_recommendation`
- executed_tools: `[]`
- durable_effect: none
- diagnostic utile: `last_visible_decision.variant=preparer_terrain`

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-06` - Mauvais domaine semantique

**User**
> Et hors Plan, j'ai un mail à Camille que je repousse parce que je ne sais pas comment commencer la première phrase. Tu me conseillerais quoi sans l'ajouter au Plan ?

**Sophia**
> Je partirais sur une carte d'attaque, technique Le texte magique : Je partirais sur une carte d’attaque libre, technique texte magique : une phrase courte pour te faire démarrer sans te prendre la tête sur la première ligne. Pour ton mail, on peut viser un début simple et naturel, du style “Je te recontacte au sujet de…” ou “Je t’écris pour…”.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `no_plan_action`, active skill `coaching_recommendation`
- executed_tools: `[]`
- durable_effect: none
- diagnostic utile: `dispatcher_context.reason=explicit target switch to no_plan_action: Mail à Camille`, `last_visible_decision.variant=texte_magique`

**Analyse si yellow/red**
- Symptome: le garde technique a ajoute un prefixe `carte d'attaque, technique Le texte magique` alors que le visible agent avait deja dit `carte d’attaque libre, technique texte magique`; la reponse devient repetitive.
- Source amont probable: detection de technique visible trop stricte, qui reconnait `Le texte magique` mais pas la variante sans article `texte magique`.
- Owner runtime: post-traitement visible `coaching_recommendation` dans `skill.ts`.
- Meilleure correction selon les guidelines: elargir la reconnaissance canonique des labels de techniques depuis une table d'aliases structuree, sans router par regex metier.
- Pourquoi ce n'est pas un patch local: le fix vise l'idempotence du post-traitement de surface, pas une phrase utilisateur precise.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le bug initial est corrige: T1 nomme une technique de carte d'attaque et garde l'active state.
- La technique choisie est coherente: peur narrative d'oublier -> `Le texte magique`; friction materielle de papiers disperses -> `Préparer le terrain`.
- Les questions de definition et de destination restent dans `coaching_recommendation`.
- Aucun tool ni direct effect n'est declenche.

**Problemes**
- Tour 5: repetition visible due au post-traitement de technique. Famille: `BF-INTAKE-06`. Impact: comprehension possible, mais formulation maladroite et peu naturelle. Severite: yellow.
- Tours 2-3: casing mineur `technique texte magique` au lieu de `technique Le texte magique`; non bloquant mais lie au meme owner de normalisation visible.

**Fix propose**
- Source amont: normalisation idempotente du label technique dans `coaching_recommendation`.
- Correction recommandee: considerer `texte magique`, `technique texte magique`, `Le texte magique` comme deja suffisamment nomme pour ne pas prefixer; eventuellement normaliser le label visible en sortie.
- Tests d'invariant attendus: visible agent sans technique -> prefixe ajoute; visible agent avec `technique texte magique` -> pas de prefixe duplique; visible agent avec une autre feature -> pas d'ecrasement.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1 entre via `coaching_recommendation_signal`.
- T2-T5 restent en `active_coaching_recommendation`.
- T5 applique bien un target switch interne vers `no_plan_action`.

**Skills / Operations / Tools**
- Skill actif: `coaching_recommendation`.
- Aucun tool execute.
- Aucun direct effect.
- Aucune confirmation pending.

**Memory / Effets durables**
- Aucun effet durable attendu ni observe.
- L'action de plan seedee et le user QA temporaire ont ete nettoyes apres run.

**Problemes**
- Aucun probleme systeme d'ownership ou d'effet durable observe.

**Fix propose**
- Aucun fix systeme obligatoire sur l'ownership. Le fix restant est visible/string idempotence du post-traitement.

## Verdict Global

Verdict global: `yellow`.

Le comportement systeme vise est valide: une carte d'attaque nomme une technique et le flow reste actif. Le seul probleme restant est un effet de bord visible du garde, qui peut dupliquer la technique quand le visible agent l'a deja nommee sous une variante non canonique.
