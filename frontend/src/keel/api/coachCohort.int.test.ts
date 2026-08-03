import { describe, expect, it } from "vitest";
import {
  CONTACT_SILENT_AFTER_HOURS,
  CONTACT_SLIPPING_AFTER_HOURS,
  contactStateFor,
  countActiveSeats,
  countPendingInvitations,
} from "./coachCohort";

const NOW = new Date("2026-08-03T12:00:00.000Z");
const hoursAgo = (h: number) =>
  new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe("cohort contact state", () => {
  it("opens `slipping` exactly where the nudge fires", () => {
    // 48h is the state the re-engagement loop acts on (§1.3). If the screen
    // opened later, a coach would read "in touch" about a student the system
    // has already decided to chase.
    expect(contactStateFor(hoursAgo(2), NOW)).toBe("responsive");
    expect(contactStateFor(hoursAgo(47), NOW)).toBe("responsive");
    expect(contactStateFor(hoursAgo(CONTACT_SLIPPING_AFTER_HOURS), NOW)).toBe("slipping");
    expect(contactStateFor(hoursAgo(119), NOW)).toBe("slipping");
    expect(contactStateFor(hoursAgo(CONTACT_SILENT_AFTER_HOURS), NOW)).toBe("silent");
  });

  it("treats never-spoken and unreadable as silent, never as in touch", () => {
    expect(contactStateFor(null, NOW)).toBe("silent");
    expect(contactStateFor(undefined, NOW)).toBe("silent");
    expect(contactStateFor("not-a-date", NOW)).toBe("silent");
  });
});

describe("seat counting", () => {
  it("counts ONLY active links, so screen and invoice cannot diverge", () => {
    const clients = [
      { status: "active" },
      { status: "active" },
      { status: "invited" },
      { status: "paused" },
      { status: "ended" },
    ];
    expect(countActiveSeats(clients)).toBe(2);
    expect(countPendingInvitations(clients)).toBe(1);
  });

  it("an empty roster costs nothing", () => {
    expect(countActiveSeats([])).toBe(0);
    expect(countPendingInvitations([])).toBe(0);
  });
});
