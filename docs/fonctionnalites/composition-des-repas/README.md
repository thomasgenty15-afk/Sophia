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
| [FF-030 · Le contexte de composition](FF-030-le-contexte-de-composition.md) | 🟡 coach · 🟢 élève | Deux volets. Côté coach : 36 % du bloc doctrine est écrit pour la conversation. Côté élève : cinq entrées collectées — allergies, taille, corps, axe — n'atteignent jamais le générateur. |
| [FF-037 · L'ancre protéique](FF-037-l-ancre-proteique.md) | 🟠 En cours | Rien ne vérifie qu'un déjeuner porte de quoi tenir jusqu'au dîner. Une consigne, une vérification au parseur, un retry — et aucun gramme sur la personne. |
| [FF-038 · Le référentiel de composition](FF-038-le-referentiel-de-composition.md) | 🟠 En cours | Le produit ne sait pas ce qu'il met dans l'assiette. Une table Ciqual, un résolveur qui n'invente rien, et des quantités que le parseur recalcule au lieu de croire le modèle. |
| [FF-039 · Enveloppes et verdicts, en observation](FF-039-enveloppes-et-verdicts-en-observation.md) | 🟠 En cours | Deux formes d'enveloppe dont l'une ne peut structurellement rien viser. Les verdicts sont écrits et jamais actionnés — et ils portent la gate du chantier. |
| [FF-040 · La boucle de correction](FF-040-la-boucle-de-correction.md) | 🟠 En cours | Le verdict devient un jeton, sans un chiffre et sans un mot du registre du régime. Porte aussi le plancher de couverture et le ré-ancrage. |
| [FF-041 · La méthode du coach, exécutable](FF-041-la-methode-du-coach-executable.md) | 🟠 En cours | Le coach répond à un débat de doctrine ; la publication en dérive des jetons. Il ne voit jamais un axe du moteur. |
| [FF-042 · Les régimes alimentaires](FF-042-les-regimes-alimentaires.md) | 🟠 Fondations + R6 livré | Un végan reçoit encore un plan avec de la viande dedans : le verrou n'est pas câblé. Ce qui est livré, c'est le signalement de ce qu'aucune assiette ne peut apporter — sans jamais prescrire. |
| [FF-051 · Les apports fixes](FF-051-les-apports-fixes.md) | 🟢 Livré | « Je prends un shaker tous les matins » : le premier input qui alimente le calcul et non la sélection. Il occupe un moment, il compte dans le plancher, il compte dans l'enveloppe. |
| [FF-052 · Les propriétés de jour](FF-052-les-proprietes-de-jour.md) | 🟢 Livré | Le pendant positif de l'absence. Deux propriétés qui mordent — le jour de batch, le jour de restes — parce qu'une propriété sans branche est pire que son absence. |
| [FF-054 · Le retour de fin de plan](FF-054-le-retour-de-fin-de-plan.md) | 🟠 Noyau livré | Le moteur sait ce qu'il a composé, pas ce qui a suffi. Trois questions et une par dynamique, chacune avec son lecteur nommé — la garde qui empêche de refaire le point du dimanche. |
| [FF-055 · Les recommandations d'activité](FF-055-les-recommandations-d-activite.md) | 🟠 Noyau livré | Deux versions : le plancher public sans coach, sa posture avec. Et la ligne qui tient dans les deux — même un coach ne fait pas programmer Sophia. |
| [FF-057 · La procédure accident](FF-057-la-procedure-accident.md) | 🟡 Spécifiée | « J'ai pas suivi » ne mène nulle part : le fait est capté, personne ne répond à « qu'est-ce que ça change pour la suite ». Trois entrées, un formulaire à trois boutons, quatre actions de réalignement — dont la session de cuisine sautée, qui fait disparaître des repas sans que l'écran s'en aperçoive. |

## Le chantier des unités de composition

FF-037, FF-038 et FF-039 sont les trois premiers étages d'un chantier de huit,
dont le document d'origine est `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md`.
Les quatre étages suivants (boucle de correction, méthode du coach rendue
exécutable, résolution foyer, sentinelles et ré-ancrage) **ne démarrent que si
la gate de FF-039 §10 est passée** : sous 80 % de couverture de résolution
médiane, corriger un plan reviendrait à le corriger sur du bruit.

**La gate est passée le 2026-08-10 — 96,2 % de couverture médiane** (rapport :
`scratchpad/RAPPORT-UNITES-COMPOSITION.md`). La phase II est donc ouverte :
FF-040 et FF-041 ici, [FF-043](../le-foyer/FF-043-la-resolution-foyer.md) dans
`le-foyer/`.

## Ce que ces fiches ne couvrent pas

Le chantier de préparation de repas portait une sixième idée : **des actions
recommandées qui ne viennent pas de la doctrine du coach**. Elle n'est pas ici
parce qu'elle n'appartient pas à ce domaine — c'est une question
d'**attribution**, donc de [`methode-du-coach/`](../methode-du-coach/). La règle
du dépôt est stricte et déjà écrite dans le code (`resolveDoctrineReplacement`,
`doctrine_delegation.ts`) : sans nom, pas de signature, et jamais « le coach ».
Une fiche à elle seule, à écrire avant d'afficher quoi que ce soit qui ressemble
à un conseil non signé.
