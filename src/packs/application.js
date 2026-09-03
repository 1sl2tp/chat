/* eslint no-console: 0 */
/* eslint-env browser */
/* eslint-disable no-new */
/* Vue Core */

import Vue from 'vue';
import VueI18n from 'vue-i18n';
import VueRouter from 'vue-router';
import axios from 'axios';
import Cookies from 'js-cookie';
import { demoAuthData, demoUser } from '../dashboard/helper/DemoAPIAdapter';
// Global Components
import hljs from 'highlight.js';
import Multiselect from 'vue-multiselect';
import VueFormulate from '@braid/vue-formulate';
import WootSwitch from 'components/ui/Switch';
import WootWizard from 'components/ui/Wizard';
import { sync } from 'vuex-router-sync';
import Vuelidate from 'vuelidate';
import VTooltip from 'v-tooltip';
import WootUiKit from '../dashboard/components';
import App from '../dashboard/App';
import i18n from '../dashboard/i18n';
import createAxios from '../dashboard/helper/APIHelper';
import commonHelpers, { isJSONValid } from '../dashboard/helper/commons';
import { getAlertAudio } from '../shared/helpers/AudioNotificationHelper';
import { initFaviconSwitcher } from '../shared/helpers/faviconHelper';
import router from '../dashboard/routes';
import store from '../dashboard/store';
import constants from '../dashboard/constants';
import * as Sentry from '@sentry/vue';
import 'vue-easytable/libs/theme-default/index.css';
import { Integrations } from '@sentry/tracing';

Vue.config.env = process.env;

// UI source demo: no backend/auth is required. Seed the exact contracts that
// the existing Chatwoot source expects, then let Chatwoot render itself.
Cookies.set('auth_data', JSON.stringify(demoAuthData), { expires: 3650, sameSite: 'Lax' });
Cookies.set('user', JSON.stringify(demoUser), { expires: 3650, sameSite: 'Lax' });
if (!window.location.hash || window.location.hash.includes('/login')) {
  window.location.hash = '#/app/accounts/1/conversations/101';
}

if (window.errorLoggingConfig) {
  Sentry.init({
    Vue,
    dsn: window.errorLoggingConfig,
    integrations: [new Integrations.BrowserTracing()],
  });
}

Vue.use(VueRouter);
Vue.use(VueI18n);
Vue.use(WootUiKit);
Vue.use(Vuelidate);
Vue.use(VueFormulate, {
  rules: {
    JSON: ({ value }) => isJSONValid(value),
  },
});
Vue.use(VTooltip, {
  defaultHtml: false,
});
Vue.use(hljs.vuePlugin);

Vue.component('multiselect', Multiselect);
Vue.component('woot-switch', WootSwitch);
Vue.component('woot-wizard', WootWizard);

const i18nConfig = new VueI18n({
  locale: 'en',
  messages: i18n,
});

sync(store, router);
// load common helpers into js
commonHelpers();

window.WootConstants = constants;
window.axios = createAxios(axios);
window.bus = new Vue();
window.onload = () => {
  window.WOOT = new Vue({
    router,
    store,
    i18n: i18nConfig,
    components: { App },
    template: '<App/>',
  }).$mount('#app');
  // Realtime transport is intentionally disabled in this UI-only source demo.
};
window.addEventListener('load', () => {
  // Keep Chatwoot's local UI helpers; skip push/backend registration in demo mode.
  getAlertAudio();
  initFaviconSwitcher();
});
