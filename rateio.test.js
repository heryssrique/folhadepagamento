const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('rateio por centro de custo soma INSS/FGTS/IRRF por CCUSTO', () => {
    const context = {
        window: { location: { hostname: 'example.com' }, scrollTo() {}, print() {} },
        document: { getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        console, assert, Intl, Date, setTimeout, clearTimeout
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8'), context, { filename: 'app.js' });
    vm.runInContext(`
        const H = ['CODCOLIGADA','NOME','CCUSTO','FGTS_MES','FGTS13','INSS','INSS13','IRRF','IRRF13','INSS RAT AJUSTADO','INSS EMPRESA','INSS TERCEIROS','TOTAL GUIA'];
        const res = calcularRateioCC([
            H,
            [1,'A','Obra X',100,10,50,5,20,0,7,40,11,113],
            [1,'B','Obra X',200,0,60,0,0,3,8,50,12,130],
            [1,'C','Financeiro',80,0,30,0,15,0,3,20,6,59]
        ]);
        assert.equal(res.erro, undefined);
        assert.equal(res.linhas.length, 2);
        const x = res.linhas.find(l => l.centro === 'Obra X');
        assert.equal(x.colaboradores, 2);
        assert.equal(x.fgts, 310);
        assert.equal(x.inssSegurado, 115);
        assert.equal(x.irrf, 23);
        assert.equal(x.totalInss, 115 + 90 + 15 + 23);
        assert.equal(res.total.totalInss, res.totalGuia);
        assert.ok(res.ausentes.includes('INSSFERIAS'));
        assert.ok(calcularRateioCC([['NOME','X']]).erro);
    `, context);
});
