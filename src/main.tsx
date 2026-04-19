import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ViewModeProvider } from './context/ViewModeContext'
import { AuthProvider } from './context/AuthContext'
import App from './App'
import './style.css'

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <ViewModeProvider>
      <BrowserRouter basename="/mobile">
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ViewModeProvider>
  </React.StrictMode>,
)
