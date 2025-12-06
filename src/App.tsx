import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import './App.css'
import MobileCapture from './pages/MobileCapture'
import WallUpload from './pages/WallUpload'
import Space3DViewer from './pages/Space3DViewer'
import WallSelector from './pages/WallSelector'
import WallEditor from './pages/WallEditor'
import FloorPlanner from './pages/FloorPlanner'

// Mobile Home Page - shown when accessing /mobile
const MobileHome = () => {
  const navigate = useNavigate()
  
  return (
    <div style={{ 
      padding: '2rem', 
      textAlign: 'center', 
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#1a1a2e',
      color: '#fff'
    }}>
      <h1 style={{ marginBottom: '1rem' }}>Event Space Visualizer</h1>
      <p style={{ marginBottom: '3rem', opacity: 0.8, fontSize: '1.1rem' }}>
        Capture venue walls using guided tour or upload existing photos
      </p>
      
      <div style={{ 
        display: 'flex', 
        gap: '2rem', 
        flexWrap: 'wrap',
        justifyContent: 'center',
        maxWidth: '800px'
      }}>
        <div style={{
          flex: '1',
          minWidth: '300px',
          padding: '2rem',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>Guided Tour</h2>
          <p style={{ marginBottom: '1.5rem', opacity: 0.7 }}>
            Step-by-step guided capture with camera
          </p>
          <button
            onClick={() => navigate('/capture/demo-venue')}
            style={{
              padding: '1rem 2rem',
              fontSize: '1rem',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              width: '100%'
            }}
          >
            Start Guided Tour
          </button>
        </div>

        <div style={{
          flex: '1',
          minWidth: '300px',
          padding: '2rem',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>Wall Editor</h2>
          <p style={{ marginBottom: '1.5rem', opacity: 0.7 }}>
            Select and process individual walls
          </p>
          <button
            onClick={() => navigate('/editor/demo-venue')}
            style={{
              padding: '1rem 2rem',
              fontSize: '1rem',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              width: '100%',
              marginBottom: '0.5rem'
            }}
          >
            Open Wall Editor
          </button>
        </div>

        <div style={{
          flex: '1',
          minWidth: '300px',
          padding: '2rem',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>3D Space Viewer</h2>
          <p style={{ marginBottom: '1.5rem', opacity: 0.7 }}>
            View your processed venue in 3D
          </p>
          <button
            onClick={() => navigate('/view/demo-venue')}
            style={{
              padding: '1rem 2rem',
              fontSize: '1rem',
              backgroundColor: '#9C27B0',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              width: '100%'
            }}
          >
            View 3D Space
          </button>
        </div>
      </div>

      <p style={{ marginTop: '3rem', fontSize: '0.9rem', opacity: 0.6 }}>
        Navigate: /capture/:venueId | /upload/:venueId/:wallId | /view/:venueId
      </p>
    </div>
  )
}

function App() {
  return (
    <Routes>
      {/* Mobile routes - these are relative to /mobile basename */}
      <Route path="/" element={<MobileHome />} />
      <Route path="/capture/:venueId" element={<MobileCapture />} />
      <Route path="/upload/:venueId/:wallId" element={<WallUpload />} />
      <Route path="/editor/:venueId" element={<WallSelector />} />
      <Route path="/edit/:venueId/:wallId" element={<WallEditor />} />
      <Route path="/planner/:venueId" element={<FloorPlanner />} />
      <Route path="/view/:venueId" element={<Space3DViewer />} />
      
      {/* Catch-all: redirect to mobile home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App

