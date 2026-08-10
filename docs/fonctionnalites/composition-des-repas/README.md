# composition-des-repas

Le périmètre de ce domaine est décrit dans [../README.md](../README.md).

On écrit une fiche **quand on retouche** une fonctionnalité de ce domaine —
écrire des fiches rétroactives produirait des documents que personne n'a
vérifiés.

## Les fiches

| Fiche | Statut | En une phrase |
|---|---|---|
| [FF-002 · Dire qu'on ne sera pas là](FF-002-dire-son-absence.md) | 🟡 Spécifiée | Il n'existe aucun endroit pour déclarer une absence ; `cook_days` ne le dit pas, et `no_cook_days` n'existe que dans un commentaire. |
| [FF-003 · Lire ce que l'élève écrit avant de composer](FF-003-intake-structure.md) | 🔵 Idée | Un premier appel modèle qui ne compose rien et rend un JSON de contraintes fermé, pour que la prose libre engage enfin à quelque chose. |
| [FF-004 · Ce qui se garde, et le mot la veille](FF-004-conservation-et-decongelation.md) | 🔵 Idée | Où ranger chaque préparation, et le message du soir qui dit de sortir le plat de demain. |
| [FF-005 · Une course ou deux — l'élève choisit](FF-005-strategie-de-courses.md) | 🟡 Spécifiée | Les vagues restent le défaut ; « une seule course, je congèle » devient un second mode, choisi et jamais déduit. |
| [FF-006 · Refaire sa semaine sans perdre celle d'avant](FF-006-cycle-de-vie-du-plan.md) | 🔵 Idée | La mécanique transactionnelle est solide ; ce qui n'a jamais été observé, c'est ce que l'élève comprend avant d'appuyer. |
| [FF-030 · Le contexte de composition](FF-030-le-contexte-de-composition.md) | 🟡 coach · 🟠 élève | Deux volets. Côté coach : 36 % du bloc doctrine est écrit pour la conversation. Côté élève : cinq entrées collectées — allergies, taille, corps, axe — n'atteignent jamais le générateur. |

## Ce que ces fiches ne couvrent pas

Le chantier de préparation de repas portait une sixième idée : **des actions
recommandées qui ne viennent pas de la doctrine du coach**. Elle n'est pas ici
parce qu'elle n'appartient pas à ce domaine — c'est une question
d'**attribution**, donc de [`methode-du-coach/`](../methode-du-coach/). La règle
du dépôt est stricte et déjà écrite dans le code (`resolveDoctrineReplacement`,
`doctrine_delegation.ts`) : sans nom, pas de signature, et jamais « le coach ».
Une fiche à elle seule, à écrire avant d'afficher quoi que ce soit qui ressemble
à un conseil non signé.
