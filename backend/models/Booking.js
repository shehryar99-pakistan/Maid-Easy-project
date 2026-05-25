const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Yeh hamare User schema se link karega
        required: true
    },
    maid: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Maid', // Yeh hamare Maid schema se link karega
        required: true
    },
    bookingDate: {
        type: Date,
        required: true // Kis din ke liye maid book ho rahi hai
    },
    duration: {
        type: Number, // Kitne ghanton ke liye (jaise: 2, 4, 6 hours)
        required: true
    },
    totalPrice: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Confirmed', 'Completed', 'Cancelled'],
        default: 'Pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Booking', BookingSchema);