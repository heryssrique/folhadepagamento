const jwt = require('jsonwebtoken');

// Na Vercel o segredo é obrigatório: com o valor padrão (público no código) qualquer um forjaria um token.
if (!process.env.JWT_SECRET && (process.env.VERCEL || process.env.NODE_ENV === 'production')) {
    throw new Error('JWT_SECRET não definido');
}
const JWT_SECRET = process.env.JWT_SECRET || 'folhapay-dev-secret-local';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

/**
 * Middleware de autenticação JWT.
 * Verifica o token Bearer no cabeçalho Authorization.
 * Adiciona o usuário decodificado em req.user.
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token de acesso não fornecido' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expirado' });
            }
            return res.status(403).json({ error: 'Token inválido' });
        }
        req.user = user;
        // Conta recusada ou desativada depois do login perde o acesso já, sem esperar o token expirar.
        require('../models/User').findById(user.userId, 'status isActive').then(account => {
            if (!account || !account.isActive || account.status !== 'approved') {
                return res.status(401).json({ error: 'Conta sem acesso' });
            }
            next();
        }, next);
    });
}

/**
 * Middleware de autorização por role.
 * Exemplo: authorizeRoles('admin') ou authorizeRoles('admin', 'user')
 */
function authorizeRoles(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Acesso negado para este perfil' });
        }
        next();
    };
}

/**
 * Gera um token JWT para o usuário.
 */
function generateToken(userId, email, role) {
    return jwt.sign(
        { userId, email, role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

/**
 * Verifica se um token é válido e retorna o payload.
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
}

module.exports = {
    authenticateToken,
    authorizeRoles,
    generateToken,
    verifyToken,
    JWT_SECRET,
    JWT_EXPIRES_IN
};