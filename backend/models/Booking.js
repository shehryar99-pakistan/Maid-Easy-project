const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({ 
     maidName: String, 
     date: String, 
     time: String, 
     duration: String, 
     userEmail: String, 
     status: { type: String, default: 'Pending' },
     startDate: { type: Date },
     endDate: { type: Date },
     durationType: { type: String, enum: ['15days', '1month', '2months', '3months', '6months', '1year', 'customMonths', 'customDays', 'custom'], default: 'custom' },
     cancelReason: { type: String },
     maidType: { type: String, default: 'part-time' },
     paymentStatus: { type: String, enum: ['Unpaid', 'Paid'], default: 'Unpaid' },
     transactionId: { type: String, default: '' },
     joiningDate: { type: Date, default: null }
}, { collection: 'bookings' }); 

module.exports = mongoose.model('Booking', BookingSchema);