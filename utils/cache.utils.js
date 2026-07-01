import redis from "../db/redis.js";

const DEFAULT_TTS_SECONDS = 60;

export async function getCached(key){
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
}

export async function setCached(key,value,ttlSecons = DEFAULT_TTS_SECONDS){
    await redis.setex(key,ttlSecons,JSON.stringify(value));
}