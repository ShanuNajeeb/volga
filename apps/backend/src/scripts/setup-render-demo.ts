import type { ExecArgs } from "@medusajs/framework/types"
import { MedusaModule } from "@medusajs/framework/modules-sdk"
import {
  ContainerRegistrationKeys,
  Modules,
  RBAC_SUPER_ADMIN_ROLE_ID,
} from "@medusajs/framework/utils"
import { createUserAccountWorkflow } from "@medusajs/medusa/core-flows"
import showPublishableKey from "./show-publishable-key"

export default async function setupRenderDemo(args: ExecArgs) {
  const { container } = args
  const email = process.env.VOLGA_ADMIN_EMAIL
  const password = process.env.VOLGA_ADMIN_PASSWORD
  if (!email || !password) {
    throw new Error("Set the Render demo admin email and password")
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const auth = container.resolve(Modules.AUTH)
  const credentials = { body: { email, password } }
  const existingIdentity = await auth.authenticate("emailpass", credentials)
  const identity = existingIdentity.success
    ? existingIdentity
    : await auth.register("emailpass", credentials)

  if (!identity.success || !identity.authIdentity) {
    throw new Error("Could not establish the Render demo admin identity")
  }

  const { authIdentity } = identity
  const { data: [user] } = await query.graph({
    entity: "user",
    fields: ["id"],
    filters: { email },
  })
  const linkedUserId = authIdentity.app_metadata?.user_id

  if (linkedUserId && linkedUserId !== user?.id) {
    throw new Error("The Render demo identity already belongs to another user")
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
