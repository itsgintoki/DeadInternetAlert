import jwt from "jsonwebtoken";
import { env } from '../config/env.js';

export const authenticate = (req,res,next) =>{
    let token;
    const authHeader = req.headers.authorization;

    if(authHeader && /^Bearer\s+\S+$/i.test(authHeader)){
        token = authHeader.replace(/^Bearer\s+/i, '');
    }

    if(!token){
        return next({status:401,message:'No token provided'})
    }

    try{
        const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: env.JWT_ISSUER });
        if (decoded.type && decoded.type !== 'access') throw new Error('Invalid token type');
        req.user = decoded;
        next();
    }catch(err){
        return next({status: 401,message:'Invalid or expired token'});
    }
}

export const authorize = (...roles) => (req,res,next) =>{
    if(!req.user || !roles.includes(req.user.role)){
        return next({status:403,message:'Forbidden'})
    }
    next();
}
