import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/geist-sans/latin-400.css'
import './styles.css'
import { Capture } from './capture/Capture'

createRoot(document.getElementById('root')!).render(<React.StrictMode><Capture /></React.StrictMode>)
