'use server'

import { redirect } from 'next/navigation'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { findLoginIdentityByEmail, normalizeEmail } from '@/src/lib/user-emails'
import { authService } from '@/src/services/auth.service'
import { setAdminSessionCookie } from '@/src/lib/admin-session'

export type LoginState = {
  error?: string
} | undefined

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function loginAction(
  prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  try {
    const parsed = loginSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
    })

    if (!parsed.success) {
      return { error: 'Invalid email or password' }
    }

    const email = normalizeEmail(parsed.data.email)
    const identity = await findLoginIdentityByEmail(email)
    const user = identity?.user

    if (!user || !user.passwordHash) {
      return { error: 'Invalid email or password' }
    }

    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash)
    if (!valid) {
      return { error: 'Invalid email or password' }
    }

    if (user.role !== 'ADMIN') {
      return { error: 'Admin access required' }
    }

    if (!user.isActive || user.isBanned) {
      return { error: 'Account is disabled' }
    }

    const { token } = await authService.createSession(user.id, email)
    await setAdminSessionCookie(token)

    redirect('/admin/feedback')
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) {
      throw error
    }
    return { error: 'An unexpected error occurred' }
  }
}
