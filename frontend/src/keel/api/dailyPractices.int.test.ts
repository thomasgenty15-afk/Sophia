import { describe, expect, it } from "vitest";

import {
  blockedSentence,
  canAddPractice,
  MAX_DAILY_PRACTICES,
  practiceReach,
  type PracticeRow,
  rotationLengthDays,
} from "./dailyPractices";

const row = (over: Partial<PracticeRow> = {}): PracticeRow => ({
  label: "4 glasses of water across the day",
  kind: "hydration",
  quantified: true,
  target: 4,
  unit: "glasses",
  goal_scope: [],
  cadence: "rotating",
  askable: true,
  minor_safe: true,
  brief: "Water is the cheapest lever this coach has.",
  status: "active",
  collides_with: null,
  ...over,
});

describe("practiceReach", () => {
  it("une portée vide se lit « Everyone », pas comme un vide", () => {
    // Le cas de l'écrasante majorité des pratiques. Un champ vide donnerait au
    // coach l'impression d'un travail inachevé sur ce qu'il a fait exprès.
    expect(practiceReach(row())).toBe("Everyone");
  });

  it("une portée nommée se lit dans les mots du coach", () => {
    expect(practiceReach(row({ goal_scope: ["fat_loss"] }))).toBe("Fat loss");
  });

  // Deux objectifs se JOIGNENT par un mot, jamais par une virgule finale: le
  // dernier séparateur d'une liste n'est pas le même d'une langue à l'autre
  // (`common.list_pair`, comme les jours nommés de `api/labels.ts`).
  it("deux objectifs se lisent comme une phrase, pas comme un CSV", () => {
    expect(practiceReach(row({ goal_scope: ["fat_loss", "maintenance"] })))
      .toBe("Fat loss and Maintenance");
  });

  // LE CAS QUI JUSTIFIE LA FONCTION. La portée et le statut sont vrais en même
  // temps: rendre la portée seule afficherait « Fat loss » sur une pratique
  // que personne ne reçoit, et le coach conclurait que ses élèves l'ont eue.
  it("le statut GAGNE sur la portée: une pratique en relecture n'atteint personne", () => {
    expect(practiceReach(row({ goal_scope: ["fat_loss"], status: "needs_review" })))
      .toBe("Nobody yet — it is waiting for your review");
    expect(
      practiceReach(row({
        goal_scope: ["fat_loss"],
        status: "blocked",
        collides_with: "weight_readout",
      })),
    ).toBe("Nobody — this one is blocked");
  });

  it("`minor_safe: false` SOUSTRAIT, il ne remplace pas la portée", () => {
    // Sans cette distinction, « Everyone » se lirait « y compris les mineurs »,
    // ce qui est exactement l'inverse de ce que la ligne dit.
    expect(practiceReach(row({ minor_safe: false }))).toBe("Everyone, adults only");
    expect(practiceReach(row({ goal_scope: ["muscle_gain"], minor_safe: false })))
      .toBe("Muscle gain, adults only");
  });

  it("un objectif que ce build ne connaît pas n'invente pas un libellé", () => {
    expect(practiceReach(row({ goal_scope: ["cutting_weight_for_a_fight"] }))).toBe("Everyone");
  });
});

describe("blockedSentence", () => {
  // R9: « on bloque uniquement en collision avec une ceinture existante, ET ON
  // LA NOMME ». Un blocage muet se vit comme de l'arbitraire.
  it("nomme la ceinture, et dit pourquoi elle existe", () => {
    expect(blockedSentence("weight_readout")).toContain("read a scale");
    expect(blockedSentence("calorie_readout")).toContain("count calories");
    expect(blockedSentence("streak_display")).toContain("streak");
    expect(blockedSentence("adherence_score")).toContain("score");
  });

  it("rend null quand il n'y a rien à nommer", () => {
    expect(blockedSentence(null)).toBeNull();
    expect(blockedSentence("something_invented")).toBeNull();
  });
});

describe("le plafond et la rotation", () => {
  it("le septième ajout est le dernier (R2)", () => {
    const full = Array.from({ length: MAX_DAILY_PRACTICES }, () => row());
    expect(canAddPractice(full.slice(0, MAX_DAILY_PRACTICES - 1))).toBe(true);
    expect(canAddPractice(full)).toBe(false);
  });

  it("le cycle ne compte QUE ce qui part réellement", () => {
    // Annoncer un cycle de 4 soirs quand une des quatre est en relecture ferait
    // attendre au coach un retour qui n'arrive jamais.
    expect(rotationLengthDays([row(), row(), row()])).toBe(3);
    expect(rotationLengthDays([row({ cadence: "constant" }), row(), row()])).toBe(4);
    expect(rotationLengthDays([row(), row({ status: "needs_review" }), row({ status: "blocked" })]))
      .toBe(1);
  });
});
