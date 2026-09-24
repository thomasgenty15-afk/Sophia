import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  familyModules,
  readSourceFamilies,
  REPO_ROOT,
  repoRelativePath,
  sourceFamily,
} from "../../test/sourceFamily";

// ===========================================================================
// UN SEUL SÉRIALISEUR POUR `household_member_habits.slots`
//
// ── LE DÉFAUT MESURÉ (2026-09-01) ─────────────────────────────────────────
// Il en existait TROIS, recopiés: deux dans `SetupPage.tsx` et un dans
// `mouthForm.ts`. Les trois faisaient la même chose — un `map` sur `habits`,
// puis `.filter((h) => h.usual !== "")` — et cette dernière ligne JETTE
// l'entrée sans prose, c'est-à-dire exactement celle qui porte les bulles de
// ce qui est pris à côté du plat.
//
// Livrer les bulles en n'en corrigeant que deux sur trois aurait donné un
// écran où cocher « + pain » marche depuis une carte et pas depuis l'autre,
// sans une erreur nulle part.
//
// ⛔ CE TEST GARDE LA FORME, PAS LE COMPORTEMENT, et c'est assumé: le
// comportement est tenu par `mealExtrasMirror.int.test.ts`. Ce qu'on refuse
// ici est le QUATRIÈME sérialiseur — celui qu'on écrit sans savoir que les
// trois autres existent.
// ===========================================================================

describe("un seul écrivain pour les entrées d'habitude", () => {
  // ⚠️ LA RACINE VIENT DU FICHIER, PAS DE `process.cwd()`. Un `cwd` qui ne
  // tombe pas où on croit rend une liste VIDE, et une garde d'absence sur une
  // liste vide est verte pour rien — mesuré à la première rédaction.
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const files = globSync("**/*.{ts,tsx}", { cwd: root })
    .map((f) => resolve(root, f))
    .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
    .filter((f) => !f.endsWith("lib/mealExtras.ts"));

  /** Commentaires retirés: ce dépôt PARLE de ces formes dans ses notes. */
  const strip = (src: string): string =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");

  it("LA PRÉMISSE — le balayage voit bien les fichiers de `src/keel`", () => {
    expect(files.length, "aucun fichier balayé: les deux cas seraient vides")
      .toBeGreaterThan(50);
  });

  it("⛔ PERSONNE NE JETTE UNE ENTRÉE SUR SON `usual` VIDE", () => {
    // ⚠️ C'EST LE DÉFAUT LUI-MÊME, PAS SON VOISINAGE. Les trois sérialiseurs
    // recopiés finissaient tous par la même ligne — `.filter((h) => h.usual
    // !== "")` — et c'est ELLE qui jetait l'entrée des bulles. Le test la
    // nomme donc directement, plutôt que de deviner la forme d'un `map`.
    //
    // ⛔ LE PARSEUR DE LECTURE A LE DROIT, LUI, et il est nommé: une entrée
    // relue sans prose n'a rien à afficher, et `parseHabitExtras` la lit de
    // son côté. Ce qui est interdit est de JETER AVANT D'ÉCRIRE.
    const allowed = new Set([
      resolve(root, "api/householdHabits.ts"), // `parseHabitSlots`, en LECTURE
    ]);
    const guilty: string[] = [];
    for (const f of files) {
      if (allowed.has(f)) continue;
      const src = strip(readFileSync(f, "utf8"));
      if (/usual\s*(?:\.trim\(\))?\s*(?:!==\s*""|\.length\s*===\s*0|===\s*"")/.test(src)) {
        guilty.push(f);
      }
    }
    expect(
      guilty.sort(),
      "ces fichiers jettent une entrée d'habitude sur son texte vide, donc " +
        "avec ses extras — passer par `habitEntriesToWrite`",
    ).toEqual([]);
  });

  it("⛔ ET LE FICHIER AUTORISÉ NE LE FAIT QU'EN LECTURE", () => {
    // ⚠️ SANS CE CAS, L'EXEMPTION CI-DESSUS EST UNE PORTE OUVERTE: on pourrait
    // réécrire un sérialiseur dans `householdHabits.ts` et rien ne bougerait.
    // Ce qui est vérifié est que la seule occurrence tolérée vit DANS le
    // parseur de lecture, et que `habitPayload` délègue.
    const src = strip(readFileSync(resolve(root, "api/householdHabits.ts"), "utf8"));
    const parser = src.slice(src.indexOf("export function parseHabitSlots"));
    const parserEnd = parser.indexOf("\n}\n");
    expect(parserEnd).toBeGreaterThan(-1);
    const inParser = (parser.slice(0, parserEnd).match(/usual\.length === 0/g) ?? []).length;
    const total = (src.match(/usual\.length === 0/g) ?? []).length;
    expect(inParser, "l'occurrence n'est plus dans le parseur de lecture").toBe(1);
    expect(total, "une SECONDE occurrence est apparue hors du parseur").toBe(1);
    const payload = src.slice(src.indexOf("export function habitPayload"));
    expect(
      payload.slice(0, payload.indexOf("\n}\n")),
      "`habitPayload` a cessé de déléguer",
    ).toContain("habitEntriesToWrite(");
  });

  it("le sérialiseur, LUI, existe et il est appelé", () => {
    // LA PRÉMISSE, ARMÉE: une garde d'absence qui garderait un dépôt où plus
    // rien n'écrit d'habitude serait verte et vide de sens.
    const callers = files.filter((f) =>
      readFileSync(f, "utf8").includes("habitEntriesToWrite(")
    );
    expect(callers.length, "personne n'appelle `habitEntriesToWrite`")
      .toBeGreaterThanOrEqual(2);
  });
});

describe("le « + repas léger » traverse CHAQUE écrivain", () => {
  // ⛔ MÊME RAISON QUE LE TEST AU-DESSUS, UN CRAN PLUS LOIN. Le sérialiseur est
  // unique, mais il a DEUX entrées (`habits`, `light`), et un appelant qui en
  // oublie une n'a pas d'erreur: il écrit une fiche amputée.
  // Le typecheck l'attrape sur le code de production — pas sur les tests, qui
  // sont compilés à part. Ce scan couvre les deux.
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const files = globSync("**/*.{ts,tsx}", { cwd: root })
    .filter((f) => !f.endsWith(".int.test.ts") && !f.endsWith(".test.ts"))
    .map((f) => resolve(root, f));

  it("aucun appel à `habitEntriesToWrite` n'oublie `light`", () => {
    const coupables: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      let i = src.indexOf("habitEntriesToWrite({");
      while (i !== -1) {
        // Le bloc d'arguments s'arrête à `})` — ces appels sont tous à plat.
        const fin = src.indexOf("})", i);
        const bloc = src.slice(i, fin === -1 ? src.length : fin);
        if (!bloc.includes("light:")) coupables.push(file.replace(root, ""));
        i = src.indexOf("habitEntriesToWrite({", i + 1);
      }
    }
    expect(coupables).toEqual([]);
  });

  it("aucun appel à `habitPayload` n'oublie `light`", () => {
    // `habitPayload` prend un OBJET (`{light}`) et pas un argument positionnel,
    // précisément pour que le compilateur recense ses appelants.
    // Ce test est la ceinture: il attrape aussi ceux des fichiers de test.
    const coupables: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      let i = src.indexOf("habitPayload(");
      while (i !== -1) {
        const bloc = src.slice(i, src.indexOf(")", src.indexOf("}", i)) + 1);
        if (!bloc.includes("light:")) coupables.push(file.replace(root, ""));
        i = src.indexOf("habitPayload(", i + 1);
      }
    }
    expect(coupables).toEqual([]);
  });

  it("⛔ LE SCAN N'EST PAS MORT — il voit bien des appels", () => {
    // Une garde d'absence sur une liste vide est verte pour rien.
    const total = files
      .map((f) => readFileSync(f, "utf8"))
      .filter((s) => s.includes("habitEntriesToWrite({") || s.includes("habitPayload(")).length;
    expect(total).toBeGreaterThan(0);
  });
});

// ===========================================================================
// ⟳ 2026-09-23 — LES À-CÔTÉS TRAVERSENT CHAQUE ÉCRIVAIN
//
// ⛔ LE PIÈGE EST CONNU ET IL A DÉJÀ MORDU. `keel_household_set_member_habits`
// REMPLACE la liste entière: un écrivain qui n'apporte pas `side_courses` les
// EFFACE, en silence, à chaque enregistrement d'une habitude. L'ancienne clé
// `extras` a été perdue exactement comme ça.
//
// Le typecheck attrape l'oubli dans un appel à `habitEntriesToWrite` et à
// `habitPayload` (le champ est requis dans les deux). Il n'attrape PAS les
// formes que ce bloc garde:
//   · une SEMENCE oubliée — `{ ...emptyMouthDraft(), light: … }` compile très
//     bien sans `sideCourses`, et rouvre la fiche sur `{}`;
//   · un appel qui passe `sideCourses: {}` EN DUR — il compile, et il efface;
//   · un appel écrit dans un fichier de test, que le typecheck ne compile pas.
// ===========================================================================

describe("les à-côtés traversent CHAQUE écrivain", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const files = globSync("**/*.{ts,tsx}", { cwd: root })
    .filter((f) => !f.endsWith(".int.test.ts") && !f.endsWith(".test.ts"))
    .map((f) => resolve(root, f));
  /** Commentaires retirés: ce dépôt PARLE de ces formes dans ses notes. */
  const strip = (src: string): string =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
  const rel = (f: string) => f.replace(root + "/", "");

  /**
   * ⟳ 2026-09-24 (lot 4c) — LE PARCOURS D'UN FICHIER, PAS LE FICHIER.
   *
   * `HouseholdPage.tsx` a été découpé: sa ligne d'une bouche (`MemberRow`),
   * qui porte le second appel au sérialiseur ET le montage de
   * `HouseholdHabitsCard`, vit maintenant dans `pages/household/MemberRow.tsx`.
   * Compté par fichier, l'écran du foyer semblait avoir perdu un écrivain. On
   * rapporte donc un module sorti à son fichier d'origine (le registre
   * `scripts/source-families.json`): le compte reste celui d'un PARCOURS — deux
   * écrivains sur l'écran du foyer, deux dans l'entonnoir.
   */
  const origins = new Map<string, string>();
  for (const [origin, modules] of Object.entries(readSourceFamilies())) {
    for (const m of modules) origins.set(m, origin);
  }
  const journeyOf = (keelRel: string): string => {
    const repo = repoRelativePath(resolve(root, keelRel));
    return rel(resolve(REPO_ROOT, origins.get(repo) ?? repo));
  };

  /** Chaque bloc d'arguments `habitEntriesToWrite({ … })`, commentaires retirés. */
  function callBlocks(): Array<{ file: string; block: string }> {
    const out: Array<{ file: string; block: string }> = [];
    for (const file of files) {
      const src = strip(readFileSync(file, "utf8"));
      let i = src.indexOf("habitEntriesToWrite({");
      while (i !== -1) {
        const fin = src.indexOf("})", i);
        out.push({ file: rel(file), block: src.slice(i, fin === -1 ? src.length : fin) });
        i = src.indexOf("habitEntriesToWrite({", i + 1);
      }
    }
    return out;
  }

  it("LA PRÉMISSE — le balayage voit les six appels du sérialiseur", () => {
    // Deux dans `HouseholdPage`, deux dans `SetupPage`, un dans `mouthForm`
    // (`mouthToPersist`), un dans `householdHabits` (`habitPayload`). Un compte
    // qui baisse est un écrivain perdu de vue; un compte qui monte, un
    // écrivain à relire. ⟳ 2026-09-23 — `carrySideCourses` (`mealExtras`),
    // sans appelant de production, a été retiré.
    // ⟳ 2026-09-24 (lot 4c) — compté par PARCOURS (`journeyOf`, plus haut):
    // l'un des deux appels de l'écran du foyer vit dans `household/MemberRow.tsx`.
    const byFile = new Map<string, number>();
    for (const c of callBlocks()) {
      const journey = journeyOf(c.file);
      byFile.set(journey, (byFile.get(journey) ?? 0) + 1);
    }
    expect(Object.fromEntries([...byFile].sort())).toEqual({
      "api/householdHabits.ts": 1,
      "lib/mouthForm.ts": 1,
      "pages/HouseholdPage.tsx": 2,
      "pages/SetupPage.tsx": 2,
    });
  });

  it("⛔ aucun appel à `habitEntriesToWrite` n'oublie `sideCourses`", () => {
    const coupables = callBlocks()
      .filter((c) => !/\bsideCourses\s*:/.test(c.block))
      .map((c) => c.file);
    expect(coupables).toEqual([]);
  });

  it("⛔ aucun appel au sérialiseur n'écrit `sideCourses: {}` EN DUR", () => {
    // ⟳ 2026-09-23 — `{}` passé au sérialiseur veut dire « ce chemin n'a pas
    // les à-côtés », donc qu'il les EFFACE. `habitPayload` a été le dernier à
    // le dire; il transmet désormais `carried.sideCourses`.
    const empties = callBlocks()
      .filter((c) => /\bsideCourses\s*:\s*\{\s*\}/.test(c.block))
      .map((c) => c.file);
    expect(empties).toEqual([]);
    const src = strip(readFileSync(resolve(root, "api/householdHabits.ts"), "utf8"));
    const payload = src.slice(src.indexOf("export function habitPayload"));
    expect(payload.slice(0, payload.indexOf("\n}\n")))
      .toMatch(/sideCourses\s*:\s*carried\.sideCourses\b/);
  });

  /**
   * Les arguments d'un appel `habitPayload(…)`, parenthèses équilibrées, dans
   * le code SANS commentaires. ⚠️ L'argument porte `?? {}`: couper au premier
   * `}` ou au premier `)` rendrait un bloc tronqué.
   */
  function payloadCalls(scanned: readonly string[]): Array<{ file: string; args: string }> {
    const out: Array<{ file: string; args: string }> = [];
    for (const file of scanned) {
      const src = strip(readFileSync(file, "utf8"));
      let i = src.indexOf("habitPayload(");
      while (i !== -1) {
        // La déclaration n'est pas un appel, ni le nom cité dans une chaîne
        // (ce fichier cherche « habitPayload( » dans des sources).
        const isDeclaration = src.slice(Math.max(0, i - 9), i) === "function " ||
          ["\"", "'", "`"].includes(src[i - 1] ?? "");
        const open = i + "habitPayload".length;
        let depth = 0;
        let end = open;
        for (; end < src.length; end++) {
          if (src[end] === "(") depth++;
          else if (src[end] === ")") {
            depth--;
            if (depth === 0) break;
          }
        }
        if (!isDeclaration) out.push({ file: rel(file), args: src.slice(open + 1, end) });
        i = src.indexOf("habitPayload(", i + 1);
      }
    }
    return out;
  }

  it("⛔ chaque appel à `habitPayload` porte les à-côtés, et jamais un `{}` en dur", () => {
    // ⟳ 2026-09-23 — la carte d'un membre (`HouseholdHabitsCard`) passe le
    // réglage LU dans `carried`; le report au montage a disparu. Un appel qui
    // l'oublie efface le « jamais de dessert » d'une personne qui corrige sa
    // prose. Les fichiers de test sont balayés AUSSI: le typecheck ne les
    // compile pas.
    const every = globSync("**/*.{ts,tsx}", { cwd: root }).map((f) => resolve(root, f));
    const calls = payloadCalls(every);
    // LA PRÉMISSE: l'appel de production est vu, et les appels des tests aussi.
    expect(calls.filter((c) => !c.file.includes(".test.")).map((c) => c.file))
      .toEqual(["components/HouseholdHabitsCard.tsx"]);
    expect(calls.length).toBeGreaterThan(1);
    const coupables = calls
      .filter((c) => !/\bsideCourses\s*:/.test(c.args))
      .map((c) => `${c.file}: ${c.args.replace(/\s+/g, " ").slice(0, 80)}`);
    expect(coupables).toEqual([]);
    // Et la production passe la LECTURE, pas un vide.
    const card = calls.find((c) => c.file === "components/HouseholdHabitsCard.tsx")!;
    expect(card.args).toMatch(/\bsideCourses\s*:\s*habits\?\.sideCourses\b/);
  });

  it("⛔ `HouseholdHabitsCard` est monté SANS report: la carte porte elle-même les à-côtés", () => {
    // Un report au montage EN PLUS de `carried` serait un second écrivain du
    // même réglage — et c'est celui qu'on relit le moins qui finirait par
    // décider. ⟳ 2026-09-23 — la fonction de report (`carrySideCourses`) a
    // été retirée: la carte monte sans aucun attribut d'à-côtés.
    const mounts: string[] = [];
    for (const file of files) {
      const src = strip(readFileSync(file, "utf8"));
      let i = src.indexOf("<HouseholdHabitsCard");
      while (i !== -1) {
        const fin = src.indexOf("/>", i);
        const tag = src.slice(i, fin === -1 ? src.length : fin);
        mounts.push(rel(file));
        expect(tag).not.toMatch(/\bsideCourses\b/);
        i = src.indexOf("<HouseholdHabitsCard", i + 1);
      }
    }
    // ⟳ 2026-09-24 (lot 4c) — LE MONTAGE A SUIVI `MemberRow` dans
    // `pages/household/MemberRow.tsx`. On le vérifie dans le fichier qui le
    // porte réellement, et ce fichier doit appartenir à la famille de la page
    // (le test du registre prouve qu'elle l'atteint par ses imports): un
    // montage dans un module que la page n'atteint plus ne serait plus sur
    // l'écran du foyer.
    expect(mounts).toEqual(["pages/household/MemberRow.tsx"]);
    expect(familyModules(resolve(root, "pages/HouseholdPage.tsx")))
      .toContain("frontend/src/keel/pages/household/MemberRow.tsx");
  });

  it("⛔ PARTOUT OÙ LE LÉGER EST SEMÉ OU REPORTÉ, LES À-CÔTÉS LE SONT AUSSI", () => {
    // ⚠️ C'EST LA FORME QUE LE TYPECHECK NE VOIT PAS: une semence
    // `{ ...emptyMouthDraft(), light: … }` compile sans `sideCourses` — elle
    // reçoit le `{}` du brouillon vide, et la fiche s'ouvre sur « Selon
    // l'objectif » alors que la base porte « Non », puis l'efface au Save.
    //
    // La règle: toute clé `light:` qui porte une VALEUR (pas une annotation de
    // type, qui finit par `;`) a une voisine `sideCourses:` à quelques lignes.
    //
    // ⛔ UNE EXEMPTION, NOMMÉE: `toggleLight(` — le clic sur la bulle du léger,
    // qui n'écrit que le léger dans un brouillon qui porte déjà tout le reste.
    // ⟳ 2026-09-23 — l'exemption de `components/HouseholdHabitsCard.tsx` est
    // RETIRÉE: la carte passe désormais `sideCourses` avec `light`.
    const seeds: string[] = [];
    const coupables: string[] = [];
    for (const file of files) {
      const lines = strip(readFileSync(file, "utf8")).split("\n");
      lines.forEach((line, at) => {
        const m = /\blight\s*:\s*(.+)$/.exec(line);
        if (!m) return;
        const value = m[1].trim();
        if (value.endsWith(";")) return;
        if (value.startsWith("toggleLight(")) return;
        seeds.push(`${rel(file)}:${at}`);
        const window = lines.slice(Math.max(0, at - 6), at + 7).join("\n");
        if (!/\bsideCourses\s*:/.test(window)) coupables.push(`${rel(file)}: ${value}`);
      });
    }
    // LA PRÉMISSE, ARMÉE: les semences connues sont bien vues (emptyMouthDraft,
    // knownMouthForOwner, draftFromKnown, mouthToPersist, loadMemberHabits,
    // habitPayload, quatre dans HouseholdPage, six dans SetupPage, et
    // ⟳ 2026-09-23 la carte `HouseholdHabitsCard`; `carrySideCourses`, retiré
    // le même jour, n'en est plus). Une liste vide rendrait la règle verte
    // pour rien.
    expect(seeds.length, seeds.join("\n")).toBe(17);
    expect(coupables).toEqual([]);
  });

  it("⛔ la fiche remonte `sideCourses` dans le brouillon du titulaire", () => {
    // `set({ sideCourses })` dans la fenêtre, et le nom dans
    // `SELF_SHEET_FIELDS`: sans lui, le brouillon DÉRIVÉ du titulaire
    // rallumerait « Selon l'objectif » dans la même image.
    const dialog = strip(sourceFamily(resolve(root, "components/MouthFormDialog.tsx")));
    expect(dialog).toMatch(/<SideCoursesField[\s\S]*?set\(\{\s*sideCourses:\s*next\s*\}\)/);
    const form = strip(readFileSync(resolve(root, "lib/mouthForm.ts"), "utf8"));
    const list = form.slice(form.indexOf("export const SELF_SHEET_FIELDS"));
    expect(list.slice(0, list.indexOf("] as const"))).toContain('"sideCourses"');
  });
});
