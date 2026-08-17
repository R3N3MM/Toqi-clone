import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'
import App from './App'
import { ToastProvider } from './utils'
import { ThemeProvider } from './theme'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ToastProvider>
  </React.StrictMode>
)
