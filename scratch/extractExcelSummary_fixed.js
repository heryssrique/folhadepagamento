async function extractExcelSummary(file) {
    const excelBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(excelBuffer);
    
    const summary = { 
        bruto: 0, 
        descontos: 0, 
        liquido: 0, 
        liquidoProLabore: 0, 
        colaboradores: 0, 
        ativos: 0, 
        afastados: 0, 
        desligados: 0, 
        bases: { inss: 0, fgts: 0, fgts13: 0, fgts2: 0, irrf: 0 } 
    };

    const parseVal = (val) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        const clean = String(val).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
        return parseFloat(clean) || 0;
    };

    for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (jsonData.length === 0) continue;

        const rows = jsonData;
        let foundLabels = { bruto: false, descontos: false, liquido: false, ativos: false, proLabore: false };

        const pickMonetary = (row, c) => {
            let fallback = 0;
            for (let i = 1; i <= 20; i++) {
                const cell = row[c + i];
                if (cell === null || cell === undefined) continue;
                const str = String(cell).trim();
                if (/\d[\d.]*,\d{2}/.test(str)) return parseVal(str);
                if (typeof cell === 'number' && cell > 0 && fallback === 0) fallback = cell;
            }
            return fallback;
        };

        // 1. Tentar busca por Rótulos (Estilo Relatório)
        for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            for (let c = 0; c < row.length; c++) {
                const cell = String(row[c] || '').trim();
                
                if (!foundLabels.bruto && /^Proventos$/i.test(cell)) {
                    for (let i = 1; i <= 15; i++) {
                        const val = parseVal(row[c + i]);
                        if (val > 100) { summary.bruto += val; foundLabels.bruto = true; break; }
                    }
                }
                if (!foundLabels.descontos && /^Descontos$/i.test(cell)) {
                    for (let i = 1; i <= 15; i++) {
                        const val = parseVal(row[c + i]);
                        if (val > 10) { summary.descontos += val; foundLabels.descontos = true; break; }
                    }
                }
                if (!foundLabels.liquido && (/^Líquido$|^Liquido$/i.test(cell) || /LIQUIDO FOLHA PAGAMENTO/i.test(cell))) {
                    const val = pickMonetary(row, c);
                    if (val > 0) { summary.liquido += val; foundLabels.liquido = true; }
                }
                if (!foundLabels.proLabore && /LIQUIDO.{0,20}PRO.{0,5}LABORE/i.test(cell)) {
                    const val = pickMonetary(row, c);
                    if (val > 0) { summary.liquidoProLabore += val; foundLabels.proLabore = true; }
                }
                if (!foundLabels.ativos && /^Ativos$/i.test(cell)) {
                    for (let i = 1; i <= 10; i++) {
                        const val = parseInt(row[c + i]);
                        if (!isNaN(val) && val > 0) { summary.colaboradores += val; foundLabels.ativos = true; break; }
                    }
                }
                // Bases
                if (/Base\s+FGTS\s+13/i.test(cell)) {
                    const val = pickMonetary(row, c);
                    if (val > 0) summary.bases.fgts13 += val;
                } else if (/Base\s+FGTS\s+Menor\s+Apr|Base\s+FGTS\s+2%/i.test(cell)) {
                    const val = pickMonetary(row, c);
                    if (val > 0) summary.bases.fgts2 += val;
                } else if (/Base\s+FGTS/i.test(cell)) {
                    const val = pickMonetary(row, c);
                    if (val > 0) summary.bases.fgts += val;
                }
                if (/Base\s+INSS\s+13.*?Envelope|Base\s+INSS\s+13/i.test(cell)) {
                    // Just marking found for layout if needed
                } else if (/Base\s+INSS.*?Envelope|Base\s+INSS/i.test(cell)) {
                    const val = pickMonetary(row, c);
                    if (val > 0) summary.bases.inss += val;
                }
                if (/IRRF/i.test(cell)) {
                    const val = pickMonetary(row, c);
                    if (val > 0) summary.bases.irrf += val;
                }
            }
        }

        // 2. Se não encontrou rótulos, assume que é tabular
        if (!foundLabels.bruto && !foundLabels.liquido) {
            const headers = rows[0] || [];
            const findCols = (regex) => headers.reduce((acc, h, i) => regex.test(h) ? [...acc, i] : acc, []);
            const idx = {
                bruto: findCols(/total\s+proventos|bruto|vencimentos/i),
                descontos: findCols(/total\s+descontos|descontos/i),
                liquido: findCols(/valor\s+liquido|liquido/i),
                inss: findCols(/base\s+inss|base\s+prev/i),
                fgts: findCols(/base\s+fgts$|base\s+fgts\s+mensal|^fgts$/i),
                fgts13: findCols(/fgts\s+13/i),
                fgts2: findCols(/fgts\s+2%|fgts\s+menor/i),
                irrf: findCols(/base\s+irrf|base\s+ir/i),
                situacao: headers.findIndex(h => /^CODSITUACAO$/i.test(h) || /SITUA[ÇC][ÃA]O/i.test(h))
            };
            const dataRows = rows.slice(1);
            dataRows.forEach(row => {
                idx.bruto.forEach(i => summary.bruto += parseVal(row[i]));
                idx.descontos.forEach(i => summary.descontos += parseVal(row[i]));
                idx.liquido.forEach(i => summary.liquido += parseVal(row[i]));
                idx.inss.forEach(i => summary.bases.inss += parseVal(row[i]));
                idx.fgts.forEach(i => summary.bases.fgts += parseVal(row[i]));
                idx.fgts13.forEach(i => summary.bases.fgts13 += parseVal(row[i]));
                idx.fgts2.forEach(i => summary.bases.fgts2 += parseVal(row[i]));
                idx.irrf.forEach(i => summary.bases.irrf += parseVal(row[i]));
                if (idx.situacao !== -1) {
                    const sit = String(row[idx.situacao] || '').toUpperCase().trim();
                    if (sit === 'A') summary.ativos++;
                    else if (sit === 'P') summary.afastados++;
                    else if (sit === 'D') summary.desligados++;
                }
            });
            if (idx.situacao !== -1) summary.colaboradores += summary.ativos;
        }
    }
    return summary;
}
