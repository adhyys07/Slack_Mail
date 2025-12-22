import { providerDetectModal } from "./views.js"

export function registerCommands(slackApp) {
    slackApp.command("/connect-email", async ({ack,body,client}) => {
        console.log("CONNECT EMAIL HANDLER HIT")
        await ack()
        console.log("ACK SENT")
        
        await client.views.open({
            trigger_id: body.trigger_id,
            view: providerDetectModal()
        })
    })
}   