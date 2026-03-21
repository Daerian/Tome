import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export function useProfile(session) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) {
      setProfile(null)
      setLoading(false)
      return
    }

    async function fetchProfile() {
      setLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (error && error.code === 'PGRST116') {
        // No profile row yet — trigger may not have fired
        setProfile(null)
      } else if (error) {
        console.error('Error fetching profile:', error)
        setProfile(null)
      } else {
        setProfile(data)
      }
      setLoading(false)
    }

    fetchProfile()
  }, [session])

  async function updateProfile(updates) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', session.user.id)
      .select()
      .single()

    if (error) throw error
    setProfile(data)
    return data
  }

  const isComplete = profile && profile.display_name

  return { profile, loading, updateProfile, isComplete }
}
