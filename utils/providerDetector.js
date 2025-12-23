export async function detectProvider(email) {
    const domain = email.split("@")[1]
    
    if(domain.includes("gmail") || domain.includes("google"))
        return "gmail"

    if(domain.includes("outlook") || domain.includes("microsoft"))
        return "microsoft"

    return "imap"
    
}