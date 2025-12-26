export const providerDetectModal = () => ({
    type: "modal",
    callback_id: "email_submit",
    title: { type: "plain_text", text: "Connect Email" },
    submit: { type: "plain_text", text: "Continue" },
    blocks: [
        {
            type: "input",
            block_id: "email",
            element: {
                type: "plain_text_input",
                action_id: "value",
                placeholder: { type: "plain_text", text: "you@domain.com" }
            },
            label: {
                type: "plain_text",
                text: "Enter your email address"
            }
        }
    ]
});

export const imapLoginModal = () => ({
    type: "modal",
    callback_id: "imap_login",
    title: {type: "plain_text", text: "IMAP Login"},
    submit: { type: "plain_text", text: "Connect"},
    blocks:[
        {
            type: "input",
            block_id:"email",
            element:{
                type:"plain_text_input",
                action_id: "value"
            },
            label: {
                type: "plain_text",
                text: "Email Address"
            }
        }
        
    ]
})