#!/usr/bin/env python3
"""
Fabrique hero.html à partir de hero.src.html.

POURQUOI CE SCRIPT EXISTE. La maquette montre les deux étalons. Si on les
recopie à la main dans le HTML, il existe alors DEUX versions de chaque figure,
et la première correction appliquée à l'une ne l'est pas à l'autre — c'est
exactement le mode de divergence que toute la charte cherche à empêcher chez
six agents. Les étalons sont donc la source unique, et la maquette les INJECTE.

    python3 build-hero.py

Entrées  : hero.src.html, etalon-concept.svg, etalon-maquette.svg,
           fonts/*.woff2 (facultatif : sans eux, repli système)
Sortie   : hero.html — autonome, aucune requête réseau.
"""
import base64
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
FONTS = HERE / "fonts"

FIGURES = {"concept": "etalon-concept.svg", "maquette": "etalon-maquette.svg"}

# Poids réel des fichiers, affiché à chaque build : un budget qu'on ne voit
# pas est un budget qui grossit.
FACES = [
    ("Young Serif", "youngserif-latin.woff2", "400"),
    ("Public Sans", "publicsans-latin.woff2", "400 700"),
]

# La plage `latin` telle que Google la sert réellement. Vérifiée le 2026-08-12
# dans la réponse de fonts.googleapis.com. Elle contient déjà TOUT le français
# utile — é è ê à ù ç (U+00C0-00FF), œ Œ (U+0152-0153), « » (U+00AB/BB),
# l'apostrophe ’ et l'espace insécable U+00A0. `latin-ext` ne sert qu'aux noms
# propres étrangers et au Ÿ ; il n'est pas embarqué ici.
LATIN = ("U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, "
         "U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, "
         "U+2212, U+2215, U+FEFF, U+FFFD")


def inline_svg(path: pathlib.Path) -> str:
    """Le SVG, débarrassé de ce qui n'a de sens qu'en fichier autonome."""
    s = path.read_text(encoding="utf-8")
    s = re.sub(r"<\?xml.*?\?>", "", s, flags=re.S)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)          # les commentaires vivent dans l'étalon
    s = s.replace(' xmlns="http://www.w3.org/2000/svg"', "")
    s = re.sub(r'\s(width|height)="\d+"', "", s, count=2)  # la page décide de la taille
    s = s.replace("<svg ", '<svg style="width:100%" ', 1)
    return re.sub(r"\n\s*\n+", "\n", s).strip()


def font_faces() -> tuple[str, int]:
    out, total = [], 0
    for family, filename, weight in FACES:
        f = FONTS / filename
        if not f.exists():
            print(f"  ! {filename} absent — repli système pour {family}", file=sys.stderr)
            continue
        raw = f.read_bytes()
        total += len(raw)
        b64 = base64.b64encode(raw).decode("ascii")
        out.append(
            f'@font-face {{\n'
            f'  font-family: "{family}";\n'
            f'  src: url(data:font/woff2;base64,{b64}) format("woff2");\n'
            f'  font-weight: {weight};\n'
            f'  font-style: normal;\n'
            f'  font-display: swap;\n'
            f'  unicode-range: {LATIN};\n'
            f'}}'
        )
        print(f"  · {family:<14} {len(raw):>7} o  = {len(raw)/1024:5.1f} Ko")
    return "\n".join(out), total


def main() -> int:
    src = HERE / "hero.src.html"
    if not src.exists():
        print("hero.src.html introuvable", file=sys.stderr)
        return 1
    html = src.read_text(encoding="utf-8")

    for key, filename in FIGURES.items():
        path = HERE / filename
        if not path.exists():
            print(f"{filename} introuvable", file=sys.stderr)
            return 1
        marker = f"<!--FIG:{key}-->"
        if marker not in html:
            print(f"marqueur {marker} absent de hero.src.html", file=sys.stderr)
            return 1
        html = html.replace(marker, inline_svg(path))
        print(f"  · {filename} injecté")

    faces, total = font_faces()
    html = html.replace("/* @FONTFACE_SLOT */", faces)

    out = HERE / "hero.html"
    out.write_text(html, encoding="utf-8")
    print(f"\n  hero.html : {out.stat().st_size/1024:6.1f} Ko "
          f"(dont {total/1024:.1f} Ko de polices, +33 % dus au base64)")
    print(f"  polices réellement livrées au site : {total/1024:.1f} Ko")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
