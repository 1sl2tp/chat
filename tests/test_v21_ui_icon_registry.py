from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'index.source.html').read_text('utf-8')
icons=(ROOT/'ui-icons.js').read_text('utf-8')
app=(ROOT/'app.js').read_text('utf-8')
admin=(ROOT/'admin-composer-actions.js').read_text('utf-8')
zalo=(ROOT/'zalo-admin-link.js').read_text('utf-8')

assert 'data-build-source="ui-icons.js"' in source
assert source.index('data-build-source="reference/p2p/p2p-reference.js"') < source.index('data-build-source="ui-icons.js"') < source.index('data-build-source="app.js"')
for name in ['forward','save','close','chevron-left','chevron-right','quote','call','key']:
    assert name in icons
assert "return Icons?.markup?.(name,{size:20})||'';" in app
assert "return Icons?.node?.(name,{size:24})" in app
assert "window.V21Icons?.markup?.(kind,{size:22})" in admin
assert "window.V21Icons?.markup?.('close',{size:20})" in zalo
assert "if(name==='forward')" not in app
assert "const icons={" not in admin
print('shared icon registry contract PASS')
