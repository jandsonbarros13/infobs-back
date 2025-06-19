// meu-primeiro-backend-node/models/clienteModel.js
const mongoose = require('mongoose');

const clienteSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true,
    trim: true
  },
  vencimento: {
    type: Date,
    required: true
  },
  valorMensalidade: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pago', 'pendente', 'vencido'],
    default: 'pendente'
  },
  numeroParcela: { // <--- NOVO CAMPO
    type: Number,
    required: true,
    min: 1
  }
}, {
  timestamps: true
});

const Cliente = mongoose.model('Cliente', clienteSchema, 'lancamentos'); // Nome da coleção
module.exports = Cliente;