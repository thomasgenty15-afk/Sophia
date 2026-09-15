/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 2 §5 — RELIRE LA CONSIGNE DE RÉPARATION RÉELLEMENT ENVOYÉE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno run --allow-read \
 *     scratchpad/2026-09-13-CIBLES-PAR-PERSONNE/relire-consigne-reparation.ts \
 *     <sorties-lot-F/…prompts.txt>
 *
 * ⛔ CE N'EST PAS UNE RELECTURE DE RÉPONSE. Le plan l'écrit : « Relire leurs
 * anciennes RÉPONSES ne valide pas le nouveau prompt. » Ce fichier ouvre le
 * corps JSON réellement transmis au fournisseur — celui que `--prompts` a
 * capturé pendant le tir — et y cherche deux choses :
 *
 *   ① L'ADRESSE DE CHAQUE DÉFAUT. Depuis le lot 1, une ligne de défaut porte
 *      `member_id`, `day`, `slot` et `units`. Une ligne sans propriétaire est
 *      un objectif que personne ne peut appliquer.
 *   ② LES CINQ CONSIGNES CONTRADICTOIRES retirées au lot 1. Chacune demandait
 *      au modèle de rendre le PLAN ENTIER ou de ne RIEN changer d'autre, dans
 *      un message qui demande un PATCH sur un périmètre ouvert.
 */
const INTERDITS = [
  "Return the full plan JSON with only these dishes added",
  "Return the full plan JSON with only these dishes and the preparations",
  "Keep every dish, day and slot",
  "leave every other dish exactly as it is",
  "do NOT shorten the plan",
];

function texteDuCorps(corps: string): string {
  try {
    const payload = JSON.parse(corps) as Record<string, unknown>;
    const morceaux: string[] = [];
    const visiter = (v: unknown): void => {
      if (typeof v === "string") morceaux.push(v);
      else if (Array.isArray(v)) v.forEach(visiter);
      else if (v !== null && typeof v === "object") {
        Object.values(v as Record<string, unknown>).forEach(visiter);
      }
    };
    visiter(payload.input ?? payload.messages ?? payload);
    return morceaux.join("\n");
  } catch {
    return corps;
  }
}

const chemin = Deno.args[0];
if (!chemin) {
  console.error("usage : relire-consigne-reparation.ts <…prompts.txt>");
  Deno.exit(2);
}
const brut = await Deno.readTextFile(chemin);
const appels = brut.split("═══ APPEL ").slice(1);
console.log(`${chemin.split("/").pop()} — ${appels.length} appel(s) capturé(s)\n`);
let vu = 0;
for (const [i, bloc] of appels.entries()) {
  const corps = bloc.split("\n").slice(1).join("\n");
  const txt = texteDuCorps(corps);
  const estReparation = txt.includes('"units" carries ONLY') ||
    txt.includes("A MEAL IS MISSING") || txt.includes("DO NOT WORK AS WRITTEN");
  if (!estReparation) continue;
  vu++;
  const lignesAdressees = txt.split("\n").filter((l) =>
    /\bunits=U\d+/.test(l) && /\bday=/.test(l) && /\bslot=/.test(l)
  );
  const avecBouche = lignesAdressees.filter((l) => /\bmember_id=[0-9a-f-]{36}/.test(l));
  // ⚠️ UNE LIGNE `dish=` EST UN DÉFAUT DU PLAT, PAS D'UNE BOUCHE, et elle n'a
  // pas de propriétaire à nommer. Les confondre ferait rougir un message
  // correct — et « un objectif sans propriétaire » est très exactement ce que
  // le lot 1 a fermé, sur les lignes de BOUCHE.
  const platSeul = lignesAdressees.filter((l) => /\bdish="/.test(l));
  const sansBouche = lignesAdressees.filter((l) =>
    !/\bmember_id=[0-9a-f-]{36}/.test(l) && !/\bdish="/.test(l)
  );
  console.log(`── APPEL ${i + 1} · consigne de RÉPARATION ────────────────────`);
  console.log(
    `   lignes de défaut ADRESSÉES (jour + moment + unité) : ${lignesAdressees.length}` +
      `   dont avec member_id : ${avecBouche.length}` +
      `   sans : ${sansBouche.length}`,
  );
  for (const l of sansBouche) {
    console.log(`      ⛔ AUCUN PROPRIÉTAIRE : ${l.trim().slice(0, 120)}`);
  }
  if (sansBouche.length === 0) {
    console.log(
      `   ✅ chaque ligne de défaut nomme soit sa BOUCHE, soit son PLAT — aucun objectif orphelin`,
    );
  }
  const trouves = INTERDITS.filter((p) => txt.includes(p));
  console.log(
    trouves.length === 0
      ? `   ✅ AUCUNE des ${INTERDITS.length} consignes contradictoires du lot 1 n'est présente`
      : `   ⛔ ${trouves.length} consigne(s) contradictoire(s) PRÉSENTE(S) : ${trouves.join(" | ")}`,
  );
  // ⚠️ LA TRONCATURE EST LE SIXIÈME DÉFAUT DU LOT 1, et elle se lit dans le texte.
  const tronque = txt.match(/and (\d+) more of the same kind/);
  console.log(
    tronque === null
      ? `   ✅ aucune troncature « … and N more of the same kind » dans ce message`
      : `   ⛔ TRONCATURE : ${tronque[1]} bloc(s) jeté(s) hors du message`,
  );
  console.log(`   longueur du message : ${txt.length} caractères`);
}
if (vu === 0) console.log("⚪ aucun appel de RÉPARATION dans ce fichier.");
