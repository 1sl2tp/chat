from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'index.source.html').read_text('utf-8')

media='@media (min-width:80rem) and (hover:hover) and (pointer:fine){'
start=source.index(media)
end=source.index('\n}\n\n/* Region 1 footer',start)
desktop=source[start:end+2]

owner='#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"] #regionTop .compact-top-grid{'
rule_start=desktop.index(owner)
rule_end=desktop.index('}',rule_start)
rule=desktop[rule_start:rule_end+1]

# In 3-column desktop mode, RegionTop belongs to the Chat column itself.
assert 'width:var(--desktop-chat-width)!important;' in rule
assert 'max-width:var(--desktop-chat-width)!important;' in rule
assert 'margin-inline-start:0;' in rule
assert 'margin-inline-end:auto;' in rule

# Retire the ineffective padding subtraction that lost to chat-content-axis !important.
assert 'padding-inline-end:var(--desktop-work-width);' not in rule

# Existing 3-column owner variables and Work separation remain intact.
assert '--desktop-chat-width:clamp(520px,40vw,640px);' in desktop
assert '--desktop-work-width:calc(100% - var(--desktop-chat-width));' in desktop
assert '#threadContent{' in desktop
assert 'padding-inline-end:var(--desktop-work-width);' in desktop
assert '#workThreadView{' in desktop
assert 'width:var(--desktop-work-width);' in desktop

# Existing top-mode behavior remains: Work tab is hidden only in the fixed
# 3-column desktop workspace; mobile and 2-column desktop rules are untouched.
assert '.top-mode-switch{' in desktop
assert 'grid-template-columns:minmax(0,1fr)!important;' in desktop
assert '[data-top-tab="work"]{' in desktop
assert 'display:none!important;' in desktop

print('V21.72.74 desktop workspace chat header owner PASS')
