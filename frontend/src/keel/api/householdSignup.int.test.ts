import { describe, expect, it } from "vitest";
import {
  HOUSEHOLD_SIGNUP_INTENT,
  claimRefusalMessageKey,
  householdSignupMetadata,
  isHouseholdSignupOpen,
} from "./householdSignup";
import { SIGNUP_COUNTRIES, isDeclaredCountryValid } from "./countries";
import { en } from "../i18n/en";

// CE QUE CE FICHIER PROTÈGE — la porte d'inscription foyer (chantier 4, D1).
//
// Le défaut qu'il attrape n'est pas visible à l'écran: une clé de métadonnée
// mal orthographiée ne casse rien de ce qu'un testeur regarde. Le compte est
// créé, la page dit ce qu'elle a à dire, et `profiles.country` reste NULL —
// c'est-à-dire que la HOTLINE DE CRISE de cette personne redevient déduite de
// sa langue, qui vaut `en-US` pour tout le monde. C'est le défaut qui a coûté
// l'inscription générique de `/auth` et que la migration 20260804180000 a
// fermé; ces assertions sont la seule alarme avant un utilisateur.

describe("householdSignupMetadata — les clés que le trigger lit", () => {
  const meta = householdSignupMetadata({
    fullName: "  Lea Martin  ",
    country: "FR",
    timezone: "Europe/Paris",
  });

  it("porte le pays DÉCLARÉ, sous la clé que handle_new_user lit", () => {
    // Sans cette clé, le bloc « porte foyer » de `handle_new_user()` LÈVE et le
    // compte n'est pas créé. C'est voulu — mais le seul endroit où l'oubli se
    // voit avant la production est ici.
    expect(meta.country).toBe("FR");
  });

  it("déclare l'intention, avec le littéral EXACT du SQL", () => {
    // `keel_signup_intent = 'household_member'` — la valeur est comparée
    // caractère pour caractère dans la migration 20260811060000 §2. Une faute
    // de frappe ne produit aucune erreur: elle produit un compte ordinaire.
    expect(meta.keel_signup_intent).toBe("household_member");
    expect(HOUSEHOLD_SIGNUP_INTENT).toBe("household_member");
  });

  it("pose la langue du produit, pas le défaut legacy fr-FR", () => {
    // `handle_new_user()` fait `coalesce(meta->>'locale', 'fr-FR')`: une clé
    // absente ferait naître un compte français sur une surface anglaise.
    expect(meta.locale).toBe("en-US");
  });

  it("pose le fuseau, dont l'absence range la personne hors fenêtre", () => {
    // `profiles.timezone` NULL fait rendre `null` à `localHourFor`, donc
    // `outside_window` à chaque tick, silencieusement et pour toujours.
    expect(meta.timezone).toBe("Europe/Paris");
    expect(meta.tz_follow_device).toBe(true);
  });

  it("nettoie le nom, et n'écrit RIEN d'autre", () => {
    expect(meta.full_name).toBe("Lea Martin");
    // ⚠️ AUCUN jeton d'invitation. Le consommer dans la transaction de signup
    // ferait de l'adresse invitée — que l'aperçu rend publiquement à qui tient
    // le lien — une clé suffisante: un voleur s'inscrirait avec cette adresse
    // et raflerait la place sans jamais ouvrir la boîte mail. La réclamation
    // exige une SESSION, et c'est ce qui donne sa valeur à `email_mismatch`.
    expect(Object.keys(meta).sort()).toEqual([
      "country",
      "full_name",
      "keel_signup_intent",
      "locale",
      "timezone",
      "tz_follow_device",
    ]);
  });
});

describe("isDeclaredCountryValid — la forme, et surtout le vide", () => {
  it("accepte les deux lettres majuscules de la liste proposée", () => {
    for (const c of SIGNUP_COUNTRIES) {
      expect(isDeclaredCountryValid(c.code)).toBe(true);
    }
  });

  it("REFUSE la chaîne vide, qui est la valeur initiale du sélecteur", () => {
    // C'est l'assertion du chantier: le sélecteur de cette porte démarre VIDE,
    // là où `/auth` et `/start` démarrent sur « US ». Un défaut préchoisi
    // enregistre le pays de personne, et le pays décide de la ligne d'écoute.
    expect(isDeclaredCountryValid("")).toBe(false);
  });

  it("refuse tout ce qui n'est pas exactement deux majuscules", () => {
    for (const bad of ["fr", "FRA", "F", "F1", " FR", "FR ", "fr-FR"]) {
      expect(isDeclaredCountryValid(bad)).toBe(false);
    }
  });
});

describe("claimRefusalMessageKey — liste fermée, phrases existantes", () => {
  it("chaque motif de la base a une phrase, y compris les deux du pays", () => {
    const reasons = [
      "unknown_token",
      "expired",
      "already_used",
      "already_claimed",
      "email_mismatch",
      "already_in_household",
      "not_authenticated",
      "country_required",
      "bad_country",
      "unreachable",
    ];
    for (const reason of reasons) {
      const key = claimRefusalMessageKey(reason);
      expect(key, `motif sans étiquette: ${reason}`).not.toBeNull();
      // Une clé qui n'existe pas dans le seed ferait THROW `t()` en dev — donc
      // un écran blanc au moment exact d'un refus. On l'affirme ici.
      expect(en[key as keyof typeof en], `clé absente du seed: ${key}`)
        .toBeTypeOf("string");
    }
  });

  it("un motif inconnu rend null plutôt qu'un jeton brut à l'écran", () => {
    // Le silence force à ajouter l'étiquette au lieu de la tolérer: afficher
    // « already_claimed » à quelqu'un est un message pour nous, pas pour lui.
    expect(claimRefusalMessageKey("some_new_reason_from_the_future")).toBeNull();
  });
});

describe("isHouseholdSignupOpen — le verrou pré-lancement", () => {
  // LA DÉCISION DU CHANTIER 4 §3, et son motif est dans `householdSignup.ts`:
  // une surface de création de compte qui ignore l'interrupteur global « le
  // produit est fermé » est un verrou avec un trou, et le trou est invisible.
  it("verrou armé: la porte d'inscription est fermée", () => {
    expect(isHouseholdSignupOpen(true)).toBe(false);
  });

  it("verrou désarmé: la porte est ouverte", () => {
    expect(isHouseholdSignupOpen(false)).toBe(true);
  });
});
