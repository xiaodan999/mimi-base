import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import supabase from '../../supabase-client/supabase'
const mimis = {
  xiaodan: [
    '小阿蛋💗xiaohai',
    '小蛋是会游泳的🏊‍',
    '我喜欢吃猪肉🐷',
    '我想去海边玩耍🌊',
    '我不喜欢吃番茄🍅',
  ],
  xiaohai: [
    'xiaohai💕小阿蛋',
    '我教小蛋游泳的🏊‍',
    '我知道许多小蛋🥚的秘密',
    '我不喜欢吃猪肉🐖',
    '我爱喝牛奶🥛',
  ],
}

function MimiBase() {
  const [name, setName] = useState('')

  useEffect(() => {
    async function loadName() {
      let { data, error } = await supabase
        .from('users')
        .select('user_name')
        .single()
      setName(data.user_name)
    }
    loadName()
  }, [])
  return (
    <div style={{ padding: '0 12px' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '8px' }}>
        秘密保存基地 <i>V5.0</i>
      </h1>
      <p style={{ fontSize: '28px' }}>
        欢迎{' '}
        <span style={{ fontWeight: 600, fontStyle: 'italic', color: 'orange' }}>
          {name}🎉✨🎉✨
        </span>
      </p>
    </div>
  )
}
export default MimiBase
