'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs');
test('minimal Louis Kim LGLS header retains access mount without export or backend subtitles',()=>{
 const html=fs.readFileSync('index.html','utf8'),app=fs.readFileSync('app.js','utf8');
 a.match(html,/<title>Louis Kim LGLS/);a.match(html,/<strong>Louis Kim LGLS<\/strong>/);a.match(html,/class="header-actions"/);
 a.doesNotMatch(html,/PM Process Twin|LOCAL ONTOLOGY|id="storageNote"|Export all data|id="exportButton"/);
 a.doesNotMatch(app,/\$\('#(?:storageNote|exportButton)'\)/);
});
