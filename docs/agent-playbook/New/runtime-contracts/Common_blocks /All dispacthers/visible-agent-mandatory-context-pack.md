# Visible Agent Mandatory Context Pack

Ce bloc est commun a tous les dispatchers locaux qui appellent un visible
agent.

Un visible agent ne doit jamais reconstituer seul le contexte conversationnel.
Il recoit toujours un pack fixe ajoute par le runtime, plus un contexte metier
stage-specific fourni par le dispatcher local.

## Pack Fixe Runtime

Le runtime doit injecter ce pack dans chaque appel de visible agent :

```json
{
  "visible_runtime_context": {
    "style_rules": "VISIBLE_OUTPUT_STYLE_RULES",
    "recent_user_messages": [
      {
        "role": "user",
        "content": "string",
        "created_at": "iso-date optional"
      }
    ]
  }
}
```

Regles :

- `style_rules` correspond au bloc canonique `VISIBLE_OUTPUT_STYLE_RULES`.
- `recent_user_messages` contient les 5 derniers messages user disponibles,
  dans l'ordre chronologique.
- Les messages recents servent a la continuite de ton et de reference, pas a
  decider une mutation, une route ou un outcome metier.
- Les messages recents servent aussi a identifier l'intention visible immediate
  du dernier message user dans le contexte des tours precedents. Cette intention
  visible peut etre: demander une definition, une explication, une difference,
  une clarification, un exemple concret, une destination produit, une repetition
  ou une correction.
- Si le dernier message user demande une comprehension ("c'est quoi",
  "je connais pas ces mots", "ca veut dire quoi", "quelle difference",
  "comment je sais que ce n'est pas X"), le visible doit repondre d'abord a
  cette demande precise avant de rappeler la recommandation ou la destination.
- Si le dernier message user demande seulement a comprendre, comparer,
  clarifier, reformuler ou explorer sans demander d'action produit, le visible
  ne pousse pas une feature par reflexe. Il repond d'abord au besoin visible du
  tour et ne mentionne une feature que si elle aide directement cette demande.
- Si le dernier message user dit explicitement qu'il ne veut pas de support,
  carte, potion, feature, preparation ou guidance produit maintenant, le visible
  respecte cette contrainte dans sa reponse visible.
- Pour un user novice, le visible definit les termes produit ou metier en
  langage simple. Il ne doit pas seulement repeter la recommandation active.
- Les vrais mots recents du user ne doivent pas etre dupliques dans le contexte
  metier sous un champ `user_words`. Si le visible a besoin de relire ce que le
  user vient de dire ("ou trouver", "preparer", "possible ou pas", etc.), il
  utilise `visible_runtime_context.recent_user_messages`.
- Le pack fixe ne doit pas contenir de dump DB, de memoire brute,
  `note_information` brute, secrets, tokens, ni champs internes inutiles.
- Les donnees de profil comme age, sexe, genre, localisation fine ou preferences
  durables ne font pas partie du pack fixe. Elles peuvent etre ajoutees
  uniquement dans un contexte metier filtre si le stage visible en a besoin.

## Contexte Obligatoire Dispatcher

Le dispatcher local doit fournir un contexte stage-specific pour tout visible
agent qu'il demande.

Ce contexte doit expliquer au visible :

- quel `visible_task.kind` doit etre rendu ;
- quelle intention visible poursuivre ;
- quelles entites sont concernees par ce stage ;
- quelles valeurs sont deja connues ;
- quelles valeurs sont manquantes ou faibles ;
- quels fragments du message courant justifient la question ou la reponse ;
- quelles contraintes de ton ou de formulation s'appliquent ;
- ce que le visible ne doit pas dire.

Forme recommandee :

```json
{
  "visible_task": {
    "kind": "stage_name",
    "conversation_context": {
      "field_or_stage": "stage_name",
      "known_values": {
        "visible_goal": "string",
        "selected_ids": []
      },
      "missing_or_weak_values": [],
      "tone_constraints": [],
      "do_not_say": [],
      "evidence_used": []
    }
  }
}
```

Le dispatcher peut rester sparse, mais il ne peut pas envoyer un visible agent
sans direction. Si un visible stage existe, il doit recevoir un contexte metier
suffisant pour repondre sans refaire la decision du dispatcher.

Interdits dans le contexte metier visible :

- pas de champ `user_words` ou equivalent qui recopie les messages bruts ;
- pas de transcript complet ;
- pas de note brute ;
- pas de DB brute.

Quand le dispatcher veut expliquer au visible pourquoi il a choisi une etape, il
doit utiliser des champs structures comme `known_values`,
`missing_or_weak_values`, `selected_candidate`, `recommendation`,
`evidence_used` ou `do_not_say`. Le visible peut recouper avec
`visible_runtime_context.recent_user_messages`, mais il ne doit pas remplacer la
decision du dispatcher par sa propre classification.

## Responsabilites

Runtime :

- injecte `VISIBLE_OUTPUT_STYLE_RULES` ;
- injecte les 5 derniers messages user filtres ;
- complete les valeurs canoniques stables depuis l'etat valide ;
- filtre les champs dangereux ou bruts ;
- choisit les donnees commit-proof quand le visible confirme un effet.

Dispatcher local :

- choisit le visible stage ;
- fournit l'intention metier du stage ;
- transmet uniquement les entites concernees par ce visible stage ;
- transmet les incertitudes et interdits utiles ;
- ne demande jamais au visible de router, muter, commit ou inventer une valeur.

Visible agent :

- respecte `VISIBLE_OUTPUT_STYLE_RULES` ;
- lit le dernier message user et repond a son intention visible immediate dans
  le contexte des messages precedents ;
- ne transforme pas une demande d'explication, de comparaison ou de
  clarification en recommandation feature automatique ;
- respecte explicitement une contrainte user du type "pas de support / carte /
  potion / feature / guidance produit maintenant" ;
- utilise les messages recents pour le ton, la reference locale et la
  comprehension de la demande visible du dernier tour ;
- utilise le contexte stage-specific comme source de verite ;
- ne transforme pas cette lecture du dernier message en decision de route, de
  mutation, de feature ou d'outcome metier ;
- ne lit pas de DB brute, memoire brute ou note brute ;
- ne confirme pas d'effet sans preuve de commit dans le contexte.

## Anti-Pattern: Repetition De Recommandation

Quand un flow a deja recommande une feature, le visible agent ne doit pas
repeter automatiquement cette recommandation si le dernier message demande
d'abord a comprendre un terme.

Exemple de mauvais comportement :

```text
User: Attends, je connais pas ces mots. C'est quoi une carte d'attaque, et
Préparer le terrain ça veut dire quoi concrètement ?

Sophia: Je partirais sur une carte d'attaque, technique Préparer le terrain:
tu mets en place avant de commencer tout ce qui peut te faciliter le démarrage.
Et pour la préparer, ça se fait depuis l'action concernée dans le Plan.
```

Pourquoi c'est mauvais :

- le user demande une definition et une explication ;
- la reponse repete la recommandation active ;
- la navigation produit arrive avant la comprehension ;
- un user novice reste dependant du vocabulaire Sophia.

Comportement attendu :

```text
Une carte d'attaque, c'est une aide pour démarrer une action quand le premier
pas bloque. "Préparer le terrain", ici, veut dire préparer avant d'ouvrir le
dossier: documents, espace, premier geste. Pour ton dossier mutuelle, ça colle
parce que ton blocage est au démarrage.
```
