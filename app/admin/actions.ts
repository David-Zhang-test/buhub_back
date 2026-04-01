'use server'

import { redirect } from 'next/navigation'
import { getAdminSession, deleteAdminSessionCookie } from '@/src/lib/admin-session'
import { authService } from '@/src/services/auth.service'

export async function logoutAction() {
  const session = await getAdminSession()
  if (session?.jti) {
    await authService.logout(session.jti)
  }
  await deleteAdminSessionCookie()
  redirect('/admin/login')
}
