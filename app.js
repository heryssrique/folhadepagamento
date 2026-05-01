/**
 * FolhaPay - App Logic
 * Version: 1.0.0
 */

// --- Constants & State ---
const state = {
    currentView: 'dashboard',
    competencia: '2026-04',
    files: {
        planilha: null,
        pdf: [],
        ponto: null,
        encargos: null
    },
    validations: [
        { id: 'cpf', title: 'Validação de CPFs', desc: 'Verifica se todos os CPFs são válidos e estão ativos.', status: 'pending', progress: 0 },
        { id: 'salmin', title: 'Salário Mínimo', desc: 'Verifica se há colaboradores com salário base inferior ao mínimo (R$ 1.412,00).', status: 'pending', progress: 0 },
        { id: 'inss', title: 'Cálculo de INSS', desc: 'Valida as alíquotas progressivas e o teto previdenciário.', status: 'pending', progress: 0 },
        { id: 'fgts', title: 'Base de FGTS', desc: 'Confere se a base de incidência do FGTS está correta.', status: 'pending', progress: 0 },
        { id: 'irrf', title: 'Retenção de IRRF', desc: 'Verifica a aplicação da tabela de Imposto de Renda e deduções.', status: 'pending', progress: 0 },
        { id: 'ponto', title: 'Divergência de Ponto', desc: 'Cruza horas extras da folha com o relatório de ponto.', status: 'pending', progress: 0 }
    ],
    fechamentoSteps: [
        { id: 1, title: 'Upload de Documentos', desc: 'Subir planilha de folha e relatórios PDF.', status: 'active' },
        { id: 2, title: 'Validação Automática', desc: 'Executar rotinas de conferência de dados.', status: 'locked' },
        { id: 3, title: 'Conciliação Bancária', desc: 'Verificar se o total líquido bate com o lote de pagamento.', status: 'locked' },
        { id: 4, title: 'Conferência de Encargos', desc: 'Validar Guias de FGTS e INSS.', status: 'locked' },
        { id: 5, title: 'Aprovação de Relatórios', desc: 'Gerar e revisar relatório final consolidado.', status: 'locked' },
        { id: 6, title: 'Fechamento Oficial', desc: 'Bloquear competência e arquivar documentos.', status: 'locked' }
    ],
    summary: {
        colaboradores: 45,
        bruto: 185600.50,
        descontos: 32450.20,
        liquido: 153150.30
    },
    empresas: [
        { 
            id: 1, 
            nome: 'Minha Empresa Ltda', 
            cnpj: '00.000.000/0001-00', 
            active: true,
            config: {
                salarioMinimo: 1412,
                tetoINSS: 7786.02,
                fgts: 8,
                rat: 2,
                fap: 1.00
            }
        }
    ],
    config: { // Será sincronizado com a empresa ativa
        empresa: 'Minha Empresa Ltda',
        cnpj: '00.000.000/0001-00',
        salarioMinimo: 1412,
        tetoINSS: 7786.02,
        fgts: 8,
        rat: 2,
        fap: 1.00
    },
    conciliacao: {
        inss: [
            { origem: 'Folha Pay', base: 452930.00, segurados: 48200.40, patronal: 90586.00, ratfap: 9058.60, terceiros: 26269.94, total: 174114.94 },
            { origem: 'DCTFWeb', base: 452930.00, segurados: 48200.40, patronal: 90586.00, ratfap: 9058.60, terceiros: 26269.94, total: 174114.94 }
        ],
        fgts: [
            { origem: 'Folha Pay', baseMensal: 382400.00, valorMensal: 30592.00, baseRescisoria: 70530.00, valorRescisorio: 5642.40, total: 36234.40 },
            { origem: 'FGTS Digital', baseMensal: 382400.00, valorMensal: 30592.00, baseRescisoria: 68000.00, valorRescisorio: 5440.00, total: 36032.00 }
        ],
        desligados: [
            { nome: 'Ana Paula Oliveira', data: '12/04/2026', tipo: 'Sem Justa Causa', base: 12450.00, multa: 4980.00, total: 17430.00, status: 'Recolhido' },
            { nome: 'Carlos Eduardo Santos', data: '15/04/2026', tipo: 'Acordo Art. 484-A', base: 8200.00, multa: 1640.00, total: 9840.00, status: 'Pendente' }
        ]
    }
};

// --- Persistence (MongoDB + Local Fallback) ---
const API_URL = 'http://localhost:3001/api';

async function saveState() {
    const data = {
        empresas: state.empresas,
        config: state.config,
        competencia: state.competencia
    };
    
    // Backup local
    localStorage.setItem('folhapay_db', JSON.stringify(data));

    // Persistência Online
    try {
        await fetch(`${API_URL}/state`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (e) {
        console.warn('Servidor offline. Dados salvos apenas localmente.');
    }
}

async function loadState() {
    // 1. Tenta carregar do MongoDB
    try {
        const response = await fetch(`${API_URL}/state`);
        const data = await response.json();
        if (data) {
            applyState(data);
            return;
        }
    } catch (e) {
        console.warn('Erro ao conectar ao MongoDB, usando dados locais.');
    }

    // 2. Fallback para LocalStorage
    const saved = localStorage.getItem('folhapay_db');
    if (saved) {
        try {
            applyState(JSON.parse(saved));
        } catch (e) {
            console.error('Erro ao ler LocalStorage:', e);
        }
    }
}

function applyState(data) {
    if (data.empresas) {
        state.empresas = data.empresas.map(emp => {
            if (!emp.config) {
                emp.config = {
                    salarioMinimo: 1412,
                    tetoINSS: 7786.02,
                    fgts: 8,
                    rat: 2,
                    fap: 1.00
                };
            }
            return emp;
        });
    }
    if (data.config) state.config = data.config;
    if (data.competencia) state.competencia = data.competencia;
}

document.addEventListener('DOMContentLoaded', async () => {
    // Carrega dados persistidos
    await loadState();
    
    // Inicializa a interface
    renderDashboard();
    renderFechamentoSteps();
    updateDashboard();

    // Listener global para navegação
    document.addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item');
        if (navItem && navItem.hasAttribute('data-view')) {
            e.preventDefault();
            const viewId = navItem.getAttribute('data-view');
            showView(viewId, navItem);
        }
    });
    
    console.log('FolhaPay: App Logic Initialized');
});

// --- View Navigation ---
function showView(viewId, element) {
    // Update breadcrumb
    const breadcrumbs = {
        'dashboard': 'Dashboard',
        'upload': 'Upload de Arquivos',
        'validacao': 'Validação da Folha',
        'fechamento': 'Fechamento da Folha',
        'relatorios': 'Relatórios',
        'configuracoes': 'Configurações',
        'conciliacao': 'Conciliação de Encargos'
    };
    
    const breadcrumbEl = document.getElementById('breadcrumb');
    if (breadcrumbEl) breadcrumbEl.innerText = breadcrumbs[viewId] || 'FolhaPay';

    // Update Nav Active State
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    
    // Se element não foi passado, tenta encontrar pelo data-view
    const navItem = element || document.querySelector(`.nav-item[data-view="${viewId}"]`);
    if (navItem) navItem.classList.add('active');

    // Update View Visibility
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) {
        targetView.classList.add('active');
        window.scrollTo(0, 0);
    }

    state.currentView = viewId;

    // View specific renders with error protection
    try {
        if (viewId === 'dashboard') renderDashboard();
        if (viewId === 'validacao') renderValidations();
        if (viewId === 'fechamento') renderFechamentoSteps();
        if (viewId === 'configuracoes') renderConfig();
        if (viewId === 'conciliacao') renderConciliacao();
    } catch (err) {
        console.error(`Erro ao renderizar view ${viewId}:`, err);
    }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// --- Upload Logic ---
function triggerFileInput(type) {
    document.getElementById(`input-${type}`).click();
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('dragover');
}

function handleDrop(e, type) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processUploadedFiles(files, type);
    }
}

function handleFileSelect(e, type) {
    const files = e.target.files;
    if (files.length > 0) {
        processUploadedFiles(files, type);
    }
}

function processUploadedFiles(fileList, type) {
    const files = Array.from(fileList);
    
    if (type === 'pdf') {
        state.files.pdf = [...state.files.pdf, ...files];
    } else {
        state.files[type] = files[0];
    }

    renderFilePreviews();
    checkUploadProgress();
    showToast(`Arquivo(s) carregado(s) com sucesso: ${type}`, 'success');
}

function renderFilePreviews() {
    // Update individual dropzone previews
    ['planilha', 'ponto', 'encargos'].forEach(type => {
        const file = state.files[type];
        const previewEl = document.getElementById(`preview-${type}`);
        const statusEl = document.getElementById(`status-${type}`);
        
        if (file) {
            previewEl.innerHTML = `
                <div class="file-item" style="margin-top:10px">
                    <span class="file-type-badge badge-${file.name.split('.').pop().toLowerCase()}">${file.name.split('.').pop()}</span>
                    <div class="file-info">
                        <div class="file-name">${file.name}</div>
                        <div class="file-meta">${(file.size / 1024).toFixed(1)} KB</div>
                    </div>
                </div>
            `;
            statusEl.style.display = 'block';
        } else {
            previewEl.innerHTML = '';
            statusEl.style.display = 'none';
        }
    });

    // Special case for PDF (multiple)
    const pdfPreview = document.getElementById('preview-pdf');
    const pdfStatus = document.getElementById('status-pdf');
    if (state.files.pdf.length > 0) {
        pdfPreview.innerHTML = `<p style="font-size:0.8rem; color:var(--accent-green); font-weight:600; margin-top:10px">${state.files.pdf.length} arquivo(s) selecionado(s)</p>`;
        pdfStatus.style.display = 'block';
    } else {
        pdfPreview.innerHTML = '';
        pdfStatus.style.display = 'none';
    }

    // Update global list in upload view
    const allFilesList = document.getElementById('allFilesList');
    const clearBtn = document.getElementById('clearAllBtn');
    
    let html = '';
    const allFileItems = [];
    if (state.files.planilha) allFileItems.push({ type: 'Planilha', file: state.files.planilha, key: 'planilha' });
    state.files.pdf.forEach((f, idx) => allFileItems.push({ type: 'PDF', file: f, key: 'pdf', index: idx }));
    if (state.files.ponto) allFileItems.push({ type: 'Ponto', file: state.files.ponto, key: 'ponto' });
    if (state.files.encargos) allFileItems.push({ type: 'Encargos', file: state.files.encargos, key: 'encargos' });

    if (allFileItems.length === 0) {
        html = `
            <div class="empty-state-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <p>Nenhum arquivo carregado ainda</p>
            </div>
        `;
        clearBtn.style.display = 'none';
    } else {
        html = '<div class="files-list">';
        allFileItems.forEach(item => {
            const ext = item.file.name.split('.').pop().toLowerCase();
            html += `
                <div class="file-item">
                    <span class="file-type-badge badge-${ext}">${ext}</span>
                    <div class="file-info">
                        <div class="file-name">${item.file.name}</div>
                        <div class="file-meta">${item.type} • ${(item.file.size / 1024).toFixed(1)} KB</div>
                    </div>
                    <button class="file-remove" onclick="removeFile('${item.key}', ${item.index !== undefined ? item.index : null})">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            `;
        });
        html += '</div>';
        clearBtn.style.display = 'block';
    }
    allFilesList.innerHTML = html;

    // Sync to dashboard
    renderDashboardFiles();
}

function removeFile(key, index) {
    if (key === 'pdf' && index !== null) {
        state.files.pdf.splice(index, 1);
    } else {
        state.files[key] = null;
    }
    renderFilePreviews();
    checkUploadProgress();
}

function clearAllFiles() {
    state.files = { planilha: null, pdf: [], ponto: null, encargos: null };
    renderFilePreviews();
    checkUploadProgress();
}

function checkUploadProgress() {
    const hasPlanilha = !!state.files.planilha;
    const processBtn = document.getElementById('processBtn');
    processBtn.disabled = !hasPlanilha;

    // Update status badge in sidebar
    const uploadBadge = document.getElementById('uploadBadge');
    if (!hasPlanilha) {
        uploadBadge.style.display = 'block';
    } else {
        uploadBadge.style.display = 'none';
    }

    // Update Topbar Status
    const statusPill = document.getElementById('statusPill');
    const statusDot = statusPill.querySelector('.status-dot');
    const statusText = document.getElementById('statusText');

    if (hasPlanilha) {
        statusDot.className = 'status-dot green';
        statusText.innerText = 'Arquivos Prontos';
    } else {
        statusDot.className = 'status-dot';
        statusText.innerText = 'Aguardando Arquivos';
    }
}

function processFiles() {
    showLoading('Lendo arquivos e extraindo dados...');
    
    // Simulate processing delay
    setTimeout(() => {
        // Update Mock Stats
        state.summary.colaboradores = 124;
        state.summary.bruto = 452930.00;
        state.summary.descontos = 112450.40;
        state.summary.liquido = 340479.60;
        
        updateKPIs();
        
        // Advance step
        updateStep(1, 'done');
        updateStep(2, 'active');
        
        hideLoading();
        showToast('Arquivos processados com sucesso!', 'success');
        showView('validacao', document.querySelector('[data-view=validacao]'));
        runAllValidations();
    }, 2000);
}

// --- Validation Logic ---
function runAllValidations() {
    state.validations.forEach(v => {
        v.status = 'pending';
        v.progress = 0;
    });
    renderValidations();

    let completed = 0;
    state.validations.forEach((v, index) => {
        setTimeout(() => {
            simulateValidation(v.id);
            completed++;
            if (completed === state.validations.length) {
                finalizeValuation();
            }
        }, 500 * (index + 1) + Math.random() * 1000);
    });
}

function simulateValidation(id) {
    const v = state.validations.find(val => val.id === id);
    v.progress = 100;
    
    // Random outcomes for demo
    const rand = Math.random();
    if (rand > 0.8) {
        v.status = 'error';
    } else if (rand > 0.6) {
        v.status = 'warning';
    } else {
        v.status = 'ok';
    }
    
    renderValidations();
    updateDashboardAlerts();
}

function renderValidations() {
    const grid = document.getElementById('validationsGrid');
    if (!grid) return;

    grid.innerHTML = state.validations.map(v => {
        const statusClass = `val-${v.status}`;
        let statusIcon = '';
        let statusText = '';

        if (v.status === 'ok') {
            statusIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>';
            statusText = 'Consistente';
        } else if (v.status === 'error') {
            statusIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
            statusText = 'Erro Crítico';
        } else if (v.status === 'warning') {
            statusIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
            statusText = 'Alerta';
        } else {
            statusIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
            statusText = 'Pendente';
        }

        return `
            <div class="validation-card ${statusClass}">
                <div class="val-header">
                    <div class="val-icon">${statusIcon}</div>
                    <div class="val-title">${v.title}</div>
                    <div class="val-status"><span class="badge badge-${v.status === 'ok' ? 'success' : (v.status === 'error' ? 'danger' : 'warning')}">${statusText}</span></div>
                </div>
                <div class="val-desc">${v.desc}</div>
                <div class="val-detail">${v.status === 'pending' ? 'Aguardando processamento...' : 'Verificação concluída.'}</div>
                <div class="val-progress">
                    <div class="val-progress-bar" style="width: ${v.progress}%"></div>
                </div>
            </div>
        `;
    }).join('');

    // Update Badge
    const alertCount = state.validations.filter(v => v.status === 'error' || v.status === 'warning').length;
    const badge = document.getElementById('validBadge');
    badge.innerText = alertCount;
    badge.style.display = alertCount > 0 ? 'block' : 'none';
}

function finalizeValuation() {
    const hasErrors = state.validations.some(v => v.status === 'error');
    if (!hasErrors) {
        updateStep(2, 'done');
        updateStep(3, 'active');
        showToast('Validação concluída com sucesso!', 'success');
    } else {
        updateStep(2, 'error');
        showToast('Validação concluída com erros. Verifique os alertas.', 'error');
    }
    renderFechamentoSteps();
}

// --- Closing Logic ---
function renderFechamentoSteps() {
    const list = document.getElementById('fechamentoSteps');
    if (!list) return;

    list.innerHTML = state.fechamentoSteps.map(s => {
        let statusClass = `fech-${s.status}`;
        let actionBtn = '';
        
        if (s.status === 'active') {
            actionBtn = `<button class="btn btn-sm btn-primary" onclick="completeStep(${s.id})">Executar Etapa</button>`;
        } else if (s.status === 'done') {
            actionBtn = `<span style="color:var(--accent-green); font-weight:600">✓ Concluído</span>`;
        }

        return `
            <div class="fech-step ${statusClass}">
                <div class="fech-num">${s.id}</div>
                <div class="fech-info">
                    <div class="fech-title">${s.title}</div>
                    <div class="fech-desc">${s.desc}</div>
                </div>
                <div class="fech-action">${actionBtn}</div>
            </div>
        `;
    }).join('');

    // Check if can finish
    const allDone = state.fechamentoSteps.every(s => s.status === 'done' || s.id === 6);
    const lastActive = state.fechamentoSteps[5].status === 'active';
    document.getElementById('btnFecharFolha').disabled = !(allDone && lastActive);
}

function updateStep(id, status) {
    const step = state.fechamentoSteps.find(s => s.id === id);
    if (step) step.status = status;
    renderFechamentoSteps();
    renderDashboardProgress();
}

function completeStep(id) {
    showLoading(`Concluindo etapa: ${state.fechamentoSteps.find(s => s.id === id).title}...`);
    
    setTimeout(() => {
        updateStep(id, 'done');
        const next = state.fechamentoSteps.find(s => s.id === id + 1);
        if (next) updateStep(next.id, 'active');
        
        hideLoading();
        
        if (id === 5) {
            document.getElementById('resumoFechamento').style.display = 'block';
            renderResumo();
        }
    }, 1000);
}

function fecharFolha() {
    if (confirm('Deseja realmente oficializar o fechamento desta competência? Esta ação é irreversível e bloqueará alterações.')) {
        showLoading('Oficializando fechamento e gerando arquivo de remessa...');
        setTimeout(() => {
            updateStep(6, 'done');
            hideLoading();
            showToast('Folha fechada com sucesso!', 'success');
            
            // Final state
            document.getElementById('fechBadge').innerText = 'Fechada';
            document.getElementById('fechBadge').className = 'badge badge-success';
            
            // Show report automatically
            showView('relatorios', document.querySelector('[data-view=relatorios]'));
            generateReport('resumo');
        }, 3000);
    }
}

function renderResumo() {
    const grid = document.getElementById('resumoGrid');
    grid.innerHTML = `
        <div class="resumo-item">
            <div class="resumo-label">Total Colaboradores</div>
            <div class="resumo-value">${state.summary.colaboradores}</div>
        </div>
        <div class="resumo-item">
            <div class="resumo-label">Total Proventos</div>
            <div class="resumo-value">${formatCurrency(state.summary.bruto)}</div>
        </div>
        <div class="resumo-item">
            <div class="resumo-label">Total Descontos</div>
            <div class="resumo-value">${formatCurrency(state.summary.descontos)}</div>
        </div>
        <div class="resumo-item">
            <div class="resumo-label">Custo Total Empresa</div>
            <div class="resumo-value">${formatCurrency(state.summary.bruto * 1.28)}</div>
        </div>
    `;
}

// --- Dashboard Functions ---
function renderDashboard() {
    renderDashboardProgress();
    renderDashboardFiles();
    updateDashboardAlerts();
}

function renderDashboardProgress() {
    const stepsList = document.getElementById('stepsList');
    if (!stepsList) return;

    stepsList.innerHTML = state.fechamentoSteps.map(s => `
        <div class="step-item ${s.status === 'done' ? 'done' : (s.status === 'error' ? 'error' : '')}">
            <div class="step-dot">${s.status === 'done' ? '✓' : s.id}</div>
            <span>${s.title}</span>
        </div>
    `).join('');

    const completed = state.fechamentoSteps.filter(s => s.status === 'done').length;
    const total = state.fechamentoSteps.length;
    const pct = (completed / total) * 100;
    
    document.getElementById('progressBar').style.width = `${pct}%`;
    document.getElementById('progressText').innerText = `${completed} / ${total}`;
}

function renderDashboardFiles() {
    const dashList = document.getElementById('filesListDash');
    if (!dashList) return;

    const files = [];
    if (state.files.planilha) files.push(state.files.planilha);
    state.files.pdf.slice(0, 2).forEach(f => files.push(f));
    if (state.files.ponto) files.push(state.files.ponto);

    if (files.length === 0) {
        dashList.innerHTML = '<div class="empty-state-sm"><p>Nenhum arquivo</p></div>';
        return;
    }

    dashList.innerHTML = files.map(f => `
        <div class="file-item">
            <span class="file-type-badge badge-${f.name.split('.').pop().toLowerCase()}">${f.name.split('.').pop()}</span>
            <div class="file-info">
                <div class="file-name" style="font-size:0.75rem">${f.name}</div>
            </div>
        </div>
    `).join('');
}

function updateKPIs() {
    animateValue('kpiColaboradores', 0, state.summary.colaboradores);
    animateValue('kpiBruto', 0, state.summary.bruto, true);
    animateValue('kpiDescontos', 0, state.summary.descontos, true);
    animateValue('kpiLiquido', 0, state.summary.liquido, true);
    
    const compEl = document.getElementById('dashComp');
    if (compEl) compEl.innerText = getCompetenciaExtenso();
    
    const empEl = document.getElementById('dashEmpresaName');
    if (empEl) empEl.innerText = state.config.empresa;
}

function updateDashboard() {
    renderDashboard();
    updateKPIs();
    
    // Sync Quick Selectors (Styled)
    const quickEmp = document.getElementById('quickEmpresaSelect');
    const quickEmpDisp = document.getElementById('quickEmpresaDisplay');
    if (quickEmp) {
        quickEmp.innerHTML = state.empresas.map(emp => `
            <option value="${emp.id}" ${emp.active ? 'selected' : ''}>${emp.nome}</option>
        `).join('');
        if (quickEmpDisp) quickEmpDisp.innerText = state.config.empresa;
    }

    const quickCompDisp = document.getElementById('quickCompDisplay');
    if (quickCompDisp) {
        const parts = state.competencia.split('-');
        const month = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][parseInt(parts[1]) - 1];
        quickCompDisp.innerText = `${month}/${parts[0]}`;
    }
}

function updateQuickCompetencia(value) {
    state.competencia = value;
    showToast(`Competência alterada para ${getCompetenciaExtenso()}`, 'info');
    updateDashboard();
    
    // Sync settings input if open
    const configMes = document.getElementById('configMes');
    if (configMes) configMes.value = value;

    saveState();
}

// --- Custom Month Picker Logic ---
let pickerYear = 2026;

function toggleMonthPicker(e) {
    e.stopPropagation();
    const picker = document.getElementById('customMonthPicker');
    const isVisible = picker.style.display === 'block';
    
    // Close other pickers or menus if any
    
    if (isVisible) {
        picker.style.display = 'none';
    } else {
        picker.style.display = 'block';
        const parts = state.competencia.split('-');
        pickerYear = parseInt(parts[0]);
        renderMonthGrid();
    }
}

function renderMonthGrid() {
    const grid = document.getElementById('monthGrid');
    const yearDisplay = document.getElementById('pickerYear');
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const parts = state.competencia.split('-');
    const currentMonth = parseInt(parts[1]) - 1;
    const currentYear = parseInt(parts[0]);

    yearDisplay.innerText = pickerYear;
    
    grid.innerHTML = months.map((m, index) => {
        const isActive = (index === currentMonth && pickerYear === currentYear);
        return `
            <div class="month-item ${isActive ? 'active' : ''}" 
                 onclick="selectPickerMonth(${index}, event)">
                ${m}
            </div>
        `;
    }).join('');
}

function changePickerYear(delta, e) {
    e.stopPropagation();
    pickerYear += delta;
    renderMonthGrid();
}

function selectPickerMonth(monthIndex, e) {
    e.stopPropagation();
    const month = (monthIndex + 1).toString().padStart(2, '0');
    const newValue = `${pickerYear}-${month}`;
    
    updateQuickCompetencia(newValue);
    document.getElementById('customMonthPicker').style.display = 'none';
}

// Global click to close picker
document.addEventListener('click', (e) => {
    const picker = document.getElementById('customMonthPicker');
    if (picker && !e.target.closest('.competencia-badge')) {
        picker.style.display = 'none';
    }
});

function updateDashboardAlerts() {
    const alertsCard = document.getElementById('alertsCard');
    const alertsList = document.getElementById('alertsList');
    const alertCountEl = document.getElementById('alertCount');
    
    const errors = state.validations.filter(v => v.status === 'error' || v.status === 'warning');
    
    if (errors.length > 0) {
        alertsCard.style.display = 'block';
        alertCountEl.innerText = errors.length;
        
        alertsList.innerHTML = errors.map(e => `
            <div class="alert-item alert-${e.status === 'error' ? 'error' : 'warning'}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="margin-top:2px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div>
                    <strong>${e.title}:</strong> ${e.desc}
                    <div style="margin-top:4px"><button class="btn btn-sm btn-secondary" onclick="showValidationDetails('${e.id}')">Ver Detalhes</button></div>
                </div>
            </div>
        `).join('');
    } else {
        alertsCard.style.display = 'none';
    }
}

// --- Report Generation ---
function generateReport(type) {
    const preview = document.getElementById('reportPreview');
    const content = document.getElementById('reportContent');
    const title = document.getElementById('previewTitle');
    
    preview.style.display = 'block';
    
    const titles = {
        'resumo': 'Resumo Consolidado da Folha',
        'validacao': 'Relatório de Validação e Auditoria',
        'encargos': 'Darf INSS / Guia FGTS Digital',
        'holerites': 'Contracheques da Competência',
        'divergencias': 'Inconsistências Identificadas',
        'historico': 'Log de Atividades RH'
    };
    
    title.innerText = titles[type];
    
    let html = `
        <div style="display:flex; justify-content:space-between; border-bottom:2px solid #333; padding-bottom:15px; margin-bottom:20px">
            <div>
                <h2 style="margin:0">FolhaPay Report</h2>
                <p style="margin:5px 0; color:#666">Competência: ${getCompetenciaExtenso()}</p>
            </div>
            <div style="text-align:right">
                <p style="margin:0; font-weight:700">${state.config.empresa}</p>
                <p style="margin:5px 0; color:#666">CNPJ: ${state.config.cnpj}</p>
            </div>
        </div>
    `;
    
    if (type === 'resumo') {
        html += `
            <table style="width:100%; border-collapse:collapse">
                <tr style="background:#f8fafc"><th style="text-align:left; padding:10px; border:1px solid #ddd">Rubrica</th><th style="padding:10px; border:1px solid #ddd; text-align:right">Colaboradores</th><th style="padding:10px; border:1px solid #ddd; text-align:right">Valor Total</th></tr>
                <tr><td style="padding:10px; border:1px solid #ddd">001 - Salário Base</td><td style="text-align:right; padding:10px; border:1px solid #ddd">124</td><td style="text-align:right; padding:10px; border:1px solid #ddd">${formatCurrency(412000.00)}</td></tr>
                <tr><td style="padding:10px; border:1px solid #ddd">005 - Horas Extras 50%</td><td style="text-align:right; padding:10px; border:1px solid #ddd">32</td><td style="text-align:right; padding:10px; border:1px solid #ddd">${formatCurrency(18500.50)}</td></tr>
                <tr><td style="padding:10px; border:1px solid #ddd">012 - Gratificações</td><td style="text-align:right; padding:10px; border:1px solid #ddd">15</td><td style="text-align:right; padding:10px; border:1px solid #ddd">${formatCurrency(22429.50)}</td></tr>
                <tr style="font-weight:700"><td style="padding:10px; border:1px solid #ddd; background:#f0f9ff">TOTAL BRUTO</td><td style="text-align:right; padding:10px; border:1px solid #ddd; background:#f0f9ff">-</td><td style="text-align:right; padding:10px; border:1px solid #ddd; background:#f0f9ff">${formatCurrency(state.summary.bruto)}</td></tr>
                <tr><td style="padding:10px; border:1px solid #ddd">501 - INSS Retido</td><td style="text-align:right; padding:10px; border:1px solid #ddd">124</td><td style="text-align:right; padding:10px; border:1px solid #ddd">${formatCurrency(48200.40)}</td></tr>
                <tr><td style="padding:10px; border:1px solid #ddd">505 - IRRF Retido</td><td style="text-align:right; padding:10px; border:1px solid #ddd">88</td><td style="text-align:right; padding:10px; border:1px solid #ddd">${formatCurrency(64250.00)}</td></tr>
                <tr style="font-weight:700"><td style="padding:10px; border:1px solid #ddd; background:#fff1f2">TOTAL LÍQUIDO</td><td style="text-align:right; padding:10px; border:1px solid #ddd; background:#fff1f2">-</td><td style="text-align:right; padding:10px; border:1px solid #ddd; background:#fff1f2">${formatCurrency(state.summary.liquido)}</td></tr>
            </table>
        `;
    } else {
        html += `<div style="text-align:center; padding:50px; color:#999"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="60" style="margin-bottom:10px"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>Dados do relatório de ${type} sendo carregados...</p></div>`;
    }
    
    content.innerHTML = html;
    window.scrollTo({ top: content.offsetTop, behavior: 'smooth' });
}

function printReport() {
    window.print();
}

function downloadReport() {
    showToast('Iniciando exportação para PDF...', 'info');
    setTimeout(() => {
        showToast('Download concluído!', 'success');
    }, 1500);
}

// --- Configuration Logic ---
function renderConfig() {
    const fields = {
        'configEmpresa': state.config.empresa,
        'configCNPJ': state.config.cnpj,
        'configSalMin': state.config.salarioMinimo,
        'configTetoINSS': state.config.tetoINSS,
        'configFGTS': state.config.fgts,
        'configRAT': state.config.rat,
        'configFAP': state.config.fap,
        'configMes': state.competencia
    };

    for (const [id, value] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    }

    renderEmpresas();
}

function renderEmpresas() {
    const list = document.getElementById('empresasList');
    if (!list) return;

    list.innerHTML = state.empresas.map(emp => `
        <tr>
            <td><div style="font-weight:700">${emp.nome}</div></td>
            <td style="font-family:'JetBrains Mono'">${emp.cnpj}</td>
            <td style="text-align:center">
                <span class="badge ${emp.active ? 'badge-success' : 'badge-neutral'}">
                    ${emp.active ? 'Ativa' : 'Inativa'}
                </span>
            </td>
            <td style="text-align:right">
                <div style="display:flex; gap:8px; justify-content:flex-end">
                    ${!emp.active ? `<button class="btn btn-sm btn-secondary" onclick="activateEmpresa(${emp.id})">Ativar</button>` : ''}
                    <button class="btn btn-sm btn-ghost" onclick="deleteEmpresa(${emp.id})" ${emp.active && state.empresas.length > 1 ? 'disabled' : ''}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function showAddEmpresaModal() {
    const modal = document.getElementById('modal');
    const content = document.getElementById('modalContent');
    const title = document.getElementById('modalTitle');
    
    title.innerText = 'Cadastrar Nova Empresa';
    
    content.innerHTML = `
        <div class="form-group">
            <label class="form-label">Nome da Empresa</label>
            <input type="text" class="form-input" id="newEmpresaNome" placeholder="Ex: Nova Empresa S.A." />
        </div>
        <div class="form-group">
            <label class="form-label">CNPJ</label>
            <input type="text" class="form-input" id="newEmpresaCNPJ" placeholder="00.000.000/0000-00" />
        </div>
        <div style="margin-top:20px; display:flex; gap:10px; justify-content:flex-end">
            <button class="btn btn-secondary" onclick="document.getElementById('modal').style.display='none'">Cancelar</button>
            <button class="btn btn-primary" onclick="addEmpresa()">Salvar Empresa</button>
        </div>
    `;
    
    modal.style.display = 'flex';
}

function addEmpresa() {
    const nome = document.getElementById('newEmpresaNome').value;
    const cnpj = document.getElementById('newEmpresaCNPJ').value;

    if (!nome || !cnpj) {
        showToast('Preencha todos os campos!', 'error');
        return;
    }

    const newEmp = {
        id: Date.now(),
        nome,
        cnpj,
        active: false,
        config: {
            salarioMinimo: 1412,
            tetoINSS: 7786.02,
            fgts: 8,
            rat: 2,
            fap: 1.00
        }
    };

    state.empresas.push(newEmp);
    document.getElementById('modal').style.display = 'none';
    showToast('Empresa cadastrada com sucesso!', 'success');
    renderEmpresas();
    saveState();
}

function activateEmpresa(id) {
    state.empresas.forEach(emp => {
        emp.active = emp.id === id;
        if (emp.active) {
            // Copia as configurações da empresa para o config ativo
            state.config = { ...emp.config };
            state.config.empresa = emp.nome;
            state.config.cnpj = emp.cnpj;
        }
    });

    showToast('Empresa ativa alterada!', 'success');
    renderConfig();
    updateDashboard(); // Updates dash title and info
    saveState();
}

function deleteEmpresa(id) {
    const emp = state.empresas.find(e => e.id === id);
    if (emp && emp.active) {
        showToast('Não é possível excluir a empresa ativa!', 'error');
        return;
    }

    if (confirm('Deseja realmente excluir esta empresa?')) {
        state.empresas = state.empresas.filter(e => e.id !== id);
        showToast('Empresa excluída!', 'success');
        renderEmpresas();
        saveState();
    }
}

// --- Conciliação Logic ---
function renderConciliacao() {
    renderINSS();
    renderFGTS();
    renderDesligados();
}

function renderINSS() {
    const body = document.getElementById('bodyINSS');
    const f = state.conciliacao.inss[0];
    const g = state.conciliacao.inss[1];
    
    const metrics = [
        { label: 'Base de Cálculo', key: 'base' },
        { label: 'Segurados Retido', key: 'segurados' },
        { label: 'Patronal (CPP)', key: 'patronal' },
        { label: 'RAT + FAP', key: 'ratfap' },
        { label: 'Terceiros', key: 'terceiros' },
        { label: 'Total Geral INSS', key: 'total' }
    ];
    
    body.innerHTML = metrics.map(m => {
        const valF = f[m.key];
        const valG = g[m.key];
        const diff = valF - valG;
        const isMatch = Math.abs(diff) < 0.01;
        
        return `
            <tr>
                <td class="row-label">${m.label}</td>
                <td style="text-align:right" class="val-mono">${formatCurrency(valF)}</td>
                <td style="text-align:right" class="val-mono">${formatCurrency(valG)}</td>
                <td style="text-align:right" class="val-mono diff-cell ${isMatch ? 'diff-none' : 'diff-alert'}">${formatCurrency(diff)}</td>
                <td style="text-align:center"><span class="status-check ${isMatch ? 'ok' : 'error'}">${isMatch ? '✓' : '!'}</span></td>
            </tr>
        `;
    }).join('');
    
    const totalDiff = Math.abs(f.total - g.total);
    document.getElementById('statusINSS').className = totalDiff < 0.01 ? 'badge badge-success' : 'badge badge-warning';
    document.getElementById('statusINSS').innerText = totalDiff < 0.01 ? 'Conferido' : 'Divergência';
}

function renderFGTS() {
    const body = document.getElementById('bodyFGTS');
    const f = state.conciliacao.fgts[0];
    const g = state.conciliacao.fgts[1];
    
    const metrics = [
        { label: 'Base FGTS Mensal', key: 'baseMensal' },
        { label: 'Valor FGTS Mensal', key: 'valorMensal' },
        { label: 'Base FGTS Rescisório', key: 'baseRescisoria' },
        { label: 'Valor FGTS Rescisório', key: 'valorRescisorio' },
        { label: 'Total a Recolher (GFD)', key: 'total' }
    ];
    
    body.innerHTML = metrics.map(m => {
        const valF = f[m.key];
        const valG = g[m.key];
        const diff = valF - valG;
        const isMatch = Math.abs(diff) < 0.01;
        
        return `
            <tr>
                <td class="row-label">${m.label}</td>
                <td style="text-align:right" class="val-mono">${formatCurrency(valF)}</td>
                <td style="text-align:right" class="val-mono">${formatCurrency(valG)}</td>
                <td style="text-align:right" class="val-mono diff-cell ${isMatch ? 'diff-none' : 'diff-alert'}">${formatCurrency(diff)}</td>
                <td style="text-align:center"><span class="status-check ${isMatch ? 'ok' : 'error'}">${isMatch ? '✓' : '!'}</span></td>
            </tr>
        `;
    }).join('');
    
    const totalDiff = Math.abs(f.total - g.total);
    document.getElementById('statusFGTS').className = totalDiff < 0.01 ? 'badge badge-success' : 'badge badge-warning';
    document.getElementById('statusFGTS').innerText = totalDiff < 0.01 ? 'Conferido' : 'Divergência';
}

function renderDesligados() {
    const body = document.getElementById('bodyDesligados');
    body.innerHTML = state.conciliacao.desligados.map(d => `
        <tr>
            <td>
                <div style="font-weight:700; color:var(--text-primary)">${d.nome}</div>
            </td>
            <td>${d.data}</td>
            <td><span style="font-size:0.75rem; color:var(--text-muted)">${d.tipo}</span></td>
            <td style="text-align:right; font-family:'JetBrains Mono'">${formatCurrency(d.base)}</td>
            <td style="text-align:right; font-family:'JetBrains Mono'">${formatCurrency(d.multa)}</td>
            <td style="text-align:right; font-family:'JetBrains Mono'; font-weight:700">${formatCurrency(d.total)}</td>
            <td><span class="badge ${d.status === 'Recolhido' ? 'badge-success' : 'badge-warning'}">${d.status}</span></td>
        </tr>
    `).join('');
}

function importGovernmentData() {
    showLoading('Conectando ao eSocial / DCTFWeb / FGTS Digital...');
    setTimeout(() => {
        hideLoading();
        showToast('Dados do governo sincronizados com sucesso!', 'success');
        renderConciliacao();
    }, 2500);
}

function exportConciliacao() {
    showToast('Gerando planilha de conciliação...', 'info');
    setTimeout(() => {
        showToast('Exportação concluída!', 'success');
    }, 1500);
}

function updateCompetencia() {
    state.competencia = document.getElementById('configMes').value;
    updateDashboard();
    saveState();
}

function saveConfig() {
    showLoading('Salvando configurações...');
    
    // Update state from DOM
    state.config = {
        empresa: document.getElementById('configEmpresa').value,
        cnpj: document.getElementById('configCNPJ').value,
        salarioMinimo: parseFloat(document.getElementById('configSalMin').value),
        tetoINSS: parseFloat(document.getElementById('configTetoINSS').value),
        fgts: parseFloat(document.getElementById('configFGTS').value),
        rat: parseFloat(document.getElementById('configRAT').value),
        fap: parseFloat(document.getElementById('configFAP').value)
    };

    setTimeout(() => {
        hideLoading();
        showToast('Configurações salvas com sucesso!', 'success');
        
        // Salva as configurações de volta no cadastro da empresa ativa
        const activeEmp = state.empresas.find(e => e.active);
        if (activeEmp) {
            activeEmp.nome = state.config.empresa;
            activeEmp.cnpj = state.config.cnpj;
            activeEmp.config = {
                salarioMinimo: state.config.salarioMinimo,
                tetoINSS: state.config.tetoINSS,
                fgts: state.config.fgts,
                rat: state.config.rat,
                fap: state.config.fap
            };
        }

        showView('dashboard', document.querySelector('[data-view=dashboard]'));
        updateDashboard();
        saveState();
    }, 800);
}

// --- UI Helpers ---
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function showLoading(text) {
    const overlay = document.getElementById('loadingOverlay');
    document.getElementById('loadingText').innerText = text || 'Processando...';
    overlay.style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

function closeModal(e) {
    if (e.target === document.getElementById('modal')) {
        document.getElementById('modal').style.display = 'none';
    }
}

function showValidationDetails(id) {
    const v = state.validations.find(val => val.id === id);
    const modal = document.getElementById('modal');
    const content = document.getElementById('modalContent');
    const title = document.getElementById('modalTitle');
    
    title.innerText = `Detalhes: ${v.title}`;
    
    let detailsHtml = `
        <p style="margin-bottom:15px; color:var(--text-secondary)">${v.desc}</p>
        <div style="background:rgba(0,0,0,0.2); border-radius:8px; padding:15px">
            <h4 style="margin-bottom:10px; font-size:0.9rem">Ocorrências Encontradas:</h4>
            <ul style="padding-left:20px; font-size:0.85rem; line-height:1.6">
    `;
    
    if (id === 'cpf') {
        detailsHtml += `
            <li>CPF 123.***.***-00 - Nome: João Silva - Status: Inválido no eSocial</li>
            <li>CPF 456.***.***-11 - Nome: Maria Souza - Status: Divergência Cadastral</li>
        `;
    } else if (id === 'salmin') {
        detailsHtml += `
            <li>Matrícula 889 - Colaborador estagiário abaixo do piso (Verificar CCT)</li>
            <li>Matrícula 1002 - Salário base R$ 1.320,00 (Abaixo do mínimo vigente)</li>
        `;
    } else {
        detailsHtml += `<li>Divergências matemáticas detectadas entre a planilha base e as guias de encargos.</li>`;
    }
    
    detailsHtml += `
            </ul>
        </div>
        <div style="margin-top:20px; display:flex; gap:10px">
            <button class="btn btn-primary" onclick="window.alert('Abrindo editor de correção...')">Corrigir Dados</button>
            <button class="btn btn-secondary" onclick="document.getElementById('modal').style.display='none'">Fechar</button>
        </div>
    `;
    
    content.innerHTML = detailsHtml;
    modal.style.display = 'flex';
}

// --- Utils ---
function formatCurrency(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function getCompetenciaExtenso() {
    const parts = state.competencia.split('-');
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${months[parseInt(parts[1]) - 1]} de ${parts[0]}`;
}

function animateValue(id, start, end, isCurrency = false) {
    const obj = document.getElementById(id);
    if (!obj) return;
    
    const duration = 1000;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const currentVal = progress * (end - start) + start;
        obj.innerHTML = isCurrency ? formatCurrency(currentVal) : Math.floor(currentVal);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

function excluirDadosCompetencia() {
    if (confirm('Atenção: Isso excluirá todos os arquivos e dados processados da competência atual e você começará do zero. Deseja continuar?')) {
        showLoading('Limpando dados da competência...');
        
        setTimeout(() => {
            // Reset files
            state.files = { planilha: null, pdf: [], ponto: null, encargos: null };
            
            // Reset validations
            state.validations.forEach(v => {
                v.status = 'pending';
                v.progress = 0;
            });
            
            // Reset fechamentoSteps
            state.fechamentoSteps.forEach(s => {
                if (s.id === 1) s.status = 'active';
                else s.status = 'locked';
            });
            
            // Reset summary
            state.summary = {
                colaboradores: 0,
                bruto: 0,
                descontos: 0,
                liquido: 0
            };
            
            // Reset conciliação
            state.conciliacao.inss.forEach(i => {
                i.base = 0; i.segurados = 0; i.patronal = 0; i.ratfap = 0; i.terceiros = 0; i.total = 0;
            });
            state.conciliacao.fgts.forEach(f => {
                f.baseMensal = 0; f.valorMensal = 0; f.baseRescisoria = 0; f.valorRescisorio = 0; f.total = 0;
            });
            state.conciliacao.desligados = [];
            
            // Reset badges
            const fechBadge = document.getElementById('fechBadge');
            if (fechBadge) {
                fechBadge.innerText = 'Em Andamento';
                fechBadge.className = 'badge badge-warning';
            }
            
            hideLoading();
            showToast('Dados da competência foram excluídos.', 'success');
            
            // Re-render components
            renderFilePreviews();
            checkUploadProgress();
            renderDashboard();
            renderValidations();
            renderFechamentoSteps();
            updateKPIs();
            renderConciliacao();
            
            // Disable fechamento button if it was enabled
            const btnFecharFolha = document.getElementById('btnFecharFolha');
            if (btnFecharFolha) btnFecharFolha.disabled = true;
            
            // Go back to dashboard
            showView('dashboard', document.querySelector('[data-view=dashboard]'));
            
            saveState();
        }, 1000);
    }
}
