const mongoose = require('mongoose');

// Cache de conexão para serverless (Vercel).
// Evita reconexões desnecessárias entre invocações.
let cached = global.mongoose;

if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
    if (cached.conn) return cached.conn;

    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) throw new Error('MONGODB_URI is not defined');

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 10,
            minPoolSize: 1
        };
        cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => mongoose);
    }

    cached.conn = await cached.promise;
    return cached.conn;
}

module.exports = { connectToDatabase };