from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "app.js").read_text("utf-8")
SOURCE = (ROOT / "index.source.html").read_text("utf-8")
SW = (ROOT / "sw.js").read_text("utf-8")


def compact(value: str) -> str:
    return "".join(value.split())


def test_day_separator_is_part_of_the_virtualized_message_row():
    app = compact(APP)
    source = compact(SOURCE)
    assert "functionmessageDaySeparatorLabel(message,{now}={})" in app
    assert "functionsyncMessageDayPresentation(node,message)" in app
    assert "syncMessageDayPresentation(node,message);" in app
    assert "messageDateKey(messageTimestampMs(message)),messageDaySeparatorLabel(message)" in app
    assert "constouter=node.querySelector(':scope>.message-turn-shell');" in app
    assert 'id="messageDayFloating"' in source
    assert ".message-day-separator{" in source
    assert "message-day-separator{margin-top:0}" in source


def test_floating_date_is_sticky_zero_height_and_hides_after_scroll_idle():
    app = compact(APP)
    source = compact(SOURCE)
    assert "scheduleMessageDayFloatingUpdate();" in app
    assert "messageDayFloatingTimer=setTimeout(()=>{messageDayFloatingTimer=0;if(messageDayFloating)messageDayFloating.dataset.visible='false';},900);" in app
    assert ".message-day-floating{position:sticky;" in source
    assert "height:0;" in source
    assert '.message-day-floating[data-visible="true"]{opacity:1;visibility:visible}' in source
    start = APP.index("function updateMessageDayFloating()")
    end = APP.index("function scheduleMessageDayFloatingUpdate()", start)
    update = compact(APP[start:end])
    assert ".scrollTop=" not in update
    assert "fetch(" not in update
    assert ".rpc(" not in update


def test_ui156_only_advances_shell_cache_namespace():
    # Release-specific cache epochs advance as the PWA shell changes.
    # Test the namespace contract, not an obsolete exact release token.
    import re
    assert re.search(r"const SHELL_CACHE_EPOCH='[a-z0-9-]+';", SW)
    assert "const CACHE_NAME='taphoa-chat-shell-'+RELEASE_VERSION+'-'+SHELL_CACHE_EPOCH;" in SW
    assert "const AVATAR_CACHE_NAME='taphoa-chat-avatars-v1';" in SW
    assert "await self.skipWaiting();" in SW
    assert "await self.clients.claim();" in SW
