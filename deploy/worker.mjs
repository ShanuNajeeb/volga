const medusaPath = /^\/(?:admin|app|auth|health|hooks|static|store)(?:\/|$)/

export default {
  async fetch(request, env) {
    const publicUrl = new URL(request.url)
    const origin = medusaPath.test(publicUrl.pathname)
      ? env.MEDUSA_ORIGIN
      : env.STOREFRONT_ORIGIN

    const upstreamUrl = new URL(origin)
    upstreamUrl.pathname = publicUrl.pathname
    upstreamUrl.search = publicUrl.search

    const upstreamRequest = new Request(upstreamUrl, request)
    upstreamRequest.headers.delete("host")
    upstreamRequest.headers.set("x-forwarded-host", publicUrl.host)
    upstreamRequest.headers.set("x-forwarded-proto", publicUrl.protocol.slice(0, -1))

    const response = await fetch(upstreamRequest, { redirect: "manual" })
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
