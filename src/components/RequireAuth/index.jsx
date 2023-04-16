import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'

import supabase from '../../supabase-client/supabase'
import LoadingPage from '../LoadingPage'

export default function RequireAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    async function checkLogin() {
      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setLoading(false)

      if (user !== null) {
        setIsLoggedIn(true)
      }
    }
    checkLogin()
  }, [])
  if (loading) return <LoadingPage />
  if (!isLoggedIn) return <Navigate to="/login" />
  return <Outlet />
}
