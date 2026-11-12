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
        const H = ['CODCOLIGADA','NOME','CCUSTO','CODTIPO','FGTS_MES','INSS','INSS13','IRRF','IRRF13','INSS RAT AJUSTADO','INSS EMPRESA','INSS TERCEIROS','TOTAL GUIA'];
        const planilha = [
            H,
            [1,'JOSÉ PALÁCIOS','Obra X','N',999,50,5,20,0,7,40,11,113],
            [1,'B SILVA','Obra X','N',999,60,0,0,3,8,50,12,130],
            [1,'C SOUZA','Financeiro','N',999,30,0,15,0,3,20,6,59],
            [1,'D SOCIO','Financeiro','D',0,100,0,50,0,9,200,13,322]
        ];
        const csv = [
            'Nome Trabalhador;Tipo Deposito;Base Remuneracao Total;Valor FGTS na Guia',
            'JOSE PALACIOS;Mensal;1.250,00;100,00',
            'B SILVA;Mensal;2.500,00;200,00',
            'C SOUZA;Mensal;1.000,00;80,00',
            'FULANO EXTRA;Mensal;500,00;40,00'
        ].join('\\n');
        const sfColab = extrairSalarioFamiliaAnalitico([
            '00001934 - JOS� PAL�CIOS                  SERVI�OS GERAIS       Ativo',
            '1001 DIAS TRABALHADOS        30   2.354,01   2009 DESCONTO ADIANTAMENTO    0   941,60',
            '1014 SALARIO FAMILIA          1      67,54   2075 INSS                     9   163,14',
            '00000795   C   SOUZA   FAXINEIRA   (O)   Ativo',
            '1014   SALARIO   FAMILIA 1  20,26',
            '00000999 FULANO SEM PLANILHA AJUDANTE Ativo',
            '1014 SALARIO FAMILIA 1 5,00 B',
            'TOTAIS FOLHA GERAL',
            '1014   SALARIO   FAMILIA 3 3  92,80 2017   DESCONTO',
            '1014   SALARIO   FAMILIA 3 3,00  92,80 2017   DESCONTO'
        ].join('\\n'));
        assert.deepEqual(sfColab.map(t => [t.chapa, t.valor]), [['00001934', 67.54], ['00000795', 20.26], ['00000999', 5]]);
        const res = calcularRateioCC([planilha], csv, { salarioFamilia: 100, salarioFamiliaColab: sfColab });
        assert.equal(res.erro, undefined);
        const x = res.linhas.find(l => l.centro === 'Obra X');
        assert.equal(x.colaboradores, 2);
        assert.equal(x.fgts, 300);              // do FGTS Digital, não do FGTS_MES da planilha
        assert.equal(x.inssSegurado, 115);
        assert.equal(x.irrf, 23);
                assert.equal(res.total.fgts, 420);
        assert.equal(res.fgts.total, 420);
        assert.equal(res.fgts.naoLocalizados.length, 1);
        assert.equal(res.linhas[res.linhas.length - 1].centro, RATEIO_SEM_CC);
        // Diretor (D): sem RAT/Terceiros; salário-família sai do total.
        const fin = res.linhas.find(l => l.centro === 'Financeiro');
        assert.equal(fin.rat, 3);
        assert.equal(fin.terceiros, 6);
        assert.equal(fin.inssEmpresa, 220);
        assert.equal(res.ciIgnorado.rat, 9);
        assert.equal(res.ciIgnorado.terceiros, 13);
        // Salário-família deduzido no centro de cada colaborador; o que falta para a conciliação fica sem centro.
        assert.equal(x.salarioFamilia, 67.54);
        assert.equal(x.totalInss, Math.round((243 - 67.54) * 100) / 100);
        assert.equal(fin.salarioFamilia, 20.26);
        assert.equal(res.salarioFamilia.naoLocalizados.length, 1);
        assert.equal(res.linhas.find(l => l.centro === RATEIO_SEM_CC).salarioFamilia, 5);
        assert.equal(res.salarioFamilia.identificado, 92.8);
        assert.equal(res.salarioFamilia.naoIdentificado, 7.2);
        assert.equal(res.total.salarioFamilia, 100);
        assert.equal(res.total.totalInss, Math.round((243 + 59 + 300 - 100) * 100) / 100);

        // Ajuste ao eSocial: arredondamento distribuído por componente; diferença grande só avisa.
        const aj = ajustarRateioGoverno(calcularRateioCC([planilha], null, { salarioFamilia: 100, salarioFamiliaColab: sfColab }),
            { synced: true, segurados: 245.01, seguradosCI: null, patronal: 309.99, patronalCI: null, ratfap: 18, terceiros: 99, salarioFamilia: 100, total: 500, origemTotal: 'DCTFWeb' });
        const ajK = Object.fromEntries(aj.ajusteGoverno.map(a => [a.key, a]));
        assert.equal(ajK.inssSegurado.aplicado, true);
        assert.equal(aj.total.inssSegurado, 245.01);
        assert.equal(aj.total.inssEmpresa, 309.99);
        assert.equal(ajK.terceiros.aplicado, false); // 99 × 29: acima da tolerância
        assert.equal(aj.total.terceiros, 29);
        assert.equal(aj.total.totalInss, Math.round((aj.linhas.reduce((s, l) => s + l.totalInss, 0) - 7.2) * 100) / 100);
        assert.equal(aj.totalGovernoESocial, 245.01 + 309.99 + 18 + 99 - 100);

        const semFgts = calcularRateioCC([planilha], null);
        assert.equal(semFgts.total.fgts, 0);
        assert.equal(semFgts.fgts.lido, false);

        assert.ok(calcularRateioCC([[['NOME','X']]], null).erro);
    `, context);
});
