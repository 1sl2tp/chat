import './ui/reference.css'
import './admin-main'
import './admin/management-ui.css'
import './ui/chatwoot-port/inbox/inbox.css'
import { mountAdminReferenceShellUi } from './admin/reference-shell-ui'
import { mountAdminChatwootManagementUi } from './admin/chatwoot-management-ui'
import { installAdminChatwootLoginUi } from './admin/chatwoot-login-ui'
import { mountReleaseBadge } from './release'

mountReleaseBadge()
installAdminChatwootLoginUi()
mountAdminReferenceShellUi()
mountAdminChatwootManagementUi()
