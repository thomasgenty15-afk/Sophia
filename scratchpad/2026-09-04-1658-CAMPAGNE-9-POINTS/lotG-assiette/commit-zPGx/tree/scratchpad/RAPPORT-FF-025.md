# RAPPORT FF-025 — L'invitation à la photo

**Branche** `ff-001-quotidien-du-coach` · **Date** 2026-08-08 · **Stack** locale,
vrai modèle, vraie base, élèves provisionnés avec plan publié.

> **Verdict d'ensemble.** FF-025 **n'existait pas** : zéro fichier, zéro ligne
> en base, aucune surface. Elle est construite, avec le **compteur partagé** que
> deux autres fiches vont consommer. Le run réel a trouvé **un défaut dans mon
> propre code** (le rattachement ne s'est jamais produit — une colonne absente
> d'un `SELECT`), corrigé et re-mesuré 3/3. Trois écarts fiche/code sont
> consignés sans être appliqués, dont un qui demande un arbitrage humain.
> Deux REDs restent ouverts, aucun n'est dans mon périmètre d'écriture.

---

## LE COMPTEUR PARTAGÉ

> **Cette section est écrite pour être recopiée telle quelle dans les prompts de
> FF-017 et FF-028. Ne créez pas un deuxième compteur.**

### Où il vit

| | |
|---|---|
| **Module** (seul accès autorisé) | `supabase/functions/_shared/keel/daily_ask_budget.ts` |
| **Table** | `public.meal_precision_questions` — **nom physique historique**, elle n'est plus à la seule question de précision. Citez la constante `DAILY_ASK_LEDGER_TABLE`, jamais la chaîne. |
| **Migration** | `supabase/migrations/20260808123000_daily_ask_budget.sql` (appliquée en local, version enregistrée) |
| **Plafond** | `DAILY_ASK_BUDGET = 1` — une demande par jour et par élève, **tous genres confondus** |
| **Adaptateur existant** | `_shared/keel/meal_precision_cap.ts` ne parle plus à Postgres : il délègue. Ses trois appelants (`keel_meal_precision_lane.ts`, `analyze-meal-photo-v1`) sont inchangés. |

### La signature exacte

```ts
import {
  countDailyAsks,
  DAILY_ASK_BUDGET,
  DAILY_ASK_KINDS,
  DAILY_ASK_LEDGER_TABLE,
  hasEverAsked,
  recordDailyAsk,
  type DailyAskKind,
  type DailyAskSource,
} from "../../_shared/keel/daily_ask_budget.ts";

/** Liste FERMÉE, alignée sur le CHECK `meal_precision_questions_ask_kind_check`. */
const DAILY_ASK_KINDS = [
  "meal_precision_question",  // FF-017 §3 (+ chemin photo FF-018) — PORTE un axe
  "photo_invitation",         // FF-025 — axe null OBLIGATOIRE
  "daily_recommendation",     // FF-028 — axe null OBLIGATOIRE
] as const;

type DailyAskSource = "text" | "photo" | "chat";

/** LIRE le budget du jour. Fail-CLOSED: une lecture ratée rend `count = 1`. */
function countDailyAsks(
  db: SupabaseClient,
  args: { userId: string; localDate: string | null | undefined },
): Promise<{ count: number; reason: "counted" | "read_failed" | "missing_local_date" }>;

/** LIRE le « déjà dit une fois par personne ». Fail-CLOSED vers le SILENCE. */
function hasEverAsked(
  db: SupabaseClient,
  args: { userId: string; kind: DailyAskKind },
): Promise<{ ever: boolean; reason: "counted" | "read_failed" }>;

/** ÉCRIRE. Idempotent par le schéma sur `(user_id, asked_for_message_id)`. */
function recordDailyAsk(
  db: SupabaseClient,
  args: {
    userId: string;
    localDate: string;
    kind: DailyAskKind;
    source: DailyAskSource;
    axis: string | null;        // NON NULL ssi kind === "meal_precision_question"
    text: string;               // le texte EXACT parti (audit)
    protocolEventId: string | null;
    askedForMessageId: string;  // la clé d'idempotence
  },
): Promise<{ ok: boolean; alreadyRecorded: boolean; reason?: string }>;
```

### Le protocole d'usage — trois règles, toutes obligatoires

1. **Lire, puis inscrire, PUIS parler.** `recordDailyAsk` échoue ⇒ la demande
   **ne part pas**. Une demande hors compteur rend le plafond décoratif.
2. **`alreadyRecorded === true` ⇒ se taire.** C'est le rejeu du même message
   (502 de Kong, retry client) **ou** une autre surface qui a déjà pris la place
   de ce tour. L'index unique `(user_id, asked_for_message_id)` est l'arbitre
   inter-surfaces : il n'y a **pas** de verrou applicatif à poser.
3. **Un refus se nomme.** `reason_code` remonte dans le log de tour
   (`[keel] request_id=… photo_invitation reason=budget_consumed:counted`).
   Un refus silencieux est indiscernable d'une garde absente.

### Ce que la migration a ajouté

- `ask_kind text not null default 'meal_precision_question'` + CHECK fermé ;
- `axis` devient **nullable** mais **pas libre** : CHECK conditionnel — une
  question de précision **doit** porter un axe de la liste, tout autre genre
  **doit** n'en porter aucun ;
- `source` accepte `'chat'` ;
- index `(user_id, ask_kind)` pour la lecture « déjà dit, un jour quelconque » ;
- commentaire de table réécrit : c'est la seule autorité sur ce que la table
  contient.

> ⚠️ **Le contrôle final de la migration a trouvé son propre défaut.** Écrit
> `case when … then axis in (…) else axis is null end`, le CHECK rendait `NULL`
> sur une question de précision sans axe — **et un CHECK qui rend NULL passe**.
> Le relâchement du `NOT NULL` posé pour l'invitation avait donc désarmé la
> règle qu'il devait conserver. Corrigé par `axis is not null and axis in (…)`.
> Le contrôle rejoue les quatre gestes (invitation sans axe : accepté ;
> invitation **avec** axe : refusée ; précision **sans** axe : refusée ; genre
> inconnu : refusé) — il n'inspecte pas du texte.

### Où le compteur est déjà lu et écrit aujourd'hui

| Surface | Fichier | Genre |
|---|---|---|
| Question de précision, texte | `sophia-brain/router/keel_meal_precision_lane.ts:409` | `meal_precision_question` |
| Question de précision, photo | `analyze-meal-photo-v1/index.ts:755` | `meal_precision_question` |
| Invitation à la photo | `sophia-brain/router/keel_photo_invitation_lane.ts` | `photo_invitation` |

**Preuve en run réel que le budget est bien UN** (cas H2, 3/3) : une question de
précision posée au tour 1 (`meal_precision_question | text | accompaniment`)
ferme l'invitation du tour 2 sur un hors-plan pourtant parfaitement éligible —
`photo_invitation reason=budget_consumed:counted` dans le log, **0** ligne
`photo_invitation` en base.

---

## 1. État initial constaté — avec preuves

FF-025 n'existait pas. Ce n'est pas une supposition :

```
$ grep -ril "photo_invitation\|invitation.*photo" supabase/functions/  → 0
$ select count(*) from meal_precision_questions where ask_kind <> 'meal_precision_question';
  ERROR: column "ask_kind" does not exist
```

Ce qui existait, et qui était le bon point de départ :

| Élément | Fichier / preuve | État constaté |
|---|---|---|
| Le fait hors plan | `protocol_events.plan_relation`, `_shared/keel/meal_declaration_floor.ts:502` `detectOffPlanMarker` | livré et éprouvé par FF-009 (bilingue, 16/16) |
| La relation relue | `tools/always_on/log_protocol_event/executor.ts:197` | `plan_relation` est dans le `committed_effect`, **relue en base**, `readback_mismatch` sur divergence |
| La chaîne photo | `meal-photo-upload-v1` → `analyze-meal-photo-v1` | livrée ; **elle insère toujours sa propre ligne** (`source='photo'`) |
| Un compteur de demandes | `_shared/keel/meal_precision_cap.ts` + table `meal_precision_questions` (57 lignes) | existant mais **d'un seul genre** — `axis text NOT NULL`, `source in ('text','photo')` |
| Le véhicule d'une phrase runtime | `run.ts:1086` `keel.meal_precision_question` → `appendMealPrecisionQuestion` dans `finalVisibleText` | le patron à copier |

**Le trou que FF-025 devait combler, mesuré** : « I ordered a pizza » →
1 ligne `off_plan | - | chat`, **aucun aliment**, et rien n'invitait à la photo.

---

## 2. Ce qui a été construit, et les écarts fiche ↔ code

### Construit

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20260808123000_daily_ask_budget.sql` | élargit le ledger, avec son contrôle par le geste |
| `_shared/keel/daily_ask_budget.ts` | **le compteur partagé**, neutre |
| `_shared/keel/meal_precision_cap.ts` | devient un **adaptateur** ; ne parle plus à Postgres |
| `_shared/keel/photo_invitation.ts` | le gate PUR + les gabarits FERMÉS FR/EN + l'ajout au texte |
| `_shared/keel/photo_invitation_attach.ts` | la décision PURE de rattachement + les deux gestes d'écriture |
| `sophia-brain/router/keel_photo_invitation_lane.ts` | l'armement (lire → inscrire → parler) |
| `sophia-brain/router/run.ts` | le câblage : `keelTurn.meal_photo_invitation`, armé **avant** la question de précision, rendu dans `finalVisibleText` |
| `meal-photo-upload-v1/index.ts` | étape 9bis — le rattachement, **après** l'analyse |

### 🔴 D1 — Le rattachement ne s'est JAMAIS produit *(mon code, corrigé)*

**Mesuré**, cas X1, 1 tour sur 1 :

```
« I ordered a pizza »   → 1 ligne  off_plan | - | chat | media=false
*photo envoyée*         → 2 lignes off_plan | - | chat  +  NULL | - | photo
                          attached_to_declared_meal: false
```

C'est **exactement le double comptage que R4 interdit**, et il était produit par
l'invitation elle-même : le produit demandait un geste dont le seul effet
mesurable était de fausser ses propres chiffres.

La cause n'était ni le gate ni la fenêtre : **`analyzed_at` ne figurait pas dans
`EVENT_COLUMNS`** (`meal-photo-upload-v1/index.ts:351`). La relecture rendait la
colonne absente, donc la question « l'analyse a-t-elle tourné ? » répondait
**toujours non**, donc `photoIsAMeal` était toujours faux. Une garde correcte,
alimentée par un `SELECT` incomplet.

**Après** : `1 → 1` ligne, `off_plan | photo | media=true | portion=moderate`,
**3/3**. Commit `36752ad7`.

### 🟠 D2 — La ligne d'éducation : la fiche se contredit, le code tranche *(amendement proposé, NON appliqué)*

§3 dit « **si la personne n'envoie pas de photo** : au plus une ligne
d'éducation », §4 la dessine comme une branche **après** l'absence de photo, et
§7 dit « une fois par **personne**, pas une fois par repas ». Mais **R2 dit
« zéro relance : ni le lendemain, ni au repas suivant »**.

Ces trois phrases ne peuvent tenir ensemble que d'une seule manière : **la ligne
d'éducation n'est pas un second message, c'est la FORME que prend la toute
première invitation**. Un message autonome envoyé parce que la photo n'est pas
venue serait la relance que R2 interdit, aussi gentil soit-il — et §9 nomme
précisément ce piège (« au fait, pour la pizza d'hier… est une relance même si
elle est gentille »).

Le code applique donc :
- **première invitation de la vie de la personne** → variante éducative ;
- **toutes les suivantes** → variante nue ;
- jamais de second message.

> **Amendement proposé à §3 et §4 — NON APPLIQUÉ, à trancher par l'humain.**
> Remplacer, §3 :
> `- Si la personne n'envoie pas de photo : au plus une ligne d'éducation …`
> par
> `- La PREMIÈRE invitation de la vie d'une personne porte la ligne d'éducation`
> `  (« même approximative, elle en dit plus qu'une description ») ; toutes les`
> `  suivantes sont nues. Elle n'est JAMAIS un second message : une invitation`
> `  autonome envoyée parce que la photo n'est pas venue est la relance de R2.`
> Et redessiner la branche « pas de photo » du §4 en « **rien** ».

### 🟠 D3 — Le « déjà dit » ne vit pas dans `temp_memory` *(question ouverte §11 tranchée)*

§11 propose `user_chat_states.temp_memory` « avec la course à deux écrivains à
garder en tête ». Le code ne le fait pas, pour deux raisons dont la première
suffit :

1. `temp_memory` a **deux écrivains concurrents** en lecture-modification-
   écriture complète (le tour texte et le chemin photo), le dernier gagne — et
   un « déjà dit » qu'on peut perdre est un « déjà dit » qui **sera redit** ;
2. le souvenir doit survivre **un mois** (test X3), et `temp_memory` est une
   mémoire de tour, réécrite intégralement par le companion depuis l'état
   PRÉ-routing à chaque tour. **Mesuré** dans ce run : un `conversation_locale`
   posé à la main y est écrasé au tour suivant.

Il vit donc dans le ledger : `hasEverAsked(db, { userId, kind: "photo_invitation" })`,
une ligne durable avec sa date, indexée `(user_id, ask_kind)`.

L'historique récent (`_shared/chat/recent_history.ts`, 20 messages / 12 h) a été
regardé et écarté : borné et frais, il ne peut pas porter un « déjà dit le mois
dernier ».

> **Amendement proposé à §11 — NON APPLIQUÉ.** Remplacer le candidat
> `user_chat_states.temp_memory` par « le ledger de demandes
> (`daily_ask_budget.ts :: hasEverAsked`) — `temp_memory` est écrasé à chaque
> tour et ne survit pas au mois que §7 exige ».

### 🟠 D4 — L'arbitrage invitation ↔ question de précision n'est pas dans la fiche

Sur un repas hors plan, **les deux surfaces sont éligibles** et partagent un
budget de 1. La fiche ne dit pas laquelle gagne. Le code tranche : **l'invitation
passe d'abord**, et seulement sur un hors-plan (`not_off_plan` est son premier
refus payant, rendu **sans toucher la base**). Partout ailleurs la question de
précision garde la main entière.

La raison : une photo répond à la composition, à la préparation **et** à
l'accompagnement d'un seul geste de trois secondes, là où la question textuelle
n'ouvre qu'un axe et demande une phrase. Sur le repas le plus pauvre du produit
(« j'ai commandé », zéro aliment), c'est la seule des deux qui peut remplir la
ligne.

**Ce point mérite d'être écrit dans une des deux fiches.** Il n'y est pas.

---

## 3. Tableau des tests réels

Élève **neuf** par (cas × répétition) — plan publié + engagements ; le budget
étant par élève et par jour, deux cas sur le même élève se ferment l'un l'autre.
Plafond 3 élèves/coach respecté. Toutes les preuves sont des lignes **relues en
base** (`protocol_events`, `meal_precision_questions`) ou le texte exact du
`chat_messages` de la réponse.

| Niveau | Scénario | Verdict | Preuve |
|---|---|---|---|
| easy | E1 FR « j'ai commandé une pizza » | 🟢 3/3 | `photo_invitation \| chat \| axis=- \| evt=<uuid>` ; réponse porte la variante éducative |
| easy | E2 EN « I ordered a pizza » | 🟢 3/3 | idem ; `off_plan \| other_added_fat \| chat` |
| medium | M1 EN « I ordered takeout last night » | 🟢 3/3 | `off_plan \| - \| chat` + 1 ligne d'invitation |
| medium | M2 FR « on a mangé au resto hier » | 🟢 3/3 | `off_plan \| - \| chat` + 1 ligne d'invitation |
| medium | M2b R7 côté **rendu** | ℹ️ 3/3 constaté | le fil ancré `fr-FR` répond quand même en anglais → **§5 O1** (épingle pilote) |
| medium | M3 la personne répond « non » | 🟢 3/3 | 0 mention de photo aux tours 2 et 3 |
| hard | H1 deux hors-plans le **même jour** | 🟢 3/3 | `lignes_invitation = 1`, `inv2 = none`, 4 lignes `protocol_events` |
| hard | H2 budget consommé par la **question de précision** | 🟢 3/3 | ledger : `meal_precision_question \| text \| accompaniment` **seul** ; 0 invitation |
| hard | H3 sous plancher de crise | 🟢 3/3 | 0 ligne d'invitation, 0 `protocol_events` ; réponse = flow de crise |
| hard | H3b hors-plan **+ détresse** | 🟢 3/3 | 0 invitation, **0 ligne écrite** (le plancher TCA préempte) → §5 O2 |
| hard | H4 intention « je vais commander ce soir » | 🟢 3/3 | 0 ligne, 0 invitation |
| hard | H5 repas maison (pas hors plan) | 🟢 3/3 | `NULL \| lean_protein` + `NULL \| whole_grain` ; ledger = **question de précision**, pas invitation |
| hard | H6 ignore puis écrit **le lendemain** | 🟢 3/3 | 0 mention de la photo manquante sur 2 tours |
| extra | X1 la photo arrive dans les minutes | 🟢 3/3 | `1→1` ligne ; `off_plan \| photo \| media=true \| moderate` ; `attached_to_declared_meal: true` |
| extra | X2 la photo montre un **menu** | 🟢 3/3 | `attached=false` ; le hors-plan reste `chat \| media=false \| dq=-` ; la photo est sa propre ligne `dq=food_not_eaten` |
| extra | X3 éducation dite « il y a un mois » | 🟢 3/3 | ledger : ligne 1 = variante **éducative**, ligne 2 = variante **nue** |
| extra | X4 invitation puis rétractation | ℹ️ 3/3 observation | la rétractation écrit une **2ᵉ ligne** au lieu de retirer → §5 O3 (hors FF-025) |
| extra | X5 la photo arrive **hors fenêtre** (2 h) | 🟢 3/3 | `attached=false`, la photo redevient son propre fait — le rattachement différé reste ouvert |
| adv | A1 propriété **zéro relance** sur 5 tours | 🟢 3/3 (+3) | 0 demande de photo ; 1 mention **factuelle** (« 0 meal photos sent ») dans un récap, qui ne demande rien |
| adv | A2 photo **avant** déclaration | ℹ️ 3/3 observation | 2 lignes, invitation quand même armée → §5 O4 |
| adv | A3 trois jours consécutifs de hors-plan | 🟢 3/3 | `["edu","bare","bare"]` à chaque fois — l'éducation ne se répète jamais |
| adv | A4 registre (contrôle / culpabilisation) | 🟢 3/3 | 0 suspecte sur toutes les réponses portant une invitation |
| adv | A5 fuite par le composeur, budget consommé | 🟢 3/3 · 🔴 1 occurrence ailleurs | 0 fuite sur 6 tours dédiés + 0/16 sur `ff025_leak_probe.ts` ; 1 vue en X3 → §5 O5 |

**Unitaires** (environnement purgé) :
`photo_invitation_test.ts` **21 verts** · `photo_invitation_attach_test.ts`
**13 verts** · `daily_ask_budget_test.ts` **16 verts** ·
`keel_photo_invitation_lane_test.ts` **9 verts** · `meal_precision_cap_test.ts`
**9 verts** (inchangés, ils prouvent que la délégation ne casse rien) ·
`_shared/keel/` **1555 verts, 0 rouge** · `sophia-brain/router/` **211 verts,
1 rouge PRÉ-EXISTANT** (§6) · suite complète `supabase/functions/` **3535 verts,
1 rouge PRÉ-EXISTANT**.

**Frontend** : `npx tsc -b` dans `frontend/` → **0 erreur** (aucun fichier
frontend touché).

---

## 4. Hypothèses adversariales — écrites avant d'être testées

| # | Hypothèse | Sort |
|---|---|---|
| **A1** | *La relance déguisée* : sur les 5 tours suivant une invitation ignorée, une mention de la photo ressort. | 🟢 **Réfutée**, 3/3. 0 demande. Un récap factuel (« 0 meal photos sent ») a été trouvé et **n'est pas une relance** : il décrit, il ne demande rien — c'est la mesure §10 elle-même. Le détecteur a été resserré sur la DEMANDE (impératif, « you didn't send », « envoie-la ») après un premier faux positif. |
| **A2** | *Le registre qui glisse vers le contrôle* (« pour que je vérifie »). | 🟢 **Réfutée** structurellement **et** en run. Le texte est une constante ; un test le passe au crible d'un lexique de contrôle, de culpabilisation, de quantité et de relance, **dans les deux langues**. En run : 0 suspecte. |
| **A3** | *Le double comptage photo + déclaration.* | 🔴 **CONFIRMÉE** → D1, corrigée, 3/3 après. |
| **A4** | *La contre-mesure de la fiche* : l'invitation part sur CHAQUE hors-plan des jours suivants et les gens se taisent. | 🟠 **Partiellement confirmée, et c'est le dessin.** Le budget est **journalier** : trois jours de hors-plan → trois invitations (`edu`, `bare`, `bare`). Ce qui est tenu, c'est qu'il n'y en a jamais **deux le même jour** (H1) et que l'éducation ne se répète **jamais** (A3). Une invitation quotidienne reste un risque produit réel — §5 O6. |
| **A5** | *La fuite par le composeur* : le modèle invite à photographier de son propre chef, hors budget. | 🔴 **CONFIRMÉE, non corrigée** → §5 O5. Rare (1 occurrence sur ~25 tours mesurés) mais réelle. |
| **A6** | *La photo de menu détruit le repas déclaré* (elle emporterait `disqualified_reason` sur la ligne du hors-plan, invisible au coach). | 🟢 **Réfutée par construction et vérifiée** (X2, 3/3). C'est le cas qui a **dicté l'architecture** : le rattachement est APRÈS l'analyse, précisément pour ça. Rattaché avant, ce cas faisait disparaître un repas dont la personne avait dit la vérité. |
| **A7** | *L'invitation survit à une route de crise reconstruite après l'armement.* | 🟢 **Réfutée** : double barrière — le gate ferme sur toute bande ≠ `none`, et `appendPhotoInvitation` est **dans** le `if (!isSafetyRoute(...))` de `finalVisibleText`. ⚠️ La branche du gate n'est pas atteinte en run réel : voir §5 O2. |
| **A8** | *Deux surfaces prennent la place du même tour* (invitation + question de précision). | 🟢 **Réfutée** deux fois : l'ordre d'appel (invitation avant), **et** l'index unique `(user_id, asked_for_message_id)` qui rend `alreadyRecorded` à la seconde. Vérifié en run par H1/H2. |
| **A9** | *Une garde ne mord que dans une langue.* | 🟢 **Réfutée côté détection** (E1/M2 en FR, E2/M1 en EN, 3/3 chacun) — la reconnaissance vient du plancher bilingue de FF-009. 🟠 **Côté rendu, non éprouvable** : voir §5 O1. |
| **A10** | *Le rattachement déplace la ligne d'un autre élève* (le service role ignore RLS). | 🟢 **Réfutée** : `findInvitedOffPlanFact` et les deux `update`/`delete` portent tous `.eq("user_id", …)` **en plus** de l'id. C'est la cicatrice `rls-is-not-a-substitute-for-eq-user-id`. |
| **A11** | *Une seconde photo écrase la première, ou une photo rejouée déplace une ligne déjà lue.* | 🟢 **Réfutée** : `already_has_media` et `photo_not_fresh` (`!idempotent`) sont deux refus distincts, testés. |

---

## 5. Ce qui reste ouvert

### 🔴 O5 — Le composeur invente sa propre invitation, hors budget

**Mesuré** (cas X3, 1 occurrence) — le tour portait DÉJÀ l'invitation du runtime :

```
« … If you want, send the dish or a photo and I'll help you size it up.

If you have a photo of it, send it over: even a rough one tells me more … »
```

Deux demandes dans une réponse, dont une qui n'est passée par **aucun** gate :
elle ne consomme pas le budget, ne s'inscrit nulle part, et peut donc repartir
tous les jours — la relance de R2 obtenue en contournant la garde **par le
haut**.

**Fréquence mesurée** : 0 fuite sur 16 tours dédiés (`ff025_leak_probe.ts`,
8 élèves neufs, dont 8 tours à budget **consommé**) + 0 sur A5 ×3 (6 tours).
Soit **1 sur ~25**. Rare, réelle, et non détectable par un test unitaire.

**Non corrigé, et pourquoi.** Les deux emplacements possibles sont
`agents/companion.ts` (**fichier réservé à l'autre agent**) et une ceinture de
rendu dans `finalVisibleText` qui retirerait la phrase du modèle. La seconde est
de la chirurgie de phrase sur de la prose générée, posée en fin de session sur
un défaut à 4 % : c'est le genre de ceinture qui régresse. **Proposition pour
le lot suivant** : porter le `reason_code` de l'invitation sur `keelTurn`, et
retirer la SEULE phrase du modèle qui demande une photo quand le runtime a
décidé de ne pas inviter (budget, safety) ou qu'il invite déjà.

### 🟠 O1 — R7 côté rendu est inatteignable : `PILOT_FORCED_LOCALE`

`_shared/keel/locale.ts:28` porte `const PILOT_FORCED_LOCALE: string | null = "en-US"`,
et `resolveResponseLocale` **retourne dessus en première ligne**, court-circuitant
toute la chaîne de priorité.

**Mesuré** : un fil dont `user_chat_states.temp_memory.conversation_locale` vaut
`fr-FR` (posé exactement comme le produit le pose) répond en anglais et **réécrit
l'ancre en `en-US`** au tour suivant. 3/3.

**Conséquence, et elle dépasse FF-025** : la moitié française de **toute** copie
runtime bilingue de ce dépôt est du code mort au runtime — les gabarits de
`meal_precision.ts`, ceux de `photo_invitation.ts`, et tout ce qui passe par
`localePackKey`. Ce n'est pas la cicatrice `reply-language-ignores-voice-language`
(qui accuse le résolveur) : c'est une **épingle pilote assumée**, documentée dans
le fichier, avec sa procédure de retrait. FF-009 §5 O4 avait vu le symptôme sans
en nommer la cause ; la voici.

Le pack FR de FF-025 est prouvé **par test unitaire** (21 verts, dont le crible
de registre dans les deux langues) et la **détection** est prouvée bilingue en
run (E1/M2 en français). Le **rendu** français ne l'est pas, et ne peut pas
l'être tant que l'épingle est en place.

### 🟠 O2 — La branche `safety_band` du gate n'est pas atteinte en run réel

H3 et H3b sont verts (0 invitation), mais pour une raison **en amont** : sous
détresse, le tour n'écrit **aucune** ligne (`lignes_ecrites=0`), donc
`committedEventCount === 0` et le gate refuse avant même de regarder la bande.
`docker logs` sur ~78 armements : `invite` 58, `not_off_plan` 10,
`budget_consumed` 9, `flow_already_open` 1, **`safety_band` 0**.

R5 est donc tenue **trois fois** (suppression amont, gate, `!isSafetyRoute` au
rendu) mais une seule est exercée en réel. C'est la forme
`safety-constraints-armed-belt-empty-vault` : la ceinture est armée, le coffre
est vide. Elle reste la bonne posture — le jour où un tour sous bande écrira une
ligne (le plancher TCA de FF-021 peut évoluer), c'est cette branche qui tiendra.
Prouvée par test unitaire, pas par run.

### 🟠 O3 — La rétractation d'un repas écrit une seconde ligne *(hors FF-025)*

X4 : « actually no, I didn't eat it in the end » → une **2ᵉ** ligne
`NULL | - | chat` au lieu d'un retrait. `protocol_events` est append-only et le
chat ne sait pas rétracter. L'invitation, elle, se comporte bien (aucune seconde
invitation). Relève de FF-017/FF-009.

### 🟠 O4 — Une photo envoyée AVANT la déclaration n'empêche pas l'invitation

A2 : photo → puis « I ordered that, by the way » → 2 lignes, et l'invitation part
quand même. `hasMedia` vaut `false` sur le tour texte, et c'est **exact** (une
photo ne traverse pas le cerveau). Mais lu par la personne, c'est « on me demande
une photo que je viens d'envoyer » — le signe le plus court qu'on ne lit pas ce
qui arrive. **Correctif possible, non fait** : que le gate refuse quand une ligne
photo existe pour ce jour local dans les N dernières minutes. Ça demande une
lecture en base de plus par tour hors-plan ; à arbitrer.

### 🟠 O6 — La contre-mesure de §10 n'est pas instrumentée

§10 demande de voir **vite** si le volume de déclarations hors plan **baisse**
après l'invitation. Le budget est journalier : rien n'empêche une invitation par
jour, indéfiniment, pour quelqu'un qui commande souvent. Le ledger permet la
mesure (`ask_kind='photo_invitation'` vs lignes `off_plan` par jour), **aucun
tableau de bord ne la fait**. À poser avant d'ouvrir à des vrais utilisateurs.

### 🟠 O7 — Le nom physique de la table ment

`meal_precision_questions` contient maintenant trois genres de demande. Le
renommage demande trois épreuves d'absence (code, `prosrc`, vues) et traverse
`account-export-v1`, le lifecycle RGPD et six scripts de QA. **Chantier à part**,
à faire avant que FF-017 et FF-028 n'ajoutent leurs appelants.

---

## 6. Rouge pré-existant — prouvé antérieur, non réparé

`sophia-brain/router/run_keel_conversation_loop_test.ts:251` —
*« (a) a reported fact writes ONE protocol_events row… »* :

```
-   Recorded for 2026-07-27 (breakfast): Glycinate de magnésium.
+   Recorded for 2026-07-27 (breakfast): Magnesium glycinate.
```

**Preuve d'antériorité rejouée pour ce rapport** : worktree jeté sur `59f0e9ba`
(le commit précédant tout mon travail) → `FAILED | 10 passed | 1 failed`,
diff identique. Libellé i18n, sans rapport avec l'invitation. Non touché.
(Déjà consigné par le rapport FF-009 §6.)

---

## 7. Commits (aucun push)

| SHA | Sujet |
|---|---|
| `b482e823` | le budget de demande devient UN compteur, avant que trois fiches n'en créent trois |
| `e65a5a95` | l'invitation à la photo existe, et la photo qui arrive enrichit le repas au lieu d'en écrire un second |
| `36752ad7` | le rattachement de la photo lisait une colonne absente de son SELECT |
| `47489502` | la lane d'invitation porte ses tests : la place est prise avant que la phrase ne parte |

Fichiers touchés — **aucun fichier réservé** (`meal_precision.ts`,
`companion.ts`, `daily_pulse.ts`, `WeeklyCheckInDialog.tsx`, `week_review*.ts`
sont lus et appelés, jamais écrits) :

```
supabase/migrations/20260808123000_daily_ask_budget.sql          (neuf)
supabase/functions/_shared/keel/daily_ask_budget.ts              (neuf)
supabase/functions/_shared/keel/daily_ask_budget_test.ts         (neuf)
supabase/functions/_shared/keel/photo_invitation.ts              (neuf)
supabase/functions/_shared/keel/photo_invitation_test.ts         (neuf)
supabase/functions/_shared/keel/photo_invitation_attach.ts       (neuf)
supabase/functions/_shared/keel/photo_invitation_attach_test.ts  (neuf)
supabase/functions/sophia-brain/router/keel_photo_invitation_lane.ts       (neuf)
supabase/functions/sophia-brain/router/keel_photo_invitation_lane_test.ts  (neuf)
supabase/functions/_shared/keel/meal_precision_cap.ts            (adaptateur)
supabase/functions/sophia-brain/router/run.ts                    (câblage)
supabase/functions/meal-photo-upload-v1/index.ts                 (étape 9bis)
```

Fixtures : élèves `ff025 Student` / coachs `FF025 Coach`, tous nettoyés
(`cleanup()` en fin de chaque run).

---

## 8. Commandes pour l'humain

```bash
# 1. Les tests unitaires (environnement PURGÉ, sinon 114 faux rouges)
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env --no-check \
  supabase/functions/_shared/keel/photo_invitation_test.ts \
  supabase/functions/_shared/keel/photo_invitation_attach_test.ts \
  supabase/functions/_shared/keel/daily_ask_budget_test.ts \
  supabase/functions/_shared/keel/meal_precision_cap_test.ts \
  supabase/functions/sophia-brain/router/keel_photo_invitation_lane_test.ts

# 2. Le run réel (stack locale démarrée)
./scripts/local_extend_kong_functions_timeout.sh
docker restart supabase_edge_runtime_Sophia_2   # OBLIGATOIRE: _shared périmés sinon
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY=$(npx supabase status -o env | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p') \
SUPABASE_SERVICE_ROLE_KEY=$(npx supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p') \
  deno run -A scratchpad/ff025_run.ts all 3
#   suites: easy | medium | hard | extra | adv | <ID d'un cas>
#   fuite du composeur:  deno run -A scratchpad/ff025_leak_probe.ts 8

# 3. LA MIGRATION — à pousser en distant PAR TOI, je ne peux pas
supabase db push          # 20260808123000_daily_ask_budget.sql

# 4. Déploiement — À LANCER PAR TOI
supabase functions deploy sophia-brain
supabase functions deploy meal-photo-upload-v1
```

**Cinq décisions à trancher :**

1. **D2** — appliquer ou refuser l'amendement §3/§4 (la ligne d'éducation est la
   forme de la première invitation, jamais un second message). Tant qu'il n'est
   pas tranché, §3 et R2 se contredisent dans la fiche.
2. **D3** — appliquer ou refuser l'amendement §11 (le « déjà dit » vit dans le
   ledger, pas dans `temp_memory`).
3. **D4** — écrire l'arbitrage invitation ↔ question de précision dans FF-025 ou
   dans FF-017. Il est dans le code, il n'est dans aucune fiche.
4. **O5** — autoriser (ou non) une ceinture de rendu qui retire une demande de
   photo écrite par le modèle. Elle touche la prose générée.
5. **O7** — ouvrir (ou non) le chantier de renommage de
   `meal_precision_questions`, **avant** que FF-017 et FF-028 n'y ajoutent leurs
   appelants.
