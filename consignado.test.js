const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('conferência de empréstimo consignado (guia vs RM)', () => {
    const context = {
        window: { location: { hostname: 'example.com' }, scrollTo() {}, print() {} },
        document: { getElementById: () => null, addEventListener() {}, createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        console, assert,
        Intl, Date, Blob, URL, setTimeout, clearTimeout, AbortController,
        pdfjsLib: {
            getDocument: () => ({
                promise: Promise.resolve({
                    numPages: 1,
                    getPage: () => Promise.resolve({
                        rotate: 90,
                        getTextContent: () => Promise.resolve({
                            items: [
                                { str: 'Qtd. Trabalhadores Consignado: 37', transform: [0,6,-6,0,10,100] },
                                { str: 'Total Consignado 21.434,55', transform: [0,6,-6,0,10,200] },
                                { str: '10/2026', transform: [0,6,-6,0,10,300] },
                                { str: '19/11/2026', transform: [0,6,-6,0,50,300] },
                                { str: 'ANDRE DA SILVA ARRUDA', transform: [0,6,-6,0,100,300] },
                                { str: 'C04S000904', transform: [0,6,-6,0,300,300] },
                                { str: '052.528.601-22', transform: [0,6,-6,0,400,300] },
                                { str: '193500121845243', transform: [0,6,-6,0,500,300] },
                                { str: '935', transform: [0,6,-6,0,600,300] },
                                { str: '86,22', transform: [0,6,-6,0,700,300] },

                                { str: '10/2026', transform: [0,6,-6,0,10,350] },
                                { str: '19/11/2026', transform: [0,6,-6,0,50,350] },
                                { str: 'ANDRE DA SILVA ARRUDA', transform: [0,6,-6,0,100,350] },
                                { str: 'C04S000904', transform: [0,6,-6,0,300,350] },
                                { str: '052.528.601-22', transform: [0,6,-6,0,400,350] },
                                { str: '56644970', transform: [0,6,-6,0,500,350] },
                                { str: '422', transform: [0,6,-6,0,600,350] },
                                { str: '176,57', transform: [0,6,-6,0,700,350] }
                            ]
                        })
                    })
                })
            })
        },
        XLSX: {
            read: () => ({
                SheetNames: ['Sheet'],
                Sheets: {
                    Sheet: {
                        '!ref': 'A1:E5',
                        'D2': { t: 'n', v: 10 },
                        'B3': { t: 's', v: 'NOME' },
                        'C3': { t: 's', v: 'CODSITUACAO' },
                        'D3': { t: 's', v: 'D' },
                        'B4': { t: 's', v: 'ANDRE DA SILVA ARRUDA' },
                        'C4': { t: 's', v: 'A' },
                        'D4': { t: 'n', v: 735.28 },
                        'B5': { t: 's', v: '4 Total' },
                        'D5': { t: 'n', v: 735.28 }
                    }
                }
            }),
            utils: {
                sheet_to_json: () => [
                    ['CODCOLIGADA', 'NOME', 'CODSITUACAO', 'D', ''],
                    ['4', 'ANDRE DA SILVA ARRUDA', 'A', 735.28, ''],
                    ['4 Total', '', '', 735.28, '']
                ]
            }
        },
        showToast: () => {}
    };

    vm.createContext(context);
    const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    vm.runInContext(source, context, { filename: 'app.js' });

    vm.runInContext(`
        const guia = parseGuiaConsignado([
            '10/2026 19/11/2026 ANDRE DA SILVA ARRUDA C04S000904 052.528.601-22 193500121845243 935 86,22',
            '10/2026 19/11/2026 ANDRE DA SILVA ARRUDA C04S000904 052.528.601-22 56644970 422 176,57',
            'Total Consignado 262,79'
        ]);
        assert.equal(guia.total, 262.79);
        assert.equal(guia.totalImpresso, 262.79);
        assert.ok(guia.trabalhadores['ANDRE DA SILVA ARRUDA']);
        assert.equal(guia.trabalhadores['ANDRE DA SILVA ARRUDA'].total, 262.79);

        const folha = parseEmprestimosRM([
            ['CODCOLIGADA', 'NOME', 'CODSITUACAO', 'D', ''],
            ['4', 'ANDRE DA SILVA ARRUDA', 'A', 262.79, ''],
            ['4 Total', '', '', 262.79, '']
        ]);
        assert.equal(folha.total, 262.79);

        const res = conferirConsignado(guia, folha);
        assert.equal(res.fontes[0]['ANDRE DA SILVA ARRUDA'], 262.79);
        assert.equal(res.fontes[1]['ANDRE DA SILVA ARRUDA'], 262.79);
    `, context);
});