import redis from "../db/redis.js";
import { createHash } from 'node:crypto';

const DEFAULT_TTS_SECONDS = 60;

function redisKey(key) {
    return `cache:${createHash('sha256').update(key).digest('hex')}`;
}

export async function getCached(key){
    const cacheKey = redisKey(key);
    const value = await redis.get(cacheKey);
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch {
        await redis.del(cacheKey);
        return null;
    }
}

export async function setCached(key,value,ttlSeconds = DEFAULT_TTS_SECONDS){
    await redis.setex(redisKey(key), ttlSeconds, JSON.stringify(value));
}
