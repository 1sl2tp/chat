(()=>{
'use strict';

void import('./contact-directory-admin-core.js')
  .then(()=>import('./quote-client.js'))
  .catch(error=>console.warn('[contact-directory-admin]',error));
})();
