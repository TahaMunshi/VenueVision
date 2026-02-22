import { Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import MobileCapture from './pages/guided/MobileCapture'
import SegmentReview from './pages/guided/SegmentReview'
import WallUpload from './pages/guided/WallUpload'
import Space3DViewer from './pages/viewer/Space3DViewer'
import WallSelector from './pages/guided/WallSelector'
import WallEditor from './pages/guided/WallEditor'
import FloorPlanner from './pages/planner/FloorPlanner'
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import VenuesList from './pages/venues/VenuesList'
import VenueHome from './pages/venues/VenueHome'
import AssetLibrary from './pages/assets/AssetLibrary'

function App() {
  return (
    <Routes>
      {/* Auth routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      
      {/* Venues dashboard */}
      <Route path="/venues" element={<VenuesList />} />
      <Route path="/venue/:venueId" element={<VenueHome />} />
      
      {/* Asset Library */}
      <Route path="/assets" element={<AssetLibrary />} />
      
      {/* Mobile routes - these are relative to /mobile basename */}
      <Route path="/" element={<Navigate to="/venues" replace />} />
      <Route path="/capture/:venueId" element={<MobileCapture />} />
      <Route path="/review/:venueId/:wallId" element={<SegmentReview />} />
      <Route path="/upload/:venueId/:wallId" element={<WallUpload />} />
      <Route path="/editor/:venueId" element={<WallSelector />} />
      <Route path="/edit/:venueId/:wallId" element={<WallEditor />} />
      <Route path="/planner/:venueId" element={<FloorPlanner />} />
      <Route path="/view/:venueId" element={<Space3DViewer />} />
      
      {/* Catch-all: redirect to venues */}
      <Route path="*" element={<Navigate to="/venues" replace />} />
    </Routes>
  )
}

export default App

