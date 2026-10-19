import { z } from 'zod';

export class GoogleFailure extends Error {constructor(readonly reason:'REVOKED'|'UNAVAILABLE',readonly status:number){super(reason);}}
export interface CalendarEvent {id:string;summary:string;description?:string;location?:string;start:{dateTime:string;timeZone:string};end:{dateTime:string;timeZone:string}}
export interface CalendarSession {ensureCalendar(marker:string,title:string,timezone:string):Promise<string>;upsert(calendarId:string,event:CalendarEvent):Promise<void>;remove(calendarId:string,eventId:string):Promise<void>}
export interface CalendarGateway {connect(refreshToken:string):Promise<CalendarSession>}

// Conexão existe só em memória; nenhuma resposta de erro Google é copiada para logs do domínio.
export class GoogleCalendar implements CalendarGateway {
  constructor(private readonly clientId:string,private readonly secret:string,private readonly request:typeof fetch=fetch){}
  async connect(refreshToken:string):Promise<CalendarSession> {
    const response=await this.request('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.clientId,client_secret:this.secret,refresh_token:refreshToken,grant_type:'refresh_token'})});
    const data=await response.json() as {access_token?:string;error?:string};
    if(!response.ok||!data.access_token)throw new GoogleFailure(data.error==='invalid_grant'?'REVOKED':'UNAVAILABLE',response.status);
    const access=data.access_token;
    const send=(path:string,method='GET',body?:unknown)=>this.request(`https://www.googleapis.com/calendar/v3${path}`,{method,signal:AbortSignal.timeout(15000),headers:{authorization:`Bearer ${access}`,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    const check=(result:Response)=>{if(!result.ok)throw new GoogleFailure(result.status===401?'REVOKED':'UNAVAILABLE',result.status);};
    const guard=(id:string)=>{if(id==='primary')throw new Error('Agenda principal não permitida');return encodeURIComponent(id);};
    return {
      async ensureCalendar(marker,title,timezone){
        let page:string|undefined;
        do {
          // Somente metadados para recuperar criação incerta; nunca importar eventos ou usar syncToken.
          const query=new URLSearchParams({minAccessRole:'owner',fields:'items(id,description,primary),nextPageToken',...(page?{pageToken:page}:{})});
          const result=await send(`/users/me/calendarList?${query}`);check(result);
          const list=z.object({items:z.array(z.object({id:z.string(),description:z.string().optional(),primary:z.boolean().optional()})).default([]),nextPageToken:z.string().optional()}).parse(await result.json());
          const existing=list.items.find((item)=>!item.primary&&item.description===marker);if(existing)return existing.id;page=list.nextPageToken;
        }while(page);
        const created=await send('/calendars','POST',{summary:title,description:marker,timeZone:timezone});check(created);
        const calendar=z.object({id:z.string()}).parse(await created.json());guard(calendar.id);return calendar.id;
      },
      async upsert(calendarId,event){
        const base=`/calendars/${guard(calendarId)}/events`;
        let result=await send(`${base}/${encodeURIComponent(event.id)}`,'PUT',event);
        if(result.status===404){result=await send(base,'POST',event);if(result.status===409)result=await send(`${base}/${encodeURIComponent(event.id)}`,'PUT',event);}
        check(result);
      },
      async remove(calendarId,eventId){const result=await send(`/calendars/${guard(calendarId)}/events/${encodeURIComponent(eventId)}`,'DELETE');if(result.status!==404&&result.status!==410)check(result);},
    };
  }
}
