const mongoose = require('mongoose')


const userSchema = new mongoose.Schema({
    username:{type: String, required: true, unique: true},
    password: {type: String, required: true},
    role: {type: String, enum: ['user', 'admin', 'creator'], required: true, default: 'user'},
    coursesCreated: [{type: mongoose.Schema.Types.ObjectId, ref: 'Courses'}],
    coursesSubscribed: [{type: mongoose.Schema.Types.ObjectId, ref: 'Courses'}]
    // profilePicture: {type: String, default: 'default.jpg'},
    }, 
    {timestamps: true}
)

const User = mongoose.model ('User',  userSchema)

module.exports = User;