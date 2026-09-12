import nodemailer from "nodemailer";

const transport = nodemailer.createTransport({
    host: process.env.SMTP_ENDPOINT,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: process.env.SMTP_USERNAME ? {
      user: process.env.SMTP_USERNAME,
      pass: process.env.SMTP_PASSWORD,
    } : undefined,
})


export async function sendEmail(to: string, body: string){
    await transport.sendMail({
        from: "contact@monish.com",
        sender: "contact@monish.com",
        to,
        subject: "Hello from Zapier",
        text: body
    })
}
