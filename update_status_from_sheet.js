// meu-primeiro-backend-node/update_status_from_sheet.js

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

function parseStatusAndDate(cellValue) {
    if (cellValue === undefined || cellValue === null) return { status: '-', date: null }; 

    const cleanedValue = String(cellValue).trim().toUpperCase();

    if (cleanedValue === '-') return { status: 'pago', date: null }; 
    if (cleanedValue.includes('OK')) return { status: 'pago', date: null };
    if (cleanedValue.includes('NEGOCIAÇÃO')) return { status: 'pendente', date: null }; 
    if (cleanedValue === 'PENDENTE') return { status: 'pendente', date: null };
    
    const parts = cleanedValue.split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; 
        let year = parseInt(parts[2], 10);
        if (year < 100) { year += (year < 50 ? 2000 : 1900); }
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
            return { status: 'pago', date: date.toISOString() };
        }
    }
    if (typeof cellValue === 'number' && cellValue > 10000) { 
        const isoDate = excelDateToISODate(cellValue);
        if (isoDate) {
            return { status: 'pago', date: isoDate };
        }
    }

    return { status: 'desconhecido', date: null };
}


async function runUpdateScript() {
    try {
        console.log('Iniciando script de atualização de status a partir da planilha...');

        // 1. Obter todos os lançamentos do seu banco de dados
        console.log('Buscando lançamentos existentes do backend...');
        const response = await axios.get(API_BASE_URL);
        const lancamentosDoBanco = response.data;
        console.log(`Encontrados ${lancamentosDoBanco.length} lançamentos no banco de dados.`);

        // 2. Ler os dados da sua planilha XLSX (pega a primeira aba)
        const workbook = XLSX.readFile(path.join(__dirname, PLANILHA_FILE));
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]; 

        if (!worksheet) {
            throw new Error(`Nenhuma aba encontrada no arquivo "${PLANILHA_FILE}".`);
        }

        const dadosDaPlanilha = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: false }); 
        console.log(`Planilha "${PLANILHA_FILE}" lida com sucesso. Encontradas ${dadosDaPlanilha.length} linhas de dados.`);
        
        const updatePromises = [];
        const hoje = new Date(); 
        hoje.setHours(0, 0, 0, 0); 

        // Gerar uma lista de nomes de colunas de Status (S_MES_ANO)
        let statusColumnNames = [];
        if (dadosDaPlanilha.length > 0) {
            const firstRowObject = dadosDaPlanilha[0];
            for (const key in firstRowObject) {
                if (key.trim().startsWith('S_') && key.trim().length >= 8) { // Ex: S_MAR_23
                    statusColumnNames.push(key.trim());
                }
            }
        }
        const QUANTIDADE_PARCELAS_FIXA = statusColumnNames.length; // Quantidade de colunas S_
        if (QUANTIDADE_PARCELAS_FIXA === 0) {
            console.error("ERRO: Nenhuma coluna de status (S_MES_ANO) detectada na planilha. Verifique os cabeçalhos S_!");
            throw new Error("Mapeamento de colunas de status falhou.");
        }


        for (const linhaAluno of dadosDaPlanilha) {
            const nomeAlunoPlanilha = String(linhaAluno['NOME DO ALUNO'] || '').trim(); // <--- AJUSTE AQUI: Nome exato da coluna do nome
            
            if (!nomeAlunoPlanilha || nomeAlunoPlanilha === '' || nomeAlunoPlanilha.toUpperCase().includes('LEGENDA') || nomeAlunoPlanilha.toUpperCase().includes('TOTAL')) {
                continue;
            }
            
            for (let i = 0; i < statusColumnNames.length; i++) { // Itera por cada referência de mês
                const statusColunaName = statusColumnNames[i];
                const numeroParcela = i + 1; // A parcela é 1-indexed

                const dataStatusPlanilha = linhaAluno[statusColunaName]; 
                
                if (dataStatusPlanilha === undefined || dataStatusPlanilha === null || String(dataStatusPlanilha).trim() === '-') {
                    continue; 
                }

                const { status: newStatusFromSheet } = parseStatusAndDate(dataStatusPlanilha);

                if (newStatusFromSheet === 'desconhecido') {
                     console.warn(`Status desconhecido para "${nomeAlunoPlanilha.substring(0, Math.min(nomeAlunoPlanilha.length, 20))}..." - Parcela ${numeroParcela} (Valor: "${dataStatusPlanilha}"). Ignorando.`);
                     continue; 
                }

                const lancamentoCorrespondente = lancamentosDoBanco.find(l => 
                    l.nome.trim() === nomeAlunoPlanilha && 
                    l.numeroParcela === numeroParcela
                );

                if (lancamentoCorrespondente) {
                    let statusFinalParaAtualizar = newStatusFromSheet;

                    const vencimentoRealLancamento = new Date(lancamentoCorrespondente.vencimento);
                    if (statusFinalParaAtualizar === 'pendente' && vencimentoRealLancamento.getTime() < hoje.getTime()) {
                        statusFinalParaAtualizar = 'vencido';
                    }
                    
                    if (lancamentoCorrespondente.status !== statusFinalParaAtualizar) {
                        console.log(`Atualizando "${nomeAlunoPlanilha.substring(0, Math.min(nomeAlunoPlanilha.length, 20))}..." - Parcela ${numeroParcela} (ID: ${lancamentoCorrespondente._id.substring(0, 8)}...): ${lancamentoCorrespondente.status} -> ${statusFinalParaAtualizar}`);
                        const updatePayload = { status: statusFinalParaAtualizar };
                        
                        updatePromises.push(
                            axios.put(`${API_BASE_URL}/${lancamentoCorrespondente._id}`, updatePayload)
                        );
                    } else {
                        // console.log(`Status de "${nomeAlunoPlanilha}" - Parcela ${numeroParcela} já é "${statusFinalParaAtualizar}". Nenhuma atualização necessária.`);
                    }
                } else {
                    console.warn(`Lançamento não encontrado no banco para: "${nomeAlunoPlanilha.substring(0, Math.min(nomeAlunoPlanilha.length, 20))}..." - Parcela ${numeroParcela}. Verifique o cadastro inicial ou o mapeamento.`);
                }
            }
        }

        console.log(`\nEnviando ${updatePromises.length} requisições PUT para o backend...`);
        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
            console.log('Script de atualização de status concluído com sucesso!');
        } else {
            console.log('Nenhuma atualização necessária ou lançamentos encontrados para atualizar na planilha.');
        }

    } catch (error) {
        console.error('Erro durante a execução do script:', error);
        if (error.response) {
            console.error('Dados da Resposta de Erro:', error.response.data);
            console.error('Status da Resposta de Erro:', error.response.status);
            console.error('Corpo da Resposta de Erro:', JSON.stringify(error.response.data)); 
        } else {
            console.error('Detalhes do erro:', error.message);
        }
    }
}

module.exports = { runUpdateScript };