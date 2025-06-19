// meu-primeiro-backend-node/seed_from_sheet.js

const axios = require('axios');
const path = require('path');
const XLSX = require('xlsx');

const API_BASE_URL = 'http://localhost:3000/api/clientes';
const PLANILHA_FILE = 'planilha.xlsx'; 

function excelDateToISODate(excelDateNumber) {
    if (typeof excelDateNumber !== 'number' || excelDateNumber < 1) return null;
    try {
        const date = XLSX.SSF.parse_date_code(excelDateNumber);
        const jsDate = new Date(date.y, date.m - 1, date.d); 
        return jsDate.toISOString().split('T')[0]; 
    } catch (e) {
        return null;
    }
}

function parseDateFromCellValue(cellValue) {
    if (cellValue === undefined || cellValue === null) return null;
    const cleanedValue = String(cellValue).trim().toUpperCase();

    const parts = cleanedValue.split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; 
        let year = parseInt(parts[2], 10);
        if (year < 100) { year += (year < 50 ? 2000 : 1900); }
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) { return date.toISOString().split('T')[0]; }
    }
    if (typeof cellValue === 'number' && cellValue > 10000) {
        return excelDateToISODate(cellValue);
    }
    return null; 
}


async function runSeedScript() {
    try {
        console.log('Iniciando script de cadastro em massa a partir da planilha simplificada...');

        const workbook = XLSX.readFile(path.join(__dirname, PLANILHA_FILE));
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]; 

        if (!worksheet) {
            throw new Error(`Nenhuma aba encontrada no arquivo "${PLANILHA_FILE}".`);
        }

        const dadosDaPlanilha = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: false }); 
        console.log(`Planilha "${PLANILHA_FILE}" lida com sucesso. Encontradas ${dadosDaPlanilha.length} linhas de dados.`);
        console.log("DEBUG: Primeira linha de dados (objeto):", JSON.stringify(dadosDaPlanilha[0], null, 2));
        
        const alunosParaCadastrar = [];

        // --- MUDANÇA CRÍTICA: DETECTAR QUANTIDADE DE PARCELAS DE FORMA MAIS INTELIGENTE ---
        let detectedParcelColumnsCount = 0;
        let sampleHeaders = Object.keys(dadosDaPlanilha[0] || {}); // Pega as chaves da primeira linha de dados

        for(const header of sampleHeaders) {
            if (header.trim().startsWith('V_') && header.trim().length >= 8) { // Ex: V_MAR_23
                detectedParcelColumnsCount++;
            }
        }

        if (detectedParcelColumnsCount === 0) {
            console.error("ERRO: Nenhuma coluna de vencimento (V_MES_ANO) detectada na planilha. Verifique os cabeçalhos V_ e S_ na primeira linha!");
            throw new Error("Mapeamento de colunas de vencimento falhou, quantidadeParcelas será 0.");
        }
        const QUANTIDADE_PARCELAS_FIXA = detectedParcelColumnsCount; 
        const VALOR_MENSALIDADE_PADRAO = 100.00; // <--- AJUSTE AQUI: O valor real da mensalidade por aluno

        console.log(`Detectadas ${QUANTIDADE_PARCELAS_FIXA} colunas de referência de mensalidade (V_MES_ANO) na planilha.`);
        
        for (const linhaAluno of dadosDaPlanilha) {
            const nomeAluno = String(linhaAluno['NOME DO ALUNO'] || '').trim(); // <--- AJUSTE AQUI: Nome EXATO da coluna do nome do aluno
            
            if (!nomeAluno || nomeAluno === '' || nomeAluno.toUpperCase().includes('LEGENDA') || nomeAluno.toUpperCase().includes('TOTAL')) {
                console.warn(`Linha ignorada no cadastro (nome inválido/vazio ou legenda/total): "${nomeAluno || 'Vazio/Undefined'}". Conteúdo: ${JSON.stringify(linhaAluno)}`);
                continue;
            }
            
            let initialVencimento = null;
            // Tenta encontrar a data de vencimento da PRIMEIRA parcela válida
            // Itera pelas chaves do objeto linhaAluno
            for (const key in linhaAluno) {
                if (key.trim().startsWith('V_') && key.trim().length >= 8) { // Verifica se é uma coluna V_MES_ANO
                    const cellValue = linhaAluno[key];
                    const parsedDate = parseDateFromCellValue(cellValue); 
                    if (parsedDate) {
                        initialVencimento = parsedDate;
                        break; 
                    }
                }
            }

            if (!initialVencimento) {
                 // Fallback se nenhuma data inicial foi encontrada na linha do aluno
                 initialVencimento = new Date().toISOString().split('T')[0]; 
                 console.warn(`Vencimento inicial para "${nomeAluno}" não encontrado. Usando data atual para cadastro: ${initialVencimento}.`);
            }
            
            const alunoParaCadastrar = {
                nome: nomeAluno,
                vencimento: initialVencimento, 
                valorMensalidade: VALOR_MENSALIDADE_PADRAO, 
                status: 'pendente', 
                // QUANTIDADE_PARCELAS_FIXA já foi detectada. Se for 0, o erro será lançado acima.
                quantidadeParcelas: QUANTIDADE_PARCELAS_FIXA 
            };
            alunosParaCadastrar.push(alunoParaCadastrar);

            // DEBUG: Log do payload exato que será enviado para o backend
            console.log("DEBUG: Payload para POST:", JSON.stringify(alunoParaCadastrar));
        }

        if (alunosParaCadastrar.length === 0) {
            console.log('Nenhum aluno válido encontrado na planilha para cadastrar.');
            return;
        }

        console.log(`Preparando para cadastrar ${alunosParaCadastrar.length} alunos (gerando ${alunosParaCadastrar.length * QUANTIDADE_PARCELAS_FIXA} lançamentos no total)...`);
        
        // --- FAZENDO REQUISIÇÕES POST INDIVIDUAIS PARA CADA ALUNO ---
        const postPromises = alunosParaCadastrar.map(payload => {
            console.log(`Enviando POST para "${payload.nome.substring(0, Math.min(payload.nome.length, 20))}..." com ${payload.quantidadeParcelas} parcelas.`);
            return axios.post(API_BASE_URL, payload);
        });

        await Promise.all(postPromises); // Espera que todas as requisições POST terminem
        console.log(`Todos os ${alunosParaCadastrar.length} alunos e seus lançamentos foram cadastrados com sucesso!`);

    } catch (error) {
        console.error('Erro durante a execução do script de cadastro:', error);
        if (error.response) {
            console.error('Dados da Resposta de Erro:', error.response.data);
            console.error('Status da Resposta de Erro:', error.response.status);
            console.error('Corpo da Resposta de Erro:', JSON.stringify(error.response.data)); 
        } else {
            console.error('Detalhes do erro:', error.message);
        }
        throw error;
    }
}

module.exports = { runSeedScript };