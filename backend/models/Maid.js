const mongoose = require('mongoose');

const MaidSchema = new mongoose.Schema({ 
     name: String, 
     service: String, 
     salary: { type: String, default: '' },
     image: String,
     location: String,
     serviceCategory: String,
     maidType: { type: String, enum: ['part-time', 'full-time'], default: 'part-time' },
     availableFrom: { type: String, default: '' },
     availableTo:   { type: String, default: '' },
     submittedBy: { type: String, default: '' },
     verificationStatus: { type: String, enum: ['Active', 'Pending', 'Rejected'], default: 'Active' },
     rejectionReason: { type: String, default: '' },
     submittedAt: { type: Date, default: null },
     cnicFront: { type: String, default: '' },
     cnicBack:  { type: String, default: '' },
     age: { type: String, default: '' },
     experience: { type: String, default: '' }
});

module.exports = mongoose.model('Maid', MaidSchema, 'Maids');