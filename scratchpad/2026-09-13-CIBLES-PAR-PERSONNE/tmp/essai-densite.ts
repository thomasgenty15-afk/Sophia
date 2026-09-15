import { indexDuReferentiel, ligne, mesurer } from "../composer-reference.ts";
const index = await indexDuReferentiel();
const essais: {nom:string; method:string; ing:[string,string,number][]}[] = [
  { nom:"bol yaourt-avoine", method:"Mélanger le yaourt grec, l'avoine, la banane et les myrtilles dans un bol.",
    ing:[["yaourt grec","greek_yogurt",250],["avoine","oats",60],["banane","banana",100],["myrtilles","blueberries",80]] },
  { nom:"poulet-couscous-legumes", method:"Faire revenir le poulet, cuire le couscous et mélanger avec les légumes.",
    ing:[["blanc de poulet","chicken_breast",180],["couscous complet","couscous_wholemeal",90],["courgette","courgette",150],["huile d'olive","olive_oil",12]] },
  { nom:"saumon-pommes de terre", method:"Rôtir le saumon et les pommes de terre, servir avec des haricots verts.",
    ing:[["saumon","salmon",180],["pomme de terre","potato",250],["haricots verts","green_beans",120],["huile d'olive","olive_oil",15]] },
];
for (const e of essais) {
  const u = { method:e.method, ingredients:e.ing.map(([t,r,g])=>ligne(t,r,g)) };
  const m = mesurer(index, u);
  console.log(`${e.nom.padEnd(26)} kcal=${m.kcal?.toFixed(1)} prêt=${m.readyG?.toFixed(0)} g  ρ=${m.densite?.toFixed(1)}  prot=${m.proteineG?.toFixed(1)} g`);
}
