import { NavLink } from 'react-router-dom'

const routes = [
  { name: '视频基地', path: '/' },
  { name: '照片基地', path: '/photos' },
  { name: '聊天基地', path: '/xiaodanbase' },
  { name: '记账基地', path: '/jizhang' },
]

export default function NavButtons() {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        display: 'flex',
        width: '100%',
        justifyContent: 'space-evenly',
        height: '45px',
      }}>
      {routes.map((route) => (
        <NavLink style={{ flex: 1 }} key={route.path} to={route.path}>
          {({ isActive }) => (
            <button
              style={{
                width: '100%',
                height: '100%',
                color: isActive ? 'red' : 'black',
              }}>
              {route.name}
            </button>
          )}
        </NavLink>
      ))}
    </div>
  )
}
