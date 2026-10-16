import postgres from 'npm:postgres@3.4.7';
import {createCloudHandler,withPostgresStore} from './app.mjs';

const url=Deno.env.get('SUPABASE_URL')!;
const apiKey=Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}'))[0] as string || Deno.env.get('SUPABASE_ANON_KEY')!;
const database=postgres(Deno.env.get('SUPABASE_DB_URL')!,{prepare:false,max:2,ssl:{rejectUnauthorized:true},idle_timeout:20,connect_timeout:10});
const allowedOrigins=(Deno.env.get('PM_ALLOWED_ORIGINS')||'https://louiscxcix.github.io').split(',').map(value=>value.trim()).filter(Boolean);

Deno.serve(createCloudHandler({
  allowedOrigins,
  geminiKey:Deno.env.get('GEMINI_API_KEY')||'',
  authenticate:async (token:string)=>{
    const response=await fetch(url+'/auth/v1/user',{headers:{apikey:apiKey,Authorization:'Bearer '+token}});
    if(!response.ok)throw Error('Invalid session.');
    return await response.json();
  },
  withStore:async (userId:string,operation:Function)=>{
    const connection=await database.reserve();
    const client={query:async (text:string,params:unknown[]=[])=>({rows:Array.from(await connection.unsafe(text,params as never[]))})};
    try{return await withPostgresStore(client,userId,operation);}
    finally{connection.release();}
  }
}));
