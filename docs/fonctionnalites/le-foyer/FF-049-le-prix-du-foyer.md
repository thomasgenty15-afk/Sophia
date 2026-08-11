# FF-049 · Le prix du foyer

| | |
|---|---|
| **Identifiant** | `FF-049-le-prix-du-foyer` |
| **Statut** | 🟠 **En cours** — **et pour une raison qui a changé.** Tout le code existe et est testé : le compte facturable (`f9efc488`), le job de réconciliation, la table de période, `free_until`, les deux jetons de palier (`73ab25c9`), et le **gel** d'un foyer impayé (`a2d650b6`). Il ne manque plus **une ligne de code** : il manque les **gestes humains Stripe** (§7) |
| **Date** | 2026-08-11 |
| **Autorité produit** | [le-foyer/README.md](README.md) · [PIVOT-FOYER.md](../../keel/PIVOT-FOYER.md) §11 · [CHANTIER-FOYER-PROFILS.md](../../keel/CHANTIER-FOYER-PROFILS.md) lot 7 · [CHANTIER-FOYER-SUITE.md](../../keel/CHANTIER-FOYER-SUITE.md) chantiers 1 et 3 |
| **Dépend de** | [FF-048](FF-048-reclamer-son-profil.md) — un profil réclamé est l'unité facturée |
| **Effort estimé** | code terminé ; reste **cinq gestes humains** (§7) et une décision (§11 n°4) |

---

## 1. Le problème

*(État au 2026-08-10, conservé parce qu'il dit d'où l'on part — voir §7 pour ce
qui a été refermé depuis.)*

Le foyer n'a pas de prix, et il est **gratuit**.

Vérifié plutôt que supposé : `grep -ric household` sur les cinq fonctions
`stripe-*` et sur `_shared/billing-tier.ts` rendait **0 partout**, et aucun
chemin du foyer ne lisait `access_tier`. Le vocabulaire de siège existant était
entièrement coach-side. Le prix du foyer n'existait **nulle part**.

Un fait du brief était par ailleurs **périmé** : le forfait plateforme de 49 €
n'existe plus. `stripe-create-checkout-session:283-305` l'écrit en toutes
lettres — *« LE CONTRAT KEEL N'A PLUS QU'UN POSTE: LE SIÈGE »* — parce qu'il
imposait au coach un point mort à ~13 élèves. Les variables de prix survivent
pour les abonnements vendus avant.

**Ce que ça coûte de ne rien faire.** Rien, tant que c'est un pilote. Mais un
produit gratuit dont personne n'a écrit **ce qu'on facturera** finit par
facturer ce qui est facile à compter — et ce qui est facile à compter ici, ce
sont **les bouches**, c'est-à-dire les enfants.

## 2. Job stories

> **Quand** je tiens un foyer de cinq, **je veux** payer un prix pour le foyer
> et pas par personne, **pour que** décrire toute ma famille ne me coûte pas
> plus cher.

> **Quand** mon conjoint réclame son accès, **je veux** que le supplément soit
> lisible sur ma seule carte, **pour ne pas** découvrir un montant que je ne
> sais pas expliquer.

> **Quand** j'ajoute mes trois enfants, **je veux** que ça ne change rien à ma
> facture, **pour que** le produit ne me punisse pas d'être une famille.

## 3. Périmètre

### Dans le périmètre
- La **définition** de la quantité facturable :
  `keel_household_billable_profiles(uuid)`.
- Le **plafond de 8**, nommé une fois (`keel_household_max_mouths()`) et cité
  par la RPC d'ajout — voir [FF-045](FF-045-decrire-son-foyer.md) R6.
- La séparation, **écrite et testée côte à côte**, entre le plafond et le compte
  facturable.
- **L'essai posé sur la ligne** : `households.free_until`
  (`20260811030000:67`), 30 jours à compter du **branchement**, jamais déduit
  de `created_at`.
- **Le job de réconciliation** `stripe-reconcile-households`, calqué ligne pour
  ligne sur `stripe-reconcile-seats`.
- **Le tunnel** `plan='keel_household'`, deux articles.
- **Le gel à l'impayé** (D4) : `keel_household_is_covered`
  (`20260811050000:163`), la définition **unique**, et les deux portes qu'elle
  ferme.

### Hors périmètre — engageant
- ❌ **Aucun module TypeScript de *définition* du compte facturable.**
  `scripts/ci/wiring-check.mjs` échoue déjà sur des modules sans importeur. Le
  compte vit en SQL, **où son appelant est nommé et pas inventé** — et depuis
  `73ab25c9` cet appelant existe : `stripe-reconcile-households`.
- ❌ **Aucune seconde lecture de `free_until` hors de la définition unique.** Un
  cinquième test deno **interdit** à tout autre fichier de
  `supabase/functions` de relire la colonne : la règle écrite deux fois est une
  divergence en attente, et le test la rend impossible
  (`_shared/keel/household_freeze_test.ts`).
- ❌ **Facturer une bouche.** Le foyer entier est à un prix ; les bouches sont
  gratuites, plafonnées par une garde de **coût LLM** qui n'a rien à voir avec
  la facturation.
- ❌ **Plusieurs cartes dans un foyer.** Une seule ligne, sur l'abonnement du
  maître.
- ❌ **Effacer un foyer impayé.** D4 : le graphe du foyer *est* la douve. On
  gèle la **production**, jamais la **consultation** ; l'effacement réel reste
  au lifecycle RGPD, sur son propre calendrier.

## 4. Le circuit

```
   CE QUI EST LIVRÉ ET TESTÉ                    CE QUI ATTEND UN GESTE HUMAIN
   ─────────────────────────                    ─────────────────────────────

   keel_household_max_mouths()  = 8             1. deux prix Stripe mensuels,
       │  immutable · garde de COÛT LLM            créés à la main et DIFFÉRENTS
       ▼                                          · 12,99 €  foyer   qté 1
   keel_household_add_member                      · 2,00 €   profil  qté réconciliée
       cite le plafond, refuse `household_full`    (la fonction REFUSE si les deux
                                                    secrets portent le même id)
   keel_household_billable_profiles()
       user_id is not null and role <> 'owner'  2. `supabase secrets set`
       service_role SEUL                             STRIPE_PRICE_ID_HOUSEHOLD_MONTHLY
       │                                             STRIPE_PRICE_ID_HOUSEHOLD_PROFILE_MONTHLY
       │  ◄── SON APPELANT EXISTE (73ab25c9)
       ▼                                        3. `supabase db push`
   stripe-reconcile-households
       recompute, n'incrémente JAMAIS           4. `functions deploy`
       écrit en base AVANT l'appel Stripe             stripe-create-checkout-session
       proration_behavior=none, idempotence           stripe-reconcile-households
       500 « Missing env var » sans prix
       │                                        5. LE JOUR DU BRANCHEMENT SEULEMENT:
       ▼                                             update households
   household_billing_periods (20260811030000:111)      set free_until = current_date + 30
       active_profile_count  ← ce qu'on a CALCULÉ      where free_until is null
       pushed_quantity       ← ce que Stripe a PRIS
       jamais fusionnées: l'écart est le sujet

   households.free_until  (:67, défaut = +30 j)
       │
       ▼
   keel_household_is_covered(uuid)  (20260811050000:163)
       LA DÉFINITION UNIQUE. Ne lit PAS subscriptions.tier.
       │
       ├──► generate-household-meal-v1 : 402 `household_frozen`  (index.ts:279-285)
       ├──► la reco du soir : outcome=skipped, reason=household_frozen
       │                      (daily_recommendation_engine.ts:152)
       └──► deux dérivations qui la CITENT sans la recopier
              keel_household_coverage_for_user(uuid)  serveur (:237)
              keel_household_my_coverage()            écran, SANS paramètre (:291)
```

**Tant que 1 à 5 n'est pas fait, RIEN NE FACTURE** — et la conséquence exacte
est que `free_until IS NULL` vaut **COUVERT** : aucun foyer existant n'est gelé,
et le foyer reste **gratuit**. Ce n'est plus un trou de code, c'est un
interrupteur qu'un humain n'a pas encore poussé.

## 5. Modèle de données

Quatre fonctions et une table, et chaque séparation est délibérée :

| Élément | Définition | Exécutable / lu par |
|---|---|---|
| `keel_household_max_mouths()` (`20260810260000:101`) | `select 8`, `immutable` — la valeur ne dépend d'aucune ligne | `authenticated`, `service_role` |
| `keel_household_billable_profiles(uuid)` (`20260810260000:235`) | `count(*) where user_id is not null and role <> 'owner'`, `stable`, `security definer` | **`service_role` seul** |
| `keel_household_trial_days()` (`20260811050000:79`) | `select 30`, `immutable`. Doit valoir `HOUSEHOLD_TRIAL_DAYS` de `_shared/billing-tier.ts` — et un test **lit les deux fichiers**, parce qu'une constante dupliquée entre deux runtimes dérive | `authenticated`, `service_role` |
| `keel_household_is_covered(uuid)` (`20260811050000:163`) | `free_until is null` **OU** `current_date <= free_until` **OU** l'abonnement du **maître** est vivant. `stable`, `security definer` | **`service_role` seul** |
| `households.free_until date` (`20260811030000:67`, défaut posé en `20260811050000`) | **Saisi sur la ligne**, jamais dérivé de `created_at`. Dernier jour **inclus**. Tout foyer neuf naît à `current_date + keel_household_trial_days()` | `stripe-reconcile-households` (ne pas facturer) **et** `keel_household_is_covered` (ne pas geler) — et **personne d'autre**, un test l'interdit |
| `household_billing_periods` (`20260811030000:111`) | Sur le patron de `coach_billing_periods`. `active_profile_count` (`:121`) et `pushed_quantity` (`:139`) **jamais fusionnées** ; `CHECK active_profile_count <= mouth_count` (`:160`) | `service_role` |

**Pourquoi `active_profile_count` et `pushed_quantity` ne fusionnent jamais.**
Les fusionner rendrait invisible l'écart entre ce qu'on a **calculé** et ce que
Stripe a **accepté** — qui est précisément l'écart qu'on veut lire. Sur échec
de poussée, la ligne existe quand même : `push_error` renseigné,
`pushed_quantity` nul.

**Pourquoi `keel_household_is_covered` ne lit PAS `subscriptions.tier`.** Même
motif que `keel_coach_is_solvent` : l'argent arrive, l'étiquette n'est pas la
question, et une erreur de mapping de prix ne doit **jamais** couper un client
qui paie. Conséquence assumée : un maître qui paie déjà un abonnement coach a
son foyer couvert sans les 12,99 €. Population négligeable aujourd'hui.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | **Le plafond et le compte facturable sont deux choses différentes** | Le test le dit **côte à côte** : un foyer PLEIN (8 bouches) avec 4 profils réclamés. Les confondre ferait facturer des enfants. Le commentaire de chaque fonction renvoie à l'autre. |
| R2 | **Une bouche sans compte ne compte pas** | C'est tout le modèle : décrire sa famille ne coûte rien. |
| R3 | **Une invitation non consommée ne compte pas** | Un lien envoyé n'est pas un accès. `household_invitations` n'est pas lue par la fonction. |
| R4 | **Le maître n'est jamais compté** | Son accès est dans le prix du foyer. Le facturer 2 € de plus produirait 14,99 € pour un foyer d'une personne — **un nombre plausible, donc invisible**. |
| R5 | **Une seule carte dans tout le foyer** | La machinerie existe : `stripe-reconcile-seats` sait déjà pousser une **quantité** sur un item d'abonnement, sans proration et avec clé d'idempotence. |
| R6 | **La définition vit en SQL, pas en TypeScript** | Un module sans importeur est le mode d'échec n°1 de ce dépôt, et `wiring-check` le signale déjà pour d'autres. En SQL, l'appelant — le job de réconciliation — est **nommé** dans le commentaire, et son absence est visible. |
| R7 | **Le plafond est nommé une fois et cité, jamais recopié** | Ce dépôt a déjà payé le prix d'une constante dupliquée entre deux runtimes. Le remède retenu est toujours le même : une seule source, et un test qui le prouve. |
| R8 | **Deux jetons de palier, pas un** — `household` pour le maître, `household_member` pour un profil réclamé | Dériver l'accès du réclamé de l'**état du foyer** obligerait `getEffectiveTierForUser` à interroger le foyer : une **seconde source de vérité** sur l'accès, exactement la classe de défaut que ce chantier passe son temps à retirer. Le vocabulaire vit à **quatre sites qui bougent ensemble** (`profiles_access_tier_check` `20260811030000:274` · `subscriptions_tier_check` `:300` · `_shared/billing-tier.ts:38` · `frontend/src/lib/entitlements.ts:24`), et `_shared/tier_vocabulary_test.ts` **lit les quatre fichiers** et échoue si l'un ne porte pas les jetons. Un grep manuel n'aurait pas survécu au premier ajout. |
| R9 | **L'essai est POSÉ sur la ligne, jamais déduit** | 30 jours à compter du **branchement**, pas de la création du foyer — sinon un foyer créé six semaines avant se réveille déjà expiré, et la faveur se lit comme un piège. Une règle recalculée à la volée devient irreproductible en six mois. |
| R10 | **Le job recompute et n'incrémente JAMAIS** ; il écrit en base **avant** l'appel Stripe | Copie du patron `stripe-reconcile-seats`, ligne pour ligne : `proration_behavior=none`, clé d'idempotence, échec bruyant sans prix. Deux passages sur un essai expiré laissent **une** seule ligne. Un job de facturation qui s'invente est un job qui double-facture. |
| R11 | **Une seule définition de « couvert », et un test interdit la seconde** | `keel_household_is_covered` est LA règle ; deux dérivations la **citent** sans la recopier — une pour le serveur (sujet en paramètre, `auth.uid()` étant NULL sous `service_role`), une pour l'écran (**sans** paramètre, sinon elle rendrait l'état de facturation de n'importe quel foyer). Un cinquième test deno interdit à tout autre fichier de `supabase/functions` de relire `free_until`. |
| R12 | **Le gel ferme la PRODUCTION, jamais la CONSULTATION** | Le graphe du foyer *est* la douve : huit bouches, leurs âges, leurs allergies. Celui qui retrouve son foyer intact se réabonne en un clic ; celui qui doit retaper huit personnes ne revient pas. Le plan courant, l'écran du foyer et le chat restent ouverts. |
| R13 | **Le refus est NOMMÉ et vaut 402** | Un refus muet, ou un 500, se lit comme une **panne** et fait ouvrir un ticket au lieu d'un paiement. `402` dit déjà de quoi il s'agit, et l'écran lit `error` pour choisir sa phrase. |
| R14 | **FAIL-OPEN sur une panne de lecture de couverture** — et c'est l'arbitrage INVERSE de celui des allergies | Une lecture de **sécurité** en panne doit refuser de cuisiner ; une lecture de **facturation** en panne doit laisser passer. Se tromper de sens ici coupe un client qui paie, ce qu'aucun nouvel essai ne répare. Journalisé bruyamment, pour qu'une garde muette ne passe pas pour une garde qui ne mord jamais. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| **⚠️ Aujourd'hui, quel que soit l'état de l'abonnement** | **TROU n°6 — PARTIELLEMENT REFERMÉ, et il faut dire exactement où.** La **garde existe** : `keel_household_is_covered` (`20260811050000:163`), refus **402 `household_frozen`** sur le générateur (`generate-household-meal-v1/index.ts:279-285`), saut nommé sur la reco du soir (`daily_recommendation_engine.ts:152`), et la branche `household_member` de `recompute_profile_access_tier` (`:408`) avec trois déclencheurs. **Rien ne facture** pour autant, et rien ne gèle : tant que les prix Stripe ne sont pas posés (§7 ci-dessous), `free_until IS NULL` vaut **couvert** — l'inverse gèlerait tous les foyers existants d'un coup, en leur offrant un tunnel qui refuse faute de prix. Ni « ouvert » ni « fermé » : **branché et désarmé**. |
| **⚠️ `keel-daily-pulse-v1` et `keel-weekly-flow-v1`** | **TROU CONNU n°7, NON REFERMÉ.** Ni l'un ni l'autre ne porte une seule occurrence de `household` : ils tournent à l'identique sur un foyer gelé. D4 nomme **deux** portes, et ce sont exactement les deux qui ont été fermées. Reste à trancher si le tap du soir et le bilan hebdo comptent comme **production**. |
| **⚠️ Un mineur avec un compte** | **Compté comme facturable.** Facturer 2 € l'accès d'un enfant est une décision commerciale ; elle est rendue **lisible et non prise**. |
| Une bouche dont le compte est supprimé | Elle **cesse de compter** comme facturable — `user_id` passe à NULL — et **la ligne reste**. C'était faux avant `e2899897` : la cascade emportait la ligne entière, et le foyer maigrissait sans que personne l'ait décidé (ancien trou n°5, voir [FF-048](FF-048-reclamer-son-profil.md) §7). Le compte facturable était juste ; le foyer, lui, avait maigri. |
| Quelqu'un veut payer **pendant** son essai | **Refusé**, `409 household_in_trial` (`stripe-create-checkout-session/index.ts:285`). Décision produit non tranchée (§11 n°4) : l'alternative — `subscription_data.trial_end` — fait dépendre la promesse d'une contrainte Stripe sur la date et la viole en silence. |
| Le job tourne **sans prix configuré** | `500 « Missing env var »`, **zéro foyer traité**. Vérifié par un run réel contre la vraie base. Un job de facturation qui démarre à moitié configuré est pire qu'un job qui ne démarre pas. |
| Le job trouve un foyer **en essai** | Sauté, `skip_reason=in_trial`, `pushed_quantity` NULL — lu **en base**, pas dans la réponse HTTP. Deux passages sur un essai expiré laissent **une** seule ligne. |
| Les deux secrets portent **le même** `price_id` | La fonction **refuse**. Deux articles au même prix produiraient une facture plausible et fausse. |
| La lecture de couverture **échoue** | **Fail-open**, journalisé bruyamment (R14). Se tromper de sens couperait un client qui paie. |
| Quelqu'un appelle la fonction depuis le front | Impossible : `revoke all … from public, anon, authenticated`, `grant … to service_role`. Idem pour `keel_household_is_covered` — l'écran passe par `keel_household_my_coverage()`, **sans paramètre**. |
| Un développeur retire `role <> 'owner'` de la définition | Deux rouges : le bloc QA de la migration **lève**, et l'assertion 37 de `household_rls_test.sql` rougit (`got 5, want 4`). Vérifié par mutation. |
| Un développeur confond le plafond et le compte facturable | Une `CHECK active_profile_count <= mouth_count` (`20260811030000:160`) mord désormais. Les assertions 37/38 (8 bouches, 4 facturables) restent intactes, côte à côte. |

### Les cinq gestes humains, dans l'ordre — aucun n'est faisable par un agent

1. Créer **deux** prix Stripe récurrents mensuels, **différents** : 12,99 €
   foyer (quantité 1) et 2,00 € profil réclamé (quantité réconciliée).
2. `supabase secrets set STRIPE_PRICE_ID_HOUSEHOLD_MONTHLY=price_…
   STRIPE_PRICE_ID_HOUSEHOLD_PROFILE_MONTHLY=price_…`
3. `supabase db push`
4. `supabase functions deploy stripe-create-checkout-session
   stripe-reconcile-households`
5. **Le jour du branchement seulement** :
   `update households set free_until = current_date + 30 where free_until is null`

⚠️ **Réserve, et elle n'est pas technique.** Si des foyers ont été créés par des
pilotes recrutés personnellement, ce n'est plus la même question : c'est une
promesse faite à des personnes, elle se règle à la main sur une liste nommée,
hors règle produit.

## 8. Critères d'acceptation

```gherkin
Étant donné un foyer plein — huit bouches — dont quatre portent un compte
Quand keel_household_billable_profiles est appelée
Alors elle rend 4
Et keel_household_max_mouths rend 8
```

```gherkin
Étant donné un foyer d'une seule personne, le maître
Quand keel_household_billable_profiles est appelée
Alors elle rend 0
```

```gherkin
Étant donné une invitation envoyée et non consommée
Quand keel_household_billable_profiles est appelée
Alors le compte est inchangé
```

```gherkin
Étant donné un rôle authenticated ou anon
Quand il tente d'exécuter keel_household_billable_profiles
Alors l'exécution est refusée
```

```gherkin
Étant donné un foyer dont ni l'abonnement ni free_until ne couvrent
Quand il demande une composition
Alors le refus est 402 household_frozen
Et la recommandation du soir est skipped avec reason=household_frozen
Et les bouches, les allergies et le plan courant sont INCHANGÉS
```

```gherkin
Étant donné le même foyer, une fois dégelé
Quand il demande une composition
Alors la garde de couverture ne mord plus
```

```gherkin
Étant donné stripe-reconcile-households sans prix configuré
Quand il est appelé
Alors il rend 500 « Missing env var »
Et ZÉRO foyer est traité
```

## 9. Rabbit holes

- **Le module TypeScript « pour plus tard ».** Il ne serait appelé par personne
  et deviendrait le quatrième orphelin du `wiring-check` — c'est-à-dire du bruit
  qui apprend à ignorer un signal. C'est aussi pourquoi
  `keel_household_billable_profiles` a attendu son appelant : elle a vécu **un
  lot entier sans aucun** (le mode d'échec n°1 de ce dépôt), assumé et daté,
  jusqu'à `73ab25c9`.
- **Le palier de facturation.** `subscriptions_tier_check` n'admettait que
  `coach` et trois paliers grand public morts ; `profiles_access_tier_check` de
  même. Ajouter un jeton **sans migrer les quatre sites ensemble** produit un
  palier que la base accepte et que le front ne connaît pas. Refermé par R8 —
  et la garde qui l'empêche de rouvrir est un test qui **lit les quatre
  fichiers**, pas un commentaire.
- **Réécrire « couvert » en TypeScript.** « si `free_until < aujourd'hui` » se
  tape en cinq secondes, diverge au premier ajustement, et personne ne saura
  laquelle des deux définitions ment. C'est le piège n°1 du chantier 3 ; le
  remède est un test qui **interdit** la seconde lecture, pas la vigilance.
- **Geler la consultation en même temps que la production.** Effacer ou couper
  à l'impayé détruit soi-même la seule chose qui fait revenir (R12).
- **La marge, qui s'use par le quotidien.** La recommandation quotidienne
  (FF-028) ajoute ~30 appels LLM par mois et par foyer ;
  [FF-047](FF-047-le-corps-dans-la-part-du-foyer.md) ajoute 7 lectures par
  bouche avec compte et par génération. La marge de ~10 € tient probablement —
  mais c'est le **quotidien** qui s'accumule en silence, pas la génération
  hebdomadaire.
- **Le coût produit qu'aucun chiffre ne dira.** Le maître paie un accès qu'il ne
  reçoit pas, et il peut le retirer. Réclamer son profil devient une **faveur du
  maître**, pas un droit de la personne. Si le retrait devient courant, c'est le
  modèle qui est à revoir, pas la facturation.

## 10. Ce qu'on mesure

- **La mesure :** nombre de profils réclamés par foyer payant. C'est la seule
  ligne de revenu variable du modèle.
- **La contre-mesure :** marge nette par foyer, **coût LLM déduit**. Un foyer de
  huit bouches avec la recommandation quotidienne active est le cas où la marge
  peut passer sous zéro sans que rien n'alerte.
- **Le garde-fou :** part des profils réclamés retirés dans les 30 jours (voir
  [FF-048](FF-048-reclamer-son-profil.md) §10).

## 11. Questions ouvertes

1. ✅ **Le palier d'un foyer — TRANCHÉ (`73ab25c9`).** Deux jetons, pas un
   (R8), et les quatre sites de vocabulaire migrés **ensemble**.
   ⚠️ **Incohérence assumée** : le maître **en essai** reste `trial`, pas
   `household` — `household` est un jeton **vendu** — tandis que ses profils
   réclamés portent déjà `household_member`. Incohérent à l'œil, sans effet :
   aucun chemin du foyer ne lit `access_tier`.
2. ✅ **Où pose-t-on la garde de solvabilité — TRANCHÉ (`a2d650b6`, D4).** Sur
   la **production**, pas à l'entrée : le générateur refuse, le plan courant
   reste lisible. Reste ouvert **où s'arrête la production** : le tap du soir et
   le bilan hebdo ne sautent pas les foyers gelés (trou n°7, §7).
3. **Facture-t-on l'accès d'un mineur ?** Décision commerciale, rendue lisible,
   non prise.
4. **Le tunnel refuse pendant l'essai** (`409 household_in_trial`). Décision
   produit non tranchée, et la conséquence est assumée : quelqu'un qui **veut**
   payer pendant son essai est renvoyé. L'alternative
   (`subscription_data.trial_end`) fait dépendre la promesse d'une contrainte
   Stripe sur la date, et la viole en silence.
5. **Tout foyer neuf naît avec 30 jours** — c'est une **extrapolation** de
   D4bis, qui ne parle que des foyers d'avant Stripe. Réversible d'une ligne,
   et personne ne l'a re-validée.
6. **Aucun run réel avec appel Gemini, aucune vérification navigateur.** Les
   runs des chantiers 1 et 3 sont des runs **HTTP et base**, sans le modèle.
