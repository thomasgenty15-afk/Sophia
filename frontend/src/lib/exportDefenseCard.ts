import type { DefenseCardContent } from "../types/v2";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildPrintableHtml(content: DefenseCardContent, totalWins: number): string {
  const impulseSections = content.impulses
    .map(
      (imp) => `
      <div class="impulse">
        <h2>${escapeHtml(imp.label)}</h2>
        ${imp.triggers.map((t, index) => `
          <div class="moment-card">
            <h3>Carte ${index + 1}${t.label ? ` • ${escapeHtml(t.label)}` : ""}</h3>
            <div class="field moment">
              <p class="field-label">Le moment</p>
              <p>${escapeHtml(t.situation)}</p>
            </div>
            <div class="field trap">
              <p class="field-label">Le piege</p>
              <p>${escapeHtml(t.signal)}</p>
            </div>
            <div class="field gesture">
              <p class="field-label">Mon geste</p>
              <p>${escapeHtml(t.defense_response)}</p>
            </div>
            <div class="field fallback">
              <p class="field-label">Plan B</p>
              <p>${escapeHtml(String(t.plan_b ?? imp.generic_defense ?? ""))}</p>
            </div>
          </div>
        `).join("")}
        <div class="wins">
          <p>${totalWins} victoire${totalWins !== 1 ? "s" : ""} au total</p>
          <div class="checkboxes">
            ${Array(10).fill(0).map(() => `<span class="checkbox">☐</span>`).join(" ")}
          </div>
          <p class="hint">Coche chaque victoire hors-app</p>
        </div>
      </div>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 11px; color: #1c1917; line-height: 1.5; margin: 0; padding: 20px; }
  h1 { font-size: 20px; text-align: center; margin-bottom: 4px; }
  .subtitle { text-align: center; color: #78716c; font-size: 10px; margin-bottom: 24px; }
  .impulse { margin-bottom: 28px; page-break-inside: avoid; }
  .impulse h2 { font-size: 15px; border-bottom: 2px solid #292524; padding-bottom: 4px; margin-bottom: 12px; }
  .moment-card { margin-bottom: 12px; padding: 10px; border-radius: 10px; border: 1px solid #e7e5e4; background: #fafaf9; }
  .moment-card h3 { font-size: 11px; font-weight: 700; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.5px; }
  .field { margin-bottom: 8px; padding: 8px; border-radius: 8px; }
  .field-label { margin: 0 0 4px; font-size: 9px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; }
  .field p:last-child { margin: 0; }
  .moment { background: #f0f9ff; border: 1px solid #bae6fd; }
  .trap { background: #fffbeb; border: 1px solid #fed7aa; }
  .gesture { background: #f0fdf4; border: 1px solid #bbf7d0; }
  .fallback { background: #fafaf9; border: 1px dashed #d6d3d1; }
  .wins { margin-top: 10px; padding: 10px; border-radius: 8px; background: #fff7ed; border: 1px solid #fed7aa; }
  .checkboxes { font-size: 16px; letter-spacing: 6px; margin-top: 6px; }
  .hint { font-size: 9px; color: #a8a29e; margin-top: 2px; }
  .footer { text-align: center; color: #a8a29e; font-size: 9px; margin-top: 24px; border-top: 1px solid #e7e5e4; padding-top: 8px; }
</style>
</head>
<body>
  <h1>🛡️ Ma Carte de Défense</h1>
  <p class="subtitle">Sophia — Transformation personnelle</p>
  ${impulseSections}
  <div class="footer">Généré par Sophia • sophia-app.com</div>
</body>
</html>`;
}

export async function exportDefenseCardAsPdf(
  content: DefenseCardContent,
  totalWins: number,
): Promise<void> {
  const html = buildPrintableHtml(content, totalWins);

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Autorise les pop-ups pour imprimer ta carte.");
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    printWindow.print();
  }, 500);
}

export async function exportDefenseCardAsImage(
  content: DefenseCardContent,
  totalWins: number,
): Promise<void> {
  const html = buildPrintableHtml(content, totalWins);

  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.width = "375px";
  container.style.padding = "16px";
  container.style.background = "white";
  container.innerHTML = html.replace(/<\/?html>|<\/?head>|<\/?body>|<meta[^>]*>|<style[\s\S]*?<\/style>/gi, "");
  document.body.appendChild(container);

  try {
    // html2canvas is an optional peer dependency — fall back to print if unavailable
    const moduleName = "html2canvas";
    const mod = await import(/* @vite-ignore */ moduleName).catch(() => null);
    const html2canvas = mod?.default;
    if (typeof html2canvas !== "function") {
      document.body.removeChild(container);
      return exportDefenseCardAsPdf(content, totalWins);
    }

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const link = document.createElement("a");
    link.download = "carte-de-defense.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch {
    exportDefenseCardAsPdf(content, totalWins);
  } finally {
    document.body.removeChild(container);
  }
}
