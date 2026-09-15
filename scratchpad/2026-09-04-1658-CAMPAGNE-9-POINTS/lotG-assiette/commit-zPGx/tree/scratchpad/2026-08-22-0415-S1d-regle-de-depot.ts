// S1d — LA QUESTION DE LA RÈGLE DE DÉPÔT, chiffrée.
//
// On ne tranche pas: on mesure les trois quantités qui décident.
//   ① combien de modules restent SANS repli de ligature ?
//   ② parmi eux, combien portent un radical de la LISTE ORTHOGRAPHIQUE FERMÉE
//      recommandée par S1c ? (ceux-là seuls peuvent mordre)
//   ③ combien de littéraux du dépôt portent un digramme `oe`/`ae` que PERSONNE
//      n'écrit avec une ligature ? (c'est la charge de faux positifs d'une
//      règle qui se déclencherait sur le DIGRAMME — le piège nommé)
const ROOTS = [
  "supabase/functions",
  "frontend/src",
];

// La liste FERMÉE recommandée par S1c, telle quelle.
const RADICAUX = [
  "oeuf",
  "boeuf",
  "coeur",
  "soeur",
  "oeil",
  "noeud",
  "voeu",
  "moeurs",
  "coelia",
  "oesoph",
  "oedem",
  "caecum",
  "aequo",
  "taenia",
  "naevus",
];

function* walk(dir: string): Generator<string> {
  for (const e of Deno.readDirSync(dir)) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      yield* walk(p);
    } else if (/\.tsx?$/.test(e.name)) yield p;
  }
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

const files: string[] = [];
for (const root of ROOTS) {
  try {
    for (const f of walk(root)) files.push(f);
  } catch { /* absent */ }
}

let nfd = 0;
let nfdAvecRepli = 0;
const nfdSansRepli: string[] = [];
const porteursDeRadical: Array<{ file: string; hits: string[] }> = [];
const digrammesJamaisLigatures = new Map<string, number>();
const digrammesLigaturables = new Map<string, number>();
let ligaturesLitteralesDansDuCode = 0;
const fichiersALigatureLitterale: string[] = [];

for (const f of files) {
  const src = Deno.readTextFileSync(f);
  const code = stripComments(src);
  const estTest = /_test\.ts$|\.test\.tsx?$|\.int\.test\.ts$|\.spec\.tsx?$/.test(
    f,
  );

  if (/\.normalize\(\s*["']NFD["']\s*\)/.test(code) && !estTest) {
    nfd += 1;
    const aRepli = /\\u0153|œ/.test(code);
    if (aRepli) nfdAvecRepli += 1;
    else nfdSansRepli.push(f);
  }

  if (estTest) continue;

  // Les littéraux à digramme, tous, dans le CODE.
  for (const m of code.toLowerCase().matchAll(/[a-z]{0,12}(?:oe|ae)[a-z]{0,12}/g)) {
    const tok = m[0];
    if (tok === "oe" || tok === "ae") continue; // les remplacements du dépliage
    const ligaturable = RADICAUX.some((r) => tok.includes(r));
    const bag = ligaturable ? digrammesLigaturables : digrammesJamaisLigatures;
    bag.set(tok, (bag.get(tok) ?? 0) + 1);
  }

  const litt = [...code.matchAll(/[ŒœÆæ]/g)].length;
  if (litt > 0) {
    ligaturesLitteralesDansDuCode += litt;
    fichiersALigatureLitterale.push(`${f} (${litt})`);
  }
}

console.log(`fichiers .ts/.tsx scannés: ${files.length}`);
console.log(
  `\n① modules (hors tests) avec .normalize("NFD"): ${nfd}` +
    `\n   dont AVEC repli de ligature: ${nfdAvecRepli}` +
    `\n   dont SANS repli:            ${nfdSansRepli.length}`,
);

// ② lesquels portent un radical de la liste fermée ?
for (const f of nfdSansRepli) {
  const code = stripComments(Deno.readTextFileSync(f)).toLowerCase();
  const hits = RADICAUX.filter((r) => code.includes(r));
  if (hits.length > 0) porteursDeRadical.push({ file: f, hits });
}
console.log(
  `\n② parmi les ${nfdSansRepli.length} sans repli, porteurs d'un radical de la liste FERMÉE: ${porteursDeRadical.length}`,
);
for (const p of porteursDeRadical) {
  console.log(`   ${p.file}  [${p.hits.join(", ")}]`);
}

const totalLig = [...digrammesLigaturables.values()].reduce((a, b) => a + b, 0);
const totalNon = [...digrammesJamaisLigatures.values()].reduce(
  (a, b) => a + b,
  0,
);
console.log(
  `\n③ littéraux à digramme dans TOUT le code (hors tests):` +
    `\n   LIGATURABLES (liste fermée): ${digrammesLigaturables.size} formes / ${totalLig} occurrences` +
    `\n   JAMAIS LIGATURÉS:           ${digrammesJamaisLigatures.size} formes / ${totalNon} occurrences`,
);
console.log(
  `   ratio faux positifs d'une règle qui viserait le DIGRAMME: ${
    (100 * totalNon / (totalNon + totalLig)).toFixed(1)
  } %`,
);
console.log(
  `   top 20 des JAMAIS LIGATURÉS: ${
    [...digrammesJamaisLigatures].sort((a, b) => b[1] - a[1]).slice(0, 20)
      .map(([t, n]) => `${t}(${n})`).join(", ")
  }`,
);
console.log(
  `   les LIGATURABLES: ${
    [...digrammesLigaturables].sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t}(${n})`).join(", ")
  }`,
);

console.log(
  `\n④ ligatures LITTÉRALES dans du code (hors commentaires, hors tests): ${ligaturesLitteralesDansDuCode}`,
);
for (const f of fichiersALigatureLitterale) console.log(`   ${f}`);
