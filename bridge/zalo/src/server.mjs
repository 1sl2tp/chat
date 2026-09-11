import http from 'node:http';
import path from 'node:path';
import {Zalo} from 'zca-js';
import {createLoginState,createRequestHandler} from './login-server-core.mjs';
import {startZaloLogin} from './login-runtime.mjs';

const port=Math.max(1,Number(process.env.PORT)||8787);
const qrPath=process.env.ZALO_QR_PATH||path.resolve(process.cwd(),'qr.png');
const accessToken=String(process.env.LOGIN_TOKEN||'').trim();
const state=createLoginState();
const handler=createRequestHandler({state,qrPath,accessToken});
const server=http.createServer((req,res)=>{
  Promise.resolve(handler(req,res)).catch(error=>{
    console.error('[zalo-login] http error',error);
    if(!res.headersSent){res.statusCode=500;res.setHeader('Content-Type','application/json; charset=utf-8');}
    res.end(JSON.stringify({ok:false,error:'internal_error'}));
  });
});

server.listen(port,'0.0.0.0',()=>{
  console.log(`[zalo-login] web ready on :${port}`);
  if(!accessToken)console.warn('[zalo-login] LOGIN_TOKEN is empty; QR page is public');
  void startZaloLogin({ZaloClass:Zalo,state,qrPath,logger:console}).catch(()=>{});
});

const shutdown=()=>{
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(0),3000).unref();
};
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
