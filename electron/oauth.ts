import { createHash, randomBytes } from 'crypto'
import { createServer } from 'http'
import { shell } from 'electron'
import { getOAuthConfig } from './auth'

export interface OAuthProfile {
  email: string
  name: string
  avatar: string
  provider: 'google' | 'microsoft'
}

const REDIRECT_PORT = 53124

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sha256Base64url(input: string): string {
  return base64url(createHash('sha256').update(input).digest())
}

async function waitForCallback(redirectUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '', redirectUri)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end('<html><body><h3>Sign-in failed</h3><p>Please close this window.</p></body></html>')
        reject(new Error(`OAuth error: ${error}`))
      } else if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<html><body><h3>Signed in successfully!</h3><p>You can close this window and return to the app.</p></body></html>')
        server.close()
        resolve(code)
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end('<html><body><h3>Invalid response</h3></body></html>')
      }
    })
    server.on('error', reject)
    server.listen(REDIRECT_PORT, '127.0.0.1', () => {
      void shell.openExternal(redirectUri)
    })
  })
}

async function exchange(
  tokenEndpoint: string,
  body: Record<string, string>,
  headers: Record<string, string>
): Promise<any> {
  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(body).toString()
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Token exchange failed: ${data.error_description ?? data.error ?? res.status}`)
  return data
}

export async function loginWithGoogle(): Promise<OAuthProfile> {
  const { clientId } = await getOAuthConfig('google')
  if (!clientId) throw new Error('Google sign-in is not configured yet. Add your Client ID in Settings -> Account & Privacy.')
  const redirectUri = `http://localhost:${REDIRECT_PORT}/callback`
  const verifier = base64url(randomBytes(64))
  const challenge = sha256Base64url(verifier)
  const state = base64url(randomBytes(16))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'online',
    prompt: 'select_account'
  })
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  const code = await waitForCallback(authUrl)

  const token = await exchange(
    'https://oauth2.googleapis.com/token',
    {
      client_id: clientId,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    },
    {}
  )
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` }
  })
  const info = await res.json()
  if (!res.ok || !info.email) throw new Error('Could not fetch Google profile')
  return { email: info.email, name: info.name ?? '', avatar: info.picture ?? '', provider: 'google' }
}

export async function loginWithMicrosoft(): Promise<OAuthProfile> {
  const { clientId, clientSecret } = await getOAuthConfig('microsoft')
  if (!clientId) throw new Error('Microsoft sign-in is not configured yet. Add your Client ID in Settings -> Account & Privacy.')
  const redirectUri = `http://localhost:${REDIRECT_PORT}/callback`
  const verifier = base64url(randomBytes(64))
  const challenge = sha256Base64url(verifier)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile User.Read offline_access',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    response_mode: 'query'
  })
  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
  const code = await waitForCallback(authUrl)

  const token = await exchange(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      scope: 'User.Read'
    },
    {}
  )
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${token.access_token}` }
  })
  const info = await res.json()
  if (!res.ok || !info.mail) throw new Error('Could not fetch Microsoft profile')
  return { email: info.mail, name: info.displayName ?? '', avatar: '', provider: 'microsoft' }
}