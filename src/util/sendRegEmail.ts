export async function sendRegEmail({
  name: _name,
  email: _email,
  token: _token,
}: {
  name: string;
  email: string;
  token: string;
}) {
  /*
    Pilot build:
    Registration / Mobile invitation email delivery is intentionally disabled.

    Keep this function and its existing return contract in place so callers do
    not need to change while the email provider is parked. No invitation token,
    email address, API key, or other secret is logged here.
  */
  return {
    success: false,
    message: "Mobile invitation email is disabled for the pilot build.",
  };
}
