import asyncio
import subprocess
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
subprocess.run(['node', 'scripts/build-smoke-bundle.mjs'], cwd=ROOT, check=True)
BUNDLE = (ROOT / 'tests/.smoke-bundle.js').read_text()
CSS = '\n'.join((ROOT / 'src/styles' / name).read_text() for name in ['tokens.css', 'layout.css', 'ui.css'])
SHELL = f'''<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"><style>{CSS}</style></head><body><div id="app-root"></div><div id="overlay-root"></div></body></html>'''

async def boot(page, role='admin'):
    await page.set_content(SHELL)
    await page.evaluate("location.hash='#user'" if role == 'user' else "location.hash=''" )
    await page.evaluate("globalThis.__TAPHOA_DEMO__=true")
    await page.add_script_tag(content=BUNDLE)
    await page.wait_for_selector('html[data-app-ready="true"]')

async def check_icon_geometry(page):
    regular = page.locator('.icon-button:not(.compact):not(.micro) .ui-icon').first
    if await regular.count():
        w = float((await regular.evaluate("el => getComputedStyle(el).width")).replace('px',''))
        assert w == 18, w
    compact = page.locator('.icon-button.compact .ui-icon').first
    if await compact.count():
        w = float((await compact.evaluate("el => getComputedStyle(el).width")).replace('px',''))
        assert w == 16, w

async def check_directory_quick_actions(page):
    await page.locator('[data-create-menu]').click()
    quick = page.locator('[data-quick-create]')
    assert await quick.is_visible()
    assert await quick.locator('[data-quick-customer]').inner_text() == 'Thêm KH'
    assert await quick.locator('[data-quick-group]').inner_text() == 'Thêm nhóm'
    await page.locator('[data-create-menu]').click()
    assert await quick.is_hidden()

    row = page.locator('.contact-row').first
    await row.locator('[data-more]').click()
    assert await row.evaluate("el => el.classList.contains('actions-open')")
    assert await row.locator('.contact-copy strong').is_visible()
    group = row.locator('[data-action="group"]')
    if await group.count():
        await group.click()
        assert await page.locator('.contact-inline-group').count() == 1
        assert await page.locator('.contact-inline-group').is_visible()
        await page.locator('.directory-search input').click()
        await page.wait_for_timeout(30)
        assert await page.locator('.contact-inline-group').count() == 0

async def check_message_actions(page):
    text_row = page.locator('.message').filter(has=page.locator('.message-bubble p')).first
    await text_row.scroll_into_view_if_needed()
    footer = text_row.locator('.message-footer')
    await footer.click()
    assert 'Trả lời' in await text_row.locator('.message-actions').inner_text()
    assert 'Sao chép' in await text_row.locator('.message-actions').inner_text()

    image_row = page.locator('.message').filter(has=page.locator('.message-images')).first
    await image_row.scroll_into_view_if_needed()
    await image_row.locator('.message-footer').click()
    actions = await image_row.locator('.message-actions').inner_text()
    assert 'Trả lời' in actions and 'Lưu' in actions

    status_rows = page.locator('.message-meta')
    status_text = [await status_rows.nth(i).inner_text() for i in range(await status_rows.count())]
    delivery = [value for value in status_text if 'Đã gửi' in value or 'Đã xem' in value or 'Đang gửi' in value]
    assert len(delivery) == 1, delivery

async def check_attach_menu(page):
    await page.locator('[data-attach]').click()
    menu = page.locator('[data-attach-menu]')
    assert await menu.is_visible()
    labels = [await menu.locator('button').nth(i).inner_text() for i in range(await menu.locator('button').count())]
    assert labels == ['Ảnh', 'Camera', 'Tệp'], labels
    assert await page.locator('[data-camera-input]').get_attribute('capture') == 'environment'
    await page.locator('[data-attach]').click()
    assert await menu.is_hidden()

async def open_media_from_header(page):
    print('  media: click header menu', flush=True)
    await page.locator('[data-header-menu]').click()
    popover = page.locator('.popover-panel')
    print('  media: wait popover', flush=True)
    await popover.wait_for(state='visible')
    media_button = popover.locator('[data-media]')
    assert await media_button.count() == 1
    print('  media: click media', flush=True)
    await media_button.click()
    print('  media: wait manager', flush=True)
    await page.locator('.media-manager').wait_for(state='visible')

async def check_media_manager_mobile(page):
    await open_media_from_header(page)
    print('  media: manager open', flush=True)
    assert await page.locator('.chat-screen').evaluate("el => el.classList.contains('media-open')")
    assert await page.locator('.chat-primary').is_hidden()
    labels = [await page.locator('[data-media-tab]').nth(i).inner_text() for i in range(await page.locator('[data-media-tab]').count())]
    assert labels == ['Ảnh', 'Tệp', 'Link', 'Ghi âm'], labels
    assert await page.locator('[data-origin]').count() >= 1
    print('  media: click origin', flush=True)
    await page.locator('[data-origin]').first.click()
    await page.wait_for_timeout(80)
    print('  media: origin returned', flush=True)
    assert await page.locator('.media-manager').count() == 0
    assert await page.locator('.message-origin-highlight').count() == 1

async def check_media_manager_desktop(page):
    await open_media_from_header(page)
    assert await page.locator('.directory-screen').is_visible()
    assert await page.locator('.chat-primary').is_visible()
    assert await page.locator('.chat-media-pane').is_visible()
    assert await page.locator('.chat-screen').evaluate("el => el.classList.contains('media-open')")
    await page.locator('[data-media-close]').click()
    await page.wait_for_timeout(40)
    assert not await page.locator('.chat-screen').evaluate("el => el.classList.contains('media-open')")
    assert await page.locator('.directory-screen').is_visible()
    assert await page.locator('.chat-primary').is_visible()

async def check_call_timeline(page):
    initial = await page.locator('.call-event').count()
    assert initial >= 2, initial
    assert await page.locator('.call-event').filter(has_text='Gọi lại').count() >= 1
    await page.locator('[data-header-call]').click()
    await page.wait_for_selector('.full-call')
    await page.wait_for_timeout(1350)
    assert await page.locator('[data-call-status]').inner_text() == 'Đang trong cuộc gọi'
    await page.locator('[data-call-minimize]').click()
    await page.wait_for_selector('.call-mini')
    await page.locator('.call-mini-main').click()
    await page.wait_for_selector('.full-call')
    await page.locator('[data-call-end]').click()
    await page.wait_for_timeout(900)
    assert await page.locator('.call-event').count() == initial + 1

async def check_viewport(page, width, height):
    print(f'SMOKE width={width} boot', flush=True)
    await page.set_viewport_size({'width': width, 'height': height})
    await boot(page, 'admin')
    overflow = await page.evaluate('document.documentElement.scrollWidth - window.innerWidth')
    assert overflow <= 0, (width, overflow)
    assert await page.locator('.directory-screen').count() == 1

    await check_directory_quick_actions(page)
    print(f'SMOKE width={width} directory-actions', flush=True)

    font = float((await page.locator('.directory-search input').evaluate("el => getComputedStyle(el).fontSize")).replace('px',''))
    if width <= 640:
        assert font >= 16, (width, font)

    if width >= 900:
        assert await page.locator('.admin-workspace').count() == 1
        assert await page.locator('.chat-screen').count() == 1
        assert await page.locator('[data-header-back]').count() == 0
        before = await page.locator('.header-copy strong').inner_text()
        contacts = page.locator('.contact-identity')
        if await contacts.count() > 1:
            await contacts.nth(1).click()
            await page.wait_for_timeout(50)
            after = await page.locator('.header-copy strong').inner_text()
            assert before != after
            assert await page.locator('.directory-screen').count() == 1
            assert await page.locator('.chat-screen').count() == 1
    else:
        await page.locator('.contact-identity').first.click()
        await page.wait_for_selector('.chat-screen')
        assert await page.locator('.directory-screen').count() == 0

    textarea = page.locator('.composer-normal textarea')
    await textarea.focus()
    box = await page.locator('.composer-owner').bounding_box()
    assert box and box['y'] + box['height'] <= height + 2, (width, box)
    assert await page.locator('.message').count() >= 10
    assert await page.locator('.message-images').count() >= 4
    assert await page.locator('.message-system').count() >= 1

    await check_icon_geometry(page)
    await check_message_actions(page)
    print(f'SMOKE width={width} message-actions', flush=True)
    await check_attach_menu(page)
    print(f'SMOKE width={width} attach-menu', flush=True)

    if width >= 900:
        await check_media_manager_desktop(page)
    else:
        await check_media_manager_mobile(page)
    print(f'SMOKE width={width} media', flush=True)

    await check_call_timeline(page)
    print(f'SMOKE width={width} call', flush=True)

    if width < 900:
        await page.locator('[data-header-back]').click()
        await page.wait_for_selector('.directory-screen')

async def check_user(page):
    print('SMOKE user boot', flush=True)
    await page.set_viewport_size({'width': 390, 'height': 844})
    await boot(page, 'user')
    assert await page.locator('.chat-screen').count() == 1
    assert await page.locator('[data-header-back]').count() == 0
    await page.locator('[data-header-menu]').click()
    popover = page.locator('.popover-panel')
    await popover.wait_for(state='visible')
    assert await popover.locator('[data-media]').count() == 1
    assert await popover.locator('[data-account]').count() == 1
    await popover.locator('[data-media]').click()
    await page.locator('.media-manager').wait_for(state='visible')
    await page.locator('[data-media-close]').click()
    assert await page.locator('.chat-primary').is_visible()
    print('SMOKE user media', flush=True)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        page = await browser.new_page()
        for size in [(280, 700), (320, 700), (390, 844), (1280, 800)]:
            await check_viewport(page, *size)
        await check_user(page)
        await browser.close()
    print('E2E_SMOKE_V3=PASS widths=280,320,390 mobile; 1280 admin split-pane; actions/media/origin/call/user')

if __name__ == '__main__':
    asyncio.run(main())
