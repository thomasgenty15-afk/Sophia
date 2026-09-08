#!/usr/bin/env python3
"""LIRE UN TIR AVEC NOTE — ce que le classifieur a rangé, et ce qui a bougé.

    python3 31-lire-note.py <log> <prompt.json> [plan.json]

Trois choses, dans cet ordre, parce que c'est l'ordre de la chaîne:
  1. le JSON que le MODÈLE a rendu (archive `keel-draft-note-classify`,
     `output_text`) — c'est lui qui dit dans quel tiroir la phrase est tombée;
  2. les compteurs du journal `keel/draft_note_classify` — ce que le LECTEUR en
     a gardé, et ce que l'écriture d'appétit a fait (`portions_moved`…);
  3. l'accusé (`notice`) tel que la personne le lira.
"""
import json
import sys


def main() -> None:
    log_path, prompt_path = sys.argv[1], sys.argv[2]

    # ── 1. CE QUE LE MODÈLE A RENDU ──────────────────────────────────────
    archives = json.load(open(prompt_path, encoding="utf-8"))
    cls = [a for a in archives if a.get("source") == "keel-draft-note-classify"]
    print(f"══ 1. LE MODÈLE — {len(cls)} appel(s) du classifieur sur {len(archives)} archive(s)")
    for i, a in enumerate(cls, 1):
        out = a.get("output_text") or ""
        print(f"   appel {i} · {a.get('model')} · {a.get('outcome')} · http {a.get('http_status')} · {a.get('created_at','')[11:19]}")
        try:
            j = json.loads(out)
        except Exception:
            print(f"      ⛔ output_text illisible ({len(out)} car.): {out[:200]!r}")
            continue
        for drawer in ("preferences", "next_plan", "notes", "portions", "settings", "skipped", "clarify", "safety"):
            v = j.get(drawer)
            if v is None:
                print(f"      {drawer:12s} ⛔ CLÉ ABSENTE")
            elif isinstance(v, list) and len(v) == 0:
                print(f"      {drawer:12s} []")
            else:
                print(f"      {drawer:12s} {json.dumps(v, ensure_ascii=False)}")
        # La phrase est-elle dans le message utilisateur ? (témoin T3)
        um = a.get("user_message") or ""
        print(f"      user_message: {len(um)} car. · version prompt: {a.get('prompt_version')}")

    # ── 2. CE QUE LE LECTEUR EN A GARDÉ, ET CE QUI A BOUGÉ ───────────────
    print("\n══ 2. LE JOURNAL `keel/draft_note_classify`")
    rows = []
    for ln in open(log_path, encoding="utf-8"):
        ln = ln.strip()
        if not ln.startswith("{"):
            continue
        try:
            r = json.loads(ln)
        except Exception:
            continue
        if r.get("tag") == "keel/draft_note_classify":
            rows.append(r)
    if not rows:
        print("   ⛔ AUCUNE LIGNE — la persistance n'a pas tourné (intent draft ?) ou le filtre user_id a raté")
    keys = [
        "reason", "proposed", "kept", "refused",
        "pref_proposed", "pref_kept", "pref_refused_forbidden_kinds",
        "notes_proposed", "notes_kept", "next_proposed", "next_kept",
        "portions_proposed", "portions_kept", "portions_down", "portions_up",
        "portions_asked", "portions_moved", "portions_at_edge", "portions_failed", "portions_unapplied",
        "portions_refused_unknown_member", "portions_refused_malformed",
        "settings_proposed", "settings_kept", "settings_time", "settings_difficulty", "settings_variety",
        "settings_asked", "settings_moved", "settings_at_edge", "settings_conflict", "settings_no_baseline",
        "settings_unsupported", "settings_failed", "settings_unapplied",
        "skipped", "skipped_degree", "skipped_setting", "skipped_other",
        "clarify_proposed", "clarify_kept", "clarify_refused_unknown_kind", "clarify_refused_forbidden_kinds",
        "lists_missing", "durable_written", "memo_written", "next_plan_written",
        "notice_delivered",
    ]
    for r in rows:
        print(f"   · {r.get('event') or r.get('reason') or '?'}")
        for k in keys:
            if k in r:
                print(f"      {k:36s} {json.dumps(r[k], ensure_ascii=False)}")

    # ── 3. L'ACCUSÉ ──────────────────────────────────────────────────────
    print("\n══ 3. L'ACCUSÉ (ce que la personne lit)")
    seen = False
    for ln in open(log_path, encoding="utf-8"):
        # `notifyMemoryWrite` journalise sous `keel.memory_clarification`,
        # event `notice_sent` / `notice_not_delivered`.
        if '"tag":"keel.memory_clarification"' in ln and '"notice_' in ln:
            print("   " + ln.strip()[:600])
            seen = True
    if not seen:
        # Le texte de l'accusé vit dans la bulle de chat: on le relit en base si
        # le lecteur du journal ne le porte pas.
        print("   (pas de ligne d'accusé dans le journal — relire `chat_messages` du foyer)")


if __name__ == "__main__":
    main()
