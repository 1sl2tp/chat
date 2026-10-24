"""UI library trace contract: every catalog entry points to original Chat source.

Read-only static check; no app startup, storage, network, or authenticated data.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
PAGE = BASE / "ui-library" / "index.html"
CATALOG = re.compile(
    r'<script id="ui-inventory" type="application/json">([\s\S]*?)</script>'
)


def _catalog():
    html = PAGE.read_text(encoding="utf-8")
    match = CATALOG.search(html)
    assert match, "canonical Chat UI inventory missing"
    return html, json.loads(match.group(1))


def _lookup_token(selector: str) -> str:
    selector = selector.strip()
    if selector.endswith("()"):
        return selector[:-2]
    if selector.startswith((".", "#")):
        return selector[1:]
    if selector.startswith("["):
        return selector[1:].split("=", 1)[0].rstrip("]")
    return selector


def test_component_inventory_source_trace():
    _html, rows = _catalog()
    assert len(rows) >= 246, "B+ demo/typing indicator deliberately retired (UI-207)"
    assert len({r["id"] for r in rows}) == len(rows)
    loaded = {}
    for row in rows:
        assert row.get("title") and row.get("shape")
        assert row.get("purpose") and row.get("scope")
        assert row.get("primitive") and row.get("demo")
        assert row.get("sources") and row.get("selector")
        assert row.get("contract"), row["id"]
        token = _lookup_token(str(row["selector"]))
        assert token, row["id"]
        observed = False
        for source in row["sources"]:
            file = (BASE / source).resolve()
            assert file.is_relative_to(BASE), (row["id"], source)
            assert file.is_file(), (row["id"], source)
            if source not in loaded:
                loaded[source] = file.read_text(encoding="utf-8")
            if token in loaded[source]:
                observed = True
        assert observed, f"{row['id']}: {row['selector']} is absent from its declared source"
    assert len({r["scope"] for r in rows}) >= 10


def test_catalog_is_ui_only_and_has_bounded_render():
    html, _rows = _catalog()
    for key in ["shape", "purpose", "primitive", "scope"]:
        assert f'data-mode="{key}"' in html
    assert 'id="moreComponents"' in html
    assert "limit+=24" in html
    assert "function sourcePreview(item)" in html
    assert "function markup(item)" in html
    assert 'href="./chat-flows.html"' in html
    forbidden = ["supabase-js", "client.storage", "V21SyncEngine", "V21MediaCache", "service_role"]
    assert all(secret not in html for secret in forbidden)
