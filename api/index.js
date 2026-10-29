const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { connectToDatabase } = require('./config/db');

const app = express();
app.use(cors());

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'FolhaPay API is running' });
});

// Na Vercel a função pode acordar sem conexão: toda rota espera o MongoDB antes de consultar.
app.use('/api', async (req, res, next) => {
    try {
        await connectToDatabase();
        next();
    } catch (err) {
        console.error('MongoDB Connection Error:', err);
        res.status(503).json({ error: 'Banco de dados indisponível' });
    }
});

// Log de Conciliação: antes do express.json global, porque usa limite maior (50 MB).
app.use('/api/conciliacao-log', require('./routes/conciliacaoLog'));
app.use(express.json({ limit: '10mb' }));

// --- Rotas de Autenticação ---
app.use('/api/auth', require('./routes/auth'));

// --- Rotas de Estado da Folha de Pagamento (protegidas) ---
app.use('/api/state', require('./routes/state'));

module.exports = app;
