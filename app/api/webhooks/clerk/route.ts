import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET
  if (!WEBHOOK_SECRET) {
    console.error('CLERK_WEBHOOK_SECRET not set')
    return new Response('Server configuration error', { status: 500 })
  }

  const headerPayload = await headers()
  const svixId = headerPayload.get('svix-id')
  const svixTimestamp = headerPayload.get('svix-timestamp')
  const svixSignature = headerPayload.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 })
  }

  const payload = await req.json()
  const body = JSON.stringify(payload)

  const wh = new Webhook(WEBHOOK_SECRET)
  let evt: WebhookEvent

  try {
    evt = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent
  } catch (err) {
    console.error('Webhook verification failed:', err)
    return new Response('Verification failed', { status: 400 })
  }

  const eventType = evt.type

  try {
    switch (eventType) {
      case 'user.created': {
        const { id, email_addresses, first_name, last_name } = evt.data
        const primaryEmail = email_addresses?.[0]?.email_address
        if (!primaryEmail) break

        await prisma.users.create({
          data: {
            id: `user_${Date.now()}_${randomUUID().slice(0, 8)}`,
            clerk_user_id: id,
            email: primaryEmail,
            first_name: first_name || null,
            last_name: last_name || null,
            role: 'ORG_USER',
            status: 'PENDING_ASSIGNMENT',
          },
        })
        console.log(`[Webhook] User created: ${primaryEmail}`)
        break
      }

      case 'user.updated': {
        const { id, email_addresses, first_name, last_name } = evt.data
        const primaryEmail = email_addresses?.[0]?.email_address

        const existingUser = await prisma.users.findUnique({
          where: { clerk_user_id: id },
        })

        if (existingUser) {
          await prisma.users.update({
            where: { clerk_user_id: id },
            data: {
              email: primaryEmail || existingUser.email,
              first_name: first_name || existingUser.first_name,
              last_name: last_name || existingUser.last_name,
            },
          })
          console.log(`[Webhook] User updated: ${id}`)
        }
        break
      }

      case 'user.deleted': {
        const { id } = evt.data
        if (!id) break
        const existingUser = await prisma.users.findUnique({
          where: { clerk_user_id: id },
        })
        if (existingUser) {
          await prisma.users.update({
            where: { clerk_user_id: id },
            data: { status: 'INACTIVE' },
          })
          console.log(`[Webhook] User deactivated: ${id}`)
        }
        break
      }
    }
  } catch (error) {
    console.error(`[Webhook] Error processing ${eventType}:`, error)
    return new Response('Webhook processing error', { status: 500 })
  }

  return new Response('OK', { status: 200 })
}
