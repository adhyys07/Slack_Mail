import { providerDetectModal } from "./views.js"

export function registerCommands(slackApp) {
    slackApp.command("/connect-email", async ({ack,body,client}) => {
        await ack()
        await client.views.open({
            trigger_id: body.trigger_id,
            view: providerDetectModal()
        })
    })
}   