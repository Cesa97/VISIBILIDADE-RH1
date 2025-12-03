// backend/server.js
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config(); // Carrega senhas do arquivo .env seguro

const app = express();
app.use(cors()); // Permite que o frontend acesse

// Conexão segura que o usuário NUNCA vê
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

// Rota API: O frontend vai chamar http://localhost:3000/api/colaboradores
app.get('/api/colaboradores', async (req, res) => {
    // 1. O Backend busca no banco
    let { data, error } = await supabase.from('QLP').select('*');
    
    if (error) return res.status(500).json({ error: error.message });

    // 2. O Backend processa a sujeira (aquela função corrigirStringQuebrada vem pra cá)
    const dadosLimpos = data.map(colab => ({
        ...colab,
        NOME: corrigirStringQuebrada(colab.NOME), // Processamento no servidor
        CARGO: corrigirStringQuebrada(colab['CARGO ATUAL'])
    }));

    // 3. Devolve JSON limpo para o frontend
    res.json(dadosLimpos);
});

app.listen(3000, () => console.log('Servidor Backend rodando na porta 3000'));