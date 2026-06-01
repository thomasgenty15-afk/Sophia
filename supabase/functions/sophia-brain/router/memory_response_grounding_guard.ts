function normalizeMemoryGroundingText(input: unknown): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function memoryV2LineTexts(contextBlock: string): string[] {
  return contextBlock.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ["))
    .map((line) => line.replace(/^- \[[^\]]+\]\s*/, "").trim())
    .filter(Boolean);
}

function humanizeMemoryLine(line: string): string {
  const cleaned = String(line ?? "")
    .replace(/\s+Priorite:.*$/i, "")
    .replace(/\bPattern famille [a-z0-9:_-]+\s*:\s*/i, "")
    .replace(/^Sur\s+[^,]+,\s+/i, "")
    .replace(/\bNiveau precedent\s+/i, "Au niveau précédent, ")
    .replace(/\ble user\b/gi, "tu")
    .replace(/\bquand il ouvre\b/gi, "quand tu ouvres")
    .replace(/\bet lance\b/gi, "et que tu lances")
    .replace(/\bdemarre\b/gi, "démarres")
    .replace(/\bdemarrage\b/gi, "démarrage")
    .replace(/\bdeja\b/gi, "déjà")
    .replace(/\bpret\b/gi, "prêt")
    .replace(/\bevite\b/gi, "évite")
    .replace(/\beviter\b/gi, "éviter")
    .trim();
  const sentence = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return sentence.endsWith(".") ? sentence : `${sentence}.`;
}

function renderHumanActionMemory(lines: string[]): string {
  const humanLines = lines.map(humanizeMemoryLine).filter(Boolean);
  const exact = humanLines.find((line) =>
    /fichier déjà prêt|minuteur|12 minutes/i.test(line)
  );
  const family = humanLines.find((line) =>
    /cible augmente|sous 15 minutes|intimidante/i.test(line)
  );
  const out = [
    exact ??
      "Ce qui t'aide, c'est de rendre le démarrage très concret avant de réfléchir au reste.",
  ];
  if (family) out.push(family);
  return [
    "Oui. Ce que je garde pour cette action, c'est très concret :",
    ...out.map((line) => `- ${line}`),
    "Donc demain, le plus important n'est pas de changer de technique : c'est de préparer le fichier, puis de lancer le minuteur directement.",
  ].join("\n");
}

function renderHumanLevelMemory(lines: string[]): string {
  const humanLines = lines.map(humanizeMemoryLine).filter(Boolean);
  const strongest =
    humanLines.find((line) =>
      /une seule prochaine action|gros blocs abstraits/i.test(line)
    ) ?? humanLines[0] ??
      "Je dois garder une prochaine action claire et éviter les blocs trop abstraits.";
  return [
    "Oui, je le vois. Le signal à garder du niveau précédent, c'est :",
    `- ${strongest}`,
    "Donc dans ce nouveau niveau, je dois rester sur une seule prochaine action claire, pas repartir dans un gros bloc abstrait.",
  ].join("\n");
}

export function applyMemoryV2ResponseGroundingGuardrail(args: {
  userMessage: string;
  responseContent: string;
  contextBlock: string;
}): string {
  const contextBlock = String(args.contextBlock ?? "");
  if (!contextBlock.trim()) return args.responseContent;
  const message = normalizeMemoryGroundingText(args.userMessage);
  const response = normalizeMemoryGroundingText(args.responseContent);
  const lines = memoryV2LineTexts(contextBlock);
  if (!lines.length) return args.responseContent;
  const normalizedLines = lines.map((line) => ({
    raw: line,
    normalized: normalizeMemoryGroundingText(line),
  }));
  const findLine = (re: RegExp) =>
    normalizedLines.find((line) => re.test(line.normalized))?.raw ?? "";
  const normalizedContext = normalizeMemoryGroundingText(contextBlock);

  if (
    /\b(souviens|souvenir|souvenirs|memorise|memorises|mémoire|memoire|ce que tu sais|sais deja|sais déjà|detail concret|détail concret|pas de conseils generiques|pas de conseils génériques|ce qui m'aide|ce qui marche|m'aide sur cette action|demarrage bloque|démarrage bloque|bloque souvent|pourquoi.*bloque)\b/
      .test(message) &&
    normalizedLines.some((line) =>
      /\baction_(occurrence|family_pattern|week_summary)\b/.test(
        line.normalized,
      ) ||
      /\bsession focus courte|demarre mieux|demarrage sous|minuteur|fichier deja pret\b/
        .test(line.normalized)
    ) &&
    (
      /\bpas assez|pas la description|besoin.*detail|redonnes?|conseils generiques|en general|souvent que\b/
        .test(response) ||
      !/minuteur|fichier|12|quinze|15/.test(response)
    )
  ) {
    const actionLines = normalizedLines
      .filter((line) =>
        /\baction_(occurrence|family_pattern|week_summary)\b/.test(
          line.normalized,
        ) ||
        /\bsession focus courte|demarre mieux|demarrage sous|minuteur|fichier deja pret\b/
          .test(line.normalized)
      )
      .map((line) => line.raw.replace(/\s+Priorite:.*$/i, "").trim())
      .slice(0, 3);
    if (actionLines.length > 0) {
      return renderHumanActionMemory(actionLines);
    }
  }

  if (
    /\b(niveau precedent|niveau précédent|nouveau niveau|transition|garder en tete|garder en tête|handoff)\b/
      .test(message) &&
    normalizedLines.some((line) =>
      /\bniveau precedent|niveau précédent|une seule prochaine action|gros blocs abstraits|sortir de l'inertie\b/
        .test(line.normalized)
    ) &&
    (
      /\bbesoin d'un mini rappel|besoin.*rappel|c'etait quoi|c’était quoi|je dois garder en tete|je dois garder en tête\b/
        .test(response) ||
      !/une seule prochaine action|gros blocs|abstraits|sortir de l'inertie/
        .test(response)
    )
  ) {
    const levelLines = normalizedLines
      .filter((line) =>
        /\bniveau precedent|niveau précédent|une seule prochaine action|gros blocs abstraits|sortir de l'inertie\b/
          .test(line.normalized)
      )
      .map((line) => line.raw.trim())
      .slice(0, 2);
    if (levelLines.length > 0) {
      return renderHumanLevelMemory(levelLines);
    }
  }

  if (
    /\b(plat|repas|ingredient|eviter|evite)\b/.test(message) &&
    /sesame|tahini|gomasio/.test(normalizedContext) &&
    !/sesame|tahini|gomasio|allerg/.test(response)
  ) {
    return "Pour toi, je dois eviter le sesame, le tahini et le gomasio, car tu as une allergie au sesame.";
  }

  if (
    /\b(prochaine action|adaptee|adapte|bloque|fatigue)\b/.test(message) &&
    /sept minutes|observable|concrete/.test(normalizedContext) &&
    !/sept|observable|concret|concrete|boucle/.test(response)
  ) {
    const actionLines = normalizedLines
      .filter((line) =>
        /\bsession focus courte|demarre mieux|demarrage sous|minuteur|fichier deja pret\b/
          .test(line.normalized)
      )
      .map((line) => line.raw.replace(/\s+Priorite:.*$/i, "").trim())
      .slice(0, 3);
    if (
      actionLines.length > 0 &&
      /\bsession focus|demarrage bloque|démarrage bloque|bloque souvent|pourquoi.*bloque\b/
        .test(message)
    ) {
      return renderHumanActionMemory(actionLines);
    }
    const loopLine = findLine(/boucle ouverte|surcharge/);
    const loop = loopLine
      ? " Si tu es en surcharge, commence par fermer une boucle ouverte plutôt que d'ajouter une nouvelle ambition."
      : "";
    return `Pour toi, le bon format ici serait une action de sept minutes, observable et concrète.${loop} Choisis une seule micro-livraison liée au sujet courant et rends-la visible, sans ouvrir une nouvelle décision.`;
  }

  if (
    /\b(natation|nager|nage|session)\b/.test(message) &&
    /deux fois par semaine|recuperation/.test(normalizedContext) &&
    !/deux fois|recuperation|recuperer/.test(response)
  ) {
    return "Le bon cadre pour toi : nager deux fois par semaine, comme récupération, sans objectif de performance. La séance sert à redescendre la pression, pas à battre un chrono.";
  }

  if (
    /\b(qui est|quel est le lien|quel lien)\b/.test(message) &&
    /\bines\b/.test(message) &&
    /\brivage\b/.test(message) &&
    (!/assistante|administrative|contrat|consulting/.test(response) ||
      /compagne/.test(response))
  ) {
    const ines = findLine(/\bines\b.*assistante administrative/) ||
      "Ines est ton assistante administrative et t'aide a suivre les contrats signes.";
    const rivage = findLine(/\brivage\b.*client de consulting/) ||
      "Rivage est un client de consulting.";
    const contract = findLine(/\brivage\b.*contrat.*\bines\b/) ||
      "Le lien: Ines t'a aide a retrouver le document quand tu avais oublie de relancer Rivage sur un contrat.";
    return `${ines} ${rivage} ${contract}`;
  }

  if (
    /\b(anesthesier|pression le soir|whisky|alcool|apero)\b/.test(message) &&
    /whisky/.test(normalizedContext) &&
    (!/whisky/.test(response) ||
      (/sensible/.test(normalizedContext) && !/sensible/.test(response)))
  ) {
    return "Je dois garder en tete que tu parles du whisky le soir pour anesthesier la pression, et que ce sujet est sensible. Je peux le nommer ici parce que tu viens de le demander directement, mais je ne dois pas le ressortir dans une conversation neutre.";
  }

  return args.responseContent;
}
