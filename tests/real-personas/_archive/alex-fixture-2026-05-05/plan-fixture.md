# Alex Plan Fixture

Ce fixture sert aux runs real-persona d'Alex quand on veut tester l'acces au
plan, l'identification d'une action existante, et les flows type carte
d'attaque / ajustement du plan.

## Seed Local

```bash
node tests/real-personas/alex/seed-plan.mjs
```

Le script :

- recree un cycle actif pour Alex ;
- cree une transformation active ;
- cree un plan V2 actif ;
- cree quatre items de plan ;
- remet a zero `chat_messages`, `conversation_turn_traces` et l'etat `web`
  d'Alex.

## IDs Stables

- user_id : lire `tests/real-personas/alex/connection.json` (peut changer apres un reset Supabase local)
- cycle_id : `11111111-1111-4111-8111-111111111111`
- transformation_id : `22222222-2222-4222-8222-222222222222`
- plan_id : `33333333-3333-4333-8333-333333333333`

## Transformation Active

Titre : `Clarifier et livrer la presentation de cadrage`

But utilisateur : rendre la presentation de cadrage claire, envoyable et
suffisamment bonne sans ajouter d'action inutile.

Contrainte : ne pas recreer le plan depuis le chat ; ajuster les actions
existantes et eviter la surpreparation.

## Items Actifs A Connaitre

1. `Preparer la presentation de cadrage client`
   - dimension : `missions`
   - kind : `task`
   - status : `active`
   - usage test : cible principale pour une carte d'attaque.
   - done : 5 slides max, decision attendue explicite, version partageable
     jeudi soir.

2. `Envoyer la version client jeudi soir pour revue interne`
   - dimension : `missions`
   - kind : `milestone`
   - status : `active`
   - usage test : verifier que Sophia comprend jeudi soir comme contrainte
     existante du plan, pas comme nouvelle action a inventer.

3. `Bloc focus 25 minutes sur le cadrage`
   - dimension : `habits`
   - kind : `habit`
   - status : `active`
   - usage test : verifier que Sophia distingue une habitude de support d'une
     mission de livraison.

4. `Relire les retours internes sans repartir de zero`
   - dimension : `support`
   - kind : `exercise`
   - status : `pending`
   - usage test : ne doit pas etre propose comme action active sauf si le user
     parle explicitement des retours internes de vendredi.

## Regle De Test

Avant un run Alex qui teste le plan, l'agent doit lire ce fichier puis verifier
en base que le plan actif et les items existent. Le test n'est pas representatif
si Sophia n'a pas acces a ce plan.
