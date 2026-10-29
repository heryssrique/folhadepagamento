const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 8
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    role: {
        type: String,
        enum: ['admin', 'user', 'viewer'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    // Cadastro aberto: a conta só entra depois que um admin aprova.
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    lastLogin: {
        type: Date
    },
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date
    }
}, {
    timestamps: true
});

// Índice para buscas por email
UserSchema.index({ email: 1 });

// Virtual para verificar se a conta está bloqueada
UserSchema.virtual('isLocked').get(function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Método para comparar senha
UserSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Método para incrementar tentativas de login falhadas
UserSchema.methods.incrementLoginAttempts = async function() {
    // Se já temos 5 tentativas e não está bloqueado, bloquear por 15 minutos
    if (this.failedLoginAttempts + 1 >= 5 && !this.isLocked) {
        this.lockUntil = Date.now() + 15 * 60 * 1000; // 15 minutos
    }
    this.failedLoginAttempts += 1;
    return this.save();
};

// Método para resetar tentativas de login
UserSchema.methods.resetLoginAttempts = async function() {
    this.failedLoginAttempts = 0;
    this.lockUntil = undefined;
    this.lastLogin = new Date();
    return this.save();
};

// Middleware para hash da senha antes de salvar
UserSchema.pre('save', async function() {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
});

// Não retornar senha em consultas
UserSchema.methods.toJSON = function() {
    const user = this.toObject();
    delete user.password;
    return user;
};

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);