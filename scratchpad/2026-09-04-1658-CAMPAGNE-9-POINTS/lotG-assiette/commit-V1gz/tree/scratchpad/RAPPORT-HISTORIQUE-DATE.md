# RAPPORT — L'historique daté, et les deux rouges de FF-023

**Date** : 2026-08-12 · **Branche** : `ff-001-quotidien-du-coach` (jamais quittée, rien poussé)
**Commits** : `f65511b3` (le code + les tests) · `f5b3d295` (les deux scripts de run réel)

---

## 1. État initial constaté — avec preuves

### 1.1 Les deux rouges : PERSONNE n'avait bougé

La première question du lot était « qui a bougé, le module ou le test ? ». **Réponse :
ni l'un ni l'autre.** Les deux fichiers n'ont qu'un seul commit dans toute leur
histoire, et c'est le même :

```
$ git log --oneline -- supabase/functions/_shared/chat/recent_history.ts
1414face la conversation se souvient de ses propres tours — le `history: []` de chat-inbound s'en va

$ git log --oneline -- supabase/functions/_shared/chat/recent_history_test.ts
1414face la conversation se souvient de ses propres tours — le `history: []` de chat-inbound s'en va
```

Un `git log -p` n'a donc rien d'autre à montrer que le commit d'origine : il n'existe
aucun diff postérieur, d'aucun côté. **Le rouge n'a pas été introduit ; il a poussé
tout seul.**

La cause, mesurée et non déduite. `boundRecentHistory` retombait sur `Date.now()` quand
l'ancre `nowIso` était absente ou illisible :

```ts
const nowMs = Date.parse(String(opts?.nowIso ?? ""));
const fresh = filterFreshMessages(bounded, {
  nowMs: Number.isFinite(nowMs) ? nowMs : undefined,   // ⇒ filterFreshMessages fait Date.now()
});
```

Les deux tests fabriquent leurs messages sur une base **figée au
`2026-08-08T12:00:00.000Z`** (`iso()`, l. 22) et ne passent pas d'ancre. Le
2026-08-08, `Date.now()` valait cette base : tout était frais, 20 messages passaient.
Le 2026-08-12, les mêmes messages ont **quatre jours** : la fenêtre de fraîcheur de 12 h
les coupe tous sauf le plancher de continuité — d'où `1` au lieu de `20`, et `1` au lieu
de `2`.

Preuve exécutée (script jetable, horloge murale figée) :

```
{"horloge":"réelle (2026-08-12T12:01:28Z)",                  "cas1_attendu_20":1,  "cas2_attendu_2":1}
{"horloge":"figée au 2026-08-08T12:00:00.000Z (jour du commit)", "cas1_attendu_20":20, "cas2_attendu_2":2}
```

**Qui a raison ?** Le test. Et le module se corrige — pas seulement parce que le test
est plus ancien, mais parce que son contrat est le bon :

- `filterFreshMessages` garde déjà, **exprès**, tout message dont le `created_at` est
  illisible (« fail-open : mieux vaut un contexte un peu vieux qu'un contexte amputé »,
  `message_freshness.ts:35`). Faire l'inverse un cran plus haut, sur l'**ancre**, était
  incohérent avec sa propre philosophie.
- Une fonction **pure** qui va chercher l'horloge murale n'est pas testable. Le prix a
  été payé deux fois : deux lots successifs ont classé ces rouges « préexistants » et
  sont passés outre.

**Production inchangée** : `chat-inbound-v1/index.ts:185` construit
`nowIso: new Date().toISOString()`, transporté en `message.received_at` jusqu'à
`loadRecentChatHistory` (l. 395). L'ancre est **toujours** lisible en production ; la
branche fail-open n'existe que pour les appelants qui n'ancrent pas.

### 1.2 La donnée était là, elle mourait au dernier pouce

Diagnostic du prompt **confirmé**. `created_at` est déclaré (`recent_history.ts:79`),
rempli (l. 158), sélectionné (l. 215) et transporté jusqu'à `processMessage`.
`formatCompanionRecentHistory` (`companion.ts`) le jetait : chaque ligne sortait
`- User: <texte>`.

### 1.3 Les DEUX rendus — et lequel atteint le tour

**Les deux l'atteignent.** `router/run.ts:6402` appelle `loadContextForMode` avec
`mode: "companion"`, `history` et `userTime` ; `profile.history_depth` vaut 15 pour le
companion et `scopedMemoryEligible` est câblé à `false` (`loader.ts:556`), donc le bloc
`recentTurns` est toujours construit dès qu'il y a de l'historique. Le composeur, lui,
ajoute sa fenêtre visible de 6.

⚠️ **La preuve demandée par `turn_summary_logs.context_elements` est structurellement
impossible, et c'est un fait à consigner.** Cette colonne est **toujours `NULL`** : le
seul écrivain réel de la table est `router/effect_ledger_persistence.ts:85`, qui passe
explicitement `p_context_elements: null`. `persistTurnSummaryLog`
(`router/turn_summary_writer.ts:70`), la fonction qui la remplirait, **n'a aucun
appelant en production**. Vérifié en base :

```sql
select count(*) from turn_summary_logs where context_elements is not null;  -- 0
```

et sur mes cinq élèves de run réel : `turn_summary_logs: 0 lignes`. Un lot qui bâtirait
son verdict sur cette colonne conclurait « contexte vide » sur des tours pleins.

**La preuve a donc été faite autrement** — et elle est plus forte : par le comportement
du modèle relu en base (§4) et par les compteurs `chat_inbound_history_loaded`
(`rows_read` / `excluded_current` / `stale_dropped` / `kept`) émis à chaque tour réel.
Note utile pour les prochains lots : **`console.log` EST visible dans
`docker logs supabase_edge_runtime_Sophia_2`** sur cette pile (la règle du socle vise
`console.info`).

### 1.4 Le fait structurel que personne n'avait nommé

Les deux blocs ne vivent pas au même endroit du prompt :

| bloc | où | taille | tronquable ? |
|---|---|---|---|
| `=== HISTORIQUE RECENT VISIBLE ===` (companion) | prompt **semi-stable** | 6 msgs | **NON** |
| `=== HISTORIQUE RÉCENT (N) ===` (loader) | dans le **contexte** | 15 msgs | **OUI** (queue) |

`applyCompanionPromptBudgetWithPinnedContext` tronque par la queue, et la queue c'est le
contexte. **Donc sous pression de budget, le bloc qui mourait était le bloc DATÉ, et
celui qui survivait était le bloc SANS DATE.** La plainte de l'humain n'était pas une
impression : c'était la conséquence mécanique de l'ordre d'assemblage.

---

## 2. Ce qui a été fait

### 2.1 `_shared/chat/recent_history.ts`

- **`boundRecentHistory` est vraiment fail-open** : sans ancre lisible, aucun filtrage
  de fraîcheur. Plus de `Date.now()` dans une fonction pure.
- **Bug latent corrigé** : `messages.slice(-limit)` avec `limit === 0` rendait le
  **tableau entier** (`-0 === 0` en JS). Une borne nulle rend maintenant zéro message.
- **`formatRecentHistoryTimeMark`** — la marque de temps, calculée en déterministe.
- **`formatRecentHistoryLine`** — **l'écrivain unique** d'une ligne d'historique de
  prompt, partagé par les deux blocs.

### 2.2 `sophia-brain/agents/companion.ts`

- `formatCompanionRecentHistory` passe par l'écrivain unique et **date** chaque ligne.
- `readTemporalAnchors(context)` relit `now_utc=` et `user_timezone=` dans le bloc
  `=== REPÈRES TEMPORELS ===` déjà présent dans le contexte reçu — zéro paramètre
  optionnel de plus à traverser cinq appelants (cicatrice
  `optional-gate-params-are-disarmed-gates`). Un seul producteur de `now_utc=` existe
  dans tout le dépôt (`_shared/user_time_context.ts:219`) : aucun risque de collision.
- Une ligne d'instruction ajoutée au bloc, dans les deux langues : « un message d'il y a
  trois jours ne se traite pas comme un message d'il y a une heure ».
- `.slice(-6)` devient `.slice(-COMPANION_VISIBLE_HISTORY_LIMIT)`, avec le raisonnement
  écrit en tête de fonction (§6).

### 2.3 `sophia-brain/context/loader.ts`

- `formatRecentTurnsLines(history, depth, userTime)` — **exportée** pour être testable :
  câblée en ligne, la seule façon de vérifier qu'elle reçoit l'horloge et le fuseau
  aurait été de monter un faux client Supabase complet, c'est-à-dire de ne pas la tester.
- Le bloc `recentTurns` **ne sort plus d'ISO brut**. Même écrivain, même marque.
- Le type `ContextLoaderOptions.userTime` est élargi à `now_utc` / `user_timezone` /
  `user_locale`. Ces champs étaient **déjà passés** par `run.ts` ; seul le type les
  ignorait. Élargissement de type, **pas de `as`** (cicatrice
  `as-cast-on-foreign-type-disarms-typecheck`).

---

## 3. Le format de marque retenu, et pourquoi

```
fr :  - [il y a 20 min · hier 23:50] User: …
en :  - [20 min ago · yesterday 23:50] Student: …
```

**Décision** — la marque porte **deux moitiés** : un délai écoulé calculé, et une ancre
calendaire locale (`aujourd'hui` / `hier` / `JJ/MM` + `HH:MM`).

**Pourquoi** — chacune répond à une question que l'autre ne sait pas traiter.

- Le **délai** répond littéralement à la demande (« 1 h ou 3 jours ? »). Un ISO brut ne
  répond pas : il oblige le modèle à soustraire des dates. **Ce n'est pas une opinion,
  c'est mesuré** : le bloc du loader datait DÉJÀ en ISO, et sur la question directe
  « ça fait combien de temps ? » le modèle a répondu *« il y a quelques tours »* (§4).
  Cicatrice `named-day-calendar-vs-model-prior` : on **nomme** la conclusion.
- L'**ancre locale** situe le message dans la journée de la personne, et c'est le seul
  endroit où `profiles.timezone` mord vraiment : à 00h10 à Paris, un message de 23h50
  est « il y a 20 min » **et** « hier ». Le délai seul ferait croire à un fil continu ;
  l'ancre seule ferait croire à du vieux. Pour une app de repas, « hier soir » et « ce
  matin » ne sont pas la même information.

Paliers du délai : `à l'instant` (<1 min) · `il y a N min` · `il y a N h` · `il y a N j`
(<7 j) · `il y a N sem`. Un délai négatif (dérive d'horloge) est ramené à `à l'instant`.

**Options rejetées**
- *ISO brut conservé* — mesuré incapable de répondre à la question (§4, run « avant »).
- *Délai seul* — le fuseau ne servirait plus à rien, et « hier soir »/« ce matin »
  deviendrait indevinable pour une app de repas.
- *Nom du jour (« samedi »)* — table de noms × 2 langues pour un gain nul face à
  `JJ/MM` ; plus de code, plus de surface, aucune information de plus.
- *Ancre seule* — ne répond pas à la question posée.

**Réversibilité** — le format vit dans **une seule fonction**
(`formatRecentHistoryTimeMark`). Le changer, c'est éditer ce corps de fonction et les
chaînes attendues dans `recent_history_dating_test.ts`. Le revenir en arrière
entièrement, c'est un `git revert f65511b3`.

**Sans date lisible, pas de marque inventée** : `created_at` illisible **ou** horloge de
référence illisible ⇒ `null`, et la ligne sort **nue**. Elle ne disparaît jamais. C'est
le même fail-open que celui du rouge n°2 — les deux sujets ont été traités ensemble.

---

## 4. Tableau des tests

Commande unitaire (environnement purgé) :
```
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env --no-check supabase/functions/_shared/chat/
```

| niveau | scénario | verdict | PREUVE |
|---|---|---|---|
| easy | fr : deux dates ⇒ deux marques distinctes | 🟢 | `il y a 1 h · aujourd'hui 09:30` vs `il y a 3 j · 09/08 10:30` |
| easy | en : idem | 🟢 | `1 h ago · today 09:30` vs `3 d ago · 09/08 10:30` |
| medium | 1 h / 3 j / 3 sem se distinguent (fr **et** en) | 🟢 | 2 tests, `il y a 3 sem` / `3 w ago` |
| medium | paliers courts (`à l'instant`, min, h, bascule 24 h) | 🟢 | `il y a 23 h` puis `il y a 1 j` |
| medium | `Europe/Paris` : 22h10Z vs 21h50Z ⇒ **hier** | 🟢 | `il y a 20 min · hier 23:50` ; en UTC : `· aujourd'hui 21:50` |
| medium | décalage **négatif** (`America/Los_Angeles`) | 🟢 | `il y a 20 min · hier 23:50` / `20 min ago · yesterday 23:50` |
| medium | l'heure est LOCALE (Paris 10:05 vs Tokyo 17:05) | 🟢 | même instant, même délai, ancres différentes |
| medium | fuseau invalide ⇒ pas de crash, le délai tient | 🟢 | `Mars/Olympus_Mons` ⇒ `il y a 2 h` |
| medium | `created_at = null` ⇒ **aucune marque inventée** | 🟢 | `mark(null) === null` |
| medium | horloge de référence absente ⇒ pas de marque non plus | 🟢 | `mark(x, {nowIso:""}) === null` |
| medium | ligne sans date : **elle sort quand même** | 🟢 | `- User: mon frère déménage` |
| medium | message dans le futur ⇒ pas de délai négatif | 🟢 | `à l'instant`, aucun `-` |
| hard | **rouge n°1** : la borne garde les 20 DERNIERS | 🟢 | `m20…m39`, littéral `20` |
| hard | **rouge n°2** : horloge illisible ⇒ fail-open | 🟢 | `messages.length === 2`, `staleDropped === 0` |
| hard | fail-open même sur des messages de 3 jours | 🟢 | les 2 survivent avec `nowIso: ""` |
| hard | sans ancre, résultat **indépendant** de l'horloge serveur | 🟢 | `Date.now` figé à 2026-08-08 **et** 2031 ⇒ 20 et 20 |
| hard | borne 0 ⇒ zéro message (`slice(-0)`) | 🟢 | `length === 0` |
| hard | bloc VISIBLE daté (fr) | 🟢 | `[il y a 3 j · 09/08 12:30] User: mon frère déménage` |
| hard | bloc VISIBLE daté (en) | 🟢 | `[3 d ago · 09/08 12:30] Student: …` |
| hard | sans REPÈRES TEMPORELS ⇒ bloc nu, jamais faux | 🟢 | aucun `[` dans le bloc |
| hard | fenêtre visible = les **6 derniers** | 🟢 | TOUR14..19 présents, TOUR13 absent |
| hard | bloc LOADER : plus d'ISO brut | 🟢 | aucun `Z]`, aucun `T10:` |
| hard | bloc LOADER daté en anglais | 🟢 | `[1 h ago · today 11:30] user: …` |
| hard | **les deux blocs disent la MÊME ancienneté** | 🟢 | mêmes marques dans les deux sorties |
| hard | loader sans `userTime` ⇒ nu, **3 lignes conservées** | 🟢 | `split("\n").length === 3` |
| hard | loader, `created_at` null ⇒ ligne nue, pas perdue | 🟢 | 2 lignes, une datée une nue |
| hard | profondeur 0 ⇒ rien | 🟢 | `""` |
| hard | budget : le datage coûte < 400 car. sur la fenêtre visible | 🟢 | assertion chiffrée |
| régression | doctrine survit à un contexte qui déborde | 🟢 | `recent_history_budget_test.ts` inchangé, vert |

**Totaux** : `_shared/chat/` → **110 passed / 0 failed / 17 ignored**.
Suite complète `sophia-brain/` → **1281 passed / 0 failed / 16 ignored**.
`deno check` vert sur `recent_history.ts`, ses 3 tests, `companion.ts`, `loader.ts`,
`chat-inbound-v1/index.ts`. Gate de commit (`agent-gate`) : passé deux fois,
`test count ok (5200 >= 5111)`.

### 4.1 Mutations — la preuve que ces tests peuvent échouer

Cicatrice `test-parameterized-by-its-own-constant` : un test qui s'écrit
`assertEquals(x, LA_CONSTANTE)` reste vert quand la constante change. Chaque mutation
a été appliquée, mesurée, puis annulée.

| mutation | tests tués |
|---|---|
| `RECENT_HISTORY_MESSAGE_LIMIT` 20 → 7 | **3** (dont `la borne vaut 20`) |
| retour du repli `Date.now()` dans `boundRecentHistory` | **4** |
| le fuseau ignoré (tout en UTC) | **9** |
| le composeur ne passe plus les ancres | **3** |
| le loader perd l'horloge | **4** |
| *contrôle, tout restauré* | **0** |

### 4.2 Run réel — la preuve produit, relue en base

Élève réel (`keel_role=student`, `timezone=Europe/Paris`, `locale=fr-FR`, `country=FR`,
`coach_clients` actif, **plan publié** + `student_week_plans` adopted). Tour 1, puis
backdate du tour 1 en base, puis tour 2 qui demande explicitement l'âge du tour 1.
Le même scénario a été joué **deux fois**, une fois sur le code d'avant le lot
(`git checkout HEAD~1 -- companion.ts loader.ts`), une fois sur le code d'après, avec
redémarrage du runtime edge entre les deux.

| | réponse de l'assistant, **relue dans `chat_messages`** |
|---|---|
| **AVANT** (bloc visible non daté ; bloc loader en ISO brut) | *« Tu me l'as dit **il y a quelques tours**, dans cette conversation, quand tu as parlé de son déménagement à Lisbonne ce week-end. »* |
| **APRÈS** (les deux blocs datés) | *« Tu m'en as parlé **il y a 3 heures, aujourd'hui à 11:17**. »* |

Le message avait été backdaté à `2026-08-12T09:17:52Z`, soit **11:17 heure de Paris** —
le fuseau de la personne, pas l'UTC. **C'est la démonstration la plus nette du lot :
l'ISO brut était déjà là avant, et il ne répondait pas.**

---

## 5. La mesure `full_chars` — avant / après

Source : ligne `companion_prompt_cache_ready` du runtime edge, tour par tour. Plafond
`COMPANION_PROMPT_MAX_CHARS = 8000 × 4 = 32 000`.

| tour | `semi_stable_chars` | `volatile_chars` | **`full_chars`** |
|---|---|---|---|
| **historique VIDE — avant** | 581 | 10 770 | **23 433** |
| **historique VIDE — après** | 581 | 10 770 | **23 433** (identique) |
| **historique PLEIN (2 msgs) — avant** | 1 096 | 14 961 | **28 139** |
| **historique PLEIN (2 msgs) — après** | 1 384 | 15 010 | **28 476** |

- **Surcoût mesuré : +337 caractères**, soit **+1,05 %** du budget. Marge restante après
  le lot : **3 524 caractères**. Aucune signature de troncature (`32 222`) nulle part
  sur les 10 tours joués ; maximum observé toutes scènes confondues : **28 828**.
- **Coût nul quand l'historique est vide** : 23 433 des deux côtés, au caractère près.
- Décomposition : `semi_stable` +288 (la ligne d'instruction ~185 + les marques),
  `volatile` +49 seulement — côté loader, la marque **remplace** l'ISO, donc le bloc
  tronquable est quasi neutre.
- Borne haute : le test `le datage coûte moins de 400 caractères sur la fenêtre visible`
  garde le surcoût du bloc non tronquable. Au pire (6 lignes visibles + 15 lignes loader
  déjà datées en ISO), le surcoût reste sous ~450 caractères, soit 1,4 % du budget.

---

## 6. Le `.slice(-6)` — question tranchée

> **Décision** — la fenêtre visible du composeur **reste à 6**. Rien n'est élargi.
>
> **Pourquoi** — ce n'est pas une perte silencieuse, et le docstring d'origine le disait
> déjà : les 20 sont un **plafond partagé**, pas une fenêtre
> (`recent_history.ts:56-61`). Chaque consommateur recoupe : loader 15
> (`normalReplyContext`), dispatcher 8, visible agents de skills 8, bloc visible 6. Sur
> les 20 chargés, **15 atteignent bien le modèle** par le bloc du loader ; les 5 plus
> anciens sont écartés par `history_depth`, une décision antérieure et documentée.
> Surtout : le bloc visible vit dans le prompt **semi-stable**, la partie que le budget
> ne tronque **jamais**. Chaque ligne ajoutée là est prise sur le budget des blocs qui,
> eux, peuvent mourir — dont l'historique à 15 du loader. Élargir à 20 dupliquerait 20
> lignes déjà présentes plus bas **pour pousser la queue vers la troncature** : on
> paierait deux fois pour perdre autre chose.
>
> **Options rejetées** — *élargir à 20* : duplication pure + pression sur la queue, pour
> zéro information nouvelle. *Supprimer le bloc du loader et tout mettre dans le
> visible* : ferait passer 15 lignes de la zone sacrifiable à la zone protégée, +3 000
> caractères environ dans la partie qu'on ne peut plus arbitrer. *Supprimer le bloc
> visible* : c'est le seul qui survit à un contexte qui déborde
> (`recent_history_budget_test.ts`) — le supprimer rendrait l'historique perdable.
>
> **Réversibilité** — une constante,
> `COMPANION_VISIBLE_HISTORY_LIMIT` (`companion.ts`). Un chiffre à changer, plus le test
> `la fenêtre visible reste à 6`.

### La question des DEUX rendus

> **Décision** — on garde les deux blocs, mais **un seul écrivain**
> (`formatRecentHistoryLine`) produit leurs lignes.
>
> **Pourquoi** — le défaut n'était pas d'avoir deux blocs (ils ont des tailles, des
> troncatures et des zones de budget différentes, toutes justifiées) : c'était d'avoir
> **deux rendus de la même règle**, donc deux vérités selon celui qui survivait au
> budget. Un écrivain unique supprime la divergence sans toucher à l'architecture du
> prompt. Le test `les DEUX blocs disent la même ancienneté du même message` l'arme.
>
> **Options rejetées** — *supprimer un des deux blocs* : chacun a une raison d'être
> (l'un est protégé du budget, l'autre est plus large) et la suppression est
> irréversible à bon marché ; le réversible bat l'irréversible.
>
> **Réversibilité** — retirer un import et remettre deux boucles locales.

---

## 7. Hypothèses adversariales — écrites avant, et leur sort

Les hypothèses sont inscrites dans l'en-tête de
`docs/nutrition-pivot/qa-web/FF023_dated_history_adversarial.ts`, **avant** l'exécution.

| # | hypothèse | sort | PREUVE |
|---|---|---|---|
| A1 | Le datage fait-il basculer un prompt réel au-dessus de 32 000 `full_chars` ? | **NON** | max mesuré 28 828 sur 10 tours ; surcoût +337 (1,05 %) ; marge 3 524 |
| A2 | Un message d'un autre `scope` (whatsapp) remonte-t-il ? | **NON** | ligne `MARQUEUR_WHATSAPP_XYZZY` insérée en `scope='whatsapp'` ⇒ `rows_read: 3` (et non 4) au tour suivant ; aucune trace dans la réponse relue en base |
| A3 | Le tour COURANT entre-t-il dans son propre historique ? | **NON**, la garde tient | `excluded_current: 1` sur **6 tours réels sur 6** |
| A4 | Un écart de 3 jours : la marque tient-elle, et le plancher de fraîcheur ? | **OUI aux deux** | `stale_dropped: 1, kept: 1` (le plancher garde le dernier échange) et réponse relue : *« il y a 3 jours, le 9 août à 14:21 »* |
| A5 | La marque sort-elle en anglais, et le modèle s'en sert-il ? | **OUI** | élève `en-US` / `America/Los_Angeles` ⇒ *« About 3 hours ago. »* |
| A6 | `readTemporalAnchors` peut-il capter un `now_utc=` d'un autre bloc ? | **NON** | un seul producteur dans tout le dépôt : `_shared/user_time_context.ts:219` |
| A7 | `profiles.timezone` NULL ⇒ crash ou fausse marque ? | **NON** | `getUserTimeContext` retombe par `safeTz`; et `localParts` retombe sur UTC si `Intl` refuse le fuseau (test `Mars/Olympus_Mons`) |
| A8 | Deux messages au même `created_at` à la ms ⇒ marque menteuse ? | **NON**, marque identique | observé en base : le user et la réponse du tour 1 portent `09:17:52.388138` ; ils reçoivent la même marque, ce qui est exact |
| A9 | Le modèle peut-il lire « pas de marque » comme « vieux » ? | **NON TESTÉ** | non testable à coût raisonnable : il faudrait un run à `created_at` NULL, or aucune écriture de production n'en produit. Consigné §8 |

---

## 8. Ce qui reste ouvert

1. **`turn_summary_logs.context_elements` / `.context_tokens` sont morts.**
   `persistTurnSummaryLog` est complète, testée, et sans appelant. Tant qu'elle n'est pas
   branchée, aucun lot ne peut prouver « quel bloc a porté le tour » par cette colonne —
   et la structure invite à croire le contraire. **Ce n'est pas mon lot** ; je le consigne.
2. **A9 non testé** : un `created_at` NULL n'existe pas en production (la colonne est
   `not null` côté écriture réelle) ; le type l'autorise, le code le gère, mais l'effet
   sur le modèle n'a pas pu être mesuré faute de cas réel.
3. **La ligne d'instruction ajoutée au bloc visible coûte ~185 caractères dans la zone
   non tronquable.** Elle est le « nommer et contredire l'a priori » de la cicatrice ;
   si un lot futur doit récupérer du budget protégé, c'est la première chose à couper —
   les marques, elles, restent.
4. **Le bloc du loader reste dans la queue tronquable.** Après ce lot ce n'est plus grave
   (le bloc protégé est daté aussi), mais un élève à contexte très riche perdra toujours
   ses 15 lignes datées et gardera ses 6. C'est le dessin voulu, pas un défaut.

---

## 9. Commandes pour l'humain

```bash
# 1. Les tests unitaires du lot (environnement purgé — obligatoire)
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env --no-check supabase/functions/_shared/chat/

# 2. La suite complète du cerveau (régression)
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env --no-check supabase/functions/sophia-brain/

# 3. Rejouer le run réel (pile locale). Après tout changement de code edge:
docker restart supabase_edge_runtime_Sophia_2 && sleep 12 \
  && docker restart supabase_kong_Sophia_2 && sleep 10 \
  && ./scripts/local_extend_kong_functions_timeout.sh

ANON=$(docker inspect supabase_edge_runtime_Sophia_2 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^SUPABASE_ANON_KEY=' | cut -d= -f2-)
SVC=$(docker inspect supabase_edge_runtime_Sophia_2 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^SUPABASE_SERVICE_ROLE_KEY=' | cut -d= -f2-)
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY="$ANON" SUPABASE_SERVICE_ROLE_KEY="$SVC" \
  deno run -A docs/nutrition-pivot/qa-web/FF023_dated_history.ts apres
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY="$ANON" SUPABASE_SERVICE_ROLE_KEY="$SVC" \
  deno run -A docs/nutrition-pivot/qa-web/FF023_dated_history_adversarial.ts

# 4. Relire full_chars du prompt compagnon (console.log EST visible ici)
docker logs supabase_edge_runtime_Sophia_2 2>&1 \
  | grep -E "companion_prompt_cache_ready|chat_inbound_history_loaded" | tail -12
```

**Rien n'a été poussé. Aucune migration. Aucun `db reset`. Les cinq comptes de
fixture ont été nettoyés** (`select count(*) … full_name like 'FF023%'` ⇒ `0`).
