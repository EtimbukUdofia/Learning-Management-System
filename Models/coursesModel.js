const mongoose = require('mongoose')


const coursesSchema = new mongoose.Schema({
    title: {type: String, required: true},
    author: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    published: {type: Boolean, default: false, required: true},
    description: {type: String},
    lengthInMinutes: {type: Number, required: true},
    }, 
    {timestamps: true}
)

const Courses = mongoose.model ('Courses',  coursesSchema)

module.exports = Courses;