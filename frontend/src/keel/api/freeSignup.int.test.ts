import { describe, expect, it } from "vitest";
import {
  FREE_SIGNUP_INTENT,
  freeSignupMetadata,
  isAlreadyRegistered,
  isDeclaredCountryValid,
  joinRefusalMessageKey,
  PRODUCT_LOCALE,
} from "./freeSignup";
import { NO_COUNTRY_SELECTED } from "./countries";
import { en } from "../i18n/en";

// CE QUE CE FICHIER PROTÈGE, ET POURQUOI ÇA VAUT UN TEST
//
// Le rattachement d'un inscrit libre au coach maison est BEST-EFFORT dans
// `handle_new_user()`: un échec est avalé, par conception, parce qu'il ne doit
// pas coûter le compte. Conséquence directe: une métadonnée manquante ne produit
// AUCUNE erreur visible. Le compte est créé, l'écran annonce « vous êtes
// dedans », et l'élève arrive dans un produit sans coach — donc 409 `no_coach` au
// premier plan, 409 sans plan publié à la première photo.
//
// Les tests ci-dessous sont donc la seule alarme possible sur la forme de ces
// métadonnées. Ils asservissent les noms de clés à ce que le SQL lit.

describe("freeSignupMetadata", () => {
  it("carries the two keys handle_new_user() branches on", () => {
    const meta = freeSignupMetadata({
      fullName: "Ada Lovelace",
      country: "GB",
      timezone: "Europe/London",
    });
    // Les noms sont assertés LITTÉRALEMENT: c'est le contrat avec
    // `raw_user_meta_data->>'keel_signup_intent'` et `->>'country'`.
    expect(meta.keel_signup_intent).toBe("student_free");
    expect(meta.country).toBe("GB");
  });

  it("declares the product locale, never the legacy fr-FR default", () => {
    const meta = freeSignupMetadata({
      fullName: "Ada",
      country: "US",
      timezone: "America/New_York",
    });
    // `profiles.locale` a pour DÉFAUT 'fr-FR'. Ne pas envoyer la clé laisserait
    // un inscrit libre en français sur un produit anglais — et toute ceinture
    // gatée sur `isFrenchLocale` s'armerait sur lui.
    expect(meta.locale).toBe("en-US");
    expect(PRODUCT_LOCALE).toBe("en-US");
  });

  it("carries the browser timezone, because no server value would be honest", () => {
    const meta = freeSignupMetadata({
      fullName: "Ada",
      country: "US",
      timezone: "Asia/Singapore",
    });
    // Un fuseau NULL fait rendre `null` à `localHourFor`, ce qui range l'élève en
    // `outside_window` à chaque tick du tap du soir. Silencieusement, pour
    // toujours — et rien dans le compte-rendu du job ne le distingue d'un élève
    // qui dort.
    expect(meta.timezone).toBe("Asia/Singapore");
    expect(meta.tz_follow_device).toBe(true);
  });

  it("trims the name so a stray space does not become the profile name", () => {
    const meta = freeSignupMetadata({
      fullName: "  Ada  ",
      country: "US",
      timezone: "UTC",
    });
    expect(meta.full_name).toBe("Ada");
  });

  it("never omits country, whatever else is empty", () => {
    // Le cas qui compte: le trigger REFUSE de rattacher sans pays. Si cette clé
    // disparaissait, chaque inscrit libre sortirait sans coach, sans erreur.
    const meta = freeSignupMetadata({ fullName: "", country: "FR", timezone: "UTC" });
    expect(Object.keys(meta)).toContain("country");
    expect(meta.country).toBe("FR");
  });

  it("uses the same intent literal the SQL expects", () => {
    expect(FREE_SIGNUP_INTENT).toBe("student_free");
  });
});

describe("isDeclaredCountryValid", () => {
  it("accepts an ISO 3166-1 alpha-2 code", () => {
    for (const code of ["US", "GB", "FR", "ZA"]) {
      expect(isDeclaredCountryValid(code)).toBe(true);
    }
  });

  it("refuses what a bypassed client or a free-text field would send", () => {
    // La base lève sur ces valeurs (`22023`), donc les laisser passer coûterait
    // le rattachement — pas une correction silencieuse en NULL, qui serait pire:
    // NULL est l'état dont le résolveur de crise déduit le pays depuis la langue.
    for (const bad of ["", "U", "usa", "Royaume-Uni", "us", "U S", "GBR", "🇬🇧"]) {
      expect(isDeclaredCountryValid(bad)).toBe(false);
    }
  });

  it("REFUSE l'état initial des sélecteurs — la garde du défaut mesuré", () => {
    // MESURÉ LE 2026-08-12, en jouant `/start` dans un navigateur: le sélecteur
    // naissait à « United States », et un compte créé sans y toucher partait
    // avec `profiles.country='US'` — sous une aide qui promet « le bon numéro
    // d'urgence ». C'est-à-dire la hotline américaine pour un Français.
    //
    // Ce test est la seule chose qui rougit si quelqu'un redonne un pays à
    // `NO_COUNTRY_SELECTED` « pour éviter un champ vide »: `"US"` est une valeur
    // parfaitement valide, donc aucune autre ceinture — ni le type, ni la base,
    // ni un test de forme — ne verrait passer la régression. Les trois portes
    // (`/start`, `/join-household`, la porte coach de `/auth`) partent de cette
    // constante, donc une seule assertion les tient toutes les trois.
    expect(isDeclaredCountryValid(NO_COUNTRY_SELECTED)).toBe(false);
  });
});

describe("joinRefusalMessageKey", () => {
  it("maps every refusal the RPC can emit to a real message", () => {
    const reasons = [
      "country_required",
      "already_coached",
      "caller_is_coach",
      "house_coach_unavailable",
    ];
    for (const reason of reasons) {
      const key = joinRefusalMessageKey(reason);
      // La clé doit EXISTER dans le catalogue: `t()` lève en dev sur une clé
      // inconnue, donc une entrée manquante casserait l'écran au moment précis
      // où on essaie d'expliquer un refus.
      expect(en[key], `missing message for ${reason}`).toBeTruthy();
      expect(key).not.toBe("start.error.generic");
    }
  });

  it("falls back to a human sentence on an unknown or absent reason", () => {
    // Jamais le token brut à l'écran, et jamais un écran de SUCCÈS: c'est la
    // faute qui a coûté une invitation perdue sur /join.
    for (const unknown of [undefined, null, "", "some_new_reason_from_a_future_migration"]) {
      expect(joinRefusalMessageKey(unknown)).toBe("start.error.generic");
    }
    expect(en["start.error.generic"]).toBeTruthy();
  });
});

describe("isAlreadyRegistered", () => {
  it("recognises Supabase's taken-address refusals", () => {
    for (const message of [
      "User already registered",
      "user already exists",
      "A user with this email has already been registered",
    ]) {
      expect(isAlreadyRegistered(message)).toBe(true);
    }
  });

  it("does not swallow an unrelated failure as an existing account", () => {
    // Un faux positif ici enverrait quelqu'un se connecter à un compte qui
    // n'existe pas, pendant que la vraie erreur reste invisible.
    for (const message of [
      "Password should be at least 6 characters",
      "Failed to fetch",
      "Signups not allowed for this instance",
    ]) {
      expect(isAlreadyRegistered(message)).toBe(false);
    }
  });
});
