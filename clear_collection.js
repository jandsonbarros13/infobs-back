// meu-primeiro-backend-node/clear_collection.js

const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000/api/clientes';

async function clearAllClients() {
    try {
        console.log('Iniciando limpeza da coleção de lançamentos...');
        
        console.log('Buscando todos os IDs de lançamentos para exclusão...');
        const response = await axios.get(API_BASE_URL, { timeout: 10000 }); // Timeout de 10 segundos
        const lancamentos = response.data;
        
        if (lancamentos.length === 0) {
            console.log('Nenhum lançamento encontrado para excluir. Coleção já está limpa.');
            return; 
        }

        console.log(`Encontrados ${lancamentos.length} lançamentos. Iniciando exclusão individual...`);
        
        const deletePromises = [];
        let deletedCount = 0;
        let failedCount = 0;

        for (const lancamento of lancamentos) {
            const promise = axios.delete(`${API_BASE_URL}/${lancamento._id}`, { timeout: 5000 }) // Timeout para cada DELETE
                .then(res => {
                    deletedCount++;
                    // Usar process.stdout.write para logar na mesma linha
                    process.stdout.write(`\rExcluídos: ${deletedCount}/${lancamentos.length} | Falhas: ${failedCount}`); 
                })
                .catch(error => {
                    failedCount++;
                    // Log de erro individual em nova linha para não atrapalhar o progresso
                    console.error(`\nErro ao excluir lançamento ID ${lancamento._id}:`);
                    if (error.response) {
                        console.error(`  Status: ${error.response.status}, Mensagem: ${error.response.data.message || error.response.statusText}`);
                    } else if (error.request) {
                        console.error('  Nenhuma resposta recebida do servidor. (Backend pode ter caído?)');
                    } else {
                        console.error(`  Erro na configuração da requisição: ${error.message}`);
                    }
                    return null; 
                });
            deletePromises.push(promise);
        }

        await Promise.all(deletePromises); 
        process.stdout.write('\n'); 

        if (deletedCount === lancamentos.length) {
            console.log(`Todos os ${deletedCount} lançamentos foram excluídos com sucesso!`);
        } else {
            console.warn(`Limpeza concluída com ${deletedCount} lançamentos excluídos e ${failedCount} falhas.`);
            if (failedCount > 0) {
                throw new Error(`Falha na exclusão de ${failedCount} lançamentos. Verifique o log acima.`);
            }
        }

    } catch (error) {
        console.error('Erro geral durante a limpeza da coleção:', error);
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
             console.error('O servidor backend não está respondendo ou a conexão expirou. Certifique-se de que está rodando!');
        }
        throw error; 
    }
}

// --- MUDANÇA CRÍTICA AQUI: CHAMAR A FUNÇÃO PRINCIPAL SE O SCRIPT FOR EXECUTADO DIRETAMENTE ---
if (require.main === module) {
    clearAllClients();
}
// --- FIM DA MUDANÇA CRÍTICA ---

// Exporta a função para que outros scripts possam importá-la
module.exports = { clearAllClients };