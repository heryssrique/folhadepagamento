const XLSX = require('xlsx');

const files = [
    { name: 'BASES JPL 032026.xlsx',         path: 'c:\\Users\\hhsil\\OneDrive\\Documentos\\folhadepagamento\\Modelos\\4\\BASES JPL 032026.xlsx' },
    { name: 'VALORES GRRF 03-2026.xlsx',      path: 'c:\\Users\\hhsil\\OneDrive\\Documentos\\folhadepagamento\\Modelos\\4\\VALORES GRRF 03-2026.xlsx' },
    { name: 'FolhaAnalitica RESUMOS  032026.xlsx', path: 'c:\\Users\\hhsil\\OneDrive\\Documentos\\folhadepagamento\\Modelos\\4\\FolhaAnalitica RESUMOS  032026.xlsx' }
];

const basesExpectedFields = ['NOME','CCUSTO','CODSITUACAO','CODTIPO','BASEFGTS','BASEFGTSAVPREVIO','BASEFGTS13AVPREVIO','BASEFGTS13','FGTS','FGTS_AVISO','FGTS13_AVISO','FGTS13','BASEINSS','BASEINSS13','INSS','INSS13','INSSFERIAS','INSS EMPRESA','INSS RAT AJUSTADO','INSS TERCEIROS','TOTAL GUA','BASEIRRF','BASEIRRFFERIAS','IRRF','IRRF13','IRRFFERIAS'];
const grrfExpectedFields = ['NOME','CHAPA','CODTIPO','FGTS QUITACAO','FGTS MES ANTERIOR','FGTS AVISO PREVIO','FGTS ARTIGO 22','FGTS 13 SALARIO INDENIZADO','FGTS 13 SAL RESCISAO'];

for (const f of files) {
    console.log(`\n========== ${f.name} ==========`);
    console.log(`  isAnalitico: ${ f.name.toLowerCase().includes('analit') }`);
    console.log(`  isBases:     ${ f.name.toLowerCase().includes('base') }`);

    const wb = XLSX.readFile(f.path);
    console.log(`  Sheets: ${wb.SheetNames.join(', ')}`);

    const rawHeaders = new Set();

    for (const sn of wb.SheetNames) {
        const ws = wb.Sheets[sn];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (!rows.length) continue;

        // Detect if label-based (Proventos / Liquido in any cell)
        let foundProventos = false, foundLiquido = false;
        for (let r = 0; r < rows.length; r++) {
            const row = rows[r] || [];
            for (const cell of row) {
                const c = String(cell||'').trim();
                if (/^Proventos$/i.test(c)) foundProventos = true;
                if (/^Líquido$|^Liquido$/i.test(c)) foundLiquido = true;
            }
        }

        if (!foundProventos && !foundLiquido) {
            // Tabular mode — collect rawHeaders from row 0
            const headers = rows[0] || [];
            headers.forEach(h => { const k = String(h||'').trim(); if (k) rawHeaders.add(k); });
            console.log(`  [${sn}] Tabular. Row0 headers (first 10): ${headers.slice(0,10).join(', ')}`);
        } else {
            console.log(`  [${sn}] Label-based. Proventos=${foundProventos}, Liquido=${foundLiquido}`);
        }
    }

    const rawArr = Array.from(rawHeaders);
    console.log(`  rawHeaders count: ${rawArr.length}`);

    if (f.name.toLowerCase().includes('base')) {
        const found = basesExpectedFields.filter(f => rawArr.includes(f));
        const missing = basesExpectedFields.filter(f => !rawArr.includes(f));
        console.log(`  BASES - Found (${found.length}/26): ${found.join(', ')}`);
        if (missing.length) console.log(`  BASES - Missing: ${missing.join(', ')}`);
    }

    if (f.name.toLowerCase().includes('grrf') || f.name.toLowerCase().includes('valores')) {
        console.log(`  GRRF rawHeaders: ${rawArr.join(', ')}`);
    }
}
