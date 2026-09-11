import fs from 'node:fs/promises';

export function createLoginState(){
  let current={status:'starting',userId:null,error:null,updatedAt:new Date().toISOString()};
  const set=patch=>{current={...current,...patch,updatedAt:new Date().toISOString()};return {...current};};
  return {
    snapshot(){return {...current};},
    setWaitingQr(){return set({status:'waiting_qr',userId:null,error:null});},
    setLoggedIn({userId=null}={}){return set({status:'logged_in',userId:userId?String(userId):null,error:null});},
    setError(error){return set({status:'error',error:String(error?.message||error||'login_failed')});},
  };
}

function sendJson(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}

function authorized(url,accessToken){
  if(!accessToken)return true;
  return url.searchParams.get('token')===accessToken;
}

function normalizeContacts(rows){
  return (Array.isArray(rows)?rows:[]).map(row=>({
    id:String(row?.userId||'').trim(),
    name:String(row?.displayName||row?.zaloName||row?.userId||'').trim(),
    avatar:String(row?.avatar||'').trim(),
  })).filter(row=>row.id);
}

function loginPage(token=''){
  const suffix=token?`?token=${encodeURIComponent(token)}`:'';
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TAPHOA Zalo Login</title><style>
body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f6f7f9;color:#111;display:grid;min-height:100vh;place-items:center}
main{width:min(92vw,420px);background:white;border:1px solid #e5e7eb;border-radius:18px;padding:24px;text-align:center;box-shadow:0 8px 28px #0000000d}
h1{font-size:20px;margin:0 0 6px}p{margin:6px 0;color:#62666d}.qr{width:min(76vw,320px);aspect-ratio:1;object-fit:contain;margin:18px auto;border-radius:12px;background:#fafafa}#state{font-weight:600;color:#2563eb}.ok{color:#15803d!important}.err{color:#b91c1c!important}a{display:inline-block;margin-top:12px;color:#2563eb;text-decoration:none;font-weight:600}
</style></head><body><main><h1>Đăng nhập Zalo cho TAPHOA</h1><p>Quét mã QR bằng Zalo trên điện thoại.</p><img class="qr" id="qr" src="/qr.png${suffix}&v=${Date.now()}" alt="QR Zalo"><p id="state">Đang tạo QR…</p><a id="contacts" href="/contacts${suffix}" style="display:none">Xem danh sách Zalo</a><script>
const token=${JSON.stringify(token)};const q=token?'?token='+encodeURIComponent(token):'';
async function tick(){try{const r=await fetch('/health',{cache:'no-store'});const s=await r.json();const el=document.getElementById('state');if(s.status==='logged_in'){el.textContent='Đã đăng nhập Zalo';el.className='ok';document.getElementById('qr').style.display='none';document.getElementById('contacts').style.display='inline-block';return;}if(s.status==='error'){el.textContent='Lỗi: '+(s.error||'login_failed');el.className='err';return;}el.textContent=s.status==='waiting_qr'?'Đang chờ quét QR…':'Đang khởi động…';document.getElementById('qr').src='/qr.png'+q+(q?'&':'?')+'v='+Date.now();}catch{}setTimeout(tick,1800)}tick();
</script></main></body></html>`;
}

export function createRequestHandler({state,qrPath,accessToken='',listFriends=null,signalTokenHash='',outboundNow=null}){
  return async function handle(req,res){
    const url=new URL(req.url||'/', 'http://localhost');

    if(url.pathname==='/outbound-now'){
      if(req.method!=='POST')return sendJson(res,405,{ok:false,error:'method_not_allowed'});
      const provided=String(req.headers?.['x-bridge-token-sha256']||'').trim();
      if(!signalTokenHash||provided!==signalTokenHash)return sendJson(res,401,{ok:false,error:'unauthorized'});
      if(typeof outboundNow!=='function')return sendJson(res,503,{ok:false,error:'outbound_not_ready'});
      try{
        const processed=Number(await outboundNow())||0;
        return sendJson(res,200,{ok:true,processed});
      }catch(error){
        return sendJson(res,502,{ok:false,error:'outbound_failed',detail:String(error?.message||error)});
      }
    }

    if(req.method!=='GET')return sendJson(res,405,{ok:false,error:'method_not_allowed'});

    if(url.pathname==='/health'){
      return sendJson(res,200,{ok:true,...state.snapshot()});
    }

    if(url.pathname==='/'||url.pathname==='/qr.png'||url.pathname==='/contacts'){
      if(!authorized(url,accessToken))return sendJson(res,401,{ok:false,error:'unauthorized'});
    }

    if(url.pathname==='/'){
      res.statusCode=200;
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.setHeader('Cache-Control','no-store');
      return res.end(loginPage(accessToken));
    }

    if(url.pathname==='/qr.png'){
      try{
        const png=await fs.readFile(qrPath);
        res.statusCode=200;
        res.setHeader('Content-Type','image/png');
        res.setHeader('Cache-Control','no-store, max-age=0');
        return res.end(png);
      }catch(error){
        if(error?.code==='ENOENT')return sendJson(res,404,{ok:false,error:'qr_not_ready'});
        return sendJson(res,500,{ok:false,error:'qr_read_failed'});
      }
    }

    if(url.pathname==='/contacts'){
      if(state.snapshot().status!=='logged_in')return sendJson(res,409,{ok:false,error:'zalo_not_logged_in'});
      if(typeof listFriends!=='function')return sendJson(res,503,{ok:false,error:'zalo_api_not_ready'});
      try{
        const contacts=normalizeContacts(await listFriends());
        return sendJson(res,200,{ok:true,count:contacts.length,contacts});
      }catch(error){
        return sendJson(res,502,{ok:false,error:'zalo_contacts_failed',detail:String(error?.message||error)});
      }
    }

    return sendJson(res,404,{ok:false,error:'not_found'});
  };
}
