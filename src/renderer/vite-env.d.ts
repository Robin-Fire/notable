/// <reference types="vite/client" />
import type { NotableApi } from '../shared/contracts'
declare global { interface Window { notable: NotableApi } }
