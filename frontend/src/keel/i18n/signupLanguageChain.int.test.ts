// KEEL — LA CHAÎNE ENTIÈRE, DEPUIS LE CHAMP JUSQU'AUX DEUX CHOSES QU'IL PILOTE.
//
// ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
//
// Le champ « Langue » des formulaires d'inscription porte DEUX promesses, et
// elles vivent dans deux mondes différents:
//
//   1. L'AFFICHAGE de la plateforme — front, `t()` lit `uiLocale()`;
//   2. LA LANGUE DU CHAT — serveur, `run.ts` lit `profiles.locale` à chaque tour.
//
// Chaque maillon est testé chez lui. Ce qui ne l'était PAS, c'est la chaîne:
// chaque test unitaire peut rester vert pendant que deux maillons voisins ont
// cessé de se toucher. C'est arrivé dans ce chantier même — `signupProfileLocale`
// lisait `uiLocale()` au lieu de `chosenUiLocale()`, chaque fonction était juste,
// et un francophone créait un compte anglais.
//
// Les maillons, dans l'ordre, et le fichier où chacun vit:
//
//   [champ]  état React de la porte                    StartPage / Auth / Join…
//      ↓
//   signupProfileLocale(chosen)                        i18n/runtime.ts
//      ↓
//   composeProfileLocale(next, null)                   i18n/catalog.ts
//      ↓
//   freeSignupMetadata({ locale })                     api/freeSignup.ts
//      ↓
//   handle_new_user() -> profiles.locale               (SQL)
//      ↓                                    ↘
//   AuthProvider: reconcile -> uiLocale()      run.ts: resolveResponseLocale
//   = CE QUI S'AFFICHE                         = LA LANGUE DU CHAT
//
// Ce fichier tient les maillons FRONT bout à bout, plus la forme de ce qui part
// en base. Le maillon serveur est tenu par `_shared/keel/locale_test.ts`
// (`studentProfile`) et par `run_locale_wiring_test.ts`, qui verrouille le fait
// que `resolveResponseLocale` n'a qu'UN appelant de production.

import { beforeEach, describe, expect, it } from "vitest";
import { composeProfileLocale, parseUiLocale, type UiLocale } from "./catalog";
import { reconcileUiLocaleWithProfile } from "./reconcile";
import { setChosenUiLocaleForTest, signupProfileLocale } from "./runtime";
import { freeSignupMetadata } from "../api/freeSignup";
import { householdSignupMetadata } from "../api/householdSignup";

/**
 * Le compte qui vient de se connecter, dans les cas d'affichage ci-dessous.
 *
 * ⚠️ IL EST ARRIVÉ LE 2026-08-14 AVEC LA PORTÉE DU GARDE. `reconcile` demandait
 * un booléen « cet onglet a déjà tranché »; il demande maintenant POUR QUI, et
 * face à QUEL compte. La chaîne testée ici est celle du premier écran après
 * l'inscription: aucune décision n'a encore été prise dans l'onglet
 * (`decisionOwner: null`), donc la langue du compte gagne — c'est précisément
 * ce que le garde par onglet empêchait quand un clic anonyme l'avait précédé.
 */
const SIGNED_IN_ACCOUNT = "9a2f7c10-4d5e-4a6b-9c3d-0f1e2a3b4c5d";

/** Ce que la porte écrit en base pour un choix donné. */
function whatLandsInProfilesLocale(chosen: UiLocale): string {
  return String(
    freeSignupMetadata({
      fullName: "Ada",
      country: "FR",
      timezone: "Europe/Paris",
      locale: signupProfileLocale(chosen),
    }).locale,
  );
}

describe("le champ Langue -> profiles.locale", () => {
  beforeEach(() => setChosenUiLocaleForTest("en"));

  it("le CHOIX du champ traverse jusqu'aux métadonnées, dans les deux sens", () => {
    expect(whatLandsInProfilesLocale("fr")).toBe("fr-FR");
    expect(whatLandsInProfilesLocale("en")).toBe("en-US");
  });

  it("le champ BAT le drapeau — c'est la réponse la plus récente qui compte", () => {
    // ⚠️ LA PROPRIÉTÉ QUE LE CHAMP AJOUTE. Avant lui, `signupProfileLocale`
    // lisait le drapeau elle-même: quelqu'un qui lisait la page en français ne
    // POUVAIT PAS demander un compte anglais. Maintenant il le peut, et c'est
    // un besoin réel (lire la vitrine dans sa langue, être coaché dans une
    // autre). Le drapeau ne sert plus qu'à préremplir.
    setChosenUiLocaleForTest("fr");
    expect(whatLandsInProfilesLocale("en")).toBe("en-US");
    setChosenUiLocaleForTest("en");
    expect(whatLandsInProfilesLocale("fr")).toBe("fr-FR");
  });

  it("les quatre portes écrivent la MÊME valeur pour le même choix", () => {
    // Quatre portes, quatre constructeurs de métadonnées. Elles ont déjà
    // divergé une fois: `JoinPage` portait `locale: "en-US"` en dur là où les
    // autres passaient par une constante partagée. Une divergence ici ne casse
    // rien de visible — elle donne juste à un inscrit la mauvaise langue pour
    // toujours.
    for (const chosen of ["fr", "en"] as const) {
      const expected = signupProfileLocale(chosen);
      expect(whatLandsInProfilesLocale(chosen)).toBe(expected);
      expect(
        householdSignupMetadata({
          fullName: "Lea",
          country: "FR",
          timezone: "Europe/Paris",
          locale: signupProfileLocale(chosen),
        }).locale,
      ).toBe(expected);
    }
  });

  it("la valeur écrite est un BCP-47 que les deux consommateurs savent lire", () => {
    // Côté front, `parseUiLocale` la ramène à une locale d'interface. Côté
    // serveur, `isFrenchLocale` teste le sous-tag de langue et `localePackKey`
    // LÈVE sur une langue non livrée (R7). Un tag à deux lettres nu (`"fr"`)
    // passerait les deux, mais R2 demande du BCP-47 en base — et c'est
    // exactement ce que les générateurs écrivaient de faux (`?? "en"`).
    for (const chosen of ["fr", "en"] as const) {
      const written = whatLandsInProfilesLocale(chosen);
      expect(written).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
      expect(parseUiLocale(written)).toBe(chosen);
    }
  });
});

describe("profiles.locale -> CE QUI S'AFFICHE", () => {
  it("un compte français fait basculer l'interface, même sur un navigateur anglais", () => {
    // Le maillon d'`AuthProvider`: la ligne `profiles` est lue dans le `select`
    // qui existait déjà, et sa langue GAGNE sur celle du navigateur.
    expect(
      reconcileUiLocaleWithProfile({
        profileLocale: whatLandsInProfilesLocale("fr"),
        chosen: "en",
        decisionOwner: null,
        accountId: SIGNED_IN_ACCOUNT,
      }),
    ).toEqual({ kind: "adopt", locale: "fr" });
  });

  it("et dans l'autre sens, sinon le test passerait sur du français en dur", () => {
    expect(
      reconcileUiLocaleWithProfile({
        profileLocale: whatLandsInProfilesLocale("en"),
        chosen: "fr",
        decisionOwner: null,
        accountId: SIGNED_IN_ACCOUNT,
      }),
    ).toEqual({ kind: "adopt", locale: "en" });
  });

  it("un compte dont la langue est DÉJÀ celle du navigateur ne recharge pas", () => {
    // Sans ça, chaque connexion rechargerait la page une fois pour rien.
    expect(
      reconcileUiLocaleWithProfile({
        profileLocale: whatLandsInProfilesLocale("fr"),
        chosen: "fr",
        decisionOwner: null,
        accountId: SIGNED_IN_ACCOUNT,
      }),
    ).toEqual({ kind: "keep" });
  });
});

describe("profiles.locale -> LA LANGUE DU CHAT", () => {
  it("la valeur écrite est celle que le résolveur serveur sait employer", () => {
    // ── CE QUE CE TEST PEUT PROUVER, ET CE QU'IL NE PEUT PAS ────────────────
    //
    // Il ne peut pas exécuter le Deno. Ce qu'il tient, c'est le CONTRAT DE
    // FORME entre les deux mondes: `run.ts` passe `keelTurn.content_locale`
    // (= `profiles.locale`) à `resolveResponseLocale`, qui le fait passer par
    // `clampToDeliveredLocale` — lequel ramène à `en-US` toute langue non
    // livrée, avec un `console.warn`. Une porte qui écrirait `"français"`,
    // `"fr_FR"` ou `""` ne casserait donc rien de visible: elle rendrait
    // simplement l'anglais, pour toujours, sans une erreur nulle part.
    //
    // Les deux préfixes livrés sont `en` et `fr` (`DELIVERED_LANGUAGE_PREFIXES`,
    // `_shared/keel/locale.ts`). C'est cette liste-là qu'on interroge.
    const delivered = new Set(["en", "fr"]);
    for (const chosen of ["fr", "en"] as const) {
      const written = whatLandsInProfilesLocale(chosen);
      expect(delivered.has(written.slice(0, 2))).toBe(true);
      // Et le pack français doit vraiment être choisi pour le français: c'est
      // `isFrenchLocale` côté serveur, qui teste le sous-tag de langue.
      expect(written.startsWith("fr")).toBe(chosen === "fr");
    }
  });

  it("`composeProfileLocale` ne fabrique jamais une langue non livrée", () => {
    // Le maillon qui compose la valeur. Il ne change QUE le sous-tag de langue,
    // donc une région exotique survit — mais la langue, elle, reste dans le jeu
    // livré, sinon le serveur clamperait tout à l'anglais en silence.
    for (const region of [null, "en-GB", "fr-CA", "de-DE", "pt-BR"]) {
      for (const chosen of ["fr", "en"] as const) {
        expect(composeProfileLocale(chosen, region).slice(0, 2)).toBe(chosen);
      }
    }
  });
});
