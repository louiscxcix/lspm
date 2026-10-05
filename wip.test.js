const {test} = require('node:test');
const assert = require('node:assert/strict');
const WIP = require('./wip.js');

test('detects MES header below merged title and preserves zero, blank, and row identity', () => {
  const grid = [
    ['MES system status'],
    ['', 'Model code', 'PJT명', 'ICT(LS)', 'EOL PCB(LS)', 'Packing'],
    ['', 'A1', 'LQ2 Low Beam LH', 15554, 0, ''],
    ['', 'A2', 'LQ2 Low Beam LH', '1,518', '', 49],
    ['', '', 'Total', 17072, 0, 49]
  ];
  const layout = WIP.detectLayout(grid);
  assert.deepEqual(layout, {headerRow:2,partColumn:3,codeColumn:2});
  const preview = WIP.parseGrid(grid, layout);
  assert.deepEqual(preview.columns.map(item => item.name), ['ICT(LS)', 'EOL PCB(LS)', 'Packing']);
  assert.equal(preview.rows.length, 2);
  assert.deepEqual(preview.rows[0].counts.map(item => item.quantity), [15554, 0]);
  assert.deepEqual(preview.rows[1].counts.map(item => item.quantity), [1518, 49]);
  assert.notEqual(preview.rows[0].row, preview.rows[1].row);
});

test('refuses negative or fractional WIP and does not turn text into zero', () => {
  const grid = [['Part', 'ICT'], ['A', -1], ['B', 1.5], ['C', 'N/A']];
  const preview = WIP.parseGrid(grid, {headerRow:1,partColumn:1,codeColumn:0});
  assert.equal(preview.rows.length, 3);
  assert.equal(preview.rows.flatMap(row => row.counts).length, 0);
  assert.equal(preview.warnings.length, 3);
});

test('reads an actual XLSX MES worksheet with a title row', async () => {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook(),sheet=workbook.addWorksheet('WIP status');
  sheet.addRow(['MES status']);
  sheet.addRow(['Model code','PJT명','ICT(LS)','Packing']);
  sheet.addRow(['LQ2-A','LQ2 Low Beam LH',15554,0]);
  const result=await WIP.previewWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.equal(result.sheet,'WIP status');
  assert.equal(result.rows[0].code,'LQ2-A');
  assert.deepEqual(result.rows[0].counts.map(item=>item.quantity),[15554,0]);
});

test('manual header and Part column recover an unfamiliar workbook header', async () => {
  const ExcelJS=require('exceljs'),book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Inventory');
  sheet.addRow(['SKU label','Test station']);
  sheet.addRow(['Part A',3]);
  const result=await WIP.previewWorkbook(Buffer.from(await book.xlsx.writeBuffer()),{sheetName:'Inventory',headerRow:1,partColumn:1,codeColumn:0});
  assert.equal(result.rows[0].partName,'Part A');
  assert.equal(result.rows[0].counts[0].quantity,3);
});
