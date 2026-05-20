const CourseModel = require('../Models/coursesModel.js')
const User = require('../Models/userModel.js')


//COURSE CREATOR
exports.createCourse = async (req, res) => {
    try {
    const { title, published, lengthInMinutes } = req.body
    

    const currentUser = await User.findById(req.user.id)

    if (!currentUser) {
        return res.status(404).json({message: "User not found"})
    }  

    const newCourse = await CourseModel.create({
        title, 
        author: currentUser._id,
        published, 
        lengthInMinutes
    })

    currentUser.coursesCreated.push(newCourse._id)
    await currentUser.save()

    res.status(200).json({newCourse})
    } catch (error) {
        res.status(500).json({error:error.message})
    }
}

//Published Courses
exports.myPublishedCourses = async (req, res) => {
    console.log(req.user.id)
    const myCourses = await CourseModel.find({author: req.user.id, published: true})
    res.status(200).json({message: myCourses})
}
//unpublished Courses
exports.myUnPublishedCourses = async (req, res) => {
    console.log(req.user.id)
    const myCourses = await CourseModel.find({author: req.user.id, published: false})
    res.status(200).json({message: myCourses})
}
//all my courses
exports.allMyCourses = async (req, res) => {
    console.log(req.user.id)
    const myCourses = await CourseModel.findById(req.user.id)
    res.status(200).json({message: myCourses})
}



//ADMIN
exports.getAllcourses = async (req, res) => {
    const getAll = await CourseModel.find({published: true})
    res.status(200).json({message: getAll})
}
