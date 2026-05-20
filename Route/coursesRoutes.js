const { createCourse, 
        getAllcourses, 
        myPublishedCourses, 
        myUnPublishedCourses,
        allMyCourses } = require('../Controller/coursesController.js')


const { protect } = require('../Middleware/authneticationMiddleware.js')
const { authorise } = require('../Middleware/authorisationMiddleware.js')
const express = require('express')
const route = express.Router()


//Admin Routes
route.get('/all-courses', protect, authorise('admin', 'user', 'creator'), getAllcourses)

//Creator
route.post('/create-course', protect, authorise('admin', 'creator'), createCourse)
route.get('/my-published-courses', protect, authorise('creator', 'admin'), myPublishedCourses)
route.get('/my-unpublished-courses', protect, authorise('creator', 'admin'), myUnPublishedCourses)
route.get('/my-courses', protect, authorise('creator', 'admin'), allMyCourses)

module.exports = route