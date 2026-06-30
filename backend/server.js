require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const cron = require('node-cron');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

// ========== MODELS ==========
const User = require('./models/User');
const Maid = require('./models/Maid');
const Booking = require('./models/Booking');
const Review = require('./models/Review');
const Notification = require('./models/Notification');

const app = express();
const PORT = process.env.PORT || 5000;



// ========== MIDDLEWARE ==========
app.use(cors({
    origin: ['https://maideasy-fyp.netlify.app', 'https://maid-easy-project.vercel.app', 'http://localhost:5500', 'http://127.0.0.1:5500'],
    credentials: true
}));
app.use(bodyParser.json({ limit: '50mb' })); 
app.use(express.static(path.join(__dirname, 'frontend')));

// ========== MULTER SETUP ==========
const uploadDir = path.join(__dirname, 'frontend', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + Date.now() + ext);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only image files are allowed!'));
    }
});

app.use('/uploads', express.static(uploadDir));

// ========== DATABASE ==========
mongoose.connect(process.env.MONGO_URI)
     .then(() => console.log("✅ Atlas MongoDB Connected!"))
     .catch((err) => console.log("❌ Connection Error:", err));

// ========== HELPER FUNCTION ==========
async function saveNotification(userEmail, message, type) {
    try {
        await new Notification({ userEmail, message, type }).save();
    } catch (err) {
        console.log('Notification save error:', err);
    }
}

// ========== AUTH ROUTES ==========
app.post('/register', async (req, res) => {
     try {
         const { firstName, lastName, email, password, mobile, securityQuestion, securityAnswer } = req.body;
         if (!email.includes('@')) {
             return res.status(400).json({ message: "Please enter a valid email address (must include @)." });
         }
         if (mobile && mobile.length > 11) {
             return res.status(400).json({ message: "Mobile number must not exceed 11 digits." });
         }
         const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
         if (!strongPasswordRegex.test(password)) {
             return res.status(400).json({ message: "Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character." });
         }
         const existingUser = await User.findOne({ email: email });
         if (existingUser) {
             return res.status(400).json({ 
                 message: "An account with this email already exists. Please login instead." 
             });
         }
         const hashedPassword = await bcrypt.hash(password, 10);
         await new User({ 
             firstName, lastName, email, password: hashedPassword,
             phone: mobile || '',
             securityQuestion: securityQuestion || '',
             securityAnswer: securityAnswer ? securityAnswer.toLowerCase().trim() : ''
         }).save();
         res.status(200).json({ message: "Account created successfully!" });
     } catch (err) { res.status(500).json({ error: "Failed" }); }
});

app.post('/login', async (req, res) => {
     try {
         const { email, password } = req.body;
         const user = await User.findOne({ email });
         if (!user) return res.status(401).json({ message: "Invalid credentials" });
         const isMatch = await bcrypt.compare(password, user.password);
         if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });
         res.status(200).json({ message: "Login successful!", role: user.role });
     } catch (err) { res.status(500).json({ error: "Login failed" }); }
});

app.post('/update-profile', async (req, res) => {
    try {
        const { email, firstName, lastName, phone, profilePic, oldPhone, passwordChanged } = req.body;
        if (phone && !/^\d{11}$/.test(phone)) {
            return res.status(400).json({ message: "Mobile number must be exactly 11 digits." });
        }
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
    const user = await User.findOne({ email: req.query.email }).select('-password -securityAnswer');
    res.status(200).json(user);
});

app.post('/get-security-question', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "No account found with this email." });
        if (!user.securityQuestion) return res.status(400).json({ message: "No security question set for this account." });
        res.status(200).json({ securityQuestion: user.securityQuestion });
    } catch (err) { res.status(500).json({ error: "Failed" }); }
});

app.post('/reset-password', async (req, res) => {
    try {
        const { email, securityAnswer, newPassword } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "No account found with this email." });
        if (user.securityAnswer !== securityAnswer.toLowerCase().trim()) return res.status(400).json({ message: "❌ Security answer is incorrect." });
        const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
        if (!strongPasswordRegex.test(newPassword)) return res.status(400).json({ message: "New password must be at least 8 characters and include uppercase, lowercase, a number, and a special character." });
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await User.findOneAndUpdate({ email }, { password: hashedPassword });
        await saveNotification(email, '🔑 Your password was reset successfully.', 'password_changed');
        res.status(200).json({ message: "Password reset successfully!" });
    } catch (err) { res.status(500).json({ error: "Reset failed" }); }
});

app.post('/change-password', async (req, res) => {
    try {
        const { email, currentPassword, newPassword } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found." });
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ message: "❌ Current password is incorrect." });
        const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
        if (!strongPasswordRegex.test(newPassword)) return res.status(400).json({ message: "New password must be at least 8 characters and include uppercase, lowercase, a number, and a special character." });
        const hashedNew = await bcrypt.hash(newPassword, 10);
        await User.findOneAndUpdate({ email }, { password: hashedNew });
        await saveNotification(email, '🔑 Your password was changed successfully.', 'password_changed');
        res.status(200).json({ message: "Password changed successfully!" });
    } catch (err) { res.status(500).json({ error: "Change password failed" }); }
});

// ========== MAID ROUTES ==========
app.get('/locations', async (req, res) => {
    const locations = await Maid.distinct('location');
    res.status(200).json(locations);
});

app.get('/categories', async (req, res) => {
    const categories = await Maid.distinct('serviceCategory');
    res.status(200).json(categories);
});

app.get('/maids', async (req, res) => {
     const maids = await Maid.find({ verificationStatus: 'Active' });
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
         const bookings = await Booking.find({
             maidName: maid.name,
             status: 'Pending'
         }).select('_id userEmail status');

         return { 
             ...maid.toObject(), 
             avgRating, 
             reviewCount: reviews.length,
             reviews: reviews,
             activeBooking: activeBooking ? {
                 startDate: activeBooking.startDate,
                 endDate: activeBooking.endDate
             } : null,
             bookings: bookings
         };
     }));
     res.status(200).json(maidsWithReviews);
});

app.get('/filter-maids', async (req, res) => {
     try {
         const { location, category } = req.query;
         let query = { verificationStatus: 'Active' };
         if (location) query.location = location;
         if (category) query.serviceCategory = category;
         const maids = await Maid.find(query);
         res.status(200).json(maids);
     } catch (err) { res.status(500).json({ error: "Filter failed" }); }
});

app.post('/add-review', async (req, res) => {
    try {
        const { maidId, userEmail, rating, comment } = req.body;
        const maid = await Maid.findById(maidId);
        if (!maid) return res.status(404).json({ message: "Maid not found." });
        const validBooking = await Booking.findOne({
            userEmail: userEmail,
            maidName: maid.name,
            status: { $in: ['Approved', 'Completed'] }
        });
        if (!validBooking) {
            return res.status(403).json({ 
                message: "⚠️ You can only review a maid you have an approved or completed booking with." 
            });
        }
        await new Review({ maidId, userEmail, rating, comment }).save();
        res.status(200).json({ message: "Review added successfully!" });
    } catch (err) { res.status(500).json({ error: "Failed to add review" }); }
});

// ========== BOOKING ROUTES ==========
app.post('/book', async (req, res) => {
     try {
         const { maidName, maidId, date, time, duration, userEmail, durationType, startDate, endDate, maidType } = req.body;

         const start = new Date(startDate);
         const end   = new Date(endDate);
         const fromDate = start.toLocaleDateString();
         const toDate   = end.toLocaleDateString();

         if (maidType === 'full-time') {
             const conflict = await Booking.findOne({
                 maidName,
                 status: { $in: ['Pending', 'Approved'] },
                 startDate: { $lt: end },
                 endDate:   { $gt: start }
             });
             if (conflict) {
                 const cFrom = new Date(conflict.startDate).toLocaleDateString();
                 const cTo   = new Date(conflict.endDate).toLocaleDateString();
                 return res.status(400).json({ 
                     message: `⚠️ This maid is already booked from ${cFrom} to ${cTo}. Please choose different dates.`
                 });
             }
             await new Booking({ 
                 maidName, date,
                 time: 'Full Time', 
                 duration: 'Full Time', 
                 userEmail,
                 startDate: start,
                 endDate:   end,
                 durationType: durationType || 'custom',
                 maidType: 'full-time',
                 paymentStatus: 'Unpaid'
             }).save();
             await saveNotification(
                 userEmail,
                 `🏠 You have booked "${maidName}" (Full Time) from ${fromDate} to ${toDate}. Awaiting admin approval.`,
                 'booking_approved'
             );
             return res.status(200).json({ message: "Full-Time Booking Request Sent! ✅ Awaiting admin approval." });
         }

         if (!time || !duration) {
             return res.status(400).json({ message: "Time and duration are required for part-time booking." });
         }
         const durationNum = parseInt(duration);
         if (isNaN(durationNum) || durationNum < 1 || durationNum > 12) {
             return res.status(400).json({ message: "Duration must be between 1 and 12 hours." });
         }
         const toMins = (t) => {
             const [h, m] = t.split(':').map(Number);
             return h * 60 + m;
         };
         const newStartMins = toMins(time);
         const newEndMins   = newStartMins + durationNum * 60;
         const maid = await Maid.findById(maidId);
         if (!maid) return res.status(404).json({ message: "Maid not found." });
         if (maid.availableFrom && maid.availableTo) {
             const maidFromMins = toMins(maid.availableFrom);
             const maidToMins   = toMins(maid.availableTo);
             if (newStartMins < maidFromMins || newEndMins > maidToMins) {
                 const fmt = (t) => {
                     const [h, m] = t.split(':').map(Number);
                     const ampm = h >= 12 ? 'PM' : 'AM';
                     const hr   = h % 12 || 12;
                     return `${hr}:${String(m).padStart(2,'0')} ${ampm}`;
                 };
                 return res.status(400).json({ 
                     message: `⚠️ This maid is only available from ${fmt(maid.availableFrom)} to ${fmt(maid.availableTo)}.`
                 });
             }
         }
         const overlappingByDate = await Booking.find({
             maidName,
             status:    { $in: ['Pending', 'Approved'] },
             maidType:  'part-time',
             startDate: { $lt: end   },
             endDate:   { $gt: start }
         });
         for (const b of overlappingByDate) {
             if (!b.time || b.time === 'Full Time') continue;
             const bStartMins = toMins(b.time);
             const bDurNum    = parseInt(b.duration);
             const bEndMins   = bStartMins + (isNaN(bDurNum) ? 0 : bDurNum) * 60;
             if (newStartMins < bEndMins && newEndMins > bStartMins) {
                 return res.status(400).json({ 
                     message: `⚠️ Conflict! This maid is already booked from ${b.time} (${b.duration}/day) during your selected dates.`
                 });
             }
         }
         const durationString = durationNum === 1 ? "1 Hour" : `${durationNum} Hours`;
         await new Booking({ 
             maidName, date, time, 
             duration: durationString, 
             userEmail,
             startDate: start,
             endDate:   end,
             durationType: durationType || 'custom',
             maidType: 'part-time',
             paymentStatus: 'Unpaid'
         }).save();
         await saveNotification(
             userEmail,
             `📅 You have booked "${maidName}" from ${fromDate} to ${toDate} at ${time} (${durationString}/day). Awaiting admin approval.`,
             'booking_approved'
         );
         res.status(200).json({ message: "Booking Request Sent! ✅ Awaiting admin approval." });
     } catch (err) { 
         console.error('Booking error:', err);
         res.status(500).json({ error: "Booking Failed" }); 
     }
});

app.post('/pay-booking', async (req, res) => {
    try {
        const { bookingId, userEmail } = req.body;
        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ message: "Booking not found." });
        if (booking.status !== 'Approved') return res.status(400).json({ message: "Payment only allowed for Approved bookings." });
        if (booking.paymentStatus === 'Paid') return res.status(400).json({ message: "This booking is already paid." });
        const txnId = 'TXN-' + Date.now().toString().slice(-8);
        await Booking.findByIdAndUpdate(bookingId, { 
            paymentStatus: 'Paid',
            transactionId: txnId
        });
        await saveNotification(
            userEmail,
            `💳 Payment of Rs. 500 confirmed for maid "${booking.maidName}". Transaction ID: ${txnId}`,
            'booking_approved'
        );
        res.status(200).json({ message: "Payment successful!", transactionId: txnId });
    } catch (err) { res.status(500).json({ error: "Payment failed" }); }
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
         const { id, status, joiningDate } = req.body;
         const booking = await Booking.findById(id);

         const updateData = { status };
         if (joiningDate) updateData.joiningDate = new Date(joiningDate);

         await Booking.findByIdAndUpdate(id, updateData);

         if (booking) {
             if (status === 'Approved' && joiningDate) {
                 // Frontend se notification aa rahi hai joining date ke sath - backend notification skip
             } else if (status === 'Approved') {
                 await saveNotification(
                     booking.userEmail,
                     `✅ Your booking for maid "${booking.maidName}" has been Approved! Please complete your payment from My Bookings.`,
                     'booking_approved'
                 );
             } else if (status === 'Rejected') {
                 // Frontend se reason wali notification aa rahi hai - backend notification skip
             }
         }

         res.status(200).json({ message: `Booking ${status}!` });
     } catch (err) { res.status(500).json({ error: "Update failed" }); }
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
    } catch (err) { res.status(500).json({ error: "Cancel failed" }); }
});

app.post('/user/cancel-booking', async (req, res) => {
    try {
        const { id, userEmail } = req.body;
        const booking = await Booking.findById(id);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        if (booking.userEmail !== userEmail) return res.status(403).json({ message: 'Unauthorized' });
        if (booking.status !== 'Pending') return res.status(400).json({ message: 'Only pending bookings can be cancelled' });
        await Booking.findByIdAndUpdate(id, { status: 'Cancelled' });
        res.status(200).json({ success: true });
    } catch (err) { res.status(500).json({ error: "Cancel failed" }); }
});

// ========== ADMIN MAID ROUTES ==========
app.post('/admin/add-maid', async (req, res) => {
     try {
         const { name, service, salary, age, experience, location, serviceCategory, image, maidType, availableFrom, availableTo } = req.body;
         await new Maid({ 
             name, service, salary, age, experience, location, serviceCategory, image, 
             maidType: maidType || 'part-time',
             availableFrom: maidType === 'part-time' ? (availableFrom || '') : '',
             availableTo:   maidType === 'part-time' ? (availableTo   || '') : '',
             verificationStatus: 'Active'
         }).save();
         res.status(200).json({ message: "Maid added successfully!" });
     } catch (err) { res.status(500).json({ error: "Failed to add maid" }); }
});

app.post('/admin/update-maid', async (req, res) => {
    try {
        const { id, name, service, salary, age, experience, location, serviceCategory, image, maidType, availableFrom, availableTo } = req.body;
        await Maid.findByIdAndUpdate(id, { 
            name, service, salary, age, experience, location, serviceCategory, image, 
            maidType: maidType || 'part-time',
            availableFrom: maidType === 'part-time' ? (availableFrom || '') : '',
            availableTo:   maidType === 'part-time' ? (availableTo   || '') : ''
        });
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

// ========== AGENT ROUTES ==========
app.post('/agent/upload-cnic', upload.fields([
    { name: 'cnicFront', maxCount: 1 },
    { name: 'cnicBack',  maxCount: 1 }
]), (req, res) => {
    try {
        const result = {};
        if (req.files['cnicFront']) result.cnicFront = '/uploads/' + req.files['cnicFront'][0].filename;
        if (req.files['cnicBack'])  result.cnicBack  = '/uploads/' + req.files['cnicBack'][0].filename;
        res.status(200).json(result);
    } catch (err) { res.status(500).json({ error: "Upload failed" }); }
});

app.post('/agent/submit-maid', async (req, res) => {
    try {
        const { name, service, salary, age, experience, location, serviceCategory, image, maidType, agentEmail, cnicFront, cnicBack } = req.body;
        if (!name || !location || !serviceCategory) {
            return res.status(400).json({ message: "Name, Location and Category are required." });
        }
        await new Maid({
            name, service, salary, age, experience, location, serviceCategory, image,
            maidType: maidType || 'part-time',
            submittedBy: agentEmail,
            verificationStatus: 'Pending',
            submittedAt: new Date(),
            cnicFront: cnicFront || '',
            cnicBack:  cnicBack  || ''
        }).save();
        const admins = await User.find({ role: 'admin' });
        for (const admin of admins) {
            await saveNotification(
                admin.email,
                `👤 Agent "${agentEmail}" submitted a new maid "${name}" for verification.`,
                'profile_updated'
            );
        }
        res.status(200).json({ message: "Maid submitted successfully! Awaiting admin verification." });
    } catch (err) { res.status(500).json({ error: "Submission failed" }); }
});

app.get('/agent/my-maids', async (req, res) => {
    try {
        const { email } = req.query;
        const maids = await Maid.find({ submittedBy: email });
        res.status(200).json(maids);
    } catch (err) { res.status(500).json({ error: "Failed to fetch maids" }); }
});

app.get('/admin/pending-maids', async (req, res) => {
    try {
        const maids = await Maid.find({ verificationStatus: 'Pending' });
        res.status(200).json(maids);
    } catch (err) { res.status(500).json({ error: "Failed to fetch pending maids" }); }
});

app.post('/admin/verify-maid', async (req, res) => {
    try {
        const { id, status, reason } = req.body;
        const updateData = { verificationStatus: status };
        if (status === 'Rejected') updateData.rejectionReason = reason || 'Not verified';
        await Maid.findByIdAndUpdate(id, updateData);
        const maid = await Maid.findById(id);
        if (maid && maid.submittedBy) {
            const msg = status === 'Active'
                ? `✅ Your submitted maid "${maid.name}" has been Approved and is now live!`
                : `❌ Your submitted maid "${maid.name}" was Rejected. Reason: ${reason || 'Not verified'}`;
            await saveNotification(maid.submittedBy, msg, 'profile_updated');
        }
        res.status(200).json({ message: `Maid ${status === 'Active' ? 'approved' : 'rejected'} successfully!` });
    } catch (err) { res.status(500).json({ error: "Verification failed" }); }
});

// ========== NOTIFICATION ROUTES ==========
app.post('/notifications/add', async (req, res) => {
    try {
        const { email, type, message } = req.body;
        await saveNotification(email, message, type);
        res.status(200).json({ success: true });
    } catch (err) { res.status(500).json({ error: "Failed" }); }
});

app.get('/notifications', async (req, res) => {
    try {
        const { email } = req.query;
        const notifications = await Notification.find({ userEmail: email })
            .sort({ createdAt: -1 })
            .limit(20);
        const unreadCount = await Notification.countDocuments({ userEmail: email, isRead: false });
        res.status(200).json({ notifications, unreadCount });
    } catch (err) { res.status(500).json({ error: "Failed to fetch notifications" }); }
});

app.post('/notifications/read', async (req, res) => {
    try {
        const { email } = req.body;
        await Notification.updateMany({ userEmail: email, isRead: false }, { isRead: true });
        res.status(200).json({ message: "Notifications marked as read" });
    } catch (err) { res.status(500).json({ error: "Failed" }); }
});

app.delete('/notifications/clear', async (req, res) => {
    try {
        const { email } = req.query;
        await Notification.deleteMany({ userEmail: email });
        res.status(200).json({ message: "Notifications cleared" });
    } catch (err) { res.status(500).json({ error: "Failed" }); }
});

// ========== CRON JOB ==========
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
    } catch (err) { console.log('❌ Cron job error:', err); }
});

// ========== SERVER ==========
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));