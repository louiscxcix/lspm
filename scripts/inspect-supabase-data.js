'use strict';
const fs=require('node:fs');
const {createManagementApi,redact}=require('./supabase-management');

// Aggregate counts only. Do not export user IDs, names, objects or source bytes.
const DATA_COUNTS_SQL=`SELECT
  (SELECT count(*)::integer FROM pm.entities) AS total_objects,
  (SELECT count(*)::integer FROM pm.relations) AS total_relations,
  (SELECT count(*)::integer FROM pm.projects) AS total_projects,
  (SELECT count(*)::integer FROM pm.entities e JOIN pm.publication p ON e.owner_id=p.owner_id) AS public_objects,
  (SELECT count(*)::integer FROM pm.relations r JOIN pm.publication p ON r.owner_id=p.owner_id) AS public_relations,
  (SELECT count(*)::integer FROM pm.projects r JOIN pm.publication p ON r.owner_id=p.owner_id) AS public_projects,
  (SELECT count(*)::integer FROM (SELECT owner_id FROM pm.entities UNION SELECT owner_id FROM pm.projects) owners) AS populated_workspaces`;

async function inspectData(query){
  const [counts]=await query(DATA_COUNTS_SQL);
  const fields=['total_objects','total_relations','total_projects','public_objects','public_relations','public_projects','populated_workspaces'];
  if(!counts||fields.some(key=>!Number.isSafeInteger(counts[key])||counts[key]<0))throw Error('Unexpected data count response.');
  const status=counts.total_objects===0?'NO_OBJECTS':counts.public_objects===0?'PUBLIC_WORKSPACE_EMPTY':'PUBLIC_DATA_PRESENT';
  const diagnosis=status==='NO_OBJECTS'?'No ontology objects are stored in this Supabase project. Locate and import the original database or backup.':status==='PUBLIC_WORKSPACE_EMPTY'?'Objects exist in Supabase, but the pinned public workspace has none. Select the intended owner before changing publication.':'The public workspace contains objects. If the Library looks empty, check the frontend filters and API response.';
  return {counts,status,diagnosis};
}

async function main(){
  const token=process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if(!token)throw Error('Missing SUPABASE_ACCESS_TOKEN. Run this diagnostic in GitHub Actions with the existing repository secret.');
  const api=createManagementApi({project:'ahzpuefosoajwwgbfhng',token});
  const result=await inspectData(sql=>api('/database/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:sql,read_only:true})}));
  console.log(JSON.stringify(result));
  if(process.env.GITHUB_STEP_SUMMARY){
    const c=result.counts;
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n## Supabase data status\n\n${result.diagnosis}\n\n| Records | All workspaces | Public workspace |\n| --- | ---: | ---: |\n| Objects | ${c.total_objects} | ${c.public_objects} |\n| Relations | ${c.total_relations} | ${c.public_relations} |\n| Projects | ${c.total_projects} | ${c.public_projects} |\n\nPopulated workspaces: ${c.populated_workspaces}. This diagnostic does not modify records.\n`);
  }
}
if(require.main===module)main().catch(error=>{console.error(redact(error.message,process.env.SUPABASE_ACCESS_TOKEN?.trim()));process.exitCode=1;});
module.exports={inspectData};
