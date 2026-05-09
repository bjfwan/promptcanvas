import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  window.location.reload()
})

createApp(App).mount('#app')
