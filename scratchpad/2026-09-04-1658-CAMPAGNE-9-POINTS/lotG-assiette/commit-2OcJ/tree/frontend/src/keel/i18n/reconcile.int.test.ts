// KEEL — la réconciliation navigateur ↔ compte, et surtout: PAS DE BOUCLE.
//
// Adopter veut dire recharger, et recharger relit. Le seul défaut qui compte
// ici n'est pas « la mauvaise langue » — ça se voit — c'est « la page qui se
// recharge sans fin », qui se voit aussi mais après avoir rendu le produit
// inutilisable pour le compte concerné.
//
// ⚠️ CE FICHIER A CHANGÉ DE FORME LE 2026-08-14, ET LE CHANGEMENT EST LE
// CORRECTIF. Le garde était un booléen « cet onglet a déjà tranché »; il porte
// maintenant l'IDENTITÉ du compte pour lequel il a tranché. Les deux derniers
// cas ci-dessous sont ceux que l'ancienne forme ne pouvait pas distinguer —
// et c'est cette confusion qui a laissé un écran français sur un compte
// anglais, en masquant le seul symptôme visible de l'écrasement SQL.

import { describe, expect, it } from "vitest";
import { reconcileUiLocaleWithProfile } from "./reconcile";

/** Deux comptes, nommés une fois: la moitié des cas d'ici les oppose. */
const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

describe("reconcileUiLocaleWithProfile", () => {
  it("ne fait rien quand les deux mémoires s'accordent", () => {
    expect(
      reconcileUiLocaleWithProfile({
        profileLocale: "fr-FR",
        chosen: "fr",
        decisionOwner: null,
        accountId: ALICE,
      }),
    ).toEqual({ kind: "keep" });
  });

  it("adopte la langue du compte quand le navigateur dit autre chose", () => {
    // Le cas réel: un coach inscrit en français sur son portable ouvre le
    // produit depuis l'ordinateur du bureau — `localStorage` vide, navigateur
    // anglais. Sans ça, il lit une interface anglaise pendant que son agent lui
    // répond en français.
    expect(
      reconcileUiLocaleWithProfile({
        profileLocale: "fr-FR",
        chosen: "en",
        decisionOwner: null,
        accountId: ALICE,
      }),
    ).toEqual({ kind: "adopt", locale: "fr" });
  });

  it("adopte aussi dans l'autre sens", () => {
    // Une assertion sur le seul français resterait verte devant un
    // `return { kind: "adopt", locale: "fr" }` écrit en dur.
    expect(
      reconcileUiLocaleWithProfile({
        profileLocale: "en-US",
        chosen: "fr",
        decisionOwner: null,
        accountId: ALICE,
      }),
    ).toEqual({ kind: "adopt", locale: "en" });
  });

  it("ne décide RIEN pour un compte qui n'a rien déclaré", () => {
    // Le cas existe et il est nombreux: toute ligne écrite par une fixture, et
    // tout compte né avant le sélecteur. Adopter sur une valeur vide ferait
    // basculer ces gens vers l'anglais par accident plutôt que par décision.
    for (const empty of [null, undefined, "", "   "]) {
      expect(
        reconcileUiLocaleWithProfile({
          profileLocale: empty,
          chosen: "fr",
          decisionOwner: null,
          accountId: ALICE,
        }),
      ).toEqual({ kind: "keep" });
    }
  });

  it("NE BOUCLE PAS sur une locale que le produit ne livre pas", () => {
    // ── LE TEST QUI PORTE LE FICHIER ────────────────────────────────────────
    // `de-DE` existe en base (mesuré: une ligne, localement). `parseUiLocale`
    // le ramène à `en`, donc on adopte `en`… et au rechargement la base dit
    // toujours `de-DE`, donc on adopte `en`… La divergence SURVIT à l'écriture,
    // et c'est la seule forme de boucle possible ici.
    //
    // Le premier passage adopte — c'est le bon comportement, l'anglais est ce
    // que ce compte peut lire. Le second ne fait plus rien, grâce au garde.
    const first = reconcileUiLocaleWithProfile({
      profileLocale: "de-DE",
      chosen: "fr",
      decisionOwner: null,
      accountId: ALICE,
    });
    expect(first).toEqual({ kind: "adopt", locale: "en" });

    const second = reconcileUiLocaleWithProfile({
      profileLocale: "de-DE",
      chosen: "en",
      decisionOwner: ALICE,
      accountId: ALICE,
    });
    expect(second).toEqual({ kind: "keep" });
  });

  it("le garde bat un désaccord franc — POUR LE COMPTE QUI A TRANCHÉ", () => {
    // Ce qu'il protège en plus de la boucle: un clic délibéré sur le drapeau,
    // que `setUiLocaleAndReload` marque, et que la réconciliation annulerait
    // sinon au rechargement suivant — silencieusement — quand l'écriture en
    // base n'a pas suivi (réseau).
    expect(
      reconcileUiLocaleWithProfile({
        profileLocale: "en-US",
        chosen: "fr",
        decisionOwner: ALICE,
        accountId: ALICE,
      }),
    ).toEqual({ kind: "keep" });
  });

  it("une décision ANONYME ne gèle aucun compte", () => {
    // ── LE DÉFAUT DU 2026-08-14, EN UNE ASSERTION ───────────────────────────
    // Un clic FR sur la vitrine se fait SANS session: `chooseUiLanguage` n'a
    // rien à écrire en base, et pose le garde au nom de `"anon"`. L'ancienne
    // forme booléenne rendait ce clic indistinguable d'une décision de compte,
    // donc l'inscription qui suivait dans le même onglet n'adoptait plus rien.
    //
    // Mesuré: écran français, `profiles.locale = 'en-US'`, agent anglais — et
    // aucun signal à l'écran, ce qui a masqué l'écrasement SQL pendant des
    // jours. Le clic anonyme n'engage personne: il précède le compte.
    expect(
      reconcileUiLocaleWithProfile({
        profileLocale: "en-US",
        chosen: "fr",
        decisionOwner: "anon",
        accountId: ALICE,
      }),
    ).toEqual({ kind: "adopt", locale: "en" });
  });

  it("la décision d'un compte ne gèle pas le compte suivant", () => {
    // Deux comptes dans le même onglet, c'est notre quotidien de test et le
    // quotidien réel d'un poste partagé. `sessionStorage` survit à la
    // déconnexion comme au rechargement; seule l'identité peut trancher.
    expect(
      reconcileUiLocaleWithProfile({
        profileLocale: "fr-FR",
        chosen: "en",
        decisionOwner: ALICE,
        accountId: BOB,
      }),
    ).toEqual({ kind: "adopt", locale: "fr" });
  });
});
