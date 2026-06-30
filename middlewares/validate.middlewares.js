export const validate = (schema) => (req,res,next) =>{
    const result = schema.safeParse(req.body);
    if(!result.success){
        return next({
            status:400,
            message:"Validation failed!",
            errors:result.error.flatten().fieldErrors,

        })
        req.body = result.data;
        next();
    }
}