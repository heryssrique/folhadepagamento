const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticateToken } = require('../middleware/auth');

// Log de Conciliação completo (capturas do Analítico, linhas da Planilha, comparação por colaborador,
// fórmulas e divergências). Histórico: cada processamento grava um documento novo, sem substituir os anteriores.
const ConciliacaoLogSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    empresa: { type: String, default: '' },
    cnpj: { type: String, default: '' },
    competencia: { type: String, required: true },
    geradoEm: { type: Date },
    data: { type: Object, default: {} }
}, { timestamps: true, minimize: false });
ConciliacaoLogSchema.index({ userId: 1, cnpj: 1, competencia: 1, geradoEm: -1 });

const ConciliacaoLog = mongoose.models.ConciliacaoLog || mongoose.model('ConciliacaoLog', ConciliacaoLogSchema);

router.use(authenticateToken);
// O log de uma folha grande passa de 10 MB em JSON; o cliente envia gzip e o body-parser descompacta.
router.use(express.json({ limit: '50mb' }));

// POST /api/conciliacao-log - grava o log do processamento atual
router.post('/', async (req, res) => {
    const { empresa = '', cnpj = '', competencia, geradoEm, data } = req.body || {};
    if (!competencia || typeof competencia !== 'string' || !data || typeof data !== 'object') {
        return res.status(400).json({ error: 'competencia e data são obrigatórios' });
    }
    try {
        const log = await ConciliacaoLog.create({
            userId: req.user.userId, empresa: String(empresa), cnpj: String(cnpj), competencia,
            geradoEm: geradoEm ? new Date(geradoEm) : new Date(), data
        });
        res.status(201).json({ ok: true, id: log._id });
    } catch (err) {
        console.error('Erro ao salvar log de conciliação:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
