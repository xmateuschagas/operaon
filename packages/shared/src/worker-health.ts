import { createServer } from 'node:http';
import type { Pool } from 'pg';

// Probe privado, separado do processamento: health indica processo; ready testa banco e broker.
export function workerHealth(pool:Pool,broker:()=>Promise<unknown>,port=3001) {
  const server=createServer((request,response)=>{
    response.setHeader('content-type','application/json');
    if(request.url==='/health'){response.end(JSON.stringify({status:'ok'}));return;}
    if(request.url!=='/ready'){response.writeHead(404);response.end('{}');return;}
    void Promise.all([pool.query('SELECT 1'),broker()]).then(()=>response.end(JSON.stringify({status:'ready'}))).catch(()=>{response.writeHead(503);response.end(JSON.stringify({status:'unavailable'}));});
  });
  server.listen(port,'0.0.0.0');return server;
}
// Alerta apenas nas mudanças, sem logar URL, headers, corpo ou detalhes de credenciais.
export function watchWhatsApp(url:string,token:string,instance:string,log:(record:Record<string,unknown>)=>void,fetcher:typeof fetch=fetch) {
  let previous:boolean|undefined;let running=false;
  async function probe(){if(running||!url)return;running=true;try{const response=await fetcher(`${url.replace(/\/$/,'')}/health?instance=${encodeURIComponent(instance)}`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(5000)});const ready=response.ok&&(await response.json() as {connected?:boolean}).connected===true;if(ready!==previous)log({event:ready?'whatsapp_connected':'whatsapp_disconnected',tenant_id:null,user_id:null});previous=ready;}catch{if(previous!==false)log({event:'whatsapp_disconnected',tenant_id:null,user_id:null});previous=false;}finally{running=false;}}
  void probe();const timer=setInterval(()=>void probe(),30000);return ()=>clearInterval(timer);
}
