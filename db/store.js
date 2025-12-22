const store = new Map()

export function saveUser(userId,data){
    store.set(userId,data)
}

export function getUser(userId){
    return store.get(userId)
}