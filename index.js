const express = require('express')
const mongoose = require('mongoose')
const dotenv = require('dotenv')
const userRoute = require('./Route/userRoute.js')
const courseRoute = require('./Route/coursesRoutes.js')
const cookieParser = require('cookie-parser')
const User = require('./Models/userModel.js')
dotenv.config()

const app = express()

app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded())
app.use(express.urlencoded({ extended: true }))


app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.use('/api/v1', userRoute)
app.use('/api/v1', courseRoute)


mongoose.connect(process.env.MONGO_URI).then( async () => {
    console.log('Connected to MongoDB')

        // Sync indexes once at startup
        await User.syncIndexes();
        console.log('Indexes synced');

    app.listen(5000, () => {
        console.log('Server is running on port 5000')
    })
})