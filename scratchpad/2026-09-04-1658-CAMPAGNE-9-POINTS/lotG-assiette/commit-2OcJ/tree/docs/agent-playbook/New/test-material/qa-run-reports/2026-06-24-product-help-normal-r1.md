# QA Run — Product Help Normal R1

## 1. Contexte Du Test

- **Date:** 2026-06-24
- **Run:** `product_help_normal_20260624_r1`
- **Persona:** `qa-skill`, connexion temporaire `product_help_normal_product_help_normal_20260624_r1`
- **Objectif:** verifier le fonctionnement normal de `product_help` sur des questions produit simples, sans create one-shot reminder, sans creation/modification de carte.
- **Trajectoire:** explication cartes attaque/defense -> localisation cartes libres -> role des potions -> cartes liees au plan -> confirmation du caractere non-mutant.
- **Surfaces visees:** global dispatcher, product_help local skill, visible product help, direct effects, DB durable.
- **Cadre IA reel:** Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, messages choisis tour par tour apres lecture des reponses et traces. Pas de staging, pas de fallback deterministe.
- **Validite QA:** valide. Cleanup cible de la connexion temporaire effectue en fin de run.
- **Artefacts:** `tests/real-personas/qa-skill/runs/product_help/product_help_normal_20260624_r1.raw.json`, `...summary.json`, `...trace-summary.json`, `...db-check.json`, `...chat-state-check.json`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Dans Sophia, c'est quoi la différence entre une carte d'attaque et une carte de défense ? Je veux juste comprendre, pas créer quoi que ce soit.

**Sophia**
> Oui :
> - Carte d’attaque = t’aider à démarrer l’action, en réduisant la friction du premier pas.
> - Carte de défense = te protéger d’un risque au moment où ça peut dérailler, avec une réponse simple ou un plan B.
>
> En bref : l’attaque répond à « comment je m’y mets ? », la défense à « qu’est-ce qui peut me faire dévier ? ».

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- skill_status: `complete`
- safety: null
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Et si je veux juste voir où ça se trouve dans l'app, les cartes libres sont dans quel endroit ?

**Sophia**
> Les cartes libres se trouvent dans Dashboard > Ressources. Là, tu retrouves les cartes d’attaque et de défense quand elles existent. En bref : attaque = préparer l’action, défense = gérer le risque ou le piège sur le moment.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- skill_status: `complete`
- safety: null
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Ok. Et les potions, c'est quoi leur rôle exactement ? Elles remplacent les cartes ou c'est autre chose ?

**Sophia**
> Les potions ne remplacent pas les cartes.
>
> Une carte d’attaque ou de défense sert à agir face à une situation concrète. Une potion, elle, sert plutôt à t’aider quand un état intérieur prend trop de place : peur, fatigue, honte, stress, manque de clarté.
>
> En bref : cartes = action ; potion = soutien de l’état intérieur.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- skill_status: `complete`
- safety: null
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: none

### Tour 4

**Verdict du tour:** green

**User**
> Je crois que je mélange encore : une carte liée à une action du plan, je la retrouve plutôt depuis le Plan ou depuis Ressources ?

**Sophia**
> Plutôt depuis le Plan : ouvre la mission ou l’habitude concernée. Une fois la carte liée existante, tu la retrouves aussi dans Ressources, rangée par niveau.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- skill_status: `complete`
- safety: null
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: none

### Tour 5

**Verdict du tour:** green

**User**
> Donc si je te pose juste des questions pour comprendre l'app, tu m'expliques sans créer ni modifier de carte, c'est bien ça ?

**Sophia**
> Oui, c’est ça. Je peux t’expliquer l’app et les différences entre les éléments, sans créer ni modifier de carte.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- skill_status: `complete`
- safety: null
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Les reponses sont courtes, comprehensibles et centrees sur l'explication produit.
- Sophia respecte explicitement la contrainte "pas creer quoi que ce soit".
- La distinction carte d'attaque / carte de defense / potion est claire.
- Les chemins UI sont actionnables et sans promesse de mutation.

**Problemes**
- Aucun probleme bloquant observe. T4 utilise "mission ou habitude concernée" pour expliquer l'acces depuis le Plan ; c'est acceptable dans ce run car le user demande une localisation produit generale, pas une action DB precise.

**Fix propose**
- Aucun fix requis pour ce run.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Les 5 tours routent vers `response_owner=product_help` et `selected_handler=product_help`.
- Le `route_reason` reste `product_help_signal`.
- `skill_status=complete` a chaque tour : product_help repond inline et ne capture pas les tours suivants comme owner durable. C'est coherent pour des questions produit resolues.

**Skills / Operations / Tools**
- Aucun tool appele.
- Aucun direct effect detecte.
- Aucun pending confirmation.
- Aucun create one-shot reminder.

**Memory / Effets durables**
- DB check avant cleanup :
  - `user_attack_cards`: 0
  - `user_defense_cards`: 0
  - `user_support_cards`: 0
  - `user_recurring_reminders`: 0
  - `scheduled_checkins`: 0
  - `user_chat_states.temp_memory`: `{}`
- Cleanup de la connexion temporaire effectue.

**Problemes**
- Aucun probleme systeme observe.

**Fix propose**
- Aucun fix requis.

## Verdict Global

**GREEN.** Product help fonctionne correctement sur ce run normal : bon owner, pas de bridge inutile, pas de reminder, pas d'effet durable, reponses fluides et non-mutantes.

