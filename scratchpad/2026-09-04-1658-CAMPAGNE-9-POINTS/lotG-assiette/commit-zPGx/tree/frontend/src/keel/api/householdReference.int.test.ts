import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { referenceMemberId } from "../../../../supabase/functions/_shared/keel/household_composition.ts";

/**
 * LA CARTE EST PARTIE, LE MOTEUR RESTE — ET ON LE PROUVE, ON NE LE RAISONNE PAS.
 *
 * ── CE QUI A ÉTÉ RETIRÉ LE 2026-08-14 ─────────────────────────────────────
 * `components/plan/ReferenceMemberCard.tsx` (« quelle façon de manger le plat
 * commun suit »), son montage dans `StudentWeekPlanPage`, et le wrapper client
 * `setReferenceMember` devenu orphelin. La carte demandait d'arbitrer entre
 * deux méthodes en annonçant que ça changeait « ce qu'on cuisine » — SANS
 * JAMAIS MONTRER L'AUTRE VERSION.
 *
 * ── POURQUOI CE RETRAIT EST SÛR, ET CE QUE CE FICHIER ÉPINGLE ─────────────
 * Le retrait laisse `households.reference_member_id` à NULL sur tout foyer
 * neuf. C'est SÛR uniquement parce que la résolution est une cascade déjà
 * écrite, dont le défaut est LE MEMBRE QUI COMPOSE LA SESSION — le maître,
 * c'est-à-dire le cas courant et le bon défaut.
 *
 * ⚠️ CE FICHIER IMPORTE LE MODULE SERVEUR, IL N'EN RECOPIE PAS LA RÈGLE. Le
 * patron est celui de `api/servingDivergence.ts` et de `lib/groceryWaves.ts`,
 * en production depuis le 2026-08-10: une seconde définition d'une même règle
 * est une divergence en attente, et celle qu'on regarde le moins garde
 * l'ancien comportement. La clôture d'imports de `household_composition.ts`
 * est pure (`meal_envelope.ts`, et trois imports de TYPE), sans spécificateur
 * `jsr:`/`npm:`/`https:` ni global `Deno.`.
 *
 * ⚠️ ET LA MOITIÉ QUI SE PERD LE PLUS VITE: un retrait se prouve par l'ABSENCE
 * D'APPELANT, pas par l'intention. La seconde moitié de ce fichier relit les
 * sources COMMENTAIRES RETIRÉS — ce dépôt a mesuré qu'un grep naïf compte les
 * morts comme des vivants, et les deux fichiers touchés PARLENT longuement de
 * la règle en commentaire.
 */

describe("la cascade du membre de référence est intacte", () => {
  const members = [
    { memberId: "owner", displayName: "ILi", ageState: "adult" as const },
    { memberId: "second", displayName: "Christèle", ageState: "adult" as const },
    { memberId: "kid", displayName: "Théo", ageState: "minor" as const },
  ];

  /**
   * LE CAS QUI FAIT TOUT LE TEST. C'est l'état dans lequel le retrait laisse
   * chaque foyer neuf: aucun référent déclaré, parce qu'il n'existe plus
   * d'écran pour en déclarer un.
   */
  it("sans référent déclaré, le composeur gouverne — le défaut, pas un vide", () => {
    expect(referenceMemberId(members, null, "owner")).toBe("owner");
    // Et il gouverne QUEL QUE SOIT le composeur: le geste de composer est
    // visible de tous, donc aucun objectif ne fuit par la présence du référent.
    expect(referenceMemberId(members, null, "second")).toBe("second");
  });

  it("un référent DÉJÀ déclaré continue de gouverner — le retrait n'efface rien", () => {
    // Un foyer sur vingt en porte un en base au 2026-08-14. La carte partie,
    // la colonne garde sa valeur et le moteur la lit comme avant: le retrait
    // enlève l'ÉCRIVAIN, jamais la donnée écrite.
    expect(referenceMemberId(members, "second", "owner")).toBe("second");
  });

  it("un mineur ne gouverne ni par déclaration ni par défaut", () => {
    expect(referenceMemberId(members, "kid", "owner")).toBe("owner");
    expect(referenceMemberId(members, null, "kid")).toBeNull();
  });

  it("ni référent ni composeur ⇒ null, et le tronc se compose sans doctrine de référence", () => {
    expect(referenceMemberId(members, null, null)).toBeNull();
  });
});

describe("plus aucun écrivain de la référence côté navigateur (câblage)", () => {
  const ROOT = resolve(__dirname, "../../../..");

  /** ⚠️ COMMENTAIRES RETIRÉS — cicatrice `caller-audit-must-strip-comments`. */
  function code(rel: string): string {
    return readFileSync(resolve(ROOT, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .split("\n")
      .map((line) => {
        const at = line.indexOf("//");
        if (at < 0) return line;
        if (at > 0 && line[at - 1] === ":") return line;
        return line.slice(0, at);
      })
      .join("\n");
  }

  it("`api/household.ts` n'appelle plus la RPC d'écriture", () => {
    const src = code("frontend/src/keel/api/household.ts");
    expect(src, "le wrapper d'écriture est revenu").not.toContain(
      "keel_household_set_reference_member",
    );
    expect(src, "`setReferenceMember` a un corps de nouveau").not.toContain(
      "export async function setReferenceMember",
    );
  });

  it("l'écran du plan ne monte plus la carte et n'importe plus l'écrivain", () => {
    const src = code("frontend/src/keel/pages/StudentWeekPlanPage.tsx");
    expect(src, "la carte est remontée").not.toContain("ReferenceMemberCard");
    expect(src, "l'écrivain est réimporté").not.toContain("setReferenceMember");
  });

  /**
   * ⛔ LA GARDE INVERSE, ET ELLE COMPTE AUTANT QUE LES DEUX AUTRES.
   *
   * Sans elle, ce fichier ne distinguerait pas « on a retiré une surface » de
   * « on a supprimé la mécanique ». La RPC et la colonne sont HORS PÉRIMÈTRE:
   * le jour où un écran redonne ce choix, il ne doit avoir qu'un wrapper à
   * réécrire.
   */
  it("la RPC et la colonne, elles, sont toujours là", () => {
    const rpc = readFileSync(
      resolve(
        ROOT,
        "supabase/migrations/20260812220000_household_member_body_and_reference.sql",
      ),
      "utf8",
    );
    expect(rpc, "la RPC a été emportée avec sa carte").toContain(
      "keel_household_set_reference_member",
    );
    const column = readFileSync(
      resolve(ROOT, "supabase/migrations/20260811010000_household_reference_member.sql"),
      "utf8",
    );
    expect(column, "la colonne a été emportée avec sa carte").toContain(
      "reference_member_id",
    );
  });

  /**
   * ET LE LECTEUR SERVEUR, QUI EST LA RAISON POUR LAQUELLE LE RETRAIT NE CASSE
   * RIEN. `generate-household-meal-v1` lit toujours la colonne et la passe à la
   * cascade. Si un jour ce lien saute, `null` cesserait de vouloir dire « le
   * composeur » et ce retrait deviendrait rétroactivement dangereux.
   */
  it("le moteur lit toujours la colonne et la passe à la cascade", () => {
    const engine = code("supabase/functions/generate-household-meal-v1/index.ts");
    expect(engine, "le moteur ne lit plus la colonne").toContain(
      'select("reference_member_id")',
    );
    expect(engine, "la valeur lue n'atteint plus la résolution").toContain(
      "declaredReferenceMemberId: refRes.data?.reference_member_id ?? null",
    );
    // Et c'est bien la CASCADE qui la consomme, pas un lecteur parallèle.
    const resolver = code(
      "supabase/functions/_shared/keel/household_composition.ts",
    );
    expect(resolver, "la cascade a perdu son défaut").toContain(
      "pick(declared) ?? pick(composerMemberId) ?? null",
    );
  });
});
