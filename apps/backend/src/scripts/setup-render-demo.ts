import type { ExecArgs } from "@medusajs/framework/types"
import { MedusaModule } from "@medusajs/framework/modules-sdk"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  RBAC_SUPER_ADMIN_ROLE_ID,
} from "@medusajs/framework/utils"
import { createUserAccountWorkflow } from "@medusajs/medusa/core-flows"
import showPublishableKey from "./show-publishable-key"

export default async function setupRenderDemo(args: ExecArgs) {
  const { container } = args
  const email = process.env.VOLGA_ADMIN_EMAIL
  if (!email) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Set the Render demo admin email")
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const { data: [user] } = await query.graph({
    entity: "user",
    fields: ["id"],
    filters: { email },
  })

  if (user) {
    const { data: identities } = await query.graph({
      entity: "auth_identity",
      fields: ["provider_identities.provider", "provider_identities.entity_id"],
      filters: { app_metadata: { user_id: user.id } },
    })
    const hasLogin = identities.some(({ provider_identities }) =>
      provider_identities?.some(({ provider, entity_id }) =>
        provider === "emailpass" && entity_id === email,
      ),
    )
    if (hasLogin) {
      logger.info("Render demo admin is ready")
      await showPublishableKey(args)
      return
    }
  }

  const password = process.env.VOLGA_ADMIN_PASSWORD
  if (!password) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Set the initial Render demo admin password")
  }

  const auth = container.resolve(Modules.AUTH)
  const credentials = { body: { email, password } }
  const existingIdentity = await auth.authenticate("emailpass", credentials)
  const identity = existingIdentity.success
    ? existingIdentity
    : await auth.register("emailpass", credentials)

  if (!identity.success || !identity.authIdentity) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Could not establish the Render demo admin identity")
  }

  const { authIdentity } = identity
  const linkedUserId = authIdentity.app_metadata?.user_id

  if (linkedUserId && linkedUserId !== user?.id) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "The Render demo identity already belongs to another user")
  }

  if (!user) {
    const roles = MedusaModule.isInstalled(Modules.RBAC)
      ? [{ role_id: RBAC_SUPER_ADMIN_ROLE_ID }]
      : undefined
    await createUserAccountWorkflow(container).run({
      input: { authIdentityId: authIdentity.id, userData: { email, roles } },
    })
  } else if (!linkedUserId) {
    await auth.updateAuthIdentities({
      id: authIdentity.id,
      app_metadata: { ...authIdentity.app_metadata, user_id: user.id },
    })
  }
  logger.info("Render demo admin is ready")

  await showPublishableKey(args)
}
