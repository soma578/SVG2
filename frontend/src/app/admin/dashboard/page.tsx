import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import styles from './dashboard.module.css'
import LogoutButton from './LogoutButton'
import AdminDashboard from './AdminDashboard'

export default async function AdminDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>管理画面</span>
        <span className={styles.userEmail}>{user.email}</span>
        <LogoutButton />
      </header>
      <AdminDashboard />
    </div>
  )
}
