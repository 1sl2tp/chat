import './ui/reference.css'
import './user-main'
import './user/account-ui.css'
import './ui/chatwoot-port/account/account.css'
import { mountReleaseBadge } from './release'
import { mountUserChatwootAccountUi } from './user/chatwoot-account-ui'
import { mountUserChatwootLoginUi } from './user/chatwoot-login-ui'

mountReleaseBadge()
mountUserChatwootLoginUi()
mountUserChatwootAccountUi()
