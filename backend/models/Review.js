const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({ 
     maidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Maid', required: true },
     userEmail: String,
     rating: Number,
     comment: String,
     createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Review', ReviewSchema);