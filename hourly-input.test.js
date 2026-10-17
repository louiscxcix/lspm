const {test}=require('node:test'),a=require('node:assert/strict'),H=require('./hourly'),M=require('./ontology-model');
const p={id:'smt',status:'active',entities:[],relations:[]},part=M.addEntity(p,{type:'Part',name:'G65 PCB',itemKind:'component'});
const parse=(text,date='2026-10-11')=>H.parseInput(p,{partId:part.id,date,text,unit:'pcs'});
test('report time is interval end, reasons survive, components remain components',()=>{
 a.equal(typeof H.parseInput,'function');const rows=parse('9am 500 400 자재 부족\n10am 450 450\n3pm 0 0');
 a.equal(rows[0].start,'2026-10-11T14:00:00.000Z');a.equal(rows[0].end,'2026-10-11T15:00:00.000Z');a.equal(rows[0].reasons[0].text,'자재 부족');a.equal(rows[1].reasons.length,0);a.equal(rows[2].target,0);a.equal(part.itemKind,'component');
});
test('midnight ends previous day, missing stays null, no invalid inputs get accepted',()=>{
 const midnight=parse('12am 1,000 900');a.equal(H.day(midnight[0].start),'2026-10-10');a.equal(midnight[0].end,'2026-10-11T06:00:00.000Z');
 a.equal(parse('09:00 - 0')[0].target,null);
 for(const text of ['9am -1 3','13pm 3 2','9am 1.5 1','9am 3 2\n9am 3 2','09:30 3 2'])a.throws(()=>parse(text));
 a.throws(()=>parse('9am 1 1','2026-02-30'));a.throws(()=>parse(''));a.throws(()=>H.parseInput(p,{partId:'unknown',date:'2026-10-11',text:'9am 1 1',unit:'pcs'}));
});
test('shared correction validation is idempotent and preserves prior identifiers',()=>{
 a.equal(typeof H.changes,'function');const [r]=parse('9am 500 400'),old={...r,id:'old',recordedAt:'x',recordRevision:5,sourceId:'original'};
 a.equal(H.changes([old],[r]).length,0);const changed={...r,actual:450};a.throws(()=>H.changes([old],[changed]),/정정/);a.equal(H.changes([old],[changed],true)[0].supersedesId,'old');
 a.throws(()=>H.changes([old],[{...r,start:'2026-10-11T14:30:00.000Z',end:'2026-10-11T15:30:00.000Z'}]),/겹/);
});
'use strict';
const productionDayTest=require('node:test'),productionDayAssert=require('node:assert/strict');
productionDayTest('production day runs from Mexico 07:00 to next 07:00 with 24 empty-safe slots',()=>{
 const H=require('./hourly');productionDayAssert.equal(H.productionDay('2026-10-12T06:59:00-06:00'),'2026-10-11');productionDayAssert.equal(H.productionDay('2026-10-12T07:00:00-06:00'),'2026-10-12');
 const slots=H.daySlots('2026-10-11');productionDayAssert.equal(slots.length,24);productionDayAssert.equal(slots[0].start,'2026-10-11T13:00:00.000Z');productionDayAssert.equal(slots[23].end,'2026-10-12T13:00:00.000Z');productionDayAssert(!slots.some(s=>'actual' in s));
});
