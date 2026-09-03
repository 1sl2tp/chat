const now = Math.floor(Date.now() / 1000);

const demoUser = {
  id: 1,
  account_id: 1,
  name: 'Alex Agent',
  available_name: 'Alex Agent',
  display_name: 'Alex Agent',
  email: 'alex.agent@example.com',
  role: 'administrator',
  type: 'user',
  uid: 'alex.agent@example.com',
  thumbnail: '',
  avatar_url: '',
  availability: 'online',
  availability_status: 'online',
  pubsub_token: 'demo-pubsub-token',
  identifier_hash: '',
  ui_settings: {
    is_contact_sidebar_open: true,
    enter_to_send_enabled: true,
    display_rich_content_editor: false,
  },
  accounts: [
    {
      id: 1,
      name: 'Acme Inc',
      role: 'administrator',
      status: 'active',
      permissions: ['administrator'],
      availability: 'online',
      availability_status: 'online',
      auto_offline: true,
    },
    {
      id: 2,
      name: 'Second Workspace',
      role: 'administrator',
      status: 'active',
      permissions: ['administrator'],
      availability: 'online',
      availability_status: 'online',
      auto_offline: true,
    },
  ],
};

const contacts = {
  11: {
    id: 11,
    name: 'Sarah Johnson',
    email: 'sarah@example.com',
    phone_number: '+1 415 555 0198',
    thumbnail: '',
    availability_status: 'online',
    created_at: now - 86400 * 30,
    custom_attributes: {
      customer_tier: 'VIP',
      customer_id: 'CUST-0011',
      plan: 'Enterprise',
    },
    additional_attributes: {
      description: 'Product designer and long-time customer',
      location: 'San Francisco, CA',
      company_name: 'Northstar Labs',
      created_at_ip: '203.0.113.11',
      country: 'United States',
      country_code: 'US',
      city: 'San Francisco',
      social_profiles: {
        linkedin: 'https://linkedin.com',
        github: 'https://github.com',
      },
    },
  },
  12: {
    id: 12,
    name: 'Michael Chen',
    email: 'michael@example.com',
    phone_number: '+1 212 555 0144',
    thumbnail: '',
    availability_status: 'offline',
    created_at: now - 86400 * 12,
    custom_attributes: { customer_tier: 'Standard' },
    additional_attributes: {
      description: 'Billing contact',
      location: 'New York, NY',
      company_name: 'Contoso',
      created_at_ip: '203.0.113.12',
      country: 'United States',
      country_code: 'US',
      city: 'New York',
    },
  },
  13: {
    id: 13,
    name: 'Olivia Martin',
    email: 'olivia@example.com',
    phone_number: '+44 20 7946 0102',
    thumbnail: '',
    availability_status: 'online',
    created_at: now - 86400 * 8,
    custom_attributes: { customer_tier: 'VIP' },
    additional_attributes: {
      description: 'Operations manager',
      location: 'London, UK',
      company_name: 'Bluebird',
      country: 'United Kingdom',
      country_code: 'GB',
      city: 'London',
    },
  },
};

const agents = [
  {
    id: 1,
    account_id: 1,
    name: 'Alex Agent',
    available_name: 'Alex Agent',
    email: 'alex.agent@example.com',
    role: 'administrator',
    confirmed: true,
    thumbnail: '',
    avatar_url: '',
    availability_status: 'online',
  },
  {
    id: 2,
    account_id: 1,
    name: 'Priya Support',
    available_name: 'Priya Support',
    email: 'priya@example.com',
    role: 'agent',
    confirmed: true,
    thumbnail: '',
    avatar_url: '',
    availability_status: 'busy',
  },
  {
    id: 3,
    account_id: 1,
    name: 'Noah Helpdesk',
    available_name: 'Noah Helpdesk',
    email: 'noah@example.com',
    role: 'agent',
    confirmed: true,
    thumbnail: '',
    avatar_url: '',
    availability_status: 'offline',
  },
];

const inboxes = [
  { id: 1, name: 'Website', channel_type: 'Channel::WebWidget', phone_number: '', avatar_url: '' },
  { id: 2, name: 'Email Support', channel_type: 'Channel::Email', phone_number: '', avatar_url: '' },
  { id: 3, name: 'WhatsApp', channel_type: 'Channel::TwilioSms', phone_number: 'whatsapp:+14155550199', avatar_url: '' },
];

const labels = [
  { id: 1, title: 'urgent', description: 'Needs attention', color: '#F43F5E', show_on_sidebar: true },
  { id: 2, title: 'vip', description: 'VIP customer', color: '#7C3AED', show_on_sidebar: true },
  { id: 3, title: 'billing', description: 'Billing question', color: '#0EA5E9', show_on_sidebar: true },
];

const teams = [
  { id: 1, name: 'Support', description: 'Primary support team', is_member: true },
  { id: 2, name: 'Billing', description: 'Billing specialists', is_member: true },
];

const imageUrl =
  'data:image/svg+xml;charset=UTF-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#dbeafe"/><stop offset="1" stop-color="#eff6ff"/></linearGradient></defs><rect width="100%" height="100%" rx="20" fill="url(#g)"/><circle cx="160" cy="150" r="54" fill="#93c5fd"/><path d="M40 360 220 220l105 95 90-70 265 115z" fill="#60a5fa"/><text x="360" y="65" text-anchor="middle" font-family="Arial" font-size="28" fill="#1d4ed8">Chatwoot image attachment</text></svg>'
  );

const message = (id, conversationId, type, content, secondsAgo, extra = {}) => ({
  id,
  conversation_id: conversationId,
  message_type: type,
  content,
  content_type: 'text',
  content_attributes: {},
  created_at: now - secondsAgo,
  private: false,
  status: 'sent',
  source_id: null,
  sender: type === 0 ? contacts[11] : agents[0],
  attachments: [],
  ...extra,
});

const conversation101Messages = [
  {
    id: 1001,
    conversation_id: 101,
    message_type: 2,
    content: 'Conversation was assigned to Alex Agent',
    content_type: 'text',
    content_attributes: {},
    created_at: now - 820,
    private: false,
    status: 'sent',
    sender: agents[0],
    attachments: [],
  },
  message(1002, 101, 0, 'Hi, I need help updating my subscription. Can you check my account?', 760),
  message(1003, 101, 1, 'Absolutely — I can help with that.', 700),
  message(1004, 101, 0, 'Here is the screenshot I mentioned.', 620, {
    attachments: [{ id: 501, file_type: 'image', data_url: imageUrl, file_size: 184320 }],
  }),
  message(1005, 101, 1, 'I have attached the invoice for reference.', 540, {
    attachments: [{ id: 502, file_type: 'file', data_url: '#demo-file', file_name: 'invoice-september.pdf', file_size: 248000 }],
  }),
  message(1006, 101, 0, '', 460, {
    attachments: [{ id: 503, file_type: 'audio', data_url: '', file_name: 'voice-message.mp3', file_size: 64000 }],
  }),
  message(1007, 101, 0, 'Also, can you update my billing address?', 360),
  message(1008, 101, 1, 'Private note: Customer is on the VIP plan.', 260, { private: true }),
  message(1009, 101, 1, 'Done. I have updated the address and subscription.', 120),
];

const makeConversation = ({ id, contactId, inboxId, assignee = agents[0], team = teams[0], labels: tags = ['vip'], status = 'open', messageText = 'Latest reply' }) => ({
  id,
  uuid: 'demo-conversation-' + id,
  account_id: 1,
  inbox_id: inboxId,
  status,
  muted: false,
  can_reply: id === 101 ? false : true,
  unread_count: id === 101 ? 3 : id === 102 ? 1 : 0,
  timestamp: now - (id - 100) * 120,
  created_at: now - 86400,
  updated_at: now,
  agent_last_seen_at: now - 420,
  contact_last_seen_at: now - 60,
  assignee_last_seen_at: now - 420,
  last_activity_at: now - 60,
  waiting_since: 0,
  labels: tags,
  custom_attributes: {},
  additional_attributes: {},
  meta: {
    sender: contacts[contactId],
    assignee,
    team,
    channel: inboxId === 1 ? 'Channel::WebWidget' : inboxId === 2 ? 'Channel::Email' : 'Channel::TwilioSms',
    hmac_verified: true,
  },
  messages: [
    message(id * 10, id, id % 2 ? 0 : 1, messageText, (id - 100) * 120 + 30, {
      sender: id % 2 ? contacts[contactId] : agents[0],
    }),
  ],
});

const conversations = [
  makeConversation({ id: 101, contactId: 11, inboxId: 1, labels: ['vip', 'urgent'], messageText: 'Done. I have updated the address and subscription.' }),
  makeConversation({ id: 102, contactId: 12, inboxId: 2, labels: ['billing'], messageText: 'Thanks, I will check the invoice.' }),
  makeConversation({ id: 103, contactId: 13, inboxId: 3, assignee: null, team: teams[0], labels: ['urgent'], messageText: 'Can someone help me with WhatsApp?' }),
];

const previousConversations = [
  makeConversation({ id: 91, contactId: 11, inboxId: 2, status: 'resolved', labels: ['billing'], messageText: 'Previous billing conversation' }),
  makeConversation({ id: 87, contactId: 11, inboxId: 1, status: 'resolved', labels: ['vip'], messageText: 'Previous website conversation' }),
];

const meta = {
  mine_count: 2,
  unassigned_count: 1,
  all_count: 3,
};

const notificationPayload = [
  {
    id: 11,
    notification_type: 'conversation_creation',
    primary_actor_type: 'Conversation',
    primary_actor_id: 101,
    secondary_actor_type: 'Contact',
    secondary_actor_id: 11,
    read_at: null,
    created_at: now - 60,
    push_message_title: 'New conversation',
    push_message_body: 'Sarah Johnson started a conversation',
  },
  {
    id: 10,
    notification_type: 'conversation_assignment',
    primary_actor_type: 'Conversation',
    primary_actor_id: 102,
    secondary_actor_type: 'User',
    secondary_actor_id: 1,
    read_at: null,
    created_at: now - 300,
    push_message_title: 'Conversation assigned',
    push_message_body: 'A conversation was assigned to you',
  },
];

const ok = (config, data, headers = {}) =>
  Promise.resolve({
    data,
    status: 200,
    statusText: 'OK',
    headers,
    config,
    request: {},
  });

const urlOf = config => String(config.url || '').replace(/^https?:\/\/[^/]+/, '');

export const demoAuthData = {
  'access-token': 'demo-access-token',
  'token-type': 'Bearer',
  client: 'demo-client',
  expiry: 1893456000,
  uid: demoUser.email,
};

export { demoUser };

export default function demoAdapter(config) {
  const url = urlOf(config);
  const method = String(config.method || 'get').toLowerCase();

  if (url.includes('auth/validate_token')) {
    return ok(config, { payload: { data: demoUser } }, { expiry: 1893456000 });
  }
  if (url.includes('auth/sign_out')) return ok(config, { success: true });

  if (/\/api\/v1\/accounts\/?$/.test(url)) {
    return ok(config, { id: 1, name: 'Acme Inc', locale: 'en', status: 'active' });
  }

  if (url.includes('/notifications/unread_count')) return ok(config, 3);
  if (url.includes('/notifications')) {
    return ok(config, {
      data: {
        payload: notificationPayload,
        meta: { count: notificationPayload.length, current_page: 1, unread_count: 3 },
      },
    });
  }

  if (url.includes('/inboxes/') && url.includes('/assignable_agents')) {
    return ok(config, { payload: agents });
  }
  if (url.match(/\/inboxes(\?|$)/)) return ok(config, { payload: inboxes });

  if (url.match(/\/agents(\?|$)/)) return ok(config, agents);
  if (url.match(/\/teams(\?|$)/)) return ok(config, teams);
  if (url.match(/\/labels(\?|$)/)) return ok(config, { payload: labels });

  if (url.includes('/canned_responses')) {
    return ok(config, [
      { id: 1, short_code: 'hello', content: 'Hello! How can I help you today?' },
      { id: 2, short_code: 'thanks', content: 'Thanks for contacting us. Is there anything else I can help with?' },
    ]);
  }

  if (url.includes('/contacts/') && url.includes('/conversations')) {
    return ok(config, { payload: [conversations[0], ...previousConversations] });
  }
  if (url.includes('/contacts/') && url.includes('/contactable_inboxes')) {
    return ok(config, { payload: inboxes.map(inbox => ({ inbox, source_id: 'demo-source-' + inbox.id })) });
  }
  if (url.includes('/contacts/') && url.includes('/labels')) {
    return ok(config, { payload: ['vip', 'urgent'] });
  }
  const contactMatch = url.match(/\/contacts\/(\d+)(?:\?|$)/);
  if (contactMatch) {
    const contact = contacts[Number(contactMatch[1])] || contacts[11];
    return ok(config, { payload: contact });
  }
  if (url.includes('/contacts/search') || url.match(/\/contacts(\?|$)/)) {
    const payload = Object.values(contacts);
    return ok(config, { payload, meta: { count: payload.length, current_page: 1 } });
  }

  if (url.includes('/conversations/') && url.includes('/labels')) {
    if (method === 'post') {
      let nextLabels = ['vip', 'urgent'];
      try {
        const raw = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        if (raw && Array.isArray(raw.labels)) nextLabels = raw.labels;
      } catch (e) {}
      return ok(config, { payload: nextLabels });
    }
    return ok(config, { payload: ['vip', 'urgent'] });
  }

  if (url.includes('/conversations/') && url.includes('/assignments')) {
    return ok(config, agents[0]);
  }

  if (url.includes('/conversations/') && url.includes('/toggle_status')) {
    return ok(config, { payload: { current_status: 'resolved' } });
  }

  if (url.includes('/conversations/') && url.includes('/update_last_seen')) {
    const match = url.match(/\/conversations\/(\d+)/);
    return ok(config, { id: Number(match && match[1]) || 101, agent_last_seen_at: now });
  }

  if (url.includes('/conversations/') && url.includes('/toggle_typing_status')) {
    return ok(config, { success: true });
  }

  if (url.includes('/conversations/') && /\/messages(?:\?|$)/.test(url)) {
    const match = url.match(/\/conversations\/(\d+)/);
    const conversationId = Number(match && match[1]) || 101;
    if (method === 'post') {
      return ok(config, message(9090, conversationId, 1, 'Demo message sent from the original Chatwoot composer.', 0));
    }
    return ok(config, {
      meta: {
        sender: contacts[11],
        assignee: agents[0],
        team: teams[0],
        additional_attributes: {
          browser: {
            browser_name: 'Safari',
            browser_version: '18.0',
            platform_name: 'macOS',
            platform_version: '15.0',
          },
          referer: 'https://www.chatwoot.com',
          initiated_at: { timestamp: now - 1200 },
        },
      },
      payload: conversationId === 101 ? conversation101Messages.slice(0, -1) : [],
    });
  }

  if (url.includes('/conversations/') && method === 'delete') {
    return ok(config, { success: true });
  }

  if (url.includes('/conversations/') && !url.includes('/messages')) {
    const match = url.match(/\/conversations\/(\d+)(?:\?|$)/);
    if (match) {
      const found = [...conversations, ...previousConversations].find(item => item.id === Number(match[1])) || conversations[0];
      return ok(config, found);
    }
  }

  if (url.includes('/conversations/meta')) {
    return ok(config, { data: { meta } });
  }
  if (url.match(/\/conversations(?:\?|$)/)) {
    return ok(config, { data: { payload: conversations, meta } });
  }

  if (url.includes('/reports/')) {
    return ok(config, {
      data: [],
      value: 24,
      count: 24,
      previous: 18,
    });
  }

  return ok(config, {});
}
