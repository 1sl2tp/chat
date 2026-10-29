from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JS = (ROOT / 'zalo-admin-link.js').read_text('utf-8')
CSS = (ROOT / 'zalo-admin-link.css').read_text('utf-8')
GROUP_JS = (ROOT / 'contact-directory-admin.js').read_text('utf-8')


def compact(text: str) -> str:
    return ''.join(text.split())


def test_account_admin_has_pinned_search_and_list_only_scrolls():
    assert 'data-zalo-account-search' in JS, 'missing account-admin realtime search input'
    assert 'normalizeAccountSearch' in JS and 'accountMatchesSearch' in JS, 'missing account search matcher'
    assert "search.addEventListener('input'" in JS, 'account search must update in realtime'
    assert "account?.display_name" in JS and "account?.username" in JS and "contact?.display_name" in JS, 'search must cover Chat name, username, and Zalo name'

    css = compact(CSS)
    assert '.zalo-account-card{box-sizing:border-box;position:relative;display:flex;flex-direction:column;' in css, 'card must remain a contained flex shell'
    assert 'overflow:hidden' in css[css.index('.zalo-account-card{'):css.index('.zalo-account-modal-head{')], 'main card itself must not scroll'
    assert '.zalo-account-list{min-height:0;min-width:0;flex:11auto;display:grid;' in css, 'list must own remaining height'
    list_block = css[css.index('.zalo-account-list{'):css.index('.zalo-account-row{')]
    assert 'overflow:auto' in list_block and 'overscroll-behavior:contain' in list_block, 'directory list must scroll independently'
    assert '.zalo-account-preferences{' in css and 'overflow-x:hidden;overflow-y:auto;' in css, 'oversized notification settings must scroll in a separate bounded region'
    assert '.zalo-account-search{display:block;flex:00auto;' in css, 'search stays outside both scrollers'
    assert '.zalo-account-search' in CSS, 'search control needs dedicated layout styling'


def test_account_group_is_compact_and_moved_to_top_region():
    assert "group.className='zalo-account-row-group'" in GROUP_JS, 'group select needs its own top-region owner'
    assert 'group.appendChild(select)' in GROUP_JS, 'group select must live in top-region owner'
    assert 'row.insertBefore(group,actions)' in GROUP_JS, 'group region must be placed before lower action row'

    css = compact(CSS)
    assert '.zalo-account-row-group{' in css, 'missing compact group-region styling'
    mobile = css[css.index('@media(max-width:640px){'):]
    assert '.zalo-account-row{grid-template-columns:minmax(0,1fr);align-items:stretch;' in mobile, 'mobile account rows must not squeeze account and linked Zalo into narrow columns'
    assert '.zalo-account-row-group{grid-column:1;align-self:center;justify-content:flex-start;' in mobile, 'group select must keep its own non-overlapping row'
    assert '.zalo-account-row-group::before{content:"Phânloại";' in mobile, 'group select needs a visible label'
    assert '.zalo-account-row-actions{grid-column:1;justify-content:flex-start;' in mobile, 'mobile actions must remain on a separate row'


if __name__ == '__main__':
    test_account_admin_has_pinned_search_and_list_only_scrolls()
    test_account_group_is_compact_and_moved_to_top_region()
    print('Zalo account pinned search + list-only scroll + compact group contract PASS')
