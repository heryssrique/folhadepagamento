/**
 * FolhaPay - App Logic
 * Version: 1.0.0
 */

// --- Constants & State ---
const isDiagnosticsEnabled = () => {
    try { return localStorage.getItem('folhapay:debug') === '1'; } catch (_) { return false; }
};
const debugLog = (event, details = {}) => {
    if (!isDiagnosticsEnabled()) return;
    const allowed = ['slot', 'count', 'real', 'virtual', 'extension', 'sheets', 'headerRow', 'matchedColumns', 'dataRows', 'bases', 'inss', 'fgts', 'fgts13', 'irrf', 'outcome', 'errorType'];
    const safe = {};
    allowed.forEach(key => {
        const value = details[key];
        if (typeof value === 'string' && value.length <= 40) safe[key] = value;
        else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) safe[key] = value;
        else if (Array.isArray(value)) safe[key] = value.filter(v => typeof v === 'string' && v.length <= 40).slice(0, 40);
    });
    console.info('[FolhaPay debug]', event, safe);
};
window.setFolhaPayDebug = (enabled) => {
    try {
        if (enabled) localStorage.setItem('folhapay:debug', '1');
        else localStorage.removeItem('folhapay:debug');
        console.info(`[FolhaPay debug] Diagnóstico ${enabled ? 'ativado' : 'desativado'} nesta origem.`);
        return isDiagnosticsEnabled();
    } catch (_) {
        console.warn('[FolhaPay debug] Não foi possível alterar o diagnóstico neste navegador.');
        return false;
    }
};
if (isDiagnosticsEnabled()) console.info('[FolhaPay debug] Diagnóstico ativado nesta origem.');

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
        { id: 'layoutAnalitico', title: 'Layout Analítico', desc: 'Verifica se o PDF/TXT/Excel Master contém as colunas de Proventos e Bases.', status: 'pending', progress: 0 },
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
        irrf: [],
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
                'BASEFGTS': false, 'BASEFGTSAVPREVIO': false, 'BASEFGTS13AVPREVIO': false, 'BASEFGTS13': false, 'BASEFGTSDIFSAL': false,
                'FGTS_MES': false, 'FGTS_AVISO': false, 'FGTS13_AVISO': false, 'FGTS13': false, 'FGTSDIF': false,
                'BASEINSS': false, 'BASEINSS13': false, 'BASE_INSS_AUTONOMO': false,
                'INSS': false, 'INSS13': false, 'INSSFERIAS': false, 'INSSDIFSAL': false,
                'BASEIRRF': false, 'BASEIRRFFERIAS': false, 'IRRF': false, 'IRRF13': false, 'IRRFFERIAS': false
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
            pdf: state.files.pdf.length > 0 ? state.files.pdf.map(f => ({ name: f.name, size: f.size })) : null,
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
                if (d.fileMetadata.pdf) state.files.pdf = d.fileMetadata.pdf.map(p => ({ name: p.name, size: p.size, type: 'virtual' }));
                else if (d.fileMetadata.pdfCount > 0) state.files.pdf = Array(d.fileMetadata.pdfCount).fill({ name: 'Arquivo PDF já enviado', size: 0, type: 'virtual' });
                if (d.fileMetadata.encargos) state.files.encargos = { name: d.fileMetadata.encargos.name, size: d.fileMetadata.encargos.size, type: 'virtual' };
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
    state.conciliacao = { inss: [], fgts: [], irrf: [], desligados: [] };
    state.files = { planilha: [], pdf: [], ponto: null, encargos: null };
    state.layoutResults = {
        analitico: { ok: false, fields: { 'PRO LABORE': false, 'Proventos': false, 'Descontos': false, 'Base FGTS': false, 'Base FGTS 13º': false, 'Base INSS - Envelope': false, 'Base INSS 13º - Envelope': false, 'INSS': false, 'INSS DIRETOR/AUT': false, 'INSS 13 SALARIO': false, 'IRRF': false } },
        bases: { ok: false, fields: { 'NOME': false, 'CCUSTO': false, 'CODSITUACAO': false, 'CODTIPO': false, 'BASEFGTS': false, 'BASEFGTSAVPREVIO': false, 'BASEFGTS13AVPREVIO': false, 'BASEFGTS13': false, 'BASEFGTSDIFSAL': false, 'FGTS_MES': false, 'FGTS_AVISO': false, 'FGTS13_AVISO': false, 'FGTS13': false, 'FGTSDIF': false, 'BASEINSS': false, 'BASEINSS13': false, 'BASE_INSS_AUTONOMO': false, 'INSS': false, 'INSS13': false, 'INSSFERIAS': false, 'INSSDIFSAL': false, 'BASEIRRF': false, 'BASEIRRFFERIAS': false, 'IRRF': false, 'IRRF13': false, 'IRRFFERIAS': false } },
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
        if (data.fileMetadata.pdf) {
            state.files.pdf = data.fileMetadata.pdf.map(p => ({ name: p.name, size: p.size, type: 'virtual' }));
        } else if (data.fileMetadata.pdfCount > 0) {
            state.files.pdf = Array(data.fileMetadata.pdfCount).fill({ name: 'Arquivo PDF já enviado', size: 0, type: 'virtual' });
        }
        if (data.fileMetadata.encargos) {
            state.files.encargos = { name: data.fileMetadata.encargos.name, size: data.fileMetadata.encargos.size, type: 'virtual' };
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
    
    debugLog('app.initialized', { outcome: 'ready' });
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

    const routed = { pdf: [], planilha: null, encargos: null, esocial: null, dctf: null };
    const extensions = files.map(file => String(file.name || '').split('.').pop().toLowerCase());

    files.forEach(file => {
        const name = file.name.toLowerCase();
        const ext  = name.split('.').pop();

        // Planilha de Bases/Confronto: deve alimentar a conciliação, não o analítico
        if (/base|bases|confronto/i.test(name) && (ext === 'xlsx' || ext === 'xls' || ext === 'csv')) {
            routed.planilha = file;
        }
        // eSocial (resumo S-5011) e DCTFWeb em Excel têm cards próprios
        else if (/esocial/i.test(name) && (ext === 'xlsx' || ext === 'xls')) {
            routed.esocial = file;
        }
        else if (/dctf/i.test(name) && (ext === 'xlsx' || ext === 'xls')) {
            routed.dctf = file;
        }
        // Encargos: GFD, FGTS Digital, guias
        else if (/fgts|gfd|guia|encargo|dctf|esocial/i.test(name) && (ext === 'xlsx' || ext === 'pdf')) {
            routed.encargos = file;
        }
        // PDF ou TXT → sempre analítico
        else if (ext === 'pdf' || ext === 'txt') {
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

    debugLog('upload.routed', {
        count: files.length,
        real: files.filter(file => file.type !== 'virtual').length,
        virtual: files.filter(file => file.type === 'virtual').length,
        extension: [...new Set(extensions)].join(',')
    });

    // Aplicar roteamento substituindo metadados virtuais pelos arquivos reais selecionados.
    const isVirtual = file => file && file.type === 'virtual';
    if (routed.pdf.length) {
        state.files.pdf = [...state.files.pdf.filter(file => !isVirtual(file)), ...routed.pdf];
    }
    if (routed.planilha) {
        state.files.planilha = [...state.files.planilha.filter(file => !isVirtual(file)), routed.planilha];
    }
    if (routed.encargos) state.files.encargos = routed.encargos;
    if (routed.esocial) state.files.esocial = routed.esocial;
    if (routed.dctf) state.files.dctf = routed.dctf;

    // Toast descritivo
    const parts = [];
    if (routed.pdf.length)  parts.push(`${routed.pdf.length} Analítico(s)`);
    if (routed.planilha)    parts.push('1 Planilha');
    if (routed.encargos)    parts.push('1 GRRF');
    if (routed.esocial)     parts.push('1 eSocial');
    if (routed.dctf)        parts.push('1 DCTFWeb');
    showToast(`✅ ${parts.join(', ')} classificado(s) automaticamente`, 'success');

    renderFilePreviews();
    checkUploadProgress();
    saveState();
}


function processUploadedFiles(fileList, type) {
    const files = Array.from(fileList);
    debugLog('upload.selected', {
        slot: type,
        count: files.length,
        real: files.filter(file => file && file.type !== 'virtual').length,
        virtual: files.filter(file => file && file.type === 'virtual').length,
        extension: [...new Set(files.map(file => String(file.name || '').split('.').pop().toLowerCase()))].join(',')
    });

    const realPlanilhas = (state.files.planilha || []).filter(file => file && file.type !== 'virtual');
    const realPdfs = (state.files.pdf || []).filter(file => file && file.type !== 'virtual');
    if (type === 'planilha') {
        state.files.planilha = [...realPlanilhas, ...files];
    } else if (type === 'pdf') {
        state.files.pdf = [...realPdfs, ...files];
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
    ['encargos', 'fgtsDigital', 'esocial', 'dctf'].forEach(type => {
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
    if (state.files.encargos) allFileItems.push({ type: 'GRRF', file: state.files.encargos, key: 'encargos' });
    if (state.files.fgtsDigital) allFileItems.push({ type: 'FGTS Digital', file: state.files.fgtsDigital, key: 'fgtsDigital' });
    if (state.files.esocial) allFileItems.push({ type: 'eSocial', file: state.files.esocial, key: 'esocial' });
    if (state.files.dctf) allFileItems.push({ type: 'DCTFWeb', file: state.files.dctf, key: 'dctf' });

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
    saveState();
}

function clearAllFiles() {
    state.files = { planilha: [], pdf: [], ponto: null, encargos: null };
    renderFilePreviews();
    checkUploadProgress();
    saveState();
}

function checkUploadProgress() {
    const hasPlanilha = state.files.planilha.some(file => file && file.type !== 'virtual');
    const hasReadableFile = [...state.files.pdf, ...state.files.planilha]
        .some(file => file && file.type !== 'virtual');
    const processBtn = document.getElementById('processBtn');
    if (processBtn) processBtn.disabled = !hasReadableFile;

    // Update status badge in sidebar
    const uploadBadge = document.getElementById('uploadBadge');
    if (uploadBadge) uploadBadge.style.display = hasPlanilha ? 'none' : 'block';

    // Update Topbar Status
    const statusPill = document.getElementById('statusPill');
    if (statusPill) {
        const statusDot = statusPill.querySelector('.status-dot');
        const statusText = document.getElementById('statusText');

        if (statusDot && statusText) {
            statusDot.className = hasReadableFile ? 'status-dot green' : 'status-dot';
            statusText.innerText = hasReadableFile ? 'Arquivos Prontos' : 'Aguardando Arquivos';
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
        baseRescisoriaCalculada: 0,
        // Por desligado: quitação (saldo do mês) e 13º rescisão, que correspondem ao FGTS da Planilha de Bases.
        trabalhadores: []
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
            let valueMatches = 0;
            row.forEach(h => {
                const hs = String(h||'').toUpperCase().trim();
                if (/FGTS\s+QUITACAO|Valor\s+fgts\s+folha/i.test(hs)) { matches++; valueMatches++; }
                if (/FGTS\s+MES\s+ANTERIOR/i.test(hs)) { matches++; valueMatches++; }
                if (/^NOME[1]*$/i.test(hs)) matches++;
                if (/^CHAPA$/i.test(hs)) matches++;
                if (/^CODTIPO$/i.test(hs)) matches++;
            });

            // Exige ao menos uma coluna de valor rescisório: NOME + CODTIPO sozinhos
            // também existem na Planilha de Bases e a classificariam como GRRF.
            if (matches >= 2 && valueMatches >= 1) {
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

            if (idx.nome !== -1 && row[idx.nome]) {
                result.qtdDesligados++;
                result.trabalhadores.push({ nome: String(row[idx.nome]).trim(), codtipo: idx.codtipo !== -1 ? String(row[idx.codtipo] || '').toUpperCase().trim() : '', quitacao: q, rescisao13: r13 });
            }
            else if (idx.chapa !== -1 && row[idx.chapa]) result.qtdDesligados++;
        }
    }

    // Usar totalFGTS da linha de total, ou calcular
    if (result.totalFGTS === 0) {
        result.totalFGTS = result.fgtsQuitacao + result.fgtsMesAnterior +
                           result.fgtsAvisoPrevio + result.fgtsArtigo22 +
                           result.fgts13Indenizado + result.fgts13Rescisao;
    }

    debugLog('grrf.extracted', { outcome: result.isGRRF ? 'recognized' : 'not-recognized', count: result.qtdDesligados, fgts: result.totalFGTS });
    return result;
}

async function extractExcelSummary(file) {
    const excelBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(excelBuffer);

    // Planilha de Bases é sempre tabular — pula o scan de rótulos para não
    // confundir valores de data com as labels "Proventos"/"Liquido"
    const isBases = file.name.toLowerCase().includes('base');

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
        let diagnosticHeaderRow = -1;
        let diagnosticMatchedColumns = [];
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
                if (/^Base\s+FGTS\s+13[^\d\s]*(Demitidos|Ativos|Rescisao|SEFIP|Verde|Menor|Afast|Ant)/i.test(cell)) {
                    // Subtipos - ignorar para não duplicar
                } else if (/^Base\s+FGTS\s+13[^\d\s]*/i.test(cell)) {
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
                if (/Base\s+INSS\s+13[^\d\s]*.*?Envelope|Base\s+INSS\s+13[^\d\s]*/i.test(cell)) {
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

        // 2. Se não encontrou rótulos (ou se for Planilha de Bases, que é sempre tabular), assume tabular
        if (isBases || (!foundLabels.bruto && !foundLabels.liquido)) {
            // Detecta a linha de cabeçalho dinamicamente: primeira linha que contém
            // "NOME" (ou "BASEFGTS") em qualquer célula — necessário porque a Planilha de
            // Bases tem um bloco de totais nas primeiras linhas antes da tabela de dados.
            const headerRowIdx = rows.findIndex(r =>
                (r||[]).some(c => /^NOME$|^BASEFGTS$|^BASEINSS$/i.test(String(c||'').trim()))
            );
            const hIdx = headerRowIdx >= 0 ? headerRowIdx : 0;
            diagnosticHeaderRow = hIdx;
            const headers = rows[hIdx] || [];
            // Coletar cabeçalhos crus para validação de layout (Planilha de Bases)
            headers.forEach(h => { const k = String(h||'').trim(); if (k) summary.rawHeaders.add(k); });
            const findCols = (regex) => headers.reduce((acc, h, i) => regex.test(h) ? [...acc, i] : acc, []);
            const idx = {
                bruto: findCols(/total\s+proventos|bruto|vencimentos/i),
                descontos: findCols(/total\s+descontos|descontos/i),
                liquido: findCols(/valor\s+liquido|liquido/i),
                // INSS - expanded patterns to handle "Base de INSS", "Base FGTS", etc.
                inss: findCols(/^BASEINSS$|base\s+inss|base\s+prev|base\s+de\s+inss|inss\s+base/i),
                inss13: findCols(/^BASEINSS13$|base\s+inss\s+13/i),
                inssValor: findCols(/^INSS$|valor\s+inss|inss\s+valor/i),
                inss13Valor: findCols(/^INSS13$|inss\s+13/i),
                inssDiretor: findCols(/inss\s+diretor|inss\s+aut|aut\s+inss/i),
                // FGTS - expanded patterns to handle "Base de FGTS", "FGTS Mensal", "FGTS 13º", etc.
                fgts: findCols(/base\s+fgts$|base\s+fgts\s+mensal|^fgts$|base\s+de\s+fgts|fgts\s+mensal|base\s+FGTS/i),
                fgts13: findCols(/fgts\s+13|FGTS\s+13|base\s+fgts\s+13|base\s+FGTS\s+13/i),
                fgts2: findCols(/fgts\s+2%|fgts\s+menor|2%\s+FGTS/i),
                irrf: findCols(/base\s+irrf|base\s+ir|ir\s+base/i),
                proLabore: findCols(/pro\s*labore/i),
                situacao: headers.findIndex(h => /^CODSITUACAO$/i.test(h) || /SITUA[ÇC][ÃA]O/i.test(h))
            };
            diagnosticMatchedColumns = Object.entries(idx).filter(([, cols]) => Array.isArray(cols) ? cols.length > 0 : cols !== -1).map(([key]) => key);
            const dataRows = rows.slice(hIdx + 1);
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
            debugLog('excel.sheet-skipped', { outcome: 'summary' });
            continue;
        }
        if (isBases || (!foundLabels.bruto && !foundLabels.liquido)) {
            debugLog('excel.sheet-parsed', {
                headerRow: diagnosticHeaderRow,
                matchedColumns: diagnosticMatchedColumns,
                dataRows: Math.max(0, rows.length - diagnosticHeaderRow - 1),
                bases: isBases,
                inss: sheetSummary.bases.inss,
                fgts: sheetSummary.bases.fgts,
                fgts13: sheetSummary.bases.fgts13,
                irrf: sheetSummary.bases.irrf
            });
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
    
    const hasRealAnalitico = state.files.pdf.some(file => !isVirtual(file));
    const hasRealPlanilha = state.files.planilha.some(file => !isVirtual(file));
    debugLog('process.started', {
        count: state.files.pdf.length + state.files.planilha.length,
        real: state.files.pdf.filter(file => !isVirtual(file)).length + state.files.planilha.filter(file => !isVirtual(file)).length,
        virtual: state.files.pdf.filter(isVirtual).length + state.files.planilha.filter(isVirtual).length,
        outcome: hasRealAnalitico || hasRealPlanilha ? 'eligible' : 'no-readable-files'
    });

    // Metadados restaurados não são arquivos legíveis; uploads reais recentes continuam processáveis.
    if (!hasRealAnalitico && !hasRealPlanilha) {
        showToast('Envie novamente os arquivos reais da competência para processar os dados.', 'warning');
        showView('upload', document.querySelector('[data-view=upload]'));
        debugLog('process.finished', { outcome: 'no-readable-files' });
        return;
    }

    showLoading('Lendo Relatório Analítico (Fonte Master)...');
    
    // Resetar resultados de layout antes de nova validação
    Object.keys(state.layoutResults.analitico.fields).forEach(k => state.layoutResults.analitico.fields[k] = false);
    Object.keys(state.layoutResults.bases.fields).forEach(k => state.layoutResults.bases.fields[k] = false);
    Object.keys(state.layoutResults.grrf.fields).forEach(k => state.layoutResults.grrf.fields[k] = false);

    try {
        let pdfProventos = 0, pdfDescontos = 0, pdfLiquidoFolha = 0, pdfLiquidoPro = 0, pdfAtivos = 0, pdfAfastados = 0, pdfDesligados = 0, pdfSalarioFamilia = 0;
        let pdfBases = { inss: 0, inss13: 0, inssAuton: 0, fgts: 0, fgts13: 0, fgts2: 0, irrf: 0, irrf13: 0, irrfFerias: 0 };
        // null = rótulo não encontrado no relatório (0 é um valor lido válido, ex.: CPP zerada no RM).
        let pdfEncargos = { inssEmpresa: null, inssSat: null, inssTerceiros: null, inssSatAjustado: null, inssSegurado: null, fgtsDep: 0, fgts13Dep: 0 };
        const audit = createConciliacaoAudit();

        // 1. Processar somente arquivos reais do Relatório Analítico (PDF, TXT ou Excel)
        for (const file of state.files.pdf.filter(file => !isVirtual(file))) {
            if (file.name.toLowerCase().endsWith('.pdf') || file.name.toLowerCase().endsWith('.txt')) {
                const text = file.name.toLowerCase().endsWith('.pdf') ? await extractTextFromPDF(file) : await file.text();
                const lines = text.split('\n');
                audit.add('Analítico', 'info', `Lendo ${file.name}`, `${lines.length} linhas de texto`);
                
                const parseNum = (str) => {
                    if (!str) return 0;
                    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
                };

                const trace = (field, value, lineIdx, clean, rule) =>
                    auditTraceAnalitico(audit, { field, value, file: file.name, line: lineIdx + 1, text: clean, rule });

                // Bloco por funcionário do RM Labore ("00001934 - NOME ..."), usado na comparação colaborador a colaborador.
                let currentEmp = null;

                lines.forEach((line, lineIdx) => {
                    const clean = line.trim();

                    const mEmp = clean.match(/^(\d{6,})\s+-\s+(.+?)(?:\s{2,}|$)/);
                    if (mEmp) {
                        currentEmp = auditStartEmployee(audit, { chapa: mEmp[1], nome: mEmp[2], file: file.name, line: lineIdx + 1 });
                    } else if (/^TOTAIS\b|TOTAL\s+GERAL\s+DA|^Cod\s+Descri/i.test(clean)) {
                        currentEmp = null;
                    }
                    const rm = rmReadFields(clean);
                    if (currentEmp) {
                        if ('baseInss' in rm) currentEmp.baseInss += rm.baseInss;
                        // "Base INSS 13º - GPS" e "- Envelope" truncados viram o mesmo rótulo: vale o maior do bloco.
                        if ('baseInss13' in rm) currentEmp.baseInss13 = Math.max(currentEmp.baseInss13, rm.baseInss13);
                        if ('baseFgts' in rm) currentEmp.baseFgts += rm.baseFgts;
                        if ('baseFgts13' in rm) currentEmp.baseFgts13 += rm.baseFgts13;
                        if ('inssSegurado' in rm) currentEmp.inssSegurado += rm.inssSegurado;
                        if ('inssEmpresa' in rm) currentEmp.inssEmpresa = rm.inssEmpresa;
                        if ('inssSatAjustado' in rm) currentEmp.inssRat = rm.inssSatAjustado;
                        else if ('inssSat' in rm && !currentEmp.inssRat) currentEmp.inssRat = rm.inssSat;
                        if ('inssTerceiro' in rm) currentEmp.inssTerceiro = rm.inssTerceiro;
                        // Sócio/diretor: rubricas de pró-labore ou INSS diretor (não confundir com o rótulo "Base INSS Pro-Labore").
                        if (/^\d{4}\s+[^\d]*PRO[\s-]+LABORE|\b\d{4}\s+INSS\s+DIRETOR/i.test(clean)) currentEmp.isCI = true;
                    }

                    // 1. Rubricas / Linhas Individuais do Relatório RM Labore
                    // PRO LABORE (ex: 1007 PRO LABORE ... 8.475,55)
                    if (/1007\s+PRO\s+LABORE/i.test(clean) || /^PRO[\s-]LABORE\b/i.test(clean)) {
                        const m = clean.match(/(?:1007\s+PRO\s+LABORE|PRO[\s-]LABORE).*?([\d.]+,\d{2})/i);
                        if (m) {
                            pdfLiquidoPro = Math.max(pdfLiquidoPro, parseNum(m[1]));
                            state.layoutResults.analitico.fields['PRO LABORE'] = true;
                        }
                    }

                    // 1014 SALARIO FAMILIA  3  3  150,84 — só a linha de total (N.F. + Ref); por funcionário vem só a Ref.
                    const mSalFam = clean.match(/1014\s+SALARIO\s+FAMILIA\s+\d+\s+[\d,.]+\s+([\d.]+,\d{2})/i);
                    if (mSalFam) pdfSalarioFamilia = Math.max(pdfSalarioFamilia, parseNum(mSalFam[1]));

                    // 4016 LIQUIDO FOLHA PAGAMENTO ... 589.840,80
                    if (/4016\s+LIQUIDO\s+FOLHA\s+PAGAMENTO/i.test(clean)) {
                        const m = clean.match(/4016\s+LIQUIDO\s+FOLHA\s+PAGAMENTO\s+\d+\s+[\d,.]+\s+([\d.]+,\d{2})/i);
                        if (m) pdfLiquidoFolha = Math.max(pdfLiquidoFolha, parseNum(m[1]));
                    }

                    // 4018 LIQUIDO PAGAMENTO PRO LABORE ... 6.481,86
                    if (/4018\s+LIQUIDO\s+PAGAMENTO\s+PRO\s+LABORE/i.test(clean)) {
                        const m = clean.match(/4018\s+LIQUIDO\s+PAGAMENTO\s+PRO\s+LABORE\s+\d+\s+[\d,.]+\s+([\d.]+,\d{2})/i);
                        if (m && pdfLiquidoPro === 0) pdfLiquidoPro = parseNum(m[1]);
                    }

                    // Eventos INSS / IRRF
                    if (/2075\s+INSS\b|^INSS\s|[\s]INSS[\s]/i.test(clean) && !/Base|13|Diretor|Aut|SAT|Empresa|Terceiro|Segurado/i.test(clean)) {
                        state.layoutResults.analitico.fields['INSS'] = true;
                    }
                    if (/2080\s+INSS\s+DIRETOR\/AUT|INSS\s+DIRETOR|INSS\s+AUT/i.test(clean)) {
                        state.layoutResults.analitico.fields['INSS DIRETOR/AUT'] = true;
                    }
                    if (/2083\s+INSS\s+13\s+SALARIO|INSS\s+13\s+SAL/i.test(clean)) {
                        state.layoutResults.analitico.fields['INSS 13 SALARIO'] = true;
                    }
                    if (/2110\s+IRRF\b|\bIRRF\b/i.test(clean)) {
                        state.layoutResults.analitico.fields['IRRF'] = true;
                    }

                    // 2. Totais e Bases nos Blocos do Relatório (rótulos completos ou truncados; ver RM_FIELDS)
                    const take = (id, label, rule) => {
                        if (!(id in rm)) return false;
                        trace(label, rm[id], lineIdx, clean, rule);
                        return true;
                    };
                    if (take('proventos', 'Proventos', 'max')) {
                        pdfProventos = Math.max(pdfProventos, rm.proventos);
                        state.layoutResults.analitico.fields['Proventos'] = true;
                    }
                    if (take('descontos', 'Descontos', 'max')) {
                        pdfDescontos = Math.max(pdfDescontos, rm.descontos);
                        state.layoutResults.analitico.fields['Descontos'] = true;
                    }
                    if ('liquido' in rm && pdfLiquidoFolha === 0) pdfLiquidoFolha = rm.liquido;
                    if (take('baseInss', 'Base INSS', 'max')) {
                        pdfBases.inss = Math.max(pdfBases.inss, rm.baseInss);
                        state.layoutResults.analitico.fields['Base INSS - Envelope'] = true;
                    }
                    if (take('baseInss13', 'Base INSS 13º', 'max')) {
                        pdfBases.inss13 = Math.max(pdfBases.inss13 || 0, rm.baseInss13);
                        state.layoutResults.analitico.fields['Base INSS 13º - Envelope'] = true;
                    }
                    if (take('baseFgts', 'Base FGTS', 'max')) {
                        pdfBases.fgts = Math.max(pdfBases.fgts, rm.baseFgts);
                        state.layoutResults.analitico.fields['Base FGTS'] = true;
                    }
                    if (take('baseFgts13', 'Base FGTS 13º', 'max')) {
                        pdfBases.fgts13 = Math.max(pdfBases.fgts13, rm.baseFgts13);
                        state.layoutResults.analitico.fields['Base FGTS 13º'] = true;
                    }
                    if (take('baseFgts2', 'Base FGTS 2% (Aprendiz)', 'max')) {
                        pdfBases.fgts2 = Math.max(pdfBases.fgts2 || 0, rm.baseFgts2);
                    }
                    if (take('baseIrrf', 'Base IRRF', 'max')) {
                        pdfBases.irrf = Math.max(pdfBases.irrf, rm.baseIrrf);
                        state.layoutResults.analitico.fields['IRRF'] = true;
                    }
                    // A CPP ("INSS Empresa") do RM inclui 20% sobre a base de autônomos.
                    if (take('baseAuton', 'Base INSS Autônomos', 'max')) {
                        pdfBases.inssAuton = Math.max(pdfBases.inssAuton || 0, rm.baseAuton);
                    }
                    // Encargos: vale a última ocorrência (total geral no fim do relatório). 0 lido ≠ não encontrado.
                    if (take('inssEmpresa', 'INSS Empresa', 'last')) pdfEncargos.inssEmpresa = rm.inssEmpresa;
                    if (take('inssSatAjustado', 'INSS SAT Ajustado', 'last')) pdfEncargos.inssSatAjustado = rm.inssSatAjustado;
                    if (take('inssSat', 'INSS SAT', 'last')) pdfEncargos.inssSat = rm.inssSat;
                    if (take('inssTerceiro', 'INSS Terceiros', 'last')) pdfEncargos.inssTerceiros = rm.inssTerceiro;
                    if (take('inssSegurado', 'INSS Segurado', 'last')) pdfEncargos.inssSegurado = rm.inssSegurado;

                    // 3. Quadro de Funcionários (Rodapé RM Labore)
                    if (/Total\s+de\s+Funcion[áa]rios:/i.test(clean) || /Ativos:/i.test(clean) || /Demitidos:/i.test(clean)) {
                        const mTot = clean.match(/Total\s+de\s+Funcion[áa]rios:\s+(\d+)/i);
                        const mAtv = clean.match(/Ativos:\s+(\d+)/i);
                        const mDem = clean.match(/Demitidos:\s+(\d+)/i);
                        if (mAtv) pdfAtivos = Math.max(pdfAtivos, parseInt(mAtv[1]));
                        else if (mTot) pdfAtivos = Math.max(pdfAtivos, parseInt(mTot[1]));
                        if (mDem) pdfDesligados = Math.max(pdfDesligados, parseInt(mDem[1]));
                    } else if (!/Base|FGTS/i.test(clean)) {
                        const mAtvSimple = clean.match(/Ativos\s+(\d+)(?!\s*[,.])/i);
                        if (mAtvSimple) pdfAtivos = Math.max(pdfAtivos, parseInt(mAtvSimple[1]));
                        const mDemSimple = clean.match(/Demitidos\s+(\d+)(?!\s*[,.])/i);
                        if (mDemSimple) pdfDesligados = Math.max(pdfDesligados, parseInt(mDemSimple[1]));
                    }

                    if (/Af\.\s+Previd[êe]ncia:\s+(\d+)/i.test(clean)) {
                        const mAf = clean.match(/Af\.\s+Previd[êe]ncia:\s+(\d+)/i);
                        if (mAf) pdfAfastados += parseInt(mAf[1]);
                    }
                    if (/Af\.\s+Ac\.\s+Trabalho:\s+(\d+)/i.test(clean)) {
                        const mAc = clean.match(/Af\.\s+Ac\.\s+Trabalho:\s+(\d+)/i);
                        if (mAc) pdfAfastados += parseInt(mAc[1]);
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
                        const match = basesKeys.find(k => k.toLowerCase().replace(/[\s_]+/g, '') === rawKey.toLowerCase().replace(/[\s_]+/g, ''));
                        if (match) state.layoutResults.bases.fields[match] = true;
                    });
                }

                const grrfData = await extractGRRFSummary(file);
                audit.grrfTrabalhadores.push(...grrfData.trabalhadores);
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
                debugLog('excel.summary', {
                    count: summary.colaboradores,
                    inss: summary.bases.inss,
                    fgts: summary.bases.fgts,
                    fgts13: summary.bases.fgts13,
                    irrf: summary.bases.irrf
                });

                const hasFinancialData = summary.bruto > 0 || summary.liquido > 0;

                audit.add('Analítico', hasFinancialData ? 'info' : 'warning', `Lendo ${file.name} (Excel)`,
                    hasFinancialData
                        ? `Somado ao Analítico: Base INSS ${formatCurrency(summary.bases.inss)} | Base FGTS ${formatCurrency(summary.bases.fgts)} | Base FGTS 13º ${formatCurrency(summary.bases.fgts13 || 0)}`
                        : 'Ignorado: sem Proventos/Líquido reconhecidos');
                if (hasFinancialData) {
                    ['inss', 'fgts', 'fgts13', 'fgts2', 'irrf'].forEach(key => {
                        const label = { inss: 'Base INSS', fgts: 'Base FGTS', fgts13: 'Base FGTS 13º', fgts2: 'Base FGTS 2% (Aprendiz)', irrf: 'Base IRRF' }[key];
                        auditTraceAnalitico(audit, { field: label, value: summary.bases[key] || 0, file: file.name, line: null, text: 'Resumo da planilha Excel do Analítico', rule: key === 'fgts13' || key === 'fgts2' ? 'max' : 'sum' });
                    });
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
                    showToast('⚠️ Arquivo não reconhecido como Analítico (sem Proventos/Líquido). Ignorado.', 'warning');
                    debugLog('excel.ignored', { count: summary.colaboradores, outcome: 'no-financial-data' });
                }
            }
        }

        // Fallback para o cálculo do líquido se não encontrar o campo
        if (pdfLiquidoFolha === 0) pdfLiquidoFolha = pdfProventos - pdfDescontos;

        // 2. Processar Excel (Ferramenta de Confronto ou Fonte Master)
        // inss13/inssAutonomo/segurados alimentam os encargos; hasSegurados indica se a Planilha traz o INSS descontado.
        // prolabore/seguradosCI = contribuintes individuais (CODTIPO D); irrf* = IRRF retido; difSal = BASEFGTSDIFSAL.
        let govData = null;
        const govResumo = gov => [gov.esocial && `eSocial (aba "${gov.esocial.aba}"): base ${formatCurrency(gov.esocial.base || 0)}, ${Object.keys(gov.esocial.codes).length} códigos de receita`,
            gov.dctf && `DCTFWeb (aba "${gov.dctf.aba}"): total apurado ${formatCurrency(gov.dctf.totalApurado || 0)}, IRRF ${formatCurrency(gov.dctf.irrf || 0)}`].filter(Boolean).join(' | ');
        let excelBases = { inss: 0, inss13: 0, inssAutonomo: 0, segurados: 0, hasSegurados: false,
            prolabore: 0, seguradosCI: 0, difSal: 0, salarioFamilia: 0, hasSalarioFamilia: false, irrfMensal: 0, irrf13: 0, irrfFerias: 0, hasIrrf: false, fgts: 0, fgts13: 0, fgtsN: 0, fgtsN13: 0, fgtsZ: 0, fgtsZ13: 0, irrf: 0 };
        let excelSummary = { bruto: 0, descontos: 0, liquido: 0, colaboradores: 0, ativos: 0, afastados: 0, desligados: 0 };
        
        // Card GRRF (slot "encargos") passa pelo mesmo leitor da planilha, sem o fallback de bases (abaixo).
        const encargosXlsx = state.files.encargos && /\.xlsx?$/i.test(state.files.encargos.name) ? [state.files.encargos] : [];
        for (const planilhaFile of [...state.files.planilha, ...encargosXlsx].filter(file => !isVirtual(file))) {

            // Executar extrator unificado para validação de layout
            const planSummary = await extractExcelSummary(planilhaFile);

            // Validação de Layout: Planilha de Bases (case-insensitive)
            const isPlanBases = planilhaFile.name.toLowerCase().includes('base');
            if (isPlanBases && planSummary.rawHeaders && planSummary.rawHeaders.length > 0) {
                const basesKeys = Object.keys(state.layoutResults.bases.fields);
                planSummary.rawHeaders.forEach(rawKey => {
                    const match = basesKeys.find(k => k.toLowerCase().replace(/[\s_]+/g, '') === rawKey.toLowerCase().replace(/[\s_]+/g, ''));
                    if (match) state.layoutResults.bases.fields[match] = true;
                });
            }

            const excelBuffer = await planilhaFile.arrayBuffer();
            const workbook = XLSX.read(excelBuffer);

            // Localizar a tabela de bases (cabeçalho com NOME/CODSITUACAO/CODTIPO/BASEINSS/BASEFGTS)
            // em qualquer aba e em qualquer linha (pode vir após um bloco de totais).
            const normalizeHeader = value => String(value || '').trim().toUpperCase().replace(/[\s_]+/g, '');
            const expectedHeaders = ['NOME', 'CODSITUACAO', 'CODTIPO', 'BASEINSS', 'BASEFGTS'];
            let jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
            let headerRowIndex = -1;
            let bestHeaderScore = 0;
            let headers = [];
            let basesSheetName = workbook.SheetNames[0];
            for (const sheetName of workbook.SheetNames) {
                const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
                for (let i = 0; i < sheetRows.length; i++) {
                    const row = sheetRows[i] || [];
                    const normalized = row.map(normalizeHeader);
                    const score = expectedHeaders.filter(field => normalized.includes(field)).length;
                    if (score > bestHeaderScore) {
                        bestHeaderScore = score;
                        headerRowIndex = i;
                        headers = row;
                        jsonData = sheetRows;
                        basesSheetName = sheetName;
                    }
                }
            }
            const hasBasesTable = bestHeaderScore >= 3;

            const gov = extractGovernoSummary(workbook);
            if (gov && !govData) {
                govData = gov;
                audit.add('Governo', 'info', `Valores do governo lidos de ${planilhaFile.name}`, govResumo(gov));
            }
            audit.add('Planilha', hasBasesTable ? 'info' : 'warning', `Lendo ${planilhaFile.name}`,
                hasBasesTable
                    ? `Tabela de bases na aba "${basesSheetName}", cabeçalho na linha ${headerRowIndex + 1} (${bestHeaderScore}/${expectedHeaders.length} colunas-chave)`
                    : `Tabela de bases não localizada (melhor cabeçalho com ${bestHeaderScore}/${expectedHeaders.length} colunas-chave). Abas: ${workbook.SheetNames.join(', ')}`);

            // Detectar se é relatório GRRF (Valores de FGTS Rescisório)
            const grrf = await extractGRRFSummary(planilhaFile);
            audit.grrfTrabalhadores.push(...grrf.trabalhadores);

            // Validação de Layout: GRRF (case-insensitive)
            if (grrf.isGRRF && grrf.foundMetrics) {
                const grrfKeys = Object.keys(state.layoutResults.grrf.fields);
                Object.keys(grrf.foundMetrics).forEach(metric => {
                    const match = grrfKeys.find(k => k.toLowerCase() === metric.toLowerCase());
                    if (match) state.layoutResults.grrf.fields[match] = true;
                });
            }

            if (grrf.isGRRF) {
                audit.add('Planilha', 'info', `GRRF reconhecida em ${planilhaFile.name}`,
                    `${grrf.qtdDesligados} desligados | FGTS rescisório ${formatCurrency(grrf.totalFGTS)} | base rescisória estimada ${formatCurrency(grrf.baseRescisoriaCalculada)}`);
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
            }

            // Bases e GRRF não são exclusivos: o mesmo workbook pode ter a aba BASES e a aba GRRF.
            if (hasBasesTable || (!grrf.isGRRF && planilhaFile !== state.files.encargos)) {
                // Planilha tabular normal de confronto de bases
                if (!hasBasesTable) {
                    jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
                    headerRowIndex = 0;
                    headers = jsonData[0] || [];
                    audit.add('Planilha', 'warning', 'Usando a 1ª linha da 1ª aba como cabeçalho (fallback)', headers.filter(Boolean).join(' | '));
                }

                // Helper para matching flexível de cabeçalhos de bases.
                // Remove palavras de conexão ("DE", "DO", "DA", "E") e sinais para
                // reconhecer variações como "Base de INSS", "Base FGTS", "Base de FGTS", etc.
                const matchBaseHeader = (header, baseName) => {
                    const h = normalizeHeader(header);
                    if (h === baseName) return true;
                    const stripped = h.replace(/\b(DE|DO|DA|DAS|DOS|E)\b/g, '');
                    return stripped === baseName;
                };

                // Mapear campos para validação de layout
                const requiredBasesFields = Object.keys(state.layoutResults.bases.fields);
                requiredBasesFields.forEach(field => {
                    if (headers.some(h => matchBaseHeader(h, field.replace(/[\s_]+/g, '')))) {
                        state.layoutResults.bases.fields[field] = true;
                    }
                });

                const idx = {
                    nome: headers.findIndex(h => normalizeHeader(h) === 'NOME'),
                    inss: headers.findIndex(h => matchBaseHeader(h, 'BASEINSS')),
                    inss13: headers.findIndex(h => matchBaseHeader(h, 'BASEINSS13')),
                    inssAutonomo: headers.findIndex(h => matchBaseHeader(h, 'BASEINSSAUTONOMO')),
                    fgts: headers.findIndex(h => matchBaseHeader(h, 'BASEFGTS')),
                    fgtsAv: headers.findIndex(h => matchBaseHeader(h, 'BASEFGTSAVPREVIO')),
                    fgts13Av: headers.findIndex(h => matchBaseHeader(h, 'BASEFGTS13AVPREVIO')),
                    fgts13: headers.findIndex(h => matchBaseHeader(h, 'BASEFGTS13')),
                    irrf: headers.findIndex(h => matchBaseHeader(h, 'BASEIRRF')),
                    bruto: headers.findIndex(h => /total\s+proventos|bruto|vencimentos/i.test(String(h || ''))),
                    descontos: headers.findIndex(h => /total\s+descontos|descontos/i.test(String(h || ''))),
                    liquido: headers.findIndex(h => /valor\s+liquido|liquido/i.test(String(h || ''))),
                    situacao: headers.findIndex(h => normalizeHeader(h) === 'CODSITUACAO'),
                    codtipo: headers.findIndex(h => normalizeHeader(h) === 'CODTIPO'),
                    // Contribuição do segurado já calculada pela folha (tabela progressiva).
                    inssValor: headers.findIndex(h => normalizeHeader(h) === 'INSS'),
                    inss13Valor: headers.findIndex(h => normalizeHeader(h) === 'INSS13'),
                    inssFerias: headers.findIndex(h => normalizeHeader(h) === 'INSSFERIAS'),
                    inssDifSal: headers.findIndex(h => normalizeHeader(h) === 'INSSDIFSAL'),
                    baseDifSal: headers.findIndex(h => normalizeHeader(h) === 'BASEFGTSDIFSAL'),
                    salarioFamilia: headers.findIndex(h => /^(VALOR)?SAL(ARIO)?FAM(ILIA)?$/.test(normalizeHeader(h))),
                    irrfValor: headers.findIndex(h => normalizeHeader(h) === 'IRRF'),
                    irrf13Valor: headers.findIndex(h => normalizeHeader(h) === 'IRRF13'),
                    irrfFeriasValor: headers.findIndex(h => normalizeHeader(h) === 'IRRFFERIAS'),
                    // Valor do FGTS por colaborador (comparado com o retorno do FGTS Digital).
                    fgtsValores: ['FGTSMES', 'FGTSAVISO', 'FGTS13AVISO', 'FGTS13', 'FGTSDIF'].map(k => headers.findIndex(h => normalizeHeader(h) === k))
                };
                const rows = jsonData.slice(headerRowIndex + 1);
                auditColumnMapping(audit, planilhaFile.name, headers, idx, ['inss', 'fgts', 'fgts13']);
                const planilhaTotalsBefore = { ...excelBases };
                let skippedRows = 0;
                let diretorInss = 0;
                
                if (idx.situacao !== -1) {
                    excelSummary.ativos = 0;
                    excelSummary.afastados = 0;
                    excelSummary.desligados = 0;
                }
                
                rows.forEach((row, rowOffset) => {
                    // Ignorar linhas de Totais no final da planilha (geralmente não possuem NOME ou SITUAÇÃO)
                    const valNome = idx.nome !== -1 ? String(row[idx.nome] || '').trim() : String(row[0] || '').trim();
                    const valSit = idx.situacao !== -1 ? String(row[idx.situacao] || '').trim() : '';
                    if (!valNome && !valSit) {
                        if (row.some(cell => cell !== null && cell !== undefined && cell !== '')) skippedRows++;
                        return;
                    }
                    const excelRow = headerRowIndex + 2 + rowOffset;
                    if (/^total/i.test(valNome)) {
                        audit.add('Planilha', 'warning', `Linha ${excelRow} parece um totalizador e foi somada como colaborador`, valNome);
                    }

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

                    // A conciliação compara a base mensal regular; 13º, autônomos e diretor são rubricas separadas.
                    const tipoInss = idx.codtipo !== -1 ? String(row[idx.codtipo] || '').toUpperCase().trim() : '';
                    const valInss = idx.inss !== -1 ? parseV(row[idx.inss]) : 0;
                    const inssConsiderada = idx.inss !== -1 && tipoInss !== 'D';
                    if (inssConsiderada) excelBases.inss += valInss;
                    else diretorInss += valInss;
                    const valInss13 = idx.inss13 !== -1 ? parseV(row[idx.inss13]) : 0;
                    const valSegurado = ['inssValor', 'inss13Valor', 'inssFerias', 'inssDifSal']
                        .reduce((acc, key) => acc + (idx[key] !== -1 ? parseV(row[idx[key]]) : 0), 0);
                    if (idx.inssValor !== -1) excelBases.hasSegurados = true;
                    // Diretor/sócio (CODTIPO D) é contribuinte individual: pró-labore e INSS (1099) separados dos empregados.
                    if (tipoInss !== 'D') {
                        excelBases.inss13 += valInss13;
                        excelBases.segurados += valSegurado;
                    } else {
                        // Pró-labore: a planilha usa a BASEIRRF do sócio; há empresas com BASEINSS zerada na linha
                        // do sócio (JPL) e outras com as duas iguais (CONCRETA). O maior valor cobre os dois casos.
                        const valIrrfBase = idx.irrf !== -1 ? parseV(row[idx.irrf]) : 0;
                        excelBases.prolabore += Math.max(valInss, valIrrfBase);
                        excelBases.seguradosCI += valSegurado;
                    }
                    const val = key => (idx[key] !== -1 ? parseV(row[idx[key]]) : 0);
                    excelBases.difSal += val('baseDifSal');
                    excelBases.salarioFamilia += val('salarioFamilia');
                    if (idx.salarioFamilia !== -1) excelBases.hasSalarioFamilia = true;
                    excelBases.irrfMensal += val('irrfValor');
                    excelBases.irrf13 += val('irrf13Valor');
                    excelBases.irrfFerias += val('irrfFeriasValor');
                    if (idx.irrfValor !== -1) excelBases.hasIrrf = true;
                    if (idx.inssAutonomo !== -1) excelBases.inssAutonomo += parseV(row[idx.inssAutonomo]);
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

                    audit.planilhaRows.push({
                        arquivo: planilhaFile.name,
                        linha: excelRow,
                        nome: valNome,
                        situacao: valSit,
                        codtipo: tipoInss,
                        baseInss: valInss,
                        inssConsiderada,
                        baseInss13: valInss13,
                        inssSegurado: valSegurado,
                        baseFgts: valFgts,
                        baseFgtsAv: valFgtsAv,
                        baseFgts13: valFgts13,
                        baseFgts13Av: valFgts13Av,
                        baseFgtsDifSal: val('baseDifSal'),
                        fgtsValor: idx.fgtsValores.reduce((acc, c) => acc + (c !== -1 ? parseV(row[c]) : 0), 0),
                        baseIrrf: idx.irrf !== -1 ? parseV(row[idx.irrf]) : 0
                    });
                    
                    if (idx.codtipo !== -1) {
                        const tipo = String(row[idx.codtipo] || '').toUpperCase().trim();
                        if (tipo === 'Z') {
                            excelBases.fgtsZ += sumMensal;
                            excelBases.fgtsZ13 += sum13;
                        }
                    }
                });
                
                // Salário-família: sem coluna por colaborador, vem do bloco de resumo acima da tabela
                // ("VALOR SALARIO FAMILIA" com o valor logo abaixo — 1 a 3 linhas — ou à direita).
                if (idx.salarioFamilia === -1) {
                    const toNum = v => (typeof v === 'number' ? v : (typeof v === 'string' && /^\s*-?[\d.]+(,\d+)?\s*$/.test(v) ? parseFloat(v.replace(/\./g, '').replace(',', '.')) : null));
                    outer:
                    for (let r = 0; r < headerRowIndex; r++) {
                        const row = jsonData[r] || [];
                        for (let c = 0; c < row.length; c++) {
                            if (!/sal[aá]rio\s*fam[ií]lia/i.test(String(row[c] ?? ''))) continue;
                            let found = null;
                            for (let d = 1; d <= 3 && found === null; d++) found = toNum((jsonData[r + d] || [])[c]);
                            if (found === null) found = row.slice(c + 1).map(toNum).find(v => v !== null) ?? null;
                            if (found !== null) {
                                excelBases.salarioFamilia += found;
                                excelBases.hasSalarioFamilia = true;
                                audit.add('Planilha', 'info', `Salário-família lido do bloco de resumo de ${planilhaFile.name}`, `${formatCurrency(found)} (célula ${XLSX.utils.encode_col(c)}${r + 1} e abaixo)`);
                                break outer;
                            }
                        }
                    }
                }

                // Cálculo das Bases Tipo N (Regular)
                excelBases.fgtsN = excelBases.fgts - excelBases.fgtsZ;
                excelBases.fgtsN13 = excelBases.fgts13 - excelBases.fgtsZ13;

                const fileRows = audit.planilhaRows.filter(r => r.arquivo === planilhaFile.name);
                audit.add('Planilha', 'info', `Totais lidos de ${planilhaFile.name}`,
                    `${fileRows.length} colaboradores | ${skippedRows} linhas sem NOME/CODSITUACAO ignoradas | ` +
                    `Base INSS +${formatCurrency(excelBases.inss - planilhaTotalsBefore.inss)} | ` +
                    `Base FGTS (+ aviso prévio) +${formatCurrency(excelBases.fgts - planilhaTotalsBefore.fgts)} | ` +
                    `Base FGTS 13º (+ aviso prévio) +${formatCurrency(excelBases.fgts13 - planilhaTotalsBefore.fgts13)}`);
                if (diretorInss > 0) {
                    audit.add('Planilha', 'info', 'Base INSS de diretores (CODTIPO D) excluída da conciliação', formatCurrency(diretorInss));
                }
                
                if (idx.situacao !== -1) {
                    excelSummary.colaboradores = excelSummary.ativos;
                }
            }
        }

        // 3. Atualizar Dashboard (Prioridade PDF (Analítico) > Planilha Complementar)
        state.summary.ativos = pdfAtivos || excelSummary.ativos || excelSummary.colaboradores;
        state.summary.afastados = pdfAfastados || excelSummary.afastados || 0;
        state.summary.desligados = pdfDesligados || excelSummary.desligados || 0;
        
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

        // Calcular encargos patronais (utiliza valores diretos do relatório RM se presentes, ou calcula com alíquotas)
        // Alíquotas patronais incidem sobre a base mensal + a base do 13º (conferido com o RM:
        // Base INSS - Envelope + Base INSS 13º - Envelope reproduz SAT, RAT×FAP e Terceiros ao centavo).
        const aliqPatronal = (cfg.patronal || 20) / 100;
        const aliqRatFap = ((cfg.rat || 2) / 100) * (cfg.fap || 1.00);
        const aliqTerceiros = (cfg.terceiros || 5.8) / 100;
        const inssBaseTotalAnalitico = inssBase + (pdfBases.inss13 || 0);

        // Contribuintes individuais no Analítico: em algumas empresas (JPL) o sócio vem como um bloco comum
        // (1007 PRO LABORE / 2080 INSS DIRETOR) e entra nos totais do RM — inclusive com RAT e Terceiros, que
        // não são devidos para CI. Separa esses blocos para comparar só empregados (1082/1138-01/1646/terceiros).
        const planilhaCINames = new Set(audit.planilhaRows.filter(r => r.codtipo === 'D').map(r => auditNameKey(r.nome)));
        const ciBlocks = audit.analiticoEmployees.filter(e => e.isCI || planilhaCINames.has(auditNameKey(e.nome)));
        const ciA = ciBlocks.reduce((acc, e) => ({
            base: acc.base + e.baseInss + e.baseInss13, seg: acc.seg + e.inssSegurado,
            // Bloco de pró-labore do RM pode vir sem "INSS Empresa" (Concreta): CPP = base do bloco × alíquota patronal.
            emp: acc.emp + (e.inssEmpresa || (e.baseInss + e.baseInss13) * aliqPatronal), rat: acc.rat + e.inssRat, ter: acc.ter + e.inssTerceiro
        }), { base: 0, seg: 0, emp: 0, rat: 0, ter: 0 });
        if (ciBlocks.length) {
            audit.add('Analítico', ciA.rat + ciA.ter > 0.005 ? 'warning' : 'info',
                `Contribuinte(s) individual(is) no Analítico separado(s) dos empregados: ${ciBlocks.map(e => e.nome).join(', ')}`,
                `Base ${formatCurrency(ciA.base)}, INSS ${formatCurrency(ciA.seg)}, CPP ${formatCurrency(ciA.emp)}` +
                (ciA.rat + ciA.ter > 0.005 ? `. O RM calculou RAT ${formatCurrency(ciA.rat)} e Terceiros ${formatCurrency(ciA.ter)} sobre o pró-labore — não devidos para contribuinte individual no eSocial.` : ''));
        }

        const inssBaseEncargos = inssBaseTotalAnalitico - ciA.base;
        // INSS Empresa do RM inclui 20% sobre autônomos; separa a parte de empregados (código 1138-01).
        const patronalCIAnalitico = (pdfBases.inssAuton || 0) * aliqPatronal;
        const patronal  = pdfEncargos.inssEmpresa !== null ? pdfEncargos.inssEmpresa - patronalCIAnalitico - ciA.emp : (inssBaseEncargos * aliqPatronal);
        const ratLido = pdfEncargos.inssSatAjustado ?? pdfEncargos.inssSat;
        const ratfap    = ratLido !== null ? ratLido - ciA.rat : (inssBaseEncargos * aliqRatFap);
        const terceiros = pdfEncargos.inssTerceiros !== null ? pdfEncargos.inssTerceiros - ciA.ter : (inssBaseEncargos * aliqTerceiros);
        const segurados = pdfEncargos.inssSegurado !== null ? pdfEncargos.inssSegurado - ciA.seg : (inssBaseEncargos * 0.09);

        // Valor do FGTS Mensal considerando o split de 8% e 2% (Aprendiz)
        const base2Mensal = Math.min(fgtsBase2, fgtsMensalBase);
        const base8Mensal = fgtsMensalBase - base2Mensal;
        const fgtsValor = (base8Mensal * 0.08) + (base2Mensal * 0.02);
        
        // Valor do FGTS 13º (Geralmente 8%)
        const fgts13Valor = fgts13Base * 0.08;

        // Estrutura da apuração (mesma da planilha de bases / prompt de apuração):
        //   empregados: base folha (mensal + 13º + dif. salarial), segurados 1082, patronal 1138-01, RAT 1646, terceiros;
        //   contribuintes individuais (pró-labore + autônomos): segurados 1099 e patronal 1138-04;
        //   guia INSS = subtotal empregados + CI − salário-família.
        // null = não se aplica à fonte (exibido como "—" e fora do cálculo de divergência).
        state.conciliacao.inss = [
            {
                origem: 'Folha Interna (Analítico)',
                base: inssBaseEncargos,
                baseEncargos: inssBaseEncargos,
                segurados: segurados,
                patronal: patronal,
                ratfap: ratfap,
                terceiros: terceiros,
                subtotal: segurados + patronal + ratfap + terceiros,
                // CI só quando o sócio vem no Analítico (blocos de pró-labore); senão "—". Guia fica "—".
                baseCI: ciBlocks.length ? ciA.base + (pdfBases.inssAuton || 0) : null,
                seguradosCI: ciBlocks.length ? ciA.seg : null,
                patronalCI: ciBlocks.length ? ciA.emp + patronalCIAnalitico : null,
                salarioFamilia: pdfSalarioFamilia, total: null
            }
        ];

        // Sem Analítico legível (ou sem nenhum valor de INSS nele), a coluna fica "—" em vez de R$ 0,00 divergente.
        if (!hasRealAnalitico || inssBaseTotalAnalitico === 0) {
            Object.keys(state.conciliacao.inss[0]).forEach(k => { if (k !== 'origem') state.conciliacao.inss[0][k] = null; });
        }

        if (state.files.planilha.length > 0) {
            const baseEncargosExcel = excelBases.inss + excelBases.inss13 + excelBases.difSal;
            const segExcel = excelBases.hasSegurados ? excelBases.segurados : baseEncargosExcel * 0.09;
            const patExcel = baseEncargosExcel * aliqPatronal;
            const ratExcel = baseEncargosExcel * aliqRatFap;
            const terExcel = baseEncargosExcel * aliqTerceiros;
            const baseCIExcel = excelBases.prolabore + excelBases.inssAutonomo;
            const subtotalExcel = segExcel + patExcel + ratExcel + terExcel;
            state.conciliacao.inss.push({
                origem: 'Planilha Auxiliar (Confronto)',
                base: baseEncargosExcel,
                baseEncargos: baseEncargosExcel,
                segurados: segExcel,
                patronal: patExcel,
                ratfap: ratExcel,
                terceiros: terExcel,
                subtotal: subtotalExcel,
                baseCI: baseCIExcel,
                seguradosCI: excelBases.seguradosCI,
                patronalCI: baseCIExcel * aliqPatronal,
                // Planilha sem coluna/resumo de salário-família: "—" (fora da comparação), não R$ 0,00.
                salarioFamilia: excelBases.hasSalarioFamilia ? excelBases.salarioFamilia : null,
                total: subtotalExcel + excelBases.seguradosCI + baseCIExcel * aliqPatronal - excelBases.salarioFamilia
            });
        }

        // Cards eSocial e DCTFWeb: têm prioridade sobre abas coladas na Planilha; um arquivo completa o outro.
        for (const govFile of [state.files.esocial, state.files.dctf].filter(f => f && !isVirtual(f))) {
            const gov = extractGovernoSummary(XLSX.read(await govFile.arrayBuffer()));
            if (!gov) {
                audit.add('Governo', 'error', `${govFile.name} não reconhecido como eSocial nem DCTFWeb`,
                    'eSocial: resumo com "11 - Base de cálculo da contribuição previdenciária" e códigos de receita; DCTFWeb: "Débitos apurados" / "Total Apurado Empresa"');
                continue;
            }
            govData = { esocial: gov.esocial || (govData && govData.esocial), dctf: gov.dctf || (govData && govData.dctf) };
            audit.add('Governo', 'info', `Valores do governo lidos de ${govFile.name}`, govResumo(gov));
        }

        state.conciliacao.inss.push(buildGovernoINSS(govData, aliqPatronal));

        // IRRF: Planilha (IRRF + IRRF 13º + IRRF férias) × DCTFWeb (0561).
        state.conciliacao.irrf = [];
        if (excelBases.hasIrrf) {
            state.conciliacao.irrf.push({
                origem: 'Planilha Auxiliar (Confronto)',
                irrfMensal: excelBases.irrfMensal,
                irrf13: excelBases.irrf13,
                irrfFerias: excelBases.irrfFerias,
                total: excelBases.irrfMensal + excelBases.irrf13 + excelBases.irrfFerias
            });
            state.conciliacao.irrf.push(govData && govData.dctf
                ? { origem: 'Governo (DCTFWeb)', synced: true, irrfMensal: null, irrf13: null, irrfFerias: null, total: govData.dctf.irrf }
                : { origem: 'Governo (DCTFWeb)', synced: false });
        }

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

        const fgtsDigitalCsvs = state.files.fgtsDigital && !isVirtual(state.files.fgtsDigital) ? await readFgtsDigital(state.files.fgtsDigital) : null;
        state.conciliacao.fgts.push(buildGovernoFgts(audit, fgtsDigitalCsvs ? fgtsDigitalCsvs.tiposDeValor : ''));

        const ratTxt = `${(aliqRatFap * 100).toFixed(4).replace('.', ',')}% (RAT ${cfg.rat || 2}% × FAP ${cfg.fap || 1})`;
        const pctTxt = v => `${(v * 100).toFixed(2).replace('.', ',')}%`;
        const origemEncargo = (valorRelatorio, label, aliquotaTxt) => valorRelatorio !== null && valorRelatorio !== undefined
            ? `"${label}" lido do relatório${valorRelatorio === 0 ? ' (valor zerado no relatório)' : ''}`
            : `(Base INSS + Base INSS 13º) × ${aliquotaTxt} ("${label}" não encontrado no relatório)`;
        audit.formulas.push(
            { fonte: 'Analítico', metrica: 'INSS · Base Folha', formula: `"Base INSS - Envelope" ${formatCurrency(inssBase)} + "Base INSS 13º - Envelope" ${formatCurrency(pdfBases.inss13 || 0)}` + (ciA.base ? ` − contribuintes individuais ${formatCurrency(ciA.base)}` : ''), valor: inssBaseEncargos },
            { fonte: 'Analítico', metrica: 'INSS · Segurados (1082)', formula: origemEncargo(pdfEncargos.inssSegurado, 'INSS Segurado', '9%'), valor: segurados },
            { fonte: 'Analítico', metrica: 'INSS · Salário-Família', formula: '"1014 SALARIO FAMILIA" do total geral (0 quando a rubrica não aparece)', valor: pdfSalarioFamilia },
            { fonte: 'Analítico', metrica: 'INSS · Patronal (1138-01)', formula: pdfEncargos.inssEmpresa !== null
                ? `"INSS Empresa" lido do relatório (${formatCurrency(pdfEncargos.inssEmpresa)}) − autônomos ${formatCurrency(pdfBases.inssAuton || 0)} × ${pctTxt(aliqPatronal)}`
                : origemEncargo(0, 'INSS Empresa', pctTxt(aliqPatronal)), valor: patronal },
            { fonte: 'Analítico', metrica: 'INSS · RAT Ajustado (1646)', formula: origemEncargo(pdfEncargos.inssSatAjustado ?? pdfEncargos.inssSat, pdfEncargos.inssSatAjustado !== null ? 'INSS SAT Ajustado' : 'INSS SAT', ratTxt), valor: ratfap },
            { fonte: 'Analítico', metrica: 'INSS · Terceiros', formula: origemEncargo(pdfEncargos.inssTerceiros, 'INSS Terceiro', pctTxt(aliqTerceiros)), valor: terceiros },
            ciBlocks.length
                ? { fonte: 'Analítico', metrica: 'INSS · Base Contribuintes Individuais', formula: `Blocos de pró-labore (${ciBlocks.map(e => e.nome).join(', ')}) + "Base INSS Auton." ${formatCurrency(pdfBases.inssAuton || 0)}; encargos desses blocos descontados dos empregados`, valor: ciA.base + (pdfBases.inssAuton || 0) }
                : { fonte: 'Analítico', metrica: 'INSS · Contribuintes Individuais', formula: 'Não se aplica: o Analítico do RM não traz o pró-labore do sócio', valor: null },
            { fonte: 'Analítico', metrica: 'FGTS · Base Mensal', formula: 'Maior "Base FGTS" do relatório', valor: fgtsMensalBase },
            { fonte: 'Analítico', metrica: 'FGTS · Valor Mensal', formula: `(${formatCurrency(base8Mensal)} × 8%) + (${formatCurrency(base2Mensal)} aprendiz × 2%)`, valor: fgtsValor },
            { fonte: 'Analítico', metrica: 'FGTS · Base 13º', formula: 'Maior "Base FGTS 13º" do relatório', valor: fgts13Base },
            { fonte: 'Analítico', metrica: 'FGTS · Valor 13º', formula: `${formatCurrency(fgts13Base)} × 8%`, valor: fgts13Valor }
        );
        if (state.files.planilha.length > 0) {
            const base2Excel = excelBases.fgtsZ || 0;
            const baseEnc = excelBases.inss + excelBases.inss13 + excelBases.difSal;
            const baseEncTxt = 'Base Folha';
            const baseCI = excelBases.prolabore + excelBases.inssAutonomo;
            audit.formulas.push(
                { fonte: 'Planilha', metrica: 'INSS · Base Folha', formula: `Σ BASEINSS ${formatCurrency(excelBases.inss)} + Σ BASEINSS13 ${formatCurrency(excelBases.inss13)} + Σ BASEFGTSDIFSAL ${formatCurrency(excelBases.difSal)} (sem CODTIPO D)`, valor: baseEnc },
                excelBases.hasSegurados
                    ? { fonte: 'Planilha', metrica: 'INSS · Segurados (1082)', formula: 'Σ (INSS + INSS13 + INSSFERIAS + INSSDIFSAL) com CODTIPO ≠ D', valor: excelBases.segurados }
                    : { fonte: 'Planilha', metrica: 'INSS · Segurados (1082)', formula: `${baseEncTxt} × 9% (Planilha sem coluna INSS; estimativa sem tabela progressiva)`, valor: baseEnc * 0.09 },
                { fonte: 'Planilha', metrica: 'INSS · Patronal (1138-01)', formula: `${baseEncTxt} × ${pctTxt(aliqPatronal)}`, valor: baseEnc * aliqPatronal },
                { fonte: 'Planilha', metrica: 'INSS · RAT Ajustado (1646)', formula: `${baseEncTxt} × ${ratTxt}`, valor: baseEnc * aliqRatFap },
                { fonte: 'Planilha', metrica: 'INSS · Terceiros', formula: `${baseEncTxt} × ${pctTxt(aliqTerceiros)}`, valor: baseEnc * aliqTerceiros },
                { fonte: 'Planilha', metrica: 'INSS · Base Contribuintes Individuais', formula: `Pró-labore (CODTIPO D: maior entre BASEINSS e BASEIRRF) ${formatCurrency(excelBases.prolabore)} + Σ BASE_INSS_AUTONOMO ${formatCurrency(excelBases.inssAutonomo)}`, valor: baseCI },
                { fonte: 'Planilha', metrica: 'INSS · Segurados CI (1099)', formula: 'Σ (INSS + INSS13 + INSSFERIAS + INSSDIFSAL) com CODTIPO = D', valor: excelBases.seguradosCI },
                { fonte: 'Planilha', metrica: 'INSS · Patronal CI (1138-04)', formula: `Base CI × ${pctTxt(aliqPatronal)}`, valor: baseCI * aliqPatronal },
                { fonte: 'Planilha', metrica: 'INSS · Total Guia INSS', formula: 'Subtotal empregados + Segurados CI + Patronal CI − Salário-família', valor: (state.conciliacao.inss.find(x => /Confronto/.test(x.origem)) || {}).total ?? null },
                { fonte: 'Planilha', metrica: 'IRRF · Total IRRF', formula: `Σ IRRF ${formatCurrency(excelBases.irrfMensal)} + Σ IRRF13 ${formatCurrency(excelBases.irrf13)} + Σ IRRFFERIAS ${formatCurrency(excelBases.irrfFerias)}`, valor: excelBases.irrfMensal + excelBases.irrf13 + excelBases.irrfFerias },
                { fonte: 'Planilha', metrica: 'FGTS · Base Mensal', formula: 'Σ (BASEFGTS + BASEFGTSAVPREVIO)', valor: excelBases.fgts },
                { fonte: 'Planilha', metrica: 'FGTS · Valor Mensal', formula: `(${formatCurrency(excelBases.fgts - base2Excel)} × 8%) + (${formatCurrency(base2Excel)} CODTIPO Z × 2%)`, valor: (excelBases.fgts - base2Excel) * 0.08 + base2Excel * 0.02 },
                { fonte: 'Planilha', metrica: 'FGTS · Base 13º', formula: 'Σ (BASEFGTS13 + BASEFGTS13AVPREVIO)', valor: excelBases.fgts13 },
                { fonte: 'Planilha', metrica: 'FGTS · Valor 13º', formula: `${formatCurrency(excelBases.fgts13)} × 8%`, valor: excelBases.fgts13 * 0.08 }
            );
        }
        if (govData) {
            const govInss = state.conciliacao.inss.find(x => /Governo/.test(x.origem)) || {};
            const codeTxt = codes => codes.map(c => `${c.codigo} ${formatCurrency(c.valor)}`).join(' + ');
            const esCodes = govData.esocial ? Object.values(govData.esocial.codes) : [];
            const pickCodes = pred => esCodes.filter(pred);
            if (govData.esocial) audit.formulas.push(
                { fonte: 'Governo', metrica: 'INSS · Base Folha', formula: `eSocial "11 - Base de cálculo" ${formatCurrency(govData.esocial.base || 0)} − Base CI (1138-04 ÷ ${pctTxt(aliqPatronal)})`, valor: govInss.base ?? null },
                { fonte: 'Governo', metrica: 'INSS · Segurados (1082)', formula: codeTxt(pickCodes(c => c.codigo === '1082-01')), valor: govInss.segurados ?? null },
                { fonte: 'Governo', metrica: 'INSS · Patronal (1138-01)', formula: codeTxt(pickCodes(c => c.codigo === '1138-01')), valor: govInss.patronal ?? null },
                { fonte: 'Governo', metrica: 'INSS · RAT Ajustado (1646)', formula: codeTxt(pickCodes(c => c.codigo.startsWith('1646') || /GILRAT/i.test(c.descricao))), valor: govInss.ratfap ?? null },
                { fonte: 'Governo', metrica: 'INSS · Terceiros', formula: codeTxt(pickCodes(c => /TERCEIROS/i.test(c.descricao))), valor: govInss.terceiros ?? null },
                { fonte: 'Governo', metrica: 'INSS · Segurados CI (1099)', formula: codeTxt(pickCodes(c => c.codigo === '1099-01')), valor: govInss.seguradosCI ?? null },
                { fonte: 'Governo', metrica: 'INSS · Patronal CI (1138-04)', formula: codeTxt(pickCodes(c => c.codigo === '1138-04')), valor: govInss.patronalCI ?? null }
            );
            if (govData.dctf) audit.formulas.push(
                { fonte: 'Governo', metrica: 'INSS · Total Guia INSS', formula: `DCTFWeb total apurado ${formatCurrency(govData.dctf.totalApurado || 0)} − IRRF ${formatCurrency(govData.dctf.irrf || 0)}`, valor: govInss.total ?? null },
                { fonte: 'Governo', metrica: 'IRRF · Total IRRF', formula: 'DCTFWeb: Total IRRF (0561)', valor: govData.dctf.irrf }
            );
        } else if (state.files.planilha.length > 0) {
            audit.add('Governo', 'warning', 'Abas eSocial/DCTFWeb não encontradas na Planilha de Bases', 'A coluna Governo fica sem valores; inclua as abas com o resumo do eSocial (S-5011) e os débitos da DCTFWeb.');
        }
        audit.finalizeAnalitico({
            'Base INSS': pdfBases.inss,
            'Base INSS 13º': pdfBases.inss13 || 0,
            'Base INSS Autônomos': pdfBases.inssAuton || 0,
            'Base FGTS': pdfBases.fgts,
            'Base FGTS 13º': pdfBases.fgts13 || 0,
            'Base FGTS 2% (Aprendiz)': pdfBases.fgts2 || 0,
            'Base IRRF': pdfBases.irrf,
            'INSS Empresa': pdfEncargos.inssEmpresa,
            'INSS SAT Ajustado': pdfEncargos.inssSatAjustado,
            'INSS SAT': pdfEncargos.inssSat,
            'INSS Terceiros': pdfEncargos.inssTerceiros,
            'INSS Segurado': pdfEncargos.inssSegurado
        });
        audit.colaboradores = buildComparacaoColaboradores(audit);
        if (fgtsDigitalCsvs) {
            audit.fgtsDigital = buildComparacaoFgtsDigital(audit, state.files.fgtsDigital.name, fgtsDigitalCsvs.trabalhadores);
        }
        audit.divergencias = buildDivergencias(state.conciliacao, audit);
        conciliacaoAudit = audit;

        debugLog('reconciliation.assigned', {
            inss: excelBases.inss,
            fgts: excelBases.fgts,
            fgts13: excelBases.fgts13,
            irrf: excelBases.irrf,
            outcome: state.files.planilha.some(file => !isVirtual(file)) ? 'with-bases-file' : 'without-bases-file'
        });
        updateKPIs();
        updateStep(1, 'done');
        updateStep(2, 'active');
        
        hideLoading();
        showToast('Análise do Relatório Analítico concluída!', 'success');
        
        // Compara base com base (antes comparava Proventos × Base INSS e alertava sempre).
        if (pdfBases.inss > 0 && excelBases.inss > 0 && Math.abs(pdfBases.inss - excelBases.inss) >= 0.01) {
            showToast(`Alerta: Base INSS do Analítico (${formatCurrency(pdfBases.inss)}) diverge da Planilha de Bases (${formatCurrency(excelBases.inss)}). Veja o Log de Conciliação.`, 'warning');
        }

        showView('validacao', document.querySelector('[data-view=validacao]'));
        runAllValidations();
        renderConciliacao(); // Garante que as tabelas e a guia sejam renderizadas com os novos dados
        saveState();
        debugLog('process.finished', { outcome: 'success' });

    } catch (err) {
        debugLog('process.failed', { outcome: 'exception', errorType: err && err.name ? String(err.name).slice(0, 40) : 'unknown' });
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
            v.desc = '<strong>Motivo:</strong> Relatório Analítico (PDF, TXT ou Excel) não identificado.';
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
        // GRRF pode estar em pdf, planilha ou encargos, dependendo do tipo de upload/roteamento.
        const uploadedFiles = [
            ...(state.files.pdf || []),
            ...(state.files.planilha || []),
            ...(state.files.encargos ? [state.files.encargos] : [])
        ];
        const hasGRRF = !!state.files.encargos || uploadedFiles.some(f => /grrf/i.test(String(f?.name || '')));
        const fields = state.layoutResults.grrf.fields;
        // RM só exporta colunas de FGTS com movimento; exigir só os identificadores (o extrator já exige uma coluna de valor).
        const missing = ['NOME', 'CHAPA', 'CODTIPO'].filter(name => !fields[name]);

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
function renderReportTable(headers, rows) {
    const th = headers.map(label => `<th style="padding:10px; border:1px solid #ddd; text-align:left">${escapeHtml(label)}</th>`).join('');
    const body = rows.length
        ? rows.map(row => `<tr>${row.map(value => `<td style="padding:10px; border:1px solid #ddd">${escapeHtml(value)}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${headers.length}" style="padding:12px; border:1px solid #ddd; color:#666">Nenhum dado disponível para esta competência.</td></tr>`;
    return `<table style="width:100%; border-collapse:collapse"><thead><tr style="background:#f8fafc">${th}</tr></thead><tbody>${body}</tbody></table>`;
}

function reportMoney(value) {
    return value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : formatCurrency(Number(value));
}

function generateReport(type) {
    const preview = document.getElementById('reportPreview');
    const content = document.getElementById('reportContent');
    const title = document.getElementById('previewTitle');
    if (!preview || !content || !title) return;

    const titles = {
        resumo: 'Resumo Consolidado da Folha',
        validacao: 'Relatório de Validação e Auditoria',
        encargos: 'Encargos Sociais da Competência',
        holerites: 'Contracheques da Competência',
        divergencias: 'Inconsistências Identificadas',
        historico: 'Log de Atividades RH'
    };
    title.innerText = titles[type] || 'Relatório indisponível';

    const summary = state.summary || {};
    const liquidAmount = Number.isFinite(Number(summary.liquidoFolha))
        ? Number(summary.liquidoFolha)
        : Number(summary.bruto || 0) - Number(summary.descontos || 0);
    const details = {
        resumo: () => renderReportTable(
            ['Indicador', 'Quantidade / Valor'],
            [
                ['Colaboradores ativos', String(summary.ativos ?? 0)],
                ['Colaboradores afastados', String(summary.afastados ?? 0)],
                ['Colaboradores desligados', String(summary.desligados ?? 0)],
                ['Total bruto', reportMoney(summary.bruto)],
                ['Descontos', reportMoney(summary.descontos)],
                ['Líquido da folha', reportMoney(liquidAmount)],
                ['Líquido de pró-labore', reportMoney(summary.liquidoProLabore)]
            ]),
        validacao: () => renderReportTable(
            ['Validação', 'Status', 'Detalhe'],
            (state.validations || []).map(v => [v.title || v.id || 'Validação', v.status || 'Pendente', String(v.desc || '').replace(/<[^>]*>/g, '')])
        ),
        encargos: () => {
            const groups = [
                ['INSS', state.conciliacao?.inss || [], [['Base Folha', 'base'], ['Segurados (1082)', 'segurados'], ['Patronal (1138-01)', 'patronal'], ['RAT Ajustado (1646)', 'ratfap'], ['Terceiros', 'terceiros'], ['Subtotal Empregados', 'subtotal'], ['Base Contribuintes Individuais', 'baseCI'], ['Segurados CI (1099)', 'seguradosCI'], ['Patronal CI (1138-04)', 'patronalCI'], ['Salário-Família', 'salarioFamilia'], ['Total Guia INSS', 'total']]],
                ['IRRF', state.conciliacao?.irrf || [], [['IRRF Mensal', 'irrfMensal'], ['IRRF 13º', 'irrf13'], ['IRRF Férias', 'irrfFerias'], ['Total IRRF', 'total']]],
                ['FGTS', state.conciliacao?.fgts || [], [['Base FGTS Mensal', 'baseMensal'], ['Valor FGTS Mensal', 'valorMensal'], ['Base FGTS 13º', 'base13'], ['Valor FGTS 13º', 'valor13'], ['Base FGTS Rescisória', 'baseRescisoria'], ['Valor FGTS Rescisório', 'valorRescisorio'], ['Total a Recolher', 'total']]]
            ];
            return groups.map(([name, sources, metrics]) => {
                const table = renderReportTable(['Métrica', ...sources.map(s => s.origem || 'Fonte')], metrics.map(([label, key]) => [label, ...sources.map(s => reportMoney(s[key]))]));
                return `<h3 style="margin:20px 0 8px">${name}</h3>${table}`;
            }).join('');
        },
        holerites: () => '<p>Não é possível emitir holerites individuais com os dados disponíveis. Esta aplicação importa totais e bases para conferência, mas não mantém os eventos individualizados de proventos e descontos necessários para compor contracheques. Nenhum holerite foi gerado.</p>',
        divergencias: () => {
            const rows = conciliacaoAudit?.divergencias || [];
            return rows.length
                ? renderReportTable(['Tributo', 'Métrica', 'Analítico', 'Planilha', 'Governo', 'Analítico − Planilha', 'Planilha − Governo', 'Diagnóstico'], rows.map(d => [d.tributo, d.metrica, reportMoney(d.analitico), reportMoney(d.planilha), reportMoney(d.governo), reportMoney(d.diferenca), reportMoney(d.difGov), (d.motivos || []).join(' ') ]))
                : '<p>Não há log de conciliação disponível nesta sessão. Processe os arquivos na competência atual para gerar as divergências.</p>';
        },
        historico: () => {
            const entries = conciliacaoAudit?.entries || [];
            return entries.length
                ? renderReportTable(['Etapa', 'Nível', 'Evento', 'Detalhe'], entries.map(e => [e.stage, e.level, e.message, e.detail]))
                : '<p>Não há eventos de processamento disponíveis nesta sessão. O histórico detalhado é mantido apenas durante a sessão atual do navegador.</p>';
        }
    };

    const body = details[type] ? details[type]() : '<p>Tipo de relatório desconhecido.</p>';
    content.innerHTML = `
        <div style="display:flex; justify-content:space-between; border-bottom:2px solid #333; padding-bottom:15px; margin-bottom:20px">
            <div>
                <h2 style="margin:0">FolhaPay</h2>
                <p style="margin:5px 0; color:#666">Competência: ${escapeHtml(getCompetenciaExtenso())}</p>
            </div>
            <div style="text-align:right">
                <p style="margin:0; font-weight:700">${escapeHtml(state.config?.empresa || 'Empresa não informada')}</p>
                <p style="margin:5px 0; color:#666">CNPJ: ${escapeHtml(state.config?.cnpj || '—')}</p>
            </div>
        </div>
        ${body}
    `;
    preview.style.display = 'block';
    window.scrollTo({ top: content.offsetTop, behavior: 'smooth' });
}

function printReport() {
    const content = document.getElementById('reportContent');
    if (!content || !content.innerHTML.trim()) {
        showToast('Gere um relatório antes de imprimir ou salvar em PDF.', 'warning');
        return;
    }
    window.print();
}

function downloadReport() {
    printReport();
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

// --- Leitura de rótulos do Analítico RM (TXT/PDF) ---
// O RM exporta blocos "Rótulo   valor" em colunas. Conforme a largura da exportação os rótulos vêm
// completos ("Base INSS - Envelope"), cortados em 19 ("Base INSS - Envelop") ou em 16 caracteres
// ("Base INSS - Enve", "INSS SAT Ajustad"). Os campos abaixo são reconhecidos pelo rótulo exato ou,
// quando o rótulo tem ao menos RM_TRUNCATED_LABEL_MIN caracteres, como prefixo do rótulo completo.
const RM_TRUNCATED_LABEL_MIN = 14;
const RM_FIELDS = [
    { id: 'proventos', labels: ['Proventos', 'Total Bruto'] },
    { id: 'descontos', labels: ['Descontos'] },
    { id: 'liquido', labels: ['Líquido'] },
    { id: 'baseInss', labels: ['Base INSS - Envelope', 'Base INSS'] },
    { id: 'baseInss13', labels: ['Base INSS 13º - Envelope', 'Base INSS 13º'] },
    { id: 'baseFgts', labels: ['Base FGTS'] },
    { id: 'baseFgts13', labels: ['Base FGTS 13º'] },
    { id: 'baseFgts2', labels: ['Base FGTS Menor Apr.(SEFIP)', 'Base FGTS Menor Aprendiz', 'Base FGTS 2%'] },
    { id: 'baseIrrf', labels: ['Base IRRF'] },
    { id: 'baseAuton', labels: ['Base INSS Auton.', 'Base INSS Autônomo'] },
    { id: 'inssEmpresa', labels: ['INSS Empresa'] },
    { id: 'inssSatAjustado', labels: ['INSS SAT Ajustado'] },
    { id: 'inssSat', labels: ['INSS SAT'] },
    { id: 'inssTerceiro', labels: ['INSS Terceiro', 'INSS Terceiros'] },
    { id: 'inssSegurado', labels: ['INSS Segurado'] }
];

// Troca cada caractere não-ASCII por "?" e padroniza espaços: o TXT latin-1 lido como UTF-8 vira "º"/"í"
// em "\uFFFD", então "13º" e "13\uFFFD" ficam iguais ("13?"), mas "13º Ñ" continua diferente de "13º".
function rmNormalizeLabel(label) {
    return String(label || '').replace(/[^\x20-\x7E]/g, '?').replace(/\s+/g, ' ').trim().toUpperCase();
}

const RM_FIELD_KEYS = RM_FIELDS.map(f => ({ id: f.id, keys: f.labels.map(rmNormalizeLabel) }));

function rmLabelMatches(label, keys) {
    const l = rmNormalizeLabel(label);
    return keys.some(k => l === k || (l.length >= RM_TRUNCATED_LABEL_MIN && k.startsWith(l)));
}

// Lê todos os pares "rótulo valor" de uma linha e devolve { idDoCampo: valor } (1ª ocorrência por campo).
function rmReadFields(line) {
    const found = {};
    const re = /(\S.*?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})(?=\s|$)/g;
    let m;
    while ((m = re.exec(line))) {
        const field = RM_FIELD_KEYS.find(f => rmLabelMatches(m[1], f.keys));
        if (field && !(field.id in found)) found[field.id] = parseFloat(m[2].replace(/\./g, '').replace(',', '.'));
    }
    return found;
}

// --- Valores do Governo (abas eSocial e DCTFWeb coladas na Planilha de Bases) ---
// eSocial: resumo da folha (S-5011) com a base "11 - Base de cálculo..." e os códigos de receita
// (1082-01, 1099-01, 1138-01/04, 1170..1200, 1646-01). DCTFWeb: débitos apurados por código,
// "Total Apurado Empresa" e IRRF (0561). As abas são identificadas pelo conteúdo, não só pelo nome.
function extractGovernoSummary(workbook) {
    const toNumber = v => {
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v !== 'string') return null;
        const s = v.trim();
        if (!/^-?[\d.]+(,\d+)?$/.test(s)) return null;
        return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    };
    const codeRe = /^\s*(\d{4})-(\d{2})\b\s*-?\s*(.*)$/;
    const result = { esocial: null, dctf: null };

    workbook.SheetNames.forEach(sheetName => {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true });
        const text = rows.map(r => (r || []).filter(c => typeof c === 'string').join(' ')).join('\n');
        const isESocial = /base de c[aá]lculo da contribui[cç][aã]o previdenci[aá]ria/i.test(text) || (/esocial/i.test(sheetName) && codeRe.test(text));
        const isDctf = /d[ée]bitos apurados|total apurado/i.test(text) || /dctf/i.test(sheetName);
        if (!isESocial && !isDctf) return;

        const codes = {};
        let base = null, totalApurado = null, totalIrrf = null, salarioFamilia = null, segDescontado = null, segCalculado = null;
        rows.forEach((row, r) => {
            row = row || [];
            // Cada célula de texto pode ser o rótulo (a DCTFWeb tem "#VALUE!" antes dos rótulos).
            row.forEach((cell, labelIdx) => {
                if (typeof cell !== 'string' || !cell.trim()) return;
                const label = cell.trim();
                const after = row.slice(labelIdx + 1).map(toNumber).filter(v => v !== null);
                // eSocial: valor na primeira coluna numérica; DCTFWeb: a data do PA vem antes, o saldo é o último número.
                const value = isESocial ? after[0] : after[after.length - 1];
                if (value === undefined) return;
                const m = label.match(codeRe);
                if (m) {
                    const code = `${m[1]}-${m[2]}`;
                    codes[code] = { codigo: code, descricao: m[3].trim(), valor: (codes[code]?.valor || 0) + value, linha: r + 1 };
                } else if (/base de c[aá]lculo da contribui[cç][aã]o previdenci[aá]ria/i.test(label)) {
                    base = value;
                } else if (isESocial && /^valor total da contribui/i.test(label)) {
                    // Contribuições do segurado: "Valor Descontado" (folha) e "Valor Calculado" (eSocial).
                    segDescontado = after[0];
                    segCalculado = after.length > 1 ? after[1] : null;
                } else if (isESocial && /^valor total do sal[aá]rio.fam/i.test(label)) {
                    salarioFamilia = value;
                } else if (/^total apurado empresa/i.test(label)) {
                    totalApurado = value;
                } else if (/^total irrf/i.test(label)) {
                    totalIrrf = value;
                }
            });
        });

        if (isESocial && !result.esocial && (base !== null || Object.keys(codes).length)) {
            result.esocial = { aba: sheetName, base, codes, salarioFamilia, segDescontado, segCalculado };
        } else if (isDctf && !result.dctf && (totalApurado !== null || Object.keys(codes).length)) {
            const irrfCodes = Object.values(codes).filter(c => /^0561|^0588|^3533|^1889/.test(c.codigo) || /IRRF/i.test(c.descricao));
            result.dctf = {
                aba: sheetName,
                totalApurado,
                irrf: totalIrrf !== null ? totalIrrf : irrfCodes.reduce((a, c) => a + c.valor, 0),
                codes
            };
        }
    });
    return result.esocial || result.dctf ? result : null;
}

// Converte os códigos de receita do eSocial/DCTFWeb nas mesmas métricas da conciliação de INSS.
function buildGovernoINSS(gov, aliqPatronal) {
    const empty = { origem: 'Governo (eSocial)', synced: false };
    if (!gov) return empty;
    const out = { origem: 'Governo (eSocial)', synced: true };
    const es = gov.esocial;
    if (es) {
        const pick = pred => Object.values(es.codes).filter(pred).reduce((a, c) => a + c.valor, 0);
        const has = pred => Object.values(es.codes).some(pred);
        out.segurados = pick(c => c.codigo === '1082-01');
        out.seguradosCI = has(c => c.codigo === '1099-01') ? pick(c => c.codigo === '1099-01') : null;
        out.patronal = pick(c => c.codigo === '1138-01');
        out.patronalCI = has(c => c.codigo === '1138-04') ? pick(c => c.codigo === '1138-04') : null;
        out.ratfap = pick(c => c.codigo.startsWith('1646') || /GILRAT/i.test(c.descricao));
        out.terceiros = pick(c => /TERCEIROS/i.test(c.descricao));
        // A base do eSocial (código 11) inclui os contribuintes individuais; a base deles sai do 1138-04 ÷ alíquota patronal.
        out.baseCI = out.patronalCI !== null && aliqPatronal > 0 ? out.patronalCI / aliqPatronal : null;
        out.base = es.base !== null ? es.base - (out.baseCI || 0) : null;
        out.subtotal = out.segurados + out.patronal + out.ratfap + out.terceiros;
        out.salarioFamilia = es.salarioFamilia;
        out.segDescontado = es.segDescontado;
        out.segCalculado = es.segCalculado;
        out.total = out.subtotal + (out.seguradosCI || 0) + (out.patronalCI || 0) - (es.salarioFamilia || 0);
    }
    if (gov.dctf && gov.dctf.totalApurado !== null) {
        // Guia INSS da DCTFWeb = total apurado − IRRF (mesma regra da planilha: X8 = X6 − X4).
        out.total = gov.dctf.totalApurado - (gov.dctf.irrf || 0);
        out.origemTotal = 'DCTFWeb';
    }
    return out;
}

// --- Log de Conciliação (auditoria ponto a ponto) ---
// Mantido apenas em memória: contém nomes e valores por colaborador, por isso
// não entra em saveState() nem é enviado à API. Recriado a cada processamento.
let conciliacaoAudit = null;

const AUDIT_TOLERANCE = 0.05;

function createConciliacaoAudit() {
    return {
        createdAt: new Date(),
        entries: [],       // { stage, level, message, detail }
        analitico: [],     // capturas do relatório: { field, value, file, line, text, rule, used }
        planilhaColumns: [], // { arquivo, campo, coluna, cabecalho }
        planilhaRows: [],  // um registro por colaborador lido da Planilha de Bases
        analiticoEmployees: [], // bases por funcionário lidas dos blocos do Analítico (TXT/PDF)
        colaboradores: [], // comparação colaborador a colaborador (preenchida por buildComparacaoColaboradores)
        fgtsDigital: [],   // FGTS Digital × Planilha por trabalhador (buildComparacaoFgtsDigital)
        grrfTrabalhadores: [], // desligados lidos da GRRF (extractGRRFSummary)
        formulas: [],      // memória de cálculo: { fonte, metrica, formula, valor }
        divergencias: [],
        add(stage, level, message, detail = '') {
            this.entries.push({ stage, level, message, detail: String(detail ?? '') });
        },
        // Marca quais capturas definiram o valor final de cada campo.
        // Regras: 'max' (maior valor vence), 'last' (última ocorrência vence), 'sum' (todas somam).
        finalizeAnalitico(finalValues) {
            const byField = {};
            this.analitico.forEach(c => (byField[c.field] = byField[c.field] || []).push(c));
            Object.entries(byField).forEach(([field, captures]) => {
                const final = finalValues[field];
                if (final === undefined || final === null) return;
                const lastIdx = captures.length - 1;
                let marked = false;
                captures.forEach((c, i) => {
                    if (c.rule === 'sum') c.used = true;
                    else if (c.rule === 'last') c.used = i === lastIdx;
                    else if (!marked && Math.abs(c.value - final) < 0.005) { c.used = true; marked = true; }
                });
                // Repetições com o mesmo valor (ex.: total da seção = total geral) não são ambiguidade.
                const ignored = captures.filter(c => !c.used && Math.abs(c.value - final) >= 0.005);
                if (ignored.length > 0) {
                    // Muitas ocorrências = rótulo repetido em cada bloco de funcionário (normal).
                    // Poucas = possível ambiguidade entre totalizadores, que merece atenção.
                    const preview = ignored.slice(0, 5).map(c => formatCurrency(c.value)).join(', ');
                    const more = ignored.length > 5 ? ` e mais ${ignored.length - 5}` : '';
                    this.add('Analítico', ignored.length <= 3 ? 'warning' : 'info',
                        `"${field}": ${captures.length} ocorrências no relatório, ${ignored.length} descartada(s)`,
                        `Valor usado ${formatCurrency(final)}; descartados: ${preview}${more}`);
                }
            });
        }
    };
}

function auditTraceAnalitico(audit, capture) {
    if (!audit) return;
    audit.analitico.push({ ...capture, text: String(capture.text || '').slice(0, 160), used: false });
}

function auditStartEmployee(audit, { chapa, nome, file, line }) {
    const emp = { chapa, nome: nome.trim(), file, line, baseInss: 0, baseInss13: 0, baseFgts: 0, baseFgts13: 0, inssSegurado: 0,
        inssEmpresa: 0, inssRat: 0, inssTerceiro: 0, isCI: false };
    audit.analiticoEmployees.push(emp);
    return emp;
}

// Chave de nome tolerante a acentuação: o TXT do RM é latin-1 lido como UTF-8, então "JOSÉ"
// chega como "JOS\uFFFD". Descartar qualquer caractere fora de A-Z/0-9 nos dois lados mantém o par.
function auditNameKey(nome) {
    return String(nome || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// Cruza, por nome, as bases de cada funcionário no Analítico com as da Planilha de Bases.
function buildComparacaoColaboradores(audit) {
    if (audit.analiticoEmployees.length === 0 || audit.planilhaRows.length === 0) return [];
    const analitico = new Map();
    audit.analiticoEmployees.forEach(e => {
        const key = auditNameKey(e.nome);
        const acc = analitico.get(key) || { nome: e.nome, chapa: e.chapa, baseInss: 0, baseInss13: 0, baseFgts: 0, baseFgts13: 0, inssSegurado: 0, ref: [] };
        acc.baseInss += e.baseInss;
        acc.baseInss13 += e.baseInss13;
        acc.inssSegurado += e.inssSegurado;
        acc.baseFgts += e.baseFgts;
        acc.baseFgts13 += e.baseFgts13;
        acc.ref.push(`${e.file}:${e.line}`);
        analitico.set(key, acc);
    });
    const planilha = new Map();
    audit.planilhaRows.forEach(r => {
        const key = auditNameKey(r.nome);
        const acc = planilha.get(key) || { nome: r.nome, codtipo: r.codtipo, situacao: r.situacao, baseInss: 0, baseInss13: 0, baseFgts: 0, baseFgts13: 0, inssSegurado: 0, ref: [] };
        acc.baseInss += r.baseInss;
        acc.baseInss13 += r.baseInss13 || 0;
        acc.inssSegurado += r.inssSegurado || 0;
        acc.baseFgts += r.baseFgts + r.baseFgtsAv;
        acc.baseFgts13 += r.baseFgts13 + r.baseFgts13Av;
        acc.ref.push(`${r.arquivo}:${r.linha}`);
        planilha.set(key, acc);
    });

    const keys = new Set([...analitico.keys(), ...planilha.keys()]);
    const result = [];
    keys.forEach(key => {
        const a = analitico.get(key);
        const p = planilha.get(key);
        const item = {
            nome: (a || p).nome,
            chapa: a ? a.chapa : '',
            codtipo: p ? p.codtipo : '',
            situacao: p ? p.situacao : '',
            // Base INSS comparada como base folha (mensal + 13º): o RM lança o "13 SALARIO AVISO PREVIO"
            // (rubrica 1183) na base do 13º, enquanto o eSocial/Planilha o põe na base mensal.
            inssAnalitico: a ? a.baseInss + a.baseInss13 : null, inssPlanilha: p ? p.baseInss + p.baseInss13 : null,
            inssMensalAnalitico: a ? a.baseInss : null, inssMensalPlanilha: p ? p.baseInss : null,
            inss13Analitico: a ? a.baseInss13 : null, inss13Planilha: p ? p.baseInss13 : null,
            fgtsAnalitico: a ? a.baseFgts : null, fgtsPlanilha: p ? p.baseFgts : null,
            fgts13Analitico: a ? a.baseFgts13 : null, fgts13Planilha: p ? p.baseFgts13 : null,
            segAnalitico: a ? a.inssSegurado : null, segPlanilha: p ? p.inssSegurado : null,
            refAnalitico: a ? a.ref.join(', ') : '', refPlanilha: p ? p.ref.join(', ') : ''
        };
        const d = (x, y) => Math.round(((x || 0) - (y || 0)) * 100) / 100 + 0;
        item.difInss = d(item.inssAnalitico, item.inssPlanilha);
        item.difFgts = d(item.fgtsAnalitico, item.fgtsPlanilha);
        item.difFgts13 = d(item.fgts13Analitico, item.fgts13Planilha);
        item.difSegurado = d(item.segAnalitico, item.segPlanilha);
        item.difInssMensal = d(item.inssMensalAnalitico, item.inssMensalPlanilha);
        item.obs = '';
        const semBases = side => side.baseInss === 0 && side.baseFgts === 0 && side.baseFgts13 === 0 && side.inssSegurado === 0;
        item.status = (!a && semBases(p)) || (!p && semBases(a)) ? 'Sem bases'
            : !a ? 'Só na Planilha' : !p ? 'Só no Analítico'
            : [item.difInss, item.difFgts, item.difFgts13, item.difSegurado].some(v => Math.abs(v) >= 0.01) ? 'Divergente'
            : Math.abs(item.difInssMensal) >= 0.01 ? 'Reclassificado' : 'Confere';
        if (a && p && Math.abs(item.difInssMensal) >= 0.01) {
            item.obs = `Base INSS mensal ${formatCurrency(a.baseInss)} × ${formatCurrency(p.baseInss)}; 13º ${formatCurrency(a.baseInss13)} × ${formatCurrency(p.baseInss13)}`
                + (Math.abs(item.difInss) < 0.01 ? ' — mesmo total, valor movido entre mensal e 13º (ex.: 13º sobre aviso prévio indenizado).' : '');
        }
        result.push(item);
    });
    const order = { 'Divergente': 0, 'Só no Analítico': 1, 'Só na Planilha': 2, 'Reclassificado': 3, 'Sem bases': 4, 'Confere': 5 };
    result.sort((x, y) => order[x.status] - order[y.status] || Math.abs(y.difInss) + Math.abs(y.difFgts) - Math.abs(x.difInss) - Math.abs(x.difFgts));

    const count = status => result.filter(r => r.status === status).length;
    audit.add('Conciliação', count('Divergente') + count('Só no Analítico') + count('Só na Planilha') ? 'warning' : 'info',
        `Colaborador a colaborador: ${count('Confere')} conferem, ${count('Reclassificado')} reclassificados (mensal ↔ 13º, mesmo total), ${count('Divergente')} divergentes, ${count('Só no Analítico')} só no Analítico, ${count('Só na Planilha')} só na Planilha, ${count('Sem bases')} sem bases`,
        `${audit.analiticoEmployees.length} blocos no Analítico × ${audit.planilhaRows.length} linhas na Planilha`);
    return result;
}

// Retorno do FGTS Digital: o ZIP traz vários CSVs; usamos Trabalhadores (por pessoa) e TiposDeValor (mensal × 13º).
// Um CSV solto é tratado como o Trabalhadores.
async function readFgtsDigital(file) {
    if (!/\.zip$/i.test(file.name)) return { trabalhadores: await file.text(), tiposDeValor: '' };
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const text = suffix => { const f = zip.file(new RegExp(suffix + '\\.csv$', 'i'))[0]; return f ? f.async('string') : ''; };
    return { trabalhadores: await text('_Trabalhadores'), tiposDeValor: await text('_TiposDeValor') };
}

function parseFgtsDigitalCsv(text) {
    return String(text || '').split(/\r?\n/).filter(l => l.trim()).map(l => l.split(';').map(c => c.trim().replace(/^"|"$/g, '')));
}

// Valores do FGTS Digital vêm como "5.077,81" (Trabalhadores) ou "638328,50" (TiposDeValor).
function parseFgtsDigitalNum(v) {
    return parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')) || 0;
}

// Coluna GFD (Governo) da conciliação de FGTS, do "..._TiposDeValor.csv":
// "12 - FGTS 13o salario" → 13º; tipos rescisórios → rescisório; o resto (11 mensal, 15 aprendiz…) → mensal.
function buildGovernoFgts(audit, tiposCsv) {
    const out = { origem: 'FGTS Digital (Governo)', synced: false, baseMensal: 0, valorMensal: 0, base13: 0, valor13: 0, baseRescisoria: 0, valorRescisorio: 0, total: 0 };
    const lines = parseFgtsDigitalCsv(tiposCsv);
    if (lines.length === 0) return out;
    const col = name => lines[0].indexOf(name);
    const missing = ['Tipo de Valor', 'Base Remuneracao Total', 'FGTS Mensal na Guia', 'FGTS Rescisorio na Guia'].filter(name => col(name) === -1);
    if (missing.length) {
        audit.add('FGTS Digital', 'error', `Colunas ausentes no TiposDeValor do FGTS Digital: ${missing.join(', ')}`, 'Coluna GFD (Governo) do FGTS não preenchida');
        return out;
    }
    lines.slice(1).forEach(r => {
        const tipo = r[col('Tipo de Valor')];
        const base = parseFgtsDigitalNum(r[col('Base Remuneracao Total')]);
        const valor = parseFgtsDigitalNum(r[col('FGTS Mensal na Guia')]) + parseFgtsDigitalNum(r[col('FGTS Rescisorio na Guia')]);
        const [b, v] = /rescis/i.test(tipo) ? ['baseRescisoria', 'valorRescisorio'] : /\b13o\b|13º/i.test(tipo) ? ['base13', 'valor13'] : ['baseMensal', 'valorMensal'];
        out[b] += base;
        out[v] += valor;
        out.total += valor;
    });
    out.synced = true;
    audit.add('FGTS Digital', 'info', 'Coluna GFD (Governo) do FGTS lida do TiposDeValor',
        `Mensal ${formatCurrency(out.valorMensal)} | 13º ${formatCurrency(out.valor13)} | Rescisório ${formatCurrency(out.valorRescisorio)} | Total ${formatCurrency(out.total)}`);

    // Desligados não entram na guia mensal: o FGTS do mês deles vai na GRRF (quitação → mensal, 13º rescisão → 13º).
    // A GRRF não traz base; ela é estimada por valor ÷ alíquota (2% aprendiz Z, 8% demais).
    if (audit.grrfTrabalhadores.length) {
        const g = { quitacao: 0, rescisao13: 0 };
        audit.grrfTrabalhadores.forEach(t => {
            const aliq = (t.codtipo === 'Z' ? (state.config.fgtsJovem || 2) : (state.config.fgts || 8)) / 100;
            out.baseMensal += t.quitacao / aliq;
            out.base13 += t.rescisao13 / aliq;
            g.quitacao += t.quitacao;
            g.rescisao13 += t.rescisao13;
        });
        out.valorMensal += g.quitacao;
        out.valor13 += g.rescisao13;
        out.total += g.quitacao + g.rescisao13;
        audit.add('FGTS Digital', 'info', `GRRF do mês somada à coluna GFD (${audit.grrfTrabalhadores.length} desligado(s))`,
            `FGTS quitação ${formatCurrency(g.quitacao)} no mensal | FGTS 13º rescisão ${formatCurrency(g.rescisao13)} no 13º | bases estimadas por valor ÷ alíquota`);
    }
    return out;
}

// Cruza, por nome, o retorno do FGTS Digital ("..._Trabalhadores.csv") com a Planilha de Bases:
// base = BASEFGTS + BASEFGTSAVPREVIO + BASEFGTS13AVPREVIO + BASEFGTS13 + BASEFGTSDIFSAL;
// valor = FGTS_MES + FGTS_AVISO + FGTS13_AVISO + FGTS13 + FGTSDIF.
function buildComparacaoFgtsDigital(audit, arquivo, csvText) {
    const lines = parseFgtsDigitalCsv(csvText);
    const header = lines[0] || [];
    const col = name => header.indexOf(name);
    const required = ['Nome Trabalhador', 'Base Remuneracao Total', 'Valor FGTS na Guia'];
    const missing = required.filter(name => col(name) === -1);
    if (missing.length) {
        audit.add('FGTS Digital', 'error', `Colunas ausentes em ${arquivo}: ${missing.join(', ')}`, 'Comparação FGTS Digital × Planilha não realizada');
        return [];
    }
    const num = parseFgtsDigitalNum;
    // FGTS Digital grava nomes sem acento ("PALACIOS") e a Planilha com ("PALÁCIOS").
    const nameKey = nome => auditNameKey(String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, ''));
    const guia = new Map();
    lines.slice(1).forEach(r => {
        // Depósito rescisório (multa) não está nas colunas da Planilha; só o mensal entra na comparação.
        if (/rescis/i.test(r[col('Tipo Deposito')] || '')) return;
        const key = nameKey(r[col('Nome Trabalhador')]);
        const acc = guia.get(key) || { nome: r[col('Nome Trabalhador')], base: 0, fgts: 0 };
        acc.base += num(r[col('Base Remuneracao Total')]);
        acc.fgts += num(r[col('Valor FGTS na Guia')]);
        guia.set(key, acc);
    });
    const planilha = new Map();
    audit.planilhaRows.forEach(r => {
        const key = nameKey(r.nome);
        const acc = planilha.get(key) || { nome: r.nome, situacao: String(r.situacao || '').toUpperCase(), base: 0, fgts: 0 };
        acc.base += r.baseFgts + r.baseFgtsAv + r.baseFgts13Av + r.baseFgts13 + (r.baseFgtsDifSal || 0);
        acc.fgts += r.fgtsValor || 0;
        planilha.set(key, acc);
    });

    // Desligados saem da guia mensal: o FGTS do mês deles (quitação + 13º rescisão) vai na GRRF.
    const grrf = new Map(audit.grrfTrabalhadores.map(t => [nameKey(t.nome), t.quitacao + t.rescisao13]));
    const d = (x, y) => Math.round(((x || 0) - (y || 0)) * 100) / 100 + 0;
    const result = [];
    new Set([...guia.keys(), ...planilha.keys()]).forEach(key => {
        const g = guia.get(key), p = planilha.get(key);
        // Sem FGTS na Planilha e fora da guia (ex.: pró-labore): nada a comparar.
        if (!g && Math.abs(p.base) < 0.01 && Math.abs(p.fgts) < 0.01) return;
        const item = {
            nome: (g || p).nome,
            basePlanilha: p ? p.base : null, baseGuia: g ? g.base : null,
            fgtsPlanilha: p ? p.fgts : null, fgtsGuia: g ? g.fgts : null
        };
        item.difBase = d(item.basePlanilha, item.baseGuia);
        item.difFgts = d(item.fgtsPlanilha, item.fgtsGuia);
        const pagoGrrf = !g && grrf.has(key) && Math.abs(p.fgts - grrf.get(key)) <= AUDIT_TOLERANCE;
        item.status = !p ? 'Só no FGTS Digital' : pagoGrrf ? 'Pago na GRRF' : !g && p.situacao === 'P' ? 'Afastado' : !g ? 'Só na Planilha'
            : Math.abs(item.difBase) >= 0.01 || Math.abs(item.difFgts) > AUDIT_TOLERANCE ? 'Divergente' : 'Confere';
        result.push(item);
    });
    const order = { 'Divergente': 0, 'Só no FGTS Digital': 1, 'Só na Planilha': 2, 'Afastado': 3, 'Pago na GRRF': 4, 'Confere': 5 };
    result.sort((x, y) => order[x.status] - order[y.status] || Math.abs(y.difFgts) - Math.abs(x.difFgts));

    const count = status => result.filter(r => r.status === status).length;
    audit.add('FGTS Digital', result.length === count('Confere') + count('Pago na GRRF') ? 'info' : 'warning',
        `FGTS Digital × Planilha: ${count('Confere')} conferem, ${count('Pago na GRRF')} pagos na GRRF, ${count('Afastado')} afastados fora da guia, ${count('Divergente')} divergentes, ${count('Só no FGTS Digital')} só no FGTS Digital, ${count('Só na Planilha')} só na Planilha`,
        `${guia.size} trabalhadores em ${arquivo} × ${planilha.size} colaboradores na Planilha`);
    return result;
}

function auditColumnMapping(audit, arquivo, headers, idx, requiredKeys) {
    const labels = {
        nome: 'NOME', situacao: 'CODSITUACAO', codtipo: 'CODTIPO', inss: 'BASEINSS', inss13: 'BASEINSS13',
        inssAutonomo: 'BASE_INSS_AUTONOMO', fgts: 'BASEFGTS', fgtsAv: 'BASEFGTSAVPREVIO', fgts13: 'BASEFGTS13',
        fgts13Av: 'BASEFGTS13AVPREVIO', irrf: 'BASEIRRF'
    };
    Object.entries(labels).forEach(([key, campo]) => {
        const col = idx[key];
        audit.planilhaColumns.push({
            arquivo,
            campo,
            coluna: col >= 0 ? XLSX.utils.encode_col(col) : '—',
            cabecalho: col >= 0 ? String(headers[col] ?? '') : 'não encontrada'
        });
        if (col < 0 && requiredKeys.includes(key)) {
            audit.add('Planilha', 'error', `Coluna ${campo} não encontrada em ${arquivo}`, 'Os valores desta coluna entram como 0 na conciliação');
        }
    });
}

// Compara Analítico × Planilha (× Governo, quando houver valor) métrica a métrica e
// tenta explicar cada diferença com somas de colunas ou com um colaborador específico.
const INSS_METRICS = [
    ['base', 'Base Folha'], ['segurados', 'Segurados (1082)'], ['patronal', 'Patronal (1138-01)'],
    ['ratfap', 'RAT Ajustado (1646)'], ['terceiros', 'Terceiros'], ['subtotal', 'Subtotal Empregados'],
    ['baseCI', 'Base Contribuintes Individuais'], ['seguradosCI', 'Segurados CI (1099)'], ['patronalCI', 'Patronal CI (1138-04)'],
    ['salarioFamilia', 'Salário-Família'], ['total', 'Total Guia INSS']
];

function buildDivergencias(conciliacao, audit) {
    const rows = audit.planilhaRows;
    const sum = (pick) => rows.reduce((acc, r) => acc + (pick(r) || 0), 0);
    const near = (a, b) => Math.abs(Math.abs(a) - Math.abs(b)) <= AUDIT_TOLERANCE;

    const explainers = {
        base: [
            { label: 'pró-labore (CODTIPO D), que é contribuinte individual e fica fora da base de empregados', value: sum(r => r.inssConsiderada ? 0 : r.baseInss) },
            { label: 'Σ BASEINSS13 (base do 13º)', value: sum(r => r.inssConsiderada ? r.baseInss13 : 0) }
        ],
        baseMensal: [
            { label: 'Σ BASEFGTSAVPREVIO (aviso prévio somado na Planilha)', value: sum(r => r.baseFgtsAv) },
            { label: 'Base FGTS de aprendizes (CODTIPO Z)', value: sum(r => r.codtipo === 'Z' ? r.baseFgts + r.baseFgtsAv : 0) }
        ],
        base13: [
            { label: 'Σ BASEFGTS13AVPREVIO (aviso prévio 13º somado na Planilha)', value: sum(r => r.baseFgts13Av) }
        ]
    };
    const rowField = { base: r => r.inssConsiderada ? r.baseInss : 0, baseMensal: r => r.baseFgts + r.baseFgtsAv, base13: r => r.baseFgts13 + r.baseFgts13Av };
    const formulaOf = (fonte, metrica) => (audit.formulas.find(f => f.fonte === fonte && f.metrica === metrica) || {}).formula || '';

    const groups = [
        { tributo: 'INSS', data: conciliacao.inss, metrics: INSS_METRICS },
        { tributo: 'IRRF', data: conciliacao.irrf, metrics: [
            ['irrfMensal', 'IRRF Mensal'], ['irrf13', 'IRRF 13º'], ['irrfFerias', 'IRRF Férias'], ['total', 'Total IRRF']] },
        { tributo: 'FGTS', data: conciliacao.fgts, metrics: [
            ['baseMensal', 'Base Mensal'], ['valorMensal', 'Valor Mensal'], ['base13', 'Base 13º Salário'],
            ['valor13', 'Valor 13º Salário'], ['total', 'Total a Recolher']] }
    ];

    const result = [];
    groups.forEach(({ tributo, data, metrics }) => {
        if (!Array.isArray(data)) return;
        const analitico = data.find(s => /Anal[ií]tico/.test(s.origem));
        const planilha = data.find(s => /Confronto/.test(s.origem));
        const governo = data.find(s => /Governo|Digital/.test(s.origem));
        metrics.forEach(([key, label]) => {
            // null = a fonte não tem esta métrica (ex.: pró-labore no Analítico); Governo só conta se importado.
            const val = (src, k) => (src && src[k] !== null && src[k] !== undefined ? src[k] : null);
            const a = val(analitico, key);
            const p = val(planilha, key);
            const govActive = governo && (governo.synced === undefined ? governo[key] > 0 : governo.synced);
            const g = govActive ? val(governo, key) : null;
            const round = v => Math.round(v * 100) / 100 + 0; // "+ 0" normaliza -0 (evita "-R$ 0,00")
            const diff = a !== null && p !== null ? round(a - p) : null;
            const ref = p !== null ? p : a; // Governo é comparado com a Planilha (ou com o Analítico, sem Planilha)
            const difGov = g !== null && ref !== null ? round(ref - g) : null;
            const motivos = [];

            if (diff === null && difGov === null) {
                motivos.push(p === null && planilha === undefined
                    ? 'Planilha de Bases não enviada: não há com o que confrontar.'
                    : 'Sem duas fontes com esta métrica para comparar.');
            } else if (diff !== null && Math.abs(diff) < 0.01) {
                motivos.push('Analítico e Planilha conferem.');
            } else if (diff !== null) {
                if (p === 0) motivos.push('Planilha zerada: verifique no bloco "Leitura da Planilha" se a tabela e as colunas foram localizadas.');
                if (a === 0) {
                    const faZero = formulaOf('Analítico', `${tributo} · ${label}`);
                    motivos.push(/lido do relatório/.test(faZero)
                        ? 'Analítico zerado: o próprio relatório traz este valor como 0,00 (o RM não calculou). Confira a parametrização da folha.'
                        : 'Analítico zerado: o rótulo correspondente não foi encontrado no relatório (veja "Origem dos valores do Analítico").');
                }
                (explainers[key] || []).forEach(ex => {
                    if (ex.value > 0 && near(diff, ex.value)) motivos.push(`Diferença igual a ${ex.label}: ${formatCurrency(ex.value)}.`);
                });
                if (rowField[key]) {
                    const hit = rows.find(r => rowField[key](r) > 0 && near(diff, rowField[key](r)));
                    if (hit) motivos.push(`Diferença igual à base de ${hit.nome} (linha ${hit.linha} de ${hit.arquivo}).`);
                }
                const empField = tributo === 'IRRF' ? null : { base: 'difInss', segurados: 'difSegurado', baseMensal: 'difFgts', base13: 'difFgts13' }[key];
                if (empField && audit.colaboradores.length > 0) {
                    // Diretores (CODTIPO D) ficam fora dos totais de INSS da Planilha; não explicam a diferença.
                    const foraDoTotal = c => (key === 'base' || key === 'segurados') && c.codtipo === 'D';
                    const culpados = audit.colaboradores.filter(c => Math.abs(c[empField]) >= 0.01 && !foraDoTotal(c))
                        .sort((x, y) => Math.abs(y[empField]) - Math.abs(x[empField]));
                    if (culpados.length > 0) {
                        const top = culpados.slice(0, 5).map(c => `${c.nome} (${formatCurrency(c[empField])}, ${c.status.toLowerCase()})`).join('; ');
                        motivos.push(`${culpados.length} colaborador(es) com diferença nesta base. Maiores: ${top}. Veja a seção "Colaborador a colaborador".`);
                    }
                }
                if (key === 'total' || key === 'subtotal') {
                    motivos.push(`${key === 'total' ? 'Total' : 'Subtotal'} = soma das linhas acima; a diferença vem das métricas divergentes deste tributo.`);
                }
                const fa = formulaOf('Analítico', `${tributo} · ${label}`);
                const fp = formulaOf('Planilha', `${tributo} · ${label}`);
                if (a !== 0 && /lido do relatório/.test(fa) && /×/.test(fp)) {
                    motivos.push('Analítico usa o valor apurado pelo sistema de folha; a Planilha usa alíquota fixa sobre a base. Diferença esperada mesmo com bases iguais.');
                }
                if (a !== 0 && /lido do relatório/.test(fa) && ['patronal', 'ratfap', 'terceiros'].includes(key) && analitico && planilha && analitico.baseEncargos > 0 && planilha.baseEncargos > 0) {
                    const pct = v => `${(v * 100).toFixed(4).replace('.', ',')}%`;
                    const efA = a / analitico.baseEncargos;
                    const efP = p / planilha.baseEncargos;
                    motivos.push(Math.abs(efA - efP) < 0.00005
                        ? `Alíquota efetiva igual (${pct(efA)} sobre base + 13º): a diferença vem da base, não da configuração.`
                        : `Alíquota efetiva sobre base + 13º: Analítico ${pct(efA)} × Planilha ${pct(efP)}. Revise a configuração da empresa (Patronal/RAT/FAP/Terceiros).`);
                }
                if (motivos.length === 0) {
                    motivos.push(a > p
                        ? 'Analítico maior: há valor no relatório sem correspondência na Planilha. Compare a lista de colaboradores.'
                        : 'Planilha maior: há colaboradores/valores na Planilha não refletidos no relatório.');
                }
            }

            if (difGov !== null) {
                const quem = p !== null ? 'Planilha' : 'Analítico';
                const fonteGov = tributo === 'FGTS' ? 'FGTS Digital' : /DCTF/.test(governo.origem) || (key === 'total' && governo.origemTotal === 'DCTFWeb') ? 'DCTFWeb' : 'eSocial';
                const descMenosCalc = governo.segDescontado != null && governo.segCalculado != null ? governo.segDescontado - governo.segCalculado : null;
                if (key === 'segurados' && descMenosCalc !== null && Math.abs(descMenosCalc) >= 0.01 && near(difGov, descMenosCalc)) {
                    motivos.push(`${quem} − eSocial = ${formatCurrency(difGov)}: igual à diferença entre o INSS descontado pela folha (${formatCurrency(governo.segDescontado)}) e o calculado pelo eSocial (${formatCurrency(governo.segCalculado)}). A folha descontou ${formatCurrency(descMenosCalc)} a ${descMenosCalc > 0 ? 'mais' : 'menos'} do que o devido; o código 1082 usa o valor calculado.`);
                } else if (Math.abs(difGov) < 0.01) motivos.push(`Confere com o ${fonteGov}.`);
                else if (Math.abs(difGov) <= GOV_ROUNDING_TOLERANCE) motivos.push(`${quem} − ${fonteGov} = ${formatCurrency(difGov)}: arredondamento (o governo arredonda por trabalhador/estabelecimento). Aceitável.`);
                else motivos.push(`${quem} − ${fonteGov} = ${formatCurrency(difGov)}: diferença com o governo. Confira eventos/trabalhadores enviados ao eSocial.`);
            }
            result.push({ tributo, metrica: label, analitico: a, planilha: p, governo: g, diferenca: diff, difGov, motivos });
        });
    });

    const divergentes = result.filter(r => r.diferenca !== null && Math.abs(r.diferenca) >= 0.01);
    audit.add('Conciliação', divergentes.length ? 'warning' : 'info',
        divergentes.length ? `${divergentes.length} métrica(s) com divergência entre Analítico e Planilha` : 'Nenhuma divergência entre Analítico e Planilha',
        divergentes.map(d => `${d.tributo} ${d.metrica}: ${formatCurrency(d.diferenca)}`).join(' | '));
    const divGov = result.filter(r => r.difGov !== null && Math.abs(r.difGov) > GOV_ROUNDING_TOLERANCE);
    const comGov = result.filter(r => r.difGov !== null);
    if (comGov.length) {
        audit.add('Conciliação', divGov.length ? 'warning' : 'info',
            divGov.length ? `${divGov.length} métrica(s) com diferença acima de R$ 1,00 em relação ao governo` : `Todas as ${comGov.length} métricas comparáveis conferem com o governo (diferenças de centavos)`,
            comGov.map(d => `${d.tributo} ${d.metrica}: ${formatCurrency(d.difGov)}`).join(' | '));
    }
    return result;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function renderConciliacaoLog() {
    const container = document.getElementById('conciliacaoLog');
    if (!container) return;
    const audit = conciliacaoAudit;
    if (!audit) {
        container.innerHTML = '<p style="color:var(--text-muted); padding:16px">Processe os arquivos para gerar o log detalhado. O log fica só nesta sessão do navegador e não é salvo.</p>';
        return;
    }

    const money = v => v === null || v === undefined ? '—' : formatCurrency(v);
    const mono = 'font-family:\'JetBrains Mono\',monospace';
    const levelColor = { info: 'var(--text-secondary)', warning: 'var(--accent-orange)', error: 'var(--accent-red)' };
    const section = (title, count, body, open = false) =>
        `<details class="audit-section"${open ? ' open' : ''}><summary>${title}${count !== null ? ` <span class="badge badge-info">${count}</span>` : ''}</summary><div class="table-responsive">${body}</div></details>`;

    const divRows = audit.divergencias.map(d => {
        const ok = d.diferenca === null || Math.abs(d.diferenca) < 0.01;
        return `<tr>
            <td>${escapeHtml(d.tributo)} · ${escapeHtml(d.metrica)}</td>
            <td style="text-align:right; ${mono}">${money(d.analitico)}</td>
            <td style="text-align:right; ${mono}">${money(d.planilha)}</td>
            <td style="text-align:right; ${mono}">${money(d.governo)}</td>
            <td style="text-align:right; ${mono}; color:${ok ? 'var(--text-muted)' : 'var(--accent-red)'}">${money(d.diferenca)}</td>
            <td style="text-align:right; ${mono}; color:${d.difGov === null || Math.abs(d.difGov) < 0.01 ? 'var(--text-muted)' : (Math.abs(d.difGov) <= GOV_ROUNDING_TOLERANCE ? 'var(--accent-orange)' : 'var(--accent-red)')}">${money(d.difGov)}</td>
            <td style="font-size:0.8rem">${d.motivos.map(escapeHtml).join('<br>')}</td>
        </tr>`;
    }).join('');

    const usedCaptures = audit.analitico.filter(c => c.used);
    const discardedCount = audit.analitico.length - usedCaptures.length;
    const analiticoRows = usedCaptures.map(c => `<tr>
        <td>${escapeHtml(c.field)}</td>
        <td style="text-align:right; ${mono}">${money(c.value)}</td>
        <td>${escapeHtml(c.file)}${c.line ? ` : ${c.line}` : ''}</td>
        <td style="font-size:0.75rem; ${mono}">${escapeHtml(c.text)}</td>
        <td style="text-align:center">${escapeHtml({ max: 'maior valor', last: 'última ocorrência', sum: 'soma' }[c.rule] || c.rule)}</td>
    </tr>`).join('') + (discardedCount > 0
        ? `<tr><td colspan="5" style="color:var(--text-muted); font-size:0.8rem">${discardedCount} ocorrências descartadas (valores por funcionário e repetições). Lista completa no CSV.</td></tr>`
        : '') || '<tr><td colspan="5" style="color:var(--text-muted)">Nenhum valor capturado do Analítico.</td></tr>';

    const columnRows = audit.planilhaColumns.map(c => `<tr>
        <td>${escapeHtml(c.arquivo)}</td><td>${escapeHtml(c.campo)}</td>
        <td style="text-align:center; ${mono}">${escapeHtml(c.coluna)}</td>
        <td style="color:${c.coluna === '—' ? 'var(--accent-orange)' : 'inherit'}">${escapeHtml(c.cabecalho)}</td>
    </tr>`).join('') || '<tr><td colspan="4" style="color:var(--text-muted)">Nenhuma tabela de bases lida.</td></tr>';

    const formulaRows = audit.formulas.map(f => `<tr>
        <td>${escapeHtml(f.fonte)}</td><td>${escapeHtml(f.metrica)}</td>
        <td style="font-size:0.8rem">${escapeHtml(f.formula)}</td>
        <td style="text-align:right; ${mono}">${money(f.valor)}</td>
    </tr>`).join('');

    const eventRows = audit.entries.map(e => `<tr>
        <td>${escapeHtml(e.stage)}</td>
        <td style="color:${levelColor[e.level] || 'inherit'}; font-weight:600">${escapeHtml(e.level.toUpperCase())}</td>
        <td>${escapeHtml(e.message)}</td>
        <td style="font-size:0.8rem">${escapeHtml(e.detail)}</td>
    </tr>`).join('');

    const divergentes = audit.divergencias.filter(d => d.diferenca !== null && Math.abs(d.diferenca) >= 0.01).length;
    container.innerHTML = `
        <p style="font-size:0.8rem; color:var(--text-muted); margin:0 0 12px">Gerado em ${audit.createdAt.toLocaleString('pt-BR')} · ${audit.planilhaRows.length} colaboradores lidos da Planilha · ${divergentes} métrica(s) divergente(s)</p>
        ${section('1. Divergências por métrica', divergentes, `<table class="data-table"><thead><tr><th>Métrica</th><th style="text-align:right">Analítico</th><th style="text-align:right">Planilha</th><th style="text-align:right">Governo</th><th style="text-align:right">Analítico − Planilha</th><th style="text-align:right">vs Governo</th><th>Diagnóstico</th></tr></thead><tbody>${divRows}</tbody></table>`, true)}
        ${section('2. Colaborador a colaborador (Analítico × Planilha)', audit.colaboradores.filter(c => !['Confere', 'Sem bases', 'Reclassificado'].includes(c.status)).length, audit.colaboradores.length === 0
            ? '<p style="color:var(--text-muted); padding:8px">Indisponível: requer o Analítico em TXT/PDF com blocos por funcionário e a Planilha de Bases.</p>'
            : `<div style="display:flex; gap:8px; flex-wrap:wrap; margin:8px 0">
                <input type="search" id="auditCompFilter" class="form-input" placeholder="Filtrar por nome ou chapa..." oninput="renderAuditComparacao()" style="flex:1; min-width:200px; max-width:360px">
                <select id="auditCompStatus" class="form-input" onchange="renderAuditComparacao()" style="max-width:220px">
                    <option value="pendentes">Somente divergências</option><option value="">Todos</option>
                    <option>Divergente</option><option>Só no Analítico</option><option>Só na Planilha</option><option>Reclassificado</option><option>Sem bases</option><option>Confere</option>
                </select>
              </div>
              <table class="data-table"><thead><tr><th>Status</th><th>Chapa</th><th>Nome</th><th>Tipo</th>
                <th style="text-align:right">Base INSS Analítico (mensal + 13º)</th><th style="text-align:right">Base INSS Planilha (mensal + 13º)</th><th style="text-align:right">Dif. INSS</th>
                <th style="text-align:right">FGTS Analítico</th><th style="text-align:right">FGTS Planilha</th><th style="text-align:right">Dif. FGTS</th>
                <th style="text-align:right">Dif. FGTS 13º</th><th style="text-align:right">INSS desc. Analítico</th><th style="text-align:right">INSS desc. Planilha</th><th style="text-align:right">Dif. INSS desc.</th><th>Origem</th></tr></thead><tbody id="auditCompRows"></tbody></table>`, true)}
        ${audit.fgtsDigital.length === 0 ? '' : section('2b. FGTS Digital × Planilha (por trabalhador)', audit.fgtsDigital.filter(c => !['Confere', 'Pago na GRRF'].includes(c.status)).length,
            `<p style="font-size:0.8rem; color:var(--text-muted); margin:8px 0">Base = BASEFGTS + BASEFGTSAVPREVIO + BASEFGTS13AVPREVIO + BASEFGTS13 + BASEFGTSDIFSAL · FGTS = FGTS_MES + FGTS_AVISO + FGTS13_AVISO + FGTS13 + FGTSDIF. Lista só as divergências (${audit.fgtsDigital.filter(c => c.status === 'Confere').length} conferem, ${audit.fgtsDigital.filter(c => c.status === 'Pago na GRRF').length} pagos na GRRF).</p>
            <table class="data-table"><thead><tr><th>Status</th><th>Nome</th>
                <th style="text-align:right">Base Planilha</th><th style="text-align:right">Base FGTS Digital</th><th style="text-align:right">Dif. Base</th>
                <th style="text-align:right">FGTS Planilha</th><th style="text-align:right">FGTS na Guia</th><th style="text-align:right">Dif. FGTS</th></tr></thead><tbody>${
                audit.fgtsDigital.filter(c => !['Confere', 'Pago na GRRF'].includes(c.status)).map(c => `<tr>
                    <td style="color:${c.status === 'Divergente' ? 'var(--accent-red)' : 'var(--accent-orange)'}; font-weight:600">${escapeHtml(c.status)}</td>
                    <td>${escapeHtml(c.nome)}</td>
                    <td style="text-align:right; ${mono}">${money(c.basePlanilha)}</td><td style="text-align:right; ${mono}">${money(c.baseGuia)}</td>
                    <td style="text-align:right; ${mono}; color:${Math.abs(c.difBase) >= 0.01 ? 'var(--accent-red)' : 'var(--text-muted)'}">${formatCurrency(c.difBase)}</td>
                    <td style="text-align:right; ${mono}">${money(c.fgtsPlanilha)}</td><td style="text-align:right; ${mono}">${money(c.fgtsGuia)}</td>
                    <td style="text-align:right; ${mono}; color:${Math.abs(c.difFgts) >= 0.01 ? 'var(--accent-red)' : 'var(--text-muted)'}">${formatCurrency(c.difFgts)}</td>
                </tr>`).join('') || '<tr><td colspan="8" style="color:var(--accent-green)">Todos os trabalhadores conferem.</td></tr>'}</tbody></table>`, true)}
        ${section('3. Origem dos valores do Analítico', usedCaptures.length, `<table class="data-table"><thead><tr><th>Campo</th><th style="text-align:right">Valor</th><th>Arquivo : linha</th><th>Trecho lido</th><th style="text-align:center">Regra</th></tr></thead><tbody>${analiticoRows}</tbody></table>`)}
        ${section('4. Leitura da Planilha de Bases (colunas)', null, `<table class="data-table"><thead><tr><th>Arquivo</th><th>Campo</th><th style="text-align:center">Coluna</th><th>Cabeçalho encontrado</th></tr></thead><tbody>${columnRows}</tbody></table>`)}
        ${section('5. Memória de cálculo', audit.formulas.length, `<table class="data-table"><thead><tr><th>Fonte</th><th>Métrica</th><th>Fórmula / origem</th><th style="text-align:right">Valor</th></tr></thead><tbody>${formulaRows}</tbody></table>`)}
        ${section('6. Linhas da Planilha', audit.planilhaRows.length, `
            <input type="search" id="auditFilter" class="form-input" placeholder="Filtrar por nome, situação ou tipo..." oninput="renderAuditRows(this.value)" style="margin:8px 0; width:100%; max-width:360px">
            <table class="data-table"><thead><tr><th>Linha</th><th>Nome</th><th>Sit.</th><th>Tipo</th><th style="text-align:right">Base INSS</th><th style="text-align:center">Na conciliação?</th><th style="text-align:right">Base FGTS</th><th style="text-align:right">Aviso Prévio</th><th style="text-align:right">FGTS 13º</th><th style="text-align:right">13º Av. Prévio</th></tr></thead><tbody id="auditRows"></tbody></table>`)}
        ${section('7. Eventos do processamento', audit.entries.length, `<table class="data-table"><thead><tr><th>Etapa</th><th>Nível</th><th>Evento</th><th>Detalhe</th></tr></thead><tbody>${eventRows}</tbody></table>`)}
    `;
    renderAuditRows('');
    renderAuditComparacao();
}

function renderAuditComparacao() {
    const body = document.getElementById('auditCompRows');
    if (!body || !conciliacaoAudit) return;
    const term = String(document.getElementById('auditCompFilter')?.value || '').trim().toUpperCase();
    const status = document.getElementById('auditCompStatus')?.value ?? 'pendentes';
    const mono = 'font-family:\'JetBrains Mono\',monospace';
    const money = v => v === null ? '—' : formatCurrency(v);
    const dif = v => `<td style="text-align:right; ${mono}; color:${Math.abs(v) >= 0.01 ? 'var(--accent-red)' : 'var(--text-muted)'}">${formatCurrency(v)}</td>`;
    const statusColor = { 'Confere': 'var(--accent-green)', 'Reclassificado': 'var(--accent-blue)', 'Sem bases': 'var(--text-muted)', 'Divergente': 'var(--accent-red)', 'Só no Analítico': 'var(--accent-orange)', 'Só na Planilha': 'var(--accent-orange)' };
    const LIMIT = 500;
    const matches = conciliacaoAudit.colaboradores.filter(c =>
        (status === '' || (status === 'pendentes' ? !['Confere', 'Sem bases', 'Reclassificado'].includes(c.status) : c.status === status)) &&
        (!term || `${c.nome} ${c.chapa}`.toUpperCase().includes(term)));
    body.innerHTML = matches.slice(0, LIMIT).map(c => `<tr>
        <td style="color:${statusColor[c.status]}; font-weight:600; white-space:nowrap">${escapeHtml(c.status)}</td>
        <td style="${mono}">${escapeHtml(c.chapa)}</td><td>${escapeHtml(c.nome)}</td><td>${escapeHtml(c.codtipo)}</td>
        <td style="text-align:right; ${mono}">${money(c.inssAnalitico)}</td><td style="text-align:right; ${mono}">${money(c.inssPlanilha)}</td>${dif(c.difInss)}
        <td style="text-align:right; ${mono}">${money(c.fgtsAnalitico)}</td><td style="text-align:right; ${mono}">${money(c.fgtsPlanilha)}</td>${dif(c.difFgts)}
        ${dif(c.difFgts13)}
        <td style="text-align:right; ${mono}">${money(c.segAnalitico)}</td><td style="text-align:right; ${mono}">${money(c.segPlanilha)}</td>${dif(c.difSegurado)}
        <td style="font-size:0.75rem">${c.obs ? `<div style="color:var(--accent-blue); margin-bottom:4px">${escapeHtml(c.obs)}</div>` : ''}${escapeHtml([c.refAnalitico && `Analítico ${c.refAnalitico}`, c.refPlanilha && `Planilha ${c.refPlanilha}`].filter(Boolean).join(' | '))}</td>
    </tr>`).join('') + (matches.length > LIMIT
        ? `<tr><td colspan="15" style="color:var(--text-muted)">Mostrando ${LIMIT} de ${matches.length}. Refine o filtro ou exporte o CSV.</td></tr>`
        : (matches.length === 0 ? '<tr><td colspan="15" style="color:var(--text-muted)">Nenhum colaborador neste filtro.</td></tr>' : ''));
}

function renderAuditRows(filter) {
    const body = document.getElementById('auditRows');
    if (!body || !conciliacaoAudit) return;
    const term = String(filter || '').trim().toUpperCase();
    const mono = 'font-family:\'JetBrains Mono\',monospace';
    const LIMIT = 500;
    const matches = conciliacaoAudit.planilhaRows.filter(r => !term || `${r.nome} ${r.situacao} ${r.codtipo}`.toUpperCase().includes(term));
    body.innerHTML = matches.slice(0, LIMIT).map(r => `<tr>
        <td style="${mono}">${r.linha}</td><td>${escapeHtml(r.nome)}</td><td>${escapeHtml(r.situacao)}</td><td>${escapeHtml(r.codtipo)}</td>
        <td style="text-align:right; ${mono}">${formatCurrency(r.baseInss)}</td>
        <td style="text-align:center">${r.inssConsiderada ? '✓' : '<span style="color:var(--accent-orange)">excluída (diretor)</span>'}</td>
        <td style="text-align:right; ${mono}">${formatCurrency(r.baseFgts)}</td>
        <td style="text-align:right; ${mono}">${formatCurrency(r.baseFgtsAv)}</td>
        <td style="text-align:right; ${mono}">${formatCurrency(r.baseFgts13)}</td>
        <td style="text-align:right; ${mono}">${formatCurrency(r.baseFgts13Av)}</td>
    </tr>`).join('') + (matches.length > LIMIT
        ? `<tr><td colspan="10" style="color:var(--text-muted)">Mostrando ${LIMIT} de ${matches.length}. Refine o filtro ou exporte o CSV.</td></tr>`
        : (matches.length === 0 ? '<tr><td colspan="10" style="color:var(--text-muted)">Nenhum colaborador encontrado.</td></tr>' : ''));
}

function exportConciliacaoLog() {
    const audit = conciliacaoAudit;
    if (!audit) {
        showToast('Processe os arquivos antes de exportar o log.', 'warning');
        return;
    }
    // CSV com ';' e vírgula decimal para abrir direto no Excel em pt-BR.
    const num = v => v === null || v === undefined ? '' : Number(v).toFixed(2).replace('.', ',');
    const cell = v => {
        const s = String(v ?? '');
        return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [];
    const push = (...cols) => lines.push(cols.map(cell).join(';'));

    push('LOG DE CONCILIAÇÃO', audit.createdAt.toLocaleString('pt-BR'), `Competência ${state.competencia}`);
    push();
    push('DIVERGÊNCIAS'); push('Tributo', 'Métrica', 'Analítico', 'Planilha', 'Governo', 'Analítico - Planilha', 'Planilha - Governo', 'Diagnóstico');
    audit.divergencias.forEach(d => push(d.tributo, d.metrica, num(d.analitico), num(d.planilha), num(d.governo), num(d.diferenca), num(d.difGov), d.motivos.join(' ')));
    push();
    push('COLABORADOR A COLABORADOR');
    push('Status', 'Chapa', 'Nome', 'Tipo', 'Situação', 'Base INSS Analítico (mensal+13º)', 'Base INSS Planilha (mensal+13º)', 'Dif. INSS', 'Base FGTS Analítico', 'Base FGTS Planilha (+Av. Prévio)', 'Dif. FGTS', 'Base FGTS 13º Analítico', 'Base FGTS 13º Planilha (+Av. Prévio)', 'Dif. FGTS 13º', 'INSS Descontado Analítico', 'INSS Descontado Planilha', 'Dif. INSS Descontado', 'Observação', 'Origem Analítico', 'Origem Planilha');
    audit.colaboradores.forEach(c => push(c.status, c.chapa, c.nome, c.codtipo, c.situacao, num(c.inssAnalitico), num(c.inssPlanilha), num(c.difInss), num(c.fgtsAnalitico), num(c.fgtsPlanilha), num(c.difFgts), num(c.fgts13Analitico), num(c.fgts13Planilha), num(c.difFgts13), num(c.segAnalitico), num(c.segPlanilha), num(c.difSegurado), c.obs, c.refAnalitico, c.refPlanilha));
    push();
    push('ORIGEM DOS VALORES DO ANALÍTICO'); push('Campo', 'Valor', 'Arquivo', 'Linha', 'Trecho', 'Regra', 'Usado');
    audit.analitico.forEach(c => push(c.field, num(c.value), c.file, c.line ?? '', c.text, c.rule, c.used ? 'sim' : 'não'));
    push();
    push('COLUNAS DA PLANILHA'); push('Arquivo', 'Campo', 'Coluna', 'Cabeçalho');
    audit.planilhaColumns.forEach(c => push(c.arquivo, c.campo, c.coluna, c.cabecalho));
    push();
    push('MEMÓRIA DE CÁLCULO'); push('Fonte', 'Métrica', 'Fórmula', 'Valor');
    audit.formulas.forEach(f => push(f.fonte, f.metrica, f.formula, num(f.valor)));
    push();
    push('COLABORADORES DA PLANILHA');
    push('Arquivo', 'Linha', 'Nome', 'Situação', 'Tipo', 'Base INSS', 'INSS na conciliação', 'Base INSS 13º', 'INSS Descontado', 'Base FGTS', 'Base FGTS Av. Prévio', 'Base FGTS 13º', 'Base FGTS 13º Av. Prévio', 'Base IRRF');
    audit.planilhaRows.forEach(r => push(r.arquivo, r.linha, r.nome, r.situacao, r.codtipo, num(r.baseInss), r.inssConsiderada ? 'sim' : 'não', num(r.baseInss13), num(r.inssSegurado), num(r.baseFgts), num(r.baseFgtsAv), num(r.baseFgts13), num(r.baseFgts13Av), num(r.baseIrrf)));
    push();
    push('EVENTOS'); push('Etapa', 'Nível', 'Evento', 'Detalhe');
    audit.entries.forEach(e => push(e.stage, e.level, e.message, e.detail));

    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `log-conciliacao-${state.competencia}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Log de conciliação exportado.', 'success');
}

// --- Conciliação Logic ---
function renderConciliacao() {
    renderINSS();
    renderIRRF();
    renderFGTS();
    renderDesligados();
    renderConciliacaoLog();
}

// Diferença máxima aceita entre Planilha/Analítico e o governo, tratada como arredondamento.
const GOV_ROUNDING_TOLERANCE = 1.00;

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
    const isGov = s => /Governo|Digital/.test(s.origem);
    // Valor participa da divergência quando existe (null = não se aplica) e, no Governo, quando
    // há dados importados (synced) — sem importação o Governo vem zerado e é ignorado.
    const isActive = (s, v) => v !== null && v !== undefined && (!isGov(s) || (s.synced === undefined ? v > 0 : s.synced));

    // Cabeçalho dinâmico baseado nas fontes disponíveis
    let headHtml = `<tr><th style="width:30%; padding:12px 16px; text-align:left; font-weight:600; color:var(--text-primary); border-bottom:1px solid var(--border)">Métrica / Rubrica</th>`;
    sources.forEach(s => {
        let title = s.origem;
        if (title.includes('Analítico')) title = 'Analítico (Folha)';
        else if (title.includes('Confronto')) title = 'Planilha (Bases)';
        else if (title.includes('DCTFWeb')) title = 'DCTFWeb (Gov)';
        else if (isGov(s)) title = type === 'FGTS' ? 'GFD (Governo)' : 'eSocial (Gov)';
        headHtml += `<th style="text-align:right; padding:12px 16px; font-weight:600; color:var(--text-primary); border-bottom:1px solid var(--border)">${title}</th>`;
    });
    headHtml += `<th style="text-align:right; padding:12px 16px; font-weight:600; color:var(--text-primary); border-bottom:1px solid var(--border)">Divergência</th>`;
    headHtml += `<th style="width:80px; text-align:center; padding:12px 16px; font-weight:600; color:var(--text-primary); border-bottom:1px solid var(--border)">Status</th></tr>`;
    thead.innerHTML = headHtml;

    // Selo do card = pior situação entre as linhas (uma linha divergente não pode ficar escondida pelo total).
    const severity = { na: 0, ok: 1, rounding: 2, diff: 3 };
    let worstStatus = 'na';

    tbody.innerHTML = metrics.map(m => {
        // Linha de seção (ex.: "Contribuintes individuais")
        if (m.section) {
            return `<tr><td colspan="${sources.length + 3}" style="padding:14px 16px 6px; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-muted)">${m.section}</td></tr>`;
        }
        const isTotal = m.key === 'total' || m.key === 'totalFGTS';
        const isSubtotal = !!m.subtotal;
        const bold = isTotal || isSubtotal;
        const rowStyle = isTotal
            ? 'border-top:2px solid var(--border); background:rgba(16,185,129,0.06)'
            : (isSubtotal ? 'border-top:1px solid var(--border); background:rgba(255,255,255,0.02)' : '');

        let rowHtml = `<tr style="${rowStyle}">`;
        rowHtml += bold
            ? `<td style="padding:12px 16px; font-weight:700; color:var(--text-primary)">${m.label}</td>`
            : `<td style="padding:10px 16px; color:var(--text-secondary)">${m.label}</td>`;

        const activeValues = [];
        const internalValues = []; // Analítico e Planilha: precisam bater ao centavo
        sources.forEach(s => {
            const raw = s[m.key];
            const active = isActive(s, raw);
            if (active) activeValues.push(raw);
            if (active && !isGov(s)) internalValues.push(raw);
            const shown = raw === null || (isGov(s) && !active) ? '—' : formatCurrency(raw || 0);
            rowHtml += `<td style="text-align:right; font-family:'JetBrains Mono',monospace; ${bold ? 'font-weight:700; font-size:1rem; color:var(--text-secondary)' : 'font-weight:600'}">${shown}</td>`;
        });

        const spread = vals => (vals.length >= 2 ? Math.max(...vals) - Math.min(...vals) : 0);
        const maxDiff = spread(activeValues);
        // Contra o governo, centavos são arredondamento (o eSocial arredonda por trabalhador/estabelecimento).
        const status = activeValues.length < 2 ? 'na'
            : maxDiff < 0.01 ? 'ok'
            : (spread(internalValues) < 0.01 && maxDiff <= GOV_ROUNDING_TOLERANCE ? 'rounding' : 'diff');
        if (severity[status] > severity[worstStatus]) worstStatus = status;

        const diffColor = { ok: 'var(--text-muted)', rounding: 'var(--accent-orange)', diff: 'var(--accent-red)', na: 'var(--text-muted)' }[status];
        const statusHtml = {
            na: '<span style="color:var(--text-muted)">—</span>',
            ok: '<span class="status-check ok">✓</span>',
            rounding: '<span title="Diferença de centavos com o governo (arredondamento)" style="color:var(--accent-orange); font-weight:bold">≈</span>',
            diff: '<span style="color:var(--accent-red); font-weight:bold">!</span>'
        }[status];
        rowHtml += `<td style="text-align:right; font-family:'JetBrains Mono',monospace; font-weight:600; color:${diffColor}">${status === 'na' ? '—' : formatCurrency(maxDiff)}</td>`;
        rowHtml += `<td style="text-align:center">${statusHtml}</td></tr>`;
        
        return rowHtml;
    }).join('');
    
    if (statusBadge) {
        const badge = { ok: ['badge-success', 'Conferido'], na: ['badge-warning', 'Pendente'], rounding: ['badge-success', 'Conferido (± centavos)'], diff: ['badge-warning', 'Divergência'] }[worstStatus];
        statusBadge.className = `badge ${badge[0]}`;
        statusBadge.innerText = badge[1];
    }
}

function renderINSS() {
    renderDynamicTable('INSS', [
        { section: 'Empregados' },
        { label: 'Base Folha (mensal + 13º)', key: 'base' },
        { label: 'Segurados Retido (1082)', key: 'segurados' },
        { label: 'Patronal (CPP 1138-01)', key: 'patronal' },
        { label: 'RAT Ajustado (1646)', key: 'ratfap' },
        { label: 'Terceiros (1170–1200)', key: 'terceiros' },
        { label: 'Subtotal Empregados', key: 'subtotal', subtotal: true },
        { section: 'Contribuintes individuais (pró-labore + autônomos)' },
        { label: 'Base Contribuintes Individuais', key: 'baseCI' },
        { label: 'Segurados CI (1099)', key: 'seguradosCI' },
        { label: 'Patronal CI (1138-04)', key: 'patronalCI' },
        { label: '(−) Salário-Família', key: 'salarioFamilia' },
        { label: 'Total Guia INSS', key: 'total' }
    ]);
}

function renderIRRF() {
    renderDynamicTable('IRRF', [
        { label: 'IRRF Mensal', key: 'irrfMensal' },
        { label: 'IRRF 13º Salário', key: 'irrf13' },
        { label: 'IRRF Férias', key: 'irrfFerias' },
        { label: 'Total IRRF (0561)', key: 'total' }
    ]);
}

function checkUploadProgress() {
    const btn = document.getElementById('processBtn');
    const hasReadableFile = [...state.files.pdf, ...state.files.planilha]
        .some(file => file && file.type !== 'virtual');
    if (btn) btn.disabled = !hasReadableFile;
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



function exportConciliacao() {
    if (typeof XLSX === 'undefined' || !XLSX.utils?.book_new || !XLSX.utils?.aoa_to_sheet || !XLSX.writeFile) {
        showToast('Biblioteca XLSX indisponível. Recarregue a página e tente novamente.', 'error');
        return;
    }

    try {
        const workbook = XLSX.utils.book_new();
        const definitions = [
            { name: 'INSS', sources: state.conciliacao?.inss || [], metrics: [['Base Folha', 'base'], ['Segurados (1082)', 'segurados'], ['Patronal (1138-01)', 'patronal'], ['RAT Ajustado (1646)', 'ratfap'], ['Terceiros', 'terceiros'], ['Subtotal Empregados', 'subtotal'], ['Base Contribuintes Individuais', 'baseCI'], ['Segurados CI (1099)', 'seguradosCI'], ['Patronal CI (1138-04)', 'patronalCI'], ['Salário-Família', 'salarioFamilia'], ['Total Guia INSS', 'total']] },
            { name: 'IRRF', sources: state.conciliacao?.irrf || [], metrics: [['IRRF Mensal', 'irrfMensal'], ['IRRF 13º', 'irrf13'], ['IRRF Férias', 'irrfFerias'], ['Total IRRF', 'total']] },
            { name: 'FGTS', sources: state.conciliacao?.fgts || [], metrics: [['Base FGTS Mensal', 'baseMensal'], ['Valor FGTS Mensal', 'valorMensal'], ['Base FGTS 13º', 'base13'], ['Valor FGTS 13º', 'valor13'], ['Base FGTS Rescisória', 'baseRescisoria'], ['Valor FGTS Rescisório', 'valorRescisorio'], ['Total a Recolher', 'total']] },
            { name: 'Desligados', sources: state.conciliacao?.desligados || [], metrics: [['Quantidade', 'qtd'], ['FGTS Quitação', 'fgtsQuitacao'], ['FGTS Mês Anterior', 'fgtsMesAnterior'], ['FGTS Aviso Prévio', 'fgtsAvisoPrevio'], ['FGTS Artigo 22', 'fgtsArtigo22'], ['FGTS 13º Indenizado', 'fgts13Indenizado'], ['FGTS 13º Rescisão', 'fgts13Rescisao'], ['Total FGTS Rescisório', 'totalFGTS'], ['Base Rescisória Calculada', 'baseRescisoriaCalculada']] }
        ];

        definitions.forEach(({ name, sources, metrics }) => {
            const rows = [
                ['Competência', state.competencia],
                ['Métrica', ...sources.map(source => source.origem || 'Fonte')]
            ];
            metrics.forEach(([label, key]) => rows.push([label, ...sources.map(source => source[key] ?? '')]));
            if (sources.length === 0) rows.push(['Sem dados disponíveis para esta competência.']);
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
        });

        if (conciliacaoAudit?.divergencias?.length) {
            const rows = [['Tributo', 'Métrica', 'Analítico', 'Planilha', 'Governo', 'Analítico − Planilha', 'Planilha − Governo', 'Diagnóstico']];
            conciliacaoAudit.divergencias.forEach(d => rows.push([
                d.tributo, d.metrica, d.analitico ?? '', d.planilha ?? '', d.governo ?? '', d.diferenca ?? '', d.difGov ?? '', (d.motivos || []).join(' ')
            ]));
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Divergências');
        }

        XLSX.writeFile(workbook, `conciliacao-${state.competencia}.xlsx`);
        showToast('Planilha de conciliação exportada.', 'success');
    } catch (error) {
        console.error('Erro ao exportar conciliação:', error);
        showToast('Não foi possível gerar a planilha de conciliação.', 'error');
    }
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
            state.conciliacao.irrf = [];
            state.conciliacao.desligados = [];

            // Limpar inputs de arquivo físicos
            ['planilha', 'pdf', 'encargos', 'fgtsDigital', 'esocial', 'dctf'].forEach(id => {
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
