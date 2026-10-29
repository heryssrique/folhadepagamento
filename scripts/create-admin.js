// Cria o primeiro administrador ou promove uma conta existente a admin (aprovada).
// Uso: node scripts/create-admin.js email@empresa.com "Nome Completo"
// Usa o MONGODB_URI do .env; a senha é pedida no terminal (só para conta nova).
require('dotenv').config({ quiet: true });
const readline = require('readline');
const mongoose = require('mongoose');
const User = require('../api/models/User');

function askHidden(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl._writeToOutput = s => { if (s.includes(question)) process.stdout.write(s); };
    return new Promise(resolve => rl.question(question, answer => { rl.close(); process.stdout.write('\n'); resolve(answer); }));
}

async function main() {
    const [email, name] = process.argv.slice(2);
    if (!email) {
        console.error('Uso: node scripts/create-admin.js email@empresa.com "Nome Completo"');
        process.exit(1);
    }
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI não definido no .env');
    await mongoose.connect(process.env.MONGODB_URI);

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
        await User.updateOne({ _id: existing._id }, { role: 'admin', status: 'approved', isActive: true });
        console.log(`Conta ${existing.email} promovida a administrador e aprovada.`);
    } else {
        if (!name) throw new Error('Conta nova: informe também o nome.');
        const password = await askHidden('Senha (mín. 8 caracteres): ');
        if (password.length < 8) throw new Error('Senha deve ter pelo menos 8 caracteres');
        await new User({ email, name, password, role: 'admin', status: 'approved' }).save();
        console.log(`Administrador ${email} criado.`);
    }
    await mongoose.disconnect();
}

main().catch(err => { console.error(err.message); process.exit(1); });
