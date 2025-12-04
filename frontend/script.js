// frontend/script.js

// URL da API Backend
const API_URL = 'http://localhost:3000/api';

// Variáveis Globais de UI
let dashboardContainer, loadingIndicator, searchBar, filterStatus, filterArea, filterLider, filterClassificacao, loadMoreButton;
let metaForm, metaAreaSelect, metaValorInput, metaPCDInput, metaJovemInput, metaSubmitButton, metaSuccessMessage;
let reportTableBodyQLP, reportTableBodyPCD, reportTableBodyJovem;
let metaChartQLP = null, metaChartPCD = null, metaChartJovem = null;
let currentPage = 0;
let listaColaboradoresGlobal = []; 

// ======== FUNÇÕES DE FORMATAÇÃO (UI ONLY) ========
function formatarSalario(valor) {
    if (!valor) return '';
    const numeroLimpo = String(valor).replace("R$", "").replace(/\./g, "").replace(",", ".");
    const numero = parseFloat(numeroLimpo);
    if (isNaN(numero)) return valor;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

function formatarCPF(cpf) {
    if (!cpf) return '';
    let c = String(cpf).replace(/[^\d]/g, '');
    if (c.length === 10) c = '0' + c;
    if (c.length !== 11) return cpf;
    return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9, 11)}`;
}

function formatarDataExcel(valor) {
    if (!valor) return '';
    const serial = Number(valor);
    if (isNaN(serial) || serial < 20000) return String(valor);
    try {
        const d = new Date((serial - 25569) * 86400000);
        d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
        return d.toLocaleDateString('pt-BR');
    } catch (e) { return String(valor); }
}

function formatarTempoDeEmpresa(dias) {
    if (!dias) return '';
    const n = parseInt(dias, 10);
    if (isNaN(n) || n <= 0) return ''; 
    const a = Math.floor(n / 365.25);
    const m = Math.floor((n % 365.25) / 30.44); 
    let res = '';
    if (a > 0) res += `${a} ${a === 1 ? 'ano' : 'anos'}`;
    if (m > 0) {
        if (a > 0) res += ' e ';
        res += `${m} ${m === 1 ? 'mês' : 'meses'}`;
    }
    return (a === 0 && m === 0) ? "Menos de 1 mês" : res;
}

// ======== SETUP DO DASHBOARD ========
function setupDashboard() {
    dashboardContainer = document.getElementById('dashboard-container');
    loadingIndicator = document.getElementById('loading-indicator');
    
    // Filtros
    searchBar = document.getElementById('search-bar');
    filterStatus = document.getElementById('filter-status');
    filterArea = document.getElementById('filter-area');
    filterLider = document.getElementById('filter-lider');
    filterClassificacao = document.getElementById('filter-classificacao');
    loadMoreButton = document.getElementById('load-more-button');
    
    // Metas e Relatórios
    metaForm = document.getElementById('meta-form');
    metaAreaSelect = document.getElementById('meta-area');
    metaValorInput = document.getElementById('meta-valor');
    metaPCDInput = document.getElementById('meta-pcd-valor'); 
    metaJovemInput = document.getElementById('meta-jovem-valor'); 
    metaSubmitButton = document.getElementById('meta-submit-button');
    metaSuccessMessage = document.getElementById('meta-success-message');
    
    reportTableBodyQLP = document.getElementById('report-table-body-qlp');
    reportTableBodyPCD = document.getElementById('report-table-body-pcd');
    reportTableBodyJovem = document.getElementById('report-table-body-jovem');

    // Event Listeners (Debounce simples no search)
    let timeout = null;
    if (searchBar) searchBar.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(carregarColaboradores, 500);
    });

    if (filterStatus) filterStatus.addEventListener('change', carregarColaboradores);
    if (filterArea) filterArea.addEventListener('change', carregarColaboradores);
    if (filterLider) filterLider.addEventListener('change', carregarColaboradores);
    if (filterClassificacao) filterClassificacao.addEventListener('change', carregarColaboradores);
    if (loadMoreButton) loadMoreButton.addEventListener('click', carregarMais);
    
    if (metaForm) metaForm.addEventListener('submit', handleMetaSubmit);
    
    setupNavigation();
    carregarFiltrosAPI(); // Chama API para popular selects
    restaurarAbaAtiva();
}

// Navegação entre abas
function setupNavigation() {
    const navs = {
        'visao-geral': document.getElementById('nav-visao-geral'),
        'gestao': document.getElementById('nav-painel-gestao'),
        'graficos': document.getElementById('nav-graficos')
    };
    Object.keys(navs).forEach(key => {
        if(navs[key]) navs[key].addEventListener('click', (e) => {
            e.preventDefault();
            trocarAba(key);
        });
    });
    
    const navSair = document.getElementById('nav-sair');
    if (navSair) navSair.addEventListener('click', (e) => {
        e.preventDefault();
        sessionStorage.clear();
        window.location.href = 'login.html';
    });
}

function trocarAba(aba) {
    const contents = {
        'visao-geral': document.getElementById('visao-geral-content'),
        'gestao': document.getElementById('gestao-content'),
        'graficos': document.getElementById('graficos-content')
    };
    
    for (let key in contents) {
        if (contents[key]) contents[key].style.display = (key === aba) ? 'block' : 'none';
        const nav = document.getElementById(`nav-${key === 'gestao' ? 'painel-gestao' : key}`);
        if(nav) {
            if (key === aba) nav.classList.add('active');
            else nav.classList.remove('active');
        }
    }
    sessionStorage.setItem('activeTab', aba);

    if (aba === 'gestao') carregarDadosDashboard(); 
    if (aba === 'graficos') carregarDadosDashboard(true);
}

function restaurarAbaAtiva() {
    const activeTab = sessionStorage.getItem('activeTab') || 'visao-geral';
    trocarAba(activeTab);
    if(activeTab === 'visao-geral') carregarColaboradores();
}

// ======== CONSUMO DA API: COLABORADORES ========

async function carregarFiltrosAPI() {
    try {
        const res = await fetch(`${API_URL}/filtros`);
        const { areas, lideres, classificacoes } = await res.json();

        const popular = (el, arr) => {
            if(!el) return;
            el.innerHTML = '<option value="">Todos</option>' + arr.map(i => `<option value="${i}">${i}</option>`).join('');
        };

        popular(filterArea, areas);
        popular(filterLider, lideres);
        popular(filterClassificacao, classificacoes);
        
        // Popula também o select de Metas
        if(metaAreaSelect) {
            metaAreaSelect.innerHTML = '<option value="">Selecione...</option>' + areas.map(i => `<option value="${i}">${i}</option>`).join('');
        }

    } catch (e) { console.error("Erro ao carregar filtros", e); }
}

async function carregarColaboradores() {
    currentPage = 0;
    if (!loadingIndicator || !dashboardContainer) return;
    
    loadingIndicator.style.display = 'block';
    dashboardContainer.innerHTML = '';
    listaColaboradoresGlobal = [];
    if(loadMoreButton) loadMoreButton.style.display = 'none';

    await fetchColaboradores();
}

async function carregarMais() {
    currentPage++;
    if(loadMoreButton) {
        loadMoreButton.disabled = true;
        loadMoreButton.textContent = 'Carregando...';
    }
    await fetchColaboradores();
}

async function fetchColaboradores() {
    // Monta a URL com Query Params
    const params = new URLSearchParams({
        page: currentPage,
        search: searchBar ? searchBar.value : '',
        status: filterStatus ? filterStatus.value : '',
        area: filterArea ? filterArea.value : '',
        lider: filterLider ? filterLider.value : '',
        classificacao: filterClassificacao ? filterClassificacao.value : ''
    });

    try {
        const res = await fetch(`${API_URL}/colaboradores?${params}`);
        const { data, count } = await res.json();

        loadingIndicator.style.display = 'none';

        if (!data || data.length === 0) {
            if(currentPage === 0) dashboardContainer.innerHTML = "<p>Nenhum colaborador encontrado.</p>";
            return;
        }

        data.forEach(colaborador => {
            const index = listaColaboradoresGlobal.push(colaborador) - 1;
            dashboardContainer.innerHTML += criarCardColaborador(colaborador, index);
        });

        // Controle do botão Carregar Mais
        if(loadMoreButton) {
            loadMoreButton.disabled = false;
            loadMoreButton.textContent = 'Carregar Mais';
            // Se vieram menos itens que o limite, acabou
            loadMoreButton.style.display = (data.length < 30) ? 'none' : 'block';
        }

    } catch (error) {
        console.error(error);
        dashboardContainer.innerHTML = `<p style="color:red">Erro de conexão com o servidor.</p>`;
    }
}

function criarCardColaborador(colab, index) {
    const status = colab.SITUACAO || 'Indefinido';
    const statusClass = status.includes('AFASTADO') ? 'status-afastado' : (status.includes('DESLIGADO') ? 'status-desligados' : 'status-ativo');
    const pcdClass = (colab.PCD === 'SIM') ? 'pcd-sim' : 'pcd-nao';
    
    let classifClass = 'classificacao-sem';
    if(colab.CLASSIFICACAO === 'BOM') classifClass = 'classificacao-bom';
    // ... (pode adicionar as outras cores de classificação aqui se quiser)

    return `
        <div class="employee-card ${statusClass}">
            <div class="card-header">
                <img src="avatar-placeholder.png" alt="Foto">
                <div class="header-info">
                    <h3>${colab.NOME}</h3>
                    <span class="status-badge ${statusClass}">${status}</span>
                </div>
            </div>
            <div class="card-body">
                <p><strong>NOME:</strong> <span>${colab.NOME}</span></p>
                <p><strong>CPF:</strong> <span>${formatarCPF(colab.CPF)}</span></p>
                <p><strong>FUNÇÃO ATUAL:</strong> <span>${colab['CARGO ATUAL'] || ''}</span></p>
                <p><strong>AREA:</strong> <span>${colab.ATIVIDADE}</span></p>
                <p><strong>TEMPO DE EMPRESA:</strong> <span>${formatarTempoDeEmpresa(colab['TEMPO DE EMPRESA'])}</span></p>
                <p><strong>SALARIO:</strong> <span>${formatarSalario(colab.SALARIO)}</span></p>
                <p><strong>PCD:</strong> <span class="pcd-badge ${pcdClass}">${colab.PCD || 'NÃO'}</span></p>
                <p><strong>TURNO:</strong> <span>${colab.TURNO || ''}</span></p>
                <p><strong>LIDER:</strong> <span>${colab.LIDER || ''}</span></p>
                <p><strong>CLASSIFICAÇÃO:</strong> <span class="classificacao-badge ${classifClass}">${colab.CLASSIFICACAO || '-'}</span></p>
            </div>
            <div class="card-footer" onclick="abrirModalDetalhes(${index})">
                <span class="material-icons-outlined expand-icon">keyboard_arrow_down</span>
            </div>
        </div>
    `;
}

// ======== DADOS DE GESTÃO E GRÁFICOS (API AGREGADA) ========

async function carregarDadosDashboard(renderizarGraficos = false) {
    try {
        const res = await fetch(`${API_URL}/dashboard-stats`);
        const { stats, totalAtivos, areas } = await res.json();
        
        // Preenche Relatórios
        renderizarTabelasRelatorio(stats, areas, totalAtivos);
        
        if (renderizarGraficos) {
            renderizarGraficosChartJS(stats, areas);
        }
    } catch (e) { console.error("Erro dashboard stats", e); }
}

function renderizarTabelasRelatorio(stats, areas, totalAtivos) {
    if(!reportTableBodyQLP) return;
    
    let htmlQLP = '', htmlPCD = '', htmlJovem = '';
    
    // Atualiza cards de Cota
    document.getElementById('quota-pcd-value').textContent = Math.ceil(totalAtivos * (totalAtivos > 1000 ? 0.05 : 0.02));
    document.getElementById('quota-jovem-value').textContent = Math.ceil(totalAtivos * 0.05);

    areas.forEach(a => {
        const s = stats[a];
        htmlQLP += `<tr><td>${a}</td><td>${s.meta.meta || 0}</td><td>${s.qlp}</td></tr>`;
        if(s.meta.meta_pcd || s.pcd > 0) htmlPCD += `<tr><td>${a}</td><td>${s.meta.meta_pcd || 0}</td><td>${s.pcd}</td></tr>`;
        if(s.meta.meta_jovem || s.jovem > 0) htmlJovem += `<tr><td>${a}</td><td>${s.meta.meta_jovem || 0}</td><td>${s.jovem}</td></tr>`;
    });

    reportTableBodyQLP.innerHTML = htmlQLP;
    reportTableBodyPCD.innerHTML = htmlPCD || '<tr><td colspan="3">Vazio</td></tr>';
    reportTableBodyJovem.innerHTML = htmlJovem || '<tr><td colspan="3">Vazio</td></tr>';
}

function renderizarGraficosChartJS(stats, areas) {
    const criarDataset = (keyMeta, keyReal) => {
        const labels = [], dMeta = [], dReal = [], dGap = [];
        areas.forEach(a => {
            const m = stats[a].meta[keyMeta] || 0;
            const r = stats[a][keyReal];
            if (m > 0 || r > 0) {
                labels.push(a);
                dMeta.push(m);
                dReal.push(r);
                dGap.push(Math.max(0, m - r));
            }
        });
        return { labels, dMeta, dReal, dGap };
    };

    const render = (id, data, instance) => {
        const ctx = document.getElementById(id).getContext('2d');
        if(instance) instance.destroy();
        return new Chart(ctx, {
            type: 'bar',
            plugins: [ChartDataLabels],
            data: {
                labels: data.labels,
                datasets: [
                    { label: 'Meta', data: data.dMeta, backgroundColor: 'rgba(54, 162, 235, 0.6)' },
                    { label: 'Real', data: data.dReal, backgroundColor: 'rgba(75, 192, 192, 0.6)' },
                    { label: 'Gap', data: data.dGap, backgroundColor: 'rgba(255, 99, 132, 0.6)' }
                ]
            },
            options: { responsive: true, plugins: { datalabels: { anchor: 'end', align: 'top', formatter: v=>v>0?v:'' } } }
        });
    };

    metaChartQLP = render('grafico-metas-qlp', criarDataset('meta', 'qlp'), metaChartQLP);
    metaChartPCD = render('grafico-metas-pcd', criarDataset('meta_pcd', 'pcd'), metaChartPCD);
    metaChartJovem = render('grafico-metas-jovem', criarDataset('meta_jovem', 'jovem'), metaChartJovem);
}

async function handleMetaSubmit(e) {
    e.preventDefault();
    metaSubmitButton.disabled = true;
    
    try {
        await fetch(`${API_URL}/metas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                area: metaAreaSelect.value,
                meta: metaValorInput.value,
                meta_pcd: metaPCDInput.value,
                meta_jovem: metaJovemInput.value
            })
        });
        
        metaSuccessMessage.style.visibility = 'visible';
        setTimeout(() => metaSuccessMessage.style.visibility = 'hidden', 3000);
        metaForm.reset();
        carregarDadosDashboard(); // Recarrega tabelas
    } catch (err) {
        alert('Erro ao salvar meta.');
    } finally {
        metaSubmitButton.disabled = false;
    }
}

// ======== MODAL E PDI ========
function gerarHtmlPDI(colab) {
    let html = `<div class="pdi-section"><h3>Ciclo de Gente - Plano de Desenvolvimento</h3><div class="pdi-container">`;
    let temPDI = false;
    for (let i = 1; i <= 7; i++) {
        const comp = colab[`COMPETENCIA_${i}`];
        if (comp) {
            temPDI = true;
            html += `
                <div class="pdi-card" data-status="${(colab[`STATUS_${i}`]||'').toUpperCase()}">
                    <h4>${i}. ${comp}</h4>
                    <div class="pdi-details">
                        <div class="pdi-item"><strong>Situação</strong><span>${colab[`SITUACAO_DA_ACAO_${i}`]||'-'}</span></div>
                        <div class="pdi-item"><strong>Ação</strong><span>${colab[`O_QUE_FAZER_${i}`]||'-'}</span></div>
                        <div class="pdi-item"><strong>Prazo</strong><span>${formatarDataExcel(colab[`DATA_DE_TERMINO_${i}`])}</span></div>
                    </div>
                </div>`;
        }
    }
    if (!temPDI) html += `<p style="padding:10px;">Nenhum PDI cadastrado.</p>`;
    return html + `</div></div>`;
}

function abrirModalDetalhes(index) {
    const colab = listaColaboradoresGlobal[index];
    const modal = document.getElementById('modal-detalhes');
    document.getElementById('modal-header').innerHTML = `
        <img src="avatar-placeholder.png">
        <div><h2>${colab.NOME}</h2><span class="status-badge">${colab.SITUACAO}</span></div>
    `;
    document.getElementById('modal-dados-grid').innerHTML = `
        <div class="modal-item"><strong>CPF</strong><span>${formatarCPF(colab.CPF)}</span></div>
        <div class="modal-item"><strong>Cargo</strong><span>${colab['CARGO ATUAL']}</span></div>
        <div class="modal-item"><strong>Área</strong><span>${colab.ATIVIDADE}</span></div>
        <div class="modal-item"><strong>Salário</strong><span>${formatarSalario(colab.SALARIO)}</span></div>
        <div class="modal-item" style="grid-column: 1/-1;">${gerarHtmlPDI(colab)}</div>
    `;
    modal.style.display = 'flex';
}
function fecharModal() { document.getElementById('modal-detalhes').style.display = 'none'; }
window.onclick = (e) => { if (e.target == document.getElementById('modal-detalhes')) fecharModal(); };

// Auth Guard
if (sessionStorage.getItem('usuarioLogado') !== 'true') window.location.href = 'login.html';
else setupDashboard();