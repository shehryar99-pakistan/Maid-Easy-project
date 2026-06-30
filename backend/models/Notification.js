const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    userEmail: { type: String, required: true },
    message: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['booking_approved', 'booking_rejected', 'booking_cancelled', 'profile_updated', 'password_changed', 'phone_updated', 'photo_updated'],
        required: true 
    },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', NotificationSchema);