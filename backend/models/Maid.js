const mongoose = require('mongoose');

const MaidSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    skills: {
        type: [String], // Jaise: ['Cleaning', 'Cooking', 'Laundry']
        required: true
    },
    experience: {
        type: Number, // Years mein, jaise: 2, 5
        required: true
    },
    hourlyRate: {
        type: Number, // PKR mein, jaise: 500, 800
        required: true
    },
    availability: {
        type: Boolean,
        default: true
    },
    rating: {
        type: Number,
        default: 5.0
    }
});

module.exports = mongoose.model('Maid', MaidSchema);