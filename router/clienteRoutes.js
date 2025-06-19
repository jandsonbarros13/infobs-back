const express = require('express');
const router = express.Router();
const Cliente = require('../models/clienteModel');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const path = require('path');


router.post('/', async (req, res) => {
  try {
    const { nome, vencimento, valorMensalidade, status, quantidadeParcelas } = req.body;
    if (!nome) {
      return res.status(400).json({ message: 'O nome do aluno é obrigatório.' });
    }
    if (!vencimento || isNaN(new Date(vencimento).getTime())) {
      return res.status(400).json({ message: 'A data de vencimento é inválida ou obrigatória.' });
    }
    if (typeof valorMensalidade !== 'number' || valorMensalidade < 0) {
      return res.status(400).json({ message: 'Valor da mensalidade inválido.' });
    }
    if (typeof quantidadeParcelas !== 'number' || quantidadeParcelas < 1) {
      return res.status(400).json({ message: 'Quantidade de parcelas inválida.' });
    }

    const lancamentosParaSalvar = [];
    let dataReferencia = new Date(vencimento);

    for (let i = 0; i < quantidadeParcelas; i++) {
      let dataVencimentoAtual = new Date(dataReferencia);
      dataVencimentoAtual.setMonth(dataReferencia.getMonth() + i);
      const novoLancamento = new Cliente({
        nome,
        vencimento: dataVencimentoAtual,
        valorMensalidade,
        status: i === 0 ? status : 'pendente',
        numeroParcela: i + 1
      });
      lancamentosParaSalvar.push(novoLancamento);
    }
    const lancamentosSalvos = await Cliente.insertMany(lancamentosParaSalvar);
    res.status(201).json(lancamentosSalvos);
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    console.error('Erro ao criar lançamentos:', error);
    res.status(500).json({ message: 'Erro interno do servidor ao criar lançamentos.', error: error.message });
  }
});

// Rota AJUSTADA para buscar lançamentos com paginação e filtros
router.get('/', async (req, res) => {
  try {
    const {
      page = 1, // Página atual (padrão 1)
      limit = 10, // Itens por página (padrão 10)
      nome,
      status,
      mesVencimento,
      anoVencimento,
      dataInicio,
      dataFim
    } = req.query; // Recebe os filtros e parâmetros de paginação

    const currentPage = parseInt(page, 10);
    const itemsPerPage = parseInt(limit, 10);
    const skip = (currentPage - 1) * itemsPerPage; // Calcula quantos itens pular

    const query = {}; // Objeto de query para o MongoDB

    // Aplica os filtros recebidos (igual à lógica anterior)
    if (nome) {
      query.nome = { $regex: new RegExp(nome, 'i') };
    }
    if (status) {
      query.status = status;
    }

    if (dataInicio && dataFim) {
      const start = new Date(dataInicio);
      const end = new Date(dataFim);
      end.setHours(23, 59, 59, 999);
      query.vencimento = { $gte: start, $lte: end };
    } else if (mesVencimento || anoVencimento) {
      if (anoVencimento) {
        const ano = parseInt(anoVencimento);
        const dataInicioAno = new Date(ano, 0, 1);
        const dataFimAno = new Date(ano + 1, 0, 0);
        if (mesVencimento) {
          const mes = parseInt(mesVencimento) - 1;
          dataInicioAno.setMonth(mes, 1);
          dataFimAno.setMonth(mes + 1, 0);
        }
        query.vencimento = { $gte: dataInicioAno, $lte: dataFimAno };
      } else if (mesVencimento) {
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mes = parseInt(mesVencimento) - 1;
        const dataInicioMes = new Date(anoAtual, mes, 1);
        const dataFimMes = new Date(anoAtual, mes + 1, 0);
        query.vencimento = { $gte: dataInicioMes, $lte: dataFimMes };
      }
    }

    // Executa as duas queries em paralelo para melhor performance:
    // 1. Busca os lançamentos da página atual, com filtros e ordenação
    const [lancamentos, totalCount] = await Promise.all([
      Cliente.find(query)
        .skip(skip)
        .limit(itemsPerPage)
        .sort({ nome: 1, vencimento: 1, numeroParcela: 1 }), // Adicionado numeroParcela para ordenação
      // 2. Conta o total de documentos que correspondem aos filtros
      Cliente.countDocuments(query)
    ]);

    res.status(200).json({
      data: lancamentos,
      totalCount: totalCount
    });
  } catch (error) {
    console.error('Erro ao buscar lançamentos com paginação:', error);
    res.status(500).json({ message: 'Erro interno do servidor ao buscar lançamentos.', error: error.message });
  }
});


router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de lançamento inválido.' });
    }
    const lancamento = await Cliente.findById(id);
    if (!lancamento) {
      return res.status(404).json({ message: 'Lançamento não encontrado.' });
    }
    res.status(200).json(lancamento);
  } catch (error) {
    console.error('Erro ao buscar lançamento por ID:', error);
    res.status(500).json({ message: 'Erro interno do servidor ao buscar lançamento.', error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, vencimento, valorMensalidade, status, numeroParcela } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) { return res.status(400).json({ message: 'ID de lançamento inválido.' }); }

    const updates = {};
    if (nome !== undefined) updates.nome = nome;
    if (vencimento !== undefined) {
      if (isNaN(new Date(vencimento).getTime())) { return res.status(400).json({ message: 'Data de vencimento inválida.' }); }
      updates.vencimento = new Date(vencimento);
    }
    if (valorMensalidade !== undefined) {
      if (typeof valorMensalidade !== 'number' || valorMensalidade < 0) { return res.status(400).json({ message: 'Valor da mensalidade inválido.' }); }
      updates.valorMensalidade = valorMensalidade;
    }
    if (status !== undefined) updates.status = status;
    if (numeroParcela !== undefined) updates.numeroParcela = numeroParcela;

    const lancamentoAtualizado = await Cliente.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );
    if (!lancamentoAtualizado) {
      return res.status(404).json({ message: 'Lançamento não encontrado para atualização.' });
    }
    res.status(200).json(lancamentoAtualizado);
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    console.error('Erro ao atualizar lançamento:', error);
    res.status(500).json({ message: 'Erro interno do servidor ao atualizar lançamento.', error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de lançamento inválido.' });
    }
    const lancamentoDeletado = await Cliente.findByIdAndDelete(id);
    if (!lancamentoDeletado) {
      return res.status(404).json({ message: 'Lançamento não encontrado para exclusão.' });
    }
    res.status(200).json({ message: 'Lançamento deletado com sucesso!' });
  } catch (error) {
    console.error('Erro ao deletar lançamento:', error);
    res.status(500).json({ message: 'Erro interno do servidor ao deletar lançamento.', error: error.message });
  }
});

router.get('/relatorio/pdf', async (req, res) => {
  try {
    const { nome, status, mesVencimento, anoVencimento, dataInicio, dataFim } = req.query;
    const query = {};

    if (nome) {
      query.nome = { $regex: new RegExp(nome, 'i') };
    }
    if (status) {
      query.status = status;
    }

    if (dataInicio && dataFim) {
      const start = new Date(dataInicio);
      const end = new Date(dataFim);
      end.setHours(23, 59, 59, 999);
      query.vencimento = { $gte: start, $lte: end };
    } else if (mesVencimento || anoVencimento) {
      if (anoVencimento) {
        const ano = parseInt(anoVencimento);
        const dataInicioAno = new Date(ano, 0, 1);
        const dataFimAno = new Date(ano + 1, 0, 0);
        if (mesVencimento) {
          const mes = parseInt(mesVencimento) - 1;
          dataInicioAno.setMonth(mes, 1);
          dataFimAno.setMonth(mes + 1, 0);
        }
        query.vencimento = { $gte: dataInicioAno, $lte: dataFimAno };
      } else if (mesVencimento) {
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mes = parseInt(mesVencimento) - 1;
        const dataInicioMes = new Date(anoAtual, mes, 1);
        const dataFimMes = new Date(anoAtual, mes + 1, 0);
        query.vencimento = { $gte: dataInicioMes, $lte: dataFimMes };
      }
    }

    // Note: Esta rota de PDF continua buscando TUDO, mesmo com filtros,
    // pois a paginação não se aplica ao PDF que é um relatório completo.
    const lancamentos = await Cliente.find(query).sort({ nome: 1, vencimento: 1, numeroParcela: 1 });


    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio_lancamentos.pdf"');

    const doc = new PDFDocument();
    doc.pipe(res);

    const pageMargin = 50;
    const columnPadding = 10;
    const rowHeight = 20;

    const columns = [
      { header: 'Nome', width: 150, align: 'left', dataKey: 'nome' },
      { header: 'Vencimento', width: 85, align: 'center', dataKey: 'vencimento' },
      { header: 'Valor', width: 75, align: 'right', dataKey: 'valorMensalidade' },
      { header: 'Status', width: 70, align: 'center', dataKey: 'status' },
      { header: 'Parcela', width: 55, align: 'center', dataKey: 'numeroParcela' },
    ];

    const columnXPositions = [];
    let currentColumnX = pageMargin;
    columns.forEach(col => {
        columnXPositions.push(currentColumnX);
        currentColumnX += col.width + columnPadding;
    });

    const logoPath = path.join(__dirname, '../assets/newLogo.jpg');
    const headerStartY = 50;
    const logoX = pageMargin;
    const logoWidth = 80;
    const logoHeight = 40;
    const textPadding = 15;

    let currentYForHeader = headerStartY;

    try {
      doc.image(logoPath, logoX, headerStartY, { width: logoWidth, height: logoHeight });
    } catch (imageError) {
      console.warn(`[PDF Warning] Could not load logo image from ${logoPath}:`, imageError.message);
    }

    const centerY = headerStartY + (logoHeight / 2);

    const titleText = 'Relatório de Lançamentos';
    doc.fontSize(18).font('Helvetica-Bold');
    const titleWidth = doc.widthOfString(titleText);
    const titleHeight = doc.heightOfString(titleText);
    const titleX = logoX + logoWidth + textPadding;
    const titleY = centerY - (titleHeight / 2);

    doc.text(titleText, titleX, titleY);

    const dateText = `Data de Geração: ${new Date().toLocaleDateString('pt-BR')}`;
    doc.fontSize(10).font('Helvetica');
    const dateWidth = doc.widthOfString(dateText);
    const dateHeight = doc.heightOfString(dateText);
    const dateX = doc.page.width - pageMargin - dateWidth;
    const dateY = centerY - (dateHeight / 2);

    doc.text(dateText, dateX, dateY);

    currentYForHeader = Math.max(headerStartY + logoHeight, titleY + titleHeight, dateY + dateHeight) + 20;
    doc.y = currentYForHeader;

    doc.fontSize(10).font('Helvetica-Bold');
    const tableHeadersLineY = doc.y;
    columns.forEach((col, index) => {
      doc.text(col.header, columnXPositions[index], tableHeadersLineY, { width: col.width, align: col.align });
    });

    doc.strokeColor('#aaaaaa')
       .lineWidth(1)
       .moveTo(pageMargin, doc.y + rowHeight - 5)
       .lineTo(doc.page.width - pageMargin, doc.y + rowHeight - 5)
       .stroke();
    doc.moveDown(0.5);
    let currentY = doc.y;
    doc.fontSize(9).font('Helvetica');

    lancamentos.forEach(lancamento => {
      if (currentY + rowHeight > doc.page.height - pageMargin) {
        doc.addPage();
        currentY = headerStartY;

        try {
          doc.image(logoPath, logoX, headerStartY, { width: logoWidth, height: logoHeight });
        } catch (imageError) {
          console.warn(`[PDF Warning] Could not load logo image on new page from ${logoPath}:`, imageError.message);
        }

        const newPageCenterY = headerStartY + (logoHeight / 2);
        doc.fontSize(18).font('Helvetica-Bold');
        doc.text(titleText, titleX, newPageCenterY - (titleHeight / 2));

        doc.fontSize(10).font('Helvetica');
        doc.text(dateText, dateX, newPageCenterY - (dateHeight / 2));

        currentY = Math.max(headerStartY + logoHeight, newPageCenterY - (titleHeight / 2) + titleHeight, newPageCenterY - (dateHeight / 2) + dateHeight) + 20;
        doc.y = currentY;

        doc.fontSize(10).font('Helvetica-Bold');
        const newPageTableHeadersLineY = doc.y;
        columns.forEach((col, index) => {
          doc.text(col.header, columnXPositions[index], newPageTableHeadersLineY, { width: col.width, align: col.align });
        });
        doc.strokeColor('#aaaaaa')
           .lineWidth(1)
           .moveTo(pageMargin, doc.y + rowHeight - 5)
           .lineTo(doc.page.width - pageMargin, doc.y + rowHeight - 5)
           .stroke();
        doc.moveDown(0.5);
        currentY = doc.y;
        doc.fontSize(9).font('Helvetica');
      }

      columns.forEach((col, index) => {
          let textContent;
          switch (col.dataKey) {
              case 'vencimento':
                  textContent = lancamento[col.dataKey].toLocaleDateString('pt-BR');
                  break;
              case 'valorMensalidade':
                  textContent = `R$ ${lancamento[col.dataKey].toFixed(2)}`;
                  break;
              case 'status':
                  textContent = lancamento[col.dataKey].toUpperCase();
                  break;
              case 'numeroParcela':
                  textContent = lancamento[col.dataKey] !== undefined ? lancamento[col.dataKey].toString() : '';
                  break;
              default:
                  textContent = lancamento[col.dataKey];
                  break;
          }
          doc.text(textContent, columnXPositions[index], currentY, { width: col.width, align: col.align });
      });

      doc.moveDown(0.8);
      currentY = doc.y;
    });

    doc.end();
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    res.status(500).json({ message: 'Erro interno do servidor ao gerar o PDF.', error: error.message });
  }

});

module.exports = router;