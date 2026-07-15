import argon2 from "argon2";
import jwt from "jsonwebtoken";
import crypto from 'node:crypto';
import db from "../db/index.js";
import { UsersTable } from "../models/users.models.js";
import { refreshTokensTable } from '../models/tokens.models.js';
import { eq } from "drizzle-orm";
import { env } from '../config/env.js';

const REFRESH_TOKEN_DAYS = 30;

function issueAccessToken(user) {
    return jwt.sign(
        { id: user.id, role: user.role, type: 'access' },
        env.JWT_SECRET,
        { expiresIn: '15m', issuer: env.JWT_ISSUER }
    );
}

async function issueRefreshToken(userId) {
    const secret = crypto.randomBytes(48).toString('base64url');
    const tokenHash = await argon2.hash(secret);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
    const [storedToken] = await db
        .insert(refreshTokensTable)
        .values({ userId, token: tokenHash, expiresAt })
        .returning({ id: refreshTokensTable.id });
    return `${storedToken.id}.${secret}`;
}

async function revokeRefreshToken(token) {
    const separator = token.indexOf('.');
    if (separator === -1) return null;
    const tokenId = token.slice(0, separator);
    const secret = token.slice(separator + 1);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tokenId) || !secret) {
        return null;
    }
    const [storedToken] = await db
        .select()
        .from(refreshTokensTable)
        .where(eq(refreshTokensTable.id, tokenId));

    if (!storedToken || storedToken.expiresAt <= new Date()) return null;
    if (await argon2.verify(storedToken.token, secret)) {
        await db.delete(refreshTokensTable).where(eq(refreshTokensTable.id, storedToken.id));
        return storedToken.userId;
    }
    return null;
}

async function sessionResponse(user) {
    const [accessToken, refreshToken] = await Promise.all([
        issueAccessToken(user),
        issueRefreshToken(user.id),
    ]);
    return { token: accessToken, refreshToken };
}

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

        const tokens = await sessionResponse(newUser);

        res.status(201).json({
            message: "User registered successfully",
            ...tokens,
            user: {
                id: newUser.id,
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                email: newUser.email,
                role: newUser.role,
            },
        });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Email is already registered' });
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

        const tokens = await sessionResponse(user);

        res.json({
            message: "Login successful",
            ...tokens,
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

export async function refresh(req, res, next) {
    try {
        const userId = await revokeRefreshToken(req.body.refreshToken);
        if (!userId) return res.status(401).json({ error: 'Invalid or expired refresh token' });

        const [user] = await db.select().from(UsersTable).where(eq(UsersTable.id, userId)).limit(1);
        if (!user) return res.status(401).json({ error: 'Invalid or expired refresh token' });

        const tokens = await sessionResponse(user);
        res.json({ message: 'Session refreshed', ...tokens });
    } catch (error) {
        next(error);
    }
}

export async function logout(req, res, next) {
    try {
        await revokeRefreshToken(req.body.refreshToken);
        res.status(204).end();
    } catch (error) {
        next(error);
    }
}
