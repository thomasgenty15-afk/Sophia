# product_help Local Flow Architecture

Document de cadrage pour faire evoluer `product_help` vers une architecture
locale compatible avec les flows actifs :

```txt
product question
-> product_help.local_dispatcher
-> reducer non-mutant
-> visible prompt stage-specific
-> optional return_to_parent_flow
-> optional exit_to_global_dispatcher
```

`product_help` reste un conversation skill d'explication produit. Il ne devient
pas un tool, pas un status recap, pas un routeur global, pas un flow de collecte
de champs plateforme.

## Mental Model

`product_help` repond a :

- "c'est quoi ?" ;
- "a quoi ca sert ?" ;
- "comment ca marche ?" ;
- "ou je retrouve / modifie / annule dans l'app ?" ;
- "quelle est la difference entre X et Y ?" ;
- "est-ce que je peux faire X depuis le chat ?" ;
- "quelle limite produit il y a ici ?".

Il peut etre appele de deux facons :

1. **Standalone product help**
   Le dispatcher global choisit `product_help` parce que la demande est une
   vraie question produit. `product_help` peut garder un mini-flow actif sur
   2-3 tours pour repondre aux followups produit.

2. **Inline product help inside active flow**
   Le dispatcher local du flow parent detecte une question produit inline,
   appelle `product_help`, puis garde son propre flow actif. `product_help`
   repond et rend la main au parent.

## Why A Local Dispatcher

Sans dispatcher local, les followups produit repassent trop vite par le global :

- "et c'est ou exactement ?" ;
- "et pour les potions ?" ;
- "ok fais-le" ;
- "non je voulais dire la carte d'attaque" ;
- "c'est pareil qu'une defense ?".

Le local dispatcher permet de stabiliser ces tours sans transformer
`product_help` en owner d'effet durable.

## Runtime Shapes

### Standalone

```txt
user message
  -> global dispatcher selects product_help
  -> product_help.local_dispatcher
  -> product_help reducer
  -> visible prompt
  -> optional __active_skill_state.skill_id="product_help"
```

Tour suivant :

```txt
active product_help state exists
  -> skip global dispatcher
  -> product_help.local_dispatcher
  -> product_help reducer
  -> visible prompt
  -> close / continue / exit_to_global_dispatcher
```

### Inline In Parent Flow

```txt
active parent flow exists
  -> parent.local_dispatcher
  -> local_action=get_info_product
  -> product_help.local_dispatcher with parent_flow_context
  -> product_help visible prompt
  -> return_to_parent_flow
  -> parent active state preserved
```

The global dispatcher must not run during the inline call.

`product_help` inline must not clear, mutate, revise or complete the parent
flow. It can only add diagnostic subskill history such as:

```json
{
  "subskill": "product_help",
  "mode": "inline",
  "answered_intent": "where_is_it",
  "returned_to_parent": true
}
```

## Active Flow Rule

If active product help state exists :

```json
{
  "skill_id": "product_help",
  "status": "open"
}
```

then `product_help.local_dispatcher` owns the next message.

The global dispatcher must not run.

Exception :

```txt
flow_action = exit_to_global_dispatcher
```

Then the same user message can be re-analysed by the global dispatcher with the
local `exit_memo`.

## Parent Flow Rule

If another active flow exists, the parent local dispatcher owns the turn first.

`product_help` is allowed only if the parent returns an inline call action such
as :

```txt
get_info_product
```

After the product answer, parent state remains active unless the parent itself
returns an exit.

## State

Standalone product help state should stay light :

```json
{
  "skill_id": "product_help",
  "status": "open|answered|closing|exit_to_global|safety",
  "mode": "standalone",
  "product_help_state": {
    "stage": "answering|clarifying|bridge_explained|closing",
    "last_intent": "string|null",
    "last_target": {},
    "last_answer_summary": "string|null",
    "last_catalog_feature_ids": [],
    "last_locations": [],
    "parent_flow_context": null,
    "turn_count": 0,
    "max_turns": 3,
    "updated_at": "iso"
  }
}
```

Inline call state is not a durable owner. It should be written only as subskill
history on the parent state if useful.

## Dispatcher Responsibilities

The local dispatcher decides :

- product question answered ;
- product question unclear ;
- location/destination request ;
- feature comparison ;
- limit/capability explanation ;
- bridge explanation only ;
- repeat answer ;
- apply attempt ;
- close product help ;
- return to parent flow ;
- exit to global for a real non-product task ;
- safety preempt.

It does not :

- launch any tool flow ;
- fill another skill's fields ;
- mutate DB ;
- create operation suggestions ;
- create pending confirmations ;
- claim a real object exists without grounding.

## Product Help Inline Contract

Inline `product_help` can answer questions like :

- "c'est ou dans l'app ?" inside `adjust_plan_item` ;
- "c'est quoi une carte d'attaque ?" inside opportunity verification ;
- "les potions sont ou ?" inside `select_state_potion` ;
- "je peux le faire depuis le chat ?" inside a platform handoff.

It must return to the parent after the answer.

It must not :

- become the active owner ;
- call global dispatcher ;
- rewrite parent fields ;
- decide that the parent flow is complete ;
- convert a bridge into an operation suggestion.

## Bridge Policy

`product_help` may explain a flow, but not start it.

Examples :

```txt
"Une carte d'attaque sert a preparer le demarrage d'une action. Si tu veux en
preparer une, on passera par le flow carte d'attaque."
```

If the user then explicitly asks to prepare the flow, `product_help` must exit
with `exit_to_global_dispatcher` and an `exit_memo`, unless a parent local
dispatcher owns that decision.

## Apply Attempt Policy

If the user asks product help to create/activate/apply/modify something from the
chat :

```txt
flow_action = apply_attempt
```

The visible answer must be non-mutating :

- no "c'est fait" ;
- no "je l'ai cree" ;
- no "je l'ai modifie" ;
- no confirmation executable ;
- destination product only.

## Grounding

`product_help` can use :

- product catalogue / `knowledge.ts` ;
- product surface registry ;
- recent committed effects ;
- DB projection only when already loaded and explicitly selected ;
- active flow context for inline answers.

It must not claim an object exists unless the grounding includes a real source.

## Reducer Responsibilities

The reducer :

- validates dispatcher JSON ;
- validates no mutation ;
- validates `operation_suggestions=[]` ;
- validates no `requested_effects` / `allowed_effects` / `committed_effects` ;
- validates parent flow preservation for inline mode ;
- validates `exit_memo` for global exit ;
- validates max turns ;
- writes standalone lightweight state only when needed.

## Allowed Determinism

Allowed :

- contract validation ;
- enum validation ;
- source grounding validation ;
- no mutation guard ;
- no done wording without committed source ;
- max turns ;
- product catalogue retrieval as recall ;
- parent flow preservation.

Forbidden :

- regex business routing ;
- deterministic visible renderer as nominal path ;
- mapping raw message words to `flow_action` in code ;
- choosing a final feature only from recall candidates without structured AI ;
- converting a bridge into an operation.

## Logs

Trace tags should make ownership clear :

```txt
product_help.local_dispatcher_called
product_help.local_dispatcher_result
product_help.visible_prompt_called
product_help.inline_called_from_parent
product_help.returned_to_parent_flow
product_help.exit_to_global_dispatcher
product_help.apply_attempt_no_mutation
```

When inline, include :

```json
{
  "parent_skill_id": "adjust_plan_item|status_recap|select_state_potion|...",
  "inline_product_help": true,
  "returned_to_parent": true
}
```

## Invariants QA

- Standalone product help can answer a followup without global dispatcher.
- Inline product help returns to parent flow.
- Product help never creates operation suggestions.
- Product help never mutates.
- Product help apply attempt is non-mutant.
- Product help bridge is explanatory only.
- Real object status requires grounding.
- Product help does not render status recap.
- Product help does not fill parent flow fields.
- Product help exits to global only with `exit_memo`.
- No deterministic renderer in nominal path.
- No regex business classifier.

