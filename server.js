const express = require('express');
const path = require('path');
require('dotenv').config();

// Servidor local: as mesmas rotas /api da Vercel (api/index.js) + os arquivos estáticos.
const app = express();
app.use(require('./api'));

// Serve static files (HTML, CSS, JS)
app.use(express.static(__dirname));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Fallback para SPA (envia index.html para qualquer rota que não seja /api)
app.use((req, res, next) => {
    if (!req.path.startsWith('/api')) {
        return res.sendFile(path.join(__dirname, 'index.html'));
    }
    next();
});

const PORT = process.env.PORT || 3001;

// Start Server
const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

module.exports = server;
