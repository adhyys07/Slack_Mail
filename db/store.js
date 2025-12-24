import Redis from "ioredis"

export const redis = new Redis(process.env.REDIS_URL,{
    tls:{
        rejectUnauthorized:false,
    },
    maxRetriesPerRequest:null,
});

export async function saveUser(key, value) {
    await redis.set(
        key,
        JSON.stringify(value),
        "EX",
        30*24*60*60
    );
}

export async function getUser(key) {
    const data = await redis.get(key)
    return data ? JSON.parse(data): null;
}

export async function deleteUser(key) {
    await redis.del(key);
}