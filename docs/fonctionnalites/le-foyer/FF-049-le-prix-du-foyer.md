# FF-049 · Le prix du foyer

| | |
|---|---|
| **Identifiant** | `FF-049-le-prix-du-foyer` |
| **Statut** | 🟠 **En cours** — la **définition** de ce qu'on facture est livrée et testée (`f9efc488`) ; **rien ne facture**, et le commentaire de la fonction le dit |
| **Date** | 2026-08-10 |
| **Autorité produit** | [le-foyer/README.md](README.md) · [PIVOT-FOYER.md](../../keel/PIVOT-FOYER.md) §11 · [CHANTIER-FOYER-PROFILS.md](../../keel/CHANTIER-FOYER-PROFILS.md) lot 7 |
| **Dépend de** | [FF-048](FF-048-reclamer-son-profil.md) — un profil réclamé est l'unité facturée |
| **Effort estimé** | reste ~2 jours **plus** cinq gestes humains (§7) |

---

## 1. Le problème

Le foyer n'a pas de prix, et il est **gratuit**.

Vérifié plutôt que supposé : `grep -ric household` sur les cinq fonctions
`stripe-*` et sur `_shared/billing-tier.ts` rend **0 partout**, et aucun chemin
du foyer ne lit `access_tier`. Le vocabulaire de siège existant est entièrement
coach-side. Le prix du foyer n'existe **nulle part**.

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

### Hors périmètre — engageant
- ❌ **Aucun module TypeScript de facturation du foyer.**
  `scripts/ci/wiring-check.mjs` échoue déjà sur des modules sans importeur ; un
  `household_billing.ts` que rien n'appellerait en aurait fait un de plus. Le
  compte vit en SQL, **où son appelant est nommé et pas inventé**.
- ❌ **Aucune fausse intégration Stripe, même en ébauche.** Elle donnerait
  l'illusion que le foyer est vendable.
- ❌ **Facturer une bouche.** Le foyer entier est à un prix ; les bouches sont
  gratuites, plafonnées par une garde de **coût LLM** qui n'a rien à voir avec
  la facturation.
- ❌ **Plusieurs cartes dans un foyer.** Une seule ligne, sur l'abonnement du
  maître.

## 4. Le circuit

```
   CE QUI EST LIVRÉ                      CE QUI ATTEND UN GESTE HUMAIN
   ────────────────                      ─────────────────────────────

   keel_household_max_mouths()  = 8      1. deux prix Stripe créés à la main
       │  immutable                         · 12,99 €  foyer      qté 1
       │  garde de COÛT LLM                 · 2,00 €   profil     qté réconciliée
       ▼
   keel_household_add_member             2. `supabase secrets set`
       cite le plafond, refuse                STRIPE_PRICE_ID_HOUSEHOLD_MONTHLY
       `household_full`                       STRIPE_PRICE_ID_HOUSEHOLD_PROFILE_MONTHLY

   keel_household_billable_profiles()    3. trancher le PALIER, puis migrer les
       user_id is not null                   QUATRE sites de vocabulaire ENSEMBLE
       and role <> 'owner'                   · profiles_access_tier_check
       service_role SEUL                     · subscriptions_tier_check
       │                                     · _shared/billing-tier.ts
       │                                     · frontend/lib/entitlements.ts
       │
       └──── aucun appelant runtime ────► 4. le tunnel `plan='keel_household'`
                                             + `stripe-reconcile-households`
                                             (calqué sur stripe-reconcile-seats)

                                          5. `db push` puis `functions deploy`
```

**Tant que 1 à 5 n'est pas fait, RIEN NE FACTURE**, et le commentaire de la
fonction le dit.

## 5. Modèle de données

Aucune table neuve. Deux fonctions, et c'est délibéré :

| Fonction | Définition | Exécutable par |
|---|---|---|
| `keel_household_max_mouths()` (`20260810260000:101`) | `select 8`, `immutable` — la valeur ne dépend d'aucune ligne | `authenticated`, `service_role` |
| `keel_household_billable_profiles(uuid)` (`20260810260000:235`) | `count(*) where user_id is not null and role <> 'owner'`, `stable`, `security definer` | **`service_role` seul** |

Une table de période (forme de `coach_billing_periods`) viendra avec
`stripe-reconcile-households`. Elle n'existe pas.

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

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| **⚠️ Aujourd'hui, quel que soit l'état de l'abonnement** | **TROU CONNU n°6 : LE FOYER EST GRATUIT.** Aucun chemin du foyer ne lit `access_tier`, et `generate-household-meal-v1` ne vérifie aucune solvabilité. Acceptable pendant un pilote — mais c'est un **choix**, pas un état. |
| **⚠️ Un mineur avec un compte** | **Compté comme facturable.** Facturer 2 € l'accès d'un enfant est une décision commerciale ; elle est rendue **lisible et non prise**. |
| Une bouche dont le compte est supprimé | Elle cesse de compter — et sans rien de spécial : la cascade emporte la **ligne entière** (trou n°5, voir [FF-048](FF-048-reclamer-son-profil.md) §7). Le compte facturable est juste ; le foyer, lui, a maigri. |
| Quelqu'un appelle la fonction depuis le front | Impossible : `revoke all … from public, anon, authenticated`, `grant … to service_role`. |
| Un développeur retire `role <> 'owner'` de la définition | Deux rouges : le bloc QA de la migration **lève**, et l'assertion 37 de `household_rls_test.sql` rougit (`got 5, want 4`). Vérifié par mutation. |

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

## 9. Rabbit holes

- **Le module TypeScript « pour plus tard ».** Il ne serait appelé par personne
  et deviendrait le quatrième orphelin du `wiring-check` — c'est-à-dire du bruit
  qui apprend à ignorer un signal.
- **Le palier de facturation.** `subscriptions_tier_check` n'admet que `coach`
  et trois paliers grand public morts ; `profiles_access_tier_check` de même.
  Ajouter un jeton **sans migrer les quatre sites ensemble** produit un palier
  que la base accepte et que le front ne connaît pas.
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

1. **Le palier d'un foyer, et ce que reçoit un profil réclamé.** Non tranché.
   C'est le point 3 de la liste, et il commande la migration des quatre sites de
   vocabulaire.
2. **Facture-t-on l'accès d'un mineur ?** Décision commerciale, rendue lisible,
   non prise.
3. **Où pose-t-on la garde de solvabilité, le jour où elle existe ?** Sur la
   génération, ou à l'entrée de l'écran ? Sur la génération, un foyer impayé
   perd son dîner ; à l'entrée, il garde son dernier plan et perd le suivant.
   Personne n'a tranché, et le trou n°6 restera ouvert tant que ce ne sera pas
   fait.
