import { describe, expect, it } from "vitest";

import {
  formatSeatEndDate,
  seatDisplayState,
  type SeatRow,
} from "./coachSeat";

const row = (over: Partial<SeatRow>): SeatRow => ({
  status: "active",
  scheduled_end_at: null,
  ...over,
});

describe("seatDisplayState", () => {
  it("un siège vivant sans rien de programmé est actif", () => {
    expect(seatDisplayState(row({}))).toBe("active");
  });

  // LE CAS QUI JUSTIFIE LA FONCTION. Un siège programmé est ENCORE
  // `status='active'` en base: rendre l'état depuis le seul statut afficherait
  // « actif » au coach qui vient de cliquer, et il recliquerait.
  it("un siège vivant avec une date programmée s'éteint", () => {
    expect(
      seatDisplayState(row({ scheduled_end_at: "2026-09-01T00:00:00Z" })),
    ).toBe("ending");
  });

  // La date échue ne suffit pas: tant que le balayeur n'a pas basculé la ligne,
  // la base dit `active` et Stripe facture. On ne montre pas « éteint » sur un
  // siège encore payant.
  it("une date échue mais non balayée reste 'ending', jamais 'paused'", () => {
    expect(
      seatDisplayState(row({ scheduled_end_at: "2020-01-01T00:00:00Z" })),
    ).toBe("ending");
  });

  it("un siège basculé est en pause", () => {
    expect(seatDisplayState(row({ status: "paused" }))).toBe("paused");
  });

  // `scheduled_end_at` est effacé par le balayeur en même temps que la bascule;
  // un résidu ne doit pas rouvrir le bouton d'annulation sur un siège éteint.
  it("un siège en pause reste en pause même avec un résidu de date", () => {
    expect(
      seatDisplayState(
        row({ status: "paused", scheduled_end_at: "2026-09-01T00:00:00Z" }),
      ),
    ).toBe("paused");
  });

  it("invité et terminé ne portent aucune action", () => {
    expect(seatDisplayState(row({ status: "invited" }))).toBe("other");
    expect(seatDisplayState(row({ status: "ended" }))).toBe("other");
    expect(seatDisplayState(null)).toBe("other");
  });
});

describe("formatSeatEndDate", () => {
  // LA BORNE EST LE PREMIER INSTANT DU MOIS SUIVANT, et le coach doit lire le
  // DERNIER JOUR COUVERT. Rendre le 1er septembre se lirait « il a encore
  // septembre » — l'inverse exact de ce qui va se passer.
  it("rend le dernier jour couvert, pas la borne", () => {
    expect(formatSeatEndDate("2026-09-01T00:00:00Z")).toBe("31 August 2026");
  });

  it("tient sur une frontière de février", () => {
    expect(formatSeatEndDate("2026-03-01T00:00:00Z")).toBe("28 February 2026");
  });

  it("rend null quand il n'y a rien à afficher", () => {
    expect(formatSeatEndDate(null)).toBeNull();
    expect(formatSeatEndDate("pas une date")).toBeNull();
  });
});
