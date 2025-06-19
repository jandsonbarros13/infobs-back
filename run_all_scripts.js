// meu-primeiro-backend-node/run_all_scripts.js

const { clearAllClients } = require('./clear_collection.js'); // Ainda importa, mas não será chamado
const { runSeedScript } = require('./seed_from_sheet.js');
const { runUpdateScript } = require('./update_status_from_sheet.js');

async function main() {
    try {
        console.log('--- Iniciando processo de cadastro e atualização de dados ---'); // <--- Log alterado
        
        // REMOVIDO: await clearAllClients(); // <--- LINHA REMOVIDA
        // REMOVIDO: console.log('\n--- Coleção limpa com sucesso ---'); // <--- LINHA REMOVIDA

        await runSeedScript();
        console.log('\n--- Cadastro inicial a partir da planilha concluído ---');

        await runUpdateScript();
        console.log('\n--- Atualização de status concluída ---');
        
        console.log('\nProcesso completo: Banco de dados atualizado conforme planilha!');

    } catch (error) {
        console.error('Erro no processo principal:', error);
    }
}

main();