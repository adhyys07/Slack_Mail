import { detectProvider } from "../utils/providerDetector.js"

export function registerActions(slackApp) {
    slackApp.view("email_provider_select", async ({ack,body,client}) =>{
        await ack()
        const email =
            view.state.values.email.value.value
        const provider = await detectProvider(email)
        console.log("Provider", provider)
    }
    )
}