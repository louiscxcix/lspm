'use strict';
const esbuild=require('esbuild');
esbuild.buildSync({entryPoints:[require.resolve('../cloud-entry')],outfile:require('node:path').join(__dirname,'../supabase/functions/ontology/app.mjs'),bundle:true,alias:Object.fromEntries(require('node:module').builtinModules.filter(name=>!name.startsWith('node:')).map(name=>[name,'node:'+name])),platform:'node',format:'esm',target:'es2022',banner:{js:"import {createRequire} from 'node:module'; import {Buffer} from 'node:buffer'; const require=createRequire(import.meta.url);"}});
console.log('Built Supabase Edge Function bundle.');
