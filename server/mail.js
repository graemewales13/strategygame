// Sending the sign-in code. MAIL=console (development, staging without a domain): the code is written to the log. MAIL=ses (production):
// Amazon SES (API v2), signed with the server's own AWS role (server/aws.js; no keys in the configuration, no AWS SDK).
import { awsCredentials, sesSend } from './aws.js';

export function makeMailer({ mode = 'console', from = '', region = process.env.AWS_REGION || 'eu-west-2', log = console.log, creds = null, f = fetch } = {}) {
  if (mode === 'console') return { mode, async send(to, subject, text) { log(`[mail] to ${to}: ${subject}\n${text}`); } };
  if (mode === 'ses') {
    if (!from) throw new Error('MAIL_FROM is needed to send email');
    const getCreds = creds || awsCredentials({ f });
    return { mode, send: (to, subject, text) => sesSend({ region, from, to, subject, text, creds: getCreds, f }) };
  }
  throw new Error(`MAIL must be console or ses, not ${mode}`);
}

export const codeMail = (code, minutes) => ({
  subject: `Your Auld World code: ${code}`,
  text: `Your sign-in code for Auld World is ${code}\n\nIt works once, for ${minutes} minutes. If you did not ask for it, ignore this email: nobody can sign in without the code.\n`,
});
