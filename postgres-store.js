'use strict';

const {createStore} = require('./store-core');

// SQL is generated only by store-core; never accept SQL or identifiers from clients.
function postgresSql(sql) {
  if (/^INSERT OR IGNORE /i.test(sql)) sql=sql.replace('INSERT OR IGNORE','INSERT')+' ON CONFLICT DO NOTHING';
  sql=sql.replace(/ON CONFLICT\(([^)]+)\)/g,(_,columns)=>'ON CONFLICT(owner_id,'+columns+')');
  let index=0;
  return sql.replace(/\?/g,()=>'$'+(++index));
}

function postgresAdapter(client) {
  const query=async (sql,params)=>{
    const {rows}=await client.query(postgresSql(sql),params);
    return rows.map(({owner_id,rowid,...row})=>row);
  };
  return {
    prepare:sql=>({
      all:(...params)=>query(sql,params),
      get:async (...params)=>(await query(sql,params))[0],
      run:(...params)=>query(sql,params)
    }),
    exec:sql=>{
      // The request owns one outer transaction, including validation and the revision lock.
      if (/^(BEGIN IMMEDIATE|COMMIT|ROLLBACK)$/.test(sql)) return;
      if(sql==='PRAGMA defer_foreign_keys=ON')return client.query('SET CONSTRAINTS ALL DEFERRED');
      throw Error('Unsupported transaction instruction.');
    },
    close:()=>{}
  };
}

async function run(iterator) {
  let step=iterator.next();
  while(!step.done) {
    try { step=iterator.next(await step.value); }
    catch(error) { step=iterator.throw(error); }
  }
  return step.value;
}

async function withPostgresStore(client,userId,operation) {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId||''))throw Error('Authentication required.');
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true), set_config('search_path','pm,public',true)",[userId]);
    await client.query("INSERT INTO pm.meta(key,value) VALUES ('revision','0'),('schema_version','4') ON CONFLICT(owner_id,key) DO NOTHING");
    // Serialize writes before reading revision, so concurrent saves cannot both succeed.
    await client.query("SELECT value FROM pm.meta WHERE key='revision' FOR UPDATE");
    const generators=createStore(postgresAdapter(client));
    const store=Object.fromEntries(Object.entries(generators).map(([key,method])=>[key,(...args)=>run(method(...args))]));
    const result=await operation(store,client);
    await client.query('COMMIT');
    return result;
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

module.exports={withPostgresStore,postgresSql};
