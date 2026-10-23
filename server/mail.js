// Sending the sign-in code. MAIL=console (development, staging without a domain): the code is written to the log. MAIL=ses (production):
// Amazon SES, using the server's AWS role (no keys in the configuration). The SES library is loaded only when it is used.
export function makeMailer({ mode = 'console', from = '', region = process.env.AWS_REGION || 'eu-west-2', log = console.log } = {}) {
  if (mode === 'console') return { mode, async send(to, subject, text) { log(`[mail] to ${to}: ${subject}\n${text}`); } };
  if (mode === 'ses') {
    if (!from) throw new Error('MAIL_FROM is needed to send email');
    let client = null, Cmd = null;
    return {
      mode,
      async send(to, subject, text) {
        if (!client) { const m = await import('@aws-sdk/client-sesv2'); client = new m.SESv2Client({ region }); Cmd = m.SendEmailCommand; }
        await client.send(new Cmd({ FromEmailAddress: from, Destination: { ToAddresses: [to] }, Content: { Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Text: { Data: text, Charset: 'UTF-8' } } } } }));
      },
    };
  }
  throw new Error(`MAIL must be console or ses, not ${mode}`);
}

export const codeMail = (code, minutes) => ({
  subject: `Your Auld World code: ${code}`,
  text: `Your sign-in code for Auld World is ${code}\n\nIt works once, for ${minutes} minutes. If you did not ask for it, ignore this email: nobody can sign in without the code.\n`,
});
