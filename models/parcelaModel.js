// meu-primeiro-backend-node/models/parcelaModel.js
const mongoose = require('mongoose');

const parcelaSchema = new mongoose.Schema({
  alunoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    required: true
  },
  numeroParcela: {
    type: Number,
    required: true,
    min: 1
  },
  dataVencimento: {
    type: Date,
    required: true
  },
  valor: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pendente', 'pago', 'vencido'],
    default: 'pendente'
  }
}, {
  timestamps: true
});

// Força o nome da coleção para 'parcelas' (em minúsculas)
const Parcela = mongoose.model('Parcela', parcelaSchema, 'parcelas'); // <--- MUDANÇA AQUI: 'parcelas'

module.exports = Parcela;