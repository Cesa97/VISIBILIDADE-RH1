// backend/server.js
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Conexão segura com Supabase (para buscar colaboradores depois)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ========================================================
// 🔐 ÁREA DE LOGIN E SENHA PARA TESTES
// ========================================================
const USUARIOS_TESTE = {
    // ADMIN (Acesso total)
    "11122233344": { 
        senha: "123456", 
        nome: "Administrador", 
        perfil: "admin" 
    },
    // GESTOR
    "22233344455": { 
        senha: "123456", 
        nome: "Gestor de Área", 
        perfil: "gestor" 
    },
    // FUNCIONÁRIO COMUM
    "33344455566": { 
        senha: "123456", 
        nome: "Colaborador", 
        perfil: "user" 
    }
};

// ========================================================
// 🛠️ FUNÇÕES UTILITÁRIAS (Lógica de Negócio)
// ========================================================
function corrigirStringQuebrada(texto) {
    if (typeof texto !== 'string' || !texto) return texto;
    
    // Correções comuns
    if (texto.includes(' S ')) texto = texto.replace(/ S /g, ' ÀS ');
    
    if (texto.match(/[\?]/)) {
        const correcoes = {
            'COMPET.NCIAS': 'COMPETÊNCIAS',
            'SEGURAN.A': 'SEGURANÇA',
            'CONFIAN.A': 'CONFIANÇA',
            'AN.LISE': 'ANÁLISE',
            'ANAL.TICA': 'ANALÍTICA',
            'DECIS.ES': 'DECISÕES',
            'PRIORIZA..O': 'PRIORIZAÇÃO',
            'REUNI.ES': 'REUNIÕES',
            'COMUNICA..O': 'COMUNICAÇÃO'
        };
        
        for (const [erro, correto] of Object.entries(correcoes)) {
            const regex = new RegExp(erro, 'g');
            if (texto.match(regex)) texto = texto.replace(regex, correto);
        }
        
        if (texto.match(/ N.O /)) texto = texto.replace(/ N.O /g, ' NÃO ');
        if (texto.match(/^N.O /)) texto = texto.replace(/^N.O /g, 'NÃO ');
        
        // Numerais ordinais
        texto = texto.replace(/(\d)\./g, '$1°');
    }
    return texto;
}

// ========================================================
// 🚀 ROTAS DA API
// ========================================================

// 1. Rota de Login (Usa os usuários de teste acima)
app.post('/api/login', (req, res) => {
    const { cpf, senha } = req.body;
    
    // Remove pontuação do CPF se vier do frontend
    const cpfLimpo = cpf.replace(/\D/g, ''); 

    const usuario = USUARIOS_TESTE[cpfLimpo];

    if (usuario && usuario.senha === senha) {
        console.log(`Login sucesso: ${usuario.nome}`);
        res.json({ 
            sucesso: true, 
            usuario: {
                nome: usuario.nome,
                perfil: usuario.perfil
            }
        });
    } else {
        console.log(`Login falhou para CPF: ${cpfLimpo}`);
        res.status(401).json({ 
            sucesso: false, 
            mensagem: "CPF ou Senha incorretos." 
        });
    }
});

// 2. Rota de Colaboradores
app.get('/api/colaboradores', async (req, res) => {
    try {
        const { search, status, area, lider, classificacao, page = 0 } = req.query;
        const ITENS_POR_PAGINA = 30;
        const from = page * ITENS_POR_PAGINA;
        const to = from + ITENS_POR_PAGINA - 1;

        let query = supabase.from('QLP').select('*', { count: 'exact' });

        if (search) query = query.ilike('NOME', `%${search}%`);
        if (status) {
            if (status === 'AFASTADO') query = query.or('SITUACAO.eq.AFASTADO,SITUACAO.eq.AFASTAMENTO');
            else if (status === 'DESLIGADOS') query = query.or('SITUACAO.eq.DESLIGADOS,SITUACAO.eq.DESPEDIDA');
            else query = query.eq('SITUACAO', status);
        }
        if (area) query = query.eq('ATIVIDADE', area);
        if (lider) query = query.eq('LIDER', lider);
        if (classificacao) query = query.eq('CLASSIFICACAO', classificacao);

        query = query.order('NOME', { ascending: true }).range(from, to);

        const { data, error, count } = await query;
        if (error) throw error;

        // Limpeza de dados
        const dadosLimpos = data.map(c => {
            const obj = { ...c };
            // Limpa campos principais
            ['NOME', 'ATIVIDADE', 'LIDER', 'TURNO', 'ESCOLARIDADE', 'CARGO ATUAL'].forEach(k => {
                if (obj[k]) obj[k] = corrigirStringQuebrada(obj[k]);
            });
            // Limpa PDI
            for(let i=1; i<=7; i++) {
                [`COMPETENCIA_${i}`, `SITUACAO_DA_ACAO_${i}`, `O_QUE_FAZER_${i}`].forEach(k => {
                    if (obj[k]) obj[k] = corrigirStringQuebrada(obj[k]);
                });
            }
            return obj;
        });

        res.json({ data: dadosLimpos, count });

    } catch (err) {
        console.error("Erro API:", err);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});

// 3. Rota de Filtros
app.get('/api/filtros', async (req, res) => {
    try {
        const { data } = await supabase.from('QLP').select('ATIVIDADE, LIDER, CLASSIFICACAO');
        
        const areas = [...new Set(data.map(d => corrigirStringQuebrada(d.ATIVIDADE)).filter(Boolean))].sort();
        const lideres = [...new Set(data.map(d => corrigirStringQuebrada(d.LIDER)).filter(Boolean))].sort();
        const classificacoes = [...new Set(data.map(d => d.CLASSIFICACAO).filter(Boolean))].sort();

        res.json({ areas, lideres, classificacoes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Rota Dashboard Stats
app.get('/api/dashboard-stats', async (req, res) => {
    try {
        const { data: metas } = await supabase.from('metas_qlp').select('*');
        const { data: ativos } = await supabase
            .from('QLP')
            .select('ATIVIDADE, SITUACAO, PCD, "CARGO ATUAL"')
            .eq('SITUACAO', 'ATIVO');

        const metasMap = (metas || []).reduce((acc, m) => ({...acc, [m.area]: m}), {});
        const areas = [...new Set([...ativos.map(d => corrigirStringQuebrada(d.ATIVIDADE)).filter(Boolean), ...Object.keys(metasMap)])].sort();
        
        const stats = {};
        areas.forEach(a => stats[a] = { qlp: 0, pcd: 0, jovem: 0, meta: metasMap[a] || {} });

        ativos.forEach(c => {
            const area = corrigirStringQuebrada(c.ATIVIDADE);
            if (stats[area]) {
                stats[area].qlp++;
                if (c.PCD === 'SIM') stats[area].pcd++;
                if ((c['CARGO ATUAL']||'').includes('JOVEM APRENDIZ')) stats[area].jovem++;
            }
        });

        res.json({ stats, totalAtivos: ativos.length, areas });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Rota Salvar Metas
app.post('/api/metas', async (req, res) => {
    try {
        const { area, meta, meta_pcd, meta_jovem } = req.body;
        const { error } = await supabase.from('metas_qlp').upsert({ 
            area, meta, meta_pcd, meta_jovem 
        }, { onConflict: 'area' });

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`✅ Servidor rodando! Acesse: http://localhost:${port}`);
    console.log(`🔑 Use CPF: 11122233344 e Senha: 123456 para testar.`);
});