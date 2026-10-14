const XLSX = require('xlsx');
const path = require('path');

const filePath = 'C:\\Users\\RH Concreta\\Documents\\folhadepagamento\\Modelos\\1\\BASES CONCRETA 09-2026.xlsx';

const expectedFields = [
  'NOME','CCUSTO','CODSITUACAO','CODTIPO',
  'BASEFGTS','BASEFGTSAVPREVIO','BASEFGTS13AVPREVIO','BASEFGTS13','BASEFGTSDIFSAL',
  'FGTS_MES','FGTS_AVISO','FGTS13_AVISO','FGTS13','FGTSDIF',
  'BASEINSS','BASEINSS13','BASE_INSS_AUTONOMO',
  'INSS','INSS13','INSSFERIAS','INSSDIFSAL',
  'BASEIRRF','BASEIRRFFERIAS','IRRF','IRRF13','IRRFFERIAS'
];

function normalize(s) {
  return String(s).toUpperCase().replace(/[\s_]/g, '');
}

try {
  console.log('=== XLSX Diagnostic ===');
  console.log('File:', filePath);
  console.log('');

  const workbook = XLSX.readFile(filePath);
  console.log('Sheets found:', workbook.SheetNames.join(', '));
  console.log('');

  for (const sheetName of workbook.SheetNames) {
    console.log('========================================');
    console.log('SHEET:', sheetName);
    console.log('========================================');

    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    console.log(`Total rows in sheet: ${rows.length}`);
    console.log('');

    // First 3 rows as JSON
    for (let i = 0; i < Math.min(3, rows.length); i++) {
      console.log(`Row ${i}:`, JSON.stringify(rows[i]));
    }
    console.log('');

    if (rows.length === 0) {
      console.log('  (empty sheet)');
      continue;
    }

    const headerRow = rows[0];
    console.log(`Total columns: ${headerRow.length}`);
    console.log('');
    console.log('EXACT HEADER VALUES (verbatim):');
    headerRow.forEach((h, idx) => {
      console.log(`  [${idx}] ${JSON.stringify(h)}`);
    });
    console.log('');

    // Build normalized map from header
    const normalizedHeaders = {};
    headerRow.forEach((h, idx) => {
      if (h !== null && h !== undefined) {
        const norm = normalize(h);
        normalizedHeaders[norm] = { original: h, index: idx };
      }
    });

    // Check each expected field
    console.log('FIELD MATCHING RESULTS:');
    const missing = [];
    const exactMissing = [];
    const normMissing = [];

    for (const field of expectedFields) {
      const exactMatch = headerRow.includes(field);
      const normKey = normalize(field);
      const normMatch = normalizedHeaders.hasOwnProperty(normKey);

      if (exactMatch) {
        console.log(`  [EXACT MATCH]  ${field}`);
      } else if (normMatch) {
        const found = normalizedHeaders[normKey];
        console.log(`  [NORM MATCH ]  ${field}  =>  found as: ${JSON.stringify(found.original)} at col ${found.index}`);
        exactMissing.push({ expected: field, found: found.original });
      } else {
        console.log(`  [MISSING    ]  ${field}`);
        missing.push(field);
      }
    }

    console.log('');
    console.log('--- SUMMARY ---');
    console.log(`Expected fields: ${expectedFields.length}`);
    console.log(`Completely missing (no exact or normalized match): ${missing.length}`);
    if (missing.length > 0) {
      console.log('  Missing fields:', missing.join(', '));
    }
    console.log(`Exact mismatch (found only via normalization): ${exactMissing.length}`);
    if (exactMissing.length > 0) {
      exactMissing.forEach(m => console.log(`  Expected: "${m.expected}"  Found: "${m.found}"`));
    }

    // Also show any header values that didn't match any expected field
    const expectedNorms = new Set(expectedFields.map(normalize));
    const unmapped = headerRow.filter(h => h !== null && h !== undefined && !expectedNorms.has(normalize(h)));
    console.log('');
    console.log(`Extra headers not in expected list (${unmapped.length}):`);
    unmapped.forEach(h => console.log('  ', JSON.stringify(h)));
  }

  console.log('');
  console.log('=== Done ===');
} catch (err) {
  console.error('ERROR:', err.message);
  console.error(err.stack);
}
