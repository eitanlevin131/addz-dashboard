import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const input = await FileBlob.load('/Users/eitanlevin/Downloads/גאנט ניוזלטר - calmo.xlsx');
const workbook = await SpreadsheetFile.importXlsx(input);
const sheets = workbook.worksheets.items.map((sheet) => ({ id: sheet.id, name: sheet.name }));
console.log(JSON.stringify({ sheets }, null, 2));
for (const sheet of workbook.worksheets.items) {
  const used = await workbook.inspect({
    kind: 'table',
    sheetId: sheet.id,
    range: `${sheet.name}!A1:L30`,
    include: 'values,formulas',
    tableMaxRows: 30,
    tableMaxCols: 12,
  });
  console.log(`--- ${sheet.name} ---`);
  console.log(used.ndjson);
}
