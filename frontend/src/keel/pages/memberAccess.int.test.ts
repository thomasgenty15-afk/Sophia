import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MemberAccess } from "./HouseholdPage";
import type { HouseholdMemberView, LiveInvitation } from "../api/household";
import { PAGE_NAMESPACES } from "../i18n/catalog";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";

// ===========================================================================
// A5 §5.5 (2026-09-03) — L'ACCÈS SE LIT ET SE DONNE DEPUIS LA LIGNE
//
// ── CE QUE `InviteCard` FAISAIT, ET CE QU'ELLE NE FAISAIT PAS ─────────────
// Une carte en bas de page, avec un `<select>` qui redemandait « qui
// invites-tu ? » à quelqu'un qui regardait déjà les lignes portant ces
// prénoms. Elle ne RELISAIT rien: elle n'affichait que le jeton qu'elle venait
// de créer, donc une invitation envoyée la veille était invisible et le maître
// émettait un second lien sans savoir qu'un premier courait. Elle ne disait pas
// non plus ce que l'accès COÛTE, alors que c'est ce qu'il promet en écrivant.
//
// ── LES TROIS ÉTATS SONT DÉRIVÉS, ET C'EST CE QUE CE FICHIER GARDE ───────
// `user_id` non nul ⇒ réclamée · une invitation vivante ⇒ invitée · sinon ⇒
// libre. Un drapeau se désynchronise de la base; ces trois-là ne peuvent pas.
//
// ⚠️ ET « PAS LU » N'EST PAS « JAMAIS INVITÉE ». La ligne n'annonce aucune date
// tant que la lecture n'a pas eu lieu — sinon le maître renvoie un lien à
// quelqu'un qui vient d'en recevoir un.
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts`.
// ===========================================================================

const PATH = "/app/household";

const FREE: HouseholdMemberView = {
  memberId: "m-free",
  userId: null,
  role: "member",
  displayName: "Léa",
  ageState: "adult",
} as unknown as HouseholdMemberView;

const CLAIMED: HouseholdMemberView = {
  ...FREE,
  memberId: "m-claimed",
  userId: "u-1",
} as unknown as HouseholdMemberView;

const OWNER: HouseholdMemberView = {
  ...FREE,
  memberId: "m-owner",
  role: "owner",
} as unknown as HouseholdMemberView;

const MINOR: HouseholdMemberView = {
  ...FREE,
  memberId: "m-minor",
  ageState: "minor",
} as unknown as HouseholdMemberView;

const LIVE: LiveInvitation = {
  memberId: "m-free",
  email: "lea@example.test",
  createdAt: "2026-09-01T10:00:00.000Z",
  expiresAt: "2026-09-08T10:00:00.000Z",
};

function html(patch: Partial<Parameters<typeof MemberAccess>[0]> = {}): string {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: PATH, search: "", href: `http://localhost${PATH}` },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest("en");
  return renderToStaticMarkup(
    createElement(MemberAccess, {
      member: FREE,
      // LE DÉFAUT PAR DÉFAUT EST « MAÎTRE »: la plupart des cas de ce fichier
      // décrivent ce que le maître voit. Le lecteur NON-MAÎTRE a son propre
      // bloc, plus bas, et c'est lui qui tient la garde.
      viewerIsOwner: true,
      invitation: null,
      invitationsLoaded: true,
      busy: false,
      onDetach: () => {},
      onInvited: () => {},
      ...patch,
    }),
  );
}

function source(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

describe("les trois états, dérivés des faits", () => {
  it("réclamée: « a son accès », et le geste inverse est DÉTACHER", () => {
    const out = html({ member: CLAIMED });
    expect(out).toContain(en["household.access.claimed"]);
    expect(out).toContain(en["household.member.detach"]);
    // ⛔ « Retirer du foyer » DÉTRUIT la ligne: il n'est pas dans l'en-tête.
    expect(out, "le geste destructeur est offert dans l'en-tête")
      .not.toContain(en["household.member.remove"]);
    expect(out).not.toContain(en["household.access.invite"]);
  });

  it("invitée: la date et l'adresse, et le bouton dit « Renvoyer »", () => {
    const out = html({ invitation: LIVE });
    expect(out).toContain("2026-09-01");
    expect(out).toContain(LIVE.email);
    expect(out).toContain(en["household.access.resend"]);
    expect(out).not.toContain(en["household.access.claimed"]);
  });

  it("libre: « Inviter », et aucune date inventée", () => {
    const out = html({ invitation: null });
    expect(out).toContain(en["household.access.invite"]);
    expect(out).not.toContain(en["household.access.resend"]);
    expect(out).not.toContain("2026-09-01");
  });

  /**
   * ⛔ LE MAÎTRE N'A PAS D'ACCÈS À DONNER NI À RETIRER — il EST l'accès, et la
   * base refuse les deux gestes (`cannot_detach_owner`). Un bouton qui sera
   * refusé est un bouton mort.
   */
  it("le maître ne rend rien du tout", () => {
    expect(html({ member: OWNER })).toBe("");
  });

  /**
   * ⚠️ UNE BOUCHE MINEURE EST INVITABLE, comme avant ce lot. Rien ne
   * l'interdit en base, et facturer l'accès d'un enfant est une décision
   * commerciale NON PRISE (FF-049 §7): la restreindre ici serait la prendre.
   */
  it("une bouche mineure garde son bouton d'invitation", () => {
    expect(html({ member: MINOR })).toContain(en["household.access.invite"]);
  });
});

describe("⛔ CE QU'UN MEMBRE RÉCLAMÉ NE DOIT PAS VOIR SUR SA PROPRE LIGNE", () => {
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * CE BLOC EXISTE PARCE QUE TROIS TEXTES ONT MENTI, ET AUCUN TEST N'A MORDU.
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Livré le 2026-09-03, `MemberAccess` ne recevait AUCUN fait sur son
   * lecteur, et `MemberRow` le montait sans garde. Un membre réclamé lisait
   * donc sur sa propre ligne « A son accès » ET un bouton « Retirer son
   * accès » — que `keel_household_detach_member` refuse `not_owner`
   * (`20260811040000_household_detachment.sql:236`). Un bouton mort, à
   * l'endroit précis où le produit promet de ne pas en poser.
   *
   * ⚠️ CE QUI AFFIRMAIT LE CONTRAIRE: l'analyse §5.5 (« le maître seul voit
   * ces boutons »), le journal du lot (« aucun bouton d'invitation, aucun
   * retrait »), et le commentaire du fichier au site de montage. Trois
   * affirmations concordantes, toutes fausses.
   *
   * ⛔ ET LE TEST QUI AURAIT DÛ LE VOIR NE LE POUVAIT PAS. Il s'appelle « le
   * retrait … sont gardés » (`memberOwnRow.int.test.ts`), il LIT LA SOURCE, et
   * il ne listait que `household.member.remove` — jamais `.detach`. Un nom qui
   * couvre deux gestes, une assertion qui n'en vérifie qu'un.
   *
   * ⚠️ D'OÙ LA FORME DE CE BLOC: il MONTE le composant et lit le HTML RENDU.
   * Une lecture de source dit ce qui est écrit; seul un rendu dit ce qu'une
   * personne voit. C'est ce qui a trouvé le défaut, et c'est ce qui le garde.
   */
  it("réclamée, vue par un MEMBRE: l'état oui, le bouton NON", () => {
    const out = html({ member: CLAIMED, viewerIsOwner: false });
    // L'ÉTAT EST UN FAIT, et il se lit: c'est la seule phrase qui dise à cette
    // personne pourquoi elle peut éditer sa fiche.
    expect(out).toContain(en["household.access.claimed"]);
    // ⛔ LE GESTE EST AU MAÎTRE. La base refuse `not_owner`.
    expect(out, "un membre lit un bouton de détachement que la base refuse")
      .not.toContain(en["household.member.detach"]);
    // Et l'aide part avec le bouton: elle décrirait un geste indisponible.
    expect(out, "l'aide décrit un geste qui n'est pas offert")
      .not.toContain(en["household.member.detach_hint"]);
  });

  // LE CAS QUI PASSE, ET IL EST INDISPENSABLE: sans lui, un composant qui ne
  // rendrait JAMAIS ce bouton passerait la garde ci-dessus.
  it("réclamée, vue par le MAÎTRE: l'état ET le bouton", () => {
    const out = html({ member: CLAIMED, viewerIsOwner: true });
    expect(out).toContain(en["household.access.claimed"]);
    expect(out).toContain(en["household.member.detach"]);
    expect(out).toContain(en["household.member.detach_hint"]);
  });

  /**
   * ⛔ INVITER EST `not_owner` COMME DÉTACHER. Sur une ligne encore libre, un
   * membre ne voit ni le bouton, ni la date d'une invitation en cours: ce
   * n'est pas son foyer à administrer.
   */
  it("libre ou invitée, vue par un MEMBRE: rien du tout", () => {
    expect(html({ member: FREE, viewerIsOwner: false })).toBe("");
    expect(html({ member: FREE, invitation: LIVE, viewerIsOwner: false })).toBe("");
  });

  it("libre, vue par le MAÎTRE: le bouton est là", () => {
    expect(html({ member: FREE, viewerIsOwner: true }))
      .toContain(en["household.access.invite"]);
  });

  /**
   * LA GARDE EST CÂBLÉE, PAS SEULEMENT DISPONIBLE. Une prop requise que
   * personne ne passe est une prop qui vaut `undefined`, donc « pas maître »,
   * donc une fiche de maître amputée — l'inverse du défaut, tout aussi muet.
   */
  it("`MemberRow` la passe vraiment", () => {
    const src = source("./HouseholdPage.tsx");
    const at = src.indexOf("<MemberAccess");
    expect(at, "le bloc d'accès n'est plus monté").toBeGreaterThan(0);
    expect(src.slice(at, at + 500)).toContain("viewerIsOwner={viewerIsOwner}");
  });
});

describe("⛔ « pas lu » n'est pas « jamais invitée »", () => {
  it("lecture non faite: aucune date, et le bouton reste « Inviter »", () => {
    const out = html({ invitation: LIVE, invitationsLoaded: false });
    expect(out, "une date est annoncée sur une lecture qui n'a pas eu lieu")
      .not.toContain("2026-09-01");
    expect(out).toContain(en["household.access.invite"]);
    expect(out).not.toContain(en["household.access.resend"]);
  });
});

describe("ce que la ligne promet avant qu'on écrive", () => {
  /**
   * ⛔ AUCUN MONTANT RECOPIÉ (D5.8). Le produit a déjà vendu ce même accès 2 €
   * sur deux pages et 1,99 € sur une troisième: le chiffre reste une décision
   * humaine, et l'écran ne fait que LIRE `offer.extra` + `PRICES`.
   */
  it("le prix vient de la source unique, jamais d'un littéral", () => {
    const src = source("./HouseholdPage.tsx");
    expect(src).toContain('t("offer.extra"');
    expect(src).toContain("formatPrice(PRICES.claimedProfile)");
    // Un montant écrit à la main dans le fichier de la page.
    expect(src, "un montant est recopié dans la page")
      .not.toMatch(/[^.\d]1[,.]99|[^.\d]2[,.]00\s*€/);
  });

  it("le namespace `offer` est déclaré sur cette page", () => {
    // `pageSeams` refuse qu'une page atteigne un namespace non déclaré, et il a
    // raison: la couverture de locale se mesure par namespace.
    expect(PAGE_NAMESPACES[PATH]).toContain("offer");
  });
});

describe("ce qui ne traverse PAS le réseau, et ce qui n'est pas envoyé", () => {
  /**
   * ⛔ `token_hash` N'EST JAMAIS DEMANDÉ. Le jeton n'est rendu en clair qu'une
   * fois, par la RPC qui le crée; la colonne ne porte que son empreinte. La
   * lire la ferait traverser le réseau et vivre dans l'état d'un écran pour ne
   * RIEN afficher — un secret transporté sans usage est un secret de plus à
   * perdre.
   */
  it("la lecture des invitations ne demande pas `token_hash`", () => {
    const api = source("../api/household.ts");
    const at = api.indexOf("loadLiveInvitations");
    expect(at).toBeGreaterThan(0);
    const body = api.slice(at, at + 1200);
    expect(body).toContain(
      '"member_id, email, created_at, expires_at, consumed_at"',
    );
    expect(body, "`token_hash` est demandé à la base").not.toContain("token_hash");
    // ⚠️ SCOPÉE, MÊME AVEC RLS: `rls-is-not-a-substitute-for-eq-user-id`.
    expect(body).toContain('.eq("household_id", householdId)');
    // VIVANTE = non consommée ET non expirée. Les expirées ne sont jamais
    // purgées (trou n°11): ce filtre est ce qui les tient hors de l'écran.
    expect(body).toContain('.is("consumed_at", null)');
    expect(body).toContain('.gt("expires_at", nowIso)');
  });

  /**
   * ⛔ AUCUN E-MAIL N'EST ENVOYÉ PAR CE PRODUIT (FF-060 R7), et en local
   * `EMAIL_DELIVERY_ENABLED=1` porte une vraie clé Resend. L'écran rend le
   * lien, le fait copier, et ouvre un BROUILLON.
   */
  it("le geste de courrier est un `mailto:`, pas un envoi", () => {
    const src = source("./HouseholdPage.tsx");
    expect(src).toContain("`mailto:${encodeURIComponent(email.trim())}`");
    expect(src, "un envoi d'e-mail a été branché sur cette page")
      .not.toMatch(/sendInvitationEmail|functions\.invoke\(/);
  });

  it("`InviteCard` n'existe plus", () => {
    const src = source("./HouseholdPage.tsx");
    expect(src).not.toContain("function InviteCard(");
    expect(src).not.toContain("<InviteCard");
  });
});

describe("i18n: les clés de l'accès existent dans les deux packs", () => {
  const keys = [
    "household.access.claimed",
    "household.access.invite",
    "household.access.resend",
    "household.access.invited",
    "household.access.copy",
    "household.access.copied",
    "household.access.mail",
    "household.access.mail_subject",
  ] as const;

  it("aucune n'est absente, aucune n'est l'anglais recopié", () => {
    for (const k of keys) {
      expect(en[k], `${k} manque en anglais`).toBeTruthy();
      expect(fr[k], `${k} manque en français`).toBeTruthy();
      expect(fr[k], `${k} est l'anglais recopié`).not.toBe(en[k]);
    }
  });

  it("les deux trous de la phrase d'invitation sont les mêmes des deux côtés", () => {
    for (const hole of ["{date}", "{email}"]) {
      expect(en["household.access.invited"]).toContain(hole);
      expect(fr["household.access.invited"]).toContain(hole);
    }
  });
});
