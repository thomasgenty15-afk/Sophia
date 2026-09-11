import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { PAGE_NAMESPACES, TRANSLATED_NAMESPACES } from "../i18n/catalog";

// FF-063 LOT 1 — LA SORTIE DES E-MAILS DE CYCLE DE VIE.
//
// Ce que ce fichier garde, et pourquoi chaque épreuve existe:
//
//   · La distinction `unknown` / `unreachable`. C'est LA décision de la page.
//     Les confondre apprend à quelqu'un dont le réseau est tombé qu'il ne peut
//     pas se désinscrire — donc le pousse vers « spam », c'est-à-dire vers le
//     coût exact que cette page existe pour éviter.
//   · La forme du jeton refusée AVANT l'appel. Sans elle, un lien tronqué rend
//     un 400 PostgREST, que le client ne sait pas distinguer d'une panne.
//   · Les quatre sorties ont toutes leur copie, dans LES DEUX langues. Une
//     sortie sans texte est un écran blanc, et il tomberait sur la page où
//     personne n'est patient.
//   · La route est PUBLIQUE. Une garde de session ici annulerait la
//     fonctionnalité entière: on ne se connecte pas pour dire qu'on s'en va.

const REPO = path.join(process.cwd(), "..");
const APP_TSX = path.join(REPO, "frontend/src/App.tsx");

const VALID = "7f3a1c2e-9b44-4d1f-8a76-1e2d3c4b5a60";

describe("api/unsubscribe — ce qu'on décide sans parler au serveur", () => {
  it("un lien sans jeton n'est pas un jeton invalide", async () => {
    const { outcomeBeforeCall } = await import("../api/unsubscribe");
    expect(outcomeBeforeCall(null)).toBe("no_token");
    expect(outcomeBeforeCall(undefined)).toBe("no_token");
    expect(outcomeBeforeCall("")).toBe("no_token");
    expect(outcomeBeforeCall("   ")).toBe("no_token");
  });

  it("un jeton mal formé est refusé ici, jamais par un 400 de la base", async () => {
    const { outcomeBeforeCall } = await import("../api/unsubscribe");
    expect(outcomeBeforeCall("abc")).toBe("unknown");
    // Tronqué au copier-coller: le cas réel, et celui qui produisait le 400.
    expect(outcomeBeforeCall(VALID.slice(0, 30))).toBe("unknown");
    expect(outcomeBeforeCall(`${VALID}x`)).toBe("unknown");
  });

  it("un jeton bien formé n'est pas décidé sans appel", async () => {
    const { outcomeBeforeCall } = await import("../api/unsubscribe");
    expect(outcomeBeforeCall(VALID)).toBeNull();
    // Certains clients mail majusculent l'URL. C'est le même jeton.
    expect(outcomeBeforeCall(VALID.toUpperCase())).toBeNull();
    expect(outcomeBeforeCall(`  ${VALID}  `)).toBeNull();
  });
});

describe("api/unsubscribe — ce que la RPC rend, traduit en écran", () => {
  it("true coupe, false ne coupe pas", async () => {
    const { outcomeFromRpc } = await import("../api/unsubscribe");
    expect(outcomeFromRpc(true, null)).toBe("done");
    expect(outcomeFromRpc(false, null)).toBe("unknown");
  });

  it("une erreur de transport n'est JAMAIS un refus", async () => {
    const { outcomeFromRpc } = await import("../api/unsubscribe");
    expect(outcomeFromRpc(null, { message: "Failed to fetch" })).toBe("unreachable");
    // Le cas qui compte: l'erreur gagne, même si un corps traîne à côté.
    // L'inverse ferait dire « c'est coupé » alors que rien n'a été écrit.
    expect(outcomeFromRpc(true, { message: "boom" })).toBe("unreachable");
  });

  it("une réponse qui n'est pas un booléen ne prouve pas la coupure", async () => {
    const { outcomeFromRpc } = await import("../api/unsubscribe");
    expect(outcomeFromRpc(null, null)).toBe("unknown");
    expect(outcomeFromRpc(undefined, null)).toBe("unknown");
    expect(outcomeFromRpc("true", null)).toBe("unknown");
    expect(outcomeFromRpc(1, null)).toBe("unknown");
  });
});

describe("api/unsubscribe — l'appel", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    rpc.mockReset();
    vi.doMock("../../lib/supabase", () => ({ supabase: { rpc } }));
  });

  it("appelle la RPC nommée, avec le jeton nettoyé", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const { unsubscribeFromLifecycleEmails } = await import("../api/unsubscribe");
    await expect(unsubscribeFromLifecycleEmails(`  ${VALID}  `)).resolves.toBe("done");
    expect(rpc).toHaveBeenCalledWith("keel_lifecycle_unsubscribe", { p_token: VALID });
  });

  it("ne parle pas au serveur quand le jeton est absent ou mal formé", async () => {
    const { unsubscribeFromLifecycleEmails } = await import("../api/unsubscribe");
    await expect(unsubscribeFromLifecycleEmails("")).resolves.toBe("no_token");
    await expect(unsubscribeFromLifecycleEmails("abc")).resolves.toBe("unknown");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("un throw du transport rend `unreachable`, pas `unknown`", async () => {
    rpc.mockRejectedValue(new Error("network down"));
    const { unsubscribeFromLifecycleEmails } = await import("../api/unsubscribe");
    await expect(unsubscribeFromLifecycleEmails(VALID)).resolves.toBe("unreachable");
  });
});

describe("/unsubscribe — la page et sa langue", () => {
  // Le vocabulaire fermé, recopié ici EXPRÈS. Le dériver du type ne prouverait
  // rien: c'est justement l'ajout d'un cinquième cas sans copie qu'on attrape.
  const OUTCOMES = ["no_token", "unknown", "done", "unreachable"] as const;

  it("chaque sortie a son écran, dans les deux langues", () => {
    for (const outcome of OUTCOMES) {
      const title = `unsubscribe.${outcome}.title`;
      const body = `unsubscribe.${outcome}.body`;
      expect(Object.keys(en)).toContain(title);
      expect(Object.keys(en)).toContain(body);
      expect(Object.keys(fr)).toContain(title);
      expect(Object.keys(fr)).toContain(body);
    }
    // L'écran d'attente n'est pas une sortie, mais il s'affiche.
    expect(Object.keys(en)).toContain("unsubscribe.working.title");
    expect(Object.keys(fr)).toContain("unsubscribe.working.title");
  });

  it("dit ce qui CONTINUE d'arriver", () => {
    // Sans cette phrase, quelqu'un qui attend un reçu croit l'avoir coupé
    // lui-même — et c'est la réclamation qui suit qui coûte cher.
    expect(Object.keys(en)).toContain("unsubscribe.done.still");
    expect(Object.keys(fr)).toContain("unsubscribe.done.still");
  });

  it("la page est déclarée traduite, et son namespace aussi", () => {
    expect(Object.keys(PAGE_NAMESPACES)).toContain("/unsubscribe");
    expect(PAGE_NAMESPACES["/unsubscribe"]).toEqual(["unsubscribe"]);
    expect(TRANSLATED_NAMESPACES as readonly string[]).toContain("unsubscribe");
  });

  it("la route est PUBLIQUE — aucune garde autour", () => {
    const app = fs.readFileSync(APP_TSX, "utf8");
    const line = app
      .split("\n")
      .find((l) => l.includes('path="/unsubscribe"'));
    expect(line, "la route /unsubscribe est absente d'App.tsx").toBeTruthy();
    // Une garde s'écrirait en enveloppe autour de l'élément. Sur une seule
    // ligne, l'élément est nu.
    expect(line).toContain("<UnsubscribePage />");
    expect(line).not.toMatch(/Require|KeelStudentRoute|KeelHouseholdRoute|CoachRoute/);
  });

  it("la page n'ouvre jamais de session", async () => {
    const src = fs.readFileSync(
      path.join(REPO, "frontend/src/keel/pages/UnsubscribePage.tsx"),
      "utf8",
    );
    // `useAuth` ici transformerait une sortie en porte fermée: la personne qui
    // clique n'est, par construction, pas connectée.
    expect(src).not.toMatch(/useAuth|signInWith|auth\.getSession/);
  });
});
