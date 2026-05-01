const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// MongoDB Schema
const StateSchema = new mongoose.Schema({
    userId: { type: String, default: 'default' },
    data: Object
}, { timestamps: true });

const State = mongoose.models.State || mongoose.model('State', StateSchema);

// Connection logic for Serverless
let cachedDb = null;
async function connectToDatabase() {
    if (cachedDb) return cachedDb;
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) throw new Error('MONGODB_URI is not defined');
    
    cachedDb = await mongoose.connect(MONGODB_URI);
    return cachedDb;
}

// API Routes
app.get('/api/state', async (req, res) => {
    try {
        await connectToDatabase();
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
        await connectToDatabase();
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
        await connectToDatabase();
        await State.deleteOne({ userId: 'default' });
        res.json({ message: 'State reset successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Root route for API health check
app.get('/api', (req, res) => {
    res.json({ status: 'FolhaPay API is running' });
});

module.exports = app;
