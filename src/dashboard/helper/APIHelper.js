/* eslint no-console: 0 */
import Auth from '../api/auth';
import demoAdapter from './DemoAPIAdapter';

const parseErrorCode = error => Promise.reject(error);

export default axios => {
  const { apiHost = '' } = window.chatwootConfig || {};
  const wootApi = axios.create({ baseURL: `${apiHost}/` });

  // Demo branch only: preserve the original Chatwoot components, stores,
  // routes and interaction code while satisfying API contracts in memory.
  wootApi.defaults.adapter = demoAdapter;

  if (Auth.isLoggedIn()) {
    const {
      'access-token': accessToken,
      'token-type': tokenType,
      client,
      expiry,
      uid,
    } = Auth.getAuthData();
    Object.assign(wootApi.defaults.headers.common, {
      'access-token': accessToken,
      'token-type': tokenType,
      client,
      expiry,
      uid,
    });
  }

  wootApi.interceptors.response.use(
    response => response,
    error => parseErrorCode(error)
  );
  return wootApi;
};
