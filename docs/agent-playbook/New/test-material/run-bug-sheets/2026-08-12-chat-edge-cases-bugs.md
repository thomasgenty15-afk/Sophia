# Feuille de bugs — campagne cas limites du chat (2026-08-12)

Surfaces visées : le **routeur de taps déterministes** (cinq familles), le
**budget d'ask partagé**, et l'**ancre de question armée** — c'est-à-dire ce par
quoi passe *tout* message entrant. Cas limites construits à partir de
comportements **observés** pendant les runs de la journée, pas imaginés en l'air.

---

## E1 — Une déclaration de repas est AVALÉE et PERDUE par une question armée dont le flow est fermé

- **Bug id** : `E1-B01`
- **Famille** : `BF-ROUTE-02` — un ancien flow capture une nouvelle intention
  (et, par conséquence, `BF-LEDGER-01` : la personne lit un accusé qui ne
  correspond à rien de ce qu'elle a dit)
- **Domaine owner** : `_shared/chat/armed_question.ts` + le chemin de rabattement
  dans `chat-inbound-v1`
- **Gravité** : **haute** — perte de donnée sur une déclaration alimentaire
  réelle, et réponse incompréhensible.

**Le fil mesuré, en entier :**

> — *Si tu manges ce qui est prévu, normalement ça devrait descendre. Qu'est-ce qui se passe ?*
> — **C'est autre chose**
> — *D'accord. Qu'est-ce qui a changé ?*
> — **Le sommeil, le stress**  ⟵ l'épisode se FERME ici
> — *C'est bon à savoir, et c'est noté. Je ne vais pas faire semblant d'avoir un levier là-dessus.*
> — **en vrai hier soir j'ai mangé un kebab, rien à voir avec ce qui était prévu**
> — *Celui-là n'est plus d'actualité — **rien n'a été enregistré**.*

**Preuve système** : `handled_by = keel_weight_divergence_stale` ·
`protocol_events` = **0 ligne**. Le kebab n'existe nulle part.

**Mécanisme** : `resolveArmedQuestion` retient la question armée la plus récente
(fenêtre **24 h**, plafond **3 tours**), `classifyArmedQuestionReply` rabat le
texte libre sur un de ses boutons, et le chemin déterministe **consomme le tour**.
`isStillArmed` est une règle purement conversationnelle — question plus récente,
temps, nombre de tours — et **elle ignore totalement si le flow sous-jacent est
encore ouvert**. Un épisode que la personne vient elle-même de clore laisse donc
sa question armée pendant 24 h.

**Correction attendue — amont, et la distinction est nette.** La charge sait d'où
elle vient : `armed_resolution` est non-nul quand le payload provient d'un
**rabattement de texte**, nul quand il provient d'un **vrai tap**.
- « Celui-là n'est plus d'actualité » est la bonne réponse à un **tap** sur une
  vieille bulle : la personne a touché ce bouton-là.
- Sur un **texte rabattu**, c'est faux : la personne n'a pas parlé de l'épisode.
  Le tour ne doit **pas** être consommé — il doit retomber (`PASS`) vers la lane
  normale, qui traitera le kebab pour ce qu'il est.

Une garde de fraîcheur côté flow serait le second correctif possible, mais elle
demanderait à `armed_question.ts` (générique) de connaître chaque flow — plus
gros, moins réversible.

- **Statut** : `open`
- **Tests requis** : rejouer la séquence ci-dessus (3 fois, FR et EN) et vérifier
  que le fait est écrit ; cas qui passe obligatoire — un **vrai tap** sur une
  bulle périmée doit **continuer** de répondre « plus d'actualité ».

---

## E2 — `parseMealTickKey` transforme un index VIDE en « plat n°0 »

- **Bug id** : `E1-B02`
- **Famille** : `BF-EFFECT-03` — payload durable faux (bonne opération, mauvaise
  cible)
- **Domaine owner** : `_shared/keel/meal_tick.ts`
- **Gravité** : **moyenne-haute** — écrit un fait durable sur un plat que la
  personne n'a jamais désigné.

**Preuve, par sondage pur du parseur :**

```
"meal_tick:abc:"   ->  {"mealId":"abc","dishIndex":0}     ⟵ index VIDE
"meal_tick:abc: "  ->  {"mealId":"abc","dishIndex":0}     ⟵ une ESPACE
"meal_tick:abc:x"  ->  null                                ⟵ correct
```

`Number("")` vaut **0**, `Number.isInteger(0)` vaut **true**, `0 < 0` est faux :
la garde `if (!mealId || !Number.isInteger(dishIndex) || dishIndex < 0)` laisse
tout passer. Et l'en-tête du module affirme l'inverse — *« rend `null` sur une
clé mal formée — **ne devine jamais** »*.

**Preuve en conditions réelles** : charge `KEEL_FIX_ORDERED|meal_tick:<plan>:`
envoyée par le vrai chemin produit ⇒ une ligne écrite en base,
`source_message_id = accident_off_plan:<plan>:0`, `plan_relation = off_plan`,
plus une invitation photo. Le plat n°0 a été déclaré non mangé sans que personne
ne l'ait désigné.

**⚠️ La partie la plus instructive : le trou est CONNU et bouché AU MAUVAIS
ENDROIT.** `evening_strip.ts:222` porte une garde locale avec ce commentaire
exact — *« ⚠️ `Number("")` vaut 0, ET `Number.isInteger(0)` vaut `true`. Sans
ce… »*. FF-058 a donc trouvé le défaut et l'a corrigé **chez lui**, dans son
propre lecteur, au lieu de le corriger dans le parseur partagé. `readAccidentReply`
(FF-057) appelle le même `parseMealTickKey` sans garde locale et **hérite du
trou**. C'est la faute que ce dépôt documente partout : une règle réparée à un
endroit au lieu de sa source, et la famille suivante la repaie.

**Correction attendue** : rejeter dans **`parseMealTickKey`** un segment d'index
vide ou blanc (`if (!/^\d+$/.test(rest.slice(at + 1))) return null;`), puis
retirer la garde locale devenue redondante de `evening_strip.ts` — ou la garder
avec un commentaire disant qu'elle double la source. **Ne pas** ajouter une
troisième garde locale dans `accident.ts` : ce serait reproduire la faute une
fois de plus.

- **Statut** : `open`
- **Tests requis** : le sondage pur ci-dessus figé en test (`""`, `" "`, `"x"`,
  `"0"`, `"1"`, `"-1"`, `"1.5"`) ; **mutation** — retirer la garde et vérifier
  que le test tombe ; intégration sur les deux familles (bande et accident).

---

## Ce qui a été vérifié VERT

| Cas | Résultat |
|---|---|
| **Charge forgée inter-élève** (B tape le plat de A, famille `accident`) | refusée — **0 fait chez A**, refus honnête chez B. La garde de propriété tient hors divergence |
| **Index non numérique** (`meal_tick:abc:x`) | `null`, aucun effet |
| **Les cinq préfixes déterministes** (`KEEL_FIX_`, `KEEL_RECO_`, `KEEL_PULSE_`, `KEEL_STRIP_`, `KEEL_WDIV_`) | disjoints, aucune ambiguïté de lecture |
| **Index vide sur la BANDE** (`KEEL_STRIP_TICK\|meal_tick:<id>:`) | refusé — la garde locale de `evening_strip.ts:222` mord |
| **Question armée hors fenêtre** (4 h + 1 tour intercalé) | correctement désarmée : la déclaration a suivi la lane normale, le fait a été écrit, et l'invitation photo est partie (le lot du jour, vu à l'œuvre) |
| **Déclaration sans rapport pendant une question armée vivante** | le classifieur a **refusé** de rabattre « au fait ce midi j'ai mangé une pizza » sur la divergence — le fait a été écrit normalement |

Le dernier point mérite d'être souligné : le classifieur de rabattement **sait
refuser**. Le défaut E1 n'est donc pas « il rabat n'importe quoi » — c'est
« quand il rabat à raison, mais que la cible est morte, le message est jeté ».
