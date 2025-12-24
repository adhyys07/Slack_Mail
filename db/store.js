// Simple in-memory store. NOTE: Heroku dynos lose this on restart. Use a real DB for persistence.
const store = new Map();

export function saveUser(userId, data) {
    store.set(userId, data);
}

export function getUser(userId) {
    return store.get(userId);
}

export function deleteUser(userId) {
    store.delete(userId);
}