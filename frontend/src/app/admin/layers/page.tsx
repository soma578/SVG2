import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from '../dashboard/LogoutButton'
import LayerWorkbench from './LayerWorkbench'
import styles from './workbench.module.css'

export default async function AdminLayersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>レイヤー生成</span>
        <a className={styles.navLink} href="/admin/dashboard">データ管理</a>
        <a className={styles.navLink} href="/admin/webcam-cache">カメラキャッシュ</a>
        <a className={styles.navLink} href="/map/webapp/native-map.html?regionId=okayama&municipalityId=okayama-kita">地図</a>
        <span className={styles.userEmail}>{user.email}</span>
        <LogoutButton />
      </header>
      <LayerWorkbench />
    </div>
  )
}
