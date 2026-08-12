# AUDIT-SITE — l'état mesuré avant la refonte

> **Date** 2026-08-12 · **Branche** `ff-001-quotidien-du-coach` · **Auteur** orchestrateur
>
> Ce document est **l'héritage des six constructeurs**. Ils ne re-vérifient rien : ils
> consomment ce tableau. Un fait absent d'ici n'entre pas dans une page.
>
> ⚠️ **Trois briefs du MASTER citent des preuves qui sont FAUSSES.** Voir §5. C'est la
> découverte la plus importante de cette phase : appliqué tel quel, le MASTER faisait
> écrire trois promesses que le produit ne tient pas.

---

## 1. Le poids — la baseline à écraser

| Page | Lignes | Blocs `<p>` | `<svg>` | Appels `t()` | Clés i18n |
|---|---|---|---|---|---|
| `/` `LandingPage.tsx` | 979 | 28 | **0** | 110 | 117 |
| `/gyms` `GymsLandingPage.tsx` | 1041 | 29 | **0** | 121 | 135 |
| `/communities` `CommunitiesPage.tsx` | 1007 | 33 | **0** | 137 | 143 |
| **Total** | **3027** | **90** | **0** | 368 | 395 |

**Zéro SVG sur 3027 lignes.** Le diagnostic du propriétaire est confirmé au comptage :
il n'y a pas « peu » d'illustrations, il n'y en a **aucune**. Les seuls éléments non
textuels sont des maquettes en `<div>` (le panneau du lundi, la fausse conversation),
qui sont elles-mêmes du texte dans des boîtes.

**La barre de la refonte (MASTER §5.5)** : chaque page refondue fait **≤ 490 lignes** et
porte **plus de figures que les trois anciennes n'en avaient en tout** — c'est-à-dire
plus de zéro, ce qui est une barre absurdement basse. La vraie barre : **une figure par
section**, et le test titres+figures qui passe.

---

## 2. Les primitives réutilisables

| Primitive | Fichier | Ce qu'elle fait | Verdict refonte |
|---|---|---|---|
| `Kicker` | `ui/Marketing.tsx:24` | eyebrow capitales, `text-gray-500` | **à re-styler** (charte) |
| `SectionTitle` | `ui/Marketing.tsx:33` | `<h2>` 2xl/3xl `text-balance` | **à re-styler** |
| `PriceCard` | `ui/Marketing.tsx:49` | prix / période / une ligne. Pas de liste de features, pas de 2e carte — **délibéré** | **garder la règle**, re-styler |
| `Button` / `ButtonLink` | `ui/Button.tsx` | variants `primary` `secondary` `ghost` | garder |
| `Card` | `ui/Card.tsx` | conteneur bordé | garder |
| `SEO` | `components/SEO.tsx` | title/description/structuredData. ⚠️ `structuredData` est en dépendance de `useEffect` → **hisser le littéral hors du render** | garder, discipline à respecter |
| `PublicHeader` / `PublicFooter` | `keel/components/PublicHeader.tsx` | en-tête collant + portes de vente | **à refondre** (§4) |
| `LocaleSwitch` | `keel/components/LocaleSwitch.tsx` | EN/FR, ~52px | garder tel quel |
| `legalEntity.ts` | `lib/legalEntity.ts` | IKIZEN SAS, source unique du bloc Organization | **ne pas dupliquer** |
| `ServerUnreachable` | `keel/components/ServerUnreachable.tsx` | écran backend injoignable | garder sur `/` et `/pro` |

**Règle conservée :** rien de spécifique à une page n'entre dans `Marketing.tsx`. Les
maquettes restent locales à leur page — une maquette partagée change de sens sur deux
pages quand on en édite une.

---

## 3. Le mécanisme i18n — ce qu'il impose

- `PUBLIC_NAMESPACES` (`i18n/catalog.ts:34`) = `landing`, `public`, `brand`, `auth`.
  Le type `PublicMessages` en dérive ; **`fr.public.ts` ne compile pas s'il manque une clé**.
- `PUBLIC_NAMESPACES_PENDING_TRANSLATION` (`:54`) = `gyms`, `communities`, `start`,
  `join`, `invite`, `household_claim`. **Ce chantier retire `gyms` et `communities`** et
  n'ajoute **aucun** nouveau namespace de vente à cette liste.
- `parity.int.test.ts` garde en plus : zéro clé FR orpheline, mêmes trous
  d'interpolation (`{name}`) des deux côtés.
- Un namespace par page, **jamais de clé partagée** — même texte ⇒ deux clés.

**Namespaces de la cible :** `mealprep`, `couples`, `families`, `coaches`, `gyms`,
`communities`, `hub` (pour `/`), `pro` (pour `/pro`). `landing` disparaît comme
namespace de page (son contenu déménage vers `coaches`).

---

## 4. Les pièges de l'en-tête mobile — **mesurés**, pas supposés

Repris de `PublicHeader.tsx:33-48` et `:167-176`. La refonte **hérite** de ces mesures.

1. **Le bloc de droite fait 275 px déconnecté** (`Legal` + `Sign in` + bouton d'essai).
   Sur un téléphone de 390 px, il ne reste **13 px** au nom de page posé à côté du mot
   de marque — c'est-à-dire une ellipse sur tous les téléphones du marché.
2. **D'où l'empilement** : nom de page **sous** la marque, pas à côté. Le bloc de gauche
   prend alors la largeur du plus large des deux, pas leur somme. 18 px de marque + 11 px
   de libellé tiennent dans les 56 px de hauteur d'en-tête.
3. **Casse normale, pas de `tracking-wider`** : « Communities » en capitales espacées
   réclame 88 px là où le bloc de gauche en reçoit 71. En casse normale : 62 px.
4. **`Legal` masqué sous `sm`** — arbitrage assumé, pas un oubli. C'est le seul des trois
   qu'on peut rendre : il est dans le pied de page de toutes les pages publiques.
5. **`LocaleSwitch` avant les portes commerciales** : un visiteur qui ne lit pas la page
   n'ira pas chercher un sélecteur après le bouton d'essai.
6. `useLocation`, jamais `window.location` : sous React Router la porte « courante »
   resterait celle de l'arrivée pour toute la session.
7. Comparaison **exacte** du pathname : un `startsWith` ferait de `/` la porte active de
   toutes les autres.

⚠️ **Le nouvel en-tête porte un élément de plus** (l'interrupteur des deux mondes). Le
budget de 275 px est donc **dépassé** si on l'ajoute naïvement. Décision §6.

---

## 5. ⚠️ LES TROIS BRIEFS DU MASTER À CORRIGER

Le MASTER liste, comme preuves à écrire, trois mécanismes que le code **ne fait pas**.
Chacun aurait produit une page qui ment.

### 5.1 `/meal-prep` — « le swap en cours de semaine » : **FAUX**

Le MASTER (Agent 1) cite « le swap en cours de semaine » comme preuve.
`REALIGNMENT_ACTIONS` (`_shared/keel/accident.ts:995-1004`) contient exactement :
`shift_dish` · `no_cook` · `shift_session` · `nothing_to_change`. **Aucun « remplacer ».**
`accident.ts:52-55` l'écrit : *« aucune fonction d'ici ne choisit un plat »*. Le seul vrai
résolveur d'échange (`sophia-brain/skills/plan_question/swap_resolver.ts`) est gaté
`keel_student`, porte sur des `plan_commitments` de coach, et **répond sans réécrire**.
FF-057 est encore 🟡 Spécifiée.

> **Ce que l'agent 1 écrit à la place :** *décaler un plat, décaler une session, ou
> déclarer qu'on ne cuisine pas ce soir* — trois gestes qui existent, par boutons de chat
> (`_shared/chat/deterministic_buttons.ts`). C'est un argument plus honnête **et plus
> fort** pour un meal-prepper : la semaine encaisse l'imprévu sans être refaite.

### 5.2 `/families` — « le conseil de famille » : **MORT**

Le MASTER (Agent 3) cite « le conseil de famille (chacun dit son envie de la semaine, le
plan arbitre et **dit ce qu'il a arbitré**) ». FF-050 §3 dit textuellement :
**« ❌ Aucune récolte par membre · ❌ Aucun arbitrage en code »**. Ce qui existe :
**une seule ligne d'envie, écrite par le maître seul** (`keel_household_submit_envy`,
refus `not_owner`), lue par le générateur (`generate-household-meal-v1/index.ts:1579`).
Et `index.ts:3088-3092` **ne rend délibérément pas** `envy_line_used` : l'arbitrage
n'est **jamais** restitué à l'écran.

> **Ce que l'agent 3 écrit à la place :** *« vous écrivez ce dont la maison a envie cette
> semaine, en une ligne, et le plan compose avec »*. Le rituel collectif est un horizon
> (PIVOT-FOYER §8), pas une fonctionnalité — il ne se vend pas.

### 5.3 `/couples` — « la bifurcation des portions » : **PARTIEL, à formuler au mot près**

Le mécanisme existe et il est réel : `SERVING_DIRECTION` sur 6 objectifs
(`household_portions.ts:125`), `buildPortionBrief` (`:480`), tronc commun = MIN et
`deltas` en grammes (`household_composition.ts:418`).
**Mais ce qui atteint l'écran est une PHRASE, pas un chiffre** — « une part généreuse de
légumes » — sur `/app/household` uniquement (`HouseholdPage.tsx:1838-1855`). Les grammes
calculés (`member_deltas`) **n'ont aucun écran** : FF-043 §11 n°1 le dit mot pour mot.
`/app/plan` n'affiche **jamais** les portions.

> **Ce que l'agent 2 écrit :** la figure centrale (un plat, deux assiettes) est annotée
> **en mots**, jamais en grammes. La promesse est *« une casserole, deux parts décrites
> pour deux directions »*, pas *« 180 g pour lui, 120 g pour elle »*.
> ⚠️ Et rien ne **vérifie** que le modèle a différencié : `reconcilePortions` accepte
> quatre consignes identiques sans lever une `issue`. Donc **pas de « garanti »**.

---

## 6. Le tableau des faits — B2C

`VRAI` = livré et vérifié dans le code · `PARTIEL` = existe avec un trou nommé ·
`FAUX` = le produit ne le fait pas.

| # | Fait | Verdict | Ancre |
|---|---|---|---|
| C1 | 12,99 €/mois le foyer + 2 €/profil réclamé ; maître jamais compté ; plafond 8 bouches | **VRAI (règle)** | `20260810260000_household_billable_profiles.sql:235-250` · `:101-105` (plafond 8) · `stripe-create-checkout-session:451-471` |
| C2 | Le prix est **encaissable aujourd'hui** | **FAUX** | `stripe-create-checkout-session:131-136` → 500 « Missing env var ». Les prix Stripe n'existent pas. **Voir §8 n°1** |
| C3 | La **session de cuisine** est l'unité du plan (pas le plat) | **VRAI** | `_shared/keel/meal_generation.ts:518` `interface CookingSession` · colonne `student_generated_meals.cooking_sessions` · rendu `components/CookingSessions.tsx:48`, `KitchenToday.tsx:281` |
| C4 | Portions par objectif, même plat, directions divergentes | **PARTIEL** — phrase, pas grammes ; `/app/household` seulement | `household_portions.ts:125,480` · `household_composition.ts:418` · `HouseholdPage.tsx:1838-1855` · **trou** FF-043 §11 n°1 |
| C5 | Courses en **vagues** suivant la fraîcheur, `MAX_FRIDGE_DAYS = 3` | **VRAI, avec réserve** — dérivé à la lecture par le front ; masqué s'il n'y a qu'une vague | `meal_generation.ts:693` · `grocery_waves.ts:211` · `ShoppingListPanel.tsx:137-149` |
| C6 | Échanger un plat en cours de semaine | **FAUX** | `accident.ts:995-1004` — voir §5.1 |
| C7 | Décaler un plat / une session / ne pas cuisiner ce soir | **VRAI** | `accident.ts:995-1004` `REALIGNMENT_ACTIONS` · `_shared/chat/deterministic_buttons.ts` |
| C8 | **Bouches sans compte** : les enfants sont dans le plan, sans compte ni écran | **VRAI** | FF-044 🟢 · `20260810260000:179-190` (`user_id = null`) · `household_portions.ts:63-72` (clé = `memberId`) |
| C9 | L'allergie d'**une** bouche gouverne toute la casserole, **fail-closed** | **VRAI + trou nommé** | `generate-household-meal-v1:1643-1648,1674-1680` → **503 `safety_constraints_unreadable`** · union `household_safety.ts:201`. **Trou** : `run.ts:2211` (`plan_question` recharge sans l'union foyer) = FF-046 §7 trou n°8 |
| C10 | Un **mineur** n'est jamais une cible nutritionnelle | **VRAI** | `student_age.ts:199-202` `weekPlanAgeGate` · `generate-week-plan-v1:435-457` (409 `minor_student`) · `household.ts:115-121` `goalApplies` · `energy_gate.ts:239` |
| C11 | Conseil de famille : récolte par membre + arbitrage restitué | **FAUX** | FF-050 §3 — voir §5.2 |
| C12 | Une ligne d'**envie de la semaine**, écrite par le maître, lue par le générateur | **VRAI** | `keel_household_submit_envy` · `generate-household-meal-v1:1579-1589` · `HouseholdPage.tsx:1468` `EnvyCard` |
| C13 | Le parcours d'entrée a **trois branches** : `solo` · `pair` · `family` | **VRAI** | `frontend/src/keel/api/onboarding.ts:84` `FunnelBranch` · route `/app/setup` (`App.tsx:220`) |
| C14 | Ajouter une bouche est rapide (le MASTER dit « 90 secondes ») | **NON PROUVÉ** | Aucune mesure dans le dépôt. **Ne pas chiffrer.** Dire ce qu'on demande : prénom, date de naissance, objectif, allergies (`onboarding.ts:650-662`) |
| C15 | Calories : « jamais de chiffres » | **FAUX — le produit en affiche** | `plan/EnergyReadout.tsx:42-45` (`{n} kcal`) sur `/app/plan` et `/app/today`. **MAIS** `profiles.energy_display_enabled` **default false** (`20260812230000:60`) + chaîne de 5 gardes (`energy_gate.ts:228-249`) |
| C16 | Suivi de poids d'une bouche du foyer (courbe, tendance) | **FAUX** | `household_member_bodies` = **une ligne écrasée**, ni date ni série (`20260812220000:118`). Aucune courbe nulle part |
| C17 | App mobile native · intégration Skool/Circle/Discord/Kajabi | **FAUX (absence confirmée)** | Web Vite/React seul ; aucun `capacitor.config`/`app.json`/`android/` · zéro référence plateforme |

---

## 7. Le tableau des faits — B2B

| # | Fait | Verdict | Ancre |
|---|---|---|---|
| B1 | **7 €/élève/mois**, pas de forfait plateforme | **VRAI (structure)** · **le nombre n'est nulle part en code** | `stripe-create-checkout-session:120-125,443-450` (`legacyTierPriceId = null`) · le montant vit dans `STRIPE_PRICE_ID_COACH_SEAT_MONTHLY` |
| B2 | « 6 € quand **l'élève** a payé son année » | **FAUX** | L'intervalle est celui **du coach** : `stripe-create-checkout-session:124-125` lit `body.interval`, posé par les boutons du coach (`CoachBillingPage.tsx:255-274`). ⚠️ La même erreur est **dans le produit payant** (`CoachBillingPage.tsx:93-94`) et sur `/gyms` (`en.ts:2438`). `/communities` (`en.ts:2814`) le dit **correctement** |
| B3 | « 6 € pour un **siège** payé à l'année » | **VRAI** | même ancre, formulation correcte |
| B4 | On arrête de payer le mois où on éteint un siège | **VRAI** | `stripe-reconcile-seats:18-35` (recalcul, jamais incrément, depuis `keel_coach_seat_ledger`) |
| B5 | Essai **14 jours, 3 élèves max**, puis ça s'arrête | **VRAI** | `20260727235000_keel_billing_seats.sql:110-136,493-546` · solvabilité `:236-257` |
| B6 | « positif dès le premier élève » | **EXAGÉRÉ** | Vrai structurellement, mais un coach à **zéro** élève est refusé au checkout : `no_billable_seat` (`stripe-create-checkout-session:443-449`) |
| B7 | **Verrou 1** — la doctrine est injectée « à chaque message » | **FAUX comme écrit** | `withKeelDoctrineBlock` a **un seul appelant**, le composeur (`run.ts:2348,7261`). Les lanes de skill (`plan_question`, `weight_divergence`, `safety_crisis`…) rendent **avant** et ne la lisent pas. Le dépôt l'écrit : `routers.ts:540-547` *« verrouillées sur une doctrine qu'elles n'ont jamais lue »* |
| B8 | **Verrou 2** — « chaque message sortant » est scanné contre les lignes rouges | **FAUX pour « chaque »** | `findDoctrineViolations` tourne sur 4 surfaces : chat (`keel_output_locks.ts:307`), repas (`meal_generation.ts:2441`), semaines (`week_plan_generation.ts:743`), reco du jour (`daily_recommendation.ts:520`). **Non scannés** : relance (`reengage_composer.ts:197-242`), récap du soir (`daily_recap_io.ts:394-458`), bilan du dimanche (`week_review_io.ts:781-846`), **broadcast coach** (`coach_broadcast.ts:22-27`, explicitement) |
| B8b | **Formulation tenable** de B7+B8 | — | *« votre méthode entre dans le chat, dans chaque semaine et dans chaque repas que Sophia rédige ; et ce qu'elle écrit dans le chat est relu contre vos lignes rouges avant d'être envoyé — sans modèle dans cette boucle »* |
| B9 | Chaque ligne rouge porte son **`instead`**, dans les mots du coach, signé de son nom | **VRAI** | `keel_output_locks.ts:99-113` · `run.ts:2825-2834` |
| B10 | La doctrine atteint **4** points d'injection (chat, semaine, repas individuel, repas foyer) | **VRAI, et sous-vendu** | `run.ts:1441,2503` · `generate-week-plan-v1:338,541` · `generate-meal-v1:576,1038` · `generate-household-meal-v1:1602,2249` |
| B11 | **Le lundi en une page** — cron hebdo, texte rendu par gabarit, jamais narré par un modèle | **VRAI** | cron `'0 6 * * 1'` (`20260803090000_pivot_nutrition_crons.sql:90-116`) · `renderSynthesisText` pur (`coach_synthesis.ts:12-19,516-641`) · écran `CoachWeeklyPage.tsx` |
| B12 | Les phrases citées de la synthèse (« 34 students this week: 25 in touch, 6 slipping, 3 silent. ») | **VRAI, verbatim** | `coach_synthesis.ts:538-541,549-556` |
| B13 | « 21 of 34 **wrote** themselves a week » | **EXAGÉRÉ** — le moteur dit **« built »** | `coach_synthesis.ts:566-568`. La page prétend citer verbatim (`LandingPage.tsx:505-507`) : elle paraphrase |
| B14 | Seuils : répondu < 48 h · silencieux 48–120 h · muet ≥ 120 h | **VRAI** | `coach_synthesis.ts:64-65` (`CONTACT_SLIPPING_AFTER_HOURS = 48`, `CONTACT_SILENT_AFTER_HOURS = 120`), mesurés sur le dernier **entrant** |
| B15 | « Pas de score d'adhérence, pas de pourcentage » | **EXAGÉRÉ** — vrai en pratique, **vivant en code** | Le cron évaluateur est déprogrammé en 1:N (`20260803200000`), donc la valeur est nulle. Mais `coach_synthesis.ts:571-575` émet encore *« Average adherence on core lines: X% »* dès qu'une ligne existe, et `risk_band` atteint toujours l'écran (`CoachWeeklyPage.tsx:44`) |
| B16 | « Quelles parties de votre méthode vos membres tiennent, lesquelles ils lâchent, à quelle saison » | **FAUX** | Rien ne calcule ça. `source_belief_key` a **un seul lecteur** dans le front, et c'est la semaine de **l'élève** (`weekPlan.ts:36-37`). Idem, plus doux, `en.ts:2673-2675` |
| B17 | Cohortes **scopées** par coach (une salle ne voit que ses membres) | **VRAI** | `coach_synthesis_io.ts:171-187` (`coach_clients.coach_id = :coachId AND status = 'active'`) |
| B18 | « c'est **votre nom** sur les messages que vos membres lisent » | **FAUX** | L'agent s'appelle Sophia partout. Le nom du coach apparaît en **deux** endroits : la substitution du verrou 2 et le suffixe du broadcast. **Zéro personnalisation de marque** : aucune colonne, aucun écran, aucune chaîne |
| B19 | White-label / « sous votre marque » | **JAMAIS RÉCLAMÉ — le rester** | Aucune des trois pages ne le promet. B18 est ce qui s'en approche le plus, et il va déjà trop loin |
| B20 | Une salle à trois coachs = **un** compte coach | **VRAI (limite)** | La tenancy est `coach → coach_clients → student`. Pas d'entité salle, pas de roster multi-coach. **Ne jamais dériver vers « votre équipe »** |
| B21 | 3 jours de silence ⇒ **un** message, puis ça se tait | **VRAI** | `reengagement.ts:45` (`REENGAGE_AFTER_HOURS = 72`) · un par épisode (`:211-213`) + `REENGAGE_MIN_GAP_HOURS = 24*7` (`:53`) |
| B22 | Le soir, **un tap** dit comment la journée s'est passée ; **trois boutons** | **VRAI** | `daily_pulse.ts` `PulseLevel` · fenêtre 20 h–22 h (`PULSE_HOUR_LOCAL`) · un message/jour max (`:470`) |
| B23 | « **si c'était dur**, une relance — énergie, faim ou sommeil » | **EXAGÉRÉ** | `needsAxisFollowUp(level) = level !== "good"` (`daily_pulse.ts:190-192`) : la relance part **aussi sur « mitigé »** |
| B24 | Heures calmes 21 h–8 h — **elles ne couvrent que la relance** ; le tap du soir peut tomber à 21 h 50 | **VRAI** | `reengagement.ts:60-61`, appliqué dans `decideReengagement` seul ; `decideDailyPulse` a sa fenêtre 20–22 sans garde d'heures calmes |
| B25 | **Aucun canal 1:1** coach → élève | **VRAI, par design** | `docs/keel/MODEL.md:33-34`. ⚠️ Mais un canal **coach → cohorte** existe et ship avec une UI : `keel-coach-broadcast-v1` + `CoachBroadcastCard.tsx` (`en.ts:1254-1274`, un par semaine). C'est du **push**, donc l'absence d'inbox tient — mais MODEL.md (« ni table, ni fonction, ni écran ») est **périmé** |
| B26 | La **note 1:1** du coach : un champ, un élève, **1 500 caractères** ; utilisée, jamais citée ; incluse à l'export RGPD | **VRAI** | `coach_note.ts:53,112-129` · `account-export-v1:717,725` · `CoachNoteCard.tsx:159-160`. ⚠️ « jamais citée » est une **promesse de prompt** sans vérificateur déterministe (`coach_note.ts:126-128`) |
| B27 | La base **refuse** une ligne de semaine qui ne cite aucune conviction | **VRAI** | CHECK `student_week_plans_doctrine_traceable_check` (`20260803210000:87-113`). Portée : la **semaine** seulement (les plats ne citent pas, délibérément — `DishCard.tsx:27-34`) |
| B28 | Révision / rollback de doctrine sans perdre l'historique | **VRAI** | clé de cache = hash du contenu (`doctrine.ts:38-43`) · `rollback` copie N vers N+1 (`coach-doctrine-v1:1263`) |
| B29 | Précision photo : 2,3 % d'erreur moyenne vs USDA, 85 analyses, biais −26,6 %, IC90 couvre 58 % | **VRAI, les quatre** | `docs/keel/PHOTO_QUANTIFICATION.md:7-8,76,85-86,99` |
| B30 | Exemples chiffrés `/gyms` (37 membres × 25 € − 259 € = 666 €/mois) et `/communities` (150 × 12 € − 150 × 7 € = 750 €/mois) | **VRAI (arithmétique)**, étiquetés « exemple » | `en.ts:2233-2250` · `en.ts:2622-2623` |
| B31 | « nous n'avons pas de chiffre de rétention à vous vendre, et nous n'allons pas en inventer un » | **VRAI — la meilleure ligne des trois pages** | Rien dans le dépôt ne mesure le churn contre un témoin. **À conserver verbatim** |
| B32 | Les membres entrent par une **invitation e-mail** ; il n'existe pas de « copier le lien » | **VRAI** | `coach-invite-student-v1:5-32` (token minté serveur, seul le sha256 est stocké) · `InviteDialog.tsx:13-17` |
| B33 | Les membres ne se voient jamais entre eux — pas de fil, pas de salon, pas de commentaire | **VRAI tel qu'écrit** | Aucune surface sociale. ⚠️ `/app/household` **est** un espace partagé multi-personnes — mais c'est la famille, pas la communauté. **Ne pas élargir** en « personne ne partage jamais d'espace » |

---

## 8. Ce qu'AUCUNE des huit pages ne doit promettre

1. **« Essai 30 jours, puis 12,99 € »** — ou tout bouton d'achat foyer. Le tunnel rend
   **500** faute de prix Stripe (`stripe-create-checkout-session:131-136`), et
   `free_until` par défaut gèle tout foyer neuf à **J+31** (`20260811050000:96`) sans
   chemin pour se dégeler. **Le prix peut être dit** (c'est la décision produit, FF-049) ;
   **la date et le geste d'achat, non.**
2. **« Jamais de calories »** — faux depuis FF-059. `/communities` le dit encore
   (`en.ts:2771-2775`) : c'est le claim périmé n°1 à supprimer. Formulation tenable :
   *les chiffres sont éteints par défaut et quatre verrous décident si on peut les allumer.*
3. **« Chaque message est vérifié »** / **« la doctrine entre à chaque message »** — voir
   B7, B8. Utiliser la formulation B8b.
4. **« 6 € quand votre membre a payé son année »** — voir B2. Ne pas reproduire.
5. **« Votre nom / votre marque sur les messages »** — voir B18/B19.
6. **« Quelles convictions vos membres tiennent ou lâchent »** — voir B16.
7. **« Échangez un plat »** — voir §5.1.
8. **« Le conseil de famille arbitre et vous explique »** — voir §5.2.
9. **« Suivez le poids de chacun »** — voir C16.
10. **« Application mobile »** — voir C17.
11. **Un chiffre sans source dans le dépôt.** Règle déjà écrite dans `LandingPage.tsx:420-427` :
    trois « statistiques » ont été supprimées pour cette raison exacte.
12. **Une paraphrase présentée comme une capture produit.** Règle `LandingPage.tsx:545-548` :
    *« on ne montre pas un écran qu'on n'a pas »*. B13 est la violation en cours.

---

## 9. Les silences délibérés qui survivent à la refonte

Verbatim de l'en-tête de `LandingPage.tsx`. **Non négociables.**

- **S1** — *« There is NO one-to-one channel from a student back to their coach, and that
  absence is the product, not a gap — so nothing here may hint at an inbox, a reply queue,
  or a "your coach will get back to you". »*
- **S2** — *« The vocabulary is students / cohort / your method / your voice; never "your
  client", never "personalised follow-up". »*
- **S3** — l'espace élève est **PULL** : `/app/plan` compose, `/app/progress` regarde en
  arrière. *« It is PULL, never push. »*
- **S4** — **ne jamais réintroduire un « rien à ouvrir / rien à installer »** de quelque
  forme que ce soit : la phrase se retrouve une rangée au-dessus de la section qui décrit
  la chose qu'elle nierait. Trois brouillons ont déjà buté là-dessus.
- **S5** — **ne jamais écrire « rien n'arrive la nuit »** : erreur factuelle, pas de
  cadrage. Le tap du soir peut tomber à 21 h 50.
- **S6** — *« nothing here promises what the product has not yet PROVEN »*. Silence tenu
  sur le **suivi de poids** (chemins d'écriture et de lecture en désaccord).
- **S8** — un chiffre vient d'une source qu'on peut montrer, ou il n'apparaît pas.
- **S9** — **aucune bande de risque, aucune tuile « on track »** : ça vient de l'évaluateur
  d'adhérence, débranché du 1:N par `20260803200000`.
- **S10** — une maquette reprend le vrai champ **mot pour mot**, ou ce n'est pas une maquette.
- **S11** — ⚠️ `docs/keel/LEGAL.md` §6.4, **règle marketing non négociable** : ne jamais
  annoncer un comptage calorique par photo ni un « suivi des macros par photo ».
- **S12** — **aucun SKU élève** dans `stripe-create-checkout-session` : on ne facture pas
  l'élève, et rien ne doit le laisser croire.

**S7 est le seul silence que ce chantier RENVERSE consciemment** : *« No accent hue is
introduced: every saturated colour on this page is a STATE »*. La charte introduit une
teinte de marque. Conséquence obligatoire (mémoire *« une contrainte documentée survit à
sa cause »*) : **réécrire les commentaires qui la portent** — en-tête de `LandingPage.tsx`
(l. 68-72) et en-tête de `Marketing.tsx` — sinon le prochain lecteur « répare » la couleur.

---

## 10. Le CTA — vérifié, pas supposé

- **B2C → `/start`.** C'est bien la seule porte d'inscription libre. Elle rattache au
  **coach maison** (`keel_join_house_coach`), demande le **pays** (chemin de crise —
  ne jamais le déduire de la langue, migration `20260804180000`), puis le compte tombe
  sur **`/app/setup`** (FF-060), dont les trois branches `solo` / `pair` / `family`
  (`onboarding.ts:84`) créent le foyer (`keel_household_create`).
  ⇒ **Les trois pages B2C ont chacune leur branche de parcours.** C'est un cadeau : la
  promesse de la page est honorée par l'étape suivante.
  ⚠️ `/start` interroge d'abord `keel_free_signup_available` : si le programme du coach
  maison n'est pas publié, **la porte est fermée**. Aucune page ne doit promettre une
  entrée immédiate sans cette réserve.
- **B2B → `/auth?role=coach`.** C'est le CTA d'essai en vigueur (`PublicHeader.tsx:198`),
  14 jours / 3 élèves (B5).

---

## 11. Décisions prises à cette phase

| # | Décision | Pourquoi |
|---|---|---|
| D1 | Les trois preuves fausses du MASTER sont **remplacées**, pas supprimées | §5. Chaque segment garde un argument, mais vrai |
| D2 | Le prix foyer **est affiché**, la **durée d'essai ne l'est pas** | §8 n°1. Le prix est une décision produit écrite ; l'essai a une date d'expiration mécanique |
| D3 | `landing` disparaît comme namespace de page, son contenu devient `coaches` | Une page = un namespace ; `/` change d'acheteur |
| D4 | `/communities` perd son bloc « no calories » | §8 n°2. C'est le seul claim FAUX **déjà en ligne** |
| D5 | Aucun chiffre de durée (« 90 secondes ») | C14 : non mesuré dans le dépôt, donc S8 s'applique |

---

## 12. Hors périmètre, mais à signaler au propriétaire

1. **`CoachBillingPage.tsx:93-94` porte le claim FAUX B2** (« 6 € quand votre élève a payé
   son année ») **dans le produit payant**, pas seulement sur la vitrine.
2. **Le foyer n'est pas facturable** (C2) et **gèle à J+31** (§8 n°1) : c'est un bloqueur
   de mise en ligne B2C, pas un défaut de copie.
3. **`docs/keel/MODEL.md:33-34` est périmé** depuis le broadcast coach (B25).
4. **FF-059 est marquée 🟡 « Spécifiée » alors que le code est livré** ; FF-049 dit
   « il ne manque plus une ligne de code » alors que le produit n'encaisse rien. **Les
   statuts de doc mentent dans les deux sens** — d'où la règle : vérifier le code.
