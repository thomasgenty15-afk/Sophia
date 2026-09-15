# RAPPORT — FF-056 · La divergence de poids passe sur le chemin déterministe

**Date** : 2026-08-12 · **Branche** : `ff-001-quotidien-du-coach` (jamais quittée, rien poussé)
**Commits** : `723fd1b1`, `58bbb365`, `5ee3a6d1` — agent-gate vert sur les trois.

---

## ⓪ Le verdict sur la thèse de ① — **établie, avec une nuance qui compte**

> « Les catégories de FF-056 sont déjà fermées dans le code. On demande donc au
> modèle de projeter du texte libre sur une énumération qu'on connaît d'avance. »

**L'espace des réponses EST fermé.** Preuves, fichiers:lignes :

| Ce qui est fermé | Où | Cardinal |
|---|---|---|
| les catégories | `sophia-brain/skills/weight_divergence/contract.ts:38` (`WEIGHT_DIVERGENCE_CATEGORIES`) | **9**, `other` incluse |
| le moment nommé | `contract.ts:93` (`WEIGHT_DIVERGENCE_SLOTS`) | **6**, `unspecified` incluse |
| la tâche visible | `contract.ts:198` (`WEIGHT_DIVERGENCE_VISIBLE_TASKS`) | **11** |
| l'état d'épisode | migration `20260811120000:107` (CHECK) | **6** |
| l'espace d'action durable | `daily_recommendation.ts:160` (`RECOMMENDATION_ACTION_IDS`) | **2** |
| la catégorie en base | migration `20260811120000:115` (CHECK) | les 9, littéralement |

Le branchement complet est une fonction **totale et pure** de (catégorie, moment,
espace d'action, plan changé, plancher, crise) : `reducer.ts:231`
(`taskForCategory`) et `reducer.ts:260` (`episodeStateForCategory`) sont deux
`switch` **exhaustifs sans branche par défaut**. Aucune sortie de ce flow ne
dépend d'autre chose que de ces six entrées.

**La nuance.** Le classifieur n'était pas la seule source de variation, et il
n'était même pas la principale — voir ⑧. Ce qui variait à chaque tour, c'est
**le texte de la réponse**, et c'est là qu'étaient les fautes produit.

---

## ① L'existant, établi avant d'écrire une ligne

### Ce que la machine à états connaissait

- **Neuf catégories** (`contract.ts:38`), dont `named_spot` — celle observée en
  run réel avec `classification_source = model`.
- **Six moments** (`contract.ts:93`), avec une table `SLOT_TO_RECOMMENDATION_ACTION`
  (`contract.ts:121`) **volontairement trouée** : seuls `morning` →
  `add_breakfast` et `afternoon` → `add_afternoon_snack` portent une action.

### Où le modèle classait, et sur quelle entrée

`sophia-brain/skills/weight_divergence/local_dispatcher.ts:224`
(`classifyDivergenceReply`). Entrée : **la phrase de la personne, et rien
d'autre** (`local_dispatcher.ts:239`, `slice(0, 1200)`). Aucun chiffre, aucune
série, aucune coche n'entre dans ce prompt — c'est correct et documenté.
Un plancher déterministe de refus mord **avant** le modèle
(`local_dispatcher.ts:64`, `DECLINE_PATTERNS`, FR+EN).

Appelé depuis `sophia-brain/router/run.ts:6900`, dans la lane gatée par
`sophia-brain/routers/routers.ts:463` (`weight_divergence_episode.live === true
&& distress === null`).

### Ce qu'`advanceEpisode` accepte, et les étapes

`_shared/keel/weight_divergence_io.ts:216`. Accepte `{id, userId, state,
category, turnCount, observationOpenedOn?, observationEndsOn?}`, filtre
`.eq("id").eq("user_id")`, pose `closed_at` selon l'état, et **relit**
(`.select("id")` → `updated`). États : `proposed` → `in_flow` → une des quatre
fins (`acted`, `nothing_to_change`, `declined`, `expired`).
Plafond `WEIGHT_DIVERGENCE_MAX_TURNS = 3` (`contract.ts:145`), lu par le reducer.

### La table

`supabase/migrations/20260811120000_weight_divergence_episodes.sql`. Index unique
partiel `weight_divergence_one_open_per_user` sur `(user_id) where state in
('proposed','in_flow')`. RLS : `select` au titulaire seul, **aucune policy
d'écriture**.

**Preuve de droits, en base :**

```
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c \
  "select has_table_privilege('authenticated','public.student_weight_divergence_episodes','INSERT'),
          has_table_privilege('authenticated','public.student_weight_divergence_episodes','UPDATE'),
          has_table_privilege('authenticated','public.student_weight_divergence_episodes','SELECT'),
          has_table_privilege('anon','public.student_weight_divergence_episodes','SELECT');"
→  f | f | t | f
```

C'est **exactement** la faute FF-056 corrigée par `00e2cf6d` : l'écriture doit
passer par `service_role`, et le `as never` du site d'appel avait rendu l'erreur
invisible.

---

## ② ③ ④ ⑤ ⑥ Ce qui a été construit

### Le module pur — `_shared/keel/weight_divergence_buttons.ts` (nouveau)

Jumeau d'`evening_strip.ts` : vocabulaire fermé, constructeurs purs, ceinture
armée sur le texte exact, lecteur qui ne devine jamais. Ni base, ni horloge, ni
aléatoire.

- **Préfixe** `KEEL_WDIV_`, séparateur `|`, **trois segments exactement**.
- Trois verbes : `KEEL_WDIV_STEP` (déplie, n'écrit rien), `KEEL_WDIV_CAT`
  (catégorie terminale), `KEEL_WDIV_SPOT` (moment ⇒ `named_spot`).
- La charge porte **l'identifiant d'épisode (UUID validé) + le jeton**.
- `readDivergenceReply` rend `none` sur tout ce qui n'est pas exactement ça.

**Décision — un arbre à deux niveaux, cinq boutons au premier.**
**Pourquoi** — neuf boutons sous une question sur le poids se lisent comme un
interrogatoire, et §9 de la fiche nomme « la copie qui glisse vers le soupçon »
comme un rabbit hole. Le dépliage est le patron du dépôt (FF-058 `Pas tout`,
FF-057 formulaire → question de session).
**Options rejetées** — (a) *neuf boutons à plat* : interrogatoire, et
`named_spot` sans moment reproduit le défaut mesuré (« le matin je grignote » →
une collation l'après-midi) ; (b) *cinq boutons sans le moment* : `named_spot`
ne peut alors JAMAIS produire d'action durable, donc §10 perd une de ses deux
bonnes fins ; (c) *aucun bouton, prompt durci* : « une règle de prompt n'est pas
une ceinture », déjà écrit dans le reducer.
**Réversibilité** — retirer `buttons:` de l'appel `deliverChatMessage`
(`weight_divergence_engine.ts`) et le bloc de routage rend le flow à l'identique
d'hier. Deux suppressions, aucune migration, aucune donnée à défaire.

**Décision — `other` n'a pas de bouton.**
**Pourquoi** — c'est la soupape du texte libre (§9) ; un bouton « autre chose »
ne dirait rien de plus qu'une phrase et coûterait un tour.
**Options rejetées** — un dixième bouton, écarté ci-dessus.
**Réversibilité** — un membre à ajouter à `TAPPABLE_CATEGORIES` ; le test de
couverture tombe alors et dit où compléter.

### Le tap — `_shared/chat/weight_divergence_tap.ts` (nouveau) + routage

Les **trois cicatrices** demandées, honorées nommément :

1. **`service_role` nommé, zéro `as`.** `handleWeightDivergenceTap(admin, …)` où
   `admin` est le client construit avec `SUPABASE_SERVICE_ROLE_KEY` par
   `chat-inbound-v1:132`. Le paramètre est typé `SupabaseClient`.
2. **`.eq(user_id)` — et mieux : la charge ne choisit jamais la ligne.** On
   charge l'épisode **vivant du porteur du JWT** (`loadLiveEpisode`, filtré
   `user_id`) puis on **exige** que la charge le désigne. Il n'existe aucun
   chemin où un identifiant entrant sélectionne une ligne.
3. **Validation stricte + fraîcheur.** Trois segments, UUID, jeton d'une liste
   fermée ; et un tap sur un épisode plus vieux que
   `WEIGHT_DIVERGENCE_OPEN_FOR_DAYS = 2` est refusé **au tap**, sans attendre le
   balayage de 19 h.

Le reducer PUR de la skill est **réutilisé**, pas réécrit
(`reduceWeightDivergence`), ainsi que les répliques gelées
(`weightDivergenceDeterministicMessage`) et le canal FF-028
(`insertProposal`, `recommendationButtonId`, `applyRecommendation`).

### La phrase ne bouge pas, le branchement bascule

`weight_divergence_engine.ts` attache les cinq boutons à la **même** question
gelée. R2 (le sujet est le plan) et R3 (question vraiment ouverte) vivent dans la
phrase, inchangée. `buildDivergenceOpening` rend `null` si la ceinture refuse ⇒
la question part **nue**, exactement comme avant le lot (fail-open sur les
boutons, jamais sur la phrase).

**Les deux résidus, vérifiés moi-même :**

- *« l'agent visible anthropomorphise le plan »* — **CONFIRMÉ en run réel**,
  3 réponses sur 3 sur le chemin texte : « Le plan **l'a noté** », « Le plan
  **en tient compte** », « Le plan **prend en compte** ». Sur le chemin bouton
  il **meurt par construction** : aucun modèle n'est appelé, les textes sont des
  littéraux gelés. Sur le chemin texte, **non corrigé** — voir « ce qui reste
  ouvert ».
- *« le repli “Le plan ne m'a pas permis de comprendre” fuit à l'écran »* —
  **introuvable** : `grep` sur `supabase/` et `frontend/src` ne rend rien. Le
  repli réel de `reformulate_once` est « Je ne suis pas sûre d'avoir suivi. Tu
  peux me le redire avec tes mots ? ». Rien à retirer.

### Le classifieur est rétrogradé, pas cassé

Aucune ligne retirée. La lane texte (`routers.ts:463` → `run.ts:6900`) est
intacte et **testée en run réel** (voir ⑤ ci-dessous, `medical` obtenu à partir
d'une phrase libre). Le tap est simplement intercepté **avant** par
`handleDeterministicButton`, comme les quatre autres familles.

### Les gardes

- `FORBIDDEN_PLAN_DELIVERY_PHRASES` reste armée, et elle a été **élargie** — voir
  ⑨/RED-1.
- **Neuve : `FORBIDDEN_SELF_BLAME_LABELS`** (36 locutions, FR+EN). Elle vise le
  **verbe de faute à la première personne** — ce qu'un libellé met dans la bouche
  de la personne. « Je craque le soir » mord ; « Le soir » et « Je mange dehors
  le midi » passent. Les cinq familles existantes ne mordaient sur aucune : aucune
  ne parle de ce dont la personne s'accuse.
- **Matcher du dépôt uniquement** : `findForbiddenMatches`, jamais un `includes`.
- **`banNumbers` est REQUIS** (pas d'optionnel), et un test prouve qu'il change
  le verdict.
- **FR et EN**, familles par familles, avec **cas mordant ET cas passant**.
- **Négation non blanchissante** (`allowNegatedMentions: false`) : « je ne dis
  pas que c'est un manque de discipline » est refusé.

---

## ⑦ Le budget T4 — vérifié, pas supposé

`DAILY_ASK_BUDGET = 1` (`daily_ask_budget.ts:93`), ledger
`meal_precision_questions`, **cinq** familles (`daily_ask_budget.ts:50` :
`meal_precision_question`, `photo_invitation`, `daily_recommendation`,
`practice_question`, `weight_divergence_question`).

- L'**ouverture** consomme la place (`weight_divergence_engine.ts`,
  `recordDailyAsk(kind:"weight_divergence_question")`), **avant** la livraison.
- Le **tap** ne consomme rien : `grep recordDailyAsk` sur
  `weight_divergence_tap.ts` → **zéro occurrence**. C'est la règle de
  `shiftProposalAfterShoppingLater` (FF-057) : la réponse à un geste que la
  personne vient de faire n'est pas une demande du produit.
- La **proposition durable** née du tap ne consomme rien non plus, et elle est
  arbitrée par l'unicité `(user_id, local_date)` de `student_daily_recommendations` :
  si FF-028 a déjà proposé aujourd'hui, `insertProposal` rend `already_today` et
  le flow **dit qu'il a noté** au lieu d'ouvrir une seconde proposition.

---

## ⑧ La mesure

### 1. Le déterminisme de la classification — **le chiffre central**

Protocole : N personas **identiques** (même fixture, même série de poids, même
épisode), une seule phrase ou un seul tap identique. Catégorie relue **en base**.

| Chemin | Entrée | n | Catégories observées | Distinctes |
|---|---|---|---|---|
| **TEXTE (avant)** | « le matin je grignote en me levant » | 3 | `named_spot` ×3 | **1 — constant** |
| **TEXTE (avant)** | « j'ai changé de boulot le mois dernier, je dors mal et je mange souvent dehors » | 3 | `life_factor` ×3 | **1 — constant** |
| **BOUTON (après)** | `KEEL_WDIV_STEP\|…\|where` | 3 | `null` ×3 (le dépliage n'écrit rien) | **1 — constant** |
| **BOUTON (après)** | `KEEL_WDIV_SPOT\|…\|afternoon` | 3 | `named_spot` ×3 | **1 — constant** |
| **BOUTON (après)** | `KEEL_WDIV_CAT\|…\|declined` (EN) | 3 | `declined` ×3 | **1 — constant** |

> ⚠️ **HONNÊTETÉ SUR LE CHIFFRE ATTENDU.** Le `[0,3,3,0]` du socle est une mesure
> **historique du dispatcher général**, pas du classifieur de FF-056. **Je ne l'ai
> pas reproduit** : 6 échantillons sur 2 phrases, catégorie constante à chaque
> fois. Le classifieur de FF-056 (prompt à liste fermée, `temperature 0`,
> `reasoningEffort: low`) tient mieux que le dispatcher.
>
> **Ce qui varie vraiment, mesuré, c'est ailleurs — et c'est pire :**

| Chemin | Réponses distinctes / n | Violations de règle produit | Latence |
|---|---|---|---|
| **TEXTE** | **6 / 6** (aucune identique) | **2 / 6 (33 %)** — voir RED-1 | **4,5 – 9,9 s** |
| **BOUTON** | **1 / 9** (byte pour byte) | **0 / 9** — structurellement impossible | **63 – 712 ms** |

Le lot ne remplace donc pas un tirage de catégorie ; il remplace **un tirage de
phrase sur un sujet où une phrase de travers coûte la relation**. Et il retire
un appel de modèle par tour.

### 2. Le nombre de tours jusqu'à résolution

| Chemin | Tours | État final | Directive durable ?|
|---|---|---|---|
| **TEXTE**, `named_spot` (« le matin je grignote ») | 1 | `nothing_to_change` | **non** — aucune |
| **BOUTON**, `named_spot` (déplier + moment + Oui FF-028) | **2** (`turn_count=2`) | **`acted`** | **oui, relue** |
| **BOUTON**, `declined` | 1 | `declined` | n/a (R10) |
| **TEXTE**, `medical` | 1 | `nothing_to_change` | n/a |

`acted` était **inatteignable** avant ce lot : aucun chemin ne l'écrivait.
Il l'est maintenant, et T6 est prouvé en base (ci-dessous).

### 3. `full_chars` — **delta zéro, et c'est structurel**

- Aucun chemin FF-056 n'atteint le compagnon : la lane rend avant le composeur
  (`run.ts:7061`, `finishKeelSkillTurn`). **Zéro** ligne
  `companion_prompt_cache_ready` produite par 9 taps + 6 tours texte.
- **Rien n'a été ajouté à un prompt.** `FORBIDDEN_PLAN_DELIVERY_PHRASES` et
  `FORBIDDEN_SELF_BLAME_LABELS` ne sont consommées que par des **validateurs**
  (`grep` : `visible_agent.ts:73` et `weight_divergence_buttons.ts:305`, aucun
  site de construction de prompt). Le prompt visible lit `DO_NOT_SAY`
  (`reducer.ts:145`), **non modifié**.
- Mesure de contrôle après le lot, tour compagnon normal :
  **`full_chars = 26 730`** — contre la référence de 28 476 et la marge de
  3 524, **rien n'a bougé du mauvais côté**.

---

## ⑨ Tableau des tests

### Unitaires — `weight_divergence_buttons_test.ts`, 17 tests, **17 verts**

| Test | Verdict | Preuve |
|---|---|---|
| aller-retour exact sur les 15 identifiants | ✅ | `readDivergenceReply(builder(x)) === x`, pour les 2 branches, 7 catégories, 6 moments |
| l'ensemble tapable = l'ensemble fermé moins `named_spot` et `other` | ✅ | comparé à `WEIGHT_DIVERGENCE_CATEGORIES` |
| le dépliage nomme **tous** les moments du contrat | ✅ | compté sur `WEIGHT_DIVERGENCE_SLOTS.length`, pas sur une constante locale |
| ouverture + circonstance atteignent toutes les catégories tapables | ✅ | FR **et** EN |
| **les libellés RÉELS passent la ceinture** (cas qui passe) | ✅ | 15 libellés + 2 accusés + 2 propositions + tout le pack, ×2 langues |
| la ceinture mord, 6 familles × FR/EN | ✅ | 15 phrases, chacune avec sa `ruleId` attendue |
| la négation ne blanchit pas | ✅ | « je ne dis pas que c'est un manque de discipline » refusé |
| la ceinture **ne mord pas** sur des circonstances légitimes | ✅ | 8 formulations, dont « Le soir », « Je mange dehors le midi » |
| `banNumbers` est requis et change le verdict | ✅ | `{ok:false, reason:"carries_a_number", detail:"3"}` |
| charges malformées ⇒ `none` | ✅ | 16 charges : vide, tronquée, 4 segments, UUID cassé, `other`, `named_spot`, jeton inventé, mauvais verbe, mauvais préfixe |
| une charge citant un autre épisode **parse** (l'appartenance est au tap) | ✅ | documenté : valider une forme ≠ valider un état |
| un constructeur refuse de forger sans UUID | ✅ | throw sur 4 entrées |
| les **cinq** vocabulaires ne se croisent pas | ✅ | préfixes deux à deux |
| plancher de restriction ⇒ **aucun** bouton (3 constructeurs) | ✅ | `null` ×6 |
| les deux packs ont la même forme | ✅ | mêmes clés, 5 boutons d'ouverture |
| toute famille déterministe est couverte par la garde de charge illisible | ✅ | `DETERMINISTIC_BUTTON_PREFIXES` vérifiée contre les 5 |

**Preuve que ces tests peuvent échouer (mutation, rule 11)** : label FR
`evening: "Le soir"` → `"Je craque le soir"` **et** retrait de `life_factor` de
`TAPPABLE_CATEGORIES` ⇒ **3 tests tombent** (couverture, dépliage, ceinture) ;
après revert, 17/17. Exécuté, pas supposé.

### Suite complète

`env -u SUPABASE_* deno test --allow-read --allow-env --no-check
supabase/functions/_shared/keel/ _shared/chat/ sophia-brain/skills/weight_divergence/`
→ **2 696 passed, 0 failed, 17 ignored**.
Agent-gate (typecheck front complet + suite keel) **vert sur les 3 commits**.
`npx tsc -b` → **0**.

### En conditions réelles — 15 personas, base locale, vrai modèle

| Niveau | Scénario | Verdict | Preuve (base) |
|---|---|---|---|
| easy | ouverture FR : question + 5 boutons | ✅ ×3 | `chat_messages.metadata.buttons` = 5 charges `KEEL_WDIV_*`, `episode.state='proposed'`, log `opening_buttons:5` |
| easy | ouverture EN | ✅ ×3 | « If you're eating what's planned… » + 5 libellés EN |
| easy | dépliage `where` — **n'écrit rien** | ✅ ×3 | « D'accord. À quel moment de la journée ? » + **6** boutons ; `state='proposed'`, `turn_count=0`, `category=null` |
| medium | moment `afternoon` ⇒ proposition durable | ✅ ×3 | `category='named_spot'`, `state='in_flow'`, `turn_count=1` ; `student_daily_recommendations` : ligne `add_afternoon_snack` `proposed` |
| medium | « Oui, on l'ajoute » (canal FF-028) | ✅ ×3 | proposition `accepted` + `applied_at`; épisode **`acted`** + `closed_at`, `turn_count=2` ; **`student_goals.practical_constraints.eating_rhythm` = `["breakfast","lunch","dinner",{"slot":"snack_pm"}]`** ⇒ **T6 prouvé** |
| medium | `declined` (EN) — R10 | ✅ ×3 | `state='declined'`, `category='declined'` ; réponse = repli EN gelé « Understood — I'll leave it there. » |
| medium | `not_a_divergence` (FR) — R5 | ✅ | `state='nothing_to_change'` |
| hard | **texte libre survit** avec boutons attachés | ✅ | « j'ai commencé un traitement pour la thyroïde » ⇒ `category='medical'`, `state='nothing_to_change'` |
| hard | épisode **périmé** (ouvert J-5, plafond 2) | ✅ | tap ⇒ `state='expired'`, `turn_count=0` inchangé, « Celui-là n'est plus d'actualité — rien n'a été enregistré. » |
| extra-hard | **double tap** sur épisode clos | ✅ | accusé périmé, `turn_count` **inchangé (1)**, aucune seconde écriture |
| extra-hard | **charge forgée citant l'épisode d'un AUTRE élève** | ✅ | cible **strictement identique** avant/après (`state`, `category`, `turn_count`) ; accusé indistinguable de « épisode clos » — aucun oracle |
| extra-hard | charge **tronquée** `…\|<uuid>\|` | ✅ (après RED-2) | accusé périmé ; **avant le correctif** : le modèle répondait par une leçon de nutrition |
| extra-hard | jeton **hors liste** (`other`) | ✅ (après RED-2) | accusé périmé ; **avant** : promesse d'un canal 1:1 coach |
| — | FF-028 : rythme non déclaré ⇒ application impossible | ⚠️ **RED-3** | voir ci-dessous |
| — | ack FF-028 en anglais pour un élève FR | ⚠️ **RED-4** | voir ci-dessous |

---

## ⑩ Revue adversariale — hypothèses écrites AVANT le run

| # | Hypothèse | Sort |
|---|---|---|
| H1 | *Le double tap avance l'épisode deux fois.* | **RÉFUTÉE.** L'épisode n'est plus vivant ⇒ `loadLiveEpisode` rend `null` ⇒ accusé périmé. `turn_count` inchangé. L'idempotence n'a pas de compteur : elle vient de l'index unique partiel. |
| H2 | *Une charge citant l'épisode d'un autre élève fait fuir ou écrit chez lui.* | **RÉFUTÉE, structurellement.** L'épisode est chargé par `user_id` (le porteur du JWT) puis comparé à la charge. La ligne cible est bit-pour-bit identique après. |
| H3 | *Une charge tronquée vise un défaut (le piège `Number("")`).* | **PARTIELLEMENT CONFIRMÉE — et pire que prévu.** Elle ne visait rien dans FF-056, mais elle **retombait au dispatcher** et devenait une phrase pour le modèle. ⇒ RED-2, corrigé. |
| H4 | *Un jeton hors liste fermée (`other`) ouvre une branche.* | **Même chose que H3.** Le lecteur refusait bien, mais le tour finissait au modèle. ⇒ RED-2, corrigé. |
| H5 | *Un tap sur un épisode périmé avance quand même.* | **RÉFUTÉE.** Refusé au tap (`WEIGHT_DIVERGENCE_OPEN_FOR_DAYS`), épisode clos en `expired`, et la personne le sait **en une phrase**. |
| H6 | *Le chemin texte libre est cassé par les boutons.* | **RÉFUTÉE.** `medical` obtenu d'une phrase libre sur une bulle qui portait 5 boutons. |
| H7 | *Les libellés se lisent comme un interrogatoire.* | **Traitée, pas éliminée.** Lus à voix haute FR et EN ; aucun ne prend la personne pour sujet d'un verbe de faute. Une ceinture neuve (`FORBIDDEN_SELF_BLAME_LABELS`) l'arme sur le texte exact. **Ça reste un jugement humain** : la formulation est à relire par un humain avant prod. |
| H8 | *Le sapin de Noël.* | **BORNÉ, par lecture de code.** `DAILY_ASK_BUDGET = 1` : la question de divergence **exclut** le jour même l'invitation photo, la question de précision, la recommandation ET la question de pratique. `DAILY_UNSOLICITED_CAP = 2`, et le message du soir (qui porte la bande FF-058 + le pouls) est `GUARANTEED` donc **réserve** son créneau. Le pire soir = **2 bulles** : le message du soir avec sa bande, et la question de divergence avec ses 5 boutons. Un soir de divergence est donc **moins** chargé qu'un soir de recommandation. **Non rejoué en run complet** — voir « ce qui reste ouvert ». |
| H9 | *Le plancher TCA n'est pas évalué sur le tap.* | **RÉFUTÉE par construction** : `evaluateRestrictionForStudent` est appelé à **chaque** tap, et une lecture qui échoue remonte comme **plancher armé**. Non exercé en run réel (aucune fixture sous plancher). |

---

## Les REDs

### RED-1 — `FORBIDDEN_PLAN_DELIVERY_PHRASES` exigeait un pronom · **CORRIGÉ** (`58bbb365`)

Mesuré : 3 personas identiques, la même phrase, chemin texte. **Les trois
réponses ont passé le validateur**, et **deux** annonçaient une semaine
fabriquée par un tiers :

- « ça guidera la prochaine semaine **qu'on construit** »
- « ce point comptera dans **ce que je prépare** pour la semaine prochaine »

Toutes les locutions de la liste exigeaient un pronom objet (« je **te**
prépare ») ou un possessif (« **ta** semaine »). Sans lui, la même promesse
sortait — et c'est la formulation **naturelle** du modèle. 9 locutions ajoutées
(FR+EN), avec leur cas mordant **et** le cas passant (« je construirai autour »,
repli gelé de `point_to_plan_fit`, doit survivre).

### RED-2 — une charge de bouton cassée redevenait une phrase · **CORRIGÉ** (`5ee3a6d1`)

Voir H3/H4. Le tour finissait chez le modèle, qui a répondu une fois en
**spéculant sur des causes** (« the usual reasons are: the portion is too large,
the food is too dry/dense, you're eating too fast… ») — ce que FF-056 existe pour
ne jamais faire — et une fois en **promettant un canal 1:1 coach→élève**
(« Your question is with them now »), qui n'existe pas (`docs/keel/MODEL.md`).
Le défaut touchait **les cinq familles**, pas seulement la mienne.
Correctif : une charge portant un préfixe déterministe connu et illisible ne
descend plus au dispatcher — le précédent (`weekly_flow_unusable_token`) était
déjà dans le même fichier, quinze lignes plus haut.

### RED-3 — FF-028 propose une action que sa propre écriture refuse · **NON CORRIGÉ**

`buildActionSpace` est nourri par `rhythm.effective`
(`daily_recommendation_io.ts:111`), qui **retombe sur `DEFAULT_EATING_RHYTHM`
quand rien n'est déclaré**. Mais l'écrivain
`keel_add_eating_rhythm_slot` **refuse d'écrire** si
`student_goals.practical_constraints->'eating_rhythm'` est absent ou vide
(`return null`).

Conséquence mesurée, 3 fois sur 3 : le tap « Oui, on l'ajoute » rend
`slot snack_pm absent after write (declared=none)` et la personne lit
« Something went wrong on my side and I couldn't save that ».

**Le produit s'est bien comporté** — il n'a pas menti, il a relâché la
réclamation, la proposition est retournée à `proposed`. Mais un élève qui n'a
jamais déclaré de rythme **ne peut jamais accepter une recommandation**, ni par
FF-056 ni par la porte du soir de FF-028.
Fichiers : `_shared/keel/daily_recommendation.ts:348`,
`_shared/keel/daily_recommendation_io.ts:111` et `:513` — **antérieurs à ce lot,
non touchés par moi**. La décision (« matérialiser le défaut à la première
écriture » vs « ne proposer qu'aux élèves ayant déclaré ») est un arbitrage
FF-028, pas FF-056.

### RED-4 — l'accusé FF-028 est anglais pour un élève francophone · **NON CORRIGÉ**

`RECOMMENDATION_ACTIONS[*].appliedAck` / `declinedAck` sont des littéraux
**anglais uniquement** (`daily_recommendation.ts:219`). Un élève `fr-FR` qui tape
« Oui, on l'ajoute » lit « Done — an afternoon snack is part of your rhythm now… ».
**Antérieur** (c'est déjà le cas par la porte du soir de FF-028), mais **exposé
sur un chemin de plus** par ce lot. La proposition elle-même, elle, est bien
bilingue (littéral FF-056).

### RED-5 — l'anthropomorphisme du plan survit sur le chemin texte · **NON CORRIGÉ, délibérément**

3 réponses sur 3 : « Le plan **l'a noté** », « Le plan **en tient compte** ».

**Décision — ne pas armer de matcher anti-anthropomorphisme.**
**Pourquoi** — R2 **exige** que le plan soit le sujet de la phrase (« c'est le
plan qui doit bouger, pas toi »). Distinguer « le plan doit bouger » (requis) de
« le plan l'a noté » (interdit) par des locutions produirait des faux positifs
sur les replis gelés eux-mêmes, et une garde qui bloque tout ressemble à une
garde qui marche.
**Options rejetées** — (a) *interdire « le plan » + verbe cognitif* : liste
ouverte, faux positifs garantis ; (b) *durcir le prompt* : « une règle de prompt
n'est pas une ceinture », déjà écrit dans le reducer.
**Réversibilité** — n/a : rien n'a été fait. Sur le chemin **bouton**, le défaut
est mort par construction, ce qui est le vrai correctif.

### RED-7 — le 4e commit (ce rapport) est BLOQUÉ par un rouge qui n'est pas le mien

`agent-gate` refuse le commit du rapport sur **19 erreurs de typecheck** dans
`_shared/keel/household_merge_test.ts` (`Property 'gaps' is missing`, appels à
`buildMergeBlock`). **Ce ne sont pas mes fichiers** :

- `git show --stat` de mes trois commits ne liste que : `deterministic_buttons.ts`,
  `weight_divergence_tap.ts`, `weight_divergence_buttons.ts`,
  `weight_divergence_buttons_test.ts`, `weight_divergence_engine.ts`,
  `contract.ts`, `weight_divergence_test.ts`. Aucun `household_*`.
- `household_merge.ts` et `household_merge_test.ts` sont `M` dans l'arbre de
  travail, dernier commit `a0982d4f` — **une session parallèle est en cours
  d'édition dessus**.
- Reproduit isolément, sans aucun de mes fichiers :
  `deno check supabase/functions/_shared/keel/household_merge_test.ts` → **10
  erreurs**.

**Réessayé une fois**, toujours rouge (rule 5). **Je ne les répare pas.**
Le rapport et les six scripts de run réel sont **stagés** (`git status` → `A`)
et attendent que la session voisine finisse. Commande pour l'humain, une fois
son rouge parti :

```bash
git commit -m "rapport FF-056 boutons"   # les fichiers sont deja stages
```

Mes trois commits de code, eux, sont **passés** — le gate était vert au moment
où ils ont été posés (`test count ok (5217 >= 5111)` puis `5225`).

### RED-6 — le runtime edge a redémarré seul pendant un tour texte

Un `502` Kong sans corps, container `Up 5 seconds`. Retenté une fois après
`local_extend_kong_functions_timeout.sh` : `200` en 9,9 s. **Consigné, pas
poursuivi** — d'autres sessions travaillent sur la même pile.

---

## L'audit des `as never` sur clients Supabase (demandé par ③.1)

`run.ts` porte **18** `as never`, dont **10** sur un client Supabase :

| Ligne | Appel | Lecture/écriture | Verdict |
|---|---|---|---|
| 1338 | `loadKeelPlanContextSnapshot(args.supabase as never, …)` | lecture | inoffensif |
| 1362 | `evaluateRestrictionForStudent(args.supabase as never, …)` | lecture | inoffensif |
| 1412 / 2212 | `loadStudentSafetyConstraints(args.supabase as never, …)` | lecture | inoffensif |
| 1516 | `loadHouseholdTurnSafety(args.supabase as never, …)` | lecture | inoffensif |
| 4634 | `evaluateRestrictionForStudent(supabase as never, …)` | lecture | inoffensif |
| **6704** | `escalateRestrictionSignal(supabase as never, …)` | **ÉCRITURE** (`contract_change_requests`) | **vérifié SAIN** : `has_table_privilege('authenticated','contract_change_requests','INSERT') = t`, policy `contract_change_requests_owner_insert`. Le client de l'élève a le droit. |
| **4926** | `loadLiveEpisode(supabase as never, userId)` | lecture | **le jumeau de la faute FF-056**, du bon côté : lecture, et `authenticated` a `SELECT`. Le cast reste un désarmement de typecheck. |
| **6878** | `loadRhythm(supabase as never, userId)` | lecture | idem |
| 6993 | `state: advance.state as never` | — | cast de valeur, pas de client |

**Aucune autre écriture n'est faite avec le client de l'élève.** Les deux casts
de client survivants (4926, 6878) sont des **lectures** et ne cassent rien
aujourd'hui ; ils restent le mécanisme exact qui avait caché la faute.
**Non corrigés** : ils sont dans `run.ts`, hors du périmètre de ce lot, et les
retirer demande de retyper les signatures de `weight_divergence_io.ts` et
`daily_recommendation_io.ts` (`Db = any`) — un chantier à part, à faire d'un
coup, pas à moitié.

---

## Ce qui reste ouvert

1. **RED-3** (FF-028 : rythme effectif ≠ rythme écrivable) — le plus impactant.
2. **RED-4** (acks FF-028 monolingues anglais).
3. **RED-5** (anthropomorphisme du plan sur le chemin texte).
4. **Les `as never` de `run.ts:4926` et `:6878`** — inoffensifs aujourd'hui,
   mécanisme de la faute d'hier.
5. **Le sapin de Noël n'a pas été rejoué en run complet** (bande du soir + pouls
   + pratique + divergence le même soir). Borné par lecture de code (H8), pas
   par observation.
6. **Le plancher TCA sur le tap n'a pas été exercé en run réel** (aucune fixture
   sous `restriction_flag`). Le code est armé et testé unitairement.
7. **La lecture humaine des libellés.** H7 est un jugement, pas une mesure.
8. **`observation_ends_on` n'a aucun consommateur** : la fenêtre d'observation
   s'ouvre (`unknown` ⇒ dates écrites) mais aucun balayage ne la ferme ni ne
   « recale le plan ». Antérieur au lot, non vérifié en profondeur ici.

---

## Commandes pour l'humain

```bash
# La suite (environnement PURGÉ, sinon 114 faux rouges)
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env --no-check \
  supabase/functions/_shared/keel/ supabase/functions/_shared/chat/ \
  supabase/functions/sophia-brain/skills/weight_divergence/

# Le typecheck front
cd frontend && npx tsc -b

# Les droits de la table (la faute FF-056, prouvée)
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c \
  "select has_table_privilege('authenticated','public.student_weight_divergence_episodes','INSERT'),
          has_table_privilege('authenticated','public.student_weight_divergence_episodes','SELECT'),
          has_table_privilege('anon','public.student_weight_divergence_episodes','SELECT');"

# Rejouer un run réel de bout en bout (le runtime doit être frais)
docker restart supabase_edge_runtime_Sophia_2 && sleep 8
./scripts/local_extend_kong_functions_timeout.sh
source scratchpad/qa056b_env.sh
deno run -A scratchpad/qa056b_setup.ts 3 fr-FR B         # 3 personas + épisode + 5 boutons
deno run -A scratchpad/qa056b_measure.ts tap qa056b_personas_B.json "KEEL_WDIV_STEP where"
deno run -A scratchpad/qa056b_measure.ts tap qa056b_personas_B.json "KEEL_WDIV_SPOT afternoon"
deno run -A scratchpad/qa056b_accept.ts  qa056b_personas_B.json ACCEPT
deno run -A scratchpad/qa056b_adversarial.ts qa056b_personas_B.json
deno run -A scratchpad/qa056b_cleanup.ts
```

⚠️ **N'appelle jamais `keel-daily-recommendation-v1`** : il balaie la flotte au
curseur et ouvrirait des épisodes chez les fixtures des autres sessions.

⚠️ **Avant d'accepter une proposition FF-028 sur une fixture**, déclarer un
rythme (RED-3) :

```sql
update student_goals
   set practical_constraints = coalesce(practical_constraints,'{}'::jsonb)
       || '{"eating_rhythm":["breakfast","lunch","dinner"]}'::jsonb
 where user_id = '<uuid>';
```

Aucune migration n'a été créée par ce lot. `ls supabase/migrations/*.sql |
cut -d_ -f1 | sort | uniq -d` → **vide**, avant et après.
