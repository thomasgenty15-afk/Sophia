# V1 Redirection Intelligente Vers Le Dashboard

## Intention

Documenter l'état actuel de l'architecture de redirection intelligente entre Sophia et le dashboard.

Le but n'est pas encore d'implémenter la refonte.
Le but est de :

- poser un état des lieux clair
- identifier les couches réellement actives
- identifier les couches mortes ou semi-mortes
- montrer pourquoi l'architecture actuelle ne colle plus à la vision produit
- préparer une refonte future plus propre

## Contexte Produit

La vision produit en train d'émerger est la suivante :

- Sophia devient l'unique figure relationnelle visible
- le dashboard devient le lieu d'exécution
- `Inspiration` devient la surface du sens
- le `Labo` devient la surface des outils
- les cartes, potions, phase 1 et redirections doivent être comprises comme un tout cohérent

Dans cette vision :

- pas de Willy visible
- pas de multiplication confuse des figures d'accompagnement
- pas de redirection opaque vers des surfaces mal nommées

## Diagnostic Global

L'architecture actuelle de redirection existe, mais elle est hybride.

Elle repose en réalité sur plusieurs couches qui coexistent :

- des intents dashboard spécifiques
- un `surface_plan` généré par le dispatcher
- un `surface_state` runtime avec fatigue/cooldown
- des addons injectés dans le contexte du compagnon
- un frontend dashboard encore structuré selon une ancienne vision produit

Le résultat est une architecture partiellement fonctionnelle, mais devenue incohérente avec la direction actuelle du produit.

## Vue D'Ensemble De La Chaîne Actuelle

Aujourd'hui, la chaîne ressemble grossièrement à ceci :

1. le dispatcher lit le message
2. il produit des `signals`
3. il produit aussi un `memory_plan`
4. il produit aussi un `surface_plan`
5. le router applique des décisions runtime
6. le `surface_state` décide s'il faut exposer une opportunité produit
7. le loader transforme cela en blocs de contexte texte
8. Sophia répond avec ce contexte injecté

En parallèle, il existe encore des intents dédiés du type :

- `dashboard_preferences_intent`
- `dashboard_recurring_reminder_intent`

Et il existe aussi des reliques du type :

- `__dashboard_redirect_addon`

## Les Couches Actuelles

## 1. Le Dispatcher

Le dispatcher produit aujourd'hui :

- des signaux conversationnels
- un `memory_plan`
- un `surface_plan`

Le point important est que son prompt continue à raisonner avec des surfaces et des règles anciennes.

Il connaît notamment :

- `dashboard.personal_actions`
- `dashboard.north_star`
- `dashboard.reminders`
- `dashboard.preferences`
- `architect.*`

Cela signifie que l'intelligence de redirection est encore structurée autour d'un ancien produit.

## 2. Les Intents Dashboard Dédiés

En plus du `surface_plan`, le dispatcher émet aussi des intents spécifiques :

- `dashboard_preferences_intent`
- `dashboard_recurring_reminder_intent`

Ces intents sont ensuite transformés en addons textuels de contexte.

Problème :

- cela crée une deuxième logique de redirection parallèle
- cette logique ne passe pas par le même registre de surfaces
- elle concurrence le `surface_plan`

## 3. Le `surface_plan`

Le `surface_plan` est aujourd'hui le vrai mécanisme vivant de suggestion produit.

Il produit :

- un `surface_mode`
- une liste de candidats
- un niveau de suggestion
- un style de CTA
- un besoin éventuel de contenu

Cette couche est conceptuellement intéressante.

Mais elle est alignée sur un mauvais registre de surfaces.

Autrement dit :

- la mécanique est potentiellement bonne
- les objets qu'elle pousse ne sont plus les bons

## 4. Le `surface_state`

Le `surface_state` ajoute :

- fatigue
- cooldown
- historique d'acceptation
- niveau de suggestion
- logique anti-répétition

Cette couche sert à éviter de pousser toujours la même surface.

Elle n'est pas absurde.
Mais elle repose elle aussi sur l'ancien registre de surfaces.

Donc elle optimise actuellement un système qui n'est plus le bon.

## 5. Le Loader De Contexte

Le loader prend :

- les addons dashboard
- l'opportunité de surface
- des résumés contextuels
- des résumés de rendez-vous

et les transforme en blocs texte injectés dans le prompt de Sophia.

Problème principal :

plusieurs couches différentes finissent concaténées en prose dans le même contexte.

On retrouve ainsi des blocs comme :

- `surface_opportunity_addon`
- `dashboard_capabilities_lite_addon`
- `dashboard_preferences_intent_addon`
- `dashboard_recurring_reminder_intent_addon`

Cela crée une architecture difficile à maîtriser parce que :

- les responsabilités se chevauchent
- les signaux se répètent
- les priorités ne sont pas toujours nettes

## 6. Le Frontend Dashboard

Le frontend dashboard reste lui aussi structuré selon l'ancienne vision.

On y retrouve encore des tabs du type :

- `plan`
- `defense`
- `atelier`
- `reminders`
- `preferences`

Cela ne correspond plus à la vision cible qui émerge :

- phase 1
- Inspiration
- Labo
- plan par phases
- supports dynamiques

## Problèmes Principaux

## 1. Deux systèmes de redirection coexistent

Il existe à la fois :

- une logique d'intents dashboard dédiés
- une logique `surface_plan`

Cela crée une duplication inutile.

## 2. Une partie du système est déjà morte ou quasi morte

Le `__dashboard_redirect_addon` existe encore comme lecture/suppression, mais ne semble plus être réellement produit.

Cela indique une refonte entamée puis laissée en état intermédiaire.

## 3. Le registre de surfaces est obsolète

Le système continue à raisonner avec :

- `north star`
- `personal actions`
- `architect.*`

alors que la nouvelle vision produit repose sur :

- `Inspiration`
- `Labo`
- `phase 1`
- cartes
- potions
- plan par phases

## 4. La prose injectée dans le contexte est trop fragmentée

Au lieu d'avoir une seule couche canonique de navigation produit, le système injecte plusieurs blocs texte concurrents.

Cela complique :

- la cohérence
- le debug
- la prédictibilité
- l'évolution du produit

## 5. Les concepts de `rendez-vous` sont partiellement éclatés

Aujourd'hui, la couche d'aide contextuelle lit surtout :

- `user_recurring_reminders`

alors que le système réel comprend aussi :

- `user_rendez_vous`
- `scheduled_checkins`

Le mot "rendez-vous" ne pointe donc pas toujours vers une seule source de vérité conversationnelle.

## 6. Le système n'est pas aligné avec Sophia comme figure unique

L'architecture actuelle a été pensée dans un contexte où plusieurs couches ou sous-surfaces coexistaient de manière plus indépendante.

Avec Sophia comme seule figure visible, il faut :

- une architecture plus unifiée
- une sémantique plus claire
- une redirection plus simple à comprendre

## Ce Qui Est Encore Solide

Tout n'est pas à jeter.

## 1. Le `memory_plan`

La logique de planification mémoire reste utile.

Elle permet de choisir :

- quoi charger
- à quel niveau
- avec quelle profondeur

Cette couche reste compatible avec la vision future.

## 2. Le principe d'un `surface_plan`

L'idée qu'un dispatcher puisse proposer une opportunité produit est bonne.

Le problème n'est pas le principe.
Le problème est :

- le mauvais registre
- la concurrence avec d'autres mécanismes

## 3. Le `surface_state`

La logique de fatigue / cooldown / anti-répétition peut être réutilisée.

Mais seulement après réalignement sur un nouveau registre canonique.

## 4. Le rail `rendez-vous` / `scheduled_checkins`

La couche technique de suivi proactif existe déjà.

Elle pourra être réutilisée pour :

- les rappels
- les suivis post-potion
- les accompagnements courts dans le temps

## Direction Cible

La refonte future devrait viser une architecture beaucoup plus simple.

## Principe Directeur

Ne garder qu'une seule couche canonique de navigation produit.

Pas :

- un intent dashboard d'un côté
- un `surface_plan` de l'autre
- des addons spécifiques encore ailleurs

Mais :

- un seul contrat canonique de redirection

## Vision Cible

Le système futur devrait raisonner avec des surfaces alignées sur le produit réel.

Exemples de surfaces futures :

- `dashboard.phase_1`
- `dashboard.inspiration`
- `dashboard.labo`
- `dashboard.plan`
- `dashboard.reminders`
- `dashboard.preferences`

Puis, à terme, potentiellement des sous-cibles plus fines :

- `dashboard.labo.defense_card`
- `dashboard.labo.attack_card`
- `dashboard.labo.support_card`
- `dashboard.labo.potion`

## Rôle Futur De Sophia

Sophia doit devenir :

- la couche relationnelle unique
- la voix qui aide
- la voix qui clarifie
- la voix qui redirige quand c'est pertinent

Elle ne doit pas donner l'impression qu'un autre assistant spécialisé prend la main.

## Conséquence Produit

Il faut penser la redirection non plus comme :

- "quel écran dashboard ancien pousser ?"

Mais comme :

- "vers quelle surface utile de l'expérience Sophia l'utilisateur doit-il aller maintenant ?"

## Mémoire Et Préférences

La future refonte devra aussi revoir la logique de mémoire injectée côté dashboard.

Aujourd'hui, le système conserve encore une vision ancienne où certaines redirections sont attachées à des features spécifiques.

La logique future devra être recentrée sur :

- les préférences d'accompagnement Sophia
- les surfaces déjà vues / utiles
- les patterns d'acceptation ou d'ignorance
- les besoins récurrents de l'utilisateur

Autrement dit :

- moins de mémoire orientée "ancien dashboard"
- plus de mémoire orientée "personnalisation de l'accompagnement"

## Recommandation De Refonte Future

Quand la refonte sera lancée, la bonne approche sera probablement :

1. redéfinir le registre canonique des surfaces
2. supprimer les intents dashboard spécifiques redondants
3. garder une seule sortie canonique de navigation produit
4. simplifier la traduction en contexte texte
5. réaligner le frontend dashboard avec les nouvelles surfaces

## Ce Qu'Il Ne Faut Pas Faire

- patcher l'ancien registre de surfaces sans revoir la vision
- ajouter `Inspiration` et `Labo` en plus du reste sans nettoyage
- garder trop longtemps les deux systèmes en parallèle
- multiplier les addons textuels concurrents

## État Des Lieux En Une Phrase

Le système actuel de redirection intelligente n'est pas vide ni inutile, mais il est construit autour d'un produit ancien et d'une architecture hybride.

Il peut servir de base technique partielle, mais il ne peut pas être conservé tel quel si l'on veut une redirection cohérente vers la future expérience `Sophia -> Inspiration / Labo / Plan / Rappels / Préférences`.

## Usage De Ce Document

Ce document sert de base préparatoire pour une refonte future.

Il peut être utilisé pour :

- cadrer la dette actuelle
- expliquer pourquoi une refonte est justifiée
- préparer une future spec de migration
- éviter de rajouter de nouvelles couches sur une base déjà trop hybride
