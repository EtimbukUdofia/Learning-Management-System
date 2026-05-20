exports.authorise = (...roles) => {

    return (req, res, next) => {

        //checking if users role is allowed
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({message: "Access denied"})
        };
        next();
    }
}