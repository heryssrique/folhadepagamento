const XLSX = require('xlsx');
const path = require('path');

const target = path.join(__dirname, '..', 'Modelos', '1', 'BASES.xlsx');
const wb = XLSX.readFile(target);

const expected = ['NOME','CCUSTO','CODSITUACAO','CODTIPO','BASEFGTS','BASEFGTSAVPREVIO','BASEFGTS13AVPREVIO','BASEFGTS13','BASEFGTSDIFSAL','FGTS_MES','FGTS_AVISO','FGTS13_AVISO','FGTS13','FGTSDIF','BASEINSS','BASEINSS13','BASE_INSS_AUTONOMO','INSS','INSS13','INSSFERIAS','INSSDIFSAL','BASEIRRF','BASEIRRFFERIAS','IRRF','IRRF13','IRRFFERIAS'];
const norm = s => String(s||'').trim().toUpperCase().replace(/[\s_]+/g, '');

console.log('File:', target);
console.log('Sheets:', wb.SheetNames.join(', '));

for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    console.log(`\n===== Sheet "${sn}" rows=${rows.length} =====`);

    // Detect label-based (what the app does)
    let foundProv = false, foundLiq = false;
    for (const row of rows) for (const cell of (row||[])) {
        const c = String(cell||'').trim();
        if (/^Proventos$/i.test(c)) foundProv = true;
        if (/^Líquido$|^Liquido$/i.test(c)) foundLiq = true;
    }
    console.log('foundLabels Proventos/Liquido =', foundProv, foundLiq, '=> tabular branch runs?', (!foundProv && !foundLiq));

    // Show first 3 rows
    for (let i = 0; i < Math.min(3, rows.length); i++) {
        console.log(`  row[${i}] (${(rows[i]||[]).length} cols):`, JSON.stringify((rows[i]||[]).slice(0, 30)));
    }

    const headers = rows[0] || [];
    const rawHeaders = headers.map(h => String(h||'').trim()).filter(Boolean);
    console.log('  rawHeaders:', rawHeaders.join(' | '));

    // Exact match (current app logic likely)
    const exactMissing = expected.filter(e => !rawHeaders.includes(e));
    console.log('  EXACT missing:', exactMissing.length, exactMissing.join(', '));

    // Normalized match
    const rawNorm = rawHeaders.map(norm);
    const normMissing = expected.filter(e => !rawNorm.includes(norm(e)));
    console.log('  NORMALIZED missing:', normMissing.length, normMissing.join(', '));
}
