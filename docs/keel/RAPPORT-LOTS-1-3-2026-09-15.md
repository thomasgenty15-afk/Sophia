# Lots 1 à 3 appliqués — ce qui est fermé, ce qui reste

**2026-09-15.** Plan appliqué : `PLAN-BETA-PRETE-2026-09-15.md`. Trois commits, chacun
passé par `scripts/agent-gate.sh` au pré-commit : `752116f9`, `989f435b`, `5fd33cc7`.

**Verdict : correctifs vérifiés hors ligne — les preuves navigateur et la campagne restent.**
Pas « bêta ouvrable ». Aucun appel fournisseur payant n'a été fait.

## 1. Ce qui est fermé, et par quelle preuve

| Défaut de l'audit | État | Preuve |
|---|---|---|
| **R1** — une demande morte se lit « en cours » | fermé | Les deux verrous réels du 546 et du 502 se lisent `expired` en base, sous l'identité de leur propriétaire |
| **R2** — le second tap après un succès rend 409 | fermé | Adopté et nommé → 200 `already_written`, zéro écriture, zéro RPC ; réponse perdue retrouvée par le `draft_id` |
| **R3** — l'allure d'objectif hors de l'empreinte | fermé | Allure changée ⇒ empreinte changée ; retirer la ligne du handler rend le test rouge |
| **R4** — 260 g de lentilles achetées pour rien | fermé côté mesure | Nouvelle cause `ingredient_bought_unused`, nommée par l'audit de production, rendue à l'écran dans les deux langues |
| **R5** — la reprise n'est pas auditable | fermé | Le harnais pose son `x-request-id` et archive l'état lu après chaque tir |
| **B2** — le dîner léger non tracé de bout en bout | fermé | Test de jointure écran → base → moteur → prompt, avec le vrai sérialiseur du frontend |

### Le défaut que personne n'avait vu

**Le contrôle d'énergie par bouche n'avait jamais tourné.** Le handler passait `energy: null`
en dur à la garde finale. Sur les 25 tirs de l'ancienne campagne, le compte de contrôle
incomplet pour `mouth_energy` valait exactement le nombre de bouches du tir : 1 à N=1, 2 à
N=2, 4 à N=4. Ce n'était pas « un contrôle qui n'a pas pu conclure » : c'était un contrôle
jamais branché, dont le zéro se lisait « personne n'est sous-nourri ».

Il est branché. **Conséquence à connaître avant la campagne :** étant en comptage, il ne
bloque aucun plan, mais il peut faire passer un plan de conforme à livrable avec écarts.
C'est ce que le commentaire du seuil demandait depuis le début — « on compte, on regarde la
campagne, puis on tranche » — et on ne peut pas regarder une campagne sur un contrôle qui ne
tourne pas.

### Deux explications de l'audit corrigées par les faits

1. **Les lentilles ne viennent pas d'une casserole retirée.** La réponse du modèle ne
   contient qu'une préparation, ses identifiants de session sont cohérents, et aucune recette
   ne mentionne de lentille. En revanche la **prose de la session** décrit un deuxième lot
   « de Lea » au tempeh et aux lentilles, que le modèle n'a jamais écrit comme recette — et la
   liste de courses a suivi la prose. Rien n'a été retiré.
   *Consigné, pas réparé :* détecter une prose qui promet une recette absente demanderait un
   matcher sur du texte libre, ce que ce dépôt s'interdit.

2. **Le surplus de 9 g sur une casserole n'est pas un dépassement.** La masse prête est une
   fonction en escalier du facteur de croissance : 1717,5 g au facteur 1 pour 1718 g prélevés,
   marche suivante à 1727 g. Les 9 g sont le **minimum atteignable**. Une borne théorique
   « un gramme par ligne » aurait accusé la production d'un défaut inexistant ; le banc balaie
   l'escalier et le dit.

### Le banc de réconciliation ne se croit plus sur parole

L'ancien script calculait `reste = prêt − prélevé` puis vérifiait `prêt = prélevé + reste` :
vrai pour toute paire de nombres. Cette tautologie rendait vert cinq fois sur cinq.
`scratchpad/2026-09-15-BETA-PREUVES/reconcilier-v2.ts` pose trois questions réfutables.
Résultat sur les cinq cas : **4 réconciliés, 1 défaut** — les 260 g de lentilles.

## 2. Tests et état de la pile

| | |
|---|---|
| Deno, dossier keel | **7 358 passés, 0 échec, 2 ignorés** |
| Vitest, suite complète | **2 605 passés**, 2 rouges tolérés (lane A7, liste nominative) |
| `agent-gate.sh` | **pass** sur les trois commits |
| Migration `20260915100000` | appliquée en local |
| Runtime edge | sert le code commité — vérifié par un appel réel refusé en 0,67 s, avant tout appel modèle |

Cet appel de contrôle a prouvé trois choses d'un coup, sans dépense : les modules neufs se
chargent, la fonction refuse avant le modèle, et **elle renvoie l'identifiant de demande que
l'appelant a posé** — le câblage de traçabilité du lot 1.3, de bout en bout. Il a aussi
balayé le bail mort du 502, par le mécanisme même du lot 1.

## 3. Ce qui reste, et pourquoi je m'arrête ici

Les lots 4 et 5 demandent des appels fournisseur payants : chaque parcours navigateur qui
compose, puis les deux pilotes et les 30 tirs. Le mandat du plan l'interdit sans enveloppe
écrite, et les brouillons locaux ont expiré — il n'existe plus aucun aperçu à adopter
gratuitement.

**Trois décisions à prendre avant le lot 4.**

| # | Décision | Recommandation |
|---|---|---|
| D1 | Contrat de délai : accepter ou non l'amendement (acceptation ≤ 145 s, disponibilité p95 180 s, échéance 380 s) | Accepter, avec la clause que la disponibilité se mesure à l'écriture du plan, jamais à la réponse HTTP |
| D2 | Enveloppe : ~10 appels pour les parcours navigateur, puis 60 à 70 pour pilotes et campagne | Autoriser les 10 d'abord, décider des 60 à 70 après le lot 4 |
| D3 | Un plan « livrable avec écarts » compte-t-il comme utilisable dans les seuils 24/30 et 27/30 ? | Non. La politique de garde ne change pas ; le comptage devient honnête |

D3 pèse plus qu'avant : le contrôle d'énergie par bouche va produire des écarts nommés qui
n'existaient pas dans les chiffres de l'ancienne campagne.

**Ce qui n'a pas été fait, et c'est dit :** aucun parcours navigateur, aucune génération,
aucune migration distante, aucun déploiement. Le 502 du pilote reste inexpliqué — les
journaux du runtime de la fenêtre concernée ont disparu avec un redémarrage de conteneur ;
il faudra le réexpliquer au premier pilote du lot 5, qui après le lot 1 ne peut plus laisser
de verrou mort derrière lui.
