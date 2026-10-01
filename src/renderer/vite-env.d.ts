/// <reference types="vite/client" />
import type { NotiertApi } from '../shared/contracts'
declare global { interface Window { notiert: NotiertApi } }
