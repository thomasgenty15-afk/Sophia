# FF-023 · La conversation normale

| | |
|---|---|
| **Identifiant** | `FF-023-la-conversation-normale` (anciennement `FF-023-le-compagnon` — même fiche, recentrée le 2026-08-08) |
| **Statut** | 🟠 En cours — le tour par défaut existe, et **la continuité est livrée** (`chat-inbound-v1` charge l'historique récent depuis le 2026-08-…, vérifié le 2026-09-01). Ce qui reste : la voix et le style, non re-vérifiés |
| **Date** | 2026-08-08 |
| **Autorité produit** | [MODEL.md](../../keel/MODEL.md) · [CONTRACT.md](../../keel/CONTRACT.md) · la direction du domaine ([README](README.md)) |
| **Code** | `sophia-brain/agents/companion.ts` · `router/response_style_policy.ts` · `_shared/keel/locale.ts` · `chat-inbound-v1/index.ts` (garde 6 : `loadRecentChatHistory`, le trou `history: []` est **fermé**) · `_shared/chat/recent_history.ts` |
| **Effort estimé** | 2 jours (la continuité) |

---

## 1. Le problème

Tout ce qui n'est pas réclamé par une compétence arrive ici — la très grande
majorité des tours. Si la personne raconte sa vie, le chat doit savoir **juste
parler** : ni formulaire, ni coaching de vie, ni réponse d'automate.

Deux défauts, un par nature :

**Il parle au nom du coach.** Sur un sujet non tranché, un modèle qui répond de
sa culture générale sans le dire attribue au coach une position qu'il n'a
jamais prise.

**Il n'a aucune mémoire de ses propres tours.** Vérifié dans le code :
`chat-inbound-v1` passe `history: []` au cerveau — aucune requête d'historique
n'existe sur le chemin de production. Les blocs « RECENT VISIBLE HISTORY »,
« DERNIÈRE RÉPONSE » et l'historique du contexte sont donc **toujours vides**.
Le fil rouge (`short_term_context`) est mort lui aussi : son compteur n'est
jamais incrémenté depuis le passage au scope `app`. La continuité apparente ne
tient qu'à `temp_memory` et à la mémoire longue — et le tour photo, qui
n'exécute pas le cerveau, la casse de façon visible.

**Ce que ça coûte.** Une personne qui raconte quelque chose, envoie une photo,
puis dit « et du coup, t'en penses quoi ? » parle à quelqu'un qui n'a **aucune
trace** de ce qu'elle vient de dire. Deux issues, toutes deux graves : Sophia
avoue (déception), ou Sophia **fait semblant** — et confabule. C'est le défaut
« pas humain » n°1, observé en usage réel.

## 2. Job stories

> **Quand** je raconte ma journée, **je veux** une conversation normale, **pour
> que** l'app ne soit pas un automate à formulaires.

> **Quand** je reviens sur ce que j'ai dit trois messages plus tôt, **je veux**
> que ça suive, **pour que** je n'aie pas à tout répéter.

> **Quand** j'ai déjà donné une information — mon prénom, mon foyer, ce que j'ai
> mangé, mon dernier tap — **je ne veux jamais** qu'on me la redemande.

> **Quand** mon coach n'a rien dit sur un sujet, **je veux** le savoir, **pour
> que** je sache d'où vient la réponse.

## 3. Périmètre

### Dans le périmètre

- Le tour par défaut : contexte, modèle, réponse visible, sous verrou.
- **La continuité de conversation** (à construire) : l'historique récent des
  tours — y compris les échanges photo, qui écrivent bien dans `chat_messages`
  — entre dans le contexte du tour, borné (N derniers messages, fenêtre de
  fraîcheur), au bon rang dans l'ordre de survie du prompt.
- **Ne jamais redemander ce qu'on sait** : ce que la personne a dit dans le
  fil, ce que le produit sait déjà (foyer, faits du jour, dernier tap, mesures)
  se lit — il ne se redemande pas. Ce qui est cité d'ancien est **daté**.
- La langue : résolue par le propriétaire du tour, bloc en dernière
  instruction.
- Le budget : 8 000 tokens, troncature par la queue — l'ordre d'assemblage est
  l'ordre de survie ; la doctrine survit toujours.

### Hors périmètre — engageant

- ❌ **Aucun coaching de vie.** Pas de question d'état, pas de check émotionnel.
  Écouter n'est pas collecter : ce qui est raconté spontanément est du contexte
  de conversation, pas une saisie (sauf planchers : repas, poids, préférence).
- ❌ **Il n'ouvre aucun effet durable.** Tout ce qui écrit un fait passe par un
  plancher déterministe, avant lui.
- ❌ **Il ne contourne pas le verrou de doctrine** — même contrôle que les
  autres chemins, sur le texte sortant.
- ❌ **Il ne résout pas la langue lui-même.** Mesuré : une doctrine `fr-FR`
  sortait en anglais.
- ❌ **Il ne réclame rien** — le rythme de question (`ask_now`) meurt avec les
  comportements retirés.
- ❌ **Pas de continuité infinie.** L'historique entre borné et frais (fenêtre
  12 h + plancher dernier tour, le patron existe dans
  `_shared/message_freshness.ts`). La mémoire au-delà, c'est FF-026 et la
  mémoire longue.

## 4. Le circuit

```
   aucune compétence ne réclame le tour
                │
                ▼
   ┌──────────────────────────────────────────────┐
   │ ASSEMBLAGE — l'ordre est l'ordre de survie   │
   │  doctrine du coach            (survit)       │
   │  plan / engagements                          │
   │  mémoire longue                              │
   │  HISTORIQUE RÉCENT  ← 🔴 AUJOURD'HUI VIDE    │
   │    (chat-inbound passe history: [])          │
   │  matière du jour (faits, tap, foyer)         │
   └──────────────────────────────────────────────┘
                │  budget 8 000 tokens, tronqué par la queue
                ▼
   bloc RESPONSE_LANGUAGE — en DERNIER
                ▼
              modèle
                ▼
   VERROU DE DOCTRINE + ceintures de texte visible
                ▼
            la réponse sort
```

**Le point qui gouverne le dessin** : la continuité se répare **au chargement**
(donner l'historique), jamais par une consigne (« souviens-toi »). Un modèle
sans la donnée confabule ou avoue ; aucune consigne ne change ça.

## 5. Modèle de données

**Néant en écriture.** Lectures : `chat_messages` (l'historique récent, scope
`app`, rôles user/assistant — les lignes photo y sont déjà, conformes),
plus la matière que les autres fiches chargent (foyer, faits, mesures).

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | L'historique récent entre dans le tour — photo comprise | sans lui, « et du coup ? » n'a pas de référent ; c'est le défaut observé en usage réel |
| **R2** | Ne jamais redemander ce qu'on sait ; l'ancien cité est **daté** | redemander est le signal le plus clair que personne ne lit |
| **R3** | En cas de trou de contexte, **avouer**, jamais confabuler | une Sophia qui fait semblant de se souvenir invente — et la personne s'en aperçoit toujours |
| **R4** | Ce que le coach n'a pas dit est annoncé comme tel | attribuer une position détruit ce qu'on vend |
| **R5** | La réponse passe le verrou de doctrine | la double serrure vaut pour le chemin le plus fréquent d'abord |
| **R6** | Aucun effet durable ouvert ici | ce qui ouvre un effet ne transite pas par un LLM |
| **R7** | L'ordre d'assemblage est l'ordre de survie ; la doctrine survit | mesuré : l'ancien plafond tronquait 2/3 du contexte par la queue |
| **R8** | La langue vient du propriétaire du tour, en dernière instruction | mesuré : doctrine fr-FR sortie en anglais |
| **R9** | Ce qui est raconté n'est pas saisi | écouter ≠ collecter ; seuls les planchers écrivent |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Le modèle tombe | les planchers ont écrit ; on perd la formulation, jamais la donnée |
| Le chargement d'historique échoue | le tour continue sans, et la réponse n'affirme rien sur le fil (R3) ; l'échec est journalisé |
| Référence à un message hors fenêtre | l'agent le dit — il ne devine pas |
| La personne contredit ce qu'elle a dit avant | on croit ce qui est dit **maintenant**, sans faire remarquer la contradiction |
| Le contexte dépasse le budget | troncature par la queue, doctrine en tête ; le dépassement se mesure, pas se subit |
| Sujet non tranché par le coach | l'agent le dit et répond en son nom |

## 8. Critères d'acceptation

```gherkin
Étant donné une personne qui a raconté quelque chose deux tours plus tôt
Quand elle écrit « et du coup, t'en penses quoi ? »
Alors la réponse porte sur ce qu'elle a raconté

Étant donné un échange où une photo a été envoyée entre deux messages
Quand la personne fait référence à la conversation d'avant la photo
Alors le fil n'est pas perdu

Étant donné une information déjà donnée dans le fil ou connue du produit
Quand la conversation continue
Alors elle n'est JAMAIS redemandée

Étant donné un vrai trou (message trop ancien, historique illisible)
Quand la personne y fait référence
Alors l'agent dit qu'il ne l'a plus — il n'invente rien

Étant donné une doctrine qui interdit un terme
Quand la conversation l'amène
Alors le verrou le corrige avant la sortie

Étant donné un contexte plus long que le budget
Quand le prompt est assemblé
Alors le bloc doctrine survit à la troncature
```

## 9. Rabbit holes

- **Réparer par le prompt.** « Tu te souviens de la conversation » sans donner
  l'historique ne répare rien — ça transforme l'aveu en confabulation, c'est
  pire.
- **L'historique sans borne.** Vingt messages de 4 000 caractères mangent le
  budget et poussent la doctrine dehors. Borné, frais, tronqué par message —
  et mesuré avant/après.
- **Le tour photo.** Il n'exécute pas le cerveau (c'est un autre chemin) ; ses
  lignes `chat_messages` existent et suffisent — la continuité se répare en
  LISANT, pas en faisant passer la photo par le cerveau.
- **`temp_memory` à deux écrivains.** Le chemin photo et le tour texte écrivent
  tous deux `user_chat_states.temp_memory` en lecture-modification-écriture
  complète ; le dernier gagne. Toute réparation de continuité doit regarder
  cette course en face.

## 10. Ce qu'on mesure

- Références anaphoriques résolues (échantillon jugé) — avant/après la
  continuité
- Informations redemandées : **zéro**
- Confabulations sur trou de contexte : **zéro** — c'est le RED le plus grave
- Taux de troncature du prompt (cible : zéro sur le bloc doctrine)

**Contre-mesure.** L'utilité perçue. Un compagnon très prudent et très vide est
une régression qu'aucune de ces métriques n'attrape.

## 11. Questions ouvertes

- La profondeur exacte de l'historique (N messages, fenêtre) : le patron de
  fraîcheur existe (12 h + plancher dernier tour) ; le N se calibre contre le
  budget, pas dans l'abstrait.
- Le rétablissement passe-t-il par réactiver le chargement dans
  `chat-inbound-v1`, ou par un chargeur dans le cerveau ? Décision
  d'implémentation à trancher au chantier — la fiche exige le résultat, pas le
  chemin.
