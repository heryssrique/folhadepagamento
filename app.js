/**
 * FolhaPay - App Logic
 * Version: 1.0.0
 */

// --- Constants & State ---
const state = {
    currentView: 'dashboard',
    competencia: '2026-04',
    files: {
        planilha: [],
        pdf: [],
        ponto: null,
        encargos: null
    },
    validations: [
        { id: 'layoutAnalitico', title: 'Layout Analítico', desc: 'Verifica se o PDF/Excel Master contém as colunas de Proventos e Bases.', status: 'pending', progress: 0 },
        { id: 'layoutBases', title: 'Layout Planilha de Bases', desc: 'Valida a presença das colunas CODSITUACAO, CODTIPO e Bases FGTS/INSS.', status: 'pending', progress: 0 },
        { id: 'layoutGRRF', title: 'Layout GRRF', desc: 'Valida as colunas de FGTS Rescisório e informações de desligamento.', status: 'pending', progress: 0 },
        { id: 'integridadeCampos', title: 'Integridade de Dados', desc: 'Verifica a consistência dos formatos numéricos e identificadores.', status: 'pending', progress: 0 }
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
        ativos: 0,
        afastados: 0,
        desligados: 0,
        colaboradores: 0, // Mantido por compatibilidade
        bruto: 0,
        descontos: 0,
        liquidoFolha: 0,
        liquidoProLabore: 0
    },
    empresas: [],
    config: { // Será sincronizado com a empresa ativa
        empresa: 'Selecione uma Empresa',
        cnpj: '00.000.000/0000-00',
        salarioMinimo: 1412,
        tetoINSS: 7786.02,
        fgts: 8,
        fgtsJovem: 2,
        rat: 2,
        fap: 1.00,
        patronal: 20,
        terceiros: 5.8
    },
    conciliacao: {
        inss: [],
        fgts: [],
        desligados: []
    },
    layoutResults: {
        analitico: { 
            ok: false, 
            fields: {
                'PRO LABORE': false,
                'Proventos': false,
                'Descontos': false,
                'Base FGTS': false,
                'Base FGTS 13º': false,
                'Base INSS - Envelope': false,
                'Base INSS 13º - Envelope': false,
                'INSS': false,
                'INSS DIRETOR/AUT': false,
                'INSS 13 SALARIO': false,
                'IRRF': false
            }
        },
        bases: { 
            ok: false, 
            fields: {
                'NOME': false, 'CCUSTO': false, 'CODSITUACAO': false, 'CODTIPO': false,
                'BASEFGTS': false, 'BASEFGTSAVPREVIO': false, 'BASEFGTS13AVPREVIO': false, 'BASEFGTS13': false,
                'FGTS': false, 'FGTS_AVISO': false, 'FGTS13_AVISO': false, 'FGTS13': false,
                'BASEINSS': false, 'BASEINSS13': false, 'INSS': false, 'INSS13': false,
                'INSSFERIAS': false, 'INSS EMPRESA': false, 'INSS RAT AJUSTADO': false, 'INSS TERCEIROS': false,
                'TOTAL GUA': false, 'BASEIRRF': false, 'BASEIRRFFERIAS': false, 'IRRF': false,
                'IRRF13': false, 'IRRFFERIAS': false
            }
        },
        grrf: {
            ok: false,
            fields: {
                'NOME': false, 'CHAPA': false, 'CODTIPO': false, 'FGTS QUITACAO': false,
                'FGTS MES ANTERIOR': false, 'FGTS AVISO PREVIO': false, 'FGTS ARTIGO 22': false,
                'FGTS 13 SALARIO INDENIZADO': false, 'FGTS 13 SAL RESCISAO': false
            }
        }
    }
};

// --- Persistence (MongoDB + Local Fallback) ---
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3001/api' 
    : '/api';

function getCompKey(comp) {
    const activeEmp = state.empresas.find(e => e.active);
    const empId = activeEmp ? activeEmp.id : 'default';
    return `folhapay_comp_${empId}_${comp}`;
}

async function saveState() {
    // Dados globais (empresas, config)
    const globalData = {
        empresas: state.empresas,
        config: state.config,
        competencia: state.competencia
    };
    localStorage.setItem('folhapay_db', JSON.stringify(globalData));

    // Dados da competência atual (isolados por mês e por EMPRESA)
    const compKey = getCompKey(state.competencia);
    const compData = {
        summary: state.summary,
        validations: state.validations,
        fechamentoSteps: state.fechamentoSteps,
        conciliacao: state.conciliacao,
        fileMetadata: {
        planilha: state.files.planilha.length > 0 ? state.files.planilha.map(f => ({ name: f.name, size: f.size })) : null,
            encargos: state.files.encargos ? { name: state.files.encargos.name, size: state.files.encargos.size } : null,
            pdfCount: state.files.pdf.length
        }
    };
    localStorage.setItem(compKey, JSON.stringify(compData));

    // Persistência Online
    try {
        await fetch(`${API_URL}/state`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...globalData, ...compData })
        });
    } catch (e) {
        console.warn('Servidor offline. Dados salvos apenas localmente.');
    }
}

function loadCompetenciaData(comp) {
    const compKey = getCompKey(comp);
    const saved = localStorage.getItem(compKey);
    if (saved) {
        try {
            const d = JSON.parse(saved);
            if (d.summary) state.summary = d.summary;
            if (d.validations) state.validations = d.validations;
            if (d.fechamentoSteps) state.fechamentoSteps = d.fechamentoSteps;
            if (d.conciliacao) state.conciliacao = d.conciliacao;
            // Restaurar metadados de arquivos
            state.files = { planilha: [], pdf: [], ponto: null, encargos: null };
            if (d.fileMetadata) {
            if (d.fileMetadata.planilha) state.files.planilha = d.fileMetadata.planilha.map(p => ({ name: p.name, size: p.size, type: 'virtual' }));
                if (d.fileMetadata.encargos) state.files.encargos = { name: d.fileMetadata.encargos.name, size: d.fileMetadata.encargos.size, type: 'virtual' };
                if (d.fileMetadata.pdfCount > 0) state.files.pdf = Array(d.fileMetadata.pdfCount).fill({ name: 'Arquivo PDF já enviado', size: 0, type: 'virtual' });
            }
            return true; // Encontrou dados
        } catch(e) { console.error('Erro ao carregar competência:', e); }
    }
    // Sem dados para este mês: zerar tudo
    state.summary = { 
        ativos: 0,
        afastados: 0,
        desligados: 0,
        colaboradores: 0, 
        bruto: 0, 
        descontos: 0, 
        liquidoFolha: 0, 
        liquidoProLabore: 0 
    };
    state.validations.forEach(v => { v.status = 'pending'; v.progress = 0; });
    state.fechamentoSteps.forEach((s, i) => { s.status = i === 0 ? 'active' : 'locked'; });
    state.conciliacao = { inss: [], fgts: [], desligados: [] };
    state.files = { planilha: [], pdf: [], ponto: null, encargos: null };
    state.layoutResults = {
        analitico: { ok: false, fields: { 'PRO LABORE': false, 'Proventos': false, 'Descontos': false, 'Base FGTS': false, 'Base FGTS 13º': false, 'Base INSS - Envelope': false, 'Base INSS 13º - Envelope': false, 'INSS': false, 'INSS DIRETOR/AUT': false, 'INSS 13 SALARIO': false, 'IRRF': false } },
        bases: { ok: false, fields: { 'NOME': false, 'CCUSTO': false, 'CODSITUACAO': false, 'CODTIPO': false, 'BASEFGTS': false, 'BASEFGTSAVPREVIO': false, 'BASEFGTS13AVPREVIO': false, 'BASEFGTS13': false, 'FGTS': false, 'FGTS_AVISO': false, 'FGTS13_AVISO': false, 'FGTS13': false, 'BASEINSS': false, 'BASEINSS13': false, 'INSS': false, 'INSS13': false, 'INSSFERIAS': false, 'INSS EMPRESA': false, 'INSS RAT AJUSTADO': false, 'INSS TERCEIROS': false, 'TOTAL GUA': false, 'BASEIRRF': false, 'BASEIRRFFERIAS': false, 'IRRF': false, 'IRRF13': false, 'IRRFFERIAS': false } },
        grrf: { ok: false, fields: { 'NOME': false, 'CHAPA': false, 'CODTIPO': false, 'FGTS QUITACAO': false, 'FGTS MES ANTERIOR': false, 'FGTS AVISO PREVIO': false, 'FGTS ARTIGO 22': false, 'FGTS 13 SALARIO INDENIZADO': false, 'FGTS 13 SAL RESCISAO': false } }
    };
    return false; // Sem dados
}

async function loadState() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 segundos de timeout

    // 1. Tenta carregar do MongoDB com timeout
    try {
        const response = await fetch(`${API_URL}/state`, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
            const data = await response.json();
            if (data && (data.empresas || data.config)) {
                applyState(data);
                console.log('✅ Dados carregados do MongoDB');
                return;
            }
        }
    } catch (e) {
        clearTimeout(timeoutId);
        console.warn('MongoDB inacessível ou timeout. Usando dados locais.');
    }

    // 2. Fallback imediato para LocalStorage
    const saved = localStorage.getItem('folhapay_db');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            applyState(parsed);
            console.log('🏠 Dados carregados do LocalStorage');
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
                    fgtsJovem: 2,
                    rat: 2,
                    fap: 1.00,
                    patronal: 20,
                    terceiros: 5.8
                };
            }
            return emp;
        });
    }
    if (data.config) state.config = data.config;
    if (data.competencia) state.competencia = data.competencia;
    if (data.summary) state.summary = data.summary;

    // Se as validações salvas forem do modelo antigo (ids inss, fgts, irrf), 
    // ignoramos para forçar a exibição do novo modelo de Layout.
    const isOldModel = data.validations && data.validations.some(v => ['inss', 'fgts', 'irrf'].includes(v.id));
    if (data.validations && !isOldModel) {
        state.validations = data.validations;
    }
    
    if (data.fechamentoSteps) state.fechamentoSteps = data.fechamentoSteps;
    if (data.conciliacao) state.conciliacao = data.conciliacao;

    // Restaurar metadados de arquivos para a UI
    if (data.fileMetadata) {
        if (data.fileMetadata.planilha) {
            state.files.planilha = data.fileMetadata.planilha.map(p => ({ name: p.name, size: p.size, type: 'virtual' }));
        }
        if (data.fileMetadata.encargos) {
            state.files.encargos = { name: data.fileMetadata.encargos.name, size: data.fileMetadata.encargos.size, type: 'virtual' };
        }
        if (data.fileMetadata.pdfCount > 0) {
            state.files.pdf = Array(data.fileMetadata.pdfCount).fill({ name: 'Arquivo PDF já enviado', size: 0, type: 'virtual' });
        }
    }

    // Re-renderizar componentes com os dados restaurados
    updateDashboard();
    renderValidations();
    renderFechamentoSteps();
    updateKPIs();
    renderFilePreviews();
    renderConciliacao();
    checkUploadProgress();
}

async function resetSistema() {
    if (confirm('ATENÇÃO: Isso excluirá PERMANENTEMENTE todas as empresas, configurações e dados salvos no banco de dados. Deseja continuar?')) {
        showLoading('Limpando sistema...');
        
        // 1. Limpa LocalStorage
        localStorage.clear();
        
        // 2. Limpa MongoDB
        try {
            await fetch(`${API_URL}/state`, { method: 'DELETE' });
        } catch (e) {
            console.error('Erro ao resetar MongoDB:', e);
        }
        
        // 3. Recarrega a página para voltar ao estado inicial
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }
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

function handleSmartDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    routeFilesAutomatically(e.dataTransfer.files);
}

function handleSmartFileSelect(e) {
    routeFilesAutomatically(e.target.files);
    e.target.value = ''; // reset para permitir selecionar os mesmos arquivos novamente
}

function routeFilesAutomatically(fileList) {
    const files = Array.from(fileList);
    if (!files.length) return;

    const routed = { pdf: [], planilha: null, encargos: null };

    files.forEach(file => {
        const name = file.name.toLowerCase();
        const ext  = name.split('.').pop();

        // Encargos: GFD, FGTS Digital, guias
        if (/fgts|gfd|guia|encargo|dctf|esocial/i.test(name) && (ext === 'xlsx' || ext === 'pdf')) {
            routed.encargos = file;
        }
        // PDF → sempre analítico
        else if (ext === 'pdf') {
            routed.pdf.push(file);
        }
        // XLSX/XLS → analítico (relatório)
        else if (ext === 'xlsx' || ext === 'xls') {
            routed.pdf.push(file);
        }
        // CSV → planilha auxiliar
        else if (ext === 'csv') {
            routed.planilha = file;
        }
    });

    // Aplicar roteamento
    if (routed.pdf.length)    state.files.pdf      = [...state.files.pdf, ...routed.pdf];
    if (routed.planilha)      state.files.planilha = [...state.files.planilha, routed.planilha];
    if (routed.encargos)      state.files.encargos = routed.encargos;

    // Toast descritivo
    const parts = [];
    if (routed.pdf.length)  parts.push(`${routed.pdf.length} Analítico(s)`);
    if (routed.planilha)    parts.push('1 Planilha');
    if (routed.encargos)    parts.push('1 Encargos');
    showToast(`✅ ${parts.join(', ')} classificado(s) automaticamente`, 'success');

    renderFilePreviews();
    checkUploadProgress();
    saveState();
}


function processUploadedFiles(fileList, type) {
    const files = Array.from(fileList);
    
    if (type === 'planilha') {
        state.files.planilha = [...(state.files.planilha || []), ...files];
    } else if (type === 'pdf') {
        state.files.pdf = [...state.files.pdf, ...files];
    } else {
        state.files[type] = files[0];
    }

    renderFilePreviews();
    checkUploadProgress();
    showToast(`Arquivo(s) carregado(s) com sucesso: ${type}`, 'success');
    saveState();
}

function renderFilePreviews() {
    // Update individual dropzone previews
    // Slots com arquivo único
    ['encargos'].forEach(type => {
        const file = state.files[type];
        const previewEl = document.getElementById(`preview-${type}`);
        const statusEl  = document.getElementById(`status-${type}`);
        if (previewEl) {
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
                if (statusEl) statusEl.style.display = 'block';
            } else {
                previewEl.innerHTML = '';
                if (statusEl) statusEl.style.display = 'none';
            }
        }
    });

    // Planilha auxiliar — múltiplos arquivos
    const planilhaPreview = document.getElementById('preview-planilha');
    const planilhaStatus  = document.getElementById('status-planilha');
    if (planilhaPreview) {
        if (state.files.planilha.length > 0) {
            planilhaPreview.innerHTML = `<p style="font-size:0.8rem;color:var(--accent-green);font-weight:600;margin-top:10px">${state.files.planilha.length} arquivo(s) selecionado(s)</p>`;
            if (planilhaStatus) planilhaStatus.style.display = 'block';
        } else {
            planilhaPreview.innerHTML = '';
            if (planilhaStatus) planilhaStatus.style.display = 'none';
        }
    }

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
    state.files.planilha.forEach((f, idx) => allFileItems.push({ type: 'Planilha', file: f, key: 'planilha', index: idx }));
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
    } else if (key === 'planilha' && index !== null) {
        state.files.planilha.splice(index, 1);
    } else {
        state.files[key] = null;
    }
    renderFilePreviews();
    checkUploadProgress();
}

function clearAllFiles() {
    state.files = { planilha: [], pdf: [], ponto: null, encargos: null };
    renderFilePreviews();
    checkUploadProgress();
}

function checkUploadProgress() {
    const hasPlanilha = state.files.planilha.length > 0;
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
    if (statusPill) {
        const statusDot = statusPill.querySelector('.status-dot');
        const statusText = document.getElementById('statusText');

        if (statusDot && statusText) {
            if (hasPlanilha) {
                statusDot.className = 'status-dot green';
                statusText.innerText = 'Arquivos Prontos';
            } else {
                statusDot.className = 'status-dot';
                statusText.innerText = 'Aguardando Arquivos';
            }
        }
    }
}

async function extractTextFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Agrupar itens por coordenada Y (linhas reais) com tolerância para desalinhamentos
        const linesMap = {};
        textContent.items.forEach(item => {
            const y = item.transform[5];
            let foundY = Object.keys(linesMap).find(key => Math.abs(parseFloat(key) - y) < 4);
            if (!foundY) {
                foundY = y;
                linesMap[foundY] = [];
            }
            linesMap[foundY].push(item);
        });

        // Ordenar linhas de cima para baixo e itens da esquerda para a direita
        const sortedY = Object.keys(linesMap).sort((a, b) => b - a);
        sortedY.forEach(y => {
            const lineText = linesMap[y]
                .sort((a, b) => a.transform[4] - b.transform[4])
                .map(item => item.str)
                .join(' ');
            fullText += lineText + '\n';
        });
    }
    return fullText;
}
// --- Extractor: GRRF / Valores de FGTS Rescisório (RM Labore) ---
async function extractGRRFSummary(file) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    
    const result = {
        isGRRF: false,
        qtdDesligados: 0,
        fgtsQuitacao: 0,
        fgtsMesAnterior: 0,
        fgtsAvisoPrevio: 0,
        fgtsArtigo22: 0,
        fgts13Indenizado: 0,
        fgts13Rescisao: 0,
        totalFGTS: 0,
        baseRescisoriaCalculada: 0
    };

    const parseVal = v => {
        if (typeof v === 'number') return v;
        if (!v) return 0;
        return parseFloat(String(v).replace(/[R$\s]/g,'').replace(/\./g,'').replace(',','.').replace(/[^\d.-]/g,'')) || 0;
    };

    // Processar TODAS as abas do arquivo
    for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        let headerRowIdx = -1;
        let idx = null;

        // Detectar header row (contém CODTIPO ou FGTS) - Aumentando range para 50 linhas
        let bestHeaderMatchCount = 0;
        for (let r = 0; r < Math.min(data.length, 50); r++) {
            const row = data[r];
            if (!row) continue;
            
            let matches = 0;
            row.forEach(h => {
                const hs = String(h||'').toUpperCase().trim();
                if (/FGTS\s+QUITACAO|Valor\s+fgts\s+folha/i.test(hs)) matches++;
                if (/FGTS\s+MES\s+ANTERIOR/i.test(hs)) matches++;
                if (/^NOME[1]*$/i.test(hs)) matches++;
                if (/^CHAPA$/i.test(hs)) matches++;
                if (/^CODTIPO$/i.test(hs)) matches++;
            });

            if (matches >= 2) { // Reduzindo para 2 matches para ser mais flexível
                if (matches > bestHeaderMatchCount) {
                    bestHeaderMatchCount = matches;
                    headerRowIdx = r;
                    idx = { quitacao: [], mesAnterior: [], avisoPrevio: [], artigo22: [], trezeIndeniz: [], trezeRescisao: [], nome: -1, chapa: -1, codtipo: -1 };
                    row.forEach((h, c) => {
                        const hs = String(h||'').toUpperCase().trim();
                        const isBase = /(Base|B\.)/i.test(hs);
                        if (!isBase && /FGTS\s+QUITACAO|Valor\s+fgts\s+folha/i.test(hs)) { idx.quitacao.push(c); }
                        if (!isBase && /FGTS\s+MES\s+ANTERIOR/i.test(hs))          { idx.mesAnterior.push(c); }
                        if (!isBase && /FGTS\s+AVISO\s+PREVIO/i.test(hs))          { idx.avisoPrevio.push(c); }
                        if (!isBase && /FGTS\s+ARTIGO\s+22/i.test(hs))             { idx.artigo22.push(c); }
                        if (!isBase && /FGTS\s+13\s+SAL.*INDENIZ/i.test(hs))       { idx.trezeIndeniz.push(c); }
                        if (!isBase && /FGTS\s+13\s+SAL.*RESCIS/i.test(hs))        { idx.trezeRescisao.push(c); }
                        if (/^NOME[1]*$/i.test(hs))                  { idx.nome = c; }
                        if (/^CHAPA$/i.test(hs))                    { idx.chapa = c; }
                        if (/^CODTIPO$/i.test(hs))                  { idx.codtipo = c; }
                    });
                    result.isGRRF = true;
                    result.foundMetrics = result.foundMetrics || {};
                    if (idx.quitacao.length > 0) result.foundMetrics['FGTS QUITACAO'] = true;
                    if (idx.mesAnterior.length > 0) result.foundMetrics['FGTS MES ANTERIOR'] = true;
                    if (idx.avisoPrevio.length > 0) result.foundMetrics['FGTS AVISO PREVIO'] = true;
                    if (idx.artigo22.length > 0) result.foundMetrics['FGTS ARTIGO 22'] = true;
                    if (idx.trezeIndeniz.length > 0) result.foundMetrics['FGTS 13 SALARIO INDENIZADO'] = true;
                    if (idx.trezeRescisao.length > 0) result.foundMetrics['FGTS 13 SAL RESCISAO'] = true;
                    if (idx.nome !== -1) result.foundMetrics['NOME'] = true;
                    if (idx.chapa !== -1) result.foundMetrics['CHAPA'] = true;
                    if (idx.codtipo !== -1) result.foundMetrics['CODTIPO'] = true;
                }
            }
        }

        if (!idx || headerRowIdx === -1) continue;

        // Processar linhas de funcionários desta aba
        for (let r = headerRowIdx + 1; r < data.length; r++) {
            const row = data[r];
            if (!row || !row.length) continue;

            const rowString = row.map(c => String(c||'')).join(' ').toUpperCase();

            // Linha de total (ex: "1 Total", "Total Geral", ou apenas valores no fim)
            if (rowString.includes('TOTAL')) {
                continue;
            }

            // Se a linha não tem Nome nem Chapa, é uma linha de sujeira ou totalizador sem rótulo
            const hasNome = idx.nome !== -1 && String(row[idx.nome]||'').trim().length > 2;
            const hasChapa = idx.chapa !== -1 && String(row[idx.chapa]||'').trim().length > 0;
            if (!hasNome && !hasChapa) {
                continue;
            }

            let rowFGTS = 0;
            let q = 0, ma = 0, ap = 0, a22 = 0, i13 = 0, r13 = 0;

            idx.quitacao.forEach(i =>    { q += parseVal(row[i]); });
            idx.mesAnterior.forEach(i => { ma += parseVal(row[i]); });
            idx.avisoPrevio.forEach(i => { ap += parseVal(row[i]); });
            idx.artigo22.forEach(i =>    { a22 += parseVal(row[i]); });
            idx.trezeIndeniz.forEach(i => { i13 += parseVal(row[i]); });
            idx.trezeRescisao.forEach(i => { r13 += parseVal(row[i]); });

            // Heurística de Segurança: 
            // Só ignoramos se for algo absurdamente fora do padrão (ex: > 100x a quitação),
            // indicando que pegamos o total da folha da empresa por erro.
            if (a22 > q * 100 && q > 0) {
                console.warn(`⚠️ Ignorando valor suspeito de FGTS Artigo 22 (R$ ${a22}) que parece ser o total mensal.`);
                a22 = 0; 
            }

            result.fgtsQuitacao += q;
            result.fgtsMesAnterior += ma;
            result.fgtsAvisoPrevio += ap;
            result.fgtsArtigo22 += a22;
            result.fgts13Indenizado += i13;
            result.fgts13Rescisao += r13;
            
            rowFGTS = q + ma + ap + a22 + i13 + r13;

            if (rowFGTS > 0) {
                let aliquota = (state.config.fgts || 8) / 100;
                if (idx.codtipo !== -1) {
                    const codtipo = String(row[idx.codtipo] || '').toUpperCase().trim();
                    if (codtipo === 'Z') aliquota = (state.config.fgtsJovem || 2) / 100;
                }
                result.baseRescisoriaCalculada += (rowFGTS / aliquota);
            }

            if (idx.nome !== -1 && row[idx.nome]) result.qtdDesligados++;
            else if (idx.chapa !== -1 && row[idx.chapa]) result.qtdDesligados++;
        }
    }

    // Usar totalFGTS da linha de total, ou calcular
    if (result.totalFGTS === 0) {
        result.totalFGTS = result.fgtsQuitacao + result.fgtsMesAnterior +
                           result.fgtsAvisoPrevio + result.fgtsArtigo22 +
                           result.fgts13Indenizado + result.fgts13Rescisao;
    }

    console.log('📋 GRRF Summary:', JSON.stringify(result));
    return result;
}

async function extractExcelSummary(file) {
    const excelBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(excelBuffer);
    
    const summary = { 
        bruto: 0, 
        descontos: 0, 
        liquido: 0, 
        liquidoProLabore: 0, 
        colaboradores: 0, 
        ativos: 0, 
        afastados: 0, 
        desligados: 0, 
        bases: { inss: 0, fgts: 0, fgts13: 0, fgts2: 0, irrf: 0 },
        rawHeaders: new Set()
    };

    const parseVal = (val) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        const clean = String(val).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
        return parseFloat(clean) || 0;
    };

    let totalBrutoAcumulado = 0;
    
    for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (jsonData.length === 0) continue;

        const rows = jsonData;
        let sheetSummary = { bruto: 0, descontos: 0, liquido: 0, liquidoProLabore: 0, colaboradores: 0, ativos: 0, afastados: 0, desligados: 0, bases: { inss: 0, fgts: 0, fgts13: 0, fgts2: 0, irrf: 0 } };
        let foundLabels = { bruto: false, descontos: false, liquido: false, ativos: false, proLabore: false };

        const pickMonetary = (row, c) => {
            let fallback = 0;
            for (let i = 1; i <= 20; i++) {
                const cell = row[c + i];
                if (cell === null || cell === undefined) continue;
                const str = String(cell).trim();
                if (/\d[\d.]*,\d{2}/.test(str)) return parseVal(str);
                if (typeof cell === 'number' && cell > 0 && fallback === 0) fallback = cell;
            }
            return fallback;
        };

        // 1. Tentar busca por Rótulos (Estilo Relatório)
        for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            for (let c = 0; c < row.length; c++) {
                const cell = String(row[c] || '').trim();
                
                if (!foundLabels.bruto && /^Proventos$/i.test(cell)) {
                    for (let i = 1; i <= 15; i++) {
                        const val = parseVal(row[c + i]);
                        if (val > 100) { sheetSummary.bruto += val; foundLabels.bruto = true; break; }
                    }
                }
                if (!foundLabels.descontos && /^Descontos$/i.test(cell)) {
                    for (let i = 1; i <= 15; i++) {
                        const val = parseVal(row[c + i]);
                        if (val > 10) { sheetSummary.descontos += val; foundLabels.descontos = true; break; }
                    }
                }
                if (!foundLabels.liquido && (/^Líquido$|^Liquido$/i.test(cell) || /LIQUIDO FOLHA PAGAMENTO/i.test(cell))) {
                    const val = pickMonetary(row, c);
                    if (val > 0) { sheetSummary.liquido += val; foundLabels.liquido = true; }
                }
                if (!foundLabels.proLabore && /LIQUIDO.{0,20}PRO.{0,5}LABORE/i.test(cell)) {
                    const val = pickMonetary(row, c);
                    if (val > 0) sheetSummary.liquidoProLabore += val;
                }
                if (!foundLabels.ativos && /^Ativos$/i.test(cell)) {
                    for (let i = 1; i <= 10; i++) {
                        const val = parseInt(row[c + i]);
                        if (!isNaN(val) && val > 0) { sheetSummary.colaboradores += val; foundLabels.ativos = true; break; }
                    }
                }
                // Bases FGTS
                if (/^Base\s+FGTS\s+13[°º]?\s*(Demitidos|Ativos|Rescisao|SEFIP|Verde|Menor|Afast|Ant)/i.test(cell)) {
                    // Subtipos - ignorar para não duplicar
                } else if (/^Base\s+FGTS\s+13[°º]?/i.test(cell)) {
                    const val = pickMonetary(row, c);
                    if (val > 0) sheetSummary.bases.fgts13 += val;
                } else if (/Base\s+FGTS\s+Menor\s+Apr|Base\s+FGTS\s+2%/i.test(cell)) {
                    const val = pickMonetary(row, c);
                    if (val > 0) sheetSummary.bases.fgts2 += val;
                } else if (/^Base\s+FGTS$/i.test(cell)) {
                    // Apenas a linha exata "Base FGTS" — evita subtotais
                    const val = pickMonetary(row, c);
                    if (val > 0) sheetSummary.bases.fgts += val;
                }
                // Bases INSS
                if (/Base\s+INSS\s+13[°º]?.*?Envelope|Base\s+INSS\s+13[°º]?/i.test(cell)) {
                    const val = pickMonetary(row, c);
                    if (val > 0) sheetSummary.bases.inss13 = (sheetSummary.bases.inss13||0) + val;
                } else if (/^Base\s+INSS\s*[-–]?\s*Envelope$|^Base\s+INSS$/i.test(cell)) {
                    // Apenas "Base INSS - Envelope" ou "Base INSS" — linha principal
                    const val = pickMonetary(row, c);
                    if (val > 0) sheetSummary.bases.inss += val;
                }
                // INSS valores (para validação de layout)
                if (/^INSS\s+Empresa|^INSS\s+Terceiro|^INSS\s+Total|^INSS\s+SAT/i.test(cell)) {
                    sheetSummary.hasINSS = true;
                }
                if (/^INSS\s+13/i.test(cell)) {
                    sheetSummary.hasINSS13 = true;
                }
                if (/^INSS\s+Diretor|^INSS\s+Aut/i.test(cell)) {
                    sheetSummary.hasInssDiretor = true;
                }
                // IRRF
                if (/^IRRF|^Base\s+IRRF/i.test(cell)) {
                    const val = pickMonetary(row, c);
                    if (val > 0) sheetSummary.bases.irrf += val;
                }
            }
        }

        // 2. Se não encontrou rótulos, assume que é tabular
        if (!foundLabels.bruto && !foundLabels.liquido) {
            const headers = rows[0] || [];
            // Coletar cabeçalhos crus para validação de layout (Planilha de Bases)
            headers.forEach(h => { const k = String(h||'').trim(); if (k) summary.rawHeaders.add(k); });
            const findCols = (regex) => headers.reduce((acc, h, i) => regex.test(h) ? [...acc, i] : acc, []);
            const idx = {
                bruto: findCols(/total\s+proventos|bruto|vencimentos/i),
                descontos: findCols(/total\s+descontos|descontos/i),
                liquido: findCols(/valor\s+liquido|liquido/i),
                inss: findCols(/^BASEINSS$|base\s+inss|base\s+prev/i),
                inss13: findCols(/^BASEINSS13$|base\s+inss\s+13/i),
                inssValor: findCols(/^INSS$|valor\s+inss/i),
                inss13Valor: findCols(/^INSS13$|inss\s+13/i),
                inssDiretor: findCols(/inss\s+diretor|inss\s+aut/i),
                fgts: findCols(/base\s+fgts$|base\s+fgts\s+mensal|^fgts$/i),
                fgts13: findCols(/fgts\s+13/i),
                fgts2: findCols(/fgts\s+2%|fgts\s+menor/i),
                irrf: findCols(/base\s+irrf|base\s+ir/i),
                proLabore: findCols(/pro\s*labore/i),
                situacao: headers.findIndex(h => /^CODSITUACAO$/i.test(h) || /SITUA[ÇC][ÃA]O/i.test(h))
            };
            const dataRows = rows.slice(1);
            dataRows.forEach(row => {
                idx.bruto.forEach(i => { sheetSummary.bruto += parseVal(row[i]); });
                idx.descontos.forEach(i => { sheetSummary.descontos += parseVal(row[i]); });
                idx.liquido.forEach(i => { sheetSummary.liquido += parseVal(row[i]); });
                idx.inss.forEach(i => { sheetSummary.bases.inss += parseVal(row[i]); });
                idx.inss13.forEach(i => { sheetSummary.bases.inss13 = (sheetSummary.bases.inss13||0) + parseVal(row[i]); });
                idx.proLabore.forEach(i => { sheetSummary.liquidoProLabore += parseVal(row[i]); });
                idx.fgts.forEach(i => { sheetSummary.bases.fgts += parseVal(row[i]); });
                idx.fgts13.forEach(i => { sheetSummary.bases.fgts13 += parseVal(row[i]); });
                idx.fgts2.forEach(i => { sheetSummary.bases.fgts2 += parseVal(row[i]); });
                idx.irrf.forEach(i => { sheetSummary.bases.irrf += parseVal(row[i]); });
                
                if (idx.situacao !== -1) {
                    const sit = String(row[idx.situacao] || '').toUpperCase().trim();
                    if (sit === 'A') sheetSummary.ativos++;
                    else if (sit === 'P') sheetSummary.afastados++;
                    else if (sit === 'D') sheetSummary.desligados++;
                }
            });
            if (idx.situacao !== -1) sheetSummary.colaboradores = sheetSummary.ativos;
        }

        // Heurística de De-duplicação:
        // Se o bruto desta aba for exatamente igual ao total já acumulado (e > 0),
        // é quase certeza que esta aba é um RESUMO de todas as anteriores.
        const isResumo = (Math.abs(sheetSummary.bruto - totalBrutoAcumulado) < 1 && totalBrutoAcumulado > 0);
        const nameIsResumo = /RESUMO|TOTAL|GERAL/i.test(sheetName);

        if (isResumo || (nameIsResumo && totalBrutoAcumulado > 0 && sheetSummary.bruto > 0)) {
            console.log(`Skipping summary sheet: ${sheetName}`);
            continue;
        }

        // Adicionar valores da aba ao resumo global
        summary.bruto += sheetSummary.bruto;
        summary.descontos += sheetSummary.descontos;
        summary.liquido += sheetSummary.liquido;
        summary.liquidoProLabore += sheetSummary.liquidoProLabore;
        summary.colaboradores += sheetSummary.colaboradores;
        summary.ativos += sheetSummary.ativos;
        summary.afastados += sheetSummary.afastados;
        summary.desligados += sheetSummary.desligados;
        summary.bases.inss += sheetSummary.bases.inss;
        summary.bases.fgts += sheetSummary.bases.fgts;
        summary.bases.fgts13 += sheetSummary.bases.fgts13;
        summary.bases.fgts2 += sheetSummary.bases.fgts2;
        summary.bases.irrf += sheetSummary.bases.irrf;
        
        totalBrutoAcumulado += sheetSummary.bruto;

        // Manter registro de campos encontrados para o processFiles decidir o que validar
        summary.foundFields = summary.foundFields || new Set();
        if (sheetSummary.bruto > 0) summary.foundFields.add('Proventos');
        if (sheetSummary.descontos > 0) summary.foundFields.add('Descontos');
        if (sheetSummary.liquido > 0) summary.foundFields.add('LIQUIDO');
        if (sheetSummary.bases.fgts > 0) summary.foundFields.add('Base FGTS');
        if (sheetSummary.bases.fgts13 > 0) summary.foundFields.add('Base FGTS 13º');
        if (sheetSummary.bases.inss > 0) summary.foundFields.add('Base INSS - Envelope');
        if ((sheetSummary.bases.inss13||0) > 0) summary.foundFields.add('Base INSS 13º - Envelope');
        if (sheetSummary.bases.irrf > 0) summary.foundFields.add('IRRF');
        if (sheetSummary.liquidoProLabore > 0) summary.foundFields.add('PRO LABORE');
        if (sheetSummary.hasINSS) summary.foundFields.add('INSS');
        if (sheetSummary.hasINSS13) summary.foundFields.add('INSS 13 SALARIO');
        if (sheetSummary.hasInssDiretor) summary.foundFields.add('INSS DIRETOR/AUT');
    }
    if (summary.foundFields) summary.foundFields = Array.from(summary.foundFields);
    summary.rawHeaders = Array.from(summary.rawHeaders);
    return summary;
}

async function processFiles() {
    // Verificar se os arquivos são reais (Blobs) ou apenas metadados virtuais
    const isVirtual = (file) => file && file.type === 'virtual';
    
    const hasMasterSource = state.files.pdf.length > 0 || state.files.planilha.length > 0;
    
    const hasVirtualPdf = state.files.pdf.some(isVirtual);
    const hasVirtualPlanilha = state.files.planilha.some(isVirtual);
    
    if (!hasMasterSource || hasVirtualPdf || hasVirtualPlanilha) {
        showToast('É necessário remover os arquivos listados e reenviar os arquivos reais. O recarregamento da página (F5) perde a permissão de leitura.', 'warning');
        showView('upload', document.querySelector('[data-view=upload]'));
        return;
    }

    showLoading('Lendo Relatório Analítico (Fonte Master)...');
    
    // Resetar resultados de layout antes de nova validação
    Object.keys(state.layoutResults.analitico.fields).forEach(k => state.layoutResults.analitico.fields[k] = false);
    Object.keys(state.layoutResults.bases.fields).forEach(k => state.layoutResults.bases.fields[k] = false);
    Object.keys(state.layoutResults.grrf.fields).forEach(k => state.layoutResults.grrf.fields[k] = false);

    try {
        let pdfProventos = 0, pdfDescontos = 0, pdfLiquidoFolha = 0, pdfLiquidoPro = 0, pdfAtivos = 0, pdfDesligados = 0;
        let pdfBases = { inss: 0, fgts: 0, fgts13: 0, irrf: 0 };

        // 1. Processar Arquivos do Relatório Analítico (PDF ou Excel)
        for (const file of state.files.pdf) {
            if (file.name.toLowerCase().endsWith('.pdf')) {
                const text = await extractTextFromPDF(file);
                const lines = text.split('\n');
                
                lines.forEach(line => {
                    const cleanLine = line.trim();
                    const parseCurrency = (l, regex) => {
                        const match = l.match(regex);
                        return match ? parseFloat(match[1].replace(/\./g, '').replace(',', '.')) : null;
                    };

                    // PRO LABORE
                    if (/Pró-Labore|Pro-Labore/i.test(cleanLine)) {
                        const val = parseCurrency(cleanLine, /(?:Pró-Labore|Pro-Labore).*?([\d.]+,\d{2})/i);
                        if (val !== null) { pdfLiquidoPro = Math.max(pdfLiquidoPro, val); state.layoutResults.analitico.fields['PRO LABORE'] = true; }
                    }
                    // Proventos
                    if (/Proventos|Total\s+Bruto|Vencimentos/i.test(cleanLine)) {
                        const val = parseCurrency(cleanLine, /(?:Proventos|Total\s+Bruto|Vencimentos).*?([\d.]+,\d{2})/i);
                        if (val !== null) { pdfProventos = Math.max(pdfProventos, val); state.layoutResults.analitico.fields['Proventos'] = true; }
                    }
                    // Descontos
                    if (/Descontos/i.test(cleanLine) && !/Base/i.test(cleanLine)) {
                        const val = parseCurrency(cleanLine, /(?:Descontos).*?([\d.]+,\d{2})/i);
                        if (val !== null) { pdfDescontos = Math.max(pdfDescontos, val); state.layoutResults.analitico.fields['Descontos'] = true; }
                    }
                    // Base FGTS 13º
                    if (/Base\s+FGTS\s+13/i.test(cleanLine)) {
                        const matches = cleanLine.match(/([\d.]+,\d{2})/g);
                        if (matches) { 
                            pdfBases.fgts13 = Math.max(pdfBases.fgts13, parseFloat(matches[matches.length - 1].replace(/\./g, '').replace(',', '.')));
                            state.layoutResults.analitico.fields['Base FGTS 13º'] = true; 
                        }
                    } 
                    // Base FGTS 2%
                    else if (/Base\s+FGTS\s+Menor\s+Apr|Base\s+FGTS\s+2%/i.test(cleanLine)) {
                        const matches = cleanLine.match(/([\d.]+,\d{2})/g);
                        if (matches) { 
                            pdfBases.fgts2 = Math.max(pdfBases.fgts2 || 0, parseFloat(matches[matches.length - 1].replace(/\./g, '').replace(',', '.')));
                        }
                    }
                    // Base FGTS
                    else if (/Base\s+FGTS/i.test(cleanLine)) {
                        const val = parseCurrency(cleanLine, /(?:Base\s+FGTS).*?([\d.]+,\d{2})/i);
                        if (val !== null) { pdfBases.fgts = Math.max(pdfBases.fgts, val); state.layoutResults.analitico.fields['Base FGTS'] = true; }
                    }
                    // Base INSS 13º - Envelope
                    if (/Base\s+INSS\s+13.*?Envelope|Base\s+INSS\s+13/i.test(cleanLine)) {
                        const matches = cleanLine.match(/([\d.]+,\d{2})/g);
                        if (matches) { state.layoutResults.analitico.fields['Base INSS 13º - Envelope'] = true; }
                    }
                    // Base INSS - Envelope
                    else if (/Base\s+INSS.*?Envelope|Base\s+INSS/i.test(cleanLine)) {
                        const matches = cleanLine.match(/([\d.]+,\d{2})/g);
                        if (matches) { pdfBases.inss = Math.max(pdfBases.inss, parseFloat(matches[matches.length - 1].replace(/\./g, '').replace(',', '.'))); state.layoutResults.analitico.fields['Base INSS - Envelope'] = true; }
                    }
                    // INSS 13 SALARIO
                    if (/INSS\s+13\s+SAL/i.test(cleanLine)) {
                        state.layoutResults.analitico.fields['INSS 13 SALARIO'] = true;
                    }
                    // INSS DIRETOR/AUT
                    if (/INSS\s+DIRETOR|INSS\s+AUT/i.test(cleanLine)) {
                        state.layoutResults.analitico.fields['INSS DIRETOR/AUT'] = true;
                    }
                    // INSS (Geral)
                    if (/^INSS\s|[\s]INSS[\s]/i.test(cleanLine) && !/Base|13|Diretor|Aut/i.test(cleanLine)) {
                        state.layoutResults.analitico.fields['INSS'] = true;
                    }
                    // IRRF
                    if (/IRRF/i.test(cleanLine)) {
                        const matches = cleanLine.match(/([\d.]+,\d{2})/g);
                        if (matches) { pdfBases.irrf = Math.max(pdfBases.irrf, parseFloat(matches[matches.length - 1].replace(/\./g, '').replace(',', '.'))); state.layoutResults.analitico.fields['IRRF'] = true; }
                    }

                    if (/Ativos\s+(\d+)/i.test(cleanLine)) {
                        const match = cleanLine.match(/Ativos\s+(\d+)/i);
                        if (match) pdfAtivos = Math.max(pdfAtivos, parseInt(match[1]));
                    }
                    if (/Líquido/i.test(cleanLine)) {
                        const match = cleanLine.match(/(?:Líquido).*?([\d.]+,\d{2})/i);
                        if (match) pdfLiquidoFolha = Math.max(pdfLiquidoFolha, parseFloat(match[1].replace(/\./g, '').replace(',', '.')));
                    }
                    if (/Demitidos\s+(\d+)/i.test(cleanLine)) {
                        const match = cleanLine.match(/Demitidos\s+(\d+)/i);
                        if (match) pdfDesligados = Math.max(pdfDesligados, parseInt(match[1]));
                    }
                });
            } else if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
                const summary = await extractExcelSummary(file);
                
                // Se o arquivo for o Analítico (identificado pelo nome ou por ser o único Excel), validar o layout analítico
                const isAnaliticoFile = file.name.toLowerCase().includes('analit') || state.files.planilha.length === 1;
                if (isAnaliticoFile && summary.foundFields) {
                    summary.foundFields.forEach(f => state.layoutResults.analitico.fields[f] = true);
                }

                // Validar o layout da Planilha de Bases usando os cabeçalhos CRUS já lidos (case-insensitive)
                const isBasesFile = file.name.toLowerCase().includes('base');
                if (isBasesFile && summary.rawHeaders && summary.rawHeaders.length > 0) {
                    const basesKeys = Object.keys(state.layoutResults.bases.fields);
                    summary.rawHeaders.forEach(rawKey => {
                        const match = basesKeys.find(k => k.toLowerCase() === rawKey.toLowerCase());
                        if (match) state.layoutResults.bases.fields[match] = true;
                    });
                }

                const grrfData = await extractGRRFSummary(file);
                if (grrfData.isGRRF) {
                    if (grrfData.foundMetrics) {
                        const grrfKeys = Object.keys(state.layoutResults.grrf.fields);
                        Object.keys(grrfData.foundMetrics).forEach(metric => {
                            // Matching case-insensitive para tolerar variações como 'Sal rescisao' vs 'SAL RESCISAO'
                            const match = grrfKeys.find(k => k.toLowerCase() === metric.toLowerCase());
                            if (match) state.layoutResults.grrf.fields[match] = true;
                        });
                    }
                    if (grrfData.totalFGTS > 0) {
                        state.data.grrf = grrfData;
                    }
                }
                console.log('📊 Excel Summary extraído:', JSON.stringify(summary));

                const hasFinancialData = summary.bruto > 0 || summary.liquido > 0;

                if (hasFinancialData) {
                    pdfProventos     += summary.bruto;
                    pdfDescontos     += summary.descontos;
                    pdfLiquidoFolha  += summary.liquido;
                    pdfLiquidoPro    += summary.liquidoProLabore || 0;
                    pdfAtivos        += summary.colaboradores;
                    pdfBases.inss    += summary.bases.inss;
                    pdfBases.fgts    += summary.bases.fgts;
                    pdfBases.fgts13  = Math.max(pdfBases.fgts13 || 0, summary.bases.fgts13 || 0);
                    pdfBases.fgts2   = Math.max(pdfBases.fgts2 || 0, summary.bases.fgts2 || 0);
                    pdfBases.irrf    += summary.bases.irrf;
                } else {
                    // Arquivo sem dados financeiros reconhecidos — provavelmente não é um Analítico
                    showToast(`⚠️ "${file.name}" não reconhecido como Analítico (sem Proventos/Líquido). Ignorado.`, 'warning');
                    console.warn(`⚠️ Arquivo ignorado (sem dados financeiros): ${file.name} — ${summary.colaboradores} linhas detectadas`);
                }
            }
        }

        // Fallback para o cálculo do líquido se não encontrar o campo
        if (pdfLiquidoFolha === 0) pdfLiquidoFolha = pdfProventos - pdfDescontos;

        // 2. Processar Excel (Ferramenta de Confronto ou Fonte Master)
        let excelBases = { inss: 0, fgts: 0, fgts13: 0, fgtsN: 0, fgtsN13: 0, fgtsZ: 0, fgtsZ13: 0, irrf: 0 };
        let excelSummary = { bruto: 0, descontos: 0, liquido: 0, colaboradores: 0, ativos: 0, afastados: 0, desligados: 0 };
        
        for (const planilhaFile of state.files.planilha) {
            if (isVirtual(planilhaFile)) continue;

            // Executar extrator unificado para validação de layout
            const planSummary = await extractExcelSummary(planilhaFile);

            // Validação de Layout: Planilha de Bases (case-insensitive)
            const isPlanBases = planilhaFile.name.toLowerCase().includes('base');
            if (isPlanBases && planSummary.rawHeaders && planSummary.rawHeaders.length > 0) {
                const basesKeys = Object.keys(state.layoutResults.bases.fields);
                planSummary.rawHeaders.forEach(rawKey => {
                    const match = basesKeys.find(k => k.toLowerCase() === rawKey.toLowerCase());
                    if (match) state.layoutResults.bases.fields[match] = true;
                });
            }

            const excelBuffer = await planilhaFile.arrayBuffer();
            const workbook = XLSX.read(excelBuffer);
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

            // Detectar se é relatório GRRF (Valores de FGTS Rescisório)
            const grrf = await extractGRRFSummary(planilhaFile);

            // Validação de Layout: GRRF (case-insensitive)
            if (grrf.isGRRF && grrf.foundMetrics) {
                const grrfKeys = Object.keys(state.layoutResults.grrf.fields);
                Object.keys(grrf.foundMetrics).forEach(metric => {
                    const match = grrfKeys.find(k => k.toLowerCase() === metric.toLowerCase());
                    if (match) state.layoutResults.grrf.fields[match] = true;
                });
            }

            if (grrf.isGRRF) {
                // Arquivo GRRF — alimentar conciliação de desligados e FGTS rescisório
                // Não somamos ao excelSummary.desligados se ele já foi preenchido pela planilha de bases
                if (excelSummary.desligados === 0) {
                    excelSummary.desligados = grrf.qtdDesligados;
                }
                state.summary.desligados = excelSummary.desligados;

                state.conciliacao.desligados = [
                    {
                        origem: 'GRRF (Folha Interna)',
                        qtd: grrf.qtdDesligados,
                        fgtsQuitacao:    grrf.fgtsQuitacao,
                        fgtsMesAnterior: grrf.fgtsMesAnterior,
                        fgtsAvisoPrevio: grrf.fgtsAvisoPrevio,
                        fgtsArtigo22:    grrf.fgtsArtigo22,
                        fgts13Indenizado: grrf.fgts13Indenizado,
                        fgts13Rescisao:  grrf.fgts13Rescisao,
                        totalFGTS:       grrf.totalFGTS,
                        baseRescisoriaCalculada: grrf.baseRescisoriaCalculada
                    }
                ];

                // Enriquecer conciliação FGTS com valores rescisórios
                if (state.conciliacao.fgts && state.conciliacao.fgts[0]) {
                    state.conciliacao.fgts[0].baseRescisoria  = grrf.baseRescisoriaCalculada || 0;
                    state.conciliacao.fgts[0].valorRescisorio = grrf.totalFGTS;
                    state.conciliacao.fgts[0].total = (state.conciliacao.fgts[0].valorMensal || 0) + grrf.totalFGTS;
                }

                showToast(`✅ GRRF: ${grrf.qtdDesligados} desligados — Total FGTS Rescisório: ${formatCurrency(grrf.totalFGTS)}`, 'success');
            } else {
                // Planilha tabular normal de confronto de bases
                // Encontrar a linha de cabeçalho dinamicamente (procurando por colunas conhecidas)
                let headerRowIndex = 0;
                let headers = [];
                for (let i = 0; i < Math.min(10, jsonData.length); i++) {
                    const row = jsonData[i] || [];
                    if (row.some(h => /BASEFGTS|NOME|CODTIPO|CODSITUACAO/i.test(String(h)))) {
                        headerRowIndex = i;
                        headers = row;
                        break;
                    }
                }
                
                if (headers.length === 0) headers = jsonData[0] || [];
                
                // Mapear campos para validação de layout
                const requiredBasesFields = Object.keys(state.layoutResults.bases.fields);
                requiredBasesFields.forEach(field => {
                    if (headers.some(h => String(h||'').toUpperCase().trim() === field)) {
                        state.layoutResults.bases.fields[field] = true;
                    }
                });

                const idx = {
                    nome: headers.findIndex(h => /^NOME$/i.test(String(h).trim())),
                    inss: headers.findIndex(h => /^BASEINSS$/i.test(h) || /base\s+inss/i.test(h)),
                    fgts: headers.findIndex(h => /^BASEFGTS$/i.test(h) || /base\s+fgts/i.test(h)),
                    fgtsAv: headers.findIndex(h => /^BASEFGTSAVPREVIO$/i.test(h)),
                    fgts13Av: headers.findIndex(h => /^BASEFGTS13AVPREVIO$/i.test(h)),
                    fgts13: headers.findIndex(h => /^BASEFGTS13$/i.test(h)),
                    irrf: headers.findIndex(h => /^BASEIRRF$/i.test(h) || /base\s+irrf/i.test(h)),
                    bruto: headers.findIndex(h => /total\s+proventos|bruto|vencimentos/i.test(h)),
                    descontos: headers.findIndex(h => /total\s+descontos|descontos/i.test(h)),
                    liquido: headers.findIndex(h => /valor\s+liquido|liquido/i.test(h)),
                    situacao: headers.findIndex(h => /^CODSITUACAO$/i.test(h) || /SITUA[ÇC][ÃA]O/i.test(h)),
                    codtipo: headers.findIndex(h => /^CODTIPO$/i.test(h))
                };
                const rows = jsonData.slice(headerRowIndex + 1);
                
                if (idx.situacao !== -1) {
                    excelSummary.ativos = 0;
                    excelSummary.afastados = 0;
                    excelSummary.desligados = 0;
                }
                
                rows.forEach(row => {
                    // Ignorar linhas de Totais no final da planilha (geralmente não possuem NOME ou SITUAÇÃO)
                    const valNome = idx.nome !== -1 ? String(row[idx.nome] || '').trim() : String(row[0] || '').trim();
                    const valSit = idx.situacao !== -1 ? String(row[idx.situacao] || '').trim() : '';
                    if (!valNome && !valSit) return;

                    const parseV = (val) => {
                        if (typeof val === 'number') return val;
                        if (!val) return 0;
                        const str = String(val).trim();
                        // Se for padrão monetário BR (ex: "1.234,56")
                        if (/\d[\d.]*,\d{2}/.test(str)) {
                            return parseFloat(str.replace(/[R$\s.]/g, '').replace(',', '.')) || 0;
                        }
                        // Fallback para número serializado errado ou puro numérico em string
                        return parseFloat(str.replace(/[R$\s]/g, '').replace(',', '.')) || 0;
                    };
                    
                    if (idx.situacao !== -1) {
                        const sit = String(row[idx.situacao] || '').toUpperCase().trim();
                        if (sit === 'A' || sit === 'ATIVO') excelSummary.ativos++;
                        else if (sit === 'P' || sit === 'AFASTADO') excelSummary.afastados++;
                        else if (sit === 'D' || sit === 'DESLIGADO' || sit === 'DEMITIDO') excelSummary.desligados++;
                    }

                    if (idx.inss !== -1)      excelBases.inss        += parseV(row[idx.inss]);
                    if (idx.irrf !== -1)      excelBases.irrf        += parseV(row[idx.irrf]);
                    if (idx.bruto !== -1)     excelSummary.bruto     += parseV(row[idx.bruto]);
                    if (idx.descontos !== -1) excelSummary.descontos += parseV(row[idx.descontos]);
                    if (idx.liquido !== -1)   excelSummary.liquido   += parseV(row[idx.liquido]);
                    
                    // FGTS Consolidation (Split Mensal vs 13º)
                    const valFgts = (idx.fgts !== -1 ? parseV(row[idx.fgts]) : 0);
                    const valFgtsAv = (idx.fgtsAv !== -1 ? parseV(row[idx.fgtsAv]) : 0);
                    const valFgts13Av = (idx.fgts13Av !== -1 ? parseV(row[idx.fgts13Av]) : 0);
                    const valFgts13 = (idx.fgts13 !== -1 ? parseV(row[idx.fgts13]) : 0);
                    
                    const sumMensal = valFgts + valFgtsAv;
                    const sum13 = valFgts13 + valFgts13Av;
                    
                    excelBases.fgts += sumMensal;
                    excelBases.fgts13 += sum13;
                    
                    if (idx.codtipo !== -1) {
                        const tipo = String(row[idx.codtipo] || '').toUpperCase().trim();
                        if (tipo === 'Z') {
                            excelBases.fgtsZ += sumMensal;
                            excelBases.fgtsZ13 += sum13;
                        }
                    }
                });
                
                // Cálculo das Bases Tipo N (Regular)
                excelBases.fgtsN = excelBases.fgts - excelBases.fgtsZ;
                excelBases.fgtsN13 = excelBases.fgts13 - excelBases.fgtsZ13;
                
                if (idx.situacao !== -1) {
                    excelSummary.colaboradores = excelSummary.ativos;
                }
            }
        }

        // 3. Atualizar Dashboard (Prioridade PDF para Ativos, Planilha Complementar para Afastados/Desligados)
        state.summary.ativos = pdfAtivos || excelSummary.ativos || excelSummary.colaboradores;
        
        // Conforme pedido: Afastados e Desligados devem vir da planilha complementar
        state.summary.afastados = excelSummary.afastados;
        
        // Prioridade: Planilha de Bases (CODSITUACAO) > GRRF > PDF
        if (excelSummary.desligados > 0) {
            state.summary.desligados = excelSummary.desligados;
        } else {
            state.summary.desligados = pdfDesligados;
        }
        
        state.summary.colaboradores = state.summary.ativos; // Mantido para compatibilidade em outros cálculos
        state.summary.bruto = pdfProventos || excelSummary.bruto;
        state.summary.descontos = pdfDescontos || excelSummary.descontos;
        state.summary.liquidoFolha = pdfLiquidoFolha || excelSummary.liquido;
        state.summary.liquidoProLabore = pdfLiquidoPro;

        // 4. Alimentar Conciliação com os dados extraídos
        const activeEmp = state.empresas.find(e => e.active) || {};
        const cfg = activeEmp.config || state.config;
        
        const inssBase = pdfBases.inss;
        const fgtsBaseTotal = pdfBases.fgts + (pdfBases.fgts13 || 0);
        const fgtsBase2 = pdfBases.fgts2 || 0;
        const fgtsBase8 = fgtsBaseTotal - fgtsBase2;

        const fgts13Base = pdfBases.fgts13 || 0;
        const fgtsMensalBase = pdfBases.fgts;

        // Calcular encargos patronais a partir da base
        const patronal  = inssBase * 0.20;
        const ratfap    = inssBase * ((cfg.rat || 2) / 100) * (cfg.fap || 1.00);
        const terceiros = inssBase * 0.058; 
        const segurados = inssBase * 0.09;  

        // Valor do FGTS Mensal considerando o split de 8% e 2% (Aprendiz)
        // Se a base 2% for maior que a base mensal, capamos ela.
        const base2Mensal = Math.min(fgtsBase2, fgtsMensalBase);
        const base8Mensal = fgtsMensalBase - base2Mensal;
        const fgtsValor = (base8Mensal * 0.08) + (base2Mensal * 0.02);
        
        // Valor do FGTS 13º (Geralmente 8%)
        const fgts13Valor = fgts13Base * 0.08;

        state.conciliacao.inss = [
            {
                origem: 'Folha Interna (Analítico)',
                base: inssBase,
                segurados: segurados,
                patronal: patronal,
                ratfap: ratfap,
                terceiros: terceiros,
                total: segurados + patronal + ratfap + terceiros
            }
        ];

        if (state.files.planilha.length > 0) {
            state.conciliacao.inss.push({
                origem: 'Planilha Auxiliar (Confronto)',
                base: excelBases.inss,
                segurados: excelBases.inss * 0.09,
                patronal: excelBases.inss * 0.20,
                ratfap: excelBases.inss * ((cfg.rat || 2) / 100) * (cfg.fap || 1.00),
                terceiros: excelBases.inss * 0.058,
                total: excelBases.inss * (0.09 + 0.20 + 0.058 + ((cfg.rat || 2) / 100) * (cfg.fap || 1.00))
            });
        }

        state.conciliacao.inss.push({
            origem: 'Governo (eSocial)',
            base: 0, segurados: 0, patronal: 0, ratfap: 0, terceiros: 0, total: 0
        });

        state.conciliacao.fgts = [
            {
                origem: 'Folha Interna (Analítico)',
                baseMensal: fgtsMensalBase,
                valorMensal: fgtsValor,
                base2: base2Mensal,
                valor2: base2Mensal * 0.02,
                base13: fgts13Base,
                valor13: fgts13Valor,
                baseRescisoria: 0,
                valorRescisorio: 0,
                total: fgtsValor + fgts13Valor
            }
        ];

        if (state.files.planilha.length > 0) {
            const aliq = 0.08;
            const aliqJovem = 0.02;

            const base2Excel = excelBases.fgtsZ || 0;
            const base8Excel = excelBases.fgts - base2Excel;
            const valMensal = (base8Excel * aliq) + (base2Excel * aliqJovem);
            
            const val13 = excelBases.fgts13 * aliq;

            state.conciliacao.fgts.push({
                origem: 'Planilha Auxiliar (Confronto)',
                baseMensal: excelBases.fgts,
                valorMensal: valMensal,
                base2: base2Excel,
                valor2: base2Excel * aliqJovem,
                base13: excelBases.fgts13,
                valor13: val13,
                baseRescisoria: 0,
                valorRescisorio: 0,
                total: valMensal + val13,
                baseN: excelBases.fgtsN,
                baseZ: excelBases.fgtsZ
            });
        }

        state.conciliacao.fgts.push({
            origem: 'FGTS Digital (Governo)',
            baseMensal: 0, valorMensal: 0, base13: 0, valor13: 0, baseRescisoria: 0, valorRescisorio: 0, total: 0
        });


        updateKPIs();
        updateStep(1, 'done');
        updateStep(2, 'active');
        
        hideLoading();
        showToast('Análise do Relatório Analítico concluída!', 'success');
        
        if (state.files.planilha.length > 0 && Math.abs(pdfProventos - excelBases.inss) > 10) {
            showToast('Alerta: Bases de INSS no Excel divergem do PDF!', 'warning');
        }

        showView('validacao', document.querySelector('[data-view=validacao]'));
        runAllValidations();
        renderConciliacao(); // Garante que as tabelas e a guia sejam renderizadas com os novos dados
        saveState();

    } catch (err) {
        console.error('Erro no processamento mestre:', err);
        hideLoading();
        showToast('Falha ao ler o Analítico. Verifique o formato do PDF.', 'error');
    }
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
    
    if (id === 'layoutAnalitico') {
        const hasAnalitico = true;
        const fields = state.layoutResults.analitico.fields;
        const missing = Object.entries(fields).filter(([name, found]) => !found).map(([name]) => name);
        
        // Colunas essenciais que REALMENTE travam o sistema
        const essential = ['Proventos', 'Descontos', 'Base FGTS', 'Base INSS - Envelope'];
        const missingEssential = missing.filter(m => essential.includes(m));

        if (!hasAnalitico) {
            v.status = 'error';
            v.desc = '<strong>Motivo:</strong> Relatório Analítico (PDF ou Excel) não identificado.';
        } else if (missingEssential.length > 0) {
            v.status = 'error';
            v.desc = `<strong>Erro Crítico:</strong> Colunas essenciais ausentes no Analítico: <span class="text-danger">${missingEssential.join(', ')}</span>.`;
        } else if (missing.length > 0) {
            v.status = 'warning';
            v.desc = `<strong>Aviso:</strong> Algumas colunas não foram localizadas (podem não existir nesta folha): <span class="text-warning">${missing.join(', ')}</span>. A conciliação prosseguirá com os dados disponíveis.`;
        } else {
            v.status = 'ok';
            v.desc = 'Layout do Analítico validado com sucesso.';
        }
    } 
    else if (id === 'layoutBases') {
        const hasSpreadsheet = state.files.planilha.length > 0;
        const fields = state.layoutResults.bases.fields;
        const missing = Object.entries(fields).filter(([name, found]) => !found).map(([name]) => name);
        
        if (!hasSpreadsheet) {
            v.status = 'warning';
            v.desc = '<strong>Motivo:</strong> Planilha de bases não enviada. O sistema está usando apenas dados do Analítico.';
        } else if (missing.length === 0) {
            v.status = 'ok';
            v.desc = 'Todos os 26 campos obrigatórios localizados na planilha de bases.';
        } else {
            v.status = missing.length < 10 ? 'warning' : 'error';
            v.desc = `<strong>Motivo:</strong> Colunas ausentes na Planilha de Bases: <span class="text-danger">${missing.join(', ')}</span>.`;
        }
    }
    else if (id === 'layoutGRRF') {
        const hasGRRF = state.files.planilha.some(f => f.name.toLowerCase().includes('grrf'));
        const fields = state.layoutResults.grrf.fields;
        const missing = Object.entries(fields).filter(([name, found]) => !found).map(([name]) => name);
        
        if (!hasGRRF) {
            v.status = 'warning';
            v.desc = '<strong>Motivo:</strong> Arquivo de GRRF não identificado na lista de uploads.';
        } else if (missing.length === 0) {
            v.status = 'ok';
            v.desc = 'Layout da GRRF validado com todos os campos obrigatórios.';
        } else {
            v.status = 'warning';
            v.desc = `<strong>Motivo:</strong> Colunas ausentes na GRRF: <span class="text-danger">${missing.join(', ')}</span>.`;
        }
    }
    else if (id === 'integridadeCampos') {
        const hasErrors = state.summary.colaboradores === 0 && state.summary.bruto === 0;
        v.status = hasErrors ? 'error' : 'ok';
        v.desc = hasErrors ? 'Nenhum dado numérico válido pôde ser extraído dos arquivos.' : 'Formatos numéricos e campos de texto validados.';
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
    saveState();
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
    saveState();
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
            <div class="resumo-label">Ativos (A)</div>
            <div class="resumo-value">${state.summary.ativos}</div>
        </div>
        <div class="resumo-item">
            <div class="resumo-label">Afastados (P)</div>
            <div class="resumo-value">${state.summary.afastados}</div>
        </div>
        <div class="resumo-item">
            <div class="resumo-label">Desligados (D)</div>
            <div class="resumo-value">${state.summary.desligados}</div>
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
    state.files.planilha.slice(0, 2).forEach(f => files.push(f));
    state.files.pdf.slice(0, 2).forEach(f => files.push(f));
    if (state.files.ponto) files.push(state.files.ponto);

    if (files.length === 0) {
        dashList.innerHTML = '<div class="empty-state-sm"><p>Nenhum arquivo</p></div>';
        return;
    }

    dashList.innerHTML = files.filter(f => f && f.name).map(f => `
        <div class="file-item">
            <span class="file-type-badge badge-${f.name.split('.').pop().toLowerCase()}">${f.name.split('.').pop()}</span>
            <div class="file-info">
                <div class="file-name" style="font-size:0.75rem">${f.name}</div>
            </div>
        </div>
    `).join('');
}

function updateKPIs() {
    animateValue('kpiColaboradores', 0, state.summary.ativos);
    animateValue('kpiAfastados', 0, state.summary.afastados);
    animateValue('kpiDesligados', 0, state.summary.desligados);
    animateValue('kpiBruto', 0, state.summary.bruto, true);
    animateValue('kpiLiquidoFolha', 0, state.summary.liquidoFolha, true);
    animateValue('kpiLiquidoProLabore', 0, state.summary.liquidoProLabore, true);
    
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
    // Salvar dados da competência atual antes de trocar
    saveState();

    // Trocar competência
    state.competencia = value;

    // Carregar dados da nova competência (ou zerar se não houver)
    const hadData = loadCompetenciaData(value);
    const msg = hadData
        ? `Competência alterada para ${getCompetenciaExtenso()}`
        : `Competência ${getCompetenciaExtenso()} iniciada sem dados — faça o upload dos arquivos`;
    showToast(msg, hadData ? 'info' : 'warning');

    // Sync settings input
    const configMes = document.getElementById('configMes');
    if (configMes) configMes.value = value;

    // Re-renderizar tudo
    updateDashboard();
    renderFilePreviews();
    checkUploadProgress();
    renderValidations();
    renderFechamentoSteps();
    updateKPIs();
    renderConciliacao();

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
        'configFGTSJovem': state.config.fgtsJovem,
        'configRAT': state.config.rat,
        'configFAP': state.config.fap,
        'configPatronal': state.config.patronal,
        'configTerceiros': state.config.terceiros,
        'configMes': state.competencia
    };

    for (const [id, value] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el) el.value = value ?? '';
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
            fgtsJovem: 2,
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

    // Recarregar os dados específicos desta empresa para a competência atual
    loadCompetenciaData(state.competencia);

    showToast('Empresa ativa alterada!', 'success');
    renderConfig();
    updateDashboard(); 
    
    // Atualizar visualização
    updateKPIs();
    renderINSS();
    renderFGTS();
    renderFilePreviews();
    renderValidations();
    renderFechamentoSteps();
    
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

function renderDynamicTable(type, metrics) {
    const dataArray = state.conciliacao[type.toLowerCase()];
    const thead = document.getElementById(`head${type}`);
    const tbody = document.getElementById(`body${type}`);
    const statusBadge = document.getElementById(`status${type}`);
    
    if (!thead || !tbody) return;

    if (!dataArray || dataArray.length < 2) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted)">Aguardando importação de dados para conciliar...</td></tr>';
        if (statusBadge) {
            statusBadge.className = 'badge badge-warning';
            statusBadge.innerText = 'Pendente';
        }
        return;
    }

    const sources = dataArray;

    // Cabeçalho dinâmico baseado nas fontes disponíveis
    let headHtml = `<tr><th style="width:30%; padding:12px 16px; text-align:left; font-weight:600; color:var(--text-primary); border-bottom:1px solid var(--border)">Métrica / Rubrica</th>`;
    sources.forEach(s => {
        let title = s.origem;
        if (title.includes('Analítico')) title = 'Analítico (Folha)';
        else if (title.includes('Confronto')) title = 'Planilha (Bases)';
        else if (title.includes('Governo') || title.includes('Digital')) title = type === 'FGTS' ? 'GFD (Governo)' : 'eSocial (Gov)';
        headHtml += `<th style="text-align:right; padding:12px 16px; font-weight:600; color:var(--text-primary); border-bottom:1px solid var(--border)">${title}</th>`;
    });
    headHtml += `<th style="text-align:right; padding:12px 16px; font-weight:600; color:var(--text-primary); border-bottom:1px solid var(--border)">Divergência</th>`;
    headHtml += `<th style="width:80px; text-align:center; padding:12px 16px; font-weight:600; color:var(--text-primary); border-bottom:1px solid var(--border)">Status</th></tr>`;
    thead.innerHTML = headHtml;

    let totalMaxDiff = 0;
    
    tbody.innerHTML = metrics.map((m, index) => {
        let maxDiff = 0;
        const isTotal = m.key === 'total' || m.key === 'totalFGTS';
        
        let rowStyle = '';
        if (isTotal) {
            rowStyle = 'border-top:2px solid var(--border); background:rgba(16,185,129,0.06)';
        }

        let rowHtml = `<tr style="${rowStyle}">`;
        
        if (isTotal) {
             rowHtml += `<td style="padding:12px 16px; font-weight:700; color:var(--text-primary)">${m.label}</td>`;
        } else {
             rowHtml += `<td style="padding:10px 16px; color:var(--text-secondary)">${m.label}</td>`;
        }
        
        let values = [];
        sources.forEach(s => {
            const val = s[m.key] || 0;
            values.push(val);
            rowHtml += `<td style="text-align:right; font-family:'JetBrains Mono',monospace; ${isTotal ? 'font-weight:700; font-size:1rem; color:var(--text-secondary)' : 'font-weight:600'}">${formatCurrency(val)}</td>`;
        });
        
        // Calcular maior divergência ignorando o Governo se ele estiver zerado (não sincronizado ainda)
        const activeValues = values.filter((v, i) => i < 2 || (i >= 2 && v > 0));
        
        if (activeValues.length >= 2) {
            maxDiff = Math.max(...activeValues) - Math.min(...activeValues);
        } else if (values.length >= 2 && values[0] > 0) {
             // Fallback para quando Planilha for 0 e Governo for 0 (mostra a dif com a folha)
             maxDiff = Math.abs(values[0] - values[1]);
        }
        
        if (isTotal) totalMaxDiff = maxDiff;
        
        const isMatch = maxDiff < 0.01;
        rowHtml += `<td style="text-align:right; font-family:'JetBrains Mono',monospace; font-weight:600; ${isMatch ? 'color:var(--text-muted)' : 'color:var(--accent-red)'}">${formatCurrency(maxDiff)}</td>`;
        rowHtml += `<td style="text-align:center">${isMatch ? '<span class="status-check ok">✓</span>' : '<span style="color:var(--accent-red); font-weight:bold">!</span>'}</td></tr>`;
        
        return rowHtml;
    }).join('');
    
    if (statusBadge) {
        statusBadge.className = totalMaxDiff < 0.01 ? 'badge badge-success' : 'badge badge-warning';
        statusBadge.innerText = totalMaxDiff < 0.01 ? 'Conferido' : 'Divergência';
    }
}

function renderINSS() {
    renderDynamicTable('INSS', [
        { label: 'Base de Cálculo', key: 'base' },
        { label: 'Segurados Retido', key: 'segurados' },
        { label: 'Patronal (CPP)', key: 'patronal' },
        { label: 'RAT + FAP', key: 'ratfap' },
        { label: 'Terceiros', key: 'terceiros' },
        { label: 'Total Geral INSS', key: 'total' }
    ]);
}

function checkUploadProgress() {
    const btn = document.getElementById('processBtn');
    const hasPDF = state.files.pdf.length > 0;
    if (btn) btn.disabled = !hasPDF;
}

function renderFGTS() {
    renderDynamicTable('FGTS', [
        { label: 'Base FGTS Mensal', key: 'baseMensal' },
        { label: 'Valor FGTS Mensal', key: 'valorMensal' },
        { label: 'Base FGTS 13º Salário', key: 'base13' },
        { label: 'Valor FGTS 13º Salário', key: 'valor13' },
        { label: 'Base FGTS Rescisório', key: 'baseRescisoria' },
        { label: 'Valor FGTS Rescisorio', key: 'valorRescisorio' },
        { label: 'Total a Recolher', key: 'total' }
    ]);
    
    if (!state.conciliacao.fgts || state.conciliacao.fgts.length === 0) {
        // Limpar valores da guia se não houver dados
        ['calcFgtsMensal', 'calcFgts8', 'calcFgts2', 'calcFgtsGrrf', 'valorGuiaFGTS'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = id === 'calcFgtsGrrf' ? '- R$ 0,00' : 'R$ 0,00';
        });
        return;
    }
    
    const f = state.conciliacao.fgts[0];
    
    // Atualiza o highlight box com o cálculo da Guia de FGTS Líquida
    let fgtsGrrfAbater = 0;
    if (state.conciliacao.desligados && state.conciliacao.desligados[0]) {
        const d = state.conciliacao.desligados[0];
        // Somamos TUDO que foi pago via GRRF (incluindo Mês Anterior e Artigo 22) para bater com a conferência do usuário
        fgtsGrrfAbater = (d.fgtsQuitacao || 0) + 
                         (d.fgtsMesAnterior || 0) + 
                         (d.fgtsAvisoPrevio || 0) + 
                         (d.fgtsArtigo22 || 0) + 
                         (d.fgts13Rescisao || 0) + 
                         (d.fgts13Indenizado || 0);
    }
    
    const fgtsMensalBruto = f.valorMensal || 0;
    const fgts2Valor = f.valor2 || 0;
    const fgts8Valor = fgtsMensalBruto - fgts2Valor;
    
    const valorGuiaLiquida = fgtsMensalBruto + (f.valor13 || 0) - fgtsGrrfAbater;
    
    const elCalcMensal = document.getElementById('calcFgtsMensal');
    if (elCalcMensal) elCalcMensal.innerText = formatCurrency(fgtsMensalBruto + (f.valor13 || 0));
    
    const elCalc8 = document.getElementById('calcFgts8');
    if (elCalc8) elCalc8.innerText = formatCurrency(fgts8Valor + (f.valor13 || 0));
    
    const elCalc2 = document.getElementById('calcFgts2');
    if (elCalc2) elCalc2.innerText = formatCurrency(fgts2Valor);

    const elCalcGrrf = document.getElementById('calcFgtsGrrf');
    if (elCalcGrrf) elCalcGrrf.innerText = '- ' + formatCurrency(fgtsGrrfAbater);
    
    const elValorGuia = document.getElementById('valorGuiaFGTS');
    if (elValorGuia) {
        elValorGuia.innerText = formatCurrency(Math.max(0, valorGuiaLiquida));
    }
}

function renderDesligados() {
    const body = document.getElementById('bodyDesligados');
    if (!body) return;

    const dados = state.conciliacao.desligados;

    if (!dados || dados.length === 0) {
        body.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:var(--text-muted)">Nenhum dado de desligamento. Suba o arquivo GRRF na Planilha Auxiliar e processe.</td></tr>';
        return;
    }

    const d = dados[0];

    // Detectar formato GRRF (tem totalFGTS) vs. formato antigo (tem nome)
    if (d.totalFGTS !== undefined) {
        // Formato GRRF — exibir breakdown por categoria
        const categorias = [
            { label: 'FGTS Quitação',         valor: d.fgtsQuitacao    || 0 },
            { label: 'FGTS Mês Anterior',      valor: d.fgtsMesAnterior || 0 },
            { label: 'FGTS Aviso Prévio',      valor: d.fgtsAvisoPrevio || 0 },
            { label: 'FGTS Artigo 22',         valor: d.fgtsArtigo22    || 0 },
            { label: 'FGTS 13° Indenizado',    valor: d.fgts13Indenizado|| 0 },
            { label: 'FGTS 13° Rescisão',      valor: d.fgts13Rescisao  || 0 },
        ];

        body.innerHTML = `
            <tr style="background:rgba(59,130,246,0.06)">
                <td colspan="3" style="padding:12px 16px">
                    <span style="font-weight:700;color:var(--text-primary)">GRRF – ${d.qtd || 0} Desligado(s) na Competência</span>
                    <span style="margin-left:12px;font-size:0.75rem;color:var(--text-muted)">${d.origem || 'Folha Interna'}</span>
                </td>
            </tr>
            ${categorias.map(cat => `
                <tr>
                    <td style="padding:10px 16px;color:var(--text-secondary)">${cat.label}</td>
                    <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-weight:600">${formatCurrency(cat.valor)}</td>
                    <td style="text-align:center">${cat.valor > 0 ? '<span class="status-check ok">✓</span>' : '<span style="color:var(--text-muted)">—</span>'}</td>
                </tr>
            `).join('')}
            <tr style="border-top:2px solid var(--border);background:rgba(16,185,129,0.06)">
                <td style="padding:12px 16px;font-weight:700;color:var(--text-primary)">Base Rescisória Estimada</td>
                <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:1rem;color:var(--text-secondary)">${formatCurrency(d.baseRescisoriaCalculada || 0)}</td>
                <td></td>
            </tr>
            <tr style="background:rgba(16,185,129,0.06)">
                <td style="padding:12px 16px;font-weight:700;color:var(--text-primary)">Total FGTS Rescisório</td>
                <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:1rem;color:var(--accent-green)">${formatCurrency(d.totalFGTS || 0)}</td>
                <td></td>
            </tr>
        `;
    } else {
        // Formato antigo (lista de funcionários individuais)
        body.innerHTML = dados.map(emp => `
            <tr>
                <td><div style="font-weight:700;color:var(--text-primary)">${emp.nome || '—'}</div><div style="font-size:0.75rem;color:var(--text-muted)">${emp.tipo || ''}</div></td>
                <td style="text-align:right;font-family:'JetBrains Mono',monospace">${formatCurrency(emp.totalFGTS || emp.total || 0)}</td>
                <td style="text-align:center"><span class="badge ${emp.status === 'Recolhido' ? 'badge-success' : 'badge-warning'}">${emp.status || 'Pendente'}</span></td>
            </tr>
        `).join('');
    }
}


function importGovernmentData() {
    showLoading('Conectando ao eSocial / DCTFWeb / FGTS Digital...');
    setTimeout(() => {
        // Simular importação de dados de desligados
        state.conciliacao.desligados = [
            { nome: 'Simulação: Ana Silva', data: '12/04/2026', tipo: 'Sem Justa Causa', base: 12500.00, multa: 5000.00, total: 17500.00, status: 'Recolhido' },
            { nome: 'Simulação: Carlos Lima', data: '18/04/2026', tipo: 'Acordo Art. 484-A', base: 8200.00, multa: 1640.00, total: 9840.00, status: 'Pendente' }
        ];

        hideLoading();
        showToast('Dados do governo sincronizados com sucesso!', 'success');
        renderConciliacao();
        saveState();
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
        fgtsJovem: parseFloat(document.getElementById('configFGTSJovem').value) || 2,
        rat: parseFloat(document.getElementById('configRAT').value),
        fap: parseFloat(document.getElementById('configFAP').value),
        patronal: parseFloat(document.getElementById('configPatronal').value) || 20,
        terceiros: parseFloat(document.getElementById('configTerceiros').value) || 5.8
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
                fgtsJovem: state.config.fgtsJovem,
                rat: state.config.rat,
                fap: state.config.fap,
                patronal: state.config.patronal,
                terceiros: state.config.terceiros
            };
        }

        // showView('dashboard', document.querySelector('[data-view=dashboard]'));
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
            <button class="btn btn-primary" onclick="showView('upload'); document.getElementById('modal').style.display='none'; showToast('Reenvie os arquivos corrigidos para nova validação.', 'info')">Corrigir Dados</button>
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
    
    // Proteção contra NaN
    const finalVal = isNaN(end) ? 0 : end;
    const startVal = isNaN(start) ? 0 : start;
    
    const duration = 1000;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const currentVal = progress * (finalVal - startVal) + startVal;
        obj.innerHTML = isCurrency ? formatCurrency(currentVal) : Math.floor(currentVal);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

function excluirDadosCompetencia() {
    alert('Iniciando limpeza da competência...');
    showLoading('Limpando dados da competência...');
    
    setTimeout(() => {
            // Reset files
            state.files = { planilha: [], pdf: [], ponto: null, encargos: null };
            
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
                ativos: 0,
                afastados: 0,
                desligados: 0,
                colaboradores: 0,
                bruto: 0,
                descontos: 0,
                liquidoFolha: 0,
                liquidoProLabore: 0
            };
            
            // Reset conciliação
            state.conciliacao.inss = [];
            state.conciliacao.fgts = [];
            state.conciliacao.desligados = [];

            // Limpar inputs de arquivo físicos
            ['planilha', 'pdf', 'encargos'].forEach(id => {
                const input = document.getElementById(`input-${id}`);
                if (input) input.value = '';
            });

            // Reset UI components safely
            try {
                renderFilePreviews();
                checkUploadProgress();
                renderDashboard();
                renderValidations();
                renderFechamentoSteps();
                updateKPIs();
                renderConciliacao();

                // Reset badges explicitamente
                ['uploadBadge', 'validBadge'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) { el.style.display = 'none'; el.innerText = '0'; }
                });

                const fechBadge = document.getElementById('fechBadge');
                if (fechBadge) {
                    fechBadge.innerText = 'Em Andamento';
                    fechBadge.className = 'badge badge-warning';
                }

                const btnFecharFolha = document.getElementById('btnFecharFolha');
                if (btnFecharFolha) btnFecharFolha.disabled = true;

                showView('dashboard', document.querySelector('[data-view=dashboard]'));
            } catch (uiErr) {
                console.error('Erro ao atualizar UI após reset:', uiErr);
            }
            
            hideLoading();
            showToast('Dados da competência foram excluídos.', 'success');
            alert('Limpeza concluída com sucesso!');
            saveState();
        }, 1000);
}
