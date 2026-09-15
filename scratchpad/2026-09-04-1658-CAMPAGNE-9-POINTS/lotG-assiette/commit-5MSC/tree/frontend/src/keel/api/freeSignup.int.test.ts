import { describe, expect, it } from "vitest";
import {
  FREE_SIGNUP_INTENT,
  freeSignupMetadata,
  isAlreadyRegistered,
  isDeclaredCountryValid,
  joinRefusalMessageKey,
  signUpOutcome,
} from "./freeSignup";
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
      locale: "en-US",
    });
    // Les noms sont assertés LITTÉRALEMENT: c'est le contrat avec
    // `raw_user_meta_data->>'keel_signup_intent'` et `->>'country'`.
    expect(meta.keel_signup_intent).toBe("student_free");
    expect(meta.country).toBe("GB");
  });

  it("porte la langue CHOISIE, telle quelle, dans les deux sens", () => {
    // ── CE QUE CE TEST REMPLACE, ET POURQUOI ────────────────────────────────
    // Il asservissait `meta.locale` à `"en-US"` et à la constante
    // `PRODUCT_LOCALE`. Les deux ont disparu: la langue est maintenant un CHOIX
    // fait au drapeau, et le seul défaut possible ici serait qu'elle ne
    // traverse pas — un repli codé en dur, une clé oubliée, une valeur figée.
    //
    // D'où les DEUX sens. Une assertion sur le seul français resterait verte
    // devant `locale: "fr-FR"` écrit en dur dans le constructeur, ce qui est
    // exactement la faute qu'on vient de retirer, retournée.
    for (const chosen of ["fr-FR", "en-US", "fr-GB"]) {
      const meta = freeSignupMetadata({
        fullName: "Ada",
        country: "US",
        timezone: "America/New_York",
        locale: chosen,
      });
      expect(meta.locale).toBe(chosen);
    }
  });

  it("n'omet JAMAIS la clé `locale`", () => {
    // Le défaut que celle-ci attrape est muet et durable: sans la clé,
    // `handle_new_user` retombe sur son défaut legacy `'fr-FR'` — que personne
    // n'a choisi — et le compte parle français pour toujours sans qu'une seule
    // erreur soit levée nulle part.
    const meta = freeSignupMetadata({
      fullName: "Ada",
      country: "US",
      timezone: "UTC",
      locale: "en-US",
    });
    expect(Object.keys(meta)).toContain("locale");
  });

  it("carries the browser timezone, because no server value would be honest", () => {
    const meta = freeSignupMetadata({
      fullName: "Ada",
      country: "US",
      timezone: "Asia/Singapore",
      locale: "en-US",
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
      locale: "en-US",
    });
    expect(meta.full_name).toBe("Ada");
  });

  it("never omits country, whatever else is empty", () => {
    // Le cas qui compte: le trigger REFUSE de rattacher sans pays. Si cette clé
    // disparaissait, chaque inscrit libre sortirait sans coach, sans erreur.
    const meta = freeSignupMetadata({ fullName: "", country: "FR", timezone: "UTC", locale: "en-US" });
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

  it("REFUSE la chaîne vide — la garde qui survit au retrait du sélecteur", () => {
    // ⚠️ CE TEST CITAIT `NO_COUNTRY_SELECTED`, QUI N'EXISTE PLUS. Il gardait
    // l'état initial des trois sélecteurs de pays contre un « US » de confort:
    // mesuré le 2026-08-12, un compte créé sans toucher le champ partait avec
    // `country='US'` sous une aide qui promettait le bon numéro d'urgence.
    //
    // Les sélecteurs sont partis — le pays se déduit du fuseau — mais la
    // propriété reste la bonne, et pour une raison DIFFÉRENTE: la déduction
    // peut rendre du vide (fuseau inconnu ET navigateur sans région), et du
    // vide écrit en base rouvrirait exactement le même trou. C'est
    // `countryFromTimezone.int.test.ts` qui prouve qu'elle n'en rend jamais;
    // celui-ci garde la forme que ce test-là interroge.
    expect(isDeclaredCountryValid("")).toBe(false);
  });
});

describe("signUpOutcome", () => {
  // POURQUOI CE BLOC EXISTE: `supabase/config.toml` porte
  // `enable_confirmations = false` en local, donc `signUp` y ouvre TOUJOURS une
  // session et la branche « vérifie tes mails » ne se joue jamais sur un poste
  // de dev. Elle n'a longtemps été vérifiée que par LECTURE — c'est-à-dire pas
  // vérifiée: une condition inversée serait partie en production intacte, et le
  // premier à s'en apercevoir aurait été quelqu'un qu'on ne voit pas.
  //
  // On ne touche pas à `config.toml` pour l'observer: c'est un fichier partagé
  // qui part en prod, et changer le comportement de l'auth de toute l'équipe
  // pour regarder un écran n'est pas un prix qu'on paie.

  it("un utilisateur SANS session = la confirmation d'e-mail", () => {
    expect(signUpOutcome({ user: { id: "u1" }, session: null })).toBe("check_email");
  });

  it("un utilisateur AVEC session = on rejoue le rattachement", () => {
    // La RPC est idempotente: elle ne fait rien si le trigger a réussi, et
    // répare s'il a échoué. C'est pour ça qu'on la rejoue sans condition.
    expect(signUpOutcome({ user: { id: "u1" }, session: { access_token: "t" } }))
      .toBe("attach");
  });

  it("aucun utilisateur = aucun écran de succès, quoi qu'il arrive", () => {
    // La faute qu'on refuse de rejouer: sur /join, un message technique sous un
    // bouton « Accepter » a fait repartir quelqu'un en croyant avoir rejoint.
    // Ici, pas d'utilisateur veut dire pas d'écran « c'est bon, tu y es ».
    expect(signUpOutcome({ user: null, session: null })).toBe("nothing");
    expect(signUpOutcome({ user: null, session: { access_token: "t" } })).toBe("nothing");
    expect(signUpOutcome(null)).toBe("nothing");
    expect(signUpOutcome(undefined)).toBe("nothing");
  });
});

describe("joinRefusalMessageKey", () => {
  it("maps every refusal the RPC can emit to a real message", () => {
    // ⚠️ `country_required` A QUITTÉ CETTE LISTE, ET LA RAISON EST ÉCRITE.
    //
    // Ces trois-là sont des refus que la personne peut COMPRENDRE et sur
    // lesquels elle peut agir: elle suit déjà un coach, elle est elle-même
    // coach, le coach maison est indisponible. Chacun mérite donc sa phrase, et
    // retomber sur le message générique serait une perte d'information — c'est
    // ce que cette assertion garde.
    //
    // `country_required` n'en est plus un. Le pays n'est plus saisi: il est
    // déduit du fuseau. Ce refus ne peut donc plus vouloir dire « vous n'avez
    // pas répondu » — il veut dire que NOTRE déduction a produit une valeur que
    // la base rejette. Lui donner une phrase à lui reviendrait à demander à
    // quelqu'un de corriger un champ qu'il n'a jamais vu; il est rangé avec les
    // pannes, dont la phrase invite à réessayer. Le cas est tenu ci-dessous.
    const reasons = [
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

  it("`country_required` est traité comme une PANNE, pas comme une question", () => {
    // La contrepartie de la carve-out ci-dessus, écrite plutôt que sous-entendue:
    // le refus reste RECONNU (il n'atterrit pas dans le repli « motif inconnu »
    // par accident), et sa phrase existe.
    const key = joinRefusalMessageKey("country_required");
    expect(key).toBe("start.error.generic");
    expect(en[key]).toBeTruthy();
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
