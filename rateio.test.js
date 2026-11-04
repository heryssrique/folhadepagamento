const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('rateio por centro de custo: INSS/IRRF da Planilha Auxiliar, FGTS do FGTS Digital', () => {
    const context = {
        window: { location: { hostname: 'example.com' }, scrollTo() {}, print() {} },
        document: { getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        console, assert, Intl, Date, setTimeout, clearTimeout
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8'), context, { filename: 'app.js' });
    vm.runInContext(`
        const H = ['CODCOLIGADA','NOME','CCUSTO','FGTS_MES','INSS','INSS13','IRRF','IRRF13','INSS RAT AJUSTADO','INSS EMPRESA','INSS TERCEIROS','TOTAL GUIA'];
        const planilha = [
            H,
            [1,'JOSÉ PALÁCIOS','Obra X',999,50,5,20,0,7,40,11,113],
            [1,'B SILVA','Obra X',999,60,0,0,3,8,50,12,130],
            [1,'C SOUZA','Financeiro',999,30,0,15,0,3,20,6,59]
        ];
        const csv = [
            'Nome Trabalhador;Tipo Deposito;Base Remuneracao Total;Valor FGTS na Guia',
            'JOSE PALACIOS;Mensal;1.250,00;100,00',
            'B SILVA;Mensal;2.500,00;200,00',
            'C SOUZA;Mensal;1.000,00;80,00',
            'FULANO EXTRA;Mensal;500,00;40,00'
        ].join('\\n');
        const res = calcularRateioCC([planilha], csv);
        assert.equal(res.erro, undefined);
        const x = res.linhas.find(l => l.centro === 'Obra X');
        assert.equal(x.colaboradores, 2);
        assert.equal(x.fgts, 300);              // do FGTS Digital, não do FGTS_MES da planilha
        assert.equal(x.inssSegurado, 115);
        assert.equal(x.irrf, 23);
        assert.equal(x.totalInss, 115 + 90 + 15 + 23);
        assert.equal(res.total.fgts, 420);
        assert.equal(res.fgts.total, 420);
        assert.equal(res.fgts.naoLocalizados.length, 1);
        assert.equal(res.linhas[res.linhas.length - 1].centro, RATEIO_SEM_CC);
        assert.equal(res.total.totalInss, res.totalGuia);

        const semFgts = calcularRateioCC([planilha], null);
        assert.equal(semFgts.total.fgts, 0);
        assert.equal(semFgts.fgts.lido, false);

        assert.ok(calcularRateioCC([[['NOME','X']]], null).erro);
    `, context);
});
