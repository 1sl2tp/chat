from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
APP=(ROOT/'app.js').read_text('utf-8')
STORE=(ROOT/'v21-message-store.js').read_text('utf-8')
SRC=(ROOT/'index.source.html').read_text('utf-8')
def fn(text,name):
    m=re.search(rf"function {re.escape(name)}\([^)]*\)\{{",text); assert m,name
    start=m.start(); depth=0; seen=False
    for i in range(m.end()-1,len(text)):
        c=text[i]
        if c=='{': depth+=1; seen=True
        elif c=='}':
            depth-=1
            if seen and depth==0:return text[start:i+1]
    raise AssertionError(name)
def test_release_marker():
    assert 'V21.72.29' in SRC
    assert "version:'V21.72.29'" in APP
def test_viewport_policy_geometry_event_is_exclusive():
    body=fn(APP,'publishViewportGeometryChange')
    assert "if(viewport.mode===VIEWPORT_STATES.FOLLOW_TAIL)" in body
    assert 'return scheduleFollowTailGeometryReconcile(reason);' in body
    assert 'if(interactionGeometryAnchor)' in body
    assert 'return scheduleInteractionAnchorGeometryReconcile(reason);' in body
def test_tail_priority_clears_anchor_and_owns_target_message():
    claim=fn(APP,'claimTailIntent'); assert 'clearInteractionGeometryAnchor();' in claim
    own=fn(APP,'commitComposerSnapshotAfterSend')
    assert "claimTailIntent('own-send',{messageId:anchorMessageId||''})" in own
    assert "setInteractionGeometryAnchor(anchorMessageId,{kind:'own-send'})" not in own
def test_interaction_anchor_is_bounded():
    r=fn(APP,'reconcileInteractionGeometryAnchor')
    assert 'anchor.stableFrames>=2||anchor.attempts>=30' in r
    assert 'clearInteractionGeometryAnchor(anchor.kind);' in r
def test_user_scroll_releases_reveal_targets():
    body=fn(APP,'markUserScrollIntent')
    assert 'clearInteractionGeometryAnchor();' in body
    assert "tailRevealTargetMessageId='';" in body
def test_one_canonical_composer_scope_only():
    assert 'function currentComposerScope()' in APP
    assert 'function currentMediaDraftScope()' not in APP
    assert 'function currentImageDraftScope()' not in APP
    body=fn(APP,'currentComposerScope')
    assert "state:ready?'READY':'RESOLVING'" in body
def test_attachment_scope_is_strict():
    assert "function attachmentBelongsToComposerScope(item,scope=currentComposerScope())" in APP
    assert "String(item?.conversationId||'')!==String(scope.conversationId||'')" in APP
    send=fn(APP,'sendNow'); assert "sendScope.state!=='READY'" in send
def test_draft_migration_and_recording_gate():
    assert 'if(!previousConversation&&nextConversation&&nextContact===previousContact&&previousKey!==nextKey)' in APP
    body=fn(APP,'startRecording')
    assert 'const recordingScope=currentComposerScope();' in body
    assert "if(recordingScope.state!=='READY')" in body
def test_message_store_null_conversation_is_not_wildcard():
    match=fn(STORE,'activeConversationMatches')
    assert 'return Boolean(currentConversationId)&&String(currentConversationId)===target;' in match
    merge=fn(STORE,'merge'); assert '!currentConversationId' not in merge
    apply=fn(STORE,'apply'); assert 'if(!activeConversationMatches(row.conversation_id))return false;' in apply
def test_message_store_media_requires_exact_conversation():
    body=fn(STORE,'sendMedia')
    assert "if(!scopedConversation)throw new Error('conversation_not_ready');" in body
    assert "String(asset?.conversationId||'')!==String(scopedConversation)" in body
