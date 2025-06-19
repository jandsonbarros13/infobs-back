// meu-primeiro-backend-node/index.js

require('dotenv').config(); // Carrega variáveis de ambiente do arquivo .env

const express = require('express');
const cors = require('cors'); // Middleware para permitir requisições de outros domínios (seu frontend)
const mongoose = require('mongoose'); // ODM para interagir com o MongoDB

// Importa as rotas de clientes (que agora gerenciam lançamentos).
// **Verifique o nome da sua pasta: se é 'router' ou 'routes'.**
const clienteRoutes = require('./router/clienteRoutes'); // Exemplo: './router/clienteRoutes'

const app = express(); // Cria uma instância do aplicativo Express

const PORT = process.env.PORT || 3000; // Define a porta do servidor
const MONGODB_URI = process.env.MONGODB_URI; // Obtém a URI de conexão do MongoDB do .env

// --- Conexão com o MongoDB Atlas ---
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Conectado ao MongoDB Atlas com sucesso!');
  })
  .catch((err) => {
    console.error('Erro ao conectar ao MongoDB Atlas:', err);
    // Em um ambiente de produção, você pode considerar process.exit(1); aqui.
  });
// --- Fim da Conexão com o MongoDB ---

// --- Configuração de Middlewares Globais ---
app.use(express.json()); // Habilita o Express a ler JSON no corpo das requisições
app.use(cors()); // Habilita o CORS para todas as requisições
// --- Fim da Configuração de Middlewares Globais ---

// --- Definição da Rota Raiz (Home) ---
app.get('/', (req, res) => {
  res.send('Olá do Backend! Nosso servidor Node.js e Express está funcionando e CONECTADO ao MongoDB!');
});

// --- Uso das Rotas de Clientes (Lançamentos) ---
// Todas as requisições para '/api/clientes' serão direcionadas para o 'clienteRoutes'.
app.use('/api/clientes', clienteRoutes);
// --- Fim do Uso das Rotas de Clientes ---

// --- Inicia o Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Acesse: http://localhost:${PORT}`);
});