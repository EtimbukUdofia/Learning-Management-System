const User = require('../Models/userModel')
const Courses = require('../Models/coursesModel.js')
const { hashPassword, verifyPassword } = require('../Services/paswordServices.js')
const jwt = require('jsonwebtoken')

exports.createAccount = async (req, res) => {
    try {
        const { username, password, role } = req.body
        
        //Find user details on server
        const existingUser = User.findOne({username})

        // if (existingUser) {
        //     return res.status(500).json({message: "User already exists"})
        // }
        
        //If body returns empty
        if (req.body === null) {
            return res.status(500).json("Input required")
        }
        
        //Hash Password
        const hashedPAssword = await hashPassword(password, 7)


        //Create new User
        const newUser = await User.create({
                                    username,
                                    password: hashedPAssword,
                                    role
                                })
        
        res.status(200).json({newUser})
    } catch (error) {
        res.status(500).json({error:error.message})        
    }
}

exports.userLogin = async (req, res) => {
    try {
        const { username, password } = req.body

        if (req.body === null) {
            return res.status(500).json("Input required")
        }

        const user = await User.findOne({username})
        //verify password
        
        if (username != user.username) {
            return res.status(500).json({message: "Invalid username or password"})
        } 

        const passwordVerification = await verifyPassword(password, user.password)
        // console.log(passwordVerification)

        if (!passwordVerification) {
            return res.status(500).json({message: "Invalid username or password"})
        }        
        //Generate jwt Toke  
        const token = jwt.sign(
            {
                id: user._id,
                role: user.role
            },
            process.env.JWT_SECRET_KEY,
            {expiresIn: process.env.EXPIRE_TIME}
        )
        // console.log(token)

        //store token in cookies
        res.cookie('token', token, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000
        })
        return res.status(200).json({message: "User logged in"})
    } catch (error) {
        res.status(500).json({error: error.message})
    }
}

exports.protected = async (req, res) => {
    const user = req.user
    console.log("Acessed successfully")
    return res.send("Accessed successfully")
}

exports.logout = async (req, res) => {
    res.clearCookie('token');

    res.status(200).json({message: 'User Logged out'})
}

// exports.createdCourses = async (req, res) => {
//     try{
//         //view courses
//         const userCreatedCourses = await User.findById(req.user.id,).populate('coursesCreated')
//         return res.status(200).json({message: userCreatedCourses})
//     }catch (error){
//         res.status(500).json({error: error.message})
//     }
// }

exports.subscribeToCourse =

exports.subscribedCourses = async (req, res) => {
    try{
        //view courses
        const userSubscribedCourses = await User.findById(req.user.id,).populate('coursesSubscribed')
        return res.status(200).json({message: userSubscribedCourses})
    }catch (error){
        res.status(500).json({error: error.message})
    }
}

exports.subscribeToCourse = async (req, res) => {
    // const { } 

    const availableCourses = await Coueses.find({published: true}).search(['title', 'description']).sort()

    const pagination = availableCourses.fi
}