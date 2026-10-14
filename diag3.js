const XLSX = require('xlsx');

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
  return String(s).toUpperCase().replace(/[\s_\-]/g, '');
}

const expectedNorms = new Set(expectedFields.map(normalize));

const wb = XLSX.readFile(filePath);

for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  
  let bestRow = -1, bestScore = 0;
  
  for (let i = 0; i < rows.length; i++) {
    let score = 0;
    rows[i].forEach(val => {
      if (val !== null && val !== undefined) {
        if (expectedNorms.has(normalize(val))) score++;
      }
    });
    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }
  
  if (bestScore > 0) {
    console.log(`\nSheet "${sheetName}": Best header-like row is ROW ${bestRow} (${bestScore} field matches)`);
    console.log('Row contents:', JSON.stringify(rows[bestRow]));
    
    console.log('\nField matching against this row:');
    const headerRow = rows[bestRow];
    const normalizedHeaders = {};
    headerRow.forEach((h, idx) => {
      if (h !== null && h !== undefined) {
        normalizedHeaders[normalize(h)] = { original: h, index: idx };
      }
    });
    
    expectedFields.forEach(field => {
      const exactMatch = headerRow.includes(field);
      const normKey = normalize(field);
      const normMatch = normalizedHeaders[normKey];
      if (exactMatch) {
        console.log(`  [EXACT ] ${field}`);
      } else if (normMatch) {
        console.log(`  [NORM  ] ${field}  => found as: "${normMatch.original}" (col ${normMatch.index})`);
      } else {
        console.log(`  [MISS  ] ${field}`);
      }
    });
    
    // Show all non-null headers in that row
    console.log('\nAll non-null values in best row:');
    headerRow.forEach((h, idx) => {
      if (h !== null && h !== undefined) console.log(`  [${idx}] ${JSON.stringify(h)}`);
    });
  } else {
    console.log(`Sheet "${sheetName}": No matching rows found (0 expected fields in any row)`);
  }
}
