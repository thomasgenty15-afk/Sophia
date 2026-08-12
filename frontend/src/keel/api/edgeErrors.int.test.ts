import { describe, expect, it } from "vitest";

import { EDGE_GATE_UNAUTHORIZED, readEdgeRefusal } from "./edgeErrors";
import { edgeRefusalKey } from "../copy/planRefusals";

/**
 * D3 — LA SESSION PÉRIMÉE, LE CAS LE PLUS BANAL, ET LE SEUL SANS PHRASE.
 *
 * ── CE QUI A ÉTÉ MESURÉ ────────────────────────────────────────────────────
 * Deux 401 sortent de la même porte, et ils n'ont PAS le même corps:
 *
 *   · sans en-tête `Authorization`      → {"error":"Unauthorized"}  → traduit
 *   · avec un `Authorization` périmé    → {"msg":"Invalid JWT"}     → rien
 *
 * Le second est celui d'un utilisateur réel qui laisse son onglet ouvert. Il
 * n'avait pas de clé `error`, les deux lecteurs de corps du dépôt rendaient
 * `null`, et l'écran affichait la phrase de supabase-js — « Edge Function
 * returned a non-2xx status code ».
 *
 * ── POURQUOI ON LIT LE STATUT, ET JAMAIS LA PROSE ─────────────────────────
 * `Invalid JWT` est un piège nommé de ce dépôt: en local, il vient de
 * l'ALGORITHME DE SIGNATURE de la pile, pas de l'écran (docs/keel/JWT-HS256.md).
 * Recopier cette phrase à l'écran enverrait l'utilisateur — et le prochain
 * développeur qui la lit dans un rapport de bug — sur une fausse piste qui a
 * déjà coûté des journées. Un matcher maison sur du texte serveur est de toute
 * façon une dette (« laitue » vs « lait »): la phrase change, la garde tombe
 * sans bruit. Le statut, lui, est structurel.
 *
 * ⚠️ LE DÉCOR DOIT SÉPARER: un lecteur qui rendrait `Unauthorized` sur TOUT
 * corps illisible passerait un test qui ne montre que des 401. Les 500 sont
 * donc là, avec exactement les mêmes corps.
 */

function invokeError(status: number, body: string): unknown {
  return {
    message: "Edge Function returned a non-2xx status code",
    context: new Response(body, {
      status,
      headers: { "content-type": "application/json" },
    }),
  };
}

describe("readEdgeRefusal", () => {
  it("rend le jeton nommé du serveur, avec son détail", async () => {
    const refusal = await readEdgeRefusal(
      invokeError(402, JSON.stringify({ error: "household_frozen", detail: "since 3 Aug" })),
    );
    expect(refusal).toEqual({ token: "household_frozen", detail: "since 3 Aug" });
  });

  it("rend le jeton seul quand le serveur n'a pas de détail", async () => {
    const refusal = await readEdgeRefusal(
      invokeError(422, JSON.stringify({ error: "goal_required" })),
    );
    expect(refusal).toEqual({ token: "goal_required", detail: null });
  });

  it("LE CAS MESURÉ: un 401 sans clé `error` nomme quand même la session", async () => {
    const refusal = await readEdgeRefusal(
      invokeError(401, JSON.stringify({ msg: "Invalid JWT" })),
    );
    expect(refusal?.token).toBe(EDGE_GATE_UNAUTHORIZED);
    // …et ce jeton-là a des mots. C'est la moitié qui compte: rendre un jeton
    // que personne ne traduit n'aurait fait que déplacer le jargon.
    expect(edgeRefusalKey(refusal?.token ?? "")).toBe(
      "plan.validate.error.not_authenticated",
    );
  });

  it("dit la même chose des deux 401, qui n'ont pas le même corps", async () => {
    const withToken = await readEdgeRefusal(
      invokeError(401, JSON.stringify({ error: "Unauthorized" })),
    );
    const withoutToken = await readEdgeRefusal(
      invokeError(401, JSON.stringify({ msg: "Invalid JWT" })),
    );
    expect(withoutToken?.token).toBe(withToken?.token);
  });

  it("ne recopie AUCUN mot du serveur dans ce qu'il rend", async () => {
    // La phrase du portail ne doit pas voyager: elle n'est pas traduite, elle
    // change de version en version, et « Invalid JWT » en particulier envoie
    // sur la fausse piste de l'algorithme de signature local.
    const refusal = await readEdgeRefusal(
      invokeError(401, JSON.stringify({ msg: "Invalid JWT: token is expired" })),
    );
    expect(JSON.stringify(refusal)).not.toContain("JWT");
    expect(refusal?.detail).toBeNull();
  });

  it("un 401 au corps illisible reste un 401", async () => {
    expect((await readEdgeRefusal(invokeError(401, "<html>gateway</html>")))?.token)
      .toBe(EDGE_GATE_UNAUTHORIZED);
  });

  // ── CE QUI SÉPARE: une panne n'est pas une session perdue ─────────────────
  it("ne baptise PAS une panne 500 sans jeton", async () => {
    expect(await readEdgeRefusal(invokeError(500, JSON.stringify({ msg: "boom" }))))
      .toBeNull();
  });

  it("ne baptise pas non plus un 500 au corps illisible", async () => {
    expect(await readEdgeRefusal(invokeError(500, "<html>oops</html>"))).toBeNull();
  });

  it("rend null quand il n'y a aucun corps à lire", async () => {
    expect(await readEdgeRefusal(new Error("network down"))).toBeNull();
    expect(await readEdgeRefusal(null)).toBeNull();
    expect(await readEdgeRefusal({ context: { status: 401 } })).toBeNull();
  });
});
