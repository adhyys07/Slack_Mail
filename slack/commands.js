import { slackApp } from "./app.js"
import { providerDetectModal } from "./views.js"

slackApp.command("/connect-email", async ({ack,body,client}) => {
    await ack()
    await client.views.open({
        trigger_id: body.trigger_id,
        view: providerDetectModal()
    })
})