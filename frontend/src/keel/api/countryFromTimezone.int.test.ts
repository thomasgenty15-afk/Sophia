// KEEL — la déduction du pays, et le seul défaut qui compte.
//
// Le pays n'est plus demandé. Il est déduit, et il est ÉCRIT: sans lui,
// `handle_new_user()` refuse de rattacher un inscrit libre à son coach —
// silencieusement, par conception — et `keel_household_join` lève
// `country_required`. Une déduction qui rend du vide, ou une forme que la base
// rejette, ne produit donc pas un mauvais pays: elle produit un COMPTE SANS
// PLAN, sans une erreur nulle part.

import { describe, expect, it } from "vitest";
import { countryFromTimezone, declaredCountryFor } from "./countryFromTimezone";
import { isDeclaredCountryValid } from "./countries";

describe("countryFromTimezone", () => {
  it("rend le pays des fuseaux que les deux langues livrées habitent", () => {
    expect(countryFromTimezone("Europe/Paris")).toBe("FR");
    expect(countryFromTimezone("Europe/London")).toBe("GB");
    expect(countryFromTimezone("America/New_York")).toBe("US");
    expect(countryFromTimezone("America/Montreal")).toBe("CA");
    expect(countryFromTimezone("Europe/Brussels")).toBe("BE");
    expect(countryFromTimezone("Europe/Zurich")).toBe("CH");
  });

  it("NE MET PAS les autres francophones en France", () => {
    // ── LA PROPRIÉTÉ QUI JUSTIFIE LE FUSEAU PLUTÔT QUE LA LANGUE ────────────
    // Déduire le pays de la langue met tout francophone en France, et c'est
    // exactement le défaut que la migration `20260804180000` a fermé (un élève
    // britannique portant le `fr-FR` legacy recevait le 3114 avec
    // `fallbackUsed: false`). Ces quatre-là parlent français et ne sont pas
    // français; si un jour quelqu'un « simplifie » la table en la remplaçant
    // par la langue, c'est cette ligne qui rougit.
    for (const zone of ["Europe/Brussels", "Europe/Zurich", "America/Montreal", "Africa/Dakar"]) {
      expect(countryFromTimezone(zone)).not.toBe("FR");
    }
  });

  it("rend `null` sur ce qu'il ne connaît pas, plutôt qu'un pays inventé", () => {
    for (const unknown of ["", "   ", "Mars/Olympus", "UTC", "GMT", null, undefined]) {
      expect(countryFromTimezone(unknown)).toBeNull();
    }
  });

  it("chaque entrée de la table a la FORME que la base accepte", () => {
    // La base a un `CHECK` (`profiles_country_iso3166_check`) et la RPC un refus
    // `bad_country`. Une entrée en minuscules ou à trois lettres passerait la
    // relecture et casserait le rattachement chez une personne, pas chez nous.
    for (const zone of ["Europe/Paris", "America/Sao_Paulo", "Asia/Kolkata", "Africa/Abidjan"]) {
      const code = countryFromTimezone(zone);
      expect(code, zone).not.toBeNull();
      expect(isDeclaredCountryValid(code as string), `${zone} -> ${code}`).toBe(true);
    }
  });
});

describe("declaredCountryFor — ce qui part vraiment en base", () => {
  it("rend TOUJOURS une forme écrivable, même sans rien savoir", () => {
    // ⚠️ LE TEST QUI PORTE LE FICHIER. C'est la propriété dont dépend le
    // rattachement au coach: du vide ici est un compte sans plan.
    for (const zone of ["Europe/Paris", "Mars/Olympus", "", null, undefined]) {
      for (const locale of ["fr", "en"] as const) {
        const code = declaredCountryFor(zone, locale);
        expect(isDeclaredCountryValid(code), `${zone} / ${locale} -> ${code}`)
          .toBe(true);
      }
    }
  });

  it("le fuseau BAT la langue, dans les deux sens", () => {
    // Un anglophone à Paris est en France; un francophone à Londres est au
    // Royaume-Uni. Une assertion dans un seul sens resterait verte devant une
    // implémentation qui lit la langue d'abord.
    expect(declaredCountryFor("Europe/Paris", "en")).toBe("FR");
    expect(declaredCountryFor("Europe/London", "fr")).toBe("GB");
  });

  it("le dernier recours suit la langue, et il est NOMMÉ comme tel", () => {
    // Fuseau inconnu et navigateur sans région: on retombe sur la langue, ce
    // qui EST le défaut que le fuseau existe pour éviter. C'est assumé et
    // borné — mieux vaut un pays approximatif qu'un compte que le SQL refuse.
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: { language: "fr" }, // sans région: rien à en tirer
      configurable: true,
    });
    try {
      expect(declaredCountryFor("Mars/Olympus", "fr")).toBe("FR");
      expect(declaredCountryFor("Mars/Olympus", "en")).toBe("US");
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: original,
        configurable: true,
      });
    }
  });

  it("la région du navigateur passe AVANT le dernier recours", () => {
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: { language: "fr-BE" },
      configurable: true,
    });
    try {
      // Un Belge au fuseau inconnu reste belge, il ne devient pas français.
      expect(declaredCountryFor("Mars/Olympus", "fr")).toBe("BE");
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: original,
        configurable: true,
      });
    }
  });
});
