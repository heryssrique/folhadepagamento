const XLSX = require('xlsx');

const filePath = 'C:\\Users\\RH Concreta\\Documents\\folhadepagamento\\Modelos\\1\\BASES CONCRETA 09-2026.xlsx';

const wb = XLSX.readFile(filePath);
const ws = wb.Sheets['BASES'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

console.log('=== BASES sheet: scanning rows 0-10 for header-like rows ===');
for (let i = 0; i < Math.min(10, rows.length); i++) {
  const nonNull = rows[i].filter(x => x !== null && x !== undefined && x !== '');
  console.log(`Row ${i} (${nonNull.length} non-null values):`, JSON.stringify(rows[i]));
}

console.log('\n=== All non-null values in rows 0-5 ===');
for (let i = 0; i < Math.min(6, rows.length); i++) {
  rows[i].forEach((val, col) => {
    if (val !== null && val !== undefined && val !== '') {
      console.log(`  Row ${i}, Col ${col}: ${JSON.stringify(val)}`);
    }
  });
}

// Also try reading as object (uses first row as header)
console.log('\n=== sheet_to_json with header:1, first 5 data rows ===');
const dataRows = XLSX.utils.sheet_to_json(ws, { defval: null });
console.log('Object keys from first data row:', dataRows.length > 0 ? JSON.stringify(Object.keys(dataRows[0])) : 'no rows');
for (let i = 0; i < Math.min(3, dataRows.length); i++) {
  console.log(`DataRow ${i}:`, JSON.stringify(dataRows[i]));
}
