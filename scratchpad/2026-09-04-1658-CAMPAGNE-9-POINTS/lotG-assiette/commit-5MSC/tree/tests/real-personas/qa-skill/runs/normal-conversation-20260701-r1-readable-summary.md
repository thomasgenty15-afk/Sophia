# Synthese Lisible - normal20-20260701-r1

Rapport canonique complet: `tests/real-personas/qa-skill/runs/normal-conversation-20260701-r1.md`

## Verdict Simple

Le run est techniquement valide, mais le verdict global reste `red`.

Ce n'est pas parce que Sophia est mauvaise sur 20 tours. Elle a plusieurs bons moments. Le `red` vient surtout de deux erreurs systeme dures:

1. Sophia cree bien un rappel, puis dit ensuite qu'elle ne peut pas le confirmer.
2. Sophia dit avoir note une preference utilisateur, mais rien n'est persiste et elle ne l'applique pas ensuite.

Ces deux points cassent la confiance, donc la grille QA force un `red`.

## Ce Qui S'est Bien Passe

- Sophia trouve vite le bon domaine general: aider l'utilisateur a demarrer une synthese.
- Quand l'utilisateur insiste clairement, elle donne de bonnes actions concretes.
- Elle ne sur-reagit pas au signal emotionnel non-crise: safety reste correctement a `none`.
- L'aide produit fonctionne quand l'utilisateur force explicitement le changement de sujet.
- Le rappel ponctuel est vraiment cree en DB au tour 13.

## Les 4 Problemes Racines

### 1. Le flow coaching reste trop accroche

Sophia reste souvent dans `coaching_recommendation` alors que l'utilisateur change de sujet.

Exemples:
- T4: "retiens cette preference" est traite comme du coaching.
- T6: question produit capturee par le coaching.
- T15: demande de statut du rappel capturee par le coaching.

Famille principale: `BF-ROUTE-02`.

### 2. Trop de langage interne "carte / technique"

Sophia repete "Je partirais sur une carte..." meme quand l'utilisateur demande de parler normalement.

Exemples:
- T10-T11: l'utilisateur veut un premier geste concret, Sophia renomme une carte.
- T18-T20: elle donne parfois une bonne phrase, mais garde le prefixe carte.

Familles: `BF-PREF-01`, `BF-INTAKE-05`.

### 3. Preference promise mais pas enregistree

L'utilisateur demande explicitement:

> quand je bloque, j'aime qu'on me donne un premier geste tres concret avant les grandes explications

Sophia confirme ensuite:

> je le prends en compte ici...

Mais la verification DB montre:
- `memory_items=0`
- `user_topic_memories=0`

Famille: `BF-MEMORY-01`.

### 4. Rappel cree, puis statut faux

T13:
- Sophia cree un rappel.
- Trace: `executed_tools=["create_one_shot_reminder"]`
- DB: `scheduled_checkins=1`, status `pending`

T14-T15:
- Sophia dit qu'elle ne peut pas confirmer ou verifier ce rappel.

C'est le bug le plus grave du run.

Familles: `BF-LEDGER-02`, `BF-STATUS-01`.

## Lecture Tour Par Tour Condensee

| Tours | Lecture humaine | Verdict lisible |
| --- | --- | --- |
| T1-T3 | Demarrage coaching correct. T2 est un peu trop "carte", T3 devient utile. | Plutot OK |
| T4-T6 | La demande de preference puis la question produit sont mal capturees par le flow actif. | Probleme net |
| T7 | Aide produit correcte apres clarification explicite. | OK |
| T8-T9 | Demande de changer le style: mauvais owner au debut, puis refus clair. | Mitige |
| T10-T12 | Retour coaching. Sophia ignore d'abord la preference, puis finit par donner une action concrete. | Mitige |
| T13 | Rappel cree correctement, mais reponse ajoute du coaching non demande. | Effet OK, UX moyenne |
| T14-T15 | Sophia nie ou ne retrouve pas le rappel pourtant cree. | Grave |
| T16-T18 | Emotion non-crise bien classee, mais reponse encore trop "carte" et confusion avec le rappel. | Mitige a mauvais |
| T19 | Bon recap humain. | OK |
| T20 | Cloture pas assez concise, encore "carte". | Moyen |

## Priorite De Correction

1. Corriger le statut post-effet: apres un rappel cree, Sophia doit pouvoir redire ce qui a ete programme.
2. Corriger l'interruption d'active flow: product_help, status, memory/preference doivent pouvoir preempter le coaching.
3. Interdire les claims memoire sans persistence: ne pas dire "c'est note" si rien n'est ecrit.
4. Rendre le renderer coaching plus humain: cacher les noms de cartes quand l'utilisateur demande une aide normale.

## En Une Phrase

Sophia sait aider ponctuellement, mais son flow coaching est trop collant et son lien entre effets durables, memoire et reponse visible n'est pas encore assez fiable.
