const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());
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
    role: { type: String, default: 'user' } 
});
const User = mongoose.model('User', UserSchema);

// Updated Maid Schema with Location and Category
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

// --- ROUTES ---
app.post('/register', async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;
        await new User({ firstName, lastName, email, password }).save();
        res.status(200).json({ message: "Account created!" });
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

// Get All Maids
app.get('/maids', async (req, res) => {
    const maids = await Maid.find();
    res.status(200).json(maids);
});

// NEW: Filter Maids Route
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

// Advanced Booking Route
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

// Other existing routes...
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

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));