import { assertEquals } from "jsr:@std/assert@1";

import { assessBirthDate } from "./student_age.ts";
import {
  canInvite,
  canRestrict,
  goalVisibility,
  type HouseholdMemberSnapshot,
  isMinorMember,
} from "./household.ts";

const TODAY = "2026-08-08";

function member(
  userId: string,
  opts: {
    role?: "owner" | "member";
    birth?: string | null;
    consented?: boolean;
  } = {},
): HouseholdMemberSnapshot {
  return {
    userId,
    role: opts.role ?? "member",
    birthDateVerdict: assessBirthDate(opts.birth ?? null, TODAY),
    restrictionConsentAt: opts.consented ? "2026-08-01T10:00:00Z" : null,
  };
}

const OWNER = member("owner", { role: "owner", birth: "1985-04-02" });
const ADULT = member("adult", { birth: "1990-06-11" });
const ADULT_OK = member("adult", { birth: "1990-06-11", consented: true });
const KID = member("kid", { birth: "2014-03-20" });

// ───────────────────────────────────────────────────────────────────────────
// LE MODE DU FOYER PASSE AVANT TOUT LE RESTE
// ───────────────────────────────────────────────────────────────────────────

Deno.test("hors mode famille, personne ne restreint personne — pas même un mineur", () => {
  // LE CAS QUI COÛTERAIT LE PLUS CHER SI ON LE RATAIT: tous les autres feux
  // sont au vert (compte maître, cible mineure), et la réponse reste non. Un
  // ordre de tests différent laisserait passer une colocation où quelqu'un
  // verrouille l'alimentation de l'autre.
  assertEquals(canRestrict("shared", OWNER, KID), {
    allowed: false,
    reason: "not_a_family",
  });
});

Deno.test("hors mode famille, un majeur consentant reste intouchable", () => {
  // Le consentement ne rachète PAS le mode. Sinon « shared + accord » serait
  // une porte dérobée vers le pouvoir domestique dans une colocation.
  assertEquals(canRestrict("shared", OWNER, ADULT_OK), {
    allowed: false,
    reason: "not_a_family",
  });
});

// ───────────────────────────────────────────────────────────────────────────
// QUI AGIT
// ───────────────────────────────────────────────────────────────────────────

Deno.test("un membre n'est pas un compte maître", () => {
  const sibling = member("sibling");
  assertEquals(canRestrict("family", sibling, KID), {
    allowed: false,
    reason: "not_owner",
  });
});

Deno.test("le compte maître ne se restreint pas lui-même par ce chemin", () => {
  // Ce n'est pas un interdit moral: c'est que « je ne veux plus de chips chez
  // moi » est une PRÉFÉRENCE alimentaire, qui a déjà son chemin, et qui n'a
  // rien à faire dans la table du pouvoir domestique. Les confondre ferait
  // apparaître « posée par toi » sur ses propres goûts.
  assertEquals(canRestrict("family", OWNER, OWNER), {
    allowed: false,
    reason: "self",
  });
});

// ───────────────────────────────────────────────────────────────────────────
// LE MINEUR, LE MAJEUR, ET CELUI DONT ON NE SAIT RIEN
// ───────────────────────────────────────────────────────────────────────────

Deno.test("un mineur est restreignable", () => {
  assertEquals(canRestrict("family", OWNER, KID), { allowed: true });
});

Deno.test("un majeur SANS accord ne l'est pas — c'est le défaut", () => {
  assertEquals(canRestrict("family", OWNER, ADULT), {
    allowed: false,
    reason: "adult_without_consent",
  });
});

Deno.test("un majeur qui a donné son accord l'est", () => {
  assertEquals(canRestrict("family", OWNER, ADULT_OK), { allowed: true });
});

Deno.test("une date ABSENTE vaut majeur, donc non restreignable sans accord", () => {
  // LA DIRECTION CONTRE-INTUITIVE, ET C'EST POUR ÇA QU'ELLE EST TESTÉE.
  // « On ne sait pas » ne doit PAS donner au compte maître un pouvoir sur
  // quelqu'un qui n'a rien renseigné. Le jumeau SQL (`keel_household_is_minor`)
  // rend `false` pour la même raison, et le test de la base le pinne aussi:
  // deux implémentations de la même règle, deux tests qui la disent.
  const unknown = member("unknown", { birth: null });
  assertEquals(isMinorMember(unknown), false);
  assertEquals(canRestrict("family", OWNER, unknown), {
    allowed: false,
    reason: "adult_without_consent",
  });
});

Deno.test("une date ABERRANTE vaut aussi majeur", () => {
  // `assessBirthDate` distingue `unreadable` / `future` / `implausible` de
  // `minor`, et aucun de ces trois n'est un enfant. Un module qui aurait
  // testé `status !== "adult"` aurait rendu restreignable tout profil au
  // format cassé.
  const broken = member("broken", { birth: "pas-une-date" });
  assertEquals(isMinorMember(broken), false);
  assertEquals(canRestrict("family", OWNER, broken), {
    allowed: false,
    reason: "adult_without_consent",
  });
});

Deno.test("le jour des 18 ans, la restriction tombe", () => {
  // Les enfants grandissent (PIVOT-FOYER §8.5). L'âge se relit à chaque
  // décision; un booléen figé à l'entrée dans le foyer survivrait à sa cause.
  const justEighteen = member("teen", { birth: "2008-08-08" });
  assertEquals(isMinorMember(justEighteen), false);
  assertEquals(canRestrict("family", OWNER, justEighteen), {
    allowed: false,
    reason: "adult_without_consent",
  });

  const dayBefore = member("teen", { birth: "2008-08-09" });
  assertEquals(isMinorMember(dayBefore), true);
  assertEquals(canRestrict("family", OWNER, dayBefore), { allowed: true });
});

// ───────────────────────────────────────────────────────────────────────────
// CE QU'ON VOIT DE L'OBJECTIF D'UN AUTRE
// ───────────────────────────────────────────────────────────────────────────

Deno.test("en colocation, l'objectif d'un autre ne se montre pas", () => {
  assertEquals(goalVisibility("shared", ADULT, OWNER), "own_only");
});

Deno.test("en famille, l'objectif d'un autre se montre", () => {
  assertEquals(goalVisibility("family", ADULT, OWNER), "full");
});

Deno.test("chacun voit toujours le sien, y compris en colocation", () => {
  assertEquals(goalVisibility("shared", ADULT, ADULT), "full");
});

Deno.test("seul le compte maître invite", () => {
  assertEquals(canInvite(OWNER), true);
  assertEquals(canInvite(ADULT), false);
});
