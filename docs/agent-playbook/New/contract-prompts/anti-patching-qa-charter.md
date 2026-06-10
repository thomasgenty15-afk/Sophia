# Charte Anti-Patching QA

## Philosophie

Sophia Brain doit devenir un système propre, généralisable et auditable. Une
correction réussie ne se contente pas de faire passer un run : elle améliore la
représentation interne du problème, clarifie l'owner, réduit les décisions
implicites, et rend les prochains bugs plus faciles à diagnostiquer.

Le but est de créer un système intelligent, pas une collection de rustines. À
chaque erreur, l'agent doit chercher l'amélioration qui rend Sophia meilleure
sur toute la famille de cas, pas seulement sur le tour rouge.

## Les 12 Commandements
0. Tu ne fais pas de routing métier par regex.

Une regex ou un `includes()` ne doit jamais décider qu'un message utilisateur
appartient à un skill, un tool, une opération ou une intention métier.

Si un problème vient d'une mauvaise détection d'intention, le fix appartient au
dispatcher, à son prompt, à son contrat de sortie structurée, ou à la sensibilité
du tool de clarification.

Si le dispatcher détecte correctement l'intention mais qu'une couche aval
l'écrase, le fix appartient à l'agenda, à l'arbitrage, au contrat de
clarification ou au handoff concerné, pas à une regex locale.

Les seuls checks déterministes acceptables sont des garde-fous non sémantiques :
validation de contrat, safety, consentement explicite, contraintes structurées
déjà produites (`no_tool`, `no_potion`, `status_only`), anti-duplication,
EffectLedger. Ils ne doivent pas inventer une intention.


1. Tu corriges la source amont, pas le symptôme aval.
   Si le bug vient de l'intake, corrige l'intake. S'il vient du reducer,
   corrige le reducer. S'il vient du renderer, corrige le renderer. Ne mets pas
   un garde aval pour masquer une mauvaise décision amont.

2. Tu ne corriges pas un tour, tu corriges une famille.
   Un RED QA doit être rattaché à une famille architecturale : routing, intake,
   reducer, confirmation, effects, renderer, status, memory, safety. Pas à une
   phrase exacte du run. Utilise les codes de
   `docs/agent-playbook/New/test-material/familly-bugs.md` et mets a jour la feuille de bugs du
   run quand elle existe.

3. Tu proposes l'amélioration architecturale quand elle est la bonne solution.
   Si une erreur révèle une frontière cassée, un owner flou, un fallback
   dangereux ou une absence de contrat, dis-le explicitement. Explique pourquoi
   une amélioration architecturale est préférable à un patch local.

4. Tu ne patches pas `run.ts` tant qu'un owner existe.
   Si le bug concerne une carte, un rappel, une préférence, un status ou un
   skill conversationnel, le fix appartient d'abord au contrat/runtime du
   domaine.

5. Tu ne rajoutes pas de regex métier sans procès-verbal.
   Une regex sémantique n'est acceptable que si elle est le dernier recours et
   si elle a : owner, raison, test anti-faux-positif, condition de suppression,
   entrée dans `docs/agent-playbook/New/test-material/15-chantiers-log.md`.

6. Tu respectes la chaîne de responsabilité.
   Le dispatcher oriente. Le snapshot décrit. L'agenda organise. Le skill
   décide. Le reducer transitionne. L'executor écrit. L'EffectLedger prouve. Le
   renderer parle. Un fix qui mélange ces rôles doit être refusé ou isolé comme
   legacy.

7. Tu ne dis jamais "c'est fait" sans preuve.
   Toute réponse de succès doit être adossée à `committed_effects` ou à une
   projection DB actuelle. Sinon la réponse doit dire clarification, échec,
   blocage ou absence de source.

8. Tu protèges les contre-exemples avant de fixer.
   Pour chaque bug, ajoute au moins un test positif, une paraphrase et un
   anti-faux-positif. Exemple : "annule ce rappel" doit annuler, mais "où
   annuler ce rappel ?" ne doit pas annuler.

9. Tu gardes le message courant prioritaire sur le vieux flow.
   Un pending ou active flow ne doit pas capturer une nouvelle intention
   explicite. Toute correction doit vérifier interruption, status, product_help,
   no-tool/no-potion, et nouvelle commande tool.

10. Tu documentes seulement ce qui aide à maintenir l'intelligence du système.
    Le code doit être clean, justifié, de niveau recherche produit. Les
    commentaires doivent expliquer les frontières, invariants ou choix non
    évidents. Pas de commentaire décoratif, pas de logique obscure sans
    justification.

11. Tu ne déclares pas vert sur un seul scénario.
    Après correction, rejoue au moins : le tour rouge, une paraphrase, un
    anti-faux-positif, et un mini-run multi-skill qui traverse
    interruption/status/confirmation.

12. Tu dois te comporter comme un architecte raisonnable. 

13. Tu dois éviter à tout pris les modèles de réponses avec des trous à remplir. 

14. Tu n'as pas le droit de mettre des guards qui repose sur de la regex.

## Test Mental

Avant de coder, l'agent doit pouvoir répondre :

- quelle est la source amont du bug ?
- quel est son code famille `BF-*` ?
- quel owner doit posséder le fix ?
- quelle famille de cas ce fix améliore-t-il ?
- quel anti-faux-positif prouve qu'on ne casse pas un cas voisin ?
- quelle trace ou projection prouve l'effet durable ?

Si la réponse tient seulement à "ce message exact doit passer", le fix est
probablement un patch fragile.

## Suivi Des Décisions Architecturales

| Date | Décision | Statut | Référence |
| --- | --- | --- | --- |
| 2026-05-30 | Ajouter une charte anti-patching QA pour les corrections de runs rouges. | Active | Demande utilisateur |
| 2026-05-30 | Rendre obligatoire la classification `BF-*` et la mise a jour des feuilles de bugs par run. | Active | J67 |
