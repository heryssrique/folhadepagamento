const http = require('node:http');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
require('dotenv').config();

// O teste apaga o banco (dropDatabase). Só roda com um banco próprio de teste, nunca com o MONGODB_URI do .env.
if (!process.env.MONGODB_URI_TEST || !/_test(\?|$)/.test(process.env.MONGODB_URI_TEST)) {
    console.error('auth.test.js: defina MONGODB_URI_TEST apontando para um banco cujo nome termine em "_test".');
    process.exit(1);
}
process.env.MONGODB_URI = process.env.MONGODB_URI_TEST;

const server = require('./server');

const PORT = process.env.PORT || 3001;
const API_BASE_URL = `http://localhost:${PORT}/api`;

async function api(method, path, body = null, token = null) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
        }
    };

    let payload = null;
    if (body !== null) {
        payload = JSON.stringify(body);
        options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    return new Promise((resolve, reject) => {
        const req = http.request(`${API_BASE_URL}${path}`, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsedBody = null;
                try {
                    parsedBody = data ? JSON.parse(data) : null;
                } catch (e) {
                    parsedBody = data;
                }
                resolve({ status: res.statusCode, body: parsedBody });
            });
        });

        req.on('error', (e) => reject(e));
        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}

let registeredUserToken = null;

async function runTests() {
    console.log('Iniciando testes de autenticação...');

    try {
        await mongoose.connection.dropDatabase();
        console.log('Banco de dados de teste limpo.');
    } catch (dbError) {
        console.error('Falha ao limpar banco de dados:', dbError);
    }

    // Test 1: User Registration
    try {
        console.log('\n--- Teste 1: Registro de Usuário ---');
        const res = await api('POST', '/auth/register', {
            name: 'Test User',
            email: 'test@example.com',
            password: 'password123'
        });
        console.log('Resposta do Registro:', res);
        assert.strictEqual(res.status, 201, `Esperado status 201, recebeu ${res.status}. Detalhes: ${JSON.stringify(res.body)}`);
        assert.strictEqual(res.body.pending, true);
        assert.ok(!res.body.token, 'Cadastro pendente não recebe token');
        const pendente = await api('POST', '/auth/login', { email: 'test@example.com', password: 'password123' });
        assert.strictEqual(pendente.status, 403, 'Conta pendente não entra');
        // Aprovação do admin (feita direto no banco de teste)
        await mongoose.connection.collection('users').updateOne({ email: 'test@example.com' }, { $set: { status: 'approved' } });
        console.log('✓ Teste 1: Registro de Usuário: SUCESSO');
    } catch (error) {
        console.error('✗ Teste 1: Registro de Usuário FALHOU:', error.message);
        process.exit(1);
    }

    // Test 2: User Login
    try {
        console.log('\n--- Teste 2: Login de Usuário ---');
        const res = await api('POST', '/auth/login', {
            email: 'test@example.com',
            password: 'password123'
        });
        assert.strictEqual(res.status, 200, `Esperado status 200, recebeu ${res.status}. Detalhes: ${JSON.stringify(res.body)}`);
        assert.ok(res.body.token, 'Deve retornar um token JWT');
        registeredUserToken = res.body.token;
        console.log('✓ Teste 2: Login de Usuário: SUCESSO');
    } catch (error) {
        console.error('✗ Teste 2: Login de Usuário FALHOU:', error.message);
        process.exit(1);
    }

    // Test 3: Access protected route with valid token (/api/auth/me)
    try {
        console.log('\n--- Teste 3: Acesso a rota protegida com token válido ---');
        const res = await api('GET', '/auth/me', null, registeredUserToken);
        assert.strictEqual(res.status, 200, `Esperado status 200, recebeu ${res.status}`);
        assert.strictEqual(res.body.email, 'test@example.com');
        console.log('✓ Teste 3: Acesso a rota protegida (token válido): SUCESSO');
    } catch (error) {
        console.error('✗ Teste 3: Acesso a rota protegida (token válido) FALHOU:', error.message);
        process.exit(1);
    }

    console.log('\nTodos os testes de autenticação concluídos com sucesso!');
}

async function main() {
    try {
        await new Promise(resolve => {
            const checkServer = () => {
                http.get(`${API_BASE_URL.replace('/api', '')}/health`, (res) => {
                    if (res.statusCode === 200) {
                        console.log('Servidor está pronto para receber requisições.');
                        resolve();
                    } else {
                        setTimeout(checkServer, 100);
                    }
                }).on('error', () => {
                    setTimeout(checkServer, 100);
                });
            };
            checkServer();
        });

        await require('./api/config/db').connectToDatabase();
        await runTests();
    } catch (error) {
        console.error('Erro fatal durante a execução dos testes:', error);
        process.exit(1);
    } finally {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.dropDatabase();
            await mongoose.connection.close();
            console.log('Conexão MongoDB fechada.');
        }
        server.close(() => console.log('Servidor HTTP encerrado.'));
    }
}

main();
