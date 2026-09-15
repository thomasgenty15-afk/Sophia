# Dispatcher Output Patch / Runtime State Authority

Ce bloc est commun a tous les dispatchers locaux.

## Principe

Un dispatcher ne doit jamais etre considere comme proprietaire de l'etat complet.

Le dispatcher produit une decision et un patch partiel. Le runtime possede,
rehydrate les champs stables, valide et persiste l'etat complet.

```txt
last_valid_runtime_state
+ canonical_runtime_payload
+ dispatcher_patch
-> reducer merge
-> stable canonical field repair
-> derived field recomputation
-> complete validated runtime state
```

## Regle Centrale

```txt
Missing stable/canonical field means preserve or restore.
Missing volatile turn field means clear or recompute for the current turn.
Invalid field means reject.
Derived field means recompute.
Canonical field means restore from canonical runtime payload.
Explicit clear means allowed only for whitelisted mutable fields.
```

Une absence dans la sortie du dispatcher ne signifie jamais suppression pour un
champ stable/canonique.

Si un champ stable disparait de la sortie courante, le runtime doit le restaurer
depuis la derniere version runtime valide ou depuis la source canonique
appropriee.

Cette regle ne s'applique pas aux champs volatils de tour. Un champ volatile
absent ne doit pas etre restaure aveuglement depuis le tour precedent.

## Sources De Verite

### Canonical Runtime Payload

Source des identifiants et objets que le dispatcher ne doit pas pouvoir
supprimer ou reinventer.

Exemples :

- targets selectionnees ;
- occurrence ids ;
- plan item ids ;
- titres d'actions ;
- user id / channel / timezone ;
- pending action id ;
- capability active ;
- payload DB courant.

Ces champs doivent etre restaures depuis le payload canonique si la sortie du
dispatcher les oublie, les vide ou les modifie sans autorisation.

### Last Valid Runtime State

Source de l'etat stable deja valide.

Exemples :

- items deja collectes ;
- slots manquants ;
- valeurs metier deja stabilisees ;
- contexte local durable qui ne change pas a chaque message.

Si le dispatcher ne mentionne pas un champ stable, le reducer conserve la valeur
de ce dernier etat valide.

### Volatile Turn State

Les champs de tour ne doivent pas etre restaures aveuglement depuis le tour
precedent, car ils representent la prochaine action conversationnelle courante.

Exemples :

- current focus ;
- remaining ids ;
- asked history ;
- next question ;
- next question targets ;
- generated user message ;
- visible stage courant ;
- status conversationnel courant.

Ces champs doivent etre produits par le reducer/runtime du tour courant, ou
recalcules depuis les champs stables. Les restaurer depuis l'ancien etat peut
faire reposer une question obsolete ou rouvrir une etape deja terminee.

### Dispatcher Patch

Le dispatcher peut seulement proposer des changements sur des champs autorises.

Exemples :

- flow action ;
- target resolution ;
- item updates ;
- correction explicite ;
- clarification demandee ;
- handoff request ;
- safety preempt ;
- visible stage request ;
- evidence utilisee.

Le patch est applique uniquement apres validation d'ids, de types, de modes de
mise a jour et de contraintes server-owned.

### Derived Fields

Les champs derives ne doivent pas etre acceptes comme source de verite depuis le
dispatcher.

Ils doivent etre recalcules par le runtime.

Exemples :

- effect plan ;
- should apply effects ;
- commit readiness ;
- missing occurrence ids ;
- final status complete/stopped ;
- blocked effects ;
- mutation audit ;
- next durable effects.

## Suppression Explicite

La suppression implicite est interdite.

Un champ stable/canonique absent signifie `preserve` ou `restore`.
Un champ volatile absent signifie `recompute` ou `rewrite` par le runtime du
tour courant.

Une suppression doit etre explicite :

```json
{
  "state_change_intent": {
    "clear_fields": ["field_name"]
  }
}
```

ou, pour un item :

```json
{
  "item_updates": {
    "occurrence-id": {
      "update_mode": "clear"
    }
  }
}
```

Le reducer doit refuser toute suppression d'un champ server-owned ou canonique,
meme si le dispatcher l'a explicitement demandee.

## Invariants Runtime

Avant l'effect planning, le runtime doit garantir :

- tous les champs stables/canoniques requis sont presents ;
- tous les objets stables attendus par le payload canonique existent dans l'etat ;
- aucun objet stable/canonique n'a ete perdu par omission du dispatcher ;
- les champs stables absents du patch ont conserve leur valeur precedente ;
- les champs volatils de tour ne sont pas restaures aveuglement ;
- les champs derives ont ete recalcules ;
- les champs server-owned n'ont pas ete modifies par le dispatcher ;
- les clear explicites non autorises ont ete rejetes et audites.

## Audit Recommande

Chaque reducer devrait produire un audit court quand il repare ou rejette une
mutation.

Exemple :

```json
{
  "state_repair_audit": {
    "restored_fields": ["items.occ-3"],
    "initialized_fields": [],
    "recomputed_fields": ["effect_plan", "should_apply_effects"],
    "rejected_changes": [
      {
        "field": "targets",
        "reason_code": "server_owned_field"
      }
    ],
    "source": "last_valid_runtime_state + canonical_runtime_payload"
  }
}
```

## Prompt Block A Injecter

```txt
Tu ne possedes pas l'etat complet. Tu produis uniquement une decision et un
patch partiel.

N'omets jamais volontairement un champ pour le supprimer. Une omission signifie
no change.

Ne reinvente jamais un id, une target, un outil, une action active ou un champ
canonique. Utilise uniquement les ids presents dans le contexte runtime.

Si tu veux corriger ou effacer une valeur, utilise un mode explicite autorise
comme update_mode=revise ou update_mode=clear. Le runtime validera et pourra
refuser.

Ne considere jamais un champ derive comme acquis. Le reducer/runtime recalculera
effect_plan, should_apply_effects, readiness, status final et effets durables.

Ta sortie peut etre sparse. Le runtime restaurera seulement les champs
stables/canoniques absents depuis le dernier etat runtime valide ou depuis le
payload canonique. Les champs volatils du tour courant seront recalcules ou
reecrits par le runtime.
```

## Reducer Block A Implementer

```txt
1. Charger last_valid_runtime_state.
2. Charger canonical_runtime_payload.
3. Rehydrater seulement les champs stables/canoniques requis.
4. Appliquer seulement les champs autorises du dispatcher_patch.
5. Ne pas restaurer aveuglement les champs volatils de tour.
6. Rejeter toute mutation server-owned non autorisee.
7. Recalculer tous les champs derives.
8. Produire state_repair_audit.
9. Autoriser les effets durables seulement apres validation de l'etat complet.
```

## Anti-Pattern

Ne jamais faire :

```txt
next_state = dispatcher_output.state
```

Ne jamais laisser le dispatcher :

- remplacer l'etat complet ;
- supprimer un champ par omission ;
- supprimer une target canonique ;
- decider seul du commit durable ;
- modifier un champ server-owned ;
- fournir un effect plan comme source de verite ;
- inventer un id absent du contexte runtime.

## Formule Courte

```txt
Dispatcher output is sparse.
Runtime state is complete.
Missing stable field means preserve or restore.
Missing volatile field means recompute or rewrite.
Canonical stable field means restore.
Derived means recompute.
Durable effects require complete validated state.
```
