import { slackApp } from "./app.js"
import { detectProvider } from "..utils/providerDetector.js"

slackApp.view("email_provider_select", async ({ack,body,client}) =>{
    await ack()
    const email =
        view.state.values.email.value.value
    const provider = await detectProvider(email)
    console.log("Provider", provider)
}
)