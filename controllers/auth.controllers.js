import argon2 from "argon2";
import jwt from "jsonwebtoken";
import db from "../db/index.js";
import { UsersTable } from "../models/users.models.js";
import { eq } from "drizzle-orm";

export async function register(req, res, next) {
    try {
        const { firstName, lastName, email, password } = req.body;

        const [existingUser] = await db
            .select()
            .from(UsersTable)
            .where(eq(UsersTable.email, email))
            .limit(1);

        if (existingUser) {
            return res.status(409).json({ error: "Email is already registered" });
        }

        const passwordHash = await argon2.hash(password);

        const [newUser] = await db
            .insert(UsersTable)
            .values({
                firstName,
                lastName,
                email,
                passwordHash,
            })
            .returning();

        const token = jwt.sign(
            { id: newUser.id, role: newUser.role },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.status(201).json({
            message: "User registered successfully",
            token,
            user: {
                id: newUser.id,
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                email: newUser.email,
                role: newUser.role,
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function login(req, res, next) {
    try {
        const { email, password } = req.body;

        const [user] = await db
            .select()
            .from(UsersTable)
            .where(eq(UsersTable.email, email))
            .limit(1);

        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const isValidPassword = await argon2.verify(user.passwordHash, password);
        if (!isValidPassword) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.json({
            message: "Login successful",
            token,
            user: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        next(error);
    }
}
