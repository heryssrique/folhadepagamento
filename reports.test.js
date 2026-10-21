const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function createHarness() {
    const nodes = {
        reportPreview: { style: {}, offsetTop: 0 },
        reportContent: { innerHTML: '' },
        previewTitle: { innerText: '' },
        toast: { className: '', innerText: '', classList: { remove() {} } }
    };
    const events = { prints: 0, toasts: [], workbook: null, file: null };
    const XLSX = {
        utils: {
            book_new: () => ({ Sheets: {}, SheetNames: [] }),
            aoa_to_sheet: rows => ({ rows }),
            book_append_sheet: (workbook, sheet, name) => {
                workbook.Sheets[name] = sheet;
                workbook.SheetNames.push(name);
            }
        },
        writeFile: (workbook, filename) => {
            events.workbook = workbook;
            events.file = filename;
        }
    };
    const context = {
        window: {
            location: { hostname: 'example.com' },
            setTimeout,
            scrollTo() {},
            print() { events.prints++; }
        },
        document: {
            getElementById: id => nodes[id] || null,
            addEventListener() {},
            createElement: () => ({ click() {}, remove() {} }),
            body: { appendChild() {} }
        },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        console,
        Intl,
        Date,
        Blob,
        URL,
        setTimeout,
        clearTimeout,
        AbortController,
        XLSX,
        showToast: (message, type) => events.toasts.push({ message, type })
    };
    vm.createContext(context);
    const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    vm.runInContext(source, context, { filename: 'app.js' });
    vm.runInContext(`
        state.competencia = '2026-04';
        state.config = { empresa: 'Empresa Teste', cnpj: '00.000.000/0001-00' };
        state.summary = { ativos: 2, afastados: 1, desligados: 1, colaboradores: 2, bruto: 10000, descontos: 1200, liquidoFolha: 8800, liquidoProLabore: 500 };
        state.validations = [{ title: 'Layout Analítico', status: 'warning', desc: 'Coluna opcional ausente' }];
        state.conciliacao = {
            inss: [{ origem: 'Folha Interna (Analítico)', base: 8000, segurados: 700, patronal: 1600, ratfap: 160, terceiros: 464, subtotal: 2924 }],
            irrf: [{ origem: 'Planilha Auxiliar (Confronto)', irrfMensal: 300, irrf13: 20, irrfFerias: 10, total: 330 }],
            fgts: [{ origem: 'FGTS Digital (Governo)', baseMensal: 8000, valorMensal: 640, base13: 0, valor13: 0, total: 640 }],
            desligados: []
        };
        conciliacaoAudit = {
            createdAt: new Date('2026-04-15T12:00:00Z'),
            divergencias: [{ tributo: 'INSS', metrica: 'Base Folha', analitico: 8000, planilha: 7900, governo: null, diferenca: 100, difGov: null, motivos: ['Diferença encontrada'] }],
            entries: [{ stage: 'Importação', level: 'info', message: 'Arquivos processados', detail: '2 arquivos' }],
            planilhaRows: [],
            colaboradores: [],
            analitico: [],
            planilhaColumns: [],
            formulas: []
        };
    `, context);
    return { context, nodes, events };
}

test('resumo usa apenas totais reais do estado, sem rubricas fictícias', () => {
    const { context, nodes } = createHarness();
    vm.runInContext("generateReport('resumo')", context);
    assert.match(nodes.reportContent.innerHTML, /10\.000/);
    assert.match(nodes.reportContent.innerHTML, /8\.800/);
    assert.match(nodes.reportContent.innerHTML, /2/);
    assert.doesNotMatch(nodes.reportContent.innerHTML, /Horas Extras|Gratificações|412\.000/);
    assert.equal(nodes.previewTitle.innerText, 'Resumo Consolidado da Folha');
});

test('resumo calcula líquido como bruto menos descontos quando o campo líquido está ausente', () => {
    const { context, nodes } = createHarness();
    vm.runInContext('delete state.summary.liquidoFolha', context);
    vm.runInContext("generateReport('resumo')", context);
    assert.match(nodes.reportContent.innerHTML, /R\$[^<]*8\.800,00/);
    assert.doesNotMatch(nodes.reportContent.innerHTML, /NaN/);
});

test('cada tipo de relatório mostra dados ou explica por que não pode ser gerado', () => {
    const { context, nodes } = createHarness();
    const expected = {
        validacao: /Layout Analítico/,
        encargos: /INSS|FGTS|IRRF/,
        holerites: /não é possível emitir holerites individuais/i,
        divergencias: /Base Folha|Diferença encontrada/,
        historico: /Arquivos processados/
    };
    for (const [type, pattern] of Object.entries(expected)) {
        vm.runInContext(`generateReport('${type}')`, context);
        assert.match(nodes.reportContent.innerHTML, pattern, `relatório ${type}`);
        assert.doesNotMatch(nodes.reportContent.innerHTML, /sendo carregados/);
    }
});

test('download PDF abre a impressão do relatório e não anuncia um download fictício', () => {
    const { context, events } = createHarness();
    vm.runInContext("generateReport('resumo'); downloadReport()", context);
    assert.equal(events.prints, 1);
    assert.equal(events.toasts.some(t => /Download concluído/.test(t.message)), false);
});

test('exportação da conciliação gera um arquivo XLSX com as fontes disponíveis', () => {
    const { context, events } = createHarness();
    vm.runInContext('exportConciliacao()', context);
    assert.equal(events.file, 'conciliacao-2026-04.xlsx');
    assert.ok(events.workbook);
    assert.ok(events.workbook.SheetNames.includes('INSS'));
    assert.ok(events.workbook.SheetNames.includes('IRRF'));
    assert.ok(events.workbook.SheetNames.includes('FGTS'));
});
