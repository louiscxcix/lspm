'use strict';

const partHeader = /^(?:pjt\s*명|품명|제품명|part(?:\s*name)?|product(?:\s*name)?|item(?:\s*name)?)$/i;
const codeHeader = /^(?:모델명|모델코드|품번|part\s*(?:no\.?|number|code)|model\s*(?:no\.?|code)|item\s*(?:no\.?|code))$/i;
const text = value => {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (Object.hasOwn(value, 'result')) return text(value.result);
    if (Array.isArray(value.richText)) return value.richText.map(item => item.text || '').join('');
    return value.text || '';
  }
  return String(value).trim();
};
function detectLayout(grid) {
  for (let row = 0; row < Math.min(grid.length, 40); row++) {
    const part = grid[row].findIndex(cell => partHeader.test(text(cell).trim()));
    if (part < 0) continue;
    let code = 0;
    for (let col = 0; col < part; col++) if (codeHeader.test(text(grid[row][col]).trim())) code = col + 1;
    return {headerRow:row + 1,partColumn:part + 1,codeColumn:code};
  }
  throw Error('Part/product header not found. Choose header row and Part column.');
}
function quantity(value) {
  if (value == null || value === '' || value === '-') return null;
  if (typeof value === 'object' && Object.hasOwn(value, 'result')) return quantity(value.result);
  const normalized = typeof value === 'string' ? value.trim().replaceAll(',', '') : value;
  if (normalized === '') return null;
  const number = Number(normalized);
  return Number.isSafeInteger(number) && number >= 0 ? number : NaN;
}
function parseGrid(grid,{headerRow,partColumn,codeColumn=0}) {
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > grid.length || !Number.isInteger(partColumn) || partColumn < 1) throw Error('Invalid header row or Part column.');
  if (grid.length > 5001 || Math.max(...grid.map(row => row.length),0) > 100) throw Error('Workbook limit: 5,000 rows and 100 columns.');
  const headers=grid[headerRow-1],columns=[];
  for (let index=partColumn;index<headers.length;index++) {
    const name=text(headers[index]).trim();
    if (name && !/^(?:total|합계|소계)$/i.test(name)) columns.push({column:index+1,name});
  }
  if (!columns.length) throw Error('No process columns found after the Part column.');
  const rows=[],warnings=[];
  for (let rowIndex=headerRow;rowIndex<grid.length;rowIndex++) {
    const source=grid[rowIndex]||[],partName=text(source[partColumn-1]).trim();
    if (!partName || /^(?:total|sum|합계|소계)$/i.test(partName)) continue;
    const counts=[];
    for (const column of columns) {
      const raw=source[column.column-1],count=quantity(raw);
      if (count===null) continue;
      if (!Number.isFinite(count)) {warnings.push(`Row ${rowIndex+1}, ${column.name}: not a non-negative whole-unit count.`);continue;}
      counts.push({column:column.column,stage:column.name,quantity:count});
    }
    rows.push({row:rowIndex+1,code:codeColumn?text(source[codeColumn-1]).trim():'',partName,counts});
  }
  return {headerRow,partColumn,codeColumn,columns,rows,warnings};
}

async function previewWorkbook(buffer,{sheetName='',headerRow,partColumn,codeColumn}={}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer.subarray(0,2).toString() !== 'PK') throw Error('Upload a valid .xlsx workbook.');
  const ExcelJS=require('exceljs'),workbook=new ExcelJS.Workbook();
  try {await workbook.xlsx.load(buffer,{ignoreNodes:['dataValidations','conditionalFormatting','drawing','extLst']});}
  catch {throw Error('Could not read this .xlsx workbook.');}
  const sheets=workbook.worksheets.map(sheet=>sheet.name);
  if (!sheets.length) throw Error('Workbook has no sheets.');
  const sheet=sheetName?workbook.getWorksheet(sheetName):workbook.worksheets.find(item=>/wip|재공|mes/i.test(item.name))||workbook.worksheets[0];
  if (!sheet) throw Error('Selected worksheet was not found.');
  const grid=[];
  for (let row=1;row<=sheet.rowCount;row++) {
    const source=sheet.getRow(row),values=[];
    for(let col=1;col<=Math.min(sheet.columnCount,100);col++)values.push(source.getCell(col).value);
    grid.push(values);
  }
  const layout=headerRow!=null&&partColumn!=null?{headerRow:Number(headerRow),partColumn:Number(partColumn),codeColumn:0}:{...detectLayout(grid)};
  if(headerRow!=null)layout.headerRow=Number(headerRow);
  if(partColumn!=null)layout.partColumn=Number(partColumn);
  if(codeColumn!=null)layout.codeColumn=Number(codeColumn);
  return {sheet:sheet.name,sheets,...parseGrid(grid,layout)};
}

module.exports={detectLayout,parseGrid,previewWorkbook};
