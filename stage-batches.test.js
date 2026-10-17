'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {stageBatches}=require('./scripts/stage-batches');
test('archive batches use bounded concurrency and acknowledge only successful writes',async()=>{
 let active=0,peak=0;const written=[],confirmed=[];
 await stageBatches([1,2,3,4,5,6],async value=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,2));written.push(value);active--;},{onConfirmed:value=>confirmed.push(value)});
 assert.equal(peak,3);assert.deepEqual(written.sort(),[1,2,3,4,5,6]);assert.deepEqual(confirmed.sort(),written);
 const accepted=[];await assert.rejects(stageBatches([1,2,3,4],async value=>{if(value===2)throw Error('write failed');await new Promise(r=>setTimeout(r,2));},{onConfirmed:value=>accepted.push(value)}),/write failed/);assert.ok(!accepted.includes(2));
});
