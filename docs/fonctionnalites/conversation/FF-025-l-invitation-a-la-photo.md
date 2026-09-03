# FF-025 · L'invitation à la photo

| | |
|---|---|
| **Identifiant** | `FF-025-l-invitation-a-la-photo` |
| **Statut** | 🟡 Spécifiée |
| **Date** | 2026-08-08 |
| **Autorité produit** | la direction du domaine ([README](README.md)) T4, T5 |
| **Dépend de** | [FF-009](FF-009-le-repas-hors-plan.md) (le fait hors plan) · [FF-018](FF-018-la-photo-de-repas.md) (la chaîne photo) · le budget « une demande par jour » |
| **Effort estimé** | 1 jour |

---

## 1. Le problème

Quelqu'un écrit « j'ai pas eu le temps, j'ai commandé ». Le fait est capté
(FF-009) — mais pauvrement : hors plan, sans aliment, sans rien. Une photo
aurait tout donné en trois secondes, et la personne a son téléphone **dans la
main** au moment où elle écrit.

Rien ne l'invite à le faire. Et la règle « le chat ne sollicite jamais »
pourrait faire croire que c'est interdit — ce serait mal la lire : la règle
interdit de **réclamer à froid**, pas d'**approfondir un don**. L'invitation
est adossée à un fait que la personne vient de donner, au moment exact où elle
l'a donné.

**Ce que ça coûte.** Chaque repas hors plan reste une ligne vide, le suivi est
plus pauvre qu'il ne pourrait l'être sans aucun coût pour la personne — et
l'habitude de photographier ne s'installe jamais, parce que personne n'a
jamais montré la porte.

## 2. Job stories

> **Quand** je dis que j'ai commandé, **je veux** pouvoir montrer plutôt que
> décrire, **pour que** ça compte mieux sans taper trois phrases.

> **Quand** je n'envoie pas la photo, **je ne veux pas** qu'on m'en reparle,
> **pour que** dire la vérité ne devienne pas un engagement.

> **Quand** je découvre que la photo suffit, **je veux** l'apprendre une fois,
> gentiment, **pour que** j'y pense la prochaine fois tout seul.

## 3. Périmètre

### Dans le périmètre

- Sur un repas **hors plan ou loupé qui vient d'être déclaré** sans photo :
  **une** invitation à en envoyer une, dans la même réponse.
- Si la personne n'envoie pas de photo : au plus **une** ligne d'éducation
  (« même imprécise, une photo aide le suivi la prochaine fois ») — une fois,
  puis silence.
- Si la photo arrive : la chaîne FF-018 telle quelle (identification, jamais de
  calories), rattachée au fait déjà écrit — pas un second fait.
- L'invitation consomme le **budget partagé** « une demande par jour », avec la
  question d'approfondissement de FF-017 — et **elle seule** depuis le
  2026-09-01 : FF-028 est abandonnée, et
  [FF-062](FF-062-quand-sophia-parle-la-premiere.md) a exempté de ce budget les
  canaux adossés à un fait du plan.

### Hors périmètre — engageant

- ❌ **Jamais de relance.** Ni le lendemain, ni au repas suivant, ni « tu
  m'avais pas envoyé la photo ». Une invitation est une porte ouverte, pas un
  rendez-vous.
- ❌ **Jamais sur un repas conforme au plan.** La coche suffit ; inviter à
  photographier ce qui est déjà su serait de la collecte.
- ❌ **Jamais sur une intention** (« je vais commander ce soir ») — même
  désarme que les planchers.
- ❌ **Jamais sous plancher de sécurité.** Demander une image de l'assiette à
  quelqu'un qui va mal est exactement ce que le plancher interdit.
- ❌ **Aucune culpabilisation.** Le registre est l'utilité (« ça aide le
  suivi »), jamais le contrôle (« pour qu'on vérifie »).

## 4. Le circuit

```
   « j'ai pas eu le temps, j'ai commandé »
                │
                ▼
   plancher FF-009 → le fait hors plan est ÉCRIT
                │
                ▼
   ┌────────────────────────────────────────────┐
   │ GATE — déterministe                        │
   │  safety_band ≠ none        → rien          │
   │  budget du jour consommé   → rien          │
   │  une photo accompagne déjà → rien          │
   │  intention (pas un fait)   → rien          │
   └────────────────────────────────────────────┘
                │ ok
                ▼
   la réponse porte l'invitation — UNE phrase
                │
      ┌─────────┴──────────┐
      ▼                    ▼
  photo envoyée        pas de photo
      │                    │
      ▼                    ▼
  chaîne FF-018,       une ligne d'éducation
  rattachée au fait    MAX, puis plus jamais
  existant             sur ce repas
```

## 5. Modèle de données

Presque néant. Le fait existe déjà (FF-009). Deux traces :

| Donnée | Origine |
|---|---|
| le budget du jour | **compteur partagé** des demandes (voir T4 du [README](README.md)) — incrémenté par l'invitation |
| photo → fait | la photo **enrichit** la ligne existante (`media_path`, `recognized`), elle n'en crée pas une seconde — sinon le repas compte double |

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | Adossée à un fait **que la personne vient de donner** | c'est la frontière exacte entre approfondir et solliciter — la même que la question de précision |
| **R2** | Une invitation, zéro relance | dire la vérité ne doit jamais créer une dette |
| **R3** | Consomme le budget « une demande par jour », partagé | trois compteurs séparés = trois demandes par jour = un interrogatoire |
| **R4** | La photo enrichit le fait, ne le double pas | deux lignes pour un repas fausse tous les comptes en aval |
| **R5** | Muette sous `safety_band` | plancher, hors débat |
| **R6** | Le registre est l'utilité, jamais le contrôle | « pour vérifier » transforme l'app de conseil en app de surveillance en une phrase |
| **R7** | Mord en FR **et** en EN | la cicatrice `guard-tested-in-one-language-only` |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| La personne répond « non » ou ignore | rien. Pas de reformulation, pas de trace visible |
| La photo montre autre chose qu'un repas | le filtre de sujet de FF-018 fait son travail ; le fait hors plan reste tel quel |
| Deux repas hors plan déclarés le même jour | une seule invitation — le budget est consommé |
| La photo arrive le lendemain | question ouverte du rattachement (héritée de FF-018) ; en attendant, elle ne se rattache pas toute seule |
| La ligne d'éducation a déjà été dite | plus jamais — elle est dite **une fois par personne**, pas une fois par repas |

## 8. Critères d'acceptation

```gherkin
Étant donné un élève qui déclare « j'ai commandé une pizza » sans photo
Quand la réponse sort
Alors elle contient UNE invitation à envoyer une photo

Étant donné un élève qui ignore l'invitation
Quand il écrit à nouveau, le même jour ou le lendemain
Alors la photo n'est plus jamais mentionnée pour ce repas

Étant donné un élève qui envoie la photo après l'invitation
Quand l'analyse se termine
Alors elle enrichit le fait hors plan existant
Et aucun second repas n'est créé

Étant donné une question de précision déjà posée aujourd'hui
Quand un repas hors plan est déclaré
Alors aucune invitation ne part — le budget du jour est consommé

Étant donné un élève sous plancher de sécurité
Quand il déclare un repas loupé
Alors aucune invitation ne part

Étant donné « I ordered takeout » en anglais
Quand la réponse sort
Alors l'invitation part aussi — les deux langues
```

## 9. Rabbit holes

- **La relance déguisée.** « Au fait, pour la pizza d'hier… » est une relance
  même si elle est gentille. Le test de propriété de zéro-relance est la fiche.
- **L'éducation qui devient un sermon.** Une ligne, une fois par personne. La
  seconde occurrence est du nagging.
- **Le rattachement différé.** Une photo qui arrive deux heures après —
  question ouverte de FF-018, à ne pas résoudre ici en douce.

## 10. Ce qu'on mesure

- Invitations montrées → photos reçues (le taux de conversion est LA mesure)
- Part des repas hors plan **avec** photo (doit monter)
- Relances détectées : **zéro**, tenu par un test

**Contre-mesure.** Le volume de déclarations hors plan. S'il **baisse** après
l'invitation, les gens ont appris que déclarer déclenche une demande — et ils
se taisent. C'est le pire résultat possible, et il faut le voir vite.

## 11. Questions ouvertes

- La ligne d'éducation « une fois par personne » : où se stocke le « déjà
  dit » ? (candidat : `user_chat_states.temp_memory`, avec la course à deux
  écrivains documentée dans FF-023 §9 à garder en tête).
- L'invitation vaut-elle aussi pour un repas **déclaré vague** mais dans le
  plan ? Aujourd'hui non — la question d'approfondissement (FF-017) couvre ce
  cas en texte.
