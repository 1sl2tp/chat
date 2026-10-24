"""UI-214: Contact name editing must be available without changing login identity.

Static regression for the Admin contact action on desktop/touch and horizontal
category navigation. Existing auth/DB code owns global account edits.
"""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/"index.source.html").read_text("utf-8")
SHELL=(ROOT/"shell.js").read_text("utf-8")
DIRECTORY=(ROOT/"contact-directory-admin.js").read_text("utf-8")
AUTH=(ROOT/"auth-session-store.js").read_text("utf-8")


def test_active_customer_has_accessible_profile_button():
    assert 'data-active-contact-profile hidden' in HTML
    assert 'aria-label="Sửa thông tin liên hệ"' in HTML
    assert '.contact-profile-header-button[hidden]{display:none!important}' in HTML
    assert 'if(profileButton)profileButton.hidden=true' in SHELL
    assert "item?.role==='user'&&!isPinnedBankReportContact(item)" in SHELL
    assert 'const activeProfile=target.closest(\'[data-active-contact-profile]\')' in SHELL
    assert "if(item?.role==='user'&&!isPinnedBankReportContact(item))openManagedProfile(item)" in SHELL
    assert '@media(max-width:520px){.contact-profile-header-button{display:none!important}}' in HTML


def test_touch_can_edit_selected_contact_without_covering_all_contact_times():
    assert '.shell-contact-row[data-active="true"] .shell-contact-manage{display:grid!important}' in HTML
    assert '.shell-contact-row[data-active="true"] .shell-contact-time{opacity:0}' in HTML
    assert '.shell-contact-manage{display:none!important}' in HTML
    assert "if(item)openManagedProfile(item)" in SHELL


def test_display_name_is_distinct_from_username_and_warning_is_present():
    assert 'data-profile-name-hint' in SHELL
    assert 'không phải tên gợi nhớ riêng' in SHELL
    assert 'Tên hiển thị' in SHELL
    assert "display_name:String(displayName||'').trim()" in AUTH
    assert "username:nextUsername" in AUTH


def test_filters_reveal_clipped_categories_by_touch_or_button():
    assert 'data-contact-directory-filter-more' in DIRECTORY
    assert 'class="contact-directory-filter-more"' in DIRECTORY
    assert "rail.scrollWidth>rail.clientWidth+3" in DIRECTORY
    assert "rail.scrollBy({left:atEnd?-rail.scrollWidth:Math.max(100,rail.clientWidth*.7),behavior:'smooth'})" in DIRECTORY
    assert "more.hidden=!scrollable" in DIRECTORY
    assert 'aria-label="Lọc danh bạ, cuộn ngang để xem thêm"' in DIRECTORY
    assert "if(scrollToTop)scrollHost.scrollTop=0" in DIRECTORY
