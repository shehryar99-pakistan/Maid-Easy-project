const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({ 
     firstName: String, 
     lastName: String, 
     email: String, 
     password: String,
     phone: String,       
     address: String,    
     profilePic: String,
     role: { type: String, default: 'user' },
     securityQuestion: { type: String, default: '' },
     securityAnswer:   { type: String, default: '' }
});

module.exports = mongoose.model('User', UserSchema);