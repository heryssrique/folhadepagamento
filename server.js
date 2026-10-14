const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Serve static files (HTML, CSS, JS)
app.use(express.static(__dirname));

// MongoDB Schema
const StateSchema = new mongoose.Schema({
    userId: { type: String, default: 'default' },
    data: Object
}, { timestamps: true });

const State = mongoose.model('State', StateSchema);

// API Routes
app.get('/api/state', async (req, res) => {
    try {
        const state = await State.findOne({ userId: 'default' });
        if (!state) return res.json(null);
        res.json(state.data);
    } catch (err) {
        console.error('Error fetching state:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/state', async (req, res) => {
    try {
        const state = await State.findOneAndUpdate(
            { userId: 'default' },
            { data: req.body },
            { upsert: true, new: true }
        );
        res.json(state.data);
    } catch (err) {
        console.error('Error saving state:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/state', async (req, res) => {
    try {
        await State.deleteOne({ userId: 'default' });
        res.json({ message: 'State reset successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fallback para SPA (envia index.html para qualquer rota que não seja /api)
app.use((req, res, next) => {
    if (!req.path.startsWith('/api')) {
        return res.sendFile(path.join(__dirname, 'index.html'));
    }
    next();
});

const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/folhapay';

// Connect to MongoDB
if (process.env.MONGODB_URI) {
    const maskedUri = process.env.MONGODB_URI.replace(/:([^@]+)@/, ':****@');
    console.log('DEBUG: Tentando conectar em:', maskedUri);
}

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
