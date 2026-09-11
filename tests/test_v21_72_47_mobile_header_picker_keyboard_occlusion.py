from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / 'index.source.html').read_text('utf-8')
APP = (ROOT / 'app.js').read_text('utf-8')

# 1) Header identity avatar must own its 20px geometry. It must not inherit
# the 48px contact-directory source class.
assert 'class="top-mode-contact-avatar" data-chat-tab-avatar' in SRC
assert 'class="contact-avatar-source top-mode-contact-avatar" data-chat-tab-avatar' not in SRC
assert '.top-mode-contact-avatar{width:20px;height:20px;flex:0 0 20px;' in SRC

# 2) On iOS the + action must release the editor/keyboard before invoking the
# native file source picker, while staying inside the same click activation.
ios = re.search(
    r"if\(RuntimeProfile\.pickerMode==='ios-native'\)\{(?P<body>.*?)\n\s*return;\n\s*\}",
    APP,
    re.S,
)
assert ios, 'ios-native picker branch missing'
body = ios.group('body')
assert "document.activeElement===editor" in body
assert 'editor.blur();' in body
assert body.index('editor.blur();') < body.index('openNativeFilePicker(uploadIOSSourceInput)')

# 3) Conversation paint remains owned by ScrollRoot, but while the software
# keyboard is open it must be clipped at the keyboard occlusion boundary so
# chat content cannot remain visible underneath translucent keyboard chrome.
assert '#stageLayout[data-keyboard-open="true"] #scrollRoot{' in SRC
assert 'clip-path:inset(0 0 var(--screen-keyboard-height,0px) 0);' in SRC
assert '-webkit-clip-path:inset(0 0 var(--screen-keyboard-height,0px) 0);' in SRC

print('V21.72.47 mobile header/picker/keyboard occlusion contract PASS')
