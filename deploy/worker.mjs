const medusaPath = /^\/(?:admin|app|auth|health|hooks|static|store)(?:\/|$)/
const startupStatuses = new Set([502, 503, 504])

const waitingPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Volga is starting</title>
  <style>
    body { margin: 0; padding: 2rem; min-height: 100svh; box-sizing: border-box; display: grid; place-items: center; background: #f7f7f5; color: #242424; font: 1rem/1.6 system-ui, sans-serif; }
    main { max-width: 30rem; }
    h1 { line-height: 1.2; }
    a { color: inherit; text-underline-offset: .2em; }
  </style>
</head>
<body>
  <main>
    <h1>Volga is starting</h1>
    <p role="status" id="status">This can take about a minute. This page will open automatically when Volga is ready.</p>
    <a href="">Try again now</a>
  </main>
  <script>
    const deadline = Date.now() + 120000

    async function check() {
      try {
        const response = await fetch(location.href, {
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        })
        await response.body?.cancel()
        if (response.status < 500) {
          location.reload()
          return
        }
      } catch {}

      if (Date.now() < deadline) {
        setTimeout(check, 5000)
      } else {
        document.querySelector("#status").textContent =
          "Volga is taking longer than expected. Try again in a moment."
      }
    }

    setTimeout(check, 5000)
  </script>
</body>
</html>`

function isPageNavigation(request) {
  const mode = request.headers.get("sec-fetch-mode")
  return request.method === "GET" &&
    (mode === "navigate" || (!mode && request.headers.get("accept")?.includes("text/html")))
}

export default {
  async fetch(request, env, context) {
    const publicUrl = new URL(request.url)
    const isMedusa = medusaPath.test(publicUrl.pathname)
    const origin = isMedusa ? env.MEDUSA_ORIGIN : env.STOREFRONT_ORIGIN

    const upstreamUrl = new URL(origin)
    upstreamUrl.pathname = publicUrl.pathname
    upstreamUrl.search = publicUrl.search

    const upstreamRequest = new Request(upstreamUrl, request)
    upstreamRequest.headers.delete("host")
    upstreamRequest.headers.set("x-forwarded-host", publicUrl.host)
    upstreamRequest.headers.set("x-forwarded-proto", publicUrl.protocol.slice(0, -1))

    const response = await fetch(upstreamRequest, { redirect: "manual" })
    if (startupStatuses.has(response.status) && isPageNavigation(request)) {
      await response.body?.cancel()
      if (!isMedusa) {
        context.waitUntil(
          fetch(new URL("/health", env.MEDUSA_ORIGIN), {
            signal: AbortSignal.timeout(25000),
          }).then((health) => health.body?.cancel()).catch(() => {}),
        )
      }
      return new Response(waitingPage, {
        status: 503,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "retry-after": "5",
        },
      })
    }

    const location = response.headers.get("location")
    if (!location || response.status < 300 || response.status >= 400) {
      return response
    }

    const redirectUrl = new URL(location, upstreamUrl)
    if (redirectUrl.origin !== upstreamUrl.origin) return response

    const headers = new Headers(response.headers)
    headers.set("location", redirectUrl.pathname + redirectUrl.search + redirectUrl.hash)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
}
