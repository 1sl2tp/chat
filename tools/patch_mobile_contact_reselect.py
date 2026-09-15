from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

shell_path = ROOT / 'shell.js'
shell = shell_path.read_text('utf-8')
old_shell = """  openChat(){return this.open('chat')},
  openWork(){return this.open('work')},
  openContact(contactId,contactName=null){
"""
new_shell = """  openChat(){return this.open('chat')},
  openWork(){return this.open('work')},
  clearActiveContact(){
    if(authState!=='AUTHENTICATED')return false;
    setActiveContact(null,null);
    return true;
  },
  openContact(contactId,contactName=null){
"""
assert shell.count(old_shell) == 1, 'shell NavigationCommand anchor changed'
shell_path.write_text(shell.replace(old_shell, new_shell, 1), 'utf-8')

work_path = ROOT / 'work-customer-summary.js'
work = work_path.read_text('utf-8')
old_directory = """  app.dataset.mobileDirectoryReason=String(reason||'directory');
  resetWorkSelectionForDirectory();
  syncDirectoryChatTab(true);
  void window.V21ContactStore?.refresh?.();
"""
new_directory = """  app.dataset.mobileDirectoryReason=String(reason||'directory');
  resetWorkSelectionForDirectory();
  navigation()?.clearActiveContact?.();
  syncDirectoryChatTab(true);
  void window.V21ContactStore?.refresh?.();
"""
assert work.count(old_directory) == 1, 'mobile directory anchor changed'
work = work.replace(old_directory, new_directory, 1)

old_listener = """document.addEventListener('v21-active-contact-change',()=>{
  hideMobileDirectory('contact-selected');
  selectedWorkCustomerId='';
  forceOverview=false;
  renderCurrent();
});
"""
new_listener = """document.addEventListener('v21-active-contact-change',event=>{
  selectedWorkCustomerId='';
  if(event?.detail?.contact?.id){
    hideMobileDirectory('contact-selected');
    forceOverview=false;
  }else if(mobileDirectoryAllowed()){
    forceOverview=true;
  }
  renderCurrent();
});
"""
assert work.count(old_listener) == 1, 'active contact listener anchor changed'
work_path.write_text(work.replace(old_listener, new_listener, 1), 'utf-8')

print('mobile contact reselect patch applied')
