/**
 * FolhaPay - Autenticação e Sessão
 *
 * Controla o acesso ao sistema: sem token válido, nenhuma tela de
 * folha de pagamento é renderizada. O token é um JWT emitido pelo
 * backend e carregado em todo request ao /api.
 */

const AUTH_TOKEN_KEY = 'folhapay:token';
const AUTH_USER_KEY = 'folhapay:user';

const auth = {
    token: null,
    user: null,
    _ready: false
};

// --- Armazenamento seguro do token ---
function authGetToken() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY); } catch (_) { return null; }
}

function authSetToken(token, user) {
    auth.token = token;
    auth.user = user || null;
    try {
        if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
        else localStorage.removeItem(AUTH_TOKEN_KEY);
        if (user) localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
        else localStorage.removeItem(AUTH_USER_KEY);
    } catch (_) { /* storage indisponível - segue apenas em memória */ }
}

function authClear() {
    auth.token = null;
    auth.user = null;
    try {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_USER_KEY);
    } catch (_) { /* ignore */ }
}

// --- Interceptor de fetch: anexa o token e trata token expirado ---
const nativeFetch = window.fetch ? window.fetch.bind(window) : null;
if (nativeFetch) {
    window.fetch = function (input, init) {
        const options = init || {};
        const url = typeof input === 'string' ? input : (input && input.url) || '';

        // Somente chamadas à API do FolhaPay recebem o token
        const isApiCall = String(url).includes('/api/');
        if (isApiCall && auth.token) {
            const headers = new Headers(options.headers || (input && input.headers) || {});
            if (!headers.has('Authorization')) {
                headers.set('Authorization', `Bearer ${auth.token}`);
            }
            options.headers = headers;
        }

        return nativeFetch(input, options).then(response => {
            if (isApiCall && response.status === 401 && auth.token) {
                // Token inválido/expirado: derruba a sessão e volta ao login
                handleUnauthorized();
            }
            return response;
        });
    };
}

function handleUnauthorized() {
    authClear();
    showLoginScreen('Sua sessão expirou. Entre novamente para continuar.');
}

// --- API de autenticação ---
async function authRequest(path, method, body) {
    const response = await fetch(`${API_URL}/auth${path}`, {
        method: method || 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
    });

    let payload = null;
    try { payload = await response.json(); } catch (_) { /* resposta sem corpo */ }

    if (!response.ok) {
        const message = (payload && payload.error) || 'Não foi possível concluir a operação.';
        throw new Error(message);
    }
    return payload;
}

function authLogin(email, password) {
    return authRequest('/login', 'POST', { email, password });
}

function authRegister(name, email, password) {
    return authRequest('/register', 'POST', { name, email, password });
}

function authLogout() {
    return authRequest('/logout', 'POST').catch(() => null);
}

// --- UI: alternar entre login e área autenticada ---
function showLoginScreen(message) {
    const overlay = document.getElementById('login-overlay');
    const main = document.querySelector('.main-content');
    const sidebar = document.getElementById('sidebar');

    if (overlay) overlay.style.display = 'flex';
    if (main) main.style.display = 'none';
    if (sidebar) sidebar.style.display = 'none';

    if (message) {
        const errorEl = document.getElementById('login-error');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
    }
}

function showAppScreen() {
    const overlay = document.getElementById('login-overlay');
    const main = document.querySelector('.main-content');
    const sidebar = document.getElementById('sidebar');

    if (overlay) overlay.style.display = 'none';
    // styles.css esconde .main-content até o login; '' voltaria ao display:none da folha de estilo.
    if (main) main.style.display = 'flex';
    if (sidebar) sidebar.style.display = '';

    renderUserBadge();
    const adminCard = document.getElementById('adminUsersCard');
    if (adminCard) adminCard.style.display = auth.user && auth.user.role === 'admin' ? '' : 'none';
    if (auth.user && auth.user.role === 'admin') loadAdminUsers();
}

// --- Admin: aprovação de cadastros ---
async function loadAdminUsers() {
    const tbody = document.getElementById('adminUsersList');
    if (!tbody) return;
    try {
        const users = await authRequest('/users', 'GET');
        const labels = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Recusado' };
        const pendentes = users.filter(u => u.status === 'pending').length;
        const badge = document.getElementById('adminUsersPending');
        if (badge) badge.textContent = pendentes ? `${pendentes} pendente(s)` : '';
        tbody.innerHTML = users.map(u => {
            const self = auth.user && String(auth.user.id || auth.user._id) === String(u._id);
            const acoes = self ? '<span style="color:var(--text-muted)">Você</span>' : [
                u.status !== 'approved' ? `<button class="btn btn-sm btn-primary" onclick="setUserStatus('${u._id}', 'approved')">Aprovar</button>` : '',
                u.status !== 'rejected' ? `<button class="btn btn-sm btn-danger" onclick="setUserStatus('${u._id}', 'rejected')">Recusar</button>` : ''
            ].join(' ');
            return `<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td>` +
                `<td>${u.role === 'admin' ? 'Administrador' : 'Usuário'}</td>` +
                `<td>${new Date(u.createdAt).toLocaleDateString('pt-BR')}</td>` +
                `<td style="text-align:center">${labels[u.status] || escapeHtml(u.status)}</td>` +
                `<td style="text-align:right">${acoes}</td></tr>`;
        }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Nenhuma conta cadastrada.</td></tr>';
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" style="color:#ef4444">${escapeHtml(err.message)}</td></tr>`;
    }
}

async function setUserStatus(id, status) {
    try {
        await authRequest(`/users/${encodeURIComponent(id)}`, 'PATCH', { status });
        showToast(status === 'approved' ? 'Cadastro aprovado.' : 'Cadastro recusado.', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
    loadAdminUsers();
}

// --- Identificação do usuário no topo ---
function renderUserBadge() {
    if (!auth.user) return;

    const nameEl = document.getElementById('authUserName');
    if (nameEl) nameEl.textContent = auth.user.name || auth.user.email;

    const roleEl = document.getElementById('authUserRole');
    if (roleEl) {
        const roles = { admin: 'Administrador', user: 'Usuário', viewer: 'Visualizador' };
        roleEl.textContent = roles[auth.user.role] || auth.user.role;
    }
}

// --- Inicialização: decide se abre no login ou direto no app ---
async function initAuth() {
    const storedToken = authGetToken();
    if (!storedToken) {
        showLoginScreen();
        auth._ready = true;
        return false;
    }

    auth.token = storedToken;
    try {
        const rawUser = localStorage.getItem(AUTH_USER_KEY);
        if (rawUser) auth.user = JSON.parse(rawUser);
    } catch (_) { /* ignore */ }

    // Valida o token contra o backend antes de liberar a interface
    try {
        const me = await authRequest('/me', 'GET');
        auth.user = me && me.email ? me : auth.user;
        authSetToken(auth.token, auth.user);
        showAppScreen();
        auth._ready = true;
        return true;
    } catch (err) {
        authClear();
        showLoginScreen('Sua sessão expirou ou é inválida. Entre novamente.');
        auth._ready = true;
        return false;
    }
}

// --- Handlers dos formulários ---
function setupAuthForms() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');

    const showError = (el, message, ok = false) => {
        if (!el) return;
        el.textContent = message || '';
        el.style.color = ok ? '#10b981' : '';
        el.style.display = message ? 'block' : 'none';
    };

    const switchMode = (mode) => {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === mode);
        });
        if (loginForm) loginForm.style.display = mode === 'login' ? '' : 'none';
        if (registerForm) registerForm.style.display = mode === 'register' ? '' : 'none';
        showError(loginError, '');
        showError(registerError, '');
    };

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchMode(btn.dataset.tab));
    });

    const switchToRegister = document.getElementById('switch-to-register');
    const switchToLogin = document.getElementById('switch-to-login');
    if (switchToRegister) switchToRegister.addEventListener('click', () => switchMode('register'));
    if (switchToLogin) switchToLogin.addEventListener('click', () => switchMode('login'));

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            showError(loginError, '');

            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            const button = loginForm.querySelector('button[type=submit]');
            if (button) button.disabled = true;

            try {
                const result = await authLogin(email, password);
                authSetToken(result.token, result.user);
                document.getElementById('login-password').value = '';
                showAppScreen();
                await bootstrapAuthenticatedApp();
            } catch (err) {
                showError(loginError, err.message);
            } finally {
                if (button) button.disabled = false;
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            showError(registerError, '');

            const name = document.getElementById('reg-name').value.trim();
            const email = document.getElementById('reg-email').value.trim();
            const password = document.getElementById('reg-password').value;
            const confirm = document.getElementById('reg-confirm').value;
            const button = registerForm.querySelector('button[type=submit]');

            if (password !== confirm) {
                showError(registerError, 'As senhas não conferem.');
                return;
            }
            if (button) button.disabled = true;

            try {
                // Conta nova fica pendente: volta ao login com o aviso, sem entrar.
                const result = await authRegister(name, email, password);
                registerForm.reset();
                switchMode('login');
                document.getElementById('login-email').value = email;
                showError(loginError, result.message, true);
            } catch (err) {
                showError(registerError, err.message);
            } finally {
                if (button) button.disabled = false;
            }
        });
    }

    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await authLogout();
            authClear();
            // Remove os dados locais do usuário anterior para impedir vazamento entre contas
            try {
                Object.keys(localStorage)
                    .filter(key => key.startsWith('folhapay_'))
                    .forEach(key => localStorage.removeItem(key));
            } catch (_) { /* ignore */ }
            showLoginScreen('Sessão encerrada com sucesso.');
        });
    }
}
