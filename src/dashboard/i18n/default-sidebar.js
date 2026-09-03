import { frontendURL } from '../helper/URLHelper';

export const getSidebarItems = accountId => ({
  common: {
    routes: [
      'home',
      'inbox_dashboard',
      'inbox_conversation',
      'conversation_through_inbox',
      'notifications_dashboard',
      'notifications_index',
      'profile_settings',
      'profile_settings_index',
    ],
    menuItems: {
      assignedToMe: {
        icon: 'ion-chatbox-working',
        label: 'CONVERSATIONS',
        hasSubMenu: false,
        key: '',
        toState: frontendURL(`accounts/${accountId}/dashboard`),
        toolTip: 'Conversation from all subscribed inboxes',
        toStateName: 'home',
      },
    },
  },
  contacts: {
    routes: [],
    menuItems: {},
  },
  reports: {
    routes: [],
    menuItems: {},
  },
  settings: {
    routes: [],
    menuItems: {},
  },
});
