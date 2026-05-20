const bcrypt = require('bcrypt')

exports.hashPassword = (password, salt) => {
    return bcrypt.hash(password, salt)
}

exports.verifyPassword = (hashedPassword, userPassword) => {
    return bcrypt.compare(hashedPassword, userPassword)
}