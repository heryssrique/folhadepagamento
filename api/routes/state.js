const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Schema de persistência do estado da folha.
// O userId do JWT isola os dados: cada usuário enxerga apenas o seu.
const StateSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    data: { type: Object, default: {} }
}, { timestamps: true });

const State = mongoose.models.State || mongoose.model('State', StateSchema);

// Middleware para proteger todas as rotas deste router
router.use(authenticateToken);

// GET /api/state - obtém o estado do usuário autenticado
router.get('/', async (req, res) => {
    try {
        const state = await State.findOne({ userId: req.user.userId });
        if (!state) return res.json(null);
        res.json(state.data);
    } catch (err) {
        console.error('Erro ao buscar estado:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/state - salva o estado do usuário autenticado
router.post('/', async (req, res) => {
    try {
        const state = await State.findOneAndUpdate(
            { userId: req.user.userId },
            { data: req.body },
            { upsert: true, new: true }
        );
        res.json(state.data);
    } catch (err) {
        console.error('Erro ao salvar estado:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// DELETE /api/state - reseta o estado do usuário autenticado
router.delete('/', async (req, res) => {
    try {
        await State.deleteOne({ userId: req.user.userId });
        res.json({ message: 'State reset successfully' });
    } catch (err) {
        console.error('Erro ao resetar estado:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;