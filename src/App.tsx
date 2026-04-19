import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import './App.css'

const Login = lazy(() => import('./pages/auth/Login'))
const Signup = lazy(() => import('./pages/auth/Signup'))

// Vendor pages
const VendorDashboard = lazy(() => import('./pages/vendor/VendorDashboard'))
const VendorVenues = lazy(() => import('./pages/vendor/VendorVenues'))
const VendorVenueEdit = lazy(() => import('./pages/vendor/VendorVenueEdit'))
const VendorBookings = lazy(() => import('./pages/vendor/VendorBookings'))

// Customer / Marketplace pages
const Marketplace = lazy(() => import('./pages/customer/Marketplace'))
const VenueDetail = lazy(() => import('./pages/customer/VenueDetail'))
const CustomerBookings = lazy(() => import('./pages/customer/CustomerBookings'))

// Existing pages (shared between vendor/customer with role-based guards in-component)
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

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) return <RouteFallback />

  const homeRedirect = !user ? '/login' : user.role === 'vendor' ? '/vendor' : '/marketplace'

  return (
    <Routes>
      {/* Auth */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Marketplace (public/customer) */}
      <Route path="/marketplace" element={<Marketplace />} />
      <Route path="/venue-detail/:venueIdentifier" element={<VenueDetail />} />

      {/* Customer bookings */}
      <Route path="/bookings" element={<CustomerBookings />} />

      {/* Vendor dashboard */}
      <Route path="/vendor" element={<VendorDashboard />} />
      <Route path="/vendor/venues" element={<VendorVenues />} />
      <Route path="/vendor/venues/new" element={<VendorVenueEdit />} />
      <Route path="/vendor/venues/:venueId/edit" element={<VendorVenueEdit />} />
      <Route path="/vendor/bookings" element={<VendorBookings />} />

      {/* Legacy / shared venue editing pages */}
      <Route path="/venues" element={<VenuesList />} />
      <Route path="/venue/:venueId" element={<VenueHome />} />
      <Route path="/assets" element={<AssetLibrary />} />
      <Route path="/capture/:venueId" element={<MobileCapture />} />
      <Route path="/review/:venueId/:wallId" element={<SegmentReview />} />
      <Route path="/remove/:venueId/:wallId" element={<ObjectRemoval />} />
      <Route path="/upload/:venueId/:wallId" element={<WallUpload />} />
      <Route path="/editor/:venueId" element={<WallSelector />} />
      <Route path="/edit/:venueId/:wallId" element={<WallEditor />} />
      <Route path="/planner/:venueId" element={<FloorPlanner />} />
      <Route path="/view/:venueId" element={<Space3DViewer />} />

      {/* Default redirect */}
      <Route path="/" element={<Navigate to={homeRedirect} replace />} />
      <Route path="*" element={<Navigate to={homeRedirect} replace />} />
    </Routes>
  )
}

function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <AppRoutes />
    </Suspense>
  )
}

export default App
