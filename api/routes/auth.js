const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const User = require('../models/User');
const { generateToken, authenticateToken, authorizeRoles } = require('../middleware/auth');

// Mensagem de bloqueio para contas que não podem entrar (null = pode entrar).
function accessBlockReason(user) {
    if (!user.isActive) return 'Conta desativada. Fale com o administrador.';
    if (user.status === 'pending') return 'Cadastro aguardando aprovação do administrador.';
    if (user.status === 'rejected') return 'Cadastro não aprovado. Fale com o administrador.';
    return null;
}

// GET /api/auth/me - obtém dados do usuário logado (requer autenticação)
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        const blocked = accessBlockReason(user);
        if (blocked) return res.status(403).json({ error: blocked });
        res.json(user);
    } catch (error) {
        console.error('Erro ao buscar usuário:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// POST /api/auth/login - autentica um usuário
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validar campos obrigatórios
        if (!email || !password) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios' });
        }

        // Buscar usuário
        const user = await User.findOne({ email: String(email).toLowerCase().trim() });

        if (!user) {
            // Simular tempo de processamento para evitar user enumeration
            await new Promise(resolve => setTimeout(resolve, 500));
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // Verificar se a conta está bloqueada
        if (user.isLocked) {
            return res.status(403).json({ error: 'Conta temporariamente bloqueada. Tente novamente após 15 minutos.' });
        }

        // Verificar senha
        const isPasswordValid = await user.comparePassword(password);

        if (!isPasswordValid) {
            await user.incrementLoginAttempts();
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // Só depois da senha certa, para não revelar quais e-mails estão cadastrados
        const blocked = accessBlockReason(user);
        if (blocked) return res.status(403).json({ error: blocked });

        // Senha válida, resetar tentativas e gerar token
        await user.resetLoginAttempts();

        // Gerar token JWT
        const token = generateToken(user._id, user.email, user.role);

        // Retornar sucesso
        res.json({
            success: true,
            message: 'Login realizado com sucesso',
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// POST /api/auth/register - cria uma conta pendente de aprovação (sem token; perfil sempre "user")
router.post('/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        // Validar campos obrigatórios
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, senha e nome são obrigatórios' });
        }

        // Validar formato de email
        const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Formato de email inválido' });
        }

        // Validar força da senha
        if (password.length < 8) {
            return res.status(400).json({ error: 'Senha deve ter pelo menos 8 caracteres' });
        }

        // Verificar se email já existe
        const existingUser = await User.findOne({ email: String(email).toLowerCase().trim() });
        if (existingUser) {
            return res.status(409).json({ error: 'Este email já está cadastrado' });
        }

        // Criar novo usuário (password será hasheado automaticamente no pre-save)
        const newUser = new User({ email, password, name, role: 'user', status: 'pending' });
        await newUser.save();

        res.status(201).json({
            success: true,
            pending: true,
            message: 'Cadastro enviado. Aguarde a aprovação do administrador para entrar.'
        });
    } catch (error) {
        console.error('Erro no registro:', error);
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ error: validationErrors.join(', ') });
        }
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// GET /api/auth/users - lista as contas (pendentes primeiro); só admin
router.get('/users', authenticateToken, authorizeRoles('admin'), async (req, res) => {
    try {
        const users = await User.find({}, 'name email role status isActive createdAt lastLogin').sort({ createdAt: -1 });
        const order = { pending: 0, approved: 1, rejected: 2 };
        users.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
        res.json(users);
    } catch (error) {
        console.error('Erro ao listar usuários:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// PATCH /api/auth/users/:id - aprova ou recusa uma conta; só admin
router.patch('/users/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
    try {
        const { status } = req.body || {};
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'status deve ser "approved" ou "rejected"' });
        }
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        if (String(req.params.id) === String(req.user.userId)) {
            return res.status(400).json({ error: 'Você não pode alterar a própria conta' });
        }
        const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true, fields: 'name email role status isActive createdAt lastLogin' });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
        res.json(user);
    } catch (error) {
        console.error('Erro ao atualizar usuário:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// POST /api/auth/logout - revoga o token (nao implementado - tokens são stateless)
router.post('/logout', (req, res) => {
    // Logout JWT é stateless - a invalidação do token deve ser feita por blacklist ou rotação
    // Por enquanto, apenas retornar sucesso
    res.json({ success: true, message: 'Logout realizado com sucesso (token stateless)' });
});

module.exports = router;
