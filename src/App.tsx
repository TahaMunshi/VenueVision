import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import './App.css'

const Login = lazy(() => import('./pages/auth/Login'))
const Signup = lazy(() => import('./pages/auth/Signup'))
const VenuesList = lazy(() => import('./pages/venues/VenuesList'))
const VenueHome = lazy(() => import('./pages/venues/VenueHome'))
const AssetLibrary = lazy(() => import('./pages/assets/AssetLibrary'))
const MobileCapture = lazy(() => import('./pages/guided/MobileCapture'))
const SegmentReview = lazy(() => import('./pages/guided/SegmentReview'))
const WallUpload = lazy(() => import('./pages/guided/WallUpload'))
const Space3DViewer = lazy(() => import('./pages/viewer/Space3DViewer'))
const WallSelector = lazy(() => import('./pages/guided/WallSelector'))
const WallEditor = lazy(() => import('./pages/guided/WallEditor'))
const ObjectRemoval = lazy(() => import('./pages/guided/ObjectRemoval'))
const FloorPlanner = lazy(() => import('./pages/planner/FloorPlanner'))

function RouteFallback() {
  return (
    <div className="app-route-fallback">
      <div className="app-route-fallback-spinner" aria-hidden />
      <p className="app-route-fallback-text">Loading…</p>
    </div>
  )
}

function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        <Route path="/venues" element={<VenuesList />} />
        <Route path="/venue/:venueId" element={<VenueHome />} />

        <Route path="/assets" element={<AssetLibrary />} />

        <Route path="/" element={<Navigate to="/venues" replace />} />
        <Route path="/capture/:venueId" element={<MobileCapture />} />
        <Route path="/review/:venueId/:wallId" element={<SegmentReview />} />
        <Route path="/remove/:venueId/:wallId" element={<ObjectRemoval />} />
        <Route path="/upload/:venueId/:wallId" element={<WallUpload />} />
        <Route path="/editor/:venueId" element={<WallSelector />} />
        <Route path="/edit/:venueId/:wallId" element={<WallEditor />} />
        <Route path="/planner/:venueId" element={<FloorPlanner />} />
        <Route path="/view/:venueId" element={<Space3DViewer />} />

        <Route path="*" element={<Navigate to="/venues" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
