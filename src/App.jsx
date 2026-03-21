import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useAuth } from './lib/useAuth'
import { useProfile } from './lib/useProfile'
import Layout from './components/Layout'
import Login from './pages/Login'
import ProfileSetup from './pages/ProfileSetup'
import Home from './pages/Home'
import CreateCampaign from './pages/CreateCampaign'
import JoinCampaign from './pages/JoinCampaign'
import CampaignView from './pages/CampaignView'
import Account from './pages/Account'

export default function App() {
  const { session, loading, signInWithGoogle, signOut } = useAuth()
  const { profile, loading: profileLoading, updateProfile, isComplete } = useProfile(session)

  if (loading || (session && profileLoading)) return null

  if (!session) return <Login onGoogleSignIn={signInWithGoogle} />

  if (!isComplete) {
    return (
      <ProfileSetup
        session={session}
        onComplete={async (updates) => {
          await updateProfile(updates)
        }}
      />
    )
  }

  return (
    <BrowserRouter>
      <Layout profile={profile} onSignOut={signOut}>
        <Routes>
          <Route path="/" element={<Home session={session} />} />
          <Route path="/campaign/new" element={<CreateCampaign session={session} />} />
          <Route path="/campaign/join" element={<JoinCampaign />} />
          <Route path="/campaign/:id" element={<CampaignView session={session} />} />
          <Route path="/account" element={<Account session={session} profile={profile} updateProfile={updateProfile} />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
