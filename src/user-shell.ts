import './user-main'
import './user/account-ui.css'
import './ui/chatwoot-port/account/account.css'
import { mountUserChatwootAccountUi } from './user/chatwoot-account-ui'
import { mountUserAccountUi } from './user/account-ui'
import { getChatPresentation } from './ui/chatwoot-port/presentation-switch'

if (getChatPresentation() === 'chatwoot-port') {
  mountUserChatwootAccountUi()
} else {
  mountUserAccountUi()
}
