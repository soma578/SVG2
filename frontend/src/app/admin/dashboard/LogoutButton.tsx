'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './dashboard.module.css'

export default function LogoutButton() {
  const router = useRouter()
  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }
  return (
    <button className={styles.logoutButton} onClick={handleLogout}>
      ログアウト
    </button>
  )
}
