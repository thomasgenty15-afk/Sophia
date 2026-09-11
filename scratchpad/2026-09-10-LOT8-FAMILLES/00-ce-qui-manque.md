# LOT 8 · familles ① Identité/SQL et ② Autorisation — ce qui manquait

Établi le 2026-09-10, après lecture des 49 cas déjà livrés (lots 1 et 2).

## Famille ① — Identité/SQL

| Cas du chantier | Déjà couvert ? | Où |
|---|---|---|
| nouveau compte | oui | `personal_household_test.sql` ① · `personal_household_lifecycle_test.sql` ④ (chaîne réelle : `auth.users` → `handle_new_user` → déclencheur) |
| ancien sans foyer | **à moitié** | `personal_household_test.sql` ① prouve la primitive. **Le rattrapage `keel_backfill_personal_households` n'a AUCUN test.** |
| deux `ensure` simultanés | **non** | ② de `personal_household_test.sql` prouve deux appels *séquentiels*. Ni le verrou, ni l'index unique ne sont éprouvés. |
| backfill répété | **non** | rien |
| membre existant | oui | `personal_household_test.sql` ③ · `lifecycle` ② |
| invitation depuis foyer personnel | **à moitié** | `lifecycle` ① couvre le foyer personnel VIDE (supprimé). La branche `vide_conserve` — foyer personnel qui PORTE un plan, `foreign_key_violation` rattrapée — n'est jamais atteinte. |
| départ | **à moitié** | `departure` ②③④⑤ couvrent l'échéance RANGÉE. La branche `else` (aucune échéance rangée ⇒ défaut) n'est pas atteinte. |
| suppression de compte | **à moitié** | `personal_household_test.sql` ④ couvre le refus de `ensure`. Ni le rattrapage (qui doit sauter les comptes supprimés), ni ce que la suppression LAISSE derrière. |
| conservation essais et droits | **à moitié** | ③ (essai préservé), `lifecycle` ③ (essai périmé pas rejoué), `departure` ②③ (échéance rendue). Le rattrapage, lui, n'est pas éprouvé sur ce point. |

## Famille ② — Autorisation

| Cas du chantier | Déjà couvert ? | Où |
|---|---|---|
| maître seul autorisé | oui | `generation_context_test.ts` ① |
| maître de plusieurs autorisé | oui | `generation_context_test.ts` ② |
| secondaire toujours refusé, même pour un seul mangeur | oui | `generation_context_test.ts` ③ + l'ordre des refus |
| appels directs | **non** | rien ne vérifie que les RPC d'écriture sont hors de portée d'un jeton `authenticated`, ni que la table refuse l'écriture directe |
| ancien endpoint | **à moitié** | `generation_context_wiring_test.ts` cherche la chaîne `error: "not_owner"`. Il ne voit pas SOUS QUELLE CONDITION la garde tourne. |
| brouillon / édition / adoption / remplacement | **non** | rien ne prouve que les quatre gestes passent la même porte |
| identifiants falsifiés | **non** | rien n'éprouve `plan_not_replaceable` sur un `p_replaces` d'autrui |
| RLS historique après rattachement | **non** | rien |
| perte du droit comme secondaire, retour après départ comme maître | **non** | la décision est éprouvée sur des lignes inventées ; la BASE qui produit ces lignes ne l'est pas |

## Les limites que ces tests n'effacent pas

- **La vraie concurrence n'est pas éprouvable dans une transaction annulée.** Deux
  sessions Postgres ne partagent pas une transaction non commitée. Ce que le
  fichier prouve à la place : (a) le verrou consultatif est pris AVANT la lecture,
  (b) l'index unique `household_members_one_per_user` MORD. Les deux ensemble
  ferment la faute (« deux appels lisent “aucun foyer” »), mais aucun ne la
  reproduit.
- **Aucun test ne lance les fonctions edge.** Ni `Deno.serve` ni le handler ne
  sont exportés. Ce qui est éprouvé au vrai module, c'est
  `resolveGenerationAdmission` ; le reste est de la structure de source, et c'est
  nommé comme tel dans chaque cas.
