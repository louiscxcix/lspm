'use strict';
async function stageBatches(batches,write,{concurrency=3,onConfirmed=()=>{}}={}){
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw Error('INVALID_STAGE_CONCURRENCY');
 let cursor=0,failure;
 async function worker(){
  while(!failure){const index=cursor++;if(index>=batches.length)return;
   try{await write(batches[index]);onConfirmed(batches[index]);}catch(e){failure=e;}
  }
 }
 await Promise.all(Array.from({length:Math.min(concurrency,batches.length)},worker));
 if(failure)throw failure;
}
module.exports={stageBatches};
