import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function showPublishableKey({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [key] } = await query.graph({
    entity: "api_key",
    fields: ["token"],
    filters: { type: "publishable", title: "Default Publishable API Key" },
  })

  if (!key?.token) {
    throw new Error("The demo database has no default storefront publishable key")
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  logger.info(`Storefront publishable API key ${key.token}`)
}
