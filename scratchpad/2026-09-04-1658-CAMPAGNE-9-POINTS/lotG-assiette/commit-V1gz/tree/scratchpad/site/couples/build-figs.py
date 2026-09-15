#!/usr/bin/env python3
"""
Extrait les trois figures de `CouplesPage.tsx`, les rend en SVG autonomes, et
fabrique un banc de vérification qui MESURE la largeur réelle de chaque texte.

POURQUOI EXTRAIRE PLUTÔT QUE RECOPIER. Si les figures étaient écrites deux fois
— une fois dans la page, une fois dans un .svg de scratchpad — la première
correction appliquée à l'une ne le serait pas à l'autre. C'est le mode de
divergence que la charte passe son §6 à empêcher. La page est la source, ces
fichiers en sont une projection.

CE QUE LE BANC VÉRIFIE, ET QU'AUCUNE RELECTURE NE PEUT VOIR. Une figure porte
du texte à 9-13 unités sur une grille de 480. Les mêmes phrases en français
sont 15 à 20 % plus longues qu'en anglais. Un débordement de la grille ne se
devine pas : il se mesure, avec la vraie police, dans un vrai moteur de rendu.

    python3 build-figs.py
"""
import base64
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
DESIGN = HERE.parent / "design"
PAGE = HERE.parent.parent.parent / "frontend/src/keel/pages/CouplesPage.tsx"

FACES = [("Young Serif", "youngserif-latin.woff2", "400"),
         ("Public Sans", "publicsans-latin.woff2", "400 700")]
LATIN = ("U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, "
         "U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, "
         "U+2212, U+2215, U+FEFF, U+FFFD")

CORNER = ('<path d="M 8 32 L 8 16 A 8 8 0 0 1 16 8 L 32 8" fill="none" '
          'stroke="var(--ill-fig, #632C4C)" stroke-width="2" stroke-linecap="round"/>')
EYEBROW = ('<text x="44" y="26" font-size="11" font-weight="600" letter-spacing="1.2" '
           'fill="var(--ill-ink-soft, #6A5A64)">{}</text>')

FIGS = {"plates": "FigPlates", "who": "FigWho", "chat": "FigChat"}
BUTTONS = [(24, 134, "b1"), (246, 134, "b2"), (24, 172, "b3"), (246, 172, "b4")]


def load_keys(path):
    """Les clés d'un fichier `keys.*.ts` — valeur sur la même ligne ou la suivante."""
    src = path.read_text(encoding="utf-8")
    pairs = re.findall(r'"(couples\.[a-z0-9_.]+)":\s*\n?\s*"((?:[^"\\]|\\.)*)"', src)
    return {k: v.replace('\\"', '"') for k, v in pairs}


def camel_to_kebab(svg):
    for a in ("strokeWidth", "strokeLinecap", "strokeLinejoin", "fontSize",
              "fontWeight", "letterSpacing", "textAnchor", "fontFamily"):
        kebab = re.sub(r"(?<!^)(?=[A-Z])", "-", a).lower()
        svg = svg.replace(a + "=", kebab + "=")
    return svg


def extract(page_src, fn_name):
    """Le JSX entre `return (` et `);` de la fonction nommée."""
    start = page_src.index(f"function {fn_name}(")
    body = page_src[start:]
    body = body[body.index("return ("):]
    depth, out = 0, []
    for ch in body[len("return ("):]:
        if ch == "(":
            depth += 1
        elif ch == ")":
            if depth == 0:
                break
            depth -= 1
        out.append(ch)
    return "".join(out).strip()


def render(jsx, keys):
    svg = jsx
    svg = svg.replace("<FigCorner />", CORNER)
    svg = re.sub(r'<FigEyebrow>\{t\("([^"]+)"\)\}</FigEyebrow>',
                 lambda m: EYEBROW.format(keys[m.group(1)]), svg)
    # La boucle des quatre gestes, dépliée : quatre <g>, pas un map.
    def expand(_):
        out = []
        for x, y, k in BUTTONS:
            out.append(
                f'<g><rect x="{x}" y="{y}" width="210" height="30" rx="4" '
                f'fill="var(--ill-paper, #FBF8FA)" stroke="var(--ill-ink-soft, #6A5A64)" '
                f'stroke-width="1"/><text x="{x + 14}" y="{y + 20}" font-size="11" '
                f'fill="var(--ill-ink, #23191F)">{keys["couples.fig.chat." + k]}</text></g>')
        return "\n      ".join(out)
    svg = re.sub(r"\{buttons\.map\(\(b\) => \(.*?\)\)\}", expand, svg, flags=re.S)
    svg = re.sub(r'\{t\("([^"]+)"\)\}', lambda m: keys[m.group(1)], svg)
    svg = svg.replace('className="font-sans"',
                      'xmlns="http://www.w3.org/2000/svg" font-family="Public Sans, sans-serif"')
    svg = re.sub(r"\{/\*.*?\*/\}", "", svg, flags=re.S)          # commentaires JSX
    svg = camel_to_kebab(svg)
    return re.sub(r"\n\s*\n+", "\n", svg).strip()


def font_faces():
    out = []
    for family, filename, weight in FACES:
        f = DESIGN / "fonts" / filename
        if not f.exists():
            print(f"  ! {filename} absent — repli système", file=sys.stderr)
            continue
        b64 = base64.b64encode(f.read_bytes()).decode("ascii")
        out.append(f'@font-face{{font-family:"{family}";src:url(data:font/woff2;base64,{b64}) '
                   f'format("woff2");font-weight:{weight};font-style:normal;'
                   f'unicode-range:{LATIN};}}')
    return "\n".join(out)


def main():
    page = PAGE.read_text(encoding="utf-8")
    fr, en = load_keys(HERE / "keys.fr.ts"), load_keys(HERE / "keys.en.ts")
    print(f"  · {len(fr)} clés FR, {len(en)} clés EN")
    missing = set(en) ^ set(fr)
    if missing:
        print(f"  ! PARITÉ ROMPUE: {sorted(missing)}", file=sys.stderr)
        return 1

    blocks = {}
    for slug, fn in FIGS.items():
        jsx = extract(page, fn)
        for loc, keys in (("fr", fr), ("en", en)):
            blocks[(slug, loc)] = render(jsx, keys)
        (HERE / f"fig-{slug}.svg").write_text(blocks[(slug, "fr")] + "\n", encoding="utf-8")
        print(f"  · fig-{slug}.svg écrit (FR — projection de {fn})")

    cards = []
    for slug in FIGS:
        for loc in ("fr", "en"):
            cards.append(f'<figure data-fig="{slug}-{loc}"><figcaption>{slug} · '
                         f'{loc.upper()}</figcaption>{blocks[(slug, loc)]}</figure>')

    html = f"""<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Banc de mesure — figures /couples</title><style>
{font_faces()}
:root{{--ill-ink:#23191F;--ill-ink-soft:#6A5A64;--ill-paper:#FBF8FA;
--ill-wash:#EFE0E9;--ill-fig:#632C4C;}}
body{{margin:0;padding:24px;background:#FBF8FA;color:#23191F;
font-family:"Public Sans",sans-serif;}}
figure{{margin:0 0 32px;max-width:480px;}}
figcaption{{font-size:11px;letter-spacing:.1em;text-transform:uppercase;
color:#6A5A64;margin-bottom:8px;}}
svg{{width:480px;height:240px;display:block;background:#FBF8FA;
outline:1px solid #E3DAE0;}}
</style></head><body>
{"".join(cards)}
</body></html>"""
    (HERE / "verify-figs.html").write_text(html, encoding="utf-8")
    print("  · verify-figs.html écrit (6 rendus, polices embarquées)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
