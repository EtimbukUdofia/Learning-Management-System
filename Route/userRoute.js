const express = require('express');
const route = express.Router()
const { createAccount, userLogin, protected, logout, subscribedCourses } = require('../Controller/userController.js')
const { protect } = require('../Middleware/authneticationMiddleware.js')
const { authorise } =require('../Middleware/authorisationMiddleware.js')

//Routes
route.post('/user-registration', createAccount)
route.post('/login', userLogin)
route.post('/protected', 
    protect, authorise('user', 'admin', 'creator'), protected)   //template for protected route
    
route.get('/subscribed-courses', protect, authorise('user', 'admin', 'creator'), subscribedCourses)
route.post('/logout', protect, logout)


module.exports = route