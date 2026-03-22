# Machine de momentum utilisateur - Observability Phase 3

## Objectif

Construire un vrai bundle d'audit momentum exportable localement, sur le modele du bundle memoire.

## Livrables

### 1. Trace builder

`supabase/functions/sophia-brain/lib/momentum_trace.ts`

Le trace builder reconstruit :

- les messages de la fenetre
- les turns user
- la timeline des etats momentum
- les decisions proactives
- les outreachs programmes / livres
- les evenements non assignes

### 2. Scorecard

`supabase/functions/sophia-brain/lib/momentum_scorecard.ts`

La scorecard agrege :

- distribution des etats
- matrice de transitions
- decisions daily / weekly / outreach
- delivery outreach
- reply rate
- delai moyen de reponse
- alertes simples

### 3. Endpoints

- `get-momentum-trace`
- `get-momentum-scorecard`

### 4. Export script

`scripts/export_momentum_audit_bundle.mjs`

Le script produit :

- un JSON principal
- un transcript texte

## Format du bundle

Le bundle exporte contient :

- `ok`
- `exported_at`
- `source`
- `request`
- `trace`
- `scorecard`
- `annotations`

Pour l'instant :

- `annotations` est vide par design

## Effet attendu

Apres cette phase 3, on peut deja :

- exporter une fenetre momentum par user
- lire la mecanique interne du systeme
- mesurer les branches reelles utilisees
- preparer la phase 4 de documentation d'audit
