#!/usr/bin/env python3
# LA DEMANDE PAR TERME COMPTE AUSSI LES DÉNOMBRABLES (œufs, pommes, cuillères) — 2026-09-06
# FD4 (0f) : `lines_unattributed 11` — « 42 œufs », « 20 pommes », « 1 l d'huile d'olive » et six fruits
# à l'unité : la demande ne sommait que les grammes/ml, donc rien à rattacher pour une ligne comptée.
# Deux classes par terme (pesé g/ml ; compté unit/cuillères), et la ligne de courses choisit la classe
# de sa propre quantité de tête.
import io
P = "supabase/functions/generate-household-meal-v1/index.ts"
s = io.open(P, encoding="utf-8").read()
def sub(old, new, label):
    global s
    n = s.count(old); assert n == 1, f"{label}: {n}"; s = s.replace(old, new)
sub('''    const demandByTerm = (): Map<string, number> => {
      const out = new Map<string, number>();
      const add = (ings: readonly { term: string; amount: number | null; unit: string | null }[]) => {
        for (const ing of ings) {
          const unit = String(ing.unit ?? "").toLowerCase();
          if (unit !== "g" && unit !== "ml") continue;
          const g = Number(ing.amount);
          if (!Number.isFinite(g) || g <= 0) continue;
          const key = normalizePantryTerm(ing.term);
          out.set(key, (out.get(key) ?? 0) + g);
        }
      };''', '''    // ⟳ 2026-09-06 (FD4, `lines_unattributed 11`) — DEUX CLASSES PAR TERME : le
    // pesé (g/ml) et le compté (pièces, cuillères). « 42 œufs », « 20 pommes »,
    // « 1 l d'huile » n'avaient aucune demande à quoi se rattacher parce qu'on
    // ne sommait que les grammes. La ligne de courses choisit la classe de sa
    // propre quantité de tête ; on ne mélange jamais des grammes et des pièces.
    const demandByTerm = (): Map<string, { weighed: number; counted: number }> => {
      const out = new Map<string, { weighed: number; counted: number }>();
      const add = (ings: readonly { term: string; amount: number | null; unit: string | null }[]) => {
        for (const ing of ings) {
          const unit = String(ing.unit ?? "").toLowerCase();
          const n = Number(ing.amount);
          if (!Number.isFinite(n) || n <= 0) continue;
          const cls = unit === "g" || unit === "ml"
            ? "weighed"
            : unit === "unit" || unit === "tbsp" || unit === "tsp"
            ? "counted"
            : null;
          if (cls === null) continue;
          const key = normalizePantryTerm(ing.term);
          const cur = out.get(key) ?? { weighed: 0, counted: 0 };
          cur[cls] += n;
          out.set(key, cur);
        }
      };''', "demande deux classes")
sub('''      for (const line of meal.shopping_list) {
        const key = normalizePantryTerm(line.term);
        const before = demandBefore.get(key) ?? 0;
        if (!(before > 0)) {
          shrinkCounts.lines_unattributed++;
          kept.push(line);
          continue;
        }
        const after = demandAfter.get(key) ?? 0;''', '''      for (const line of meal.shopping_list) {
        const key = normalizePantryTerm(line.term);
        // La classe de la ligne suit sa quantité de tête : « 1.5 kg », « 300 g »,
        // « 1 l » sont pesés ; « 42 œufs », « 2 citrons » sont comptés.
        const cls = /^\\s*\\d+(?:[.,]\\d+)?\\s*(?:k?g|c?l|ml)\\b/i.test(String(line.quantity ?? "")) ? "weighed" : "counted";
        const before = demandBefore.get(key)?.[cls] ?? 0;
        if (!(before > 0)) {
          shrinkCounts.lines_unattributed++;
          kept.push(line);
          continue;
        }
        const after = demandAfter.get(key)?.[cls] ?? 0;''', "classe de la ligne")
io.open(P, "w", encoding="utf-8").write(s)
print("index: demande à deux classes")
