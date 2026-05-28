const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 5000;

app.use(cors());
// Image data (Base64) ka size bara hota hai, isliye limit barha di
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
     serviceCategory: String 
});
const Maid = mongoose.model('Maid', MaidSchema, 'Maids');

const BookingSchema = new mongoose.Schema({ 
     maidName: String, 
     date: String, 
     time: String, 
     duration: String, 
     userEmail: String, 
     status: { type: String, default: 'Pending' } 
}, { collection: 'bookings' }); 
const Booking = mongoose.model('Booking', BookingSchema);

// --- ADDED: REVIEW SCHEMA ---
const ReviewSchema = new mongoose.Schema({ 
     maidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Maid', required: true },
     userEmail: String,
     rating: Number,
     comment: String,
     createdAt: { type: Date, default: Date.now }
});
const Review = mongoose.model('Review', ReviewSchema);

// --- ROUTES ---
// --- UPDATED: Register with duplicate email check ---
app.post('/register', async (req, res) => {
     try {
         const { firstName, lastName, email, password } = req.body;

         // Check if email already exists
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

// --- PROFILE ROUTES --- (address removed, only phone kept)
app.post('/update-profile', async (req, res) => {
    try {
        const { email, firstName, lastName, phone, profilePic } = req.body;
        
        let updateData = { firstName, lastName, phone };
        if (profilePic) updateData.profilePic = profilePic;

        await User.findOneAndUpdate(
            { email: email }, 
            updateData
        );
        res.status(200).json({ message: "Profile updated successfully!" });
    } catch (err) { 
        res.status(500).json({ error: "Update failed" }); 
    }
});

app.get('/get-profile', async (req, res) => {
    const user = await User.findOne({ email: req.query.email });
    res.status(200).json(user);
});

// --- DYNAMIC FILTER ROUTES ---
app.get('/locations', async (req, res) => {
    const locations = await Maid.distinct('location');
    res.status(200).json(locations);
});

app.get('/categories', async (req, res) => {
    const categories = await Maid.distinct('serviceCategory');
    res.status(200).json(categories);
});

// --- UPDATED: MAIDS ROUTE WITH RATINGS & REVIEWS ---
app.get('/maids', async (req, res) => {
     const maids = await Maid.find();
     const maidsWithReviews = await Promise.all(maids.map(async (maid) => {
         const reviews = await Review.find({ maidId: maid._id });
         const avgRating = reviews.length > 0 
             ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) 
             : 0;
         return { 
             ...maid.toObject(), 
             avgRating, 
             reviewCount: reviews.length,
             reviews: reviews
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

// --- NEW: REVIEW ROUTES ---
app.post('/add-review', async (req, res) => {
    try {
        const { maidId, userEmail, rating, comment } = req.body;
        await new Review({ maidId, userEmail, rating, comment }).save();
        res.status(200).json({ message: "Review added successfully!" });
    } catch (err) { res.status(500).json({ error: "Failed to add review" }); }
});

app.post('/book', async (req, res) => {
     try {
         const { maidName, date, time, duration, userEmail } = req.body;
         const startHour = parseInt(time.split(':')[0]);
         const durationHours = parseInt(duration);
         const endHour = startHour + durationHours;

         const existingBookings = await Booking.find({ maidName, date });
         let isConflict = false;
         for (let b of existingBookings) {
             const bStart = parseInt(b.time.split(':')[0]);
             const bEnd = bStart + parseInt(b.duration);
             if ((startHour < bEnd) && (endHour > bStart)) {
                 isConflict = true;
                 break;
             }
         }
         
         if (isConflict) {
             return res.status(400).json({ message: "Maid is busy during this time slot!" });
         }

         const durationString = duration + " hour"; 
         await new Booking({ maidName, date, time, duration: durationString, userEmail }).save();
         res.status(200).json({ message: "Booking Confirmed!" });
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
     const { id, status } = req.body;
     await Booking.findByIdAndUpdate(id, { status: status });
     res.status(200).json({ message: `Booking ${status}!` });
});

// --- FIXED: serviceCategory now saves correctly ---
app.post('/admin/add-maid', async (req, res) => {
     try {
         const { name, service, price, location, serviceCategory, image } = req.body;
         await new Maid({ name, service, price, location, serviceCategory, image }).save();
         res.status(200).json({ message: "Maid added successfully!" });
     } catch (err) { res.status(500).json({ error: "Failed to add maid" }); }
});

// --- NEW: ADMIN UPDATE MAID ---
app.post('/admin/update-maid', async (req, res) => {
    try {
        const { id, name, service, price, location, serviceCategory, image } = req.body;
        await Maid.findByIdAndUpdate(id, { name, service, price, location, serviceCategory, image });
        res.status(200).json({ message: "Maid updated successfully!" });
    } catch (err) { res.status(500).json({ error: "Update failed" }); }
});

// --- NEW: ADMIN DELETE MAID ---
app.post('/admin/delete-maid', async (req, res) => {
    try {
        const { id } = req.body;
        await Maid.findByIdAndDelete(id);
        res.status(200).json({ message: "Maid deleted successfully!" });
    } catch (err) { res.status(500).json({ error: "Delete failed" }); }
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));