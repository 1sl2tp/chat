from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'index.source.html').read_text('utf-8')
app=(ROOT/'app.js').read_text('utf-8')
admin=(ROOT/'admin-composer-actions.js').read_text('utf-8')
quote=(ROOT/'quote-client.js').read_text('utf-8')
forward_css=(ROOT/'message-forward.css').read_text('utf-8')
admin_css=(ROOT/'admin-composer-actions.css').read_text('utf-8')
quote_css=(ROOT/'quote-client.css').read_text('utf-8')

for name in ['message-forward.css','quote-client.css','admin-composer-actions.css']:
    assert f'data-build-source="{name}"' in source
assert 'installMessageForwardStyle' not in app
assert 'v21-message-forward-style' not in app
assert 'function installStyle()' not in admin
assert 'v21-admin-composer-actions-style' not in admin
assert 'function installStyle()' not in quote
assert 'v21-quote-admin-style' not in quote
assert '.message-forward-overlay' in forward_css
assert '.admin-composer-quote-overlay' in admin_css
assert '.quote-admin-block' in quote_css
print('UI style ownership contract PASS')
