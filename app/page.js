"use client";
import { useState } from 'react';
export default function Home() {
  const [count, setCount] = useState(0);
  return <main><header><span className="mark">N</span><span>Моя первая версия</span><span className="tag">NEXT.JS</span></header>
    <section><p className="eyebrow">01 / ПЕРВЫЙ ЗАПУСК</p><h1>Привет,<br/>Next.js<span className="accent">.</span></h1><p className="intro">Одна страница. Первый компонент.<br/>Начало твоего приложения.</p>
    <div className="counter"><div><h2>Попробуй взаимодействие</h2><p>Нажми кнопку — React обновит счётчик.</p></div><output aria-live="polite" aria-label="Значение счётчика">{count}</output><div className="actions"><button onClick={()=>setCount(c=>c+1)}>Увеличить +1</button><button className="secondary" onClick={()=>setCount(0)} disabled={count===0}>Сбросить</button></div></div>
    <p className="note">Счётчик работает в браузере и сбрасывается при перезагрузке.</p></section><footer><span>Next.js / React / JavaScript</span><span>Статическая сборка</span></footer></main>;
}
