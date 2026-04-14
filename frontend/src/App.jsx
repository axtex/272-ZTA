import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'

function App() {
  const path = window.location.pathname

  if (path === '/register') return <Register />
  if (path === '/login')    return <Login />
  return <Login />
}

export default App