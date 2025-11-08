import { NextRequest, NextResponse } from "next/server"

type TokenResponse = {
  access_token: string
  expires_in?: number
}

type TokenRequest = {
  clientId?: string
  durationSecs?: number
}

const WISPR_TOKEN_URL = "https://platform-api.wisprflow.ai/api/v1/dash/generate_access_token"

export async function POST(request: NextRequest) {
  const apiKey = process.env.WISPR_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Missing configuration",
        message: "Set WISPR_API_KEY in .env.local with your Wispr key (format fl-xxxx).",
      },
      { status: 500 }
    )
  }

  const rawKey = apiKey.trim()
  const authorizationHeader = rawKey.startsWith("Bearer ") ? rawKey : `Bearer ${rawKey}`

  let body: TokenRequest = {}
  try {
    body = ((await request.json()) ?? {}) as TokenRequest
  } catch {
    // ignore empty body
  }

  const durationSecs = body.durationSecs && body.durationSecs > 0 ? body.durationSecs : 3600

  const response = await fetch(WISPR_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorizationHeader,
    },
    body: JSON.stringify({
      client_id: body.clientId ?? `web-${Date.now()}`,
      duration_secs: durationSecs,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return NextResponse.json(
      {
        error: "Wispr token error",
        message: errorText || "No se pudo generar el token de acceso para Wispr.",
      },
      { status: response.status }
    )
  }

  const data = (await response.json()) as TokenResponse

  return NextResponse.json({
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    clientId: body.clientId,
  })
}
