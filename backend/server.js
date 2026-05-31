const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); 
app.use(express.static(path.join(__dirname, 'frontend')));

mongoose.connect('mongodb://127.0.0.1:27017/maid_easy')
     .then(() => console.log("✅ Local MongoDB Connected!"))
     .catch((err) => console.log("❌ Connection Error:", err));

// --- SCHEMAS ---
const UserSchema = new mongoose.Schema({ 
     firstName: String, 
     lastName: String, 
     email: String, 
     password: String,
     phone: String,       
     address: String,    
     profilePic: String,
     role: { type: String, default: 'user' } 
});
const User = mongoose.model('User', UserSchema);

const MaidSchema = new mongoose.Schema({ 
     name: String, 
     service: String, 
     price: String, 
     image: String,
     location: String,
     serviceCategory: String,
     maidType: { type: String, enum: ['part-time', 'full-time'], default: 'part-time' }
});
const Maid = mongoose.model('Maid', MaidSchema, 'Maids');

const BookingSchema = new mongoose.Schema({ 
     maidName: String, 
     date: String, 
     time: String, 
     duration: String, 
     userEmail: String, 
     status: { type: String, default: 'Pending' },
     startDate: { type: Date },
     endDate: { type: Date },
     durationType: { type: String, enum: ['15days', '1month', '2months', 'custom'], default: 'custom' },
     cancelReason: { type: String },
     maidType: { type: String, default: 'part-time' }
}, { collection: 'bookings' }); 
const Booking = mongoose.model('Booking', BookingSchema);

const ReviewSchema = new mongoose.Schema({ 
     maidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Maid', required: true },
     userEmail: String,
     rating: Number,
     comment: String,
     createdAt: { type: Date, default: Date.now }
});
const Review = mongoose.model('Review', ReviewSchema);

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
const Notification = mongoose.model('Notification', NotificationSchema);

async function saveNotification(userEmail, message, type) {
    try {
        await new Notification({ userEmail, message, type }).save();
    } catch (err) {
        console.log('Notification save error:', err);
    }
}

// --- ROUTES ---
app.post('/register', async (req, res) => {
     try {
         const { firstName, lastName, email, password, mobile } = req.body;
         if (!email.includes('@')) {
             return res.status(400).json({ message: "Please enter a valid email address (must include @)." });
         }
         if (mobile && mobile.length > 11) {
             return res.status(400).json({ message: "Mobile number must not exceed 11 digits." });
         }
         if (password.length < 8) {
             return res.status(400).json({ message: "Password must be at least 8 characters long." });
         }
         const existingUser = await User.findOne({ email: email });
         if (existingUser) {
             return res.status(400).json({ 
                 message: "An account with this email already exists. Please login instead." 
             });
         }
         await new User({ firstName, lastName, email, password }).save();
         res.status(200).json({ message: "Account created successfully!" });
     } catch (err) { res.status(500).json({ error: "Failed" }); }
});

app.post('/login', async (req, res) => {
     const { email, password } = req.body;
     const user = await User.findOne({ email, password });
     if (user) {
         res.status(200).json({ message: "Login successful!", role: user.role });
     } else {
         res.status(401).json({ message: "Invalid credentials" });
     }
});

app.post('/update-profile', async (req, res) => {
    try {
        const { email, firstName, lastName, phone, profilePic, oldPhone, passwordChanged } = req.body;
        let updateData = { firstName, lastName, phone };
        if (profilePic) updateData.profilePic = profilePic;
        await User.findOneAndUpdate({ email: email }, updateData);

        if (passwordChanged) {
            await saveNotification(email, '🔑 Your password was changed successfully.', 'password_changed');
        }
        if (phone && phone !== oldPhone) {
            await saveNotification(email, `📱 Your phone number was updated to ${phone}.`, 'phone_updated');
        }
        if (profilePic) {
            await saveNotification(email, '🖼️ Your profile picture was updated.', 'photo_updated');
        }
        if (firstName || lastName) {
            await saveNotification(email, `✏️ Your profile name was updated to ${firstName} ${lastName}.`, 'profile_updated');
        }

        res.status(200).json({ message: "Profile updated successfully!" });
    } catch (err) { 
        res.status(500).json({ error: "Update failed" }); 
    }
});

app.get('/get-profile', async (req, res) => {
    const user = await User.findOne({ email: req.query.email });
    res.status(200).json(user);
});

app.get('/locations', async (req, res) => {
    const locations = await Maid.distinct('location');
    res.status(200).json(locations);
});

app.get('/categories', async (req, res) => {
    const categories = await Maid.distinct('serviceCategory');
    res.status(200).json(categories);
});

app.get('/maids', async (req, res) => {
     const maids = await Maid.find();
     const maidsWithReviews = await Promise.all(maids.map(async (maid) => {
         const reviews = await Review.find({ maidId: maid._id });
         const avgRating = reviews.length > 0 
             ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) 
             : 0;

         let activeBooking = null;
         if (maid.maidType === 'full-time') {
             activeBooking = await Booking.findOne({
                 maidName: maid.name,
                 status: { $in: ['Pending', 'Approved'] },
                 endDate: { $gte: new Date() }
             });
         }

         return { 
             ...maid.toObject(), 
             avgRating, 
             reviewCount: reviews.length,
             reviews: reviews,
             activeBooking: activeBooking ? {
                 startDate: activeBooking.startDate,
                 endDate: activeBooking.endDate
             } : null
         };
     }));
     res.status(200).json(maidsWithReviews);
});

app.get('/filter-maids', async (req, res) => {
     try {
         const { location, category } = req.query;
         let query = {};
         if (location) query.location = location;
         if (category) query.serviceCategory = category;
         const maids = await Maid.find(query);
         res.status(200).json(maids);
     } catch (err) {
         res.status(500).json({ error: "Filter failed" });
     }
});

app.post('/add-review', async (req, res) => {
    try {
        const { maidId, userEmail, rating, comment } = req.body;
        await new Review({ maidId, userEmail, rating, comment }).save();
        res.status(200).json({ message: "Review added successfully!" });
    } catch (err) { res.status(500).json({ error: "Failed to add review" }); }
});

// --- UPDATED: /book route with booking notifications ---
app.post('/book', async (req, res) => {
     try {
         const { maidName, maidId, date, time, duration, userEmail, durationType, startDate, endDate, maidType } = req.body;

         // Date format for notification
         const fromDate = new Date(startDate).toLocaleDateString();
         const toDate   = new Date(endDate).toLocaleDateString();

         if (maidType === 'full-time') {
             const conflict = await Booking.findOne({
                 maidName,
                 status: { $in: ['Pending', 'Approved'] },
                 startDate: { $lte: new Date(endDate) },
                 endDate:   { $gte: new Date(startDate) }
             });

             if (conflict) {
                 return res.status(400).json({ 
                     message: "⚠️ This maid is already booked for this period!" 
                 });
             }

             await new Booking({ 
                 maidName, date,
                 time: 'Full Time', 
                 duration: 'Full Time', 
                 userEmail,
                 startDate: new Date(startDate),
                 endDate:   new Date(endDate),
                 durationType: durationType || 'custom',
                 maidType: 'full-time'
             }).save();

             // NEW: Full-time booking notification
             await saveNotification(
                 userEmail,
                 `🏠 You have booked "${maidName}" (Full Time) from ${fromDate} to ${toDate}.`,
                 'booking_approved'
             );

             return res.status(200).json({ message: "Full-Time Booking Confirmed! ✅" });
         }

         const startHour    = parseInt(time.split(':')[0]);
         const durationHours = parseInt(duration);
         const endHour      = startHour + durationHours;

         const existingBookings = await Booking.find({ 
             maidName,
             status: { $in: ['Pending', 'Approved'] },
             startDate: { $lte: new Date(endDate) },
             endDate:   { $gte: new Date(startDate) }
         });

         let isConflict = false;
         for (let b of existingBookings) {
             if (!b.time || b.time === 'Full Time') continue;
             const bStart    = parseInt(b.time.split(':')[0]);
             const bDuration = parseInt(b.duration);
             const bEnd      = bStart + bDuration;
             if ((startHour < bEnd) && (endHour > bStart)) {
                 isConflict = true;
                 break;
             }
         }
         
         if (isConflict) {
             return res.status(400).json({ 
                 message: "⚠️ This maid is already booked during this time slot for the selected dates!" 
             });
         }

         const durationNum    = parseInt(duration);
         const durationString = durationNum === 1 ? "1 Hour" : `${durationNum} Hours`;

         await new Booking({ 
             maidName, date, time, 
             duration: durationString, 
             userEmail,
             startDate: new Date(startDate),
             endDate:   new Date(endDate),
             durationType: durationType || 'custom',
             maidType: 'part-time'
         }).save();

         // NEW: Part-time booking notification
         await saveNotification(
             userEmail,
             `📅 You have booked "${maidName}" from ${fromDate} to ${toDate} at ${time} (${durationString}/day).`,
             'booking_approved'
         );

         res.status(200).json({ message: "Booking Confirmed! ✅" });
     } catch (err) { 
         res.status(500).json({ error: "Booking Failed" }); 
     }
});

app.get('/bookings', async (req, res) => {
     const bookings = await Booking.find({ userEmail: req.query.email });
     res.status(200).json(bookings);
});

app.get('/all-bookings', async (req, res) => {
     const bookings = await Booking.find();
     res.status(200).json(bookings);
});

app.post('/update-booking', async (req, res) => {
     try {
         const { id, status } = req.body;
         const booking = await Booking.findById(id);
         await Booking.findByIdAndUpdate(id, { status: status });

         if (booking) {
             if (status === 'Approved') {
                 await saveNotification(
                     booking.userEmail,
                     `✅ Your booking for maid "${booking.maidName}" has been Approved!`,
                     'booking_approved'
                 );
             } else if (status === 'Rejected') {
                 await saveNotification(
                     booking.userEmail,
                     `❌ Your booking for maid "${booking.maidName}" has been Rejected.`,
                     'booking_rejected'
                 );
             }
         }

         res.status(200).json({ message: `Booking ${status}!` });
     } catch (err) {
         res.status(500).json({ error: "Update failed" });
     }
});

app.post('/admin/cancel-booking', async (req, res) => {
    try {
        const { id, reason } = req.body;
        const booking = await Booking.findById(id);
        await Booking.findByIdAndUpdate(id, { 
            status: 'Rejected',
            cancelReason: reason || 'Cancelled by admin on maid behalf'
        });

        if (booking) {
            await saveNotification(
                booking.userEmail,
                `🚫 Your booking for maid "${booking.maidName}" was cancelled. Reason: ${reason || 'Maid left the job'}.`,
                'booking_cancelled'
            );
        }

        res.status(200).json({ message: "Booking cancelled successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Cancel failed" });
    }
});

app.post('/admin/add-maid', async (req, res) => {
     try {
         const { name, service, price, location, serviceCategory, image, maidType } = req.body;
         await new Maid({ name, service, price, location, serviceCategory, image, maidType: maidType || 'part-time' }).save();
         res.status(200).json({ message: "Maid added successfully!" });
     } catch (err) { res.status(500).json({ error: "Failed to add maid" }); }
});

app.post('/admin/update-maid', async (req, res) => {
    try {
        const { id, name, service, price, location, serviceCategory, image, maidType } = req.body;
        await Maid.findByIdAndUpdate(id, { name, service, price, location, serviceCategory, image, maidType: maidType || 'part-time' });
        res.status(200).json({ message: "Maid updated successfully!" });
    } catch (err) { res.status(500).json({ error: "Update failed" }); }
});

app.post('/admin/delete-maid', async (req, res) => {
    try {
        const { id } = req.body;
        await Maid.findByIdAndDelete(id);
        res.status(200).json({ message: "Maid deleted successfully!" });
    } catch (err) { res.status(500).json({ error: "Delete failed" }); }
});

app.get('/notifications', async (req, res) => {
    try {
        const { email } = req.query;
        const notifications = await Notification.find({ userEmail: email })
            .sort({ createdAt: -1 })
            .limit(20);
        const unreadCount = await Notification.countDocuments({ userEmail: email, isRead: false });
        res.status(200).json({ notifications, unreadCount });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch notifications" });
    }
});

app.post('/notifications/read', async (req, res) => {
    try {
        const { email } = req.body;
        await Notification.updateMany({ userEmail: email, isRead: false }, { isRead: true });
        res.status(200).json({ message: "Notifications marked as read" });
    } catch (err) {
        res.status(500).json({ error: "Failed" });
    }
});

app.delete('/notifications/clear', async (req, res) => {
    try {
        const { email } = req.query;
        await Notification.deleteMany({ userEmail: email });
        res.status(200).json({ message: "Notifications cleared" });
    } catch (err) {
        res.status(500).json({ error: "Failed" });
    }
});

cron.schedule('0 0 * * *', async () => {
    try {
        const today = new Date();
        await Booking.updateMany(
            { 
                status: { $in: ['Pending', 'Approved'] },
                endDate: { $lt: today }
            },
            { status: 'Completed' }
        );
        console.log('✅ Expired bookings auto-completed');
    } catch (err) {
        console.log('❌ Cron job error:', err);
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));