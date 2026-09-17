"use client";
import { useState } from 'react';
export default function Home() {
  const [count, setCount] = useState(0);
  return <main><header><span className="mark">N</span><span>My first release</span><span className="tag">NEXT.JS</span></header>
    <section><p className="eyebrow">01 / FIRST LAUNCH</p><h1>Hello,<br/>Next.js<span className="accent">.</span></h1><p className="intro">One page. Your first component.<br/>The start of your application.</p>
    <div className="counter"><div><h2>Try it out</h2><p>Click the button — React will update the counter.</p></div><output aria-live="polite" aria-label="Counter value">{count}</output><div className="actions"><button onClick={()=>setCount(c=>c+1)}>Increment +1</button><button className="secondary" onClick={()=>setCount(0)} disabled={count===0}>Reset</button></div></div>
    <p className="note">The counter runs in your browser and resets when you reload the page.</p></section><footer><span>Next.js / React / JavaScript</span><span>Static build</span></footer></main>;
}
