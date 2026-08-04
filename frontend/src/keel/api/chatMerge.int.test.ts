// LA FUSION DE LA BULLE — les tests qui pinnent un défaut trouvé AU NAVIGATEUR.
//
// Le doublon d'affichage naît de la rencontre entre un état React et une
// livraison Realtime : aucun test unitaire écrit avant ne pouvait le voir,
// parce que la fusion vivait dans le composant. Elle est sortie pour ça.
//
// Ce que chaque test protège :
//   * « la ligne réelle chasse son écho » — le défaut mesuré : le message tapé
//     s'affichait DEUX fois ;
//   * « deux livraisons du même INSERT ne doublent pas » — deux onglets ouverts
//     sur le même compte (edge case n°1) ;
//   * « un écho encore en vol survit au refetch » — sinon le message qu'on
//     vient de taper clignote à chaque reconnexion (edge case n°2).

import { describe, expect, it } from "vitest";

import {
  type ChatMessage,
  mergeHistoryPage,
  mergeMessage,
  toChatMessage,
} from "./chat";

function msg(over: Partial<ChatMessage> & { id: string }): ChatMessage {
  return {
    role: "user",
    content: "hello",
    createdAt: "2026-08-04T12:00:00.000Z",
    buttons: [],
    ...over,
  };
}

describe("toChatMessage", () => {
  it("remonte client_message_id depuis les metadata", () => {
    // LA ligne qui manquait. Sans elle, la ligne réelle n'a aucun moyen de se
    // reconnaître dans son propre écho.
    const m = toChatMessage({
      id: "row-1",
      role: "user",
      content: "hi",
      created_at: "2026-08-04T12:00:00.000Z",
      metadata: { client_message_id: "c-1", channel: "in_app" },
    });
    expect(m.clientMessageId).toBe("c-1");
  });

  it("sans client_message_id, le champ reste absent (jamais une chaîne vide)", () => {
    const m = toChatMessage({
      id: "row-1",
      role: "assistant",
      content: "hi",
      created_at: "2026-08-04T12:00:00.000Z",
      metadata: {},
    });
    expect(m.clientMessageId).toBeUndefined();
  });

  it("lit les boutons, et ignore ceux qui sont mal formés", () => {
    const m = toChatMessage({
      id: "row-1",
      role: "assistant",
      content: "How was today?",
      created_at: "2026-08-04T12:00:00.000Z",
      metadata: {
        buttons: [
          { payload: "KEEL_PULSE_GOOD", label: "All good" },
          { payload: "", label: "vide" },
          { label: "sans payload" },
          "pas un objet",
          null,
        ],
      },
    });
    expect(m.buttons).toEqual([{ payload: "KEEL_PULSE_GOOD", label: "All good" }]);
  });

  it("metadata null ou boutons non-tableau: aucune exception", () => {
    const base = {
      id: "r",
      role: "assistant",
      content: "x",
      created_at: "2026-08-04T12:00:00.000Z",
    };
    expect(toChatMessage({ ...base, metadata: null }).buttons).toEqual([]);
    expect(toChatMessage({ ...base, metadata: { buttons: "nope" } }).buttons).toEqual([]);
  });
});

describe("mergeMessage", () => {
  it("LA LIGNE RÉELLE CHASSE SON ÉCHO (le défaut mesuré au navigateur)", () => {
    const echo = msg({
      id: "pending-c1",
      clientMessageId: "c1",
      pending: true,
      content: "Hi Sophia",
    });
    const real = msg({ id: "row-1", clientMessageId: "c1", content: "Hi Sophia" });
    const merged = mergeMessage([echo], real);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("row-1");
    expect(merged[0].pending).toBeUndefined();
  });

  it("deux livraisons Realtime du MÊME insert ne doublent pas", () => {
    const real = msg({ id: "row-1", clientMessageId: "c1" });
    expect(mergeMessage([real], real)).toHaveLength(1);
    // Et sans client_message_id non plus (un message assistant n'en a pas).
    const reply = msg({ id: "row-2", role: "assistant", content: "ok" });
    expect(mergeMessage([reply], reply)).toHaveLength(1);
  });

  it("un message d'un AUTRE tour n'est pas chassé", () => {
    const other = msg({ id: "row-0", clientMessageId: "c0", content: "précédent" });
    const real = msg({ id: "row-1", clientMessageId: "c1", content: "nouveau" });
    expect(mergeMessage([other], real)).toHaveLength(2);
  });

  it("le résultat reste trié chronologiquement", () => {
    const later = msg({ id: "b", createdAt: "2026-08-04T12:00:02.000Z", content: "2" });
    const earlier = msg({ id: "a", createdAt: "2026-08-04T12:00:01.000Z", content: "1" });
    expect(mergeMessage([later], earlier).map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("mergeHistoryPage", () => {
  it("un écho dont la ligne réelle est ARRIVÉE disparaît", () => {
    const echo = msg({ id: "pending-c1", clientMessageId: "c1", pending: true });
    const page = [msg({ id: "row-1", clientMessageId: "c1" })];
    const merged = mergeHistoryPage([echo], page);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("row-1");
  });

  it("un écho ENCORE EN VOL survit au refetch", () => {
    // Sinon le message qu'on vient de taper clignote à chaque reconnexion.
    const echo = msg({
      id: "pending-c2",
      clientMessageId: "c2",
      pending: true,
      createdAt: "2026-08-04T12:00:05.000Z",
    });
    const page = [msg({ id: "row-1", clientMessageId: "c1" })];
    const merged = mergeHistoryPage([echo], page);
    expect(merged.map((m) => m.id)).toEqual(["row-1", "pending-c2"]);
  });

  it("un envoi ÉCHOUÉ survit aussi: l'élève doit pouvoir le voir et réessayer", () => {
    const failed = msg({
      id: "pending-c3",
      clientMessageId: "c3",
      failed: true,
      createdAt: "2026-08-04T12:00:06.000Z",
    });
    expect(mergeHistoryPage([failed], []).map((m) => m.id)).toEqual(["pending-c3"]);
  });

  it("les messages déjà confirmés ne sont PAS dupliqués par le refetch", () => {
    // `previous` porte la ligne réelle; la page la porte aussi. Seule la page
    // compte — sinon chaque refetch doublerait tout l'historique.
    const real = msg({ id: "row-1", clientMessageId: "c1" });
    expect(mergeHistoryPage([real], [real])).toHaveLength(1);
  });
});
