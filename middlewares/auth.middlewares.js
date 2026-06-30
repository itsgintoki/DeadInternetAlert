import jwt from "jsonwebtoken";

export const authenticate = (req,res,next) =>{
    const authHeader = req.headers.authorization;

    if(!authHeader || !authHeader.startsWith("Bearer ")){
        return next({status:401,message:'No token provided'})
    }
    const token = authHeader.split(" ")[1];

    try{
        const decoded = jwt.verify(token,process.env.JWT_SECRET);
        req.user = decoded;
        next();
    }catch(err){
        return next({status: 401,message:'Invalid or expired token'});
    }


}

export const authorize = (...roles) => (req,res,next) =>{
    if(!roles.includes(req.user.role)){
        return next({status:403,message:'Forbidden'})
    }
    next();
}