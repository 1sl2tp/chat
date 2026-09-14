from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"{label} block not found")
    return text.replace(old, new, 1)


shell_path = Path("shell.js")
shell = shell_path.read_text("utf-8")
old_time = """function formatContactTime(value){
  if(!value)return'';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return'';
  const now=new Date();
  const sameDay=date.getFullYear()===now.getFullYear()&&date.getMonth()===now.getMonth()&&date.getDate()===now.getDate();
  if(sameDay)return date.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',hour12:false});
  if(date.getFullYear()===now.getFullYear())return date.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'});
  return date.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'2-digit'});
}
"""
new_time = """function formatContactTime(value){
  if(!value)return'';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return'';
  const now=new Date();
  const startOfToday=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
  const startOfDate=new Date(date.getFullYear(),date.getMonth(),date.getDate()).getTime();
  const dayDiff=Math.floor((startOfToday-startOfDate)/86400000);
  if(dayDiff===0)return date.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',hour12:false});
  if(dayDiff>=1&&dayDiff<=6)return date.toLocaleDateString('vi-VN',{weekday:'long'});
  return date.toLocaleDateString('vi-VN',{day:'numeric',month:'numeric',year:'2-digit'});
}
"""
shell = replace_once(shell, old_time, new_time, "formatContactTime")
shell_path.write_text(shell, "utf-8")

source_path = Path("index.source.html")
source = source_path.read_text("utf-8")
old_grid = "grid-template-columns:48px minmax(0,1fr) 36px;grid-template-rows:1.3rem 1.15rem;align-content:center;column-gap:12px;row-gap:3px;height:72px;min-height:72px;padding:10px 8px;text-align:start;cursor:pointer;"
new_grid = "grid-template-columns:48px minmax(0,1fr) 58px;grid-template-rows:1.3rem 1.15rem;align-content:center;column-gap:12px;row-gap:3px;height:72px;min-height:72px;padding:10px 8px;text-align:start;cursor:pointer;"
source = replace_once(source, old_grid, new_grid, "contact grid")

old_time_css = ".shell-contact-time{grid-column:3;grid-row:1;align-self:center;justify-self:center;width:36px;margin:0;color:var(--theme-content-tertiary);font-size:.75rem;line-height:1rem;text-align:center;white-space:nowrap;font-variant-numeric:tabular-nums}"
new_time_css = ".shell-contact-time{grid-column:3;grid-row:1;align-self:center;justify-self:end;width:58px;margin:0;color:var(--theme-content-tertiary);font-size:.75rem;line-height:1rem;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}"
source = replace_once(source, old_time_css, new_time_css, "contact time css")

marker = ".shell-contact-manage:hover{background:var(--theme-surface-secondary);color:var(--theme-content-primary)}\n"
addition = marker + """.shell-contact-row:not(:last-child)::after{
  content:"";position:absolute;left:68px;right:8px;bottom:0;height:1px;z-index:3;
  background:color-mix(in srgb,var(--theme-border-default,#dedede) 72%,transparent);pointer-events:none;
}
@media (hover:hover) and (pointer:fine){
  .shell-contact-manage{opacity:0;pointer-events:none;transition:opacity 120ms ease,background-color 120ms ease,color 120ms ease}
  .shell-contact-row:hover .shell-contact-manage,
  .shell-contact-row:focus-within .shell-contact-manage{opacity:1;pointer-events:auto}
}
"""
if ".shell-contact-row:not(:last-child)::after{" not in source:
    if marker not in source:
        raise SystemExit("contact manage css marker not found")
    source = source.replace(marker, addition, 1)
source_path.write_text(source, "utf-8")
