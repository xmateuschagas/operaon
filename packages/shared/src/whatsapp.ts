import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Notifier,Notice } from './notifier.js';

export interface WhatsAppGateway { send(phone:string,text:string,key:string,notification?:boolean):Promise<string> }
// A ponte é interna e deve persistir Idempotency-Key, inclusive depois de reiniciar.
export class WhatsAppClient implements WhatsAppGateway {
  constructor(private readonly url:string,private readonly token:string,private readonly instance:string,private readonly fetcher:typeof fetch=fetch){}
  async send(phone:string,text:string,key:string,notification=false) {
    if(!this.url||!this.token||!this.instance)throw new Error('WHATSAPP_NOT_CONFIGURED');
    let response:Response;
    try {response=await this.fetcher(`${this.url.replace(/\/$/,'')}/${notification?'notifications':'messages'}`,{method:'POST',headers:{authorization:`Bearer ${this.token}`,'content-type':'application/json','idempotency-key':key},body:JSON.stringify({instance:this.instance,phone,text}),signal:AbortSignal.timeout(15000)});}
    catch {throw new Error('WHATSAPP_UNAVAILABLE');}
    if(!response.ok)throw new Error('WHATSAPP_UNAVAILABLE');
    try {return z.object({id:z.string().min(1).max(200)}).parse(await response.json()).id;}catch{throw new Error('WHATSAPP_INVALID_ACK');}
  }
}
// Avisos operacionais têm destinatários explícitos; nunca encaminhar dados locais ao admin por fallback.
export class WhatsAppNotifier implements Notifier {
  constructor(private readonly gateway:WhatsAppGateway,private readonly adminPhone:string,private readonly recipients:Record<string,string>,private readonly log:(record:Record<string,unknown>)=>void=()=>{}){}
  async notify(notice:Notice) {
    const phone=notice.kind==='approval'?this.adminPhone:this.recipients[notice.destination??notice.userId??''];
    if(!phone){this.log({event:'notification_unavailable',kind:notice.kind,tenant_id:notice.tenantId,user_id:notice.userId??null});return;}
    const text=`${notice.message}${notice.link?`\n${notice.link}`:''}`;
    const key=createHash('sha256').update(`${notice.tenantId}:${notice.kind}:${phone}:${text}`).digest('hex');
    try {await this.gateway.send(phone,text,key,true);}
    catch {this.log({event:'notification_unavailable',kind:notice.kind,tenant_id:notice.tenantId,user_id:notice.userId??null});}
  }
}
