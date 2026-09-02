import './admin-main'
import './admin/management-ui.css'
import './admin/zalo-polish.css'
import './ui/chatwoot-port/inbox/inbox.css'
import { mountAdminChatwootManagementUi } from './admin/chatwoot-management-ui'
import { mountAdminManagementUi } from './admin/management-ui'
import { mountAdminZaloPolish } from './admin/zalo-polish'
import { getChatPresentation } from './ui/chatwoot-port/presentation-switch'

if (getChatPresentation() === 'chatwoot-port') {
  mountAdminChatwootManagementUi()
} else {
  mountAdminManagementUi()
  mountAdminZaloPolish()
}
